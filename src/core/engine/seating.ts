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
  chair: Chair;
  /** plan extents of the seating (world mm) */
  min: [number, number];
  max: [number, number];
}

interface Seat { x: number; y: number; rot: number; section: number; row: number }

export interface SeatingContext { stageWidth: Mm; stageDepth: Mm }

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

function straight(p: SeatingParams, chair: Chair, perSection: number, sections: number, rowPitch: Mm) {
  const cd = chair.depth;
  const across = perSection * sections;
  const rows = Math.ceil(p.count / across);
  const sw = perSection * p.seatPitch;
  const width = sections * sw + (sections - 1) * p.aisleWidth;
  const out: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    const yFront = -p.frontDistance - r * rowPitch - Math.floor(r / CROSS_AISLE_EVERY) * p.aisleWidth;
    const row: Seat[] = [];
    for (let s = 0; s < sections; s++)
      for (let k = 0; k < perSection; k++)
        row.push({ x: -width / 2 + s * (sw + p.aisleWidth) + (k + 0.5) * p.seatPitch, y: yFront - cd / 2, rot: 0, section: s, row: r });
    const left = p.count - out.length;
    out.push(...(left < row.length ? trimLastRow(row, left) : row));
  }
  const cross = Math.floor((rows - 1) / CROSS_AISLE_EVERY);
  return { seats: out, rows, width, depth: (rows - 1) * rowPitch + cd + cross * p.aisleWidth };
}

function radial(p: SeatingParams, chair: Chair, ctx: SeatingContext, perSection: number, rowPitch: Mm) {
  const cd = chair.depth;
  const fy = ctx.stageDepth / 2; // focus on the middle of the deck
  const half = (RADIAL_HALF_ANGLE_DEG * Math.PI) / 180;
  const sideClear = p.aisleWidth; // curved rows keep at least an aisle width from the deck
  /** plan distance from a point to the deck rectangle (negative inside) */
  const clearOf = (x: number, y: number) => {
    const dx = Math.abs(x) - ctx.stageWidth / 2, dy = Math.max(-y, y - ctx.stageDepth);
    if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
    return Math.hypot(Math.max(0, dx), Math.max(0, dy));
  };
  const out: Seat[] = [];
  let r = 0, sectionsMax = 0, zoneSectors = 0;
  const R0 = fy + p.frontDistance;
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
        if (clearOf(xf, yf) < Math.min(p.frontDistance, sideClear) - 0.5) continue;
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

export function resolveSeating(p: SeatingParams, chair: Chair, ctx: SeatingContext) {
  const warnings: Warning[] = [];
  const count = Math.round(Math.min(SEAT_COUNT.max, Math.max(SEAT_COUNT.min, p.count)));
  const params = { ...p, count };
  const perSection = Math.max(2, Math.round(p.seatsPerBlock));
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
    const s = straight(params, chair, best!.n, 1, rowPitch);
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
    const s = straight(params, chair, perSection, sections, rowPitch);
    seats = s.seats; rows = s.rows;
  } else {
    const s = radial(params, chair, ctx, perSection, rowPitch);
    seats = s.seats; rows = s.rows; sections = s.sections;
  }

  const rowClear = rowPitch - chair.depth;
  const limit = maxSeatsPerRow(rowClear);
  const rowCounts = new Map<string, number>();
  for (const s of seats) rowCounts.set(`${s.row}|${s.section}`, (rowCounts.get(`${s.row}|${s.section}`) ?? 0) + 1);
  const longestRow = Math.max(0, ...rowCounts.values());
  if (longestRow > limit)
    warnings.push({ level: 'error', code: 'seating.rowclear', target: 'seating', message: `Rows of ${longestRow} seats need ${(requiredRowClear(longestRow) / IN).toFixed(1)}″ clear between rows; ${(rowClear / IN).toFixed(1)}″ allows ${limit}. Increase row spacing or reduce seats per block.` });
  if (seats.length < count)
    warnings.push({ level: 'warn', code: 'seating.short', target: 'seating', message: `Only ${seats.length} of ${count} seats fit this layout.` });
  if (p.aisleWidth < 42 * IN - 1)
    warnings.push({ level: 'warn', code: 'seating.aisle', target: 'seating', message: `Aisles narrower than 42″ (${Math.round(p.aisleWidth)} mm) are generally only allowed with seating on one side or under 50 seats served.` });
  const ws = wheelchairSpaces(seats.length);
  warnings.push({ level: 'info', code: 'seating.ada', target: 'seating', message: `${seats.length.toLocaleString()} seats require ${ws} wheelchair spaces with ${ws} companion seats (2010 ADA 221.2.1.1). Egress, exits and accessible locations need venue / AHJ review.` });

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
      id: `SEAT.${row}.${n}`, label: `${chair.model} ${row}${n}`, layer: '70_AUDIENCE::70_01_SEATING', system: 'seating', group: 'seating',
      block: block.key, position: [Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, 0], rotationZ: s.rot,
      meta: { catalogId: chair.id, section: s.section + 1, row, seat: n, layout: p.layout },
    });
  }

  const xs = seats.map((s) => s.x), ys = seats.map((s) => s.y);
  const min: [number, number] = [Math.min(...xs) - chair.width / 2, Math.min(...ys) - chair.depth / 2];
  const max: [number, number] = [Math.max(...xs) + chair.width / 2, Math.max(...ys) + chair.depth / 2];
  const centre = seats.filter((s) => Math.abs(s.x) < p.seatPitch * 2);
  const front = seats.length ? -Math.max(...(centre.length ? centre : seats).map((s) => s.y + chair.depth / 2)) : 0;

  const annotations: Annotation[] = seats.length ? [
    { id: 'DIM.SEAT.FRONT', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [p.seatPitch * 1.5, 0, 0], to: [p.seatPitch * 1.5, -front, 0], value: front, label: 'Stage to front row' },
    { id: 'DIM.SEAT.DEPTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [min[0] - 900, min[1], 0], to: [min[0] - 900, -front, 0], value: -front - min[1], label: 'Seating depth' },
    { id: 'DIM.SEAT.WIDTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [min[0], min[1] - 900, 0], to: [max[0], min[1] - 900, 0], value: max[0] - min[0], label: 'Seating width' },
  ] : [];

  const report: SeatingReport = {
    layout: p.layout, requested: p.count, count: seats.length, rows, sections, longestRow,
    rowPitch, rowClear, maxSeatsPerRow: limit, width: max[0] - min[0], depth: -front - min[1], frontDistance: front,
    wheelchairSpaces: ws, chair, min, max,
  };
  return { report, block, objects, annotations, warnings };
}
