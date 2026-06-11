// Studio engine orchestrator: WebGL renderer + post stack (bloom/vignette),
// active set, presenter, light rig, 6-angle virtual cameras, droppable
// objects, picking, CAM-strip thumbnails, auto quality scaling.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // photographic response
    this.renderer.toneMappingExposure = 1.5;
    this.qualityScale = 1;
    this.renderer.setSize(outWidth, outHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#04060a');

    this.rig = new CameraRig(outWidth / outHeight);
    this.lights = new LightRig(this.scene);
    this.presenter = new Presenter(videoEl);
    this.scene.add(this.presenter.group);

    // remote guest slot: a second keyed presenter fed by a video file
    this.guestVideo = document.createElement('video');
    this.guestVideo.loop = true;
    this.guestVideo.muted = true;
    this.guestVideo.playsInline = true;
    this.guest = new Presenter(this.guestVideo);
    this.guest.group.visible = false;
    this.scene.add(this.guest.group);

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

    // ---------- BUILDER mode: orbit design camera + transform gizmo ----------
    this.builder = false;
    this.builderView = 'orbit';   // 'orbit' | '2d' | cam number
    this.orbit = { theta: 0.6, phi: 1.15, radius: 9, target: new THREE.Vector3(0, 1.1, 0) };
    this.designCamera = new THREE.PerspectiveCamera(45, outWidth / outHeight, 0.1, 100);
    this.planCamera = new THREE.OrthographicCamera(-9, 9, 9 * outHeight / outWidth, -9 * outHeight / outWidth, 0.1, 60);
    this.planCamera.position.set(0, 25, 0.01);
    this.planCamera.lookAt(0, 0, 0);
    this.grid = new THREE.GridHelper(16, 32, 0x2277ff, 0x1a2438);
    this.grid.position.y = 0.005;
    this.grid.visible = false;
    this.scene.add(this.grid);

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

  /** HDRI environment for image-based studio relighting (PBR surfaces). */
  setEnvironment(envTexture) {
    this.scene.environment = envTexture || null;
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
  addObject(kind, x = 2.4, z = 0.4, existing = null, prebuilt = null) {
    const def = SETS[state.setId] || SETS.apex;
    const group = buildProp(kind, def.theme, state.brand, existing?.media || null, prebuilt);
    const id = existing?.id || nextObjectId();
    group.userData.id = id;
    group.userData.kind = kind;
    const data = existing || { id, kind, x, z, rotY: 0, scale: 1, height: 0, opacity: 1, media: null, visible: true };
    if (kind === 'callout' && !existing) { data.billboard = true; data.avoidPresenter = true; }
    this.objectsRoot.add(group);
    this.objects.set(id, group);
    if (data.media && group.userData.setMedia) group.userData.setMedia(data.media.url, data.media.type);
    if (group.userData.setShadow) group.userData.setShadow(data.shadow ?? 0.55);
    if (group.userData.arFields && data.arFields) Object.assign(group.userData.arFields, data.arFields);
    if (kind === 'model' && data.matOverrides) {
      const prev = group.userData.onReady;
      group.userData.onReady = (g2) => { prev?.(g2); this.applyAllMatOverrides(data, this.brandFactory || null); };
    }
    if (!existing) state.objects.push(data);
    this.syncObject(data);
    return data;
  }

  // ---------- atmosphere FX ----------
  /** Drifting dust motes in the light field — filmic depth, near-free. */
  _initDust() {
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = 0.3 + Math.random() * 3.4;
      pos[i * 3 + 2] = -3.5 + Math.random() * 5.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#9fb4d0', size: 0.012, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    this.dust.userData._noPick = true;
    this.scene.add(this.dust);
  }

  /** One-shot confetti burst above the set (Celebration FX macro). */
  confettiBurst() {
    this._disposeConfetti();
    const N = 420;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const idx = new Uint16Array(N * 6);
    const palette = [new THREE.Color(state.brand.primary), new THREE.Color(state.brand.accent),
      new THREE.Color('#f2f2f2'), new THREE.Color('#3aa86b'), new THREE.Color('#d92b38')];
    this._confP = new Float32Array(N * 3);   // flake centres
    this._confVel = new Float32Array(N * 3);
    this._confRot = new Float32Array(N * 2); // phase, speed
    for (let i = 0; i < N; i++) {
      this._confP[i * 3] = (Math.random() - 0.5) * 6;
      this._confP[i * 3 + 1] = 2.6 + Math.random() * 0.8;
      this._confP[i * 3 + 2] = -2 + Math.random() * 3.6;
      this._confVel[i * 3] = (Math.random() - 0.5) * 0.5;
      this._confVel[i * 3 + 1] = -(0.15 + Math.random() * 0.35);
      this._confVel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
      this._confRot[i * 2] = Math.random() * Math.PI * 2;
      this._confRot[i * 2 + 1] = 3 + Math.random() * 7;
      const c = palette[i % palette.length];
      for (let v = 0; v < 4; v++) {
        col[(i * 4 + v) * 3] = c.r;
        col[(i * 4 + v) * 3 + 1] = c.g;
        col[(i * 4 + v) * 3 + 2] = c.b;
      }
      idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
      idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 2; idx[i * 6 + 5] = i * 4 + 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.confetti = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1, toneMapped: false
    }));
    this.confetti.frustumCulled = false;
    this.confetti.userData._noPick = true;
    this._confT = 0;
    this._writeConfetti(); // valid geometry before first render
    this.scene.add(this.confetti);
  }

  /** Recompute the 4 corners of every tumbling flake from its centre. */
  _writeConfetti() {
    const p = this.confetti.geometry.attributes.position.array;
    const n = this._confP.length / 3;
    const hw = 0.042, hh = 0.055;
    for (let i = 0; i < n; i++) {
      const cx = this._confP[i * 3], cy = this._confP[i * 3 + 1], cz = this._confP[i * 3 + 2];
      const a = this._confRot[i * 2] + this._confT * this._confRot[i * 2 + 1];
      const ca = Math.cos(a), sa = Math.sin(a);
      const tilt = Math.sin(a * 0.7) * 0.9; // paper tumble: width collapses as it flips
      const ux = ca * hw, uy = sa * hw * tilt;            // width axis
      const vx = -sa * hh * tilt, vy = ca * hh;           // height axis
      const o = i * 12;
      p[o] = cx - ux - vx; p[o + 1] = cy - uy - vy; p[o + 2] = cz;
      p[o + 3] = cx + ux - vx; p[o + 4] = cy + uy - vy; p[o + 5] = cz;
      p[o + 6] = cx + ux + vx; p[o + 7] = cy + uy + vy; p[o + 8] = cz;
      p[o + 9] = cx - ux + vx; p[o + 10] = cy - uy + vy; p[o + 11] = cz;
    }
    this.confetti.geometry.attributes.position.needsUpdate = true;
  }

  _disposeConfetti() {
    if (!this.confetti) return;
    this.scene.remove(this.confetti);
    this.confetti.geometry.dispose();
    this.confetti.material.dispose();
    this.confetti = null;
  }

  _tickFx(dt, time) {
    if (!this.dust) this._initDust();
    this.dust.visible = this.qualityScale >= 0.7;
    if (this.dust.visible) {
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + Math.sin(time / 4000 + i) * 0.0006 - dt * 0.018;
        if (y < 0.2) y = 3.7;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.cos(time / 5000 + i * 1.7) * 0.0008);
      }
      p.needsUpdate = true;
    }
    if (this.confetti) {
      this._confT += dt;
      const n = this._confP.length / 3;
      for (let i = 0; i < n; i++) {
        // gravity with drag -> paper flutter, not a brick drop
        this._confVel[i * 3 + 1] = Math.max(-0.85, this._confVel[i * 3 + 1] - dt * 0.7);
        const sway = Math.sin(this._confT * 5 + i * 1.3) * 0.25;
        this._confP[i * 3] += (this._confVel[i * 3] + sway) * dt;
        this._confP[i * 3 + 1] = Math.max(0.02, this._confP[i * 3 + 1] + this._confVel[i * 3 + 1] * dt);
        this._confP[i * 3 + 2] += this._confVel[i * 3 + 2] * dt;
      }
      this._writeConfetti();
      this.confetti.material.opacity = Math.min(1, Math.max(0, 1.15 - this._confT / 5.5));
      if (this._confT > 6.4) this._disposeConfetti();
    }
  }

  /** Feed the guest slot from a live MediaStream (platform feed / capture). */
  setGuestStream(stream) {
    if (this._guestStream) {
      for (const t of this._guestStream.getTracks()) t.stop();
    }
    this._guestStream = stream || null;
    if (!stream) this.guestVideo.srcObject = null;
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

  // ---------- imported-asset material customization ----------
  canvasToTexture(cv) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    return t;
  }

  /** Unique editable materials of an imported model. */
  getMaterials(id) {
    const g = this.objects.get(id);
    if (!g) return [];
    const seen = new Map();
    g.traverse((o) => {
      if (!o.isMesh || o.userData._noPick) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && !seen.has(m)) seen.set(m, { ref: m, name: m.name || 'Material ' + (seen.size + 1) });
      }
    });
    return [...seen.values()];
  }

  /** Apply one saved override { color, roughness, metalness, emissive, eInt, brand:{text}, textureUrl } */
  applyMatOverride(id, index, ov, brandTexFactory) {
    const mats = this.getMaterials(id);
    const m = mats[index]?.ref;
    if (!m) return;
    if (ov.color) m.color?.set(ov.color);
    if (ov.roughness !== undefined && 'roughness' in m) m.roughness = ov.roughness;
    if (ov.metalness !== undefined && 'metalness' in m) m.metalness = ov.metalness;
    if (ov.emissive && m.emissive) {
      m.emissive.set(ov.emissive);
      m.emissiveIntensity = ov.eInt ?? 1;
    }
    if (ov.brand && brandTexFactory) {
      m.map = brandTexFactory(ov.brand.text);
      m.color?.set('#ffffff');
    } else if (ov.textureUrl) {
      new THREE.TextureLoader().load(ov.textureUrl, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        m.map = t;
        m.needsUpdate = true;
      });
    }
    m.needsUpdate = true;
  }

  applyAllMatOverrides(data, brandTexFactory) {
    if (!data.matOverrides) return;
    for (const [idx, ov] of Object.entries(data.matOverrides)) {
      this.applyMatOverride(data.id, Number(idx), ov, brandTexFactory);
    }
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
    this.rig.setAspect(w / h);
    this.designCamera.aspect = w / h;
    this.designCamera.updateProjectionMatrix();
    this._applyScale();
  }

  // ---------- BUILDER mode ----------
  /** Lazy-create the transform gizmo bound to the visible program canvas. */
  initGizmo(domElement) {
    if (this.gizmo) return;
    this.gizmo = new TransformControls(this.designCamera, domElement);
    this.gizmo.setSize(0.85);
    this.scene.add(this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo);
    this.gizmo.enabled = false;
  }

  setBuilder(on) {
    this.builder = on;
    this.grid.visible = on;
    if (this.gizmo) {
      this.gizmo.enabled = on;
      if (!on) this.gizmo.detach();
    }
  }

  setBuilderView(view) {
    this.builderView = view;
    if (this.gizmo) {
      this.gizmo.camera = view === '2d' ? this.planCamera : this.designCamera;
    }
  }

  attachGizmo(id) {
    if (!this.gizmo) return;
    const g = id ? this.objects.get(id) : null;
    if (g) this.gizmo.attach(g);
    else this.gizmo.detach();
  }

  /** Read the gizmo'd transform back into the object's saved data. */
  commitGizmo(data) {
    const g = this.objects.get(data.id);
    if (!g) return;
    data.x = Math.round(g.position.x * 100) / 100;
    data.z = Math.round(g.position.z * 100) / 100;
    data.height = Math.max(0, Math.round(g.position.y * 100) / 100);
    data.rotY = Math.round(THREE.MathUtils.radToDeg(g.rotation.y));
    data.scale = Math.round(Math.max(g.scale.x, 0.1) * 100) / 100;
    this.syncObject(data);
  }

  orbitRotate(dx, dy) {
    this.orbit.theta -= dx * 0.005;
    this.orbit.phi = THREE.MathUtils.clamp(this.orbit.phi - dy * 0.005, 0.15, 1.5);
  }
  orbitZoom(delta) {
    this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius * (delta > 0 ? 1.1 : 0.9), 2.5, 22);
  }
  orbitPan(dx, dy) {
    const t = this.orbit.target;
    t.x = THREE.MathUtils.clamp(t.x - dx * 0.01 * Math.cos(this.orbit.theta), -8, 8);
    t.z = THREE.MathUtils.clamp(t.z + dx * 0.01 * Math.sin(this.orbit.theta) - dy * 0.01, -5, 8);
  }

  _updateDesignCamera() {
    const o = this.orbit;
    this.designCamera.position.set(
      o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.radius * Math.cos(o.phi),
      o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta)
    );
    this.designCamera.lookAt(o.target);
    this.designCamera.aspect = this.width / this.height;
    this.designCamera.updateProjectionMatrix();
  }

  /** The camera the program canvas currently renders through. */
  activeCamera() {
    if (!this.builder) return this.rig.camera;
    if (this.builderView === '2d') return this.planCamera;
    if (typeof this.builderView === 'number') {
      this.rig.poseCamera(this.thumbCamera, this.builderView, state.presenter.x);
      this.thumbCamera.aspect = this.width / this.height;
      this.thumbCamera.updateProjectionMatrix();
      return this.thumbCamera;
    }
    this._updateDesignCamera();
    return this.designCamera;
  }

  /** Current design view as an angle preset (ADD CAMERA in the builder). */
  captureAngle() {
    this._updateDesignCamera();
    const p = this.designCamera.position;
    const t = this.orbit.target;
    return { pos: [+(p.x.toFixed(2)), +(p.y.toFixed(2)), +(p.z.toFixed(2))],
             look: [+(t.x.toFixed(2)), +(t.y.toFixed(2)), +(t.z.toFixed(2))],
             fov: 42, anchor: 0.4 };
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

    // imported model animations + AR data panel repaints (change-detected)
    this._arClock = (this._arClock || 0) + dt;
    const repaintDue = this._arClock > 0.5;
    if (repaintDue) this._arClock = 0;
    for (const [, g] of this.objects) {
      g.userData.mixer?.update(dt);
      if (repaintDue) g.userData.repaint?.();
      const data = state.objects.find((o) => o.id === g.userData.id);
      if (!data) continue;
      // billboard mode: yaw toward the active camera (yaw only — stays upright)
      if (data.billboard) {
        const cp = this.rig.camera.position;
        g.rotation.y = Math.atan2(cp.x - g.position.x, cp.z - g.position.z);
      }
      // presenter-safe distance: visual offset only, never rewrites data.x
      if (data.avoidPresenter) {
        const minGap = 1.15;
        const dx = data.x - state.presenter.x;
        let want = 0;
        if (Math.abs(dx) < minGap) want = (dx >= 0 ? minGap : -minGap) - dx;
        g.userData._avoid = (g.userData._avoid || 0) + (want - (g.userData._avoid || 0)) * Math.min(1, dt * 4);
        g.position.x = data.x + g.userData._avoid;
      }
    }

    // animated LED surfaces at ~12fps
    this._wallClock += dt;
    if (this._wallClock > 0.08) { this.set.paint(time); this._wallClock = 0; }

    // atmosphere FX: dust motes + active confetti
    this._tickFx(dt, time);

    this.presenter.applyPlacement(state.presenter);

    // AutoFrame v2: centre, headroom and shot size from the live mask
    if (state.camera.autoFrame && this.segBounds?.cx !== undefined) {
      const b = this.segBounds;
      const scale = state.presenter.scale || 1;
      const planeW = this.presenter.planeH * 16 / 9 * scale;
      let cx = state.presenter.x + (b.cx - 0.5) * planeW;
      // two-person: frame the midpoint between talent and guest, hold wide
      const gst = state.talent?.guest;
      const twoShot = gst?.on && gst.media;
      if (twoShot) cx = (cx + gst.x) / 2;
      this.rig.followX = cx;
      // headroom: keep mask top ~8% under the frame top (gentle correction)
      this.rig.followY = (0.08 - b.top) * 1.2;
      // shot size: punch toward a target body-height fraction
      const SHOTS = { cu: 1.25, ms: 0.85, fs: 0.55 };
      const want = SHOTS[state.camera.shot];
      if (want && !twoShot && b.height > 0.05) {
        const err = want - b.height;          // >0 → punch in, <0 → widen
        const current = this.rig._smoothP ?? state.camera.punch;
        this.rig.autoPunch = Math.max(0, Math.min(40, current + err * 28));
      } else if (twoShot) {
        this.rig.autoPunch = 0;               // always wide for the 2-shot
      } else {
        this.rig.autoPunch = null;            // 'auto': operator's punch
      }
    } else {
      this.rig.followX = null;
      this.rig.followY = 0;
      this.rig.autoPunch = null;
    }

    // guest slot — file loop, or a live platform feed (captured window)
    const gst = state.talent?.guest;
    if (gst?.on && (gst.media || this._guestStream)) {
      if (this._guestStream) {
        if (this.guestVideo.srcObject !== this._guestStream) {
          this.guestVideo.srcObject = this._guestStream;
          this.guestVideo.play().catch(() => {});
        }
      } else if (this.guestVideo.src !== gst.media.url) {
        this.guestVideo.srcObject = null;
        this.guestVideo.src = gst.media.url;
        this.guestVideo.play().catch(() => {});
      }
      this.guest.group.visible = true;
      this.guest.applyPlacement(gst);
      this.guest.applyChroma(state.chroma);
      this.guest.applyEnhance(state.enhance, this.lights.grade);
      // platform feeds are not chroma sources — show them framed
      this.guest.setMode(this._guestStream ? 'framed' : 'chroma');
      this.guest.tick(this.rig.camera);
    } else {
      this.guest.group.visible = false;
      if (this.guestVideo.src || this.guestVideo.srcObject) { this.guestVideo.pause(); }
    }
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

    const cam = this.activeCamera();
    if (this.postEnabled && !this.builder) {
      this.vignettePass.uniforms.strength.value = state.look?.vignette ?? 0.5;
      this.bloomPass.strength = state.look?.bloom ?? 0.55;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, cam);
    }
  }
}
