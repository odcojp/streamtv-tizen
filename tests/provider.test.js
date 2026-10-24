import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProviderConnection} from '../js/api/provider.js';

test('connection fetches text, preserves redirect base URL and omits browser credentials', async () => {
  const provider = createProviderConnection({fetchImpl: async (url, options) => {
    assert.equal(url, 'https://example.org/list?token=test');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    return {ok: true, url: 'https://cdn.example.org/list.m3u', text: async () => '#EXTM3U'};
  }});
  assert.deepEqual(await provider.loadPlaylist(' https://example.org/list?token=test '), {text: '#EXTM3U', baseUrl: 'https://cdn.example.org/list.m3u'});
});
test('invalid protocols fail before any network request', async () => {
  const provider = createProviderConnection({fetchImpl: () => { assert.fail('Must not fetch'); }});
  await assert.rejects(provider.loadPlaylist('file:///private'), /complete http/);
  await assert.rejects(provider.loadPlaylist('not a url'), /complete http/);
});
test('HTTP errors never expose provider bodies or private query strings', async () => {
  const provider = createProviderConnection({fetchImpl: async () => ({ok: false, status: 403, text: () => assert.fail('Do not read error body')})});
  await assert.rejects(provider.loadPlaylist('https://example.org/?password=private'), error => error.message === 'Provider returned HTTP 403.');
});
test('network exceptions are converted to a message without the private address', async () => {
  const provider = createProviderConnection({fetchImpl: async () => { throw new TypeError('Cannot fetch https://example.org/?secret=private'); }});
  await assert.rejects(provider.loadPlaylist('https://example.org'), error => /Could not load/.test(error.message) && !error.message.includes('private'));
});
test('caller cancellation aborts the fetch', async () => {
  const caller = new AbortController();
  const provider = createProviderConnection({fetchImpl: (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
  })});
  const result = provider.loadPlaylist('https://example.org', {signal: caller.signal});
  caller.abort();
  await assert.rejects(result, {name: 'AbortError'});
});
test('an already-cancelled request does not fetch', async () => {
  const caller = new AbortController(); caller.abort();
  const provider = createProviderConnection({fetchImpl: () => assert.fail('Must not fetch')});
  await assert.rejects(provider.loadPlaylist('https://example.org', {signal: caller.signal}), {name: 'AbortError'});
});
test('timeout covers the response body as well as connection establishment', async () => {
  const provider = createProviderConnection({timeoutMs: 5, fetchImpl: async (_url, {signal}) => ({
    ok: true, text: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
    })
  })});
  await assert.rejects(provider.loadPlaylist('https://example.org'), /timed out/);
});
test('oversized playlists are rejected before parsing', async () => {
  const provider = createProviderConnection({fetchImpl: async () => ({ok: true, text: async () => 'x'.repeat(20 * 1024 * 1024 + 1)})});
  await assert.rejects(provider.loadPlaylist('https://example.org'), /larger than 20 MB/);
});
