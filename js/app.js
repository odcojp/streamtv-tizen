import {createMockAVPlay} from './player/mock-avplay.js';
import {createProviderConnection} from './api/provider.js';
import {createPlayerController} from './player/controller.js';
import {createCatalogUI} from './ui/catalog.js';
import {createPlaylistUI} from './ui/playlist.js';
import {createRemoteNavigation} from './ui/remote.js';
import {createSettings} from './ui/settings.js';
import {createProviderAdapter} from './api/laon.js';
import {createProviderSettingsUI} from './ui/provider-settings.js';
import {mapCatalog} from './api/catalog-views.js';
import {createCatalogStore, createMockCatalogLoader} from './api/catalog-store.js';
import {createLibrary} from './ui/library.js';

const library = createLibrary();
const store = createCatalogStore({loader: createMockCatalogLoader(), map: data => mapCatalog(data, {sourceId: 'mock-catalog-v1'})});
let catalog;
const nativeAVPlay = window.webapis && window.webapis.avplay;
const playbackEngine = nativeAVPlay || (new URLSearchParams(location.search).get('player') === 'mock' ? createMockAVPlay() : null);
const player = createPlayerController({document, avplay: playbackEngine,
  onStarted: item => { if (item?.libraryKey) library.recordPlayed(item.libraryKey); },
  onRestoreFocus: key => catalog?.restoreFocus(key)});
const importButton = document.createElement('button');
importButton.textContent = 'Import playlist';
catalog = createCatalogUI({document, store, library, onPlay: player.open, importButton});
const connection = createProviderSettingsUI({document, adapter: createProviderAdapter(), onChannels: () => {}, canUseCatalog: catalog.canUseProviderCatalog});
const playlist = createPlaylistUI({document, importButton, provider: createProviderConnection(), settings: createSettings(), catalog, onOpenProviderSettings: connection.open});
createRemoteNavigation({document, player, playlist, connection, catalog, importButton});

function resize() { document.getElementById('stage').style.transform = 'scale(' + Math.min(innerWidth / 1920, innerHeight / 1080) + ')'; }
window.addEventListener('resize', resize); resize();
function clock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
clock(); setInterval(clock, 30000);
document.querySelector('nav button').focus();
store.load();

window.addEventListener('pagehide', () => player.close());
document.addEventListener('visibilitychange', () => { if (document.hidden && player.isOpen()) player.close(); });
