// Offline lifecycle simulation only; no network request or media decoding.
export function createMockAVPlay({delay = 80} = {}) {
  let state = 'NONE', listener = {}, preparation, ticker, position = 0;
  const requireState = (...allowed) => { if (!allowed.includes(state)) throw new Error('InvalidStateError'); };
  function cleanup() { clearTimeout(preparation); clearInterval(ticker); }
  return {
    isMock: true,
    getState: () => state,
    open() { requireState('NONE'); state = 'IDLE'; position = 0; },
    setListener(value) { requireState('IDLE'); listener = value; },
    setDisplayRect() { requireState('IDLE', 'READY', 'PLAYING', 'PAUSED'); },
    prepareAsync(ready) {
      requireState('IDLE'); listener.onbufferingstart?.();
      preparation = setTimeout(() => { state = 'READY'; listener.onbufferingprogress?.(100); listener.onbufferingcomplete?.(); ready(); }, delay);
    },
    play() { requireState('READY', 'PAUSED'); state = 'PLAYING'; ticker = setInterval(() => listener.oncurrentplaytime?.(position += 1000), 1000); },
    stop() { requireState('READY', 'PLAYING', 'PAUSED'); cleanup(); state = 'IDLE'; },
    close() { cleanup(); state = 'NONE'; listener = {}; },
    simulateError(code = 'PLAYER_ERROR_CONNECTION_FAILED') { listener.onerror?.(code); },
    simulateBuffering(percent) { listener.onbufferingstart?.(); listener.onbufferingprogress?.(percent); },
    simulateComplete() { listener.onstreamcompleted?.(); }
  };
}
