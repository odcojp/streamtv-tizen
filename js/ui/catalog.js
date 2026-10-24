import {paginateCatalog} from '../api/catalog.js';
import {selectCatalogView, searchCatalog} from '../api/catalog-views.js';

const SCREENS = [
  ['home', 'Home'], ['live', 'Live TV'], ['movies', 'Movies'], ['shows', 'TV Shows'], ['sports', 'Sports'],
  ['guide', 'TV Guide'], ['my-list', 'My List'], ['recent', 'Recent'], ['search', 'Search'], ['settings', 'Settings']
];
const EMPTY = {
  live: 'No live channels were supplied.', movies: 'No movies were supplied.',
  shows: 'No TV shows were supplied.', sports: 'No sports categories or metadata were supplied.',
  guide: 'No programme schedule was supplied.',
  'my-list': 'Your list is empty. Save an item with + My List.',
  recent: 'Nothing watched yet. Items appear after playback starts.'
};

function scheduleText(record) {
  return [record.start !== undefined ? 'Start: ' + record.start : 'Start time not supplied',
    record.end !== undefined ? 'End: ' + record.end : ''].filter(Boolean).join(' · ');
}

export function createCatalogUI({document, store, library, onPlay, importButton}) {
  let screen = 'home', categoryKey = '', page = 0, parentKey = null, parentContext = null;
  const nav = document.querySelector('nav');
  const container = document.getElementById('channels');
  const title = document.querySelector('.section-title h2');
  const count = document.getElementById('count');
  const footer = document.querySelector('footer');
  const originalFooter = footer.innerHTML;
  const stage = document.getElementById('stage');
  const hero = document.querySelector('.hero');
  const searchTools = document.getElementById('search-tools');
  const searchInput = document.getElementById('catalog-search');
  let query = '';
  searchInput.oninput = () => { query = searchInput.value; page = 0; render(); };
  function showScreen(key) {
    if (!SCREENS.some(([screenKey]) => screenKey === key)) return;
    screen = key; categoryKey = ''; page = 0; parentKey = null; parentContext = null;
    document.getElementById('content-area').scrollTop = 0;
    render();
  }
  const icons = {
    home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
    live: 'M3 7h18v14H3zM8 3l4 4 4-4M7 17h3',
    movies: 'M3 9h18v12H3zM3 9V5l18-3v5ZM7 4l3 4m5-5 3 4',
    shows: 'M3 4h18v15H3zM8 22h8', sports: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5 5 4-2 6H9l-2-6Zm0-5v5M2 12l5-1m10 0 5 1M6 20l3-3m6 0 3 3',
    guide: 'M3 5h18v17H3zM7 2v6m10-6v6M3 11h18M7 15h2m6 0h2m-10 4h2',
    'my-list': 'm12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z',
    recent: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4v7l5 2',
    search: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6 14 6 6',
    settings: 'm9 3 1-2h4l1 2 3 2 3 1v4l-2 2-1 3 1 3-3 2-3-1-3 1-3-2 1-3-2-3-2-2V6l3-1Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'
  };
  document.getElementById('stage').classList.add('catalog-screens');
  nav.setAttribute('aria-label', 'Library screens'); nav.replaceChildren();
  const screenButtons = new Map();
  for (const [key, name] of SCREENS) {
    const button = document.createElement('button'); button.textContent = name; button.dataset.screen = key;
    const icon = document.createElement('span'); icon.className = 'nav-icon'; icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + icons[key] + '"/></svg>';
    button.prepend(icon);
    button.onclick = () => showScreen(key);
    screenButtons.set(key, button); nav.append(button);
  }
  importButton.setAttribute('aria-label', 'Import playlist'); importButton.title = 'Connect a playlist'; importButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg>';
  document.getElementById('connection-action').append(importButton);
  document.getElementById('open-search').onclick = () => { showScreen('search'); searchInput.focus(); };
  document.getElementById('open-settings').onclick = () => { showScreen('settings'); screenButtons.get('settings').focus(); };
  document.querySelector('aside small').innerHTML = 'MOCK CATALOG<br>Sample data · No provider feed active';
  const group = document.createElement('select'); group.id = 'playlist-group';
  group.setAttribute('aria-label', 'Category');
  group.onchange = () => { categoryKey = group.value; page = 0; render(); };
  count.before(group);
  const back = document.createElement('button'); back.textContent = 'Back to TV Shows'; back.className = 'catalog-back'; back.hidden = true;
  back.onclick = () => goBack(); group.before(back);
  const paging = document.createElement('div'); paging.className = 'playlist-paging'; paging.hidden = true;
  const previous = document.createElement('button'); previous.textContent = 'Previous';
  const next = document.createElement('button'); next.textContent = 'Next';
  const pageLabel = document.createElement('span');
  paging.append(previous, pageLabel, next); container.after(paging);
  previous.onclick = () => { page--; render(); container.querySelector('.channel')?.focus(); };
  next.onclick = () => { page++; render(); container.querySelector('.channel')?.focus(); };

  function goBack() {
    if (!parentKey) return false;
    const parent = parentKey; parentKey = null;
    categoryKey = parentContext?.categoryKey || ''; page = parentContext?.page || 0; parentContext = null; render();
    [...container.querySelectorAll('.channel')].find(button => button.dataset.itemKey === parent)?.focus();
    return true;
  }
  function open(item) {
    if (item.kind === 'series') {
      parentContext = {categoryKey, page}; parentKey = item.key; categoryKey = ''; page = 0; render(); back.focus(); return;
    }
    if (item.kind === 'programme') {
      if (item.channel?.record.url) onPlay({...item.channel.record, name: item.channel.name, libraryKey: item.channel.key, catalogItem: true});
      else onPlay({name: item.name, description: [item.channelName, scheduleText(item.record), item.record.description].filter(Boolean).join(' · '), catalogItem: true});
      return;
    }
    onPlay({...item.record, name: item.name, libraryKey: item.key, catalogItem: true});
  }
  function card(item) {
    const article = document.createElement('article'); article.className = 'catalog-card'; article.dataset.kind = item.kind;
    const button = document.createElement('button'); button.className = 'channel';
    button.dataset.itemKey = item.key; button.dataset.action = 'open';
    const logo = document.createElement('span'); logo.className = 'logo';
    logo.textContent = {channel: 'LIVE TV', movie: 'MOVIE', series: 'TV SHOW', episode: 'EPISODE', programme: 'TV GUIDE'}[item.kind];
    const name = document.createElement('strong'); name.textContent = item.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = item.kind === 'programme'
      ? (item.channelName || 'Channel not supplied') + ' · ' + scheduleText(item.record)
      : item.category.name + (item.kind === 'series' ? ' · View episodes' : !item.record.url ? ' · No stream supplied' : '');
    const artwork = item.record.poster || item.record.logo;
    if (typeof artwork === 'string' && /^https?:\/\//i.test(artwork)) {
      const image = document.createElement('img'); image.className = 'poster-image'; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { image.remove(); article.classList.remove('has-artwork'); };
      image.src = artwork; article.classList.add('has-artwork'); button.append(image);
    }
    button.append(logo, name, subtitle); button.onclick = () => open(item); article.append(button);
    if (item.kind !== 'programme') {
      const favorite = document.createElement('button'); favorite.className = 'favorite-button';
      favorite.dataset.itemKey = item.key; favorite.dataset.action = 'favorite';
      const saved = library.isFavorite(item.key);
      favorite.textContent = saved ? 'Saved' : '+ My List';
      favorite.setAttribute('aria-pressed', String(saved));
      favorite.setAttribute('aria-label', (saved ? 'Remove ' : 'Add ') + item.name + (saved ? ' from My List' : ' to My List'));
      favorite.onclick = () => { if (!library.toggleFavorite(item.key)) footer.textContent = 'My List is full. Remove an item before adding another.'; };
      article.append(favorite);
    }
    return article;
  }
  function panel(text, retryLabel) {
    const panel = document.createElement('div'); panel.className = 'catalog-state'; panel.setAttribute('role', 'status');
    const description = document.createElement('p'); description.textContent = text; panel.append(description);
    if (retryLabel) {
      const retry = document.createElement('button'); retry.textContent = retryLabel;
      retry.onclick = () => { screenButtons.get(screen).focus(); store.retry(); }; panel.append(retry);
    }
    container.replaceChildren(panel);
  }
  function renderHero(catalog) {
    const featured = catalog?.items.find(item => item.record.url) || catalog?.items[0];
    document.getElementById('hero-title').textContent = featured ? featured.name : 'Welcome to TizenShow';
    document.getElementById('hero-meta').textContent = featured ? featured.category.name + ' · Demo catalog' : 'Your collection, on the big screen.';
    document.getElementById('hero-description').textContent = featured?.record.description || (featured?.record.url ? 'Try the public sample, then explore your collection with your remote.' : 'Connect your provider when you are ready. Only supplied catalog data appears here.');
    const play = document.getElementById('hero-play'); play.disabled = !featured?.record.url;
    play.onclick = () => { if (featured?.record.url) open(featured); };
    document.getElementById('hero-info').onclick = () => {
      document.getElementById('hero-description').textContent = featured?.record.description || 'Mock catalog preview. Artwork, availability and playback depend on the supplied catalog; no private feed is active.';
    };
  }
  function renderHome(catalog) {
    container.replaceChildren();
    for (const [key, label, kind] of [['movies', 'Movies', 'movie'], ['shows', 'TV Shows', 'series'], ['live', 'Live TV', 'channel']]) {
      const section = document.createElement('section'); section.className = 'home-row'; section.setAttribute('aria-label', label + ' row');
      const heading = document.createElement('div'); heading.className = 'home-row-heading';
      const name = document.createElement('h2'); name.textContent = label;
      const more = document.createElement('button'); more.className = 'see-all'; more.textContent = 'See All ›'; more.setAttribute('aria-label', 'See all ' + label);
      more.onclick = () => { showScreen(key); (container.querySelector('.channel') || screenButtons.get(key)).focus(); };
      heading.append(name, more); section.append(heading);
      const items = catalog.items.filter(item => item.kind === kind).slice(0, 12);
      if (items.length) {
        const row = document.createElement('div'); row.className = 'home-strip' + (kind === 'channel' ? ' live-strip' : '');
        row.append(...items.map(card)); section.append(row);
      } else {
        const empty = document.createElement('p'); empty.className = 'row-empty'; empty.textContent = EMPTY[key]; section.append(empty);
      }
      container.append(section);
    }
  }
  function renderSettings(state) {
    const section = document.createElement('div'); section.className = 'settings-panel';
    const heading = document.createElement('h3'); heading.textContent = 'Your connection';
    const text = document.createElement('p'); text.textContent = 'Demo catalog is active. Enter your own playlist or open provider settings to inspect an authorized response. Unverified responses do not replace the demo catalog.';
    const connect = document.createElement('button'); connect.textContent = 'Manage playlist and provider'; connect.onclick = () => importButton.click();
    const reload = document.createElement('button'); reload.textContent = state.status === 'loading' ? 'Loading catalog…' : 'Reload catalog'; reload.disabled = state.status === 'loading'; reload.onclick = () => store.retry();
    const privacy = document.createElement('p'); privacy.textContent = 'My List and Recent stay on this device. Provider passwords are not saved. Remembered playlist links are stored locally only when you opt in.';
    const stateLabel = document.createElement('p'); stateLabel.setAttribute('role', 'status'); stateLabel.textContent = state.status === 'error' ? state.error : state.status === 'loading' ? 'Loading catalog…' : 'Demo catalog loaded. No private provider feed is active.';
    section.append(heading, text, connect, reload, stateLabel, privacy); container.replaceChildren(section);
  }
  function render() {
    const oldFocus = document.activeElement;
    const oldKey = oldFocus?.dataset?.itemKey, oldAction = oldFocus?.dataset?.action;
    const state = store.getState(), saved = library.snapshot();
    stage.classList.toggle('home-view', screen === 'home');
    stage.classList.toggle('poster-mode', ['movies', 'shows'].includes(screen));
    stage.dataset.screen = screen;
    hero.hidden = screen !== 'home'; searchTools.hidden = screen !== 'search';
    renderHero(state.catalog);
    screenButtons.forEach((button, key) => {
      button.classList.toggle('active', key === screen); button.setAttribute('aria-current', key === screen ? 'page' : 'false');
    });
    const parent = parentKey && state.catalog?.byKey.get(parentKey);
    title.textContent = parent ? parent.name : SCREENS.find(([key]) => key === screen)[1];
    back.hidden = !parentKey;
    back.textContent = 'Back to ' + SCREENS.find(([key]) => key === screen)[1];
    footer.innerHTML = originalFooter;
    if (!saved.persistent) footer.textContent = 'My List and Recent are available for this session; local storage is unavailable.';
    paging.hidden = true; group.hidden = true; count.textContent = '';
    container.setAttribute('aria-busy', String(state.status === 'loading'));
    if (screen === 'settings') renderSettings(state);
    else if (state.status === 'loading') panel('Loading catalog...');
    else if (state.status === 'error') panel(state.error, 'Retry');
    else if (screen === 'home') renderHome(state.catalog);
    else {
      let view = selectCatalogView(state.catalog, screen, {...saved, categoryKey, parentKey});
      if (screen === 'search' && !parentKey) view = {items: searchCatalog(state.catalog, query), categories: []};
      if (categoryKey && !view.categories.some(category => category.key === categoryKey)) {
        categoryKey = ''; page = 0; view = selectCatalogView(state.catalog, screen, {...saved, parentKey});
      }
      group.replaceChildren();
      const all = document.createElement('option'); all.value = ''; all.textContent = 'All categories'; group.append(all);
      for (const category of view.categories) {
        const option = document.createElement('option'); option.value = category.key; option.textContent = category.name; group.append(option);
      }
      group.value = categoryKey; group.hidden = view.categories.length === 0;
      if (!view.items.length) {
        const stale = screen === 'my-list' ? saved.favorites.length : screen === 'recent' ? saved.recent.length : 0;
        panel(parentKey ? 'No episodes were supplied for this TV show.' : categoryKey ? 'No items match this category.' : stale ? 'Saved items are not available in this catalog.' : screen === 'search' ? (query.trim() ? 'No items match your search.' : 'Enter a title, category or description to search.') : EMPTY[screen], 'Reload catalog');
        count.textContent = '0 items';
      } else {
        const result = paginateCatalog(view.items, {page}); page = result.page;
        container.replaceChildren(...result.channels.map(card));
        count.textContent = result.total + (result.total === 1 ? ' item' : ' items');
        paging.hidden = result.pages <= 1;
        previous.disabled = page === 0; next.disabled = page === result.pages - 1;
        pageLabel.textContent = (page + 1) + ' / ' + result.pages;
      }
    }
    if (oldFocus && !oldFocus.isConnected) {
      const match = [...container.querySelectorAll('button')].find(button => button.dataset.itemKey === oldKey && button.dataset.action === oldAction);
      (match || container.querySelector('.channel') || screenButtons.get(screen)).focus();
    }
  }
  store.subscribe(render); library.subscribe(render); render();
  return {
    goBack, showScreen, offerProviderCatalog: store.offerProviderCatalog,
    canUseProviderCatalog: false,
    restoreFocus(key) {
      ([...container.querySelectorAll('.channel')].find(button => button.dataset.itemKey === key) || screenButtons.get(screen)).focus();
    },
    reportUnsavedLink: () => { footer.textContent = 'Playlist link could not be saved.'; }
  };
}
