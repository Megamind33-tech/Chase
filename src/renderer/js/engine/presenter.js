// The presenter: live camera video placed inside the 3D set.
// One shader does chroma key, AI-mask cutout, spill suppression and the
// broadcast "image enhancement" grade (exposure / warmth / sat / skin smoothing).
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D map;
uniform sampler2D maskMap;
uniform float keyEnabled;
uniform float maskEnabled;
uniform vec3 keyColor;
uniform float similarity;
uniform float smoothness;
uniform float spill;
uniform float exposure;
uniform float warmth;
uniform float saturation;
uniform float smoothing;
uniform float eyeBright;
uniform float erode;
uniform float wrapStrength;
uniform vec3 wrapColor;
uniform float matteView;
uniform vec2 texel;
varying vec2 vUv;

vec2 rgb2uv(vec3 c) {
  return vec2(
    c.r * -0.169 + c.g * -0.331 + c.b *  0.500 + 0.5,
    c.r *  0.500 + c.g * -0.419 + c.b * -0.081 + 0.5);
}

void main() {
  vec4 c = texture2D(map, vUv);
  float alpha = 1.0;

  if (keyEnabled > 0.5) {
    float d = distance(rgb2uv(c.rgb), rgb2uv(keyColor));
    alpha = smoothstep(similarity, similarity + max(smoothness, 0.001), d);
    // spill suppression: pull keyed hue towards neutral near the edge
    float edge = 1.0 - smoothstep(similarity, similarity + smoothness + 0.12, d);
    float grey = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(c.rgb, vec3(grey), edge * spill);
  }
  if (maskEnabled > 0.5) {
    alpha *= texture2D(maskMap, vUv).r;
  }

  // matte cleanup: choke the soft edge band inward (kills dirty fringes)
  if (erode > 0.01) {
    alpha = smoothstep(erode * 0.45, 1.0, alpha);
  }

  if (matteView > 0.5) {
    gl_FragColor = vec4(vec3(alpha), 1.0);
    return;
  }

  // skin smoothing: light box blur restricted to mid-tones
  if (smoothing > 0.01) {
    vec3 blur = vec3(0.0);
    for (int i = -2; i <= 2; i++)
      for (int j = -2; j <= 2; j++)
        blur += texture2D(map, vUv + vec2(float(i), float(j)) * texel * 1.6).rgb;
    blur /= 25.0;
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float mid = smoothstep(0.12, 0.32, luma) * (1.0 - smoothstep(0.72, 0.95, luma));
    c.rgb = mix(c.rgb, blur, smoothing * mid * 0.85);
  }

  c.rgb *= exposure;
  c.rgb += vec3(warmth * 0.085, warmth * 0.02, -warmth * 0.09);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(l), c.rgb, saturation);

  // eye light: lift only the brightest highlights (catchlights, sclera)
  if (eyeBright > 0.01) {
    float hi = smoothstep(0.62, 0.92, l);
    c.rgb += hi * eyeBright * 0.35;
  }

  // studio light wrap: tint the semi-transparent edge band with the
  // set's light colour so the person sits inside the room's light
  if (wrapStrength > 0.01) {
    float band = clamp(alpha * (1.0 - alpha) * 4.0, 0.0, 1.0);
    c.rgb = mix(c.rgb, wrapColor, band * wrapStrength * 0.65);
  }

  if (alpha < 0.02) discard;
  gl_FragColor = vec4(c.rgb, alpha);
}`;

export class Presenter {
  constructor(videoEl) {
    this.group = new THREE.Group();
    this.group.name = 'presenter';
    this.mode = 'chroma';

    this.texture = new THREE.VideoTexture(videoEl);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.blankMask = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.blankMask.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide, // visible in the reflective floor
      uniforms: {
        map: { value: this.texture },
        maskMap: { value: this.blankMask },
        keyEnabled: { value: 1 },
        maskEnabled: { value: 0 },
        keyColor: { value: new THREE.Color('#1eb955') },
        similarity: { value: 0.30 },
        smoothness: { value: 0.08 },
        spill: { value: 0.6 },
        exposure: { value: 1 },
        warmth: { value: 0 },
        saturation: { value: 1 },
        smoothing: { value: 0 },
        eyeBright: { value: 0 },
        erode: { value: 0 },
        wrapStrength: { value: 0 },
        wrapColor: { value: new THREE.Color('#34c3ff') },
        matteView: { value: 0 },
        texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }
      }
    });

    // 16:9 video plane — with key/mask only the person remains visible.
    this.planeH = 2.45;
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.planeH * 16 / 9, this.planeH),
      this.material
    );
    this.plane.position.y = this.planeH / 2 - 0.12; // feet just behind desk line
    this.group.add(this.plane);

    // frame for "framed window" mode
    this.frame = new THREE.Mesh(
      new THREE.BoxGeometry(this.planeH * 16 / 9 + 0.1, this.planeH + 0.1, 0.06),
      new THREE.MeshStandardMaterial({ color: '#0b0d12', metalness: 0.7, roughness: 0.3 })
    );
    this.frame.position.set(0, this.plane.position.y, -0.04);
    this.frame.visible = false;
    this.group.add(this.frame);

    // soft contact shadow
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const rg = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 128, 128);
    const shTex = new THREE.CanvasTexture(cv);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.0),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.group.add(this.shadow);
  }

  /** chroma | ai | framed */
  setMode(mode) {
    this.mode = mode;
    const u = this.material.uniforms;
    u.keyEnabled.value = mode === 'chroma' ? 1 : 0;
    u.maskEnabled.value = mode === 'ai' ? 1 : 0;
    this.frame.visible = mode === 'framed';
    this.shadow.visible = mode !== 'framed';
    if (mode === 'framed') {
      // a framed panel reads better slightly smaller and lifted clear of the desk
      this.plane.scale.setScalar(0.78);
      this.frame.scale.setScalar(0.78);
      this.plane.position.y = 1.62;
      this.frame.position.y = 1.62;
    } else {
      this.plane.scale.setScalar(1);
      this.plane.position.y = this.planeH / 2 - 0.12;
      this.frame.position.y = this.planeH / 2 - 0.12;
    }
  }

  setMaskTexture(tex) {
    this.material.uniforms.maskMap.value = tex || this.blankMask;
  }

  applyChroma(c) {
    const u = this.material.uniforms;
    u.keyColor.value.set(c.color);
    u.similarity.value = c.similarity;
    u.smoothness.value = c.smoothness;
    u.spill.value = c.spill;
  }

  /** enhance: user grade; lightGrade: lighting-preset matching offsets */
  applyEnhance(e, lightGrade) {
    const u = this.material.uniforms;
    const lg = lightGrade || { exposure: 1, warmth: 0 };
    u.exposure.value = e.exposure * lg.exposure;
    u.warmth.value = e.warmth + lg.warmth;
    u.saturation.value = e.saturation;
    u.smoothing.value = e.smoothing;
    u.eyeBright.value = e.eyes || 0;
    u.erode.value = e.erode || 0;
    u.wrapStrength.value = e.wrap || 0;
  }

  setWrapColor(hex) {
    this.material.uniforms.wrapColor.value.set(hex);
  }

  setMatteView(on) {
    this.material.uniforms.matteView.value = on ? 1 : 0;
  }

  applyPlacement(p) {
    this.group.position.x = p.x;
    this.group.position.y = p.y;
    const s = p.scale;
    this.group.scale.setScalar(s);
  }

  setVideoSize(w, h) {
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  /** Yaw-billboard towards the active camera so the flat plane never shows edge-on. */
  tick(camera) {
    const dx = camera.position.x - this.group.position.x;
    const dz = camera.position.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);
  }
}
