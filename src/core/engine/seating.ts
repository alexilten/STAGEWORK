import type { Chair } from '../catalog';
import type { SeatingLayout, SeatingParams } from '../schema';
import type { Mm } from '../units';
import type { Annotation, BlockDef, Part, SceneObject, Warning } from './types';

/**
 * Audience seating.
 *
 * Rules that come from code (US assembly occupancies — IBC / IFC Chapter 10, NFPA 101 Ch. 12–13):
 *  - clear width between rows ≥ 12″ for rows of up to 14 seats; +0.3″ per seat beyond 14, up to 22″
 *    (rows served by aisles at both ends, max 100 seats per row)
 *  - wheelchair spaces per the 2010 ADA Standards table 221.2.1.1, plus one companion seat each (221.3)
 *  - placed spaces (2010 ADA 802, access-board.gov, accessed 2026-10-25): 36″ (915 mm) wide alone,
 *    33″ (840 mm) each when two adjoin (802.1.2); 48″ (1220 mm) deep entered from the front or rear,
 *    60″ (1525 mm) from the side only (802.1.3); they adjoin an accessible route and do not overlap
 *    circulation (802.1.4–5); companion seats beside each space, shoulder-aligned 36″ (915 mm) back
 *    from the front of the space, and may be movable (802.3); dispersed across the house and at
 *    varying distances from the stage (221.2.3.1–2)
 * Planning defaults (common practice, NOT code): 36″ row pitch, 22″ seat pitch, 42″ aisles,
 * a cross aisle every 20 rows, ~10′ from the deck edge to the front row.
 * The local authority having jurisdiction always decides the final plan.
 */

export const SEAT_COUNT = { min: 250, max: 5000, step: 250 } as const;
export const CROSS_AISLE_EVERY = 20;
/** radial fan half-angle (a 90° fan) */
export const RADIAL_HALF_ANGLE_DEG = 45;

const IN = 25.4;
const CLEAR_MIN = 12 * IN;
const CLEAR_MAX = 22 * IN;

/** Minimum clear width between rows for a row of `seats` with aisles at both ends. */
export function requiredRowClear(seats: number): Mm {
  return Math.min(CLEAR_MAX, CLEAR_MIN + Math.max(0, seats - 14) * 0.3 * IN);
}

/** Most seats a row may hold (aisles at both ends) for a given clear width between rows. */
export function maxSeatsPerRow(clear: Mm): number {
  if (clear < CLEAR_MIN - 0.01) return 0;
  if (clear >= CLEAR_MAX - 0.01) return 100;
  return Math.min(100, 14 + Math.floor((clear - CLEAR_MIN) / (0.3 * IN) + 1e-6));
}

/** 2010 ADA Standards, table 221.2.1.1. */
export function wheelchairSpaces(seats: number): number {
  if (seats < 4) return 0;
  if (seats <= 25) return 1;
  if (seats <= 50) return 2;
  if (seats <= 150) return 4;
  if (seats <= 300) return 5;
  if (seats <= 500) return 6;
  if (seats <= 5000) return 6 + Math.ceil((seats - 500) / 150);
  return 36 + Math.ceil((seats - 5000) / 200);
}

/** Theatre row letters, skipping I and O (they read as 1 and 0). */
export function rowLabel(i: number): string {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  let n = i;
  do { s = L[n % L.length] + s; n = Math.floor(n / L.length) - 1; } while (n >= 0);
  return s;
}

const WC = { single: 36 * IN, paired: 33 * IN, depth: 48 * IN, shoulder: 36 * IN } as const;
export const WHEELCHAIR_SPACE = WC;

export interface WheelchairSpace {
  /** centre of the space on the floor, world mm */
  x: number; y: number;
  /** facing, like a chair (0 = facing +Y, the stage) */
  rot: number;
  width: Mm; depth: Mm;
  row: string;
  /** front: from the open floor in front (front row or a cross aisle); rear: from behind the last row; side: from an aisle (60″ deep) */
  entry: 'front' | 'rear' | 'side';
}

export interface SeatingReport {
  layout: SeatingLayout;
  requested: number;
  count: number;
  rows: number;
  sections: number;
  longestRow: number;
  /** effective back-to-back pitch (grid may widen it to satisfy the clear-width rule) */
  rowPitch: Mm;
  rowClear: Mm;
  maxSeatsPerRow: number;
  width: Mm;
  depth: Mm;
  /** nearest seat front to the deck, measured on the centreline */
  frontDistance: Mm;
  wheelchairSpaces: number;
  /** wheelchair spaces placed in the plan (0 when placement is off) */
  wheelchairPlaced: WheelchairSpace[];
  /** chairs + placed wheelchair spaces */
  capacity: number;
  /** seats removed for camera positions (see broadcast.ts) */
  seatKills?: number;
  chair: Chair;
  /** plan extents of the seating (world mm) */
  min: [number, number];
  max: [number, number];
}

interface Seat { x: number; y: number; rot: number; section: number; row: number; companion?: boolean }

type Rect = { minX: number; maxX: number; minY: number; maxY: number };
export interface SeatingContext {
  stageWidth: Mm;
  stageDepth: Mm;
  /** floor-level deck areas (main, thrust, runway, apron) the audience keeps clear of */
  keepOut?: Rect[];
  /** curved apron depth in front of the main deck */
  apronDepth?: Mm;
}

/**
 * Does a seat (front edge centre at x, yFront; facing +Y) keep clear of every deck area?
 * Directly in front of a deck edge it needs `frontClear`; beside or behind one, an aisle width.
 */
function seatClear(ctx: SeatingContext, p: SeatingParams, chair: Chair, x: number, yFront: number, frontClear: number) {
  const hw = chair.width / 2;
  const rects = ctx.keepOut ?? [{ minX: -ctx.stageWidth / 2, maxX: ctx.stageWidth / 2, minY: 0, maxY: ctx.stageDepth }];
  for (const r of rects) {
    const cx = (r.minX + r.maxX) / 2, hwR = (r.maxX - r.minX) / 2;
    const dx = Math.abs(x - cx) - hwR - hw;
    const gapFront = r.minY - yFront;
    const gapBehind = yFront - chair.depth - r.maxY;
    if (dx < 0) {
      if (gapBehind >= p.aisleWidth - 0.5) continue;
      if (gapFront < frontClear - 0.5) return false;
    } else {
      const gy = Math.max(0, gapFront, gapBehind);
      if (Math.hypot(dx, gy) < p.aisleWidth - 0.5) return false;
    }
  }
  return true;
}

export function chairBlock(chair: Chair): BlockDef {
  const { width: w, depth: d, height: h, seatHeight: sh } = chair;
  const t = 30, r = 10;
  const parts: Part[] = [
    { kind: 'box', min: [-w / 2, -d / 2 + t, sh - 40], max: [w / 2, d / 2, sh], mat: 'chairSeat' },
    { kind: 'box', min: [-w / 2, -d / 2, sh + 70], max: [w / 2, -d / 2 + t, h], mat: 'chairSeat' },
  ];
  // back legs run up into the backrest; front legs stop under the seat
  for (const sx of [-1, 1]) {
    parts.push({ kind: 'cyl', from: [sx * (w / 2 - 25), -d / 2 + t / 2, 0], to: [sx * (w / 2 - 25), -d / 2 + t / 2, h - 30], r, mat: 'chairFrame' });
    parts.push({ kind: 'cyl', from: [sx * (w / 2 - 25), d / 2 - 35, 0], to: [sx * (w / 2 - 25), d / 2 - 35, sh - 40], r, mat: 'chairFrame' });
  }
  return { key: `SC_CHAIR_${chair.id}`.replace(/[^\w]+/g, '_').toUpperCase(), description: `${chair.manufacturer} ${chair.model}`, catalogId: chair.id, parts };
}

/** Keep exactly `n` seats of the last row, closest to the centre first so partial rows stay centred. */
function trimLastRow(seats: Seat[], n: number) {
  return [...seats].sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.x - b.x).slice(0, n);
}

const roundUp = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

function straight(p: SeatingParams, chair: Chair, ctx: SeatingContext, perSection: number, sections: number, rowPitch: Mm) {
  const cd = chair.depth;
  const sw = perSection * p.seatPitch;
  const width = sections * sw + (sections - 1) * p.aisleWidth;
  const y0 = -p.frontDistance - (ctx.apronDepth ?? 0);
  const out: Seat[] = [];
  let r = 0;
  for (; out.length < p.count && r < 400; r++) {
    const yFront = y0 - r * rowPitch - Math.floor(r / CROSS_AISLE_EVERY) * p.aisleWidth;
    const row: Seat[] = [];
    for (let s = 0; s < sections; s++)
      for (let k = 0; k < perSection; k++) {
        const x = -width / 2 + s * (sw + p.aisleWidth) + (k + 0.5) * p.seatPitch;
        if (seatClear(ctx, p, chair, x, yFront, p.frontDistance)) row.push({ x, y: yFront - cd / 2, rot: 0, section: s, row: r });
      }
    const left = p.count - out.length;
    out.push(...(left < row.length ? trimLastRow(row, left) : row));
  }
  return { seats: out, rows: r, width };
}

function radial(p: SeatingParams, chair: Chair, ctx: SeatingContext, perSection: number, rowPitch: Mm) {
  const cd = chair.depth;
  const fy = ctx.stageDepth / 2; // focus on the middle of the deck
  const half = (RADIAL_HALF_ANGLE_DEG * Math.PI) / 180;
  const out: Seat[] = [];
  let r = 0, sectionsMax = 0, zoneSectors = 0;
  const R0 = fy + p.frontDistance + (ctx.apronDepth ?? 0);
  // curved rows come closer to the deck towards their ends; they always keep at least an aisle width
  const frontClear = Math.min(p.frontDistance, p.aisleWidth);
  while (out.length < p.count && r < 400) {
    const zone = Math.floor(r / CROSS_AISLE_EVERY);
    const R = R0 + r * rowPitch + zone * p.aisleWidth;
    if (r % CROSS_AISLE_EVERY === 0) {
      // sectors for this zone sized on its middle row; rows behind it are capped at the per-section limit
      const Rb = R + ((CROSS_AISLE_EVERY - 1) / 2) * rowPitch;
      zoneSectors = Math.max(1, Math.ceil((2 * half * Rb + p.aisleWidth) / (perSection * p.seatPitch + p.aisleWidth)));
      sectionsMax = Math.max(sectionsMax, zoneSectors);
    }
    const S = zoneSectors;
    const span = (2 * half) / S;
    const row: Seat[] = [];
    for (let s = 0; s < S; s++) {
      let a0 = -half + s * span, a1 = a0 + span;
      if (s > 0) a0 += p.aisleWidth / 2 / R;
      if (s < S - 1) a1 -= p.aisleWidth / 2 / R;
      const n = Math.min(perSection, Math.floor(((a1 - a0) * R) / p.seatPitch + 1e-9));
      const step = p.seatPitch / R;
      const mid = (a0 + a1) / 2;
      for (let k = 0; k < n; k++) {
        const th = mid + (k - (n - 1) / 2) * step;
        const xf = R * Math.sin(th), yf = fy - R * Math.cos(th);
        if (!seatClear(ctx, p, chair, xf, yf, frontClear)) continue;
        const rc = R + cd / 2;
        row.push({ x: rc * Math.sin(th), y: fy - rc * Math.cos(th), rot: th, section: s, row: r });
      }
    }
    const left = p.count - out.length;
    out.push(...(left < row.length ? trimLastRow(row, left) : row));
    r++;
  }
  return { seats: out, rows: r, sections: sectionsMax };
}

/**
 * Cut wheelchair bays into the rows. Preferred: [companion][space][space][companion] (or
 * [space][companion] for an odd one out) in rows with open floor in front (the front row, the
 * first row behind each cross aisle) or behind (the last row), so each space adjoins a route
 * without sitting in it; bays go round those rows first (vertical dispersion), then out across
 * the blocks (horizontal dispersion), centre first. Where those rows run out (short front rows
 * of a radial fan), single side-entry spaces (60″ deep) go at block ends beside an aisle, part-way
 * back. Companion chairs move back to the shoulder line.
 */
function placeWheelchairs(seats: Seat[], need: number, layout: SeatingLayout, chair: Chair, seatPitch: Mm, capacity: number) {
  const kill = new Set<Seat>();
  const spaces: WheelchairSpace[] = [];
  if (!need || !seats.length) return { seats, spaces };
  const rows = new Map<number, Seat[]>();
  for (const s of seats) (rows.get(s.row) ?? rows.set(s.row, []).get(s.row)!).push(s);
  const rowIds = [...rows.keys()].sort((a, b) => a - b);
  const last = rowIds[rowIds.length - 1];
  const used = new Set<number>();
  const sectionsOf = (row: Seat[]) => {
    const bySec = new Map<number, Seat[]>();
    for (const s of row) (bySec.get(s.section) ?? bySec.set(s.section, []).get(s.section)!).push(s);
    return [...bySec.values()].map((v) => v.sort((a, b) => a.x - b.x || a.y - b.y));
  };
  const frame = (a: Seat) => {
    const t: [number, number] = [Math.cos(a.rot), Math.sin(a.rot)], f: [number, number] = [-Math.sin(a.rot), Math.cos(a.rot)];
    const uv = (s: Seat) => [(s.x - a.x) * t[0] + (s.y - a.y) * t[1], -((s.x - a.x) * f[0] + (s.y - a.y) * f[1])] as const;
    const at = (u: number, v: number): [number, number] => [a.x + t[0] * u - f[0] * v, a.y + t[1] * u - f[1] * v];
    return { uv, at };
  };
  const shift = Math.max(0, WC.shoulder - (chair.depth - 60)); // companion's back rest on the space's shoulder line
  const hw = chair.width / 2, front = -chair.depth / 2;

  /** spaces between uLo and uHi in a's frame, companions on `sides`; false if it does not fit */
  const bay = (a: Seat, row: number, uLo: number, uHi: number, n: number, depth: Mm, sides: number[], entry: WheelchairSpace['entry']) => {
    const { uv, at } = frame(a);
    const rowSeats = rows.get(row)!.filter((x) => !kill.has(x) && !x.companion && Math.abs(uv(x)[1]) < chair.depth);
    const comps: Seat[] = [];
    for (const sg of sides) {
      const edge = sg > 0 ? uHi : uLo;
      const c = rowSeats.filter((x) => sg * (uv(x)[0] - edge) >= hw - 1).sort((p, q) => sg * (uv(p)[0] - uv(q)[0]))[0];
      if (!c || Math.abs(uv(c)[0] - edge) > hw + seatPitch) return false;
      comps.push(c);
    }
    const cu = comps.map((c) => uv(c)[0]);
    const lo = Math.min(uLo, ...cu.map((u) => u - hw)), hi = Math.max(uHi, ...cu.map((u) => u + hw));
    const depthClear = Math.max(depth, shift + chair.depth);
    for (const x of seats) {
      if (kill.has(x) || comps.includes(x)) continue;
      const [u, v] = uv(x);
      const inDepth = v + chair.depth / 2 > front + 1 && v - chair.depth / 2 < front + depthClear - 1;
      if (!inDepth) continue;
      const inSpace = u + hw > uLo + 1 && u - hw < uHi - 1;
      const behind = u + hw > lo + 1 && u - hw < hi - 1 && v > chair.depth / 2;
      if (inSpace || behind) kill.add(x);
    }
    for (const c of comps) { const [u] = uv(c); [c.x, c.y] = at(u, front + shift + chair.depth / 2); c.companion = true; }
    const w = (uHi - uLo) / n;
    for (let k = 0; k < n; k++) {
      const [x, y] = at(uLo + (k + 0.5) * w, front + depth / 2);
      spaces.push({ x, y, rot: a.rot, width: w, depth, row: rowLabel(row), entry });
    }
    used.add(row);
    return true;
  };

  // 1. rows with open floor in front or behind
  const zones: { row: number; entry: 'front' | 'rear'; list: Seat[] }[] = [];
  const fr = layout === 'grid' ? [0.5, 0.2, 0.8, 0.35, 0.65, 0.05, 0.95] : [0.5, 0.15, 0.85];
  const anchors = (row: Seat[]) => fr.flatMap((f) => sectionsOf(row).filter((v) => v.length >= 4)
    .map((v) => v[Math.min(v.length - 1, Math.floor(f * v.length))]).sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.x - b.x));
  for (const r of rowIds) if (r % CROSS_AISLE_EVERY === 0) zones.push({ row: r, entry: 'front', list: anchors(rows.get(r)!) });
  if (last > 0 && last % CROSS_AISLE_EVERY !== 0) zones.push({ row: last, entry: 'rear', list: anchors(rows.get(last)!) });
  let left = need;
  // over 300 seats the spaces must also vary in distance from the stage (221.2.3.2): with a single
  // open-floor row, half of them go part-way back as side-entry spaces instead
  const usable = zones.filter((z) => z.list.length).length;
  const cap = capacity > 300 ? Math.ceil(need / Math.max(2, usable) / 2) * 2 : Infinity;
  const perZone = new Map<number, number>();
  for (let pass = 0; left > 0 && pass < 12; pass++) {
    let any = false;
    for (const z of zones) {
      if (left <= 0) break;
      if ((perZone.get(z.row) ?? 0) >= cap) continue;
      while (z.list.length) {
        const a = z.list.shift()!;
        if (kill.has(a) || a.companion) continue;
        const n = left >= 2 ? 2 : 1;
        const half = (n * (n === 2 ? WC.paired : WC.single)) / 2;
        if (bay(a, z.row, -half, half, n, WC.depth, n === 2 ? [-1, 1] : [1], z.entry)) { left -= n; any = true; perZone.set(z.row, (perZone.get(z.row) ?? 0) + n); break; }
      }
    }
    if (!any) break;
  }

  // 2. single side-entry spaces at block ends beside an aisle, spread through the depth of the house
  if (left > 0) {
    const order = [0.35, 0.65, 0.5, 0.2, 0.8, 0.1, 0.9, 0.42, 0.58, 0.28, 0.72];
    const tried = new Set<number>();
    for (let i = 0; left > 0 && i < 200; i++) {
      const f = i < order.length ? order[i] : (i * 0.618) % 1;
      const r = rowIds[Math.min(rowIds.length - 2, Math.max(1, Math.round(f * (rowIds.length - 1))))];
      if (r == null || tried.has(r) || used.has(r) || used.has(r - 1) || used.has(r + 1)) continue;
      tried.add(r);
      // ends of each block, outermost first, alternating sides of the house
      const ends = sectionsOf(rows.get(r)!).filter((v) => v.length >= 3).flatMap((v) => [{ a: v[0], sg: 1 }, { a: v[v.length - 1], sg: -1 }])
        .sort((p, q) => Math.abs(q.a.x) - Math.abs(p.a.x));
      for (const e of ends) {
        if (left <= 0) break;
        if (kill.has(e.a) || e.a.companion) continue;
        const lo = e.sg > 0 ? -hw : hw - WC.single, hi = lo + WC.single;
        if (bay(e.a, r, lo, hi, 1, 60 * IN, [e.sg], 'side')) { left--; break; }
      }
    }
  }
  return { seats: seats.filter((x) => !kill.has(x)), spaces };
}

/** wheelchair-space massing: the 840/915 × 1220 floor zone plus a wheelchair, facing +Y */
function wheelchairParts(w: Mm, d: Mm): Part[] {
  const parts: Part[] = [{ kind: 'box', min: [-w / 2, -d / 2, 0], max: [w / 2, d / 2, 8], mat: 'accessible' }];
  const cy = -60;
  parts.push({ kind: 'box', min: [-230, cy - 220, 470], max: [230, cy + 200, 510], mat: 'chairFrame' });
  parts.push({ kind: 'box', min: [-230, cy - 250, 510], max: [230, cy - 220, 900], mat: 'chairFrame' });
  for (const sx of [-1, 1]) {
    parts.push({ kind: 'cyl', from: [sx * 300, cy - 120, 305], to: [sx * 270, cy - 120, 305], r: 305, mat: 'chairSeat' });
    parts.push({ kind: 'cyl', from: [sx * 210, cy + 330, 75], to: [sx * 190, cy + 330, 75], r: 75, mat: 'chairSeat' });
  }
  return parts;
}

export function resolveSeating(p: SeatingParams, chair: Chair, ctx: SeatingContext) {
  const count = Math.round(Math.min(SEAT_COUNT.max, Math.max(SEAT_COUNT.min, p.count)));
  const perSection = Math.max(2, Math.round(p.seatsPerBlock));
  const ws = wheelchairSpaces(count);
  // lay out chairs; with placed wheelchair spaces, add back the chairs the bays take so the
  // capacity (chairs + spaces) still meets the requested count
  let target = count;
  let out = layoutSeats(p, chair, ctx, target, perSection);
  let placed = p.accessible ? placeWheelchairs(out.seats, ws, p.layout, chair, p.seatPitch, count) : { seats: out.seats, spaces: [] as WheelchairSpace[] };
  for (let i = 0; i < 8 && p.accessible && placed.seats.length + placed.spaces.length < count; i++) {
    target += Math.max(1, count - (placed.seats.length + placed.spaces.length));
    out = layoutSeats(p, chair, ctx, target, perSection);
    placed = placeWheelchairs(out.seats, ws, p.layout, chair, p.seatPitch, count);
  }
  const { rowPitch, rows, sections } = out;
  let seats = placed.seats;
  // re-laying out can overshoot by a few: drop the outermost chairs of the back row
  const over = seats.length + placed.spaces.length - count;
  if (over > 0) {
    const drop = new Set([...seats].filter((x) => !x.companion).sort((a, b) => b.row - a.row || Math.abs(b.x) - Math.abs(a.x)).slice(0, over));
    seats = seats.filter((x) => !drop.has(x));
  }
  const spaces = placed.spaces;
  const allForRules = out.seats;

  const rowClear = rowPitch - chair.depth;
  const limit = maxSeatsPerRow(rowClear);
  const rowCounts = new Map<string, number>();
  for (const s of allForRules) rowCounts.set(`${s.row}|${s.section}`, (rowCounts.get(`${s.row}|${s.section}`) ?? 0) + 1);
  const longestRow = Math.max(0, ...rowCounts.values());
  const warnings: Warning[] = [];
  if (longestRow > limit)
    warnings.push({ level: 'error', code: 'seating.rowclear', target: 'seating', message: `Rows of ${longestRow} seats need ${(requiredRowClear(longestRow) / IN).toFixed(1)}″ clear between rows; ${(rowClear / IN).toFixed(1)}″ allows ${limit}. Increase row spacing or reduce seats per block.` });
  const capacity = seats.length + spaces.length;
  if (capacity < count)
    warnings.push({ level: 'warn', code: 'seating.short', target: 'seating', message: `Only ${capacity} of ${count} ${spaces.length ? 'places (chairs + wheelchair spaces)' : 'seats'} fit this layout.` });
  if (p.aisleWidth < 42 * IN - 1)
    warnings.push({ level: 'warn', code: 'seating.aisle', target: 'seating', message: `Aisles narrower than 42″ (${Math.round(p.aisleWidth)} mm) are generally only allowed with seating on one side or under 50 seats served.` });
  if (p.accessible) {
    const zonesUsed = new Set(spaces.map((s) => s.row)).size;
    if (spaces.length < ws) warnings.push({ level: 'warn', code: 'seating.ada.short', target: 'seating', message: `Only ${spaces.length} of ${ws} required wheelchair spaces fit — add rows or cross aisles (2010 ADA 221.2.1.1).` });
    else warnings.push({ level: 'info', code: 'seating.ada', target: 'seating', message: `${ws} wheelchair spaces placed with ${ws} companion seats in ${zonesUsed} row${zonesUsed === 1 ? '' : 's'} (2010 ADA 221.2.1.1, 802). ${count > 300 && zonesUsed < 2 ? 'Add a cross aisle so they are also dispersed by distance (221.2.3.2). ' : ''}Accessible routes to them, egress and final locations need venue / AHJ review.` });
  } else warnings.push({ level: 'info', code: 'seating.ada', target: 'seating', message: `${seats.length.toLocaleString()} seats require ${ws} wheelchair spaces with ${ws} companion seats (2010 ADA 221.2.1.1). Egress, exits and accessible locations need venue / AHJ review.` });
  return finish(p, chair, ctx, { seats, spaces, rows, sections, rowPitch, rowClear, limit, longestRow, ws, capacity, warnings });
}

function layoutSeats(p: SeatingParams, chair: Chair, ctx: SeatingContext, count: number, perSection: number) {
  const params = { ...p, count };
  let rowPitch = p.rowPitch;
  let seats: Seat[] = [];
  let rows = 0, sections = 1;

  if (p.layout === 'grid') {
    // continental: one wide section with side aisles only; rows widen to satisfy the clear-width rule
    let best: { n: number; pitch: number; score: number } | null = null;
    for (let n = 10; n <= 100; n++) {
      const pitch = Math.max(p.rowPitch, roundUp(chair.depth + requiredRowClear(n), 5));
      const rws = Math.ceil(count / n);
      const score = Math.abs((rws * pitch) / (n * p.seatPitch) - 0.8);
      if (!best || score < best.score) best = { n, pitch, score };
    }
    rowPitch = best!.pitch;
    const s = straight(params, chair, ctx, best!.n, 1, rowPitch);
    seats = s.seats; rows = s.rows;
  } else if (p.layout === 'block') {
    let best: { b: number; score: number } | null = null;
    for (let b = 1; b <= 16; b++) {
      const rws = Math.ceil(count / (b * perSection));
      const w = b * perSection * p.seatPitch + (b - 1) * p.aisleWidth;
      const score = Math.abs((rws * rowPitch) / w - 0.8);
      if (!best || score < best.score) best = { b, score };
    }
    sections = best!.b;
    const s = straight(params, chair, ctx, perSection, sections, rowPitch);
    seats = s.seats; rows = s.rows;
  } else {
    const s = radial(params, chair, ctx, perSection, rowPitch);
    seats = s.seats; rows = s.rows; sections = s.sections;
  }
  return { seats, rows, sections, rowPitch };
}

interface Resolved { seats: Seat[]; spaces: WheelchairSpace[]; rows: number; sections: number; rowPitch: Mm; rowClear: Mm; limit: number; longestRow: number; ws: number; capacity: number; warnings: Warning[] }

function finish(p: SeatingParams, chair: Chair, ctx: SeatingContext, R: Resolved) {
  const { seats, spaces, rows, sections, rowPitch, rowClear, limit, longestRow, ws, capacity, warnings } = R;

  // stable numbering: rows front → back, seats house left → house right
  seats.sort((a, b) => a.row - b.row || a.x - b.x);
  const block = chairBlock(chair);
  const objects: SceneObject[] = [];
  let lastRow = -1, n = 0;
  for (const s of seats) {
    if (s.row !== lastRow) { lastRow = s.row; n = 0; }
    n++;
    const row = rowLabel(s.row);
    objects.push({
      id: `SEAT.${row}.${n}`, label: `${chair.model} ${row}${n}${s.companion ? ' (companion)' : ''}`, layer: '70_AUDIENCE::70_01_SEATING', system: 'seating', group: 'seating',
      block: block.key, position: [Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, 0], rotationZ: s.rot,
      meta: { catalogId: chair.id, section: s.section + 1, row, seat: n, layout: p.layout, ...(s.companion ? { companion: true, movable: true } : {}) },
    });
  }
  const accessible: SceneObject[] = spaces.map((w, i) => ({
    id: `SEAT.WC.${String(i + 1).padStart(2, '0')}`, label: `Wheelchair space ${i + 1} — row ${w.row} (${Math.round(w.width / IN)}″ × ${Math.round(w.depth / IN)}″)`,
    layer: '70_AUDIENCE::70_06_ACCESSIBLE', system: 'seating', group: 'seating',
    parts: wheelchairParts(w.width, w.depth), position: [Math.round(w.x * 10) / 10, Math.round(w.y * 10) / 10, 0], rotationZ: w.rot,
    meta: { bom: 'Wheelchair space (floor zone, no chair)', manufacturer: '—', model: '—', verification: 'generic', bomSkip: true, row: w.row, width: Math.round(w.width), depth: Math.round(w.depth), entry: w.entry, standard: '2010 ADA 802.1' },
  }));

  const xs = [...seats.map((s) => s.x), ...spaces.map((s) => s.x)], ys = [...seats.map((s) => s.y), ...spaces.map((s) => s.y)];
  const min: [number, number] = [Math.min(...xs) - chair.width / 2, Math.min(...ys) - chair.depth / 2];
  const max: [number, number] = [Math.max(...xs) + chair.width / 2, Math.max(...ys) + chair.depth / 2];
  // front distance: on the centreline, from the front-most deck edge to the first seat
  const rects = ctx.keepOut ?? [{ minX: -ctx.stageWidth / 2, maxX: ctx.stageWidth / 2, minY: 0, maxY: ctx.stageDepth }];
  const edgeY = Math.min(0, ...rects.filter((r) => r.minX <= 0 && r.maxX >= 0).map((r) => r.minY));
  // front edges of chairs and wheelchair spaces (a bay can take the centre of the front row)
  const fronts = [
    ...seats.map((s) => ({ x: s.x, y: s.y + chair.depth / 2 })),
    ...spaces.map((w) => ({ x: w.x - Math.sin(w.rot) * w.depth / 2, y: w.y + Math.cos(w.rot) * w.depth / 2 })),
  ];
  const centre = fronts.filter((s) => Math.abs(s.x) < p.seatPitch * 2);
  const firstY = fronts.length ? Math.max(...(centre.length ? centre : fronts).map((s) => s.y)) : 0;
  const front = edgeY - firstY;

  const annotations: Annotation[] = seats.length ? [
    { id: 'DIM.SEAT.FRONT', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [p.seatPitch * 1.5, edgeY, 0], to: [p.seatPitch * 1.5, firstY, 0], value: front, label: 'Stage to front row' },
    { id: 'DIM.SEAT.DEPTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [min[0] - 900, min[1], 0], to: [min[0] - 900, firstY, 0], value: firstY - min[1], label: 'Seating depth' },
    { id: 'DIM.SEAT.WIDTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [min[0], min[1] - 900, 0], to: [max[0], min[1] - 900, 0], value: max[0] - min[0], label: 'Seating width' },
  ] : [];

  const report: SeatingReport = {
    layout: p.layout, requested: p.count, count: seats.length, rows, sections, longestRow,
    rowPitch, rowClear, maxSeatsPerRow: limit, width: max[0] - min[0], depth: firstY - min[1], frontDistance: front,
    wheelchairSpaces: ws, wheelchairPlaced: spaces, capacity, chair, min, max,
  };
  return { report, block, objects, accessible, annotations, warnings };
}
