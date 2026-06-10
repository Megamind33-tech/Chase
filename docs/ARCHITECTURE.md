# Chase Studio Pro — Technical Architecture

## 1. Stack decision

| Layer | Choice | Why |
|-------|--------|-----|
| Shell | **Electron 31** | One codebase, native Windows packaging, Chromium media stack (getUserMedia, MediaRecorder, WebGL) for free |
| 3D engine | **Three.js (WebGL)** + EffectComposer (UnrealBloom, vignette) + Reflector floors | Cinematic LED-wall sets at 60 fps on integrated graphics; far lighter than Unity/Unreal for budget fleets |
| Graphics | **2D canvas overlay engine** | Broadcast graphics (lower thirds, tickers) are typography-heavy — canvas 2D beats doing them in 3D |
| Audio | **WebAudio mixer** (gain buses + analysers) | Real faders/meters for mic + jingle + master; mixed program audio feeds record & stream |
| AI cutout | **MediaPipe Selfie Segmentation (WASM)** | Proven webcam person segmentation, CPU-friendly, fully offline |
| Encode/stream | **FFmpeg (ffmpeg-static), one process per destination** | Simulcast tee: one MediaRecorder feed split to N RTMP/RTMPS endpoints; MP4 finalize; bundled, no user install |
| Persistence | **Plain JSON files** | `.chasestudio` projects, `.cstemplate` templates — diffable, shareable, no DB |

Why not OBS-integration first: OBS adds a second app to install/launch and a
websocket layer to babysit — wrong UX for a non-technical single operator.
Instead we replicate the OBS pipeline natively (capture → composite →
MediaRecorder → FFmpeg → RTMP). An optional OBS bridge remains a V2+ option
(see §8).

## 2. Process architecture

```
┌────────────────────────── Electron main process ─────────────────────────┐
│ main.js      window, app:// + media:// protocols, IPC router             │
│ projects.js  project/template JSON IO, recent list                       │
│ streamer.js  FFmpeg child process: WebM pipe → H.264/AAC FLV → RTMP(S)   │
│              + WebM → MP4 finalize                                       │
└──────────────▲────────────────────────────────────────▲──────────────────┘
        IPC (contextBridge "chase")                stream/rec chunks
┌──────────────┴────────────────────────────────────────┴──────────────────┐
│                          Renderer (sandboxed UI)                         │
│                                                                          │
│  capture.js ── getUserMedia ──► <video> ─┬─► Presenter shader (key/AI/   │
│                                          │     grade) in Three.js scene  │
│  segmentation.js (MediaPipe mask) ───────┘                               │
│                                                                          │
│  engine/studio.js   scene root, props, picking, auto-quality             │
│  engine/sets.js     procedural sets + animated branded wall/desk         │
│  engine/cameras.js  5-angle virtual rig, CUT/MOVE, drift, punch-in       │
│  engine/lighting.js 3-point rig + presets                                │
│        │ offscreen WebGL canvas                                          │
│        ▼                                                                 │
│  compositor.js  = WebGL frame + overlay.js (L3/ticker/logo/banner/clock) │
│        │  #program-canvas  (preview = program = truth)                   │
│        ├─► canvas.captureStream + mic ─► MediaRecorder ─► rec:chunk ─► file │
│        └─► canvas.captureStream + mic ─► MediaRecorder ─► stream:chunk ─► FFmpeg │
└──────────────────────────────────────────────────────────────────────────┘
```

Key properties:

- **WYSIWYG guarantee** — preview, recording and stream all read the same
  composited canvas; there is no separate "render path" that can differ.
- **Codec negotiation** — MediaRecorder tries H.264-in-WebM first (hardware
  encode, FFmpeg copies the video stream untouched → near-zero CPU), falls
  back to VP9/VP8 with FFmpeg transcode (`libx264 veryfast zerolatency`).
- **Auto quality** — render scale steps down (1 → 0.55) when measured FPS
  drops below 22, recovers when above 29; output canvas stays at full
  resolution so stream/recording dimensions never change mid-show.
- **Security** — renderer is context-isolated; file access flows only through
  typed IPC; arbitrary user media is served via the `media://` protocol.

## 3. Folder structure

```
chase-studio/
├── package.json              electron-builder config (NSIS + portable)
├── scripts/
│   ├── syntax-check.js       parse-checks every source file
│   └── smoke-test.js         boots the real app headless: wizard → studio →
│                             render check → camera switch (CI-able)
├── src/
│   ├── main/                 main.js · preload.js · streamer.js · projects.js
│   └── renderer/
│       ├── index.html        all screens (launcher, editor, modals)
│       ├── styles/app.css    design system (broadcast dark theme)
│       └── js/
│           ├── app.js        boot + frame loop orchestration
│           ├── state.js      single JSON-serializable project state
│           ├── templates.js  sets, show presets, light/skin presets, asset defs
│           ├── capture.js    devices + getUserMedia
│           ├── compositor.js program canvas + output stream
│           ├── outputs.js    MediaRecorder ×2 (record / stream)
│           ├── engine/       studio · sets · props · presenter · cameras ·
│           │                 lighting · segmentation
│           ├── graphics/     overlay.js (lower third, ticker, bug, banner…)
│           └── ui/           launcher.js · editor.js · toasts.js
└── docs/                     blueprint, architecture, screens, build tasks
```

## 3b. Data/state model

One JSON-serializable tree (`state.js`) is the single source of truth — the 3D
scene, overlays, mixer and UI are projections of it. Top-level keys: `meta`,
`setId`, `brand`, `capture`, `bgMode`, `chroma`, `enhance` (incl. eye light),
`presenter`, `lighting` (mood + faders + haze + desk glow), `look` (bloom,
vignette, floor reflection, LED media), `camera` (active, focal scale, punch,
drift), `transition`, `objects[]`, `graphics`, `scenes[]` (quick-scene
snapshots), `audio` (gains + jingle library), `output` (format + destination
list). Projects (`.chasestudio`) and templates (`.cstemplate`) are this tree;
hydrate deep-merges over defaults so old projects load forward.

## 4. Scene editor logic

- **State-first:** every editable thing lives in `state.js` as plain JSON.
  The 3D scene is a projection of state; load/save is therefore trivial.
- **Drag-and-drop:** library cards carry `text/chase` drag data
  (`prop:<kind>` / `gfx:<key>`). Drops raycast through the virtual camera
  onto the floor plane (clamped to the set bounds) and spawn/position props.
- **Direct manipulation:** pointer-down raycasts the prop hierarchy upward to
  the owning group; dragging re-projects onto the floor plane each move.
  Selection drives a glow (emissive boost) + properties panel
  (scale/rotate/lift/media/delete).
- **Branding cascade:** station name/colours/logo are written once in the
  Brand panel and consumed by the set's wall + desk textures, props' slates,
  and every overlay graphic.

## 5. Single-camera virtual angle logic

True multi-angle parallax of a person is impossible from one camera. The
engine layers four honest techniques to sell the effect:

1. **Real set parallax** — the virtual camera genuinely moves through the 3D
   set, so floor, desk, wall and props shift correctly. This carries most of
   the illusion.
2. **Anchor-based reframing** — each angle defines an anchor weight; the look
   target tracks the presenter's position so framing always lands composed
   (tight shots track fully, wides barely).
3. **Yaw billboarding** — the presenter plane rotates about Y toward the
   active camera so the video is never seen edge-on; combined with shot
   design (max ±35° cross shots) the flatness is not noticeable on air.
4. **Punch-in + drift** — digital punch-in (FOV scale) gives MCU/CU variants
   of any angle; optional sub-centimetre "live drift" removes the deadness of
   a locked-off virtual camera.

Roadmap upgrades: depth-estimation relighting/parallax (Phase 3), head
tracking, true second camera.

## 6. Lighting & complexion pipeline

- **Scene lights:** hemisphere ambient + directional key + directional fill +
  point back-light + two brand-coloured accent points. Presets (News day,
  Evening, Warm talk, Dramatic, Flat) write fader values; faders remain live.
- **Presenter grade:** lighting presets also carry a `grade` (exposure/warmth
  offset) folded into the presenter shader so the camera image *matches* the
  set mood — the trick that makes composites believable.
- **Complexion controls:** exposure, warmth (R/B shift), saturation and skin
  smoothing (5×5 blur masked to mid-tones) run in the same fragment shader —
  zero extra passes. Presets: Natural, Studio, Soft glow, Rich tone, Cool crisp.
- **Chroma key:** YUV-distance key with similarity/softness controls plus
  edge-band spill desaturation.

## 7. Streaming workflow (operator view)

1. Output panel: resolution (720p/1080p), fps, bitrate (2.5/4.5/6 Mbps).
2. GO LIVE → destination preset fills the server URL (YouTube
   `rtmp://a.rtmp.youtube.com/live2`, Facebook RTMPS, or custom) → paste
   stream key → Start.
3. Status flow: `connecting → live → (error with FFmpeg tail) → stopped`,
   surfaced in the modal, the ON AIR button and toasts. REC is independent —
   record, stream, or both.

## 8. OBS / RTMP integration plan

- **V1 (shipped):** native RTMP via bundled FFmpeg — no OBS required.
- **V1 compatibility:** stations already invested in OBS can point OBS at the
  same RTMP target, or capture the Chase Studio window; nothing blocks them.
- **V2 option A:** "Send to OBS" — local obs-websocket v5 client that creates
  a scene + injects program output, for stations that need OBS-side mixing.
- **V2 option B:** virtual camera output (OBS virtual-cam driver or signed
  custom driver) → Zoom/Teams/any app sees "Chase Studio Camera".

## 9. Windows packaging plan

- `electron-builder` → **NSIS one-click installer** + **portable .exe**
  (portable matters: shared/locked-down station PCs).
- `ffmpeg-static` Windows binary auto-included, `asarUnpack`ed for execution.
- x64 target; ~250 MB installed. Phase 2: code signing certificate,
  `electron-updater` auto-updates, crash reporting (local log files first).
- Budget-fleet defaults: 720p capture profile, auto render quality, hardware
  H.264 negotiated when the GPU supports it.
