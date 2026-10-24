import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMockAVPlay} from '../js/player/mock-avplay.js';
import {createAVPlayAdapter} from '../js/player/avplay.js';

test('strict offline mock enforces lifecycle and switches safely while preparing or playing', async () => {
  const native = createMockAVPlay({delay: 1});
  assert.throws(() => native.play(), /InvalidState/);
  const statuses = [], adapter = createAVPlayAdapter(native, value => statuses.push(value));
  try {
    adapter.open('https://example.org/first.m3u8');
    adapter.open('https://example.org/second.mp4');
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(native.getState(), 'PLAYING');
    adapter.open('https://example.org/third.m3u8');
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(native.getState(), 'PLAYING');
    native.simulateComplete(); assert.equal(native.getState(), 'NONE');
    assert.match(statuses.at(-1), /finished/);
  } finally { adapter.close(); }
});
