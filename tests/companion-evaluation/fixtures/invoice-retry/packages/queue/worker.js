import { retryInvoice } from '../billing/retry.js';

export function createInvoiceWorker(dependencies) {
  return { handle: invoice => retryInvoice(invoice, dependencies) };
}
