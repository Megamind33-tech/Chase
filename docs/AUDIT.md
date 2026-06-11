# CHASE STUDIO PRO — Strict Technical Audit
*No flattery. Verified against the actual codebase at commit `925c368`+.*

## 1. CURRENT STATUS — the truth table

### Fully working (engine-backed, headless-verified)
Capture (getUserMedia devices) · 3D set renderer (9 procedural sets, reflective
floors, bloom, ACES) · chroma key + AI segmentation + **hybrid key** (GPU shader)
· edge refinement (feather/gamma/hair/choke/gate) · spill suppression · matte
monitor · clean plate (static difference) · temporal mask stabilization ·
light wrap + grade match + HDRI IBL · contact shadows + floor reflection of
talent · wardrobe recolor · 6+N virtual cameras, custom angle creation ·
PGM/PVW switcher with TAKE/BLACK/AR-kill · scenes/macros/transitions (6 real)
· AutoFrame v1 (mask-centre follow) · GLB/GLTF/FBX/OBJ ingestion with budgets,
texture compression, PBR conversion · material editor + surface rebranding ·
overlay graphics (L3/ticker/bug/banner/title/clock) · WebAudio mixer + clean
room (HPF/comp/gate) · simulcast RTMP via FFmpeg · WebM record + MP4 finalize
· project/template persistence · builder mode (orbit, gizmo, 2D plan) ·
presenter angle packs + capture wizard + guest slot · operator log, timecode,
camera watchdog, live safety gate · undo/redo (objects).

### Partial — works but not production-ready
- **AutoFrame**: horizontal follow only. No headroom control, no shot-size
  selection, no two-person widen, no 4K-crop pipeline.
- **Undo/redo**: scene objects only (not lighting/graphics/brand).
- **Autosave**: only after first manual save assigns a path.
- **Clean plate**: static capture only; no AI inpainting, not camera-pose aware.
- **Matte confidence**: mask-solidity heuristic, not a true quality metric.
- **FBX import**: loader-dependent; complex rigs/materials will vary. OBJ: no MTL chase-down.
- **Audio**: no per-device second input; gate is level-based (not spectral).
- **Builder gizmo on touch/HiDPI**: untested.

### Staged honestly (visible, labelled, no engine)
IP/NDI input · second live camera · Zoom/Teams virtual camera out · website
embed (HLS) · scripts/rundowns · plugins · cue timeline · cloud garment swap.
**Nothing in the UI is fake-clickable; staged items carry copy, not buttons.**

### Most likely to break in real production (ranked)
1. **Stream pipeline latency/stability** — MediaRecorder→pipe→FFmpeg is
   functional but adds 1–3 s latency and has had zero soak testing. No
   auto-reconnect on drop.
2. **Hardware variance** — H.264-in-WebM hardware path never verified on a
   real Windows GPU; VP8 fallback transcode may pin CPUs on budget machines.
3. **Recording crash-safety** — single growing WebM; a crash mid-show loses
   the file tail (no segmenting).
4. **MediaPipe WASM on real Windows** — segmentation FPS on iGPU unknown.
5. **Reflector + bloom cost** on iGPU — auto-quality should catch it; unproven.
6. **FBX edge cases** — pipeline catches parse errors but odd rigs may render wrong.

### Stack
Electron 31 · Three.js 0.165 (+EffectComposer, Reflector, TransformControls,
GLTF/FBX/OBJ/RGBE loaders) · MediaPipe Selfie Segmentation (WASM) · WebAudio ·
MediaRecorder · ffmpeg-static (one process per RTMP destination) · plain-JSON
persistence · no bundler (import maps) · electron-builder (NSIS+portable).

### Missing engineering hygiene
- Error handling: good on ingestion/stream/capture; **thin** on WebGL context
  loss, FFmpeg binary missing mid-session, disk-full during record.
- Performance testing: **none on target hardware.** All FPS data is from a
  software-GL container.
- Device testing: **zero real cameras/mics/green screens tested.** This is the
  single biggest unknown in the product.
- No crash recovery / session restore. No log file (operator log is in-memory).
- No memory-leak audit (texture disposal on set switching is partial:
  set.dispose handles geometry; material/texture disposal incomplete).

## 2. COMPETITIVE POSITION

| vs | They win on | We win on |
|---|---|---|
| OBS | maturity, plugins, NDI, virtual cam, stability | integrated 3D studio, hybrid key, switcher UX, zero-assembly templates |
| vMix | inputs (SDI/NDI), instant replay, call-ins, proven 60fps | price tier, 3D sets out-of-box, modern key pipeline, simpler operator model |
| Wirecast | maturity, ISO recording | same as vMix; our graphics are more integrated |
| ATEM | hardware reliability, true multi-cam | we're software on one PC — different game; we win on virtual sets |
| Unreal/Aximmetry | photoreal, true tracking, broadcast pedigree | 10× simpler, runs on budget machines, minutes-to-air |
| NVIDIA Broadcast | RTX-grade denoise/eye-contact | we're a full production tool, not a filter |
| Zoom/Teams removal | nothing — that's our floor, not our ceiling | everything |

**Honest weaknesses:** input breadth (no NDI/SDI/multi-cam), no virtual camera
out, unproven latency/stability, no tracking hardware, set photorealism below
Unreal-class.
**Real differentiator:** the only tool where *one operator on one budget PC*
gets 3D studio + hybrid keying + switcher + simulcast + graphics in one
window, brandable in minutes. The familiar-presenter angle packs are a
genuinely novel low-budget feature; lean into it.
**What makes a broadcaster take it seriously:** a 60-minute uninterrupted
live soak on mid hardware, virtual camera out, NDI in, and crash-safe
recording. Nothing else matters until those.
**Don't promise yet:** camera tracking, photoreal parity, multi-cam, cloud AI
wardrobe, 4K.

## 3–8. SUBSYSTEM AUDITS (condensed verdicts)

- **Keying (3):** Real pipeline, not background removal: hybrid matte ✓,
  chroma ✓, segmentation ✓, edge refinement ✓, hair recovery ✓ (heuristic),
  spill ✓, temporal ✓ (mask-side only — chroma matte itself has no
  frame-history smoothing: *gap*), matte monitor ✓, clean plate ✓ (static
  only), shadow/grounding ✓, lighting match ✓, tracking-aware ✗ (no tracking),
  green/blue/custom via picker ✓, no-screen ✓. **Next:** previous-frame alpha
  buffer (ping-pong RT) for true temporal matte; separate spill mask preview.
- **Tracking (4):** Fixed-camera workflow only. Everything else (image-based,
  AR phone, SteamVR/Free-D/PTZ/LiveLink/OpenXR, lens calibration, quality
  states): **not present, not faked.** Virtual background cannot stay locked
  under real camera movement. Required: a TrackingManager abstraction +
  first source = phone AR (WebXR relay) or image-based homography; months,
  not weeks.
- **AutoFrame (5):** body-track ✓ (mask), centering ✓, smooth ✓, key-safe ✓
  (reframes the virtual rig, matte untouched). Missing: headroom, shot sizes,
  hands, two-person widen, safe-zone awareness, 4K source crop. Plan:
  bounds-driven shot classifier (CU/MS/FS from bbox height) + vertical framing
  + guest-aware union box.
- **Virtual studio (6):** true 3D scenes ✓ (not flats), desk occlusion ✓,
  contact shadows ✓, reflections ✓, lighting match ✓, live set switching ✓,
  graphics ✓, safe ingestion ✓ (budgets/compression/conversion), LOD/mesh
  simplification ✗ (we block/flag instead), crash-prevention ✓ (sandboxed
  parse, hard limits).
- **Performance (7):** UNKNOWN on target hardware — container numbers are
  meaningless. GPU accel ✓ (WebGL), CPU fallback = auto-quality render-scale
  (0.55×) ✓, 4K ✗, latency unmeasured, leak audit not done, perf monitor ✓
  (CPU/RAM/FPS/GPU%/bitrate), safe mode ✗, crash logs ✗.
- **Output (8):** RTMP simulcast ✓, record ✓ (+MP4), OBS via window/RTMP ✓,
  virtual cam ✗, NDI ✗, alpha/matte export ✗ (matte monitor only), clean/dirty
  split ✗ (single program bus), PVW/PGM ✓, full graphics ✓, scene switcher ✓.

## 12. MODULE MAP (their list → ours)
Exists: InputManager(capture.js) · PersonSegmentationEngine(segmentation.js) ·
ChromaKey+HybridMatte+EdgeRefine+Spill+CleanPlate(presenter.js shader — should
be split) · TemporalStabilizer(segmentation) · AutoFrameEngine(cameras/studio)
· LightingMatchEngine(lighting+presenter) · ShadowGrounding(props/presenter) ·
AudioCleanRoom(audio.js) · VirtualStudioRenderer(studio/sets) ·
AssetImporter(ingest.js) · BroadcastOutputManager(outputs+streamer) ·
SceneSwitcher(scenes.js+editor) · GraphicsEngine(overlay.js) ·
QualityMonitor(editor health) · SettingsManager(state.js).
Missing: FrameAnalyzer (unified per-frame analysis bus) · TrackingManager ·
CycloramaMeshManager (mapped onto set meshes today) · SourceManager (multi-input).
Needs extraction: the presenter mega-shader into a keying module file.

## 13. SECURITY / RELIABILITY
Good: context isolation, typed IPC, app://+media:// path containment,
ingestion sandbox/limits, permission flow. Gaps: no crash recovery/session
restore, no project file versioning (`appVersion` stored but unchecked), no
on-disk logs, no preset backups, no disk-space check before record.

## 14. PRIORITIZED ROADMAP
**A. Fix immediately:** crash-safe segmented recording (streamer.js — split
WebM every 60s, concat on finalize); stream auto-reconnect with backoff;
autosave to a recovery file even without a project path; on-disk operator log.
**B. MVP gate (real-hardware week):** Windows GPU validation matrix (encode
path, MediaPipe FPS, Reflector cost) → tune budgets; latency measurement +
display; disk-space guard; true temporal chroma matte (ping-pong alpha).
**C. Competitive release:** virtual camera out (obs-virtualcam route) · NDI in
(SDK or ndi-router) · AutoFrame v2 (shot sizes/headroom/two-person) · alpha
output (matte to second canvas → NDI/record) · cue timeline.
**D. Broadcast/pro:** tracking (TrackingManager + first source) · clean/dirty
feed split · multi-cam SourceManager · 4K-in/1080-crop · ISO recording.
**E. Later:** cloud wardrobe swap · AI-inpainted plates · marketplace · mesh
decimation/LOD.

## 16. FIRST CODING TASK
✅ Done in this commit: **UI language cleanup** — every label/toast/hint now
uses broadcast terminology (Chroma Key, AI Matte, Matte Monitor, Light Wrap,
Clean Room, Sample from Program, Program Out vocabulary); marketing/AI-demo
phrasing removed. Next first engineering task: **segmented crash-safe
recording** (roadmap A1) — touches `src/main/streamer.js`,
`src/main/main.js` (rec channels), `src/renderer/js/outputs.js`; test by
killing the process mid-record and verifying the parts play.
