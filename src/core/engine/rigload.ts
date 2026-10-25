/**
 * Hoists onto venue rigging points, and the load on every point.
 *
 * Snapping: each hoist slides along its truss to the nearest free rated point that lies within
 * SNAP_PERP of the truss line in plan and within reach of where the run wanted it, keeping the
 * hoists in order. A point that sits off the truss line needs a bridle (or a short drop at an angle);
 * those are counted. Hoists with no point in reach stay where they were and are reported.
 *
 * Loads (planning only): truss self-weight (published section weights), fixtures hung under the
 * run, and the LED wall hung from a header truss, split onto the hoists by the lever rule as if
 * each span between neighbouring hoists were simply supported (overhangs as cantilevers). A
 * continuous truss puts more on its inner hoists than this, so the check flags points above
 * NEAR of their rating as well as those over it. Point load = hoist reaction + hoist and chain.
 * Riggers and the venue's rigging plot decide; this is a first look.
 */
import type { Hoist } from '../catalog';
import type { LedLayout } from './led';
import type { BlockDef, SceneObject, Warning } from './types';

const SNAP_PERP = 1000;
/** points closer together than this along a truss are not both used */
const MIN_GAP = 600;
/** a generic 1 t chain hoist with its chain, when the catalogue has no weight (planning) */
const HOIST_KG = 60;
const OFF_LINE = 150;
const NEAR = 0.8;
/** 12″ / 290 mm box truss, when no section of the system has a published weight (planning) */
const TRUSS_KG_M = 7;

export interface RigPointLoad { id: string; x: number; y: number; kg: number; ratingKg: number; hoist: string; offLine: number }
export interface RigLoadReport {
  hoists: number;
  snapped: number;
  unsnapped: number;
  bridled: number;
  points: RigPointLoad[];
  maxPointKg: number;
  ratingKg: number | null;
  over: number;
  near: number;
  maxHoistKg: number;
  hoistCapacityKg: number;
  /** some fixture or LED weight is not published (left out of the loads) */
  incomplete: boolean;
  /** some truss section weights were estimated per metre from the system's published sections */
  estimated: boolean;
}

interface Run { id: string; cx: number; cy: number; ux: number; uy: number; length: number; z: number; hoists: SceneObject[] }

export function snapAndLoad(objects: SceneObject[], hoist: Hoist, led: LedLayout[], opts: { snap: boolean }) {
  const warnings: Warning[] = [];
  const blocks: BlockDef[] = [];
  const extra: SceneObject[] = [];
  const hoistKg = hoist.weightKg ?? HOIST_KG;

  // runs from their hoists
  const runs = new Map<string, Run>();
  for (const o of objects) {
    if (o.layer !== '30_RIGGING::30_02_HOISTS' || typeof o.meta.run !== 'string') continue;
    let r = runs.get(o.meta.run);
    if (!r) {
      const ux = Math.cos(o.rotationZ), uy = Math.sin(o.rotationZ), a = Number(o.meta.along);
      r = { id: o.meta.run, cx: o.position[0] - ux * a, cy: o.position[1] - uy * a, ux, uy, length: Number(o.meta.runLength), z: o.position[2], hoists: [] };
      runs.set(r.id, r);
    }
    r.hoists.push(o);
  }

  // venue points (rated rigging points of the venue shell)
  const points = objects.filter((o) => o.system === 'venue' && o.block === 'SC_VENUE_RIG_POINT');
  const ratingKg = points.length ? Number(points[0].meta.ratingKg) || null : null;
  const used = new Map<string, SceneObject>(); // point id → hoist
  const pointOf = new Map<string, SceneObject>(); // hoist id → point
  let snapped = 0, unsnapped = 0, bridled = 0;

  if (opts.snap && points.length) {
    for (const r of runs.values()) {
      const hs = [...r.hoists].sort((a, b) => Number(a.meta.along) - Number(b.meta.along));
      const cand = points.map((p) => {
        const dx = p.position[0] - r.cx, dy = p.position[1] - r.cy;
        return { p, t: dx * r.ux + dy * r.uy, perp: Math.abs(-dx * r.uy + dy * r.ux) };
      }).filter((c) => c.perp <= SNAP_PERP && Math.abs(c.t) <= r.length / 2 - 150 && c.p.position[2] > r.z);
      const spacing = hs.length > 1 ? (Number(hs[hs.length - 1].meta.along) - Number(hs[0].meta.along)) / (hs.length - 1) : r.length;
      const reach = Math.max(1500, spacing * 0.6);
      let prev = -Infinity;
      for (const h of hs) {
        const want = Number(h.meta.along);
        let best: (typeof cand)[number] | null = null, score = Infinity;
        for (const c of cand) {
          if (used.has(c.p.id) || c.t < prev + MIN_GAP || Math.abs(c.t - want) > reach) continue;
          const s = Math.abs(c.t - want) + 0.5 * c.perp;
          if (s < score) { score = s; best = c; }
        }
        if (!best) { unsnapped++; continue; }
        used.set(best.p.id, h); pointOf.set(h.id, best.p);
        prev = best.t;
        h.position = [Math.round(r.cx + r.ux * best.t), Math.round(r.cy + r.uy * best.t), h.position[2]];
        h.meta = { ...h.meta, along: Math.round(best.t), rigPoint: best.p.id, offLine: Math.round(best.perp) };
        if (best.perp > OFF_LINE) bridled++;
        snapped++;
        // the chain up to the point
        const top = h.position[2] + 600 + hoist.bodyH, pz = best.p.position[2] - 220;
        if (pz > top) extra.push({
          id: `${h.id}.CHAIN`, label: `${hoist.model} chain to ${best.p.id}`, layer: '30_RIGGING::30_03_HARDWARE', system: 'rigging', group: h.group,
          parts: [{ kind: 'cyl', from: [h.position[0], h.position[1], top], to: [best.p.position[0], best.p.position[1], pz], r: 6, mat: 'hoist' }],
          position: [0, 0, 0], rotationZ: 0, meta: { bomSkip: true, rigPoint: best.p.id, dropMm: Math.round(pz - top) },
        });
      }
      // spans that grew past the run's own spacing limit after snapping
      const max = Number(hs[0]?.meta.maxSpacing) || 0;
      const at = hs.map((h) => Number(h.meta.along)).sort((a, b) => a - b);
      for (let i = 1; i < at.length; i++) if (max && at[i] - at[i - 1] > max * 1.25) {
        warnings.push({ level: 'warn', code: 'rig.span', target: hs[0].group, message: `${hs[0].meta.run} spans ${((at[i] - at[i - 1]) / 1000).toFixed(1)} m between hoists on the venue points — more than its ${(max / 1000).toFixed(0)} m limit. Add a point or a bridle.` });
        break;
      }
    }
  }

  // loads on each run
  const hoistLoad = new Map<string, number>();
  let incomplete = false, estimated = false;
  const perM = new Map<string, number>();
  const kgPerM = (sys: string) => {
    if (!perM.has(sys)) {
      const known = objects.filter((o) => o.meta.catalogId === sys && o.meta.runId && typeof o.meta.weightKg === 'number');
      const len = known.reduce((a, o) => a + Number(o.meta.length), 0), kg = known.reduce((a, o) => a + Number(o.meta.weightKg), 0);
      perM.set(sys, len ? (kg / len) * 1000 : TRUSS_KG_M);
    }
    return perM.get(sys)!;
  };
  for (const r of runs.values()) {
    const loads: [number, number][] = []; // (along, kg)
    const along = (x: number, y: number) => (x - r.cx) * r.ux + (y - r.cy) * r.uy;
    const perp = (x: number, y: number) => Math.abs(-(x - r.cx) * r.uy + (y - r.cy) * r.ux);
    for (const o of objects) {
      if (o.meta.runId === r.id) {
        const L = Number(o.meta.length) || 1000, t = along(o.position[0], o.position[1]), n = Math.max(1, Math.round(L / 250));
        // a section without a published weight takes the per-metre weight of its published siblings
        const kg = typeof o.meta.weightKg === 'number' ? o.meta.weightKg : (estimated = true, (L / 1000) * kgPerM(String(o.meta.catalogId)));
        for (let i = 0; i < n; i++) loads.push([t - L / 2 + (L * (i + 0.5)) / n, kg / n]);
      } else if (o.layer === '40_LIGHTING::40_01_FIXTURES' && perp(o.position[0], o.position[1]) < 600 && Math.abs(o.position[2] - r.z) < 1500) {
        if (typeof o.meta.weightKg !== 'number') { incomplete = true; continue; }
        loads.push([along(o.position[0], o.position[1]), o.meta.weightKg]);
      }
    }
    // an LED wall hangs from its header truss
    const wall = r.id.startsWith('HDR_') ? led.find((L) => `HDR_${L.id.toUpperCase()}` === r.id) : undefined;
    if (wall) {
      if (wall.weightKg == null) incomplete = true;
      else { const n = Math.max(2, wall.cols); for (let i = 0; i < n; i++) loads.push([along(wall.origin[0] - wall.chord / 2 + (wall.chord * (i + 0.5)) / n, r.cy), wall.weightKg / n]); }
    }
    const hs = [...r.hoists].sort((a, b) => Number(a.meta.along) - Number(b.meta.along));
    const s = hs.map((h) => Number(h.meta.along));
    const R = s.map(() => 0);
    for (const [a, P] of loads) {
      if (s.length === 1) { R[0] += P; continue; }
      let i = s.findIndex((_, k) => k < s.length - 1 && a <= s[k + 1]);
      if (i < 0) i = s.length - 2;
      const L = s[i + 1] - s[i] || 1;
      R[i] += (P * (s[i + 1] - a)) / L;
      R[i + 1] += (P * (a - s[i])) / L;
    }
    hs.forEach((h, k) => {
      hoistLoad.set(h.id, R[k]);
      h.meta = { ...h.meta, loadKg: Math.round(R[k]) };
    });
  }

  // every used point: what hangs on it
  const loads: RigPointLoad[] = [];
  for (const [pid, h] of used) {
    const p = points.find((q) => q.id === pid)!;
    const kg = Math.round((hoistLoad.get(h.id) ?? 0) + hoistKg);
    loads.push({ id: pid, x: p.position[0], y: p.position[1], kg, ratingKg: Number(p.meta.ratingKg) || 0, hoist: h.id, offLine: Number(h.meta.offLine) || 0 });
  }
  const over = loads.filter((l) => l.ratingKg && l.kg > l.ratingKg);
  const near = loads.filter((l) => l.ratingKg && l.kg <= l.ratingKg && l.kg > l.ratingKg * NEAR);
  // colour the points: loaded, near the rating, over it
  if (loads.length) {
    const box = (mat: 'rigPointLoaded' | 'rigPointOver'): BlockDef['parts'] => [{ kind: 'box', min: [-130, -130, -240], max: [130, 130, 0], mat }];
    blocks.push({ key: 'SC_VENUE_RIG_POINT_LOADED', description: 'Rated rigging point carrying a hoist', parts: box('rigPointLoaded') });
    if (over.length || near.length) blocks.push({ key: 'SC_VENUE_RIG_POINT_OVER', description: 'Rated rigging point over (or close to) its rating', parts: box('rigPointOver') });
    for (const l of loads) {
      const p = points.find((q) => q.id === l.id)!;
      const hot = l.ratingKg && l.kg > l.ratingKg * NEAR;
      p.block = hot ? 'SC_VENUE_RIG_POINT_OVER' : 'SC_VENUE_RIG_POINT_LOADED';
      p.meta = { ...p.meta, loadKg: l.kg, hoist: l.hoist, utilisation: l.ratingKg ? Math.round((l.kg / l.ratingKg) * 100) : null };
    }
  }
  const fmt = (kg: number) => `${kg.toLocaleString()} kg`;
  if (over.length) warnings.push({ level: 'error', code: 'rig.point.over', target: 'venue', message: `${over.length} rigging point${over.length > 1 ? 's carry' : ' carries'} more than ${fmt(ratingKg ?? 0)} (worst ${fmt(Math.max(...over.map((l) => l.kg)))}). Add hoists, split the load with a bridle or lighten the run.` });
  else if (near.length) warnings.push({ level: 'warn', code: 'rig.point.near', target: 'venue', message: `${near.length} rigging point${near.length > 1 ? 's are' : ' is'} above ${Math.round(NEAR * 100)}% of the ${fmt(ratingKg ?? 0)} rating — a continuous truss loads its inner points more than this estimate.` });
  if (unsnapped) warnings.push({ level: 'warn', code: 'rig.unsnapped', target: 'venue', message: `${unsnapped} hoist${unsnapped > 1 ? 's have' : ' has'} no venue rigging point within ${SNAP_PERP / 1000} m of the truss line — they need a bridle, a beam clamp on the steel or a sub-grid.` });
  if (bridled) warnings.push({ level: 'info', code: 'rig.bridle', target: 'venue', message: `${bridled} hoist${bridled > 1 ? 's hang' : ' hangs'} from a point more than ${OFF_LINE} mm off the truss line — bridle it to land the chain plumb.` });
  const maxHoistKg = Math.round(Math.max(0, ...hoistLoad.values()));
  if (maxHoistKg > hoist.capacityKg) warnings.push({ level: 'error', code: 'rig.hoist.over', message: `A hoist carries about ${fmt(maxHoistKg)}, over its ${fmt(hoist.capacityKg)} working load. Add hoists or use a larger motor.` });

  const report: RigLoadReport = {
    hoists: [...runs.values()].reduce((a, r) => a + r.hoists.length, 0), snapped, unsnapped, bridled, points: loads,
    maxPointKg: loads.length ? Math.max(...loads.map((l) => l.kg)) : 0, ratingKg, over: over.length, near: near.length,
    maxHoistKg, hoistCapacityKg: hoist.capacityKg, incomplete, estimated,
  };
  return { report, warnings, blocks, objects: extra };
}
