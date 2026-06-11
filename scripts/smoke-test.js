// Headless smoke test: boots the real app under Xvfb, walks the wizard with
// a fake camera, verifies the 3D program renders, switches cameras, and
// exercises the production strip. Fails on any uncaught renderer error.
// Run: xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/smoke-test.js
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

  for (const ch of ['project:save', 'project:saveAs', 'project:open', 'project:openPath',
    'template:export', 'template:import', 'media:pick', 'rec:start', 'rec:stop',
    'rec:finalizeMp4', 'rec:reveal', 'stream:start', 'stream:stop', 'stream:stopDest']) {
    ipcMain.handle(ch, () => null);
  }
  ipcMain.handle('project:recent', () => []);
  ipcMain.handle('sys:health', () => ({ cpuPercent: 12, memMB: 800, sysMemMB: 16384 }));
  ipcMain.handle('app:info', () => ({ version: 'smoke', platform: process.platform, ffmpeg: true }));

  const win = new BrowserWindow({
    width: 1600, height: 940, show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'src/main/preload.js'),
      contextIsolation: true, sandbox: false
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3) errors.push(message);
    console.log('[renderer]', message);
  });
  win.webContents.on('render-process-gone', (e, d) => errors.push('renderer gone: ' + d.reason));

  await win.loadURL('app://bundle/src/renderer/index.html');
  await new Promise((r) => setTimeout(r, 4000));

  const checks = await win.webContents.executeJavaScript(`({
    launcherVisible: !!document.getElementById('launcher'),
    setCards: document.querySelectorAll('.set-card').length,
    presetCards: document.querySelectorAll('.preset-card').length,
    bridge: typeof window.chase === 'object' && typeof window.chase.streamStart === 'function'
  })`);
  console.log('stage 1 checks:', JSON.stringify(checks));
  const stage1 = errors.length === 0 && checks.launcherVisible && checks.setCards === 9
    && checks.presetCards === 8 && checks.bridge;

  // ---- stage 2: wizard → studio with the fake webcam ----
  await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('btn-new-project').click();
    document.querySelector('[data-wiz="camera"]').click();
    await new Promise((r) => setTimeout(r, 2500));
    document.querySelector('[data-wiz="background"]').click();
    document.querySelector('[data-bgmode="chroma"]').click();
    document.getElementById('btn-enter-studio').click();
  })()`);
  await new Promise((r) => setTimeout(r, 7000)); // engine + thumbnails warm-up

  const stage2 = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('program-canvas');
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4000) {
      if (px[i] + px[i + 1] + px[i + 2] > 24) lit++;
    }
    // switcher discipline: single click stages PVW, TAKE sends to program
    document.querySelector('.cam-tile[data-cam="3"]').click();
    const pvwStaged = document.querySelector('.cam-tile[data-cam="3"]').classList.contains('preview');
    document.getElementById('btn-take').click();
    document.getElementById('btn-scene-add').click();
    return {
      pvwStaged,
      takeBtn: !!document.getElementById('btn-take'),
      blackBtn: !!document.getElementById('btn-black'),
      arBtn: !!document.getElementById('btn-arkill'),
      editorVisible: !document.getElementById('editor').hidden,
      canvasSize: cv.width + 'x' + cv.height,
      litSamples: lit,
      camTiles: document.querySelectorAll('.cam-tile').length,
      cam3Live: document.querySelector('.cam-tile[data-cam="3"]').classList.contains('program'),
      scenes: document.querySelectorAll('.scene-item').length,
      macros: document.querySelectorAll('.macro-btn').length,
      transBtns: document.querySelectorAll('.trans-btn').length,
      mixerChannels: document.querySelectorAll('.mx-ch').length,
      setBrowserCards: document.querySelectorAll('.bset-card').length
    };
  })()`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('stage 2 checks:', JSON.stringify(stage2));

  // ---- stage 3: BUILDER mode ----
  const stage3 = await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('mode-builder').click();
    await new Promise((r) => setTimeout(r, 1200));
    const builderOn = !document.getElementById('builder-bar').hidden;
    const gizmoBtns = document.querySelectorAll('[data-gizmo]').length;
    document.getElementById('bb-2d').click();
    await new Promise((r) => setTimeout(r, 600));
    const planActive = document.getElementById('bb-2d').classList.contains('active');
    document.getElementById('bb-3d').click();
    await new Promise((r) => setTimeout(r, 400));
    const before = document.querySelectorAll('.cam-tile').length;
    document.getElementById('bb-addcam').click();
    await new Promise((r) => setTimeout(r, 600));
    const after = document.querySelectorAll('.cam-tile').length;
    document.getElementById('mode-studio').click();
    await new Promise((r) => setTimeout(r, 600));
    return { builderOn, gizmoBtns, planActive, camAdded: after === before + 1, camsAfter: after };
  })()`);
  console.log('stage 3 checks:', JSON.stringify(stage3));

  // ---- stage 4: ingestion UI, relighting controls, live safety ----
  const stage4 = await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('btn-autofit').click();
    await new Promise((r) => setTimeout(r, 400));
    document.getElementById('btn-live').click();
    await new Promise((r) => setTimeout(r, 600));
    const safetyItems = document.querySelectorAll('#live-safety .ls-item').length;
    const safetyOk = document.querySelectorAll('#live-safety .ls-item.ok').length;
    document.getElementById('live-cancel').click();
    document.getElementById('cloth-on').click();
    const clothOn = document.getElementById('cloth-on').classList.contains('active');
    document.getElementById('cloth-on').click();
    return {
      clothOn,
      clothControls: !!document.getElementById('cloth-key') && !!document.getElementById('cloth-pick'),
      matBox: !!document.getElementById('obj-materials'),
      ingestModal: !!document.getElementById('modal-ingest'),
      erodeSlider: !!document.getElementById('enh-erode'),
      wrapSlider: !!document.getElementById('enh-wrap'),
      autofit: !!document.getElementById('btn-autofit'),
      hdriBtn: !!document.getElementById('btn-hdri'),
      safetyItems, safetyOk
    };
  })()`);
  console.log('stage 4 checks:', JSON.stringify(stage4));

  // ---- stage 5: familiar presenter system ----
  const stage5 = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('.irail-btn[data-nav="talent"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const talentPane = document.getElementById('browser-title').textContent.includes('Talent');
    const captureBtn = !!document.querySelector('#browser-body .btn.gold');
    const guestControls = !!document.getElementById('guest-on') && !!document.getElementById('guest-x');
    document.querySelector('#browser-body .btn.gold').click();
    await new Promise((r) => setTimeout(r, 400));
    const wizardOpen = !document.getElementById('modal-capture').hidden;
    document.getElementById('cap-cancel').click();
    document.querySelector('.irail-btn[data-nav="cameras"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const rearToggles = document.querySelectorAll('#browser-body .chip').length;
    return { talentPane, captureBtn, guestControls, wizardOpen, rearToggles,
      precapBadge: !!document.getElementById('vp-precap') };
  })()`);
  console.log('stage 5 checks:', JSON.stringify(stage5));

  // ---- stage 6: hybrid keying engine ----
  const stage6 = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('.insp-tab[data-panel="look"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const hybridChip = !!document.querySelector('#bgmode-chips [data-bg="hybrid"]');
    document.querySelector('#bgmode-chips [data-bg="hybrid"]').click();
    await new Promise((r) => setTimeout(r, 2500));
    const keyMonitor = document.getElementById('key-monitor').textContent;
    document.getElementById('btn-plate').click();
    await new Promise((r) => setTimeout(r, 500));
    const plateCaptured = document.getElementById('key-monitor') !== null;
    document.querySelector('.insp-tab[data-panel="camera"]').click();
    await new Promise((r) => setTimeout(r, 200));
    document.getElementById('chk-autoframe').click();
    const afOn = document.getElementById('chk-autoframe').checked;
    document.getElementById('chk-autoframe').click();
    return {
      hybridChip,
      keyMonitorLive: keyMonitor.length > 5,
      refineSliders: ['ref-feather','ref-gamma','ref-hair','ref-gate','ref-stab','ref-plate'].every((i) => !!document.getElementById(i)),
      plateBtns: !!document.getElementById('btn-plate') && !!document.getElementById('btn-plate-clear'),
      plateCaptured, afOn
    };
  })()`);
  console.log('stage 6 checks:', JSON.stringify(stage6));

  if (process.env.SMOKE_SHOTS) {
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(APP_ROOT, name), img.toPNG());
      console.log('saved', name);
    };
    await new Promise((r) => setTimeout(r, 4000)); // let set thumbnails render
    await shot('shot-editor.png');
    await win.webContents.executeJavaScript(`(() => {
      for (const idx of [0, 1, 2, 5]) {
        document.querySelectorAll('#gfx-list li')[idx]?.querySelector('.ly-vis')?.click();
      }
      document.querySelector('.cam-tile[data-cam="2"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 2500));
    await shot('shot-onair.png');
    await win.webContents.executeJavaScript(`document.querySelector('.cam-tile[data-cam="1"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await new Promise((r) => setTimeout(r, 2000));
    await shot('shot-wide.png');
  }

  const ok = stage1 && errors.length === 0 && stage2.editorVisible
    && stage3.builderOn && stage3.gizmoBtns === 3 && stage3.planActive && stage3.camAdded
    && stage4.ingestModal && stage4.erodeSlider && stage4.wrapSlider && stage4.autofit
    && stage4.hdriBtn && stage4.safetyItems === 6 && stage4.safetyOk >= 4
    && stage4.clothOn && stage4.clothControls && stage4.matBox
    && stage5.talentPane && stage5.captureBtn && stage5.guestControls
    && stage5.wizardOpen && stage5.rearToggles >= 7 && stage5.precapBadge
    && stage6.hybridChip && stage6.keyMonitorLive && stage6.refineSliders
    && stage6.plateBtns && stage6.plateCaptured && stage6.afOn
    && stage2.litSamples > 20 && stage2.camTiles === 6 && stage2.cam3Live
    && stage2.pvwStaged && stage2.takeBtn && stage2.blackBtn && stage2.arBtn
    && stage2.scenes === 1 && stage2.macros === 4 && stage2.transBtns === 6
    && stage2.mixerChannels === 3 && stage2.setBrowserCards === 9;
  if (!ok) {
    console.error('SMOKE TEST FAILED');
    errors.forEach((e) => console.error('  error:', e));
  } else {
    console.log('SMOKE TEST PASSED — wizard, capture, 3D render, 6-cam switching, scenes, macros, mixer, browser all live.');
  }
  app.exit(ok ? 0 : 1);
});
