// Program audio mixer (WebAudio): mic channel + jingle player → master bus.
// Real gain faders, real level meters (AnalyserNode), and the mixed output
// feeds recording + every stream destination.
import { state } from './state.js';

export class AudioMixer {
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.dest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.dest);
    // master meter
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.master.connect(this.masterAnalyser);

    this.channels = new Map(); // id -> { gain, analyser, source, label }
    this._jingleEl = null;
    this.applyGains();
  }

  resume() { this.ctx.resume().catch(() => {}); }

  /** Attach (or re-attach) the microphone MediaStream. */
  setMicStream(stream) {
    this.removeChannel('mic');
    if (!stream || !stream.getAudioTracks().length) return;
    // clone so muting the capture track doesn't kill the analyser
    const src = this.ctx.createMediaStreamSource(stream);
    this._addChannel('mic', 'MIC 1', src);
  }

  _addChannel(id, label, sourceNode) {
    const gain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(gain);
    gain.connect(analyser);
    gain.connect(this.master);
    this.channels.set(id, { gain, analyser, source: sourceNode, label });
    this.applyGains();
  }

  removeChannel(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    try { ch.source.disconnect(); ch.gain.disconnect(); } catch {}
    this.channels.delete(id);
  }

  /** Play a jingle/music-bed file on the JINGLE channel. */
  playJingle(url, loop = false) {
    this.stopJingle();
    this._jingleEl = new Audio(url);
    this._jingleEl.loop = loop;
    this._jingleEl.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(this._jingleEl);
    this._addChannel('jingle', 'JINGLE', src);
    this._jingleEl.play().catch(() => {});
    this._jingleEl.onended = () => { if (!loop) this.stopJingle(); };
  }

  stopJingle() {
    if (this._jingleEl) { this._jingleEl.pause(); this._jingleEl.src = ''; this._jingleEl = null; }
    this.removeChannel('jingle');
  }

  get jinglePlaying() { return !!this._jingleEl && !this._jingleEl.paused; }

  applyGains() {
    const a = state.audio;
    this.channels.get('mic')?.gain.gain.setTargetAtTime(state.capture.muted ? 0 : a.micGain, this.ctx.currentTime, 0.02);
    this.channels.get('jingle')?.gain.gain.setTargetAtTime(a.jingleGain, this.ctx.currentTime, 0.02);
    this.master.gain.setTargetAtTime(a.masterGain, this.ctx.currentTime, 0.02);
  }

  /** Peak level 0..1 for a channel id or 'master'. */
  level(id) {
    const analyser = id === 'master' ? this.masterAnalyser : this.channels.get(id)?.analyser;
    if (!analyser) return 0;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  /** The mixed program audio track for outputs. */
  outputTrack() {
    return this.dest.stream.getAudioTracks()[0] || null;
  }
}
