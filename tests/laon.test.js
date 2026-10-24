import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLaonUrl, createLaonAdapter} from '../js/api/laon.js';
import {redactProviderSecrets, logProviderEvent} from '../js/api/provider-errors.js';

// All credentials in tests are synthetic. No network operation is performed.
const credentials = {username: 'mock-user', password: 'mock-password'};
function response(body, options = {}) {
  return {ok: true, status: 200, type: 'basic', redirected: false,
    headers: {get: () => options.contentType || 'text/plain'}, text: async () => body, ...options};
}
const simpleM3U = '#EXTM3U\n#EXTINF:-1,Mock One\nhttps://example.org/one.m3u8';

test('Laon URL encodes username and password as independent RFC3986 path segments', () => {
  const url = buildLaonUrl({username: 'a/b ?#%', password: "p/ä&!'()*"});
  assert.equal(url, 'https://laon.live/api/list/a%2Fb%20%3F%23%25/p%2F%C3%A4%26%21%27%28%29%2A');
  assert.equal(new URL(url).hostname, 'laon.live');
  assert.equal(new URL(url).search, ''); assert.equal(new URL(url).hash, '');
});
test('URL construction preserves credential whitespace and does not double-decode percent escapes', () => {
  assert.equal(buildLaonUrl({username: ' user ', password: '%2F pass '}), 'https://laon.live/api/list/%20user%20/%252F%20pass%20');
});
test('missing credentials, URL-normalized dot segments and invalid Unicode fail safely', () => {
  for (const input of [undefined, {}, {username: 'x', password: ''}, {username: '..', password: 'x'}, {username: 'x', password: '.'}, {username: '\uD800', password: 'x'}]) {
    assert.throws(() => buildLaonUrl(input), error => error.name === 'ProviderAdapterError' && !error.message.includes('https://'));
  }
});
test('mocked M3U connection uses only the custom endpoint with secure fetch options', async () => {
  const logs = [];
  const adapter = createLaonAdapter({logger: entry => logs.push(entry), fetchImpl: async (url, options) => {
    assert.equal(url, buildLaonUrl(credentials)); assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    return response(simpleM3U);
  }});
  const result = await adapter.connect(credentials);
  assert.equal(result.format, 'm3u'); assert.equal(result.catalog.channels[0].name, 'Mock One');
  assert.equal('movies' in result.catalog, false); assert.equal('series' in result.catalog, false);
  assert.deepEqual(logs, [{event: 'connection-start'}, {event: 'connection-result', format: 'm3u'}]);
});
test('JSON connection normalizes only collections explicitly supplied in the response', async () => {
  const adapter = createLaonAdapter({fetchImpl: async () => response(JSON.stringify({movies: [{title: 'Mock Film', url: '/film.mp4'}]}))});
  const result = await adapter.connect(credentials);
  assert.deepEqual(Object.keys(result.catalog), ['movies']);
  assert.equal(result.catalog.movies[0].name, 'Mock Film');
});
test('all visible and opaque redirects are recognized without following or logging their destinations', async () => {
  for (const extra of [{ok: false, status: 302}, {ok: false, status: 0, type: 'opaqueredirect'}, {redirected: true}]) {
    let calls = 0;
    const adapter = createLaonAdapter({fetchImpl: async () => { calls++; return response('', {...extra, text: () => assert.fail('Do not read redirect body')}); }});
    await assert.rejects(adapter.connect(credentials), {code: 'REDIRECT', format: 'redirect'});
    assert.equal(calls, 1);
  }
});
test('HTTP authentication, permissions, rate limiting and server failures are distinct', async () => {
  for (const [status, code] of [[401, 'AUTHENTICATION_FAILED'], [403, 'ACCESS_DENIED'], [429, 'RATE_LIMITED'], [503, 'HTTP_ERROR']]) {
    const adapter = createLaonAdapter({fetchImpl: async () => response('', {status, ok: false, text: () => assert.fail('Do not expose error bodies')})});
    await assert.rejects(adapter.connect(credentials), {code});
  }
});
test('failed authentication inside HTTP 200 JSON is recognized', async () => {
  for (const body of [{authenticated: false}, {auth: 0}, {error: {code: 'INVALID_CREDENTIALS'}}]) {
    const adapter = createLaonAdapter({fetchImpl: async () => response(JSON.stringify(body))});
    await assert.rejects(adapter.connect(credentials), {code: 'AUTHENTICATION_FAILED'});
  }
});
test('HTML/error pages and unsupported JSON are reported instead of parsed as a playlist', async () => {
  for (const [body, code] of [['<html>Mock challenge</html>', 'HTML_PAGE'], ['{"user_info":{"auth":1},"server_info":{}}', 'UNSUPPORTED_SCHEMA'], ['{"error":"Mock server failure"}', 'PROVIDER_ERROR'], ['', 'EMPTY_RESPONSE'], ['binary data', 'UNSUPPORTED_FORMAT']]) {
    const adapter = createLaonAdapter({fetchImpl: async () => response(body)});
    await assert.rejects(adapter.connect(credentials), {code});
  }
});
test('TLS, CORS and network errors remain indistinguishable but redact native error details', async () => {
  const logs = [];
  for (const native of [new TypeError('Failed to fetch ' + buildLaonUrl(credentials)), new Error('TLS certificate rejected ' + credentials.password)]) {
    const adapter = createLaonAdapter({logger: entry => logs.push(entry), fetchImpl: async () => { throw native; }});
    await assert.rejects(adapter.connect(credentials), error => {
      assert.equal(error.code, 'NETWORK_TLS_CORS');
      assert.equal(error.cause, undefined);
      assert.equal((error.stack + JSON.stringify(error)).includes(credentials.password), false);
      return true;
    });
  }
  assert.equal(JSON.stringify(logs).includes('mock-'), false);
  assert.equal(JSON.stringify(logs).includes('/api/list/'), false);
});
test('timeouts and caller cancellation abort the request without leaking credentials', async () => {
  const fetchImpl = (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
  });
  await assert.rejects(createLaonAdapter({fetchImpl, timeoutMs: 5}).connect(credentials), {code: 'TIMEOUT'});
  const signal = new AbortController();
  const pending = createLaonAdapter({fetchImpl}).connect(credentials, {signal: signal.signal});
  signal.abort(); await assert.rejects(pending, {code: 'CANCELLED'});
});
test('already-cancelled requests do not fetch, and oversized bodies are rejected', async () => {
  const signal = new AbortController(); signal.abort();
  await assert.rejects(createLaonAdapter({fetchImpl: () => assert.fail('Do not fetch')}).connect(credentials, {signal: signal.signal}), {code: 'CANCELLED'});
  await assert.rejects(createLaonAdapter({fetchImpl: async () => response('x'.repeat(20 * 1024 * 1024 + 1))}).connect(credentials), {code: 'RESPONSE_TOO_LARGE'});
});
test('custom adapter timeout also aborts an unfinished response body', async () => {
  const adapter = createLaonAdapter({timeoutMs: 5, fetchImpl: async (_url, {signal}) => response('', {
    text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true}))
  })});
  await assert.rejects(adapter.connect(credentials), {code: 'TIMEOUT'});
});
test('redaction removes raw/encoded credentials, URL userinfo, query strings and API paths', () => {
  const input = {username: 'mock.user', password: 'mock/pass!'};
  const text = redactProviderSecrets('mock.user mock/pass! mock%2fpass%21 https://laon.live/api/list/mock.user/mock%2Fpass%21 /api/list/mock.user/mock%2Fpass%21 https://user:password@example.org/?token=abc', input);
  for (const secret of ['mock.user', 'mock/pass', 'mock%2', 'token=abc', 'user:password']) assert.equal(text.includes(secret), false);
});
test('diagnostics discard arbitrary messages, credentials and URLs even in metadata fields', () => {
  const logs = [];
  logProviderEvent(value => logs.push(value), credentials.password, {code: credentials.password, format: buildLaonUrl(credentials), url: buildLaonUrl(credentials), message: credentials.password, status: 401});
  assert.deepEqual(logs, [{event: 'provider-event', status: 401}]);
  assert.doesNotThrow(() => logProviderEvent(() => { throw new Error('logger failure'); }, 'connection-start'));
});

test('full login links decode credentials once and reuse the encoded account endpoint', async () => {
  const {parseLaonLink} = await import('../js/api/laon.js');
  const link = 'https://laon.live/api/list/mock%2Fuser/mock%252F%20pass%23';
  assert.deepEqual(parseLaonLink(link), {username: 'mock/user', password: 'mock%2F pass#'});
  let calls = 0;
  const adapter = createLaonAdapter({fetchImpl: async url => {
    calls++; assert.equal(url, link); return response('{"channels":[{"name":"Mock Link Channel","url":"https://example.org/one.m3u8"}]}');
  }});
  const result = await adapter.connectLink(link);
  assert.equal(result.format, 'json'); assert.equal(result.catalog.channels[0].name, 'Mock Link Channel'); assert.equal(calls, 1);
  assert.deepEqual(parseLaonLink('  https://laon.live/api/list/mock/mock/  '), {username:'mock', password:'mock'});
});
test('invalid or foreign login links fail safely before any request', async () => {
  const adapter = createLaonAdapter({fetchImpl: () => assert.fail('Do not fetch invalid links')});
  for (const link of [undefined, '', 'https://example.org/api/list/mock/mock', 'http://laon.live/api/list/mock/mock',
    'https://laon.live.evil.example/api/list/mock/mock', 'https://user:pass@laon.live/api/list/mock/mock',
    'https://laon.live/api/list/mock/mock?token=secret', 'https://laon.live/api/list/mock/mock#secret',
    'https://laon.live/api/list/mock/mock/extra', 'https://laon.live/api/list/%2E%2E/mock',
    'https://laon.live/api/list/mock/%GG', 'https://laon.live/api/list/mock/',
    'https://laon.live/api/list/mock/other\\path', 'https://laon.live/API/LIST/mock/mock']) {
    await assert.rejects(adapter.connectLink(link), error => error.code === 'INVALID_PROVIDER_LINK' && !error.message.includes('secret') && !error.message.includes('https://'));
  }
});
test('full login links retain HTML/auth/redirect/network handling without exposing the link', async () => {
  const link = 'https://laon.live/api/list/mock-secret-user/mock-secret-pass';
  for (const [body, options, code] of [
    ['<html>mock-secret-user</html>', {}, 'HTML_PAGE'],
    ['', {ok:false, status:401}, 'AUTHENTICATION_FAILED'],
    ['', {ok:false, status:302}, 'REDIRECT']
  ]) {
    const logs = [];
    const adapter = createLaonAdapter({logger: value => logs.push(value), fetchImpl: async () => response(body, options)});
    await assert.rejects(adapter.connectLink(link), error => error.code === code && !error.message.includes('mock-secret'));
    assert.ok(!JSON.stringify(logs).includes('mock-secret'));
  }
  await assert.rejects(createLaonAdapter({fetchImpl: async () => { throw new Error(link); }}).connectLink(link), {code:'NETWORK_TLS_CORS'});
});
