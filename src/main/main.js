// Chase Studio — Electron main process.
// Owns the window, the app:// + media:// protocols, project file IO,
// local recording, and the FFmpeg streaming/finalize pipeline.
const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Streamer } = require('./streamer');
const projects = require('./projects');

const APP_ROOT = path.join(__dirname, '..', '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.data': 'application/octet-stream', '.tflite': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.fbx': 'application/octet-stream', '.obj': 'text/plain', '.hdr': 'application/octet-stream', '.mtl': 'text/plain'
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// app:// must be registered as privileged before app is ready so that
// ES modules, fetch (MediaPipe wasm) and media elements all work.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'media', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true } }
]);

let win = null;
const streamer = new Streamer(() => win);

// ---- local recording state (segmented, crash-safe) ----
let recStream = null;
let recPath = null;     // base path chosen by the operator
let recSegIdx = 0;
let recParts = [];

function segPath(base, idx) {
  return base.replace(/\.webm$/i, '') + '.part' + String(idx).padStart(3, '0') + '.webm';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0b0d12',
    show: false,
    autoHideMenuBar: true,
    title: 'Chase Studio Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://bundle/src/renderer/index.html');
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // Serve the app bundle (renderer + node_modules) over app://bundle/.
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(APP_ROOT, rel));
    if (!file.startsWith(APP_ROOT)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': mimeFor(file) } });
    } catch {
      return new Response('not found: ' + rel, { status: 404 });
    }
  });

  // media://local/?p=<encoded absolute path> — lets the renderer use any
  // user-picked image/video file as a texture or virtual-screen source.
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const p = url.searchParams.get('p');
    if (!p) return new Response('bad request', { status: 400 });
    try {
      const data = await fs.promises.readFile(p);
      return new Response(data, { headers: { 'content-type': mimeFor(p) } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  streamer.stop();
  closeRecording();
  if (process.platform !== 'darwin') app.quit();
});

function closeRecording() {
  if (recStream) { try { recStream.end(); } catch {} recStream = null; }
}

function registerIpc() {
  // ---------- projects ----------
  ipcMain.handle('project:save', (e, json, currentPath) => projects.save(win, json, currentPath));
  ipcMain.handle('project:saveAs', (e, json) => projects.save(win, json, null));
  ipcMain.handle('project:open', () => projects.open(win));
  ipcMain.handle('project:recent', () => projects.recent());
  ipcMain.handle('project:openPath', (e, p) => projects.openPath(p));
  ipcMain.handle('template:export', (e, json) => projects.exportTemplate(win, json));
  ipcMain.handle('template:import', () => projects.importTemplate(win));

  // ---------- media picking ----------
  ipcMain.handle('media:pick', async (e, kind) => {
    const filters = kind === 'image'
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
      : kind === 'video'
        ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }]
        : kind === 'audio'
          ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
          : kind === 'model'
            ? [{ name: '3D models', extensions: ['glb', 'gltf', 'fbx', 'obj'] }]
            : kind === 'hdri'
              ? [{ name: 'HDRI environment', extensions: ['hdr'] }]
            : [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov'] }];
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const ext = path.extname(p).toLowerCase();
    const type = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video'
      : ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext) ? 'audio'
        : ['.glb', '.gltf', '.fbx', '.obj'].includes(ext) ? 'model'
          : ext === '.hdr' ? 'hdri' : 'image';
    return { url: 'media://local/?p=' + encodeURIComponent(p), path: p, type, name: path.basename(p) };
  });

  // ---------- local recording ----------
  ipcMain.handle('rec:start', async (e, suggestedName) => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Record to file',
      defaultPath: path.join(app.getPath('videos'), suggestedName || 'chase-recording.webm'),
      filters: [{ name: 'WebM video', extensions: ['webm'] }]
    });
    if (r.canceled || !r.filePath) return null;
    closeRecording();
    recPath = r.filePath;
    recSegIdx = 0;
    recParts = [segPath(recPath, 0)];
    recStream = fs.createWriteStream(recParts[0]);
    // disk-space guard (statfs available on modern Node; soft-fail otherwise)
    let freeGB = null;
    try {
      const st = await fs.promises.statfs(path.dirname(recPath));
      freeGB = +(st.bavail * st.bsize / 1e9).toFixed(1);
    } catch {}
    return { path: recPath, freeGB };
  });
  ipcMain.on('rec:chunk', (e, buf) => {
    if (recStream) recStream.write(Buffer.from(buf));
  });
  // crash-safe rotation: each segment is an independently playable file
  ipcMain.handle('rec:segment', async () => {
    if (!recStream) return null;
    await new Promise((res) => recStream.end(res));
    recSegIdx++;
    const p = segPath(recPath, recSegIdx);
    recParts.push(p);
    recStream = fs.createWriteStream(p);
    return p;
  });
  ipcMain.handle('rec:stop', async () => {
    const base = recPath;
    const parts = [...recParts];
    await new Promise((res) => { if (recStream) recStream.end(res); else res(); });
    recStream = null; recPath = null; recParts = []; recSegIdx = 0;
    return { path: base, parts };
  });
  ipcMain.handle('rec:finalizeMp4', (e, parts, outBase, videoIsH264) => streamer.finalizeMp4(parts, outBase, videoIsH264));
  ipcMain.handle('rec:reveal', (e, p) => { if (p) shell.showItemInFolder(p); });

  // ---------- streaming (simulcast) ----------
  ipcMain.handle('stream:start', (e, dest) => streamer.start(dest));
  ipcMain.on('stream:chunk', (e, buf) => streamer.write(Buffer.from(buf)));
  ipcMain.handle('stream:stopDest', (e, id) => streamer.stopDest(id));
  ipcMain.handle('stream:stop', () => streamer.stop());

  // ---------- system health ----------
  ipcMain.handle('sys:health', async () => {
    const cpu = process.getCPUUsage();
    const mem = await process.getProcessMemoryInfo().catch(() => null);
    const metrics = app.getAppMetrics();
    let cpuTotal = 0;
    for (const m of metrics) cpuTotal += m.cpu?.percentCPUUsage || 0;
    return {
      cpuPercent: Math.min(Math.round(cpuTotal), 100),
      memMB: mem ? Math.round(mem.private / 1024) : Math.round(process.memoryUsage().rss / 1048576),
      sysMemMB: Math.round(require('os').totalmem() / 1048576)
    };
  });

  // ---------- data file import (CSV/JSON for data binding) ----------
  ipcMain.handle('data:openText', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Data files', extensions: ['csv', 'json'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      return {
        name: path.basename(r.filePaths[0]),
        ext: path.extname(r.filePaths[0]).toLowerCase(),
        text: await fs.promises.readFile(r.filePaths[0], 'utf8')
      };
    } catch (e) { return { error: e.message }; }
  });

  // ---------- crash recovery + operator log (on disk) ----------
  const recoveryFile = () => path.join(app.getPath('userData'), 'recovery.json');
  const logFile = () => path.join(app.getPath('userData'), 'operator.log');
  ipcMain.on('recovery:save', (e, json) => {
    fs.writeFile(recoveryFile(), JSON.stringify(json), () => {});
  });
  ipcMain.handle('recovery:load', async () => {
    try { return JSON.parse(await fs.promises.readFile(recoveryFile(), 'utf8')); }
    catch { return null; }
  });
  ipcMain.handle('recovery:clear', () => { fs.unlink(recoveryFile(), () => {}); });
  ipcMain.on('log:append', (e, line) => {
    fs.appendFile(logFile(), line + '\n', () => {});
  });
  ipcMain.handle('log:path', () => logFile());

  // ---------- misc ----------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpeg: streamer.ffmpegAvailable()
  }));
}
