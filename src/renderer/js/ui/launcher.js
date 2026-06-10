// Project launcher + first-run wizard: template → camera → background.
import { SETS, PRESETS } from '../templates.js';
import { capture } from '../capture.js';
import { toast } from './toasts.js';

const $ = (id) => document.getElementById(id);

export function initLauncher({ onEnter, onOpenProject }) {
  const wiz = { name: 'My Studio', setId: 'apex', preset: 'news', bgMode: 'chroma' };
  let previewStream = null;

  function show(step) {
    document.querySelectorAll('.wizard-step').forEach((s) => s.removeAttribute('data-active'));
    $('wiz-' + step).setAttribute('data-active', 'true');
    if (step === 'camera') populateDevices();
    else stopPreview();
  }

  // ---- home ----
  $('btn-new-project').addEventListener('click', () => show('template'));
  $('btn-open-project').addEventListener('click', async () => {
    const r = await window.chase.openProject();
    if (!r) return;
    if (r.error) return toast(r.error, 'err');
    onOpenProject(r.json, r.path);
  });
  $('btn-import-template').addEventListener('click', async () => {
    const r = await window.chase.importTemplate();
    if (!r) return;
    if (r.error) return toast(r.error, 'err');
    onOpenProject(r.json, null);
  });

  async function loadRecents() {
    const list = await window.chase.recentProjects();
    const ul = $('recent-list');
    if (!list.length) return;
    ul.innerHTML = '';
    for (const item of list) {
      const li = document.createElement('li');
      li.textContent = item.name;
      li.title = item.path;
      li.addEventListener('click', async () => {
        const r = await window.chase.openProjectPath(item.path);
        if (r?.error) return toast(r.error, 'err');
        if (r) onOpenProject(r.json, r.path);
      });
      ul.appendChild(li);
    }
  }
  loadRecents();

  // ---- step 1: template ----
  const setGrid = $('set-grid');
  for (const [id, s] of Object.entries(SETS)) {
    const t = s.theme;
    const grad = `linear-gradient(135deg, ${t.sky} 0%, ${t.ledA} 55%, ${t.ledB} 100%)`;
    const card = document.createElement('button');
    card.className = 'set-card' + (id === wiz.setId ? ' active' : '');
    card.innerHTML = `<div class="set-thumb" style="background:${grad}"></div>
      <span class="set-name">${s.name}</span><span class="set-desc">${s.desc}</span>`;
    card.addEventListener('click', () => {
      wiz.setId = id;
      setGrid.querySelectorAll('.set-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
    setGrid.appendChild(card);
  }
  const presetGrid = $('preset-grid');
  for (const [id, p] of Object.entries(PRESETS)) {
    const card = document.createElement('button');
    card.className = 'preset-card' + (id === wiz.preset ? ' active' : '');
    card.innerHTML = `<span class="p-name">${p.name}</span><span class="p-desc">${p.desc}</span>`;
    card.addEventListener('click', () => {
      wiz.preset = id;
      presetGrid.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
    presetGrid.appendChild(card);
  }

  // wizard nav buttons
  document.querySelectorAll('[data-wiz]').forEach((b) =>
    b.addEventListener('click', () => show(b.dataset.wiz)));

  // ---- step 2: camera ----
  async function populateDevices() {
    try {
      const { cameras, mics } = await capture.listDevices();
      fillSelect($('sel-camera'), cameras, 'Camera');
      fillSelect($('sel-mic'), mics, 'Microphone');
      if (cameras.length) startPreview();
      else $('wiz-cam-hint').textContent = 'No camera detected — connect one and reopen this step.';
    } catch (e) {
      $('wiz-cam-hint').textContent = 'Camera permission denied or unavailable.';
    }
  }
  function fillSelect(sel, devices, label) {
    sel.innerHTML = '';
    devices.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `${label} ${i + 1}`;
      sel.appendChild(o);
    });
  }
  async function startPreview() {
    stopPreview();
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: $('sel-camera').value ? { exact: $('sel-camera').value } : undefined }
      });
      const v = $('wiz-cam-preview');
      v.srcObject = previewStream;
      $('wiz-cam-hint').style.display = 'none';
    } catch {
      $('wiz-cam-hint').style.display = '';
      $('wiz-cam-hint').textContent = 'Could not open this camera.';
    }
  }
  function stopPreview() {
    if (previewStream) { previewStream.getTracks().forEach((t) => t.stop()); previewStream = null; }
  }
  $('sel-camera').addEventListener('change', startPreview);

  // ---- step 3: background ----
  document.querySelectorAll('.bg-card').forEach((c) => {
    if (c.dataset.bgmode === wiz.bgMode) c.classList.add('active');
    c.addEventListener('click', () => {
      document.querySelectorAll('.bg-card').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      wiz.bgMode = c.dataset.bgmode;
    });
  });

  $('btn-enter-studio').addEventListener('click', () => {
    wiz.name = $('inp-project-name').value.trim() || 'My Studio';
    wiz.cameraId = $('sel-camera').value || null;
    wiz.micId = $('sel-mic').value || null;
    const [w, h] = $('sel-capresolution').value.split('x').map(Number);
    wiz.width = w; wiz.height = h;
    stopPreview();
    onEnter(wiz);
  });

  return {
    hide() { $('launcher').style.display = 'none'; },
    show() { $('launcher').style.display = ''; show('home'); loadRecents(); }
  };
}
