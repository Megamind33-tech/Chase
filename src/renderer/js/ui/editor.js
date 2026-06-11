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
  const NAV_ICONS = { sets: 'sets', props: 'cube', graphics: 'graphics', lighting: 'lighting', cameras: 'camera', talent: 'talent', audio: 'audio', scripts: 'scripts', plugins: 'plugins' };
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
    lighting: 'Lighting moods', cameras: 'Virtual cameras', talent: 'Talent & guest', audio: 'Audio & jingles',
    scripts: 'Rundown', plugins: 'Plugins'
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
    else if (activeNav === 'talent') buildTalentPane(body);
    else if (activeNav === 'audio') buildAudioPane(body);
    else if (activeNav === 'scripts') buildRundownPane(body);
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
      toast(report.name + ' ingested.', 'ok');
    };
    $('ingest-cancel').onclick = () => { $('modal-ingest').hidden = true; };
  }

  /* ---- Data Sources (DataBindingManager UI) ---- */
  let apiTimer = null;
  function buildDataTable() {
    const box = $('data-table');
    box.innerHTML = '';
    for (const [k, v] of Object.entries(state.data.fields)) {
      const row = document.createElement('div');
      row.className = 'data-row';
      row.innerHTML = `<input class="dk" value="${escAttr(k)}" spellcheck="false">
        <input class="dv" value="${escAttr(String(v))}" spellcheck="false">
        <button title="Remove">✕</button>`;
      const [ki, vi] = row.querySelectorAll('input');
      ki.addEventListener('change', () => {
        const nk = ki.value.trim().replace(/\W+/g, '_');
        if (nk && nk !== k) { delete state.data.fields[k]; state.data.fields[nk] = vi.value; buildDataTable(); }
      });
      vi.addEventListener('input', () => { state.data.fields[ki.value.trim()] = vi.value; });
      row.querySelector('button').addEventListener('click', () => {
        delete state.data.fields[k];
        buildDataTable();
      });
      box.appendChild(row);
    }
  }
  function dataStatus(kind, msg) {
    const el = $('data-status');
    el.hidden = false;
    el.className = 'statusbox ' + kind;
    el.textContent = msg;
  }
  $('data-add').addEventListener('click', () => {
    state.data.fields['field_' + (Object.keys(state.data.fields).length + 1)] = '';
    buildDataTable();
  });
  $('data-import').addEventListener('click', async () => {
    const f = await window.chase.dataOpenText();
    if (!f) return;
    if (f.error) return dataStatus('err', f.error);
    try {
      let added = 0;
      if (f.ext === '.json') {
        const obj = JSON.parse(f.text);
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v !== 'object') { state.data.fields[k] = String(v); added++; }
        }
      } else {
        // CSV: key,value rows — or 2-row header/value sheet
        const rows = f.text.trim().split(/\r?\n/).map((r) => r.split(',').map((c) => c.trim()));
        if (rows.length === 2 && rows[0].length > 2) {
          rows[0].forEach((h, i) => { if (h) { state.data.fields[h.replace(/\W+/g, '_')] = rows[1][i] || ''; added++; } });
        } else {
          for (const r of rows) {
            if (r.length >= 2 && r[0]) { state.data.fields[r[0].replace(/\W+/g, '_')] = r.slice(1).join(','); added++; }
          }
        }
      }
      buildDataTable();
      dataStatus('ok', added + ' field(s) loaded from ' + f.name);
      logEvent('Data import: ' + f.name + ' (' + added + ' fields)', 'ok');
    } catch (e) {
      dataStatus('err', 'Parse failed: ' + e.message);
    }
  });
  async function apiPoll() {
    try {
      const res = await fetch(state.data.api.url, { signal: AbortSignal.timeout(8000) });
      const obj = await res.json();
      let n = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== 'object') { state.data.fields[k] = String(v); n++; }
      }
      buildDataTable();
      dataStatus('ok', 'API: ' + n + ' field(s) · ' + new Date().toLocaleTimeString('en-GB'));
    } catch (e) {
      dataStatus('err', 'API poll failed: ' + e.message);
    }
  }
  $('data-api-toggle').addEventListener('click', () => {
    if (apiTimer) {
      clearInterval(apiTimer); apiTimer = null;
      state.data.api.on = false;
      $('data-api-toggle').textContent = 'Start';
      logEvent('Data API poll stopped');
      return;
    }
    const url = $('data-api-url').value.trim();
    if (!/^https:\/\//.test(url)) return dataStatus('err', 'HTTPS URL required.');
    state.data.api.url = url;
    state.data.api.intervalS = Math.max(5, parseInt($('data-api-int').value, 10) || 30);
    state.data.api.on = true;
    $('data-api-toggle').textContent = 'Stop';
    apiPoll();
    apiTimer = setInterval(apiPoll, state.data.api.intervalS * 1000);
    logEvent('Data API poll: ' + url + ' every ' + state.data.api.intervalS + 's', 'ok');
  });
  $('data-close').addEventListener('click', () => { $('modal-data').hidden = true; });

  /* ---- graphics pane ---- */
  function buildGraphicsPane(body) {
    const dataBtn = document.createElement('button');
    dataBtn.className = 'btn gold slim browser-foot-btn';
    dataBtn.style.marginBottom = '9px';
    dataBtn.innerHTML = icon('gauge') + ' Data Sources…';
    dataBtn.addEventListener('click', () => {
      buildDataTable();
      $('data-api-url').value = state.data.api.url || '';
      $('modal-data').hidden = false;
    });
    body.appendChild(dataBtn);
    for (const [key, g] of Object.entries(GRAPHICS)) {
      const card = libCard(g.ico, g.name, g.desc, 'gfx:' + key,
        () => {
          if (key === 'stinger') { overlay.fireStinger(); logEvent('Stinger fired'); return; }
          overlay.toggle(key, true); refreshGfxList(); openGfxDrawer(key);
        });
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
      const rear = document.createElement('button');
      const isRear = state.talent.rearCams.includes(a.num);
      rear.className = 'chip' + (isRear ? ' active' : '');
      rear.style.marginLeft = 'auto';
      rear.textContent = 'REAR';
      rear.title = 'Cross-shot camera: plays the active presenter profile\'s pre-captured back loop';
      rear.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = state.talent.rearCams.indexOf(a.num);
        if (i >= 0) state.talent.rearCams.splice(i, 1);
        else state.talent.rearCams.push(a.num);
        rear.classList.toggle('active', i < 0);
        applyAngleSource();
      });
      card.appendChild(rear);
      body.appendChild(card);
    }
    const staged = document.createElement('div');
    staged.className = 'staged-pane';
    staged.innerHTML = `<p><b>IP / NDI cameras and a second physical camera</b> arrive in the
      camera update. Phone cameras already work today through DroidCam/Camo-style
      virtual webcams — pick them in the camera selector.</p>`;
    body.appendChild(staged);
  }

  /* ---- talent & guest pane ---- */
  function buildTalentPane(body) {
    $('browser-hint').textContent = 'Angle packs drive REAR cams. Guest slot adds talent 2.';
    const t = state.talent;

    const h1 = document.createElement('h3');
    h1.style.cssText = 'font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--txt-dim);margin:4px 0 8px';
    h1.textContent = 'PRESENTER PROFILES';
    body.appendChild(h1);

    if (!t.profiles.length) {
      const es = document.createElement('div');
      es.className = 'empty-state';
      es.innerHTML = `${icon('talent')}<h5>No presenter profiles</h5>
        <p>Capture a familiar presenter once — back and side loops — and Chase will show
        them from behind on rear cross-shots while their live feed plays on front cameras.</p>`;
      body.appendChild(es);
    }
    t.profiles.forEach((pr) => {
      const card = document.createElement('div');
      card.className = 'profile-card' + (t.activeProfile === pr.id ? ' active' : '');
      card.innerHTML = `${icon('talent')}<span class="pc-name">${pr.name}</span>
        <span class="pc-tags">${pr.back ? '<span class="pc-tag">BACK</span>' : ''}${pr.side ? '<span class="pc-tag">SIDE</span>' : ''}</span>
        <button class="pc-x" title="Delete profile">✕</button>`;
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('pc-x')) {
          state.talent.profiles = t.profiles.filter((x) => x.id !== pr.id);
          if (t.activeProfile === pr.id) { t.activeProfile = null; applyAngleSource(); }
          buildBrowser();
          return;
        }
        t.activeProfile = t.activeProfile === pr.id ? null : pr.id;
        applyAngleSource();
        buildBrowser();
        toast(t.activeProfile ? pr.name + ' active on REAR cams.' : 'Profile off — live feed on all cams.');
      });
      body.appendChild(card);
    });
    const cap = document.createElement('button');
    cap.className = 'btn gold slim browser-foot-btn';
    cap.innerHTML = icon('camera') + ' Capture new profile…';
    cap.addEventListener('click', openCaptureWizard);
    body.appendChild(cap);

    const h2 = document.createElement('h3');
    h2.style.cssText = 'font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--txt-dim);margin:16px 0 8px';
    h2.textContent = 'GUEST SLOT (2ND PRESENTER)';
    body.appendChild(h2);
    const g = document.createElement('div');
    g.innerHTML = `
      <div class="chipset">
        <button class="chip${t.guest.on ? ' active' : ''}" id="guest-on">Enable</button>
        <button class="chip" id="guest-media">Load guest video…</button>
        <button class="chip" id="guest-feed" title="Capture a running call window (Zoom, Meet, Teams, browser) as a live framed source">Platform feed…</button>
      </div>
      <div class="field slim"><label>Position</label><input type="range" id="guest-x" min="-2.5" max="2.5" step="0.01" value="${t.guest.x}"></div>
      <div class="field slim"><label>Size</label><input type="range" id="guest-scale" min="0.5" max="1.8" step="0.01" value="${t.guest.scale}"></div>
      <p class="hint">Two sources: a keyed green-screen video file, or a live platform feed —
      a captured call window (Zoom/Meet/Teams), shown framed. Feed audio plays on the
      system as normal; mixer loopback capture is the staged next step.</p>`;
    body.appendChild(g);
    g.querySelector('#guest-on').addEventListener('click', (e) => {
      if (!t.guest.media && !studio._guestStream) { toast('Load a guest video or start a platform feed first.', 'err'); return; }
      t.guest.on = e.target.classList.toggle('active');
      logEvent(t.guest.on ? 'Guest slot ON' : 'Guest slot off');
    });
    g.querySelector('#guest-feed').addEventListener('click', openSourcePicker);
    g.querySelector('#guest-media').addEventListener('click', async () => {
      const media = await window.chase.pickMedia('video');
      if (!media) return;
      t.guest.media = { url: media.url, path: media.path };
      t.guest.on = true;
      g.querySelector('#guest-on').classList.add('active');
      logEvent('Guest video loaded: ' + media.name, 'ok');
      toast(media.name + ' keyed into guest slot.', 'ok', 3000);
    });
    g.querySelector('#guest-x').addEventListener('input', (e) => { t.guest.x = parseFloat(e.target.value); });
    g.querySelector('#guest-scale').addEventListener('input', (e) => { t.guest.scale = parseFloat(e.target.value); });
  }

  /* ---- platform feed: ingest a captured window as a live guest source ---- */
  async function openSourcePicker() {
    $('modal-sources').hidden = false;
    const grid = $('source-grid');
    grid.innerHTML = '<p class="hint">Scanning windows…</p>';
    let sources = [];
    try { sources = await window.chase.listCaptureSources(); } catch {}
    if (!sources.length) {
      grid.innerHTML = '<p class="hint">No capturable windows found. Open the call application first, then Refresh.</p>';
      return;
    }
    grid.innerHTML = '';
    for (const s of sources) {
      const card = document.createElement('button');
      card.className = 'source-card';
      card.innerHTML = `<img src="${s.thumb}" alt=""><span>${s.name.slice(0, 42)}</span>`;
      card.addEventListener('click', () => startPlatformFeed(s));
      grid.appendChild(card);
    }
  }
  async function startPlatformFeed(s) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop', chromeMediaSourceId: s.id,
            maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30
          }
        }
      });
      studio.setGuestStream(stream);
      state.talent.guest.on = true;
      $('modal-sources').hidden = true;
      logEvent('Platform feed live: ' + s.name, 'ok');
      toast('"' + s.name.slice(0, 32) + '" is live in the guest slot.', 'ok', 3500);
      if (activeNav === 'talent') buildBrowser();
    } catch (e) {
      toast('Could not capture that window: ' + e.message, 'err', 5000);
    }
  }
  $('sources-cancel').addEventListener('click', () => { $('modal-sources').hidden = true; });
  $('sources-refresh').addEventListener('click', openSourcePicker);
  $('sources-stop').addEventListener('click', () => {
    studio.setGuestStream(null);
    state.talent.guest.on = !!state.talent.guest.media;
    logEvent('Platform feed stopped');
    toast('Platform feed stopped.');
  });

  /* ---- capture wizard: records keyed loops from the live camera ---- */
  let capDraft = null;
  function openCaptureWizard() {
    if (outputs.recording) return toast('Stop the program recording first — the wizard uses the recorder.', 'err', 4500);
    if (!capture.stream?.active) return toast('No camera connected — the wizard records from the live camera.', 'err', 4500);
    capDraft = { back: null, side: null };
    $('cap-name').value = '';
    $('cap-back-state').textContent = '—';
    $('cap-back-state').className = 'cap-state';
    $('cap-side-state').textContent = '—';
    $('cap-side-state').className = 'cap-state';
    $('cap-save').disabled = true;
    $('cap-status').hidden = true;
    $('modal-capture').hidden = false;
  }

  async function recordLoop(kind) {
    const stateEl = $('cap-' + kind + '-state');
    const btn = $('cap-' + kind + '-btn');
    const path = await window.chase.recStart(($('cap-name').value.trim() || 'presenter') + '-' + kind + '.webm');
    if (!path) return;
    btn.disabled = true;
    for (let c = 3; c > 0; c--) {
      stateEl.textContent = 'IN ' + c;
      stateEl.className = 'cap-state rec';
      await new Promise((r) => setTimeout(r, 1000));
    }
    const rec = new MediaRecorder(new MediaStream(capture.stream.getVideoTracks()), {
      mimeType: outputs.codec.mime || undefined, videoBitsPerSecond: 8_000_000
    });
    rec.ondataavailable = async (e) => { if (e.data.size) window.chase.recChunk(await e.data.arrayBuffer()); };
    rec.start(500);
    for (let cs = 8; cs > 0; cs--) {
      stateEl.textContent = 'REC ' + cs + 's';
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((res) => { rec.onstop = res; rec.stop(); });
    const saved = await window.chase.recStop();
    btn.disabled = false;
    if (saved) {
      capDraft[kind] = { url: 'media://local/?p=' + encodeURIComponent(saved), path: saved };
      stateEl.textContent = 'SAVED ✓';
      stateEl.className = 'cap-state done';
      $('cap-save').disabled = !capDraft.back;
    } else {
      stateEl.textContent = 'FAILED';
      stateEl.className = 'cap-state';
    }
  }
  $('cap-back-btn').addEventListener('click', () => recordLoop('back'));
  $('cap-side-btn').addEventListener('click', () => recordLoop('side'));
  $('cap-cancel').addEventListener('click', () => { $('modal-capture').hidden = true; });
  $('cap-save').addEventListener('click', () => {
    const name = $('cap-name').value.trim();
    if (!name) {
      $('cap-status').hidden = false;
      $('cap-status').className = 'statusbox err';
      $('cap-status').textContent = 'Give the presenter a name.';
      return;
    }
    const id = 'prof' + Date.now();
    state.talent.profiles.push({ id, name, back: capDraft.back, side: capDraft.side });
    state.talent.activeProfile = id;
    $('modal-capture').hidden = true;
    applyAngleSource();
    if (activeNav === 'talent') buildBrowser();
    logEvent('Presenter profile captured: ' + name + (capDraft.side ? ' (back + side)' : ' (back)'), 'ok');
    toast(name + ' active — REAR cams use back loop.', 'ok', 3500);
  });

  /* ---- angle-aware source swap: live feed vs pre-captured back loop ---- */
  function applyAngleSource() {
    const t = state.talent;
    const prof = t.profiles.find((p) => p.id === t.activeProfile);
    const wantLoop = prof?.back && t.rearCams.includes(state.camera.active);
    if (wantLoop) {
      studio.presenter.useLoop(prof.back.url);
      $('vp-precap').hidden = false;
    } else {
      studio.presenter.useLive();
      $('vp-precap').hidden = true;
    }
  }

  /* ---- audio pane ---- */
  function buildAudioPane(body) {
    $('browser-hint').textContent = 'Jingles and beds play into the JGL mixer channel.';
    const clean = document.createElement('button');
    clean.className = 'chip' + (state.audio.cleanup ? ' active' : '');
    clean.style.marginBottom = '9px';
    clean.textContent = 'Clean Room · HPF / Comp / Gate';
    clean.addEventListener('click', () => {
      state.audio.cleanup = clean.classList.toggle('active');
      audio.setCleanup(state.audio.cleanup);
      logEvent(state.audio.cleanup ? 'Audio clean room ON' : 'Audio clean room off');
    });
    body.appendChild(clean);
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

  /* ---- rundown: ordered cue stack fired through the switcher ---- */
  function buildRundownPane(body) {
    $('browser-hint').textContent = 'GO fires a cue through the switcher · NEXT advances down the stack.';
    const rd = state.rundown;
    const bar = document.createElement('div');
    bar.className = 'row gap';
    bar.style.marginBottom = '9px';
    bar.innerHTML = `<button class="btn gold slim grow" id="rd-next">NEXT ▸</button>
      <button class="btn ghost slim" id="rd-capture">+ Capture cue</button>
      <button class="btn ghost slim" id="rd-prompter" title="Full-screen prompter view of the cue notes">PROMPTER</button>`;
    body.appendChild(bar);
    bar.querySelector('#rd-prompter').addEventListener('click', () => {
      $('prompter').hidden = false;
      refreshPrompter();
    });
    bar.querySelector('#rd-capture').addEventListener('click', () => {
      const gfx = {};
      for (const key of Object.keys(GRAPHICS)) {
        if (key !== 'stinger') gfx[key] = !!state.graphics[key].on;
      }
      rd.cues.push({
        id: 'cue' + Date.now().toString(36) + rd.cues.length,
        name: 'Cue ' + (rd.cues.length + 1),
        camera: state.camera.active,
        sceneId: liveSceneId || null,
        gfx, note: ''
      });
      logEvent('Rundown cue captured (CAM ' + state.camera.active + ')');
      buildRundownPane(clearPane(body));
    });
    bar.querySelector('#rd-next').addEventListener('click', () => {
      if (!rd.cues.length) { toast('Rundown is empty — capture a cue first.'); return; }
      goCue(Math.min(rd.live + 1, rd.cues.length - 1), body);
    });
    if (!rd.cues.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No cues yet. Set up a shot (camera, scene, graphics), then Capture cue. GO replays it through the switcher in order.';
      body.appendChild(p);
      return;
    }
    rd.cues.forEach((cue, i) => {
      const row = document.createElement('div');
      row.className = 'cue-row' + (i === rd.live ? ' live' : '');
      row.innerHTML = `
        <button class="cue-go" title="Fire this cue">GO</button>
        <div class="cue-main">
          <input class="cue-name" type="text" value="${cue.name.replace(/"/g, '&quot;')}" spellcheck="false">
          <span class="cue-meta">CAM ${cue.camera}${cue.sceneId ? ' · scene' : ''} · ${Object.values(cue.gfx).filter(Boolean).length} gfx</span>
          <input class="cue-note" type="text" placeholder="Story note…" value="${(cue.note || '').replace(/"/g, '&quot;')}" spellcheck="false">
        </div>
        <div class="cue-ops">
          <button data-op="up" title="Move up">▲</button>
          <button data-op="down" title="Move down">▼</button>
          <button data-op="del" title="Remove cue">✕</button>
        </div>`;
      row.querySelector('.cue-go').addEventListener('click', () => goCue(i, body));
      row.querySelector('.cue-name').addEventListener('input', (e) => { cue.name = e.target.value; });
      row.querySelector('.cue-note').addEventListener('input', (e) => { cue.note = e.target.value; });
      row.querySelectorAll('.cue-ops button').forEach((b) => b.addEventListener('click', () => {
        const op = b.dataset.op;
        if (op === 'del') {
          rd.cues.splice(i, 1);
          if (rd.live >= rd.cues.length) rd.live = rd.cues.length - 1;
        } else {
          const j = op === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= rd.cues.length) return;
          [rd.cues[i], rd.cues[j]] = [rd.cues[j], rd.cues[i]];
          if (rd.live === i) rd.live = j; else if (rd.live === j) rd.live = i;
        }
        buildRundownPane(clearPane(body));
      }));
      body.appendChild(row);
    });
  }

  function clearPane(body) { body.innerHTML = ''; return body; }

  function goCue(i, body) {
    const rd = state.rundown;
    const cue = rd.cues[i];
    if (!cue) return;
    const pv = state.preview;
    pv.gfx = {};
    for (const [key, on] of Object.entries(cue.gfx)) {
      if (state.graphics[key] && !!state.graphics[key].on !== on) pv.gfx[key] = on;
    }
    if (cue.sceneId && state.scenes.some((s) => s.id === cue.sceneId)) {
      pv.sceneId = cue.sceneId;
    } else {
      pv.sceneId = null;
      pv.camera = cue.camera;
    }
    takeProgram('take');
    // a cue reproduces the exact shot: if the operator had cut away from the
    // scene's snapshot camera before capture, honour the cue's camera
    if (cue.camera && state.camera.active !== cue.camera) switchCam(cue.camera, true);
    rd.live = i;
    logEvent('Rundown GO → ' + cue.name);
    if (activeNav === 'scripts' && body) buildRundownPane(clearPane(body));
    refreshPrompter();
  }

  /* ---- prompter: full-screen presenter view of the live cue note ---- */
  function refreshPrompter() {
    const el = $('prompter');
    if (el.hidden) return;
    const rd = state.rundown;
    const cue = rd.cues[rd.live];
    $('prompter-cue').textContent = cue ? cue.name.toUpperCase() : 'STANDBY';
    $('prompter-text').textContent = cue
      ? (cue.note || 'No story note on this cue.')
      : (rd.cues.length ? 'Press NEXT to fire the first cue.' : 'Rundown is empty — capture cues in the Rundown pane.');
    const next = rd.cues[rd.live + 1];
    $('prompter-upnext').textContent = next ? 'UP NEXT · ' + next.name + (next.note ? ' — ' + next.note : '') : '';
  }
  $('prompter-close').addEventListener('click', () => { $('prompter').hidden = true; });
  $('prompter-next').addEventListener('click', () => {
    const rd = state.rundown;
    if (!rd.cues.length) return;
    goCue(Math.min(rd.live + 1, rd.cues.length - 1),
      activeNav === 'scripts' ? $('browser-body') : null);
  });

  /* ---- staged panes (honest placeholders, no fake buttons) ---- */
  function buildStagedPane(body, nav) {
    const copy = 'The plugin system (custom graphics packs, data feeds, scoreboards) is a staged rollout. Scene templates already cover shareable looks today via Export.';
    const div = document.createElement('div');
    div.className = 'staged-pane';
    div.innerHTML = `<div class="big">${icon('plugins')}</div><p>${copy}</p>`;
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
      if (key === 'stinger') { overlay.fireStinger(); logEvent('Stinger fired'); }
      else { overlay.toggle(key, true); refreshGfxList(); openGfxDrawer(key); }
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
      toast('IP/NDI input: staged. Phone cams work via virtual-webcam apps.', '', 4200));
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
    applyAngleSource();
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
    // armed graphics ride the take
    const armed = Object.entries(pv.gfx || {});
    if (armed.length) {
      for (const [key, on] of armed) {
        overlay.toggle(key, on);
        scheduleAutoOut(key);
      }
      logEvent('TAKE graphics: ' + armed.map(([k, on]) => GRAPHICS[k].name + (on ? ' IN' : ' OUT')).join(', '));
      pv.gfx = {};
      refreshGfxList();
      if (!pv.sceneId && !pv.camera) { refreshBusStates(); return; }
    }
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
    const t = new Date();
    opLog.push({ t, msg, kind });
    if (opLog.length > 200) opLog.shift();
    window.chase.logAppend?.(t.toISOString() + ' [' + (kind || 'info') + '] ' + msg);
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

  const autoOutTimers = {};
  function scheduleAutoOut(key) {
    clearTimeout(autoOutTimers[key]);
    const g = state.graphics[key];
    if (g.on && g.autoOut > 0) {
      autoOutTimers[key] = setTimeout(() => {
        if (state.graphics[key].on) {
          overlay.toggle(key, false);
          refreshGfxList();
          logEvent(GRAPHICS[key].name + ' auto-out after ' + g.autoOut + 's');
        }
      }, g.autoOut * 1000);
    }
  }

  function refreshGfxList() {
    const ul = $('gfx-list');
    ul.innerHTML = '';
    for (const [key, g] of Object.entries(GRAPHICS)) {
      const on = state.graphics[key].on;
      const li = document.createElement('li');
      const armed = state.preview.gfx[key] !== undefined;
      li.innerHTML = `<span class="ly-ico">${icon(g.ico)}</span>${g.name}
        ${key === 'stinger' ? '' : `<button class="ly-arm ${armed ? 'armed' : ''}" title="ARM to PVW — applied on TAKE">PVW</button>`}
        <button class="ly-vis ${on ? 'on' : ''}" title="On air / off air">●</button>`;
      li.addEventListener('click', (e) => {
        if (key === 'stinger') {
          overlay.fireStinger();
          logEvent('Stinger fired');
          return;
        }
        if (e.target.classList.contains('ly-arm')) {
          if (state.preview.gfx[key] !== undefined) delete state.preview.gfx[key];
          else state.preview.gfx[key] = !state.graphics[key].on; // arm the opposite state
          e.target.classList.toggle('armed', state.preview.gfx[key] !== undefined);
          return;
        }
        if (e.target.classList.contains('ly-vis')) {
          overlay.toggle(key, !state.graphics[key].on);
          scheduleAutoOut(key);
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
    const arGroup = studio.objects.get(data.id);
    if (arGroup?.userData.arFields) {
      const f = arGroup.userData.arFields;
      data.arFields = data.arFields || { ...f };
      const h = document.createElement('h3');
      h.className = 'spaced';
      h.textContent = 'AR Object · Data Binding';
      box.appendChild(h);
      for (const fk of Object.keys(f)) {
        const d = document.createElement('div');
        d.className = 'field slim';
        d.innerHTML = `<label>${fk[0].toUpperCase() + fk.slice(1)}</label><input type="text" value="${(f[fk] || '').replace(/"/g, '&quot;')}" spellcheck="false">`;
        d.querySelector('input').addEventListener('input', (e) => {
          f[fk] = e.target.value;
          data.arFields[fk] = e.target.value;
        });
        box.appendChild(d);
      }
      // pin anchors + tracking behaviour
      const h2 = document.createElement('h3');
      h2.className = 'spaced';
      h2.textContent = 'AR Anchor';
      box.appendChild(h2);
      const chips = document.createElement('div');
      chips.className = 'chipset';
      for (const [label, height] of [['FLOOR', 0], ['DESK', 0.78], ['EYE LINE', 1.55]]) {
        const c = document.createElement('button');
        c.className = 'chip';
        c.textContent = label;
        c.addEventListener('click', () => {
          data.height = height;
          studio.syncObject(data);
          $('obj-height').value = height;
          $('o-h').value = height.toFixed(2);
          toast('AR anchor: ' + label.toLowerCase());
        });
        chips.appendChild(c);
      }
      box.appendChild(chips);
      const bb = document.createElement('label');
      bb.className = 'checkrow';
      bb.innerHTML = `<input type="checkbox" id="obj-billboard" ${data.billboard ? 'checked' : ''}> Billboard — face the active camera`;
      bb.querySelector('input').addEventListener('change', (e) => {
        data.billboard = e.target.checked;
        if (!e.target.checked) studio.syncObject(data);
      });
      box.appendChild(bb);
      if (data.kind === 'callout') {
        const av = document.createElement('label');
        av.className = 'checkrow';
        av.innerHTML = `<input type="checkbox" ${data.avoidPresenter ? 'checked' : ''}> Keep safe distance from presenter`;
        av.querySelector('input').addEventListener('change', (e) => {
          data.avoidPresenter = e.target.checked;
          if (!e.target.checked) studio.syncObject(data);
        });
        box.appendChild(av);
      }
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Fields accept {{tokens}} from Data Sources. Virtual cameras hold AR locked by construction — physical-camera tracking is not simulated.';
      box.appendChild(hint);
      return;
    }
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
      toast(media.name + ' → screen');
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
  $('af-shot')?.addEventListener('change', (e) => {
    state.camera.shot = e.target.value;
    logEvent('AutoFrame shot: ' + e.target.value.toUpperCase());
  });
  $('chk-autoframe').addEventListener('change', (e) => {
    state.camera.autoFrame = e.target.checked;
    if (e.target.checked && state.bgMode !== 'ai' && state.bgMode !== 'hybrid') {
      toast('AutoFrame requires Hybrid or AI Matte key.', 'err', 3500);
    }
    logEvent(e.target.checked ? 'AutoFrame ON — framing follows the presenter' : 'AutoFrame off');
  });
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
  bindSlider('look-grain', (v) => { state.look.grain = v; });
  bindSlider('look-floor', (v) => { state.look.floorReflection = v; studio.set.setFloorReflection(v); });
  $('btn-led-media').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('any');
    if (!media) return;
    state.look.ledMedia = { url: media.url, type: media.type, path: media.path };
    studio.set.setLedMedia(state.look.ledMedia);
    toast(media.name + ' → LED wall');
  });
  $('btn-led-reset').addEventListener('click', () => {
    state.look.ledMedia = null;
    studio.set.setLedMedia(null);
    toast('LED wall: branded loop');
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

  function applyRefine() {
    studio.presenter.applyRefine(state.refine);
    const seg = ctx.getSegmenter?.();
    if (seg) seg.stability = state.refine.stability;
  }
  bindSlider('ref-feather', (v) => { state.refine.feather = v; $('o-feather').value = Math.round(v * 100) + '%'; applyRefine(); });
  bindSlider('ref-gamma', (v) => { state.refine.gamma = v; $('o-gamma').value = Math.round(v * 100) + '%'; applyRefine(); });
  bindSlider('ref-hair', (v) => { state.refine.hair = v; $('o-hair').value = Math.round(v * 100) + '%'; applyRefine(); });
  bindSlider('ref-gate', (v) => { state.refine.gate = v; $('o-gate').value = Math.round(v * 100) + '%'; applyRefine(); });
  bindSlider('ref-stab', (v) => { state.refine.stability = v; $('o-stab').value = Math.round(v * 100) + '%'; applyRefine(); });
  bindSlider('ref-plate', (v) => { state.refine.plateThresh = v; $('o-plate').value = Math.round(v * 100) + '%'; applyRefine(); });

  // clean plate: capture the empty studio as a difference reference
  let plateAge = null;
  $('btn-plate').addEventListener('click', () => {
    const video = document.getElementById('cam-video');
    if (!video.videoWidth) return toast('No live camera frame to capture.', 'err');
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext('2d').drawImage(video, 0, 0);
    studio.presenter.setPlate(studio.canvasToTexture(cv));
    plateAge = Date.now();
    logEvent('Clean plate captured (' + cv.width + '×' + cv.height + ')', 'ok');
    toast('Clean plate captured.', 'ok', 2500);
  });
  $('btn-plate-clear').addEventListener('click', () => {
    studio.presenter.setPlate(null);
    plateAge = null;
    toast('Clean plate cleared.');
  });

  // key monitor: live mode / confidence / plate status (real signals)
  setInterval(() => {
    const el = $('key-monitor');
    if (!el) return;
    const seg = ctx.getSegmenter?.();
    const conf = (state.bgMode === 'ai' || state.bgMode === 'hybrid') && seg
      ? Math.round((seg.confidence || 0) * 100) + '%' : 'n/a';
    const modeLabel = { hybrid: 'HYBRID BROADCAST', chroma: 'CHROMA', ai: 'AI MATTE', framed: 'FRAMED' }[state.bgMode];
    const plate = plateAge ? 'CAPTURED ' + Math.round((Date.now() - plateAge) / 60000) + 'm ago' : 'none';
    el.innerHTML = `Key: <b>${modeLabel}</b> · Matte confidence: <b>${conf}</b> · Clean plate: <b>${plate}</b>`;
  }, 1500);

  bindSlider('enh-erode', (v) => { state.enhance.erode = v; $('o-erode').value = Math.round(v * 100) + '%'; applyEnhance(); });
  bindSlider('enh-wrap', (v) => { state.enhance.wrap = v; $('o-wrap').value = Math.round(v * 100) + '%'; applyEnhance(); });
  $('chk-matte').addEventListener('click', () => {
    const on = $('chk-matte').classList.toggle('active');
    studio.presenter.setMatteView(on);
    toast(on ? 'Matte monitor on Program: white = keep' : 'Matte monitor off', '', 3000);
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
    if (pickingCloth) toast('Click the garment on Program to sample.', '', 3500);
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
    toast('Sampled ' + hex + ' — recolor active.', 'ok', 3000);
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
    toast('Auto-fit: grounded · scaled · relit', 'ok');
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
      toast('HDRI environment active', 'ok');
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

  /* ---- typeface import: one face drives every graphic surface ---- */
  function rebuildFontSelect() {
    $('brand-font').innerHTML = '<option value="">House stack (Segoe UI)</option>' +
      (state.brand.fonts || []).map((f) =>
        `<option value="${f.name}"${state.brand.font === f.name ? ' selected' : ''}>${f.name}</option>`).join('');
  }
  async function loadBrandFonts() {
    for (const f of state.brand.fonts || []) {
      if ([...document.fonts].some((ff) => ff.family === f.name)) continue;
      try {
        const face = new FontFace(f.name, `url("${f.url}")`);
        await face.load();
        document.fonts.add(face);
      } catch {
        toast('Typeface "' + f.name + '" could not be loaded from disk.', 'err');
      }
    }
    rebuildFontSelect();
  }
  $('btn-brand-font').addEventListener('click', async () => {
    const media = await window.chase.pickMedia('font');
    if (!media) return;
    const name = media.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[_\s]+/g, ' ').trim();
    try {
      const face = new FontFace(name, `url("${media.url}")`);
      await face.load();
      document.fonts.add(face);
    } catch {
      toast('That file could not be read as a typeface.', 'err');
      return;
    }
    state.brand.fonts = state.brand.fonts || [];
    if (!state.brand.fonts.some((f) => f.name === name)) {
      state.brand.fonts.push({ name, path: media.path, url: media.url });
    }
    state.brand.font = name;
    rebuildFontSelect();
    studio.set?.markDirty?.();
    logEvent('Typeface imported: ' + name);
    toast('"' + name + '" is now the graphics typeface.');
  });
  $('brand-font').addEventListener('change', (e) => {
    state.brand.font = e.target.value;
    studio.set?.markDirty?.();
    logEvent('Graphics typeface → ' + (e.target.value || 'house stack'));
  });

  /* ---- stream panel (inspector) ---- */
  function applyFormatChrome() {
    const { width: w, height: h } = state.output;
    canvas.style.aspectRatio = w + ' / ' + h;
    document.querySelector('.vp-aspect').textContent =
      w === h ? '1:1' : (h > w ? '9:16' : '16:9');
    requestAnimationFrame(fitSafezone);
  }
  function fitSafezone() {
    // pin the safe-zone guides to the canvas, not the viewport
    const sz = $('safezone');
    const r = canvas.getBoundingClientRect();
    const wr = $('viewport-wrap').getBoundingClientRect();
    sz.style.left = (r.left - wr.left) + 'px';
    sz.style.top = (r.top - wr.top) + 'px';
    sz.style.width = r.width + 'px';
    sz.style.height = r.height + 'px';
    sz.style.inset = 'auto';
  }
  window.addEventListener('resize', fitSafezone);
  $('out-res').addEventListener('change', (e) => {
    if (outputs.recording || outputs.streaming) {
      toast('Stop recording and streaming before changing the program format.', 'err');
      e.target.value = state.output.width + 'x' + state.output.height;
      return;
    }
    const [w, h] = e.target.value.split('x').map(Number);
    state.output.width = w; state.output.height = h;
    ctx.resizeOutput(w, h);
    applyFormatChrome();
    refreshResChip();
    logEvent('Program format → ' + w + '×' + h);
  });
  $('out-fps').addEventListener('change', (e) => { state.output.fps = parseInt(e.target.value, 10); refreshResChip(); });

  /* ---- fill+key aux window: graphics layer as an external keyer pair ---- */
  let fkTimer = null;
  $('btn-fillkey').addEventListener('click', () => {
    const pop = window.open('', 'chase-fillkey', 'width=640,height=780');
    if (!pop) { toast('Aux window was blocked by the platform.', 'err'); return; }
    const oc = overlay.canvas;
    const doc = pop.document;
    doc.title = 'CHASE · GRAPHICS FILL+KEY';
    doc.body.style.cssText = 'margin:0;background:#111;display:grid;grid-template-rows:auto 1fr auto 1fr;height:100vh;font:700 11px sans-serif;color:#888';
    const label = (t) => { const d = doc.createElement('div'); d.textContent = t; d.style.cssText = 'padding:4px 8px;letter-spacing:.12em'; doc.body.appendChild(d); };
    const mk = () => {
      const c = doc.createElement('canvas');
      c.width = oc.width; c.height = oc.height;
      c.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
      doc.body.appendChild(c);
      return c;
    };
    label('FILL — graphics over black');
    const fill = mk();
    label('KEY — luma matte');
    const key = mk();
    const tmp = document.createElement('canvas');
    tmp.width = oc.width; tmp.height = oc.height;
    clearInterval(fkTimer);
    fkTimer = setInterval(() => {
      if (pop.closed) { clearInterval(fkTimer); fkTimer = null; return; }
      if (fill.width !== oc.width || fill.height !== oc.height) {
        fill.width = key.width = tmp.width = oc.width;
        fill.height = key.height = tmp.height = oc.height;
      }
      const fc = fill.getContext('2d');
      fc.fillStyle = '#000';
      fc.fillRect(0, 0, fill.width, fill.height);
      fc.drawImage(oc, 0, 0);
      const tc = tmp.getContext('2d');
      tc.clearRect(0, 0, tmp.width, tmp.height);
      tc.drawImage(oc, 0, 0);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = '#fff';
      tc.fillRect(0, 0, tmp.width, tmp.height);
      tc.globalCompositeOperation = 'source-over';
      const kc = key.getContext('2d');
      kc.fillStyle = '#000';
      kc.fillRect(0, 0, key.width, key.height);
      kc.drawImage(tmp, 0, 0);
    }, 33);
    logEvent('Fill+Key aux window opened');
  });
  $('out-bitrate').addEventListener('change', (e) => { state.output.bitrateK = parseInt(e.target.value, 10); });
  $('out-quality').addEventListener('change', (e) => {
    state.output.quality = e.target.value;
    studio.setQuality(e.target.value);
  });
  function refreshResChip() {
    const { width: w, height: h, fps } = state.output;
    const label = w === h ? '1:1 ' + h + 'p' : h > w ? '9:16 ' + w + 'p' : (h === 1080 ? '1080p' : '720p');
    $('stat-res').textContent = label + fps;
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
  // scene playlist: auto-advance the queue through the selected transition
  let playTimer = null;
  function playlistStep() {
    if (!state.scenes.length) return playlistStop();
    const idx = state.scenes.findIndex((x) => x.id === liveSceneId);
    const next = state.scenes[(idx + 1) % state.scenes.length];
    state.preview.sceneId = next.id;
    takeProgram('take');
  }
  function playlistStop() {
    clearInterval(playTimer);
    playTimer = null;
    $('btn-playlist').classList.remove('active');
    $('btn-playlist').innerHTML = icon('macro') + ' AUTO';
  }
  $('btn-playlist')?.addEventListener('click', () => {
    if (playTimer) { playlistStop(); logEvent('Scene playlist stopped'); return; }
    if (state.scenes.length < 2) return toast('Add at least 2 scenes to run the playlist.', 'err');
    const dwell = Math.max(3, parseInt($('playlist-dwell').value, 10) || 8) * 1000;
    playTimer = setInterval(playlistStep, dwell);
    $('btn-playlist').classList.add('active');
    $('btn-playlist').innerHTML = icon('close') + ' STOP';
    playlistStep();
    logEvent('Scene playlist running · ' + (dwell / 1000) + 's per scene', 'ok');
  });

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
    audio.gateTick();
  }, 90);

  /* ---- destinations (bottom strip rows) ---- */
  const destStates = {}; // id -> status
  let apiPort = 0;
  function buildDestRows() {
    const list = $('dest-list');
    list.innerHTML = '';
    for (const d of state.output.destinations) {
      const row = document.createElement('div');
      const st = destStates[d.id] || 'idle';
      row.className = 'dest-row ' + (st === 'live' ? 'live' : (st === 'connecting' || st === 'reconnecting') ? 'connecting' : '');
      row.innerHTML = `<span class="dr-ico">${icon(d.kind === 'custom' ? 'rtmp' : 'signal')}</span><span class="dr-led"></span><span class="dr-name">${d.name.toUpperCase()}</span>
        <span class="dr-kbps">${st === 'live' ? outputs.bitrateKbps() + ' kbps · ' + (state.output.height === 1080 ? '1080p' : '720p') + state.output.fps : ''}</span>
        <span class="dr-state">${st === 'live' ? 'LIVE' : st === 'connecting' ? 'CONNECTING' : st === 'reconnecting' ? 'RECONNECT' : st === 'error' ? 'ERROR' : d.enabled && d.key ? 'READY' : 'NOT CONNECTED'}</span>`;
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
    // Control API — live localhost trigger surface
    const api = document.createElement('div');
    api.className = 'dest-row';
    api.id = 'dest-api';
    api.innerHTML = `<span class="dr-ico">${icon('signal')}</span><span class="dr-led"></span>
      <span class="dr-name">CONTROL API</span>
      <span class="dr-state">${apiPort ? '127.0.0.1:' + apiPort + ' · LISTENING' : 'STARTING…'}</span>`;
    api.title = 'HTTP trigger surface for Stream Deck (Companion), newsroom scripts and data feeds. Localhost only. Endpoints: /api/gfx/<key>/in|out|toggle · /api/data/<field>?value= · /api/cue/next · /api/cut/<n> · /api/take · /api/stinger';
    list.appendChild(api);
  }
  window.chase.apiInfo?.().then((i) => {
    apiPort = i?.port || 0;
    if (apiPort) {
      logEvent('Control API listening on 127.0.0.1:' + apiPort);
      buildDestRows();
    }
  }).catch(() => {});
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
        <div class="field slim"><label>Title / role</label><input type="text" id="gd-title" value="${escAttr(g.title)}"></div>
        <div class="row gap">
          <div class="field slim grow"><label>Location</label><input type="text" id="gd-loc" value="${escAttr(g.location || '')}"></div>
          <div class="field slim grow"><label>Status chip</label><input type="text" id="gd-status" placeholder="LIVE" value="${escAttr(g.status || '')}"></div>
        </div>
        <div class="field slim"><label>Topic kicker</label><input type="text" id="gd-topic" value="${escAttr(g.topic || '')}"></div>
        <div class="field slim"><label>Material</label>
          <select id="gd-theme">
            <option value="glass"${g.theme === 'glass' ? ' selected' : ''}>Glass</option>
            <option value="carbon"${g.theme === 'carbon' ? ' selected' : ''}>Carbon</option>
            <option value="metal"${g.theme === 'metal' ? ' selected' : ''}>Metal</option>
          </select></div>
        <div class="field slim"><label>Auto out (seconds · 0 = manual)</label><input type="text" id="gd-autoout" value="${g.autoOut || 0}"></div>
        <p class="hint">All fields accept {{tokens}} · logo slot uses the Brand tab logo · edits apply on air.</p>`,
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
      scoreboard: `
        <div class="row gap">
          <div class="field slim grow"><label>Home</label><input type="text" id="gd-home" value="${escAttr(g.home)}"></div>
          <div class="field slim grow"><label>Away</label><input type="text" id="gd-away" value="${escAttr(g.away)}"></div>
        </div>
        <div class="row gap">
          <div class="field slim grow"><label>Score H</label><input type="text" id="gd-sh" value="${escAttr(g.scoreHome)}"></div>
          <div class="field slim grow"><label>Score A</label><input type="text" id="gd-sa" value="${escAttr(g.scoreAway)}"></div>
          <div class="field slim grow"><label>Period</label><input type="text" id="gd-lbl" value="${escAttr(g.label)}"></div>
        </div>
        <p class="hint">All fields accept {{tokens}} — bind to Data Sources.</p>`,
      dataCard: `
        <div class="field slim"><label>Kicker</label><input type="text" id="gd-kicker" value="${escAttr(g.kicker)}"></div>
        <div class="field slim"><label>Value</label><input type="text" id="gd-value" value="${escAttr(g.value)}"></div>
        <div class="field slim"><label>Sub line</label><input type="text" id="gd-sub" value="${escAttr(g.sub)}"></div>
        <p class="hint">All fields accept {{tokens}}.</p>`,
      countdown: `
        <div class="field slim"><label>Label</label><input type="text" id="gd-cdlabel" value="${escAttr(g.label)}"></div>
        <div class="field slim"><label>Seconds</label><input type="text" id="gd-cdsec" value="${g.seconds}"></div>
        <p class="hint">Counts to zero, flashes, then clears itself.</p>`,
      clock: `<p class="hint">Shows the studio wall-clock time on screen.</p>`,
      election: `
        <div class="row gap">
          <div class="field slim grow"><label>Title</label><input type="text" id="gd-el-title" value="${escAttr(g.title)}"></div>
          <div class="field slim"><label>Reporting</label><input type="text" id="gd-el-rep" value="${escAttr(g.reporting)}" style="width:110px"></div>
        </div>
        ${(g.rows || []).map((r, i) => `
        <div class="row gap">
          <div class="field slim grow"><label>Party ${i + 1}</label><input type="text" id="gd-el-p${i}" value="${escAttr(r.party)}"></div>
          <div class="field slim"><label>%</label><input type="text" id="gd-el-v${i}" value="${escAttr(r.pct)}" style="width:84px"></div>
          <div class="field slim"><label>Colour</label><input type="color" id="gd-el-c${i}" value="${r.color}" style="width:44px;padding:1px"></div>
        </div>`).join('')}
        <p class="hint">Leading row is highlighted automatically. All fields accept {{tokens}}.</p>`,
      weather: `
        <div class="row gap">
          <div class="field slim grow"><label>Location</label><input type="text" id="gd-w-loc" value="${escAttr(g.location)}"></div>
          <div class="field slim"><label>Temp</label><input type="text" id="gd-w-temp" value="${escAttr(g.temp)}" style="width:90px"></div>
        </div>
        <div class="row gap">
          <div class="field slim grow"><label>Conditions</label>
            <select id="gd-w-cond">
              ${['clear', 'cloud', 'rain', 'storm', 'snow'].map((c) =>
                `<option value="${c}"${g.cond === c ? ' selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
            </select></div>
          <div class="field slim"><label>High</label><input type="text" id="gd-w-hi" value="${escAttr(g.high)}" style="width:70px"></div>
          <div class="field slim"><label>Low</label><input type="text" id="gd-w-lo" value="${escAttr(g.low)}" style="width:70px"></div>
        </div>
        <p class="hint">Temp and location accept {{tokens}} — bind a weather feed via Data Sources.</p>`,
      finance: `
        <div class="field slim"><label>Strip label</label><input type="text" id="gd-f-label" value="${escAttr(g.label)}"></div>
        ${(g.items || []).map((it, i) => `
        <div class="row gap">
          <div class="field slim"><label>Symbol</label><input type="text" id="gd-f-s${i}" value="${escAttr(it.sym)}" style="width:110px"></div>
          <div class="field slim grow"><label>Price</label><input type="text" id="gd-f-p${i}" value="${escAttr(it.price)}"></div>
          <div class="field slim"><label>Δ</label><input type="text" id="gd-f-d${i}" value="${escAttr(it.delta)}" style="width:84px"></div>
        </div>`).join('')}
        <p class="hint">Delta sign drives the colour: + green, − red. All fields accept {{tokens}}.</p>`,
      music: `
        <div class="field slim"><label>Song</label><input type="text" id="gd-m-song" value="${escAttr(g.song)}"></div>
        <div class="field slim"><label>Artist</label><input type="text" id="gd-m-artist" value="${escAttr(g.artist)}"></div>
        <div class="row gap">
          <div class="field slim grow"><label>Station</label><input type="text" id="gd-m-station" value="${escAttr(g.station)}"></div>
          <div class="field slim grow"><label>Royalty ref</label><input type="text" id="gd-m-roy" value="${escAttr(g.royalty)}"></div>
        </div>
        <p class="hint">ZAMCOPS metadata ready — bind {{song_title}} {{artist_name}} {{royalty_amount}} via Data Sources.</p>`,
      fullscreen: `
        <div class="row gap">
          <div class="field slim grow"><label>Kicker</label><input type="text" id="gd-fs-kicker" value="${escAttr(g.kicker)}"></div>
          <div class="field slim grow"><label>Title</label><input type="text" id="gd-fs-title" value="${escAttr(g.title)}"></div>
        </div>
        ${(g.rows || []).map((r, i) => `
        <div class="row gap">
          <div class="field slim grow"><label>Row ${i + 1}</label><input type="text" id="gd-fs-k${i}" value="${escAttr(r.k)}"></div>
          <div class="field slim"><label>Value</label><input type="text" id="gd-fs-v${i}" value="${escAttr(r.v)}" style="width:110px"></div>
        </div>`).join('')}
        <p class="hint">Full-frame takeover — rows reveal in sequence. All fields accept {{tokens}}.</p>`,
      comment: `
        <div class="row gap">
          <div class="field slim grow"><label>Handle</label><input type="text" id="gd-c-user" value="${escAttr(g.user)}"></div>
          <div class="field slim"><label>Tag</label><input type="text" id="gd-c-tag" value="${escAttr(g.tag)}" style="width:100px"></div>
        </div>
        <div class="field slim"><label>Comment</label><input type="text" id="gd-c-text" value="${escAttr(g.text)}"></div>
        <p class="hint">Paste a viewer comment, or bind {{comment_user}} / {{comment_text}} and drive them from the Control API.</p>`,
      still: `
        <div class="field slim"><label>Image</label>
          <button class="btn ghost slim" id="gd-still-pick">${g.media ? g.media.name : 'Import image…'}</button></div>
        <div class="row gap">
          <div class="field slim grow"><label>Mode</label>
            <select id="gd-still-mode">
              <option value="full"${g.mode === 'full' ? ' selected' : ''}>Full frame</option>
              <option value="corner"${g.mode === 'corner' ? ' selected' : ''}>Corner insert</option>
            </select></div>
          <div class="field slim grow"><label>Corner</label>
            <select id="gd-still-corner">
              ${['tr', 'tl', 'br', 'bl'].map((c) => `<option value="${c}"${g.corner === c ? ' selected' : ''}>${c.toUpperCase()}</option>`).join('')}
            </select></div>
        </div>
        <div class="field slim"><label>Size</label><input type="range" id="gd-still-size" min="0.4" max="2" step="0.05" value="${g.size}"></div>
        <div class="field slim"><label>Opacity</label><input type="range" id="gd-still-op" min="0.2" max="1" step="0.05" value="${g.opacity}"></div>
        <p class="hint">PNG alpha is honoured — sponsor cards, maps, OTS inserts.</p>`,
      vtr: `
        <div class="field slim"><label>Clip</label>
          <button class="btn ghost slim" id="gd-vtr-pick">${g.media ? g.media.name : 'Import clip…'}</button></div>
        <div class="row gap">
          <div class="field slim grow"><label>Fit</label>
            <select id="gd-vtr-fit">
              <option value="contain"${g.fit === 'contain' ? ' selected' : ''}>Contain (pillarbox)</option>
              <option value="cover"${g.fit === 'cover' ? ' selected' : ''}>Cover (fill frame)</option>
            </select></div>
          <div class="field slim"><label>Loop</label>
            <select id="gd-vtr-loop">
              <option value=""${!g.loop ? ' selected' : ''}>Play once, self-clear</option>
              <option value="1"${g.loop ? ' selected' : ''}>Loop</option>
            </select></div>
        </div>
        <p class="hint">Clip audio rides the JINGLE fader in the mixer. Put on air to roll from the top.</p>`
    };
    const presets = state.gfxPresets[key] || [];
    body.innerHTML = (forms[key] || '') + `
      ${presets.length ? '<div class="chipset" style="margin-top:8px">' + presets.map((p, i) =>
        `<button class="chip gp-load" data-i="${i}" title="Load preset">${p.name}</button>`).join('') + '</div>' : ''}
      <div class="row gap" style="margin-top:10px">
        <button class="btn primary slim" id="gd-air">${g.on ? 'Take off air' : 'Put on air'}</button>
        ${key === 'clock' || key === 'stinger' ? '' : '<button class="btn ghost slim" id="gd-preset">Save preset</button>'}
      </div>`;
    body.querySelectorAll('.gp-load').forEach((b) =>
      b.addEventListener('click', () => {
        const p2 = presets[Number(b.dataset.i)];
        Object.assign(state.graphics[key], JSON.parse(JSON.stringify(p2.data)), { on: state.graphics[key].on });
        openGfxDrawer(key);
        toast('Preset "' + p2.name + '" loaded');
      }));
    document.getElementById('gd-preset')?.addEventListener('click', () => {
      const list = state.gfxPresets[key] = state.gfxPresets[key] || [];
      const { on, ...data } = state.graphics[key];
      list.push({ name: 'P' + (list.length + 1), data: JSON.parse(JSON.stringify(data)) });
      if (list.length > 8) list.shift();
      openGfxDrawer(key);
      logEvent(GRAPHICS[key].name + ' preset saved (P' + list.length + ')');
    });
    const bind = (id, fn) => document.getElementById(id)?.addEventListener('input', (e) => fn(e.target.value));
    bind('gd-name', (v) => { g.name = v; });
    bind('gd-title', (v) => { g.title = v; });
    bind('gd-loc', (v) => { g.location = v; });
    bind('gd-topic', (v) => { g.topic = v; });
    bind('gd-status', (v) => { g.status = v; });
    bind('gd-theme', (v) => { g.theme = v; });
    bind('gd-autoout', (v) => { g.autoOut = Math.max(0, parseInt(v, 10) || 0); });
    bind('gd-label', (v) => { g.label = v; });
    bind('gd-text', (v) => { g.text = v; });
    bind('gd-speed', (v) => { g.speed = parseFloat(v); });
    bind('gd-corner', (v) => { g.corner = v; });
    bind('gd-size', (v) => { g.size = parseFloat(v); });
    bind('gd-opacity', (v) => { g.opacity = parseFloat(v); });
    bind('gd-btext', (v) => { g.text = v; });
    bind('gd-ttext', (v) => { g.text = v; });
    bind('gd-home', (v) => { g.home = v; });
    bind('gd-away', (v) => { g.away = v; });
    bind('gd-sh', (v) => { g.scoreHome = v; });
    bind('gd-sa', (v) => { g.scoreAway = v; });
    bind('gd-lbl', (v) => { g.label = v; });
    bind('gd-el-title', (v) => { g.title = v; });
    bind('gd-el-rep', (v) => { g.reporting = v; });
    (key === 'election' ? g.rows : []).forEach((r, i) => {
      bind('gd-el-p' + i, (v) => { r.party = v; });
      bind('gd-el-v' + i, (v) => { r.pct = v; });
      bind('gd-el-c' + i, (v) => { r.color = v; });
    });
    bind('gd-w-loc', (v) => { g.location = v; });
    bind('gd-w-temp', (v) => { g.temp = v; });
    bind('gd-w-cond', (v) => { g.cond = v; });
    bind('gd-w-hi', (v) => { g.high = v; });
    bind('gd-w-lo', (v) => { g.low = v; });
    bind('gd-f-label', (v) => { g.label = v; });
    (key === 'finance' ? g.items : []).forEach((it, i) => {
      bind('gd-f-s' + i, (v) => { it.sym = v; });
      bind('gd-f-p' + i, (v) => { it.price = v; });
      bind('gd-f-d' + i, (v) => { it.delta = v; });
    });
    bind('gd-m-song', (v) => { g.song = v; });
    bind('gd-m-artist', (v) => { g.artist = v; });
    bind('gd-m-station', (v) => { g.station = v; });
    bind('gd-m-roy', (v) => { g.royalty = v; });
    bind('gd-fs-kicker', (v) => { g.kicker = v; });
    bind('gd-fs-title', (v) => { g.title = v; });
    (key === 'fullscreen' ? g.rows : []).forEach((r, i) => {
      bind('gd-fs-k' + i, (v) => { r.k = v; });
      bind('gd-fs-v' + i, (v) => { r.v = v; });
    });
    bind('gd-c-user', (v) => { g.user = v; });
    bind('gd-c-text', (v) => { g.text = v; });
    bind('gd-c-tag', (v) => { g.tag = v; });
    bind('gd-still-mode', (v) => { g.mode = v; });
    bind('gd-still-corner', (v) => { g.corner = v; });
    bind('gd-still-size', (v) => { g.size = parseFloat(v); });
    bind('gd-still-op', (v) => { g.opacity = parseFloat(v); });
    bind('gd-vtr-fit', (v) => { g.fit = v; });
    bind('gd-vtr-loop', (v) => { g.loop = !!v; });
    document.getElementById('gd-still-pick')?.addEventListener('click', async () => {
      const media = await window.chase.pickMedia('image');
      if (!media) return;
      g.media = { url: media.url, path: media.path, name: media.name };
      overlay.setStill(media.url);
      logEvent('Still imported: ' + media.name);
      openGfxDrawer(key);
    });
    document.getElementById('gd-vtr-pick')?.addEventListener('click', async () => {
      const media = await window.chase.pickMedia('video');
      if (!media) return;
      g.media = { url: media.url, path: media.path, name: media.name };
      overlay.setVtr(media.url);
      logEvent('Clip loaded: ' + media.name);
      openGfxDrawer(key);
    });
    bind('gd-kicker', (v) => { g.kicker = v; });
    bind('gd-value', (v) => { g.value = v; });
    bind('gd-sub', (v) => { g.sub = v; });
    bind('gd-cdlabel', (v) => { g.label = v; });
    bind('gd-cdsec', (v) => { g.seconds = Math.max(5, parseInt(v, 10) || 60); });
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
        if (outputs.lowDisk) {
          toast('LOW DISK: ' + outputs.freeGB + ' GB free — recording anyway, watch space.', 'err', 6000);
          logEvent('Recording started with LOW DISK (' + outputs.freeGB + ' GB free)', 'err');
        } else {
          toast('Recording — crash-safe segments' + (outputs.freeGB ? ' · ' + outputs.freeGB + ' GB free' : ''), 'ok');
          logEvent('Recording started' + (outputs.freeGB ? ' · ' + outputs.freeGB + ' GB free' : ''), 'ok');
        }
      }
    } else {
      const r = await outputs.stopRecording();
      $('btn-record').classList.remove('on');
      stopTimer();
      if (r?.path) {
        $('recdone-path').textContent = r.parts.length > 1
          ? r.parts.length + ' crash-safe segments · ' + r.path
          : r.path;
        $('modal-recdone').hidden = false;
        $('modal-recdone').dataset.path = r.path;
        $('modal-recdone').dataset.parts = JSON.stringify(r.parts);
        $('modal-recdone').dataset.h264 = r.h264 ? '1' : '';
        logEvent('Recording stopped — ' + r.parts.length + ' segment(s)', 'ok');
      }
    }
  });
  $('recdone-close').addEventListener('click', () => { $('modal-recdone').hidden = true; });
  $('recdone-reveal').addEventListener('click', () => window.chase.recReveal($('modal-recdone').dataset.path));
  $('recdone-mp4').addEventListener('click', async () => {
    const m = $('modal-recdone');
    $('recdone-mp4').textContent = 'Converting…';
    const r = await window.chase.recFinalizeMp4(JSON.parse(m.dataset.parts || '[]'), m.dataset.path, !!m.dataset.h264);
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
    if (s.status === 'reconnecting') { setLiveStatus('', destName + ': ' + s.message); logEvent(destName + ' ' + s.message, 'err'); }
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

  // WebGL context loss: warn loudly, recover when the driver returns
  studio.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    $('stat-sys').className = 'statchip err';
    $('stat-sys').textContent = '● RENDERER LOST';
    logEvent('WebGL context lost — renderer halted', 'err');
    toast('RENDERER LOST — GPU reset. Recovery in progress…', 'err', 8000);
  });
  studio.canvas.addEventListener('webglcontextrestored', () => {
    logEvent('WebGL context restored', 'ok');
    toast('Renderer recovered.', 'ok');
    studio.loadSet(state.setId);
    studio.rebuildObjects();
  });

  /* ================= HEALTH CHIPS ================= */
  // input latency + dropped frames from requestVideoFrameCallback metadata
  let inputLatency = null, droppedFrames = 0, lastPresented = null;
  (function vfcLoop() {
    const v = document.getElementById('cam-video');
    if (v && v.requestVideoFrameCallback) {
      v.requestVideoFrameCallback((now, meta) => {
        if (meta.captureTime) inputLatency = Math.max(0, Math.round(now - meta.captureTime));
        else if (meta.expectedDisplayTime) inputLatency = Math.max(0, Math.round(meta.expectedDisplayTime - now));
        if (lastPresented !== null && meta.presentedFrames - lastPresented > 1) {
          droppedFrames += meta.presentedFrames - lastPresented - 1;
        }
        lastPresented = meta.presentedFrames;
        vfcLoop();
      });
    } else {
      setTimeout(vfcLoop, 2000);
    }
  })();

  setInterval(async () => {
    $('stat-fps').textContent = (studio.fps || '—') + ' fps';
    const tierNames = { cpu: 'CPU SAFE', low: 'LOW', balanced: 'BALANCED', high: 'HIGH', ultra: 'ULTRA' };
    $('stat-gpu').textContent = (studio.softwareRender ? 'CPU RENDER · ' : 'GPU · ') + (tierNames[studio.tier] || 'HIGH');
    $('stat-gpu').title = (studio.gpuName || 'renderer') + ' · render tier ' + (studio.tier || 'high')
      + ' · ' + Math.round(studio.qualityScale * 100) + '% scale';
    $('stat-gpu').classList.toggle('warn', studio.tier === 'cpu');
    if (outputs.streaming) $('stat-bitrate').textContent = outputs.bitrateKbps() + ' kbps';
    const lat = $('stat-latency');
    if (lat) lat.textContent = 'IN ' + (inputLatency === null ? '—' : inputLatency + 'ms') + (droppedFrames ? ' · DROP ' + droppedFrames : '');
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
      toast('BUILDER · Drag: orbit · Gizmo: place · ADD CAMERA: save view as angle', '', 4200);
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

  /* ---- safe-zone guides (operator monitor only, never in program) ---- */
  $('vp-safe').addEventListener('click', () => {
    const sz = $('safezone');
    sz.hidden = !sz.hidden;
    $('vp-safe').classList.toggle('on', !sz.hidden);
    if (!sz.hidden) fitSafezone();
  });

  /* ================= KEYBOARD ================= */
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      // graphics playout hotkeys: Shift+1..9 cuts the Nth graphic in/out
      const key = Object.keys(GRAPHICS)[Number(e.code.slice(5)) - 1];
      if (key === 'stinger') {
        overlay.fireStinger();
        logEvent('Stinger fired (hotkey)');
      } else if (key) {
        overlay.toggle(key, !state.graphics[key].on);
        scheduleAutoOut(key);
        refreshGfxList();
        logEvent(GRAPHICS[key].name + (state.graphics[key].on ? ' IN' : ' OUT') + ' (hotkey)');
      }
      return;
    }
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

  /* ---- Control API: commands arriving over the localhost trigger surface ---- */
  window.chase.onRemote?.((msg) => {
    if (msg.cmd === 'gfx' && GRAPHICS[msg.key]) {
      if (msg.key === 'stinger') { overlay.fireStinger(); }
      else {
        const on = msg.action === 'toggle' ? !state.graphics[msg.key].on : msg.action === 'in';
        overlay.toggle(msg.key, on);
        scheduleAutoOut(msg.key);
        refreshGfxList();
      }
      logEvent('Control API: ' + msg.key + ' ' + msg.action);
    } else if (msg.cmd === 'data' && msg.field) {
      state.data.fields[msg.field] = msg.value;
      logEvent('Control API: data ' + msg.field + ' = ' + msg.value);
    } else if (msg.cmd === 'cueNext') {
      const rd = state.rundown;
      if (rd.cues.length) goCue(Math.min(rd.live + 1, rd.cues.length - 1),
        activeNav === 'scripts' ? $('browser-body') : null);
      logEvent('Control API: cue next');
    } else if (msg.cmd === 'cut' && allAngles().some((a) => a.num === msg.camera)) {
      const t = state.transition.type;
      state.transition.type = 'cut';
      switchCam(msg.camera);
      state.transition.type = t;
      logEvent('Control API: cut CAM ' + msg.camera);
    } else if (msg.cmd === 'take') {
      takeProgram('take');
      logEvent('Control API: take');
    } else if (msg.cmd === 'stinger') {
      overlay.fireStinger();
      logEvent('Control API: stinger');
    }
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
    loadBrandFonts();
    if (state.graphics.still?.media) overlay.setStill(state.graphics.still.media.url);
    if (state.graphics.vtr?.media) overlay.setVtr(state.graphics.vtr.media.url);
    audio.attachClip(overlay.vtrEl);
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
    $('look-grain').value = state.look.grain ?? 0.05;
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
    applyRefine();
    $('ref-feather').value = state.refine.feather;
    $('ref-gamma').value = state.refine.gamma;
    $('ref-hair').value = state.refine.hair;
    $('ref-gate').value = state.refine.gate;
    $('ref-stab').value = state.refine.stability;
    $('ref-plate').value = state.refine.plateThresh;
    $('chk-autoframe').checked = !!state.camera.autoFrame;
    audio.setCleanup(!!state.audio.cleanup);
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
