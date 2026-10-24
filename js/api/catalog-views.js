// These are application references, never provider metadata or playback URLs.
// Two independent 32-bit hashes reduce accidental collisions; not encryption.
function fingerprint(value) {
  let first = 2166136261, second = 5381;
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return [first, second].map(number => (number >>> 0).toString(16).padStart(8, '0')).join('');
}

export function itemReference(sourceId, kind, item, parentKey = '') {
  const identity = item.id !== undefined ? ['id', item.id] : ['fields', item.url || '', item.name || '', item.season ?? '', item.episode ?? ''];
  return 'v1:' + fingerprint(sourceId) + ':' + kind + ':' + fingerprint(JSON.stringify([parentKey, identity]));
}

function categoryFor(record, kind, categories) {
  const definition = categories.find(category => record.categoryId !== undefined && category.id !== undefined &&
    String(category.id) === String(record.categoryId) && (!category.type || category.type === kind));
  const name = typeof record.category === 'string' && record.category ? record.category : definition?.name;
  if (!name) return {key: 'uncategorized', name: 'No category supplied'};
  return {key: 'category:' + fingerprint(JSON.stringify([kind, definition?.id ?? null, name])), name};
}

export function isSportsMetadata(record, categoryName) {
  const genres = [record.genre, ...(Array.isArray(record.genres) ? record.genres : []), categoryName];
  return record.sports === true || genres.some(value => typeof value === 'string' && /\bsports?\b/i.test(value));
}

export function mapCatalog(catalog, {sourceId = 'mock-catalog-v1'} = {}) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Catalog is unavailable.');
  for (const key of ['channels', 'movies', 'series', 'categories'])
    if (catalog[key] !== undefined && !Array.isArray(catalog[key])) throw new Error('Catalog collection is invalid.');
  const categories = (catalog.categories || []).filter(item => item && typeof item === 'object' && !Array.isArray(item)), items = [], episodes = [];
  for (const [collection, kind] of [['channels', 'channel'], ['movies', 'movie'], ['series', 'series']]) {
    for (const record of catalog[collection] || []) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      const category = categoryFor(record, kind, categories);
      const item = {key: itemReference(sourceId, kind, record), kind, record, category,
        name: record.name || 'Untitled item', sports: isSportsMetadata(record, category.name)};
      items.push(item);
      if (kind === 'series' && Array.isArray(record.episodes)) for (const episode of record.episodes) {
        if (!episode || typeof episode !== 'object' || Array.isArray(episode)) continue;
        episodes.push({key: itemReference(sourceId, 'episode', episode, item.key), kind: 'episode', record: episode,
          parentKey: item.key, category, name: episode.name || 'Untitled episode', sports: item.sports});
      }
    }
  }
  const channelsById = new Map(items.filter(item => item.kind === 'channel' && item.record.id !== undefined).map(item => [String(item.record.id), item]));
  const epg = catalog.epg;
  const programmes = Array.isArray(epg) ? epg : Array.isArray(epg?.programmes) ? epg.programmes : [];
  const epgChannels = Array.isArray(epg?.channels) ? epg.channels : [];
  const guide = programmes.filter(record => record && typeof record === 'object' && !Array.isArray(record)).map((record, index) => {
    const channel = record.channelId !== undefined ? channelsById.get(String(record.channelId)) : undefined;
    const metadata = epgChannels.find(item => record.channelId !== undefined && item.id !== undefined && String(item.id) === String(record.channelId));
    return {key: 'guide:' + fingerprint(JSON.stringify([sourceId, record.id ?? null, record.channelId ?? null, record.start ?? null, record.title ?? null, index])),
      kind: 'programme', record, channel, channelName: channel?.record.name || metadata?.name,
      name: record.title || 'Untitled programme', category: channel?.category || {key: 'uncategorized', name: 'No category supplied'}};
  });
  return {items, episodes, guide, byKey: new Map([...items, ...episodes].map(item => [item.key, item]))};
}

export function filterByCategory(items, categoryKey = '') {
  return categoryKey ? items.filter(item => item.category.key === categoryKey) : items;
}

export function selectCatalogView(mapped, screen, {favorites = [], recent = [], categoryKey = '', parentKey = null} = {}) {
  let items;
  if (parentKey) items = mapped.episodes.filter(item => item.parentKey === parentKey);
  else if (screen === 'live') items = mapped.items.filter(item => item.kind === 'channel');
  else if (screen === 'movies') items = mapped.items.filter(item => item.kind === 'movie');
  else if (screen === 'shows') items = mapped.items.filter(item => item.kind === 'series');
  else if (screen === 'sports') items = mapped.items.filter(item => item.sports);
  else if (screen === 'guide') items = mapped.guide;
  else if (screen === 'my-list') items = favorites.map(key => mapped.byKey.get(key)).filter(Boolean);
  else if (screen === 'recent') items = recent.map(entry => mapped.byKey.get(entry.key)).filter(Boolean);
  else items = [];
  const options = [...new Map(items.map(item => [item.category.key, item.category])).values()];
  return {items: filterByCategory(items, categoryKey), categories: options};
}
