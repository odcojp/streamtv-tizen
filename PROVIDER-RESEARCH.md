# Apollo / Startup Show connection investigation

Research checkpoint: 2026-10-24 (user's America/New_York date). This records
observations and candidate tests; it is not a claim that an Apollo API or schema
has been verified for the user's account.

## Established observations

- The user reports a fresh, successful Startup Show login and channel loading
  using their original infolink.me `/api/list/…/…` link.
- The user reports testing on the home network without a VPN.
- Direct Edge access ends at an infolink error MP4 showing E01 (bad username/email
  or password). The VLC test shows the same error video.
- TizenShow's confirmed-host/full-link update receives HTML rather than supported
  catalog data. It keeps the user-supplied approved origin and encodes each
  credential path segment independently.
- These results do not establish wrong credentials, a device lock, a required
  user-agent, a CORS cause, or a ban on third-party clients.
- No real credentials or complete private login URL were supplied to this
  workspace. No authenticated provider request was made here.

## Public evidence located

Official provider/help pages remain inaccessible from this environment (HTTP
403). Public GitHub repository search and read-only source retrieval succeeded.
The sources below are independent community projects, not verified official
Apollo/Startup Show documentation. Third-party source was inspected as data;
no downloaded scripts, clients or dependencies were executed or installed.

| Source | Observed implementation | Limit |
| --- | --- | --- |
| [bruor/Apollo_m3u_to_strm README](https://github.com/bruor/Apollo_m3u_to_strm/blob/9b46b5fd59b3b558807d9da363eedb4a237a78d3/readme.md#L38-L42) | Lists an Apollo movie M3U address with an extra `/m3u8/movies` suffix; series feeds add `/m3u8/tvshows/1` and subsequent feed numbers | Community material last updated 2023-07-26; examples use tvnow.best, not the user's confirmed infolink.me host. Does not prove those paths work today or across hosts |
| [dmr121/startupshow-clone-macos authentication](https://github.com/dmr121/startupshow-clone-macos/blob/758af7c6ebd2610db8c1e65770326547e77a4718/Startup/View%20Models/AuthenticationViewModel.swift#L43-L80) | Extracts credentials from the pasted link, posts JSON to a login route, then uses a bearer token for requests | Unofficial Mac client, repository checkpoint 2024-05-31; does not prove how the official Startup Show app works today |
| [Same client's constants](https://github.com/dmr121/startupshow-clone-macos/blob/758af7c6ebd2610db8c1e65770326547e77a4718/Startup/Constants.swift#L11-L17) | Base API is tvnow.best/api | Does not establish ownership, compatibility, or authorization to send this user's credentials to that host |
| [Same client's live playback request](https://github.com/dmr121/startupshow-clone-macos/blob/758af7c6ebd2610db8c1e65770326547e77a4718/Startup/View%20Models/LiveTVChannelViewModel.swift#L74-L94) | Authenticated request reads a `data.secure_link` result before playback | A source-code example, not an actual response for this account; cannot be treated as a verified schema |

The evidence supports a hypothesis worth investigating: an app's pasted login
link may be used as a credential container rather than fetched verbatim as a
playlist. It does not establish that the direct playlist route or token route
works on infolink.me. Earlier full-link input and host fixes remain useful, but
they do not establish the provider's connection protocol.

## Next single diagnostic test

On the user's own PC, take the existing working HTTPS infolink.me login link and
append `/m3u8/movies` once to the end (after the password; remove a trailing slash
before appending if needed). Keep the domain and credentials unchanged. This is
a candidate path based on the older published community example, not a confirmed
provider endpoint. Do not change hosts or try arbitrary feed IDs.

Open it privately in Edge and report only the outcome: file download, text
starting `#EXTM3U`, JSON, E01 error video, or another general error. Do not upload
the returned playlist, a network capture, or the private link. Actual channel
stream URLs can themselves contain secrets. A failed candidate test should stop
this branch of investigation rather than trigger enumeration or repeated login
attempts.

Do not paste the extended candidate path into the current TizenShow provider
connection field yet: its full-link validation deliberately supports only the
confirmed two-credential base path. If the candidate yields usable data, add a
separate explicit playlist route with mock fixtures and tests; do not relax URL
validation globally or invent movie records from a channel-only M3U.

## If token-based login needs investigation

Keep this as a separate hypothesis. Do not silently replace GET with POST, send
credentials to a newly found host, copy third-party client identifiers/secrets,
spoof Startup Show, acquire another app's tokens, disable TLS validation, or
bypass authentication/DRM. Before implementation, establish the intended server
and normal authorized login contract for this account, then implement a mock
adapter and a safe user-side verification step. Public code is useful evidence
but does not establish a current, supported provider API.

## Project checkpoint

No runtime source, provider policy, UI or TV package changed for this research
checkpoint. The last application commit remains a158af8, with 88 unit tests and
23 browser tests last reported passing. Tests were not rerun for this document.
No third-party code or binaries were copied into the application. A new install
is not required for the diagnostic test above.

## Candidate playlist test result and next diagnostic

The user reports that the same-host `/m3u8/movies` candidate also returns E01.
That candidate is not verified as a working feed for this account; stop trying
additional playlist suffixes or numbered feeds on its basis.

`scripts/Test-ProviderLogin.ps1` prepares the remaining normal JSON-login
hypothesis for a user-side Windows check. It posts the parsed username/password
once to `https://infolink.me/api/login`, using a masked local prompt for the
original full link. This route is suggested only by the older community client's
`/api/login` contract on a different host; it is not confirmed for infolink.me.
The script does not send credentials to the community example's tvnow.best host.
It disables redirects/cookies, keeps normal TLS validation, bounds buffered
responses to 1 MiB, and outputs only the HTTP status plus fixed result labels.
No response bodies, tokens, URLs or credentials are printed or written to disk.
A recognized token-shaped JSON response would be evidence to investigate, not
proof of catalog/playback access. Other JSON remains unsupported until examined
through a separately reviewed, sanitized schema diagnostic.

PowerShell is unavailable in the cloud environment, so this Windows script was
reviewed as source but has not been executed or runtime-tested here. No private
request has been performed. The TV application source and active connection
method remain unchanged. The script can be reviewed on GitHub and its contents
pasted into the user's existing Windows PowerShell terminal; no application
reinstallation is needed. If local Windows policies prevent use, stop and report
the general error rather than changing security policies.


### Additional confirmed login host

The user also reports successful use of a laon.live `/api/list/` login link.
Both hostnames are therefore user-confirmed login-link origins; this does not
prove their API schemas, ownership or transport behavior are identical. The
Windows diagnostic now accepts either exact HTTPS hostname and uses the hostname
from the entered link for its one candidate `/api/login` request. It does not
substitute a hostname, follow redirects or try the second host automatically.
It reports the non-secret HOST alongside HTTP_STATUS and a fixed RESULT label.
The earlier single-host diagnostic description above is superseded by this
host-preserving update. No authenticated diagnostic has been run by this agent;
PowerShell runtime validation is still outstanding.


## User-side JSON-login diagnostic results

The user ran the candidate JSON-login helper on their PC:

- laon.live: HTTP 200 with HTML; no recognized token-shaped JSON.
- infolink.me: HTTP 400; the first helper deliberately withheld the error body.

HTTP 200 HTML does not establish authentication success. HTTP 400 does not
establish a valid API route, wrong credentials or a specific missing field. The
JSON-login contract is still unverified for both origins.

The helper now reads bounded non-redirect error bodies and emits a pure safe
summary: BODY_FORMAT; an allowlist of recognized JSON field names; recognized
validation-field names only (never values); an allowlisted error code; a fixed
message category; and RESULT. Raw response text, arbitrary object keys/messages,
URLs, passwords and tokens are not output. Redirect destinations remain hidden.
A token-shaped payload on a non-2xx response is not treated as login success.
The next user-side check is one run against infolink.me with the updated helper,
reporting only these summary labels alongside HOST and HTTP_STATUS.

Validation: an official PowerShell 7.5.4 Linux release was downloaded into /tmp
and its archive SHA256 checked against the release's hashes.sha256. The standalone
`tests/provider-diagnostic.Tests.ps1` parses the helper and extracts only its pure
summary function, without invoking the credential prompt or transport. All 18
synthetic privacy/format/status tests pass. Cases cover validation errors, auth
codes, unsupported JSON, array/null/bool roots, HTML, malformed text, redirects,
secret-bearing keys/messages/tokens and misleading token-shaped HTTP errors.
No network request is made by these tests. Windows-specific execution of this
updated version remains unverified here; the user successfully ran the previous
transport on their Windows PC. No TV runtime code changed.

To repeat the offline checks when PowerShell is installed:

```powershell
pwsh -NoProfile -File tests/provider-diagnostic.Tests.ps1
```

The earlier statement that PowerShell was unavailable applies to the previous
checkpoint; the temporary test runtime does not modify the application's SDK or
require the user to install PowerShell 7.
