import type { Hoist, Speaker, TrussSystem } from '../catalog';
import type { RoofSystem, StructureParams } from '../schema';
import type { Mm } from '../units';
import { speakerBlock, speakerBlockKey } from './audio';
import { buildTrussRun, pickTrussSections, trussSectionParts } from './rigging';
import type { BlockDef, Part, SceneObject, Vec3, Warning } from './types';

/**
 * Ground-support structures and big-show rigging:
 *  - an outdoor roof (Stageco-type) over the stage, with optional PA / IMAG wings
 *  - a mother grid of truss over the deck (arena shows hung from the building)
 *  - delay towers out in the field, each with a delay hang
 *  - free truss members between any two points (geometric / scenic rigs)
 *
 * Roof figures marked "manufacturer" come from Stageco's product pages; the rest of each roof
 * (tower section, depth or clearance where the page doesn't give it) is a generic planning value.
 * Structures are drawn as planning envelopes: the supplier's engineering governs.
 */

export interface RoofSpec {
  id: RoofSystem;
  name: string;
  /** allowed clear spans between the towers (mm) */
  spans: Mm[];
  depth: Mm;
  clearance: Mm;
  /** overall height to the top of the towers */
  height: Mm;
  gridLoadT: number | null;
  wingLoadT: number | null;
  verified: string[];
  source: string;
}

export const ROOFS: Record<RoofSystem, RoofSpec> = {
  'stageco.roof-25x10': {
    id: 'stageco.roof-25x10', name: 'Stageco Roof 25 × 10', spans: [25000], depth: 10000, clearance: 8000, height: 11500,
    gridLoadT: 6.5, wingLoadT: 3, verified: ['span', 'depth', 'clearance', 'grid load', 'wing load'],
    source: 'https://stageco.com/products/concert-stages/festival-stages-ground-supports/roof-25-x-10/13',
  },
  'stageco.classic-4-tower': {
    id: 'stageco.classic-4-tower', name: 'Stageco Classic 4-Tower Roof', spans: [25600], depth: 16000, clearance: 15000, height: 20000,
    gridLoadT: 24, wingLoadT: null, verified: ['span (up to 25.6 m)', 'height 20 m', 'rigging 24 t (25 m version)'],
    source: 'https://www.stageco.com/products/concert-stages/festival-stages-ground-supports/classic-4-tower-roof/10',
  },
  'stageco.super-roof': {
    id: 'stageco.super-roof', name: 'Stageco Super Roof', spans: [30000, 33000, 36000], depth: 20000, clearance: 18000, height: 24000,
    gridLoadT: null, wingLoadT: null, verified: ['spans 30 / 33 / 36 m', 'in-the-round 26 × 26 m'],
    source: 'https://www.stageco.com/products/concert-stages/festival-stages-ground-supports/super-roof/15',
  },
};

/** generic planning values */
const TOWER = 1600; // main tower section
const WING_W = 6000; // PA wing width
const DELAY_TOWER = 1200;

export interface StructureReport {
  roof: { spec: RoofSpec; span: Mm; clearance: Mm; wings: boolean; minX: Mm; maxX: Mm; minY: Mm; maxY: Mm; wingCentreX: Mm | null } | null;
  grid: { runs: number; width: Mm; depth: Mm; trim: Mm } | null;
  delays: { count: number; distance: Mm; delayMs: number; speaker: Speaker | null } | null;
  freeTruss: { count: number; lengthMm: Mm };
}

export interface StructureContext {
  stageWidth: Mm;
  stageDepth: Mm;
  stageTop: Mm;
  /** plan centre the roof / grid sit over */
  centre: [Mm, Mm];
  truss: TrussSystem;
  hoist: Hoist;
  /** main loudspeaker (for delay hangs) and the hang position of the mains */
  mainSpeaker: Speaker | null;
  mainsY: Mm;
}

/** lattice tower: four corner chords with ties every 2 m (block origin at the base centre) */
function towerParts(size: Mm, height: Mm): Part[] {
  const h = size / 2 - 50, parts: Part[] = [];
  for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) parts.push({ kind: 'cyl', from: [x, y, 0], to: [x, y, height], r: 50, mat: 'structure' });
  for (let z = 0; z <= height; z += 2000) {
    parts.push({ kind: 'box', min: [-h, -h - 25, z], max: [h, -h + 25, z + 60], mat: 'structure' }, { kind: 'box', min: [-h, h - 25, z], max: [h, h + 25, z + 60], mat: 'structure' });
    parts.push({ kind: 'box', min: [-h - 25, -h, z], max: [-h + 25, h, z + 60], mat: 'structure' }, { kind: 'box', min: [h - 25, -h, z], max: [h + 25, h, z + 60], mat: 'structure' });
  }
  parts.push({ kind: 'box', min: [-size / 2 - 600, -size / 2 - 600, 0], max: [size / 2 + 600, size / 2 + 600, 250], mat: 'structure' }); // base plate / ballast footprint
  return parts;
}

export function resolveStructure(p: StructureParams, ctx: StructureContext) {
  const objects: SceneObject[] = [];
  const blocks = new Map<string, BlockDef>();
  const warnings: Warning[] = [];
  const addBlock = (b: BlockDef) => { if (!blocks.has(b.key)) blocks.set(b.key, b); return b.key; };
  const towerKey = (size: Mm, height: Mm) => addBlock({ key: `SC_TOWER_${size}_${Math.round(height)}`, description: `Ground-support tower ${size} mm × ${(height / 1000).toFixed(1)} m (generic section)`, parts: towerParts(size, height) });
  const [cx, cy] = ctx.centre;

  // ── roof
  let roof: StructureReport['roof'] = null;
  if (p.roof.enabled) {
    const spec = ROOFS[p.roof.system];
    const span = spec.spans.reduce((best, s) => (Math.abs(s - p.roof.span) < Math.abs(best - p.roof.span) ? s : best), spec.spans[0]);
    const clearance = spec.clearance, depth = spec.depth;
    const x0 = cx - span / 2 - TOWER / 2, x1 = cx + span / 2 + TOWER / 2;
    const y0 = cy - depth / 2, y1 = cy + depth / 2;
    const gridH = Math.max(1500, spec.height - clearance - 800);
    const tk = towerKey(TOWER, spec.height);
    const g = 'structure:roof';
    const meta = (item: string) => ({ bom: item, manufacturer: 'Stageco', model: spec.name, verification: 'generic', source: spec.source });
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => objects.push({
      id: `ROOF.TOWER.${i + 1}`, label: `${spec.name} — tower ${i + 1}`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: g,
      block: tk, position: [x, y, 0], rotationZ: 0, meta: { ...meta('Roof tower (generic section)'), height: spec.height },
    }));
    // roof grid: perimeter + internal beams as a deep box frame, and the roof skin above it
    const zb = clearance, beam = 900;
    const frame: Part[] = [
      { kind: 'box', min: [x0, y0 - beam / 2, zb], max: [x1, y0 + beam / 2, zb + gridH], mat: 'structure' },
      { kind: 'box', min: [x0, y1 - beam / 2, zb], max: [x1, y1 + beam / 2, zb + gridH], mat: 'structure' },
      { kind: 'box', min: [x0 - beam / 2, y0, zb], max: [x0 + beam / 2, y1, zb + gridH], mat: 'structure' },
      { kind: 'box', min: [x1 - beam / 2, y0, zb], max: [x1 + beam / 2, y1, zb + gridH], mat: 'structure' },
    ];
    const inner = Math.max(1, Math.round(span / 6000) - 1);
    for (let k = 1; k <= inner; k++) { const x = x0 + ((x1 - x0) * k) / (inner + 1); frame.push({ kind: 'box', min: [x - 300, y0, zb + gridH - 600], max: [x + 300, y1, zb + gridH], mat: 'structure' }); }
    objects.push({ id: 'ROOF.GRID', label: `${spec.name} — roof grid`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: g, parts: frame, position: [0, 0, 0], rotationZ: 0,
      meta: { ...meta('Roof grid'), span, depth, clearance, gridLoadT: spec.gridLoadT } });
    // a shallow pitched skin: ridge along the span, eaves front and back
    const eave = zb + gridH, ridge = eave + 1800, ov = 1200;
    const skin: Part[] = [
      { kind: 'prism', points: [[x0 - ov, y0 - ov], [x1 + ov, y0 - ov], [x1 + ov, cy], [x0 - ov, cy]], z0: eave, z1: eave + 80, mat: 'roofSkin' },
      { kind: 'prism', points: [[x0 - ov, cy], [x1 + ov, cy], [x1 + ov, y1 + ov], [x0 - ov, y1 + ov]], z0: eave, z1: eave + 80, mat: 'roofSkin' },
    ];
    objects.push({ id: 'ROOF.SKIN', label: `${spec.name} — roof skin`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: g, parts: skin, position: [0, 0, 0], rotationZ: 0, meta: { bomSkip: true, ridge } });

    let wingCentreX: number | null = null;
    if (p.roof.wings) {
      // PA wings either side: two towers and a header beam each, outboard of the main towers
      const wk = towerKey(TOWER, clearance + 1500);
      wingCentreX = span / 2 + TOWER + WING_W / 2;
      for (const s of [-1, 1] as const) {
        const xa = cx + s * (span / 2 + TOWER / 2 + 400), xb = cx + s * (span / 2 + TOWER + WING_W);
        for (const [i, x] of [xa + s * TOWER / 2, xb].entries())
          objects.push({ id: `ROOF.WING.${s < 0 ? 'L' : 'R'}.${i + 1}`, label: `PA wing ${s < 0 ? 'left' : 'right'} — tower`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: g,
            block: wk, position: [x, y0, 0], rotationZ: 0, meta: { ...meta('PA wing tower (generic section)'), wingLoadT: spec.wingLoadT } });
        objects.push({ id: `ROOF.WING.${s < 0 ? 'L' : 'R'}.HEADER`, label: `PA wing ${s < 0 ? 'left' : 'right'} — header`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: g,
          parts: [{ kind: 'box', min: [Math.min(xa, xb) - TOWER / 2, y0 - 450, clearance + 1500], max: [Math.max(xa, xb) + TOWER / 2, y0 + 450, clearance + 2400], mat: 'structure' }], position: [0, 0, 0], rotationZ: 0,
          meta: meta('PA wing header beam') });
      }
    }
    roof = { spec, span, clearance, wings: p.roof.wings, minX: x0 - (p.roof.wings ? WING_W + TOWER + 400 : 0) - TOWER, maxX: x1 + (p.roof.wings ? WING_W + TOWER + 400 : 0) + TOWER, minY: y0 - ov, maxY: y1 + ov, wingCentreX };
    if (span < ctx.stageWidth) warnings.push({ level: 'warn', code: 'structure.span', target: g, message: `${spec.name}: the ${span / 1000} m span is narrower than the ${(ctx.stageWidth / 1000).toFixed(1)} m stage.` });
    warnings.push({ level: 'info', code: 'structure.roof', target: g, message: `${spec.name}: ${spec.verified.join(', ')} from the manufacturer; tower sections${spec.verified.includes('clearance') ? '' : ', clearance'}${spec.verified.includes('depth') ? '' : ', depth'} are generic. Ballast, wind limits and loading come from the supplier's engineering.` });
  }

  // ── mother grid over the stage
  let grid: StructureReport['grid'] = null;
  if (p.grid.enabled) {
    const { width, depth, trim } = p.grid, spacing = Math.max(1500, p.grid.spacing);
    const nx = Math.max(2, Math.round(depth / spacing) + 1);
    let runs = 0;
    for (let i = 0; i < nx; i++) {
      const y = cy - depth / 2 + (depth * i) / (nx - 1);
      const r = buildTrussRun(ctx.truss, ctx.hoist, { id: `GRID.X${i + 1}`, name: `Mother grid X${i + 1}`, target: width, center: [cx, y, trim], maxHoistSpacing: 6000, group: 'structure:grid', layer: '30_RIGGING::30_05_GRID' });
      r.blocks.forEach(addBlock); objects.push(...r.objects.map((o) => ({ ...o, system: 'rigging' as const }))); runs++;
    }
    for (const s of [-1, 1]) {
      const r = buildTrussRun(ctx.truss, ctx.hoist, { id: `GRID.Y${s < 0 ? 'L' : 'R'}`, name: `Mother grid ${s < 0 ? 'left' : 'right'}`, target: depth, center: [cx + s * (width / 2 + ctx.truss.width), cy, trim + ctx.truss.height], maxHoistSpacing: 6000, group: 'structure:grid', yaw: Math.PI / 2, layer: '30_RIGGING::30_05_GRID' });
      r.blocks.forEach(addBlock); objects.push(...r.objects.filter((o) => !o.id.startsWith('HOIST'))); runs++;
    }
    grid = { runs, width, depth, trim };
  }

  // ── delay towers in the field, each with a hang facing away from the stage
  let delays: StructureReport['delays'] = null;
  if (p.delays.enabled && p.delays.count > 0) {
    const n = Math.round(p.delays.count);
    const sp = ctx.mainSpeaker;
    const tk = towerKey(DELAY_TOWER, p.delays.height);
    const sk = sp ? addBlock(speakerBlock(sp, speakerBlockKey(sp))) : null;
    const boxes = 8;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -p.delays.spread / 2 + (p.delays.spread * i) / (n - 1);
      const y = -p.delays.distance;
      const tag = String(i + 1).padStart(2, '0');
      objects.push({ id: `DELAY.TOWER.${tag}`, label: `Delay tower ${i + 1}`, layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: 'structure:delays',
        block: tk, position: [x, y, 0], rotationZ: 0, meta: { bom: 'Delay tower (generic ground support)', verification: 'generic', height: p.delays.height } });
      if (sp && sk) for (let b = 0; b < boxes; b++)
        objects.push({ id: `SPK.DELAY.${tag}.${String(b + 1).padStart(2, '0')}`, label: `${sp.model} — delay ${i + 1} #${b + 1}`, layer: '50_AUDIO::50_05_DELAYS', system: 'audio', group: 'structure:delays',
          block: sk, position: [x, y - DELAY_TOWER / 2 - sp.depth / 2 - 100, p.delays.height - (b + 1) * sp.height], rotationZ: 0, tilt: (b * 1.5 * Math.PI) / 180,
          meta: { catalogId: sp.id, weightKg: sp.weightKg, hang: `Delay ${i + 1}`, box: b + 1 } });
    }
    const delayMs = Math.round(((p.delays.distance - Math.abs(ctx.mainsY)) / 343) * 10) / 10;
    delays = { count: n, distance: p.delays.distance, delayMs, speaker: sp };
    warnings.push({ level: 'info', code: 'structure.delays', target: 'structure:delays', message: `Delay towers ${(p.delays.distance / 1000).toFixed(0)} m out: about ${delayMs} ms behind the mains (sound at 343 m/s) before alignment.` });
  }

  // ── free truss members (local +Y along the member, cross-section centred on the line)
  let lengthMm = 0;
  for (const t of p.truss) {
    const [a, b] = [t.from, t.to];
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d);
    if (L < 500) continue;
    const yaw = Math.atan2(-d[0], d[1]), tilt = Math.atan2(d[2], Math.hypot(d[0], d[1]));
    const sections = pickTrussSections(ctx.truss, L);
    const len = sections.reduce((s, x) => s + x, 0);
    let off = -len / 2;
    sections.forEach((S, i) => {
      const key = addBlock({ key: `SC_TRUSS_FREE_${ctx.truss.id}_${S}`.replace(/[^\w]+/g, '_'), description: `${ctx.truss.manufacturer} ${ctx.truss.model} — ${S} mm section`, catalogId: ctx.truss.id,
        parts: trussSectionParts(ctx.truss, S).map((q) => alongY(q, ctx.truss.height)) });
      const m = off + S / 2, u = m / L;
      objects.push({
        id: `TRUSS.FREE.${t.id.toUpperCase()}.S${String(i + 1).padStart(2, '0')}`, label: `${ctx.truss.model} ${S / 1000} m`, layer: '30_RIGGING::30_01_TRUSS', system: 'rigging', group: `truss:free:${t.id}`,
        block: key, position: [(a[0] + b[0]) / 2 + d[0] * u, (a[1] + b[1]) / 2 + d[1] * u, (a[2] + b[2]) / 2 + d[2] * u], rotationZ: yaw, tilt,
        meta: { catalogId: ctx.truss.id, length: S, member: t.id },
      });
      off += S;
    });
    lengthMm += len;
  }

  return { report: { roof, grid, delays, freeTruss: { count: p.truss.length, lengthMm } } as StructureReport, objects, blocks: [...blocks.values()], warnings };
}

/** a truss section part (length along X, bottom face at z = 0) turned to run along Y with its axis at z = 0 */
function alongY(q: Part, h: number): Part {
  const t = (v: Vec3): Vec3 => [-v[1], v[0], v[2] - h / 2];
  if (q.kind === 'cyl') return { ...q, from: t(q.from), to: t(q.to) };
  if (q.kind === 'box') { const a = t(q.min), b = t(q.max); return { ...q, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), a[2]], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), b[2]] }; }
  return q;
}
