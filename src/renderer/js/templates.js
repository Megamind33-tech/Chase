// Chase Studio Pro — product data backbone: set packs, categories, show
// presets, lighting moods, complexion presets, prop + graphics catalogs.

export const SET_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'news', name: 'News' },
  { id: 'politics', name: 'Politics' },
  { id: 'sports', name: 'Sports' },
  { id: 'talkshow', name: 'Talkshow' },
  { id: 'church', name: 'Church' },
  { id: 'podcast', name: 'Podcast' },
  { id: 'education', name: 'Education' },
  { id: 'concert', name: 'Concert' }
];

// Each set is a full 3D environment: curved LED wall content style,
// palette, architecture flags. Rendered procedurally — no stock assets.
export const SETS = {
  apex: {
    name: 'Apex Newsroom', cat: ['news'],
    desc: 'Global flagship news set — night skyline LED, cyan trim, glass desk',
    theme: {
      ledStyle: 'skyline', ledA: '#0a2c6e', ledB: '#1486d8', sky: '#06122e',
      trim: '#34c3ff', accent: '#2f7df6', warm: '#e8b220',
      floor: '#0b1018', floorRefl: 0.55, desk: '#0d1422', deskFace: '#0e63d8',
      wall: '#070b14', fog: '#050a16', column: '#0e1624',
      curved: true, towers: 3, truss: false
    }
  },
  savanna: {
    name: 'Savanna Newsroom', cat: ['news'],
    desc: 'African prime-time set — sunset skyline, amber and gold light',
    theme: {
      ledStyle: 'skyline', ledA: '#7a2d08', ledB: '#f0a52c', sky: '#2a0f04',
      trim: '#ffb938', accent: '#e8742a', warm: '#ffd76e',
      floor: '#140e08', floorRefl: 0.5, desk: '#1c1208', deskFace: '#b06010',
      wall: '#120b05', fog: '#160b04', column: '#1d130a',
      curved: true, towers: 3, truss: false
    }
  },
  mandate: {
    name: 'Mandate Decision Desk', cat: ['news', 'politics'],
    desc: 'Election studio — result boards, red/blue split lighting',
    theme: {
      ledStyle: 'election', ledA: '#9c1626', ledB: '#10337e', sky: '#0a0a18',
      trim: '#e8b220', accent: '#d62339', warm: '#3a6bd8',
      floor: '#0c0a10', floorRefl: 0.6, desk: '#100d16', deskFace: '#1b2c66',
      wall: '#0a0810', fog: '#080610', column: '#120e18',
      curved: true, towers: 4, truss: false
    }
  },
  grace: {
    name: 'Grace Cathedral Stage', cat: ['church'],
    desc: 'Worship broadcast set — golden arch glow, soft warm wash',
    theme: {
      ledStyle: 'rays', ledA: '#3a1d04', ledB: '#e8a93c', sky: '#1c1004',
      trim: '#ffd76e', accent: '#e8a93c', warm: '#ffe0b0',
      floor: '#171008', floorRefl: 0.35, desk: '#221608', deskFace: '#8a5a14',
      wall: '#140d05', fog: '#120c05', column: '#1c1309',
      curved: true, towers: 2, truss: false, archs: true
    }
  },
  loft: {
    name: 'Loft Podcast Room', cat: ['podcast', 'talkshow'],
    desc: 'Cozy creator loft — brick, neon sign, teal & magenta mood',
    theme: {
      ledStyle: 'neon', ledA: '#161020', ledB: '#7a2d8c', sky: '#0d0a14',
      trim: '#ff4fa3', accent: '#21c8c8', warm: '#ff8f3c',
      floor: '#100c12', floorRefl: 0.3, desk: '#181018', deskFace: '#341c4a',
      wall: '#120d16', fog: '#0c0810', column: '#191220',
      curved: false, towers: 2, truss: false
    }
  },
  arena: {
    name: 'Arena Sports Desk', cat: ['sports'],
    desc: 'Match-night sports set — stadium LED, pitch green & cyan',
    theme: {
      ledStyle: 'stadium', ledA: '#06351c', ledB: '#0fae5e', sky: '#04140c',
      trim: '#3cf08a', accent: '#21c8c8', warm: '#e8e23c',
      floor: '#091009', floorRefl: 0.55, desk: '#0b140e', deskFace: '#0d7a3e',
      wall: '#06100a', fog: '#050d08', column: '#0c1610',
      curved: true, towers: 3, truss: false
    }
  },
  pulse: {
    name: 'Pulse Concert Stage', cat: ['concert'],
    desc: 'Live show & concert stage — truss rig, beam lights, magenta haze',
    theme: {
      ledStyle: 'beams', ledA: '#1c0830', ledB: '#a824c8', sky: '#0e0518',
      trim: '#c84fff', accent: '#ff3c8c', warm: '#3c8cff',
      floor: '#0c0712', floorRefl: 0.65, desk: '#130a1c', deskFace: '#5a1880',
      wall: '#0c0614', fog: '#0a0512', column: '#140b20',
      curved: true, towers: 4, truss: true
    }
  },
  prime: {
    name: 'Prime Talkshow', cat: ['talkshow'],
    desc: 'Evening talkshow — amber city dusk, plush warm accents',
    theme: {
      ledStyle: 'skyline', ledA: '#33150e', ledB: '#c86428', sky: '#180a06',
      trim: '#ffaf5e', accent: '#e8742a', warm: '#ffd76e',
      floor: '#120d0a', floorRefl: 0.45, desk: '#1a120c', deskFace: '#8a4a18',
      wall: '#100b08', fog: '#0e0905', column: '#181009',
      curved: true, towers: 2, truss: false
    }
  },
  forum: {
    name: 'Forum Studio', cat: ['education', 'talkshow'],
    desc: 'Clean explainer & theater set — teal panels, bright neutral light',
    theme: {
      ledStyle: 'panels', ledA: '#08303a', ledB: '#1aa8b8', sky: '#071820',
      trim: '#3cdce8', accent: '#21a8c8', warm: '#e8e8e0',
      floor: '#0c1214', floorRefl: 0.4, desk: '#101a1e', deskFace: '#117a8a',
      wall: '#0a1216', fog: '#081014', column: '#10191d',
      curved: false, towers: 3, truss: false
    }
  }
};

export const PRESETS = {
  news:      { name: 'News desk',  set: 'apex',    mood: 'newsNight', angle: 2, gfx: { ticker: true, clock: true }, headline: 'CHASE NEWS' },
  interview: { name: 'Interview',  set: 'prime',   mood: 'warmTalk',  angle: 3, gfx: {}, headline: 'IN CONVERSATION' },
  podcast:   { name: 'Podcast',    set: 'loft',    mood: 'warmTalk',  angle: 1, gfx: { title: true }, headline: 'ON AIR' },
  sports:    { name: 'Sports',     set: 'arena',   mood: 'stadium',   angle: 4, gfx: { ticker: true }, headline: 'MATCH NIGHT' },
  politics:  { name: 'Election',   set: 'mandate', mood: 'dramatic',  angle: 2, gfx: { ticker: true, banner: true }, headline: 'DECISION DESK' },
  church:    { name: 'Church',     set: 'grace',   mood: 'worship',   angle: 2, gfx: { lowerThird: true }, headline: 'SUNDAY SERVICE' },
  education: { name: 'Education',  set: 'forum',   mood: 'flat',      angle: 5, gfx: { title: true }, headline: 'THE CLASSROOM' },
  concert:   { name: 'Concert',    set: 'pulse',   mood: 'concert',   angle: 1, gfx: { logoBug: true }, headline: 'LIVE IN CONCERT' }
};

export const LIGHT_MOODS = {
  newsDay:   { name: 'News day',   key: 1.15, fill: 0.9,  back: 1.0, temp: 0.05,  accent: 1.0,  haze: 0.4, grade: { exposure: 1.02, warmth: 0.02 } },
  newsNight: { name: 'Prime time', key: 1.0,  fill: 0.6,  back: 1.3, temp: -0.2,  accent: 1.35, haze: 0.6, grade: { exposure: 0.98, warmth: -0.04 } },
  warmTalk:  { name: 'Warm talk',  key: 0.95, fill: 0.85, back: 0.9, temp: 0.55,  accent: 0.85, haze: 0.5, grade: { exposure: 1.0,  warmth: 0.22 } },
  dramatic:  { name: 'Dramatic',   key: 1.25, fill: 0.32, back: 1.55, temp: -0.1, accent: 1.6,  haze: 0.75, grade: { exposure: 0.96, warmth: 0 } },
  worship:   { name: 'Worship',    key: 0.9,  fill: 0.7,  back: 1.1, temp: 0.7,   accent: 1.2,  haze: 0.7, grade: { exposure: 1.04, warmth: 0.3 } },
  concert:   { name: 'Concert',    key: 0.85, fill: 0.4,  back: 1.7, temp: -0.35, accent: 1.9,  haze: 0.95, grade: { exposure: 0.95, warmth: -0.05 } },
  stadium:   { name: 'Stadium',    key: 1.2,  fill: 1.0,  back: 1.1, temp: -0.12, accent: 1.3,  haze: 0.45, grade: { exposure: 1.05, warmth: -0.03 } },
  flat:      { name: 'Flat clean', key: 1.0,  fill: 1.0,  back: 0.8, temp: 0,     accent: 0.7,  haze: 0.25, grade: { exposure: 1.05, warmth: 0 } }
};

export const SKIN_PRESETS = {
  natural: { name: 'Natural',    exposure: 1.0,  warmth: 0.0,   saturation: 1.0,  smoothing: 0.0,  eyes: 0.0 },
  studio:  { name: 'Studio',     exposure: 1.08, warmth: 0.08,  saturation: 1.05, smoothing: 0.25, eyes: 0.15 },
  glow:    { name: 'Soft glow',  exposure: 1.12, warmth: 0.15,  saturation: 1.0,  smoothing: 0.5,  eyes: 0.25 },
  rich:    { name: 'Rich tone',  exposure: 1.04, warmth: 0.22,  saturation: 1.18, smoothing: 0.3,  eyes: 0.2 },
  cool:    { name: 'Cool crisp', exposure: 1.05, warmth: -0.12, saturation: 1.05, smoothing: 0.1,  eyes: 0.3 }
};

export const PROPS = {
  screen:   { name: 'Virtual screen', desc: '16:9 LED display on stand — drop media on it', ico: 'screen' },
  monitor:  { name: 'Studio monitor', desc: 'Desk-side preview monitor', ico: 'studio' },
  panel:    { name: 'Glass panel',    desc: 'Frosted panel with brand glow', ico: 'overlays' },
  plinth:   { name: 'Plinth',         desc: 'Display pedestal, lit edge', ico: 'cube' },
  lightbar: { name: 'Floor light bar', desc: 'Accent strip in brand colour', ico: 'lighting' },
  plant:    { name: 'Studio plant',   desc: 'Greenery for talk formats', ico: 'plant' },
  arpanel:  { name: 'AR Data Panel',  desc: 'Floating in-set panel · {{token}} bindable', ico: 'gauge' }
};

export const GRAPHICS = {
  lowerThird: { name: 'Lower third', desc: 'Name + role strap', ico: 'lowerthird' },
  ticker:     { name: 'News ticker', desc: 'Scrolling headline bar', ico: 'ticker' },
  logoBug:    { name: 'Logo bug',    desc: 'Station logo on screen', ico: 'logobug' },
  banner:     { name: 'Breaking banner', desc: 'High-impact alert slab', ico: 'banner' },
  title:      { name: 'Title card',  desc: 'Show opener title', ico: 'title' },
  clock:      { name: 'Clock',       desc: 'On-screen studio clock', ico: 'clock' },
  scoreboard: { name: 'Scoreboard',  desc: 'Two-team score strap · data-bindable', ico: 'health' },
  dataCard:   { name: 'Data card',   desc: 'Kicker + value panel · election/finance', ico: 'gauge' },
  countdown:  { name: 'Countdown',   desc: 'Timed count to zero', ico: 'countdown' },
  stinger:    { name: 'Stinger',     desc: 'One-shot branded transition sweep', ico: 'macro' },
  election:   { name: 'Election results', desc: 'Party rows with live vote bars', ico: 'gauge' },
  weather:    { name: 'Weather panel', desc: 'Location, temperature, conditions', ico: 'lighting' },
  finance:    { name: 'Market strip', desc: 'Instruments with price + delta', ico: 'health' },
  music:      { name: 'Now playing',  desc: 'Song, artist and station metadata', ico: 'audio' },
  fullscreen: { name: 'Full screen',  desc: 'Full-frame data takeover panel', ico: 'screen' },
  comment:    { name: 'Comment card', desc: 'Viewer comment with handle + tag', ico: 'talent' }
};

// Control-room macros: one button = several real actions.
export const MACROS = {
  breaking:  { name: 'Breaking news', desc: 'Banner + ticker on, cut to Centre', ico: 'banner' },
  opener:    { name: 'Show opener',   desc: 'Title card up, wide shot, logo on', ico: 'macro' },
  clearGfx:  { name: 'Clear graphics', desc: 'All overlays off air', ico: 'close' },
  interview: { name: 'Interview look', desc: 'Cross-shot, warm mood, L3 on', ico: 'talent' }
};
