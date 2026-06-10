// FFmpeg pipeline: receives MediaRecorder chunks from the renderer over IPC
// and pushes them to an RTMP endpoint, plus offers a WebM -> MP4 finalize step.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveFfmpeg() {
  try {
    let p = require('ffmpeg-static');
    // electron-builder packs node_modules into app.asar; binaries must be
    // executed from the unpacked mirror.
    if (p && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return 'ffmpeg'; // fall back to PATH
}

class Streamer {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.proc = null;
    this.ffmpegPath = resolveFfmpeg();
  }

  ffmpegAvailable() {
    if (this.ffmpegPath !== 'ffmpeg') return true;
    try {
      const r = require('child_process').spawnSync(this.ffmpegPath, ['-version']);
      return r.status === 0;
    } catch { return false; }
  }

  emit(status, message) {
    const w = this.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('stream:status', { status, message });
  }

  /**
   * opts: { url, key, videoBitrateK, videoIsH264 }
   * The renderer feeds us a live WebM container (H.264 or VP8/VP9 video +
   * Opus audio). If video is already H.264 we copy it; otherwise transcode.
   * Audio is always transcoded to AAC (FLV requirement).
   */
  start(opts) {
    if (this.proc) this.stop();
    const target = opts.url.replace(/\/+$/, '') + '/' + (opts.key || '').trim();
    const vbr = (opts.videoBitrateK || 4500) + 'k';
    const video = opts.videoIsH264
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
         '-b:v', vbr, '-maxrate', vbr, '-bufsize', (2 * (opts.videoBitrateK || 4500)) + 'k',
         '-pix_fmt', 'yuv420p', '-g', '60'];
    const args = [
      '-hide_banner', '-loglevel', 'warning',
      '-fflags', '+genpts',
      '-i', 'pipe:0',
      ...video,
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-flvflags', 'no_duration_filesize',
      '-f', 'flv', target
    ];
    try {
      this.proc = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      this.emit('error', 'FFmpeg could not be started: ' + err.message);
      return { ok: false, error: err.message };
    }
    this.emit('connecting', 'Connecting to ' + opts.url + ' …');
    let stderrTail = '';
    this.proc.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });
    this.proc.on('error', (err) => {
      this.emit('error', 'FFmpeg error: ' + err.message);
      this.proc = null;
    });
    this.proc.on('close', (code) => {
      if (code === 0 || code === 255 || this.stopping) this.emit('stopped', 'Stream ended.');
      else this.emit('error', 'Stream dropped (ffmpeg exit ' + code + '). ' + stderrTail.split('\n').slice(-3).join(' '));
      this.proc = null;
      this.stopping = false;
    });
    this.proc.stdin.on('error', () => {}); // EPIPE on teardown is expected
    // No handshake signal from ffmpeg for "connected"; report live once data flows.
    this.firstWrite = true;
    return { ok: true };
  }

  write(buf) {
    if (!this.proc || !this.proc.stdin.writable) return;
    if (this.firstWrite) { this.firstWrite = false; this.emit('live', 'Live — sending data.'); }
    this.proc.stdin.write(buf);
  }

  stop() {
    if (!this.proc) return { ok: true };
    this.stopping = true;
    try { this.proc.stdin.end(); } catch {}
    const p = this.proc;
    setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, 3000);
    return { ok: true };
  }

  /** Remux/transcode a finished WebM recording to MP4 next to the original. */
  finalizeMp4(webmPath, videoIsH264) {
    return new Promise((resolve) => {
      const out = path.join(
        path.dirname(webmPath),
        path.basename(webmPath, path.extname(webmPath)) + '.mp4'
      );
      const video = videoIsH264 ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p'];
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', webmPath,
        ...video, '-c:a', 'aac', '-b:a', '160k', out];
      const proc = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('error', (e) => resolve({ ok: false, error: e.message }));
      proc.on('close', (code) => {
        if (code === 0) resolve({ ok: true, path: out });
        else resolve({ ok: false, error: err.slice(-400) || ('ffmpeg exit ' + code) });
      });
    });
  }
}

module.exports = { Streamer };
