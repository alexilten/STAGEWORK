import type { Chair } from '../catalog';
import type { AudienceParams, SeatingParams, StandParams } from '../schema';
import type { Mm } from '../units';
import type { DeckArea } from './deck';
import { chairBlock, rowLabel } from './seating';
import type { BlockDef, Part, SceneObject, Warning } from './types';

/**
 * Standing (GA) floor, front-of-stage barricade and raked seating stands.
 *
 * Standing capacity = clear floor area × planning density. 2 persons / m² is the usual planning figure
 * for open-air events; above ~4 / m² a crowd is generally treated as unstable (see docs/RESEARCH.md).
 * The floor is kept clear of every deck area by the pit (barricade setback).
 *
 * Stands are checked with the C-value: the vertical distance between the eye of a spectator and the
 * sightline of the spectator behind, to the point of focus (the nearest deck edge at deck height).
 * 60 mm is the usual absolute minimum, 90 mm the recommended minimum, 120 mm optimum
 * (UK Guide to Safety at Sports Grounds, "Green Guide"). The venue / AHJ approves the final plan.
 */

export const STANDING_DENSITY = { planning: 2, max: 4 } as const;
export const C_VALUE = { min: 60, recommended: 90, optimum: 120 } as const;
/** seated eye height above the tread (same planning value as the end-stage sightline check) */
const SEATED_EYE = 1150;
/** figures are drawn no denser than this (persons / m²) so the floor stays readable */
const DRAW_DENSITY = 0.8;
const MAX_FIGURES = 5000;
const BARRICADE = { width: 1000, height: 1200, base: 1100 } as const;

export interface StandReport { id: string; name: string; seats: number; rows: number; minC: number | null; topHeight: Mm }
export interface AudienceReport {
  standing: { areaM2: number; capacity: number; density: number; figures: number; barricadeM: number; shape: 'front' | 'surround' } | null;
  stands: StandReport[];
  standSeats: number;
}

export interface AudienceContext {
  areas: DeckArea[];
  /** front-most deck edge on the centreline (curved apron or deck) */
  lipY: Mm;
  stageWidth: Mm;
  stageDepth: Mm;
  stageTop: Mm;
  centreStage: boolean;
  seating: SeatingParams;
  chair: Chair;
}

type Pt = [number, number];
interface Zone { inside: (x: number, y: number) => boolean; bounds: [number, number, number, number] }

/** deterministic jitter so the crowd doesn't move between renders */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function resolveAudience(p: AudienceParams, ctx: AudienceContext) {
  const objects: SceneObject[] = [];
  const blocks: BlockDef[] = [];
  const warnings: Warning[] = [];
  const st = p.standing;
  const ground = ctx.areas.filter((a) => a.base === 0);
  const pit = Math.max(0, st.pit);
  const centre: Pt = [0, ctx.stageDepth / 2];

  // keep-out: every deck area grown by the pit (circles for round decks)
  const clear = (x: number, y: number, grow: number, except?: DeckArea) => ground.every((a) => {
    if (a === except) return true;
    if (a.round) return Math.hypot(x - a.round.cx, y - a.round.cy) >= a.round.r + grow;
    return x <= a.minX - grow || x >= a.maxX + grow || y <= a.minY - grow || y >= a.maxY + grow;
  });

  let standing: AudienceReport['standing'] = null;
  if (st.enabled) {
    const zone: Zone = st.shape === 'surround'
      ? { inside: (x, y) => Math.hypot(x - centre[0], y - centre[1]) <= st.radius, bounds: [centre[0] - st.radius, centre[1] - st.radius, centre[0] + st.radius, centre[1] + st.radius] }
      : (() => {
          const top = ctx.lipY - pit, x0 = -st.width / 2, x1 = st.width / 2, y0 = top - st.depth;
          // the floor also wraps any thrust / runway / B-stage that reaches into it
          return { inside: (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= Math.max(top, y0), bounds: [x0, y0, x1, top] as [number, number, number, number] };
        })();
    const usable = (x: number, y: number) => zone.inside(x, y) && clear(x, y, pit);

    // area by sampling a 250 mm grid
    const g = 250;
    let cells = 0;
    for (let x = zone.bounds[0] + g / 2; x < zone.bounds[2]; x += g) for (let y = zone.bounds[1] + g / 2; y < zone.bounds[3]; y += g) if (usable(x, y)) cells++;
    const areaM2 = (cells * g * g) / 1e6;
    const density = Math.min(STANDING_DENSITY.max, Math.max(0.5, st.density));
    const capacity = Math.floor((areaM2 * density) / 10) * 10;

    // figures on a jittered grid
    let spacing = 1000 / Math.sqrt(Math.min(density, DRAW_DENSITY));
    if ((areaM2 * 1e6) / (spacing * spacing) > MAX_FIGURES) spacing = Math.sqrt((areaM2 * 1e6) / MAX_FIGURES);
    const rand = rng(7);
    const fig: BlockDef = {
      key: 'SC_PERSON_STANDING', description: 'Standing audience member (1.75 m planning figure)',
      parts: [
        { kind: 'cyl', from: [0, 0, 0], to: [0, 0, 1460], r: 190, mat: 'crowd' },
        { kind: 'cyl', from: [0, 0, 1500], to: [0, 0, 1740], r: 105, mat: 'crowd' },
      ],
    };
    let n = 0;
    for (let x = zone.bounds[0] + spacing / 2; x < zone.bounds[2]; x += spacing)
      for (let y = zone.bounds[1] + spacing / 2; y < zone.bounds[3]; y += spacing) {
        const px = x + (rand() - 0.5) * spacing * 0.7, py = y + (rand() - 0.5) * spacing * 0.7;
        if (!zone.inside(px, py) || !clear(px, py, pit + 300)) continue;
        n++;
        objects.push({
          id: `GA.P${String(n).padStart(4, '0')}`, label: 'Standing audience', layer: '70_AUDIENCE::70_03_STANDING', system: 'seating', group: 'audience:standing',
          // facing the middle of the stage (figures face −Y in their own frame)
          block: fig.key, position: [Math.round(px), Math.round(py), 0], rotationZ: +Math.atan2(centre[0] - px, -(centre[1] - py)).toFixed(3),
          meta: { bomSkip: true, figure: n }, figure: 'crowd',
        });
      }
    if (n) blocks.push(fig);

    // barricade: each deck edge the crowd faces, set back by the pit, minus the parts inside other deck areas
    let barricadeM = 0;
    if (st.barricade) {
      const pieces: Pt[][] = [];
      for (const a of ground) {
        if (a.round) {
          const r = a.round.r + pit, pts: Pt[] = [];
          for (let i = 0; i <= 96; i++) { const t = (i / 96) * Math.PI * 2; pts.push([a.round.cx + r * Math.cos(t), a.round.cy + r * Math.sin(t)]); }
          pieces.push(...keepRuns(pts, (x, y) => zone.inside(x, y) && clear(x, y, pit - 1, a)));
          continue;
        }
        const [x0, y0, x1, y1] = [a.minX - pit, a.minY - pit, a.maxX + pit, a.maxY + pit];
        const front = a.kind === 'main' && !ctx.centreStage ? Math.min(y0, ctx.lipY - pit) : y0;
        const edges: [Pt, Pt][] = [[[x1, front], [x0, front]]];
        if (a.kind !== 'main' || ctx.centreStage) edges.push([[x0, front], [x0, y1]], [[x1, y1], [x1, front]]);
        if (ctx.centreStage) edges.push([[x0, y1], [x1, y1]]);
        for (const [s, e] of edges) {
          const len = Math.hypot(e[0] - s[0], e[1] - s[1]), k = Math.max(2, Math.ceil(len / 250));
          const pts: Pt[] = Array.from({ length: k + 1 }, (_, i) => [s[0] + ((e[0] - s[0]) * i) / k, s[1] + ((e[1] - s[1]) * i) / k]);
          pieces.push(...keepRuns(pts, (x, y) => zone.inside(x, y) && clear(x, y, pit - 1, a)));
        }
      }
      const bar: BlockDef = {
        key: 'SC_BARRICADE_1M', description: 'Front-of-stage crowd barrier, 1 m section (generic)',
        // audience side is −Y: the footplate the front row stands on, then the upright panel and a rear brace
        parts: [
          { kind: 'box', min: [-BARRICADE.width / 2, -BARRICADE.base, 0], max: [BARRICADE.width / 2, 0, 30], mat: 'barricade' },
          { kind: 'box', min: [-BARRICADE.width / 2, 0, 0], max: [BARRICADE.width / 2, 60, BARRICADE.height], mat: 'barricade' },
          { kind: 'cyl', from: [-BARRICADE.width / 2 + 60, 60, BARRICADE.height - 100], to: [-BARRICADE.width / 2 + 60, 500, 0], r: 25, mat: 'barricade' },
          { kind: 'cyl', from: [BARRICADE.width / 2 - 60, 60, BARRICADE.height - 100], to: [BARRICADE.width / 2 - 60, 500, 0], r: 25, mat: 'barricade' },
        ],
      };
      let k = 0;
      for (const run of pieces) {
        for (let i = 0; i < run.length - 1; i++) {
          const [a, b] = [run[i], run[i + 1]];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          barricadeM += len / 1000;
        }
        // whole 1 m sections laid along the run
        const total = run.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) : 0), 0);
        const count = Math.max(1, Math.round(total / BARRICADE.width));
        for (let j = 0; j < count; j++) {
          const [pt, dir] = along(run, ((j + 0.5) * total) / count);
          // face the crowd: the side away from the deck
          let yaw = Math.atan2(dir[1], dir[0]);
          const nx = Math.sin(yaw), ny = -Math.cos(yaw);
          if (!clear(pt[0] + nx * 400, pt[1] + ny * 400, pit - 1)) yaw += Math.PI;
          k++;
          objects.push({
            id: `GA.BARRICADE.${String(k).padStart(3, '0')}`, label: 'Crowd barrier 1 m (generic)', layer: '70_AUDIENCE::70_04_BARRICADE', system: 'seating', group: 'audience:barricade',
            block: bar.key, position: [Math.round(pt[0]), Math.round(pt[1]), 0], rotationZ: yaw,
            meta: { bom: 'Front-of-stage crowd barrier, 1 m section', verification: 'generic', note: 'Planning envelope of a typical demountable front-of-stage barrier' },
          });
        }
      }
      if (k) blocks.push(bar);
    }

    standing = { areaM2: Math.round(areaM2), capacity, density, figures: n, barricadeM: +barricadeM.toFixed(1), shape: st.shape };
    warnings.push({ level: 'info', code: 'audience.standing', target: 'audience:standing', message: `Standing floor ≈ ${Math.round(areaM2).toLocaleString()} m² → ${capacity.toLocaleString()} people at ${density} / m². Figures are drawn at a lighter density for clarity. Egress, entry and crowd management need the venue / licensing authority.` });
    if (st.density > STANDING_DENSITY.max) warnings.push({ level: 'error', code: 'audience.density', target: 'audience:standing', message: `Above ${STANDING_DENSITY.max} people / m² a crowd is generally considered unsafe — capacity was capped.` });
    if (st.barricade && pit < 1200) warnings.push({ level: 'warn', code: 'audience.pit', target: 'audience:barricade', message: `A ${Math.round(pit)} mm pit is tight for security and first aid between the barricade and the stage.` });
  }

  // ── raked stands
  const stands: StandReport[] = [];
  let standSeats = 0;
  if (p.stands.length) {
    const chair = ctx.chair;
    const cb = chairBlock(chair);
    blocks.push(cb);
    for (const s of p.stands) {
      const r = resolveStand(s, ctx, chair, cb.key);
      objects.push(...r.objects);
      stands.push(r.report);
      standSeats += r.report.seats;
      if (r.report.minC != null && r.report.minC < C_VALUE.min)
        warnings.push({ level: 'warn', code: 'audience.cvalue', target: `audience:stand:${s.id}`, message: `${s.name}: C-value ${Math.round(r.report.minC)} mm is below the ${C_VALUE.min} mm minimum — steepen the rake (row rise) or start the stand higher.` });
      else if (r.report.minC != null && r.report.minC < C_VALUE.recommended)
        warnings.push({ level: 'info', code: 'audience.cvalue', target: `audience:stand:${s.id}`, message: `${s.name}: C-value ${Math.round(r.report.minC)} mm (recommended ≥ ${C_VALUE.recommended} mm).` });
    }
  }

  return { report: { standing, stands, standSeats } as AudienceReport, objects, blocks, warnings };
}

/** split a polyline into the runs whose points pass the test */
function keepRuns(pts: Pt[], ok: (x: number, y: number) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const q of pts) {
    if (ok(q[0], q[1])) cur.push(q);
    else { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  // a closed loop that passes everywhere: drop the duplicated end point
  return out;
}

function along(run: Pt[], d: number): [Pt, Pt] {
  let acc = 0;
  for (let i = 1; i < run.length; i++) {
    const [a, b] = [run[i - 1], run[i]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= d || i === run.length - 1) {
      const t = l ? Math.min(1, (d - acc) / l) : 0;
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)]];
    }
    acc += l;
  }
  return [run[0], [1, 0]];
}

/** nearest point of the main deck footprint (circle or rectangle) to a plan point */
function focusFrom(ctx: AudienceContext, x: number, y: number): Pt {
  const main = ctx.areas.find((a) => a.kind === 'main')!;
  if (main.round) {
    const { cx, cy, r } = main.round, d = Math.hypot(x - cx, y - cy) || 1;
    return [cx + ((x - cx) / d) * r, cy + ((y - cy) / d) * r];
  }
  const minY = Math.min(main.minY, ctx.lipY);
  return [Math.max(main.minX, Math.min(main.maxX, x)), Math.max(minY, Math.min(main.maxY, y))];
}

function resolveStand(s: StandParams, ctx: AudienceContext, chair: Chair, chairKey: string) {
  const objects: SceneObject[] = [];
  const rows = Math.max(1, Math.round(s.rows));
  const pitch = Math.max(chair.depth + 300, s.rowPitch);
  const rise = Math.max(0, s.rowRise);
  const seatPitch = ctx.seating.seatPitch, aisle = ctx.seating.aisleWidth, perBlock = Math.max(4, ctx.seating.seatsPerBlock);
  const group = `audience:stand:${s.id}`;
  let seats = 0;
  const rowEyes: { e: number; seat: Pt }[] = [];
  const tag = s.id.toUpperCase();

  for (let i = 0; i < rows; i++) {
    const top = s.base + i * rise;
    // tread: the stepped block under row i
    let tread: Pt[];
    const seatPts: { p: Pt; yaw: number }[] = [];
    if (s.kind === 'arc') {
      const r0 = s.r0 + i * pitch, r1 = r0 + pitch;
      const a0 = (s.a0 * Math.PI) / 180, a1 = (s.a1 * Math.PI) / 180;
      const n = Math.max(8, Math.ceil(((a1 - a0) * 180) / Math.PI / 3));
      tread = [];
      for (let k = 0; k <= n; k++) { const t = a0 + ((a1 - a0) * k) / n; tread.push([s.cx + r1 * Math.cos(t), s.cy + r1 * Math.sin(t)]); }
      for (let k = n; k >= 0; k--) { const t = a0 + ((a1 - a0) * k) / n; tread.push([s.cx + r0 * Math.cos(t), s.cy + r0 * Math.sin(t)]); }
      // seats: blocks of perBlock with an aisle between
      const rc = r0 + 120 + chair.depth / 2;
      const arcLen = (a1 - a0) * rc, blockLen = perBlock * seatPitch + aisle;
      const nb = Math.max(1, Math.floor((arcLen + aisle) / blockLen));
      const used = nb * blockLen - aisle, start = (arcLen - used) / 2;
      for (let b = 0; b < nb; b++) for (let k = 0; k < perBlock; k++) {
        const d = start + b * blockLen + (k + 0.5) * seatPitch, t = a0 + d / rc;
        seatPts.push({ p: [s.cx + rc * Math.cos(t), s.cy + rc * Math.sin(t)], yaw: t + Math.PI / 2 });
      }
    } else {
      const yaw = (s.yawDeg * Math.PI) / 180, ux: Pt = [Math.cos(yaw), Math.sin(yaw)], fw: Pt = [-Math.sin(yaw), Math.cos(yaw)];
      const at = (lx: number, ly: number): Pt => [s.x + ux[0] * lx + fw[0] * ly, s.y + ux[1] * lx + fw[1] * ly];
      const hw = s.width / 2;
      tread = [at(-hw, -i * pitch), at(hw, -i * pitch), at(hw, -(i + 1) * pitch), at(-hw, -(i + 1) * pitch)];
      const blockLen = perBlock * seatPitch + aisle;
      const nb = Math.max(1, Math.floor((s.width + aisle) / blockLen));
      const used = nb * blockLen - aisle;
      for (let b = 0; b < nb; b++) for (let k = 0; k < perBlock; k++) {
        const lx = -used / 2 + b * blockLen + (k + 0.5) * seatPitch;
        seatPts.push({ p: at(lx, -i * pitch - 120 - chair.depth / 2), yaw });
      }
    }
    // tread as a closed CCW plan polygon extruded from the floor to the row top
    const poly = area(tread) < 0 ? [...tread].reverse() : tread;
    objects.push({
      id: `STAND.${tag}.R${String(i + 1).padStart(2, '0')}`, label: `${s.name} tread ${rowLabel(i)}`, layer: '70_AUDIENCE::70_05_STANDS', system: 'seating', group,
      parts: [{ kind: 'prism', points: poly.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt), z0: 0, z1: Math.max(20, top), mat: 'stand' } as Part],
      position: [0, 0, 0], rotationZ: 0,
      meta: { bomSkip: true, row: rowLabel(i), height: Math.round(top) },
    });
    seatPts.forEach(({ p, yaw }, k) => {
      seats++;
      objects.push({
        id: `STAND.${tag}.${rowLabel(i)}.${k + 1}`, label: `${chair.model} ${s.name} ${rowLabel(i)}${k + 1}`, layer: '70_AUDIENCE::70_01_SEATING', system: 'seating', group,
        block: chairKey, position: [Math.round(p[0]), Math.round(p[1]), Math.round(top)], rotationZ: yaw,
        meta: { catalogId: chair.id, stand: s.name, row: rowLabel(i), seat: k + 1 },
      });
    });
    const mid = seatPts[Math.floor(seatPts.length / 2)]?.p;
    if (mid) rowEyes.push({ e: top + SEATED_EYE, seat: mid });
  }

  // C-value to the nearest deck edge at deck height, row by row along the middle of the stand
  let minC: number | null = null;
  for (let i = 1; i < rowEyes.length; i++) {
    const f: Pt = s.focus ? [s.focus[0], s.focus[1]] : focusFrom(ctx, rowEyes[i].seat[0], rowEyes[i].seat[1]);
    const Di = Math.hypot(rowEyes[i].seat[0] - f[0], rowEyes[i].seat[1] - f[1]);
    const Dp = Math.hypot(rowEyes[i - 1].seat[0] - f[0], rowEyes[i - 1].seat[1] - f[1]);
    if (Di <= Dp) continue;
    const F = s.focus ? s.focus[2] : ctx.stageTop;
    const c = F + (rowEyes[i].e - F) * (Dp / Di) - rowEyes[i - 1].e;
    minC = minC == null ? c : Math.min(minC, c);
  }
  const report: StandReport = { id: s.id, name: s.name, seats, rows, minC: minC == null ? null : Math.round(minC), topHeight: Math.round(s.base + (rows - 1) * rise) };
  return { objects, report };
}

function area(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}

