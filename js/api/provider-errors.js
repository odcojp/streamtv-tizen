export class ProviderAdapterError extends Error {
  constructor(code, message, format) {
    super(message);
    this.name = 'ProviderAdapterError';
    this.code = code;
    if (format) this.format = format;
    // Never attach the fetch error, request URL, credentials or provider body.
  }
}

export function redactProviderSecrets(value, credentials = {}) {
  let text = String(value);
  // Redact entire URLs rather than guessing which path/query fields are secret.
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, '[REDACTED URL]');
  text = text.replace(/\/api\/list\/[^\s<>"']+/gi, '/api/list/[REDACTED]');
  const values = [credentials.username, credentials.password].filter(value => typeof value === 'string' && value.length);
  const tokens = values.flatMap(value => {
    try {
      const encoded = encodeURIComponent(value);
      return [value, encoded, encoded.replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase())];
    } catch (_) { return [value]; }
  }).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }
  return text;
}

// Diagnostics deliberately expose only these static fields, never raw objects.
export function logProviderEvent(logger, event, details = {}) {
  const codes = ['CREDENTIALS_REQUIRED', 'INVALID_CREDENTIALS_FORMAT', 'REDIRECT', 'AUTHENTICATION_FAILED', 'ACCESS_DENIED', 'RATE_LIMITED', 'HTTP_ERROR', 'RESPONSE_TOO_LARGE', 'TIMEOUT', 'CANCELLED', 'NETWORK_TLS_CORS', 'UNSUPPORTED_EPG', 'PROVIDER_ERROR', 'UNSUPPORTED_SCHEMA', 'CATALOG_TOO_LARGE', 'UNSUPPORTED_M3U', 'UNSUPPORTED_XML', 'XML_UNAVAILABLE', 'MALFORMED_XML', 'MALFORMED_JSON', 'HTML_PAGE', 'EMPTY_RESPONSE', 'UNSUPPORTED_FORMAT'];
  const record = {event: ['connection-start', 'connection-result', 'connection-error'].includes(event) ? event : 'provider-event'};
  if (codes.includes(details.code)) record.code = details.code;
  if (['m3u', 'json', 'xml', 'html', 'empty', 'unknown', 'redirect'].includes(details.format)) record.format = details.format;
  if (Number.isInteger(details.status) && details.status >= 100 && details.status <= 599) record.status = details.status;
  try { logger(record); } catch (_) { /* Logging cannot break a connection. */ }
}
