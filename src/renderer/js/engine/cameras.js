// Virtual camera rig: five studio angles from one physical camera.
// Anchor-based framing keeps the presenter composed in every shot; MOVE
// transitions dolly the virtual camera through the set, CUT switches hard.
import * as THREE from '/node_modules/three/build/three.module.js';

export const ANGLES = [
  { num: 1, name: 'Wide',   pos: [0, 1.78, 7.9],   look: [0, 1.5, -1.2],  fov: 40, anchor: 0.25 },
  { num: 2, name: 'Centre', pos: [0, 1.52, 3.35],  look: [0, 1.42, 0],    fov: 30, anchor: 1.0 },
  { num: 3, name: 'Cross L', pos: [-2.75, 1.62, 4.05], look: [-0.1, 1.4, 0], fov: 34, anchor: 0.8 },
  { num: 4, name: 'Cross R', pos: [2.75, 1.62, 4.05],  look: [0.1, 1.4, 0],  fov: 34, anchor: 0.8 },
  { num: 5, name: 'Wall 2-shot', pos: [-3.7, 1.85, 5.1], look: [0.9, 1.65, -2.3], fov: 44, anchor: 0.45 }
];

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this.active = 1;
    this.punch = 0;        // 0..40 (%)
    this.drift = false;
    this.moveDuration = 1.2;

    this._cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this._from = null;
    this._to = null;
    this._t = 1;
    this._applyAngle(ANGLES[0], this._cur, 0);
  }

  _applyAngle(a, out, presenterX) {
    out.pos.set(a.pos[0], a.pos[1], a.pos[2]);
    // anchor-based reframing: the look target tracks the presenter's
    // horizontal position, weighted per angle (tight shots track fully).
    out.look.set(a.look[0] + presenterX * a.anchor, a.look[1], a.look[2]);
    out.fov = a.fov;
  }

  switchTo(num, mode, presenterX) {
    const a = ANGLES.find((x) => x.num === num) || ANGLES[0];
    this.active = num;
    if (mode === 'move') {
      this._from = {
        pos: this._cur.pos.clone(),
        look: this._cur.look.clone(),
        fov: this._cur.fov
      };
      this._to = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 0 };
      this._applyAngle(a, this._to, presenterX);
      this._t = 0;
    } else {
      this._applyAngle(a, this._cur, presenterX);
      this._from = this._to = null;
      this._t = 1;
    }
  }

  tick(dt, time, presenterX) {
    if (this._t < 1 && this._to) {
      this._t = Math.min(1, this._t + dt / Math.max(this.moveDuration, 0.1));
      const k = easeInOut(this._t);
      this._cur.pos.lerpVectors(this._from.pos, this._to.pos, k);
      this._cur.look.lerpVectors(this._from.look, this._to.look, k);
      this._cur.fov = this._from.fov + (this._to.fov - this._from.fov) * k;
      if (this._t >= 1) { this._from = this._to = null; }
    } else {
      // keep anchored framing live while the presenter is repositioned
      const a = ANGLES.find((x) => x.num === this.active) || ANGLES[0];
      this._applyAngle(a, this._cur, presenterX);
    }

    const p = this._cur.pos, l = this._cur.look;
    let px = p.x, py = p.y, pz = p.z, lx = l.x, ly = l.y;
    if (this.drift) {
      // subtle operator drift: slow compound sines, sub-centimetre amplitude
      px += Math.sin(time * 0.31) * 0.025 + Math.sin(time * 0.83) * 0.008;
      py += Math.sin(time * 0.47 + 1.7) * 0.015;
      lx += Math.sin(time * 0.23 + 0.6) * 0.02;
      ly += Math.sin(time * 0.37 + 2.2) * 0.012;
    }
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(lx, ly, l.z);
    this.camera.fov = this._cur.fov * (1 - (this.punch / 100) * 0.5);
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
