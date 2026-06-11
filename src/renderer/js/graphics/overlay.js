// Broadcast graphics engine: lower thirds, ticker, logo bug, breaking
// banner, title card and clock — drawn on a 1920×1080 2D canvas that the
// compositor layers over the 3D program. All animation is time-based.
import { state, tok, fontStack } from '../state.js';

// Frame size follows the program format (16:9 / 9:16 / 1:1) — every layout
// in this engine is anchored to W/H and the title-safe insets, never to
// absolute pixels, so straps re-flow when the format changes.
let W = 1920, H = 1080;
// Title-safe inset (90% of frame) — all strap graphics anchor to these.
export let SAFE_X = Math.round(W * 0.05), SAFE_Y = Math.round(H * 0.05);

/* Broadcast easing curves */
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const EASE = (t) => 1 - Math.pow(1 - clamp01(t), 3);          // easeOutCubic
const OUT_QUINT = (t) => 1 - Math.pow(1 - clamp01(t), 5);     // fast settle
const IN_CUBIC = (t) => Math.pow(clamp01(t), 3);              // accelerating exit
const BACK_OUT = (t) => {                                     // slight overshoot pop
  const c = 1.9; t = clamp01(t) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
};
// remap an overall phase into a staggered element window [a..b]
const seg = (ph, a, b) => clamp01((ph - a) / (b - a));

// Per-graphic in/out durations (seconds); default 0.45 / 0.35.
const DUR = { lowerThird: { in: 0.8, out: 0.5 } };

/* ---- broadcast surface kit ----
   One material language for every graphic: near-black ink slabs with a
   1px top hairline, soft drop shadow for separation from video, thin
   accent rules (never large filled areas), tracked-out caps for labels,
   light-weight numerals for big values. */
const F = (weight, size) => `${weight} ${size}px ${fontStack()}`;
const INK_TOP = 'rgba(10,12,16,0.93)';
const INK_BOT = 'rgba(5,6,9,0.95)';
const INK_SOFT = 'rgba(16,19,25,0.93)';
const HAIR = 'rgba(255,255,255,0.14)';
const TXT_HI = 'rgba(255,255,255,0.96)';
const TXT_MID = 'rgba(255,255,255,0.62)';
const TXT_LOW = 'rgba(255,255,255,0.38)';
const RED_LIVE = '#b00d23';

/** Ink slab with optional angled right cut, hairline and drop shadow. */
function inkSlab(ctx, x, y, w, h, { cut = 0, shadow = true, hairline = true, top = INK_TOP, bottom = INK_BOT } = {}) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (hairline) {
    ctx.fillStyle = HAIR;
    ctx.fillRect(x, y, w, 1);
  }
}

/** Tracked-out caps label — the broadcast kicker voice. */
function caps(ctx, text, x, y, { size = 17, weight = 600, color = TXT_MID, ls = '0.16em' } = {}) {
  ctx.save();
  ctx.font = F(weight, size);
  ctx.letterSpacing = ls;
  ctx.fillStyle = color;
  ctx.fillText(String(text).toUpperCase(), x, y);
  const w = ctx.measureText(String(text).toUpperCase()).width;
  ctx.restore();
  return w;
}

export class OverlayEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.anim = {};      // per-graphic show/hide animation clocks
    this.logoImg = null;
    this.tickerX = 0;
    this._lastT = 0;
    this.stillImg = null;
    // persistent clip player — its audio is wired into the mixer once
    this.vtrEl = document.createElement('video');
    this.vtrEl.crossOrigin = 'anonymous';
    this.vtrEl.playsInline = true;
    this.vtrEl.addEventListener('ended', () => {
      if (!state.graphics.vtr.loop) this.toggle('vtr', false);
    });
  }

  setStill(url) {
    if (!url) { this.stillImg = null; return; }
    const img = new Image();
    img.onload = () => { this.stillImg = img; };
    img.src = url;
  }

  setVtr(url) {
    this.vtrEl.src = url || '';
  }

  /** Re-flow the whole graphics layer to a new program format. */
  setFormat(w, h) {
    W = w; H = h;
    SAFE_X = Math.round(w * 0.05);
    SAFE_Y = Math.round(h * 0.05);
    this.canvas.width = w;
    this.canvas.height = h;
  }

  setLogo(url) {
    if (!url) { this.logoImg = null; return; }
    const img = new Image();
    img.onload = () => { this.logoImg = img; };
    img.src = url;
  }

  /** Toggle with animation; key = graphics key in state.graphics */
  toggle(key, on) {
    state.graphics[key].on = on;
    this.anim[key] = { t: 0, dir: on ? 1 : -1 };
    if (key === 'countdown' && on) { this._cdStart = Date.now(); this._cdDone = false; }
    if (key === 'vtr') {
      if (on) {
        this.vtrEl.loop = !!state.graphics.vtr.loop;
        this.vtrEl.currentTime = 0;
        this.vtrEl.play().catch(() => {});
      } else {
        this.vtrEl.pause();
      }
    }
  }

  _phase(key) {
    // returns 0..1 visibility phase for animated in/out (eased)
    const a = this.anim[key];
    const on = state.graphics[key].on;
    if (!a) return on ? 1 : 0;
    const d = DUR[key] || { in: 0.45, out: 0.35 };
    return a.dir > 0 ? EASE(a.t / d.in) : 1 - EASE(a.t / d.out);
  }

  _rawPhase(key) {
    // linear 0..1 phase + direction, for graphics that choreograph their own elements
    const a = this.anim[key];
    const on = state.graphics[key].on;
    if (!a) return { ph: on ? 1 : 0, dir: 1 };
    const d = DUR[key] || { in: 0.45, out: 0.35 };
    return a.dir > 0
      ? { ph: clamp01(a.t / d.in), dir: 1 }
      : { ph: 1 - clamp01(a.t / d.out), dir: -1 };
  }

  render(time) {
    const dt = this._lastT ? (time - this._lastT) / 1000 : 0.016;
    this._lastT = time;
    for (const k of Object.keys(this.anim)) {
      this.anim[k].t += dt;
      const d = DUR[k] || { in: 0.45, out: 0.35 };
      if (this.anim[k].t > Math.max(d.in, d.out) + 0.1) delete this.anim[k];
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    const g = state.graphics;
    const brand = state.brand;

    if (g.vtr.on || this.anim.vtr) this.drawVtr(ctx, this._phase('vtr'));
    if (g.still.on || this.anim.still) this.drawStill(ctx, this._phase('still'));
    if (g.fullscreen.on || this.anim.fullscreen) this.drawFullscreen(ctx, this._phase('fullscreen'));
    if (g.ticker.on || this.anim.ticker) this.drawTicker(ctx, dt, this._phase('ticker'));
    if (g.finance.on || this.anim.finance) this.drawFinance(ctx, this._phase('finance'));
    if (g.election.on || this.anim.election) this.drawElection(ctx, this._phase('election'));
    if (g.weather.on || this.anim.weather) this.drawWeather(ctx, this._phase('weather'));
    if (g.music.on || this.anim.music) this.drawMusic(ctx, this._phase('music'));
    if (g.comment.on || this.anim.comment) this.drawComment(ctx, this._phase('comment'));
    if (g.lowerThird.on || this.anim.lowerThird) this.drawLowerThird(ctx, time);
    if (g.banner.on || this.anim.banner) this.drawBanner(ctx, time, this._phase('banner'));
    if (g.title.on || this.anim.title) this.drawTitle(ctx, this._phase('title'));
    if (g.scoreboard.on || this.anim.scoreboard) this.drawScoreboard(ctx, this._phase('scoreboard'));
    if (g.dataCard.on || this.anim.dataCard) this.drawDataCard(ctx, this._phase('dataCard'));
    if (g.countdown.on || this.anim.countdown) this.drawCountdown(ctx, this._phase('countdown'));
    if (g.logoBug.on || this.anim.logoBug) this.drawLogoBug(ctx, this._phase('logoBug'));
    if (g.clock.on || this.anim.clock) this.drawClock(ctx, this._phase('clock'));
    if (this._stinger) this.drawStinger(ctx, time);
  }

  /**
   * Premium lower third: staggered slab choreography, material themes
   * (glass / carbon / metal), logo slot, topic kicker, location field and
   * pulsing live-status chip. All fields {{token}}-bindable, title-safe.
   */
  drawLowerThird(ctx, time) {
    const { ph, dir } = this._rawPhase('lowerThird');
    if (ph <= 0) return;
    const g = state.graphics.lowerThird;
    const brand = state.brand;
    const name = tok(g.name);
    const title = tok(g.title).toUpperCase();
    const location = tok(g.location || '').toUpperCase();
    const topic = tok(g.topic || '').toUpperCase();
    const status = tok(g.status || '').toUpperCase();
    const E = dir > 0 ? OUT_QUINT : (t) => 1 - IN_CUBIC(1 - clamp01(t));

    const tickerOn = state.graphics.ticker.on;
    const baseY = tickerOn ? H - 232 : H - 168;
    const x = SAFE_X;
    const logoW = this.logoImg ? 84 : 0;
    const textX = x + 12 + (logoW ? logoW + 16 : 22);

    // responsive width from real text metrics, clamped to title-safe
    ctx.save();
    ctx.font = F(600, 36);
    const nameW = ctx.measureText(name).width;
    ctx.font = F(600, 18);
    ctx.letterSpacing = '0.1em';
    const titleW = ctx.measureText(title).width + (location ? ctx.measureText(location).width + 42 : 0);
    ctx.restore();
    const statusW = status ? 150 : 0;
    // title slab is 0.85×w — size w so both rows fit their text
    const w = Math.min(W - 2 * SAFE_X,
      Math.max(420, Math.max(nameW + (textX - x) + statusW + 60,
        (titleW + (textX - x) + 40) / 0.85)));

    // element stagger windows over the linear phase
    const spine = E(seg(ph, 0, 0.3));
    const slab1 = E(seg(ph, 0.08, 0.55));
    const slab2 = E(seg(ph, 0.22, 0.7));
    const meta = E(seg(ph, 0.42, 0.85));
    const chip = (dir > 0 ? BACK_OUT : E)(seg(ph, 0.55, 1));

    const slabPaint = (x0, y0, w0, h0) => {
      if (g.theme === 'carbon') {
        inkSlab(ctx, x0, y0, w0, h0, { cut: 16, top: 'rgba(9,10,13,0.97)', bottom: 'rgba(9,10,13,0.97)' });
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, w0, h0); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        for (let d = -h0; d < w0; d += 7) {
          ctx.beginPath();
          ctx.moveTo(x0 + d, y0 + h0);
          ctx.lineTo(x0 + d + h0, y0);
          ctx.stroke();
        }
        ctx.restore();
      } else if (g.theme === 'metal') {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 10;
        const m = ctx.createLinearGradient(0, y0, 0, y0 + h0);
        m.addColorStop(0, '#2c3340');
        m.addColorStop(0.48, '#191e28');
        m.addColorStop(0.52, '#13171f');
        m.addColorStop(1, '#1f2530');
        ctx.fillStyle = m;
        ctx.fillRect(x0, y0, w0, h0);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x0, y0 + h0 * 0.46, w0, 1);
        ctx.fillStyle = HAIR;
        ctx.fillRect(x0, y0, w0, 1);
      } else { // glass
        inkSlab(ctx, x0, y0, w0, h0, { cut: 16 });
      }
    };

    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.5);
    ctx.textBaseline = 'middle';

    // topic kicker — quiet tracked caps above the strap, accent tick
    if (topic && meta > 0) {
      ctx.save();
      ctx.globalAlpha *= meta;
      const ty = baseY - 30 + (1 - meta) * 12;
      ctx.fillStyle = brand.accent;
      ctx.fillRect(x, ty - 1, 3, 18);
      caps(ctx, topic, x + 14, ty + 8, { size: 16, color: 'rgba(255,255,255,0.85)', ls: '0.22em' });
      ctx.restore();
    }

    // accent spine grows up from the baseline — a rule, not a block
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, baseY + 98 * (1 - spine), 4, 98 * spine);

    // name slab wipes right; text is revealed by the wipe (clip)
    if (slab1 > 0) {
      slabPaint(x + 4, baseY, w * slab1, 62);
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, baseY, w * slab1, 62); ctx.clip();
      if (this.logoImg) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + 6, baseY + 5, logoW, 52);
        const s = Math.min((logoW - 12) / this.logoImg.width, 42 / this.logoImg.height);
        const lw = this.logoImg.width * s, lh = this.logoImg.height * s;
        ctx.drawImage(this.logoImg, x + 6 + (logoW - lw) / 2, baseY + 5 + (52 - lh) / 2, lw, lh);
      }
      ctx.fillStyle = TXT_HI;
      ctx.font = F(600, 36);
      ctx.fillText(name, textX, baseY + 33);
      ctx.restore();
    }

    // title row: quieter ink, primary rule on the left edge
    if (slab2 > 0) {
      const tw2 = w * 0.85 * slab2;
      inkSlab(ctx, x + 4, baseY + 62, tw2, 36, { cut: 12, top: INK_SOFT, bottom: INK_SOFT, hairline: false, shadow: false });
      ctx.fillStyle = brand.primary;
      ctx.fillRect(x + 4, baseY + 62, Math.min(3, tw2), 36);
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, baseY + 62, tw2, 36); ctx.clip();
      let tx2 = textX;
      tx2 += caps(ctx, title, tx2, baseY + 81, { size: 18, color: 'rgba(255,255,255,0.88)', ls: '0.1em' });
      if (location) {
        ctx.fillStyle = TXT_LOW;
        ctx.fillRect(tx2 + 14, baseY + 74, 1, 13);
        caps(ctx, location, tx2 + 28, baseY + 81, { size: 16, color: TXT_MID, ls: '0.1em' });
      }
      ctx.restore();
    }

    // live-status chip pops on last with a slight overshoot
    if (status && chip > 0) {
      ctx.save();
      ctx.font = F(700, 15);
      ctx.letterSpacing = '0.14em';
      const sw = ctx.measureText(status).width;
      const cw = sw + 44, chh = 28;
      const cx2 = x + 4 + w - cw - 14, cy2 = baseY + 17;
      ctx.translate(cx2 + cw / 2, cy2 + chh / 2);
      ctx.scale(chip, chip);
      ctx.globalAlpha *= clamp01(chip);
      ctx.fillStyle = RED_LIVE;
      rounded(ctx, -cw / 2, -chh / 2, cw, chh, 3);
      ctx.fill();
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(time / 460));
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.beginPath();
      ctx.arc(-cw / 2 + 15, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(status, -cw / 2 + 27, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTicker(ctx, dt, ph) {
    if (ph <= 0) return;
    const t = state.graphics.ticker;
    const brand = state.brand;
    const barH = 56;
    const y = H - barH - 36 + (1 - ph) * (barH + 40);

    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.4);
    // bar: ink with a 2px accent rule and a hairline
    ctx.fillStyle = 'rgba(7,8,11,0.95)';
    ctx.fillRect(0, y, W, barH);
    ctx.fillStyle = HAIR;
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(0, y - 2, W, 2);

    // scrolling text (clip after the label block)
    const labelW = 196;
    ctx.save();
    ctx.beginPath();
    ctx.rect(labelW, y, W - labelW, barH);
    ctx.clip();
    ctx.font = F(500, 25);
    const sep = '        ·        ';
    const txt = tok(t.text || '') + sep;
    const tw = Math.max(ctx.measureText(txt).width, 400);
    this.tickerX -= dt * 110 * (t.speed || 1);
    if (this.tickerX < -tw) this.tickerX += tw;
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.textBaseline = 'middle';
    for (let xx = this.tickerX; xx < W; xx += tw) {
      ctx.fillText(txt, labelW + 26 + xx, y + barH / 2 + 1);
    }
    ctx.restore();

    // label block: darker ink, accent edge, tracked caps
    ctx.fillStyle = 'rgba(13,15,20,0.97)';
    ctx.fillRect(0, y, labelW, barH);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(0, y, 3, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(labelW - 1, y + 10, 1, barH - 20);
    ctx.textBaseline = 'middle';
    caps(ctx, tok(t.label || 'LATEST'), 24, y + barH / 2 + 1, { size: 19, weight: 700, color: TXT_HI, ls: '0.18em' });
    ctx.restore();
  }

  drawBanner(ctx, time, ph) {
    if (ph <= 0) return;
    const text = tok(state.graphics.banner.text || 'BREAKING NEWS');
    const tickerOn = state.graphics.ticker.on;
    const y = (tickerOn ? H - 322 : H - 262) + (1 - ph) * 40;

    ctx.save();
    ctx.globalAlpha = ph;
    ctx.textBaseline = 'middle';
    ctx.font = F(700, 42);
    ctx.letterSpacing = '0.04em';
    const textW = ctx.measureText(text).width;
    const kickW = 132;
    const w = textW + kickW + 76;
    // ink body with deep-red flag block — colour as a signal, not a flood
    inkSlab(ctx, SAFE_X, y, w * ph, 64, { cut: 16, top: 'rgba(12,8,9,0.95)', bottom: 'rgba(7,4,5,0.96)' });
    const fg = ctx.createLinearGradient(0, y, 0, y + 64);
    fg.addColorStop(0, '#c11226');
    fg.addColorStop(1, '#8c0d1c');
    ctx.fillStyle = fg;
    ctx.fillRect(SAFE_X, y, kickW, 64);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time / 480));
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.beginPath();
    ctx.arc(SAFE_X + 22, y + 32, 4, 0, Math.PI * 2);
    ctx.fill();
    caps(ctx, 'ALERT', SAFE_X + 36, y + 33, { size: 17, weight: 700, color: '#fff', ls: '0.18em' });
    ctx.save();
    ctx.beginPath(); ctx.rect(SAFE_X, y, w * ph, 64); ctx.clip();
    ctx.fillStyle = TXT_HI;
    ctx.font = F(700, 42);
    ctx.letterSpacing = '0.04em';
    ctx.fillText(text, SAFE_X + kickW + 28, y + 34);
    ctx.restore();
    ctx.restore();
  }

  drawTitle(ctx, ph) {
    if (ph <= 0) return;
    const brand = state.brand;
    const text = tok(state.graphics.title.text || 'THE EVENING REPORT');
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = H * 0.44 + (1 - ph) * 26;
    // quiet scrim, hairline rules, light display type — no slab box
    const grad = ctx.createLinearGradient(0, y - 130, 0, y + 130);
    grad.addColorStop(0, 'rgba(4,5,8,0)');
    grad.addColorStop(0.5, 'rgba(4,5,8,0.82)');
    grad.addColorStop(1, 'rgba(4,5,8,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 130, W, 260);
    ctx.font = F(300, 86);
    ctx.letterSpacing = '0.06em';
    const tw = ctx.measureText(text.toUpperCase()).width;
    ctx.fillStyle = TXT_HI;
    ctx.fillText(text.toUpperCase(), W / 2, y);
    const ruleW = Math.min(tw + 80, W - 2 * SAFE_X);
    ctx.fillStyle = HAIR;
    ctx.fillRect(W / 2 - ruleW / 2, y - 74, ruleW, 1);
    ctx.fillRect(W / 2 - ruleW / 2, y + 66, ruleW, 1);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(W / 2 - 26, y + 66, 52, 2);
    ctx.textAlign = 'center';
    caps(ctx, brand.name || '', W / 2, y + 96, { size: 19, color: TXT_MID, ls: '0.34em' });
    ctx.textAlign = 'left';
    ctx.restore();
  }

  drawLogoBug(ctx, ph) {
    if (ph <= 0) return;
    const cfg = state.graphics.logoBug;
    ctx.save();
    ctx.globalAlpha = ph * (cfg.opacity ?? 0.95);
    const size = 110 * (cfg.size || 1);
    const pad = 56;
    const pos = {
      tr: [W - pad - size, pad], tl: [pad, pad],
      br: [W - pad - size, H - pad - size], bl: [pad, H - pad - size]
    }[cfg.corner || 'tr'];
    if (this.logoImg) {
      const ar = this.logoImg.width / this.logoImg.height;
      const w = ar >= 1 ? size : size * ar;
      const h = ar >= 1 ? size / ar : size;
      ctx.drawImage(this.logoImg, pos[0] + (size - w) / 2, pos[1] + (size - h) / 2, w, h);
    } else {
      // monogram fallback from station name — quiet ink chip, hairline
      const brand = state.brand;
      ctx.fillStyle = 'rgba(8,9,12,0.72)';
      rounded(ctx, pos[0], pos[1], size, size, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      rounded(ctx, pos[0] + 0.5, pos[1] + 0.5, size - 1, size - 1, 6);
      ctx.stroke();
      ctx.fillStyle = brand.accent;
      ctx.fillRect(pos[0] + size * 0.3, pos[1] + size - 7, size * 0.4, 2);
      ctx.fillStyle = TXT_HI;
      ctx.font = F(600, Math.round(size * 0.38));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const initials = (brand.name || 'CS').split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
      ctx.fillText(initials, pos[0] + size / 2, pos[1] + size / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /** Two-team score strap — top centre, single ink strap, hairline dividers. */
  drawScoreboard(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.scoreboard;
    const brand = state.brand;
    const y = 56 - (1 - ph) * 90;
    const cx = W / 2;
    const teamW = 280, scoreW = 96, midW = 110, h = 58;
    const total = teamW * 2 + scoreW * 2 + midW;
    const x0 = cx - total / 2;
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x0, y, total, h, {});
    // hairline dividers between cells
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (const dx of [teamW, teamW + scoreW, teamW + scoreW + midW, teamW + scoreW * 2 + midW]) {
      ctx.fillRect(x0 + dx, y + 10, 1, h - 20);
    }
    // scores: light numerals on a slightly lifted cell
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x0 + teamW, y, scoreW, h);
    ctx.fillRect(x0 + teamW + scoreW + midW, y, scoreW, h);
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 44);
    ctx.textAlign = 'center';
    ctx.fillText(tok(g.scoreHome), x0 + teamW + scoreW / 2, y + h / 2 + 2);
    ctx.fillText(tok(g.scoreAway), x0 + teamW + scoreW + midW + scoreW / 2, y + h / 2 + 2);
    // centre label: accent caps, no filled block
    caps(ctx, tok(g.label), x0 + teamW + scoreW + midW / 2, y + h / 2 + 2,
      { size: 16, weight: 700, color: brand.accent, ls: '0.18em' });
    // team names
    ctx.fillStyle = TXT_HI;
    ctx.font = F(600, 26);
    ctx.textAlign = 'right';
    ctx.fillText(tok(g.home).toUpperCase().slice(0, 14), x0 + teamW - 22, y + h / 2 + 2);
    ctx.textAlign = 'left';
    ctx.fillText(tok(g.away).toUpperCase().slice(0, 14), x0 + teamW + scoreW * 2 + midW + 22, y + h / 2 + 2);
    // accent baseline rule
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x0, y + h, total, 2);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /** Side data panel — kicker, large light value, sub line. */
  drawDataCard(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.dataCard;
    const brand = state.brand;
    const w = 430, h = 218;
    const x = W - SAFE_X - w + (1 - ph) * (w + 100);
    const y = 200;
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, {});
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, 3, h);
    caps(ctx, tok(g.kicker), x + 30, y + 36, { size: 17, color: TXT_MID, ls: '0.2em' });
    ctx.fillStyle = HAIR;
    ctx.fillRect(x + 30, y + 58, w - 60, 1);
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 80);
    ctx.fillText(tok(g.value), x + 28, y + 116);
    ctx.font = F(500, 24);
    ctx.fillStyle = TXT_MID;
    ctx.fillText(tok(g.sub), x + 30, y + 180);
    ctx.restore();
  }

  /** Countdown to zero with label; flashes and auto-clears at 0. */
  drawCountdown(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.countdown;
    if (!this._cdStart) this._cdStart = Date.now();
    const remain = Math.max(0, g.seconds - (Date.now() - this._cdStart) / 1000);
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(Math.floor(remain % 60)).padStart(2, '0');
    const brand = state.brand;
    const w = 360, h = 92;
    const x = W / 2 - w / 2, y = H - 260 - (1 - ph) * 60;
    ctx.save();
    ctx.globalAlpha = ph * (remain === 0 ? 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 180)) : 1);
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, {});
    caps(ctx, tok(g.label), x + 26, y + 26, { size: 16, color: TXT_MID, ls: '0.2em' });
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 50);
    ctx.fillText(mm + ':' + ss, x + 24, y + 62);
    // progress: thin rule, accent remaining
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 190, y + 58, w - 216, 4);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x + 190, y + 58, (w - 216) * (g.seconds ? remain / g.seconds : 0), 4);
    ctx.restore();
    if (remain === 0 && !this._cdDone) {
      this._cdDone = true;
      setTimeout(() => { this.toggle('countdown', false); this._cdStart = null; this._cdDone = false; }, 3000);
    }
  }

  /** One-shot stinger: full-frame branded diagonal sweep (~0.9s). */
  fireStinger() {
    this._stinger = { t0: performance.now() };
  }

  drawStinger(ctx, time) {
    const el = (time - this._stinger.t0) / 900; // 0..1
    if (el >= 1) { this._stinger = null; return; }
    const brand = state.brand;
    // two bands sweep across, crossing at the midpoint
    const sweep = (off, col, lead) => {
      const x = -W * 0.6 + (W * 2.2) * EASE(Math.min(Math.max(el * 1.15 - off, 0), 1));
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(-0.18);
      const g2 = ctx.createLinearGradient(-300, 0, 300, 0);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(0.5, col);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(-360, -300, 720, H + 600);
      if (lead && el > 0.35 && el < 0.62) {
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.font = F(300, 104);
        ctx.letterSpacing = '0.1em';
        ctx.textAlign = 'center';
        ctx.fillText(state.brand.name.toUpperCase(), 0, H / 2);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    };
    sweep(0, hexA2(brand.primary, 0.96), true);
    sweep(0.12, hexA2(brand.accent, 0.9), false);
  }

  /** Election results: header + party rows with animated vote bars. */
  drawElection(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.election;
    const brand = state.brand;
    const w = 460, rowH = 56, headH = 52;
    const rows = g.rows || [];
    const h = headH + rows.length * rowH + 14;
    const x = W - SAFE_X - w + (1 - ph) * (w + SAFE_X + 20);
    const y = 170;
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, {});
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, 3, h);
    // header: tracked caps over a hairline — no filled bar
    caps(ctx, tok(g.title), x + 24, y + 30, { size: 19, weight: 700, color: TXT_HI, ls: '0.14em' });
    const rep = tok(g.reporting);
    if (rep && rep !== '—') {
      ctx.textAlign = 'right';
      caps(ctx, rep + ' reporting', x + w - 20, y + 30, { size: 14, color: TXT_LOW, ls: '0.12em' });
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = HAIR;
    ctx.fillRect(x + 24, y + headH - 6, w - 44, 1);
    // rows: leading party gets the accent marker
    const pcts = rows.map((r) => parseFloat(String(tok(r.pct)).replace(/[^\d.]/g, '')) || 0);
    const lead = pcts.indexOf(Math.max(...pcts));
    rows.forEach((r, i) => {
      const ry = y + headH + 8 + i * rowH;
      const barW = (w - 196) * Math.min(1, pcts[i] / 100) * ph;
      if (i === lead) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x + 3, ry - 4, w - 3, rowH - 4);
        ctx.fillStyle = brand.accent;
        ctx.fillRect(x + 3, ry - 4, 2, rowH - 4);
      }
      ctx.fillStyle = i === lead ? TXT_HI : 'rgba(255,255,255,0.78)';
      ctx.font = F(600, 19);
      ctx.fillText(tok(r.party).toUpperCase().slice(0, 18), x + 24, ry + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + 24, ry + 26, w - 196, 6);
      ctx.fillStyle = r.color || brand.primary;
      ctx.fillRect(x + 24, ry + 26, barW, 6);
      ctx.fillStyle = TXT_HI;
      ctx.font = F(300, 32);
      ctx.textAlign = 'right';
      ctx.fillText(pcts[i] ? pcts[i].toFixed(pcts[i] % 1 ? 1 : 0) + '%' : tok(r.pct), x + w - 22, ry + 18);
      ctx.textAlign = 'left';
    });
    ctx.restore();
  }

  /** Weather panel: drawn condition glyph + temperature + location. */
  drawWeather(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.weather;
    const brand = state.brand;
    const w = 330, h = 120;
    const x = SAFE_X, y = SAFE_Y + (1 - ph) * -(h + SAFE_Y + 10);
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, {});
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y + h - 2, w, 2);
    // condition glyph — drawn, no icon fonts
    const gx = x + 56, gy = y + h / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 2.25;
    const cloud = () => {
      ctx.beginPath();
      ctx.arc(gx - 12, gy + 4, 13, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(gx, gy - 8, 15, Math.PI * 0.8, Math.PI * 1.95);
      ctx.arc(gx + 16, gy + 4, 12, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath(); ctx.stroke();
    };
    if (g.cond === 'clear') {
      ctx.beginPath(); ctx.arc(gx, gy, 14, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(a) * 20, gy + Math.sin(a) * 20);
        ctx.lineTo(gx + Math.cos(a) * 27, gy + Math.sin(a) * 27);
        ctx.stroke();
      }
    } else if (g.cond === 'rain' || g.cond === 'storm') {
      cloud();
      if (g.cond === 'rain') {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(gx + i * 12, gy + 16);
          ctx.lineTo(gx + i * 12 - 5, gy + 28);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(gx + 4, gy + 12); ctx.lineTo(gx - 6, gy + 24);
        ctx.lineTo(gx + 2, gy + 24); ctx.lineTo(gx - 6, gy + 38);
        ctx.lineWidth = 2.5; ctx.stroke();
      }
    } else if (g.cond === 'snow') {
      cloud();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(gx + i * 12, gy + 22, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    } else cloud();
    // temperature + location
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 54);
    const temp = tok(g.temp);
    ctx.fillText(temp + (/[°CF]/.test(temp) ? '' : '°'), x + 106, y + 44);
    caps(ctx, tok(g.location).slice(0, 22), x + 108, y + 86, { size: 15, color: TXT_MID, ls: '0.18em' });
    if (g.high || g.low) {
      ctx.textAlign = 'right';
      caps(ctx, (g.high ? 'H ' + tok(g.high) : '') + (g.low ? '  L ' + tok(g.low) : ''),
        x + w - 16, y + 86, { size: 14, color: TXT_LOW, ls: '0.08em' });
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /** Market strip: instruments with price and signed delta colouring. */
  drawFinance(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.finance;
    const brand = state.brand;
    const barH = 58;
    const tickerOn = state.graphics.ticker.on;
    const y = (tickerOn ? H - 36 - 64 - barH - 6 : H - 36 - barH) + (1 - ph) * (barH + 40);
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(7,8,11,0.95)';
    ctx.fillRect(0, y, W, barH);
    ctx.fillStyle = HAIR;
    ctx.fillRect(0, y, W, 1);
    const labelW = 196;
    ctx.fillStyle = 'rgba(13,15,20,0.97)';
    ctx.fillRect(0, y, labelW, barH);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(0, y, 3, barH);
    caps(ctx, tok(g.label), 24, y + barH / 2 + 1, { size: 18, weight: 700, color: TXT_HI, ls: '0.18em' });
    const items = g.items || [];
    const cellW = (W - labelW) / Math.max(1, items.length);
    items.forEach((it, i) => {
      const cx2 = labelW + i * cellW + 34;
      let tx2 = cx2 + caps(ctx, tok(it.sym), cx2, y + barH / 2 + 1, { size: 17, color: TXT_MID, ls: '0.08em' });
      ctx.font = F(500, 23);
      ctx.fillStyle = TXT_HI;
      ctx.fillText(tok(it.price), tx2 + 22, y + barH / 2 + 1);
      const priceW = ctx.measureText(tok(it.price)).width;
      const delta = tok(it.delta);
      const neg = /^-/.test(delta);
      ctx.fillStyle = neg ? '#d8525c' : '#3aa86b';
      ctx.font = F(600, 17);
      ctx.fillText((neg ? '▼ ' : '▲ ') + delta.replace(/^[-+]/, ''), tx2 + 22 + priceW + 20, y + barH / 2 + 1);
      if (i) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(labelW + i * cellW, y + 12, 1, barH - 24);
      }
    });
    ctx.restore();
  }

  /** Now-playing card: song, artist, station — ZAMCOPS metadata ready. */
  drawMusic(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.music;
    const brand = state.brand;
    const song = tok(g.song), artist = tok(g.artist);
    ctx.font = F(600, 26);
    const w = Math.min(620, Math.max(360, ctx.measureText(song).width + 150));
    const h = 96;
    const ltOn = state.graphics.lowerThird.on;
    const x = SAFE_X + (1 - ph) * -(w + SAFE_X + 20);
    const y = (ltOn ? H - 320 : H - 168) - (state.graphics.ticker.on ? 64 : 0);
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, { cut: 14 });
    // beat bars: thin accent meters on ink — no filled badge block
    const t = Date.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const bh = 12 + 16 * Math.abs(Math.sin(t * 2.4 + i * 1.1));
      ctx.fillStyle = i ? 'rgba(255,255,255,0.4)' : brand.accent;
      ctx.fillRect(x + 22 + i * 9, y + h / 2 + 15 - bh, 4, bh);
    }
    ctx.fillStyle = TXT_HI;
    ctx.font = F(600, 26);
    ctx.fillText(song, x + 78, y + 30);
    const royalty = tok(g.royalty);
    caps(ctx, artist + (g.station ? '   ·   ' + tok(g.station) : '')
      + (royalty && royalty !== '—' ? '   ·   ' + royalty : ''), x + 79, y + 64,
      { size: 15, color: TXT_MID, ls: '0.1em' });
    ctx.restore();
  }

  /** Full-frame data takeover: dim field + centred results table. */
  drawFullscreen(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.fullscreen;
    const brand = state.brand;
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.fillStyle = 'rgba(3,4,6,0.86)';
    ctx.fillRect(0, 0, W, H);
    const w = 1100, rows = g.rows || [];
    const rowH = 86, headH = 124;
    const h = headH + rows.length * rowH + 78;
    const x = W / 2 - w / 2, y = Math.max(SAFE_Y + 20, H / 2 - h / 2) + (1 - ph) * 40;
    inkSlab(ctx, x, y, w, h, { top: 'rgba(9,11,15,0.97)', bottom: 'rgba(6,7,10,0.98)' });
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, w, 2);
    ctx.textBaseline = 'middle';
    caps(ctx, tok(g.kicker), x + 56, y + 46, { size: 16, color: brand.accent, ls: '0.3em' });
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 54);
    ctx.letterSpacing = '0.02em';
    ctx.fillText(tok(g.title).toUpperCase(), x + 53, y + 92);
    ctx.letterSpacing = '0px';
    rows.forEach((r, i) => {
      const ry = y + headH + 16 + i * rowH;
      const reveal = clamp01(ph * 1.4 - i * 0.08);
      ctx.globalAlpha = ph * reveal;
      ctx.fillStyle = HAIR;
      ctx.fillRect(x + 56, ry, (w - 112) * reveal, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = F(500, 28);
      ctx.fillText(tok(r.k).toUpperCase().slice(0, 30), x + 56, ry + rowH / 2 + 2);
      ctx.fillStyle = TXT_HI;
      ctx.font = F(300, 42);
      ctx.textAlign = 'right';
      ctx.fillText(tok(r.v), x + w - 56, ry + rowH / 2 + 2);
      ctx.textAlign = 'left';
    });
    ctx.globalAlpha = ph;
    caps(ctx, state.brand.name || '', x + 56, y + h - 30, { size: 14, color: TXT_LOW, ls: '0.3em' });
    ctx.restore();
  }

  /** Viewer comment card: handle, tag chip and wrapped comment body. */
  drawComment(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.comment;
    const brand = state.brand;
    const w = 520;
    const text = tok(g.text);
    ctx.font = F(400, 23);
    // wrap to max 3 lines
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const wd of words) {
      const probe = line ? line + ' ' + wd : wd;
      if (ctx.measureText(probe).width > w - 60 && line) {
        lines.push(line); line = wd;
        if (lines.length === 3) break;
      } else line = probe;
    }
    if (line && lines.length < 3) lines.push(line);
    const h = 70 + lines.length * 32 + 18;
    const x = SAFE_X + (1 - ph) * -(w + SAFE_X + 20);
    const y = H * 0.32;
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    inkSlab(ctx, x, y, w, h, { cut: 14 });
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = TXT_HI;
    ctx.font = F(600, 22);
    ctx.fillText(tok(g.user), x + 28, y + 32);
    if (g.tag) {
      const tw = ctx.measureText(tok(g.user)).width;
      const tagX = x + 28 + tw + 16;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.save();
      ctx.font = F(600, 12);
      ctx.letterSpacing = '0.14em';
      const tagTxt = tok(g.tag).toUpperCase();
      const tagW = ctx.measureText(tagTxt).width + 18;
      ctx.strokeRect(tagX + 0.5, y + 21.5, tagW, 21);
      ctx.fillStyle = TXT_MID;
      ctx.fillText(tagTxt, tagX + 9, y + 33);
      ctx.restore();
    }
    ctx.font = F(400, 23);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    lines.forEach((l, i) => ctx.fillText(l, x + 28, y + 70 + i * 32));
    ctx.restore();
  }

  /** Imported still: full-frame (fit) or corner insert with shadow. */
  drawStill(ctx, ph) {
    if (ph <= 0 || !this.stillImg) return;
    const g = state.graphics.still;
    const img = this.stillImg;
    ctx.save();
    ctx.globalAlpha = ph * (g.opacity ?? 1);
    if (g.mode === 'full') {
      const s = Math.min(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const maxW = W * 0.28 * (g.size || 1);
      const s = Math.min(maxW / img.width, (H * 0.4) / img.height);
      const dw = img.width * s, dh = img.height * s;
      const pos = {
        tr: [W - SAFE_X - dw, SAFE_Y], tl: [SAFE_X, SAFE_Y],
        br: [W - SAFE_X - dw, H - SAFE_Y - dh], bl: [SAFE_X, H - SAFE_Y - dh]
      }[g.corner || 'br'];
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(img, pos[0], pos[1] + (1 - ph) * 24, dw, dh);
    }
    ctx.restore();
  }

  /** Clip playout: imported video over program, contain or cover. */
  drawVtr(ctx, ph) {
    if (ph <= 0) return;
    const v = this.vtrEl;
    if (!v.videoWidth) return;
    const g = state.graphics.vtr;
    ctx.save();
    ctx.globalAlpha = ph;
    if (g.fit === 'cover') {
      const s = Math.max(W / v.videoWidth, H / v.videoHeight);
      const dw = v.videoWidth * s, dh = v.videoHeight * s;
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,' + 0.92 * ph + ')';
      ctx.fillRect(0, 0, W, H);
      const s = Math.min(W / v.videoWidth, H / v.videoHeight);
      const dw = v.videoWidth * s, dh = v.videoHeight * s;
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.restore();
  }

  drawClock(ctx, ph) {
    if (ph <= 0) return;
    const now = new Date();
    const txt = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    // stack clear of the ticker, market strip and lower third
    const lift = (state.graphics.ticker.on ? 70 : 0) + (state.graphics.finance.on ? 64 : 0)
      + (state.graphics.lowerThird.on ? 118 : 0);
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.fillStyle = 'rgba(7,8,11,0.82)';
    rounded(ctx, 56, H - 116 - lift, 132, 48, 4);
    ctx.fill();
    ctx.fillStyle = HAIR;
    ctx.fillRect(56, H - 116 - lift, 132, 1);
    ctx.fillStyle = TXT_HI;
    ctx.font = F(300, 30);
    ctx.letterSpacing = '0.06em';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 80, H - 91 - lift);
    ctx.restore();
  }
}

function hexA2(hex, a) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
