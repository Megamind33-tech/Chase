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
