// Universal asset ingestion pipeline.
// Loads 3D files (GLB/GLTF/FBX/OBJ) and HDRI environments in a sandbox,
// analyses them (geometry, textures, memory, animations), converts
// materials to Chase-safe PBR, auto-compresses oversized textures, and
// only then releases the asset to the studio. Heavy assets are flagged
// or blocked with clear instructions — never a crash, never a grey blob.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SCREEN_NAME_RE } from './engine/props.js';

export const BUDGET = {
  triWarn: 200_000,     // above: RENDER HEAVY warning, not live-safe by default
  triBlock: 900_000,    // above: blocked with conversion instructions
  texMax: 2048,         // textures above this edge are auto-compressed
  texBlock: 8192,       // absurd textures: blocked
  memWarnMB: 350
};

/** Load + analyse a model file without touching the live scene. */
export async function ingestModel(media) {
  const ext = (media.path || media.url).split('.').pop().toLowerCase();
  const report = {
    name: media.name, path: media.path, url: media.url, ext,
    source: { glb: 'GLB export', gltf: 'GLTF export', fbx: 'FBX export (Unreal/Unity/Maya/C4D)', obj: 'OBJ export' }[ext] || 'Model import',
    tris: 0, meshes: 0, materials: 0, textures: 0, maxTex: 0, screens: 0,
    animations: 0, skinned: false, sizeM: 0, memMB: 0,
    warnings: [], converted: 0, compressed: 0,
    status: 'ok', liveSafe: true, object: null
  };

  let root;
  try {
    if (ext === 'glb' || ext === 'gltf') {
      const gltf = await new GLTFLoader().loadAsync(media.url);
      root = gltf.scene;
      report.animations = gltf.animations?.length || 0;
      root.userData._clips = gltf.animations || [];
    } else if (ext === 'fbx') {
      root = await new FBXLoader().loadAsync(media.url);
      report.animations = root.animations?.length || 0;
      root.userData._clips = root.animations || [];
    } else if (ext === 'obj') {
      root = await new OBJLoader().loadAsync(media.url);
    } else {
      report.status = 'blocked';
      report.warnings.push('Unsupported model format ".' + ext + '". Export to GLB, GLTF, FBX or OBJ from your 3D tool.');
      return report;
    }
  } catch (e) {
    report.status = 'blocked';
    report.warnings.push('File could not be parsed (' + (e.message || 'unknown error') + '). Re-export from the source application — GLB is the most reliable.');
    return report;
  }

  // ---- analyse ----
  const texSet = new Set();
  const matSet = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      report.meshes++;
      if (o.isSkinnedMesh) report.skinned = true;
      const mats0 = Array.isArray(o.material) ? o.material : [o.material];
      if (SCREEN_NAME_RE.test(o.name + ' ' + mats0.map((m) => m?.name || '').join(' '))) report.screens++;
      const g = o.geometry;
      if (g) {
        const idx = g.index ? g.index.count : g.attributes.position?.count || 0;
        report.tris += Math.round(idx / 3);
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        matSet.add(m);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
          const t = m[key];
          if (t?.image) {
            texSet.add(t);
            report.maxTex = Math.max(report.maxTex, t.image.width || 0, t.image.height || 0);
          }
        }
      }
    }
  });
  report.materials = matSet.size;
  report.textures = texSet.size;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  report.sizeM = +(Math.max(size.x, size.y, size.z)).toFixed(2);
  let texBytes = 0;
  for (const t of texSet) texBytes += (t.image.width || 512) * (t.image.height || 512) * 4 * 1.33;
  report.memMB = Math.round((report.tris * 3 * 32 + texBytes) / 1048576);

  // ---- validate ----
  if (report.maxTex > BUDGET.texBlock) {
    report.status = 'blocked';
    report.warnings.push(`Texture ${report.maxTex}px exceeds the ${BUDGET.texBlock}px hard limit. Resize textures and re-export.`);
    return report;
  }
  if (report.tris > BUDGET.triBlock) {
    report.status = 'blocked';
    report.warnings.push(`${report.tris.toLocaleString()} triangles exceeds the live budget (${BUDGET.triBlock.toLocaleString()}). Decimate the mesh in Blender (Modifier → Decimate) and re-export as GLB.`);
    return report;
  }
  if (report.tris > BUDGET.triWarn) {
    report.liveSafe = false;
    report.warnings.push(`RENDER HEAVY: ${report.tris.toLocaleString()} triangles. Imported, but marked not live-safe — expect FPS cost on budget machines.`);
  }
  if (report.memMB > BUDGET.memWarnMB) {
    report.liveSafe = false;
    report.warnings.push(`Estimated GPU memory ${report.memMB} MB is high for live output.`);
  }
  if (report.skinned) {
    report.warnings.push('Skinned/rigged mesh detected — animation plays, but bone editing is not supported in Chase.');
  }

  // ---- normalise materials to Chase-safe PBR + compress textures ----
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const fixed = mats.map((m) => {
      if (!m) return new THREE.MeshStandardMaterial({ color: '#8a93a6', roughness: 0.6 });
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
        if (m[key]?.image) m[key] = compressTexture(m[key], report);
      }
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return m;
      // convert Phong/Lambert/Basic/unknown shaders → Chase-safe standard PBR
      report.converted++;
      const safe = new THREE.MeshStandardMaterial({
        color: m.color ? m.color.clone() : new THREE.Color('#9aa3b5'),
        map: m.map || null,
        normalMap: m.normalMap || null,
        emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
        emissiveMap: m.emissiveMap || null,
        transparent: !!m.transparent,
        opacity: m.opacity ?? 1,
        roughness: m.shininess !== undefined ? THREE.MathUtils.clamp(1 - m.shininess / 100, 0.15, 1) : 0.6,
        metalness: 0.2
      });
      return safe;
    });
    o.material = Array.isArray(o.material) ? fixed : fixed[0];
  });
  if (report.converted) report.warnings.push(`${report.converted} material(s) converted to Chase-safe shader.`);
  if (report.compressed) report.warnings.push(`${report.compressed} texture(s) auto-compressed to ${BUDGET.texMax}px for GPU safety.`);

  report.object = root;
  return report;
}

/** Downscale oversized textures onto a capped canvas (auto compression). */
function compressTexture(tex, report) {
  const img = tex.image;
  const w = img.width || 0, h = img.height || 0;
  if (Math.max(w, h) <= BUDGET.texMax) return tex;
  const k = BUDGET.texMax / Math.max(w, h);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const nt = new THREE.CanvasTexture(cv);
  nt.colorSpace = tex.colorSpace;
  nt.wrapS = tex.wrapS; nt.wrapT = tex.wrapT;
  nt.flipY = tex.flipY;
  report.compressed++;
  return nt;
}

/** Load an HDRI (.hdr) environment for image-based studio relighting. */
export async function ingestHDRI(media, renderer) {
  const texture = await new RGBELoader().loadAsync(media.url);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  return env;
}
