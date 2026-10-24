import {paginateCatalog} from '../api/catalog.js';
import {selectCatalogView} from '../api/catalog-views.js';

const SCREENS = [
  ['live', 'Live TV'], ['movies', 'Movies'], ['shows', 'TV Shows'], ['sports', 'Sports'],
  ['guide', 'TV Guide'], ['my-list', 'My List'], ['recent', 'Recent']
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
  let screen = 'live', categoryKey = '', page = 0, parentKey = null, parentContext = null;
  const nav = document.querySelector('nav');
  const container = document.getElementById('channels');
  const title = document.querySelector('.section-title h2');
  const count = document.getElementById('count');
  const footer = document.querySelector('footer');
  const originalFooter = footer.innerHTML;
  document.getElementById('stage').classList.add('catalog-screens');
  nav.setAttribute('aria-label', 'Library screens'); nav.replaceChildren();
  const screenButtons = new Map();
  for (const [key, name] of SCREENS) {
    const button = document.createElement('button'); button.textContent = name; button.dataset.screen = key;
    button.onclick = () => { screen = key; categoryKey = ''; page = 0; parentKey = null; parentContext = null; render(); };
    screenButtons.set(key, button); nav.append(button);
  }
  nav.append(importButton);
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
    const article = document.createElement('article'); article.className = 'catalog-card';
    const button = document.createElement('button'); button.className = 'channel';
    button.dataset.itemKey = item.key; button.dataset.action = 'open';
    const logo = document.createElement('span'); logo.className = 'logo';
    logo.textContent = {channel: 'LIVE TV', movie: 'MOVIE', series: 'TV SHOW', episode: 'EPISODE', programme: 'TV GUIDE'}[item.kind];
    const name = document.createElement('strong'); name.textContent = item.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = item.kind === 'programme'
      ? (item.channelName || 'Channel not supplied') + ' · ' + scheduleText(item.record)
      : item.category.name + (item.kind === 'series' ? ' · View episodes' : !item.record.url ? ' · No stream supplied' : '');
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
  function render() {
    const oldFocus = document.activeElement;
    const oldKey = oldFocus?.dataset?.itemKey, oldAction = oldFocus?.dataset?.action;
    const state = store.getState(), saved = library.snapshot();
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
    if (state.status === 'loading') panel('Loading catalog...');
    else if (state.status === 'error') panel(state.error, 'Retry');
    else {
      let view = selectCatalogView(state.catalog, screen, {...saved, categoryKey, parentKey});
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
        panel(parentKey ? 'No episodes were supplied for this TV show.' : categoryKey ? 'No items match this category.' : stale ? 'Saved items are not available in this catalog.' : EMPTY[screen], 'Reload catalog');
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
    goBack, offerProviderCatalog: store.offerProviderCatalog,
    canUseProviderCatalog: false,
    restoreFocus(key) {
      ([...container.querySelectorAll('.channel')].find(button => button.dataset.itemKey === key) || screenButtons.get(screen)).focus();
    },
    reportUnsavedLink: () => { footer.textContent = 'Playlist link could not be saved.'; }
  };
}
