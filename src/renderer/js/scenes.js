// Quick scenes + macros: control-room one-click looks.
// A scene is a named snapshot of the live show state (set, camera, mood,
// graphics). Recalling one applies it through the selected transition.
import { state, nextSceneId } from './state.js';
import { LIGHT_MOODS, MACROS } from './templates.js';

export function snapshotScene(name) {
  return {
    id: nextSceneId(),
    name: name || 'Scene ' + (state.scenes.length + 1),
    setId: state.setId,
    camera: state.camera.active,
    lighting: JSON.parse(JSON.stringify(state.lighting)),
    graphics: JSON.parse(JSON.stringify(state.graphics)),
    presenter: { ...state.presenter }
  };
}

/**
 * Apply a scene through the engine. `ctx` provides the live systems:
 * { studio, overlay, compositor, switchCam, applyLighting, refreshGfx }
 */
export function applyScene(scene, ctx) {
  const trans = state.transition;
  if (trans.type === 'fade' || trans.type === 'wipe') {
    ctx.compositor.beginTransition(trans.type, trans.duration);
  }
  if (scene.setId !== state.setId) {
    ctx.studio.loadSet(scene.setId);
    ctx.studio.rebuildObjects();
  }
  Object.assign(state.lighting, scene.lighting);
  Object.assign(state.presenter, scene.presenter || {});
  for (const key of Object.keys(scene.graphics)) {
    const target = state.graphics[key];
    const incoming = scene.graphics[key];
    if (!target) continue;
    const wasOn = target.on;
    Object.assign(target, incoming);
    if (wasOn !== incoming.on) ctx.overlay.toggle(key, incoming.on);
  }
  ctx.applyLighting();
  ctx.switchCam(scene.camera, true);
  ctx.refreshGfx();
}

export function runMacro(id, ctx) {
  const g = state.graphics;
  switch (id) {
    case 'breaking':
      if (!g.banner.on) ctx.overlay.toggle('banner', true);
      if (!g.ticker.on) ctx.overlay.toggle('ticker', true);
      ctx.switchCam(2);
      break;
    case 'opener':
      if (!g.title.on) ctx.overlay.toggle('title', true);
      if (!g.logoBug.on) ctx.overlay.toggle('logoBug', true);
      if (g.banner.on) ctx.overlay.toggle('banner', false);
      ctx.switchCam(1);
      break;
    case 'clearGfx':
      for (const key of Object.keys(g)) if (g[key].on) ctx.overlay.toggle(key, false);
      break;
    case 'celebrate':
      ctx.confetti?.();
      break;
    case 'interview': {
      const mood = LIGHT_MOODS.warmTalk;
      Object.assign(state.lighting, { preset: 'warmTalk', key: mood.key, fill: mood.fill, back: mood.back, temp: mood.temp, accent: mood.accent, haze: mood.haze });
      ctx.applyLighting();
      if (!g.lowerThird.on) ctx.overlay.toggle('lowerThird', true);
      ctx.switchCam(3);
      break;
    }
  }
  ctx.refreshGfx();
}

export { MACROS };
