const MAX_PLAYLIST_LENGTH = 20 * 1024 * 1024;

// No provider-specific headers, proxy or credentials are invented here.
export function createProviderConnection({fetchImpl = globalThis.fetch, timeoutMs = 30000} = {}) {
  return {
    async loadPlaylist(address, {signal} = {}) {
      let url;
      try {
        url = new URL(address.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch (_) {
        throw new Error('Enter a complete http:// or https:// playlist address.');
      }

      const request = new AbortController();
      let timedOut = false;
      const cancel = () => request.abort();
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, {once: true});
      const timeout = setTimeout(() => { timedOut = true; request.abort(); }, timeoutMs);
      try {
        request.signal.throwIfAborted();
        const response = await fetchImpl(url.href, {
          signal: request.signal,
          credentials: 'omit',
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Provider returned HTTP ' + response.status + '.');
        const text = await response.text();
        request.signal.throwIfAborted();
        if (text.length > MAX_PLAYLIST_LENGTH) throw new Error('Playlist is larger than 20 MB.');
        return {text, baseUrl: response.url || url.href};
      } catch (error) {
        if (timedOut) throw new Error('Request timed out. Check the address and connection.');
        if (request.signal.aborted) throw new DOMException('Playlist request cancelled.', 'AbortError');
        if (error instanceof TypeError) throw new Error('Could not load playlist. Check the link, connection and provider app access.');
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
      }
    }
  };
}
