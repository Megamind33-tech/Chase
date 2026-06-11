// AI person segmentation (MediaPipe Selfie Segmentation) for users
// without a green screen. Produces a mask texture consumed by the
// presenter shader. Loaded lazily; failure degrades gracefully.
import * as THREE from 'three';

export class Segmenter {
  constructor() {
    this.running = false;
    this.ready = false;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 480;
    this.maskCanvas.height = 270;
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.maskCanvas);
  }

  async init() {
    if (this.ready) return;
    if (typeof window.SelfieSegmentation !== 'function') {
      throw new Error('Segmentation model unavailable');
    }
    this.seg = new window.SelfieSegmentation({
      locateFile: (f) => '/node_modules/@mediapipe/selfie_segmentation/' + f
    });
    this.seg.setOptions({ modelSelection: 1 }); // landscape model
    this.seg.onResults((res) => {
      const c = this.maskCanvas, ctx = this.maskCtx;
      // temporal smoothing: blend with the previous mask → anti-flicker
      ctx.globalAlpha = 1 - (this.stability ?? 0.35);
      ctx.drawImage(res.segmentationMask, 0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
      this.texture.needsUpdate = true;
      this._busy = false;
      // body bounds every ~0.5s for auto-presence (feet/height detection)
      const now = performance.now();
      if (!this._lastBounds || now - this._lastBounds > 500) {
        this._lastBounds = now;
        try {
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let top = -1, bottom = -1, left = c.width, right = -1, sum = 0, count = 0;
          for (let y = 0; y < c.height; y += 2) {
            for (let x = 0; x < c.width; x += 3) {
              const v = d[(y * c.width + x) * 4];
              if (v > 128) {
                if (top < 0) top = y;
                bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
                sum += v; count++;
              }
            }
          }
          if (top >= 0 && right > left) {
            this.bounds = {
              top: top / c.height, bottom: bottom / c.height,
              left: left / c.width, right: right / c.width,
              cx: (left + right) / 2 / c.width,
              height: (bottom - top) / c.height
            };
            // matte confidence: how solid the body core reads (0..1)
            this.confidence = Math.min(1, (sum / count / 255) * (count > 300 ? 1 : count / 300));
          } else {
            this.confidence = 0;
          }
        } catch {}
      }
    });
    await this.seg.initialize();
    this.ready = true;
  }

  start(videoEl) {
    this.running = true;
    this._busy = false;
    // mask cadence: 20fps normally; small machines drop to 10fps — the
    // temporal-stability blend in the presenter shader hides the gap
    this.intervalMs = 50;
    const pump = async () => {
      if (!this.running) return;
      if (!this._busy && videoEl.readyState >= 2) {
        this._busy = true;
        try { await this.seg.send({ image: videoEl }); } catch { this._busy = false; }
      }
      setTimeout(pump, this.intervalMs);
    };
    pump();
  }

  /** Low tiers halve the mask rate — the single biggest CPU saving in AI key. */
  setLowPower(on) { this.intervalMs = on ? 100 : 50; }

  stop() { this.running = false; }
}
