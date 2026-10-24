import {normalizeCatalog} from './catalog.js';

// Parse only metadata here. URL validation/defaults live in catalog.js.
export function parsePlaylist(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (/<(?:!doctype|html|head|body)(?:\s|>)/i.test(text.slice(0, 1024)))
    throw new Error('Provider returned a web page, not a playlist. Check the direct M3U download link and account access.');
  if (/^[{[]/.test(text.trim()))
    throw new Error('Provider returned JSON, not an M3U channel list. Check the direct playlist download link.');
  if (!lines.some(line => /^#EXT(?:M3U|INF:)/i.test(line.trim())))
    throw new Error('Response has no M3U header or channel entries. Check the complete playlist link.');
  if (lines.some(line => /^#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE):/.test(line.trim())))
    throw new Error('This is a single HLS stream, not a channel playlist.');

  const records = [];
  let info = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) { info = line; continue; }
    if (line.startsWith('#')) continue;
    const metadata = info; info = '';
    let quoted = false, comma = -1;
    for (let i = 0; i < metadata.length; i++) {
      if (metadata[i] === '"') quoted = !quoted;
      if (metadata[i] === ',' && !quoted) { comma = i; break; }
    }
    const group = /group-title="([^"]*)"/i.exec(metadata);
    const item = {
      name: comma >= 0 ? metadata.slice(comma + 1).trim() : '',
      group: group && group[1] || '',
      url: line
    };
    // Optional metadata stays optional; never derive EPG identifiers from names.
    const epgId = /tvg-id="([^"]*)"/i.exec(metadata);
    const logo = /tvg-logo="([^"]*)"/i.exec(metadata);
    if (epgId && epgId[1]) item.tvgId = epgId[1];
    if (logo && logo[1]) item.logo = logo[1];
    records.push(item);
  }
  return records;
}

// Retain the original parser API and normalized channel shape for callers.
export function parseM3U(text, baseUrl) {
  return normalizeCatalog(parsePlaylist(text), baseUrl);
}
