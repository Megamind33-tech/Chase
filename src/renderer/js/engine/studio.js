// Studio engine orchestrator: WebGL renderer + post stack (bloom/vignette),
// active set, presenter, light rig, 6-angle virtual cameras, droppable
// objects, picking, CAM-strip thumbnails, auto quality scaling.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildSet } from './sets.js';
import { buildProp } from './props.js';
import { Presenter } from './presenter.js';
import { CameraRig, ANGLES } from './cameras.js';
import { LightRig } from './lighting.js';
import { SETS, PRESETS, LIGHT_MOODS } from '../templates.js';
import { state, nextObjectId } from '../state.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.55 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.42, 0.95, d) * strength;
      gl_FragColor = c;
    }`
};

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
    this.scene.background = new THREE.Color('#04060a');

    this.rig = new CameraRig(outWidth / outHeight);
    this.lights = new LightRig(this.scene);
    this.presenter = new Presenter(videoEl);
    this.scene.add(this.presenter.group);

    // post stack: bloom makes LED walls and trims genuinely glow
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.rig.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(outWidth / 2, outHeight / 2), 0.55, 0.7, 0.82);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(this.outputPass);
    this.postEnabled = true;

    this.objects = new Map(); // id -> THREE.Group
    this.objectsRoot = new THREE.Group();
    this.scene.add(this.objectsRoot);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // selection ring shown under the picked object
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.56, 48),
      new THREE.MeshBasicMaterial({ color: '#00c7ff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    // CAM-strip thumbnails: tiny renders from each preset, round-robin
    this.thumbCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    this.thumbCanvases = new Map(); // num -> {canvas, ctx}
    this._thumbIdx = 0;
    this._thumbClock = 0;

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
      this.set.dispose?.();
    }
    const def = SETS[setId] || SETS.apex;
    const headline = PRESETS[state.meta.preset]?.headline || state.brand.name || 'CHASE NEWS';
    this.set = buildSet(def.theme, state.brand, headline, { reflections: this.qualityScale > 0.6 });
    this.scene.add(this.set.group);
    const mood = LIGHT_MOODS[state.lighting.preset];
    this.scene.fog = new THREE.FogExp2(def.theme.fog, 0.022 * (mood?.haze ?? state.lighting.haze ?? 0.5));
    state.setId = setId;
    this.lights.apply(state.lighting, def.theme);
    this.set.setDeskGlow(state.lighting.deskGlow ?? 1);
    this.set.setFloorReflection(state.look?.floorReflection ?? def.theme.floorRefl);
    if (state.look?.ledMedia) this.set.setLedMedia(state.look.ledMedia);
  }

  applyHaze() {
    const def = SETS[state.setId] || SETS.apex;
    this.scene.fog = new THREE.FogExp2(def.theme.fog, 0.022 * (state.lighting.haze ?? 0.5));
  }

  refreshBrand() {
    const headline = PRESETS[state.meta.preset]?.headline;
    this.set.setBrand(state.brand, headline);
  }

  // ---------- objects ----------
  addObject(kind, x = 2.4, z = 0.4, existing = null) {
    const def = SETS[state.setId] || SETS.apex;
    const group = buildProp(kind, def.theme, state.brand, existing?.media || null);
    const id = existing?.id || nextObjectId();
    group.userData.id = id;
    group.userData.kind = kind;
    const data = existing || { id, kind, x, z, rotY: 0, scale: 1, height: 0, opacity: 1, media: null, visible: true };
    this.objectsRoot.add(group);
    this.objects.set(id, group);
    if (data.media && group.userData.setMedia) group.userData.setMedia(data.media.url, data.media.type);
    if (group.userData.setShadow) group.userData.setShadow(data.shadow ?? 0.55);
    if (!existing) state.objects.push(data);
    this.syncObject(data);
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
    if (this.selRing.visible && this.selRing.userData?.id === data.id) {
      this.selRing.position.set(data.x, 0.02, data.z);
    }
    g.position.set(data.x, data.height || 0, data.z);
    g.rotation.y = (data.rotY || 0) * Math.PI / 180;
    g.scale.setScalar(data.scale || 1);
    g.visible = data.visible !== false;
    if (g.userData.setShadow) g.userData.setShadow(data.shadow ?? 0.55);
    const op = data.opacity ?? 1;
    g.traverse((m) => {
      if (m.material && !m.userData._opacityBase) m.userData._opacityBase = m.material.opacity ?? 1;
      if (m.material) {
        m.material.transparent = m.material.transparent || op < 1;
        m.material.opacity = (m.userData._opacityBase ?? 1) * op;
      }
    });
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
      if (h.object.userData._noPick) continue;
      let o = h.object;
      while (o && !o.userData.id) o = o.parent;
      if (o?.userData.id) return o.userData.id;
    }
    return null;
  }

  floorPoint(canvasX, canvasY) {
    this.raycaster.setFromCamera(this._ndc(canvasX, canvasY), this.rig.camera);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, pt)) {
      pt.x = THREE.MathUtils.clamp(pt.x, -7.5, 7.5);
      pt.z = THREE.MathUtils.clamp(pt.z, -3.5, 6.5);
      return pt;
    }
    return null;
  }

  setSelectionGlow(id) {
    const sel = id ? this.objects.get(id) : null;
    this.selRing.visible = !!sel;
    if (sel) {
      const data = state.objects.find((o) => o.id === id);
      const r = 0.6 * (data?.scale || 1);
      this.selRing.scale.setScalar(r / 0.5);
      this.selRing.position.set(sel.position.x, 0.02, sel.position.z);
      this.selRing.userData.id = id;
    }
    for (const [oid, g] of this.objects) {
      const on = oid === id;
      g.traverse((m) => {
        if (m.material && 'emissiveIntensity' in m.material) {
          if (m.userData._baseEmissive === undefined) m.userData._baseEmissive = m.material.emissiveIntensity;
          m.material.emissiveIntensity = on ? m.userData._baseEmissive + 0.4 : m.userData._baseEmissive;
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
    const w = Math.round(this.width * this.qualityScale);
    const h = Math.round(this.height * this.qualityScale);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.postEnabled = this.qualityScale >= 0.7; // bloom off on weak machines
    this.rig.setAspect(this.width / this.height);
  }

  setOutputSize(w, h) {
    this.width = w; this.height = h;
    this._applyScale();
  }

  // ---------- CAM strip thumbnails ----------
  registerThumb(num, canvas) {
    this.thumbCanvases.set(num, { canvas, ctx: canvas.getContext('2d') });
  }

  _renderThumb() {
    if (!this.thumbCanvases.size) return;
    const nums = [...this.thumbCanvases.keys()];
    const num = nums[this._thumbIdx % nums.length];
    this._thumbIdx++;
    const entry = this.thumbCanvases.get(num);
    this.thumbCamera.aspect = 16 / 9;
    this.rig.poseCamera(this.thumbCamera, num, state.presenter.x);
    // render small directly with the main renderer into a corner viewport
    const prevW = this.renderer.domElement.width, prevH = this.renderer.domElement.height;
    this.renderer.setViewport(0, 0, entry.canvas.width, entry.canvas.height);
    this.renderer.setScissor(0, 0, entry.canvas.width, entry.canvas.height);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, this.thumbCamera);
    entry.ctx.drawImage(this.renderer.domElement,
      0, prevH - entry.canvas.height, entry.canvas.width, entry.canvas.height,
      0, 0, entry.canvas.width, entry.canvas.height);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, prevW, prevH);
  }

  /** One-off beauty render of a set theme for the asset browser (returns dataURL). */
  async snapshotSet(setId, w = 320, h = 180) {
    const prevSet = state.setId;
    const prevVisible = this.presenter.group.visible;
    this.presenter.group.visible = false;
    this.loadSet(setId);
    this.set.paint(performance.now());
    this.rig.poseCamera(this.thumbCamera, 1, 0);
    const target = new THREE.WebGLRenderTarget(w, h);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.thumbCamera);
    const px = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
    this.renderer.setRenderTarget(null);
    target.dispose();
    // flip Y into a canvas
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    this.presenter.group.visible = prevVisible;
    this.loadSet(prevSet);
    return cv.toDataURL('image/jpeg', 0.85);
  }

  // ---------- frame ----------
  tick(time, dt) {
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

    // imported model animations
    for (const [, g] of this.objects) g.userData.mixer?.update(dt);

    // animated LED surfaces at ~12fps
    this._wallClock += dt;
    if (this._wallClock > 0.08) { this.set.paint(time); this._wallClock = 0; }

    this.presenter.applyPlacement(state.presenter);
    this.rig.punch = state.camera.punch;
    this.rig.fovScale = state.camera.fovScale ?? 1;
    this.rig.drift = state.camera.drift;
    this.rig.driftAmount = state.camera.driftAmount ?? 1;
    this.rig.moveDuration = state.camera.moveDuration;
    this.rig.tick(dt, time / 1000, state.presenter.x);
    this.presenter.tick(this.rig.camera);

    // one CAM thumbnail per ~0.5s, round-robin (cheap) — BEFORE the program
    // render so the corner scissor pass never leaks into the output frame
    this._thumbClock += dt;
    if (this._thumbClock > 0.5) {
      this._thumbClock = 0;
      this._renderThumb();
    }

    if (this.postEnabled) {
      this.vignettePass.uniforms.strength.value = state.look?.vignette ?? 0.5;
      this.bloomPass.strength = state.look?.bloom ?? 0.55;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.rig.camera);
    }
  }
}
