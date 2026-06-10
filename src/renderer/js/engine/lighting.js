// Three-point studio light rig + set accents, driven by lighting presets.
import * as THREE from '/node_modules/three/build/three.module.js';
import { LIGHT_PRESETS } from '../templates.js';

export class LightRig {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#aebcd8', '#0a0c12', 0.5);
    this.key = new THREE.DirectionalLight('#ffffff', 2.2);
    this.key.position.set(2.6, 4.6, 4.2);
    this.fill = new THREE.DirectionalLight('#dfe7ff', 0.9);
    this.fill.position.set(-3.2, 3.0, 3.6);
    this.back = new THREE.PointLight('#ffffff', 14, 14, 1.8);
    this.back.position.set(0, 3.4, -2.6);
    this.accentL = new THREE.PointLight('#2f7df6', 10, 10, 2);
    this.accentL.position.set(-4.6, 2.2, -2.4);
    this.accentR = new THREE.PointLight('#2f7df6', 10, 10, 2);
    this.accentR.position.set(4.6, 2.2, -2.4);
    scene.add(this.hemi, this.key, this.fill, this.back, this.accentL, this.accentR);
    this.grade = { exposure: 1, warmth: 0 };
  }

  /** s = state.lighting; theme provides the accent colour */
  apply(s, theme) {
    const warm = new THREE.Color(1, 0.86, 0.7);
    const cool = new THREE.Color(0.74, 0.85, 1);
    const neutral = new THREE.Color(1, 1, 1);
    const tempCol = neutral.clone().lerp(s.temp >= 0 ? warm : cool, Math.abs(s.temp));

    this.key.intensity = 2.2 * s.key;
    this.key.color.copy(tempCol);
    this.fill.intensity = 0.9 * s.fill;
    this.fill.color.copy(tempCol.clone().lerp(new THREE.Color('#dfe7ff'), 0.4));
    this.back.intensity = 14 * s.back;
    this.hemi.intensity = 0.35 + 0.25 * s.fill;
    const accent = new THREE.Color(theme?.accent || '#2f7df6');
    this.accentL.color.copy(accent);
    this.accentR.color.copy(accent);
    this.accentL.intensity = 10 * s.accent;
    this.accentR.intensity = 10 * s.accent;

    const preset = LIGHT_PRESETS[s.preset];
    this.grade = preset ? preset.grade : { exposure: 1, warmth: 0 };
  }
}
