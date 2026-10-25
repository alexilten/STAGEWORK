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
    rating: { kg: 250 * LB, label: '250 lb at a grid hanger' },
    power: '200–400 A 3φ company switch', floor: 'Sprung or MDF, ~100–150 psf',
  },
  ballroom: {
    id: 'ballroom', name: 'Hotel ballroom', blurb: 'Column-free, low ceiling, house rigging points, airwalls',
    min: ft(60), max: ft(350), shortMax: ft(200), example: [ft(130), ft(220)],
    clear: (w, d) => (sqft(w, d) < 15000 ? ft(18) : sqft(w, d) < 35000 ? ft(24) : ft(30)),
    rating: { kg: 1000 * LB, label: '1,000 lb per house point' },
    power: 'In-house 100–400 A 3φ disconnects', floor: 'Carpet on slab, ~100 psf',
  },
  convention: {
    id: 'convention', name: 'Convention hall', blurb: 'Column grid, deep roof trusses, rated panel points, floor pits',
    min: ft(150), max: ft(2000), example: [ft(300), ft(420)],
    clear: () => ft(35),
    rating: { kg: 2000 * LB, label: '2,000 lb at a main-truss panel point' },
    power: 'Floor pits ~30 ft o.c., 208/480 V', floor: 'Slab, 300–350 psf',
  },
  warehouse: {
    id: 'warehouse', name: 'Warehouse', blurb: 'Tilt-up shell, column grid, light joists: ground-supported rig',
    min: ft(80), max: ft(1000), example: [ft(250), ft(500)],
    clear: () => ft(32),
    rating: null,
    power: 'Building service usually too small: temp generators', floor: '6–8 in slab',
  },
  'sound-stage': {
    id: 'sound-stage', name: 'Sound stage', blurb: '40 ft pipe grid, perimeter catwalks, elephant door',
    min: ft(60), max: ft(300), example: [ft(120), ft(180)],
    clear: (w, d) => (Math.max(w, d) < ft(100) ? ft(30) : ft(38)),
    rating: { kg: 500 * LB, label: '500 lb at a grid point' },
    power: '2,000–4,000 A house power, cam-lok tie-ins', floor: 'Level slab, ~250 psf',
  },
};
export const VENUE_ORDER: VenueArchetype[] = ['black-box', 'ballroom', 'convention', 'warehouse', 'sound-stage'];

export interface VenueFit {
  ok: boolean;
  /** 'big' / 'small' when outside the range */
  issue: 'big' | 'small' | null;
  message: string | null;
  /** archetypes the footprint does fit, best first */
  suggest: VenueArchetype[];
}

const fitsRange = (s: VenueSpec, w: Mm, d: Mm) => {
  const lo = Math.min(w, d), hi = Math.max(w, d);
  if (hi > s.max + 1 || (s.shortMax != null && lo > s.shortMax + 1)) return 'big';
  if (lo < s.min - 1) return 'small';
  return null;
};

export function venueFit(a: VenueArchetype, w: Mm, d: Mm, units: DisplayUnits = 'imperial'): VenueFit {
  const s = VENUE_SPECS[a];
  const issue = fitsRange(s, w, d);
  if (!issue) return { ok: true, issue: null, message: null, suggest: [] };
  const pref: VenueArchetype[] = issue === 'big'
    ? ['sound-stage', 'warehouse', 'convention', 'ballroom', 'black-box']
    : ['black-box', 'sound-stage', 'ballroom', 'warehouse', 'convention'];
  const suggest = pref.filter((k) => k !== a && !fitsRange(VENUE_SPECS[k], w, d));
  const fmt = (mm: Mm) => formatLength(units === 'imperial' ? Math.round(mm / FT) * FT : Math.round(mm / 1000) * 1000, units);
  const limit = issue === 'big'
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
  /** bottom of steel / grid / ceiling */
  clear: Mm;
  wallHeight: Mm;
  /** interior plan box (world mm) */
  box: { x0: Mm; y0: Mm; x1: Mm; y1: Mm };
  columns: { x: Mm; y: Mm }[];
  columnSize: Mm;
  bays: { x: Mm; y: Mm; nx: number; ny: number } | null;
  rigPoints: number;
  rating: VenueSpec['rating'];
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
const ORIGIN: Vec3 = [0, 0, 0];
const L_SHELL: LayerPath = '05_VENUE::05_01_SHELL', L_STRUCT: LayerPath = '05_VENUE::05_02_STRUCTURE', L_RIG: LayerPath = '05_VENUE::05_03_RIGGING',
  L_FIX: LayerPath = '05_VENUE::05_04_FIXTURES', L_SERV: LayerPath = '05_VENUE::05_05_SERVICES', L_GRID: LayerPath = '05_VENUE::05_06_GRID_LINES';

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

export function resolveVenue(p: VenueParams, ctx: VenueContext, units: DisplayUnits = 'imperial') {
  const spec = VENUE_SPECS[p.archetype];
  const objects: SceneObject[] = [];
  const blocks: BlockDef[] = [];
  const annotations: Annotation[] = [];
  const warnings: Warning[] = [];
  const W = p.width, D = p.depth;
  const fit = venueFit(p.archetype, W, D, units);
  const x0 = -W / 2, x1 = W / 2, y1 = ctx.backY + p.upstage, y0 = y1 - D;
  const clear = p.clearHeight ?? spec.clear(W, D);
  const report: VenueReport = {
    archetype: p.archetype, name: spec.name, built: false, fit, width: W, depth: D,
    areaM2: (W * D) / 1e6, areaSqFt: sqft(W, D), clear, wallHeight: clear, box: { x0, y0, x1, y1 },
    columns: [], columnSize: 0, bays: null, rigPoints: 0, rating: spec.rating, power: spec.power, floor: spec.floor,
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

  // ── shell: slab, four walls outside the footprint, stage wall at +Y
  const dark = p.archetype === 'black-box';
  const wallMat: MaterialKey = dark || p.archetype === 'sound-stage' ? 'venueDark' : 'venueWall';
  const T = p.archetype === 'warehouse' ? 230 : 300;
  const wallH = (() => {
    switch (p.archetype) {
      case 'black-box': return clear + ft(4);
      case 'ballroom': return clear;
      case 'convention': return clear + Math.min(ft(12), Math.max(ft(6), bays(W, ft(90)).b / 12)) + 1500;
      case 'warehouse': return clear + ft(5);
      case 'sound-stage': return clear + ft(7);
    }
  })();
  report.wallHeight = wallH;
  const floorMat: MaterialKey = dark ? 'venueDark' : p.archetype === 'ballroom' ? 'venueCarpet' : 'venueFloor';
  unique('VENUE.FLOOR', `${spec.name} floor`, L_SHELL, [box(x0 - T, y0 - T, -150, x1 + T, y1 + T, -2, floorMat)], { areaM2: Math.round(report.areaM2) });
  unique('VENUE.WALL.STAGE', 'Stage wall', L_SHELL, [box(x0 - T, y1, 0, x1 + T, y1 + T, wallH, wallMat)]);
  unique('VENUE.WALL.HOUSE', 'Back-of-house wall', L_SHELL, [box(x0 - T, y0 - T, 0, x1 + T, y0, wallH, wallMat)]);
  unique('VENUE.WALL.HR', 'House-right wall', L_SHELL, [box(x1, y0, 0, x1 + T, y1, wallH, wallMat)]);
  unique('VENUE.WALL.HL', 'House-left wall', L_SHELL, [box(x0 - T, y0, 0, x0, y1, wallH, wallMat)]);
  const door = (id: string, label: string, y: Mm, w: Mm, h: Mm) => unique(id, label, L_SHELL, [box(x1 - 60, y - w / 2, 0, x1 + 10, y + w / 2, h, 'venueDoor')], { width: Math.round(w), height: Math.round(h) });

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
  const trussLines = (ys: Mm[], bayX: Mm, panelPref: Mm, zb: Mm, depth: Mm, r: Mm, tag: string) => {
    const per = Math.max(1, Math.round(bayX / panelPref)), len = bayX / per, n = Math.round(W / len);
    const key = `SC_VENUE_${tag}_PANEL_${Math.round(len)}x${Math.round(depth)}`;
    blocks.push({ key, description: `${tag === 'TRUSS' ? 'Roof truss' : 'Joist girder'} panel ${Math.round(len)} × ${Math.round(depth)} mm`, parts: trussPanel(len, depth, r) });
    ys.forEach((y, j) => { for (let i = 0; i < n; i++) instance(`VENUE.${tag}.${gridLabel(j)}.${String(i + 1).padStart(3, '0')}`, `${tag === 'TRUSS' ? 'Roof truss' : 'Joist girder'} ${gridLabel(j)}`, L_STRUCT, key, [x0 + i * len, y, zb]); });
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

  switch (p.archetype) {
    case 'black-box': {
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
      for (let i = 1; i < cx.n; i++) { const x = x0 + i * cx.b; soffit.push(box(x - 300, y0, clear - 600, x + 300, y1, clear, 'venueWall')); }
      for (let j = 1; j < cy.n; j++) { const y = y1 - j * cy.b; soffit.push(box(x0, y - 300, clear - 600, x1, y + 300, clear, 'venueWall')); }
      unique('VENUE.SOFFITS', 'Ceiling coffers / soffits', L_SHELL, soffit);
      const nAir = Math.max(0, Math.round(D / ft(70)) - 1), air: Part[] = [];
      for (let k = 1; k <= nAir; k++) {
        const y = y1 - (D * k) / (nAir + 1);
        air.push(box(x0, y - 100, clear - 250, x1, y + 100, clear, 'venueSteel'), box(x1 - 1200, y - 300, 0, x1, y + 300, clear - 300, 'venueDoor'));
      }
      unique('VENUE.AIRWALLS', `Airwall tracks and stacks (${nAir})`, L_SHELL, air, { count: nAir });
      const ck = 'SC_VENUE_CHANDELIER';
      blocks.push({ key: ck, description: 'Chandelier (planning envelope)', parts: [tube([0, 0, -1200], [0, 0, 0], 20, 'venueSteel'), tube([0, 0, -2700], [0, 0, -1200], 900, 'venueGlass')] });
      let n = 0;
      for (let i = 0; i < cx.n; i++) for (let j = 0; j < cy.n; j++) {
        const x = x0 + (i + 0.5) * cx.b, y = y1 - (j + 0.5) * cy.b;
        if (y < -ft(15)) instance(`VENUE.CHANDELIER.${++n}`, 'Chandelier', L_FIX, ck, [x, y, clear - 600]);
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
      for (let x = x0 + inset; x <= x1 - inset + 1; x += step) for (let y = y1 - inset; y >= y0 + inset - 1; y -= step) pts.push([x, y]);
      rigPoints(pts, clear + 30, 'pipe grid');
      door('VENUE.DOOR.ELEPHANT', 'Elephant door', y0 + D * 0.45, ft(20), Math.min(ft(22), clear - 1000));
      break;
    }
  }

  return { objects, blocks, annotations, warnings, report };
}

/** seats and columns: a seat whose centre is inside a column plus this clearance is removed */
export const COLUMN_SEAT_CLEARANCE = 450;
