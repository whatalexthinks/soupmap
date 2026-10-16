/**
 * "Step inside": a Gaussian-splat viewer (Spark on three.js), loaded only on demand.
 *
 * Supports .spz, .ply, .splat, .ksplat and .sog via Spark. A `splatUrl` of
 * "procedural:ramen-bowl" renders a built-in placeholder scene made entirely in code
 * (a steaming bowl on a counter), so no third-party asset or license is involved.
 *
 * TODO(splats): replace the placeholder with our own captures (see README "Splat pipeline").
 * TODO(splats, Phase 2): CesiumJS renders KHR_gaussian_splatting glTF / 3D Tiles in-map;
 *   that's the path for splats georeferenced onto the real street.
 */
import { SparkRenderer, SplatMesh, type PackedSplats } from "@sparkjsdev/spark";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SplatViewer {
  dispose(): void;
}

/** Deterministic randomness, so the placeholder looks the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** sRGB hex → THREE.Color without colour-management conversion (splat colours are sRGB). */
function srgb(hex: number, jitter = 0, rand: () => number = Math.random): THREE.Color {
  const j = () => (rand() - 0.5) * jitter;
  const c = new THREE.Color();
  c.r = THREE.MathUtils.clamp(((hex >> 16) & 255) / 255 + j(), 0, 1);
  c.g = THREE.MathUtils.clamp(((hex >> 8) & 255) / 255 + j(), 0, 1);
  c.b = THREE.MathUtils.clamp((hex & 255) / 255 + j(), 0, 1);
  return c;
}

const IDENTITY = new THREE.Quaternion();

/** A steaming bowl of tonkotsu on a wooden counter, built from Gaussian splats. */
function buildRamenBowl(splats: PackedSplats): void {
  const rand = seeded(1985);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const push = (x: number, y: number, z: number, sx: number, sy: number, sz: number, opacity: number, color: THREE.Color) =>
    splats.pushSplat(v.set(x, y, z), s.set(sx, sy, sz), IDENTITY, opacity, color);

  // Counter
  for (let x = -2.4; x <= 2.4; x += 0.05) {
    for (let z = -1.6; z <= 1.6; z += 0.05) {
      const grain = Math.sin(x * 9 + Math.sin(z * 3) * 1.5) * 0.06;
      push(x + (rand() - 0.5) * 0.03, -0.8, z + (rand() - 0.5) * 0.03, 0.035, 0.004, 0.035, 0.95, srgb(0x5a3a22, 0.05 + grain, rand));
    }
  }

  // Bowl: a surface of revolution, lacquer outside with a vermilion band, cream glaze inside.
  const rim = 1.0;
  const depth = 0.72;
  const radiusAt = (t: number) => rim * (1 - 0.55 * Math.pow(t, 1.5));
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const r = radiusAt(t);
    const y = -depth * t;
    const ring = Math.max(24, Math.round(150 * r));
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 + rand() * 0.02;
      const band = t > 0.06 && t < 0.18;
      const pattern = band && Math.floor((a / (Math.PI * 2)) * 36) % 2 === 0;
      const outside = band ? srgb(pattern ? 0xc0392b : 0x8e2a1f, 0.04, rand) : srgb(0x1d1838, 0.03, rand);
      push(Math.cos(a) * r, y, Math.sin(a) * r, 0.03, 0.03, 0.03, 1, outside);
      if (t < 0.25) push(Math.cos(a) * (r - 0.03), y, Math.sin(a) * (r - 0.03), 0.026, 0.026, 0.026, 1, srgb(0xefe7d6, 0.03, rand));
    }
  }
  // Foot ring
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2;
    push(Math.cos(a) * 0.42, -depth - 0.05, Math.sin(a) * 0.42, 0.03, 0.04, 0.03, 1, srgb(0x15122b, 0.02, rand));
  }

  // Broth: milky tonkotsu with a few glossy fat droplets
  const brothY = -0.13;
  for (let i = 0; i < 2600; i++) {
    const r = Math.sqrt(rand()) * 0.93;
    const a = rand() * Math.PI * 2;
    const fat = rand() < 0.04;
    push(Math.cos(a) * r, brothY, Math.sin(a) * r, 0.04, 0.006, 0.04, 0.97, fat ? srgb(0xfff4d6, 0.02, rand) : srgb(0xead8b4, 0.05, rand));
  }

  // Noodles: wavy strands breaking the surface
  for (let n = 0; n < 9; n++) {
    const z0 = -0.45 + n * 0.11;
    for (let x = -0.75; x <= 0.2; x += 0.012) {
      const z = z0 + Math.sin(x * 14 + n) * 0.035;
      if (x * x + z * z > 0.8) continue;
      push(x, brothY + 0.02 + Math.sin(x * 7 + n) * 0.012, z, 0.013, 0.01, 0.013, 1, srgb(0xf0cf72, 0.05, rand));
    }
  }

  // Chashu: two slices, pink centre and browned edge
  for (const [cx, cz, tilt] of [
    [0.38, 0.2, 0.05],
    [0.3, -0.18, -0.04],
  ] as const) {
    for (let i = 0; i < 520; i++) {
      const r = Math.sqrt(rand()) * 0.24;
      const a = rand() * Math.PI * 2;
      const edge = r > 0.19;
      push(cx + Math.cos(a) * r, brothY + 0.04 + Math.cos(a) * tilt, cz + Math.sin(a) * r, 0.018, 0.008, 0.018, 1, srgb(edge ? 0x8a4b2c : 0xd9a18a, 0.05, rand));
    }
  }

  // Ajitama: half a marinated egg with a jammy yolk
  for (let i = 0; i < 380; i++) {
    const r = Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    const x = -0.36 + Math.cos(a) * r * 0.16;
    const z = 0.28 + Math.sin(a) * r * 0.11;
    const colour = r < 0.55 ? 0xf2a541 : r < 0.62 ? 0xf7d48a : 0xf6ecd8;
    push(x, brothY + 0.06, z, 0.014, 0.008, 0.014, 1, srgb(colour, 0.03, rand));
  }

  // Nori, standing at the back
  for (let x = -0.3; x <= 0.12; x += 0.016) {
    for (let y = -0.1; y <= 0.42; y += 0.016) {
      push(x, y, -0.62 - (y + 0.1) * 0.25, 0.012, 0.012, 0.004, 0.98, srgb(0x1a2e22, 0.04, rand));
    }
  }

  // Scallions
  for (let i = 0; i < 46; i++) {
    const r = 0.15 + rand() * 0.55;
    const a = rand() * Math.PI * 2;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    for (let k = 0; k < 10; k++) {
      const b = (k / 10) * Math.PI * 2;
      push(cx + Math.cos(b) * 0.025, brothY + 0.05, cz + Math.sin(b) * 0.025, 0.008, 0.006, 0.008, 1, srgb(0x6fbf5a, 0.06, rand));
    }
  }
}

function buildSteam(splats: PackedSplats): void {
  const rand = seeded(7);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  // Three thin wisps: few, faint, wide splats so they read as vapour, not a solid cone.
  for (let i = 0; i < 210; i++) {
    const column = i % 3;
    const h = rand();
    const swirl = h * 6 + column * 2.1;
    const x = (column - 1) * 0.36 + Math.sin(swirl) * 0.16 * (0.3 + h);
    const z = Math.cos(swirl) * 0.12 + (rand() - 0.5) * 0.08;
    const size = 0.04 + h * 0.1;
    splats.pushSplat(v.set(x, 0.02 + h * 1.4, z), s.set(size, size * 1.6, size), IDENTITY, 0.07 * (1 - h) + 0.008, srgb(0xf3efe6, 0.02, rand));
  }
}

export async function openSplatViewer(
  container: HTMLElement,
  source: string,
  options: { reducedMotion: boolean },
): Promise<SplatViewer> {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x07060f);
  container.append(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D scene. Drag to look around, scroll or pinch to zoom.");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 200);
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const meshes: SplatMesh[] = [];
  let steam: SplatMesh | undefined;
  if (source.startsWith("procedural:")) {
    meshes.push(new SplatMesh({ constructSplats: buildRamenBowl }));
    steam = new SplatMesh({ constructSplats: buildSteam });
    meshes.push(steam);
    camera.position.set(0, 1.25, 2.6);
  } else {
    // Captured scenes: most trainers export with Y down; flip to Y up.
    const mesh = new SplatMesh({ url: source });
    mesh.quaternion.set(1, 0, 0, 0);
    meshes.push(mesh);
    camera.position.set(0, 0, 2.5);
  }
  for (const mesh of meshes) scene.add(mesh);
  await Promise.all(meshes.map((m) => m.initialized));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, -0.15, 0);
  controls.minDistance = 0.6;
  controls.maxDistance = 8;
  controls.autoRotate = !options.reducedMotion;
  controls.autoRotateSpeed = 0.6;
  controls.listenToKeyEvents(container);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  renderer.setAnimationLoop((time: number) => {
    if (steam && !options.reducedMotion) {
      steam.position.y = ((time / 4000) % 1) * 0.25;
      steam.rotation.y = time / 9000;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      for (const mesh of meshes) mesh.dispose();
      spark.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
