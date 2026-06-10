// Screen tour: boots the real app and captures every screen/pane for review.
const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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

app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(APP_ROOT, rel));
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  for (const ch of ['project:save', 'project:saveAs', 'project:open', 'project:openPath',
    'template:export', 'template:import', 'media:pick', 'rec:start', 'rec:stop',
    'rec:finalizeMp4', 'rec:reveal', 'stream:start', 'stream:stop', 'stream:stopDest']) {
    ipcMain.handle(ch, () => null);
  }
  ipcMain.handle('project:recent', () => []);
  ipcMain.handle('sys:health', () => ({ cpuPercent: 14, memMB: 900, sysMemMB: 16384 }));
  ipcMain.handle('app:info', () => ({ version: '0.2.0', platform: 'win32', ffmpeg: true }));

  const win = new BrowserWindow({
    width: 1600, height: 940, show: false,
    webPreferences: { preload: path.join(APP_ROOT, 'src/main/preload.js'), contextIsolation: true, sandbox: false }
  });
  await win.loadURL('app://bundle/src/renderer/index.html');
  const js = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(APP_ROOT, 'tour-' + name + '.png'), img.toPNG());
    console.log('saved', name);
  };

  await wait(3500);
  await shot('01-launcher');

  await js(`document.getElementById('btn-new-project').click()`);
  await wait(600);
  await shot('02-builder-sets');

  await js(`document.querySelector('[data-wiz="camera"]').click()`);
  await wait(2500);
  await shot('03-builder-camera');

  await js(`document.querySelector('[data-wiz="background"]').click()`);
  await wait(500);
  await shot('04-builder-background');

  await js(`document.querySelector('[data-bgmode="chroma"]').click();
    document.getElementById('btn-enter-studio').click()`);
  await wait(9000); // engine + set thumbnails

  // dress: graphics on, scene saved
  await js(`for (const idx of [0, 1, 2]) {
      document.querySelectorAll('#gfx-list li')[idx]?.querySelector('.ly-vis')?.click();
    }
    document.getElementById('btn-scene-add').click();`);
  await wait(2500);
  await shot('05-studio-workspace');

  // AR builder: objects pane + a screen prop selected + camera tab
  await js(`document.querySelector('.irail-btn[data-nav="props"]').click()`);
  await wait(400);
  await js(`document.querySelectorAll('#browser-body .lib-card')[0]?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await wait(1200);
  await shot('06-ar-builder-objects');

  await js(`document.querySelector('.insp-tab[data-panel="camera"]').click()`);
  await wait(400);
  await shot('07-camera-inspector');

  // graphics pane + drawer
  await js(`document.querySelector('.irail-btn[data-nav="graphics"]').click();
    document.querySelectorAll('#gfx-list li')[0]?.click()`);
  await wait(600);
  await shot('08-graphics-builder');
  await js(`document.getElementById('gfx-drawer-close').click()`);

  // lighting pane + light tab
  await js(`document.querySelector('.irail-btn[data-nav="lighting"]').click();
    document.querySelector('.insp-tab[data-panel="light"]').click()`);
  await wait(500);
  await shot('09-lighting');

  // chroma / look tab
  await js(`document.querySelector('.insp-tab[data-panel="look"]').click()`);
  await wait(400);
  await shot('10-chroma-look');

  // cameras pane
  await js(`document.querySelector('.irail-btn[data-nav="cameras"]').click()`);
  await wait(500);
  await shot('11-cameras');

  // audio pane + stream tab
  await js(`document.querySelector('.irail-btn[data-nav="audio"]').click();
    document.querySelector('.insp-tab[data-panel="stream"]').click()`);
  await wait(500);
  await shot('12-audio-output');

  // multiview
  await js(`document.getElementById('btn-multiview').click()`);
  await wait(2500);
  await shot('14-multiview');
  await js(`document.getElementById('modal-multiview').hidden = true`);
  await wait(300);

  // go live modal
  await js(`document.getElementById('btn-live').click()`);
  await wait(500);
  await shot('13-go-live');
  await js(`document.getElementById('modal-live').hidden = true`);
  await wait(300);

  // operator log
  await js(`document.getElementById('btn-oplog').click()`);
  await wait(400);
  await shot('15-operator-log');

  console.log('TOUR DONE');
  app.exit(0);
});
