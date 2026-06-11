// Virtual camera rig: six studio angles from one physical camera.
// Anchor-based framing keeps the presenter composed in every shot; MOVE
// transitions dolly the virtual camera through the set, CUT switches hard.
// Honest by design: this is virtual-set parallax + reframing, not true
// multi-camera footage of the person.
import * as THREE from 'three';
import { state } from '../state.js';

export const ANGLES = [
  { num: 1, name: 'Wide',     pos: [0, 1.85, 8.4],      look: [0, 1.55, -0.8], fov: 42, anchor: 0.25 },
  { num: 2, name: 'Centre',   pos: [0, 1.52, 3.45],     look: [0, 1.42, 0],    fov: 30, anchor: 1.0 },
  { num: 3, name: 'Left wall', pos: [-3.0, 1.62, 4.2],  look: [-0.1, 1.42, 0], fov: 34, anchor: 0.8 },
  { num: 4, name: 'Right wall', pos: [3.0, 1.62, 4.2],  look: [0.1, 1.42, 0],  fov: 34, anchor: 0.8 },
  { num: 5, name: '2-shot',   pos: [-4.0, 1.9, 5.4],    look: [0.9, 1.7, -2.4], fov: 44, anchor: 0.45 },
  { num: 6, name: 'Close up', pos: [0.35, 1.5, 2.35],   look: [0, 1.48, 0],    fov: 22, anchor: 1.0 }
];

export function allAngles() {
  return [...ANGLES, ...(state.camera.customAngles || [])];
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this.active = 1;
    this.punch = 0;        // 0..40 (%)
    this.fovScale = 1;     // focal-length control from the inspector
    this.drift = false;
    this.driftAmount = 1;  // parallax/drift strength
    this.moveDuration = 1.2;
    this.followX = null;   // AutoFrame: smoothed person-centre target
    this.followY = 0;      // AutoFrame: headroom correction (look-target lift)
    this.autoPunch = null; // AutoFrame: shot-size punch target

    this._cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this._from = null;
    this._to = null;
    this._t = 1;
    this._applyAngle(ANGLES[0], this._cur, 0);
  }

  _applyAngle(a, out, presenterX) {
    out.pos.set(a.pos[0], a.pos[1], a.pos[2]);
    // anchor-based reframing: tight shots track the presenter fully,
    // wides barely — framing always lands composed.
    out.look.set(a.look[0] + presenterX * a.anchor, a.look[1], a.look[2]);
    out.fov = a.fov;
  }

  switchTo(num, mode, presenterX) {
    const a = allAngles().find((x) => x.num === num) || ANGLES[0];
    this.active = num;
    if (mode === 'move') {
      this._from = { pos: this._cur.pos.clone(), look: this._cur.look.clone(), fov: this._cur.fov };
      this._to = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 0 };
      this._applyAngle(a, this._to, presenterX);
      this._t = 0;
    } else {
      this._applyAngle(a, this._cur, presenterX);
      this._from = this._to = null;
      this._t = 1;
    }
  }

  /** True while a MOVE transition is in flight. */
  get moving() { return this._t < 1; }

  tick(dt, time, presenterX) {
    // AutoFrame: glide framing toward the tracked person centre
    const targetX = this.followX === null ? presenterX : this.followX;
    presenterX = this._smoothX === undefined ? targetX
      : (this._smoothX += (targetX - this._smoothX) * Math.min(dt * 2.2, 1));
    this._smoothX = presenterX;
    if (this._t < 1 && this._to) {
      this._t = Math.min(1, this._t + dt / Math.max(this.moveDuration, 0.1));
      const k = easeInOut(this._t);
      this._cur.pos.lerpVectors(this._from.pos, this._to.pos, k);
      this._cur.look.lerpVectors(this._from.look, this._to.look, k);
      this._cur.fov = this._from.fov + (this._to.fov - this._from.fov) * k;
      if (this._t >= 1) { this._from = this._to = null; }
    } else {
      const a = allAngles().find((x) => x.num === this.active) || ANGLES[0];
      this._applyAngle(a, this._cur, presenterX);
    }

    const p = this._cur.pos, l = this._cur.look;
    let px = p.x, py = p.y, lx = l.x, ly = l.y;
    if (this.drift) {
      const d = this.driftAmount;
      px += (Math.sin(time * 0.31) * 0.025 + Math.sin(time * 0.83) * 0.008) * d;
      py += Math.sin(time * 0.47 + 1.7) * 0.015 * d;
      lx += Math.sin(time * 0.23 + 0.6) * 0.02 * d;
      ly += Math.sin(time * 0.37 + 2.2) * 0.012 * d;
    }
    // AutoFrame headroom: ease the look target vertically
    this._smoothY = (this._smoothY ?? 0) + ((this.followY || 0) - (this._smoothY ?? 0)) * Math.min(dt * 2, 1);
    // AutoFrame shot size: ease punch toward the target
    let punch = this.punch;
    if (this.autoPunch !== null) {
      this._smoothP = (this._smoothP ?? punch) + (this.autoPunch - (this._smoothP ?? punch)) * Math.min(dt * 1.6, 1);
      punch = this._smoothP;
    }
    this.camera.position.set(px, py, p.z);
    this.camera.lookAt(lx, ly + this._smoothY, l.z);
    this.camera.fov = this._cur.fov * (1 - (punch / 100) * 0.5) * this.fovScale;
    this.camera.updateProjectionMatrix();
  }

  /** Pose a throwaway camera at an angle preset (for the CAM-strip thumbnails). */
  poseCamera(camera, num, presenterX) {
    const a = allAngles().find((x) => x.num === num) || ANGLES[0];
    const tmp = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: a.fov };
    this._applyAngle(a, tmp, presenterX);
    camera.position.copy(tmp.pos);
    camera.lookAt(tmp.look);
    camera.fov = tmp.fov * this.fovScale;
    camera.updateProjectionMatrix();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
