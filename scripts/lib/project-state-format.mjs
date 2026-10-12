// Only these dedicated documentation paths can contain a neutral generated view.
// All authored text, including feature scope and lessons, remains source evidence.
export const PROJECT_STATE_PATHS = ['PROJECT_STATE.md', 'CURRENT_STATE.md', 'docs/PROJECT_STATE.md', 'docs/CURRENT_STATE.md'];
export const STATE_START = '<!-- etrnl:project-evidence:start -->';
export const STATE_END = '<!-- etrnl:project-evidence:end -->';
export const STATE_MAX_BYTES = 128 * 1024;
export function splitProjectState(text, required = false) {
  if (Buffer.byteLength(text) > STATE_MAX_BYTES) throw new Error('project state exceeds 128 KiB');
  if (/^(<<<<<<< |>>>>>>> )/m.test(text)) throw new Error('project state has unresolved merge markers');
  const starts = text.split(STATE_START).length - 1, ends = text.split(STATE_END).length - 1;
  if (!starts && !ends && !required) return { before: text, generated: null, after: '' };
  if (starts !== 1 || ends !== 1 || text.indexOf(STATE_END) < text.indexOf(STATE_START)) throw new Error('project state requires exactly one ordered generated marker pair');
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = line.includes(STATE_START) || line.includes(STATE_END);
    if (marker && (fence || ![STATE_START, STATE_END].includes(line))) throw new Error('project state markers must be whole lines outside fenced code');
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
    }
  }
  const start = text.indexOf(STATE_START), end = text.indexOf(STATE_END);
  return { before: text.slice(0, start), generated: text.slice(start + STATE_START.length, end), after: text.slice(end + STATE_END.length) };
}
export function normalizeProjectStateSource(text) {
  const parts = splitProjectState(text);
  return parts.generated === null ? text : `${parts.before}${STATE_START}\n[generated execution evidence]\n${STATE_END}${parts.after}`;
}
