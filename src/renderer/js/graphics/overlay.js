// Broadcast graphics engine: lower thirds, ticker, logo bug, breaking
// banner, title card and clock — drawn on a 1920×1080 2D canvas that the
// compositor layers over the 3D program. All animation is time-based.
import { state, tok } from '../state.js';

const W = 1920, H = 1080;
const EASE = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

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
    // returns 0..1 visibility phase for animated in/out
    const a = this.anim[key];
    const on = state.graphics[key].on;
    if (!a) return on ? 1 : 0;
    return a.dir > 0 ? EASE(a.t / 0.45) : 1 - EASE(a.t / 0.35);
  }

  render(time) {
    const dt = this._lastT ? (time - this._lastT) / 1000 : 0.016;
    this._lastT = time;
    for (const k of Object.keys(this.anim)) {
      this.anim[k].t += dt;
      if (this.anim[k].t > 0.6) delete this.anim[k];
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    const g = state.graphics;
    const brand = state.brand;

    if (g.ticker.on || this.anim.ticker) this.drawTicker(ctx, dt, this._phase('ticker'));
    if (g.lowerThird.on || this.anim.lowerThird) this.drawLowerThird(ctx, this._phase('lowerThird'));
    if (g.banner.on || this.anim.banner) this.drawBanner(ctx, time, this._phase('banner'));
    if (g.title.on || this.anim.title) this.drawTitle(ctx, this._phase('title'));
    if (g.scoreboard.on || this.anim.scoreboard) this.drawScoreboard(ctx, this._phase('scoreboard'));
    if (g.dataCard.on || this.anim.dataCard) this.drawDataCard(ctx, this._phase('dataCard'));
    if (g.countdown.on || this.anim.countdown) this.drawCountdown(ctx, this._phase('countdown'));
    if (g.logoBug.on || this.anim.logoBug) this.drawLogoBug(ctx, this._phase('logoBug'));
    if (g.clock.on || this.anim.clock) this.drawClock(ctx, this._phase('clock'));
    if (this._stinger) this.drawStinger(ctx, time);
  }

  drawLowerThird(ctx, ph) {
    if (ph <= 0) return;
    const name = tok(state.graphics.lowerThird.name);
    const title = tok(state.graphics.lowerThird.title);
    const brand = state.brand;
    const tickerOn = state.graphics.ticker.on;
    const baseY = tickerOn ? H - 232 : H - 168;
    const x = 96, w = Math.min(820, 240 + Math.max(name.length, title.length + 6) * 22);
    const slide = (1 - ph) * -80;

    ctx.save();
    ctx.globalAlpha = ph;
    ctx.translate(slide, 0);

    // accent spine
    ctx.fillStyle = brand.accent;
    ctx.fillRect(x, baseY, 10, 104);
    // name slab
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(10,13,20,0.94)');
    grad.addColorStop(1, 'rgba(10,13,20,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 10, baseY, w * ph, 64);
    // title slab in brand primary
    const g2 = ctx.createLinearGradient(x, 0, x + w * 0.8, 0);
    g2.addColorStop(0, brand.primary);
    g2.addColorStop(1, shade(brand.primary, -0.4));
    ctx.fillStyle = g2;
    ctx.fillRect(x + 10, baseY + 64, w * 0.8 * ph, 40);

    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.font = '700 38px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(name, x + 34, baseY + 34);
    ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(title.toUpperCase(), x + 34, baseY + 85);
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

  drawClock(ctx, ph) {
    if (ph <= 0) return;
    const now = new Date();
    const txt = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    ctx.save();
    ctx.globalAlpha = ph;
    ctx.fillStyle = 'rgba(8,10,16,0.8)';
    rounded(ctx, 56, H - 120, 150, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 32px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 84, H - 90);
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
