# Chase Studio — Product Blueprint

## 1. Vision

Give a one-camera, low-budget broadcaster the on-air presentation power of a
BBC/CNN-class studio. The operator is a normal person, not an engineer: they
pick a set, plug in a webcam, type their station name, and go live looking
professional.

**Positioning:** Canva + OBS + a virtual TV studio, in one Windows app,
designed for African and other low-budget broadcasters — small TV stations,
churches, online news channels, schools, podcasters and corporate media teams.

**Product principles**

1. *Real pipeline first.* Everything on screen is the actual program output —
   no fake dashboards, no mock screens. Preview = record = stream.
2. *Broadcast look by default.* Templates, graphics and lighting are designed
   so the default output already looks like television.
3. *One operator.* Every live action (camera switch, graphic to air, record,
   stream) is one click or one key.
4. *Honest tech.* We never claim fake capability — single-camera limits are
   explained in-product, and we engineer the best possible effect within them.
5. *Owned, not rented.* Local projects, local recordings, no accounts, no
   cloud dependency, works offline except when streaming.

## 2. MVP feature list (V1 — implemented)

| # | Feature | Status |
|---|---------|--------|
| 1 | Windows app opens to a project launcher | ✅ |
| 2 | Camera + microphone selection with live preview | ✅ |
| 3 | New studio project wizard (set → camera → background) | ✅ |
| 4 | 3 virtual news sets + 8 show presets | ✅ |
| 5 | Drag-and-drop props into the 3D scene, drag to reposition | ✅ |
| 6 | Logo bug, lower third, title, ticker, banner, clock, virtual screens | ✅ |
| 7 | 5 virtual camera angles, CUT/MOVE switching, keys 1–5 | ✅ |
| 8 | Lighting presets + manual faders | ✅ |
| 9 | Skin tone / complexion enhancement presets + manual grade | ✅ |
| 10 | Chroma key (GPU) + AI cutout + framed fallback | ✅ |
| 11 | Live program preview (the real composited output) | ✅ |
| 12 | Local recording (WebM + one-click MP4) | ✅ |
| 13 | RTMP/RTMPS streaming (YouTube/Facebook presets + custom) | ✅ |
| 14 | Save/reload projects, export/import scene templates | ✅ |
| 15 | Auto quality scaling for weak machines | ✅ |

**Deliberately NOT in V1:** accounts, subscriptions, marketplace, cloud
storage, Zoom/Teams virtual camera (needs a signed Windows driver), NDI input,
multi-camera, depth estimation.

## 3. Development roadmap

### Phase 1 — Working prototype (done in this repo)
The full real workflow: camera → virtual studio → graphics → virtual camera
switching → preview → record/stream, with a premium operator UI.

### Phase 2 — Field-hardened MVP (4–6 weeks)
- Pilot with 3–5 real stations/churches (see validation loops below).
- Audio: level meters, gain, secondary audio source, music bed player.
- Hotkey board + Stream Deck support; "Live Control Room" locked mode.
- Crash-safe recording (segmented files), reconnect-on-drop streaming.
- More sets (weather centre, sports desk, pulpit) + asset pack pipeline.
- Installer polish: code signing, auto-update.

### Phase 3 — Differentiators (8–16 weeks)
- Virtual camera output for Zoom/Teams (signed driver or OBS virtual cam).
- Depth-estimated presenter (MiDaS-class model) for stronger angle illusion.
- Optional head tracking to add presenter parallax.
- Second camera / phone-as-camera (IP) input, picture-in-picture guests.
- Template marketplace (still offline-importable files first).
- Localisation (FR, SW, AM, AR…), low-bandwidth streaming profiles.

## 4. Validation loops (build-the-right-product process)

1. **Weekly demo loop** — every Friday, produce a real 5-minute "newscast"
   with the current build; anything that blocks the newscast is the top of
   next week's backlog.
2. **Pilot station loop** — 3–5 pilot users run a real show weekly; we collect
   (a) time-to-air from app open, (b) number of operator errors, (c) "would
   you air this?" yes/no. Targets: < 10 min to air, zero errors, 100% yes.
3. **Hardware floor loop** — every release is smoke-tested on a reference
   budget laptop (i5 / 8 GB / integrated graphics). If program FPS < 24 at
   720p, the release is blocked.
4. **Output review loop** — recorded output is reviewed side-by-side against
   a real broadcast reference each release; graphics timing, key edges and
   skin rendering must not regress (golden-frame comparisons).
5. **Honesty check** — any new marketing/UI copy describing virtual angles is
   reviewed against what the engine actually does.

## 5. Success criteria for V1

- A non-technical operator reaches a professional-looking live frame in under
  10 minutes from first launch.
- A full show can be recorded AND streamed simultaneously for 60+ minutes on a
  mid-range laptop without frame collapse.
- Output is judged "broadcast-acceptable" by a working TV producer.
