// Cinematic procedural set builder. Every set: curved (or flat) LED wall
// with live animated content, real planar-reflection floor, LED towers,
// branded anchor desk, ceiling rig, haze-ready emissive architecture.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const LED_W = 2048, LED_H = 640;
const DESK_W = 768, DESK_H = 224;

export function buildSet(theme, brand, headline, opts = {}) {
  const group = new THREE.Group();
  group.name = 'set';
  const accents = [];

  // ---------- reflective floor ----------
  let reflector = null;
  if (opts.reflections !== false) {
    reflector = new Reflector(new THREE.CircleGeometry(17, 64), {
      textureWidth: 512, textureHeight: 512,
      color: new THREE.Color(theme.floor).multiplyScalar(2.4),
      clipBias: 0.003
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.001;
    group.add(reflector);
  }
  // tinted glass layer over the reflection sets reflection strength
  const floorTint = new THREE.Mesh(
    new THREE.CircleGeometry(17, 64),
    new THREE.MeshStandardMaterial({
      color: theme.floor, roughness: 0.32, metalness: 0.5,
      transparent: true, opacity: reflector ? 1 - theme.floorRefl : 1
    })
  );
  floorTint.rotation.x = -Math.PI / 2;
  floorTint.position.y = 0.001;
  group.add(floorTint);

  // brand ring inlays
  for (const [r0, r1, op] of [[2.7, 2.78, 0.5], [4.6, 4.64, 0.25]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r0, r1, 96),
      new THREE.MeshBasicMaterial({ color: theme.trim, transparent: true, opacity: op, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    group.add(ring);
    accents.push(ring);
  }

  // ---------- environment shell ----------
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(15.5, 15.5, 12, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.95, side: THREE.BackSide })
  );
  shell.position.y = 5.5;
  group.add(shell);
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(15.5, 48),
    new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 7.4;
  group.add(ceiling);

  // ---------- main LED wall (curved) ----------
  const ledCanvas = document.createElement('canvas');
  ledCanvas.width = LED_W; ledCanvas.height = LED_H;
  const ledTexture = new THREE.CanvasTexture(ledCanvas);
  ledTexture.colorSpace = THREE.SRGBColorSpace;
  ledTexture.anisotropy = 4;

  let wall;
  const arc = Math.PI * 0.62;
  const wallMat = new THREE.MeshBasicMaterial({ map: ledTexture, side: THREE.DoubleSide, toneMapped: false });
  if (theme.curved) {
    wall = new THREE.Mesh(
      new THREE.CylinderGeometry(7.6, 7.6, 3.6, 64, 1, true, Math.PI - arc / 2, arc),
      wallMat
    );
    wall.scale.x = -1; // mirror so canvas reads left→right on the concave face
    wall.position.set(0, 2.25, 3.1);
  } else {
    wall = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 3.6), wallMat);
    wall.position.set(0, 2.25, -4.3);
  }
  group.add(wall);

  // LED wall frame ribs — same cylinder math as the wall so they always align
  const ribMat = new THREE.MeshStandardMaterial({
    color: '#05070c', roughness: 0.35, metalness: 0.8,
    emissive: theme.trim, emissiveIntensity: 0.55, side: THREE.DoubleSide
  });
  for (const y of [0.41, 4.09]) {
    const rib = theme.curved
      ? new THREE.Mesh(new THREE.CylinderGeometry(7.66, 7.66, 0.1, 64, 1, true, Math.PI - arc / 2, arc), ribMat)
      : new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.09, 0.1), ribMat);
    rib.position.set(0, y, theme.curved ? 3.1 : -4.28);
    group.add(rib);
  }

  // ---------- LED towers (vertical light columns) ----------
  const towerCanvas = document.createElement('canvas');
  towerCanvas.width = 128; towerCanvas.height = 1024;
  const towerTexture = new THREE.CanvasTexture(towerCanvas);
  towerTexture.colorSpace = THREE.SRGBColorSpace;
  const towers = theme.towers || 3;
  for (let i = 0; i < towers; i++) {
    for (const side of [-1, 1]) {
      const x = side * (5.4 + i * 1.35);
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 5.6, 0.22),
        new THREE.MeshBasicMaterial({ map: towerTexture, toneMapped: false })
      );
      tower.position.set(x, 2.8, -1.5 + i * 0.9);
      tower.rotation.y = -side * 0.5;
      group.add(tower);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 5.7, 0.1),
        new THREE.MeshStandardMaterial({ color: '#05070c', metalness: 0.8, roughness: 0.4 })
      );
      cap.position.set(x, 2.8, tower.position.z - 0.13 * side * 0); // behind panel
      cap.position.z -= 0.08;
      cap.rotation.y = tower.rotation.y;
      group.add(cap);
    }
  }

  // ---------- ceiling rig ----------
  if (theme.truss) {
    const trussMat = new THREE.MeshStandardMaterial({ color: '#181c24', metalness: 0.85, roughness: 0.45 });
    for (const z of [-2.2, 0.6, 3.0]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 0.16, 0.16), trussMat);
      beam.position.set(0, 6.0, z);
      group.add(beam);
      for (let x = -5; x <= 5; x += 2.5) {
        const head = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.14, 0.3, 10),
          new THREE.MeshStandardMaterial({ color: '#0a0c10', metalness: 0.7, roughness: 0.4, emissive: theme.accent, emissiveIntensity: 1.4 })
        );
        head.position.set(x, 5.8, z);
        head.rotation.x = 0.5;
        group.add(head);
        accents.push(head);
      }
    }
  } else {
    // halo light ring
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(4.4, 0.05, 8, 80),
      new THREE.MeshBasicMaterial({ color: theme.trim, transparent: true, opacity: 0.85, toneMapped: false })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 5.9;
    group.add(halo);
    accents.push(halo);
    const halo2 = halo.clone();
    halo2.scale.setScalar(1.45);
    halo2.material = halo.material.clone();
    halo2.material.opacity = 0.3;
    halo2.position.y = 6.4;
    group.add(halo2);
    accents.push(halo2);
  }

  // church arches
  if (theme.archs) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const arch = new THREE.Mesh(
          new THREE.TorusGeometry(1.5 - i * 0.12, 0.05, 8, 40, Math.PI),
          new THREE.MeshBasicMaterial({ color: theme.warm, transparent: true, opacity: 0.6 - i * 0.15, toneMapped: false })
        );
        arch.position.set(side * (5.8 + i * 0.5), 1.7, -1.8 + i * 0.6);
        arch.rotation.y = -side * 0.6;
        group.add(arch);
        accents.push(arch);
      }
    }
  }

  // ---------- anchor desk ----------
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, 1.15);
  const deskCanvas = document.createElement('canvas');
  deskCanvas.width = DESK_W; deskCanvas.height = DESK_H;
  const deskTexture = new THREE.CanvasTexture(deskCanvas);
  deskTexture.colorSpace = THREE.SRGBColorSpace;

  // curved branded front
  const front = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.78, 0.94, 48, 1, true, Math.PI * 1.28, Math.PI * 0.44),
    new THREE.MeshBasicMaterial({ map: deskTexture, side: THREE.BackSide, toneMapped: false })
  );
  front.scale.x = -1;
  front.position.y = 0.51;
  deskGroup.add(front);
  // glass top
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.82, 1.82, 0.05, 48, 1, false, Math.PI * 1.24, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({ color: '#0c1018', roughness: 0.12, metalness: 0.8 })
  );
  top.position.y = 1.0;
  deskGroup.add(top);
  // under-desk glow
  const deskGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 0.035, 48, 1, true, Math.PI * 1.26, Math.PI * 0.48),
    new THREE.MeshBasicMaterial({ color: theme.trim, transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false })
  );
  deskGlow.position.y = 0.06;
  deskGroup.add(deskGlow);
  const deskEdge = deskGlow.clone();
  deskEdge.material = deskGlow.material.clone();
  deskEdge.position.y = 1.035;
  deskGroup.add(deskEdge);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.68, 0.92, 32),
    new THREE.MeshStandardMaterial({ color: theme.desk, roughness: 0.55, metalness: 0.35 })
  );
  body.position.y = 0.5;
  deskGroup.add(body);
  // recessed glass inlay on the desktop
  const inlay = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.18, 0.022, 40, 1, false, Math.PI * 1.3, Math.PI * 0.4),
    new THREE.MeshStandardMaterial({ color: '#0a1a30', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.92 })
  );
  inlay.position.y = 1.032;
  deskGroup.add(inlay);
  // brushed metal kick ring at the base
  const kick = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.74, 0.1, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: '#3a4456', metalness: 0.95, roughness: 0.3, side: THREE.DoubleSide })
  );
  kick.position.y = 0.05;
  deskGroup.add(kick);
  // soft contact shadow under the desk
  const shCv = document.createElement('canvas');
  shCv.width = shCv.height = 128;
  const shCtx = shCv.getContext('2d');
  const shG = shCtx.createRadialGradient(64, 64, 18, 64, 64, 64);
  shG.addColorStop(0, 'rgba(0,0,0,0.5)');
  shG.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = shG;
  shCtx.fillRect(0, 0, 128, 128);
  const deskShadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 32),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCv), transparent: true, depthWrite: false })
  );
  deskShadow.rotation.x = -Math.PI / 2;
  deskShadow.position.y = 0.012;
  deskGroup.add(deskShadow);
  group.add(deskGroup);

  // ---------- floor accent chevrons ----------
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.02, 0.07),
      new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.85, toneMapped: false })
    );
    bar.position.set(side * 3.6, 0.012, -0.9);
    bar.rotation.y = side * 0.42;
    group.add(bar);
    accents.push(bar);
  }

  // ---------- live paint API ----------
  const api = {
    group, accents, reflector, theme,
    brand: { ...brand }, headline,
    deskGlowMat: deskGlow.material,
    setBrand(b, hl) { this.brand = { ...b }; if (hl) this.headline = hl; this._deskDirty = true; },
    setDeskGlow(v) {
      deskGlow.material.opacity = 0.95 * v;
      deskEdge.material.opacity = 0.95 * v;
    },
    setFloorReflection(v) { floorTint.material.opacity = reflector ? 1 - v : 1; },
    /** LED media override: { url, type } or null to return to the loop */
    setLedMedia(media) {
      if (this._ledVideo) { this._ledVideo.pause(); this._ledVideo.remove(); this._ledVideo = null; }
      this._ledImage = null;
      if (!media) { wall.material.map = ledTexture; wall.material.needsUpdate = true; return; }
      if (media.type === 'video') {
        const v = document.createElement('video');
        v.src = media.url; v.loop = true; v.muted = true; v.play().catch(() => {});
        this._ledVideo = v;
        const t = new THREE.VideoTexture(v);
        t.colorSpace = THREE.SRGBColorSpace;
        wall.material.map = t;
      } else {
        new THREE.TextureLoader().load(media.url, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          wall.material.map = t; wall.material.needsUpdate = true;
        });
      }
      wall.material.needsUpdate = true;
    },
    paint(t) {
      if (!this._ledVideo && !this._ledImage && wall.material.map === ledTexture) {
        paintLed(ledCanvas, theme, this.brand, this.headline, t);
        ledTexture.needsUpdate = true;
      }
      paintTower(towerCanvas, theme, t);
      towerTexture.needsUpdate = true;
      if (this._deskDirty !== false) {
        paintDesk(deskCanvas, theme, this.brand);
        deskTexture.needsUpdate = true;
        this._deskDirty = false;
      }
    },
    dispose() {
      if (this._ledVideo) { this._ledVideo.pause(); this._ledVideo.remove(); }
      group.traverse((o) => { o.geometry?.dispose(); });
      reflector?.dispose?.();
    }
  };
  api.paint(0);
  return api;
}

/* ================= LED CONTENT PAINTERS ================= */

function paintLed(cv, theme, brand, headline, t) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const time = t / 1000;

  // base sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky);
  g.addColorStop(0.72, mix(theme.ledA, theme.sky, 0.25));
  g.addColorStop(1, theme.ledA);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const painters = { skyline, election, rays, neon, stadium, beams, panels };
  (painters[theme.ledStyle] || skyline)(ctx, W, H, theme, time);

  // unified branded chyron band on the LED wall
  const bandY = H - 86;
  const bg = ctx.createLinearGradient(0, bandY, 0, H);
  bg.addColorStop(0, 'rgba(2,4,10,0.0)');
  bg.addColorStop(0.35, 'rgba(2,4,10,0.72)');
  bg.addColorStop(1, 'rgba(2,4,10,0.9)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, bandY - 30, W, 116);
  ctx.fillStyle = brand.accent || theme.trim;
  ctx.fillRect(0, bandY - 4, W, 3);
  ctx.textBaseline = 'middle';
  ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(headline || 'CHASE NEWS', 70, bandY + 44);
  ctx.font = '700 26px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const name = (brand.name || 'CHASE NEWS').toUpperCase();
  ctx.fillText(name, W - 90 - ctx.measureText(name).width, bandY + 44);
  // pulsing live dot
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
  ctx.fillStyle = `rgba(255,64,64,${0.5 + 0.5 * pulse})`;
  ctx.beginPath(); ctx.arc(W - 50, bandY + 44, 10, 0, Math.PI * 2); ctx.fill();
}

function skyline(ctx, W, H, theme, time) {
  // faint stars high in the sky only
  for (let i = 0; i < 70; i++) {
    const x = (i * 397.3) % W, y = ((i * 211.7) % (H * 0.3));
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(time * 0.6 + i));
    ctx.globalAlpha = tw * 0.35;
    ctx.fillStyle = 'rgba(220,232,255,0.9)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  const horizon = H * 0.66;
  // atmospheric haze band at the horizon (photographic depth)
  const atm = ctx.createLinearGradient(0, horizon - 140, 0, horizon + 30);
  atm.addColorStop(0, 'rgba(0,0,0,0)');
  atm.addColorStop(1, hexA(theme.ledB, 0.28));
  ctx.fillStyle = atm;
  ctx.fillRect(0, 0, W, horizon + 30);

  // skyline: 4 depth layers, back layers hazed into the sky
  for (let layer = 0; layer < 4; layer++) {
    const base = horizon + layer * H * 0.075;
    const haze = 0.62 - layer * 0.19; // back layers fade toward sky colour
    const col = mix(mix(theme.ledA, '#02040c', 0.35 + layer * 0.18), theme.ledB, Math.max(haze, 0) * 0.5);
    let x = -30;
    let i = layer * 37;
    while (x < W + 60) {
      const bw = 26 + ((i * 73) % 70) - layer * 3;
      const bh = H * (0.1 + (((i * 47) % 100) / 100) * (0.34 - layer * 0.06));
      ctx.fillStyle = col;
      ctx.fillRect(x, base - bh, bw, bh + 160);
      // rooftop detail + aviation beacons on tall front towers
      if (layer >= 2) {
        ctx.fillRect(x + bw * 0.3, base - bh - 7, bw * 0.4, 7);
        if (bh > H * 0.3 && (i % 4) === 0) {
          const blink = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.6 + i));
          ctx.fillStyle = `rgba(255,70,70,${blink})`;
          ctx.beginPath(); ctx.arc(x + bw / 2, base - bh - 9, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      // dense small windows, warm/cool mix, front layers only
      if (layer === 3) {
        for (let wy = base - bh + 8; wy < base - 10; wy += 9) {
          for (let wx = x + 4; wx < x + bw - 5; wx += 7) {
            const h2 = (wx * 13 + wy * 7 + i) % 31;
            if (h2 < 9) {
              ctx.fillStyle = h2 < 3 ? 'rgba(180,210,255,0.55)' : 'rgba(255,206,130,0.5)';
              ctx.fillRect(wx, wy, 3, 4.5);
            }
          }
        }
      }
      x += bw + 3 + (layer < 2 ? 0 : 4);
      i++;
    }
  }

  // waterfront reflection strip below the front layer
  const wy0 = horizon + H * 0.225;
  const wat = ctx.createLinearGradient(0, wy0, 0, H);
  wat.addColorStop(0, hexA(theme.ledB, 0.22));
  wat.addColorStop(1, 'rgba(2,4,10,0.9)');
  ctx.fillStyle = wat;
  ctx.fillRect(0, wy0, W, H - wy0);
  for (let i = 0; i < 60; i++) {
    const x = (i * 167) % W;
    const shimmer = Math.abs(Math.sin(time * 0.9 + i * 2.1));
    ctx.fillStyle = `rgba(${i % 2 ? '255,206,130' : '160,200,255'},${0.10 + shimmer * 0.12})`;
    ctx.fillRect(x, wy0 + (i * 31) % (H - wy0 - 6), 22 + (i % 3) * 14, 1.6);
  }

  // gentle moving cloud band catching city light
  const cx = (time * 14) % (W + 800) - 400;
  const cg = ctx.createRadialGradient(cx, H * 0.18, 20, cx, H * 0.18, 320);
  cg.addColorStop(0, hexA(theme.ledB, 0.10));
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, W, H * 0.5);
}

function election(ctx, W, H, theme, time) {
  // split red/blue field
  const half = W / 2;
  for (const [x0, col] of [[0, theme.ledA], [half, theme.ledB]]) {
    const gg = ctx.createLinearGradient(x0, 0, x0 + half, H);
    gg.addColorStop(0, mix(col, '#000', 0.5));
    gg.addColorStop(1, mix(col, '#000', 0.15));
    ctx.fillStyle = gg;
    ctx.fillRect(x0, 0, half, H);
  }
  // diagonal divider
  ctx.save();
  ctx.translate(W / 2, 0);
  ctx.rotate(0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-6, -40, 12, H + 80);
  ctx.restore();
  // animated result bars
  for (let i = 0; i < 5; i++) {
    const y = 70 + i * 88;
    const a = 0.32 + 0.3 * Math.abs(Math.sin(time * 0.22 + i * 1.7));
    const b = 0.3 + 0.32 * Math.abs(Math.cos(time * 0.19 + i));
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(60, y, half - 200, 30);
    ctx.fillRect(half + 140, y, half - 200, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(60, y, (half - 200) * a, 30);
    ctx.fillRect(half + 140, y, (half - 200) * b, 30);
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(Math.round(a * 100) + '%', half - 130, y + 15);
    ctx.fillText(Math.round(b * 100) + '%', W - 130, y + 15);
  }
}

function rays(ctx, W, H, theme, time) {
  // golden god-rays from a central glow
  const cx = W / 2, cy = H * 0.32;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + time * 0.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const rg = ctx.createLinearGradient(0, 0, W * 0.7, 0);
    rg.addColorStop(0, hexA(theme.ledB, 0.22));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, -14, W * 0.7, 28);
    ctx.restore();
  }
  const core = ctx.createRadialGradient(cx, cy, 5, cx, cy, 320);
  core.addColorStop(0, 'rgba(255,238,200,0.95)');
  core.addColorStop(0.25, hexA(theme.ledB, 0.65));
  core.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, W, H);
  // gentle particles rising
  ctx.fillStyle = 'rgba(255,230,170,0.6)';
  for (let i = 0; i < 50; i++) {
    const x = (i * 211) % W;
    const y = H - ((time * 22 + i * 47) % (H + 60));
    ctx.globalAlpha = 0.15 + 0.35 * Math.abs(Math.sin(i + time));
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function neon(ctx, W, H, theme, time) {
  // brick wall
  ctx.fillStyle = '#16100e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  for (let y = 0; y < H; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = (y / 42) % 2 ? 0 : 45; x < W; x += 90) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 42); ctx.stroke();
    }
  }
  // window of city at right
  const wg = ctx.createLinearGradient(W * 0.72, 0, W, H);
  wg.addColorStop(0, '#0a1428');
  wg.addColorStop(1, '#1c2c50');
  ctx.fillStyle = wg;
  ctx.fillRect(W * 0.74, H * 0.12, W * 0.2, H * 0.6);
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 8;
  ctx.strokeRect(W * 0.74, H * 0.12, W * 0.2, H * 0.6);
  // neon sign
  const flick = Math.random() > 0.04 ? 1 : 0.55;
  ctx.shadowBlur = 38;
  ctx.shadowColor = theme.trim;
  ctx.strokeStyle = hexA(theme.trim, 0.95 * flick);
  ctx.lineWidth = 6;
  ctx.font = '700 130px "Segoe UI", system-ui, sans-serif';
  ctx.strokeText('ON AIR', W * 0.08, H * 0.36);
  ctx.shadowColor = theme.accent;
  ctx.strokeStyle = hexA(theme.accent, 0.9);
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.06, H * 0.16, 560, 170);
  ctx.shadowBlur = 0;
  // shelf glow strips
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = hexA(i % 2 ? theme.accent : theme.trim, 0.7);
    ctx.fillRect(W * 0.1, H * (0.62 + i * 0.1), 420, 5);
  }
}

function stadium(ctx, W, H, theme, time) {
  // crowd bokeh upper half
  for (let i = 0; i < 240; i++) {
    const x = (i * 137.51) % W;
    const y = (i * 89.3) % (H * 0.45);
    const fl = 0.18 + 0.5 * Math.abs(Math.sin(time * (1 + (i % 5) * 0.4) + i));
    ctx.fillStyle = `rgba(${180 + (i % 60)},${190 + (i % 50)},255,${fl * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // stand structure line
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, H * 0.45, W, 12);
  // pitch
  const pg = ctx.createLinearGradient(0, H * 0.46, 0, H);
  pg.addColorStop(0, mix(theme.ledB, '#000', 0.35));
  pg.addColorStop(1, mix(theme.ledA, '#000', 0.1));
  ctx.fillStyle = pg;
  ctx.fillRect(0, H * 0.46, W, H);
  // mow stripes + halo lines
  for (let i = 0; i < 12; i++) {
    if (i % 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect((i / 12) * W, H * 0.46, W / 12, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.78, 240, 90, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, H * 0.46); ctx.lineTo(W / 2, H); ctx.stroke();
  // floodlight flares
  for (const fx of [W * 0.12, W * 0.88]) {
    const fg = ctx.createRadialGradient(fx, H * 0.08, 4, fx, H * 0.08, 180);
    fg.addColorStop(0, 'rgba(255,255,255,0.9)');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H * 0.4);
  }
}

function beams(ctx, W, H, theme, time) {
  // dark haze base
  ctx.fillStyle = mix(theme.sky, '#000', 0.3);
  ctx.fillRect(0, 0, W, H);
  // sweeping concert beams
  for (let i = 0; i < 9; i++) {
    const cx = (i + 0.5) * (W / 9);
    const sway = Math.sin(time * 0.9 + i * 1.3) * 0.55;
    ctx.save();
    ctx.translate(cx, -20);
    ctx.rotate(sway);
    const col = i % 2 ? theme.ledB : theme.trim;
    const bg = ctx.createLinearGradient(0, 0, 0, H * 1.4);
    bg.addColorStop(0, hexA(col, 0.85));
    bg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.lineTo(60, H * 1.4); ctx.lineTo(-60, H * 1.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // strobe wash
  const strobe = Math.sin(time * 3.2) > 0.92 ? 0.18 : 0;
  if (strobe) { ctx.fillStyle = `rgba(255,255,255,${strobe})`; ctx.fillRect(0, 0, W, H); }
  // crowd silhouettes
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  for (let i = 0; i < 60; i++) {
    const x = (i * 67) % W;
    const bounce = Math.abs(Math.sin(time * 2 + i)) * 14;
    ctx.beginPath(); ctx.arc(x, H - 26 - bounce, 16, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 16, H - 26 - bounce, 32, 60);
  }
}

function panels(ctx, W, H, theme, time) {
  // clean staggered panels
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const x = (i / cols) * W;
    const ph = H * (0.5 + 0.35 * Math.abs(Math.sin(i * 1.8)));
    const sh = Math.sin(time * 0.4 + i) * 14;
    const pg = ctx.createLinearGradient(x, 0, x + W / cols, ph);
    pg.addColorStop(0, mix(theme.ledB, '#000', 0.25 + (i % 3) * 0.18));
    pg.addColorStop(1, mix(theme.ledA, '#000', 0.15));
    ctx.fillStyle = pg;
    ctx.fillRect(x + 5, 24 + sh, W / cols - 10, ph);
    ctx.fillStyle = hexA(theme.trim, 0.65);
    ctx.fillRect(x + 5, 24 + sh + ph, W / cols - 10, 4);
  }
  // big typography
  ctx.font = '800 170px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillText('LEARN · EXPLAIN · INSPIRE', 40, H * 0.5);
}

function paintTower(cv, theme, t) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const shift = (Math.sin(t / 1400) + 1) / 2;
  g.addColorStop(0, mix(theme.ledB, theme.ledA, shift));
  g.addColorStop(1, mix(theme.ledA, '#000', 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // segment lines
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = 0; y < H; y += 52) ctx.fillRect(0, y, W, 5);
  // travelling bright cell
  const y = ((t / 12) % (H + 200)) - 100;
  const cg = ctx.createLinearGradient(0, y - 70, 0, y + 70);
  cg.addColorStop(0, 'rgba(255,255,255,0)');
  cg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  cg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, y - 70, W, 140);
}

function paintDesk(cv, theme, brand) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix(brand.primary || theme.deskFace, '#fff', 0.08));
  g.addColorStop(1, mix(brand.primary || theme.deskFace, '#000', 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // carbon texture lines
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < W; x += 9) ctx.fillRect(x, 0, 4, H);
  ctx.fillStyle = brand.accent || theme.trim;
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 64px "Segoe UI", system-ui, sans-serif';
  ctx.fillText((brand.name || 'CHASE NEWS').toUpperCase(), W / 2, H / 2 + 6);
  ctx.textAlign = 'left';
}

/* ---------------- colour helpers ---------------- */
function hexA(hex, a) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(hexX, hexY, k) {
  const p = (h) => {
    const c = h.replace('#', '');
    const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hexX), b = p(hexY);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}
