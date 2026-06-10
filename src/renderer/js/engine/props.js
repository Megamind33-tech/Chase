// Drag-and-drop studio props + imported 3D models (GLB/GLTF). Every prop
// is a Group with userData: { kind, id, setMedia?, setShadow }, carrying a
// soft contact shadow so objects sit on the floor instead of floating.
import * as THREE from 'three';


export function buildProp(kind, theme, brand, media, prebuilt) {
  let g;
  switch (kind) {
    case 'screen': g = screenProp(theme, brand, 1.7); break;
    case 'monitor': g = screenProp(theme, brand, 0.9); break;
    case 'panel': g = panelProp(theme, brand); break;
    case 'plinth': g = plinthProp(theme); break;
    case 'lightbar': g = lightbarProp(theme, brand); break;
    case 'plant': g = plantProp(); break;
    case 'model': g = modelProp(media, prebuilt); break;
    default: g = plinthProp(theme);
  }
  addContactShadow(g, kind === 'lightbar' ? 0 : 0.55);
  return g;
}

// soft radial contact shadow under every object (AR floor-contact rule)
function addContactShadow(g, strength) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const rg = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  rg.addColorStop(0, 'rgba(0,0,0,0.6)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, 128, 128);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: strength
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.userData._noPick = true;
  g.add(shadow);
  g.userData.setShadow = (v) => { mat.opacity = v; shadow.visible = v > 0.02; };
}

// Imported broadcast 3D asset (GLB/GLTF): loaded async, auto-normalised to
// studio scale, grounded on the floor plane.
function normaliseModel(g, model, ph, clips) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(1.5 / maxDim);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
  model.position.x -= (box2.min.x + box2.max.x) / 2;
  model.position.z -= (box2.min.z + box2.max.z) / 2;
  if (ph) g.remove(ph);
  g.add(model);
  g.userData.loading = false;
  if (clips?.length) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clips[0]).play();
    g.userData.mixer = mixer;
  }
}

function modelProp(media, prebuilt) {
  const g = new THREE.Group();
  // lightweight placeholder pedestal while the model loads
  const ph = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: '#1a2438', roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.5 })
  );
  ph.position.y = 0.3;
  g.add(ph);
  g.userData.loading = true;
  if (prebuilt) {
    normaliseModel(g, prebuilt, ph, prebuilt.userData._clips);
  } else if (media?.url) {
    // project reload: run the file back through the ingestion pipeline
    import('../ingest.js').then(({ ingestModel }) =>
      ingestModel(media).then((report) => {
        if (report.object) normaliseModel(g, report.object, ph, report.object.userData._clips);
        else { ph.material.color.set('#5c2229'); ph.material.opacity = 0.8; g.userData.loading = false; }
      })
    ).catch(() => { ph.material.color.set('#5c2229'); g.userData.loading = false; });
  }
  return g;
}

// Premium LED media zone: dark-blue panel, pixel grid, media-safe lines,
// glowing edge — never a flat green block.
function slateTexture(brand, label) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 288;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#08111f');
  g.addColorStop(0.5, '#0c1a32');
  g.addColorStop(1, '#081120');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 288);
  // LED pixel grid
  ctx.strokeStyle = 'rgba(80,140,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 512; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 288); ctx.stroke(); }
  for (let y = 0; y <= 288; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  // media-safe guides
  ctx.strokeStyle = 'rgba(120,180,255,0.22)';
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(26, 15, 512 - 52, 288 - 30);
  ctx.setLineDash([]);
  // corner handles
  ctx.strokeStyle = 'rgba(0,199,255,0.85)';
  ctx.lineWidth = 3;
  for (const [cx, cy] of [[26, 15], [486, 15], [26, 273], [486, 273]]) {
    ctx.beginPath();
    ctx.moveTo(cx + (cx < 256 ? 14 : -14), cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + (cy < 144 ? 14 : -14));
    ctx.stroke();
  }
  // glowing border
  ctx.strokeStyle = 'rgba(34,119,255,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 284);
  // centre media glyph + copy
  ctx.strokeStyle = 'rgba(160,200,255,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(226, 96, 60, 44);
  ctx.beginPath();
  ctx.moveTo(246, 108); ctx.lineTo(246, 128); ctx.lineTo(264, 118); ctx.closePath();
  ctx.fillStyle = 'rgba(160,200,255,0.7)';
  ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(210,228,255,0.85)';
  ctx.fillText('DROP VIDEO · IMAGE · LIVE FEED', 256, 172);
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(140,170,210,0.55)';
  ctx.fillText((brand.name || 'CHASE').toUpperCase() + ' · MEDIA ZONE', 256, 196);
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
    new THREE.MeshStandardMaterial({
      color: '#0b0d12', roughness: 0.35, metalness: 0.7,
      emissive: theme.trim || '#2277ff', emissiveIntensity: 0.25
    })
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
