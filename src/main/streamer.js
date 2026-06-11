// FFmpeg pipeline. Simulcast-capable: one live WebM feed from the renderer
// is teed to N FFmpeg child processes, one per enabled RTMP destination.
// Also offers a WebM -> MP4 finalize step for recordings.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveFfmpeg() {
  try {
    let p = require('ffmpeg-static');
    if (p && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return 'ffmpeg'; // fall back to PATH
}

class Streamer {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.procs = new Map(); // destId -> { proc, stopping }
    this.ffmpegPath = resolveFfmpeg();
  }

  ffmpegAvailable() {
    if (this.ffmpegPath !== 'ffmpeg') return true;
    try {
      const r = require('child_process').spawnSync(this.ffmpegPath, ['-version']);
      return r.status === 0;
    } catch { return false; }
  }

  emit(destId, status, message) {
    const w = this.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('stream:status', { destId, status, message });
  }

  /**
   * dest: { id, url, key, videoBitrateK, videoIsH264 }
   * The renderer feeds one live WebM container; H.264 video is copied,
   * VP8/VP9 transcoded. Audio is always AAC for FLV.
   */
  start(dest) {
    this.stopDest(dest.id);
    const target = dest.url.replace(/\/+$/, '') + '/' + (dest.key || '').trim();
    const vbr = (dest.videoBitrateK || 4500) + 'k';
    const video = dest.videoIsH264
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
         '-b:v', vbr, '-maxrate', vbr, '-bufsize', (2 * (dest.videoBitrateK || 4500)) + 'k',
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
    let proc;
    try {
      proc = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      this.emit(dest.id, 'error', 'FFmpeg could not be started: ' + err.message);
      return { ok: false, error: err.message };
    }
    const entry = { proc, stopping: false, firstWrite: true };
    this.procs.set(dest.id, entry);
    this.emit(dest.id, 'connecting', 'Connecting…');
    let stderrTail = '';
    proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    proc.on('error', (err) => {
      this.emit(dest.id, 'error', 'FFmpeg error: ' + err.message);
      this.procs.delete(dest.id);
    });
    proc.on('close', (code) => {
      if (code === 0 || code === 255 || entry.stopping) this.emit(dest.id, 'stopped', 'Stream ended.');
      else this.emit(dest.id, 'error', 'Dropped (ffmpeg exit ' + code + '). ' + stderrTail.split('\n').slice(-2).join(' '));
      this.procs.delete(dest.id);
    });
    proc.stdin.on('error', () => {}); // EPIPE on teardown is expected
    return { ok: true };
  }

  /** Tee one chunk to every live destination. */
  write(buf) {
    for (const [id, entry] of this.procs) {
      if (!entry.proc.stdin.writable) continue;
      if (entry.firstWrite) { entry.firstWrite = false; this.emit(id, 'live', 'Live'); }
      entry.proc.stdin.write(buf);
    }
  }

  get liveCount() { return this.procs.size; }

  stopDest(id) {
    const entry = this.procs.get(id);
    if (!entry) return;
    entry.stopping = true;
    try { entry.proc.stdin.end(); } catch {}
    const p = entry.proc;
    setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, 3000);
  }

  stop() {
    for (const id of [...this.procs.keys()]) this.stopDest(id);
    return { ok: true };
  }

  /** Merge crash-safe segments + transcode/remux to MP4. */
  finalizeMp4(parts, outBase, videoIsH264) {
    return new Promise((resolve) => {
      const list = Array.isArray(parts) ? parts.filter((p) => fs.existsSync(p)) : [parts];
      if (!list.length) return resolve({ ok: false, error: 'No recording segments found.' });
      const out = path.join(
        path.dirname(outBase),
        path.basename(outBase, path.extname(outBase)) + '.mp4'
      );
      const listFile = out + '.txt';
      fs.writeFileSync(listFile, list.map((p) => "file '" + p.replace(/'/g, "'\\''") + "'").join('\n'));
      const video = videoIsH264 ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p'];
      const args = ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        ...video, '-c:a', 'aac', '-b:a', '160k', out];
      const proc = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('error', (e) => resolve({ ok: false, error: e.message }));
      proc.on('close', (code) => {
        try { fs.unlinkSync(listFile); } catch {}
        if (code === 0) resolve({ ok: true, path: out });
        else resolve({ ok: false, error: err.slice(-400) || ('ffmpeg exit ' + code) });
      });
    });
  }
}

module.exports = { Streamer };
