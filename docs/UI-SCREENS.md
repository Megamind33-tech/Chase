# Chase Studio — UI/UX Screen Plan

Design language: broadcast control room, not consumer toy. Near-black layered
surfaces, one accent blue + gold, tabular numerals for timers, red strictly
reserved for REC/ON-AIR. All type is system Segoe UI (zero font loading,
native Windows feel). Everything a live operator needs is one click or one
keystroke; deep settings live behind tabs, never in the way.

## Screen inventory (vs. the 16 suggested screens)

| Suggested screen | Where it lives in V1 |
|---|---|
| 1. Welcome / Project Launcher | **Launcher home** — hero "New studio project", Open, Import template, Recents |
| 2. Hardware Setup | Folded into wizard step 2 + Output panel (no separate screen needed) |
| 3. Camera Input Setup | **Wizard step 2** — camera/mic pickers + live preview + capture resolution |
| 4. Green Screen / Background Setup | **Wizard step 3** — Green screen / AI cutout / Framed window cards; re-editable later in Look panel |
| 5. Studio Template Library | **Wizard step 1** (3 sets × 8 show presets) + **Sets library tab** in editor |
| 6. Main Studio Editor | **Editor** — program viewport centre, library left, panels right |
| 7. Asset Library Panel | **Left rail** — Sets / Props / Graphics tabs, drag or double-click |
| 8. Scene Layers Panel | **Layers panel** — scene objects + broadcast graphics with on-air dots |
| 9. Virtual Camera Angles Panel | **Control room bar** (always visible: CAM 1–5, CUT/MOVE, drift, mic) + Camera panel for move duration/punch-in/presenter placement |
| 10. Lighting Controls | **Light panel** — 5 preset chips + 5 faders |
| 11. Skin / Image Enhancement | **Look panel** — complexion presets + exposure/warmth/saturation/smoothing |
| 12. Lower Thirds & Graphics | **Graphics library tab** + per-graphic **quick-edit drawer** |
| 13. Streaming Setup | **GO LIVE modal** — destination presets, URL, key, inline status |
| 14. Recording Setup | **REC button** + save dialog + "Recording saved" modal (reveal / MP4) |
| 15. Live Control Room Mode | V1: the bottom control bar + keys 1–5; V2: dedicated locked mode |
| 16. Settings | **Output panel** — resolution, fps, bitrate, render quality, engine status |

Rationale for consolidation: 16 separate screens is navigation debt for a solo
operator. V1 collapses setup into a 3-step wizard and keeps *all* live-show
controls on one editor screen — switching screens during a live show is how
broadcasts get broken.

## Interaction details

- **Keys:** `1–5` cut cameras, `Ctrl+S` save, `Delete` removes selection.
- **On-air affordances:** PGM-tagged red camera button, pulsing ON AIR button,
  blinking REC dot, elapsed timer in the top bar.
- **Safe areas:** action/title overlay toggle on the viewport.
- **Drag feedback:** viewport glows on dragover; toasts confirm placements.
- **Honesty UX:** the Camera panel states plainly that angles are virtual
  production, not true multi-camera parallax.
