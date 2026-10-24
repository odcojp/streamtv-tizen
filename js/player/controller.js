import {createAVPlayAdapter} from './avplay.js';

export function createPlayerController({document, avplay, onStarted = () => {}, onRestoreFocus = () => {}}) {
  const player = document.getElementById('player');
  const status = document.getElementById('status');
  const video = document.getElementById('video');
  const object = document.getElementById('av-player');
  let previousFocus, session = 0, activeItem;
  const buffering = document.getElementById('buffering');
  const adapter = avplay && createAVPlayAdapter(avplay, message => { status.textContent = avplay.isMock ? 'Offline mock — no video decoding. ' + message : message; }, {onStarted: () => { if (!avplay.isMock) onStarted(activeItem); }, onBuffering: ({active, percent}) => {
    if (buffering) { buffering.hidden = !active; buffering.textContent = 'Buffering' + (percent === undefined ? '…' : ' ' + percent + '%'); }
  }});

  function close() {
    const previousKey = activeItem?.libraryKey;
    ++session;
    activeItem = null;
    adapter?.close();
    video.pause(); video.removeAttribute('src'); video.load();
    document.body.classList.remove('avplay-active');
    player.hidden = true;
    if (previousFocus?.isConnected) previousFocus.focus();
    else onRestoreFocus(previousKey);
  }

  function open(channel) {
    if (!player.hidden) close();
    previousFocus = document.activeElement;
    activeItem = channel;
    const current = ++session;
    player.hidden = false;
    document.getElementById('playing-title').textContent = channel.name;
    document.getElementById('close').focus();
    status.textContent = 'Demo preview. No stream is configured for this channel yet. Physical TV playback will be tested separately.';
    if (channel.catalogItem) status.textContent = 'No stream URL was supplied for this item.' + (channel.description ? ' ' + channel.description : '');
    video.hidden = true; object.hidden = true;
    if (!channel.url) return;
    status.textContent = 'Loading sample video...';
    if (adapter && !channel.browserTest) {
      document.body.classList.add('avplay-active');
      object.hidden = false;
      adapter.open(channel.url);
    } else {
      video.hidden = false; video.src = channel.url;
      video.play().then(() => {
        if (current === session) { status.textContent = 'Browser playback'; onStarted(channel); }
      }).catch(() => {
        if (current === session) status.textContent = 'Browser cannot play this stream. Test its format on the TV.';
      });
    }
  }
  document.getElementById('close').onclick = close;
  return {open, switchChannel: open, close, isOpen: () => !player.hidden};
}
