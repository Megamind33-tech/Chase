// Final program compositor: 3D render + broadcast graphics → one canvas.
// Also executes program transitions (fade / wipe) by snapshotting the
// outgoing frame and blending it over the incoming one. The canvas IS the
// program output — preview, recording and streaming all read from it.
export class Compositor {
  constructor(programCanvas, studio, overlay) {
    this.canvas = programCanvas;
    this.ctx = programCanvas.getContext('2d');
    this.studio = studio;
    this.overlay = overlay;
    this._snap = document.createElement('canvas');
    this._trans = null; // { type, t, duration }
    this.blackout = false; // emergency BLACK: program (and outputs) go to black
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this._snap.width = w;
    this._snap.height = h;
  }

  /** Snapshot the current program and start a fade/wipe into the new look. */
  beginTransition(type, duration) {
    this._snap.getContext('2d').drawImage(this.canvas, 0, 0);
    this._trans = { type, t: 0, duration: Math.max(duration, 0.1) };
  }

  compose(time, dt) {
    const { width, height } = this.canvas;
    if (this.blackout) {
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, width, height);
      return;
    }
    this.ctx.drawImage(this.studio.canvas, 0, 0, width, height);
    this.overlay.render(time);
    this.ctx.drawImage(this.overlay.canvas, 0, 0, width, height);

    if (this._trans) {
      const tr = this._trans;
      tr.t += dt;
      const k = Math.min(tr.t / tr.duration, 1);
      if (tr.type === 'fade') {
        // crossfade: old frame on top, fading out
        this.ctx.globalAlpha = 1 - k;
        this.ctx.drawImage(this._snap, 0, 0);
        this.ctx.globalAlpha = 1;
      } else if (tr.type === 'slide') {
        // outgoing frame slides off to the left
        const ease = 1 - Math.pow(1 - k, 3);
        this.ctx.drawImage(this._snap, -width * ease, 0);
      } else if (tr.type === 'zoom') {
        // outgoing frame scales up and dissolves
        const ease = 1 - Math.pow(1 - k, 2);
        const s = 1 + ease * 0.35;
        this.ctx.globalAlpha = 1 - ease;
        this.ctx.drawImage(this._snap,
          (width - width * s) / 2, (height - height * s) / 2, width * s, height * s);
        this.ctx.globalAlpha = 1;
      } else if (tr.type === 'wipe') {
        const edge = width * k;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(edge, 0, width - edge, height);
        this.ctx.clip();
        this.ctx.drawImage(this._snap, 0, 0);
        this.ctx.restore();
        // wipe blade
        const g = this.ctx.createLinearGradient(edge - 24, 0, edge + 6, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0.55)');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(edge - 24, 0, 30, height);
      }
      if (k >= 1) this._trans = null;
    }
  }

  /** Program output stream: canvas video + mixed program audio. */
  buildOutputStream(fps, audioTrack) {
    const stream = this.canvas.captureStream(fps);
    if (audioTrack) stream.addTrack(audioTrack);
    return stream;
  }
}
