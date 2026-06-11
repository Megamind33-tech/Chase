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
    logo: null, // { url, path }
    font: '',   // active graphics typeface (imported family name; '' = house stack)
    fonts: []   // imported faces: { name, path, url }
  },
  capture: { cameraId: null, micId: null, width: 1920, height: 1080, muted: false },
  bgMode: 'chroma', // chroma | ai | framed
  chroma: { color: '#1eb955', similarity: 0.30, smoothness: 0.08, spill: 0.6 },
  enhance: { exposure: 1.0, warmth: 0.0, saturation: 1.0, smoothing: 0.0, eyes: 0.0, erode: 0.0, wrap: 0.0 },
  refine: { feather: 0.25, gamma: 0.15, hair: 0.2, gate: 0.35, stability: 0.35, plateThresh: 0.18 }, // edge refinement engine
  presenter: { x: 0, y: 0, scale: 1 },
  cloth: { on: false, key: '#3a3f4a', to: '#8e1424', tol: 0.12, soft: 0.08 }, // wardrobe recolor
  // Familiar-presenter angle packs + remote guest slot
  talent: {
    profiles: [],        // { id, name, back: {url,path}|null, side: {url,path}|null }
    activeProfile: null, // profile id driving the rear-view swap
    rearCams: [5],       // camera numbers that show the pre-captured back loop
    guest: { on: false, media: null, x: 1.15, y: 0, scale: 1 }
  },
  lighting: { preset: 'newsNight', key: 1, fill: 0.6, back: 1.3, temp: -0.2, accent: 1.35, haze: 0.6, deskGlow: 1 },
  look: { bloom: 0.55, vignette: 0.5, grain: 0.05, floorReflection: 0.55, ledMedia: null },
  camera: { active: 1, mode: 'cut', moveDuration: 1.2, punch: 0, fovScale: 1, drift: false, driftAmount: 1, customAngles: [], autoFrame: false, shot: 'auto' },
  preview: { camera: null, sceneId: null, gfx: {} }, // staged PVW bus (cameras, scenes, ARMED graphics)
  transition: { type: 'cut', duration: 0.6 }, // cut | move | fade | wipe
  objects: [], // { id, kind, x, z, rotY, scale, height, opacity, media?, visible }
  // Live data fields for {{token}} binding in any graphic text field
  data: {
    fields: {
      guest_name: 'Jane Mwangi', guest_title: 'Senior Correspondent',
      breaking_headline: 'Economic growth forecasts raised for next quarter',
      party_name: 'NATIONAL PARTY', percentage: '48', votes: '1,204,332', reporting: '62%',
      location: 'Lusaka', temperature: '24°C',
      song_title: 'River Road', artist_name: 'Mutale Banda', royalty_amount: 'ZMW 18.40',
      comment_user: '@mwansa_k', comment_text: 'Great coverage tonight — greetings from Kitwe!',
      score_home: '2', score_away: '1'
    },
    api: { url: '', intervalS: 30, on: false }
  },
  graphics: {
    lowerThird: { on: false, name: '{{guest_name}}', title: '{{guest_title}}', location: '', topic: '', status: '', theme: 'glass', align: 'left' },
    ticker: { on: false, label: 'LATEST', text: 'Welcome to Chase Studio Pro  •  Drag assets into your set  •  Switch virtual cameras with keys 1–6', speed: 1 },
    logoBug: { on: false, size: 1, opacity: 0.95, corner: 'tr' },
    banner: { on: false, text: 'BREAKING NEWS' },
    scoreboard: { on: false, home: 'HOME', away: 'AWAY', scoreHome: '{{score_home}}', scoreAway: '{{score_away}}', label: '1ST' },
    dataCard: { on: false, kicker: 'MARKET WATCH', value: '{{percentage}}', sub: '{{party_name}}' },
    countdown: { on: false, seconds: 300, label: 'STARTING IN' },
    stinger: { on: false }, // one-shot: fires, never latches
    title: { on: false, text: 'THE EVENING REPORT' },
    clock: { on: false },
    election: {
      on: false, title: 'ELECTION RESULTS', reporting: '{{reporting}}',
      rows: [
        { party: '{{party_name}}', pct: '{{percentage}}', color: '#c8102e' },
        { party: 'UNITED ALLIANCE', pct: '34', color: '#1d4ed8' },
        { party: 'GREEN COALITION', pct: '12', color: '#0d9488' },
        { party: 'OTHERS', pct: '6', color: '#6b7280' }
      ]
    },
    weather: { on: false, location: '{{location}}', temp: '{{temperature}}', cond: 'clear', high: '', low: '' },
    finance: {
      on: false, label: 'MARKETS',
      items: [
        { sym: 'LUSE', price: '8,421.50', delta: '+1.2%' },
        { sym: 'ZMW/USD', price: '27.14', delta: '-0.4%' },
        { sym: 'COPPER', price: '9,880', delta: '+0.8%' }
      ]
    },
    music: { on: false, song: '{{song_title}}', artist: '{{artist_name}}', station: '{{station_name}}', royalty: '' },
    fullscreen: {
      on: false, title: 'FULL RESULTS', kicker: 'DECISION DESK',
      rows: [
        { k: '{{party_name}}', v: '{{percentage}}' },
        { k: 'UNITED ALLIANCE', v: '34%' },
        { k: 'GREEN COALITION', v: '12%' },
        { k: 'OTHERS', v: '6%' }
      ]
    },
    comment: { on: false, user: '{{comment_user}}', text: '{{comment_text}}', tag: 'VIEWER' },
    still: { on: false, media: null, mode: 'full', corner: 'br', size: 1, opacity: 1 },
    vtr: { on: false, media: null, loop: false, fit: 'contain' }
  },
  // Quick scenes: named snapshots of the live look (set, cam, graphics, mood)
  scenes: [],
  gfxPresets: {}, // per-graphic saved presets: { lowerThird: [{name, data}], ... }
  // Rundown: ordered cue stack — each cue snapshots camera + scene + graphics
  rundown: { cues: [], live: -1 }, // cues: { id, name, camera, sceneId, gfx:{key:on}, note }
  // Ingested asset registry (Asset Manager metadata)
  assets: [], // { id, name, source, ext, tris, memMB, liveSafe, warnings, media }
  audio: {
    micGain: 1,
    cleanup: false, // noise clean room (highpass + compressor + gate)
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

/** Graphics type stack — imported brand face first, house stack behind it. */
export function fontStack() {
  const f = state.brand.font;
  return (f ? `"${f}", ` : '') + '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
}

/** Resolve {{tokens}} against the live data store + built-ins. */
export function tok(str) {
  if (!str || String(str).indexOf('{{') < 0) return str || '';
  const now = new Date();
  const builtins = {
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    station_name: state.brand.name
  };
  return String(str).replace(/\{\{(\w+)\}\}/g, (m, k) =>
    state.data?.fields?.[k] ?? builtins[k] ?? '—');
}

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
