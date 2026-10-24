import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAVPlayAdapter} from '../js/player/avplay.js';

function mockAVPlay() {
  const pending = [], listeners = [], played = [], rectangles = [];
  let url;
  return {
    pending, listeners, played, rectangles,
    stop: () => {}, open: value => { url = value; }, close: () => {},
    setDisplayRect: (...rect) => rectangles.push(rect),
    setListener: value => listeners.push(value),
    prepareAsync: (ready, error) => pending.push({ready, error}),
    play: () => played.push(url)
  };
}
test('AVPlay starts only after preparation and uses the existing logical display rect', () => {
  const avplay = mockAVPlay(), statuses = [];
  const adapter = createAVPlayAdapter(avplay, status => statuses.push(status));
  adapter.open('https://example.org/one');
  assert.equal(avplay.played.length, 0);
  avplay.pending[0].ready();
  assert.deepEqual(avplay.played, ['https://example.org/one']);
  assert.deepEqual(avplay.rectangles, [[0, 0, 1920, 1080]]);
  assert.equal(statuses.at(-1), 'Playing with Samsung AVPlay');
});
test('Back/close invalidates pending prepare and error callbacks', () => {
  const avplay = mockAVPlay(), statuses = [];
  const adapter = createAVPlayAdapter(avplay, value => statuses.push(value));
  adapter.open('https://example.org/one'); adapter.close();
  avplay.pending[0].ready(); avplay.pending[0].error(); avplay.listeners[0].onerror('STALE');
  assert.deepEqual(avplay.played, []); assert.deepEqual(statuses, []);
});
test('old channel callbacks cannot start or overwrite a newer channel', () => {
  const avplay = mockAVPlay(), statuses = [];
  const adapter = createAVPlayAdapter(avplay, value => statuses.push(value));
  adapter.open('https://example.org/one'); adapter.open('https://example.org/two');
  avplay.pending[0].ready(); avplay.pending[0].error();
  avplay.pending[1].ready();
  assert.deepEqual(avplay.played, ['https://example.org/two']);
  assert.deepEqual(statuses, ['Playing with Samsung AVPlay']);
});
test('prepare and asynchronous playback failures reach the status UI', () => {
  const avplay = mockAVPlay(), statuses = [];
  const adapter = createAVPlayAdapter(avplay, value => statuses.push(value));
  adapter.open('https://example.org/one'); avplay.pending[0].error();
  assert.match(statuses.at(-1), /could not be prepared/);
  adapter.open('https://example.org/two');
  avplay.play = () => { throw new Error('decoder unavailable'); };
  avplay.pending[1].ready();
  assert.match(statuses.at(-1), /could not be prepared/);
});
test('synchronous errors and repeated idle closes do not crash the app', () => {
  const statuses = [];
  const adapter = createAVPlayAdapter({close: () => { throw new Error('idle'); }, open: () => { throw new Error('open failed'); }}, value => statuses.push(value));
  adapter.close(); adapter.close(); adapter.open('https://example.org');
  assert.match(statuses[0], /could not be prepared/);
});
test('watched history is notified once only after playback advances, never on prepare/error/late callbacks', () => {
  const avplay = mockAVPlay(); let starts = 0;
  const adapter = createAVPlayAdapter(avplay, () => {}, {onStarted: () => starts++});
  adapter.open('https://example.org/one'); avplay.pending[0].ready();
  assert.equal(starts, 0);
  avplay.listeners[0].oncurrentplaytime(0); assert.equal(starts, 0);
  avplay.listeners[0].oncurrentplaytime(1); avplay.listeners[0].oncurrentplaytime(1000);
  assert.equal(starts, 1);
  adapter.close(); avplay.listeners[0].oncurrentplaytime(2000); assert.equal(starts, 1);
  adapter.open('https://example.org/two'); avplay.listeners[1].onerror('FAILED');
  assert.equal(starts, 1);
});

test('buffering clamps progress and timeout releases the session without leaking a URL', () => {
  const native = mockAVPlay(), statuses = [], buffering = [];
  let timeout;
  const adapter = createAVPlayAdapter(native, value => statuses.push(value), {
    onBuffering: value => buffering.push(value), schedule: callback => { timeout = callback; return 1; }, cancel: () => {}
  });
  adapter.open('https://example.org/private/user/password');
  native.listeners[0].onbufferingprogress(120);
  assert.deepEqual(buffering.at(-1), {active: true, percent: 100});
  timeout(); native.pending[0].ready();
  assert.equal(adapter.getState(), 'ERROR'); assert.equal(native.played.length, 0);
  assert.match(statuses.at(-1), /Cannot connect/);
  assert.ok(!statuses.join().includes('password'));
});
test('unsupported codecs and DRM are reported without exposing native details', () => {
  const native = mockAVPlay(), statuses = [];
  const adapter = createAVPlayAdapter(native, value => statuses.push(value));
  adapter.open('https://example.org/a.m3u8');
  native.listeners[0].onerror('PLAYER_ERROR_NOT_SUPPORTED_FILE');
  assert.match(statuses.at(-1), /format or codec/);
  adapter.open('https://example.org/b.m3u8');
  native.listeners[1].ondrmevent('Widevine', {license: 'secret'});
  assert.match(statuses.at(-1), /DRM integration/);
  assert.ok(!statuses.join().includes('secret')); adapter.close();
});
