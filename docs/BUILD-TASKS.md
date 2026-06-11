# Chase Studio Pro — Step-by-step Build Tasks

Phase 1 tasks below are complete in this repository (✅). They are kept as the
canonical order for rebuilding, onboarding engineers, or porting.

## Phase 1 — Prototype (✅ this repo)

1. ✅ Electron shell: window, `app://` privileged protocol (ES modules + WASM
   fetch), `media://` protocol for user files, context-isolated preload.
2. ✅ FFmpeg backend: ffmpeg-static resolution (asar-aware), WebM-pipe →
   FLV/RTMP streamer with status events, WebM → MP4 finalizer.
3. ✅ Project IO: save/open `.chasestudio`, recents, `.cstemplate`
   export/import (media stripped).
4. ✅ State core: single serializable state tree + hydrate (deep merge).
5. ✅ Capture: device enumeration, getUserMedia open/reopen, mute.
6. ✅ 3D engine: renderer + scene + auto-quality scaler.
7. ✅ Procedural sets ×3 with themed geometry + animated branded wall/desk
   canvas textures.
8. ✅ Presenter shader: video texture, YUV chroma key + spill, AI mask input,
   exposure/warmth/saturation/skin-smoothing, contact shadow, billboarding,
   framed mode.
9. ✅ Virtual camera rig: 5 angles, anchor reframing, CUT/MOVE easing,
   punch-in, drift.
10. ✅ Light rig + presets, with presenter grade matching.
11. ✅ MediaPipe segmentation (lazy, graceful fallback to framed mode).
12. ✅ Props library (screen, monitor, panel, plinth, light bar, plant) with
    media-capable screens.
13. ✅ Overlay graphics engine: lower third, ticker, logo bug, breaking
    banner, title card, clock — animated, brand-driven.
14. ✅ Compositor: WebGL + overlay → program canvas → captureStream.
15. ✅ Outputs: codec negotiation (H.264 copy fast-path), independent record
    and stream MediaRecorders.
16. ✅ Launcher wizard (template → camera → background) + recents.
17. ✅ Editor UI: library rails, viewport drag-drop + picking, layers panel,
    control room bar, all settings panels, graphics drawer, modals, toasts,
    keyboard shortcuts.
18. ✅ Verification: syntax-check script + headless end-to-end smoke test
    (real app, fake camera, render-output pixel check, camera switch).
19. ✅ Packaging config: NSIS + portable, ffmpeg asarUnpack.

## Phase 1b — Pro rebuild to the reference images (✅ this repo)

19a. ✅ Reference UI anatomy: top system bar, icon rail, thumbnail asset
     browser with categories, cinematic viewport badges, CAM 1–6 strip,
     bottom production strip, 7-tab inspector.
19b. ✅ Cinematic set engine: curved LED walls + 7 animated content styles,
     planar-reflection floors, LED towers, truss/halo rigs, bloom + vignette,
     haze, curved glowing anchor desk; 9 themed set packs.
19c. ✅ Live 3D set thumbnails (rendered, cached per branding).
19d. ✅ 6th camera + focal length, drift amount; FADE/WIPE program transitions.
19e. ✅ Quick scenes (snapshot/recall), 4 control-room macros.
19f. ✅ WebAudio mixer: mic/jingle/master gains, live meters, jingle library.
19g. ✅ Simulcast streaming (FFmpeg tee per destination) + per-destination
     status LEDs + measured outbound bitrate.
19h. ✅ Health chips (CPU/RAM/FPS/GPU quality), autosave, LED-wall media,
     desk glow + floor reflection + eye-light controls.
19i. ✅ Smoke test extended (6 cams, scenes, macros, mixer, browser).

## Phase 1c — Broadcast operations upgrade (✅ this repo)

19j. ✅ PROGRAM/PREVIEW switcher discipline: cameras and scenes stage to a
     PVW bus (green tally), TAKE/Enter sends to program through the selected
     transition, double-click hard-cuts, flip-flop like a hardware switcher.
19k. ✅ Emergency keys: BLACK (program + all outputs cut to black, armed
     pulse) and AR ON/OFF (instantly hides every 3D object from program).
19l. ✅ AR object pipeline: GLB/GLTF model import (auto-normalised to studio
     scale, grounded, animation playback), universal soft contact shadows
     with per-object strength control, floor-anchor toggle.
19m. ✅ Reliability: camera-input watchdog (CAM OK / CAM LOST chip + alert),
     show timecode in the status bar, operator log (timestamped session
     events: takes, black, AR kill, camera loss, imports).

## Phase 1d — Hybrid broadcast keying engine (✅ this repo)

19n. ✅ Hybrid Broadcast key mode (default professional): chroma keeps the
     hair/fine edge while a soft-dilated AI person gate kills rigs,
     wrinkles and gear outside the body; per-mode fallbacks stay honest.
19o. ✅ Edge refinement engine: 5-tap matte feather, matte contrast
     (gamma), hair recovery (borderline-detail lift), AI gate width,
     temporal stability control (anti-flicker mask blending).
19p. ✅ Clean plate: capture the empty studio as a difference reference
     (kills uneven/wrinkled screens in any mode), threshold control,
     live key monitor (mode · matte confidence · plate age).
19q. ✅ AutoFrame: AI-mask person tracking glides the virtual rig to keep
     the presenter centred with smooth follow (AI/Hybrid modes).
19r. ✅ Audio clean room: 90Hz hum high-pass + broadcast compressor +
     level-driven soft noise gate, live-bypassable.
19s. ✅ Smoke stage 6 verifies the hybrid chip, refinement stack, plate
     capture, key monitor and AutoFrame headless.

Staged honestly for the keying roadmap: NDI/OBS-virtual-camera input,
Free-D / SteamVR / OpenXR / PTZ tracking sources, AI-inpainted and
camera-pose synthetic plates, separate hair/hand mattes, multi-presenter
segmentation, 4K-in/1080p-out crop pipeline, virtual camera output.

## Phase 1e — Competitive sprint: reliability, automation, AutoFrame v2 (✅)

20a. ✅ Crash-safe recording: 60s segment rotation (independently playable
     part files), multi-part MP4 merge via FFmpeg concat.
20b. ✅ Stream auto-reconnect: per-destination retry with 2→30s backoff
     (5 attempts), RECONNECT state in destination cards + log.
20c. ✅ Crash recovery: full-state autosave every 45s to userData;
     'Restore last session' offer in the launcher.
20d. ✅ On-disk operator log (userData/operator.log, ISO timestamps).
20e. ✅ Scene playlist automation: AUTO advance through the scene queue
     with per-scene dwell, through the selected transition.
20f. ✅ Lower-third auto-out timer (broadcast-style timed straps).
20g. ✅ AutoFrame v2: shot sizes (CU/MS/FS) via eased auto-punch, headroom
     correction from mask top, two-person midpoint framing (wide-locked).
20h. ✅ 1080p60 path: 60fps output + 60fps capture request (UNVALIDATED on
     real hardware — labelled in UI).

## Phase 1f — Broadcast graphics engine (✅)

21a. ✅ Data binding: {{token}} resolver across all text graphics, built-in
     tokens (time/date/station_name) + custom fields.
21b. ✅ New graphic types: scoreboard, data card, countdown (self-clearing),
     stinger transition wipe — 10 types total.
21c. ✅ Data Sources desk: field table, CSV/JSON import, HTTPS API polling
     with interval control.

## Phase 1g — Pipeline loops: PVW graphics bus, AR panels, hygiene, metrics (✅)

22a. ✅ Graphics ARM/PVW bus: PVW button per graphic arms it to the preview
     bus; TAKE applies all armed graphics with the switch (logged, auto-out
     honoured) — vMix-style "overlay on transition".
22b. ✅ Graphics preset library: per-type Save preset (P1–P8) + one-click
     load chips in the graphic drawer.
22c. ✅ AR Data Panel prop: floating in-set panel rendered in true 3D with
     token-bound kicker/value/sub fields ({{tokens}} resolve live, repaint
     is change-detected at 2Hz, fields persist in the project).
22d. ✅ Reliability hygiene: low-disk guard on record start (<2 GB toast),
     WebGL context-loss recovery (RENDERER LOST chip + automatic set
     rebuild on restore), project version-mismatch warning on load, full
     material/texture disposal on set switch.
22e. ✅ Real pipeline metrics: camera input latency + dropped-frame counter
     from requestVideoFrameCallback, surfaced in the topbar (IN ms · DROP).
22f. ✅ Rundown (replaces the staged Scripts pane): ordered cue stack —
     Capture cue snapshots camera + live scene + graphics state; GO fires
     any cue through the switcher (scene first, then the cue's camera,
     graphics ride the take); NEXT advances down the stack; per-cue story
     notes, rename, reorder, delete; saves with the project.
22g. ✅ Prompter: full-screen presenter view of the live cue's story note
     (large type, UP NEXT strip, NEXT fires the next cue) — follows the
     rundown live cue automatically.
22h. Deferred (honest): 9:16 / 1:1 vertical-output render targets (overlay
     engine is 1920×1080 fixed — real work, not a toggle), per-pixel
     temporal chroma smoothing (mask-side smoothing only today).

## Phase 1h — Broadcast graphics upgrade G1 (✅ · plan: docs/GRAPHICS-UPGRADE.md)

23a. ✅ Premium lower third: staggered slab choreography on broadcast
     easing curves (quint-out in, cubic-in out, back-out chip pop);
     glass / carbon / metal materials; logo slot; name, title, location,
     topic kicker and pulsing live-status chip; responsive width from
     text metrics; all fields {{token}}-bindable and editable on air.
23b. ✅ Safe zones: title-safe 90% + action-safe 93% operator guides
     (viewport only, never in the program feed); straps anchor to the
     shared SAFE_X/SAFE_Y constants.
23c. ✅ Graphics playout hotkeys: Shift+1–9 cuts any graphic in/out,
     logged to the operator log.
23d. Plan G2–G5 documented: election/weather/finance/music packs, AR pin
     modes + charts, local control API (Stream Deck route), fill+key and
     vertical outputs.

## Phase 1i — Graphics G2–G5 build-out (✅ · docs/GRAPHICS-UPGRADE.md)

24a. ✅ G2 editorial packs: election results (vote bars, leader
     highlight), weather (drawn glyphs), market strip (delta colours),
     now playing (ZAMCOPS-ready), full-screen takeover, comment card —
     16 graphic types, all token-bound and editable on air.
24b. ✅ G3 AR modes: AR chart prop, presenter-safe billboard callout,
     FLOOR/DESK/EYE LINE anchors, billboard toggle, generic AR data
     binding inspector.
24c. ✅ G4 Control API: localhost HTTP trigger surface (gfx playout,
     data writes, cue advance, cuts, take, stinger) — verified with real
     HTTP calls; Stream Deck speaks this via Companion.
24d. ✅ G5 outputs: 9:16 and 1:1 program formats with full pipeline
     re-flow; Fill+Key aux window (graphics fill + luma matte) for
     external keyers.
24e. Procurement-gated, unchanged: NDI, virtual camera driver, encoded
     alpha output, physical-camera tracking. Honest staging only.

## Phase 1j — Remote operations + import surfaces + FX (✅)

25a. ✅ Typeface import: TTF/OTF/WOFF via FontFace; the brand face drives
     every graphic, strap, LED chyron and AR panel (fontStack cascade);
     faces persist with the project and reload on open.
25b. ✅ Still frame graphic: imported image as full-frame or corner
     insert (PNG alpha honoured), size/opacity/corner controls.
25c. ✅ Clip player: video playout over program, contain/cover, play-once
     self-clear or loop; clip audio routed into the program mix on a
     CLIP channel (jingle fader).
25d. ✅ Platform feed: capture any running window (Zoom / Meet / Teams /
     browser) as a live framed source in the guest slot — thumbnail
     source picker, stop control. Verified end-to-end against the real
     desktopCapturer. Feed audio loopback into the mixer: staged.
25e. ✅ Atmosphere FX: drifting dust motes in the light field (quality-
     gated) + Celebration FX macro - 420 paper-flutter confetti flakes
     (merged-geometry mesh, brand-coloured, drag physics, self-clears).
25f. Staged honestly: CHASE CALL (browser-based remote guest over WebRTC
     - needs TURN infrastructure for internet calls), RTMP/SRT ingest
     (needs decoder pipeline), NDI ingest (SDK procurement).

## Procurement (approved, requires Windows build machine)
- Code-signing certificate (EV/OV) → signed NSIS installer.
- NDI SDK native module (N-API) → NDI input sources.
- Virtual camera driver (softcam/obs-virtualcam route) → Zoom/Teams out.

## Phase 2 — Field-hardened MVP (next)

20. Audio meters + gain + music bed player.
21. Segmented crash-safe recording; stream auto-reconnect with backoff.
22. Reference-laptop performance pass (target: 720p30 on i5/8GB iGPU while
    streaming); shader cost audit; wall-texture LOD.
23. Hotkey map editor + Stream Deck plugin.
24. Locked "Live Control Room" mode (big buttons only, no editing).
25. 3 more sets (weather, sports, pulpit) + template pack format docs.
26. Code signing + auto-update + first-run telemetry opt-in (local logs).
27. Pilot program instrumentation: time-to-air metric, error counter.

## Phase 3 — Differentiators

28. Virtual camera driver (Zoom/Teams output).
29. Depth-estimation presenter parallax; head tracking.
30. Second camera / IP camera input; remote guest (WebRTC) window.
31. Localisation; ultra-low-bandwidth profiles; template marketplace.

## Definition of done (every task)

- Runs on the reference budget laptop at acceptable FPS.
- Survives the headless smoke test.
- Reachable by a non-technical operator without documentation.
- No regression in the golden-frame output review.
