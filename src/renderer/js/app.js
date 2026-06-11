// Chase Studio Pro renderer boot: launcher → capture → engine → editor → loop.
import { state, hydrate, serialize } from './state.js';
import { PRESETS, LIGHT_MOODS } from './templates.js';
import { capture } from './capture.js';
import { Studio } from './engine/studio.js';
import { Segmenter } from './engine/segmentation.js';
import { OverlayEngine } from './graphics/overlay.js';
import { Compositor } from './compositor.js';
import { Outputs } from './outputs.js';
import { AudioMixer } from './audio.js';
import { initLauncher } from './ui/launcher.js';
import { initEditor } from './ui/editor.js';
import { toast } from './ui/toasts.js';

let studio = null;
let overlay = null;
let compositor = null;
let outputs = null;
let audio = null;
let segmenter = null;
let editor = null;
let launcher = null;

function applyShowPreset(presetId) {
  state.meta.preset = presetId;
  const p = PRESETS[presetId];
  if (!p) return;
  const m = LIGHT_MOODS[p.mood];
  Object.assign(state.lighting, { preset: p.mood, key: m.key, fill: m.fill, back: m.back, temp: m.temp, accent: m.accent, haze: m.haze });
  state.camera.active = p.angle;
  for (const key of Object.keys(p.gfx || {})) {
    if (state.graphics[key]) state.graphics[key].on = !!p.gfx[key];
  }
}

async function setBgMode(mode) {
  if (mode === 'ai' || mode === 'hybrid') {
    try {
      segmenter ||= new Segmenter();
      toast('Loading segmentation model…');
      await segmenter.init();
      segmenter.start(document.getElementById('cam-video'));
      studio.presenter.setMaskTexture(segmenter.texture);
      toast(mode === 'hybrid' ? 'HYBRID KEY: chroma edge + AI gate' : 'AI matte active', 'ok');
    } catch (e) {
      toast(mode === 'hybrid'
        ? 'AI gate unavailable — chroma only.'
        : 'Segmentation unavailable — framed source.', 'err', 4000);
      mode = mode === 'hybrid' ? 'chroma' : 'framed';
    }
  } else if (segmenter) {
    segmenter.stop();
    studio.presenter.setMaskTexture(null);
  }
  state.bgMode = mode;
  studio.presenter.setMode(mode);
}

function resizeOutput(w, h) {
  studio.setOutputSize(w, h);
  compositor.setSize(w, h);
}

async function openCapture() {
  try {
    await capture.open();
    studio?.presenter.setVideoSize(state.capture.width, state.capture.height);
    audio?.setMicStream(capture.stream);
    return true;
  } catch (e) {
    toast('Could not open the camera: ' + e.message, 'err', 6000);
    return false;
  }
}

async function startStudio() {
  const camVideo = document.getElementById('cam-video');

  if (!studio) {
    audio = new AudioMixer();
    studio = new Studio(camVideo, state.output.width, state.output.height);
    overlay = new OverlayEngine();
    compositor = new Compositor(document.getElementById('program-canvas'), studio, overlay);
    compositor.setSize(state.output.width, state.output.height);
    outputs = new Outputs(() =>
      compositor.buildOutputStream(state.output.fps, audio.outputTrack()));
  }

  audio.resume();
  await openCapture();

  if (!editor) {
    editor = initEditor({
      studio, overlay, outputs, audio, compositor,
      setBgMode, resizeOutput, loadProject,
      reopenCapture: openCapture,
      getSegmenter: () => segmenter
    });

    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      studio.segBounds = segmenter?.bounds || null;
      studio.tick(t, dt);
      compositor.compose(t, dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else {
    studio.loadSet(state.setId);
    studio.rebuildObjects();
    studio.presenter.setVideoSize(state.capture.width, state.capture.height);
    resizeOutput(state.output.width, state.output.height);
    editor.refreshAll();
  }

  await setBgMode(state.bgMode);
  studio.setQuality(state.output.quality);
  studio.rig.switchTo(state.camera.active, 'cut', state.presenter.x);

  launcher.hide();
  document.getElementById('editor').hidden = false;
}

async function loadProject(json, path) {
  if (outputs?.recording) await outputs.stopRecording();
  if (outputs?.streaming) await outputs.stopStreaming();
  hydrate(json);
  state.projectPath = path || null;
  await startStudio();
  toast('Project "' + state.meta.name + '" loaded', 'ok');
}

// crash recovery: persist full state every 45s regardless of save status
setInterval(() => {
  try { window.chase.recoverySave(serialize()); } catch {}
}, 45000);

// ---------------- boot ----------------
launcher = initLauncher({
  onEnter: async (wiz) => {
    state.meta.name = wiz.name;
    state.meta.createdAt = new Date().toISOString();
    state.setId = wiz.setId;
    applyShowPreset(wiz.preset);
    state.capture.cameraId = wiz.cameraId;
    state.capture.micId = wiz.micId;
    state.capture.width = wiz.width;
    state.capture.height = wiz.height;
    state.bgMode = wiz.bgMode;
    await startStudio();
    toast('1–6: stage PVW · Enter: TAKE · B: BLACK', 'ok', 4500);
  },
  onOpenProject: loadProject
});

window.chase.appInfo().then((info) => {
  const box = document.getElementById('engine-status');
  if (box) {
    box.innerHTML =
      `Chase Studio Pro v${info.version} · ${info.platform}<br>` +
      `Encoder (FFmpeg): ${info.ffmpeg ? 'ready' : '<b style="color:#ff9b9b">not found — streaming & MP4 export disabled</b>'}`;
  }
  if (!info.ffmpeg) toast('FFmpeg not found — recording works, but streaming and MP4 export are disabled.', 'err', 7000);
});
