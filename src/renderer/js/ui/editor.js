// Main studio editor wiring: library, viewport drag-drop, layers,
// control room, panels, graphics drawer, save/load, record & live.
import { state, serialize, serializeTemplate } from '../state.js';
import { SETS, PRESETS, LIGHT_PRESETS, SKIN_PRESETS, PROPS, GRAPHICS } from '../templates.js';
import { ANGLES } from '../engine/cameras.js';
import { capture } from '../capture.js';
import { toast } from './toasts.js';

const $ = (id) => document.getElementById(id);

export function initEditor(ctx) {
  const { studio, overlay, outputs } = ctx;
  let selectedId = null;

  // =============== rail tabs ===============
  document.querySelectorAll('.rail-tab[data-lib]').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.rail-tab[data-lib]').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      ['sets', 'props', 'graphics'].forEach((p) => { $('lib-' + p).hidden = p !== t.dataset.lib; });
    }));
  document.querySelectorAll('.rail-tab[data-panel]').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.rail-tab[data-panel]').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      ['layers', 'camera', 'light', 'look', 'brand', 'output'].forEach((p) => {
        $('panel-' + p).hidden = p !== t.dataset.panel;
      });
    }));

  // =============== library ===============
  function buildLibrary() {
    // sets
    const setsPane = $('lib-sets');
    setsPane.innerHTML = '';
    for (const [id, s] of Object.entries(SETS)) {
      const card = document.createElement('div');
      card.className = 'lib-card setcard' + (id === state.setId ? ' active' : '');
      card.innerHTML = `<div class="lib-ico" style="background:${s.thumb}"></div>
        <div><span class="l-name">${s.name}</span><span class="l-desc">${s.desc}</span></div>`;
      card.addEventListener('click', () => {
        studio.loadSet(id);
        studio.rebuildObjects();
        applyLighting();
        buildLibrary();
        toast('Switched to the ' + s.name + ' set');
      });
      setsPane.appendChild(card);
    }
    // props
    const propsPane = $('lib-props');
    propsPane.innerHTML = '';
    for (const [kind, p] of Object.entries(PROPS)) {
      propsPane.appendChild(libCard(p.ico, p.name, p.desc, 'prop:' + kind,
        () => { addProp(kind); }));
    }
    // graphics
    const gfxPane = $('lib-graphics');
    gfxPane.innerHTML = '';
    for (const [key, g] of Object.entries(GRAPHICS)) {
      gfxPane.appendChild(libCard(g.ico, g.name, g.desc, 'gfx:' + key,
        () => { overlay.toggle(key, true); refreshGfxList(); openGfxDrawer(key); }));
    }
  }
  function libCard(ico, name, desc, dragData, onAdd) {
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.draggable = true;
    card.innerHTML = `<div class="lib-ico">${ico}</div>
      <div><span class="l-name">${name}</span><span class="l-desc">${desc}</span></div>`;
    card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/chase', dragData));
    card.addEventListener('dblclick', onAdd);
    return card;
  }

  function addProp(kind, x, z) {
    const data = studio.addObject(kind, x ?? (1.8 + Math.random()), z ?? -0.6);
    selectObject(data.id);
    refreshLayerList();
    toast(PROPS[kind].name + ' added — drag it into place');
  }

  // =============== viewport: select / drag / drop ===============
  const canvas = $('program-canvas');
  const wrap = $('viewport-wrap');
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  };

  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    const id = studio.pick(p.x, p.y);
    selectObject(id);
    if (id) { dragging = true; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !selectedId) return;
    const p = toCanvas(e);
    const pt = studio.floorPoint(p.x, p.y);
    const data = state.objects.find((o) => o.id === selectedId);
    if (pt && data) {
      data.x = Math.round(pt.x * 100) / 100;
      data.z = Math.round(pt.z * 100) / 100;
      studio.syncObject(data);
    }
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('dragover'); $('drop-glow').hidden = false; });
  wrap.addEventListener('dragleave', () => { wrap.classList.remove('dragover'); $('drop-glow').hidden = true; });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('dragover');
    $('drop-glow').hidden = true;
    const data = e.dataTransfer.getData('text/chase');
    if (!data) return;
    const [type, key] = data.split(':');
    if (type === 'prop') {
      const p = toCanvas(e);
      const pt = studio.floorPoint(p.x, p.y);
      addProp(key, pt?.x, pt?.z);
    } else if (type === 'gfx') {
      overlay.toggle(key, true);
      refreshGfxList();
      openGfxDrawer(key);
    }
  });

  $('btn-safearea').addEventListener('click', () => { $('safe-areas').hidden = !$('safe-areas').hidden; });
  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvas.requestFullscreen().catch(() => {});
  });

  // =============== layers panel ===============
  function selectObject(id) {
    selectedId = id;
    studio.setSelectionGlow(id);
    refreshLayerList();
    const props = $('obj-props');
    if (!id) { props.hidden = true; return; }
    const data = state.objects.find((o) => o.id === id);
    if (!data) { props.hidden = true; return; }
    props.hidden = false;
    $('obj-props-title').textContent = PROPS[data.kind]?.name || data.kind;
    $('obj-scale').value = data.scale;
    $('obj-rot').value = data.rotY;
    $('obj-height').value = data.height || 0;
    $('obj-media').hidden = !studio.objects.get(id)?.userData.mediaCapable;
  }

  function refreshLayerList() {
    const ul = $('layer-list');
    ul.innerHTML = '';
    if (!state.objects.length) {
      ul.innerHTML = '<li class="muted" style="cursor:default">No objects yet — drag props from the library.</li>';
    }
    for (const o of state.objects) {
      const li = document.createElement('li');
      li.className = o.id === selectedId ? 'selected' : '';
      li.innerHTML = `<span class="ly-ico">${PROPS[o.kind]?.ico || '▢'}</span>${PROPS[o.kind]?.name || o.kind}
        <button class="ly-vis ${o.visible !== false ? 'on' : ''}" title="Show / hide">●</button>`;
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('ly-vis')) {
          o.visible = o.visible === false;
          studio.syncObject(o);
          e.target.classList.toggle('on', o.visible !== false);
          return;
        }
        selectObject(o.id);
      });
      ul.appendChild(li);
    }
    refreshGfxList();
  }

  function refreshGfxList() {
    const ul = $('gfx-list');
    ul.innerHTML = '';
    for (const [key, g] of Object.entries(GRAPHICS)) {
      const on = state.graphics[key].on;
      const li = document.createElement('li');
      li.innerHTML = `<span class="ly-ico">${g.ico}</span>${g.name}
        <button class="ly-vis ${on ? 'on' : ''}" title="On air / off air">●</button>`;
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('ly-vis')) {
          overlay.toggle(key, !state.graphics[key].on);
          e.target.classList.toggle('on', state.graphics[key].on);
          return;
        }
        openGfxDrawer(key);
      });
      ul.appendChild(li);
    }
  }

  $('obj-scale').addEventListener('input', (e) => updateSelected('scale', parseFloat(e.target.value)));
  $('obj-rot').addEventListener('input', (e) => updateSelected('rotY', parseFloat(e.target.value)));
  $('obj-height').addEventListener('input', (e) => updateSelected('height', parseFloat(e.target.value)));
  function updateSelected(field, val) {
    const data = state.objects.find((o) => o.id === selectedId);
    if (!data) return;
    data[field] = val;
    studio.syncObject(data);
  }
  $('obj-delete').addEventListener('click', () => {
    if (!selectedId) return;
    studio.removeObject(selectedId);
    selectObject(null);
  });
  $('obj-media').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('any');
    if (!media) return;
    const data = state.objects.find((o) => o.id === selectedId);
    const g = studio.objects.get(selectedId);
    if (data && g?.userData.setMedia) {
      data.media = { url: media.url, type: media.type, path: media.path };
      g.userData.setMedia(media.url, media.type);
      toast(media.name + ' placed on screen');
    }
  });

  // =============== control room: angles ===============
  const crCams = $('cr-cams');
  for (const a of ANGLES) {
    const b = document.createElement('button');
    b.className = 'cam-btn' + (a.num === state.camera.active ? ' program' : '');
    b.dataset.cam = a.num;
    b.innerHTML = `<span class="cb-num">CAM ${a.num}</span><span class="cb-name">${a.name}</span>`;
    b.addEventListener('click', () => switchCam(a.num));
    crCams.appendChild(b);
  }
  function switchCam(num) {
    state.camera.active = num;
    studio.rig.switchTo(num, state.camera.mode, state.presenter.x);
    crCams.querySelectorAll('.cam-btn').forEach((b) =>
      b.classList.toggle('program', Number(b.dataset.cam) === num));
  }
  $('btn-transition-cut').addEventListener('click', () => setTransition('cut'));
  $('btn-transition-move').addEventListener('click', () => setTransition('move'));
  function setTransition(mode) {
    state.camera.mode = mode;
    $('btn-transition-cut').classList.toggle('active', mode === 'cut');
    $('btn-transition-move').classList.toggle('active', mode === 'move');
  }
  $('chk-drift').addEventListener('change', (e) => { state.camera.drift = e.target.checked; });
  $('btn-mute').addEventListener('click', () => {
    const muted = !state.capture.muted;
    capture.setMuted(muted);
    $('btn-mute').classList.toggle('muted', muted);
    $('btn-mute').textContent = muted ? 'MUTED' : 'MIC';
  });

  // camera panel
  $('cam-movedur').addEventListener('input', (e) => {
    state.camera.moveDuration = parseFloat(e.target.value);
    $('lbl-movedur').textContent = e.target.value + 's';
  });
  $('cam-punch').addEventListener('input', (e) => {
    state.camera.punch = parseFloat(e.target.value);
    $('lbl-punch').textContent = e.target.value + '%';
  });
  $('pres-x').addEventListener('input', (e) => { state.presenter.x = parseFloat(e.target.value); });
  $('pres-scale').addEventListener('input', (e) => { state.presenter.scale = parseFloat(e.target.value); });
  $('pres-y').addEventListener('input', (e) => { state.presenter.y = parseFloat(e.target.value); });

  // =============== lighting ===============
  const lightChips = $('light-presets');
  for (const [id, p] of Object.entries(LIGHT_PRESETS)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (id === state.lighting.preset ? ' active' : '');
    chip.textContent = p.name;
    chip.dataset.preset = id;
    chip.addEventListener('click', () => {
      Object.assign(state.lighting, { preset: id, key: p.key, fill: p.fill, back: p.back, temp: p.temp, accent: p.accent });
      applyLighting();
      refreshLightInputs();
      lightChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    });
    lightChips.appendChild(chip);
  }
  function refreshLightInputs() {
    $('light-key').value = state.lighting.key;
    $('light-fill').value = state.lighting.fill;
    $('light-back').value = state.lighting.back;
    $('light-temp').value = state.lighting.temp;
    $('light-accent').value = state.lighting.accent;
  }
  for (const [id, field] of [['light-key', 'key'], ['light-fill', 'fill'], ['light-back', 'back'], ['light-temp', 'temp'], ['light-accent', 'accent']]) {
    $(id).addEventListener('input', (e) => {
      state.lighting[field] = parseFloat(e.target.value);
      applyLighting();
    });
  }
  function applyLighting() {
    studio.lights.apply(state.lighting, SETS[state.setId].theme);
    applyEnhance();
  }

  // =============== look: background + enhance ===============
  document.querySelectorAll('#bgmode-chips .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.bg === state.bgMode);
    c.addEventListener('click', () => ctx.setBgMode(c.dataset.bg).then(() => refreshBgChips()));
  });
  function refreshBgChips() {
    document.querySelectorAll('#bgmode-chips .chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.bg === state.bgMode));
    $('chroma-controls').style.display = state.bgMode === 'chroma' ? '' : 'none';
  }
  $('key-color').addEventListener('input', (e) => { state.chroma.color = e.target.value; applyChroma(); });
  $('key-sim').addEventListener('input', (e) => { state.chroma.similarity = parseFloat(e.target.value); applyChroma(); });
  $('key-smooth').addEventListener('input', (e) => { state.chroma.smoothness = parseFloat(e.target.value); applyChroma(); });
  $('key-spill').addEventListener('input', (e) => { state.chroma.spill = parseFloat(e.target.value); applyChroma(); });
  function applyChroma() { studio.presenter.applyChroma(state.chroma); }

  const skinChips = $('skin-presets');
  for (const [id, p] of Object.entries(SKIN_PRESETS)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (id === 'natural' ? ' active' : '');
    chip.textContent = p.name;
    chip.addEventListener('click', () => {
      Object.assign(state.enhance, { exposure: p.exposure, warmth: p.warmth, saturation: p.saturation, smoothing: p.smoothing });
      applyEnhance();
      refreshEnhanceInputs();
      skinChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    });
    skinChips.appendChild(chip);
  }
  function refreshEnhanceInputs() {
    $('enh-exposure').value = state.enhance.exposure;
    $('enh-warmth').value = state.enhance.warmth;
    $('enh-sat').value = state.enhance.saturation;
    $('enh-smooth').value = state.enhance.smoothing;
  }
  for (const [id, field] of [['enh-exposure', 'exposure'], ['enh-warmth', 'warmth'], ['enh-sat', 'saturation'], ['enh-smooth', 'smoothing']]) {
    $(id).addEventListener('input', (e) => {
      state.enhance[field] = parseFloat(e.target.value);
      applyEnhance();
    });
  }
  function applyEnhance() { studio.presenter.applyEnhance(state.enhance, studio.lights.grade); }

  // =============== brand ===============
  $('brand-name').addEventListener('input', (e) => { state.brand.name = e.target.value; studio.refreshBrand(); });
  $('brand-primary').addEventListener('input', (e) => { state.brand.primary = e.target.value; studio.refreshBrand(); });
  $('brand-accent').addEventListener('input', (e) => { state.brand.accent = e.target.value; studio.refreshBrand(); });
  $('btn-brand-logo').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('image');
    if (!media) return;
    state.brand.logo = { url: media.url, path: media.path };
    overlay.setLogo(media.url);
    const img = $('brand-logo-preview');
    img.src = media.url;
    img.hidden = false;
    if (!state.graphics.logoBug.on) overlay.toggle('logoBug', true);
    refreshGfxList();
  });

  // =============== output panel ===============
  $('out-res').addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    state.output.width = w; state.output.height = h;
    ctx.resizeOutput(w, h);
    $('stat-res').textContent = (h === 1080 ? '1080p' : '720p') + state.output.fps;
  });
  $('out-fps').addEventListener('change', (e) => {
    state.output.fps = parseInt(e.target.value, 10);
    $('stat-res').textContent = (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps;
  });
  $('out-bitrate').addEventListener('change', (e) => { state.output.bitrateK = parseInt(e.target.value, 10); });
  $('out-quality').addEventListener('change', (e) => {
    state.output.quality = e.target.value;
    studio.setQuality(e.target.value);
    $('stat-quality').textContent = e.target.value === 'auto' ? 'Auto quality' : e.target.value + ' quality';
  });

  // =============== graphics drawer ===============
  function openGfxDrawer(key) {
    const drawer = $('gfx-drawer');
    drawer.hidden = false;
    $('gfx-drawer-title').textContent = GRAPHICS[key].name;
    const body = $('gfx-drawer-body');
    const g = state.graphics[key];
    const forms = {
      lowerThird: `
        <div class="field slim"><label>Name</label><input type="text" id="gd-name" value="${esc(g.name)}"></div>
        <div class="field slim"><label>Title / role</label><input type="text" id="gd-title" value="${esc(g.title)}"></div>`,
      ticker: `
        <div class="field slim"><label>Label</label><input type="text" id="gd-label" value="${esc(g.label)}"></div>
        <div class="field slim"><label>Headlines (use • between items)</label><input type="text" id="gd-text" value="${esc(g.text)}"></div>
        <div class="field slim"><label>Speed</label><input type="range" id="gd-speed" min="0.4" max="2.5" step="0.1" value="${g.speed}"></div>`,
      logoBug: `
        <div class="field slim"><label>Corner</label>
          <select id="gd-corner">
            <option value="tr"${g.corner === 'tr' ? ' selected' : ''}>Top right</option>
            <option value="tl"${g.corner === 'tl' ? ' selected' : ''}>Top left</option>
            <option value="br"${g.corner === 'br' ? ' selected' : ''}>Bottom right</option>
            <option value="bl"${g.corner === 'bl' ? ' selected' : ''}>Bottom left</option>
          </select></div>
        <div class="field slim"><label>Size</label><input type="range" id="gd-size" min="0.5" max="2" step="0.05" value="${g.size}"></div>
        <div class="field slim"><label>Opacity</label><input type="range" id="gd-opacity" min="0.2" max="1" step="0.05" value="${g.opacity}"></div>
        <p class="hint">Set your logo image in the Brand panel.</p>`,
      banner: `<div class="field slim"><label>Banner text</label><input type="text" id="gd-btext" value="${esc(g.text)}"></div>`,
      title: `<div class="field slim"><label>Title text</label><input type="text" id="gd-ttext" value="${esc(g.text)}"></div>`,
      clock: `<p class="hint">Shows the studio wall-clock time on screen. Toggle it from the Layers panel.</p>`
    };
    body.innerHTML = (forms[key] || '') + `
      <div class="row gap" style="margin-top:10px">
        <button class="btn primary slim" id="gd-air">${g.on ? 'Take off air' : 'Put on air'}</button>
      </div>`;
    bind('gd-name', (v) => { g.name = v; });
    bind('gd-title', (v) => { g.title = v; });
    bind('gd-label', (v) => { g.label = v; });
    bind('gd-text', (v) => { g.text = v; });
    bind('gd-speed', (v) => { g.speed = parseFloat(v); });
    bind('gd-corner', (v) => { g.corner = v; });
    bind('gd-size', (v) => { g.size = parseFloat(v); });
    bind('gd-opacity', (v) => { g.opacity = parseFloat(v); });
    bind('gd-btext', (v) => { g.text = v; });
    bind('gd-ttext', (v) => { g.text = v; });
    document.getElementById('gd-air')?.addEventListener('click', () => {
      overlay.toggle(key, !g.on);
      refreshGfxList();
      openGfxDrawer(key);
    });
  }
  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => fn(e.target.value));
  }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  $('gfx-drawer-close').addEventListener('click', () => { $('gfx-drawer').hidden = true; });

  // =============== topbar: save / open / export ===============
  $('project-name').addEventListener('input', (e) => { state.meta.name = e.target.value; });
  $('btn-save').addEventListener('click', saveProject);
  async function saveProject() {
    const p = await window.chase.saveProject(serialize(), state.projectPath);
    if (p) { state.projectPath = p; toast('Project saved', 'ok'); }
  }
  $('btn-open2').addEventListener('click', async () => {
    const r = await window.chase.openProject();
    if (!r) return;
    if (r.error) return toast(r.error, 'err');
    ctx.loadProject(r.json, r.path);
  });
  $('btn-export-template').addEventListener('click', async () => {
    const p = await window.chase.exportTemplate(serializeTemplate());
    if (p) toast('Template exported — share it with any Chase Studio user', 'ok');
  });

  // =============== record ===============
  let timerInt = null;
  function startTimer(from) {
    $('rec-timer').hidden = false;
    clearInterval(timerInt);
    timerInt = setInterval(() => {
      const s = Math.floor((Date.now() - from) / 1000);
      $('rec-timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 500);
  }
  function stopTimer() {
    if (!outputs.recording && !outputs.streaming) { clearInterval(timerInt); $('rec-timer').hidden = true; }
  }

  $('btn-record').addEventListener('click', async () => {
    if (!outputs.recording) {
      const p = await outputs.startRecording(state.meta.name, state.output.bitrateK);
      if (p) {
        $('btn-record').classList.add('on');
        startTimer(Date.now());
        toast('Recording started', 'ok');
      }
    } else {
      const r = await outputs.stopRecording();
      $('btn-record').classList.remove('on');
      stopTimer();
      if (r?.path) {
        $('recdone-path').textContent = r.path;
        $('modal-recdone').hidden = false;
        $('modal-recdone').dataset.path = r.path;
        $('modal-recdone').dataset.h264 = r.h264 ? '1' : '';
      }
    }
  });
  $('recdone-close').addEventListener('click', () => { $('modal-recdone').hidden = true; });
  $('recdone-reveal').addEventListener('click', () => window.chase.recReveal($('modal-recdone').dataset.path));
  $('recdone-mp4').addEventListener('click', async () => {
    const m = $('modal-recdone');
    $('recdone-mp4').textContent = 'Converting…';
    const r = await window.chase.recFinalizeMp4(m.dataset.path, !!m.dataset.h264);
    $('recdone-mp4').textContent = 'Convert to MP4';
    if (r.ok) { toast('MP4 saved: ' + r.path, 'ok', 5000); m.hidden = true; }
    else toast('Convert failed: ' + r.error, 'err', 5000);
  });

  // =============== live ===============
  const DEST = {
    custom: { url: '', hint: 'Paste the RTMP server URL and stream key from your platform or media server.' },
    youtube: { url: 'rtmp://a.rtmp.youtube.com/live2', hint: 'YouTube Studio → Go live → copy your Stream key. The server URL is pre-filled.' },
    facebook: { url: 'rtmps://live-api-s.facebook.com:443/rtmp/', hint: 'Facebook Live Producer → Streaming software → copy your Stream key.' }
  };
  $('live-dest').addEventListener('change', (e) => {
    const d = DEST[e.target.value];
    $('live-url').value = d.url;
    $('live-hint').textContent = d.hint;
  });
  $('btn-live').addEventListener('click', () => {
    if (outputs.streaming) {
      outputs.stopStreaming();
      $('btn-live').classList.remove('on');
      $('btn-live').textContent = 'GO LIVE';
      stopTimer();
      toast('Stream stopped');
      return;
    }
    $('live-hint').textContent = DEST[$('live-dest').value].hint;
    $('modal-live').hidden = false;
  });
  $('live-cancel').addEventListener('click', () => { $('modal-live').hidden = true; });
  $('live-start').addEventListener('click', async () => {
    const url = $('live-url').value.trim();
    const key = $('live-key').value.trim();
    if (!url.startsWith('rtmp')) return setLiveStatus('err', 'Enter a valid rtmp:// or rtmps:// URL.');
    if (!key) return setLiveStatus('err', 'Enter your stream key.');
    setLiveStatus('', 'Starting encoder…');
    const r = await outputs.startStreaming({ url, key, bitrateK: state.output.bitrateK });
    if (!r.ok) return setLiveStatus('err', r.error || 'Could not start the stream.');
  });
  function setLiveStatus(kind, msg) {
    const box = $('live-status');
    box.hidden = false;
    box.className = 'statusbox ' + kind;
    box.textContent = msg;
  }
  outputs.onStreamState = (s) => {
    if (s.status === 'connecting') setLiveStatus('', s.message);
    if (s.status === 'live') {
      setLiveStatus('ok', 'You are live.');
      setTimeout(() => { $('modal-live').hidden = true; }, 900);
      $('btn-live').classList.add('on');
      $('btn-live').textContent = 'ON AIR';
      startTimer(outputs.streamStartedAt || Date.now());
    }
    if (s.status === 'error') {
      setLiveStatus('err', s.message);
      $('btn-live').classList.remove('on');
      $('btn-live').textContent = 'GO LIVE';
      stopTimer();
      toast(s.message, 'err', 6000);
    }
    if (s.status === 'stopped') {
      $('btn-live').classList.remove('on');
      $('btn-live').textContent = 'GO LIVE';
      stopTimer();
    }
  };

  // =============== keyboard ===============
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '5') switchCam(Number(e.key));
    if (e.key === 'Delete' && selectedId) { studio.removeObject(selectedId); selectObject(null); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
  });

  // =============== refresh-from-state (project load) ===============
  function refreshAll() {
    $('project-name').value = state.meta.name;
    refreshLightInputs();
    refreshEnhanceInputs();
    refreshBgChips();
    $('brand-name').value = state.brand.name;
    $('brand-primary').value = state.brand.primary;
    $('brand-accent').value = state.brand.accent;
    if (state.brand.logo?.url) {
      overlay.setLogo(state.brand.logo.url);
      $('brand-logo-preview').src = state.brand.logo.url;
      $('brand-logo-preview').hidden = false;
    }
    $('cam-movedur').value = state.camera.moveDuration;
    $('cam-punch').value = state.camera.punch;
    $('pres-x').value = state.presenter.x;
    $('pres-scale').value = state.presenter.scale;
    $('pres-y').value = state.presenter.y;
    $('chk-drift').checked = state.camera.drift;
    setTransition(state.camera.mode);
    $('out-res').value = state.output.width + 'x' + state.output.height;
    $('out-fps').value = String(state.output.fps);
    $('out-bitrate').value = String(state.output.bitrateK);
    $('out-quality').value = state.output.quality;
    $('stat-res').textContent = (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps;
    lightChips.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.preset === state.lighting.preset));
    applyLighting();
    applyChroma();
    applyEnhance();
    buildLibrary();
    refreshLayerList();
    switchCam(state.camera.active);
  }

  // fps statchip
  setInterval(() => { $('stat-fps').textContent = (studio.fps || '—') + ' fps'; }, 1000);

  buildLibrary();
  refreshLayerList();
  refreshAll();
  return { refreshAll, applyLighting, applyChroma, applyEnhance };
}
