import type { Fixture, Hoist, TrussSystem } from '../catalog';
import { pickSections, symmetricOrder } from './modular';
import type { BlockDef, Part, SceneObject, Vec3 } from './types';

export interface TrussRun {
  id: string;
  name: string;
  target: number;
  length: number;
  sections: number[]; // in placement order, left → right
  /** world centre of the run, at the truss bottom chord plane */
  center: Vec3;
  bottom: number;
  hoists: number;
}

export function trussBlockKey(sys: TrussSystem, length: number) {
  return `SC_TRUSS_${sys.manufacturer}_${sys.model.split(' ')[0]}_${length}`.replace(/[^\w]+/g, '_');
}

/**
 * Box-truss section in local coordinates: origin at the centre of the section's
 * bottom face (between the two bottom chords), length along +X from −L/2 to +L/2.
 */
export function trussSectionParts(sys: TrussSystem, L: number): Part[] {
  const r = sys.chordDiameter / 2;
  const c = sys.width / 2 - r; // chord centre offset
  const zc = [r, sys.height - r];
  const parts: Part[] = [];
  for (const y of [-c, c]) for (const z of zc) parts.push({ kind: 'cyl', from: [-L / 2, y, z], to: [L / 2, y, z], r, mat: 'truss' });
  // zig-zag diagonals on each of the four faces; bay ≈ chord spacing
  const bays = Math.max(1, Math.round(L / (2 * c)));
  const bay = L / bays;
  const br = sys.braceDiameter / 2;
  const faces: [Vec3, Vec3][] = [
    [[0, -c, zc[0]], [0, -c, zc[1]]], // front (−Y) face: bottom → top
    [[0, c, zc[0]], [0, c, zc[1]]],
    [[0, -c, zc[0]], [0, c, zc[0]]], // bottom face
    [[0, -c, zc[1]], [0, c, zc[1]]],
  ];
  for (const [a, b] of faces) {
    for (let i = 0; i < bays; i++) {
      const x0 = -L / 2 + i * bay, x1 = x0 + bay;
      const [p, q] = i % 2 === 0 ? [a, b] : [b, a];
      parts.push({ kind: 'cyl', from: [x0, p[1], p[2]], to: [x1, q[1], q[2]], r: br, mat: 'truss' });
    }
  }
  return parts;
}

export function buildTrussRun(
  sys: TrussSystem, hoist: Hoist,
  opts: { id: string; name: string; target: number; center: Vec3; maxHoistSpacing: number; group: string },
) {
  const lengths = sys.sections.map((s) => s.length);
  const picked = pickSections(opts.target, lengths);
  const sections = symmetricOrder(picked);
  const length = sections.reduce((a, b) => a + b, 0);
  const blocks = new Map<string, BlockDef>();
  const objects: SceneObject[] = [];
  let x = opts.center[0] - length / 2;
  sections.forEach((L, i) => {
    const key = trussBlockKey(sys, L);
    if (!blocks.has(key)) blocks.set(key, { key, description: `${sys.manufacturer} ${sys.model} — ${L} mm section`, catalogId: sys.id, parts: trussSectionParts(sys, L) });
    const spec = sys.sections.find((s) => s.length === L);
    objects.push({
      id: `TRUSS.${opts.id}.S${String(i + 1).padStart(2, '0')}`, label: `${sys.model} ${L / 1000} m`, layer: '30_RIGGING::30_01_TRUSS', system: 'rigging', group: opts.group,
      block: key, position: [x + L / 2, opts.center[1], opts.center[2]], rotationZ: 0,
      meta: { catalogId: sys.id, length: L, weightKg: spec?.weightKg ?? null, lengthVerified: spec?.verified ?? false, connection: sys.connection, run: opts.name },
    });
    x += L;
  });

  // hoists: one at each end (inset 250 mm) plus intermediates so spacing ≤ max
  const inset = Math.min(250, length / 4);
  const span = length - 2 * inset;
  const n = Math.max(2, Math.ceil(span / opts.maxHoistSpacing) + 1);
  const hKey = `SC_HOIST_${hoist.capacityKg}kg`;
  blocks.set(hKey, {
    key: hKey, description: `${hoist.manufacturer} ${hoist.model}`, catalogId: hoist.id,
    parts: [
      { kind: 'box', min: [-hoist.bodyW / 2, -hoist.bodyD / 2, 600], max: [hoist.bodyW / 2, hoist.bodyD / 2, 600 + hoist.bodyH], mat: 'hoist' },
      { kind: 'cyl', from: [0, 0, 0], to: [0, 0, 600], r: 6, mat: 'hoist' },
      { kind: 'cyl', from: [0, 0, 600 + hoist.bodyH], to: [0, 0, 600 + hoist.bodyH + 1500], r: 6, mat: 'hoist' },
    ],
  });
  for (let i = 0; i < n; i++) {
    const hx = opts.center[0] - span / 2 + (span * i) / (n - 1);
    objects.push({
      id: `HOIST.${opts.id}.${String(i + 1).padStart(2, '0')}`, label: hoist.model, layer: '30_RIGGING::30_02_HOISTS', system: 'rigging', group: opts.group,
      block: hKey, position: [hx, opts.center[1], opts.center[2] + sys.height], rotationZ: 0,
      meta: { catalogId: hoist.id, capacityKg: hoist.capacityKg, verification: hoist.verification },
    });
  }

  const run: TrussRun = { id: opts.id, name: opts.name, target: opts.target, length, sections, center: opts.center, bottom: opts.center[2], hoists: n };
  return { run, blocks: [...blocks.values()], objects };
}

/** Fixture hung under a truss; origin = clamp point at the truss bottom chord. Head points down. */
export function fixtureParts(f: Fixture): Part[] {
  if (f.form === 'batten') {
    // a long tilting bar on two brackets, hanging under the pipe
    const w = f.width / 2, l = f.length / 2;
    return [
      { kind: 'cyl', from: [-w * 0.6, 0, 0], to: [-w * 0.6, 0, -40], r: 20, mat: 'fixture' },
      { kind: 'cyl', from: [w * 0.6, 0, 0], to: [w * 0.6, 0, -40], r: 20, mat: 'fixture' },
      { kind: 'box', min: [-w, -l, -f.height], max: [w, l, -40], mat: 'fixture' },
    ];
  }
  if (f.form === 'ellipsoidal') {
    // yoke + barrel pointing +Y (upstage from a front-of-house position)
    const r = f.width * 0.32, zc = -f.height * 0.55, yokeT = 14;
    return [
      { kind: 'cyl', from: [0, 0, 0], to: [0, 0, -60], r: 20, mat: 'fixture' },
      { kind: 'box', min: [-f.width / 2, -yokeT / 2, zc], max: [-f.width / 2 + yokeT, yokeT / 2, -60], mat: 'fixture' },
      { kind: 'box', min: [f.width / 2 - yokeT, -yokeT / 2, zc], max: [f.width / 2, yokeT / 2, -60], mat: 'fixture' },
      { kind: 'box', min: [-r, -f.length * 0.45, zc - r], max: [r, -f.length * 0.1, zc + r], mat: 'fixture' },
      { kind: 'cyl', from: [0, -f.length * 0.1, zc], to: [0, f.length * 0.55, zc], r: r * 0.75, mat: 'fixture' },
    ];
  }
  const baseH = Math.round(f.height * 0.28);
  const headR = f.width * 0.38;
  const yokeT = 18;
  return [
    { kind: 'cyl', from: [0, 0, 0], to: [0, 0, -40], r: 20, mat: 'fixture' }, // clamp
    { kind: 'box', min: [-f.width / 2, -f.length * 0.33, -40 - baseH], max: [f.width / 2, f.length * 0.33, -40], mat: 'fixture' },
    { kind: 'box', min: [-f.width / 2, -yokeT / 2, -f.height], max: [-f.width / 2 + yokeT, yokeT / 2, -40 - baseH], mat: 'fixture' },
    { kind: 'box', min: [f.width / 2 - yokeT, -yokeT / 2, -f.height], max: [f.width / 2, yokeT / 2, -40 - baseH], mat: 'fixture' },
    { kind: 'cyl', from: [0, 0, -40 - baseH - 20], to: [0, 0, -f.height], r: headR, mat: 'fixture' },
  ];
}
