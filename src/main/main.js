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
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream'
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

// ---- local recording state ----
let recStream = null;
let recPath = null;

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
            ? [{ name: '3D models', extensions: ['glb', 'gltf'] }]
            : [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov'] }];
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const ext = path.extname(p).toLowerCase();
    const type = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video'
      : ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext) ? 'audio'
        : ['.glb', '.gltf'].includes(ext) ? 'model' : 'image';
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
    recStream = fs.createWriteStream(recPath);
    return recPath;
  });
  ipcMain.on('rec:chunk', (e, buf) => {
    if (recStream) recStream.write(Buffer.from(buf));
  });
  ipcMain.handle('rec:stop', async () => {
    const p = recPath;
    await new Promise((res) => { if (recStream) recStream.end(res); else res(); });
    recStream = null; recPath = null;
    return p;
  });
  ipcMain.handle('rec:finalizeMp4', (e, webmPath, videoIsH264) => streamer.finalizeMp4(webmPath, videoIsH264));
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

  // ---------- misc ----------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpeg: streamer.ffmpegAvailable()
  }));
}
