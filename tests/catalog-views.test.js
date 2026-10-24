import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapCatalog, selectCatalogView, filterByCategory, itemReference} from '../js/api/catalog-views.js';

test('all seven screens map only supplied model collections, without fabricating VOD or guide data', () => {
  const mapped = mapCatalog({channels: [{id: 'c', name: 'Channel', url: 'https://example.org/one'}]});
  assert.equal(selectCatalogView(mapped, 'live').items.length, 1);
  for (const screen of ['movies', 'shows', 'sports', 'guide', 'my-list', 'recent']) assert.deepEqual(selectCatalogView(mapped, screen).items, []);
});
test('category IDs are scoped by provider entity type and filters match exact category references', () => {
  const mapped = mapCatalog({channels: [{id: 'c', name: 'Live', categoryId: 1}], movies: [{id: 'm', name: 'Film', categoryId: 1}], categories: [
    {id: 1, name: 'News', type: 'channel'}, {id: 1, name: 'Drama', type: 'movie'}
  ]});
  const live = selectCatalogView(mapped, 'live'), movies = selectCatalogView(mapped, 'movies');
  assert.equal(live.categories[0].name, 'News'); assert.equal(movies.categories[0].name, 'Drama');
  assert.notEqual(live.categories[0].key, movies.categories[0].key);
  assert.equal(filterByCategory(live.items, movies.categories[0].key).length, 0);
  assert.equal(filterByCategory(live.items, live.categories[0].key).length, 1);
});
test('a literal All category and unlabeled content are distinct from the All categories UI option', () => {
  const mapped = mapCatalog({channels: [{id: 'one', category: 'All'}, {id: 'two'}]});
  const view = selectCatalogView(mapped, 'live');
  assert.equal(view.items.length, 2);
  assert.equal(filterByCategory(view.items, view.categories.find(category => category.name === 'All').key).length, 1);
  assert.equal(filterByCategory(view.items, 'uncategorized').length, 1);
});
test('Sports uses explicit sports/genre/category metadata, never title matching', () => {
  const mapped = mapCatalog({channels: [
    {id: 'title-only', name: 'Sports Channel'}, {id: 'flag', sports: true},
    {id: 'genre', genre: 'Sports'}, {id: 'category', categoryId: 's'}
  ], categories: [{id: 's', name: 'Live Sports', type: 'channel'}]});
  assert.deepEqual(selectCatalogView(mapped, 'sports').items.map(item => item.record.id), ['flag', 'genre', 'category']);
});
test('series episodes are only supplied episodes and have parent-scoped identities', () => {
  const mapped = mapCatalog({series: [{id: 'one', name: 'Show A', episodes: [{id: 'e', name: 'Pilot'}]}, {id: 'two', name: 'Show B', episodes: [{id: 'e', name: 'Pilot'}]}, {id: 'three', name: 'No episodes'}]});
  assert.notEqual(mapped.episodes[0].key, mapped.episodes[1].key);
  assert.equal(selectCatalogView(mapped, 'shows', {parentKey: mapped.items[2].key}).items.length, 0);
  assert.equal(mapped.episodes[0].record.url, undefined);
});
test('TV Guide matches only actual channel IDs and never manufactures streams or schedules', () => {
  const mapped = mapCatalog({channels: [{id: 'c', name: 'Named Channel', url: 'https://example.org/live'}], epg: {programmes: [
    {channelId: 'c', title: 'Programme', start: '2026-10-23T12:00:00Z'},
    {channelId: 'missing', title: 'Named Channel'}
  ]}});
  assert.equal(mapped.guide[0].channel.record.url, 'https://example.org/live');
  assert.equal(mapped.guide[1].channel, undefined);
  assert.equal(mapped.guide[0].record.end, undefined);
  assert.equal(mapCatalog({epg: {sources: [{url: 'https://example.org/epg.xml'}]}}).guide.length, 0);
});
test('My List and Recent resolve current records, preserve activity order, and hide stale IDs', () => {
  const mapped = mapCatalog({channels: [{id: 'one'}, {id: 'two'}]});
  const [one, two] = mapped.items;
  assert.deepEqual(selectCatalogView(mapped, 'my-list', {favorites: [two.key, 'missing', one.key]}).items.map(item => item.key), [two.key, one.key]);
  assert.deepEqual(selectCatalogView(mapped, 'recent', {recent: [{key: two.key}, {key: 'missing'}, {key: one.key}]}).items.map(item => item.key), [two.key, one.key]);
});
test('references remain stable across metadata updates, distinguish sources and never expose stream credentials', () => {
  const item = {id: 'stable', name: 'Old', url: 'https://example.org/?password=mock-private'};
  const reference = itemReference('account-a', 'channel', item);
  assert.equal(reference, itemReference('account-a', 'channel', {...item, name: 'New'}));
  assert.notEqual(reference, itemReference('account-b', 'channel', item));
  const fallback = itemReference('account-a', 'movie', {url: item.url});
  assert.equal(fallback.includes('mock-private'), false); assert.equal(fallback.includes('https'), false);
});
test('mapping does not mutate input or fill in missing category/name/URL metadata', () => {
  const catalog = {movies: [{id: 'one'}]};
  const before = structuredClone(catalog), mapped = mapCatalog(catalog);
  assert.deepEqual(catalog, before);
  assert.deepEqual(mapped.items[0].record, {id: 'one'});
  assert.equal(mapped.items[0].name, 'Untitled item');
  assert.throws(() => mapCatalog({movies: {}}), /invalid/);
});
