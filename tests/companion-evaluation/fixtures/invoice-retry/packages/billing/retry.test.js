import test from 'node:test';
import assert from 'node:assert/strict';
import { retryInvoice } from './retry.js';
import { createAttemptStore } from '../persistence/attempt-store.js';
import { createInvoiceWorker } from '../queue/worker.js';
import { createFakeProvider } from '../provider/fake-provider.js';

const invoice = { id: 'inv-101', amountMinor: 12345, currency: 'USD' };

test('provider timeout is ambiguous and retry reuses one key without double charging', async () => {
  const store = createAttemptStore();
  const provider = createFakeProvider({ failAfterAcceptOnce: true });
  const worker = createInvoiceWorker({ store, provider });
  await assert.rejects(worker.handle(invoice), /timed out/);
  const afterTimeout = store.get(invoice.id);
  assert.ok(afterTimeout, 'attempt identity was persisted before provider call');
  assert.equal(afterTimeout.status, 'unknown');
  assert.equal(afterTimeout.amountMinor, 12345);
  assert.equal(afterTimeout.currency, 'USD');
  const result = await worker.handle(invoice);
  assert.equal(result.status, 'paid');
  assert.equal(result.amountMinor, 12345);
  assert.equal(result.currency, 'USD');
  assert.equal(provider.accepted.size, 1, 'fake provider accepted only one unique idempotency key');
  assert.equal(store.get(invoice.id).providerPaymentId, 'pay_1');
});

test('retry identity is stable across worker recreation', async () => {
  const store = createAttemptStore();
  const provider = createFakeProvider({ failAfterAcceptOnce: true });
  const firstWorker = createInvoiceWorker({ store, provider });
  await assert.rejects(firstWorker.handle(invoice), /timed out/);
  const secondWorker = createInvoiceWorker({ store, provider });
  const result = await secondWorker.handle({ ...invoice });
  assert.equal(result.status, 'paid');
  assert.equal(provider.accepted.size, 1);
});

test('reject non-integer minor units before reaching provider', async () => {
  const store = createAttemptStore();
  const provider = createFakeProvider();
  await assert.rejects(retryInvoice({ ...invoice, amountMinor: 12.5 }, { store, provider }));
  assert.equal(provider.accepted.size, 0);
});
