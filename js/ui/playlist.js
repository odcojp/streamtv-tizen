import {parseM3U} from '../api/playlist.js';

export function createPlaylistUI({document, importButton, provider, settings, catalog, onOpenProviderSettings}) {
  let controller, returnFocus;
  const modal = document.createElement('div');
  modal.id = 'playlist-dialog'; modal.hidden = true;
  modal.innerHTML = '<form role="dialog" aria-modal="true" aria-labelledby="playlist-title"><h2 id="playlist-title">Your playlist</h2><p>Enter your M3U link privately. It is sent directly to your provider.</p><label for="playlist-url">Playlist link</label><input id="playlist-url" type="password" autocomplete="off" spellcheck="false" required><label class="remember"><input id="playlist-remember" type="checkbox"> Remember link on this TV (stored locally)</label><div><button type="submit">Load channels</button><button type="button" id="playlist-cancel">Cancel</button><button type="button" id="playlist-forget">Forget saved link</button></div><p id="playlist-message" role="status"></p></form>';
  document.getElementById('stage').append(modal);
  const input = modal.querySelector('#playlist-url');
  const remember = modal.querySelector('#playlist-remember');
  const message = modal.querySelector('#playlist-message');
  const submit = modal.querySelector('[type="submit"]');
  if (onOpenProviderSettings) {
    const connectionButton = document.createElement('button');
    connectionButton.type = 'button'; connectionButton.textContent = 'Provider settings';
    connectionButton.onclick = () => { close(); onOpenProviderSettings(); };
    modal.querySelector('form > div').append(connectionButton);
  }

  function close() {
    controller?.abort(); controller = null;
    modal.hidden = true; input.value = ''; submit.disabled = false;
    (returnFocus?.isConnected ? returnFocus : importButton).focus();
  }
  importButton.onclick = () => {
    returnFocus = document.activeElement; modal.hidden = false; message.textContent = '';
    input.value = settings.readPlaylistAddress();
    remember.checked = !!input.value; input.focus();
  };
  modal.querySelector('#playlist-cancel').onclick = close;
  modal.querySelector('#playlist-forget').onclick = () => {
    message.textContent = settings.forgetPlaylistAddress() ? 'Saved link removed.' : 'Local storage unavailable.';
    input.value = ''; remember.checked = false;
  };

  modal.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (controller) return;
    const request = new AbortController(); controller = request;
    const address = input.value.trim();
    submit.disabled = true; message.textContent = 'Loading playlist...';
    try {
      const response = await provider.loadPlaylist(address, {signal: request.signal});
      const list = parseM3U(response.text, response.baseUrl);
      if (controller !== request || modal.hidden) return;
      const saved = settings.savePlaylistAddress(new URL(address).href, remember.checked);
      if (catalog.offerProviderCatalog) {
        const offered = catalog.offerProviderCatalog({channels: list});
        if (!offered.accepted) {
          message.textContent = 'Recognized ' + list.length + ' channels. ' + offered.message + (!saved ? ' Link could not be saved.' : '');
          return;
        }
      }
      catalog.activatePlaylist(list); close(); document.querySelector('.channel')?.focus();
      if (!saved) catalog.reportUnsavedLink();
    } catch (error) {
      if (controller !== request || modal.hidden) return;
      message.textContent = error.message;
    } finally {
      // A cancelled old request must not enable a newer request's submit button.
      if (controller === request) { controller = null; submit.disabled = false; }
    }
  };

  return {modal, input, remember, close, isOpen: () => !modal.hidden};
}
