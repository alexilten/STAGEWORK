import type { DeckSystem } from '../catalog';
import { DEFAULT_SHAPES, type StageParams, type StageShape } from '../schema';
import { resolveModules, snapStep } from './modular';
import type { Annotation, BlockDef, Part, Resolved1D, SceneObject, Vec3, Warning } from './types';

export interface DeckArea {
  id: string;
  label: string;
  kind: 'main' | 'thrust' | 'runway' | 'bstage' | 'riser';
  group: string;
  minX: number; maxX: number; minY: number; maxY: number;
  /** level the legs stand on, and the platform top */
  base: number;
  top: number;
  cols: number;
  rows: number;
  /** long side of the platforms along X or along Y */
  orient: 'x' | 'y';
}

export interface DeckLayout {
  width: Resolved1D;
  depth: Resolved1D;
  height: Resolved1D;
  shape: StageShape;
  primaryCount: number;
  infillCount: number;
  legCount: number;
  legLength: number;
  /** main deck */
  footprint: { minX: number; maxX: number; minY: number; maxY: number };
  /** every platform area including extensions and risers */
  areas: DeckArea[];
  /** custom curved apron (rounded front), plan polygon */
  apron: { depth: number; points: [number, number][] } | null;
  /** plan rectangles at floor level that the audience must keep clear of */
  keepOut: { minX: number; maxX: number; minY: number; maxY: number }[];
  /** total plan area of all platform tops (risers counted once, on top of the deck) */
  areaMm2: number;
}

/**
 * Lay out platforms on a grid of `short`-sized cells. Each row (one platform deep)
 * is filled with primary platforms long-side along X, plus one infill square when
 * the column count is odd. Only full manufacturer platforms are ever produced.
 * Extensions (thrust, runway, B-stage) and risers are further areas filled the same way;
 * a runway runs its platforms lengthwise (long side along Y).
 */
export function resolveDeck(stage: StageParams, sys: DeckSystem) {
  if (Math.abs(sys.long - 2 * sys.short) > 0.5 || Math.abs(sys.infill.long - sys.short) > 0.5)
    throw new Error(`Deck system ${sys.id}: layout requires long = 2 × short and a square infill`);

  const width = resolveModules(stage.width, sys.short, 2, 60);
  const depth = resolveModules(stage.depth, sys.short, 1, 40);
  const height = snapStep(stage.height, sys.minHeight, sys.heightStep, sys.minHeight, sys.maxHeight);
  label(width, sys.short, sys.label); label(depth, sys.short, sys.label);

  const W = width.resolved, D = depth.resolved, H = height.resolved;
  const legLength = H - sys.frameDepth;
  const shape: StageShape = stage.shape ?? 'rect';
  const S = sys.short;
  const warnings: Warning[] = [];
  const annotations: Annotation[] = [];

  const areas: DeckArea[] = [{ id: 'MAIN', label: 'Main deck', kind: 'main', group: 'stage', minX: -W / 2, maxX: W / 2, minY: 0, maxY: D, base: 0, top: H, cols: width.modules, rows: depth.modules, orient: 'x' }];
  const centred = (id: string, label: string, kind: DeckArea['kind'], cols: number, rows: number, maxY: number, orient: DeckArea['orient'] = 'x'): DeckArea =>
    ({ id, label, kind, group: 'stage', minX: (-cols * S) / 2, maxX: (cols * S) / 2, minY: maxY - rows * S, maxY, base: 0, top: H, cols, rows, orient });

  if (shape === 'thrust') {
    const t = { ...DEFAULT_SHAPES.thrust, ...stage.thrust };
    const cols = Math.min(width.modules, resolveModules(t.width, S, 1, 40).modules);
    const rows = resolveModules(t.depth, S, 1, 20).modules;
    areas.push(centred('THRUST', 'Thrust', 'thrust', cols, rows, 0));
  } else if (shape === 'runway') {
    const r = { ...DEFAULT_SHAPES.runway, ...stage.runway };
    const cols = resolveModules(r.width, S, 1, 4).modules;
    const rows = resolveModules(r.length, S, 2, 40).modules;
    areas.push(centred('RUNWAY', 'Runway', 'runway', cols, rows, 0, 'y'));
    if (r.endWidth > 0 && r.endDepth > 0) {
      const ec = Math.max(cols, resolveModules(r.endWidth, S, 1, 30).modules);
      const er = resolveModules(r.endDepth, S, 1, 20).modules;
      areas.push(centred('BSTAGE', 'B-stage', 'bstage', ec, er, -rows * S));
    }
  }

  // ── risers (on the main deck)
  for (const rp of stage.risers ?? []) {
    const cols = resolveModules(rp.width, S, 1, width.modules).modules;
    const rows = resolveModules(rp.depth, S, 1, depth.modules).modules;
    const rh = snapStep(rp.height, sys.minHeight, sys.heightStep, sys.minHeight, sys.maxHeight).resolved;
    // snap the plan position to half a module so riser edges land on deck seams
    const x = Math.round(rp.x / (S / 2)) * (S / 2);
    const y0 = Math.round(rp.y / S) * S;
    const a: DeckArea = { id: `RISER_${rp.id.toUpperCase()}`, label: rp.name, kind: 'riser', group: `riser:${rp.id}`, minX: x - (cols * S) / 2, maxX: x + (cols * S) / 2, minY: y0, maxY: y0 + rows * S, base: H, top: H + rh, cols, rows, orient: 'x' };
    if (a.minX < -W / 2 - 0.5 || a.maxX > W / 2 + 0.5 || a.minY < -0.5 || a.maxY > D + 0.5)
      warnings.push({ level: 'error', code: 'riser.outside', target: a.group, message: `${rp.name} overhangs the main deck — move it or make it smaller.` });
    for (const b of areas.filter((o) => o.kind === 'riser'))
      if (a.minX < b.maxX - 0.5 && a.maxX > b.minX + 0.5 && a.minY < b.maxY - 0.5 && a.maxY > b.minY + 0.5)
        warnings.push({ level: 'error', code: 'riser.overlap', target: a.group, message: `${rp.name} overlaps ${b.label}.` });
    areas.push(a);
  }

  const blocks = new Map<string, BlockDef>();
  const addBlock = (b: BlockDef) => { if (!blocks.has(b.key)) blocks.set(b.key, b); return b.key; };
  const primaryKey = addBlock({ key: `SC_DECK_${tag(sys.label)}`, description: `${sys.model} — ${sys.label}`, catalogId: sys.id, parts: platformParts(sys, sys.long, sys.short) });
  const infillKey = addBlock({ key: `SC_DECK_${tag(sys.infill.label)}`, description: `${sys.model} infill — ${sys.infill.label}`, catalogId: sys.id, parts: platformParts(sys, sys.infill.long, sys.infill.short) });
  const legKey = (len: number) => addBlock({ key: `SC_LEG_${Math.round(len)}`, description: `Platform leg Ø${sys.legDiameter} × ${Math.round(len)} mm`, catalogId: sys.id,
    parts: [{ kind: 'cyl', from: [0, 0, 0], to: [0, 0, len], r: sys.legDiameter / 2, mat: 'leg' }] });

  const objects: SceneObject[] = [];
  let primaryCount = 0, infillCount = 0, legCount = 0;
  for (const a of areas) {
    const legLen = a.top - a.base - sys.frameDepth;
    const lk = legKey(legLen);
    // lines of platforms: along X (one row per module of depth) or along Y (one column per module of width)
    const lines = a.orient === 'x' ? a.rows : a.cols;
    const along = a.orient === 'x' ? a.cols : a.rows;
    const prefix = a.kind === 'main' ? 'DECK' : `DECK.${a.id}`;
    for (let r = 0; r < lines; r++) {
      // odd module count: the infill goes in the middle so the area stays symmetric
      const pieces: ('P' | 'I')[] = [];
      const nP = Math.floor(along / 2);
      for (let i = 0; i < nP; i++) pieces.push('P');
      if (along % 2) pieces.splice(Math.floor(nP / 2), 0, 'I');
      let c0 = 0;
      pieces.forEach((p, c) => {
        const len = p === 'P' ? sys.long : sys.short;
        const mid = c0 + len / 2;
        c0 += len;
        const xC = a.orient === 'x' ? a.minX + mid : a.minX + (r + 0.5) * S;
        const yC = a.orient === 'x' ? a.minY + (r + 0.5) * S : a.minY + mid;
        const rot = a.orient === 'x' ? 0 : Math.PI / 2;
        const id = `${prefix}.R${pad(r + 1)}C${pad(c + 1)}`;
        if (p === 'P') primaryCount++; else infillCount++;
        objects.push({
          id, label: `${p === 'P' ? sys.label : sys.infill.label} platform`, layer: a.kind === 'riser' ? '10_STAGE::10_02_RISERS' : '10_STAGE::10_01_DECKING', system: 'decking', group: a.group,
          block: p === 'P' ? primaryKey : infillKey,
          position: [xC, yC, a.top], rotationZ: rot,
          meta: { catalogId: sys.id, module: p === 'P' ? sys.label : sys.infill.label, area: a.label, row: r + 1, col: c + 1 },
        });
        const hx = len / 2 - sys.legInset, hy = S / 2 - sys.legInset;
        [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].forEach(([dx, dy], k) => {
          legCount++;
          const [ox, oy] = a.orient === 'x' ? [dx, dy] : [-dy, dx];
          objects.push({
            id: `${id}.LEG${k + 1}`, label: 'Platform leg', layer: '10_STAGE::10_03_SUPPORTS', system: 'supports', group: a.group,
            block: lk, position: [xC + ox, yC + oy, a.base], rotationZ: 0,
            meta: { catalogId: sys.id, length: Math.round(legLen) },
          });
        });
      });
    }
  }

  // ── rounded front: a custom-built curved apron (not a hire platform)
  let apron: DeckLayout['apron'] = null;
  if (shape === 'rounded') {
    const d = Math.max(300, Math.min(W / 2, (stage.apron ?? DEFAULT_SHAPES.apron).depth));
    const R = (W * W / 4 + d * d) / (2 * d), cy = R - d;
    const a0 = Math.asin(W / 2 / R);
    const points: [number, number][] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const t = -a0 + (2 * a0 * i) / n;
      points.push([Math.round(R * Math.sin(t) * 10) / 10, Math.round((cy - R * Math.cos(t)) * 10) / 10]);
    }
    points[0] = [-W / 2, 0]; points[n] = [W / 2, 0];
    apron = { depth: d, points };
    objects.push({
      id: 'APRON.CURVED', label: 'Curved apron (custom build)', layer: '10_STAGE::10_04_FINISHES', system: 'decking', group: 'stage',
      parts: [{ kind: 'prism', points, z0: 0, z1: H, mat: 'deckTop' }], position: [0, 0, 0], rotationZ: 0,
      meta: { material: `${stage.finish} finish`, depth: Math.round(d), radius: Math.round(R), note: 'Custom carpentry — not a hire platform' },
    });
    warnings.push({ level: 'info', code: 'deck.apron', target: 'stage', message: `The curved apron (${Math.round(d)} mm deep, R ${(R / 1000).toFixed(2)} m) is custom carpentry, not hire decking.` });
  }

  // ── fascia on every exposed edge (upstage edge of the main deck stays open)
  if (stage.fascia) {
    const t = 12;
    for (const a of areas) {
      const others = areas.filter((o) => o !== a && o.base === a.base);
      const edges: { side: 'front' | 'back' | 'left' | 'right'; from: number; to: number }[] = [];
      const free = (lo: number, hi: number, covers: [number, number][]) => subtract([lo, hi], covers);
      const touch = (k: 'minY' | 'maxY' | 'minX' | 'maxX', v: number) => others.filter((o) => Math.abs(o[k] - v) < 0.5);
      const frontCover: [number, number][] = touch('maxY', a.minY).map((o) => [o.minX, o.maxX]);
      if (a.kind === 'main' && apron) frontCover.push([a.minX, a.maxX]);
      for (const [f, to] of free(a.minX, a.maxX, frontCover)) edges.push({ side: 'front', from: f, to });
      if (a.kind !== 'main') for (const [f, to] of free(a.minX, a.maxX, touch('minY', a.maxY).map((o) => [o.minX, o.maxX]))) edges.push({ side: 'back', from: f, to });
      for (const [f, to] of free(a.minY, a.maxY, touch('maxX', a.minX).map((o) => [o.minY, o.maxY]))) edges.push({ side: 'left', from: f, to });
      for (const [f, to] of free(a.minY, a.maxY, touch('minX', a.maxX).map((o) => [o.minY, o.maxY]))) edges.push({ side: 'right', from: f, to });
      edges.forEach((e, i) => {
        const z0 = a.base, z1 = a.top;
        const min: Vec3 = e.side === 'front' ? [e.from, a.minY - t, z0] : e.side === 'back' ? [e.from, a.maxY, z0] : e.side === 'left' ? [a.minX - t, e.from, z0] : [a.maxX, e.from, z0];
        const max: Vec3 = e.side === 'front' ? [e.to, a.minY, z1] : e.side === 'back' ? [e.to, a.maxY + t, z1] : e.side === 'left' ? [a.minX, e.to, z1] : [a.maxX + t, e.to, z1];
        objects.push({
          id: `FASCIA.${a.id}.${e.side.toUpperCase()}${i ? `.${i}` : ''}`, label: `Fascia — ${a.label.toLowerCase()} ${e.side}`, layer: '10_STAGE::10_04_FINISHES', system: 'finishes', group: a.group,
          parts: [{ kind: 'box', min, max, mat: 'fascia' }], position: [0, 0, 0], rotationZ: 0,
          meta: { material: `${stage.finish} fascia`, thickness: t },
        });
      });
    }
  }

  // ── dimensions for extensions and risers
  for (const a of areas.filter((o) => o.kind !== 'main')) {
    const tag = a.id;
    annotations.push(
      { id: `DIM.${tag}.WIDTH`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [a.minX, a.minY - 600, a.top], to: [a.maxX, a.minY - 600, a.top], value: a.maxX - a.minX, label: `${a.label} width` },
      { id: `DIM.${tag}.DEPTH`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [a.maxX + 600, a.minY, a.top], to: [a.maxX + 600, a.maxY, a.top], value: a.maxY - a.minY, label: `${a.label} depth` },
    );
    if (a.kind === 'riser') annotations.push({ id: `DIM.${tag}.HEIGHT`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [a.minX - 450, a.minY, a.base], to: [a.minX - 450, a.minY, a.top], value: a.top - a.base, label: `${a.label} above deck` });
  }
  if (apron) annotations.push({ id: 'DIM.APRON.DEPTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [600, -apron.depth, H], to: [600, 0, H], value: apron.depth, label: 'Apron depth' });

  if (!width.exact) warnings.push({ level: 'info', code: 'deck.width', target: 'stage', message: `Stage width snapped to ${width.modules} × ${fmtMm(S)} modules.` });
  if (!depth.exact) warnings.push({ level: 'info', code: 'deck.depth', target: 'stage', message: `Stage depth snapped to ${depth.modules} platform rows.` });
  if (!height.exact) warnings.push({ level: 'info', code: 'deck.height', target: 'stage', message: `Stage height snapped to the ${fmtMm(sys.heightStep)} leg increment.` });
  if (infillCount > 0) warnings.push({ level: 'info', code: 'deck.infill', target: 'stage', message: `Odd module count: ${infillCount} × ${sys.infill.label} infill platforms used.` });

  const ground = areas.filter((a) => a.base === 0);
  const keepOut = ground.map(({ minX, maxX, minY, maxY }) => ({ minX, maxX, minY, maxY }));
  if (apron) keepOut.push({ minX: -W / 2, maxX: W / 2, minY: -apron.depth, maxY: 0 });
  const areaMm2 = ground.reduce((s, a) => s + (a.maxX - a.minX) * (a.maxY - a.minY), 0) + (apron ? polygonArea(apron.points) : 0);

  const layout: DeckLayout = {
    width, depth, height, shape, primaryCount, infillCount, legCount, legLength,
    footprint: { minX: -W / 2, maxX: W / 2, minY: 0, maxY: D }, areas, apron, keepOut, areaMm2,
  };
  return { layout, blocks: [...blocks.values()], objects, warnings, annotations };
}

/** [lo,hi] minus a set of covered intervals; returns the uncovered pieces longer than 1 mm. */
function subtract([lo, hi]: [number, number], covers: [number, number][]): [number, number][] {
  let out: [number, number][] = [[lo, hi]];
  for (const [a, b] of covers) {
    out = out.flatMap(([x, y]) => {
      if (b <= x || a >= y) return [[x, y] as [number, number]];
      const r: [number, number][] = [];
      if (a > x) r.push([x, a]);
      if (b < y) r.push([b, y]);
      return r;
    });
  }
  return out.filter(([x, y]) => y - x > 1);
}

function polygonArea(pts: [number, number][]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; }
  return Math.abs(s) / 2;
}

/** Platform geometry in local coordinates: origin at the centre of the TOP surface. */
function platformParts(sys: DeckSystem, L: number, S: number): Part[] {
  const t = sys.topThickness, fd = sys.frameDepth, rail = 40;
  return [
    { kind: 'box', min: [-L / 2, -S / 2, -t], max: [L / 2, S / 2, 0], mat: 'deckTop' },
    { kind: 'box', min: [-L / 2, -S / 2, -fd], max: [L / 2, -S / 2 + rail, -t], mat: 'deckFrame' },
    { kind: 'box', min: [-L / 2, S / 2 - rail, -fd], max: [L / 2, S / 2, -t], mat: 'deckFrame' },
    { kind: 'box', min: [-L / 2, -S / 2 + rail, -fd], max: [-L / 2 + rail, S / 2 - rail, -t], mat: 'deckFrame' },
    { kind: 'box', min: [L / 2 - rail, -S / 2 + rail, -fd], max: [L / 2, S / 2 - rail, -t], mat: 'deckFrame' },
  ];
}

function label(r: Resolved1D, module: number, sysLabel: string) {
  r.alternatives.forEach((a) => (a.label = `${Math.round(a.value / module)} modules (${sysLabel} system)`));
}
const tag = (s: string) => s.replace(/′/g, 'ft').replace(/×/g, 'x').replace(/[^\w.]+/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const fmtMm = (v: number) => `${Math.round(v)} mm`;
