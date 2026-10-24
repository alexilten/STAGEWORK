import { CHAIRS, DECK_SYSTEMS, FIXTURES, HOISTS, LED_CABINETS, SPEAKERS, TRUSS_SYSTEMS, getCatalogItem } from '../catalog';
import type { Chair, DeckSystem, Fixture, Hoist, LedCabinet, Speaker, TrussSystem } from '../catalog';
import { resolveSeating, type SeatingReport } from './seating';
import { resolveAudio, type AudioReport, type DeckLip } from './audio';
import { resolveLighting, type LightingPositionsReport } from './lighting';
import { resolveScenic, type ScenicReport } from './scenic';
import { resolveBroadcast, type BroadcastReport } from './broadcast';
import type { Project } from '../schema';
import { resolveDeck, type DeckLayout } from './deck';
import { resolveLedWall, type LedLayout } from './led';
import { buildTrussRun, fixtureParts, type TrussRun } from './rigging';
import type { Annotation, BlockDef, SceneObject, Warning } from './types';

export interface ProductionReport {
  stage: DeckLayout & { system: DeckSystem; areaMm2: number };
  led: LedLayout[];
  truss: TrussRun[];
  trussSystem: TrussSystem;
  fixtures: { fixture: Fixture; count: number } | null;
  hoist: Hoist;
  seating: SeatingReport | null;
  audio: AudioReport | null;
  lightingPositions: LightingPositionsReport | null;
  scenic: ScenicReport | null;
  broadcast: BroadcastReport | null;
}

export interface SceneGraph {
  objects: SceneObject[];
  blocks: Record<string, BlockDef>;
  annotations: Annotation[];
  report: ProductionReport;
  warnings: Warning[];
  /** stage + overhead bounds (camera framing, shadows) */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** everything including the audience */
  houseBounds: { min: [number, number, number]; max: [number, number, number] };
}

/**
 * THE single derivation step: project parameters → physically resolved scene.
 * Pure and deterministic (same project ⇒ identical scene), so the viewport, the
 * report and every exporter agree by construction.
 */
export function resolveScene(project: Project): SceneGraph {
  const objects: SceneObject[] = [];
  const blocks: Record<string, BlockDef> = {};
  const annotations: Annotation[] = [];
  const warnings: Warning[] = [];
  const addBlocks = (b: BlockDef[]) => b.forEach((d) => (blocks[d.key] = d));

  // ── Stage
  const deckSys = getCatalogItem<DeckSystem>(project.stage.deckSystemId, 'deck');
  const deck = resolveDeck(project.stage, deckSys);
  addBlocks(deck.blocks); objects.push(...deck.objects); warnings.push(...deck.warnings); annotations.push(...deck.annotations);
  const W = deck.layout.width.resolved, D = deck.layout.depth.resolved, H = deck.layout.height.resolved;
  /** top of the highest deck area under a plan point (main deck, thrust, riser …); the floor if none */
  const deckTopAt = (x: number, y: number) =>
    deck.layout.areas.filter((a) => a.minX <= x && a.maxX >= x && a.minY <= y && a.maxY >= y).reduce((z, a) => Math.max(z, a.top), 0);
  /** front-most deck lip on the centreline: the curved apron, else the deck area reaching furthest downstage */
  const lip: DeckLip = (() => {
    const ap = deck.layout.apron;
    if (ap) {
      const R = (W * W / 4 + ap.depth * ap.depth) / (2 * ap.depth), cy = R - ap.depth;
      return { minX: -W / 2, maxX: W / 2, top: H, y: (x: number) => cy - Math.sqrt(Math.max(0, R * R - x * x)) };
    }
    const front = deck.layout.areas.filter((a) => a.kind !== 'riser' && a.minX <= 0 && a.maxX >= 0).reduce((f, a) => (a.minY < f.minY ? a : f));
    return { minX: front.minX, maxX: front.maxX, top: front.top, y: () => front.minY };
  })();

  // ── LED
  const led: LedLayout[] = [];
  let ledBarH = 0;
  for (const wall of project.ledWalls) {
    const cab = getCatalogItem<LedCabinet>(wall.cabinetId, 'led-cabinet');
    const r = resolveLedWall(wall, cab, { stageTop: H, stageDepth: D });
    led.push(r.layout); addBlocks([r.block]); objects.push(...r.objects); warnings.push(...r.warnings);
    ledBarH = r.flyingBarHeight;
    // conflicts
    const L = r.layout;
    const wallFrontMin = L.origin[1] - L.sagitta;
    const onDeck = wallFrontMin < D && Math.abs(L.origin[0]) - L.chord / 2 < W / 2;
    if (onDeck && L.origin[2] < H - 0.5) warnings.push({ level: 'error', code: 'led.collision.deck', target: `led:${L.id}`, message: `${L.name} intersects the stage deck — raise it or move it upstage.` });
    if (L.chord > W + 0.5 && Math.abs(L.origin[0]) < 1) warnings.push({ level: 'info', code: 'led.wider', target: `led:${L.id}`, message: `${L.name} is wider than the stage by ${Math.round(L.chord - W)} mm.` });
  }

  // ── Rigging
  const trussSys = getCatalogItem<TrussSystem>(project.rigging.trussId, 'truss');
  const hoist = HOISTS[0];
  const truss: TrussRun[] = [];
  const { header, front } = project.rigging;
  if (header.enabled) {
    for (const L of led) {
      const yC = L.origin[1] - L.sagitta / 2 + L.cabinet.depth / 2;
      const bottom = L.top + ledBarH + header.clearance;
      const r = buildTrussRun(trussSys, hoist, {
        id: `HDR_${L.id.toUpperCase()}`, name: `${L.name} header`, target: L.chord + 2 * header.overhang,
        center: [L.origin[0], yC, bottom], maxHoistSpacing: header.maxHoistSpacing, group: `truss:header:${L.id}`,
      });
      truss.push(r.run); addBlocks(r.blocks); objects.push(...r.objects);
    }
  }
  let frontRun: TrussRun | null = null;
  if (front.enabled) {
    const r = buildTrussRun(trussSys, hoist, {
      id: 'FOH', name: 'Front light truss', target: front.width, center: [0, -front.distance, front.trim],
      maxHoistSpacing: header.maxHoistSpacing, group: 'truss:front',
    });
    frontRun = r.run; truss.push(r.run); addBlocks(r.blocks); objects.push(...r.objects);
    if (front.trim < H + 4000) warnings.push({ level: 'warn', code: 'truss.front.trim', target: 'truss:front', message: `Front truss trim is only ${Math.round(front.trim - H)} mm above the deck — check sightlines and camera angles.` });
  }
  if (truss.length) warnings.push({ level: 'info', code: 'engineering', message: 'Suspended loads shown for planning only. Rigging, truss loading and hoist selection require review by a qualified rigging engineer.' });

  // ── Lighting (hung under the front truss)
  let fixtures: ProductionReport['fixtures'] = null;
  if (project.lighting.enabled && frontRun && project.lighting.count > 0) {
    const fx = getCatalogItem<Fixture>(project.lighting.fixtureId, 'fixture');
    const key = `SC_FIX_${fx.manufacturer}_${fx.model}`.replace(/[^\w]+/g, '_');
    addBlocks([{ key, description: `${fx.manufacturer} ${fx.model}`, catalogId: fx.id, parts: fixtureParts(fx) }]);
    const n = project.lighting.count;
    const usable = frontRun.length - 600;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -usable / 2 + (usable * i) / (n - 1);
      objects.push({
        id: `FIX.FOH.${String(i + 1).padStart(2, '0')}`, label: `${fx.manufacturer} ${fx.model}`, layer: '40_LIGHTING::40_01_FIXTURES', system: 'lighting', group: 'fixtures',
        block: key, position: [x, frontRun.center[1], frontRun.bottom], rotationZ: 0,
        meta: { catalogId: fx.id, type: fx.fixtureType, weightKg: fx.weightKg, powerMaxW: fx.powerMaxW, position: `FOH truss #${i + 1}` },
      });
    }
    fixtures = { fixture: fx, count: n };
  }

  // ── Lighting positions (overhead electrics + side booms)
  let lightingPositions: LightingPositionsReport | null = null;
  if (project.lighting.enabled && (project.lighting.electrics.count > 0 || project.lighting.booms.enabled)) {
    const r = resolveLighting(project.lighting, (id) => getCatalogItem<Fixture>(id, 'fixture'), trussSys, hoist, {
      stageWidth: W, stageDepth: D, stageTop: H, deckTopAt,
      led: led.map((L) => ({ name: L.name, minY: L.origin[1] - L.sagitta, maxY: L.origin[1] + L.cabinet.depth, top: L.top })),
    });
    lightingPositions = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings);
  }

  // ── Presenter scale figure (1.75 m)
  const py = Math.min(D * 0.38, 2400);
  const presenterAt: [number, number, number] = [0, py, Math.max(H, deckTopAt(0, py))];
  if (project.presenter.visible) {
    objects.push({
      id: 'REF.PRESENTER', label: 'Presenter scale figure (1.75 m)', layer: '00_REFERENCE', system: 'reference', group: 'presenter',
      parts: [
        { kind: 'cyl', from: [0, 0, 0], to: [0, 0, 1480], r: 170, mat: 'presenter' },
        { kind: 'cyl', from: [0, 0, 1530], to: [0, 0, 1750], r: 105, mat: 'presenter' },
      ],
      position: presenterAt, rotationZ: 0, meta: { height: 1750 },
    });
  }

  // ── Audience seating
  let seating: SeatingReport | null = null;
  let seatObjects: typeof objects = [];
  if (project.seating?.enabled) {
    const chair = getCatalogItem<Chair>(project.seating.chairId, 'chair');
    const r = resolveSeating(project.seating, chair, { stageWidth: W, stageDepth: D, keepOut: deck.layout.keepOut, apronDepth: deck.layout.apron?.depth ?? 0 });
    seating = r.report; addBlocks([r.block]); seatObjects = r.objects; annotations.push(...r.annotations); warnings.push(...r.warnings);
    if (seating.count) {
      // sightline: steepest look-up from the front row to the top of the main LED surface
      const main = led[0];
      if (main) {
        const eye = 1150; // seated eye height, common planning value
        const deg = (Math.atan2(main.top - eye, seating.frontDistance + Math.max(0, main.origin[1])) * 180) / Math.PI;
        if (deg > 35) warnings.push({ level: 'info', code: 'seating.sightline', target: 'seating', message: `Front row looks up ${deg.toFixed(0)}° to the top of ${main.name} (comfort guideline ≈ 30–35°). Move seating back or lower the wall.` });
      }
    }
  }

  // ── Audio
  let audio: AudioReport | null = null;
  if (project.audio?.enabled) {
    const r = resolveAudio(project.audio, (id) => getCatalogItem<Speaker>(id, 'speaker'),
      { stageWidth: W, stageDepth: D, stageTop: H, downstageY: 0, lip });
    audio = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings);
  }

  // ── Broadcast: cameras, platforms, track, prompters (may remove seats under camera positions)
  let broadcast: BroadcastReport | null = null;
  if (project.broadcast?.enabled) {
    const r = resolveBroadcast(project.broadcast, {
      stageWidth: W, stageDepth: D, stageTop: H, deckTopAt, lip, presenter: presenterAt,
      seating: seating && project.seating ? { report: seating, params: project.seating, seats: seatObjects } : null,
      frontTruss: frontRun ? { y: frontRun.center[1], bottom: frontRun.bottom, length: frontRun.length } : null,
    });
    broadcast = r.report; addBlocks(r.blocks); objects.push(...r.objects); annotations.push(...r.annotations); warnings.push(...r.warnings);
    if (r.kills.size && seating) {
      seatObjects = seatObjects.filter((o) => !r.kills.has(o.id));
      seating = { ...seating, count: seatObjects.length, seatKills: r.kills.size };
    }
  }
  objects.push(...seatObjects);

  // ── Scenic (portal, masking, upstage drape)
  let scenic: ScenicReport | null = null;
  const sc = project.scenic;
  if (sc && (sc.portal.enabled || sc.masking.enabled || sc.drape.enabled)) {
    const r = resolveScenic(sc, { stageWidth: W, stageDepth: D, stageTop: H, deckTopAt, led });
    scenic = r.report; objects.push(...r.objects); annotations.push(...r.annotations); warnings.push(...r.warnings);
  }

  // ── Technical annotations (exported to 90_TECHNICAL)
  const off = 900;
  annotations.push(
    { id: 'DIM.STAGE.WIDTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [-W / 2, -off, 0], to: [W / 2, -off, 0], value: W, label: 'Stage width' },
    { id: 'DIM.STAGE.DEPTH', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [W / 2 + off, 0, 0], to: [W / 2 + off, D, 0], value: D, label: 'Stage depth' },
    { id: 'DIM.STAGE.HEIGHT', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [-W / 2 - off, 0, 0], to: [-W / 2 - off, 0, H], value: H, label: 'Deck height' },
    { id: 'CL.STAGE', kind: 'line', layer: '90_TECHNICAL::90_02_CENTERLINES', from: [0, -3000, 0], to: [0, D + 3000, 0], label: 'Centreline' },
    { id: 'REF.STAGE.FRONT', kind: 'line', layer: '90_TECHNICAL::90_03_REFERENCE', from: [-W / 2 - 2000, 0, 0], to: [W / 2 + 2000, 0, 0], label: 'Stage front (Y=0)' },
  );
  for (const L of led) {
    const x0 = L.origin[0] - L.chord / 2, x1 = L.origin[0] + L.chord / 2, y = L.origin[1] - L.sagitta;
    const tag = L.id.toUpperCase();
    annotations.push(
      { id: `DIM.LED.${tag}.WIDTH`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x0, y, L.top + 450], to: [x1, y, L.top + 450], value: L.chord, label: `${L.name} width` },
      { id: `DIM.LED.${tag}.HEIGHT`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x1 + 450, y, L.origin[2]], to: [x1 + 450, y, L.top], value: L.top - L.origin[2], label: `${L.name} height` },
      { id: `DIM.LED.${tag}.ELEV`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x0 - 450, y, H], to: [x0 - 450, y, L.origin[2]], value: L.origin[2] - H, label: `${L.name} above deck` },
    );
  }

  // bounds
  const min: [number, number, number] = [-W / 2, Math.min(0, frontRun ? frontRun.center[1] - 300 : 0), 0];
  const max: [number, number, number] = [W / 2, D, H];
  for (const a of deck.layout.areas) {
    min[0] = Math.min(min[0], a.minX); min[1] = Math.min(min[1], a.minY);
    max[0] = Math.max(max[0], a.maxX); max[2] = Math.max(max[2], a.top);
  }
  if (deck.layout.apron) min[1] = Math.min(min[1], -deck.layout.apron.depth);
  if (lightingPositions) { max[2] = Math.max(max[2], project.lighting.electrics.trim + 500); max[0] = Math.max(max[0], W / 2 + 900); min[0] = Math.min(min[0], -W / 2 - 900); }
  if (audio) { const sp = audio.spread + 1500; min[0] = Math.min(min[0], -sp); max[0] = Math.max(max[0], sp); max[2] = Math.max(max[2], audio.trim + 500); min[1] = Math.min(min[1], -1500); }
  for (const L of led) {
    min[0] = Math.min(min[0], L.origin[0] - L.chord / 2); max[0] = Math.max(max[0], L.origin[0] + L.chord / 2);
    max[1] = Math.max(max[1], L.origin[1] + L.cabinet.depth); max[2] = Math.max(max[2], L.top);
  }
  if (scenic?.maskingLegs && sc) { const mx = W / 2 + (sc.masking.legWidth * 2) / 3; min[0] = Math.min(min[0], -mx); max[0] = Math.max(max[0], mx); max[2] = Math.max(max[2], H + sc.masking.height); }
  if (scenic?.drape) { max[1] = Math.max(max[1], D + 2000); max[2] = Math.max(max[2], scenic.drape.height); }
  for (const t of truss) { min[0] = Math.min(min[0], t.center[0] - t.length / 2); max[0] = Math.max(max[0], t.center[0] + t.length / 2); max[2] = Math.max(max[2], t.bottom + 290); }

  const hmin: [number, number, number] = [...min], hmax: [number, number, number] = [...max];
  if (seating?.count) {
    hmin[0] = Math.min(hmin[0], seating.min[0]); hmin[1] = Math.min(hmin[1], seating.min[1]);
    hmax[0] = Math.max(hmax[0], seating.max[0]); hmax[1] = Math.max(hmax[1], seating.max[1]);
  }
  const bp = broadcast?.platform;
  if (bp) { hmin[1] = Math.min(hmin[1], bp.yFront - bp.depth - 500); hmin[0] = Math.min(hmin[0], -bp.width / 2 - 2500); hmax[0] = Math.max(hmax[0], bp.width / 2 + 2500); }

  return {
    objects, blocks, annotations, warnings,
    report: { stage: { ...deck.layout, system: deckSys }, led, truss, trussSystem: trussSys, fixtures, hoist, seating, audio, lightingPositions, scenic, broadcast },
    bounds: { min, max },
    houseBounds: { min: hmin, max: hmax },
  };
}

export const catalogs = { LED_CABINETS, DECK_SYSTEMS, TRUSS_SYSTEMS, FIXTURES, HOISTS, CHAIRS, SPEAKERS };
