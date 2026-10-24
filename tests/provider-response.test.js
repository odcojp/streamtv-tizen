import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectProviderResponse, normalizeProviderResponse, toPlayableChannels} from '../js/api/provider-response.js';

const baseUrl = 'https://example.org/api/list/mock-user/mock-password';

test('response detection recognizes M3U, JSON, XML, HTML, empty and unsupported bodies', () => {
  for (const [body, format] of [
    ['\uFEFF\n#EXTM3U\n', 'm3u'], ['#EXTINF:-1,One\nhttps://example.org/one', 'm3u'],
    ['{"channels":[]}', 'json'], ['[]', 'json'], ['<?xml version="1.0"?><catalog/>', 'xml'],
    ['<Error><Code>AccessDenied</Code></Error>', 'xml'], ['<!DOCTYPE html><html/>', 'html'],
    ['<?xml version="1.0"?><!-- mock --><html xmlns="http://www.w3.org/1999/xhtml"/>', 'html'],
    ['<div>Login required</div>\n#EXTM3U', 'html'],
    ['', 'empty'], ['mock binary data', 'unknown']
  ]) assert.equal(detectProviderResponse(body), format);
});
test('body evidence takes priority over misleading content types', () => {
  assert.equal(detectProviderResponse('#EXTM3U', 'text/html'), 'm3u');
  assert.equal(detectProviderResponse('<html>Denied</html>', 'application/json'), 'html');
  assert.equal(detectProviderResponse('bad json', 'application/json'), 'json');
});
test('M3U normalizes explicit group, tvg-id and EPG source without inventing VOD collections', () => {
  const result = normalizeProviderResponse('#EXTM3U url-tvg="https://example.org/epg.xml"\n#EXTINF:-1 tvg-id="mock.epg" group-title="News",One\nhttps://example.org/live/one', {baseUrl});
  assert.deepEqual(result.catalog, {
    channels: [{name: 'One', category: 'News', epgId: 'mock.epg', url: 'https://example.org/live/one'}],
    categories: [{name: 'News'}], epg: {sources: [{url: 'https://example.org/epg.xml'}]}
  });
});
test('an M3U without categories/EPG does not fabricate those models', () => {
  const result = normalizeProviderResponse('#EXTM3U\n#EXTINF:-1,Movie-looking Name\nhttps://example.org/film.mp4', {baseUrl});
  assert.deepEqual(Object.keys(result.catalog), ['channels']);
  assert.equal(result.catalog.channels[0].category, undefined);
  assert.equal(result.catalog.channels[0].id, undefined);
  assert.equal(result.catalog.movies, undefined);
});
test('JSON explicit collections normalize supplied fields and do not synthesize stream URLs', () => {
  const result = normalizeProviderResponse(JSON.stringify({
    channels: [{id: 1, name: 'One', url: '/live/one', category_id: 'n', epg_id: 'one'}],
    movies: [{id: 2, title: 'Film', year: 2020}],
    series: [{title: 'Show', episodes: [{title: 'Pilot', url: '/pilot.mp4', season: 1, episode: 1}]}],
    categories: [{id: 'n', name: 'News'}],
    epg: [{channel_id: 'one', title: 'Programme', start: '20260101000000 +0000', end: '20260101003000 +0000'}]
  }), {baseUrl});
  assert.equal(result.catalog.channels[0].url, 'https://example.org/live/one');
  assert.equal(result.catalog.movies[0].url, undefined);
  assert.equal(result.catalog.series[0].episodes[0].url, 'https://example.org/pilot.mp4');
  assert.equal(result.catalog.epg[0].channelId, 'one');
  assert.deepEqual(toPlayableChannels(result.catalog), [{name: 'One', category: 'News', url: 'https://example.org/live/one'}]);
});
test('unknown JSON, malformed JSON and wrong collection types have distinct safe failures', () => {
  for (const [body, code] of [['{"stream_id":123}', 'UNSUPPORTED_SCHEMA'], ['[1,2]', 'UNSUPPORTED_SCHEMA'], ['{"channels":{}}', 'UNSUPPORTED_SCHEMA'], ['{"channels":', 'MALFORMED_JSON']]) {
    assert.throws(() => normalizeProviderResponse(body, {baseUrl}), {code});
  }
});
test('invalid stream protocols are not exposed as playable channels', () => {
  const result = normalizeProviderResponse('{"channels":[{"name":"Bad","url":"javascript:alert(1)"},{"url":"https://example.org/one"}]}', {baseUrl});
  assert.equal(result.catalog.channels[0].url, undefined);
  assert.equal(result.catalog.channels[1].name, undefined);
  assert.equal(result.catalog.categories, undefined);
  assert.deepEqual(toPlayableChannels(result.catalog), [{name: 'Channel 1', category: 'Other', url: 'https://example.org/one'}]);
});
test('single HLS manifests are not misrepresented as channel catalogs', () => {
  assert.throws(() => normalizeProviderResponse('#EXTM3U\n#EXT-X-TARGETDURATION:6\nseg.ts', {baseUrl}), {code: 'UNSUPPORTED_M3U'});
});
test('XML parsing refuses DTD/entity declarations and reports unavailable parsers', () => {
  assert.throws(() => normalizeProviderResponse('<!DOCTYPE catalog [<!ENTITY x SYSTEM "file:///private">]><catalog/>', {baseUrl}), {code: 'UNSUPPORTED_XML'});
  assert.throws(() => normalizeProviderResponse('<catalog/>', {baseUrl, DOMParserImpl: null}), {code: 'XML_UNAVAILABLE'});
});
test('EPG data without actual supported fields is explicitly unsupported', () => {
  assert.throws(() => normalizeProviderResponse('{"epg":{"unknown":true}}', {baseUrl}), {code: 'UNSUPPORTED_EPG'});
  assert.deepEqual(normalizeProviderResponse('{"epg":{"sources":[{"url":"https://example.org/epg.xml"}]}}', {baseUrl}).catalog, {epg: {sources: [{url: 'https://example.org/epg.xml'}]}});
});
