// Drag-and-drop studio props. Every prop is a Group with userData:
// { kind, id, baseHeight } and an optional setMedia(url, type) hook.
import * as THREE from 'three';

export function buildProp(kind, theme, brand) {
  switch (kind) {
    case 'screen': return screenProp(theme, brand, 1.7);
    case 'monitor': return screenProp(theme, brand, 0.9);
    case 'panel': return panelProp(theme, brand);
    case 'plinth': return plinthProp(theme);
    case 'lightbar': return lightbarProp(theme, brand);
    case 'plant': return plantProp();
    default: return plinthProp(theme);
  }
}

function slateTexture(brand, label) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 288;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#101622');
  g.addColorStop(1, '#1b2536');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = brand.accent || '#e8b220';
  ctx.fillRect(0, 258, 512, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '800 36px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((brand.name || 'CHASE').toUpperCase(), 256, 124);
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(label, 256, 168);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function screenProp(theme, brand, width) {
  const g = new THREE.Group();
  const h = width * 9 / 16;
  const cy = width > 1.2 ? 1.45 : 1.1;

  const screenMat = new THREE.MeshBasicMaterial({ map: slateTexture(brand, 'DROP MEDIA HERE'), toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, h), screenMat);
  screen.position.y = cy;
  g.add(screen);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.07, h + 0.07, 0.05),
    new THREE.MeshStandardMaterial({ color: '#0b0d12', roughness: 0.35, metalness: 0.7 })
  );
  frame.position.set(0, cy, -0.03);
  g.add(frame);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, cy, 12),
    new THREE.MeshStandardMaterial({ color: '#2a313e', metalness: 0.8, roughness: 0.3 })
  );
  pole.position.y = cy / 2;
  g.add(pole);
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: '#171b24', metalness: 0.6, roughness: 0.4 })
  );
  foot.position.y = 0.02;
  g.add(foot);

  let videoEl = null;
  g.userData.mediaCapable = true;
  g.userData.setMedia = (url, type) => {
    if (videoEl) { videoEl.pause(); videoEl.remove(); videoEl = null; }
    if (!url) { screenMat.map = slateTexture(brand, 'DROP MEDIA HERE'); screenMat.needsUpdate = true; return; }
    if (type === 'video') {
      videoEl = document.createElement('video');
      videoEl.src = url; videoEl.loop = true; videoEl.muted = true; videoEl.play().catch(() => {});
      const tex = new THREE.VideoTexture(videoEl);
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat.map = tex;
    } else {
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        screenMat.map = tex; screenMat.needsUpdate = true;
      });
    }
    screenMat.needsUpdate = true;
  };
  g.userData.dispose = () => { if (videoEl) { videoEl.pause(); videoEl.remove(); } };
  return g;
}

function panelProp(theme, brand) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.0, 0.04),
    new THREE.MeshStandardMaterial({
      color: '#9fb4d8', transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.2
    })
  );
  glass.position.y = 1.05;
  g.add(glass);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1.14, 0.05, 0.06),
    new THREE.MeshBasicMaterial({ color: brand.accent || theme.trim, toneMapped: false })
  );
  glow.position.y = 0.05;
  g.add(glow);
  const top = glow.clone(); top.position.y = 2.06; g.add(top);
  return g;
}

function plinthProp(theme) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.5),
    new THREE.MeshStandardMaterial({ color: theme.column, roughness: 0.45, metalness: 0.5 })
  );
  body.position.y = 0.5;
  g.add(body);
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.025, 0.54),
    new THREE.MeshBasicMaterial({ color: theme.trim, toneMapped: false })
  );
  lip.position.y = 1.0;
  g.add(lip);
  return g;
}

function lightbarProp(theme, brand) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.05, 0.08),
    new THREE.MeshBasicMaterial({ color: brand.primary || theme.accent, toneMapped: false })
  );
  bar.position.y = 0.03;
  g.add(bar);
  const light = new THREE.PointLight(brand.primary || theme.accent, 6, 5, 2);
  light.position.y = 0.4;
  g.add(light);
  return g;
}

function plantProp() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 0.6 })
  );
  pot.position.y = 0.15;
  g.add(pot);
  const leaf = new THREE.MeshStandardMaterial({ color: '#1d4d2b', roughness: 0.8 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7 + (i % 3) * 0.18, 6), leaf);
    blade.position.set(Math.cos(a) * 0.07, 0.62, Math.sin(a) * 0.07);
    blade.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    g.add(blade);
  }
  return g;
}
