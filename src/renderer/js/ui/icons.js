// Chase Studio Pro icon system — one consistent family of 24×24 line icons
// (2px stroke, rounded joins, currentColor) designed for the dark broadcast
// UI. Use icon('name') to get inline SVG, or icon('name', cls) with a class.
const P = {
  // ---- navigation ----
  studio: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M7 8.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/>',
  sets: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  cube: '<path d="M12 2.5l8 4.5v9l-8 4.5L4 16V7z"/><path d="M4 7l8 4.5L20 7M12 11.5V20.5"/>',
  graphics: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/><rect x="6" y="15.5" width="8" height="2.5" rx="0.8" fill="currentColor" stroke="none"/>',
  overlays: '<rect x="4" y="4" width="13" height="13" rx="2"/><path d="M9 20h9a2 2 0 0 0 2-2V9"/>',
  lighting: '<path d="M9 3h6l1.5 9h-9z"/><path d="M12 12v4M8.5 21a3.5 2 0 0 1 7 0z"/><path d="M5 5l1.5 1.5M19 5l-1.5 1.5"/>',
  camera: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5L21 7.5v9l-5.5-3"/><circle cx="9" cy="12" r="2.5"/>',
  talent: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  audio: '<path d="M4 10v4h3l4 4V6l-4 4z"/><path d="M14.5 9.5a4 4 0 0 1 0 5M17 7a7.5 7.5 0 0 1 0 10"/>',
  scripts: '<path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9.5 7.5h5M9.5 11h5M9.5 14.5h3"/>',
  plugins: '<path d="M9 4a2 2 0 1 1 4 0h3a1 1 0 0 1 1 1v3a2 2 0 1 1 0 4v3a1 1 0 0 1-1 1h-3a2 2 0 1 0-4 0H6a1 1 0 0 1-1-1v-3a2 2 0 1 0 0-4V5a1 1 0 0 1 1-1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.2 2.4 2.6.5 1.9-1.9 1.9 1.9-1.9 1.9.5 2.6 2.4 1.2-2.4 1.2-.5 2.6 1.9 1.9-1.9 1.9-1.9-1.9-2.6.5-1.2 2.4-1.2-2.4-2.6-.5-1.9 1.9-1.9-1.9 1.9-1.9-.5-2.6-2.4-1.2 2.4-1.2.5-2.6-1.9-1.9 1.9-1.9 1.9 1.9 2.6-.5z"/>',

  // ---- production / transport ----
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
  live: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M7.7 16.3a6 6 0 0 1 0-8.6M16.3 7.7a6 6 0 0 1 0 8.6M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14"/>',
  multiview: '<rect x="3" y="4" width="8" height="6.5" rx="1"/><rect x="13" y="4" width="8" height="6.5" rx="1"/><rect x="3" y="13" width="8" height="6.5" rx="1"/><rect x="13" y="13" width="8" height="6.5" rx="1"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>',
  cut: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8.3L20 19M8.6 15.7L20 5"/>',
  fade: '<rect x="3" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="6" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2.5"/>',
  wipe: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 5v14M15 12h4M17.2 10l1.8 2-1.8 2"/>',
  slide: '<rect x="3" y="6" width="11" height="12" rx="1.5"/><path d="M17 12h4M19.2 9.8L21.4 12l-2.2 2.2"/>',
  push: '<rect x="2.5" y="7" width="8" height="10" rx="1.2"/><rect x="13.5" y="7" width="8" height="10" rx="1.2" stroke-dasharray="2.5 2.5"/><path d="M11 12h2"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5M8.5 11h5M11 8.5v5"/>',
  move: '<path d="M12 2.5v19M2.5 12h19M12 2.5l-2.4 2.4M12 2.5l2.4 2.4M12 21.5l-2.4-2.4M12 21.5l2.4-2.4M2.5 12l2.4-2.4M2.5 12l2.4 2.4M21.5 12l-2.4-2.4M21.5 12l-2.4 2.4"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.7 3.5v3.8h-3.8"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.6l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',

  // ---- graphics types ----
  lowerthird: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 14h9"/><rect x="6" y="15.8" width="6" height="1.8" rx="0.6" fill="currentColor" stroke="none"/>',
  ticker: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15.5h18"/><path d="M6 17.8h2.5M10.5 17.8h4M16.5 17.8h2"/>',
  banner: '<path d="M3 7h18v6.5H3z"/><path d="M3 7l2.5 3.2L3 13.5M6.8 10.2h10"/>',
  logobug: '<path d="M12 3.5l7 4v9l-7 4-7-4v-9z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/>',
  title: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M12 10v5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.4 2"/>',
  countdown: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.4 1.5M9.5 3h5M12 3v2.5"/>',
  screen: '<rect x="3" y="4" width="18" height="11.5" rx="1.5"/><path d="M8.5 20h7M12 15.5V20"/><path d="M6.5 7.5h6"/>',
  chroma: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2.2"/><path d="M3 17l4.5-4 3.5 3 4-4.5 6 5.5" />',
  skin: '<circle cx="12" cy="9" r="4"/><path d="M6 20a6.5 6.5 0 0 1 12 0"/><path d="M17.7 4.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" fill="currentColor" stroke="none"/>',

  // ---- system / status ----
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="0.8"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  gauge: '<path d="M4 17a8.5 8.5 0 1 1 16 0"/><path d="M12 13.5L16 9"/><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none"/>',
  health: '<path d="M3 12h4l2-5 3.5 9 2.5-6.5 1.5 2.5H21"/>',
  warn: '<path d="M12 3.5L22 20H2z"/><path d="M12 9.5v5"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5.5 5.5"/>',
  filter: '<path d="M3.5 5.5h17l-6.5 7.5v5.5l-4 2v-7.5z"/>',
  save: '<path d="M4.5 4.5h12l3 3v12h-15z"/><path d="M8 4.5V9h7V4.5M8 19.5v-6h8v6"/>',
  open: '<path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v.5"/><path d="M3 6.5V18a1.5 1.5 0 0 0 1.5 1.5H18a2 2 0 0 0 1.9-1.4L22 11H5.5a1.6 1.6 0 0 0-1.5 1.1z"/>',
  importIc: '<path d="M12 3v10M8.5 9.5L12 13l3.5-3.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  exportIc: '<path d="M12 13V3M8.5 6.5L12 3l3.5 3.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  expand: '<path d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15"/>',
  safearea: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="6.5" y="8" width="11" height="8" rx="1" stroke-dasharray="2.5 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5"/>',
  music: '<path d="M9 18.5V5.5l11-2v12.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  jingle: '<path d="M10 16.5V5l9-1.5v11"/><circle cx="7.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="14.5" r="2.5"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="M10 9.2l5 2.8-5 2.8z" fill="currentColor" stroke="none"/>',
  facebook: '<circle cx="12" cy="12" r="9"/><path d="M14.8 7.5h-1.6a2 2 0 0 0-2 2V21M9 12.5h5"/>',
  rtmp: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.7 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.7-4-9s1.2-6.4 4-9z"/>',
  scene: '<path d="M4 6.5L12 3l8 3.5v11L12 21l-8-3.5z"/><path d="M4 6.5L12 10l8-3.5M12 10v11"/>',
  macro: '<path d="M13 2.5L5 13.5h5.5L10 21.5l8.5-11.5H13z"/>',
  undo: '<path d="M7.5 4.5L3 9l4.5 4.5"/><path d="M3 9h11a6 6 0 0 1 0 12h-4"/>',
  plant: '<path d="M9 21h6M10 21l-1-7h6l-1 7"/><path d="M12 14V9M12 9C12 6 9.5 4 6.5 4c0 3 2.5 5 5.5 5zM12 9c0-3 2.5-5 5.5-5 0 3-2.5 5-5.5 5z"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>'
};

export function icon(name, cls = '') {
  const body = P[name] || P.cube;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
