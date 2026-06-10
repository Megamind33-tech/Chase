// Recording + streaming outputs. Two independent MediaRecorders read the
// same program stream: one writes a local file, one feeds FFmpeg → RTMP.
const CODEC_PREFS = [
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=h264',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function pickCodec() {
  for (const t of CODEC_PREFS) {
    if (MediaRecorder.isTypeSupported(t)) return { mime: t, h264: t.includes('h264') };
  }
  return { mime: '', h264: false };
}

export class Outputs {
  constructor(getStream) {
    this.getStream = getStream; // () => MediaStream (fresh program stream)
    this.recording = false;
    this.streaming = false;
    this.recPath = null;
    this.codec = pickCodec();
    this.onRecState = () => {};
    this.onStreamState = () => {};
    window.chase.onStreamStatus((s) => {
      if (s.status === 'error' || s.status === 'stopped') {
        this._teardownStreamRecorder();
        this.streaming = false;
      }
      this.onStreamState(s);
    });
  }

  // ---------- recording ----------
  async startRecording(projectName, bitrateK) {
    if (this.recording) return null;
    const safe = (projectName || 'chase').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const path = await window.chase.recStart(`${safe}-${stamp}.webm`);
    if (!path) return null;
    this.recPath = path;
    this.recRecorder = new MediaRecorder(this.getStream(), {
      mimeType: this.codec.mime || undefined,
      videoBitsPerSecond: (bitrateK || 4500) * 1000 * 1.4, // record above stream quality
      audioBitsPerSecond: 192000
    });
    this.recRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) window.chase.recChunk(await e.data.arrayBuffer());
    };
    this.recRecorder.start(1000);
    this.recording = true;
    this.recStartedAt = Date.now();
    this.onRecState({ on: true });
    return path;
  }

  async stopRecording() {
    if (!this.recording) return null;
    await new Promise((res) => {
      this.recRecorder.onstop = res;
      this.recRecorder.stop();
    });
    // flush settles via ondataavailable before onstop resolves in Chromium
    const path = await window.chase.recStop();
    this.recording = false;
    this.onRecState({ on: false, path });
    return { path, h264: this.codec.h264 };
  }

  // ---------- streaming ----------
  async startStreaming({ url, key, bitrateK }) {
    if (this.streaming) return { ok: false, error: 'Already streaming' };
    const r = await window.chase.streamStart({
      url, key, videoBitrateK: bitrateK, videoIsH264: this.codec.h264
    });
    if (!r.ok) return r;
    this.streamRecorder = new MediaRecorder(this.getStream(), {
      mimeType: this.codec.mime || undefined,
      videoBitsPerSecond: (bitrateK || 4500) * 1000,
      audioBitsPerSecond: 128000
    });
    this.streamRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) window.chase.streamChunk(await e.data.arrayBuffer());
    };
    this.streamRecorder.start(250); // small chunks keep RTMP latency low
    this.streaming = true;
    this.streamStartedAt = Date.now();
    return { ok: true };
  }

  async stopStreaming() {
    this._teardownStreamRecorder();
    await window.chase.streamStop();
    this.streaming = false;
  }

  _teardownStreamRecorder() {
    if (this.streamRecorder && this.streamRecorder.state !== 'inactive') {
      try { this.streamRecorder.stop(); } catch {}
    }
    this.streamRecorder = null;
  }
}
