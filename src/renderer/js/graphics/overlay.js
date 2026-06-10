// Broadcast graphics engine: lower thirds, ticker, logo bug, breaking
// banner, title card and clock — drawn on a 1920×1080 2D canvas that the
// compositor layers over the 3D program. All animation is time-based.
import { state } from '../state.js';

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
    if (g.logoBug.on || this.anim.logoBug) this.drawLogoBug(ctx, this._phase('logoBug'));
    if (g.clock.on || this.anim.clock) this.drawClock(ctx, this._phase('clock'));
  }

  drawLowerThird(ctx, ph) {
    if (ph <= 0) return;
    const { name, title } = state.graphics.lowerThird;
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
    const txt = (t.text || '') + sep;
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
    ctx.fillText(t.label || 'LATEST', 24, y + barH / 2 + 2);
    ctx.restore();
  }

  drawBanner(ctx, time, ph) {
    if (ph <= 0) return;
    const brand = state.brand;
    const text = state.graphics.banner.text || 'BREAKING NEWS';
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
    const text = state.graphics.title.text || 'THE EVENING REPORT';
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
