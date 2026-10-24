import {parsePlaylist} from './playlist.js';
import {ProviderAdapterError} from './provider-errors.js';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = value => (typeof value === 'string' && value.length) || (typeof value === 'number' && Number.isFinite(value));

export function detectProviderResponse(text, contentType = '') {
  const body = text.replace(/^\uFEFF/, '').trim();
  if (!body) return 'empty';
  const markup = body.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/^(?:<!--[\s\S]*?-->\s*)+/, '');
  if (/^(?:<!doctype\s+html\b|<(?:html|head|body|form|div|script|title|meta|p|h[1-6]|section|main|a|table)\b)/i.test(markup)) return 'html';
  if (/^#EXT(?:M3U|INF:)/im.test(body)) return 'm3u';
  if (/^[{[]/.test(body)) return 'json';
  if (markup.startsWith('<')) return 'xml';
  if (/json/i.test(contentType)) return 'json';
  if (/xml/i.test(contentType)) return 'xml';
  if (/html/i.test(contentType)) return 'html';
  return 'unknown';
}

function fail(code, message, format) { throw new ProviderAdapterError(code, message, format); }

function httpUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim() || /[|<>"\u0000-\u001F]/.test(value)) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch (_) { /* Unsupported URL; never include it in diagnostics. */ }
  return undefined;
}

function copyField(target, key, source, ...names) {
  for (const name of names) {
    if (scalar(source[name])) { target[key] = source[name]; return; }
  }
}

function mediaItem(item, baseUrl, requireUrl = false, allowEpisodes = true) {
  if (!record(item)) return null;
  const model = {};
  for (const key of ['id', 'description', 'year', 'season', 'episode', 'genre']) copyField(model, key, item, key);
  if (typeof item.sports === 'boolean') model.sports = item.sports;
  if (Array.isArray(item.genres)) model.genres = item.genres.filter(genre => typeof genre === 'string');
  copyField(model, 'name', item, 'name', 'title');
  copyField(model, 'categoryId', item, 'categoryId', 'category_id');
  copyField(model, 'category', item, 'category', 'group');
  copyField(model, 'epgId', item, 'epgId', 'epg_id', 'tvgId');
  for (const key of ['url', 'logo', 'poster']) {
    const value = httpUrl(item[key], baseUrl);
    if (value) model[key] = value;
  }
  if (allowEpisodes && Array.isArray(item.episodes)) model.episodes = item.episodes.map(episode => mediaItem(episode, baseUrl, false, false)).filter(Boolean);
  if (requireUrl && !model.url) return null;
  return Object.keys(model).length ? model : null;
}

function categoryItem(item) {
  if (!record(item)) return null;
  const model = {};
  copyField(model, 'id', item, 'id'); copyField(model, 'name', item, 'name', 'title');
  if (['channel', 'movie', 'series'].includes(item.type)) model.type = item.type;
  return Object.keys(model).length ? model : null;
}

function programmeItem(item) {
  if (!record(item)) return null;
  const model = {};
  copyField(model, 'channelId', item, 'channelId', 'channel_id');
  copyField(model, 'title', item, 'title', 'name');
  for (const key of ['id', 'start', 'end', 'description']) copyField(model, key, item, key);
  return Object.keys(model).length ? model : null;
}

function normalizeEpg(value, baseUrl) {
  if (Array.isArray(value)) return value.map(programmeItem).filter(Boolean);
  if (!record(value)) fail('UNSUPPORTED_EPG', 'EPG data has an unsupported structure.');
  const epg = {};
  if (Array.isArray(value.sources)) epg.sources = value.sources.map(source => {
    const url = httpUrl(source?.url, baseUrl);
    return url ? {url, ...(typeof source.format === 'string' ? {format: source.format} : {})} : null;
  }).filter(Boolean);
  if (Array.isArray(value.programmes)) epg.programmes = value.programmes.map(programmeItem).filter(Boolean);
  if (Array.isArray(value.channels)) epg.channels = value.channels.map(item => {
    if (!record(item)) return null;
    const channel = {}; copyField(channel, 'id', item, 'id'); copyField(channel, 'name', item, 'name');
    return Object.keys(channel).length ? channel : null;
  }).filter(Boolean);
  if (!Object.keys(epg).length) fail('UNSUPPORTED_EPG', 'EPG data has an unsupported structure.');
  return epg;
}

function checkProviderError(value, format) {
  if (!record(value)) return;
  const authCode = record(value.error) ? value.error.code : value.code || value.error;
  if ([false, 0, '0'].includes(value.auth) || value.authenticated === false ||
      /^(?:invalid_credentials|authentication_failed|auth_failed|unauthorized)$/i.test(String(authCode)) ||
      /^(?:unauthorized|authentication_failed)$/i.test(String(value.status)))
    fail('AUTHENTICATION_FAILED', 'Provider rejected authentication. Check your account details.', format);
  if (value.error || value.success === false || value.status === 'error')
    fail('PROVIDER_ERROR', 'Provider returned an error response. Check account access with the provider.', format);
}

function structuredCatalog(value, baseUrl, format) {
  checkProviderError(value, format);
  if (!record(value)) fail('UNSUPPORTED_SCHEMA', 'Recognized ' + format.toUpperCase() + ', but its catalog structure is unsupported.', format);
  const catalog = {}, warnings = [];
  for (const key of ['channels', 'movies', 'series', 'categories']) {
    if (!own(value, key)) continue;
    if (!Array.isArray(value[key])) fail('UNSUPPORTED_SCHEMA', 'Catalog collections must be explicit arrays.', format);
    catalog[key] = value[key].map(item => key === 'categories' ? categoryItem(item) : mediaItem(item, baseUrl)).filter(Boolean);
    if (catalog[key].length < value[key].length) warnings.push('Some ' + key + ' records were unsupported and skipped.');
    if (catalog[key].length > 20000) fail('CATALOG_TOO_LARGE', 'Catalog exceeds the 20,000 item collection limit.', format);
  }
  if (own(value, 'epg')) catalog.epg = normalizeEpg(value.epg, baseUrl);
  if (!Object.keys(catalog).length)
    fail('UNSUPPORTED_SCHEMA', 'Recognized ' + format.toUpperCase() + ', but its catalog structure is unsupported.', format);
  if (['channels', 'movies'].some(key => catalog[key]?.some(item => !item.url)))
    warnings.push('Some catalog items provide metadata without a supported playback URL.');
  return {format, catalog, warnings};
}

function m3uCatalog(text, baseUrl) {
  let records;
  try { records = parsePlaylist(text); }
  catch (_) { fail('UNSUPPORTED_M3U', 'M3U data is malformed or is a single HLS stream rather than a channel list.', 'm3u'); }
  const channels = records.map(item => mediaItem(item, baseUrl, true)).filter(Boolean);
  if (!channels.length) fail('UNSUPPORTED_M3U', 'M3U contains no supported HTTP or HTTPS channels.', 'm3u');
  if (channels.length > 20000) fail('CATALOG_TOO_LARGE', 'Playlist exceeds the 20,000 channel limit.', 'm3u');
  const catalog = {channels};
  const groups = [...new Set(records.map(item => item.group).filter(Boolean))];
  if (groups.length) catalog.categories = groups.map(name => ({name}));
  const epg = /(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(text.split(/\r?\n/).find(line => /^#EXTM3U/i.test(line.trim())) || '');
  const epgUrl = epg && httpUrl(epg[1], baseUrl);
  if (epgUrl) catalog.epg = {sources: [{url: epgUrl}]};
  return {format: 'm3u', catalog, warnings: channels.length < records.length ? ['Some unsupported stream entries were skipped.'] : []};
}

function children(element) { return [...element.childNodes].filter(node => node.nodeType === 1); }
function child(element, name) { return children(element).find(node => node.localName === name); }
function textOf(element, name) { return child(element, name)?.textContent?.trim(); }

function xmlRecord(element) {
  const item = {};
  if (element.hasAttribute('id')) item.id = element.getAttribute('id');
  for (const field of children(element)) {
    if (field.localName === 'episodes') item.episodes = children(field).filter(node => node.localName === 'episode').map(xmlRecord);
    else item[field.localName] = field.textContent.trim();
  }
  return item;
}

function xmlCatalog(text, baseUrl, DOMParserImpl) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('UNSUPPORTED_XML', 'XML declarations with DTDs or entities are not supported.', 'xml');
  if (!DOMParserImpl) fail('XML_UNAVAILABLE', 'XML parsing is unavailable in this runtime.', 'xml');
  let document;
  try { document = new DOMParserImpl().parseFromString(text, 'application/xml'); }
  catch (_) { fail('MALFORMED_XML', 'Provider returned malformed XML.', 'xml'); }
  if (!document.documentElement || document.getElementsByTagName('parsererror').length)
    fail('MALFORMED_XML', 'Provider returned malformed XML.', 'xml');
  const root = document.documentElement;
  if (root.localName.toLowerCase() === 'error') {
    const error = xmlRecord(root);
    checkProviderError({error: {code: error.code || error.Code}}, 'xml');
  }
  if (root.localName === 'tv') {
    const nodes = children(root), epg = {};
    const channels = nodes.filter(node => node.localName === 'channel').map(node => {
      const result = {};
      if (node.hasAttribute('id')) result.id = node.getAttribute('id');
      const name = textOf(node, 'display-name'); if (name) result.name = name;
      return result;
    });
    const programmes = nodes.filter(node => node.localName === 'programme').map(node => {
      const result = {};
      for (const [attribute, key] of [['channel', 'channelId'], ['start', 'start'], ['stop', 'end']])
        if (node.hasAttribute(attribute)) result[key] = node.getAttribute(attribute);
      const title = textOf(node, 'title'); if (title) result.title = title;
      const description = textOf(node, 'desc'); if (description) result.description = description;
      return result;
    });
    if (nodes.some(node => node.localName === 'channel')) epg.channels = channels;
    if (nodes.some(node => node.localName === 'programme')) epg.programmes = programmes;
    if (!Object.keys(epg).length) fail('UNSUPPORTED_XML', 'XMLTV contains no supported EPG fields.', 'xml');
    return {format: 'xml', catalog: {epg}, warnings: []};
  }
  if (root.localName !== 'catalog') fail('UNSUPPORTED_XML', 'Recognized XML, but its schema is unsupported.', 'xml');
  const data = {};
  for (const [key, tag] of [['channels', 'channel'], ['movies', 'movie'], ['series', 'show'], ['categories', 'category'], ['epg', 'programme']]) {
    const container = child(root, key);
    if (container) {
      const items = children(container);
      if (items.some(node => node.localName !== tag))
        fail('UNSUPPORTED_XML', 'XML catalog contains unsupported record elements.', 'xml');
      data[key] = items.map(xmlRecord);
    }
  }
  return structuredCatalog(data, baseUrl, 'xml');
}

export function normalizeProviderResponse(text, {format = detectProviderResponse(text), baseUrl, DOMParserImpl = globalThis.DOMParser} = {}) {
  if (format === 'm3u') return m3uCatalog(text, baseUrl);
  if (format === 'json') {
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '').trim()); }
    catch (_) { fail('MALFORMED_JSON', 'Provider returned malformed JSON.', 'json'); }
    return structuredCatalog(data, baseUrl, 'json');
  }
  if (format === 'xml') return xmlCatalog(text, baseUrl, DOMParserImpl);
  if (format === 'html') fail('HTML_PAGE', 'Provider returned a web page, possibly a login or security challenge. Direct API data is required.', 'html');
  if (format === 'empty') fail('EMPTY_RESPONSE', 'Provider returned an empty response.', 'empty');
  fail('UNSUPPORTED_FORMAT', 'Provider returned an unsupported response format.', format);
}

// Display defaults belong at the UI boundary, not in provider metadata models.
export function toPlayableChannels(catalog) {
  return (catalog.channels || []).filter(channel => channel.url).map((channel, index) => ({
    name: channel.name || 'Channel ' + (index + 1),
    url: channel.url,
    category: channel.category || (catalog.categories || []).find(category =>
      channel.categoryId !== undefined && category.id !== undefined && String(category.id) === String(channel.categoryId)
    )?.name || 'Other'
  }));
}
