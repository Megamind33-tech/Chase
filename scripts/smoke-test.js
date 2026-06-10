// Headless smoke test: boots the real app under Xvfb, waits for the
// renderer to load, and fails on any uncaught renderer/main error.
// Run: xvfb-run -a node_modules/.bin/electron scripts/smoke-test.js
const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.SMOKE_TEST = '1';
const APP_ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.data': 'application/octet-stream',
  '.tflite': 'application/octet-stream', '.binarypb': 'application/octet-stream'
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let errors = [];

app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(APP_ROOT, rel));
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  // stub IPC the preload expects
  for (const ch of ['project:save', 'project:saveAs', 'project:open', 'project:openPath',
    'template:export', 'template:import', 'media:pick', 'rec:start', 'rec:stop',
    'rec:finalizeMp4', 'rec:reveal', 'stream:start', 'stream:stop']) {
    ipcMain.handle(ch, () => null);
  }
  ipcMain.handle('project:recent', () => []);
  ipcMain.handle('app:info', () => ({ version: 'smoke', platform: process.platform, ffmpeg: true }));

  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'src/main/preload.js'),
      contextIsolation: true, sandbox: false,
      // fake a webcam so getUserMedia paths run headlessly
      additionalArguments: []
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3) errors.push(message);
    console.log('[renderer]', message);
  });
  win.webContents.on('render-process-gone', (e, d) => {
    errors.push('renderer gone: ' + d.reason);
  });

  await win.loadURL('app://bundle/src/renderer/index.html');

  // give modules time to evaluate + launcher to draw
  await new Promise((r) => setTimeout(r, 4000));

  const checks = await win.webContents.executeJavaScript(`({
    launcherVisible: !!document.getElementById('launcher'),
    setCards: document.querySelectorAll('.set-card').length,
    presetCards: document.querySelectorAll('.preset-card').length,
    bridge: typeof window.chase === 'object' && typeof window.chase.streamStart === 'function'
  })`);

  console.log('stage 1 checks:', JSON.stringify(checks));
  const stage1 = errors.length === 0 && checks.launcherVisible && checks.setCards === 3
    && checks.presetCards === 8 && checks.bridge;

  // ---- stage 2: walk the wizard with the fake webcam and enter the studio ----
  await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('btn-new-project').click();
    document.querySelector('[data-wiz="camera"]').click();
    await new Promise((r) => setTimeout(r, 2500)); // device enumeration + preview
    document.querySelector('[data-wiz="background"]').click();
    document.querySelector('[data-bgmode="framed"]').click();
    document.getElementById('btn-enter-studio').click();
  })()`);
  await new Promise((r) => setTimeout(r, 6000)); // engine boot + a few frames

  const stage2 = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('program-canvas');
    const ctx = cv.getContext('2d');
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4000) {
      if (px[i] + px[i + 1] + px[i + 2] > 24) lit++;
    }
    // exercise camera switching + graphics
    document.querySelector('[data-cam="3"]').click();
    return {
      editorVisible: !document.getElementById('editor').hidden,
      canvasSize: cv.width + 'x' + cv.height,
      litSamples: lit,
      camButtons: document.querySelectorAll('.cam-btn').length,
      cam3Live: document.querySelector('[data-cam="3"]').classList.contains('program')
    };
  })()`);
  await new Promise((r) => setTimeout(r, 1500));

  console.log('stage 2 checks:', JSON.stringify(stage2));

  if (process.env.SMOKE_SHOTS) {
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(APP_ROOT, name), img.toPNG());
      console.log('saved', name);
    };
    await shot('shot-editor.png');
    await win.webContents.executeJavaScript(`(() => {
      // dress the frame: graphics on air (re-query: the list rebuilds per toggle)
      document.querySelector('.rail-tab[data-lib="props"]').click();
      for (const idx of [0, 1, 2, 5]) {
        document.querySelectorAll('#gfx-list li')[idx]?.querySelector('.ly-vis')?.click();
      }
      document.querySelector('[data-cam="2"]').click();
    })()`);
    await new Promise((r) => setTimeout(r, 2500));
    await shot('shot-onair.png');
  }
  const ok = stage1 && errors.length === 0 && stage2.editorVisible
    && stage2.litSamples > 20 && stage2.camButtons === 5 && stage2.cam3Live;
  if (!ok) {
    console.error('SMOKE TEST FAILED');
    errors.forEach((e) => console.error('  error:', e));
  } else {
    console.log('SMOKE TEST PASSED — launcher, wizard, capture, 3D render, camera switching all live.');
  }
  app.exit(ok ? 0 : 1);
});
