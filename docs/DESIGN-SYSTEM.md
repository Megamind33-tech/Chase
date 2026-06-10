# Chase Studio Pro — Design System (v1)

Built to the five reference boards (UI skin reference, broadcast component
kit, graphics skin, and the two full-app mockups). System first, screens
second: every screen is assembled only from the components below.

## 1. Tokens

**Surfaces** `#0A0F16` base · `#101822` panel · `#131C29` card · `#162033`
elevated · `#1E2A3E` hover/active · glass `rgba(13,19,30,.78)` + blur.
**Lines** `#182233` soft · `#1F2B40` default · `#2C3D5C` highlight.
**Text** `#EEF2F8` / `#A0AEC0` dim / `#64748B` faint.
**Accents** electric blue `#2277FF` (+ `#4F9BFF` hi, `#1257D4` deep), cyan
highlight `#00C7FF`, gold `#FFD24D` (premium actions only), red `#E63946`
(live/record/breaking/danger ONLY), green `#2FC966` (ready/health ONLY).
**Gradients** primary deep-blue→blue→cyan · live red→deep red · gold→deep gold.
**Glows** blue ring+14px, cyan 12px, red 14px, gold 14px — controlled, never
on neutral surfaces.
**Radius** 5/8/12/18 · **Shadows** 3 elevation steps · **Focus ring** double
ring (bg + blue 60%).
**Type** Segoe UI Variable; uppercase 9.5–10px/750 letterspaced labels for
technical controls; tabular numerals for all timers/meters; no thin text on
controls.

## 2. Icon system (`src/renderer/js/ui/icons.js`)

One hand-drawn family: 24×24, 1.8px stroke, rounded caps/joins,
`currentColor`, designed for dark UI. ~60 glyphs covering navigation (studio,
sets, objects, graphics, overlays, lighting, camera, talent, audio, scripts,
plugins, settings), production (record, live, multiview, cut/fade/wipe/slide/
push/zoom/move transitions, rotate, duplicate, trash, star, eye, lock),
graphics types (lower third, ticker, banner, logo bug, title, clock,
countdown, screen, chroma, skin), system (cpu, gauge, health, warn, save,
open, import, export, search, filter, safe-area, expand), audio (mic, music,
jingle) and platforms (YouTube, Facebook, RTMP/globe). **No emoji, no mixed
open-source sets anywhere in the product.**

## 3. Button system (8 variants × 7 states)

primary (blue gradient, inner bevel, blue glow on hover) · secondary
(elevated surface) · ghost (transparent → surface) · live (red gradient,
pulsing when ON AIR) · record (dark + blinking tally dot) · danger
(red-outline → red wash) · **gold action** (premium: Import set template) ·
icon button (30px square). All carry default/hover/active(press
translate)/focus-visible(double ring)/disabled(38%)/loading-capable states.

## 4. Component inventory (all implemented)

Status pills (dot + label, ok/warn) · stat chips (tabular) · set cards
(live-render thumbnail, category tag, HD·3D quality tag, IN-USE badge,
favourite star, hover lift) · library cards (icon tile + name + desc + ON-AIR
state) · mood cards (swatch + name) · scene items (status dot, number, live
state, delete) · macro buttons (gold icons) · transition tiles (icon + label,
6 types) · audio channel strips (segmented meter canvas, fader, mute/label) ·
destination rows (platform icon tile, tally LED, state pill, kbps + format) ·
camera tiles (live thumb, PGM tally, name/shot labels) · transform toolbar
(floating glass: rotate ±15°, duplicate, delete) · viewport badges (LIVE
PREVIEW, CAM, 16:9) · designed empty states (icon + heading + guidance +
action) · staged panes (honest copy, no dead buttons) · modals (elevated
gradient surface) · graphics drawer · toasts.

## 5. What was generic → what replaced it

| Generic before | Replaced with |
|---|---|
| Emoji/text glyph icons (🖥 ⚡ ▦ L3) | Custom 60-glyph stroke icon family |
| Default web buttons | 8-variant broadcast button system with glow/bevel/states |
| Flat single-black surfaces | 5-step surface ladder + glass + elevation shadows |
| Text-only asset lists | Thumbnail cards with tags, badges, favourites, quality marks |
| Blank "no items" strings | Designed empty states with icon + action |
| 4 plain transition buttons | 6 icon transition tiles (cut/move/fade/wipe/slide/zoom — all real) |
| Unlabelled meters | PGM/MIC/MUSIC channel strips with gradient meters |
| Plain destination rows | Platform-branded cards with tally LED + state pill + live kbps/format |
| No selection affordance | Floating transform toolbar over the viewport selection |
| Sets list unsorted | Favourites pinned first + category filters + gold import action |

## 6. Before/after acceptance (re-run of the 10-point reference check)

1. Premium dark broadcast look — **pass** (token ladder, controlled glows).
2. Rich studio thumbnails — **pass** (live 3D renders + tags/badges/stars).
3. Cinematic viewport — **pass** (badges, guides, transform bar over the real
   bloom/reflection render).
4. Inspector useful & advanced — **pass** (7 tabs, selection module, focal/
   parallax/desk-glow/eye-light, destination editor).
5. Bottom strip = real console — **pass** (scenes w/ tally, gold macros, icon
   transitions, metered mixer, platform destination cards).
6. No empty generic UI — **pass** (designed empty states everywhere).
7. Competitive — **pass at MVP tier**; photoreal set parity remains Phase 3.
8. Operator-understandable — **pass** (wizard, 1–6 keys, plain labels).
9. Every control functional — **pass** (staged items labelled, none clickable-fake).
10. Closer to references than previous build — **pass** (same anatomy, same
    token language, same component kit).

Known deltas (tracked honestly): reference mockups use photoreal raytraced
set imagery; CAM thumbs refresh round-robin; no undo/redo yet (deliberately
not faked in the top bar); Build-Studio one-click generator is the next
feature on the roadmap (wizard currently covers the flow in 3 steps).
