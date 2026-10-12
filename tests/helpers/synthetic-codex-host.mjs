#!/usr/bin/env node
// Isolated test host emulator. Never installed or treated as real model evidence.
const args = process.argv.slice(2), prompt = args.at(-1);
const emit = row => process.stdout.write(`${JSON.stringify(row)}\n`);
if (args.includes('resume')) {
  emit({ type: 'thread.started', thread_id: args.at(-2) });
  emit({ type: 'turn.started' });
  if (process.env.SYNTHETIC_HOST_MODE === 'resume-no-terminal') process.exit(0);
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'Controller finalization pending.' } });
  emit({ type: 'turn.completed' });
} else {
  if (!args.includes('read-only') || !args.includes('--output-schema') || !prompt.includes('Current-source captured verification')) process.exit(9);
  const [, requestId, treeHash] = prompt.match(/requestId=([^;]+); treeHash=([a-f0-9]+)/) || [];
  if (!requestId || !prompt.includes('"status":"passed"')) process.exit(8);
  emit({ type: 'thread.started', thread_id: '22222222-2222-2222-2222-222222222222' });
  emit({ type: 'turn.started' });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ requestId, treeHash, ...(prompt.match(/knowledgeBinding=([a-f0-9]{64})/) ? {knowledgeBinding:prompt.match(/knowledgeBinding=([a-f0-9]{64})/)[1]} : {}), verdict: 'verified', summary: 'Synthetic protocol fixture, not a real review.', findings: [], reviewedFiles: ['source'] }) } });
  emit({ type: 'turn.completed' });
}
