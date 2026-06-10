// Studio engine orchestrator: owns the WebGL renderer, the active set,
// the presenter, lights, virtual cameras and droppable scene objects.
import * as THREE from '/node_modules/three/build/three.module.js';
import { buildSet } from './sets.js';
import { buildProp } from './props.js';
import { Presenter } from './presenter.js';
import { CameraRig } from './cameras.js';
import { LightRig } from './lighting.js';
import { SETS, PRESETS } from '../templates.js';
import { state, nextObjectId } from '../state.js';

export class Studio {
  constructor(videoEl, outWidth, outHeight) {
    this.width = outWidth;
    this.height = outHeight;
    this.canvas = document.createElement('canvas'); // offscreen GL target
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.qualityScale = 1;
    this.renderer.setSize(outWidth, outHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05070b');

    this.rig = new CameraRig(outWidth / outHeight);
    this.lights = new LightRig(this.scene);
    this.presenter = new Presenter(videoEl);
    this.scene.add(this.presenter.group);

    this.objects = new Map(); // id -> THREE.Group
    this.objectsRoot = new THREE.Group();
    this.scene.add(this.objectsRoot);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.set = null;
    this._wallClock = 0;
    this._fpsSamples = [];
    this.fps = 0;
    this.loadSet(state.setId);
  }

  // ---------- set ----------
  loadSet(setId) {
    if (this.set) {
      this.scene.remove(this.set.group);
      this.set.group.traverse((o) => { o.geometry?.dispose(); });
    }
    const def = SETS[setId] || SETS.horizon;
    const headline = PRESETS[state.meta.preset]?.headline || 'NEWS';
    this.set = buildSet(def.theme, state.brand, headline);
    this.scene.add(this.set.group);
    this.scene.fog = new THREE.Fog(def.theme.fog, 14, 30);
    state.setId = setId;
    this.lights.apply(state.lighting, def.theme);
  }

  refreshBrand() {
    const headline = PRESETS[state.meta.preset]?.headline;
    this.set.setBrand(state.brand, headline);
  }

  // ---------- objects ----------
  addObject(kind, x = 2.2, z = -0.5, existing = null) {
    const def = SETS[state.setId] || SETS.horizon;
    const group = buildProp(kind, def.theme, state.brand);
    const id = existing?.id || nextObjectId();
    group.userData.id = id;
    group.userData.kind = kind;
    const data = existing || { id, kind, x, z, rotY: 0, scale: 1, height: 0, media: null, visible: true };
    group.position.set(data.x, data.height || 0, data.z);
    group.rotation.y = (data.rotY || 0) * Math.PI / 180;
    group.scale.setScalar(data.scale || 1);
    group.visible = data.visible !== false;
    if (data.media && group.userData.setMedia) group.userData.setMedia(data.media.url, data.media.type);
    this.objectsRoot.add(group);
    this.objects.set(id, group);
    if (!existing) state.objects.push(data);
    return data;
  }

  removeObject(id) {
    const g = this.objects.get(id);
    if (g) {
      g.userData.dispose?.();
      this.objectsRoot.remove(g);
      this.objects.delete(id);
    }
    state.objects = state.objects.filter((o) => o.id !== id);
  }

  syncObject(data) {
    const g = this.objects.get(data.id);
    if (!g) return;
    g.position.set(data.x, data.height || 0, data.z);
    g.rotation.y = (data.rotY || 0) * Math.PI / 180;
    g.scale.setScalar(data.scale || 1);
    g.visible = data.visible !== false;
  }

  rebuildObjects() {
    for (const [, g] of this.objects) { g.userData.dispose?.(); this.objectsRoot.remove(g); }
    this.objects.clear();
    for (const data of state.objects) this.addObject(data.kind, data.x, data.z, data);
  }

  // ---------- picking & drag ----------
  _ndc(canvasX, canvasY) {
    return new THREE.Vector2(
      (canvasX / this.width) * 2 - 1,
      -(canvasY / this.height) * 2 + 1
    );
  }

  pick(canvasX, canvasY) {
    this.raycaster.setFromCamera(this._ndc(canvasX, canvasY), this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.objectsRoot.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.id) o = o.parent;
      if (o?.userData.id) return o.userData.id;
    }
    return null;
  }

  /** Project a canvas point onto the studio floor. */
  floorPoint(canvasX, canvasY) {
    this.raycaster.setFromCamera(this._ndc(canvasX, canvasY), this.rig.camera);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, pt)) {
      pt.x = THREE.MathUtils.clamp(pt.x, -7, 7);
      pt.z = THREE.MathUtils.clamp(pt.z, -3.7, 6);
      return pt;
    }
    return null;
  }

  setSelectionGlow(id) {
    for (const [oid, g] of this.objects) {
      const on = oid === id;
      g.traverse((m) => {
        if (m.material && 'emissiveIntensity' in m.material) {
          if (m.userData._baseEmissive === undefined) m.userData._baseEmissive = m.material.emissiveIntensity;
          m.material.emissiveIntensity = on ? m.userData._baseEmissive + 0.35 : m.userData._baseEmissive;
          if (on && m.material.emissive?.equals?.(new THREE.Color(0, 0, 0))) m.material.emissive = new THREE.Color('#2f7df6');
        }
      });
    }
  }

  // ---------- quality ----------
  setQuality(mode) {
    const scales = { high: 1, medium: 0.75, low: 0.55 };
    if (mode !== 'auto') {
      this.qualityScale = scales[mode] || 1;
      this._auto = false;
    } else {
      this._auto = true;
      this.qualityScale = 1;
    }
    this._applyScale();
  }

  _applyScale() {
    this.renderer.setSize(Math.round(this.width * this.qualityScale), Math.round(this.height * this.qualityScale), false);
    this.rig.setAspect(this.width / this.height);
  }

  setOutputSize(w, h) {
    this.width = w; this.height = h;
    this._applyScale();
  }

  // ---------- frame ----------
  tick(time, dt) {
    // fps tracking + auto quality
    this._fpsSamples.push(dt);
    if (this._fpsSamples.length >= 30) {
      const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
      this.fps = Math.round(1 / Math.max(avg, 0.001));
      this._fpsSamples.length = 0;
      if (this._auto) {
        if (this.fps < 22 && this.qualityScale > 0.55) { this.qualityScale -= 0.15; this._applyScale(); }
        else if (this.fps > 29 && this.qualityScale < 1) { this.qualityScale = Math.min(1, this.qualityScale + 0.1); this._applyScale(); }
      }
    }

    // animated wall at ~12fps
    this._wallClock += dt;
    if (this._wallClock > 0.08) { this.set.paint(time); this._wallClock = 0; }

    this.presenter.applyPlacement(state.presenter);
    this.rig.punch = state.camera.punch;
    this.rig.drift = state.camera.drift;
    this.rig.moveDuration = state.camera.moveDuration;
    this.rig.tick(dt, time / 1000, state.presenter.x);
    this.presenter.tick(this.rig.camera);

    this.renderer.render(this.scene, this.rig.camera);
  }
}
