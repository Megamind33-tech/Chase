// Chase Studio Pro — main editor wiring.
// Icon rail + asset browser, cinematic viewport, CAM strip, inspector tabs,
// bottom production strip (scenes / macros / transitions / mixer / output),
// modals, autosave, health chips, keyboard.
import { state, serialize, serializeTemplate } from '../state.js';
import { SETS, SET_CATEGORIES, PRESETS, LIGHT_MOODS, SKIN_PRESETS, PROPS, GRAPHICS, MACROS } from '../templates.js';
import { ANGLES } from '../engine/cameras.js';
import { snapshotScene, applyScene, runMacro } from '../scenes.js';
import { capture } from '../capture.js';
import { toast } from './toasts.js';

const $ = (id) => document.getElementById(id);

export function initEditor(ctx) {
  const { studio, overlay, outputs, audio, compositor } = ctx;
  let selectedId = null;
  let activeNav = 'sets';
  let activeCat = 'all';
  let liveSceneId = null;

  /* ================= ICON RAIL + BROWSER ================= */
  const NAV_TITLES = {
    sets: 'Studio sets', props: '3D objects', graphics: 'Graphics & overlays',
    lighting: 'Lighting moods', cameras: 'Virtual cameras', audio: 'Audio & jingles',
    scripts: 'Scripts & rundowns', plugins: 'Plugins'
  };

  document.querySelectorAll('.irail-btn').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.irail-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      activeNav = b.dataset.nav;
      buildBrowser();
    }));

  function buildBrowser() {
    $('browser-title').textContent = NAV_TITLES[activeNav];
    const cats = $('browser-cats');
    cats.innerHTML = '';
    if (activeNav === 'sets') {
      for (const c of SET_CATEGORIES) {
        const b = document.createElement('button');
        b.className = 'cat' + (c.id === activeCat ? ' active' : '');
        b.textContent = c.name;
        b.addEventListener('click', () => { activeCat = c.id; buildBrowser(); });
        cats.appendChild(b);
      }
    }
    const body = $('browser-body');
    body.innerHTML = '';
    const hint = $('browser-hint');
    hint.textContent = 'Drag into the studio, or double-click to apply.';
    if (activeNav === 'sets') buildSetsPane(body);
    else if (activeNav === 'props') buildPropsPane(body);
    else if (activeNav === 'graphics') buildGraphicsPane(body);
    else if (activeNav === 'lighting') buildLightingPane(body);
    else if (activeNav === 'cameras') buildCamerasPane(body);
    else if (activeNav === 'audio') buildAudioPane(body);
    else buildStagedPane(body, activeNav);
  }

  /* ---- sets pane: rich live-render thumbnails ---- */
  const thumbCache = new Map();
  let thumbQueue = [];
  let thumbBusy = false;

  function thumbKey(id) {
    return `thumb1:${id}:${state.brand.primary}:${state.brand.accent}:${state.brand.name}`;
  }

  function buildSetsPane(body) {
    for (const [id, s] of Object.entries(SETS)) {
      if (activeCat !== 'all' && !s.cat.includes(activeCat)) continue;
      const card = document.createElement('div');
      card.className = 'bset-card' + (id === state.setId ? ' active' : '');
      card.draggable = true;
      const cached = thumbCache.get(thumbKey(id)) || localStorage.getItem(thumbKey(id));
      card.innerHTML = `
        ${cached ? `<img class="bset-thumb" src="${cached}" alt="">` : `<div class="bset-thumb loading">RENDERING…</div>`}
        <span class="bset-tag">${s.cat[0]}</span>
        ${id === state.setId ? '<span class="bset-live">IN USE</span>' : ''}
        <div class="bset-meta"><span class="n">${s.name}</span><span class="d">${s.desc}</span></div>`;
      const apply = () => {
        compositor.beginTransition(state.transition.type === 'wipe' ? 'wipe' : 'fade', 0.5);
        studio.loadSet(id);
        studio.rebuildObjects();
        applyLighting();
        buildBrowser();
        toast('Switched to ' + s.name);
      };
      card.addEventListener('dblclick', apply);
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/chase', 'set:' + id));
      body.appendChild(card);
      if (!cached) queueThumb(id, card);
    }
  }

  function queueThumb(id, card) {
    thumbQueue.push({ id, card });
    pumpThumbs();
  }
  async function pumpThumbs() {
    if (thumbBusy || !thumbQueue.length) return;
    thumbBusy = true;
    const { id, card } = thumbQueue.shift();
    try {
      const url = await studio.snapshotSet(id, 340, 191);
      thumbCache.set(thumbKey(id), url);
      try { localStorage.setItem(thumbKey(id), url); } catch {}
      const img = document.createElement('img');
      img.className = 'bset-thumb';
      img.src = url;
      card.querySelector('.bset-thumb')?.replaceWith(img);
    } catch {}
    thumbBusy = false;
    setTimeout(pumpThumbs, 120);
  }
  function invalidateThumbs() {
    // brand changed → regenerate set previews lazily next time
    for (const id of Object.keys(SETS)) {
      thumbCache.delete(thumbKey(id));
    }
  }

  /* ---- props pane ---- */
  function buildPropsPane(body) {
    for (const [kind, p] of Object.entries(PROPS)) {
      body.appendChild(libCard(p.ico, p.name, p.desc, 'prop:' + kind, () => addProp(kind)));
    }
  }

  /* ---- graphics pane ---- */
  function buildGraphicsPane(body) {
    for (const [key, g] of Object.entries(GRAPHICS)) {
      const card = libCard(g.ico, g.name, g.desc, 'gfx:' + key,
        () => { overlay.toggle(key, true); refreshGfxList(); openGfxDrawer(key); });
      if (state.graphics[key].on) {
        const st = document.createElement('span');
        st.className = 'l-state';
        st.textContent = 'ON AIR';
        card.appendChild(st);
      }
      body.appendChild(card);
    }
  }

  /* ---- lighting pane ---- */
  function buildLightingPane(body) {
    $('browser-hint').textContent = 'Click a mood to relight the studio.';
    for (const [id, m] of Object.entries(LIGHT_MOODS)) {
      const card = document.createElement('div');
      card.className = 'mood-card' + (id === state.lighting.preset ? ' active' : '');
      const warmCol = m.temp >= 0 ? '#ffb45e' : '#5ea8ff';
      card.innerHTML = `
        <div class="mood-swatch" style="background:linear-gradient(100deg, #0a0e18, ${warmCol}33 ${40 + m.key * 20}%, #0a0e18); box-shadow: inset 0 -8px 18px rgba(0,0,0,.5)"></div>
        <span class="n">${m.name}</span>`;
      card.addEventListener('click', () => {
        Object.assign(state.lighting, { preset: id, key: m.key, fill: m.fill, back: m.back, temp: m.temp, accent: m.accent, haze: m.haze });
        applyLighting();
        refreshLightInputs();
        buildBrowser();
      });
      body.appendChild(card);
    }
  }

  /* ---- cameras pane ---- */
  function buildCamerasPane(body) {
    $('browser-hint').textContent = 'Click an angle to take it to program. Keys 1–6.';
    for (const a of ANGLES) {
      const card = libCard('C' + a.num, 'CAM ' + a.num + ' · ' + a.name,
        'Virtual ' + a.name.toLowerCase() + ' angle', null, () => switchCam(a.num));
      card.draggable = false;
      card.addEventListener('click', () => switchCam(a.num));
      if (state.camera.active === a.num) {
        const st = document.createElement('span');
        st.className = 'l-state'; st.textContent = 'PGM'; st.style.color = '#ff9b9b';
        card.appendChild(st);
      }
      body.appendChild(card);
    }
    const staged = document.createElement('div');
    staged.className = 'staged-pane';
    staged.innerHTML = `<p><b>IP / NDI cameras and a second physical camera</b> arrive in the
      camera update. Phone cameras already work today through DroidCam/Camo-style
      virtual webcams — pick them in the camera selector.</p>`;
    body.appendChild(staged);
  }

  /* ---- audio pane ---- */
  function buildAudioPane(body) {
    $('browser-hint').textContent = 'Jingles and beds play into the JGL mixer channel.';
    const add = document.createElement('button');
    add.className = 'btn ghost slim';
    add.style.width = '100%';
    add.style.marginBottom = '9px';
    add.textContent = '+ Add audio file…';
    add.addEventListener('click', async () => {
      const media = await window.chase.pickMedia('audio');
      if (!media) return;
      state.audio.jingles.push({ name: media.name, path: media.path, url: media.url });
      buildBrowser();
    });
    body.appendChild(add);
    if (!state.audio.jingles.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No jingles yet. Add stings, beds and intro music — they mix into the program audio.';
      body.appendChild(p);
    }
    state.audio.jingles.forEach((j, i) => {
      const card = libCard('♫', j.name, 'Click to play into the mix', null, () => {});
      card.draggable = false;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        audio.playJingle(j.url);
        refreshJingleBtn();
        toast('Playing ' + j.name);
      });
      const x = document.createElement('button');
      x.className = 'ly-vis';
      x.textContent = '✕';
      x.style.marginLeft = 'auto';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        state.audio.jingles.splice(i, 1);
        buildBrowser();
      });
      card.appendChild(x);
      body.appendChild(card);
    });
  }

  /* ---- staged panes (honest placeholders, no fake buttons) ---- */
  function buildStagedPane(body, nav) {
    const copy = nav === 'scripts'
      ? 'Scripts & rundowns — teleprompter text, story order and timed segments — are a staged rollout. The data model already saves with your project, so rundowns you plan now will carry over.'
      : 'The plugin system (custom graphics packs, data feeds, scoreboards) is a staged rollout. Scene templates already cover shareable looks today via Export.';
    const div = document.createElement('div');
    div.className = 'staged-pane';
    div.innerHTML = `<div class="big">⧗</div><p>${copy}</p>`;
    body.appendChild(div);
    $('browser-hint').textContent = 'Staged rollout — nothing fake to click here.';
  }

  function libCard(ico, name, desc, dragData, onAdd) {
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.draggable = !!dragData;
    card.innerHTML = `<div class="lib-ico">${ico}</div>
      <div><span class="l-name">${name}</span><span class="l-desc">${desc}</span></div>`;
    if (dragData) card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/chase', dragData));
    if (onAdd) card.addEventListener('dblclick', onAdd);
    return card;
  }

  function addProp(kind, x, z) {
    const data = studio.addObject(kind, x ?? (1.8 + Math.random()), z ?? 0.4);
    selectObject(data.id);
    refreshLayerList();
    toast(PROPS[kind].name + ' added — drag it into place');
  }

  /* ================= VIEWPORT ================= */
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
    } else if (type === 'set') {
      compositor.beginTransition('fade', 0.5);
      studio.loadSet(key);
      studio.rebuildObjects();
      applyLighting();
      buildBrowser();
      toast('Switched to ' + SETS[key].name);
    }
  });

  $('btn-safearea').addEventListener('click', () => { $('safe-areas').hidden = !$('safe-areas').hidden; });
  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvas.requestFullscreen().catch(() => {});
  });

  /* ================= CAM STRIP ================= */
  const camstrip = $('camstrip');
  function buildCamStrip() {
    camstrip.innerHTML = '';
    for (const a of ANGLES) {
      const tile = document.createElement('button');
      tile.className = 'cam-tile' + (a.num === state.camera.active ? ' program' : '');
      tile.dataset.cam = a.num;
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 108;
      tile.appendChild(cv);
      const label = document.createElement('span');
      label.className = 'ct-label';
      label.innerHTML = `<span>CAM ${a.num}</span><span>${a.name.toUpperCase()}</span>`;
      tile.appendChild(label);
      tile.addEventListener('click', () => switchCam(a.num));
      camstrip.appendChild(tile);
      studio.registerThumb(a.num, cv);
    }
    const add = document.createElement('button');
    add.className = 'cam-add';
    add.title = 'IP/NDI and second-camera inputs arrive in the camera update';
    add.innerHTML = '<span class="plus">+</span>ADD CAM';
    add.addEventListener('click', () =>
      toast('IP/NDI and multi-camera inputs are staged for the camera update — phone cameras already work via virtual-webcam apps.', '', 5200));
    camstrip.appendChild(add);
  }

  function switchCam(num, viaScene = false) {
    state.camera.active = num;
    const t = state.transition;
    if (!viaScene && (t.type === 'fade' || t.type === 'wipe')) {
      compositor.beginTransition(t.type, t.duration);
      studio.rig.switchTo(num, 'cut', state.presenter.x);
    } else {
      studio.rig.switchTo(num, t.type === 'move' ? 'move' : 'cut', state.presenter.x);
    }
    camstrip.querySelectorAll('.cam-tile').forEach((b) =>
      b.classList.toggle('program', Number(b.dataset.cam) === num));
    const a = ANGLES.find((x) => x.num === num);
    $('vp-cam').textContent = `CAM ${num} · ${a.name.toUpperCase()}`;
    if (activeNav === 'cameras') buildBrowser();
  }

  /* ================= INSPECTOR TABS ================= */
  document.querySelectorAll('.insp-tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.insp-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      ['inspect', 'camera', 'light', 'look', 'skin', 'brand', 'stream'].forEach((p) => {
        $('panel-' + p).hidden = p !== t.dataset.panel;
      });
    }));

  /* ---- inspect: selection + layers ---- */
  function selectObject(id) {
    selectedId = id;
    studio.setSelectionGlow(id);
    refreshLayerList();
    const props = $('obj-props');
    const data = id ? state.objects.find((o) => o.id === id) : null;
    props.hidden = !data;
    $('inspect-empty').hidden = !!data;
    if (!data) return;
    $('obj-props-title').textContent = PROPS[data.kind]?.name || data.kind;
    $('obj-scale').value = data.scale; $('o-scale').value = (+data.scale).toFixed(2);
    $('obj-rot').value = data.rotY; $('o-rot').value = data.rotY + '°';
    $('obj-height').value = data.height || 0; $('o-h').value = (+(data.height || 0)).toFixed(2);
    $('obj-opacity').value = data.opacity ?? 1; $('o-op').value = Math.round((data.opacity ?? 1) * 100) + '%';
    $('obj-media').hidden = !studio.objects.get(id)?.userData.mediaCapable;
  }

  function refreshLayerList() {
    const ul = $('layer-list');
    ul.innerHTML = '';
    if (!state.objects.length) {
      ul.innerHTML = '<li class="muted" style="cursor:default">No objects yet — drag from Objects.</li>';
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
          if (activeNav === 'graphics') buildBrowser();
          return;
        }
        openGfxDrawer(key);
      });
      ul.appendChild(li);
    }
    if (activeNav === 'graphics') { /* keep cards' ON AIR badges fresh on next build */ }
  }

  const bindSlider = (id, fn) => $(id).addEventListener('input', (e) => fn(parseFloat(e.target.value)));
  bindSlider('obj-scale', (v) => { updateSelected('scale', v); $('o-scale').value = v.toFixed(2); });
  bindSlider('obj-rot', (v) => { updateSelected('rotY', v); $('o-rot').value = v + '°'; });
  bindSlider('obj-height', (v) => { updateSelected('height', v); $('o-h').value = v.toFixed(2); });
  bindSlider('obj-opacity', (v) => { updateSelected('opacity', v); $('o-op').value = Math.round(v * 100) + '%'; });
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

  /* ---- camera panel ---- */
  bindSlider('cam-focal', (v) => { state.camera.fovScale = 2 - v; $('o-focal').value = v.toFixed(2) + '×'; });
  bindSlider('cam-movedur', (v) => { state.camera.moveDuration = v; $('lbl-movedur').value = v + 's'; });
  bindSlider('cam-punch', (v) => { state.camera.punch = v; $('lbl-punch').value = v + '%'; });
  $('chk-drift').addEventListener('change', (e) => { state.camera.drift = e.target.checked; });
  bindSlider('cam-driftamt', (v) => { state.camera.driftAmount = v; });
  bindSlider('pres-x', (v) => { state.presenter.x = v; });
  bindSlider('pres-scale', (v) => { state.presenter.scale = v; });
  bindSlider('pres-y', (v) => { state.presenter.y = v; });

  /* ---- light panel ---- */
  const lightChips = $('light-presets');
  for (const [id, m] of Object.entries(LIGHT_MOODS)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (id === state.lighting.preset ? ' active' : '');
    chip.textContent = m.name;
    chip.dataset.preset = id;
    chip.addEventListener('click', () => {
      Object.assign(state.lighting, { preset: id, key: m.key, fill: m.fill, back: m.back, temp: m.temp, accent: m.accent, haze: m.haze });
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
    $('light-haze').value = state.lighting.haze ?? 0.6;
    $('light-deskglow').value = state.lighting.deskGlow ?? 1;
    lightChips.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.preset === state.lighting.preset));
  }
  for (const [id, field] of [['light-key', 'key'], ['light-fill', 'fill'], ['light-back', 'back'], ['light-temp', 'temp'], ['light-accent', 'accent']]) {
    bindSlider(id, (v) => { state.lighting[field] = v; applyLighting(); });
  }
  bindSlider('light-haze', (v) => { state.lighting.haze = v; studio.applyHaze(); });
  bindSlider('light-deskglow', (v) => { state.lighting.deskGlow = v; studio.set.setDeskGlow(v); applyLighting(); });

  function applyLighting() {
    studio.lights.apply(state.lighting, SETS[state.setId].theme);
    studio.applyHaze();
    applyEnhance();
  }

  /* ---- look panel ---- */
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
  bindSlider('key-sim', (v) => { state.chroma.similarity = v; applyChroma(); });
  bindSlider('key-smooth', (v) => { state.chroma.smoothness = v; applyChroma(); });
  bindSlider('key-spill', (v) => { state.chroma.spill = v; applyChroma(); });
  function applyChroma() { studio.presenter.applyChroma(state.chroma); }

  bindSlider('look-bloom', (v) => { state.look.bloom = v; });
  bindSlider('look-vignette', (v) => { state.look.vignette = v; });
  bindSlider('look-floor', (v) => { state.look.floorReflection = v; studio.set.setFloorReflection(v); });
  $('btn-led-media').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('any');
    if (!media) return;
    state.look.ledMedia = { url: media.url, type: media.type, path: media.path };
    studio.set.setLedMedia(state.look.ledMedia);
    toast(media.name + ' is on the LED wall');
  });
  $('btn-led-reset').addEventListener('click', () => {
    state.look.ledMedia = null;
    studio.set.setLedMedia(null);
    toast('LED wall back to the branded loop');
  });

  /* ---- skin panel ---- */
  const skinChips = $('skin-presets');
  for (const [id, p] of Object.entries(SKIN_PRESETS)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (id === 'natural' ? ' active' : '');
    chip.textContent = p.name;
    chip.addEventListener('click', () => {
      Object.assign(state.enhance, { exposure: p.exposure, warmth: p.warmth, saturation: p.saturation, smoothing: p.smoothing, eyes: p.eyes });
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
    $('enh-eyes').value = state.enhance.eyes ?? 0;
  }
  for (const [id, field] of [['enh-exposure', 'exposure'], ['enh-warmth', 'warmth'], ['enh-sat', 'saturation'], ['enh-smooth', 'smoothing'], ['enh-eyes', 'eyes']]) {
    bindSlider(id, (v) => { state.enhance[field] = v; applyEnhance(); });
  }
  function applyEnhance() { studio.presenter.applyEnhance(state.enhance, studio.lights.grade); }

  /* ---- brand panel ---- */
  $('brand-name').addEventListener('input', (e) => { state.brand.name = e.target.value; studio.refreshBrand(); invalidateThumbs(); });
  $('brand-primary').addEventListener('input', (e) => { state.brand.primary = e.target.value; studio.refreshBrand(); invalidateThumbs(); });
  $('brand-accent').addEventListener('input', (e) => { state.brand.accent = e.target.value; studio.refreshBrand(); invalidateThumbs(); });
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

  /* ---- stream panel (inspector) ---- */
  $('out-res').addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    state.output.width = w; state.output.height = h;
    ctx.resizeOutput(w, h);
    refreshResChip();
  });
  $('out-fps').addEventListener('change', (e) => { state.output.fps = parseInt(e.target.value, 10); refreshResChip(); });
  $('out-bitrate').addEventListener('change', (e) => { state.output.bitrateK = parseInt(e.target.value, 10); });
  $('out-quality').addEventListener('change', (e) => {
    state.output.quality = e.target.value;
    studio.setQuality(e.target.value);
  });
  function refreshResChip() {
    $('stat-res').textContent = (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps;
  }

  function buildDestEditor() {
    const box = $('dest-editor');
    box.innerHTML = '';
    for (const d of state.output.destinations) {
      const div = document.createElement('div');
      div.className = 'dest-edit';
      div.innerHTML = `
        <div class="de-head"><input type="checkbox" ${d.enabled ? 'checked' : ''} data-f="enabled"><b>${d.name}</b></div>
        <input type="text" placeholder="rtmp:// server URL" value="${escAttr(d.url)}" data-f="url" ${d.kind !== 'custom' ? 'readonly' : ''} spellcheck="false">
        <input type="password" placeholder="stream key" value="${escAttr(d.key)}" data-f="key" spellcheck="false">`;
      div.querySelectorAll('[data-f]').forEach((inp) => {
        inp.addEventListener('input', () => {
          if (inp.dataset.f === 'enabled') d.enabled = inp.checked;
          else d[inp.dataset.f] = inp.value;
          buildDestRows();
        });
      });
      box.appendChild(div);
    }
  }

  /* ================= PRODUCTION STRIP ================= */

  /* ---- scenes ---- */
  $('btn-scene-add').addEventListener('click', () => {
    const scene = snapshotScene();
    state.scenes.push(scene);
    liveSceneId = scene.id;
    buildSceneList();
    toast('Scene saved: ' + scene.name);
  });

  function buildSceneList() {
    const list = $('scene-list');
    list.innerHTML = '';
    if (!state.scenes.length) {
      list.innerHTML = '<div class="scene-empty">Snapshot your current look (set + camera + graphics + mood) and recall it with one click during the show.</div>';
      return;
    }
    state.scenes.forEach((sc, i) => {
      const item = document.createElement('div');
      item.className = 'scene-item' + (sc.id === liveSceneId ? ' live' : '');
      item.innerHTML = `<span class="sc-num">${String(i + 1).padStart(2, '0')}</span>${sc.name}
        <button class="sc-x" title="Delete scene">✕</button>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('sc-x')) {
          state.scenes.splice(i, 1);
          if (liveSceneId === sc.id) liveSceneId = null;
          buildSceneList();
          return;
        }
        applyScene(sc, sceneCtx());
        liveSceneId = sc.id;
        buildSceneList();
        refreshLightInputs();
      });
      item.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('sc-x')) return;
        const name = prompt('Scene name', sc.name);
        if (name) { sc.name = name; buildSceneList(); }
      });
      list.appendChild(item);
    });
  }
  const sceneCtx = () => ({ studio, overlay, compositor, switchCam, applyLighting, refreshGfx: refreshGfxList });

  /* ---- macros ---- */
  const macroList = $('macro-list');
  for (const [id, m] of Object.entries(MACROS)) {
    const b = document.createElement('button');
    b.className = 'macro-btn';
    b.textContent = m.name;
    b.title = m.desc;
    b.addEventListener('click', () => { runMacro(id, sceneCtx()); toast(m.name); });
    macroList.appendChild(b);
  }

  /* ---- transitions ---- */
  document.querySelectorAll('.trans-btn').forEach((b) =>
    b.addEventListener('click', () => {
      state.transition.type = b.dataset.trans;
      state.camera.mode = b.dataset.trans === 'move' ? 'move' : 'cut';
      document.querySelectorAll('.trans-btn').forEach((x) => x.classList.toggle('active', x === b));
    }));
  bindSlider('trans-duration', (v) => {
    state.transition.duration = v;
    state.camera.moveDuration = v * 2;
    $('o-transdur').value = v + 's';
  });

  /* ---- audio mixer ---- */
  bindSlider('fader-mic', (v) => { state.audio.micGain = v; audio.applyGains(); });
  bindSlider('fader-jingle', (v) => { state.audio.jingleGain = v; audio.applyGains(); });
  bindSlider('fader-master', (v) => { state.audio.masterGain = v; audio.applyGains(); });
  $('mx-mute-mic').addEventListener('click', () => {
    const muted = !state.capture.muted;
    capture.setMuted(muted);
    audio.applyGains();
    $('mx-mute-mic').classList.toggle('muted', muted);
    $('mx-mute-mic').textContent = muted ? 'MUTED' : 'MIC';
  });
  $('mx-jingle-btn').addEventListener('click', async () => {
    if (audio.jinglePlaying) { audio.stopJingle(); refreshJingleBtn(); return; }
    let j = state.audio.jingles[0];
    if (!j) {
      const media = await window.chase.pickMedia('audio');
      if (!media) return;
      j = { name: media.name, path: media.path, url: media.url };
      state.audio.jingles.push(j);
      if (activeNav === 'audio') buildBrowser();
    }
    audio.playJingle(j.url);
    refreshJingleBtn();
  });
  function refreshJingleBtn() {
    const b = $('mx-jingle-btn');
    b.classList.toggle('playing', audio.jinglePlaying);
    b.textContent = audio.jinglePlaying ? 'JGL ■' : 'JGL ▸';
  }

  // meters
  const meterEls = {};
  document.querySelectorAll('.mx-ch').forEach((ch) => {
    meterEls[ch.dataset.ch] = ch.querySelector('.mx-meter');
  });
  setInterval(() => {
    for (const [id, cv] of Object.entries(meterEls)) {
      const lvl = audio.level(id);
      const g = cv.getContext('2d');
      const H = cv.height;
      g.clearRect(0, 0, cv.width, H);
      const h = Math.min(lvl * 1.4, 1) * H;
      const grad = g.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, '#2fc966');
      grad.addColorStop(0.7, '#e8e23c');
      grad.addColorStop(1, '#e23b3b');
      g.fillStyle = grad;
      g.fillRect(0, H - h, cv.width, h);
    }
    if (audio._jingleEl && audio._jingleEl.ended) refreshJingleBtn();
  }, 90);

  /* ---- destinations (bottom strip rows) ---- */
  const destStates = {}; // id -> status
  function buildDestRows() {
    const list = $('dest-list');
    list.innerHTML = '';
    for (const d of state.output.destinations) {
      if (!d.enabled && !destStates[d.id]) continue;
      const row = document.createElement('div');
      const st = destStates[d.id] || 'idle';
      row.className = 'dest-row ' + (st === 'live' ? 'live' : st === 'connecting' ? 'connecting' : '');
      row.innerHTML = `<span class="dr-led"></span><span class="dr-name">${d.name}</span>
        <span class="dr-kbps">${st === 'live' ? outputs.bitrateKbps() + ' kbps' : ''}</span>
        <span class="dr-state">${st === 'live' ? 'LIVE' : st === 'connecting' ? 'CONNECTING' : st === 'error' ? 'ERROR' : d.enabled ? 'READY' : 'OFF'}</span>`;
      list.appendChild(row);
    }
    if (!list.children.length) {
      list.innerHTML = '<div class="scene-empty">Enable destinations in the Stream tab or with GO LIVE. One encoder feeds all of them.</div>';
    }
  }
  setInterval(() => { if (outputs.streaming) buildDestRows(); }, 2000);

  /* ================= MULTI-VIEW ================= */
  let mvTimer = null;
  $('btn-multiview').addEventListener('click', () => {
    const grid = $('mv-grid');
    grid.innerHTML = '';
    const pgm = document.createElement('div');
    pgm.className = 'mv-cell pgm';
    const pgmCv = document.createElement('canvas');
    pgmCv.width = 800; pgmCv.height = 450;
    pgm.appendChild(pgmCv);
    pgm.insertAdjacentHTML('beforeend', '<span class="mv-label">PROGRAM</span>');
    grid.appendChild(pgm);
    const cells = [];
    for (const a of ANGLES) {
      const cell = document.createElement('div');
      cell.className = 'mv-cell';
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 144;
      cell.appendChild(cv);
      cell.insertAdjacentHTML('beforeend', `<span class="mv-label">CAM ${a.num} · ${a.name.toUpperCase()}</span>`);
      cell.addEventListener('click', () => switchCam(a.num));
      grid.appendChild(cell);
      cells.push({ num: a.num, cv });
    }
    $('modal-multiview').hidden = false;
    mvTimer = setInterval(() => {
      pgmCv.getContext('2d').drawImage(canvas, 0, 0, pgmCv.width, pgmCv.height);
      for (const c of cells) {
        const src = studio.thumbCanvases.get(c.num)?.canvas;
        if (src) c.cv.getContext('2d').drawImage(src, 0, 0, c.cv.width, c.cv.height);
      }
    }, 120);
  });
  $('mv-close').addEventListener('click', () => {
    $('modal-multiview').hidden = true;
    clearInterval(mvTimer);
  });

  /* ================= GRAPHICS DRAWER ================= */
  function openGfxDrawer(key) {
    const drawer = $('gfx-drawer');
    drawer.hidden = false;
    $('gfx-drawer-title').textContent = GRAPHICS[key].name;
    const body = $('gfx-drawer-body');
    const g = state.graphics[key];
    const forms = {
      lowerThird: `
        <div class="field slim"><label>Name</label><input type="text" id="gd-name" value="${escAttr(g.name)}"></div>
        <div class="field slim"><label>Title / role</label><input type="text" id="gd-title" value="${escAttr(g.title)}"></div>`,
      ticker: `
        <div class="field slim"><label>Label</label><input type="text" id="gd-label" value="${escAttr(g.label)}"></div>
        <div class="field slim"><label>Headlines (use • between items)</label><input type="text" id="gd-text" value="${escAttr(g.text)}"></div>
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
        <p class="hint">Set your logo image in the Brand tab.</p>`,
      banner: `<div class="field slim"><label>Banner text</label><input type="text" id="gd-btext" value="${escAttr(g.text)}"></div>`,
      title: `<div class="field slim"><label>Title text</label><input type="text" id="gd-ttext" value="${escAttr(g.text)}"></div>`,
      clock: `<p class="hint">Shows the studio wall-clock time on screen.</p>`
    };
    body.innerHTML = (forms[key] || '') + `
      <div class="row gap" style="margin-top:10px">
        <button class="btn primary slim" id="gd-air">${g.on ? 'Take off air' : 'Put on air'}</button>
      </div>`;
    const bind = (id, fn) => document.getElementById(id)?.addEventListener('input', (e) => fn(e.target.value));
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
      if (activeNav === 'graphics') buildBrowser();
    });
  }
  function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  $('gfx-drawer-close').addEventListener('click', () => { $('gfx-drawer').hidden = true; });

  /* ================= TOPBAR: project, record, live ================= */
  $('project-name').addEventListener('input', (e) => { state.meta.name = e.target.value; });
  $('btn-save').addEventListener('click', saveProject);
  async function saveProject(silent = false) {
    $('autosave-dot').classList.add('saving');
    const p = await window.chase.saveProject(serialize(), state.projectPath);
    $('autosave-dot').classList.remove('saving');
    if (p) { state.projectPath = p; if (!silent) toast('Project saved', 'ok'); }
  }
  // autosave every 60s once the project has a file
  setInterval(() => { if (state.projectPath) saveProject(true); }, 60000);

  $('btn-open2').addEventListener('click', async () => {
    const r = await window.chase.openProject();
    if (!r) return;
    if (r.error) return toast(r.error, 'err');
    ctx.loadProject(r.json, r.path);
  });
  $('btn-import2').addEventListener('click', async () => {
    const r = await window.chase.importTemplate();
    if (!r) return;
    if (r.error) return toast(r.error, 'err');
    ctx.loadProject(r.json, null);
  });
  $('btn-export-template').addEventListener('click', async () => {
    const p = await window.chase.exportTemplate(serializeTemplate());
    if (p) toast('Template exported — share it with any Chase Studio Pro user', 'ok');
  });

  /* ---- record ---- */
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

  /* ---- live (simulcast modal) ---- */
  $('btn-live').addEventListener('click', () => {
    if (outputs.streaming) {
      outputs.stopStreaming();
      for (const k of Object.keys(destStates)) delete destStates[k];
      $('btn-live').classList.remove('on');
      $('btn-live').textContent = 'GO LIVE';
      $('stat-bitrate').hidden = true;
      stopTimer();
      buildDestRows();
      toast('Stream stopped');
      return;
    }
    buildLiveModal();
    $('modal-live').hidden = false;
  });

  function buildLiveModal() {
    const box = $('live-dest-rows');
    box.innerHTML = '';
    for (const d of state.output.destinations) {
      const row = document.createElement('div');
      row.className = 'live-dest-row' + (d.enabled ? ' enabled' : '');
      row.innerHTML = `
        <input type="checkbox" ${d.enabled ? 'checked' : ''}>
        <b>${d.name}</b>
        ${d.kind === 'custom' ? `<input type="text" placeholder="rtmp:// server URL" value="${escAttr(d.url)}" spellcheck="false">` : ''}
        <input type="password" placeholder="stream key" value="${escAttr(d.key)}" spellcheck="false">`;
      const [chk, ...inputs] = row.querySelectorAll('input');
      chk.addEventListener('change', () => { d.enabled = chk.checked; row.classList.toggle('enabled', d.enabled); buildDestRows(); });
      if (d.kind === 'custom') {
        inputs[0].addEventListener('input', (e) => { d.url = e.target.value; });
        inputs[1].addEventListener('input', (e) => { d.key = e.target.value; });
      } else {
        inputs[0].addEventListener('input', (e) => { d.key = e.target.value; });
      }
      box.appendChild(row);
    }
  }

  $('live-cancel').addEventListener('click', () => { $('modal-live').hidden = true; });
  $('live-start').addEventListener('click', async () => {
    const dests = state.output.destinations.filter((d) => d.enabled);
    if (!dests.length) return setLiveStatus('err', 'Enable at least one destination.');
    for (const d of dests) {
      if (!d.url.startsWith('rtmp')) return setLiveStatus('err', d.name + ': enter a valid rtmp:// or rtmps:// URL.');
      if (!d.key) return setLiveStatus('err', d.name + ': enter your stream key.');
    }
    setLiveStatus('', 'Starting encoder…');
    const results = await outputs.startStreaming(dests, state.output.bitrateK);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) setLiveStatus('err', failed[0].error || 'Could not start the stream.');
  });
  function setLiveStatus(kind, msg) {
    const box = $('live-status');
    box.hidden = false;
    box.className = 'statusbox ' + kind;
    box.textContent = msg;
  }

  outputs.onStreamState = (s) => {
    destStates[s.destId] = s.status;
    buildDestRows();
    buildDestEditor();
    const destName = state.output.destinations.find((d) => d.id === s.destId)?.name || s.destId;
    if (s.status === 'connecting') setLiveStatus('', destName + ': connecting…');
    if (s.status === 'live') {
      setLiveStatus('ok', destName + ' is live.');
      setTimeout(() => { $('modal-live').hidden = true; }, 900);
      $('btn-live').classList.add('on');
      $('btn-live').textContent = 'ON AIR';
      $('stat-bitrate').hidden = false;
      startTimer(outputs.streamStartedAt || Date.now());
    }
    if (s.status === 'error') {
      setLiveStatus('err', destName + ': ' + s.message);
      toast(destName + ': ' + s.message, 'err', 6000);
    }
    if ((s.status === 'error' || s.status === 'stopped') && outputs.liveDests.size === 0) {
      $('btn-live').classList.remove('on');
      $('btn-live').textContent = 'GO LIVE';
      $('stat-bitrate').hidden = true;
      stopTimer();
    }
  };

  /* ================= HEALTH CHIPS ================= */
  setInterval(async () => {
    $('stat-fps').textContent = (studio.fps || '—') + ' fps';
    $('stat-gpu').textContent = 'GPU ' + Math.round(studio.qualityScale * 100) + '%';
    if (outputs.streaming) $('stat-bitrate').textContent = outputs.bitrateKbps() + ' kbps';
    try {
      const h = await window.chase.sysHealth();
      $('stat-cpu').textContent = 'CPU ' + h.cpuPercent + '%';
      $('stat-ram').textContent = 'RAM ' + (h.memMB > 1024 ? (h.memMB / 1024).toFixed(1) + 'G' : h.memMB + 'M');
      const sys = $('stat-sys');
      const stressed = h.cpuPercent > 88 || (studio.fps && studio.fps < 18);
      sys.className = 'statchip ' + (stressed ? 'warn' : 'ok');
      sys.textContent = stressed ? '● System under load' : '● System OK';
    } catch {}
  }, 2000);

  /* ================= KEYBOARD ================= */
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '6') switchCam(Number(e.key));
    if (e.key === 'Delete' && selectedId) { studio.removeObject(selectedId); selectObject(null); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
  });

  /* ================= REFRESH FROM STATE ================= */
  function refreshAll() {
    $('project-name').value = state.meta.name;
    refreshLightInputs();
    refreshEnhanceInputs();
    refreshBgChips();
    refreshResChip();
    $('brand-name').value = state.brand.name;
    $('brand-primary').value = state.brand.primary;
    $('brand-accent').value = state.brand.accent;
    if (state.brand.logo?.url) {
      overlay.setLogo(state.brand.logo.url);
      $('brand-logo-preview').src = state.brand.logo.url;
      $('brand-logo-preview').hidden = false;
    }
    $('cam-focal').value = 2 - (state.camera.fovScale ?? 1);
    $('cam-movedur').value = state.camera.moveDuration;
    $('cam-punch').value = state.camera.punch;
    $('cam-driftamt').value = state.camera.driftAmount ?? 1;
    $('pres-x').value = state.presenter.x;
    $('pres-scale').value = state.presenter.scale;
    $('pres-y').value = state.presenter.y;
    $('chk-drift').checked = state.camera.drift;
    $('look-bloom').value = state.look.bloom;
    $('look-vignette').value = state.look.vignette;
    $('look-floor').value = state.look.floorReflection;
    $('out-res').value = state.output.width + 'x' + state.output.height;
    $('out-fps').value = String(state.output.fps);
    $('out-bitrate').value = String(state.output.bitrateK);
    $('out-quality').value = state.output.quality;
    $('fader-mic').value = state.audio.micGain;
    $('fader-jingle').value = state.audio.jingleGain;
    $('fader-master').value = state.audio.masterGain;
    document.querySelectorAll('.trans-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.trans === state.transition.type));
    $('trans-duration').value = state.transition.duration;
    applyLighting();
    applyChroma();
    applyEnhance();
    buildBrowser();
    buildCamStrip();
    buildSceneList();
    buildDestRows();
    buildDestEditor();
    refreshLayerList();
    switchCam(state.camera.active, true);
  }

  refreshAll();
  return { refreshAll, applyLighting, applyChroma, applyEnhance, switchCam };
}
