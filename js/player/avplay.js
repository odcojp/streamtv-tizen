// Never expose native error text: it can contain credential-bearing stream URLs.
export function playbackError(error) {
  const code = typeof error === 'string' ? error : error?.name;
  if (/NOT_SUPPORTED|CODEC/.test(code || '')) return 'This TV does not support this stream format or codec.';
  if (/CONNECTION|NETWORK/.test(code || '')) return 'Cannot connect to this stream. Check network access and account authorization.';
  return 'This stream could not be prepared on this TV. Check its format, availability and authorization.';
}

export function createAVPlayAdapter(avplay, onStatus, {
  onStarted = () => {}, onBuffering = () => {}, timeoutMs = 30000,
  schedule = setTimeout, cancel = clearTimeout
} = {}) {
  let session = 0, phase = 'NONE', timer;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  function release() {
    const state = typeof avplay.getState === 'function' ? avplay.getState() : phase;
    if (['READY', 'PLAYING', 'PAUSED'].includes(state)) avplay.stop();
    if (state !== 'NONE') avplay.close();
    phase = 'NONE';
  }
  function close() {
    ++session; clear(); onBuffering({active: false});
    try { release(); return true; } catch (_) { phase = 'ERROR'; return false; }
  }
  function open(url) {
    if (!close()) { onStatus('The TV player could not be released. Close the app and try again.'); return; }
    const current = ++session;
    let started = false, failed = false;
    const valid = () => current === session && !failed;
    const fail = error => {
      if (!valid()) return;
      failed = true; clear(); onBuffering({active: false});
      try { release(); } catch (_) { /* Next open will retry cleanup. */ }
      phase = 'ERROR'; onStatus(playbackError(error));
    };
    function watchdog() {
      clear(); timer = schedule(() => fail('PLAYER_ERROR_CONNECTION_FAILED'), timeoutMs);
      timer?.unref?.();
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        fail('INVALID_URI'); return;
      }
      avplay.open(url); phase = 'IDLE';
      avplay.setListener({
        onerror: fail,
        onerrormsg: fail,
        ondrmevent: () => {
          if (!valid()) return;
          fail('NOT_SUPPORTED');
          onStatus('This stream requires a DRM integration that this player does not provide.');
        },
        onbufferingstart: () => { if (valid()) { onBuffering({active: true}); watchdog(); } },
        onbufferingprogress: percent => { if (valid()) onBuffering({active: true, percent: Math.max(0, Math.min(100, Number(percent) || 0))}); },
        onbufferingcomplete: () => { if (valid()) { clear(); onBuffering({active: false}); } },
        onstreamcompleted: () => {
          if (!valid()) return;
          close(); onStatus('Playback finished. Select the channel again to replay.');
        },
        oncurrentplaytime: milliseconds => {
          if (valid() && phase === 'PLAYING' && milliseconds > 0) {
            clear(); onBuffering({active: false});
            if (!started) { started = true; onStarted(); }
          }
        }
      });
      avplay.setDisplayRect(0, 0, 1920, 1080);
      phase = 'PREPARING'; onBuffering({active: true}); watchdog();
      avplay.prepareAsync(() => {
        if (!valid() || phase !== 'PREPARING') return;
        try {
          phase = 'READY'; avplay.play(); phase = 'PLAYING';
          onStatus('Playing with Samsung AVPlay'); watchdog();
        } catch (error) { fail(error); }
      }, fail);
    } catch (error) { fail(error); }
  }
  return {open, close, stop: close, getState: () => phase};
}
