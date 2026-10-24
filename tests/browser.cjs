// Optional browser integration suite. Uses synthetic provider responses only.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const {existsSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, origin;
const playlist = '#EXTM3U\n' + Array.from({length: 7}, (_, i) =>
  `#EXTINF:-1 group-title="${i < 4 ? 'News' : 'Nature'}",Channel ${i + 1}\nhttps://example.org/live/${i}.m3u8`
).join('\n');

before(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const body = await fs.readFile(filename);
      const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'}[path.extname(filename)] || 'application/octet-stream';
      response.writeHead(200, {'Content-Type': type}); response.end(body);
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox']});
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function newPage(t, init, setup) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const badAssets = [];
  page.on('response', response => {
    if (response.url().startsWith(origin + '/js/') || response.url().startsWith(origin + '/css/')) {
      if (!response.ok()) badAssets.push(response.url());
    }
  });
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); assert.deepEqual(badAssets, []); });
  if (init) await page.addInitScript(init);
  if (setup) await setup(page);
  await page.goto(origin);
  await page.getByRole('button', {name: 'Import playlist', exact: true}).waitFor();
  await page.locator('#channels[aria-busy="false"]').waitFor();
  await page.getByRole('button', {name: 'Live TV', exact: true}).click();
  await page.route('https://example.org/list.m3u', route => route.fulfill({
    status: 200, contentType: 'text/plain', headers: {'access-control-allow-origin': '*'}, body: playlist
  }));
  return page;
}
async function importList(page, url = 'https://example.org/list.m3u', remember = false) {
  await page.getByRole('button', {name: 'Import playlist', exact: true}).click();
  await page.locator('#playlist-url').fill(url);
  if (remember) await page.locator('#playlist-remember').check();
  await page.getByRole('button', {name: 'Load channels', exact: true}).click();
}

test('light TizenShow retains screen/category and remote OK/Back navigation', async t => {
  const page = await newPage(t);
  assert.equal(await page.title(), 'TizenShow');
  assert.equal(await page.locator('header strong').textContent(), 'TizenShow');
  assert.equal(await page.locator('.channel').count(), 3);
  assert.equal(await page.locator('#count').textContent(), '4 items');
  for (const name of ['Live TV','Movies','TV Shows','Sports','TV Guide','My List','Recent'])
    assert.equal(await page.getByRole('button', {name, exact: true}).count(), 1);
  await page.locator('#playlist-group').selectOption({label: 'Nature'});
  assert.equal(await page.locator('.channel').count(), 1);
  await page.locator('.channel').focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText: 'No stream URL was supplied'}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#player').isHidden(), true);
  assert.equal(await page.locator('.channel').evaluate(element => element === document.activeElement), true);
});

test('mock paging/category controls work and imports remain preview-only with opt-in link settings', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Next', exact: true}).click();
  assert.match(await page.locator('.channel').first().textContent(), /Mock Sports Preview/);
  await page.locator('#playlist-group').selectOption({label: 'Nature'});
  assert.equal(await page.locator('#count').textContent(), '1 item');
  await importList(page);
  await page.locator('#playlist-message').filter({hasText: 'Recognized 7 channels'}).waitFor();
  assert.match(await page.locator('#playlist-message').textContent(), /Mock catalog remains active/);
  assert.equal(await page.evaluate(() => localStorage.getItem('streamtv-playlist-address')), null);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#count').textContent(), '1 item');
  await importList(page, 'https://example.org/list.m3u', true);
  await page.locator('#playlist-message').filter({hasText: 'Recognized 7 channels'}).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('streamtv-playlist-address')), 'https://example.org/list.m3u');
  await page.getByRole('button', {name: 'Forget saved link', exact: true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('streamtv-playlist-address')), null);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Movies', exact: true}).click();
  await page.getByRole('button', {name: 'Live TV', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '4 items');
});

test('provider web pages produce a safe error and preserve the current catalog', async t => {
  const page = await newPage(t);
  await page.route('https://example.org/login', route => route.fulfill({
    status: 200, headers: {'access-control-allow-origin': '*'}, body: '<html>Private account details</html>'
  }));
  await importList(page, 'https://example.org/login');
  await page.locator('#playlist-message').filter({hasText: 'Provider returned a web page'}).waitFor();
  assert.equal((await page.locator('#playlist-message').textContent()).includes('Private account'), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.channel').count(), 3);
});

test('late cancelled requests cannot replace a newer playlist or unlock its form', async t => {
  const page = await newPage(t);
  let releaseFirst, releaseSecond;
  let firstStarted, secondStarted;
  const first = new Promise(resolve => { firstStarted = resolve; });
  const second = new Promise(resolve => { secondStarted = resolve; });
  await page.route('https://example.org/slow-one', async route => {
    firstStarted(); await new Promise(resolve => { releaseFirst = resolve; });
    await route.fulfill({status: 200, headers: {'access-control-allow-origin': '*'}, body: playlist}).catch(() => {});
  });
  await page.route('https://example.org/slow-two', async route => {
    secondStarted(); await new Promise(resolve => { releaseSecond = resolve; });
    await route.fulfill({status: 200, headers: {'access-control-allow-origin': '*'}, body: playlist});
  });
  await importList(page, 'https://example.org/slow-one'); await first;
  await page.keyboard.press('Escape');
  await importList(page, 'https://example.org/slow-two'); await second;
  releaseFirst();
  assert.equal(await page.getByRole('button', {name: 'Load channels', exact: true}).isDisabled(), true);
  releaseSecond();
  await page.locator('#playlist-message').filter({hasText: 'Recognized 7 channels'}).waitFor();
  assert.equal(await page.locator('#count').textContent(), '4 items');
});

test('AVPlay module prepares, closes on Back and ignores callbacks from an older session', async t => {
  const page = await newPage(t, () => {
    window.__avplay = {pending: [], plays: 0, opens: []};
    window.webapis = {avplay: {
      stop() {}, close() {}, open(url) { window.__avplay.opens.push(url); },
      setDisplayRect() {}, setListener() {},
      prepareAsync(ready, error) { window.__avplay.pending.push({ready, error}); },
      play() { window.__avplay.plays++; }
    }};
  });
  await page.locator('.channel').first().click();
  await page.evaluate(() => window.__avplay.pending[0].ready());
  assert.equal(await page.locator('#status').textContent(), 'Playing with Samsung AVPlay');
  await page.keyboard.press('Escape');
  await page.locator('.channel').first().click();
  await page.evaluate(() => { window.__avplay.pending[0].ready(); window.__avplay.pending[0].error(); });
  assert.equal(await page.evaluate(() => window.__avplay.plays), 1);
  assert.equal(await page.locator('#status').textContent(), 'Loading sample video...');
  await page.evaluate(() => window.__avplay.pending[1].ready());
  assert.equal(await page.evaluate(() => window.__avplay.plays), 2);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#player').isHidden(), true);
});

async function openProviderSettings(page, mode = 'account') {
  await page.getByRole('button', {name: 'Import playlist', exact: true}).click();
  await page.getByRole('button', {name: 'Provider settings', exact: true}).click();
  if (mode === 'account') await page.getByRole('button', {name: 'Use username and password', exact: true}).click();
  await page.locator(mode === 'account' ? '#provider-username' : '#provider-link').waitFor();
}

test('custom provider settings use separate fields, encoded credentials and existing channel UI', async t => {
  const page = await newPage(t);
  let requests = 0;
  await page.route('https://laon.live/api/list/**', route => {
    requests++;
    assert.equal(route.request().url(), 'https://laon.live/api/list/mock%2Fuser/mock%3Fpass%23');
    assert.equal(route.request().headers().referer, undefined);
    return route.fulfill({status: 200, headers: {'access-control-allow-origin': '*'}, body: '#EXTM3U\n#EXTINF:-1 group-title="Mock Group",Mock Provider Channel\nhttps://example.org/mock.m3u8'});
  });
  await openProviderSettings(page);
  assert.equal(await page.locator('#provider-password').getAttribute('type'), 'password');
  await page.locator('#provider-username').fill('mock/user');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#provider-password').evaluate(element => element === document.activeElement), true);
  await page.locator('#provider-password').fill('mock?pass#');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#provider-password').evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.locator('#provider-message').filter({hasText: 'Received M3U: 1 channels'}).waitFor();
  assert.equal(requests, 1);
  assert.equal(await page.locator('#provider-password').inputValue(), '');
  assert.equal(await page.locator('#provider-username').inputValue(), '');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
  assert.equal(await page.getByRole('button', {name: 'Show channels', exact: true}).isDisabled(), true);
  assert.match(await page.locator('#provider-message').textContent(), /Mock catalog remains active/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#provider-dialog').isHidden(), true);
  assert.equal(await page.locator('.channel strong').first().textContent(), 'World Today');
  assert.equal(await page.locator('#count').textContent(), '4 items');
  assert.equal(await page.locator('header strong').textContent(), 'TizenShow');
});

test('provider authentication errors are safe, retryable and clear the password', async t => {
  const page = await newPage(t);
  await page.route('https://laon.live/api/list/**', route => route.fulfill({status: 401, headers: {'access-control-allow-origin': '*'}, body: 'mock-secret error body'}));
  await openProviderSettings(page);
  await page.locator('#provider-username').fill('mock-user');
  await page.locator('#provider-password').fill('mock-secret');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.locator('#provider-message').filter({hasText: 'Provider rejected authentication'}).waitFor();
  assert.equal((await page.locator('#provider-message').textContent()).includes('mock-secret'), false);
  assert.equal(await page.locator('#provider-password').inputValue(), '');
  assert.equal(await page.getByRole('button', {name: 'Connect', exact: true}).isEnabled(), true);
  assert.equal(await page.getByRole('button', {name: 'Show channels', exact: true}).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#provider-dialog').isHidden(), true);
  assert.equal(await page.locator('#provider-username').inputValue(), '');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
});

test('provider metadata-only JSON is reported without inventing playable live channels', async t => {
  const page = await newPage(t);
  await page.route('https://laon.live/api/list/**', route => route.fulfill({status: 200, headers: {'access-control-allow-origin': '*'}, body: JSON.stringify({movies: [{title: 'Mock Film'}], series: [{title: 'Mock Series'}]})}));
  await openProviderSettings(page);
  await page.locator('#provider-username').fill('mock-user');
  await page.locator('#provider-password').fill('mock-password');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.locator('#provider-message').filter({hasText: 'Received JSON: 1 movies, 1 series'}).waitFor();
  assert.match(await page.locator('#provider-message').textContent(), /No playable live channels/);
  assert.equal(await page.getByRole('button', {name: 'Show channels', exact: true}).isDisabled(), true);
});

test('browser adapter recognizes an opaque redirect and does not follow its destination', async t => {
  const page = await newPage(t);
  let followed = false;
  await page.route('https://example.org/redirect-destination', route => { followed = true; return route.abort(); });
  await page.route('https://laon.live/api/list/**', route => route.fulfill({status: 302, headers: {'access-control-allow-origin': '*', location: 'https://example.org/redirect-destination'}}));
  await openProviderSettings(page);
  await page.locator('#provider-username').fill('mock-user');
  await page.locator('#provider-password').fill('mock-password');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.locator('#provider-message').filter({hasText: 'Redirects are not followed automatically'}).waitFor();
  assert.equal(followed, false);
});

test('XML catalog parsing uses the browser DOMParser and only supplied model fields', async t => {
  const page = await newPage(t);
  const result = await page.evaluate(async () => {
    const {normalizeProviderResponse} = await import('/js/api/provider-response.js');
    return normalizeProviderResponse('<catalog><channels><channel id="c"><name>Mock News</name><url>https://example.org/live</url><category_id>n</category_id></channel></channels><movies><movie><title>Mock Film</title><url>https://example.org/film.mp4</url></movie></movies><series><show><title>Mock Show</title><episodes><episode><title>Pilot</title><url>https://example.org/pilot.mp4</url></episode></episodes></show></series><categories><category id="n"><name>News</name></category></categories><epg><programme><channel_id>c</channel_id><title>Mock Programme</title><start>20260101000000 +0000</start></programme></epg></catalog>', {baseUrl: 'https://example.org/api/list/mock/mock'});
  });
  assert.equal(result.format, 'xml');
  assert.deepEqual(result.catalog.channels[0], {id: 'c', name: 'Mock News', categoryId: 'n', url: 'https://example.org/live'});
  assert.equal(result.catalog.movies[0].name, 'Mock Film');
  assert.equal(result.catalog.series[0].episodes[0].name, 'Pilot');
  assert.equal(result.catalog.categories[0].id, 'n');
  assert.equal(result.catalog.epg[0].channelId, 'c');
  assert.equal(result.catalog.epg[0].end, undefined);
});

test('XMLTV is EPG metadata rather than fabricated playback channels; XML errors are explicit', async t => {
  const page = await newPage(t);
  const result = await page.evaluate(async () => {
    const {normalizeProviderResponse} = await import('/js/api/provider-response.js');
    const output = normalizeProviderResponse('<tv><channel id="c"><display-name>Mock &amp; News</display-name></channel><programme channel="c" start="20260101000000 +0000" stop="20260101010000 +0000"><title>Mock programme</title></programme></tv>');
    const errors = [];
    for (const text of ['<catalog><channels></catalog>', '<rss/>', '<Error><Code>AccessDenied</Code><Message>mock-private</Message></Error>', '<error><code>INVALID_CREDENTIALS</code></error>', '<catalog><channels><unknown/></channels></catalog>']) {
      try { normalizeProviderResponse(text); }
      catch (error) { errors.push({code: error.code, message: error.message}); }
    }
    return {output, errors};
  });
  assert.deepEqual(Object.keys(result.output.catalog), ['epg']);
  assert.equal(result.output.catalog.epg.channels[0].name, 'Mock & News');
  assert.equal(result.output.catalog.epg.programmes[0].end, '20260101010000 +0000');
  assert.deepEqual(result.errors.map(error => error.code), ['MALFORMED_XML', 'UNSUPPORTED_XML', 'PROVIDER_ERROR', 'AUTHENTICATION_FAILED', 'UNSUPPORTED_XML']);
  assert.equal(JSON.stringify(result.errors).includes('mock-private'), false);
});

test('Movies, shows/episodes, Sports and Guide use supplied fixture records and category filters', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Movies', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '2 items');
  await page.locator('#playlist-group').selectOption({label: 'Drama'});
  assert.equal(await page.locator('#count').textContent(), '1 item');
  assert.match(await page.locator('.channel strong').textContent(), /Long Weekend/);
  await page.locator('.channel').click();
  await page.locator('#status').filter({hasText: 'No stream URL was supplied'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'TV Shows', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '2 items');
  await page.locator('.channel').first().click();
  assert.equal(await page.locator('.channel strong').textContent(), 'Mock Episode: First Light');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#count').textContent(), '2 items');
  await page.locator('#playlist-group').selectOption({label: 'Drama'});
  await page.locator('.channel').click();
  await page.getByRole('status').filter({hasText: 'No episodes were supplied'}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#playlist-group option:checked').textContent(), 'Drama');
  assert.equal(await page.locator('.channel strong').textContent(), 'Mock Show: City Stories');
  await page.getByRole('button', {name: 'Sports', exact: true}).click();
  assert.equal(await page.locator('.channel strong').textContent(), 'Mock Sports Preview');
  await page.getByRole('button', {name: 'TV Guide', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '2 items');
  assert.match(await page.locator('.channel').first().textContent(), /Mock Bulletin/);
  assert.match(await page.locator('.channel').first().textContent(), /2026-10-23T12:00:00Z/);
});

test('My List persists references across reload and removal leaves valid remote focus', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Movies', exact: true}).click();
  await page.getByRole('button', {name: 'Add Mock Film: Open Horizons to My List', exact: true}).click();
  await page.getByRole('button', {name: 'My List', exact: true}).click();
  assert.equal(await page.locator('.channel strong').textContent(), 'Mock Film: Open Horizons');
  const stored = await page.evaluate(() => localStorage.getItem('streamtv-library-v1'));
  assert.equal(stored.includes('https://'), false); assert.equal(stored.includes('Open Horizons'), false);
  await page.reload(); await page.locator('#channels[aria-busy="false"]').waitFor();
  await page.getByRole('button', {name: 'My List', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '1 item');
  await page.getByRole('button', {name: 'Remove Mock Film: Open Horizons from My List', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Your list is empty'}).waitFor();
  assert.equal(await page.getByRole('button', {name: 'My List', exact: true}).evaluate(element => element === document.activeElement), true);
});

test('Recent records only started AVPlay playback, deduplicates, persists and restores focus after Back', async t => {
  const page = await newPage(t, () => {
    window.__historyAV = {pending: [], listeners: []};
    window.webapis = {avplay: {
      stop() {}, close() {}, open() {}, setDisplayRect() {}, play() {},
      setListener(value) { window.__historyAV.listeners.push(value); },
      prepareAsync(ready, error) { window.__historyAV.pending.push({ready, error}); }
    }};
  });
  await page.locator('.channel').first().click();
  await page.evaluate(() => window.__historyAV.pending[0].error());
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Recent', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Nothing watched yet'}).waitFor();
  await page.getByRole('button', {name: 'Live TV', exact: true}).click();
  await page.locator('.channel').first().click();
  await page.evaluate(() => window.__historyAV.pending[1].ready());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('streamtv-library-v1') || '{}').recent?.length || 0), 0);
  await page.evaluate(() => { window.__historyAV.listeners[1].oncurrentplaytime(1); window.__historyAV.listeners[1].oncurrentplaytime(2000); });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.channel').first().evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', {name: 'Recent', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '1 item');
  assert.equal(await page.locator('.channel strong').textContent(), 'World Today');
  await page.reload(); await page.locator('#channels[aria-busy="false"]').waitFor();
  await page.getByRole('button', {name: 'Recent', exact: true}).click();
  assert.equal(await page.locator('#count').textContent(), '1 item');
});

test('catalog load error, loading and Retry states recover across screen navigation', async t => {
  let attempts = 0, release, started;
  const retryStarted = new Promise(resolve => { started = resolve; });
  const fixture = await fs.readFile(path.join(root, 'assets/mock-catalog.json'), 'utf8');
  const page = await newPage(t, undefined, async page => {
    await page.route('**/assets/mock-catalog.json', async route => {
      if (++attempts === 1) return route.fulfill({status: 503});
      await new Promise(resolve => { release = resolve; started(); });
      return route.fulfill({status: 200, contentType: 'application/json', body: fixture});
    });
  });
  await page.getByRole('status').filter({hasText: 'Catalog could not be loaded'}).waitFor();
  await page.getByRole('button', {name: 'Movies', exact: true}).click();
  await page.getByRole('button', {name: 'Retry', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Loading catalog'}).waitFor();
  await page.getByRole('button', {name: 'TV Shows', exact: true}).click();
  await retryStarted; release();
  await page.locator('#channels[aria-busy="false"]').waitFor();
  assert.equal(attempts, 2); assert.equal(await page.locator('#count').textContent(), '2 items');
  assert.equal(await page.locator('.section-title h2').textContent(), 'TV Shows');
});

test('missing collections produce meaningful empty screens, not invented movie/show/guide records', async t => {
  const page = await newPage(t, undefined, async page => {
    await page.route('**/assets/mock-catalog.json', route => route.fulfill({status: 200, contentType: 'application/json', body: '{"channels":[]}'}));
  });
  for (const [screen, text] of [['Live TV','No live channels'], ['Movies','No movies'], ['TV Shows','No TV shows'], ['Sports','No sports categories'], ['TV Guide','No programme schedule'], ['My List','Your list is empty'], ['Recent','Nothing watched yet']]) {
    await page.getByRole('button', {name: screen, exact: true}).click();
    await page.getByRole('status').filter({hasText: text}).waitFor();
    assert.equal(await page.locator('.channel').count(), 0);
    assert.equal(await page.getByRole('button', {name: 'Reload catalog', exact: true}).isVisible(), true);
  }
});

test('Samsung-style arrows/OK reach screens, primary cards, favorites and the active sidebar', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Live TV', exact: true}).focus();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.section-title h2').textContent(), 'Movies');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.channel').first().evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.getByRole('button', {name: 'Add Mock Film: Open Horizons to My List', exact: true}).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('button', {name: 'Remove Mock Film: Open Horizons from My List', exact: true}).getAttribute('aria-pressed'), 'true');
  await page.locator('.channel').first().focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('button', {name: 'Movies', exact: true}).evaluate(element => element === document.activeElement), true);
});


test('TizenShow Home follows the light reference and exposes exactly ten remote sidebar destinations', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Home', exact: true}).click();
  const labels = await page.locator('nav button').allTextContents();
  assert.deepEqual(labels, ['Home','Live TV','Movies','TV Shows','Sports','TV Guide','My List','Recent','Search','Settings']);
  assert.equal(await page.locator('.hero').isVisible(), true);
  assert.equal(await page.locator('.home-row').count(), 3);
  assert.equal(await page.locator('.home-row').nth(0).locator('.catalog-card').count(), 2);
  assert.equal(await page.locator('.home-row').nth(1).locator('.catalog-card').count(), 2);
  assert.equal(await page.locator('.home-row').nth(2).locator('.catalog-card').count(), 4);
  assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(244, 246, 250)');
  assert.equal(await page.locator('header .brand img').evaluate(image => image.complete && image.naturalWidth > 0), true);
  const poster = await page.locator('.home-row').first().locator('.channel').first().boundingBox();
  assert.ok(poster.height > poster.width);
  const rail = await page.locator('aside').boundingBox();
  const last = await page.getByRole('button', {name: 'Settings', exact: true}).boundingBox();
  assert.ok(last.y + last.height <= 1080 && rail.x === 0);
  const lastCard = await page.locator('.live-strip .channel').last().boundingBox();
  assert.ok(lastCard.y + lastCard.height <= 1062, 'all Home rows fit in the logical TV viewport');
  await page.getByRole('button', {name: 'Home', exact: true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#hero-play').evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', {name: 'Home', exact: true}).focus();
  await page.screenshot({path: '/tmp/tizenshow-home-light.png'});
  await page.getByRole('button', {name: 'See all Movies', exact: true}).click();
  assert.equal(await page.locator('.section-title h2').textContent(), 'Movies');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#stage').getAttribute('data-screen'), 'home');
});

test('Search filters supplied metadata without leaving text editing and Settings opens existing connection flows', async t => {
  const page = await newPage(t);
  await page.getByRole('button', {name: 'Search', exact: true}).focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#catalog-search').evaluate(element => element === document.activeElement), true);
  await page.locator('#catalog-search').fill('Field Notes');
  assert.equal(await page.locator('.channel').count(), 1);
  assert.match(await page.locator('.channel').textContent(), /Field Notes/);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#catalog-search').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.match(await page.locator('.channel').textContent(), /First Light/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#count').textContent(), '1 item');
  await page.locator('#catalog-search').fill('no matching supplied record');
  await page.getByRole('status').filter({hasText: 'No items match your search'}).waitFor();
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  await page.getByRole('button', {name: 'Manage playlist and provider', exact: true}).click();
  assert.equal(await page.locator('#playlist-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', {name: 'Manage playlist and provider', exact: true}).evaluate(element => element === document.activeElement), true);
});


test('provider link mode sends one encoded endpoint, handles JSON and clears the private link', async t => {
  const page = await newPage(t); let requests = 0;
  await page.route('https://laon.live/api/list/**', route => {
    requests++; assert.equal(route.request().url(), 'https://laon.live/api/list/mock%2Fuser/mock%3Fpass%23');
    return route.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify({channels:[{name:'Mock Link Channel',url:'https://example.org/live.m3u8'}]})});
  });
  await openProviderSettings(page, 'link');
  assert.equal(await page.locator('#provider-link').getAttribute('type'), 'password');
  await page.locator('#provider-link').fill('https://laon.live/api/list/mock%2Fuser/mock%3Fpass%23');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#provider-link').evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', {name:'Connect',exact:true}).click();
  await page.locator('#provider-message').filter({hasText:'Received JSON: 1 channels'}).waitFor();
  assert.equal(requests,1); assert.equal(await page.locator('#provider-link').inputValue(),'');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)),[]);
  assert.equal(await page.getByRole('button',{name:'Show channels',exact:true}).isDisabled(),true);
});

test('a full link pasted in the old username field switches safely and HTML remains a provider error', async t => {
  const page = await newPage(t); let requests = 0;
  await page.route('https://laon.live/api/list/**', route => {
    requests++; assert.equal(route.request().url(),'https://laon.live/api/list/mock-user/mock-secret');
    return route.fulfill({status:200,contentType:'text/html',headers:{'access-control-allow-origin':'*'},body:'<html>private mock-secret response</html>'});
  });
  await openProviderSettings(page);
  await page.locator('#provider-username').fill('https://laon.live/api/list/mock-user/mock-secret');
  assert.equal(await page.locator('#provider-link').isVisible(),true);
  assert.equal(await page.locator('#provider-username').inputValue(),'');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.locator('#provider-message').filter({hasText:'Provider returned a web page'}).waitFor();
  assert.equal(requests,1);
  assert.ok(!(await page.locator('#provider-message').textContent()).includes('mock-secret'));
  assert.equal(await page.locator('#provider-link').inputValue(),'');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)),[]);
  assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).isEnabled(),true);
});

test('Import playlist routes confirmed provider links to provider mode without fetching or saving them', async t => {
  const page = await newPage(t); let requests = 0;
  await page.route('https://laon.live/**', route => { requests++; return route.abort(); });
  await importList(page,'https://laon.live/api/list/mock-user/mock-secret',true);
  await page.locator('#provider-link').waitFor();
  assert.equal(await page.locator('#provider-link').inputValue(),'https://laon.live/api/list/mock-user/mock-secret');
  assert.equal(requests,0); assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)),[]);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#provider-link').inputValue(),'');
});
