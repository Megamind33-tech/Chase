# CHASE STUDIO PRO — Broadcast Graphics Upgrade Plan

Status: G1 shipped. This plan is the audited roadmap from "overlay tool"
to a full Broadcast Graphics Engine. Strict audit first, then phases.

---

## 1 · Audit — what exists today (verified in code, not claimed)

| Question | Honest answer |
|---|---|
| What graphics system exists? | `OverlayEngine` (src/renderer/js/graphics/overlay.js): a 1920×1080 2D canvas composited over the 3D program every frame. 10 graphic types. Plus true-3D graphics: AR Data Panel prop, virtual screens, studio wall LED surfaces (engine/props.js, sets.js). |
| Lower thirds functional or mockups? | Functional and live-rendered. As of G1: staggered slab choreography, 3 material themes, 6 fields, logo slot, status chip. |
| Rendered live or static images? | Live canvas drawing every frame. No PNG overlays anywhere. |
| Real-time animation? | Yes — time-based easing (easeOutQuint entrance, easeInCubic exit, back-out chip pop), per-element stagger windows. |
| Controllable during a live show? | Yes — drawer edits apply on air; Shift+1–9 playout hotkeys; auto-out timers. |
| Connected to live data? | Yes — `{{token}}` resolver in every text field; manual fields, CSV/JSON import, HTTPS API polling (Data Sources desk). |
| Camera tracking? | Virtual cameras: perfect by construction (the camera IS the renderer). Physical-camera tracking: DOES NOT EXIST and is not faked — the presenter layer is a keyed plane; AR objects parallax correctly against virtual moves only. |
| AR graphics inside the studio? | Yes — AR Data Panel is a scene object with contact shadow, floor reflection, occlusion by other set pieces, token-bound repaint. |
| Behind/in front of presenter? | Yes — true depth sorting; objects behind the presenter plane occlude correctly. |
| Shadows / set interaction? | Contact shadows yes; floor Reflector picks them up; they receive set lighting. No dynamic shadow casting from overlay (2D) graphics — those are screen-space by design. |
| Reusable templates? | Per-graphic presets (P1–P8) + project/scene templates via Export. |
| Edit names/scores/topics live? | Yes — all fields are state-bound inputs, applied per-frame. |
| Trigger sources | Panel buttons, PVW/TAKE arm bus, rundown cues, macros, keyboard (Shift+1–9). Stream Deck/API/newsroom: NOT BUILT (see phases). |
| Preview before live? | Yes — graphics ARM to PVW, applied on TAKE. |
| Program/Preview separation? | Yes — full PVW/PGM bus for cameras, scenes and graphics. |
| Safe zones? | G1: title-safe (90%) and action-safe (93%) operator guides; straps anchor to SAFE_X/SAFE_Y constants. |
| What is fake/placeholder? | Nothing clickable is fake. Honest gaps: no 9:16/1:1 render targets; no alpha/matte (fill+key) output; no NDI; no Stream Deck; no newsroom/social feeds; no physical-camera tracking. Election/weather/finance/music use the generic Data Card today, not dedicated layouts. |
| What must be rebuilt? | Nothing rebuilt — extended. The 2D canvas + 3D scene-object split is the right architecture; phases below add layouts, feeds, outputs. |

## 2 · Rendering method

- Current: Canvas2D overlay (screen graphics) + Three.js scene objects
  (AR graphics) + CanvasTexture for in-set panels. Correct choice for a
  single-process Electron app: zero copy into the program feed,
  deterministic z-order, 60fps-capable.
- Not moving to DOM/CSS graphics: they cannot composite into the
  captureStream program feed without rasterising per frame.
- Unreal-class 3D motion graphics stay in the Three.js scene — that is
  what the AR object system is.

## 3 · Phases

### G1 — Premium straps + safe zones + playout hotkeys ✅ SHIPPED
- Lower third v2: staggered choreography (spine → name slab → title slab
  → topic kicker → status chip with overshoot pop), glass/carbon/metal
  materials, logo slot, location field, topic kicker, pulsing LIVE chip,
  responsive width from real text metrics, title-safe anchoring,
  {{tokens}} in every field, edit-on-air, presets, auto-out.
- SafeZoneManager v1: action-safe 93% + title-safe 90% operator guides
  (viewport only — never composited into program).
- GraphicsTriggerManager v1: Shift+1–9 playout hotkeys.

### G2 — Editorial packs ✅ SHIPPED
- Election results: header + reporting badge, party rows with animated
  vote bars, automatic leader highlight, per-row colour.
- Weather panel: drawn condition glyphs (clear/cloud/rain/storm/snow),
  temperature, location, high/low.
- Market strip: instruments with price + signed delta colouring.
- Now playing: song/artist/station + animated beat bars; ZAMCOPS royalty
  metadata field ({{royalty_amount}}).
- Full screen: full-frame takeover, kicker/title, sequential row reveal.
- Comment card: handle + tag chip + wrapped body ({{comment_user}} /
  {{comment_text}} drivable from the Control API).
- 16 graphic types total, all token-bound, editable on air, presets.

### G3 — AR graphics modes ✅ SHIPPED
- AR Chart prop: in-set bar chart, Label:Value rows, token-bound,
  change-detected repaint, true depth/occlusion/reflection.
- AR Callout: pill + stem, billboards to the active camera (yaw only),
  keeps ≥1.15m visual distance from the presenter (smoothed offset,
  never rewrites authored position).
- AR Anchor pins: FLOOR / DESK / EYE LINE; billboard + presenter-safe
  toggles in the inspector.
- Honest tracking policy holds: virtual cameras = locked AR by
  construction; physical-camera tracking is not simulated.

### G4 — Trigger surfaces ✅ SHIPPED (API)
- Control API on 127.0.0.1:7611 (falls forward to :7619): /api/status,
  /api/gfx/<key>/in|out|toggle, /api/data/<field>?value=, /api/cue/next,
  /api/cut/<n>, /api/take, /api/stinger. Stream Deck route = Companion
  HTTP requests against these endpoints. All commands hit the operator
  log. Status row in the destinations rack.
- Still open: hotkey map editor (fixed Shift+1–9 map today), packaged
  Companion module, direct social feed adapters (comment card binds via
  Data Sources / Control API today).

### G5 — Outputs ✅ formats + fill/key · NDI/virtual cam procurement-gated
- Program formats: 16:9 1080p/720p, 9:16 1080×1920, 1:1 1080×1080 —
  full pipeline re-flow (camera aspect, render targets, graphics layer
  re-anchors to the new frame). Blocked while recording/streaming.
- Fill+Key aux window: graphics layer as FILL (over black) + KEY (luma
  matte) for external keyers via window capture in OBS/vMix.
- Procurement-gated (Windows machine + SDKs): NDI, virtual camera
  driver, true alpha in the encoded stream.

## 4 · Language rules (enforced)
Broadcast terms only: Template, Playout, Program, Preview, Layer, Data
Source, Data Binding, AR Object, Lower Third, Ticker, Bug, Stinger, Full
Screen, Safe Zone, Trigger, Duration, In/Out Animation, Live Data, Manual
Override, Render Status. Banned: "AI generated", "magical", "stunning",
"beautiful overlays", "smart graphics".
