# Finalized TizenShow visual direction

This user-approved specification governs future UI work. Functional changes must preserve it; they are not authorization for a redesign. Screenshots are visual references, not executable code, API contracts or evidence of implemented behavior.

## Appearance and structure

- Light white/soft-gray theme.
- Blue TizenShow ribbon-T logo. Use the approved artwork when available; do not invent a replacement logo.
- Fixed left sidebar, in this order: Home, Live TV, Movies, TV Shows, Sports, TV Guide, My List, Recent, Search, Settings.
- One unified Sports section, without duplicate Sports destinations.
- Cinematic hero banner.
- Vertical movie and TV show poster rows.
- Rounded cards, subtle shadows and blue remote-focus highlights.
- Retain the logical 1920×1080 layout for the TV display.

## Implementation priorities

Prioritize reliable API integration, Samsung remote navigation and playback. Keep connection handling, catalog mapping and playback separate from presentation. Maintain loading, empty, failure and retry states within the approved visual direction. Keep focus visible and predictable with the Samsung remote, including dialogs, settings, search, poster rows and the player.

Use actual provider-supplied metadata and authorized stream URLs. Do not fabricate content or treat imagery in reference screenshots as available catalog data. Missing posters need a neutral presentation consistent with the approved design. Do not bypass provider authentication, TLS or DRM.

## Implementation status

The supplied light-theme screenshot is now available as a visual reference. The
source implements the light TizenShow shell, ten-item sidebar, unified Sports,
hero, vertical poster rows, rounded cards and blue focus. Search and Settings
use existing catalog and connection modules. The brand SVG is a vector rendition
of the screenshot's ribbon-T; an original editable logo export was not supplied.

Screenshot film/show imagery and titles are not bundled or treated as provider
content. The demo keeps its explicitly mock catalog, neutral poster placeholders
and an original abstract landscape hero. Actual supplied poster/logo URLs can
populate cards; failures keep neutral placeholders. Do not fill missing catalog
entries merely to make rows resemble a screenshot.

Visual and functional checks so far are desktop browser checks. This does not
establish packaged Samsung TV compatibility or actual provider integration.
