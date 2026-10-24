import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogStore, createMockCatalogLoader} from '../js/api/catalog-store.js';
import {mapCatalog} from '../js/api/catalog-views.js';

test('catalog loading, error and retry are real states; errors do not echo raw messages', async () => {
  let attempts = 0;
  const store = createCatalogStore({loader: async () => { if (++attempts === 1) throw new Error('mock-private'); return {channels: []}; }, map: mapCatalog});
  const states = []; store.subscribe(state => states.push(state.status));
  await store.load(); assert.equal(store.getState().status, 'error');
  assert.equal(store.getState().error.includes('mock-private'), false);
  await store.retry();
  assert.deepEqual(states, ['loading', 'error', 'loading', 'ready']);
  assert.equal(store.getState().catalog.items.length, 0);
});
test('a late old load cannot overwrite a newer catalog', async () => {
  const pending = [];
  const store = createCatalogStore({loader: () => new Promise(resolve => pending.push(resolve)), map: mapCatalog});
  const first = store.load(), second = store.load();
  pending[1]({channels: [{id: 'new'}]}); await second;
  pending[0]({channels: [{id: 'old'}]}); await first;
  assert.equal(store.getState().catalog.items[0].record.id, 'new');
});
test('unverified real catalog offers cannot replace mock data', async () => {
  const store = createCatalogStore({loader: async () => ({channels: [{id: 'mock'}]}), map: mapCatalog});
  await store.load();
  assert.equal(store.offerProviderCatalog({channels: [{id: 'real'}]}).accepted, false);
  assert.equal(store.getState().catalog.items[0].record.id, 'mock');
});
test('mock loader handles packaged local status 0 and rejects invalid data/HTTP failures', async () => {
  function xhr(status, text) { return class {
    constructor() { this.status = status; this.responseText = text; }
    open(method) { assert.equal(method, 'GET'); }
    send() { this.onload(); }
  }; }
  assert.deepEqual(await createMockCatalogLoader({XMLHttpRequestImpl: xhr(0, '{"channels":[]}')})(), {channels: []});
  for (const implementation of [xhr(404, '{}'), xhr(200, 'invalid'), xhr(0, '')])
    await assert.rejects(createMockCatalogLoader({XMLHttpRequestImpl: implementation})(), /could not be loaded/);
});
