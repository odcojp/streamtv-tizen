import {ProviderAdapterError, logProviderEvent} from './provider-errors.js';
import {detectProviderResponse, normalizeProviderResponse} from './provider-response.js';

export const PROVIDER_ORIGINS = Object.freeze(['https://laon.live', 'https://infolink.me']);
const invalidLink = () => new ProviderAdapterError('INVALID_PROVIDER_LINK', 'Enter a complete HTTPS laon.live or infolink.me link in the form /api/list/USERNAME/PASSWORD. Extra paths, queries and fragments are not supported.');
const MAX_RESPONSE_LENGTH = 20 * 1024 * 1024;

export function buildProviderUrl({origin = PROVIDER_ORIGINS[0], username, password} = {}) {
  if (!PROVIDER_ORIGINS.includes(origin)) throw invalidLink();
  for (const value of [username, password]) {
    if (typeof value !== 'string' || !value.length)
      throw new ProviderAdapterError('CREDENTIALS_REQUIRED', 'Enter both username and password.');
    // Browsers normalize even percent-encoded standalone dot path segments.
    if (value === '.' || value === '..')
      throw new ProviderAdapterError('INVALID_CREDENTIALS_FORMAT', 'Standalone dot path segments are not supported as credentials.');
  }
  function segment(value) {
    try {
      return encodeURIComponent(value).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
    } catch (_) {
      throw new ProviderAdapterError('INVALID_CREDENTIALS_FORMAT', 'Credentials contain invalid Unicode.');
    }
  }
  return origin + '/api/list/' + segment(username) + '/' + segment(password);
}

// Accept only the confirmed endpoint; decode each credential exactly once,
// then reuse the account URL builder. Never forward arbitrary pasted URLs.
export function parseProviderLink(input) {
  const invalid = invalidLink;
  if (typeof input !== 'string') throw invalid();
  const value = input.trim();
  try {
    const url = new URL(value);
    const raw = value.match(/^https:\/\/([^/?#]+)(\/[^?#]*)$/i);
    const path = raw && raw[2].match(/^\/api\/list\/([^/\\]+)\/([^/\\]+)\/?$/);
    if (!PROVIDER_ORIGINS.includes(url.origin) || url.username || url.password || url.search || url.hash || !path) throw invalid();
    const credentials = {origin: url.origin, username: decodeURIComponent(path[1]), password: decodeURIComponent(path[2])};
    buildProviderUrl(credentials);
    return credentials;
  } catch (_) { throw invalid(); }
}

// Preserve the existing Laon-specific entry points for account-mode callers.
export function buildLaonUrl(credentials) { return buildProviderUrl({...credentials, origin: PROVIDER_ORIGINS[0]}); }
export function parseLaonLink(input) {
  const {origin, username, password} = parseProviderLink(input);
  if (origin !== PROVIDER_ORIGINS[0]) throw invalidLink();
  return {username, password};
}

export function createLaonAdapter({fetchImpl = globalThis.fetch, timeoutMs = 30000, logger = () => {}, DOMParserImpl = globalThis.DOMParser} = {}) {
  async function connect(credentials, {signal} = {}) {
      const url = buildProviderUrl(credentials);
      const request = new AbortController();
      let timedOut = false;
      const cancel = () => request.abort();
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, {once: true});
      const timeout = setTimeout(() => { timedOut = true; request.abort(); }, timeoutMs);
      logProviderEvent(logger, 'connection-start');
      try {
        request.signal.throwIfAborted();
        const response = await fetchImpl(url, {
          method: 'GET', signal: request.signal, credentials: 'omit',
          cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'manual'
        });
        request.signal.throwIfAborted();
        if (response.type === 'opaqueredirect' || response.redirected || (response.status >= 300 && response.status < 400))
          throw new ProviderAdapterError('REDIRECT', 'Provider redirected the request. Redirects are not followed automatically; confirm the documented endpoint.', 'redirect');
        if (response.status === 401)
          throw new ProviderAdapterError('AUTHENTICATION_FAILED', 'Provider rejected authentication (HTTP 401). Check your account details.');
        if (response.status === 403)
          throw new ProviderAdapterError('ACCESS_DENIED', 'Provider denied access (HTTP 403). Check account permissions or provider security requirements.');
        if (response.status === 429)
          throw new ProviderAdapterError('RATE_LIMITED', 'Provider rate limit reached. Wait before trying again.');
        if (!response.ok)
          throw new ProviderAdapterError('HTTP_ERROR', 'Provider returned HTTP ' + response.status + '.');
        const text = await response.text();
        request.signal.throwIfAborted();
        if (text.length > MAX_RESPONSE_LENGTH)
          throw new ProviderAdapterError('RESPONSE_TOO_LARGE', 'Provider response exceeds the 20 MB limit.');
        const contentType = response.headers?.get('content-type') || '';
        const format = detectProviderResponse(text, contentType);
        const result = normalizeProviderResponse(text, {format, baseUrl: url, DOMParserImpl});
        logProviderEvent(logger, 'connection-result', {format});
        return result;
      } catch (error) {
        let safeError;
        if (timedOut) safeError = new ProviderAdapterError('TIMEOUT', 'Provider request timed out. Check your connection and try again.');
        else if (request.signal.aborted) safeError = new ProviderAdapterError('CANCELLED', 'Provider connection cancelled.');
        else if (error instanceof ProviderAdapterError) safeError = error;
        else safeError = new ProviderAdapterError('NETWORK_TLS_CORS', 'Connection failed. The browser cannot distinguish network, TLS certificate, and CORS failures. Check connectivity and provider app support.');
        logProviderEvent(logger, 'connection-error', {code: safeError.code, format: safeError.format});
        throw safeError;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
      }
  }
  return {connect, async connectLink(link, options) { return connect(parseProviderLink(link), options); }};
}

export const createProviderAdapter = createLaonAdapter;
