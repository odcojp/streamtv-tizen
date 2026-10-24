const PLAYLIST_ADDRESS_KEY = 'streamtv-playlist-address';

function defaultStorage() {
  try { return globalThis.localStorage; } catch (_) { return null; }
}

export function createSettings(storage = defaultStorage()) {
  return {
    readPlaylistAddress() {
      try { return storage?.getItem(PLAYLIST_ADDRESS_KEY) || ''; }
      catch (_) { return ''; }
    },
    savePlaylistAddress(address, remember) {
      try {
        if (!storage) return false;
        if (remember) storage.setItem(PLAYLIST_ADDRESS_KEY, address);
        else storage.removeItem(PLAYLIST_ADDRESS_KEY);
        return true;
      } catch (_) { return false; }
    },
    forgetPlaylistAddress() {
      try {
        if (!storage) return false;
        storage.removeItem(PLAYLIST_ADDRESS_KEY);
        return true;
      } catch (_) { return false; }
    }
  };
}
