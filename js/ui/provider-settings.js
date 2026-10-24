import {toPlayableChannels} from '../api/provider-response.js';

export function createProviderSettingsUI({document, adapter, onChannels, canUseCatalog = true}) {
  const modal = document.createElement('div');
  modal.id = 'provider-dialog'; modal.hidden = true;
  modal.innerHTML = '<form role="dialog" aria-modal="true" aria-labelledby="provider-title" autocomplete="off"><h2 id="provider-title">Provider connection</h2><p>Connect to laon.live with your provider account. Credentials are used for this connection and are not saved.</p><label for="provider-username">Username</label><input id="provider-username" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required><label for="provider-password">Password</label><input id="provider-password" type="password" autocomplete="off" required><div class="provider-actions"><button type="submit">Connect</button><button type="button" id="provider-use" disabled>Show channels</button><button type="button" id="provider-cancel">Back to channels</button></div><p id="provider-message" role="status"></p></form>';
  document.getElementById('stage').append(modal);
  const username = modal.querySelector('#provider-username');
  const password = modal.querySelector('#provider-password');
  const submit = modal.querySelector('[type="submit"]');
  const use = modal.querySelector('#provider-use');
  const message = modal.querySelector('#provider-message');
  let controller, result, previousFocus;

  function close() {
    controller?.abort(); controller = null; result = null;
    username.value = ''; password.value = ''; modal.hidden = true;
    submit.disabled = false; use.disabled = true;
    previousFocus?.isConnected && previousFocus.focus();
  }
  function open() {
    previousFocus = document.activeElement; result = null;
    message.textContent = ''; use.disabled = true; modal.hidden = false;
    username.value = ''; password.value = ''; username.focus();
  }
  modal.querySelector('#provider-cancel').onclick = close;
  use.onclick = () => {
    if (!result) return;
    const channels = toPlayableChannels(result.catalog);
    if (!channels.length) return;
    onChannels(channels); close(); document.querySelector('.channel')?.focus();
  };
  modal.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (controller) return;
    const request = new AbortController(); controller = request;
    result = null; use.disabled = true; submit.disabled = true;
    message.textContent = 'Connecting to provider...';
    try {
      const response = await adapter.connect({username: username.value, password: password.value}, {signal: request.signal});
      if (controller !== request || modal.hidden) return;
      result = response;
      const counts = ['channels', 'movies', 'series', 'categories'].filter(key => Array.isArray(response.catalog[key]))
        .map(key => response.catalog[key].length + ' ' + key);
      if (response.catalog.epg) counts.push('EPG data');
      const playable = toPlayableChannels(response.catalog).length;
      use.disabled = !playable || !canUseCatalog;
      message.textContent = 'Received ' + response.format.toUpperCase() + ': ' + counts.join(', ') + '. ' +
        (!playable ? 'No playable live channels were supplied. ' : '') +
        (!canUseCatalog ? 'Mock catalog remains active until this provider response is safely verified. ' : '') +
        response.warnings.join(' ');
      username.value = ''; password.value = '';
    } catch (error) {
      if (controller !== request || modal.hidden) return;
      // Adapter errors are static/safe. Never render arbitrary fetch exceptions.
      message.textContent = error.name === 'ProviderAdapterError' ? error.message : 'Provider connection failed.';
    } finally {
      if (controller === request) { controller = null; submit.disabled = false; password.value = ''; }
    }
  };
  return {modal, inputs: [username, password], open, close, isOpen: () => !modal.hidden};
}
