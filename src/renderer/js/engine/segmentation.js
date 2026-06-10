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
      ctx.globalAlpha = 0.65;
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
          let top = -1, bottom = -1;
          for (let y = 0; y < c.height; y++) {
            let hit = false;
            for (let x = 0; x < c.width; x += 4) {
              if (d[(y * c.width + x) * 4] > 128) { hit = true; break; }
            }
            if (hit) { if (top < 0) top = y; bottom = y; }
          }
          if (top >= 0) {
            this.bounds = { top: top / c.height, bottom: bottom / c.height, height: (bottom - top) / c.height };
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
    const pump = async () => {
      if (!this.running) return;
      if (!this._busy && videoEl.readyState >= 2) {
        this._busy = true;
        try { await this.seg.send({ image: videoEl }); } catch { this._busy = false; }
      }
      setTimeout(pump, 50); // ~20 fps is plenty for a mask
    };
    pump();
  }

  stop() { this.running = false; }
}
