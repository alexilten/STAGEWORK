import type { Fixture, Hoist, TrussSystem } from '../catalog';
import type { LightingParams } from '../schema';
import type { Mm } from '../units';
import { buildTrussRun, fixtureParts } from './rigging';
import type { BlockDef, Part, SceneObject, Vec3, Warning } from './types';

/**
 * Lighting positions beyond the FOH truss: overhead electrics (horizontal battens
 * over the stage) and vertical side booms. Fixtures are hung as real catalogue
 * fixtures; the trim heights and counts are planning inputs, not a lighting design.
 */

export interface LightingPositionsReport {
  electrics: number;
  perBatten: number;
  booms: number;
  perBoom: number;
  fixtureTotal: number;
}

export interface LightingContext { stageWidth: Mm; stageDepth: Mm; stageTop: Mm }

const DEG = Math.PI / 180;
const fixtureKey = (f: Fixture) => `SC_FIX_${f.manufacturer}_${f.model}`.replace(/[^\w]+/g, '_');

export function resolveLighting(
  p: LightingParams, fx: Fixture, trussSys: TrussSystem, hoist: Hoist, ctx: LightingContext,
) {
  const objects: SceneObject[] = [];
  const blocks = new Map<string, BlockDef>();
  const warnings: Warning[] = [];
  const addBlock = (b: BlockDef) => { if (!blocks.has(b.key)) blocks.set(b.key, b); return b.key; };
  const fKey = addBlock({ key: fixtureKey(fx), description: `${fx.manufacturer} ${fx.model}`, catalogId: fx.id, parts: fixtureParts(fx) });
  let fixtureTotal = 0;

  const hangFixtures = (prefix: string, group: string, n: number, at: (i: number) => { pos: Vec3; rotationZ: number; tilt?: number; note: string }) => {
    for (let i = 0; i < n; i++) {
      const a = at(i);
      objects.push({
        id: `${prefix}.${String(i + 1).padStart(2, '0')}`, label: `${fx.manufacturer} ${fx.model}`, layer: '40_LIGHTING::40_01_FIXTURES', system: 'lighting', group,
        block: fKey, position: a.pos, rotationZ: a.rotationZ, tilt: a.tilt,
        meta: { catalogId: fx.id, type: fx.fixtureType, weightKg: fx.weightKg, powerMaxW: fx.powerMaxW, position: a.note },
      });
      fixtureTotal++;
    }
  };

  // ── overhead electrics: horizontal battens spanning the stage width
  const e = p.electrics;
  const nE = Math.max(0, Math.round(e.count));
  for (let b = 0; b < nE; b++) {
    const y = Math.min(ctx.stageDepth - 200, e.firstAt + b * e.spacing);
    const run = buildTrussRun(trussSys, hoist, {
      id: `ELX${b + 1}`, name: `Electric ${b + 1}`, target: ctx.stageWidth,
      center: [0, y, e.trim], maxHoistSpacing: 6000, group: `elx:${b + 1}`,
    });
    for (const o of run.objects) { o.layer = o.layer === '30_RIGGING::30_01_TRUSS' ? '40_LIGHTING::40_03_POSITIONS' : o.layer; o.system = 'lighting'; }
    run.blocks.forEach(addBlock); objects.push(...run.objects);
    const m = Math.max(0, Math.round(e.perBatten));
    const usable = run.run.length - 600;
    hangFixtures(`FIX.ELX${b + 1}`, `elx:${b + 1}`, m, (i) => ({
      pos: [m === 1 ? 0 : -usable / 2 + (usable * i) / (m - 1), y, run.run.bottom], rotationZ: 0, note: `Electric ${b + 1} #${i + 1}`,
    }));
  }
  if (nE > 0 && e.trim < ctx.stageTop + 3000)
    warnings.push({ level: 'warn', code: 'light.elx.trim', target: 'elx:1', message: `Electrics trim is only ${Math.round(e.trim - ctx.stageTop)} mm above the deck — check head clearance and sightlines.` });

  // ── side booms, house left (−X) and right (+X): a vertical pipe with side-mounted fixtures aimed inboard
  const bm = p.booms;
  let booms = 0;
  if (bm.enabled && bm.perBoom > 0) {
    const pipeR = 24;
    const bx = ctx.stageWidth / 2 + 700;
    const pipeKey = addBlock({
      key: `SC_BOOM_${Math.round(bm.height)}`, description: `Lighting boom Ø48 × ${Math.round(bm.height)} mm`, catalogId: trussSys.id,
      parts: [
        { kind: 'cyl', from: [0, 0, 0], to: [0, 0, bm.height], r: pipeR, mat: 'truss' },
        { kind: 'box', min: [-300, -300, 0], max: [300, 300, 20], mat: 'hoist' },
      ],
    });
    for (const side of [-1, 1] as const) {
      objects.push({
        id: `BOOM.${side < 0 ? 'L' : 'R'}`, label: `Lighting boom — ${side < 0 ? 'house left' : 'house right'}`, layer: '40_LIGHTING::40_03_POSITIONS', system: 'lighting', group: `boom:${side < 0 ? 'l' : 'r'}`,
        block: pipeKey, position: [side * bx, ctx.stageDepth * 0.4, ctx.stageTop], rotationZ: 0,
        meta: { height: Math.round(bm.height), side: side < 0 ? 'House left' : 'House right' },
      });
      const m = Math.max(0, Math.round(bm.perBoom));
      const lo = 600, hi = bm.height - 300;
      hangFixtures(`FIX.BOOM${side < 0 ? 'L' : 'R'}`, `boom:${side < 0 ? 'l' : 'r'}`, m, (i) => ({
        // head points inboard: pitch 90° (head to horizontal) then yaw so it aims across the stage
        pos: [side * bx, ctx.stageDepth * 0.4, ctx.stageTop + (m === 1 ? hi : lo + ((hi - lo) * i) / (m - 1))],
        rotationZ: side < 0 ? -Math.PI / 2 : Math.PI / 2, tilt: 90 * DEG,
        note: `${side < 0 ? 'SL' : 'SR'} boom #${i + 1}`,
      }));
      booms++;
    }
  }

  const report: LightingPositionsReport = { electrics: nE, perBatten: Math.round(e.perBatten), booms, perBoom: Math.round(bm.perBoom), fixtureTotal };
  return { report, objects, blocks: [...blocks.values()], warnings };
}

export { fixtureKey };
export type { Part };
