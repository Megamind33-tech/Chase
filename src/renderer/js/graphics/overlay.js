// Broadcast graphics engine: lower thirds, ticker, logo bug, breaking
// banner, title card and clock — drawn on a 1920×1080 2D canvas that the
// compositor layers over the 3D program. All animation is time-based.
import { state, tok } from '../state.js';

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
    ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
    const nameW = ctx.measureText(name).width;
    ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
    const titleLine = title + (location ? '   ·   ' + location : '');
    const titleW = ctx.measureText(titleLine).width;
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
        ctx.fillStyle = 'rgba(9,11,16,0.97)';
        ctx.fillRect(x0, y0, w0, h0);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, w0, h0); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 1;
        for (let d = -h0; d < w0; d += 7) {
          ctx.beginPath();
          ctx.moveTo(x0 + d, y0 + h0);
          ctx.lineTo(x0 + d + h0, y0);
          ctx.stroke();
        }
        ctx.restore();
      } else if (g.theme === 'metal') {
        const m = ctx.createLinearGradient(0, y0, 0, y0 + h0);
        m.addColorStop(0, '#3d4658');
        m.addColorStop(0.48, '#222a3a');
        m.addColorStop(0.52, '#191f2d');
        m.addColorStop(1, '#2b3344');
        ctx.fillStyle = m;
        ctx.fillRect(x0, y0, w0, h0);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x0, y0 + h0 * 0.46, w0, 2);
      } else { // glass
        const grad = ctx.createLinearGradient(x0, 0, x0 + w0, 0);
        grad.addColorStop(0, 'rgba(10,13,20,0.94)');
        grad.addColorStop(1, 'rgba(10,13,20,0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(x0, y0, w0, h0);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x0, y0, w0, 1);
      }
    };

    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.5);
    ctx.textBaseline = 'middle';

    // topic kicker — slides down into place above the strap
    if (topic && meta > 0) {
      ctx.save();
      ctx.globalAlpha *= meta;
      ctx.font = '800 20px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(topic).width + 36;
      const ty = baseY - 36 + (1 - meta) * 14;
      ctx.fillStyle = brand.accent;
      ctx.fillRect(x + 10, ty, tw, 30);
      ctx.fillStyle = '#161102';
      ctx.fillText(topic, x + 28, ty + 16);
      ctx.restore();
    }

    // accent spine grows up from the baseline
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, baseY + 104 * (1 - spine), 10, 104 * spine);

    // name slab wipes right; text is revealed by the wipe (clip)
    if (slab1 > 0) {
      slabPaint(x + 10, baseY, w * slab1, 64);
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 10, baseY, w * slab1, 64); ctx.clip();
      if (this.logoImg) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x + 12, baseY + 4, logoW, 56);
        const s = Math.min((logoW - 10) / this.logoImg.width, 48 / this.logoImg.height);
        const lw = this.logoImg.width * s, lh = this.logoImg.height * s;
        ctx.drawImage(this.logoImg, x + 12 + (logoW - lw) / 2, baseY + 4 + (56 - lh) / 2, lw, lh);
      }
      ctx.fillStyle = '#fff';
      ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(name, textX, baseY + 34);
      ctx.restore();
    }

    // title slab tracks behind the name slab
    if (slab2 > 0) {
      const g2 = ctx.createLinearGradient(x, 0, x + w * 0.85, 0);
      g2.addColorStop(0, brand.primary);
      g2.addColorStop(1, shade(brand.primary, -0.4));
      ctx.fillStyle = g2;
      ctx.fillRect(x + 10, baseY + 64, w * 0.85 * slab2, 40);
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 10, baseY + 64, w * 0.85 * slab2, 40); ctx.clip();
      ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fillText(title, textX, baseY + 85);
      if (location) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText('·   ' + location, textX + ctx.measureText(title).width + 22, baseY + 85);
      }
      ctx.restore();
    }

    // live-status chip pops on last with a slight overshoot
    if (status && chip > 0) {
      const cw = 26 + status.length * 13, chh = 34;
      const cx2 = x + 10 + w - cw - 16, cy2 = baseY + 15;
      ctx.save();
      ctx.translate(cx2 + cw / 2, cy2 + chh / 2);
      ctx.scale(chip, chip);
      ctx.globalAlpha *= clamp01(chip);
      ctx.fillStyle = '#c8102e';
      rounded(ctx, -cw / 2, -chh / 2, cw, chh, 6);
      ctx.fill();
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time / 420));
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.beginPath();
      ctx.arc(-cw / 2 + 16, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(status, -cw / 2 + 30, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTicker(ctx, dt, ph) {
    if (ph <= 0) return;
    const t = state.graphics.ticker;
    const brand = state.brand;
    const barH = 64;
    const y = H - barH - 36 + (1 - ph) * (barH + 40);

    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.4);
    // bar
    ctx.fillStyle = 'rgba(8,10,16,0.93)';
    ctx.fillRect(0, y, W, barH);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(0, y - 4, W, 4);

    // scrolling text (clip after the label block)
    const labelW = 210;
    ctx.save();
    ctx.beginPath();
    ctx.rect(labelW, y, W - labelW, barH);
    ctx.clip();
    ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
    const sep = '      •      ';
    const txt = tok(t.text || '') + sep;
    const tw = Math.max(ctx.measureText(txt).width, 400);
    this.tickerX -= dt * 110 * (t.speed || 1);
    if (this.tickerX < -tw) this.tickerX += tw;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    for (let xx = this.tickerX; xx < W; xx += tw) {
      ctx.fillText(txt, labelW + 26 + xx, y + barH / 2 + 2);
    }
    ctx.restore();

    // label block
    const lg = ctx.createLinearGradient(0, y, 0, y + barH);
    lg.addColorStop(0, brand.primary);
    lg.addColorStop(1, shade(brand.primary, -0.45));
    ctx.fillStyle = lg;
    ctx.fillRect(0, y, labelW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(tok(t.label || 'LATEST'), 24, y + barH / 2 + 2);
    ctx.restore();
  }

  drawBanner(ctx, time, ph) {
    if (ph <= 0) return;
    const brand = state.brand;
    const text = tok(state.graphics.banner.text || 'BREAKING NEWS');
    const tickerOn = state.graphics.ticker.on;
    const y = (tickerOn ? H - 330 : H - 270) + (1 - ph) * 40;
    const pulse = 0.85 + 0.15 * Math.sin(time / 280);

    ctx.save();
    ctx.globalAlpha = ph;
    ctx.font = '800 54px "Segoe UI", system-ui, sans-serif';
    const w = ctx.measureText(text).width + 90;
    const grad = ctx.createLinearGradient(96, 0, 96 + w, 0);
    grad.addColorStop(0, '#d31a2b');
    grad.addColorStop(1, '#8e0f1c');
    ctx.fillStyle = grad;
    ctx.fillRect(96, y, w * ph, 76);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(96, y + 76, w * ph, 6);
    ctx.globalAlpha = ph * pulse;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 96 + 44, y + 41);
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
    ctx.font = '800 92px "Segoe UI", system-ui, sans-serif';
    const y = H * 0.42 + (1 - ph) * 30;
    // glass slab
    const w = ctx.measureText(text).width + 160;
    ctx.fillStyle = 'rgba(8,10,16,0.78)';
    ctx.fillRect(W / 2 - w / 2, y - 86, w, 172);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(W / 2 - w / 2, y + 86, w, 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, W / 2, y);
    ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText((brand.name || '').toUpperCase(), W / 2, y + 130);
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
      // monogram fallback from station name
      const brand = state.brand;
      ctx.fillStyle = 'rgba(8,10,16,0.8)';
      rounded(ctx, pos[0], pos[1], size, size, 14);
      ctx.fill();
      ctx.strokeStyle = brand.accent;
      ctx.lineWidth = 3;
      rounded(ctx, pos[0], pos[1], size, size, 14);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(size * 0.42)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const initials = (brand.name || 'CS').split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
      ctx.fillText(initials, pos[0] + size / 2, pos[1] + size / 2 + 3);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /** Two-team score strap — top centre, broadcast slabs, data-bindable. */
  drawScoreboard(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.scoreboard;
    const brand = state.brand;
    const y = 56 - (1 - ph) * 90;
    const cx = W / 2;
    const teamW = 300, scoreW = 92, midW = 120, h = 64;
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.textBaseline = 'middle';
    // home slab
    let x = cx - midW / 2 - scoreW - teamW;
    const grad1 = ctx.createLinearGradient(x, y, x + teamW, y);
    grad1.addColorStop(0, 'rgba(8,10,16,0.94)');
    grad1.addColorStop(1, 'rgba(14,20,34,0.94)');
    ctx.fillStyle = grad1;
    ctx.fillRect(x, y, teamW, h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(tok(g.home).toUpperCase().slice(0, 14), x + teamW - 18, y + h / 2 + 2);
    // home score
    ctx.fillStyle = brand.primary;
    ctx.fillRect(cx - midW / 2 - scoreW, y, scoreW, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '800 38px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.scoreHome), cx - midW / 2 - scoreW / 2, y + h / 2 + 2);
    // centre label
    ctx.fillStyle = brand.accent;
    ctx.fillRect(cx - midW / 2, y, midW, h);
    ctx.fillStyle = '#1a1404';
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.label).toUpperCase(), cx, y + h / 2 + 2);
    // away score
    ctx.fillStyle = brand.primary;
    ctx.fillRect(cx + midW / 2, y, scoreW, h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 38px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.scoreAway), cx + midW / 2 + scoreW / 2, y + h / 2 + 2);
    // away slab
    x = cx + midW / 2 + scoreW;
    const grad2 = ctx.createLinearGradient(x, y, x + teamW, y);
    grad2.addColorStop(0, 'rgba(14,20,34,0.94)');
    grad2.addColorStop(1, 'rgba(8,10,16,0.94)');
    ctx.fillStyle = grad2;
    ctx.fillRect(x, y, teamW, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.away).toUpperCase().slice(0, 14), x + 18, y + h / 2 + 2);
    // underline
    ctx.fillStyle = brand.accent;
    ctx.fillRect(cx - midW / 2 - scoreW - teamW, y + h, teamW * 2 + scoreW * 2 + midW, 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /** Side data panel — kicker, large value, sub line. Election/finance. */
  drawDataCard(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.dataCard;
    const brand = state.brand;
    const w = 430, h = 230;
    const x = W - 96 - w + (1 - ph) * (w + 100);
    const y = 200;
    ctx.save();
    ctx.globalAlpha = ph;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(10,14,24,0.95)');
    grad.addColorStop(1, 'rgba(6,9,16,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, 8, h);
    ctx.fillStyle = brand.primary;
    ctx.fillRect(x + 8, y, w - 8, 46);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.kicker).toUpperCase(), x + 30, y + 25);
    ctx.font = '800 84px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.value), x + 30, y + 116);
    ctx.font = '600 28px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(tok(g.sub), x + 30, y + 184);
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
    const w = 380, h = 96;
    const x = W / 2 - w / 2, y = H - 260 - (1 - ph) * 60;
    ctx.save();
    ctx.globalAlpha = ph * (remain === 0 ? 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 180)) : 1);
    ctx.fillStyle = 'rgba(8,10,16,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y + h, w, 5);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '800 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.label).toUpperCase(), x + 26, y + 28);
    ctx.fillStyle = '#fff';
    ctx.font = '800 52px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(mm + ':' + ss, x + 26, y + 66);
    // progress bar
    ctx.fillStyle = brand.primary;
    ctx.fillRect(x + 200, y + 56, (w - 226) * (g.seconds ? remain / g.seconds : 0), 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(x + 200, y + 56, w - 226, 14);
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
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '800 110px "Segoe UI", system-ui, sans-serif';
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
    ctx.fillStyle = 'rgba(8,11,18,0.96)';
    ctx.fillRect(x, y, w, h);
    // header
    ctx.fillStyle = brand.primary;
    ctx.fillRect(x, y, w, headH);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.title).toUpperCase(), x + 22, y + headH / 2 + 1);
    const rep = tok(g.reporting);
    if (rep && rep !== '—') {
      ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(rep.toUpperCase() + ' REPORTING', x + w - 18, y + headH / 2 + 1);
      ctx.textAlign = 'left';
    }
    // rows: leading party gets the accent edge
    const pcts = rows.map((r) => parseFloat(String(tok(r.pct)).replace(/[^\d.]/g, '')) || 0);
    const lead = pcts.indexOf(Math.max(...pcts));
    rows.forEach((r, i) => {
      const ry = y + headH + 8 + i * rowH;
      const barW = (w - 200) * Math.min(1, pcts[i] / 100) * ph;
      if (i === lead) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, ry - 4, w, rowH - 4);
        ctx.fillStyle = brand.accent;
        ctx.fillRect(x, ry - 4, 5, rowH - 4);
      }
      ctx.fillStyle = '#fff';
      ctx.font = '700 21px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(tok(r.party).toUpperCase().slice(0, 18), x + 22, ry + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 22, ry + 26, w - 200, 12);
      ctx.fillStyle = r.color || brand.primary;
      ctx.fillRect(x + 22, ry + 26, barW, 12);
      ctx.font = '800 28px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(pcts[i] ? pcts[i].toFixed(pcts[i] % 1 ? 1 : 0) + '%' : tok(r.pct), x + w - 22, ry + 20);
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
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(10,14,24,0.95)');
    grad.addColorStop(1, 'rgba(6,9,16,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y + h, w, 4);
    // condition glyph — drawn, no icon fonts
    const gx = x + 56, gy = y + h / 2;
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3;
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
    ctx.fillStyle = '#fff';
    ctx.font = '800 52px "Segoe UI", system-ui, sans-serif';
    const temp = tok(g.temp);
    ctx.fillText(temp + (/[°CF]/.test(temp) ? '' : '°'), x + 108, y + 42);
    ctx.font = '700 19px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(tok(g.location).toUpperCase().slice(0, 22), x + 108, y + 84);
    if (g.high || g.low) {
      ctx.textAlign = 'right';
      ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText((g.high ? 'H ' + tok(g.high) : '') + (g.low ? '  L ' + tok(g.low) : ''), x + w - 16, y + 84);
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
    ctx.fillStyle = 'rgba(6,9,15,0.95)';
    ctx.fillRect(0, y, W, barH);
    const labelW = 200;
    ctx.fillStyle = '#0c1320';
    ctx.fillRect(0, y, labelW, barH);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(labelW - 4, y, 4, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.label).toUpperCase(), 24, y + barH / 2 + 1);
    const items = g.items || [];
    const cellW = (W - labelW) / Math.max(1, items.length);
    items.forEach((it, i) => {
      const cx2 = labelW + i * cellW + 30;
      ctx.font = '700 21px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(tok(it.sym).toUpperCase(), cx2, y + barH / 2 + 1);
      ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      const symW = ctx.measureText(tok(it.sym).toUpperCase()).width;
      ctx.fillText(tok(it.price), cx2 + symW + 26, y + barH / 2 + 1);
      const delta = tok(it.delta);
      const neg = /^-/.test(delta);
      const priceW = ctx.measureText(tok(it.price)).width;
      ctx.fillStyle = neg ? '#ef5350' : '#2fc966';
      ctx.font = '700 21px "Segoe UI", system-ui, sans-serif';
      ctx.fillText((neg ? '▼ ' : '▲ ') + delta.replace(/^[-+]/, ''), cx2 + symW + 26 + priceW + 22, y + barH / 2 + 1);
      if (i) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
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
    ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
    const w = Math.min(620, Math.max(360, ctx.measureText(song).width + 150));
    const h = 96;
    const ltOn = state.graphics.lowerThird.on;
    const x = SAFE_X + (1 - ph) * -(w + SAFE_X + 20);
    const y = (ltOn ? H - 320 : H - 168) - (state.graphics.ticker.on ? 64 : 0);
    ctx.save();
    ctx.globalAlpha = Math.min(1, ph * 1.3);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,11,18,0.94)';
    ctx.fillRect(x, y, w, h);
    // beat bars badge
    ctx.fillStyle = brand.primary;
    ctx.fillRect(x, y, 70, h);
    const t = Date.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const bh = 16 + 18 * Math.abs(Math.sin(t * 2.4 + i * 1.1));
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(x + 16 + i * 11, y + h / 2 + 17 - bh, 7, bh);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(song, x + 90, y + 30);
    ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const royalty = tok(g.royalty);
    ctx.fillText(artist.toUpperCase() + (g.station ? '  ·  ' + tok(g.station).toUpperCase() : '')
      + (royalty && royalty !== '—' ? '  ·  ' + royalty : ''), x + 90, y + 65);
    ctx.restore();
  }

  /** Full-frame data takeover: dim field + centred results table. */
  drawFullscreen(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.fullscreen;
    const brand = state.brand;
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.fillStyle = 'rgba(4,6,11,0.88)';
    ctx.fillRect(0, 0, W, H);
    const w = 1100, rows = g.rows || [];
    const rowH = 92, headH = 120;
    const h = headH + rows.length * rowH + 76;
    const x = W / 2 - w / 2, y = Math.max(SAFE_Y + 20, H / 2 - h / 2) + (1 - ph) * 40;
    ctx.fillStyle = 'rgba(10,14,24,0.97)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, w, 6);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = brand.accent;
    ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.kicker).toUpperCase(), x + 50, y + 48);
    ctx.fillStyle = '#fff';
    ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.title).toUpperCase(), x + 50, y + 92);
    rows.forEach((r, i) => {
      const ry = y + headH + 20 + i * rowH;
      const reveal = clamp01(ph * 1.4 - i * 0.08);
      ctx.globalAlpha = ph * reveal;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 30, ry, (w - 60) * reveal, rowH - 14);
      ctx.fillStyle = '#fff';
      ctx.font = '700 34px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(tok(r.k).toUpperCase().slice(0, 30), x + 60, ry + (rowH - 14) / 2);
      ctx.font = '800 42px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(tok(r.v), x + w - 60, ry + (rowH - 14) / 2);
      ctx.textAlign = 'left';
    });
    ctx.globalAlpha = ph;
    ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText((state.brand.name || '').toUpperCase(), x + 50, y + h - 26);
    ctx.restore();
  }

  /** Viewer comment card: handle, tag chip and wrapped comment body. */
  drawComment(ctx, ph) {
    if (ph <= 0) return;
    const g = state.graphics.comment;
    const brand = state.brand;
    const w = 520;
    const text = tok(g.text);
    ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
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
    ctx.fillStyle = 'rgba(8,11,18,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, y, 6, h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(tok(g.user), x + 28, y + 34);
    if (g.tag) {
      const tw = ctx.measureText(tok(g.user)).width;
      ctx.fillStyle = brand.primary;
      const tagTxt = tok(g.tag).toUpperCase();
      ctx.font = '800 14px "Segoe UI", system-ui, sans-serif';
      const tagW = ctx.measureText(tagTxt).width + 20;
      ctx.fillRect(x + 28 + tw + 16, y + 22, tagW, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(tagTxt, x + 28 + tw + 26, y + 35);
    }
    ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    lines.forEach((l, i) => ctx.fillText(l, x + 28, y + 72 + i * 32));
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
    ctx.fillStyle = 'rgba(8,10,16,0.8)';
    rounded(ctx, 56, H - 120 - lift, 150, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 32px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 84, H - 90 - lift);
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
