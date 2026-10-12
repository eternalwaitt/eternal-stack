#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2] ? fs.realpathSync(process.argv[2]) : null;
if (!target || !path.basename(target).startsWith('etrnl-eval-')) throw new Error('usage: node check-invoice.mjs <temporary etrnl-eval-* project>');
const importFrom = relative => import(pathToFileURL(path.join(target, relative)).href);
const [{ createAttemptStore }, { createInvoiceWorker }] = await Promise.all([
  importFrom('packages/persistence/attempt-store.js'),
  importFrom('packages/queue/worker.js'),
]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-contract-'));
const db = path.join(dir, 'attempts.json');
const invoice = { id: 'inv-101', amountMinor: 12345, currency: 'USD' };
const accepted = new Map();
const keys = [];
let timeoutOnce = true;
let store = createAttemptStore(db);
const provider = {
  async charge(request) {
    keys.push(request.idempotencyKey);
    assert.ok(store.get(invoice.id), 'attempt identity must be persisted before provider call');
    assert.equal(Number.isInteger(request.amountMinor), true, 'provider receives integer minor units');
    assert.equal(request.amountMinor, invoice.amountMinor, 'amount is unchanged');
    assert.equal(request.currency, invoice.currency, 'currency is unchanged');
    if (!accepted.has(request.idempotencyKey)) accepted.set(request.idempotencyKey, { id: `pay_${accepted.size + 1}`, ...request });
    const result = accepted.get(request.idempotencyKey);
    if (timeoutOnce) {
      timeoutOnce = false;
      throw Object.assign(new Error('response timed out after acceptance'), { code: 'ETIMEDOUT' });
    }
    return result;
  },
};

const firstWorker = createInvoiceWorker({ store, provider });
await assert.rejects(firstWorker.handle(invoice), /timed out/);
const ambiguous = store.get(invoice.id);
assert.equal(ambiguous.status, 'unknown', 'timeout is not a definitive failure');
assert.equal(ambiguous.amountMinor, 12345);
assert.equal(ambiguous.currency, 'USD');

store = createAttemptStore(db);
const secondWorker = createInvoiceWorker({ store, provider });
const completed = await secondWorker.handle({ ...invoice });
assert.equal(completed.status, 'paid');
assert.equal(completed.amountMinor, 12345);
assert.equal(completed.currency, 'USD');
assert.equal(keys.length, 2);
assert.equal(keys[0], keys[1], 'new worker and reloaded store reuse the same idempotency key');
assert.equal(accepted.size, 1, 'provider accepted exactly one unique charge');
assert.equal(store.get(invoice.id).providerPaymentId, 'pay_1');
process.stdout.write('invoice contract: persisted pre-call state, bounded retry, idempotency, integer money and success state passed\n');
