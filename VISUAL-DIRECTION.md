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

## Current implementation versus specification

The source currently contains the earlier dark StreamTV demo and seven catalog destinations plus Import playlist. The finalized light TizenShow interface, approved ribbon-T artwork, and full sidebar are not yet implemented in this source. This specification records the intended design; it does not claim the existing demo matches it.

The light-theme reference screenshots and approved logo asset are not present in the current checkout or visible conversation. Do not reconstruct their exact typography, spacing, imagery or artwork from guesses. Preserve the written direction and use the actual references when available for visual implementation/review. No UI or runtime changes were made while recording this specification.
