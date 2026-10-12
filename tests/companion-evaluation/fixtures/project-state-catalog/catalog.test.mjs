import test from 'node:test';
import assert from 'node:assert/strict';
import { availableProducts } from './catalog.mjs';
import { renderCatalog } from './render.mjs';
test('in-stock listing excludes exhausted items', () => {
 const products = [{id:'a',name:'Pen',priceCents:199,stock:2},{id:'b',name:'Book',priceCents:499,stock:0}];
 assert.deepEqual(availableProducts(products).map(p=>p.id), ['a']);
 assert.equal(renderCatalog(products), 'Pen: 199 cents');
});
