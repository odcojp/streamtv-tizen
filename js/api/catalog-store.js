export function createMockCatalogLoader({XMLHttpRequestImpl = globalThis.XMLHttpRequest,
  url = new URL('../../assets/mock-catalog.json', import.meta.url).href} = {}) {
  return () => new Promise((resolve, reject) => {
    const request = new XMLHttpRequestImpl();
    request.open('GET', url, true);
    request.timeout = 10000;
    const fail = () => reject(new Error('Mock catalog could not be loaded.'));
    request.onerror = fail; request.ontimeout = fail;
    request.onload = () => {
      // Packaged widget resources can have status 0; require a non-empty body.
      if (!((request.status >= 200 && request.status < 300) || request.status === 0) || !request.responseText) { fail(); return; }
      try { resolve(JSON.parse(request.responseText)); } catch (_) { fail(); }
    };
    request.send();
  });
}

export function createCatalogStore({loader, map}) {
  let state = {status: 'loading', catalog: null, error: null}, generation = 0;
  const listeners = new Set();
  const publish = () => listeners.forEach(listener => listener(state));
  async function load() {
    const current = ++generation;
    state = {status: 'loading', catalog: null, error: null}; publish();
    try {
      const catalog = map(await loader());
      if (current !== generation) return;
      state = {status: 'ready', catalog, error: null};
    } catch (_) {
      if (current !== generation) return;
      state = {status: 'error', catalog: null, error: 'Catalog could not be loaded. Please retry.'};
    }
    publish();
  }
  return {
    load, retry: load, getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    // No real response schema has been verified yet. Only the mock loader owns data.
    offerProviderCatalog() { return {accepted: false, message: 'Mock catalog remains active until this provider response is safely verified.'}; }
  };
}
