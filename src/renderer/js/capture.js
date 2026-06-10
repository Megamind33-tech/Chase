// Camera + microphone capture.
import { state } from './state.js';

export const capture = {
  stream: null,
  video: null,

  async listDevices() {
    // Prompt once so device labels become available.
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch { /* user may have no devices; enumerate anyway */ }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: devices.filter((d) => d.kind === 'videoinput'),
      mics: devices.filter((d) => d.kind === 'audioinput')
    };
  },

  /** (Re)open the capture stream using state.capture settings. */
  async open() {
    this.close();
    const c = state.capture;
    const constraints = {
      video: {
        deviceId: c.cameraId ? { exact: c.cameraId } : undefined,
        width: { ideal: c.width }, height: { ideal: c.height },
        frameRate: { ideal: 30 }
      },
      audio: c.micId ? { deviceId: { exact: c.micId }, echoCancellation: false, noiseSuppression: true } : true
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video = document.getElementById('cam-video');
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.setMuted(c.muted);
    return this.stream;
  },

  audioTrack() {
    return this.stream ? this.stream.getAudioTracks()[0] || null : null;
  },

  setMuted(muted) {
    state.capture.muted = muted;
    const t = this.audioTrack();
    if (t) t.enabled = !muted;
  },

  close() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
};
