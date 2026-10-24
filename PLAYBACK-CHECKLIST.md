# Playback verification and resume checklist

Cloud changes are separate from the Windows copy and the installed TV package. Resume by reviewing the changes here, transferring the source to Windows, then rebuilding and signing the .wgt with the existing Samsung certificate. Do not replace or publish certificates.

## Desktop checks

- Run `npm ci`, `npm run check`, `npm test`, and `npm run test:browser`.
- Run `npm start`; visit `http://localhost:8080/?player=mock`. Select World Today. The player must explicitly say Offline mock. This simulates lifecycle and buffering only; it neither fetches nor decodes media, and does not update Recent.
- Back during preparation, reopen rapidly, switch channels and return to browsing. Confirm focus returns and old callbacks do not change the new session.
- Without the query parameter, desktop playback uses HTML video. Browser success does not prove AVPlay compatibility. Samsung's runtime script is unavailable on desktop by design.

## Physical Samsung TV — required before private streams

Use the existing mock catalog's public Big Buck Bunny MP4 first:
`https://raw.githubusercontent.com/mediaelement/mediaelement-files/master/big_buck_bunny.mp4`
This Blender open movie sample is a public legal test asset. Availability may change.

- Confirm the rebuilt package loads Samsung `$WEBAPIS/webapis/webapis.js` and uses native AVPlay, never the mock.
- Confirm picture and sound, logical 1920×1080 rectangle on the 4K screen, buffering feedback, Remote OK/Back and focus restoration.
- Switch rapidly during preparation and playback; close repeatedly. Confirm only one stream plays and no sound continues after Back or leaving the app.
- Test a public legal HLS sample, such as Mux's Big Buck Bunny test stream: `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`. Supply the exact URL to the player; do not derive provider URLs. This endpoint has not been verified from this cloud environment.
- Disconnect the network during preparation and buffering. Confirm timeout/error feedback and successful manual reopening after restoring access.
- Test a known unsupported codec/container; confirm a readable error and working Back, without displaying the stream URL or credentials.
- Confirm Recent records actual advancing playback, not preparation or failures.
- Only after these checks, safely verify the actual provider response and test an authorized private stream. The existing mock catalog gate remains in place.

AVPlay accepts HTTP(S) HLS and other formats supported by the particular TV. It does not guarantee every codec, container, profile, TLS chain or HLS variant. Generic connection failures cannot distinguish CORS, TLS, account rejection or network outages reliably. This implementation does not alter authentication, obtain DRM licenses, bypass DRM, or print native error details. Native state transitions, decoder behavior, audio, network access, suspend behavior and Samsung signing/installing require the physical TV; desktop mock tests cannot establish them.
