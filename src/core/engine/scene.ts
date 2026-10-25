import { CHAIRS, DECK_SYSTEMS, FIXTURES, HOISTS, LED_CABINETS, SPEAKERS, TRUSS_SYSTEMS, getCatalogItem } from '../catalog';
import type { Chair, DeckSystem, Fixture, Hoist, LedCabinet, Speaker, TrussSystem } from '../catalog';
import { resolveSeating, type SeatingReport } from './seating';
import { resolveAudio, type AudioReport, type DeckLip } from './audio';
import { resolveLighting, type LightingPositionsReport } from './lighting';
import { resolveScenic, type ScenicReport } from './scenic';
import { resolveBroadcast, type BroadcastReport } from './broadcast';
import { resolveAudience, type AudienceReport } from './audience';
import { resolveStructure, type StructureReport } from './structure';
import { resolveShow, type ShowReport } from './show';
import { COLUMN_SEAT_CLEARANCE, resolveVenue, type VenueReport } from './venue';
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
  audience: AudienceReport | null;
  structure: StructureReport | null;
  show: ShowReport | null;
  venue: VenueReport | null;
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
    const onDeck = L.planar && wallFrontMin < D && Math.abs(L.origin[0]) - L.chord / 2 < W / 2;
    if (onDeck && L.origin[2] < H - 0.5) warnings.push({ level: 'error', code: 'led.collision.deck', target: `led:${L.id}`, message: `${L.name} intersects the stage deck — raise it or move it upstage.` });
    if (L.planar && L.chord > W + 0.5 && Math.abs(L.origin[0]) < 1) warnings.push({ level: 'info', code: 'led.wider', target: `led:${L.id}`, message: `${L.name} is wider than the stage by ${Math.round(L.chord - W)} mm.` });
  }

  // ── Show elements: DJ booth, scenic blocks, LED dome
  let show: ShowReport | null = null;
  const sh = project.show;
  if (sh && (sh.booth.enabled || sh.blocks.length || sh.dome.enabled)) {
    const r = resolveShow(sh, { deckTopAt });
    show = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings); led.push(...r.led);
  }

  // ── Rigging
  const trussSys = getCatalogItem<TrussSystem>(project.rigging.trussId, 'truss');
  const hoist = HOISTS[0];
  const truss: TrussRun[] = [];
  const { header, front } = project.rigging;
  const planar = led.filter((L) => L.planar);
  const noHeader = new Set(project.ledWalls.filter((w) => w.header === false).map((w) => w.id));
  if (header.enabled) {
    for (const L of planar.filter((l) => !noHeader.has(l.id))) {
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
      led: planar.map((L) => ({ name: L.name, minY: L.origin[1] - L.sagitta, maxY: L.origin[1] + L.cabinet.depth, top: L.top })),
    });
    lightingPositions = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings);
  }

  // ── Ground support, mother grid, delay towers, free truss
  let structure: StructureReport | null = null;
  const stp = project.structure;
  if (stp && (stp.roof.enabled || stp.grid.enabled || stp.delays.enabled || stp.truss.length)) {
    const r = resolveStructure(stp, {
      stageWidth: W, stageDepth: D, stageTop: H, centre: [0, D / 2], truss: trussSys, hoist,
      mainSpeaker: project.audio?.enabled ? getCatalogItem<Speaker>(project.audio.mainSpeakerId, 'speaker') : null, mainsY: -1000,
    });
    structure = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings);
  }
  const centreStage = deck.layout.shape === 'round' || deck.layout.shape === 'cross';

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
    seating = r.report; addBlocks([r.block]); seatObjects = r.objects; objects.push(...r.accessible); annotations.push(...r.annotations); warnings.push(...r.warnings);
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

  // ── Standing floor, barricade and raked stands
  let audience: AudienceReport | null = null;
  const au = project.audience;
  if (au && (au.standing.enabled || au.stands.length)) {
    const chair = getCatalogItem<Chair>(project.seating.chairId, 'chair');
    const r = resolveAudience(au, { areas: deck.layout.areas, lipY: lip.y(0), stageWidth: W, stageDepth: D, stageTop: H, centreStage, seating: project.seating, chair });
    audience = r.report; addBlocks(r.blocks); objects.push(...r.objects); warnings.push(...r.warnings);
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
      seating = { ...seating, count: seatObjects.length, capacity: seatObjects.length + seating.wheelchairPlaced.length, seatKills: r.kills.size };
    }
  }
  objects.push(...seatObjects);

  // ── Scenic (portal, masking, upstage drape)
  let scenic: ScenicReport | null = null;
  const sc = project.scenic;
  if (sc && (sc.portal.enabled || sc.masking.enabled || sc.drape.enabled)) {
    const r = resolveScenic(sc, { stageWidth: W, stageDepth: D, stageTop: H, deckTopAt, led: planar });
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
  for (const L of planar) {
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
  for (const L of planar) {
    min[0] = Math.min(min[0], L.origin[0] - L.chord / 2); max[0] = Math.max(max[0], L.origin[0] + L.chord / 2);
    max[1] = Math.max(max[1], L.origin[1] + L.cabinet.depth); max[2] = Math.max(max[2], L.top);
  }
  // rings, yawed walls, floors and ceilings: from their cabinets
  const nonPlanar = new Set(led.filter((L) => !L.planar).map((L) => `led:${L.id}`));
  for (const o of objects) if (o.system === 'ledCabinets' && nonPlanar.has(o.group)) {
    min[0] = Math.min(min[0], o.position[0] - 600); max[0] = Math.max(max[0], o.position[0] + 600);
    min[1] = Math.min(min[1], o.position[1] - 600); max[1] = Math.max(max[1], o.position[1] + 600);
    max[2] = Math.max(max[2], o.position[2] + 1200);
  }
  if (scenic?.maskingLegs && sc) { const mx = W / 2 + (sc.masking.legWidth * 2) / 3; min[0] = Math.min(min[0], -mx); max[0] = Math.max(max[0], mx); max[2] = Math.max(max[2], H + sc.masking.height); }
  if (scenic?.drape) { max[1] = Math.max(max[1], D + 2000); max[2] = Math.max(max[2], scenic.drape.height); }
  for (const t of truss) { min[0] = Math.min(min[0], t.center[0] - t.length / 2); max[0] = Math.max(max[0], t.center[0] + t.length / 2); max[2] = Math.max(max[2], t.bottom + 290); }

  if (structure?.roof) { const r = structure.roof; min[0] = Math.min(min[0], r.minX); max[0] = Math.max(max[0], r.maxX); min[1] = Math.min(min[1], r.minY); max[1] = Math.max(max[1], r.maxY); max[2] = Math.max(max[2], r.spec.height + 2000); }
  if (structure?.grid) { const g = structure.grid; min[0] = Math.min(min[0], -g.width / 2 - 600); max[0] = Math.max(max[0], g.width / 2 + 600); max[2] = Math.max(max[2], g.trim + 1500); }
  if (show?.dome) { const R = show.dome.diameter / 2, d = project.show!.dome; min[0] = Math.min(min[0], d.cx - R); max[0] = Math.max(max[0], d.cx + R); min[1] = Math.min(min[1], d.cy - R); max[1] = Math.max(max[1], d.cy + R); max[2] = Math.max(max[2], d.springing + R); }
  if (audio?.layout === 'quad') { const q = (project.audio.quadRadius ?? 10000) + 2000; min[0] = Math.min(min[0], -q); max[0] = Math.max(max[0], q); min[1] = Math.min(min[1], D / 2 - q); max[1] = Math.max(max[1], D / 2 + q); }

  const hmin: [number, number, number] = [...min], hmax: [number, number, number] = [...max];
  // audience extents (standing floor, stands, delay towers) from their objects
  for (const o of objects) if (o.system === 'seating' && !o.block?.startsWith('SC_CHAIR') || o.group === 'structure:delays') {
    hmin[0] = Math.min(hmin[0], o.position[0] - 500); hmax[0] = Math.max(hmax[0], o.position[0] + 500);
    hmin[1] = Math.min(hmin[1], o.position[1] - 500); hmax[1] = Math.max(hmax[1], o.position[1] + 500);
    if (o.parts) for (const pt of o.parts) if (pt.kind === 'prism') for (const [x, y] of pt.points) { hmin[0] = Math.min(hmin[0], x); hmax[0] = Math.max(hmax[0], x); hmin[1] = Math.min(hmin[1], y); hmax[1] = Math.max(hmax[1], y); }
  }
  if (seating?.count) {
    hmin[0] = Math.min(hmin[0], seating.min[0]); hmin[1] = Math.min(hmin[1], seating.min[1]);
    hmax[0] = Math.max(hmax[0], seating.max[0]); hmax[1] = Math.max(hmax[1], seating.max[1]);
  }
  const bp = broadcast?.platform;
  if (bp) { hmin[1] = Math.min(hmin[1], bp.yFront - bp.depth - 500); hmin[0] = Math.min(hmin[0], -bp.width / 2 - 2500); hmax[0] = Math.max(hmax[0], bp.width / 2 + 2500); }

  // ── Venue shell around everything above (the stage wall sits behind the most upstage element)
  let venue: VenueReport | null = null;
  const vp = project.venue;
  if (vp?.enabled) {
    const r = resolveVenue(vp, { backY: Math.max(max[1], hmax[1]) }, project.units);
    venue = r.report; addBlocks(r.blocks); objects.push(...r.objects); annotations.push(...r.annotations); warnings.push(...r.warnings);
    if (venue.built) {
      const { x0, y0, x1, y1 } = venue.box;
      // columns: none in the stage, seats cleared around each one
      const half = venue.columnSize / 2;
      const hits = venue.columns.filter((c) => deck.layout.areas.some((a) => c.x + half > a.minX && c.x - half < a.maxX && c.y + half > a.minY && c.y - half < a.maxY));
      if (hits.length) warnings.push({ level: 'error', code: 'venue.column.stage', target: 'venue', message: `${hits.length} building column${hits.length > 1 ? 's land' : ' lands'} in the stage. Change the footprint or the stage size so the stage sits in one bay.` });
      if (venue.columns.length && seating) {
        const k = half + COLUMN_SEAT_CLEARANCE;
        const before = objects.length;
        for (let i = objects.length - 1; i >= 0; i--) {
          const o = objects[i];
          if (o.system === 'seating' && o.block?.startsWith('SC_CHAIR') && venue.columns.some((c) => Math.abs(o.position[0] - c.x) < k && Math.abs(o.position[1] - c.y) < k)) objects.splice(i, 1);
        }
        const killed = before - objects.length;
        if (killed) {
          seating = { ...seating, count: seating.count - killed, capacity: seating.capacity - killed, seatKills: (seating.seatKills ?? 0) + killed };
          warnings.push({ level: 'info', code: 'venue.column.seats', target: 'seating', message: `${killed} seats removed around building columns.` });
        }
      }
      // overhead: the rig must trim under the venue's clear height
      const rigTop = max[2];
      if (!venue.openAir && rigTop > venue.clear - 600) warnings.push({ level: 'warn', code: 'venue.clear', target: 'venue', message: `The show reaches ${(rigTop / 1000).toFixed(1)} m but the ${venue.name.toLowerCase()} clears ${(venue.clear / 1000).toFixed(1)} m (${venue.clearLabel.toLowerCase()}). Lower the trims or the LED.` });
      if (!venue.openAir && !venue.rating && truss.length) warnings.push({ level: 'warn', code: 'venue.roof.unrated', target: 'venue', message: 'Warehouse roof joists are usually not rated for production loads. Hang from a ground-supported grid or get the roof rated by an engineer.' });
      if (venue.openAir && truss.length && !structure) warnings.push({ level: 'warn', code: 'venue.openair', target: 'venue', message: `A ${venue.name.toLowerCase()} has no roof to hang the rig from. Add a ground-supported roof in Structure.` });
      if (venue.fixedSeating && seating) warnings.push({ level: 'info', code: 'venue.seating.fixed', target: 'seating', message: `The ${venue.name.toLowerCase()} has its own house seats (about ${venue.houseSeats.toLocaleString()}). Turn Audience seating off to use them, or keep it for a floor-seated layout.` });
      if (venue.bowl) {
        const { inner } = venue;
        const sx = Math.max(0, ...deck.layout.areas.map((a) => Math.max(-a.minX, a.maxX)));
        if (sx > (inner.x1 - inner.x0) / 2 || hmin[1] < inner.y0) warnings.push({ level: 'warn', code: 'venue.floor', target: 'venue', message: `The show or audience runs off the ${((inner.x1 - inner.x0) / 1000).toFixed(0)} × ${((inner.y1 - inner.y0) / 1000).toFixed(0)} m event floor into the bowl.` });
      }
      // the show must sit inside the walls
      const sx = Math.max(-hmin[0], hmax[0]);
      if (sx > (x1 - x0) / 2) warnings.push({ level: 'warn', code: 'venue.width', target: 'venue', message: `The show is ${((2 * sx) / 1000).toFixed(1)} m wide; the venue is ${((x1 - x0) / 1000).toFixed(1)} m.` });
      if (hmin[1] < y0) warnings.push({ level: 'warn', code: 'venue.depth', target: 'venue', message: `The audience runs ${((y0 - hmin[1]) / 1000).toFixed(1)} m past the back-of-house wall. Increase the venue depth or reduce seating.` });
      hmin[0] = Math.min(hmin[0], x0); hmax[0] = Math.max(hmax[0], x1); hmin[1] = Math.min(hmin[1], y0); hmax[1] = Math.max(hmax[1], y1); hmax[2] = Math.max(hmax[2], venue.wallHeight);
    }
  }

  return {
    objects, blocks, annotations, warnings,
    report: { stage: { ...deck.layout, system: deckSys }, led, truss, trussSystem: trussSys, fixtures, hoist, seating, audio, lightingPositions, scenic, broadcast, audience, structure, show, venue },
    bounds: { min, max },
    houseBounds: { min: hmin, max: hmax },
  };
}

export const catalogs = { LED_CABINETS, DECK_SYSTEMS, TRUSS_SYSTEMS, FIXTURES, HOISTS, CHAIRS, SPEAKERS };
