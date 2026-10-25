/**
 * GLB (binary glTF 2.0) exporter written directly from the SceneGraph — no DOM, no three.js,
 * so it runs identically in the browser and in tests.
 *
 *  • Equipment blocks become shared glTF meshes; every component is its own named node
 *    referencing the shared mesh (the glTF equivalent of Rhino block instances).
 *  • Hierarchy: STAGECRAFT root → one node per Rhino parent layer → sub-layer → objects.
 *  • The root node converts STAGECRAFT world (mm, Z-up) to glTF convention (m, Y-up, +Z toward viewer):
 *    x' = x/1000, y' = z/1000, z' = −y/1000. Audience therefore looks down glTF −Z, as in most DCC tools.
 *  • Component metadata goes into node `extras` (Maya/Blender import it as custom attributes).
 *  • LED cabinets get an emissive front-face primitive so media surfaces read in renderers.
 */
import type { SceneGraph } from '../core/engine/scene';
import { ShapeUtils, Vector2 } from 'three';
import type { MaterialKey, Part, SceneObject, SystemKey } from '../core/engine/types';
import type { StageFinish } from '../core/schema';
import { APP_VERSION } from './rhino';

type Mat = { name: string; rgb: [number, number, number]; metal: number; rough: number; emissive?: [number, number, number]; alpha?: number };

const FINISH: Record<StageFinish, [number, number, number]> = { white: [242, 241, 238], black: [27, 27, 29], graphite: [58, 58, 61], oak: [185, 154, 116] };
function materialTable(finish: StageFinish, scenic: StageFinish): Record<MaterialKey | 'ledFace', Mat> {
  return {
    deckTop: { name: `SC_Deck_Top_${finish}`, rgb: FINISH[finish], metal: 0, rough: 0.5 },
    fascia: { name: `SC_Fascia_${finish}`, rgb: FINISH[finish], metal: 0, rough: 0.5 },
    deckFrame: { name: 'SC_Deck_Frame_Steel', rgb: [43, 43, 46], metal: 0.6, rough: 0.45 },
    leg: { name: 'SC_Leg_Steel', rgb: [154, 154, 160], metal: 0.85, rough: 0.35 },
    ledBody: { name: 'SC_LED_Cabinet', rgb: [18, 18, 20], metal: 0.3, rough: 0.55 },
    ledFace: { name: 'SC_LED_Face', rgb: [10, 12, 18], metal: 0, rough: 0.25, emissive: [0.25, 0.45, 1.0] },
    ledSupport: { name: 'SC_LED_Support_Steel', rgb: [86, 86, 91], metal: 0.7, rough: 0.4 },
    truss: { name: 'SC_Truss_Aluminium', rgb: [215, 217, 221], metal: 0.95, rough: 0.28 },
    hoist: { name: 'SC_Hoist', rgb: [31, 31, 34], metal: 0.4, rough: 0.5 },
    fixture: { name: 'SC_Fixture', rgb: [29, 29, 32], metal: 0.35, rough: 0.45 },
    presenter: { name: 'SC_Reference_Figure', rgb: [235, 232, 227], metal: 0, rough: 0.85 },
    chairSeat: { name: 'SC_Chair_Seat', rgb: [34, 34, 37], metal: 0, rough: 0.7 },
    chairFrame: { name: 'SC_Chair_Frame_Steel', rgb: [150, 150, 155], metal: 0.8, rough: 0.35 },
    accessible: { name: 'SC_Wheelchair_Space', rgb: [30, 96, 190], metal: 0, rough: 0.8 },
    speaker: { name: 'SC_Speaker_Cabinet', rgb: [26, 26, 29], metal: 0.2, rough: 0.6 },
    speakerGrille: { name: 'SC_Speaker_Grille', rgb: [12, 12, 14], metal: 0.5, rough: 0.45 },
    scenicFlat: { name: `SC_Scenic_Flat_${scenic}`, rgb: FINISH[scenic], metal: 0, rough: 0.8 },
    drape: { name: 'SC_Drape_Black_Velour', rgb: [14, 14, 15], metal: 0, rough: 1 },
    camera: { name: 'SC_Camera', rgb: [38, 38, 42], metal: 0.4, rough: 0.5 },
    platform: { name: 'SC_Camera_Platform', rgb: [30, 30, 32], metal: 0, rough: 0.9 },
    glass: { name: 'SC_Prompter_Glass', rgb: [200, 214, 224], metal: 0, rough: 0.05, alpha: 0.25 },
    screen: { name: 'SC_Monitor_Screen', rgb: [12, 16, 26], metal: 0.1, rough: 0.2, emissive: [0.05, 0.08, 0.14] },
    crowd: { name: 'SC_Crowd_Figure', rgb: [128, 132, 146], metal: 0, rough: 0.9 },
    barricade: { name: 'SC_Barricade_Steel', rgb: [150, 152, 158], metal: 0.7, rough: 0.4 },
    stand: { name: 'SC_Seating_Stand', rgb: [92, 94, 100], metal: 0.2, rough: 0.7 },
    structure: { name: 'SC_Ground_Support_Steel', rgb: [110, 112, 118], metal: 0.8, rough: 0.4 },
    roofSkin: { name: 'SC_Roof_Skin', rgb: [228, 228, 230], metal: 0, rough: 0.8, alpha: 0.45 },
    booth: { name: 'SC_DJ_Booth', rgb: [22, 22, 24], metal: 0.3, rough: 0.5 },
  };
}

const srgbToLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

interface Prim { positions: number[]; normals: number[]; indices: number[] }

function boxPrim(min: number[], max: number[], out: Prim) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]]],
    [[0, 1, 0], [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]]],
  ];
  for (const [n, quad] of faces) {
    const b = out.positions.length / 3;
    for (const p of quad) { out.positions.push(...p); out.normals.push(...n); }
    out.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}

function cylPrim(from: number[], to: number[], r: number, out: Prim, seg = 16) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const w = d.map((v) => v / len);
  const a = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = cross(a, w); const ul = Math.hypot(u[0], u[1], u[2]); u = u.map((v) => v / ul);
  const v = cross(w, u);
  const ring = (k: number) => { const t = (k / seg) * Math.PI * 2; return [Math.cos(t), Math.sin(t)]; };
  const P = (base: number[], c: number, s: number) => [0, 1, 2].map((i) => base[i] + r * (c * u[i] + s * v[i]));
  // side
  const b = out.positions.length / 3;
  for (let k = 0; k <= seg; k++) {
    const [c, s] = ring(k);
    const n = [0, 1, 2].map((i) => c * u[i] + s * v[i]);
    out.positions.push(...P(from, c, s)); out.normals.push(...n);
    out.positions.push(...P(to, c, s)); out.normals.push(...n);
  }
  for (let k = 0; k < seg; k++) { const i = b + 2 * k; out.indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  // caps
  for (const [base, sign] of [[from, -1], [to, 1]] as [number[], number][]) {
    const c0 = out.positions.length / 3;
    out.positions.push(...base); out.normals.push(...w.map((x) => x * sign));
    for (let k = 0; k <= seg; k++) { const [c, s] = ring(k); out.positions.push(...P(base, c, s)); out.normals.push(...w.map((x) => x * sign)); }
    for (let k = 0; k < seg; k++) sign > 0 ? out.indices.push(c0, c0 + 1 + k, c0 + 2 + k) : out.indices.push(c0, c0 + 2 + k, c0 + 1 + k);
  }
}
/** Extruded plan polygon: flat-shaded sides plus triangulated caps. */
function prismPrim(points: [number, number][], z0: number, z1: number, out: Prim) {
  const pts = ShapeUtils.isClockWise(points.map(([x, y]) => new Vector2(x, y))) ? [...points].reverse() : points;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (by - ay) / len, ny = -(bx - ax) / len; // outward for CCW
    const b = out.positions.length / 3;
    out.positions.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1);
    for (let k = 0; k < 4; k++) out.normals.push(nx, ny, 0);
    out.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const tris = ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), []);
  for (const [z, nz] of [[z0, -1], [z1, 1]] as const) {
    const b = out.positions.length / 3;
    for (const [x, y] of pts) { out.positions.push(x, y, z); out.normals.push(0, 0, nz); }
    for (const [i, j, k] of tris) nz > 0 ? out.indices.push(b + i, b + j, b + k) : out.indices.push(b + i, b + k, b + j);
  }
}
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Screen content for the LED faces: an image already padded to cover every wall,
 * and where it sits in world X / Z (mm). See ui/media.ts → glbMedia().
 */
export interface GlbMedia { image: Uint8Array; mimeType: 'image/png' | 'image/jpeg'; rect: { x0: number; z0: number; width: number; height: number } }

export interface GlbOptions { systems?: SystemKey[]; finish?: StageFinish; scenicFinish?: StageFinish; media?: GlbMedia }

export function exportGlb(scene: SceneGraph, projectName: string, opts: GlbOptions = {}): Uint8Array {
  const mats = materialTable(opts.finish ?? 'white', opts.scenicFinish ?? 'white');
  const want = (s: SystemKey) => !opts.systems || opts.systems.includes(s);
  const objects = scene.objects.filter((o) => want(o.system));

  const bufferViews: any[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = [], materials: any[] = [];
  let byteLength = 0;
  const chunks: Uint8Array[] = [];
  const pushView = (arr: Float32Array | Uint32Array | Uint8Array, target?: number) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes); byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const matIndex = new Map<string, number>();
  const matFor = (k: MaterialKey | 'ledFace') => {
    if (!matIndex.has(k)) {
      const m = mats[k];
      materials.push({
        name: m.name,
        pbrMetallicRoughness: { baseColorFactor: [...m.rgb.map(srgbToLinear), m.alpha ?? 1], metallicFactor: m.metal, roughnessFactor: m.rough },
        ...(m.emissive ? { emissiveFactor: m.emissive } : {}),
        ...(m.alpha != null ? { alphaMode: 'BLEND', doubleSided: true } : {}),
      });
      matIndex.set(k, materials.length - 1);
    }
    return matIndex.get(k)!;
  };

  const meshFor = new Map<string, number>();
  const buildMesh = (name: string, parts: Part[], ledFace?: { w: number; h: number }) => {
    const byMat = new Map<MaterialKey | 'ledFace', Prim>();
    const get = (k: MaterialKey | 'ledFace') => byMat.get(k) ?? byMat.set(k, { positions: [], normals: [], indices: [] }).get(k)!;
    for (const p of parts) p.kind === 'box' ? boxPrim(p.min, p.max, get(p.mat)) : p.kind === 'prism' ? prismPrim(p.points, p.z0, p.z1, get(p.mat)) : cylPrim(p.from, p.to, p.r, get(p.mat));
    if (ledFace) boxPrim([-ledFace.w / 2 + 2, -3, 2], [ledFace.w / 2 - 2, -0.5, ledFace.h - 2], get('ledFace'));
    const primitives = [...byMat].map(([k, prim]) => {
      const pos = new Float32Array(prim.positions);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], pos[i + j]); max[j] = Math.max(max[j], pos[i + j]); }
      const pv = pushView(pos, 34962), nv = pushView(new Float32Array(prim.normals), 34962), iv = pushView(new Uint32Array(prim.indices), 34963);
      accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
      accessors.push({ bufferView: nv, componentType: 5126, count: pos.length / 3, type: 'VEC3' });
      accessors.push({ bufferView: iv, componentType: 5125, count: prim.indices.length, type: 'SCALAR' });
      const a = accessors.length;
      return { attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: matFor(k) };
    });
    meshes.push({ name, primitives });
    return meshes.length - 1;
  };

  // layer hierarchy nodes
  const layerNode = new Map<string, number>();
  const rootChildren: number[] = [];
  const nodeForLayer = (path: string): number => {
    if (layerNode.has(path)) return layerNode.get(path)!;
    const parts = path.split('::');
    nodes.push({ name: parts[parts.length - 1], children: [] });
    const i = nodes.length - 1;
    layerNode.set(path, i);
    if (parts.length === 1) rootChildren.push(i);
    else nodes[nodeForLayer(parts.slice(0, -1).join('::'))].children.push(i);
    return i;
  };

  for (const o of objects) {
    const key = o.block ?? `__obj:${o.id}`;
    if (!meshFor.has(key)) {
      const parts = o.block ? scene.blocks[o.block].parts : o.parts!;
      const isCab = o.system === 'ledCabinets';
      const box = isCab ? (parts[0] as Extract<Part, { kind: 'box' }>) : undefined;
      meshFor.set(key, buildMesh(o.block ?? o.id, parts, box && !opts.media ? { w: box.max[0] - box.min[0], h: box.max[2] - box.min[2] } : undefined));
    }
    const parent = nodeForLayer(o.layer);
    nodes.push(objectNode(o, meshFor.get(key)!));
    nodes[parent].children.push(nodes.length - 1);
  }
  // screen content: one textured, emissive face mesh per wall in world space (UVs = front projection)
  const extra: { images?: any[]; textures?: any[]; samplers?: any[] } = {};
  if (opts.media) {
    const { rect } = opts.media;
    extra.images = [{ bufferView: pushView(opts.media.image), mimeType: opts.media.mimeType, name: 'SC_Screen_Content' }];
    extra.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
    extra.textures = [{ source: 0, sampler: 0 }];
    materials.push({ name: 'SC_LED_Content', pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 0.3 }, emissiveTexture: { index: 0 }, emissiveFactor: [1, 1, 1] });
    const contentMat = materials.length - 1;
    const walls = new Map<string, SceneObject[]>();
    for (const o of objects) if (o.system === 'ledCabinets' && o.block && !o.tilt) (walls.get(o.group) ?? walls.set(o.group, []).get(o.group)!).push(o);
    for (const [group, cabs] of walls) {
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
      for (const o of cabs) {
        const b = scene.blocks[o.block!].parts[0] as Extract<Part, { kind: 'box' }>;
        const w = b.max[0] - b.min[0], h = b.max[2] - b.min[2];
        const c = Math.cos(o.rotationZ), sn = Math.sin(o.rotationZ);
        const base = pos.length / 3;
        for (const [lx, lz] of [[-w / 2 + 2, 2], [w / 2 - 2, 2], [w / 2 - 2, h - 2], [-w / 2 + 2, h - 2]]) {
          const X = o.position[0] + c * lx - sn * -3.5, Y = o.position[1] + sn * lx + c * -3.5, Z = o.position[2] + lz;
          pos.push(X, Y, Z); nrm.push(sn, -c, 0);
          uv.push((X - rect.x0) / rect.width, 1 - (Z - rect.z0) / rect.height);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const p32 = new Float32Array(pos);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p32.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], p32[i + j]); max[j] = Math.max(max[j], p32[i + j]); }
      accessors.push({ bufferView: pushView(p32, 34962), componentType: 5126, count: p32.length / 3, type: 'VEC3', min, max });
      accessors.push({ bufferView: pushView(new Float32Array(nrm), 34962), componentType: 5126, count: p32.length / 3, type: 'VEC3' });
      accessors.push({ bufferView: pushView(new Float32Array(uv), 34962), componentType: 5126, count: p32.length / 3, type: 'VEC2' });
      accessors.push({ bufferView: pushView(new Uint32Array(idx), 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      const a = accessors.length;
      meshes.push({ name: `MEDIA_${group}`, primitives: [{ attributes: { POSITION: a - 4, NORMAL: a - 3, TEXCOORD_0: a - 2 }, indices: a - 1, material: contentMat }] });
      nodes.push({ name: `MEDIA.${group.replace(/^led:/, '').toUpperCase()}`, mesh: meshes.length - 1, extras: { system: 'ledCabinets', group, content: 'screen media (front projection)' } });
      nodes[nodeForLayer(cabs[0].layer)].children.push(nodes.length - 1);
    }
  }
  for (const n of nodes) if (n.children && !n.children.length) delete n.children;

  nodes.push({
    name: 'STAGECRAFT', children: rootChildren,
    // mm Z-up → m Y-up: rotate −90° about X, scale 0.001 (column-major)
    matrix: [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1],
    extras: { units: 'source mm, Z-up; root converts to glTF metres, Y-up', origin: 'floor, stage centreline, downstage edge' },
  });
  const rootIndex = nodes.length - 1;

  const json = {
    asset: { version: '2.0', generator: `STAGECRAFT ${APP_VERSION}` },
    scene: 0,
    scenes: [{ name: projectName, nodes: [rootIndex] }],
    nodes, meshes, materials, accessors, bufferViews, ...extra,
    buffers: [{ byteLength }],
  };
  return packGlb(json, chunks, byteLength);
}

function objectNode(o: SceneObject, mesh: number) {
  const c = Math.cos(o.rotationZ), s = Math.sin(o.rotationZ);
  const [x, y, z] = o.position;
  const extras: Record<string, unknown> = { stagecraftId: o.id, label: o.label, system: o.system, group: o.group, layer: o.layer };
  for (const [k, v] of Object.entries(o.meta)) if (v != null) extras[k] = v;
  const node: any = { name: o.id, mesh, extras };
  if (o.tilt) {
    // column-major T · Rz · Rx
    const cx = Math.cos(o.tilt), sx = Math.sin(o.tilt);
    node.matrix = [
      c, s, 0, 0,
      -s * cx, c * cx, sx, 0,
      s * sx, -c * sx, cx, 0,
      x, y, z, 1,
    ];
  } else if (o.rotationZ) node.matrix = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  else node.translation = [x, y, z];
  return node;
}

function packGlb(json: object, chunks: Uint8Array[], binLength: number): Uint8Array {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const p = new Uint8Array(jsonBytes.length + jpad).fill(0x20); p.set(jsonBytes); jsonBytes = p; }
  const bpad = (4 - (binLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + 8 + binLength + bpad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLength + bpad, true); dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
