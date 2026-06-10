// Central project state + tiny pub/sub. Everything that must survive
// save/load lives here as plain JSON.
export const state = {
  projectPath: null,
  meta: { name: 'My Studio', preset: 'news', createdAt: null, appVersion: '0.2.0' },
  setId: 'apex',
  brand: {
    name: 'CHASE NEWS',
    primary: '#0e63d8',
    accent: '#e8b220',
    logo: null // { url, path }
  },
  capture: { cameraId: null, micId: null, width: 1920, height: 1080, muted: false },
  bgMode: 'chroma', // chroma | ai | framed
  chroma: { color: '#1eb955', similarity: 0.30, smoothness: 0.08, spill: 0.6 },
  enhance: { exposure: 1.0, warmth: 0.0, saturation: 1.0, smoothing: 0.0, eyes: 0.0 },
  presenter: { x: 0, y: 0, scale: 1 },
  lighting: { preset: 'newsNight', key: 1, fill: 0.6, back: 1.3, temp: -0.2, accent: 1.35, haze: 0.6, deskGlow: 1 },
  look: { bloom: 0.55, vignette: 0.5, floorReflection: 0.55, ledMedia: null },
  camera: { active: 1, mode: 'cut', moveDuration: 1.2, punch: 0, fovScale: 1, drift: false, driftAmount: 1 },
  preview: { camera: null, sceneId: null }, // staged PVW bus (not pushed live until TAKE)
  transition: { type: 'cut', duration: 0.6 }, // cut | move | fade | wipe
  objects: [], // { id, kind, x, z, rotY, scale, height, opacity, media?, visible }
  graphics: {
    lowerThird: { on: false, name: 'Jane Mwangi', title: 'Senior Correspondent', align: 'left' },
    ticker: { on: false, label: 'LATEST', text: 'Welcome to Chase Studio Pro  •  Drag assets into your set  •  Switch virtual cameras with keys 1–6', speed: 1 },
    logoBug: { on: false, size: 1, opacity: 0.95, corner: 'tr' },
    banner: { on: false, text: 'BREAKING NEWS' },
    title: { on: false, text: 'THE EVENING REPORT' },
    clock: { on: false }
  },
  // Quick scenes: named snapshots of the live look (set, cam, graphics, mood)
  scenes: [],
  audio: {
    micGain: 1,
    jingleGain: 0.8,
    masterGain: 1,
    jingles: [] // { name, path, url }
  },
  output: {
    width: 1920, height: 1080, fps: 30, bitrateK: 4500, quality: 'auto',
    destinations: [
      { id: 'yt', name: 'YouTube', kind: 'youtube', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', enabled: false },
      { id: 'fb', name: 'Facebook', kind: 'facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: '', enabled: false },
      { id: 'custom', name: 'Custom RTMP', kind: 'custom', url: '', key: '', enabled: false }
    ]
  }
};

const listeners = {};
export function on(topic, fn) { (listeners[topic] ||= []).push(fn); }
export function emit(topic, data) { (listeners[topic] || []).forEach((f) => f(data)); }

let objSeq = 1;
export function nextObjectId() { return 'obj' + (objSeq++); }
let sceneSeq = 1;
export function nextSceneId() { return 'scn' + (sceneSeq++); }

/** Serialize for project save. */
export function serialize() {
  const { projectPath, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

/** Serialize for template export: drop user media + capture device ids. */
export function serializeTemplate() {
  const t = serialize();
  t.capture = { cameraId: null, micId: null, width: t.capture.width, height: t.capture.height, muted: false };
  if (t.brand.logo?.path) t.brand.logo = null;
  t.look.ledMedia = null;
  t.audio.jingles = [];
  t.objects = t.objects.map((o) => ({ ...o, media: null }));
  return t;
}

/** Load saved JSON over the live state (deep merge sub-objects). */
export function hydrate(json) {
  for (const key of Object.keys(json)) {
    if (key === 'projectPath') continue;
    const val = json[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && state[key] && typeof state[key] === 'object' && !Array.isArray(state[key])) {
      deepMerge(state[key], val);
    } else {
      state[key] = JSON.parse(JSON.stringify(val));
    }
  }
  for (const o of state.objects) {
    const n = parseInt(String(o.id).replace('obj', ''), 10);
    if (!isNaN(n) && n >= objSeq) objSeq = n + 1;
  }
  for (const s of state.scenes) {
    const n = parseInt(String(s.id).replace('scn', ''), 10);
    if (!isNaN(n) && n >= sceneSeq) sceneSeq = n + 1;
  }
  emit('hydrated');
}

function deepMerge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
      deepMerge(dst[k], v);
    } else {
      dst[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v;
    }
  }
}
