# Startup Show 2.6.2 base APK: static compatibility findings

**Correction:** The first discovery diagnostic assumed that the dynamic discovery
URL was the user's login link. Deeper caller tracing shows separately supplied
app-configuration endpoints. That diagnostic is retired and makes no requests.
See the final correction section; the initial test instructions below are a
historical record, not current instructions.

## Input and method

The user provided a base APK after a read-only ADB copy from their Google TV.
Manifest identity matches their earlier installed-package report:

- Package: tv.startupshow.android
- versionName: 2.6.2; versionCode: 127
- minSdkVersion: 24; targetSdkVersion: 35
- Application class: io.nitrix.tvstartupshow.StartupShowApp
- Input size: 21,073,405 bytes
- SHA256: 8732d902a6407e9bea32d9638228f096439873f4ef11a20803d40d5f0997bfd8

Identity matching is not an independent verification of the publisher's signing
certificate. The earlier APKPure XAPK exceeded the 32 MiB transfer limit and was
not inspected. The base APK was read as an archive; it was not installed, run,
modified, re-signed or published.

Read-only tooling: local DEX string-table inspection, Android resource/manifest
decoding, and JADX 1.5.3 from its official GitHub release. Tool configuration and
all extracted artifacts were kept under /tmp. Resource decoding completed;
source decompilation reported 46 errors among thousands of classes. Findings
are limited to successfully reconstructed interfaces/models and associated
routing/caller references. They are static evidence, not a network trace or
proof that a particular server supports TizenShow today.

## Findings relevant to the failed connection tests

| Evidence | Observation | Meaning / limit |
| --- | --- | --- |
| DomainApi interface | A discovery operation accepts a dynamic URL and a DomainGetRequest body | The pasted link need not itself be a GET playlist endpoint |
| DomainGetRequest model | Serialized field is package_name | Client identity is part of discovery; permission/registration rules remain unknown |
| DomainResponse model | Serialized result is a string mapped to the domain property | A backend host can be resolved before normal login; actual response has not been observed here |
| Repository/caller references | Discovery builds DomainGetRequest using the app identity; domain results can update the shared backend-host state | Supports a discovery/routing step missing from our prior direct GET and guessed same-host login tests; not every obfuscated UI path was reconstructed |
| UserApi and UserLoginBody | Relative login route with JSON username/password; another login variant includes device/app metadata header names | Normal JSON auth exists in this APK; a successful current-account contract is not yet verified |
| URL-routing interceptor | Uses a selected backend host and an api path prefix for API requests | The original login-link hostname may differ from the eventual API hostname |
| UserLoginResponse model | data, message, success, token, token_type, expires_at, service and other fields are declared | A source-model reference for future mocks, not a verified live response |
| Playback API references | Catalog/play routes and secure_link token/URL fields are present | Additional authenticated operations are required after discovery/login; stream URLs must come from real responses |

There are separate cross-platform phone/TV-pairing interfaces and request-signing
logic. That is not evidence that the normal pasted-link flow uses the same
signing contract. No embedded signing values, app credentials, client-specific
identity values or proprietary implementation code were copied into TizenShow
or included in this report. No signing replication, app impersonation, TLS
bypass, token extraction from user app data or authentication bypass is proposed.

The APK contains public service/development/SDK hostname references; a constant
alone does not identify the production provider backend. No newly found hostname
has been contacted with user credentials. The earlier generic googleapis.com
logcat result is insufficient to identify an authentication server.

## Prepared next test: discovery using TizenShow's own identity

`scripts/Test-ProviderDiscovery.ps1` is a standalone user-side Windows diagnostic.
It reuses the reviewed response-summary/redaction helpers and:

1. Prompts privately for the user's working HTTPS laon.live or infolink.me base
   login link, validates its shape, and encodes credential segments once.
2. Sends one JSON POST to that original link with package_name set to the actual
   TizenShow application identity, StreamDemo.StreamTV. Standard Accept and
   Content-Type are application/json. No Startup Show identity or signatures are
   sent, and no username/password fields are added to the body (they are already
   part of the user-supplied private URL).
3. Preserves normal TLS validation, disables redirects/cookies, uses a 25-second
   timeout and a 1 MiB buffered-response limit.
4. Summarizes format/recognized fields and reviewed redacted error text. A valid
   string result is classified only as a candidate domain, with public-suffix /
   fixed-prefix metadata rather than arbitrary account subdomains. Known secrets
   or opaque labels are withheld. Users must review summaries for other private
   details before sharing them.
5. Stops. It never contacts a discovered host, follows a redirect, fetches a
   catalog, performs a second login or adds a new trusted provider origin.

This tests whether a normal discovery request is usable by TizenShow; rejection
must not be worked around by claiming Startup Show's package or device identity.
Success establishes only server-supplied metadata, not provider ownership,
permission for custom clients, login success or playback authorization. Verify
a returned server and obtain explicit user authorization before any subsequent
credential-bearing request to a different host.

## Validation and project state

- 21 offline PowerShell discovery request/response/privacy cases pass.
- The existing 44 offline response/redaction tests still pass.
- No live provider request or real credential was used in cloud tests.
- Windows-specific behavior of the new discovery transport remains unverified
  here; the analogous original HttpClient transport was run by the user.
- No runtime app/UI/provider gate was changed. No TV rebuild is needed for this
  diagnostic, and no Samsung installation or playback test was performed here.
- APKs, extracted third-party code/resources, binaries and embedded secrets are
  not committed. The APK/XAPK patterns were added to .gitignore as a safeguard.

User action: review the discovery script, copy its raw contents into the existing
Windows PowerShell terminal, use the working laon.live link, and report only the
reviewed summary. Keep the private link and any raw JSON/HTML on the user's PC.


## Correction after the real discovery test

The user ran the initial helper against laon.live and received HTTP 200 HTML,
a script-tag marker, and page title laon.live. No domain was resolved. This does
not establish bad credentials or denial of a TizenShow registration.

A deeper read of previously failed/decompiled coroutine methods changes the URL
interpretation. DEX constructor references identify io.nitrix.core.utils.g as
calling the discovery/login coroutine objects. Targeted simple-mode output then
shows its discovery branch receives the two configuration strings carried by
H9.r (and the G login-context object). Dependency injection Cc.k obtains those
strings through F9.a/F9.b, which supply separate fixed short-link service
references. They are not copied from the username/password login link. Another
branch can use an explicitly supplied/selected backend host. The exact current
configuration and runtime branch remain unverified.

Thus the existence of DomainApi, package_name and result was correctly observed,
but mapping its dynamic URL to the user-supplied login URL was an unsupported
assumption. The original diagnostic cannot validate the real discovery flow.
It is retired: its builder always rejects, and its top-level code only reports
retirement without prompting for credentials or opening a network connection.
The existing source-model response summaries are retained for offline tests.

No app identities, request signatures, private app data or embedded secrets were
used to obtain a different server. The app resources also contain an old public
GitHub configuration-file reference; unauthenticated retrieval returned 404.
Unauthenticated fetches of the separate service references and the newly supplied
Premium Club IPTV Smarters guide were blocked by this environment's HTTP proxy
with 403. No credential-bearing request was made by this agent.

The user-provided https://premiumclub.me/iptvsmarters guide is a new documentation
lead. Its contents have not been read or verified. Obtain the public setup text
or screenshots from the user, excluding private credentials, and check for an
explicit server address, login protocol and supported-player instructions before
implementing or testing another connection method. Do not infer Xtream support
solely from the page title or IPTV Smarters name.


## Provider M3U documentation supersedes a mandatory token-flow assumption

The subsequently supplied Premium Club Smarters instructions explicitly describe
the base laon.live login link as an M3U URL for a supported Android third-party
player. The presence of a token flow in Startup Show therefore must not be used
to claim that all third-party access requires that flow. No working API contract
was established by the speculative JSON test, which is now retired as well.
Continue with the documented M3U/native-player comparison in PROVIDER-RESEARCH.md.
