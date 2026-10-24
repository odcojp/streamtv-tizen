const STORAGE_KEY = 'streamtv-library-v1';
const REFERENCE = /^v1:[0-9a-f]{16}:(?:channel|movie|series|episode):[0-9a-f]{16}$/;
function defaultStorage() { try { return globalThis.localStorage; } catch (_) { return null; } }

export function createLibrary({storage = defaultStorage(), now = () => Date.now()} = {}) {
  let favorites = [], recent = [], persistent = !!storage;
  const listeners = new Set();
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (value?.version === 1) {
      favorites = [...new Set((Array.isArray(value.favorites) ? value.favorites : []).filter(key => typeof key === 'string' && REFERENCE.test(key)))].slice(0, 1000);
      const seen = new Set();
      recent = (Array.isArray(value.recent) ? value.recent : []).filter(entry => {
        if (!entry || !REFERENCE.test(entry.key) || !Number.isFinite(entry.watchedAt) || entry.watchedAt < 0 || seen.has(entry.key)) return false;
        seen.add(entry.key); return true;
      }).slice(0, 50).map(({key, watchedAt}) => ({key, watchedAt}));
    }
  } catch (_) { persistent = false; }
  function save() {
    try {
      if (!storage) throw new Error();
      storage.setItem(STORAGE_KEY, JSON.stringify({version: 1, favorites, recent})); persistent = true;
    } catch (_) { persistent = false; }
    listeners.forEach(listener => listener());
  }
  return {
    snapshot: () => ({favorites: [...favorites], recent: recent.map(entry => ({...entry})), persistent}),
    isFavorite: key => favorites.includes(key),
    toggleFavorite(key) {
      if (!REFERENCE.test(key)) return false;
      if (favorites.includes(key)) favorites = favorites.filter(value => value !== key);
      else { if (favorites.length >= 1000) return false; favorites.push(key); }
      save(); return true;
    },
    recordPlayed(key) {
      if (!REFERENCE.test(key)) return;
      recent = [{key, watchedAt: now()}, ...recent.filter(entry => entry.key !== key)].slice(0, 50); save();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
