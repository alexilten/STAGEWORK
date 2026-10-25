import type { VenueArchetype, VenueParams } from '../schema';
import { formatLength, type DisplayUnits, type Mm } from '../units';
import type { Annotation, BlockDef, LayerPath, MaterialKey, Part, SceneObject, Vec3, Warning } from './types';

/**
 * Venue shells: the building the stage is set up in. The user gives the interior footprint first
 * (width across the stage × depth from the stage wall to the back of house), then picks an
 * archetype, and the archetype fits its structure to that footprint:
 *
 *  - repeat a module: column grids, roof trusses, pipe grids and rigging points keep their
 *    preferred spacing; the count is rounded and the module stretches so bays land on the walls
 *  - follow the span: truss depth comes from the bay it spans
 *  - clamp and warn: each archetype has a footprint range; outside it the venue is not built until
 *    the user overrides, and the warning names the archetypes that do fit
 *
 * Heights, spacings and point ratings are typical published planning values (venue rigging guides,
 * see docs/VENUES.md); each real venue's own rigging plot and electrical spec governs.
 * The stage wall is the +Y wall; the venue moves with the show, the stage keeps its origin.
 */

const FT = 304.8;
const ft = (v: number) => v * FT;
const LB = 0.45359237;

export interface VenueSpec {
  id: VenueArchetype;
  name: string;
  blurb: string;
  /** allowed interior side lengths (both sides), and an optional cap on the short side */
  min: Mm;
  max: Mm;
  shortMax?: Mm;
  /** ranges that depend on direction ([min, max] for the width and the depth); replace min / max */
  w?: [Mm, Mm];
  d?: [Mm, Mm];
  /** rooms (flat floor, bring your own seats) or venues with their own seating; suggestions stay in the family first */
  family: 'room' | 'seated';
  /** what the clear height measures to */
  clearLabel: string;
  /** no roof: nothing to hang from and no clear height */
  openAir?: boolean;
  /** fixed house seating in front of the stage (a raked house or a fan) */
  fixedSeating?: boolean;
  /** an event floor inside a seating bowl */
  bowl?: boolean;
  /** default footprint when the archetype is picked from scratch */
  example: [Mm, Mm];
  /** default clear height (bottom of steel / grid / ceiling) for a footprint */
  clear: (w: Mm, d: Mm) => Mm;
  rating: { kg: number; label: string } | null;
  power: string;
  floor: string;
}

const sqft = (w: Mm, d: Mm) => (w * d) / (FT * FT);

export const VENUE_SPECS: Record<VenueArchetype, VenueSpec> = {
  'black-box': {
    id: 'black-box', name: 'Black box', blurb: 'Flat floor, pipe grid over the whole room, black walls',
    min: ft(30), max: ft(150), example: [ft(80), ft(100)],
    clear: (w, d) => (Math.max(w, d) < ft(60) ? ft(18) : Math.max(w, d) < ft(100) ? ft(22) : ft(26)),
    rating: { kg: 250 * LB, label: '250 lb at a grid hanger' }, family: 'room', clearLabel: 'Grid height',
    power: '200–400 A 3φ company switch', floor: 'Sprung or MDF, ~100–150 psf',
  },
  ballroom: {
    id: 'ballroom', name: 'Hotel ballroom', blurb: 'Column-free, low ceiling, house rigging points, airwalls',
    min: ft(60), max: ft(350), shortMax: ft(200), example: [ft(130), ft(220)],
    clear: (w, d) => (sqft(w, d) < 15000 ? ft(18) : sqft(w, d) < 35000 ? ft(24) : ft(30)),
    rating: { kg: 1000 * LB, label: '1,000 lb per house point' }, family: 'room', clearLabel: 'Ceiling height',
    power: 'In-house 100–400 A 3φ disconnects', floor: 'Carpet on slab, ~100 psf',
  },
  convention: {
    id: 'convention', name: 'Convention hall', blurb: 'Column grid, deep roof trusses, rated panel points, floor pits',
    min: ft(150), max: ft(2000), example: [ft(300), ft(420)],
    clear: () => ft(35),
    rating: { kg: 2000 * LB, label: '2,000 lb at a main-truss panel point' }, family: 'room', clearLabel: 'Clear to steel',
    power: 'Floor pits ~30 ft o.c., 208/480 V', floor: 'Slab, 300–350 psf',
  },
  warehouse: {
    id: 'warehouse', name: 'Warehouse', blurb: 'Tilt-up shell, column grid, light joists: ground-supported rig',
    min: ft(80), max: ft(1000), example: [ft(250), ft(500)],
    clear: () => ft(32),
    rating: null, family: 'room', clearLabel: 'Clear to joists',
    power: 'Building service usually too small: temp generators', floor: '6–8 in slab',
  },
  'sound-stage': {
    id: 'sound-stage', name: 'Sound stage', blurb: '40 ft pipe grid, perimeter catwalks, elephant door',
    min: ft(60), max: ft(300), example: [ft(120), ft(180)],
    clear: (w, d) => (Math.max(w, d) < ft(100) ? ft(30) : ft(38)),
    rating: { kg: 500 * LB, label: '500 lb at a grid point' }, family: 'room', clearLabel: 'Grid height',
    power: '2,000–4,000 A house power, cam-lok tie-ins', floor: 'Level slab, ~250 psf',
  },
  proscenium: {
    id: 'proscenium', name: 'Proscenium theatre', blurb: 'Fly tower with gridiron and line sets, raked house, balcony',
    min: ft(80), max: ft(320), w: [ft(80), ft(200)], d: [ft(120), ft(320)], example: [ft(120), ft(175)],
    clear: (w) => proscenium(w).grid,
    rating: { kg: 1000 * LB, label: '1,000 lb at a gridiron point' }, family: 'seated', clearLabel: 'Gridiron height', fixedSeating: true,
    power: '400–800 A company switch, stage left', floor: 'Stage: wood on sleepers, ~150 psf; house raked',
  },
  arena: {
    id: 'arena', name: 'Arena', blurb: 'Event floor in a two-tier bowl, high steel with rated points',
    min: ft(300), max: ft(700), shortMax: ft(600), example: [ft(400), ft(520)],
    clear: () => ft(100),
    rating: { kg: 2000 * LB, label: '2,000 lb at a roof-truss point' }, family: 'seated', clearLabel: 'Clear to steel', bowl: true,
    power: '2 × 400 A + 2 × 200 A 3φ at the stage end', floor: 'Concrete over the ice slab, ~250 psf',
  },
  stadium: {
    id: 'stadium', name: 'Stadium', blurb: 'Open-air bowl around a field: bring a ground-supported roof',
    min: ft(600), max: ft(1300), example: [ft(750), ft(950)],
    clear: () => 0,
    rating: null, family: 'seated', clearLabel: 'Open air', openAir: true, bowl: true,
    power: 'Generators, or 2,000–4,000 A at the stage end', floor: 'Turf: deck it with ground protection',
  },
  amphitheatre: {
    id: 'amphitheatre', name: 'Amphitheatre', blurb: 'Stage house with a grid, covered pavilion, fan seats and lawn',
    min: ft(250), max: ft(800), w: [ft(250), ft(800)], d: [ft(250), ft(700)], example: [ft(400), ft(450)],
    clear: () => ft(62),
    rating: { kg: 1000 * LB, label: '1,000 lb at a stage-house grid point' }, family: 'seated', clearLabel: 'Grid height', fixedSeating: true,
    power: '800–1,200 A at the stage', floor: 'Stage: wood over concrete',
  },
  tent: {
    id: 'tent', name: 'Clearspan tent', blurb: 'Aluminium frames at 5 m bays, fabric roof, cassette floor',
    min: 10000, max: 200000, w: [10000, 60000], d: [10000, 200000], example: [40000, 80000],
    clear: (w) => tentFrame(w).rig - 300,
    rating: { kg: 500, label: '500 kg at a rafter quarter point' }, family: 'room', clearLabel: 'Under the rafters at the rig points',
    power: 'Generators', floor: 'Cassette floor on levelling, ~5 kN/m²',
  },
};
export const VENUE_ORDER: VenueArchetype[] = ['black-box', 'ballroom', 'convention', 'warehouse', 'sound-stage', 'proscenium', 'arena', 'stadium', 'amphitheatre', 'tent'];

/** proscenium opening and gridiron from the house width */
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function proscenium(w: Mm) {
  const proW = clampN(w / 2.2, ft(30), ft(60)), proH = clampN(0.6 * proW, ft(20), ft(35));
  return { proW, proH, grid: Math.min(2.5 * proH, ft(90)) };
}
/** clearspan tents come in standard spans; the length is whole 5 m bays */
export const TENT_SPANS = [10, 15, 20, 25, 30, 40, 50, 60].map((m) => m * 1000);
const TENT_EAVE: Record<number, Mm> = { 10000: 3000, 15000: 3200, 20000: 4000, 25000: 4000, 30000: 4500, 40000: 5000, 50000: 6000, 60000: 6000 };
export function tentFrame(w: Mm, d: Mm = 5000) {
  const span = TENT_SPANS.find((s) => s >= w - 1) ?? TENT_SPANS[TENT_SPANS.length - 1];
  const length = Math.max(5000, Math.ceil((d - 1) / 5000) * 5000);
  const eave = TENT_EAVE[span], ridge = eave + 0.13 * span;
  return { span, length, eave, ridge, rig: (eave + ridge) / 2 };
}

export interface VenueFit {
  ok: boolean;
  /** 'big' / 'small' when outside the range */
  issue: 'big' | 'small' | null;
  message: string | null;
  /** archetypes the footprint does fit, best first */
  suggest: VenueArchetype[];
}

const fitsRange = (s: VenueSpec, w: Mm, d: Mm) => {
  if (s.w && s.d) {
    if (w > s.w[1] + 1 || d > s.d[1] + 1) return 'big';
    if (w < s.w[0] - 1 || d < s.d[0] - 1) return 'small';
    return null;
  }
  const lo = Math.min(w, d), hi = Math.max(w, d);
  if (hi > s.max + 1 || (s.shortMax != null && lo > s.shortMax + 1)) return 'big';
  if (lo < s.min - 1) return 'small';
  return null;
};

const PREFER: Record<'big' | 'small', VenueArchetype[]> = {
  big: ['sound-stage', 'warehouse', 'convention', 'ballroom', 'black-box', 'tent', 'proscenium', 'arena', 'amphitheatre', 'stadium'],
  small: ['black-box', 'sound-stage', 'ballroom', 'tent', 'warehouse', 'convention', 'proscenium', 'arena', 'amphitheatre', 'stadium'],
};

export function venueFit(a: VenueArchetype, w: Mm, d: Mm, units: DisplayUnits = 'imperial'): VenueFit {
  const s = VENUE_SPECS[a];
  const issue = fitsRange(s, w, d);
  if (!issue) return { ok: true, issue: null, message: null, suggest: [] };
  const fits = PREFER[issue].filter((k) => k !== a && !fitsRange(VENUE_SPECS[k], w, d));
  // same kind of building first (a room for a room, seats for seats)
  const suggest = [...fits.filter((k) => VENUE_SPECS[k].family === s.family), ...fits.filter((k) => VENUE_SPECS[k].family !== s.family)];
  const fmt = (mm: Mm) => formatLength(units === 'imperial' ? Math.round(mm / FT) * FT : Math.round(mm / 1000) * 1000, units);
  const limit = s.w && s.d
    ? issue === 'big' ? `${s.name} tops out around ${fmt(s.w[1])} wide × ${fmt(s.d[1])} deep` : `${s.name} starts around ${fmt(s.w[0])} wide × ${fmt(s.d[0])} deep`
    : issue === 'big'
      ? (s.shortMax != null && Math.min(w, d) > s.shortMax + 1 ? `${s.name} tops out around ${fmt(s.shortMax)} wide` : `${s.name} tops out around ${fmt(s.max)} a side`)
      : `${s.name} starts around ${fmt(s.min)} a side`;
  return { ok: false, issue, message: `${limit}; this footprint is ${fmt(w)} × ${fmt(d)}.`, suggest };
}

/** preferred module → whole bays across a length */
export const bays = (L: Mm, module: Mm) => { const n = Math.max(1, Math.round(L / module)); return { n, b: L / n }; };

export interface VenueReport {
  archetype: VenueArchetype;
  name: string;
  built: boolean;
  fit: VenueFit;
  width: Mm;
  depth: Mm;
  areaM2: number;
  areaSqFt: number;
  /** bottom of steel / grid / ceiling (0 when open air) */
  clear: Mm;
  clearLabel: string;
  openAir: boolean;
  wallHeight: Mm;
  /** interior plan box (world mm) */
  box: { x0: Mm; y0: Mm; x1: Mm; y1: Mm };
  /**
   * what the section cut keeps whole: the room inside its walls (a theatre's house and
   * proscenium included), an arena's event floor, an amphitheatre's stage house. Venue geometry above the cut height outside this box, on the side the
   * camera looks in from, is cut away.
   */
  inner: { x0: Mm; y0: Mm; x1: Mm; y1: Mm };
  /** seating tiers are cut like walls (a bowl hides the floor); otherwise they stay whole */
  cutTiers: boolean;
  columns: { x: Mm; y: Mm }[];
  columnSize: Mm;
  bays: { x: Mm; y: Mm; nx: number; ny: number } | null;
  rigPoints: number;
  rating: VenueSpec['rating'];
  /** fixed house seats (theatre, bowl, fan), estimated at 20 in a seat */
  houseSeats: number;
  fixedSeating: boolean;
  bowl: boolean;
  /** type-specific lines for the panel (opening, line sets, tent span …) */
  facts: string[];
  power: string;
  floor: string;
}

export interface VenueContext {
  /** most upstage Y of the show (deck, LED, drape …) */
  backY: Mm;
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MaterialKey): Part =>
  ({ kind: 'box', min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
const tube = (from: Vec3, to: Vec3, r: Mm, mat: MaterialKey): Part => ({ kind: 'cyl', from, to, r, mat });
const prism = (points: [number, number][], z0: Mm, z1: Mm, mat: MaterialKey): Part =>
  ({ kind: 'prism', points: points.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), z0, z1, mat });
const ORIGIN: Vec3 = [0, 0, 0];
const L_SHELL: LayerPath = '05_VENUE::05_01_SHELL', L_STRUCT: LayerPath = '05_VENUE::05_02_STRUCTURE', L_RIG: LayerPath = '05_VENUE::05_03_RIGGING',
  L_FIX: LayerPath = '05_VENUE::05_04_FIXTURES', L_SERV: LayerPath = '05_VENUE::05_05_SERVICES', L_GRID: LayerPath = '05_VENUE::05_06_GRID_LINES';
const SEAT = 508; // 20 in a seat
const ROW = 850; // bowl row pitch

/** one truss panel along +X: chords, the vertical at its start and one diagonal */
const trussPanel = (len: Mm, depth: Mm, r: Mm): Part[] => [
  tube([0, 0, 0], [len, 0, 0], r, 'venueSteel'), tube([0, 0, depth], [len, 0, depth], r, 'venueSteel'),
  tube([0, 0, 0], [0, 0, depth], r * 0.7, 'venueSteel'), tube([0, 0, 0], [len, 0, depth], r * 0.6, 'venueSteel'),
];
const pipeGrid = (x0: Mm, x1: Mm, y0: Mm, y1: Mm, z: Mm, step: Mm, r: Mm): Part[] => {
  const out: Part[] = [];
  for (let x = x0; x <= x1 + 1; x += step) out.push(tube([x, y0, z], [x, y1, z], r, 'venuePipe'));
  for (let y = y0; y <= y1 + 1; y += step) out.push(tube([x0, y, z], [x1, y, z], r, 'venuePipe'));
  return out;
};
const gridLabel = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/**
 * A band of a seating bowl in plan: a U around the house end of an event floor (open toward the
 * stage at +Y), between offsets o0 and o1 from the floor edge, corners rounded at radius rr + o.
 */
export function bowlBand(fw: Mm, fy0: Mm, fy1: Mm, rr: Mm, o0: Mm, o1: Mm, seg = 8): [number, number][] {
  const path = (o: number) => {
    const pts: [number, number][] = [[-fw / 2 - o, fy1]];
    const corner = (cx: number, cy: number, a0: number) => {
      for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (Math.PI / 2); pts.push([cx + (rr + o) * Math.cos(a), cy + (rr + o) * Math.sin(a)]); }
    };
    corner(-fw / 2 + rr, fy0 + rr, Math.PI);
    corner(fw / 2 - rr, fy0 + rr, 1.5 * Math.PI);
    pts.push([fw / 2 + o, fy1]);
    return pts;
  };
  return [...path(o1), ...path(o0).reverse()];
}
/** an annular sector about (cx, cy), angles in radians, counter-clockwise */
const sector = (cx: Mm, cy: Mm, r0: Mm, r1: Mm, a0: number, a1: number, seg = 16): [number, number][] => {
  const pts: [number, number][] = [];
  for (let k = 0; k <= seg; k++) { const a = a0 + ((a1 - a0) * k) / seg; pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]); }
  for (let k = seg; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / seg; pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]); }
  return pts;
};

const BOX_ROOMS = new Set<VenueArchetype>(['black-box', 'ballroom', 'convention', 'warehouse', 'sound-stage']);

export function resolveVenue(p: VenueParams, ctx: VenueContext, units: DisplayUnits = 'imperial') {
  const spec = VENUE_SPECS[p.archetype];
  const objects: SceneObject[] = [];
  const blocks: BlockDef[] = [];
  const annotations: Annotation[] = [];
  const warnings: Warning[] = [];
  const fit = venueFit(p.archetype, p.width, p.depth, units);
  // a tent comes in a standard span and whole 5 m bays
  const tent = p.archetype === 'tent' ? tentFrame(p.width, p.depth) : null;
  const W = tent?.span ?? p.width, D = tent?.length ?? p.depth;
  // a theatre's stage house starts at the proscenium, just downstage of the show, and is at least 40 ft deep
  const yPro = -1500;
  const minHouse = p.archetype === 'proscenium' ? ft(40) : p.archetype === 'amphitheatre' ? ft(45) : 0;
  const x0 = -W / 2, x1 = W / 2, y1 = Math.max(ctx.backY + p.upstage, minHouse ? yPro + minHouse : -Infinity), y0 = y1 - D;
  const clear = spec.openAir ? 0 : p.clearHeight ?? spec.clear(W, D);
  const fmt = (mm: Mm) => formatLength(mm, units);
  const report: VenueReport = {
    archetype: p.archetype, name: spec.name, built: false, fit, width: W, depth: D,
    areaM2: (W * D) / 1e6, areaSqFt: sqft(W, D), clear, clearLabel: spec.clearLabel, openAir: !!spec.openAir, wallHeight: clear,
    box: { x0, y0, x1, y1 }, inner: { x0: x0 + 800, y0: y0 + 800, x1: x1 - 800, y1: y1 - 800 },
    columns: [], columnSize: 0, bays: null, rigPoints: 0, rating: spec.rating,
    houseSeats: 0, fixedSeating: !!spec.fixedSeating, bowl: !!spec.bowl, cutTiers: !!spec.bowl, facts: [], power: spec.power, floor: spec.floor,
  };
  if (!fit.ok && !p.override) {
    warnings.push({ level: 'error', code: 'venue.fit', target: 'venue', message: `${fit.message} The venue is not built until you pick another type or override.` });
    return { objects, blocks, annotations, warnings, report };
  }
  if (!fit.ok) warnings.push({ level: 'warn', code: 'venue.fit.override', target: 'venue', message: `${fit.message} Built anyway (override); real ${spec.name.toLowerCase()}s are rarely this size.` });
  report.built = true;

  const meta = { archetype: p.archetype };
  const unique = (id: string, label: string, layer: LayerPath, parts: Part[], extra: Record<string, string | number> = {}) => {
    if (parts.length) objects.push({ id, label, layer, system: 'venue', group: 'venue', parts, position: ORIGIN, rotationZ: 0, meta: { ...meta, ...extra } });
  };
  const instance = (id: string, label: string, layer: LayerPath, block: string, position: Vec3, extra: Record<string, string | number> = {}, rotationZ = 0) =>
    objects.push({ id, label, layer, system: 'venue', group: 'venue', block, position, rotationZ, meta: { ...meta, ...extra } });

  const T = p.archetype === 'warehouse' ? 230 : 300;
  const door = (id: string, label: string, y: Mm, w: Mm, h: Mm, x = x1) => unique(id, label, L_SHELL, [box(x - 60, y - w / 2, 0, x + 10, y + w / 2, h, 'venueDoor')], { width: Math.round(w), height: Math.round(h) });
  /** four walls outside the footprint, stage wall at +Y */
  const walls = (h: { stage: Mm; house: Mm; sides: Mm }, mat: MaterialKey) => {
    unique('VENUE.WALL.STAGE', 'Stage wall', L_SHELL, [box(x0 - T, y1, 0, x1 + T, y1 + T, h.stage, mat)]);
    unique('VENUE.WALL.HOUSE', 'Back-of-house wall', L_SHELL, [box(x0 - T, y0 - T, 0, x1 + T, y0, h.house, mat)]);
    unique('VENUE.WALL.HR', 'House-right wall', L_SHELL, [box(x1, y0, 0, x1 + T, y1, h.sides, mat)]);
    unique('VENUE.WALL.HL', 'House-left wall', L_SHELL, [box(x0 - T, y0, 0, x0, y1, h.sides, mat)]);
  };
  const slab = (mat: MaterialKey) => unique('VENUE.FLOOR', `${spec.name} floor`, L_SHELL, [box(x0 - T, y0 - T, -150, x1 + T, y1 + T, -2, mat)], { areaM2: Math.round(report.areaM2) });

  // grid lines: numbered across X, lettered from the stage wall
  const gridLines = (xs: Mm[], ys: Mm[]) => {
    xs.forEach((x, i) => annotations.push({ id: `VENUE.GRID.${i + 1}`, kind: 'line', layer: L_GRID, from: [x, y0 - 3000, 0], to: [x, y1 + 3000, 0], label: String(i + 1) }));
    ys.forEach((y, j) => annotations.push({ id: `VENUE.GRID.${gridLabel(j)}`, kind: 'line', layer: L_GRID, from: [x0 - 3000, y, 0], to: [x1 + 3000, y, 0], label: gridLabel(j) }));
  };
  const columnGrid = (mx: Mm, my: Mm, size: Mm, height: Mm) => {
    const bx = bays(W, mx), by = bays(D, my);
    const xs = Array.from({ length: bx.n + 1 }, (_, i) => x0 + i * bx.b), ys = Array.from({ length: by.n + 1 }, (_, j) => y1 - j * by.b);
    const key = `SC_VENUE_COLUMN_${Math.round(size)}x${Math.round(height)}`;
    blocks.push({ key, description: `Building column ${Math.round(size)} mm square × ${Math.round(height)} mm`, parts: [box(-size / 2, -size / 2, 0, size / 2, size / 2, height, 'venueColumn')] });
    ys.forEach((y, j) => xs.forEach((x, i) => {
      instance(`VENUE.COL.${gridLabel(j)}${i + 1}`, `Column ${gridLabel(j)}/${i + 1}`, L_STRUCT, key, [x, y, 0], { grid: `${gridLabel(j)}/${i + 1}` });
      report.columns.push({ x, y });
    }));
    report.columnSize = size;
    report.bays = { x: bx.b, y: by.b, nx: bx.n, ny: by.n };
    gridLines(xs, ys);
    return { bx, by, xs, ys };
  };
  /** flat trusses along X at each y, from xa across span, in panels near panelPref that divide bayX */
  const trussLines = (ys: Mm[], bayX: Mm, panelPref: Mm, zb: Mm, depth: Mm, r: Mm, tag: string, xa = x0, span = W) => {
    const per = Math.max(1, Math.round(bayX / panelPref)), len = bayX / per, n = Math.round(span / len);
    const key = `SC_VENUE_${tag}_PANEL_${Math.round(len)}x${Math.round(depth)}`;
    const name = tag === 'GIRDER' ? 'Joist girder' : 'Roof truss';
    if (!blocks.some((b) => b.key === key)) blocks.push({ key, description: `${name} panel ${Math.round(len)} × ${Math.round(depth)} mm`, parts: trussPanel(len, depth, r) });
    ys.forEach((y, j) => { for (let i = 0; i < n; i++) instance(`VENUE.${tag}.${gridLabel(j)}.${String(i + 1).padStart(3, '0')}`, `${name} ${gridLabel(j)}`, L_STRUCT, key, [xa + i * len, y, zb]); });
    return { len, n };
  };
  const rigPointBlock = () => {
    const key = 'SC_VENUE_RIG_POINT';
    if (!blocks.some((b) => b.key === key)) blocks.push({ key, description: 'Rated rigging point', parts: [box(-110, -110, -220, 110, 110, 0, 'rigPoint')] });
    return key;
  };
  const rigPoints = (pts: [Mm, Mm][], z: Mm, steel: string) => {
    const key = rigPointBlock();
    pts.forEach(([x, y], i) => instance(`VENUE.RP.${String(i + 1).padStart(4, '0')}`, `Rigging point (${spec.rating?.label ?? 'unrated'})`, L_RIG, key, [x, y, z],
      { ratingKg: Math.round(spec.rating?.kg ?? 0), ratingLb: Math.round((spec.rating?.kg ?? 0) / LB), steel }));
    report.rigPoints = pts.length;
  };
  /**
   * A two-tier bowl around an event floor fw wide, from fy0 to the stage end fy1: lower rows, a
   * concourse, upper rows, as solid stepped massing (one prism per row). Rows stop where the
   * building runs out (`room` from the floor edge).
   */
  const bowl = (fw: Mm, fy0: Mm, fy1: Mm, rr: Mm, room: Mm, t: { lower: number; upper: number; riseLo: Mm; riseUp: Mm; base: Mm; concourse: Mm; lift: Mm }) => {
    const band = (o0: Mm, o1: Mm) => bowlBand(fw, fy0, fy1, rr, o0, o1);
    const bandLen = (o: Mm) => 2 * (fy1 - fy0 - rr) + (fw - 2 * rr) + Math.PI * (rr + o);
    let o = 1500, seats = 0;
    const n1 = Math.max(0, Math.min(t.lower, Math.floor((room - o) / ROW)));
    const lower: Part[] = [];
    for (let i = 0; i < n1; i++, o += ROW) { lower.push(prism(band(o, o + ROW), 0, t.base + (i + 1) * t.riseLo, 'venueTier')); seats += Math.floor(bandLen(o + ROW / 2) / SEAT); }
    const zLo = t.base + n1 * t.riseLo;
    unique('VENUE.BOWL.LOWER', `Lower bowl (${n1} rows)`, L_SHELL, lower, { rows: n1 });
    const n2 = Math.max(0, Math.min(t.upper, Math.floor((room - o - t.concourse) / ROW)));
    if (n2 > 0) {
      unique('VENUE.BOWL.CONCOURSE', 'Concourse', L_SHELL, [prism(band(o, o + t.concourse), 0, zLo, 'venueTier')]);
      o += t.concourse;
      const upper: Part[] = [];
      const zUp = zLo + t.lift;
      for (let i = 0; i < n2; i++, o += ROW) { upper.push(prism(band(o, o + ROW), 0, zUp + (i + 1) * t.riseUp, 'venueTier')); seats += Math.floor(bandLen(o + ROW / 2) / SEAT); }
      unique('VENUE.BOWL.UPPER', `Upper bowl (${n2} rows)`, L_SHELL, upper, { rows: n2 });
    }
    const top = n2 > 0 ? zLo + t.lift + n2 * t.riseUp : zLo;
    unique('VENUE.BOWL.RAIL', 'Bowl back wall', L_SHELL, [prism(band(o, o + 400), 0, top + 1100, 'venueTier')]);
    report.houseSeats = seats;
    return { rows: [n1, n2], top, outer: o + 400 };
  };

  // ── box rooms: slab and four walls, then the structure inside
  if (BOX_ROOMS.has(p.archetype)) {
    const dark = p.archetype === 'black-box';
    const wallMat: MaterialKey = dark || p.archetype === 'sound-stage' ? 'venueDark' : 'venueWall';
    const wallH = (() => {
      switch (p.archetype) {
        case 'black-box': return clear + ft(4);
        case 'convention': return clear + Math.min(ft(12), Math.max(ft(6), bays(W, ft(90)).b / 12)) + 1500;
        case 'warehouse': return clear + ft(5);
        case 'sound-stage': return clear + ft(7);
        default: return clear;
      }
    })();
    report.wallHeight = wallH;
    slab(dark ? 'venueDark' : p.archetype === 'ballroom' ? 'venueCarpet' : 'venueFloor');
    walls({ stage: wallH, house: wallH, sides: wallH }, wallMat);
  }

  switch (p.archetype) {
    case 'black-box': {
      const wallH = report.wallHeight;
      const step = ft(5), inset = ft(2.5);
      unique('VENUE.GRID', 'Pipe grid (1½" Sch 40 at 5 ft)', L_RIG, pipeGrid(x0 + inset, x1 - inset, y0 + inset, y1 - inset, clear, step, 24), { trim: Math.round(clear) });
      const joists: Part[] = [];
      for (let x = x0 + ft(4); x < x1; x += ft(8)) joists.push(tube([x, y0, wallH - 250], [x, y1, wallH - 250], 80, 'venueSteel'));
      unique('VENUE.ROOF', 'Roof joists', L_STRUCT, joists);
      const pts: [Mm, Mm][] = [];
      for (let x = x0 + inset + step; x < x1 - inset; x += 2 * step) for (let y = y1 - inset - step; y > y0 + inset; y -= 2 * step) pts.push([x, y]);
      rigPoints(pts, clear + 24, 'pipe grid');
      door('VENUE.DOOR.LOAD', 'Load-in door', y0 + D * 0.7, ft(8), ft(10));
      break;
    }
    case 'ballroom': {
      const cx = bays(W, ft(30)), cy = bays(D, ft(40)), soffit: Part[] = [];
      for (let i = 1; i < cx.n; i++) { const x = x0 + i * cx.b; soffit.push(box(x - 225, y0, clear - 300, x + 225, y1, clear, 'venueWall')); }
      for (let j = 1; j < cy.n; j++) { const y = y1 - j * cy.b; soffit.push(box(x0, y - 225, clear - 300, x1, y + 225, clear, 'venueWall')); }
      unique('VENUE.SOFFITS', 'Ceiling coffers / soffits', L_SHELL, soffit);
      const nAir = Math.max(0, Math.round(D / ft(70)) - 1), air: Part[] = [];
      for (let k = 1; k <= nAir; k++) {
        const y = y1 - (D * k) / (nAir + 1);
        air.push(box(x0, y - 100, clear - 250, x1, y + 100, clear, 'venueSteel'), box(x1 - 1200, y - 300, 0, x1, y + 300, clear - 300, 'venueDoor'));
      }
      unique('VENUE.AIRWALLS', `Airwall tracks and stacks (${nAir})`, L_SHELL, air, { count: nAir });
      const ck = 'SC_VENUE_CHANDELIER';
      blocks.push({ key: ck, description: 'Chandelier (planning envelope)', parts: [tube([0, 0, -900], [0, 0, 0], 20, 'venueSteel'), tube([0, 0, -1800], [0, 0, -900], 550, 'venueGlass')] });
      let n = 0;
      for (let i = 0; i < cx.n; i++) for (let j = 0; j < cy.n; j++) {
        const x = x0 + (i + 0.5) * cx.b, y = y1 - (j + 0.5) * cy.b;
        if (y < -ft(15)) instance(`VENUE.CHANDELIER.${++n}`, 'Chandelier', L_FIX, ck, [x, y, clear - 300]);
      }
      const pts: [Mm, Mm][] = [];
      for (let x = x0 + ft(10); x < x1 - ft(5); x += ft(20)) for (let y = y1 - ft(10); y > y0 + ft(5); y -= ft(20)) pts.push([x, y]);
      rigPoints(pts, clear, 'house point');
      door('VENUE.DOOR.SERVICE', 'Service corridor doors', y0 + D * 0.25, ft(10), ft(10));
      break;
    }
    case 'convention': {
      const bx0 = bays(W, ft(90)), depth = Math.min(ft(12), Math.max(ft(6), bx0.b / 12));
      const g = columnGrid(ft(90), ft(90), 900, clear + depth);
      const t = trussLines(g.ys, g.bx.b, ft(10), clear, depth, 90, 'TRUSS');
      unique('VENUE.ROOF.PURLINS', 'Roof girders along the column lines', L_STRUCT, g.xs.map((x) => tube([x, y0, clear + depth], [x, y1, clear + depth], 140, 'venueSteel')));
      const pts: [Mm, Mm][] = [];
      g.ys.slice(1, -1).forEach((y) => { for (let i = 2; i < t.n - 1; i += 2) pts.push([x0 + i * t.len, y]); });
      rigPoints(pts, clear, 'main roof truss panel point');
      const pk = 'SC_VENUE_FLOOR_PIT';
      blocks.push({ key: pk, description: 'Utility floor pit (power, water, data)', parts: [box(-300, -300, -30, 300, 300, 2, 'venueDark')] });
      let n = 0;
      for (let x = x0 + ft(15); x < x1; x += ft(30)) for (let y = y1 - ft(15); y > y0; y -= ft(30)) instance(`VENUE.PIT.${String(++n).padStart(4, '0')}`, 'Utility floor pit', L_SERV, pk, [x, y, 0]);
      door('VENUE.DOOR.DOCK1', 'Drive-in door', y0 + D * 0.6, ft(16), ft(16));
      door('VENUE.DOOR.DOCK2', 'Drive-in door', y0 + D * 0.35, ft(16), ft(16));
      break;
    }
    case 'warehouse': {
      const g = columnGrid(ft(50), ft(50), 300, clear + ft(4));
      trussLines(g.ys, g.bx.b, ft(8), clear, ft(4), 50, 'GIRDER');
      const joists: Part[] = [];
      for (let x = x0 + ft(6); x < x1 - ft(1); x += ft(6)) joists.push(tube([x, y0, clear + ft(4) + 80], [x, y1, clear + ft(4) + 80], 60, 'venueSteel'));
      unique('VENUE.ROOF.JOISTS', 'Open-web roof joists at 6 ft', L_STRUCT, joists);
      let k = 0;
      for (let y = y0 + ft(30); y < y1 - ft(60); y += ft(40)) door(`VENUE.DOOR.DOCK${++k}`, 'Dock door', y, ft(9), ft(10));
      break;
    }
    case 'sound-stage': {
      const step = ft(8), inset = ft(4);
      unique('VENUE.GRID', 'Pipe grid at 8 ft', L_RIG, pipeGrid(x0 + inset, x1 - inset, y0 + inset, y1 - inset, clear, step, 30), { trim: Math.round(clear) });
      const cw = 1100, z = clear - ft(8);
      unique('VENUE.CATWALKS', 'Perimeter catwalks', L_RIG, [
        box(x0, y0, z - 100, x0 + cw, y1, z, 'venueSteel'), box(x1 - cw, y0, z - 100, x1, y1, z, 'venueSteel'),
        box(x0 + cw, y1 - cw, z - 100, x1 - cw, y1, z, 'venueSteel'), box(x0 + cw, y0, z - 100, x1 - cw, y0 + cw, z, 'venueSteel'),
      ], { height: Math.round(z) });
      const pts: [Mm, Mm][] = [];
      for (let x = x0 + inset + step; x < x1 - inset; x += 2 * step) for (let y = y1 - inset - step; y > y0 + inset; y -= 2 * step) pts.push([x, y]);
      rigPoints(pts, clear + 30, 'pipe grid');
      door('VENUE.DOOR.ELEPHANT', 'Elephant door', y0 + D * 0.45, ft(20), Math.min(ft(22), clear - 1000));
      break;
    }
    case 'proscenium': {
      const g = proscenium(W), Hs = clear + ft(8), yP0 = yPro - 600, hw = W / 2 - ft(5);
      // raked orchestra from the pit rail back, a balcony over the back of a deep house
      const yF = yP0 - ft(14), pitch = 950, rise = 170;
      const nRows = Math.max(0, Math.min(40, Math.floor((yF - (y0 + ft(8))) / pitch)));
      const rake: Part[] = [];
      for (let i = 0; i < nRows; i++) { const yt = yF - i * pitch; rake.push(prism([[-hw, yt - pitch], [hw, yt - pitch], [hw, yt], [-hw, yt]], 0, 150 + (i + 1) * rise, 'venueTier')); }
      unique('VENUE.HOUSE.ORCHESTRA', `Orchestra (${nRows} rows)`, L_SHELL, rake, { rows: nRows });
      const perRow = Math.floor((2 * hw) / SEAT);
      let seats = nRows * perRow, balTop = 0;
      if (yPro - y0 > ft(80)) {
        const nb = 8, bp = 900, br = 450, yb = y0 + ft(3) + nb * bp, zB = 150 + nRows * rise + 2700;
        const bal: Part[] = [];
        for (let i = 0; i < nb; i++) { const yt = yb - i * bp; bal.push(prism([[-hw, yt - bp], [hw, yt - bp], [hw, yt], [-hw, yt]], zB - 300, zB + (i + 1) * br, 'venueTier')); }
        bal.push(box(-hw, yb - 200, zB, hw, yb, zB + 1100, 'venueTier'));
        unique('VENUE.HOUSE.BALCONY', `Balcony (${nb} rows)`, L_SHELL, bal, { rows: nb });
        seats += nb * perRow;
        balTop = zB + nb * br;
      }
      const Hh = Math.min(Hs, Math.max(g.proH + ft(22), balTop + 3000));
      report.wallHeight = Hs;
      report.houseSeats = seats;
      unique('VENUE.FLOOR', 'Stage and house floor', L_SHELL, [box(x0 - T, yPro, -150, x1 + T, y1 + T, -2, 'venueFloor'), box(x0 - T, y0 - T, -150, x1 + T, yPro, -2, 'venueCarpet')], { areaM2: Math.round(report.areaM2) });
      unique('VENUE.WALL.STAGE', 'Stage-house back wall', L_SHELL, [box(x0 - T, y1, 0, x1 + T, y1 + T, Hs, 'venueWall')]);
      unique('VENUE.WALL.HOUSE', 'Back-of-house wall', L_SHELL, [box(x0 - T, y0 - T, 0, x1 + T, y0, Hh, 'venueWall')]);
      unique('VENUE.WALL.HR', 'House-right walls', L_SHELL, [box(x1, yP0, 0, x1 + T, y1, Hs, 'venueWall'), box(x1, y0, 0, x1 + T, yP0, Hh, 'venueWall')]);
      unique('VENUE.WALL.HL', 'House-left walls', L_SHELL, [box(x0 - T, yP0, 0, x0, y1, Hs, 'venueWall'), box(x0 - T, y0, 0, x0, yP0, Hh, 'venueWall')]);
      unique('VENUE.PROSCENIUM', `Proscenium ${fmt(g.proW)} × ${fmt(g.proH)}`, L_SHELL, [
        box(x0, yP0, 0, -g.proW / 2, yPro, Hs, 'venueWall'), box(g.proW / 2, yP0, 0, x1, yPro, Hs, 'venueWall'), box(-g.proW / 2, yP0, g.proH, g.proW / 2, yPro, Hs, 'venueWall'),
      ], { width: Math.round(g.proW), height: Math.round(g.proH) });
      // gridiron: loft-block beams running up and downstage, headers at each end
      const grid: Part[] = [];
      for (let x = x0 + ft(6); x <= x1 - ft(6) + 1; x += ft(5)) grid.push(tube([x, yPro + 300, clear], [x, y1 - 300, clear], 60, 'venueSteel'));
      grid.push(tube([x0 + ft(6), yPro + 300, clear], [x1 - ft(6), yPro + 300, clear], 90, 'venueSteel'), tube([x0 + ft(6), y1 - 300, clear], [x1 - ft(6), y1 - 300, clear], 90, 'venueSteel'));
      unique('VENUE.GRIDIRON', 'Gridiron', L_RIG, grid, { height: Math.round(clear) });
      // counterweight line sets at 8 in, battens stored out near the grid
      const bl = Math.min(g.proW + ft(12), W - ft(12)), lk = `SC_VENUE_LINESET_${Math.round(bl)}`;
      blocks.push({ key: lk, description: `Counterweight line set, ${Math.round(bl)} mm batten`, parts: [tube([-bl / 2, 0, 0], [bl / 2, 0, 0], 24, 'venuePipe')] });
      let sets = 0;
      for (let y = yPro + 600; y < y1 - 900; y += 203) { sets++; instance(`VENUE.LINESET.${String(sets).padStart(3, '0')}`, `Line set ${sets}`, L_RIG, lk, [0, y, clear - ft(4)], { set: sets }); }
      const zf = Math.min(ft(30), clear * 0.4), zl = clear - ft(10);
      unique('VENUE.FLYGALLERY', 'Fly gallery, loading rail and arbors', L_RIG, [
        box(x1 - 1500, yPro, zf - 150, x1, y1, zf, 'venueSteel'), box(x1 - 1500, yPro, zl - 150, x1, y1, zl, 'venueSteel'),
        box(x1 - 700, yPro + 600, 0, x1 - 150, y1 - 600, ft(16), 'venueDark'),
      ]);
      const zc = g.proH + ft(14), foh: Part[] = [];
      for (const dy of [ft(30), ft(60)]) { const y = yP0 - dy; if (y > y0 + ft(15)) foh.push(box(x0, y - 450, zc - 150, x1, y + 450, zc, 'venueSteel')); }
      unique('VENUE.FOH', 'Front-of-house catwalks', L_RIG, foh);
      const pts: [Mm, Mm][] = [];
      for (let x = -g.proW / 2 - ft(10); x <= g.proW / 2 + ft(10) + 1; x += ft(10)) for (let y = yPro + ft(5); y < y1 - ft(3); y += ft(10)) pts.push([x, y]);
      rigPoints(pts, clear, 'gridiron');
      door('VENUE.DOOR.LOAD', 'Loading door', y1 - ft(10), ft(10), ft(14), x0);
      report.facts.push(`Opening ${fmt(g.proW)} wide × ${fmt(g.proH)} high`, `${sets} line sets at 8 in`, `About ${seats.toLocaleString()} house seats`);
      break;
    }
    case 'arena': {
      const fw = ft(85), fd = ft(200), fy0 = y1 - fd, depth = ft(12), wallH = clear + depth + 1500;
      report.wallHeight = wallH;
      report.inner = { x0: -fw / 2, y0: fy0, x1: fw / 2, y1 };
      slab('venueFloor');
      walls({ stage: wallH, house: wallH, sides: wallH }, 'venueWall');
      const b = bowl(fw, fy0, y1, ft(28), Math.min((W - fw) / 2, fy0 - y0) - 2000, { lower: 24, upper: 22, riseLo: 420, riseUp: 550, base: 800, concourse: 4500, lift: 3200 });
      // high steel: flat trusses across the building every ~50 ft, catwalks over the floor
      const by = bays(D, ft(50)), ys = Array.from({ length: by.n + 1 }, (_, j) => y1 - j * by.b);
      trussLines(ys, W, ft(12), clear, depth, 110, 'TRUSS');
      unique('VENUE.CATWALKS', 'Catwalks over the floor', L_RIG, [-ft(30), 0, ft(30)].map((x) => box(x - 450, fy0 - ft(20), clear + 300, x + 450, y1, clear + 450, 'venueSteel')));
      const pts: [Mm, Mm][] = [];
      ys.filter((y) => y > fy0 - ft(30)).forEach((y) => { for (let x = -ft(60); x <= ft(60) + 1; x += ft(15)) pts.push([x, y]); });
      rigPoints(pts, clear, 'roof truss bottom chord');
      door('VENUE.DOOR.LOAD', 'Load-in tunnel', y1 - ft(25), ft(16), ft(16));
      report.facts.push(`Event floor ${fmt(fw)} × ${fmt(fd)}`, `${b.rows[0]} + ${b.rows[1]} rows, about ${report.houseSeats.toLocaleString()} bowl seats`);
      break;
    }
    case 'stadium': {
      const fw = ft(200), fd = ft(400), fy0 = y1 - fd;
      report.inner = { x0: -fw / 2, y0: fy0, x1: fw / 2, y1 };
      slab('venueFloor');
      unique('VENUE.FIELD', `Field ${fmt(fw)} × ${fmt(fd)}`, L_SHELL, [box(-fw / 2 - 3000, fy0 - 3000, -2, fw / 2 + 3000, y1, 0, 'venueTurf')]);
      const b = bowl(fw, fy0, y1, ft(60), Math.min((W - fw) / 2, fy0 - y0) - 3000, { lower: 30, upper: 30, riseLo: 420, riseUp: 600, base: 1200, concourse: 6000, lift: 4000 });
      report.wallHeight = b.top + 2000;
      walls({ stage: ft(12), house: b.top + 2000, sides: b.top + 2000 }, 'venueWall');
      door('VENUE.DOOR.LOAD', 'Field tunnel', y1 - ft(30), ft(20), ft(16));
      report.facts.push(`Field ${fmt(fw)} × ${fmt(fd)}`, `${b.rows[0]} + ${b.rows[1]} rows, about ${report.houseSeats.toLocaleString()} bowl seats`, 'No roof: build a ground-supported roof (Structure)');
      break;
    }
    case 'amphitheatre': {
      const sw = clampN(0.3 * W, ft(80), ft(130)), sx = sw / 2, H = clear + ft(6), yP0 = yPro - 600;
      report.wallHeight = H;
      report.inner = { x0: -sx, y0: yP0 - 1, x1: sx, y1 };
      unique('VENUE.FLOOR', 'Site and stage floor', L_SHELL, [box(x0, y0, -150, x1, y1 + T, -4, 'venueTurf'), box(-sx - T, yP0, -140, sx + T, y1 + T, -1, 'venueFloor')], { areaM2: Math.round(report.areaM2) });
      unique('VENUE.WALL.STAGE', 'Stage-house back wall', L_SHELL, [box(-sx - T, y1, 0, sx + T, y1 + T, H, 'venueWall')]);
      unique('VENUE.WALL.HR', 'Stage-house wall, house right', L_SHELL, [box(sx, yP0, 0, sx + T, y1, H, 'venueWall')]);
      unique('VENUE.WALL.HL', 'Stage-house wall, house left', L_SHELL, [box(-sx - T, yP0, 0, -sx, y1, H, 'venueWall')]);
      unique('VENUE.PROSCENIUM', 'Stage-house header', L_SHELL, [box(-sx, yP0, clear + ft(1), sx, yPro, H, 'venueWall')]);
      unique('VENUE.GRID', 'Stage-house grid at 6 ft', L_RIG, pipeGrid(-sx + ft(3), sx - ft(3), yPro + ft(3), y1 - ft(3), clear, ft(6), 30), { trim: Math.round(clear) });
      const ty = bays(y1 - yPro, ft(12));
      trussLines(Array.from({ length: Math.max(1, ty.n - 1) }, (_, j) => y1 - (j + 1) * ty.b), sw, ft(10), clear + ft(1), ft(4), 70, 'TRUSS', -sx, sw);
      const pts: [Mm, Mm][] = [];
      for (let x = -sx + ft(10); x < sx - ft(5); x += ft(10)) for (let y = yPro + ft(5); y < y1 - ft(3); y += ft(10)) pts.push([x, y]);
      rigPoints(pts, clear + 30, 'stage-house grid');
      door('VENUE.DOOR.LOAD', 'Loading door', y1 - ft(12), ft(12), ft(14), sx);
      // reserved seats in a fan about a point just downstage of the stage, lawn behind
      const cy = yP0 - ft(5), r0 = ft(30), pitch = 920, rise = 220, band = 1800;
      const n = Math.max(0, Math.min(40, Math.floor((cy - r0 - (y0 + ft(60))) / pitch)));
      const rOut = r0 + n * pitch;
      const half = Math.min((42 * Math.PI) / 180, Math.asin(Math.min(1, Math.max(0.2, (W / 2 - ft(10)) / (rOut + 14 * band)))));
      const a0 = 1.5 * Math.PI - half, a1 = 1.5 * Math.PI + half;
      const fan: Part[] = [];
      let seats = 0;
      for (let i = 0; i < n; i++) { const r = r0 + i * pitch; fan.push(prism(sector(0, cy, r, r + pitch, a0, a1), 0, 300 + (i + 1) * rise, 'venueTier')); seats += Math.floor((2 * half * (r + pitch / 2)) / SEAT); }
      unique('VENUE.HOUSE.FAN', `Reserved seats (${n} rows)`, L_SHELL, fan, { rows: n });
      report.houseSeats = seats;
      const zTop = 300 + n * rise, rl = rOut + 2000;
      const nl = Math.max(0, Math.min(14, Math.floor((cy - rl - (y0 + ft(10))) / band)));
      const lawn: Part[] = [];
      for (let i = 0; i < nl; i++) lawn.push(prism(sector(0, cy, rl + i * band, rl + (i + 1) * band, a0 - 0.05, a1 + 0.05), 0, zTop + 400 + i * 300, 'venueTurf'));
      unique('VENUE.LAWN', `Lawn (${nl} terraces)`, L_SHELL, lawn);
      const lawnCap = Math.round(((2 * half + 0.1) / 2) * ((rl + nl * band) ** 2 - rl ** 2) / 1e6 / 0.93);
      // covered pavilion over the reserved seats
      if (n > 0) {
        const rc = rOut + 600, zr = ft(58), ck = 'SC_VENUE_PAVILION_COLUMN';
        blocks.push({ key: ck, description: 'Pavilion column', parts: [tube([0, 0, 0], [0, 0, zr], 300, 'venueColumn')] });
        const nc = Math.max(2, Math.round((2 * half * rc) / ft(40)));
        for (let k = 0; k <= nc; k++) { const a = a0 + ((a1 - a0) * k) / nc; instance(`VENUE.PAVILION.COL.${k + 1}`, 'Pavilion column', L_STRUCT, ck, [rc * Math.cos(a), cy + rc * Math.sin(a), 0]); }
        unique('VENUE.PAVILION.ROOF', 'Pavilion roof', L_STRUCT, [prism(sector(0, cy, ft(6), rc + 1500, a0 - 0.02, a1 + 0.02, 24), zr, zr + 400, 'roofSkin')]);
      }
      report.facts.push(`Stage house ${fmt(sw)} wide`, `${n} rows, about ${seats.toLocaleString()} reserved seats; lawn for about ${lawnCap.toLocaleString()}`);
      break;
    }
    case 'tent': {
      const f = tent!, X = W / 2, rise = f.ridge - f.eave, slope = Math.hypot(X, rise), tilt = Math.atan2(rise, X), nb = Math.round(D / 5000);
      report.wallHeight = f.ridge;
      // cut along the ridge: the half facing the camera drops away
      report.inner = { x0: 0, y0: y0 + 800, x1: 0, y1: y1 - 800 };
      slab('venueFloor');
      const leg = f.span >= 30000 ? 300 : 220, fk = `SC_VENUE_TENT_FRAME_${f.span / 1000}M`;
      blocks.push({ key: fk, description: `Clearspan frame, ${f.span / 1000} m span, eave ${(f.eave / 1000).toFixed(1)} m`, parts: [
        box(-X, -60, 0, -X + leg, 60, f.eave, 'venueSteel'), box(X - leg, -60, 0, X, 60, f.eave, 'venueSteel'),
        tube([-X + leg / 2, 0, f.eave], [0, 0, f.ridge], leg * 0.45, 'venueSteel'), tube([0, 0, f.ridge], [X - leg / 2, 0, f.eave], leg * 0.45, 'venueSteel'),
      ] });
      for (let j = 0; j <= nb; j++) instance(`VENUE.FRAME.${String(j + 1).padStart(3, '0')}`, `Frame ${j + 1}`, L_STRUCT, fk, [0, y1 - j * 5000, 0], { bay: j });
      unique('VENUE.PURLINS', 'Eave beams and purlins', L_STRUCT, [
        tube([-X + leg / 2, y0, f.eave], [-X + leg / 2, y1, f.eave], 60, 'venueSteel'), tube([X - leg / 2, y0, f.eave], [X - leg / 2, y1, f.eave], 60, 'venueSteel'),
        tube([-X / 2, y0, f.rig], [-X / 2, y1, f.rig], 50, 'venueSteel'), tube([X / 2, y0, f.rig], [X / 2, y1, f.rig], 50, 'venueSteel'),
        tube([0, y0, f.ridge], [0, y1, f.ridge], 60, 'venueSteel'),
      ]);
      // fabric: two roof slopes (tilted from the eave up to the ridge), side walls, gable ends
      const yc = (y0 + y1) / 2;
      for (const s of [1, -1] as const) {
        objects.push({ id: `VENUE.ROOF.${s > 0 ? 'HR' : 'HL'}`, label: `Roof fabric, house ${s > 0 ? 'right' : 'left'}`, layer: L_SHELL, system: 'venue', group: 'venue',
          parts: [box(-D / 2, 0, 0, D / 2, slope, 30, 'roofSkin')], position: [s * X, yc, f.eave + 150], rotationZ: (s * Math.PI) / 2, tilt, meta });
      }
      unique('VENUE.WALL.HR', 'Side wall, house right', L_SHELL, [box(X, y0, 0, X + 30, y1, f.eave, 'roofSkin')]);
      unique('VENUE.WALL.HL', 'Side wall, house left', L_SHELL, [box(-X - 30, y0, 0, -X, y1, f.eave, 'roofSkin')]);
      const gable: [number, number][] = [[-X, 0], [X, 0], [X, f.eave], [0, f.ridge], [-X, f.eave]];
      for (const [id, label, y] of [['VENUE.WALL.STAGE', 'Gable end, stage', y1 + 30], ['VENUE.WALL.HOUSE', 'Gable end, house', y0]] as const) {
        objects.push({ id, label, layer: L_SHELL, system: 'venue', group: 'venue', parts: [prism(gable, 0, 30, 'roofSkin')], position: [0, y, 0], rotationZ: 0, tilt: Math.PI / 2, meta });
      }
      const pts: [Mm, Mm][] = [];
      for (let j = 0; j <= nb; j++) for (const x of [-X / 2, X / 2]) pts.push([x, y1 - j * 5000]);
      rigPoints(pts, f.rig - 150, 'rafter quarter point');
      report.facts.push(`${f.span / 1000} m span × ${f.length / 1000} m, ${nb} bays at 5 m`, `Eave ${fmt(f.eave)}, ridge ${fmt(f.ridge)}`);
      if (Math.abs(f.span - p.width) > 1 || Math.abs(f.length - p.depth) > 1) report.facts.push('Snapped up to the next standard span and whole bays');
      break;
    }
  }

  return { objects, blocks, annotations, warnings, report };
}

/** seats and columns: a seat whose centre is inside a column plus this clearance is removed */
export const COLUMN_SEAT_CLEARANCE = 450;
