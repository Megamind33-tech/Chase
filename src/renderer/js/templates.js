// Set themes + show presets. A "set" is the 3D environment; a "preset"
// layers defaults (lighting, graphics, angle) for a show format on top.

export const SETS = {
  horizon: {
    name: 'Horizon',
    desc: 'Modern glass news studio — cool blue, glossy floor, big video wall',
    thumb: 'linear-gradient(135deg,#0c2f66 0%,#1b5fd0 55%,#39b6ff 100%)',
    theme: {
      floor: '#10141c', floorRough: 0.18, wall: '#0c1018',
      wallGlowA: '#0e63d8', wallGlowB: '#39b6ff',
      desk: '#141a26', deskFace: '#0e63d8', trim: '#39b6ff',
      column: '#161c28', accent: '#2f7df6', fog: '#070a10',
      wallStyle: 'tech'
    }
  },
  amber: {
    name: 'Amber',
    desc: 'Warm talk & interview set — wood tones, soft golden backlight',
    thumb: 'linear-gradient(135deg,#3c2104 0%,#9a5d12 55%,#f0b53c 100%)',
    theme: {
      floor: '#191410', floorRough: 0.3, wall: '#171008',
      wallGlowA: '#c87614', wallGlowB: '#f0b53c',
      desk: '#241a10', deskFace: '#b06a10', trim: '#f0b53c',
      column: '#221a12', accent: '#e89a2a', fog: '#0d0905',
      wallStyle: 'soft'
    }
  },
  onyx: {
    name: 'Onyx',
    desc: 'Dark premium prime-time set — black, red and gold, dramatic rims',
    thumb: 'linear-gradient(135deg,#15060a 0%,#771522 55%,#e8b220 100%)',
    theme: {
      floor: '#0b0a0d', floorRough: 0.12, wall: '#0c080c',
      wallGlowA: '#b3192d', wallGlowB: '#e8b220',
      desk: '#100d12', deskFace: '#8e1424', trim: '#e8b220',
      column: '#120e14', accent: '#d62339', fog: '#060408',
      wallStyle: 'bold'
    }
  }
};

export const PRESETS = {
  news:      { name: 'News desk',  desc: 'Anchor + ticker + lower thirds', light: 'newsDay',  angle: 2,
               gfx: { ticker: true, clock: true }, headline: 'NEWS' },
  interview: { name: 'Interview',  desc: 'Two-shot framing, softer light', light: 'warmTalk', angle: 3,
               gfx: {}, headline: 'IN CONVERSATION' },
  podcast:   { name: 'Podcast',    desc: 'Relaxed wide, episode title',    light: 'warmTalk', angle: 1,
               gfx: { title: true }, headline: 'THE SHOW' },
  sports:    { name: 'Sports',     desc: 'Punchy energy, score-ready',     light: 'dramatic', angle: 4,
               gfx: { ticker: true }, headline: 'SPORTS NIGHT' },
  weather:   { name: 'Weather',    desc: 'Presenter beside virtual wall',  light: 'newsDay',  angle: 5,
               gfx: {}, headline: 'WEATHER CENTRE' },
  church:    { name: 'Church',     desc: 'Warm welcome, verse lower third', light: 'warmTalk', angle: 2,
               gfx: { lowerThird: true }, headline: 'SUNDAY SERVICE' },
  education: { name: 'Education',  desc: 'Lesson title + virtual screen',  light: 'flat',     angle: 5,
               gfx: { title: true }, headline: 'THE CLASSROOM' },
  business:  { name: 'Business',   desc: 'Corporate clean, chart-ready',   light: 'newsEvening', angle: 2,
               gfx: { ticker: true }, headline: 'MARKET BRIEF' }
};

export const LIGHT_PRESETS = {
  newsDay:     { name: 'News day',     key: 1.15, fill: 0.9,  back: 1.0,  temp: 0.05,  accent: 1.0,
                 grade: { exposure: 1.02, warmth: 0.02 } },
  newsEvening: { name: 'Evening',      key: 1.0,  fill: 0.65, back: 1.2,  temp: -0.25, accent: 1.25,
                 grade: { exposure: 0.98, warmth: -0.05 } },
  warmTalk:    { name: 'Warm talk',    key: 0.95, fill: 0.85, back: 0.9,  temp: 0.55,  accent: 0.8,
                 grade: { exposure: 1.0, warmth: 0.22 } },
  dramatic:    { name: 'Dramatic',     key: 1.25, fill: 0.35, back: 1.5,  temp: -0.1,  accent: 1.6,
                 grade: { exposure: 0.96, warmth: 0.0 } },
  flat:        { name: 'Flat & clean', key: 1.0,  fill: 1.0,  back: 0.8,  temp: 0.0,   accent: 0.7,
                 grade: { exposure: 1.05, warmth: 0.0 } }
};

export const SKIN_PRESETS = {
  natural: { name: 'Natural',   exposure: 1.0,  warmth: 0.0,  saturation: 1.0,  smoothing: 0.0 },
  studio:  { name: 'Studio',    exposure: 1.08, warmth: 0.08, saturation: 1.05, smoothing: 0.25 },
  glow:    { name: 'Soft glow', exposure: 1.12, warmth: 0.15, saturation: 1.0,  smoothing: 0.5 },
  rich:    { name: 'Rich tone', exposure: 1.04, warmth: 0.22, saturation: 1.18, smoothing: 0.3 },
  cool:    { name: 'Cool crisp', exposure: 1.05, warmth: -0.12, saturation: 1.05, smoothing: 0.1 }
};

export const PROPS = {
  screen:   { name: 'Virtual screen', desc: 'Free-standing 16:9 display — drop video or images on it', ico: '🖥' },
  monitor:  { name: 'Studio monitor', desc: 'Desk-side preview monitor on a slim stand', ico: '📺' },
  panel:    { name: 'Glass panel',    desc: 'Frosted standing panel with brand glow', ico: '◫' },
  plinth:   { name: 'Plinth',         desc: 'Display pedestal with lit edge', ico: '▯' },
  lightbar: { name: 'Floor light bar', desc: 'Accent light strip in your brand colour', ico: '═' },
  plant:    { name: 'Studio plant',   desc: 'A touch of green for talk formats', ico: '🪴' }
};

export const GRAPHICS = {
  lowerThird: { name: 'Lower third', desc: 'Name + role strap with brand colours', ico: 'L3' },
  ticker:     { name: 'News ticker', desc: 'Scrolling headline bar', ico: '⟶' },
  logoBug:    { name: 'Logo bug',    desc: 'Your station logo on screen', ico: '◆' },
  banner:     { name: 'Breaking banner', desc: 'High-impact alert slab', ico: '⚡' },
  title:      { name: 'Title card',  desc: 'Show opener title', ico: 'T' },
  clock:      { name: 'Clock',       desc: 'On-screen studio clock', ico: '🕐' }
};
