import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSettings} from '../js/ui/settings.js';

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
}
test('playlist address is stored only when remembering is explicitly enabled', () => {
  const settings = createSettings(memoryStorage());
  assert.equal(settings.readPlaylistAddress(), '');
  assert.equal(settings.savePlaylistAddress('https://example.org/private', false), true);
  assert.equal(settings.readPlaylistAddress(), '');
  assert.equal(settings.savePlaylistAddress('https://example.org/private', true), true);
  assert.equal(settings.readPlaylistAddress(), 'https://example.org/private');
});
test('unchecking remember and forgetting remove previously saved addresses', () => {
  const settings = createSettings(memoryStorage());
  settings.savePlaylistAddress('https://example.org/private', true);
  settings.savePlaylistAddress('https://example.org/new', false);
  assert.equal(settings.readPlaylistAddress(), '');
  settings.savePlaylistAddress('https://example.org/private', true);
  assert.equal(settings.forgetPlaylistAddress(), true);
  assert.equal(settings.readPlaylistAddress(), '');
});
test('blocked storage is reported without leaking its exception or crashing the UI', () => {
  const fail = () => { throw new Error('private storage failure'); };
  const settings = createSettings({getItem: fail, setItem: fail, removeItem: fail});
  assert.equal(settings.readPlaylistAddress(), '');
  assert.equal(settings.savePlaylistAddress('secret', true), false);
  assert.equal(settings.forgetPlaylistAddress(), false);
});
test('missing local storage is supported', () => {
  const settings = createSettings(null);
  assert.equal(settings.readPlaylistAddress(), '');
  assert.equal(settings.savePlaylistAddress('secret', true), false);
  assert.equal(settings.forgetPlaylistAddress(), false);
});
