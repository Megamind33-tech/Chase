// Chase Studio Pro — main editor wiring.
// Icon rail + asset browser, cinematic viewport, CAM strip, inspector tabs,
// bottom production strip (scenes / macros / transitions / mixer / output),
// modals, autosave, health chips, keyboard.
import { state, serialize, serializeTemplate, nextObjectId } from '../state.js';
import { SETS, SET_CATEGORIES, PRESETS, LIGHT_MOODS, SKIN_PRESETS, PROPS, GRAPHICS, MACROS } from '../templates.js';
import { ANGLES, allAngles } from '../engine/cameras.js';
import { snapshotScene, applyScene, runMacro } from '../scenes.js';
import { capture } from '../capture.js';
import { toast } from './toasts.js';
import { icon } from './icons.js';
import { ingestModel, ingestHDRI } from '../ingest.js';

const $ = (id) => document.getElementById(id);

export function initEditor(ctx) {
  const { studio, overlay, outputs, audio, compositor } = ctx;

  // ---- inject the custom icon system into the static shell ----
  const NAV_ICONS = { sets: 'sets', props: 'cube', graphics: 'graphics', lighting: 'lighting', cameras: 'camera', audio: 'audio', scripts: 'scripts', plugins: 'plugins' };
  document.querySelectorAll('.irail-btn').forEach((b) => {
    const el = b.querySelector('.irail-ico');
    if (el) el.outerHTML = icon(NAV_ICONS[b.dataset.nav] || 'cube');
  });
  const prependIcon = (id, name) => {
    const el = document.getElementById(id);
    if (el) el.insertAdjacentHTML('afterbegin', icon(name));
  };
  prependIcon('btn-save', 'save');
  prependIcon('btn-open2', 'open');
  prependIcon('btn-import2', 'importIc');
  prependIcon('btn-export-template', 'exportIc');
  prependIcon('btn-live', 'live');
  prependIcon('btn-scene-add', 'plus');
  prependIcon('btn-multiview', 'multiview');
  document.getElementById('btn-safearea').innerHTML = icon('safearea');
  document.getElementById('btn-fullscreen').innerHTML = icon('expand');
  document.querySelectorAll('.trans-btn').forEach((b) => {
    b.insertAdjacentHTML('afterbegin', icon(b.dataset.ico || 'cut'));
  });
  document.getElementById('tt-rotl').innerHTML = icon('undo');
  document.getElementById('tt-rotr').innerHTML = icon('rotate');
  document.getElementById('tt-dup').innerHTML = icon('duplicate');
  document.getElementById('tt-lock').innerHTML = icon('lock');
  document.querySelectorAll('[data-gizmo]').forEach((b) => {
    const ic = { translate: 'move', rotate: 'rotate', scale: 'expand' }[b.dataset.gizmo];
    b.insertAdjacentHTML('afterbegin', icon(ic));
  });
  document.getElementById('bb-addcam').insertAdjacentHTML('afterbegin', icon('camera'));
  document.getElementById('tt-del').innerHTML = icon('trash');
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

  const favs = new Set(JSON.parse(localStorage.getItem('chase.favSets') || '[]'));
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    localStorage.setItem('chase.favSets', JSON.stringify([...favs]));
    buildBrowser();
  }

  function buildSetsPane(body) {
    const entries = Object.entries(SETS)
      .filter(([, s]) => activeCat === 'all' || s.cat.includes(activeCat))
      .sort(([a], [b]) => (favs.has(b) ? 1 : 0) - (favs.has(a) ? 1 : 0));
    for (const [id, s] of entries) {
      const card = document.createElement('div');
      card.className = 'bset-card' + (id === state.setId ? ' active' : '');
      card.draggable = true;
      const cached = thumbCache.get(thumbKey(id)) || localStorage.getItem(thumbKey(id));
      card.innerHTML = `
        ${cached ? `<img class="bset-thumb" src="${cached}" alt="">` : `<div class="bset-thumb loading">RENDERING…</div>`}
        <span class="bset-tag">${s.cat[0]}</span>
        <span class="bset-q">HD · 3D</span>
        ${id === state.setId ? '<span class="bset-live">IN USE</span>' : ''}
        <div class="bset-actions"><button class="btn primary slim">${icon('check')} Use set</button></div>
        <div class="bset-meta">
          <div class="tcol"><span class="n">${s.name}</span><span class="d">${s.desc}</span></div>
          <button class="bset-fav${favs.has(id) ? ' on' : ''}" title="Favourite">${icon('star')}</button>
        </div>`;
      card.querySelector('.bset-fav').addEventListener('click', (e) => { e.stopPropagation(); toggleFav(id); });
      card.querySelector('.bset-actions button').addEventListener('click', (e) => { e.stopPropagation(); apply(); });
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
    const more = document.createElement('button');
    more.className = 'btn gold slim browser-foot-btn';
    more.innerHTML = icon('importIc') + ' Import set template…';
    more.addEventListener('click', async () => {
      const r = await window.chase.importTemplate();
      if (!r) return;
      if (r.error) return toast(r.error, 'err');
      ctx.loadProject(r.json, null);
    });
    body.appendChild(more);
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
    const imp = document.createElement('button');
    imp.className = 'btn gold slim browser-foot-btn';
    imp.style.marginBottom = '9px';
    imp.innerHTML = icon('cube') + ' Import 3D model (GLB)…';
    imp.addEventListener('click', async () => {
      const media = await window.chase.pickMedia('model');
      if (!media) return;
      const data = {
        id: nextObjectId(), kind: 'model', x: 2.2, z: 0.6, rotY: 0, scale: 1,
        height: 0, opacity: 1, shadow: 0.55, media: { url: media.url, path: media.path, type: 'model' }, visible: true
      };
      pushHistory();
      state.objects.push(data);
      studio.addObject('model', data.x, data.z, data);
      selectObject(data.id);
      refreshLayerList();
      logEvent('3D model imported: ' + media.name, 'ok');
      toast(media.name + ' placed in the studio — drag it into position', 'ok');
    });
    body.appendChild(imp);
    for (const [kind, p] of Object.entries(PROPS)) {
      body.appendChild(libCard(p.ico, p.name, p.desc, 'prop:' + kind, () => addProp(kind)));
    }
    if (state.assets.length) {
      const h = document.createElement('p');
      h.className = 'browser-hint';
      h.style.borderTop = '1px solid var(--line-soft)';
      h.textContent = 'INGESTED ASSETS';
      body.appendChild(h);
      for (const a of state.assets) {
        const card = libCard('cube', a.name,
          `${a.source}`, null, () => {});
        card.draggable = false;
        card.querySelector('.l-desc').innerHTML =
          `${a.source}<span class="asset-meta">${a.tris.toLocaleString()} tris · ${a.memMB} MB · .${a.ext}` +
          (a.liveSafe ? '' : ' · <span class="asset-flag">RENDER HEAVY</span>') + '</span>';
        body.appendChild(card);
      }
    }
  }

  /* ---- brand patch texture (rebrand imported surfaces) ---- */
  function brandPatchFactory(text) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    const ctx2 = cv.getContext('2d');
    const g = ctx2.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, state.brand.primary);
    g.addColorStop(1, '#070b14');
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, 1024, 512);
    ctx2.fillStyle = state.brand.accent;
    ctx2.fillRect(0, 0, 1024, 26);
    ctx2.fillRect(0, 486, 1024, 26);
    ctx2.fillStyle = 'rgba(255,255,255,0.97)';
    ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
    let size = 150;
    ctx2.font = '800 ' + size + 'px "Segoe UI", system-ui, sans-serif';
    while (ctx2.measureText(text).width > 940 && size > 40) {
      size -= 10;
      ctx2.font = '800 ' + size + 'px "Segoe UI", system-ui, sans-serif';
    }
    ctx2.fillText(text.toUpperCase(), 512, overlay.logoImg ? 290 : 256);
    if (overlay.logoImg) {
      const lw = 120 * (overlay.logoImg.width / overlay.logoImg.height);
      ctx2.drawImage(overlay.logoImg, 512 - lw / 2, 60, lw, 120);
    }
    const THREE_tex = studio.makeCanvasTexture ? studio.makeCanvasTexture(cv) : null;
    if (THREE_tex) return THREE_tex;
    // fallback: build via studio's renderer-safe path
    return cv;
  }

  studio.brandFactory = (t) => studio.canvasToTexture(brandPatchFactory(t));

  /* ---- Universal Import Manager ---- */
  function openIngestModal(report, media) {
    const box = $('ingest-report');
    const blocked = report.status === 'blocked';
    box.innerHTML = `
      <div class="ir-head">${icon('cube')}<b>${report.name}</b>
        <span class="ir-src">${report.source}</span></div>
      ${blocked ? '' : `
      <div class="ir-grid">
        <div class="ir-cell"><span>Triangles</span><b>${report.tris.toLocaleString()}</b></div>
        <div class="ir-cell"><span>Meshes</span><b>${report.meshes}</b></div>
        <div class="ir-cell"><span>Materials</span><b>${report.materials}</b></div>
        <div class="ir-cell"><span>Textures</span><b>${report.textures}${report.maxTex ? ' · ' + report.maxTex + 'px' : ''}</b></div>
        <div class="ir-cell"><span>Animations</span><b>${report.animations}${report.skinned ? ' · rigged' : ''}</b></div>
        <div class="ir-cell"><span>Est. GPU</span><b>${report.memMB} MB</b></div>
      </div>`}
      ${report.warnings.map((w) => `<div class="ir-warn${blocked ? ' blocked' : ''}">${icon('warn')}<span>${w}</span></div>`).join('')}
      ${!report.warnings.length ? `<div class="ir-ok">${icon('check')} Validation passed — normalised, Chase-safe materials, ready for the studio.</div>` : ''}
      ${!blocked && !report.liveSafe ? '' : ''}`;
    $('ingest-accept').disabled = blocked;
    $('modal-ingest').hidden = false;

    $('ingest-accept').onclick = () => {
      $('modal-ingest').hidden = true;
      pushHistory();
      const data = {
        id: nextObjectId(), kind: 'model', x: 2.2, z: 0.6, rotY: 0, scale: 1,
        height: 0, opacity: 1, shadow: 0.55,
        media: { url: media.url, path: media.path, type: 'model' }, visible: true
      };
      state.objects.push(data);
      studio.addObject('model', data.x, data.z, data, report.object);
      studio.applyAllMatOverrides(data, (t) => studio.canvasToTexture(brandPatchFactory(t)));
      state.assets.push({
        id: data.id, name: report.name, source: report.source, ext: report.ext,
        tris: report.tris, memMB: report.memMB, liveSafe: report.liveSafe,
        warnings: report.warnings.length, media: data.media
      });
      selectObject(data.id);
      refreshLayerList();
      if (activeNav === 'props') buildBrowser();
      logEvent(`Asset ingested: ${report.name} (${report.tris.toLocaleString()} tris, ${report.source})${report.liveSafe ? '' : ' — RENDER HEAVY'}`, report.liveSafe ? 'ok' : 'err');
      toast(report.name + ' is now a Chase asset — drag it into position', 'ok');
    };
    $('ingest-cancel').onclick = () => { $('modal-ingest').hidden = true; };
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
    if (!capture.stream || !capture.stream.active) {
      const es = document.createElement('div');
      es.className = 'empty-state';
      es.innerHTML = `${icon('camera')}<h5>No camera connected</h5>
        <p>The virtual angles work, but your presenter feed is offline.</p>
        <div class="row gap" style="justify-content:center">
          <button class="btn primary slim" id="es-cam-retry">${icon('camera')} Reconnect camera</button>
        </div>`;
      es.querySelector('#es-cam-retry').addEventListener('click', async (e) => {
        e.target.classList.add('loading');
        const ok = await ctx.reopenCapture();
        e.target.classList.remove('loading');
        toast(ok ? 'Camera connected' : 'Still no camera — check the cable and permissions.', ok ? 'ok' : 'err');
        buildBrowser();
      });
      body.appendChild(es);
    }
    for (const a of allAngles()) {
      const card = libCard('camera', 'CAM ' + a.num + ' · ' + a.name,
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
      const card = libCard('jingle', j.name, 'Click to play into the mix', null, () => {});
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
    div.innerHTML = `<div class="big">${icon(nav === 'scripts' ? 'scripts' : 'plugins')}</div><p>${copy}</p>`;
    body.appendChild(div);
    $('browser-hint').textContent = 'Staged rollout — nothing fake to click here.';
  }

  function libCard(ico, name, desc, dragData, onAdd) {
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.draggable = !!dragData;
    const glyph = /^[a-zA-Z]+$/.test(ico) ? icon(ico) : ico;
    card.innerHTML = `<div class="lib-ico">${glyph}</div>
      <div><span class="l-name">${name}</span><span class="l-desc">${desc}</span></div>`;
    if (dragData) card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/chase', dragData));
    if (onAdd) card.addEventListener('dblclick', onAdd);
    return card;
  }

  function addProp(kind, x, z) {
    pushHistory();
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
    if (data?.locked) return;
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

  // viewport HUD: live engine readout
  const hud = document.createElement('div');
  hud.className = 'vp-hud';
  hud.innerHTML = '<span id="hud-q"></span><span id="hud-cam"></span><span id="hud-scene"></span><span id="hud-state"></span>';
  $('viewport-wrap').appendChild(hud);
  setInterval(() => {
    const q = state.output.quality === 'auto' ? 'AUTO ' + Math.round(studio.qualityScale * 100) + '%' : state.output.quality.toUpperCase();
    document.getElementById('hud-q').textContent =
      (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps + ' · ' + q;
    document.getElementById('hud-cam').textContent =
      'RIG ' + (state.camera.drift ? 'DRIFT' : 'LOCKED') + ' · FOCAL ' + (2 - (state.camera.fovScale ?? 1)).toFixed(2) + '×';
    const sc = state.scenes.find((x) => x.id === liveSceneId);
    document.getElementById('hud-scene').textContent = 'SCENE ' + (sc ? sc.name.toUpperCase() : '— MANUAL');
    const bits = [];
    bits.push(outputs.recording ? 'REC●' : 'REC—');
    bits.push(outputs.streaming ? 'LIVE●' : 'LIVE—');
    bits.push(studio.objectsRoot.visible ? 'AR✓' : 'AR✕');
    bits.push(state.capture.muted ? 'MIC✕' : 'MIC✓');
    const el = document.getElementById('hud-state');
    el.textContent = bits.join('  ');
    el.style.color = (outputs.recording || outputs.streaming) ? '#ff9ba3' : '';
  }, 1000);

  $('btn-safearea').addEventListener('click', () => { $('safe-areas').hidden = !$('safe-areas').hidden; });
  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvas.requestFullscreen().catch(() => {});
  });

  /* ================= CAM STRIP ================= */
  const camstrip = $('camstrip');
  function buildCamStrip() {
    camstrip.innerHTML = '';
    studio.thumbCanvases.clear();
    for (const a of allAngles()) {
      const tile = document.createElement('button');
      tile.className = 'cam-tile' + (a.num === state.camera.active ? ' program' : '');
      tile.dataset.cam = a.num;
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 108;
      tile.appendChild(cv);
      const label = document.createElement('span');
      label.className = 'ct-label';
      label.innerHTML = `<span><span class="ct-key">${a.num}</span> CAM ${a.num}</span>
        <span>${a.name.toUpperCase()} <span class="ct-res">${state.output.height === 1080 ? '1080' : '720'}</span></span>`;
      tile.appendChild(label);
      tile.addEventListener('click', () => stagePreview(a.num));
      tile.addEventListener('dblclick', () => { state.preview.camera = null; switchCam(a.num); refreshBusStates(); });
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
    const a = allAngles().find((x) => x.num === num);
    $('vp-cam').textContent = `CAM ${num} · ${(a?.name || '').toUpperCase()}`;
    if (activeNav === 'cameras') buildBrowser();
    if (!selectedId) buildStudioOverview();
  }

  /* ---- UNDO / REDO (scene objects) ---- */
  const undoStack = [];
  const redoStack = [];
  function pushHistory() {
    undoStack.push(JSON.stringify(state.objects));
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0;
  }
  function restoreObjects(json) {
    state.objects = JSON.parse(json);
    studio.rebuildObjects();
    selectObject(null);
    refreshLayerList();
  }
  function doUndo() {
    if (!undoStack.length) return toast('Nothing to undo');
    redoStack.push(JSON.stringify(state.objects));
    restoreObjects(undoStack.pop());
  }
  function doRedo() {
    if (!redoStack.length) return toast('Nothing to redo');
    undoStack.push(JSON.stringify(state.objects));
    restoreObjects(redoStack.pop());
  }
  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-new').addEventListener('click', () => {
    if (confirm('Start a new project? Unsaved changes will be lost.')) location.reload();
  });

  /* ---- PROGRAM / PREVIEW bus ---- */
  function stagePreview(num) {
    state.preview.camera = num === state.camera.active ? null : num;
    state.preview.sceneId = null;
    refreshBusStates();
  }
  function refreshBusStates() {
    camstrip.querySelectorAll('.cam-tile').forEach((b) => {
      const n = Number(b.dataset.cam);
      b.classList.toggle('program', n === state.camera.active);
      b.classList.toggle('preview', n === state.preview.camera);
    });
    document.querySelectorAll('.scene-item').forEach((el) =>
      el.classList.toggle('preview', el.dataset.scn === state.preview.sceneId));
  }
  function takeProgram(mode) {
    // mode: 'take' = selected transition · 'cut' = hard
    const pv = state.preview;
    if (pv.sceneId) {
      const sc = state.scenes.find((x) => x.id === pv.sceneId);
      if (sc) {
        applyScene(sc, sceneCtx());
        liveSceneId = sc.id;
        logEvent('TAKE scene → ' + sc.name);
        buildSceneList();
        refreshLightInputs();
      }
    } else if (pv.camera) {
      const from = state.camera.active;
      if (mode === 'cut') {
        const t = state.transition.type;
        state.transition.type = 'cut';
        switchCam(pv.camera);
        state.transition.type = t;
      } else {
        switchCam(pv.camera);
      }
      logEvent('TAKE CAM ' + pv.camera);
      pv.camera = from; // flip-flop like a real switcher
      refreshBusStates();
      return;
    } else {
      toast('Nothing staged on PVW — click a camera or scene first.');
      return;
    }
    pv.sceneId = null;
    refreshBusStates();
  }
  $('btn-take').addEventListener('click', () => takeProgram('take'));

  // emergency BLACK
  $('btn-black').addEventListener('click', () => {
    compositor.blackout = !compositor.blackout;
    $('btn-black').classList.toggle('armed', compositor.blackout);
    logEvent(compositor.blackout ? 'PROGRAM TO BLACK' : 'Program restored from black', compositor.blackout ? 'err' : 'ok');
    toast(compositor.blackout ? 'PROGRAM IS BLACK — output muted to black' : 'Program restored', compositor.blackout ? 'err' : 'ok');
  });
  // instant AR kill
  $('btn-arkill').addEventListener('click', () => {
    const vis = !studio.objectsRoot.visible;
    studio.objectsRoot.visible = vis;
    const b = $('btn-arkill');
    b.classList.toggle('off', !vis);
    b.classList.toggle('on', vis);
    b.textContent = vis ? 'AR ON' : 'AR OFF';
    logEvent(vis ? 'AR objects restored' : 'AR objects hidden from program', vis ? 'ok' : 'err');
  });

  /* ---- operator log ---- */
  const opLog = [];
  function logEvent(msg, kind = '') {
    opLog.push({ t: new Date(), msg, kind });
    if (opLog.length > 200) opLog.shift();
  }
  logEvent('Session started — ' + state.meta.name, 'ok');
  $('btn-oplog').addEventListener('click', () => {
    const list = $('oplog-list');
    list.innerHTML = opLog.slice().reverse().map((e) =>
      `<div><span class="t">${e.t.toLocaleTimeString('en-GB')}</span><span class="${e.kind}">${e.msg}</span></div>`).join('')
      || '<div class="muted">No events yet.</div>';
    $('modal-oplog').hidden = false;
  });
  $('oplog-close').addEventListener('click', () => { $('modal-oplog').hidden = true; });

  /* ---- timecode + camera watchdog ---- */
  let camWasLive = true;
  setInterval(() => {
    const d = new Date();
    const ff = String(Math.floor(d.getMilliseconds() / 1000 * state.output.fps)).padStart(2, '0');
    $('stat-tc').textContent = d.toLocaleTimeString('en-GB') + ':' + ff;
  }, 120);
  setInterval(() => {
    const ok = !!(capture.stream && capture.stream.active);
    const chip = $('stat-cam');
    chip.className = 'statchip ' + (ok ? 'ok' : 'err');
    chip.textContent = ok ? 'CAM OK' : 'CAM LOST';
    if (camWasLive && !ok) {
      toast('Camera input lost — check the connection (Cameras pane → Reconnect).', 'err', 6000);
      logEvent('Camera input lost', 'err');
    }
    if (!camWasLive && ok) logEvent('Camera input restored', 'ok');
    camWasLive = ok;
  }, 2000);

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
  function buildStudioOverview() {
    const box = $('inspect-empty');
    const setDef = SETS[state.setId];
    const a = ANGLES.find((x) => x.num === state.camera.active);
    box.innerHTML = `
      <div class="obj-props" style="border-color:var(--line);background:var(--bg-2)">
        <h4>${icon('studio')} Studio overview</h4>
        <div class="ov-row"><span>Set</span><b>${setDef?.name || state.setId}</b></div>
        <div class="ov-row"><span>Camera</span><b>CAM ${state.camera.active} · ${a?.name || ''}</b></div>
        <div class="ov-row"><span>Quality</span><b>${state.output.quality === 'auto' ? 'Auto · ' + Math.round(studio.qualityScale * 100) + '%' : state.output.quality}</b></div>
        <div class="ov-row"><span>Scenes</span><b>${state.scenes.length}</b></div>
        <div class="ov-row"><span>Objects</span><b>${state.objects.length}</b></div>
      </div>
      <h3>Quick add</h3>
      <div class="quick-grid">
        <button data-qa="screen">${icon('screen')}<span>Screen</span></button>
        <button data-qa="monitor">${icon('studio')}<span>Monitor</span></button>
        <button data-qa="gfx:lowerThird">${icon('lowerthird')}<span>Lower third</span></button>
        <button data-qa="gfx:logoBug">${icon('logobug')}<span>Logo bug</span></button>
        <button data-qa="gfx:ticker">${icon('ticker')}<span>Ticker</span></button>
        <button data-qa="plinth">${icon('cube')}<span>Plinth</span></button>
      </div>
      <p class="hint">Select any object in the studio to edit its position, scale, rotation, opacity, media and lock state.</p>`;
    box.querySelectorAll('[data-qa]').forEach((b) => b.addEventListener('click', () => {
      const qa = b.dataset.qa;
      if (qa.startsWith('gfx:')) {
        const key = qa.slice(4);
        overlay.toggle(key, true);
        refreshGfxList();
        openGfxDrawer(key);
      } else {
        addProp(qa);
      }
      buildStudioOverview();
    }));
  }

  function selectObject(id) {
    selectedId = id;
    studio.setSelectionGlow(id);
    if (typeof building !== 'undefined' && building) studio.attachGizmo(id);
    refreshLayerList();
    const props = $('obj-props');
    const data = id ? state.objects.find((o) => o.id === id) : null;
    props.hidden = !data;
    $('inspect-empty').hidden = !!data;
    $('transform-bar').hidden = !data;
    if (!data) { buildStudioOverview(); return; }
    $('tt-lock').classList.toggle('locked', !!data.locked);
    $('obj-props-title').textContent = data.kind === 'model' ? (data.media?.path?.split(/[\\/]/).pop() || '3D model') : (PROPS[data.kind]?.name || data.kind);
    $('obj-scale').value = data.scale; $('o-scale').value = (+data.scale).toFixed(2);
    $('obj-rot').value = data.rotY; $('o-rot').value = data.rotY + '°';
    $('obj-height').value = data.height || 0; $('o-h').value = (+(data.height || 0)).toFixed(2);
    $('obj-opacity').value = data.opacity ?? 1; $('o-op').value = Math.round((data.opacity ?? 1) * 100) + '%';
    $('obj-shadow').value = data.shadow ?? 0.55; $('o-shadow').value = Math.round((data.shadow ?? 0.55) * 100) + '%';
    $('obj-anchor').checked = !data.height || data.height === 0;
    $('obj-media').hidden = !studio.objects.get(id)?.userData.mediaCapable;
    buildMaterialsModule(data);
  }

  function refreshLayerList() {
    const ul = $('layer-list');
    ul.innerHTML = '';
    if (!state.objects.length) {
      ul.innerHTML = `<div class="empty-state">${icon('cube')}<h5>No objects in the set</h5>
        <p>Drag screens, monitors and props in from the library, or double-click a card.</p>
        <div class="row gap" style="justify-content:center">
          <button class="btn primary slim" id="es-add-obj">${icon('plus')} Add 3D object</button>
          <button class="btn ghost slim" id="es-open-lib">Open library</button>
        </div></div>`;
      ul.querySelector('#es-add-obj').addEventListener('click', () => addProp('screen'));
      ul.querySelector('#es-open-lib').addEventListener('click', () =>
        document.querySelector('.irail-btn[data-nav="props"]').click());
    }
    for (const o of state.objects) {
      const li = document.createElement('li');
      li.className = o.id === selectedId ? 'selected' : '';
      const oname = o.kind === 'model' ? (o.media?.path?.split(/[\\/]/).pop() || '3D model') : (PROPS[o.kind]?.name || o.kind);
      li.innerHTML = `<span class="ly-ico">${icon(PROPS[o.kind]?.ico || 'cube')}</span>${oname}
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
      li.innerHTML = `<span class="ly-ico">${icon(g.ico)}</span>${g.name}
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

  function buildMaterialsModule(data) {
    const box = $('obj-materials');
    box.innerHTML = '';
    if (data.kind !== 'model') return;
    const g = studio.objects.get(data.id);
    if (g?.userData.loading) {
      box.innerHTML = '<p class="hint">Materials appear when the model finishes loading…</p>';
      g.userData.onReady = () => { if (selectedId === data.id) buildMaterialsModule(data); };
      return;
    }
    const mats = studio.getMaterials(data.id);
    if (!mats.length) return;
    const h = document.createElement('h3');
    h.className = 'spaced';
    h.textContent = 'Materials · rebrand';
    box.appendChild(h);
    data.matOverrides = data.matOverrides || {};
    mats.forEach((entry, idx) => {
      const m = entry.ref;
      const ov = data.matOverrides[idx] = data.matOverrides[idx] || {};
      const row = document.createElement('div');
      row.className = 'mat-row';
      const col = '#' + (m.color ? m.color.getHexString() : '8a93a6');
      row.innerHTML = `
        <div class="mr-head"><span class="swatch" style="background:${col}"></span>${entry.name}</div>
        <div class="row gap">
          <div class="field slim grow"><label>Colour</label><input type="color" data-f="color" value="${ov.color || col}"></div>
          <div class="field slim grow"><label>Emissive</label><input type="color" data-f="emissive" value="${ov.emissive || '#000000'}"></div>
        </div>
        <div class="field slim"><label>Roughness</label><input type="range" data-f="roughness" min="0" max="1" step="0.01" value="${ov.roughness ?? (m.roughness ?? 0.6)}"></div>
        <div class="field slim"><label>Metalness</label><input type="range" data-f="metalness" min="0" max="1" step="0.01" value="${ov.metalness ?? (m.metalness ?? 0.2)}"></div>
        <div class="row gap">
          <button class="btn ghost slim" data-act="tex">Texture…</button>
          <button class="btn gold slim" data-act="brand">Rebrand surface</button>
        </div>`;
      const commit = () => studio.applyMatOverride(data.id, idx, ov, (t) => {
        const cv = brandPatchFactory(t);
        return studio.canvasToTexture(cv);
      });
      row.querySelectorAll('[data-f]').forEach((inp) => {
        inp.addEventListener('input', () => {
          ov[inp.dataset.f] = inp.type === 'range' ? parseFloat(inp.value) : inp.value;
          if (inp.dataset.f === 'emissive') ov.eInt = 1;
          commit();
        });
      });
      row.querySelector('[data-act="tex"]').addEventListener('click', async () => {
        const media = await window.chase.pickMedia('image');
        if (!media) return;
        delete ov.brand;
        ov.textureUrl = media.url;
        ov.texturePath = media.path;
        commit();
        toast('Texture applied to ' + entry.name, 'ok');
      });
      row.querySelector('[data-act="brand"]').addEventListener('click', () => {
        const current = ov.brand?.text || state.brand.name;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = current;
        inp.className = 'sc-rename';
        inp.style.marginTop = '6px';
        row.appendChild(inp);
        inp.focus(); inp.select();
        const done = () => {
          const text = inp.value.trim() || current;
          inp.remove();
          delete ov.textureUrl;
          ov.brand = { text };
          commit();
          logEvent('Asset surface rebranded: "' + text + '"', 'ok');
          toast('Surface rebranded to "' + text + '"', 'ok');
        };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') inp.remove(); ev.stopPropagation(); });
        inp.addEventListener('blur', done);
      });
      box.appendChild(row);
    });
  }

  const bindSlider = (id, fn) => $(id).addEventListener('input', (e) => fn(parseFloat(e.target.value)));
  bindSlider('obj-scale', (v) => { updateSelected('scale', v); $('o-scale').value = v.toFixed(2); });
  bindSlider('obj-rot', (v) => { updateSelected('rotY', v); $('o-rot').value = v + '°'; });
  bindSlider('obj-height', (v) => { updateSelected('height', v); $('o-h').value = v.toFixed(2); });
  bindSlider('obj-opacity', (v) => { updateSelected('opacity', v); $('o-op').value = Math.round(v * 100) + '%'; });
  bindSlider('obj-shadow', (v) => { updateSelected('shadow', v); $('o-shadow').value = Math.round(v * 100) + '%'; });
  $('obj-anchor').addEventListener('change', (e) => {
    if (e.target.checked) { updateSelected('height', 0); $('obj-height').value = 0; $('o-h').value = '0.00'; }
  });
  function updateSelected(field, val) {
    const data = state.objects.find((o) => o.id === selectedId);
    if (!data) return;
    data[field] = val;
    studio.syncObject(data);
  }
  $('obj-delete').addEventListener('click', () => {
    if (!selectedId) return;
    pushHistory();
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

  // floating transform toolbar (viewport)
  const selData = () => state.objects.find((o) => o.id === selectedId);
  $('tt-rotl').addEventListener('click', () => { const d = selData(); if (d) { d.rotY = (d.rotY || 0) - 15; studio.syncObject(d); } });
  $('tt-rotr').addEventListener('click', () => { const d = selData(); if (d) { d.rotY = (d.rotY || 0) + 15; studio.syncObject(d); } });
  $('tt-dup').addEventListener('click', () => {
    const d = selData();
    if (!d) return;
    pushHistory();
    const copy = studio.addObject(d.kind, d.x + 0.45, d.z + 0.25);
    Object.assign(copy, { rotY: d.rotY, scale: d.scale, height: d.height, opacity: d.opacity });
    studio.syncObject(copy);
    selectObject(copy.id);
    toast('Object duplicated');
  });
  $('tt-del').addEventListener('click', () => {
    if (!selectedId) return;
    pushHistory();
    studio.removeObject(selectedId);
    selectObject(null);
  });
  $('tt-lock').addEventListener('click', () => {
    const d = selData();
    if (!d) return;
    d.locked = !d.locked;
    $('tt-lock').classList.toggle('locked', d.locked);
    toast(d.locked ? 'Object locked — position frozen' : 'Object unlocked');
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
  function applyEnhance() {
    studio.presenter.applyEnhance(state.enhance, studio.lights.grade);
    studio.presenter.setWrapColor(SETS[state.setId].theme.trim);
  }

  bindSlider('enh-erode', (v) => { state.enhance.erode = v; $('o-erode').value = Math.round(v * 100) + '%'; applyEnhance(); });
  bindSlider('enh-wrap', (v) => { state.enhance.wrap = v; $('o-wrap').value = Math.round(v * 100) + '%'; applyEnhance(); });
  $('chk-matte').addEventListener('click', () => {
    const on = $('chk-matte').classList.toggle('active');
    studio.presenter.setMatteView(on);
    toast(on ? 'Matte preview — white = keep, black = removed (also on program output)' : 'Matte preview off', '', 3500);
  });

  // Wardrobe recolor (AI Season)
  function applyCloth() { studio.presenter.applyCloth(state.cloth); }
  $('cloth-on').addEventListener('click', () => {
    state.cloth.on = $('cloth-on').classList.toggle('active');
    applyCloth();
    logEvent(state.cloth.on ? 'Wardrobe recolor ON' : 'Wardrobe recolor off');
  });
  $('cloth-key').addEventListener('input', (e) => { state.cloth.key = e.target.value; applyCloth(); });
  $('cloth-to').addEventListener('input', (e) => { state.cloth.to = e.target.value; applyCloth(); });
  bindSlider('cloth-tol', (v) => { state.cloth.tol = v; applyCloth(); });
  bindSlider('cloth-soft', (v) => { state.cloth.soft = v; applyCloth(); });
  let pickingCloth = false;
  $('cloth-pick').addEventListener('click', () => {
    pickingCloth = !pickingCloth;
    $('cloth-pick').classList.toggle('picking', pickingCloth);
    if (pickingCloth) toast('Click the garment on the program monitor to sample its colour.', '', 4200);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!pickingCloth) return;
    e.stopImmediatePropagation();
    const p = toCanvas(e);
    const d = canvas.getContext('2d').getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    state.cloth.key = hex;
    $('cloth-key').value = hex;
    state.cloth.on = true;
    $('cloth-on').classList.add('active');
    applyCloth();
    pickingCloth = false;
    $('cloth-pick').classList.remove('picking');
    toast('Garment sampled (' + hex + ') — recolor active. Tune tolerance if needed.', 'ok', 4200);
  }, true);

  // AUTO-FIT TO SET: ground, scale, relight in one action
  $('btn-autofit').addEventListener('click', () => {
    const seg = ctx.getSegmenter?.();
    const planeH = studio.presenter.planeH;
    if (state.bgMode === 'ai' && seg?.bounds) {
      const b = seg.bounds;
      const scale = Math.min(Math.max(1.75 / (Math.max(b.height, 0.2) * planeH), 0.6), 1.8);
      state.presenter.scale = +scale.toFixed(2);
      // feet (mask bottom) land exactly on the studio floor
      const feetLocalY = (planeH / 2 - 0.12) + planeH * (0.5 - b.bottom);
      state.presenter.y = +(-feetLocalY * scale + (planeH / 2 - 0.12) * 0).toFixed(2);
      state.presenter.y = +(-(feetLocalY * scale)).toFixed(2);
    } else {
      state.presenter.y = 0;
      state.presenter.scale = 1;
    }
    state.presenter.x = 0;
    state.enhance.wrap = Math.max(state.enhance.wrap, 0.3);
    const mood = LIGHT_MOODS[state.lighting.preset];
    if (mood) { state.enhance.exposure = mood.grade.exposure; state.enhance.warmth = mood.grade.warmth; }
    refreshEnhanceInputs();
    $('enh-wrap').value = state.enhance.wrap;
    $('o-wrap').value = Math.round(state.enhance.wrap * 100) + '%';
    $('pres-x').value = 0; $('pres-y').value = state.presenter.y; $('pres-scale').value = state.presenter.scale;
    applyEnhance();
    logEvent('AUTO-FIT: presenter grounded, scaled and relit to ' + SETS[state.setId].name, 'ok');
    toast('Auto-fit complete — grounded, scaled and relit to this set', 'ok');
  });

  // HDRI environment relighting
  let hdriEnv = null;
  $('btn-hdri').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('hdri');
    if (!media) return;
    $('btn-hdri').classList.add('loading');
    try {
      hdriEnv = await ingestHDRI(media, studio.renderer);
      studio.setEnvironment(hdriEnv);
      logEvent('HDRI environment loaded: ' + media.name, 'ok');
      toast('HDRI relighting active on set and 3D objects', 'ok');
    } catch (e) {
      toast('HDRI could not be loaded: ' + (e.message || 'unsupported file'), 'err', 5000);
    }
    $('btn-hdri').classList.remove('loading');
  });
  $('btn-hdri-clear').addEventListener('click', () => {
    studio.setEnvironment(null);
    hdriEnv = null;
    toast('Environment cleared — studio light rig only');
  });

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
      list.innerHTML = `<div class="empty-state">${icon('scene')}<h5>No scenes yet</h5>
        <p>Snapshot the current look — set, camera, graphics, mood — and recall it live with one click.</p></div>`;
      const b = document.createElement('button');
      b.className = 'btn primary slim';
      b.style.width = '100%';
      b.innerHTML = icon('plus') + ' Snapshot current look';
      b.addEventListener('click', () => $('btn-scene-add').click());
      list.querySelector('.empty-state').appendChild(b);
      return;
    }
    state.scenes.forEach((sc, i) => {
      const item = document.createElement('div');
      item.dataset.scn = sc.id;
      item.className = 'scene-item' + (sc.id === liveSceneId ? ' live' : '') + (sc.id === state.preview.sceneId ? ' preview' : '');
      item.title = 'Click: stage to PVW · Double-click: take to program · Right-click: rename';
      item.innerHTML = `<span class="sc-num">${String(i + 1).padStart(2, '0')}</span>${sc.name}
        <button class="sc-x" title="Delete scene">✕</button>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('sc-x')) {
          state.scenes.splice(i, 1);
          if (liveSceneId === sc.id) liveSceneId = null;
          if (state.preview.sceneId === sc.id) state.preview.sceneId = null;
          buildSceneList();
          return;
        }
        state.preview.sceneId = state.preview.sceneId === sc.id ? null : sc.id;
        state.preview.camera = null;
        refreshBusStates();
      });
      item.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('sc-x')) return;
        state.preview.sceneId = sc.id;
        takeProgram('take');
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = sc.name;
        inp.className = 'sc-rename';
        inp.addEventListener('click', (ev) => ev.stopPropagation());
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { sc.name = inp.value.trim() || sc.name; buildSceneList(); }
          if (ev.key === 'Escape') buildSceneList();
          ev.stopPropagation();
        });
        inp.addEventListener('blur', () => { sc.name = inp.value.trim() || sc.name; buildSceneList(); });
        item.replaceChildren(inp);
        inp.focus();
        inp.select();
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
    b.innerHTML = icon(m.ico || 'macro') + `<span>${m.name}</span>`;
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
    b.textContent = audio.jinglePlaying ? 'MUSIC ■' : 'MUSIC ▸';
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
      const row = document.createElement('div');
      const st = destStates[d.id] || 'idle';
      row.className = 'dest-row ' + (st === 'live' ? 'live' : st === 'connecting' ? 'connecting' : '');
      row.innerHTML = `<span class="dr-ico">${icon(d.kind === 'custom' ? 'rtmp' : 'signal')}</span><span class="dr-led"></span><span class="dr-name">${d.name.toUpperCase()}</span>
        <span class="dr-kbps">${st === 'live' ? outputs.bitrateKbps() + ' kbps · ' + (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps : ''}</span>
        <span class="dr-state">${st === 'live' ? 'LIVE' : st === 'connecting' ? 'CONNECTING' : st === 'error' ? 'ERROR' : d.enabled && d.key ? 'READY' : 'NOT CONNECTED'}</span>`;
      if (st !== 'live' && st !== 'connecting') {
        row.classList.add('setup');
        row.title = 'Click to set up this destination';
        row.addEventListener('click', () => { buildLiveModal(); $('modal-live').hidden = false; });
      }
      list.appendChild(row);
    }
    // website embed — staged, honestly labelled
    const web = document.createElement('div');
    web.className = 'dest-row staged';
    web.innerHTML = `<span class="dr-ico">${icon('globe')}</span><span class="dr-led"></span>
      <span class="dr-name">WEBSITE EMBED</span>
      <span class="dr-state">HLS RELAY · NEXT UPDATE</span>`;
    web.title = 'Website embed output ships with the HLS relay update — until then, embed your YouTube live player.';
    list.appendChild(web);
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
    for (const a of allAngles()) {
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
    buildLiveSafety();
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
        <b>${icon(d.kind === 'custom' ? 'rtmp' : 'signal')}${d.name}</b>
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

  function buildLiveSafety() {
    const items = [];
    const camOk = !!(capture.stream && capture.stream.active);
    items.push({ ok: camOk, fail: !camOk, label: camOk ? 'Camera input connected' : 'CAMERA LOST — reconnect before going live' });
    const fpsOk = !studio.fps || studio.fps >= 20;
    items.push({ ok: fpsOk, warn: !fpsOk, label: fpsOk ? 'Render performance OK (' + (studio.fps || '—') + ' fps)' : 'Low FPS (' + studio.fps + ') — lower quality or remove heavy assets' });
    items.push({ ok: !compositor.blackout, fail: compositor.blackout, label: compositor.blackout ? 'PROGRAM IS BLACK — disarm BLACK first' : 'Program output live (not black)' });
    const loading = [...studio.objects.values()].some((g) => g.userData.loading);
    items.push({ ok: !loading, warn: loading, label: loading ? '3D model still loading — wait before going live' : 'All 3D assets loaded' });
    const heavy = state.assets.filter((a) => !a.liveSafe && state.objects.some((o) => o.id === a.id));
    items.push({ ok: !heavy.length, warn: !!heavy.length, label: heavy.length ? heavy.length + ' RENDER-HEAVY asset(s) in the scene' : 'No render-heavy assets in scene' });
    items.push({ ok: !state.capture.muted, warn: state.capture.muted, label: state.capture.muted ? 'Microphone is MUTED' : 'Microphone open' });
    const box = $('live-safety');
    box.innerHTML = items.map((i) =>
      `<div class="ls-item ${i.fail ? 'fail' : i.warn ? 'warn' : 'ok'}">${icon(i.fail ? 'close' : i.warn ? 'warn' : 'check')}<span>${i.label}</span></div>`).join('');
    return items;
  }

  $('live-cancel').addEventListener('click', () => { $('modal-live').hidden = true; });
  $('live-start').addEventListener('click', async () => {
    const safety = buildLiveSafety();
    const hardFail = safety.find((i) => i.fail);
    if (hardFail) return setLiveStatus('err', 'Live safety: ' + hardFail.label);
    const warns = safety.filter((i) => i.warn);
    if (warns.length && !$('live-start').dataset.armed) {
      $('live-start').dataset.armed = '1';
      $('live-start').textContent = 'Go live anyway';
      return setLiveStatus('err', warns.length + ' warning(s) above — press again to override and go live.');
    }
    delete $('live-start').dataset.armed;
    $('live-start').textContent = 'Start streaming';
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

  // real negotiated encode chain in the Stream tab
  {
    const box = $('engine-status');
    if (box) {
      const codec = outputs.codec.mime || 'webm';
      const chain = (outputs.codec.h264 ? 'H.264 (hardware copy)' : codec.includes('vp9') ? 'VP9 → x264 transcode' : 'VP8 → x264 transcode');
      box.insertAdjacentHTML('beforeend', `<br>Video chain: ${chain}<br>Audio chain: Opus → AAC 128k · FLV mux`);
    }
  }

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

  /* ================= BUILDER MODE ================= */
  let building = false;
  let orbiting = false;
  studio.initGizmo(canvas);
  if (studio.gizmo) {
    studio.gizmo.addEventListener('dragging-changed', (e) => {
      orbiting = false;
      if (e.value) pushHistory();
      else {
        const d = selData();
        if (d) { studio.commitGizmo(d); selectObject(d.id); }
      }
    });
  }

  function setBuilderMode(on) {
    if (on && (outputs.streaming || outputs.recording)) {
      if (!confirm('You are LIVE/RECORDING — the builder design view will be visible on program. Continue?')) return;
    }
    building = on;
    studio.setBuilder(on);
    document.getElementById('editor').classList.toggle('building', on);
    $('mode-studio').classList.toggle('active', !on);
    $('mode-builder').classList.toggle('active', on);
    $('builder-bar').hidden = !on;
    if (on) {
      logEvent('Builder mode opened');
      document.querySelector('.irail-btn[data-nav="props"]').click();
      toast('BUILDER — drag to orbit, use the gizmo to place objects, + ADD CAMERA saves your view as an angle.', '', 5200);
      if (selectedId) studio.attachGizmo(selectedId);
    } else {
      studio.attachGizmo(null);
      logEvent('Builder closed — back to studio');
      switchCam(state.camera.active, true);
    }
  }
  $('mode-studio').addEventListener('click', () => setBuilderMode(false));
  $('mode-builder').addEventListener('click', () => setBuilderMode(true));

  // view toggles
  $('bb-3d').addEventListener('click', () => {
    studio.setBuilderView($('bb-camsel').value === 'orbit' ? 'orbit' : Number($('bb-camsel').value));
    $('bb-3d').classList.add('active'); $('bb-2d').classList.remove('active');
  });
  $('bb-2d').addEventListener('click', () => {
    studio.setBuilderView('2d');
    $('bb-2d').classList.add('active'); $('bb-3d').classList.remove('active');
  });
  function refreshBuilderCams() {
    const sel = $('bb-camsel');
    sel.innerHTML = '<option value="orbit">Design view</option>' +
      allAngles().map((a) => `<option value="${a.num}">CAM ${a.num} · ${a.name}</option>`).join('');
  }
  $('bb-camsel').addEventListener('change', (e) => {
    studio.setBuilderView(e.target.value === 'orbit' ? 'orbit' : Number(e.target.value));
    $('bb-3d').classList.add('active'); $('bb-2d').classList.remove('active');
  });

  // gizmo modes + snap
  document.querySelectorAll('[data-gizmo]').forEach((b) => {
    b.addEventListener('click', () => {
      studio.gizmo?.setMode(b.dataset.gizmo);
      document.querySelectorAll('[data-gizmo]').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  $('bb-snap').addEventListener('click', () => {
    const on = $('bb-snap').classList.toggle('active');
    if (studio.gizmo) {
      studio.gizmo.setTranslationSnap(on ? 0.25 : null);
      studio.gizmo.setRotationSnap(on ? Math.PI / 12 : null);
      studio.gizmo.setScaleSnap(on ? 0.1 : null);
    }
  });

  // ADD CAMERA: capture the current design view as a real angle preset
  $('bb-addcam').addEventListener('click', () => {
    const total = allAngles().length;
    if (total >= 12) return toast('Camera limit reached (12).', 'err');
    if ($('bb-camsel').value !== 'orbit' || $('bb-2d').classList.contains('active')) {
      return toast('Switch to the 3D design view first — ADD CAMERA saves that view.', 'err', 4200);
    }
    const preset = studio.captureAngle();
    const num = Math.max(...allAngles().map((a) => a.num)) + 1;
    const name = 'Custom ' + num;
    state.camera.customAngles.push({ num, name, ...preset });
    buildCamStrip();
    refreshBuilderCams();
    if (activeNav === 'cameras') buildBrowser();
    logEvent('Camera angle created: CAM ' + num + ' · ' + name, 'ok');
    toast('CAM ' + num + ' · ' + name + ' added to the switcher', 'ok');
  });

  // orbit interactions on the program canvas (builder, design view only)
  canvas.addEventListener('pointerdown', (e) => {
    if (!building) return;
    if (studio.gizmo?.axis) return; // gizmo handles its own drag
    const p = toCanvas(e);
    const id = studio.pick(p.x, p.y);
    if (id) {
      selectObject(id);
      studio.attachGizmo(id);
    } else if ($('bb-camsel').value === 'orbit' && !$('bb-2d').classList.contains('active')) {
      orbiting = true;
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!building || !orbiting) return;
    if (e.shiftKey) studio.orbitPan(e.movementX, e.movementY);
    else studio.orbitRotate(e.movementX, e.movementY);
  });
  window.addEventListener('pointerup', () => { orbiting = false; });
  canvas.addEventListener('wheel', (e) => {
    if (!building) return;
    e.preventDefault();
    studio.orbitZoom(e.deltaY);
  }, { passive: false });

  refreshBuilderCams();

  /* ================= KEYBOARD ================= */
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '6') stagePreview(Number(e.key));
    if (e.key === 'Enter') takeProgram('take');
    if (e.key.toLowerCase() === 'b') $('btn-black').click();
    if (typeof building !== 'undefined' && building) {
      if (e.key.toLowerCase() === 'g') document.querySelector('[data-gizmo="translate"]').click();
      if (e.key.toLowerCase() === 'r') document.querySelector('[data-gizmo="rotate"]').click();
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) document.querySelector('[data-gizmo="scale"]').click();
    }
    if (e.key === 'Delete' && selectedId) { pushHistory(); studio.removeObject(selectedId); selectObject(null); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
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
    applyCloth();
    $('cloth-on').classList.toggle('active', state.cloth.on);
    $('cloth-key').value = state.cloth.key;
    $('cloth-to').value = state.cloth.to;
    $('cloth-tol').value = state.cloth.tol;
    $('cloth-soft').value = state.cloth.soft;
    buildBrowser();
    buildCamStrip();
    buildSceneList();
    buildDestRows();
    buildDestEditor();
    refreshLayerList();
    switchCam(state.camera.active, true);
    refreshBusStates();
  }

  refreshAll();
  return { refreshAll, applyLighting, applyChroma, applyEnhance, switchCam };
}
