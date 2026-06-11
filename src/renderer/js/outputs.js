// Recording + simulcast streaming outputs. Two independent MediaRecorders
// read the same program stream: one writes a local file, one feeds the
// main-process FFmpeg tee (one process per destination). Outbound bitrate
// is measured from real chunk sizes.
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
    this.streaming = false;     // any destination live
    this.liveDests = new Set();
    this.recPath = null;
    this.codec = pickCodec();
    this.onRecState = () => {};
    this.onStreamState = () => {};
    this._bytesWindow = [];     // [time, bytes] for bitrate measurement
    this._retries = new Map();   // destId -> attempt count
    this._destCfg = new Map();   // destId -> last start config
    this._userStopped = false;
    window.chase.onStreamStatus((s) => {
      if (s.status === 'live') { this.liveDests.add(s.destId); this._retries.set(s.destId, 0); }
      if (s.status === 'stopped') this.liveDests.delete(s.destId);
      if (s.status === 'error') {
        this.liveDests.delete(s.destId);
        // auto-reconnect with backoff: 2s, 4s, 8s, 16s, 30s
        const cfg = this._destCfg.get(s.destId);
        const n = (this._retries.get(s.destId) || 0) + 1;
        if (cfg && !this._userStopped && n <= 5) {
          this._retries.set(s.destId, n);
          const delay = Math.min(2000 * 2 ** (n - 1), 30000);
          this.onStreamState({ destId: s.destId, status: 'reconnecting', message: 'Reconnect ' + n + '/5 in ' + (delay / 1000) + 's' });
          setTimeout(() => {
            if (!this._userStopped) window.chase.streamStart(cfg);
          }, delay);
          return;
        }
      }
      const wasStreaming = this.streaming;
      this.streaming = this.liveDests.size > 0 || (wasStreaming && s.status === 'connecting');
      if (wasStreaming && !this.streaming && this.liveDests.size === 0) this._teardownStreamRecorder();
      this.onStreamState(s);
    });
  }

  /** Measured outbound bitrate in kbps over the last ~3s. */
  bitrateKbps() {
    const now = performance.now();
    this._bytesWindow = this._bytesWindow.filter(([t]) => now - t < 3000);
    const bytes = this._bytesWindow.reduce((a, [, b]) => a + b, 0);
    return Math.round((bytes * 8) / 3000); // bytes over 3s → kbps
  }

  // ---------- recording ----------
  async startRecording(projectName, bitrateK) {
    if (this.recording) return null;
    const safe = (projectName || 'chase').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const started = await window.chase.recStart(`${safe}-${stamp}.webm`);
    if (!started) return null;
    const path = started.path || started;
    this.lowDisk = started.freeGB !== null && started.freeGB !== undefined && started.freeGB < 2;
    this.freeGB = started.freeGB;
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
    // crash-safe: rotate to a new independently-playable segment every 60s
    this._recOpts = { bitrateK };
    this._segTimer = setInterval(() => this._rotateSegment(), 60_000);
    return path;
  }

  async _rotateSegment() {
    if (!this.recording) return;
    await new Promise((res) => { this.recRecorder.onstop = res; this.recRecorder.stop(); });
    await window.chase.recSegment();
    this.recRecorder = new MediaRecorder(this.getStream(), {
      mimeType: this.codec.mime || undefined,
      videoBitsPerSecond: (this._recOpts.bitrateK || 4500) * 1000 * 1.4,
      audioBitsPerSecond: 192000
    });
    this.recRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) window.chase.recChunk(await e.data.arrayBuffer());
    };
    this.recRecorder.start(1000);
  }

  async stopRecording() {
    if (!this.recording) return null;
    clearInterval(this._segTimer);
    await new Promise((res) => {
      this.recRecorder.onstop = res;
      this.recRecorder.stop();
    });
    const r = await window.chase.recStop();
    this.recording = false;
    this.onRecState({ on: false, path: r?.path });
    return { path: r?.path, parts: r?.parts || [], h264: this.codec.h264 };
  }

  // ---------- streaming (simulcast) ----------
  /** dests: [{ id, url, key }]; one shared encoder feeds all. */
  async startStreaming(dests, bitrateK) {
    const results = [];
    this._userStopped = false;
    for (const d of dests) {
      const cfg = {
        id: d.id, url: d.url, key: d.key,
        videoBitrateK: bitrateK, videoIsH264: this.codec.h264
      };
      this._destCfg.set(d.id, cfg);
      this._retries.set(d.id, 0);
      const r = await window.chase.streamStart(cfg);
      results.push({ id: d.id, ...r });
    }
    if (!results.some((r) => r.ok)) return results;
    if (!this.streamRecorder || this.streamRecorder.state === 'inactive') {
      this.streamRecorder = new MediaRecorder(this.getStream(), {
        mimeType: this.codec.mime || undefined,
        videoBitsPerSecond: (bitrateK || 4500) * 1000,
        audioBitsPerSecond: 128000
      });
      this.streamRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          this._bytesWindow.push([performance.now(), e.data.size]);
          window.chase.streamChunk(await e.data.arrayBuffer());
        }
      };
      this.streamRecorder.start(250); // small chunks keep RTMP latency low
    }
    this.streaming = true;
    this.streamStartedAt = Date.now();
    return results;
  }

  async stopDestination(id) {
    await window.chase.streamStopDest(id);
  }

  async stopStreaming() {
    this._userStopped = true;
    this._destCfg.clear();
    this._teardownStreamRecorder();
    await window.chase.streamStop();
    this.streaming = false;
    this.liveDests.clear();
  }

  _teardownStreamRecorder() {
    if (this.streamRecorder && this.streamRecorder.state !== 'inactive') {
      try { this.streamRecorder.stop(); } catch {}
    }
    this.streamRecorder = null;
  }
}
