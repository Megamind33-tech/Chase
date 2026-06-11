// Studio light rig: 3-point presenter lighting + set accents + desk wash,
// driven by lighting moods. Mood grades feed the presenter shader so the
// camera image matches the room.
import * as THREE from 'three';
import { LIGHT_MOODS } from '../templates.js';

export class LightRig {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#aebcd8', '#0a0c12', 0.5);
    this.key = new THREE.DirectionalLight('#ffffff', 2.2);
    this.key.position.set(2.6, 4.6, 5.2);
    // the key is the single shadow-casting source (broadcast practice:
    // one readable shadow direction, soft edges)
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -6;
    this.key.shadow.camera.right = 6;
    this.key.shadow.camera.top = 6;
    this.key.shadow.camera.bottom = -3;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 18;
    this.key.shadow.bias = -0.0008;
    this.key.shadow.radius = 5;
    this.fill = new THREE.DirectionalLight('#dfe7ff', 0.9);
    this.fill.position.set(-3.2, 3.0, 4.6);
    this.back = new THREE.PointLight('#ffffff', 14, 14, 1.8);
    this.back.position.set(0, 3.6, -2.4);
    this.accentL = new THREE.PointLight('#2f7df6', 10, 11, 2);
    this.accentL.position.set(-5.0, 2.4, -1.2);
    this.accentR = new THREE.PointLight('#2f7df6', 10, 11, 2);
    this.accentR.position.set(5.0, 2.4, -1.2);
    this.desk = new THREE.PointLight('#34c3ff', 5, 5, 2);
    this.desk.position.set(0, 0.5, 2.2);
    scene.add(this.hemi, this.key, this.fill, this.back, this.accentL, this.accentR, this.desk);
    this.grade = { exposure: 1, warmth: 0 };
  }

  /** s = state.lighting; theme provides accent colours */
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
    this.back.color.set(theme?.trim || '#ffffff');
    this.hemi.intensity = 0.32 + 0.25 * s.fill;

    const accent = new THREE.Color(theme?.accent || '#2f7df6');
    this.accentL.color.copy(accent);
    this.accentR.color.copy(new THREE.Color(theme?.trim || theme?.accent || '#2f7df6'));
    this.accentL.intensity = 10 * s.accent;
    this.accentR.intensity = 10 * s.accent;
    this.desk.color.set(theme?.trim || '#34c3ff');
    this.desk.intensity = 5 * (s.deskGlow ?? 1);

    const mood = LIGHT_MOODS[s.preset];
    this.grade = mood ? mood.grade : { exposure: 1, warmth: 0 };
  }
}
