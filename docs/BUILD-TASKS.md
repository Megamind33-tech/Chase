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
