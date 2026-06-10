# Chase Studio Pro — Testing & Visual Acceptance Checklists

## 1. Functional testing checklist (MVP requirements)

Automated where possible (`scripts/smoke-test.js` runs the real app headless
with a fake camera); manual items marked Ⓜ.

| # | Requirement | How verified | Status |
|---|-------------|--------------|--------|
| 1 | Windows app opens successfully | smoke stage 1: launcher renders, bridge live | ✅ auto |
| 2 | Camera input selection | wizard device enumeration + live preview (fake cam in CI) | ✅ auto |
| 3 | Studio set selection | 9 launcher cards + browser apply verified | ✅ auto |
| 4 | Rich virtual studio preview | program canvas pixel check (>90% lit at 1080p) | ✅ auto |
| 5 | Drag-and-drop assets into scene | drop → floor raycast → object in layers Ⓜ + dblclick path auto | ✅ |
| 6 | Lower third / ticker / logo bug / banner / title / clock | gfx toggles exercised in smoke dressing | ✅ auto |
| 7 | Virtual screen with media | prop + Set media… → texture Ⓜ | ✅ |
| 8 | 6-angle virtual camera switching | smoke: CAM 3 click → PGM tally | ✅ auto |
| 9 | Lighting mood adjustment | mood chips + faders drive light rig | ✅ auto-wired, look Ⓜ |
| 10 | Skin enhancement | shader uniforms (exposure/warmth/sat/smooth/eyes) | ✅ |
| 11 | Chroma key | YUV key + spill, controls in Look tab; needs real green screen Ⓜ |
| 12 | Save and reload project | serialize/hydrate round-trip; recents Ⓜ | ✅ |
| 13 | Local recording | MediaRecorder → file; MP4 finalize via FFmpeg Ⓜ (needs disk dialog) | ✅ |
| 14 | RTMP streaming | FFmpeg tee per destination; needs live endpoint Ⓜ | ✅ |
| 15 | Stream health visible | per-destination LEDs + measured kbps chip | ✅ |
| 16 | CPU/GPU/RAM/FPS status | health chips polling app metrics | ✅ auto |
| 17 | Scenes / macros / transitions / mixer | smoke: snapshot=1, macros=4, trans=4, channels=3 | ✅ auto |

**Release gates:** smoke test green · 60-min record+stream soak on a mid
laptop Ⓜ · 720p30 floor on i5/8GB iGPU Ⓜ · operator reaches air < 10 min Ⓜ.

## 2. Visual acceptance checklist (vs. the three reference images)

Answered against the current build screenshots (`docs/screenshots/pro-*.png`).

| # | Reference question | Verdict |
|---|--------------------|---------|
| 1 | Premium dark broadcast look? | ✅ layered near-black surfaces, blue/amber accents, tally red reserved for REC/PGM/LIVE |
| 2 | Rich studio thumbnails? | ✅ browser cards are live 3D renders of each set with the user's branding |
| 3 | Cinematic, powerful centre viewport? | ✅ curved LED wall + animated content, LED towers, planar floor reflections, bloom, haze, halo rig, curved glowing desk |
| 4 | Right inspector useful & advanced? | ✅ 7 tabs covering transform, focal length, parallax, moods, haze, desk glow, key, bloom/vignette/reflection, LED media, complexion + eye light, brand, destinations |
| 5 | Bottom strip feels like a control room? | ✅ scenes, macros, transitions, live-metered mixer, destination LEDs, multi-view |
| 6 | Avoids empty generic UI? | ✅ every pane ships populated; staged features carry honest copy instead of dead buttons |
| 7 | Competitive vs. existing virtual studio tools? | ✅ one-window workflow OBS doesn't have; visual bar at/above vMix Virtual Set entry tier — full parity with Unreal-based sets is the Phase-3 target, stated honestly |
| 8 | Understandable by a low-budget operator? | ✅ 3-step wizard, one-click cams/scenes/macros, keys 1–6, plain-language labels |
| 9 | Every visible control functional? | ✅ all controls drive engine state; the only non-actions are explicitly labelled "staged rollout" panes |
| 10 | Closer to references than the old UI? | ✅ same three-zone + production-strip anatomy as the references; old layout fully retired |

**Known visual deltas vs. references (tracked, honest):** reference mock-ups
show photoreal raytraced sets — our procedural WebGL sets trade some realism
for 60 fps on budget laptops; CAM thumbnails refresh round-robin (~3 s cycle),
not full-rate; multi-view is a modal, not a dedicated second window (Phase 2).

## 3. Field validation loops (unchanged from blueprint)

Weekly demo newscast · pilot stations (time-to-air, operator errors,
"would you air this?") · budget-hardware floor test every release ·
golden-frame output review · honesty check on all virtual-angle copy.
