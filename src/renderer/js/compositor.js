// Final program compositor: 3D render + broadcast graphics → one canvas.
// That canvas IS the program output — preview, recording and streaming
// all read from it, so what you see is exactly what goes out.
export class Compositor {
  constructor(programCanvas, studio, overlay) {
    this.canvas = programCanvas;
    this.ctx = programCanvas.getContext('2d');
    this.studio = studio;
    this.overlay = overlay;
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  compose(time) {
    const { width, height } = this.canvas;
    this.ctx.drawImage(this.studio.canvas, 0, 0, width, height);
    this.overlay.render(time);
    this.ctx.drawImage(this.overlay.canvas, 0, 0, width, height);
  }

  /** Program output stream: canvas video + microphone audio. */
  buildOutputStream(fps, audioTrack) {
    const stream = this.canvas.captureStream(fps);
    if (audioTrack) stream.addTrack(audioTrack);
    return stream;
  }
}
