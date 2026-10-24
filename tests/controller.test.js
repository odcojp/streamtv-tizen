import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerController} from '../js/player/controller.js';

function fakeDocument() {
  const elements = new Map();
  const classes = new Set();
  const document = {body: {classList: {add: value => classes.add(value), remove: value => classes.delete(value)}}};
  for (const id of ['player', 'status', 'video', 'av-player', 'playing-title', 'close', 'channel']) {
    const element = {id, hidden: true, isConnected: true, textContent: '', pause() {}, load() {}, removeAttribute(name) { delete this[name]; }, play() { return Promise.resolve(); }, focus() { document.activeElement = this; }};
    elements.set(id, element);
  }
  document.getElementById = id => elements.get(id);
  document.activeElement = elements.get('channel');
  return {document, classes};
}

test('demo channel opens without starting media and Back restores channel focus', () => {
  const {document} = fakeDocument();
  const controller = createPlayerController({document});
  controller.open({name: 'Demo'});
  assert.equal(controller.isOpen(), true);
  assert.match(document.getElementById('status').textContent, /No stream/);
  assert.equal(document.getElementById('video').hidden, true);
  controller.close();
  assert.equal(controller.isOpen(), false);
  assert.equal(document.activeElement.id, 'channel');
});
test('the existing browserTest flag selects HTML video even when AVPlay is present', async () => {
  const {document, classes} = fakeDocument();
  const controller = createPlayerController({document, avplay: {open: () => assert.fail('AVPlay must not open'), close() {}}});
  controller.open({name: 'Browser comparison', url: 'https://example.org/video', browserTest: true});
  await Promise.resolve();
  assert.equal(document.getElementById('video').src, 'https://example.org/video');
  assert.equal(document.getElementById('video').hidden, false);
  assert.equal(classes.has('avplay-active'), false);
  assert.equal(document.getElementById('status').textContent, 'Browser playback');
});
test('late browser playback results cannot overwrite a reopened demo', async () => {
  const {document} = fakeDocument();
  let resolve;
  document.getElementById('video').play = () => new Promise(done => { resolve = done; });
  let starts = 0;
  const controller = createPlayerController({document, onStarted: () => starts++});
  controller.open({name: 'Video', url: 'https://example.org/video'});
  controller.close();
  controller.open({name: 'Demo'});
  resolve(); await Promise.resolve();
  assert.match(document.getElementById('status').textContent, /No stream/);
  assert.equal(document.getElementById('video').hidden, true);
  assert.equal(starts, 0);
});
test('HTML video reports watched activity only after successful playback, never for missing URLs', async () => {
  const {document} = fakeDocument(), started = [];
  const controller = createPlayerController({document, onStarted: item => started.push(item.libraryKey)});
  controller.open({name: 'Metadata', catalogItem: true, libraryKey: 'metadata'});
  assert.deepEqual(started, []);
  controller.close();
  controller.open({name: 'Video', url: 'https://example.org/video', libraryKey: 'video'});
  await Promise.resolve();
  assert.deepEqual(started, ['video']);
});
test('a rejected HTML play request never creates recently watched activity', async () => {
  const {document} = fakeDocument(); let starts = 0;
  document.getElementById('video').play = () => Promise.reject(new Error('Playback failed'));
  const controller = createPlayerController({document, onStarted: () => starts++});
  controller.open({name: 'Video', url: 'https://example.org/video'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts, 0);
  assert.match(document.getElementById('status').textContent, /cannot play/);
});
