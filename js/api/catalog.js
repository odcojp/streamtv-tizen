// Normalize provider metadata once; rendering and playback share this shape.
export function normalizeCatalog(entries, baseUrl) {
  const channels = [];
  for (const entry of entries) {
    try {
      if (entry.url.includes('|')) continue;
      const url = new URL(entry.url, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      channels.push({
        name: entry.name || 'Channel ' + (channels.length + 1),
        category: entry.group || 'Other',
        url: url.href
      });
    } catch (_) { continue; }
    if (channels.length > 20000) throw new Error('Playlist exceeds the 20,000 channel limit.');
  }
  if (!channels.length) throw new Error('No supported HTTP or HTTPS channels were found.');
  return channels;
}

export function paginateCatalog(channels, {group = null, page = 0, pageSize = 3} = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('Page size must be a positive integer.');
  const selected = channels.filter(channel => group === null || channel.category === group);
  const pages = Math.max(1, Math.ceil(selected.length / pageSize));
  const currentPage = Math.max(0, Math.min(Number.isFinite(page) ? Math.trunc(page) : 0, pages - 1));
  return {
    channels: selected.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    total: selected.length,
    pages,
    page: currentPage
  };
}
