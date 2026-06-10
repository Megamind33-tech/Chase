// Procedural virtual news sets. Each set is built from real geometry +
// live animated wall/desk textures driven by the station's branding.
import * as THREE from '/node_modules/three/build/three.module.js';

const WALL_W = 1024, WALL_H = 400;
const DESK_W = 640, DESK_H = 200;

export function buildSet(theme, brand, headline) {
  const group = new THREE.Group();
  group.name = 'set';

  // ---- floor: large glossy slab ----
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshStandardMaterial({
      color: theme.floor, roughness: theme.floorRough, metalness: 0.55
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // subtle floor brand ring under the desk area
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.72, 64),
    new THREE.MeshBasicMaterial({ color: theme.trim, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  group.add(ring);

  // ---- back wall ----
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 7),
    new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.9 })
  );
  back.position.set(0, 3.5, -4.4);
  group.add(back);

  // ---- animated video wall ----
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = WALL_W; wallCanvas.height = WALL_H;
  const wallTexture = new THREE.CanvasTexture(wallCanvas);
  wallTexture.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 3.28),
    new THREE.MeshBasicMaterial({ map: wallTexture, toneMapped: false })
  );
  wall.position.set(0, 2.05, -3.95);
  group.add(wall);

  // wall frame
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#0a0c10', roughness: 0.4, metalness: 0.7,
    emissive: theme.trim, emissiveIntensity: 0.35
  });
  const mkBar = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(x, y, z); group.add(m); return m;
  };
  mkBar(8.7, 0.09, 0.12, 0, 3.74, -3.93);
  mkBar(8.7, 0.09, 0.12, 0, 0.36, -3.93);
  mkBar(0.09, 3.5, 0.12, -4.32, 2.05, -3.93);
  mkBar(0.09, 3.5, 0.12, 4.32, 2.05, -3.93);

  // ---- side wing walls with light strips ----
  const accents = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 6.4),
      new THREE.MeshStandardMaterial({ color: theme.column, roughness: 0.85 })
    );
    wing.position.set(side * 7.6, 3.2, -2.4);
    wing.rotation.y = -side * 0.55;
    group.add(wing);
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 5.4, 0.07),
        new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false })
      );
      strip.position.set(side * (5.6 + i * 0.85), 2.8, -2.9 + i * 0.55);
      strip.rotation.y = -side * 0.5;
      group.add(strip);
      accents.push(strip);
    }
  }

  // ---- columns ----
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 6.0, 24),
      new THREE.MeshStandardMaterial({ color: theme.column, roughness: 0.5, metalness: 0.6 })
    );
    col.position.set(side * 4.9, 3.0, -3.2);
    group.add(col);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.235, 0.235, 5.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.28, toneMapped: false })
    );
    glow.position.copy(col.position);
    group.add(glow);
    accents.push(glow);
  }

  // ---- anchor desk ----
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, 1.05);
  // top
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.06, 0.85),
    new THREE.MeshStandardMaterial({ color: '#0d1016', roughness: 0.2, metalness: 0.7 })
  );
  top.position.y = 1.02;
  deskGroup.add(top);
  // branded front panel (slightly raked)
  const deskCanvas = document.createElement('canvas');
  deskCanvas.width = DESK_W; deskCanvas.height = DESK_H;
  const deskTexture = new THREE.CanvasTexture(deskCanvas);
  deskTexture.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 0.92),
    new THREE.MeshBasicMaterial({ map: deskTexture, toneMapped: false })
  );
  front.position.set(0, 0.52, 0.46);
  front.rotation.x = -0.1;
  deskGroup.add(front);
  // base shadow block
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.95, 0.7),
    new THREE.MeshStandardMaterial({ color: theme.desk, roughness: 0.7 })
  );
  base.position.set(0, 0.5, 0);
  deskGroup.add(base);
  // desk top light edge
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(2.92, 0.022, 0.03),
    new THREE.MeshBasicMaterial({ color: theme.trim, toneMapped: false })
  );
  edge.position.set(0, 1.045, 0.43);
  deskGroup.add(edge);
  group.add(deskGroup);

  // ---- floor accent strips ----
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.025, 0.06),
      new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false, transparent: true, opacity: 0.8 })
    );
    bar.position.set(side * 3.4, 0.013, -1.4);
    bar.rotation.y = side * 0.35;
    group.add(bar);
    accents.push(bar);
  }

  // ---- overhead softboxes (cosmetic) ----
  for (let i = -1; i <= 1; i++) {
    const soft = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.5),
      new THREE.MeshBasicMaterial({ color: '#dfe7f5', transparent: true, opacity: 0.5, toneMapped: false })
    );
    soft.position.set(i * 2.6, 5.4, 0.5);
    soft.rotation.x = Math.PI / 2.4;
    group.add(soft);
  }

  const api = {
    group, accents,
    brand: { ...brand }, headline, theme,
    setBrand(b, hl) { this.brand = { ...b }; if (hl) this.headline = hl; this._deskDirty = true; },
    /** animated wall + desk; call ~12 fps */
    paint(t) {
      paintWall(wallCanvas, theme, this.brand, this.headline, t);
      wallTexture.needsUpdate = true;
      if (this._deskDirty !== false) {
        paintDesk(deskCanvas, theme, this.brand);
        deskTexture.needsUpdate = true;
        this._deskDirty = false;
      }
    }
  };
  api.paint(0);
  return api;
}

// ------------------------------------------------------------------
function paintWall(cv, theme, brand, headline, t) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, shade(theme.wallGlowA, -0.65));
  g.addColorStop(0.55, shade(brand.primary || theme.wallGlowA, -0.35));
  g.addColorStop(1, shade(theme.wallGlowB, -0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const time = t / 1000;
  if (theme.wallStyle === 'tech') {
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // sweeping band
    const bx = ((time * 90) % (W + 500)) - 250;
    const bg = ctx.createLinearGradient(bx - 180, 0, bx + 180, 0);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(bx - 180, 0, 360, H);
  } else if (theme.wallStyle === 'soft') {
    for (let i = 0; i < 4; i++) {
      const cx = W * (0.2 + 0.22 * i) + Math.sin(time * 0.3 + i * 2) * 50;
      const cy = H * 0.5 + Math.cos(time * 0.22 + i) * 40;
      const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 200);
      rg.addColorStop(0, 'rgba(255,210,140,0.10)');
      rg.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // bold diagonal slabs
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.32);
    for (let i = -3; i <= 3; i++) {
      const off = (time * 28 + i * 170) % 510 - 255;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(-W, off, W * 2, 70);
    }
    ctx.restore();
  }

  // brand accent baseline
  ctx.fillStyle = brand.accent || theme.trim;
  ctx.fillRect(0, H - 12, W, 5);

  // headline + station name
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '800 64px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(headline || 'NEWS', 48, H * 0.42);
  ctx.font = '700 26px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText((brand.name || 'CHASE NEWS').toUpperCase(), 50, H * 0.42 + 58);

  // live dot top-right
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
  ctx.fillStyle = `rgba(255,70,70,${0.55 + 0.45 * pulse})`;
  ctx.beginPath(); ctx.arc(W - 130, 46, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('LIVE', W - 108, 47);
}

function paintDesk(cv, theme, brand) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(brand.primary || theme.deskFace, 0.05));
  g.addColorStop(1, shade(brand.primary || theme.deskFace, -0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = brand.accent || theme.trim;
  ctx.fillRect(0, 0, W, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText((brand.name || 'CHASE NEWS').toUpperCase(), W / 2, H / 2 + 4);
  ctx.textAlign = 'left';
}

function shade(hex, amt) {
  // amt -1..1 darken/lighten
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
