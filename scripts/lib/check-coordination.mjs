// Finite command checks share a worktree admission gate. This is not a host-wide
// scheduler: browsers and persistent servers still need an explicit owner.
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock, writeJsonAtomic } from './json-file-store.mjs';
import { CHECK_RESOURCE_LIMITS } from './workflow-contract.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function checkOwnerAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

export async function acquireCheckSlot(file, { maxConcurrent = CHECK_RESOURCE_LIMITS.defaultConcurrency, waitMs = 900000, checkKey = "" } = {}) {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("--max-concurrent-checks must be a positive safe integer");
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const started = Date.now();
  const mutate = fn => withFileLock(file, () => {
    let state;
    try { state = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { active: [] }; }
    if (!Array.isArray(state.active)) throw new Error('Invalid check coordination state');
    state.active = state.active.filter(row => {
      if (!Number.isSafeInteger(row.pid)) throw new Error('Invalid check owner PID');
      if (checkOwnerAlive(row.pid)) return true;
      // A forcibly killed wrapper cannot run finally. Its registered detached
      // group must be stopped before admitting replacement work.
      if (process.platform !== 'win32' && Number.isSafeInteger(row.childPid)) {
        try { process.kill(-row.childPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      return false;
    });
    const result = fn(state);
    writeJsonAtomic(file, state, { mode: 0o600 });
    return result;
  });
  while (true) {
    const admitted = mutate(state => {
      const limit = Math.min(maxConcurrent, ...state.active.map(row => row.maxConcurrent));
      if (state.active.length >= limit || (checkKey && state.active.some(row => row.checkKey === checkKey))) return false;
      state.active.push({ id, pid: process.pid, maxConcurrent, checkKey, at: new Date().toISOString() });
      return true;
    });
    if (admitted) return {
      waitedMs: Date.now() - started,
      registerChild: childPid => mutate(state => {
        const owner = state.active.find(row => row.id === id);
        if (!owner) throw new Error('Check coordination ownership lost');
        owner.childPid = childPid;
      }),
      release: () => mutate(state => { state.active = state.active.filter(row => row.id !== id); }),
    };
    if (Date.now() - started >= waitMs) throw new Error('Check coordination wait timed out; verification remains required');
    await pause(50);
  }
}
