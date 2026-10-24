# TizenShow

Samsung TV web application for the user-specified Samsung M80H (2026),
UN65M80HAFXZA. The earlier Device Manager screenshot reported `tv-10.0`;
the supplied model group `26TV_PREMIUM2` and exact SDK release requirement
still need independent confirmation. The light TizenShow interface follows the supplied visual reference and
[VISUAL-DIRECTION.md](VISUAL-DIRECTION.md). It includes the ribbon-T brand, fixed
ten-destination sidebar, cinematic hero, vertical poster rows and blue focus highlights.
The logical layout remains 1920×1080 and scales to the display.

**Current catalog source: clearly labeled mock data only.** The seven catalog
screens are wired, but provider/import responses cannot replace mock data until
the real response schema has been safely verified and explicitly integrated.

## Project layout

```text
index.html                    TizenShow shell, hero, sidebar and module entry point
config.xml                    Existing widget identity, privileges and access policy
css/
  style.css                   Original interface and AVPlay overlay styles
  playlist.css                Original importer and paging styles
  provider.css                Connection dialog in the existing visual style
  catalog.css                 Catalog state/card behavior styles
  tizenshow.css               Approved light theme and TV layout
js/
  app.js                      Composition, viewport scaling and clock
  api/
    provider.js               Existing M3U URL connection
    laon.js                   Custom laon.live adapter and encoded account URL
    provider-response.js      Response detection and optional catalog/EPG models
    provider-errors.js        Safe errors, redaction and structured diagnostics
    playlist.js               M3U metadata parsing and provider-response errors
    catalog.js                URL normalization, groups, defaults and pagination
    catalog-views.js           Screen mapping, exact categories and opaque item references
    catalog-store.js           Mock loading/error/retry state and unverified-source gate
    demo-catalog.js           Existing demo channel definitions
  player/
    avplay.js                 Samsung AVPlay lifecycle and stale-callback protection
    controller.js             Player overlay, HTML video fallback and focus restoration
  ui/
    catalog.js                Seven screens, category selector, cards and paging
    library.js                Favorites and watched references in local storage
    playlist.js               Existing private-link import dialog
    provider-settings.js      Separate provider username/password screen
    remote.js                 Directional focus, OK defaults, Back and modal controls
    settings.js               Opt-in device-local playlist-address storage
assets/
  mock-catalog.json           Explicit mock channel/VOD/category/EPG metadata
  branding/ribbon-t.svg       Vector rendition of the supplied logo reference
  hero-landscape.svg          Original neutral hero placeholder
  README.md                   Asset and fixture notes
tests/                        Unit tests and browser integration tests
package.json                  Development commands; ES module configuration
package-lock.json             Reproducible development-tool dependencies
README.md
```

Browser modules use explicit relative ES imports, served through `index.html`.
The original Samsung `$WEBAPIS/webapis/webapis.js` script still loads before
app initialization. No bundler or application framework was introduced.

## Run locally

Use Node.js 24 (the validated cloud version) for development checks. There are
no runtime npm dependencies. For a browser demo, run `npm start` from the root
with Python 3 available, or open the folder with VS Code Live Server on Windows.
Serve over HTTP rather than opening `index.html` as a `file://` URL: ES modules
must load with JavaScript MIME types. A normal desktop browser has no AVPlay API
and uses the existing HTML video fallback.

Arrow keys navigate, Enter/OK selects, and Escape or Samsung Back closes the
player/import dialog; Back also returns from a show to its parent list.
Categories use a native select control. Left returns to the active sidebar
screen; Right enters the first content card. Up from a content card reaches its
My List action. Content uses three-item pages, retaining the existing card grid.
Input Left/Right remains available for editing connection details.

## Playlist connection and privacy

Enter a complete HTTP(S) M3U channel-list link in Import playlist. Fetching,
parsing, normalization, rendering and playback are separate modules; the UI no
longer replaces a global render function. Provider requests are direct, without
a relay, invented headers or automatic login. HTML login/error pages, JSON
responses and single-stream HLS manifests produce distinct messages. The
provider returning a web page instead of M3U remains an external compatibility
issue; this structural refactor does not claim to fix it.

Supported channel entries use HTTP(S). Relative stream URLs resolve against the
final playlist response URL. UDP/RTSP entries and pipe-suffixed header directives
are skipped. Existing limits remain 20 MB of playlist text and 20,000 supported
channels. Requests time out after 30 seconds; cancelling an import aborts its
request, and a late old response cannot replace a newer catalog.

Remember link is off by default. Opting in stores the address in device-local
`localStorage`, **not encrypted storage**; Forget saved link removes it. The
existing `streamtv-playlist-address` key is retained, so saved addresses do not
require migration. Parsed channels remain in memory. Keep private playlist URLs,
passwords and signing certificates out of source, screenshots and logs. Error
messages do not echo response bodies or connection URLs.

The existing widget access policy permits arbitrary provider/channel origins;
`config.xml` is unchanged in this refactor. Provider authentication, CORS, codec,
DRM and device restrictions can still prevent a particular stream from working.

## Checks

```sh
npm ci
npm run check
npm test
npm run test:browser
```

The syntax check covers every application module. Unit tests use Node's built-in
test runner and exercise provider errors/cancellation/timeouts, parsing,
normalization/pagination, opt-in settings, AVPlay callbacks, browser fallback and
remote focus scoring.

The browser suite uses Playwright and synthetic provider responses. It starts
and stops its own local server; it does not require a real playlist, TV, account,
or an already-running demo. It checks module/CSS loading, branding, remote
OK/Back, import/paging/groups, settings, provider-page errors, import cancellation
and the AVPlay integration with a mock API. It does not validate actual codecs
or physical TV playback. Tests fail rather than silently skip if required
browser tooling is missing.

The cloud environment has `/usr/bin/chromium`. Elsewhere, install Playwright's
Chromium with `npx playwright install chromium`, or set `CHROMIUM_PATH` to an
existing Chromium executable. On Windows PowerShell, for example:

```powershell
$env:CHROMIUM_PATH = 'C:\path\to\chrome.exe'
npm run test:browser
```

For the structural refactor, before adding Provider settings, home and import-
dialog screenshots were compared at 1920×1080 with the clock masked: they were
pixel-identical. The new Provider settings button is an intentional addition to
the import dialog. The subsequent seven-screen feature intentionally expands
the sidebar and adds a category selector and My List actions. Original CSS and
the widget manifest remain byte-identical; new CSS files scope the additions.

## Samsung TV build and validation

Use the current official VS Code Extension for Tizen with its Baseline SDK,
matching Samsung TV web tools and Samsung certificate support. The app currently
declares a Tizen 10.0 minimum. Do not install the retired
Eclipse-based Tizen Studio. Confirm exact model/SDK compatibility using Samsung's
current documentation before deployment. Enable official Developer Mode, select
the connected TV, select a Samsung signing profile containing its DUID, and use
Build Project / Run Project in the extension. The target artifact is a signed
Tizen Web Application (`.wgt`). Keep signing files outside this checkout.

Before this refactor, the user confirmed sample MP4 playback with picture/sound,
Back/reopen and both AVPlay/HTML video on their physical TV. The reorganized ES
module version has been tested in Chromium with AVPlay mocks, **not rebuilt,
signed or rerun on hardware**. After transferring this repository to the Windows
PC, rebuild and repeat the physical-TV checks, then test provider streams
separately. No rooting, firmware changes or undocumented system APIs are used.

## Migration notes

The former root `style.css` and `playlist.css` moved to `css/` unchanged. Root
`app.js` and `playlist.js` were split into the modules above; their redundant
monolithic copies were removed so the app has one bootstrap and no duplicate
event handlers. All references and parser-test imports were updated. No UI,
branding, assets, user media, certificates or widget settings were deleted.
A full pre-refactor source backup was retained outside the checkout at
`/tmp/streamtv-before-modular-refactor` in the onboarding machine; it is not a
portable substitute for version control. The cloud and Windows checkouts are
separate: changes here do not automatically update the Windows PC or TV.


## Custom laon.live provider adapter

Open **Import playlist → Provider settings**. Enter username and password in
separate inputs, then Connect. Neither field is hardcoded, persisted to settings,
or included in application logs. Successful connections clear both inputs;
failed attempts clear the password, and Back clears both fields. Provider
responses are currently inspection-only: Show channels remains disabled while
the application is in mock-only catalog mode. The seven browsing screens use
explicit mock records, never unverified live provider data. Unsupported and
metadata-only responses remain visible in the connection dialog. M3U import
similarly reports recognized counts without replacing the mock catalog; its
existing opt-in Remember link behavior is retained.

The adapter constructs exactly `https://laon.live/api/list/{username}/{password}`
using RFC3986-encoded path segments. It does not trim passwords, decode input,
query `player_api.php`, append Xtream actions, derive media URLs from IDs, or
assume a service-specific catalog schema. Standalone `.`/`..` credential segments
are rejected because browsers normalize even encoded dot segments. Invalid
Unicode and empty inputs fail before a request is sent.

All implementation and validation so far use **mock responses and synthetic
credentials**. No live provider request has been made and no real credentials
have been collected. The structures below are explicit, tested adapter contracts,
not a claim about what this provider actually returns. An unrecognized real
response requires a sanitized schema example before adding a new mapping.

| Response | Supported handling |
| --- | --- |
| M3U | Existing parser; HTTP(S) channel URLs, supplied names/group-title, optional tvg-id/tvg-logo and explicit url-tvg/x-tvg-url EPG sources. No movie/series inference from names, groups or file extensions. |
| JSON | Top-level explicit arrays named channels, movies, series, categories; optional epg array or object containing sources, programmes or channels. Unknown wrappers, root arrays and Xtream-shaped user_info/server_info payloads are unsupported. |
| XML catalog | A catalog root with channels/channel, movies/movie, series/show, categories/category or epg/programme children. Model fields are direct child elements; id may also be an attribute. Series episodes use episodes/episode. Unknown record tags are reported. |
| XMLTV | A tv root with supplied channel metadata and programme channel/start/stop/title/desc fields produces EPG models only, not invented playable channels. |
| Redirect | Visible 3xx and browser opaqueredirect responses are recognized and reported; destinations are not automatically followed. |
| HTML/empty/unknown/malformed data | Safe, explicit errors without echoing provider bodies. XML DTDs/entities are rejected before DOM parsing. |

Media records retain only supplied id, name/title, URL, category/category_id,
epg_id, description, year, logo/poster and episode data. Category models retain
supplied id/name/type; EPG programme models retain supplied channel_id/title/
start/end/description. Missing collections and fields remain absent. Relative
URLs resolve by standard URL rules, not a guessed provider path pattern. UI-only
fallback labels such as Other/Channel 1 do not become provider metadata.

Connections use verified HTTPS, no-store caching, omitted ambient cookies and
no-referrer requests. Redirects are manual so a browser cannot silently forward
a credential-bearing path to another destination. The adapter does not disable
TLS checks, spoof headers, add a CORS proxy, retry authentication, or bypass
provider security. HTTP 401, 403, 429 and other failures are distinct; explicit
authentication-failure fields in response data are also recognized. Browser
Fetch normally exposes TLS, CORS and connection failures as the same exception,
so NETWORK_TLS_CORS reports that ambiguity rather than guessing the cause.
Timeout and cancellation abort requests, including response-body reads.

Production diagnostics are off by default. An injected logger receives only
allowlisted event/code/format/status fields, never credentials, raw errors,
response bodies or URLs. A separate redaction helper removes URLs and raw/encoded
credential tokens from diagnostic text. Errors have no raw cause attached.
Developer Tools' network inspector can still show the actual requested URL;
application logging cannot hide a credential-in-path URL from browser/network
inspection. Do not share network captures containing it.

Tests cover URL encoding, response detection/normalization, redirects, auth,
HTTP/TLS/CORS/network failures, timeout/cancellation, error redaction, connection
settings and real browser DOMParser XML/XMLTV handling. Provider network requests
in browser tests are intercepted; they do not contact laon.live. Real account,
actual provider schema and physical-TV behavior remain unverified.


## Catalog screens and activity

The TizenShow light theme uses the exact requested sidebar order: Home, Live TV,
Movies, TV Shows, Sports, TV Guide, My List, Recent, Search and Settings. There is
one Sports destination. The supplied screenshot governs layout and branding; its
commercial titles and posters are not treated as catalog data. css/tizenshow.css
scopes the visual update while config.xml and the existing playback/provider
modules retain their behavior. Import playlist remains accessible from the
header connection icon and Settings.

| Screen | Normalized catalog mapping |
| --- | --- |
| Live TV | channels only |
| Movies | movies only; no guessing from stream extensions or channel titles |
| TV Shows | series only; opening a show lists only its actual episodes array |
| Sports | media with explicit sports=true, Sport/Sports genre labels, or a supplied category containing the Sport/Sports word; never title matching or guessed numeric category IDs |
| TV Guide | epg programme records only; channel names/streams link by actual channelId, not names. EPG source URLs alone do not fabricate a schedule. |
| My List | saved references resolved against the current catalog |
| Recent | started-playback references resolved against the current catalog, most recent first |

Categories resolve by categoryId plus entity type, or an explicitly supplied
category label. Filters compare category references rather than display names,
so a channel and movie category sharing an ID/name do not get mixed. No category
supplied and Untitled item are presentation fallbacks, not fabricated provider
metadata. Guide timestamps are displayed as supplied; this version does not
invent missing times, infer timestamp units/timezones or claim a programme is
currently on air. Missing collections, episodes, URLs and EPG records have
explicit empty/metadata-only states.

assets/mock-catalog.json deliberately labels its movie, series and guide
fixtures as mock data. Those fixtures include metadata but **no fabricated VOD
stream URLs**. The existing public sample video is reused for World Today; no
provider account is needed to browse mock screens. The sample remains subject
to external availability. Mock schedules are illustrative, not actual broadcast
listings. Missing VOD URLs show No stream URL was supplied rather than pretending
to play content. No movie/series placeholders are generated when a collection is
absent from the normalized catalog.

Mock data loads as a local widget asset with XMLHttpRequest (including packaged
resource status 0). The catalog store exposes loading, ready/empty and error
states, ignores obsolete loads, and retries the loader on Retry/Reload catalog.
It does not manufacture data after a failure. Tests inject failures and delayed
responses to exercise these states. Provider/import results are gated by
catalog-store.offerProviderCatalog and cannot change this source. Enabling a
real provider requires a safely sanitized response fixture, verified mappings
and tests, then a deliberate integration change to the trusted loader and
account-specific source scope; there is no user-facing bypass toggle.

My List and Recent use streamtv-library-v1 in localStorage. Stored data contains
versioned opaque item references and watched timestamps, not titles, raw stream
URLs, playlist URLs or account credentials. Identity includes source/entity and
provider ID when present; otherwise it fingerprints supplied item fields.
Episode references include their parent show. Fingerprints are noncryptographic
identity keys, not encryption. Current mock-only scope is mock-catalog-v1;
future real sources must use separate account/source scopes to avoid crossing
libraries between accounts. Missing/stale references are hidden rather than
reconstructed into invented content.

Favorites toggle on/off and are capped at 1,000; Recent is deduplicated and capped
at 50. AVPlay records activity only when its playback clock first advances past
zero; HTML video records it after the play promise succeeds. Failed preparation,
missing URLs and stale/closed callbacks do not create watched history. Back
restores the current card focus even if a library update rerendered it. Show
Back restores its parent page/filter. Blocked or corrupt local storage does not
crash browsing; writes fall back to session memory with a visible notice when
persistence is unavailable. There is no account synchronization.

Additional tests cover all seven mappings, absent collections, exact/category-
type filtering, metadata-only Sports, guide ID linkage, episode identity,
favorite/history persistence, stale references, playback start gating, source
verification gating and remote control of screens/cards/My List. The browser
suite checks loading/error/retry recovery, empty screens, show Back, and stored
activity across reload. Physical Samsung remote behavior, signed packaging and
local asset loading in an installed widget still need a hardware regression run.

Playback uses the existing Samsung runtime script and a session-guarded AVPlay adapter with prepare/start/buffering timeouts, stop/close cleanup and safe error messages. Opening another item switches sessions and ignores stale callbacks. `?player=mock` explicitly enables an offline AVPlay lifecycle simulation on desktop only; native Samsung AVPlay always takes precedence. The mock cannot establish media compatibility or populate Recent. See [PLAYBACK-CHECKLIST.md](PLAYBACK-CHECKLIST.md) for public sample URLs, physical TV checks and Windows resume steps. No private provider streams have been tested.

## Compatibility audit and packaging handoff

See [SAMSUNG-COMPATIBILITY-AUDIT.md](SAMSUNG-COMPATIBILITY-AUDIT.md) for target evidence, manifest/API/remote findings, test results and unresolved hardware checks. See [WINDOWS-TIZEN-BUILD.md](WINDOWS-TIZEN-BUILD.md) for current-tool build, certificate import, signing and `.wgt` review steps. Run `python3 scripts/audit-compatibility.py` to repeat structural manifest/import/asset checks. No Samsung SDK build or TV deployment was performed during the audit.


## Light TizenShow interface

Home is the initial screen. Its hero opens an actual supplied stream (currently
the public sample) and its Movies, TV Shows and Live TV rows contain only supplied
catalog records. See All opens the corresponding collection. Poster artwork uses
supplied HTTP(S) poster/logo URLs; absent or failed images retain neutral cards.
The bundled abstract landscape is original placeholder artwork, not a provider
backdrop. The ribbon-T SVG is a vector rendition of the supplied reference rather
than the original editable logo export. No commercial screenshot artwork, titles
or invented stream addresses were added to the catalog.

Search filters normalized titles, category names and descriptions, including
supplied episodes and guide programmes. It does not query a new provider API or
persist query text. Left/Right edit search text; Down enters results. Settings
opens the existing playlist/provider connection flow and exposes catalog reload
and status. Home/Back, show/episode return, favorite updates and player closure
restore focus. The initial Home view and all ten sidebar buttons fit the logical
1920×1080 TV viewport in desktop Chromium. Longer rows scroll with focus.

Validation for this UI update: JavaScript syntax checks, 83 unit tests, 19 browser
integration tests, and 41 structural manifest/import/asset checks passed. Browser
tests cover the new Home layout, sidebar order, SVG loading, poster orientation,
search editing, episode navigation and Settings connection controls alongside the
existing provider/playback tests. Actual Samsung remote input, packaged SVG/module
loading, signing and playback on the physical TV remain untested for this update.
The earlier compatibility audit is a historical snapshot; its hardware/API/network
limitations still apply. Use the updated source for the next build, not the older
ZIP or installed app.
