import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog, paginateCatalog} from '../js/api/catalog.js';
import {parsePlaylist} from '../js/api/playlist.js';

test('normalization resolves relative URLs and assigns stable defaults after invalid entries', () => {
  const source = [{url: 'javascript:alert(1)'}, {url: '../live/1', name: '', group: ''}];
  const result = normalizeCatalog(source, 'https://example.org/list/file.m3u');
  assert.deepEqual(result, [{url: 'https://example.org/live/1', name: 'Channel 1', category: 'Other'}]);
  assert.equal(source[1].name, '');
});
test('metadata parsing is independent from URL normalization', () => {
  assert.deepEqual(parsePlaylist('#EXTM3U\n#EXTINF:-1 group-title="World, News",One, Two\n../one'), [
    {url: '../one', name: 'One, Two', group: 'World, News'}
  ]);
});
test('unsupported schemes and header directives do not enter the playback catalog', () => {
  assert.throws(() => normalizeCatalog([{url: 'rtsp://example.org/live'}, {url: 'https://example.org/live|User-Agent=x'}]), /No supported/);
});
test('pagination filters a literal All group without confusing it with the all-groups view', () => {
  const channels = Array.from({length: 7}, (_,i) => ({name: String(i), category: i < 4 ? 'All' : 'News'}));
  assert.deepEqual(paginateCatalog(channels, {group: 'All', page: 99}), {
    channels: [channels[3]], total: 4, pages: 2, page: 1
  });
  assert.equal(paginateCatalog(channels).total, 7);
  assert.equal(paginateCatalog(channels, {page: -5}).page, 0);
});
test('empty filtered pages are bounded and invalid page sizes are rejected', () => {
  assert.deepEqual(paginateCatalog([], {page: 5}), {channels: [], total: 0, pages: 1, page: 0});
  assert.throws(() => paginateCatalog([], {pageSize: 0}), RangeError);
});
