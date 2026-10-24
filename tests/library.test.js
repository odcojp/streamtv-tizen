import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLibrary} from '../js/ui/library.js';
import {itemReference} from '../js/api/catalog-views.js';

function memoryStorage() {
  const values = new Map();
  return {values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
}
const key = id => itemReference('mock', 'channel', {id});
test('favorites persist as references, toggle off, and survive recreation', () => {
  const storage = memoryStorage(), library = createLibrary({storage});
  library.toggleFavorite(key('one'));
  assert.equal(createLibrary({storage}).isFavorite(key('one')), true);
  library.toggleFavorite(key('one'));
  assert.equal(createLibrary({storage}).isFavorite(key('one')), false);
});
test('recent history is deduplicated, most recently started first, bounded, and persisted', () => {
  const storage = memoryStorage(); let time = 100;
  const library = createLibrary({storage, now: () => time++});
  for (let i = 0; i < 55; i++) library.recordPlayed(key(i));
  library.recordPlayed(key(10));
  const result = createLibrary({storage}).snapshot().recent;
  assert.equal(result.length, 50); assert.equal(result[0].key, key(10));
  assert.equal(result.filter(entry => entry.key === key(10)).length, 1);
});
test('raw URLs and arbitrary objects are never accepted into the stored library', () => {
  const storage = memoryStorage(), library = createLibrary({storage});
  assert.equal(library.toggleFavorite('https://example.org/?password=mock-private'), false);
  library.recordPlayed('https://example.org/?password=mock-private');
  library.toggleFavorite(key('one'));
  const saved = [...storage.values.values()].join('');
  assert.equal(saved.includes('mock-private'), false); assert.equal(saved.includes('https://'), false);
});
test('corrupt/blocked storage falls back to memory, while stored fields are strictly validated', () => {
  const storage = memoryStorage(); storage.setItem('streamtv-library-v1', '{bad json');
  assert.deepEqual(createLibrary({storage}).snapshot().favorites, []);
  storage.setItem('streamtv-library-v1', JSON.stringify({version: 1, favorites: [key(1), key(1), 'https://private'], recent: [{key: key(1), watchedAt: 1, url: 'private'}, {key: key(1), watchedAt: 2}, {key: key(2), watchedAt: -1}]}));
  const validated = createLibrary({storage}).snapshot();
  assert.deepEqual(validated.favorites, [key(1)]);
  assert.deepEqual(validated.recent, [{key: key(1), watchedAt: 1}]);
  const blocked = createLibrary({storage: {getItem() { throw new Error(); }, setItem() { throw new Error(); }}});
  blocked.toggleFavorite(key(1)); assert.equal(blocked.isFavorite(key(1)), true);
  assert.equal(blocked.snapshot().persistent, false);
});
test('snapshots cannot mutate stored state and changes notify UI subscribers', () => {
  const library = createLibrary({storage: memoryStorage()}); let changes = 0;
  const unsubscribe = library.subscribe(() => changes++);
  library.toggleFavorite(key(1)); const snapshot = library.snapshot(); snapshot.favorites.length = 0;
  assert.equal(library.isFavorite(key(1)), true); assert.equal(changes, 1);
  unsubscribe(); library.recordPlayed(key(1)); assert.equal(changes, 1);
});
