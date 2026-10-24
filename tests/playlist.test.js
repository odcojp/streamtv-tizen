import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseM3U} from '../js/api/playlist.js';
test('parses IPTV names, quoted commas, groups and relative stream addresses', () => {
  const list = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 group-title="News, World",A, B\r\n../live/one.m3u8?token=test\r\n#EXTINF:-1,Two\r\nhttps://example.org/two.ts', 'https://example.org/list/playlist.m3u');
  assert.equal(list.length, 2); assert.equal(list[0].name, 'A, B'); assert.equal(list[0].category, 'News, World');
  assert.equal(list[0].url, 'https://example.org/live/one.m3u8?token=test'); assert.equal(list[1].category, 'Other');
});
test('rejects provider error pages and single-stream HLS manifests', () => {
  assert.throws(() => parseM3U('<html>Login</html>', 'https://example.org'), /web page/);
  assert.throws(() => parseM3U('#EXTM3U\n#EXT-X-TARGETDURATION:6\nseg.ts', 'https://example.org'), /single HLS/);
});
test('skips unsupported schemes and header-suffix URLs without misapplying metadata', () => {
  const list = parseM3U('#EXTM3U\n#EXTINF:-1,Bad\njavascript:alert(1)\n#EXTINF:-1,Headers\nhttps://example.org/v|User-Agent=x\n#EXTINF:-1,Good\nhttps://example.org/good', 'https://example.org');
  assert.deepEqual(list.map(channel => channel.name), ['Good']);
});

test('accepts leading blank lines and headerless EXTINF playlists', () => {
  const base='https://example.org/list.m3u';
  assert.equal(parseM3U('\n\n#EXTM3U\n#EXTINF:-1,One\nhttps://example.org/one',base)[0].name,'One');
  assert.equal(parseM3U('#EXTINF:-1,Two\nhttps://example.org/two',base)[0].name,'Two');
});
test('reports provider HTML and JSON without exposing their content', () => {
  assert.throws(() => parseM3U('\n<html>private account data</html>', 'https://example.org'), error => /web page/.test(error.message) && !error.message.includes('private'));
  assert.throws(() => parseM3U('{"password":"private"}', 'https://example.org'), error => /JSON/.test(error.message) && !error.message.includes('private'));
});
