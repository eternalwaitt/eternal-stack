import { availableProducts } from './catalog.mjs';
export function renderCatalog(products) {
  return availableProducts(products).map(product => `${product.name}: ${product.priceCents} cents`).join('\n');
}
