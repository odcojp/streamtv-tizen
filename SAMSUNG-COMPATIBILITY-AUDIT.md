# Samsung Smart TV compatibility audit

Scope: current cloud source, preserving StreamTV branding (TizenShow is the proposed project name). This is a source and desktop-test audit, not Samsung certification. No package was built, signed, installed or tested on a TV during this audit. No private provider was contacted.

## Target evidence and unresolved requirements

| Item | Evidence | Conclusion |
| --- | --- | --- |
| Exact model | User-supplied UN65M80HAFXZA; earlier Device Manager screenshot displays that model | Target identifier recorded; no new hardware interrogation performed |
| Marketing series/year | User describes Samsung M80H, 2026 | Not independently verified against Samsung's product database |
| Tizen version | Earlier user-supplied Device Manager screenshot displays `tv-10.0` | Evidence for that device's reported platform at that time; not inferred from the marketing year and not a fresh firmware check |
| Model group | User-supplied `26TV_PREMIUM2` | Not independently verified |
| SDK requirement | Manifest declares `required_version="10.0"`; user previously installed TV 10.0 tools | App currently requires platform 10.0 or later. This does not establish Samsung's exact minimum/current TV Extension release for the model |

Attempts to retrieve the following official references returned proxy tunnel HTTP 403 in this environment. Consequently this audit cannot certify the current model table, engine version, minimum extension release or tool distribution status from a live official source:

- https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html
- https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html
- https://samsungtizenos.com/docs/sdk-tools/dotnet/vscode/vscode-ext/Tizen/dotnet.md

Before packaging on the laptop, compare the exact model with Samsung's current model-group table and TV Extension release notes. Check the connected TV's current platform in Device Manager. In an authorized web-inspector session, `tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')` can supply runtime platform evidence; also record `navigator.userAgent` for engine comparison. Do not share logs containing private stream URLs. The target's app-compatible platform version and installed firmware number are different values.

## Manifest and resource results

| Check | Result |
| --- | --- |
| XML | Well-formed, widget namespace and Tizen namespace present. Not validated with Samsung SDK schemas because SDK is absent here |
| Application ID | `StreamDemo.StreamTV`; prefix matches package `StreamDemo`, which is 10 alphanumeric characters. Existing identity preserved |
| Widget identity/version | Absolute HTTPS identifier `https://streamtv.example/app`, version `0.1.0`; identifier is an app identity, not a required hosted website |
| TV profile | `tv-samsung` present |
| Platform floor | `10.0` present; do not lower it solely to make an older emulator accept the app |
| Entry point | `index.html` exists |
| Internet | `http://tizen.org/privilege/internet` present |
| AVPlay | Samsung vendor AVPlay privilege declared; `$WEBAPIS/webapis/webapis.js` appears before the app module; `application/avplayer` object present. Exact privilege acceptance remains an SDK validation check |
| Network origins | Explicit GitHub raw origin plus `origin="*" subdomains="true"`. Wildcard makes the explicit origin redundant and permits all external origins at the widget policy layer |
| Imports/assets | All current static relative module imports, HTML local resources, CSS URLs and module-relative mock JSON resolve; JSON parses. No missing declared local assets found |
| Layout | Logical 1920×1080 stage and AVPlay rectangle; scaling to the viewport is implemented. 4K TV composition remains a hardware check |

The wildcard accommodates arbitrary IPTV hostnames but is broader than the current mock-only application needs. For release, use verified provider, stream/CDN, image and EPG origins, including actual HLS manifest/segment/key hosts. Do not guess them from the login endpoint. Access declarations do not bypass CORS, TLS, authentication, DRM or provider authorization. HTTP streams are permitted by the current policy; credentials on HTTP would lack transport protection. No network policy was changed during this audit.

## Remote support

| Key | Current behavior | Registration/verification |
| --- | --- | --- |
| Up/Down/Left/Right | Focus navigation; text editing and native select handling retained | Basic TV keys normally delivered without registration; desktop integration tested |
| OK/Enter | Native focused button activation | Uses native default behavior, not a custom Enter dispatcher; physical TV check required |
| Back/Return | Key code 10009 closes player/dialog or returns from episodes | Explicit handler; root-screen Back is left to the platform |
| Escape/Tab | Desktop Back and dialog focus traversal | Desktop convenience, not a substitute for Samsung Back testing |
| Play/Pause/Stop, rewind/fast-forward, channel up/down, color and number keys | No app handlers or `tvinputdevice.registerKey` calls | Not currently supported app controls; do not advertise them as working |
| Home/volume/power | No app interception | Platform controls; do not attempt to register reserved keys |

If media/channel controls are added later, obtain available keys from `tizen.tvinputdevice`, add the TV input-device privilege when required by those APIs, register only supported non-basic keys, and implement appropriate state-aware handlers. Current basic navigation does not call that API and does not need its privilege. Long-press Return/app exit and the on-screen keyboard require physical remote checks.

## API and playback findings

No rooting, firmware modifications or undocumented system API calls were found. App runtime has no Node dependencies. Node's optional timer `unref` call is guarded and is not required on TV.

The source uses ES modules, optional chaining, nullish coalescing, `globalThis`, Fetch, AbortController, `AbortSignal.throwIfAborted`, URL, Map/Set, DOMParser, localStorage and CSS `:has`/`:focus-visible`. Current Chromium tests support these features; that is not proof of support on this TV's packaged runtime. In particular, `throwIfAborted` and `:has` require a sufficiently recent engine. Validate against the verified model's engine table and inspect the installed widget. There is no transpilation or compatibility polyfill. A missing abort API would make provider connection fail through its safe error handler; missing module support would prevent startup. Local storage has a memory fallback. Packaged module/resource loading is still unverified.

AVPlay opens HTTP(S), sets its listener and logical rectangle, prepares asynchronously, starts playback, and uses native state information for stop/close. Session guards suppress old callbacks during switching. Codec/connection failures are sanitized; DRM events stop playback without acquiring licenses or bypassing security. Mock mode never replaces an available native Samsung API. A browser mock cannot establish codec, audio, HLS, TLS, CORS or signing compatibility.

Remaining playback risks to verify or fix before release:

- `onbufferingcomplete` clears the shared timeout. If the TV then never advances playback or emits an error, a silent stall can remain unbounded. This audit records the gap; it does not claim comprehensive stall detection.
- If native `stop()` throws, cleanup returns before attempting `close()`. Subsequent opens report a release error when cleanup fails; test recovery on hardware rather than assuming the decoder was released.
- Close during native preparation and page visibility changes are tested through mocks only. Actual Samsung state constraints and resume behavior need the physical TV.
- HTML fallback handles an initial rejected play promise, but has no comprehensive subsequent media-error/stall listener. Native playback is the intended TV path.
- Channel switching is available through controller reopen/switchChannel, but there are no dedicated ChannelUp/ChannelDown remote bindings.

See [PLAYBACK-CHECKLIST.md](PLAYBACK-CHECKLIST.md) for the public legal MP4/HLS checks to perform before private streams. The private catalog remains gated; metadata and sample fixtures do not establish actual provider support.

## Executed validation

| Command | Outcome |
| --- | --- |
| `python3 scripts/audit-compatibility.py` | 38 structural checks passed, 0 failed |
| `npm run check` | All 19 application JavaScript files passed Node syntax checks |
| `npm test` | 82 passed, 0 failed, 0 skipped |
| `npm run test:browser` | 17 passed, 0 failed, 0 skipped; desktop Chromium and synthetic AVPlay/provider responses |

The structural checker does not validate the vendor XSD, dynamically constructed remote URLs or every potential future JavaScript import expression. Browser tests additionally exercise module/CSS loading and known catalog requests. SDK CLI and SDB are absent in this cloud environment, so SDK validation, signed `.wgt` generation and TV deployment were not run. At the time the audit ran, files were uncommitted in the workspace; the audit itself did not publish them to GitHub.

## Build handoff

Follow [WINDOWS-TIZEN-BUILD.md](WINDOWS-TIZEN-BUILD.md) for SDK, certificate, signing, staging and packaging steps. Only documentation and a repeatable structural audit script were added; application source, config, identities, design and branding were left unchanged. No files were deleted.
