import {toPlayableChannels} from '../api/provider-response.js';

export function createProviderSettingsUI({document, adapter, onChannels, canUseCatalog = true}) {
  const modal = document.createElement('div');
  modal.id = 'provider-dialog'; modal.hidden = true;
  modal.innerHTML = '<form role="dialog" aria-modal="true" aria-labelledby="provider-title" autocomplete="off"><h2 id="provider-title">Provider connection</h2><p>Connect with your complete laon.live or infolink.me login link. Separate account fields are also available for laon.live. Your login link and password are used for this connection and are not saved.</p><div class="provider-mode"><button type="button" id="provider-link-mode" aria-pressed="true">Use provider link</button><button type="button" id="provider-account-mode" aria-pressed="false">Use username and password</button></div><div id="provider-link-fields"><label for="provider-link">Provider login link</label><input id="provider-link" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://infolink.me/api/list/USERNAME/PASSWORD" required></div><div id="provider-account-fields" hidden><label for="provider-username">Username</label><input id="provider-username" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required disabled><label for="provider-password">Password</label><input id="provider-password" type="password" autocomplete="off" required disabled></div><div class="provider-actions"><button type="submit">Connect</button><button type="button" id="provider-use" disabled>Show channels</button><button type="button" id="provider-cancel">Back to channels</button></div><p id="provider-message" role="status"></p></form>';
  document.getElementById('stage').append(modal);
  const link = modal.querySelector('#provider-link');
  const username = modal.querySelector('#provider-username');
  const password = modal.querySelector('#provider-password');
  const submit = modal.querySelector('[type="submit"]');
  const use = modal.querySelector('#provider-use');
  const message = modal.querySelector('#provider-message');
  let controller, result, previousFocus, mode = 'link';

  function clearSecrets() { link.value = ''; username.value = ''; password.value = ''; }
  function setMode(value) {
    controller?.abort(); controller = null; result = null;
    mode = value; clearSecrets(); message.textContent = ''; submit.disabled = false; use.disabled = true;
    modal.querySelector('#provider-link-fields').hidden = mode !== 'link'; link.disabled = mode !== 'link';
    modal.querySelector('#provider-account-fields').hidden = mode === 'link'; username.disabled = password.disabled = mode === 'link';
    modal.querySelector('#provider-link-mode').setAttribute('aria-pressed', String(mode === 'link'));
    modal.querySelector('#provider-account-mode').setAttribute('aria-pressed', String(mode !== 'link'));
    (mode === 'link' ? link : username).focus();
  }
  function close() {
    controller?.abort(); controller = null; result = null;
    clearSecrets(); modal.hidden = true; submit.disabled = false; use.disabled = true;
    previousFocus?.isConnected && previousFocus.focus();
  }
  function open(initialLink) {
    previousFocus = document.activeElement; modal.hidden = false; setMode('link');
    if (typeof initialLink === 'string') link.value = initialLink;
  }
  modal.querySelector('#provider-link-mode').onclick = () => setMode('link');
  modal.querySelector('#provider-account-mode').onclick = () => setMode('account');
  // A full link in the old username field must not be nested into the API URL.
  username.oninput = () => {
    if (!/^https?:\/\//i.test(username.value)) return;
    const value = username.value; setMode('link'); link.value = value;
    message.textContent = 'Complete login link detected. Select Connect to check this link.';
  };
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
      const response = mode === 'link'
        ? await adapter.connectLink(link.value, {signal: request.signal})
        : await adapter.connect({username: username.value, password: password.value}, {signal: request.signal});
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
      clearSecrets();
    } catch (error) {
      if (controller !== request || modal.hidden) return;
      // Adapter errors are static/safe. Never render arbitrary fetch exceptions.
      message.textContent = error.code === 'HTML_PAGE'
        ? 'Provider returned a web page, not M3U, JSON or supported XML catalog data. Confirm account access and whether this endpoint supports direct requests from this TV.'
        : error.name === 'ProviderAdapterError' ? error.message : 'Provider connection failed.';
    } finally {
      if (controller === request) { controller = null; submit.disabled = false; password.value = ''; link.value = ''; }
    }
  };
  return {modal, get inputs() { return mode === 'link' ? [link] : [username, password]; }, open, close, isOpen: () => !modal.hidden};
}
