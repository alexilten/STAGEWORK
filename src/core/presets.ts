import { ft } from './units';
import type { Mm } from './units';
import { DEFAULT_AUDIENCE, DEFAULT_AUDIO, DEFAULT_LIGHTING_POSITIONS, DEFAULT_SCENIC, DEFAULT_BROADCAST, DEFAULT_SEATING, DEFAULT_SHOW, DEFAULT_STRUCTURE, DEFAULT_VENUE, PROJECT_SCHEMA, PROJECT_VERSION, type LedWallParams, type Project, type StandParams } from './schema';

export type PresetCategory = 'tech' | 'concert' | 'edm' | 'immersive';

/** The four preset families in the top-middle picker (see docs/PRESETS.md for the research behind them). */
export const CATEGORIES: { id: PresetCategory; name: string; blurb: string }[] = [
  { id: 'tech', name: 'Tech & Brand', blurb: 'Keynotes, launches, general sessions and town halls. Seated house, presenter, broadcast.' },
  { id: 'concert', name: 'Concert & Touring', blurb: 'Arena and stadium tours, festival roofs. GA floor, barricade, raked stands, big PA.' },
  { id: 'edm', name: 'EDM & Festival', blurb: 'DJ-led mainstages and club shows. LED architecture, DJ booth, standing crowd.' },
  { id: 'immersive', name: 'Cinematic & Immersive', blurb: 'Curved panoramas, 270° rooms, 360° rings, LED volumes and domes.' },
];

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  summary: string;
  build: () => Project;
}

const wall = (o: Partial<LedWallParams> & Pick<LedWallParams, 'id' | 'name' | 'width' | 'height'>): LedWallParams => ({
  cabinetId: 'roe.bp2v2', elevation: 600, offsetX: 0, upstageGap: 300, curveDeg: 0, ...o,
});

function base(name: string, presetId: string): Project {
  return {
    schema: PROJECT_SCHEMA, version: PROJECT_VERSION, name, presetId, units: 'metric',
    stage: { width: ft(40), depth: ft(16), height: ft(3), deckSystemId: 'generic.deck-8x4', finish: 'white', fascia: true },
    ledWalls: [],
    rigging: {
      trussId: 'prolyte.h30v',
      header: { enabled: true, clearance: 600, overhang: 500, maxHoistSpacing: 6000 },
      front: { enabled: true, distance: 6000, trim: 8500, width: 14000 },
    },
    lighting: { enabled: true, fixtureId: 'martin.mac-aura-xb', count: 10, electrics: { ...DEFAULT_LIGHTING_POSITIONS.electrics }, booms: { ...DEFAULT_LIGHTING_POSITIONS.booms } },
    presenter: { visible: true },
    seating: { ...DEFAULT_SEATING },
    audio: { ...DEFAULT_AUDIO },
    scenic: structuredClone(DEFAULT_SCENIC),
    broadcast: { ...structuredClone(DEFAULT_BROADCAST), enabled: true },
    audience: structuredClone(DEFAULT_AUDIENCE),
    structure: structuredClone(DEFAULT_STRUCTURE),
    show: structuredClone(DEFAULT_SHOW),
    venue: structuredClone(DEFAULT_VENUE),
  };
}

/* ── helpers for the entertainment and immersive presets (all lengths mm; stage depths are whole 4′ modules so
   wall placements relative to the deck stay exact) ── */

/** a wall placed by its world position: centre x, world y of its front face, yaw (0 faces the audience at −Y) */
const placed = (p: Project, o: Partial<LedWallParams> & Pick<LedWallParams, 'id' | 'name' | 'width' | 'height'> & { x: Mm; y: Mm }): LedWallParams => {
  const { x, y, ...rest } = o;
  return wall({ ...rest, offsetX: x, upstageGap: y - p.stage.depth });
};

/** an LED ring (or arc) round (cx, cy): concave faces the centre, convex faces out; `wrap` degrees of it */
const ring = (p: Project, id: string, name: string, cx: Mm, cy: Mm, R: Mm, height: Mm, elevation: Mm, inward: boolean, cabinetId: string, wrap = 360): LedWallParams =>
  wall({ id, name, cabinetId, width: (wrap / 360) * 2 * Math.PI * R, height, elevation, base: 'floor', radius: inward ? R : -R, offsetX: cx, upstageGap: cy + R - p.stage.depth, header: false });

/** four LED faces round a box (towers, monoliths, cubes): centre (cx, cy), plan w × d, faces h tall from `elevation` */
const ledBox = (p: Project, id: string, name: string, cx: Mm, cy: Mm, w: Mm, d: Mm, h: Mm, elevation: Mm, base: 'deck' | 'floor', cabinetId: string): LedWallParams[] =>
  ([['f', 'front', 0, d / 2, w], ['r', 'right', 90, w / 2, d], ['b', 'back', 180, d / 2, w], ['l', 'left', -90, w / 2, d]] as const).map(([k, side, yaw, a, width]) => {
    const t = (yaw * Math.PI) / 180;
    return placed(p, { id: `${id}${k}`, name: `${name} ${side}`, cabinetId, width, height: h, elevation, base, yawDeg: yaw, header: false, x: cx + a * Math.sin(t), y: cy - a * Math.cos(t) });
  });

const stand = (o: Partial<StandParams> & Pick<StandParams, 'id' | 'name' | 'rows'>): StandParams => ({
  kind: 'straight', x: 0, y: 0, width: 20000, yawDeg: 0, cx: 0, cy: 0, r0: 10000, a0: 0, a1: 360, rowRise: 400, rowPitch: 850, base: 0, ...o,
});

/** concert / EDM defaults: no keynote front truss or seated house, presenter becomes the performer */
function show(name: string, id: string): Project {
  const p = base(name, id);
  p.rigging.front.enabled = false;
  p.lighting.count = 0;
  p.seating.enabled = false;
  p.broadcast!.enabled = false;
  p.audio = { ...DEFAULT_AUDIO, enabled: true };
  p.stage.finish = 'black';
  return p;
}

export const PRESETS: Preset[] = [
  {
    id: 'minimal-keynote', category: 'tech', name: 'Minimal Keynote',
    summary: 'Restrained 40′ deck with one large near-16:9 media wall. The default keynote canvas.',
    build: () => ({ ...base('Minimal Keynote', 'minimal-keynote'), ledWalls: [wall({ id: 'main', name: 'Main wall', width: 12500, height: 7000 })] }),
  },
  {
    id: 'panoramic-keynote', category: 'tech', name: 'Panoramic Keynote',
    summary: 'Wide cinematic canvas (~4:1) with a gentle concave curve over a 56′ deck with a curved apron, radial seating.',
    build: () => {
      const p = base('Panoramic Keynote', 'panoramic-keynote');
      p.stage.width = ft(56);
      p.rigging.front.width = 20000;
      p.lighting.count = 14;
      p.seating = { ...p.seating, layout: 'radial', count: 2500 };
      p.stage.shape = 'rounded'; p.stage.apron = { depth: 1800 };
      p.audio = { ...DEFAULT_AUDIO, enabled: true, mainsPerSide: 14, trim: 9000, spread: 11000, subs: 6, frontFills: 6, monitors: 4 };
      p.lighting.electrics = { ...p.lighting.electrics, count: 2, fixtureId: 'glp.impression-x4-bar-20', perBatten: 12 };
      p.ledWalls = [wall({ id: 'main', name: 'Panoramic wall', width: 24000, height: 6000, elevation: 900, upstageGap: 1200, curveDeg: 1 })];
      return p;
    },
  },
  {
    id: 'product-launch', category: 'tech', name: 'Product Launch',
    summary: 'Hero wall flanked by two portrait reveal screens, with a runway and B-stage into the house for reveals.',
    build: () => {
      const p = base('Product Launch', 'product-launch');
      p.stage.width = ft(56); p.stage.depth = ft(20);
      p.seating = { ...p.seating, count: 2000 };
      p.stage.shape = 'runway'; p.stage.runway = { width: ft(8), length: ft(24), endWidth: ft(16), endDepth: ft(12) };
      p.rigging.front.width = 20000;
      p.lighting.count = 12;
      p.lighting.electrics = { ...p.lighting.electrics, fixtureId: 'robe.megapointe' };
      p.lighting.booms = { enabled: true, perBoom: 3, height: 4500, fixtureId: 'chauvet.maverick-storm-1-wash' };
      p.scenic!.masking.enabled = true; p.scenic!.drape.enabled = true;
      p.ledWalls = [
        wall({ id: 'main', name: 'Hero wall', width: 10000, height: 5500, elevation: 900 }),
        wall({ id: 'left', name: 'Reveal left', width: 2500, height: 5500, elevation: 900, offsetX: -6750, upstageGap: -1500 }),
        wall({ id: 'right', name: 'Reveal right', width: 2500, height: 5500, elevation: 900, offsetX: 6750, upstageGap: -1500 }),
      ];
      return p;
    },
  },
  {
    id: 'multi-screen', category: 'tech', name: 'Multi-Screen',
    summary: 'Three equal media surfaces in a modular rhythm and a centre thrust, for multi-presenter or data-rich content.',
    build: () => {
      const p = base('Multi-Screen', 'multi-screen');
      p.stage.width = ft(48);
      p.rigging.front.width = 18000;
      p.rigging.header.overhang = 250;
      p.seating = { ...p.seating, layout: 'grid', count: 1500 };
      p.stage.shape = 'thrust'; p.stage.thrust = { width: ft(16), depth: ft(8) };
      p.audio = { ...DEFAULT_AUDIO, enabled: true, mainsPerSide: 10, trim: 8000, spread: 8500, subs: 4, frontFills: 5, monitors: 2 };
      p.lighting.booms = { enabled: true, perBoom: 4, height: 4000 };
      p.ledWalls = [-1, 0, 1].map((k) => wall({ id: ['l', 'c', 'r'][k + 1], name: ['Left', 'Centre', 'Right'][k + 1] + ' screen', width: 5000, height: 3000, elevation: 1500, offsetX: k * 5750 }));
      return p;
    },
  },
  {
    id: 'conversation', category: 'tech', name: 'Conversation Stage',
    summary: 'Low, intimate 32′ deck at 24″ with a chat riser for fireside conversations and a calm backdrop wall.',
    build: () => {
      const p = base('Conversation Stage', 'conversation');
      p.stage.width = ft(32); p.stage.height = ft(2);
      p.rigging.front = { enabled: true, distance: 5000, trim: 7000, width: 11000 };
      p.lighting.count = 8; p.lighting.fixtureId = 'etc.s4-led-s3-lustr';
      p.seating = { ...p.seating, layout: 'radial', count: 500, frontDistance: 2450 };
      p.stage.risers = [{ id: 'r1', name: 'Chat riser', width: ft(12), depth: ft(8), height: ft(1), x: 0, y: ft(4) }];
      p.ledWalls = [wall({ id: 'main', name: 'Backdrop wall', width: 7500, height: 4500, elevation: 1000 })];
      p.scenic!.portal = { ...p.scenic!.portal, enabled: true, margin: 300, legWidth: 600, headerHeight: 900 };
      return p;
    },
  },
  /* ───────────── Technology & Brand (new) ───────────── */
  {
    id: 'general-session', category: 'tech', name: 'General Session + IMAG',
    summary: 'Big-room conference: 80′ deck, a 16 m content wall and two 16:9 IMAG screens toed in at the sides for a 3,000-seat house.',
    build: () => {
      const p = base('General Session + IMAG', 'general-session');
      p.stage.width = ft(80); p.stage.depth = ft(36); p.stage.height = ft(4);
      p.seating = { ...p.seating, layout: 'block', count: 3000, frontDistance: 4500 };
      p.rigging.front = { enabled: true, distance: 7000, trim: 10000, width: 26000 };
      p.lighting.count = 16;
      p.audio = { ...DEFAULT_AUDIO, enabled: true, mainsPerSide: 14, trim: 10500, spread: 14500, subs: 8, frontFills: 6, outfills: 8 };
      p.ledWalls = [
        wall({ id: 'main', name: 'Content wall', width: 16000, height: 6000, elevation: 1000 }),
        placed(p, { id: 'imagl', name: 'IMAG left', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 3500, base: 'floor', yawDeg: 20, header: false, x: -19400, y: -2500 }),
        placed(p, { id: 'imagr', name: 'IMAG right', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 3500, base: 'floor', yawDeg: -20, header: false, x: 19400, y: -2500 }),
      ];
      return p;
    },
  },
  {
    id: 'town-hall-round', category: 'tech', name: 'Town Hall in the Round',
    summary: 'Round centre stage under a flown four-sided LED cube, quadrant PA and 360° raked seating — the corporate in-the-round format.',
    build: () => {
      const p = base('Town Hall in the Round', 'town-hall-round');
      p.stage = { ...p.stage, shape: 'round', width: ft(28), depth: ft(28), height: ft(3) };
      const cy = ft(14);
      p.rigging.front.enabled = false; p.rigging.header.enabled = false;
      p.lighting.count = 0; p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.seating.enabled = false; p.broadcast!.enabled = false;
      p.ledWalls = ledBox(p, 'cube', 'LED cube', 0, cy, 4000, 4000, 2500, 7500, 'floor', 'roe.bp2v2');
      p.structure!.grid = { enabled: true, width: 9000, depth: 9000, trim: 10500, spacing: 3000 };
      p.audio = { ...DEFAULT_AUDIO, enabled: true, layout: 'quad', quadRadius: 8000, hangsPerPosition: 1, mainsPerSide: 8, trim: 10000, subs: 4, frontFills: 0, monitors: 4 };
      p.audience!.stands = [stand({ id: 'bowl', name: 'Seating bowl', kind: 'arc', cx: 0, cy, r0: 8200, a0: 0, a1: 360, rows: 14, rowRise: 300, rowPitch: 900, base: 0 })];
      return p;
    },
  },

  /* ───────────── Concert & Touring ───────────── */
  {
    id: 'arena-end-stage', category: 'concert', name: 'Arena End Stage',
    summary: '60′ × 40′ deck with drum riser, 16 m upstage LED and toed-in IMAG, mother grid, L/R and out-fill PA, GA floor with barricade, raked side and back stands.',
    build: () => {
      const p = show('Arena End Stage', 'arena-end-stage');
      p.stage = { ...p.stage, width: ft(60), depth: ft(40), height: ft(6) };
      p.stage.risers = [{ id: 'drums', name: 'Drum riser', width: ft(12), depth: ft(8), height: ft(2), x: 0, y: ft(24) }];
      p.ledWalls = [
        wall({ id: 'main', name: 'Upstage LED', cabinetId: 'roe.cb5-mkii', width: 16200, height: 8400, elevation: 1200, upstageGap: 600 }),
        placed(p, { id: 'imagl', name: 'IMAG left', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 6000, base: 'floor', yawDeg: 12, header: false, x: -16800, y: -4000 }),
        placed(p, { id: 'imagr', name: 'IMAG right', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 6000, base: 'floor', yawDeg: -12, header: false, x: 16800, y: -4000 }),
      ];
      p.rigging.header.clearance = 900;
      p.lighting.electrics = { count: 4, perBatten: 10, firstAt: 1500, spacing: 2800, trim: 12500, fixtureId: 'robe.megapointe' };
      p.structure!.grid = { enabled: true, width: 22000, depth: 14000, trim: 15500, spacing: 3500 };
      p.audio = { ...p.audio, mainsPerSide: 16, trim: 15000, spread: 12500, outfills: 12, subs: 12, frontFills: 6, monitors: 8 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 34000, depth: 32000, radius: 0, pit: 1800, density: 2, barricade: true };
      p.audience!.stands = [
        stand({ id: 'left', name: 'Left stand', x: -20500, y: -14000, width: 26000, yawDeg: -90, rows: 18, rowRise: 420, base: 1500 }),
        stand({ id: 'right', name: 'Right stand', x: 20500, y: -14000, width: 26000, yawDeg: 90, rows: 18, rowRise: 420, base: 1500 }),
        stand({ id: 'back', name: 'End stand', x: 0, y: -38000, width: 34000, yawDeg: 0, rows: 20, rowRise: 420, base: 2000 }),
      ];
      return p;
    },
  },
  {
    id: 'catwalk-b-stage', category: 'concert', name: 'Catwalk + B-Stage',
    summary: 'End stage with an 80′ catwalk through the GA floor to a round B-stage under its own truss; IMAG, mother grid, side stands.',
    build: () => {
      const p = show('Catwalk + B-Stage', 'catwalk-b-stage');
      p.stage = { ...p.stage, width: ft(64), depth: ft(40), height: ft(6), shape: 'runway', runway: { width: ft(8), length: ft(80), endWidth: ft(32), endDepth: ft(32), endShape: 'round' } };
      p.ledWalls = [
        wall({ id: 'main', name: 'Upstage LED', cabinetId: 'roe.cb5-mkii', width: 20400, height: 9600, elevation: 1200, upstageGap: 600 }),
        placed(p, { id: 'imagl', name: 'IMAG left', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 6000, base: 'floor', yawDeg: 12, header: false, x: -18500, y: -4000 }),
        placed(p, { id: 'imagr', name: 'IMAG right', cabinetId: 'roe.cb5-mkii', width: 8400, height: 4800, elevation: 6000, base: 'floor', yawDeg: -12, header: false, x: 18500, y: -4000 }),
      ];
      p.lighting.electrics = { count: 4, perBatten: 10, firstAt: 1500, spacing: 2800, trim: 12500, fixtureId: 'robe.megapointe' };
      p.structure!.grid = { enabled: true, width: 24000, depth: 14000, trim: 15500, spacing: 3500 };
      // a square of truss over the round B-stage (its centre is ≈ 29.1 m out)
      const by = -29100, h = 5000, z = 10000;
      p.structure!.truss = [
        { id: 'b1', from: [-h, by - h, z], to: [h, by - h, z] }, { id: 'b2', from: [h, by - h, z], to: [h, by + h, z] },
        { id: 'b3', from: [h, by + h, z], to: [-h, by + h, z] }, { id: 'b4', from: [-h, by + h, z], to: [-h, by - h, z] },
      ];
      p.audio = { ...p.audio, mainsPerSide: 16, trim: 15000, spread: 13500, outfills: 12, subs: 12, frontFills: 4, monitors: 8 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 44000, depth: 44000, radius: 0, pit: 1500, density: 2, barricade: true };
      p.audience!.stands = [
        stand({ id: 'left', name: 'Left stand', x: -25000, y: -20000, width: 34000, yawDeg: -90, rows: 18, rowRise: 420, base: 1500 }),
        stand({ id: 'right', name: 'Right stand', x: 25000, y: -20000, width: 34000, yawDeg: 90, rows: 18, rowRise: 420, base: 1500 }),
      ];
      return p;
    },
  },
  {
    id: 'in-the-round', category: 'concert', name: '360° In-the-Round',
    summary: 'Cross-shaped centre stage under an outward-facing LED ring, PA in four quadrants of three hangs, GA all round and a 360° seating bowl.',
    build: () => {
      const p = show('360° In-the-Round', 'in-the-round');
      p.stage = { ...p.stage, shape: 'cross', width: ft(40), depth: ft(40), height: ft(5), cross: { armWidth: ft(8), armLength: ft(16) } };
      const cy = ft(20);
      p.rigging.header.enabled = false;
      p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.ledWalls = [ring(p, 'ring', 'LED ring', 0, cy, 7000, 4800, 10000, false, 'roe.cb5-mkii')];
      p.structure!.grid = { enabled: true, width: 20000, depth: 20000, trim: 17500, spacing: 4000 };
      p.audio = { ...p.audio, layout: 'quad', quadRadius: 12500, hangsPerPosition: 3, mainsPerSide: 14, trim: 16500, subs: 8, frontFills: 0, monitors: 8 };
      p.audience!.standing = { enabled: true, shape: 'surround', width: 0, depth: 0, radius: 25000, pit: 1800, density: 2, barricade: true };
      p.audience!.stands = [stand({ id: 'bowl', name: 'Seating bowl', kind: 'arc', cx: 0, cy, r0: 28000, a0: 0, a1: 360, rows: 16, rowRise: 450, base: 1800 })];
      return p;
    },
  },
  {
    id: 'stadium-roof', category: 'concert', name: 'Stadium Ground-Support Roof',
    summary: '36 m Super Roof span over a 116′ deck and 30 m LED, PA and IMAG wings, a 160′ catwalk to a round B-stage, delay towers in the field.',
    build: () => {
      const p = show('Stadium Ground-Support Roof', 'stadium-roof');
      p.stage = { ...p.stage, width: ft(116), depth: ft(52), height: ft(6), shape: 'runway', runway: { width: ft(8), length: ft(160), endWidth: ft(40), endDepth: ft(40), endShape: 'round' } };
      p.rigging.header.clearance = 900;
      p.structure!.roof = { enabled: true, system: 'stageco.super-roof', span: 36000, wings: true, wingImag: true };
      p.structure!.delays = { enabled: true, count: 2, distance: 62000, spread: 40000, height: 16000 };
      const wingX = 18000 + 1600 + 3000 + 400;
      const front = ft(26) - 10000; // roof front line (roof is centred on the deck)
      p.ledWalls = [
        wall({ id: 'main', name: 'Main LED', cabinetId: 'roe.cb5-mkii', width: 30000, height: 13200, elevation: 1500, upstageGap: 300 }),
        placed(p, { id: 'imagl', name: 'IMAG left (wing)', cabinetId: 'roe.cb5-mkii', width: 9600, height: 6000, elevation: 7000, base: 'floor', header: false, x: -wingX, y: front - 1000 }),
        placed(p, { id: 'imagr', name: 'IMAG right (wing)', cabinetId: 'roe.cb5-mkii', width: 9600, height: 6000, elevation: 7000, base: 'floor', header: false, x: wingX, y: front - 1000 }),
      ];
      p.lighting.electrics = { count: 5, perBatten: 12, firstAt: 1500, spacing: 2800, trim: 16000, fixtureId: 'robe.megapointe' };
      p.audio = { ...p.audio, mainsPerSide: 18, trim: 18500, spread: wingX, outfills: 0, subs: 16, frontFills: 8, monitors: 10 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 80000, depth: 72000, radius: 0, pit: 2000, density: 2, barricade: true };
      return p;
    },
  },
  {
    id: 'festival-roof', category: 'concert', name: 'Festival Headliner Roof',
    summary: 'Four-tower roof (≈25 m span, 20 m towers) over a 68′ deck and 18 m LED, ground-stacked PA wings with IMAG, barricade and a GA field.',
    build: () => {
      const p = show('Festival Headliner Roof', 'festival-roof');
      p.stage = { ...p.stage, width: ft(68), depth: ft(48), height: ft(6) };
      p.structure!.roof = { enabled: true, system: 'stageco.classic-4-tower', span: 25600, wings: true, wingImag: true };
      const wingX = 12800 + 1600 + 3000 + 400, front = ft(24) - 8000;
      p.ledWalls = [
        wall({ id: 'main', name: 'Main LED', cabinetId: 'roe.cb5-mkii', width: 18000, height: 9600, elevation: 1200, upstageGap: 300 }),
        placed(p, { id: 'imagl', name: 'IMAG left (wing)', cabinetId: 'roe.cb5-mkii', width: 7200, height: 4800, elevation: 6000, base: 'floor', header: false, x: -wingX, y: front - 1000 }),
        placed(p, { id: 'imagr', name: 'IMAG right (wing)', cabinetId: 'roe.cb5-mkii', width: 7200, height: 4800, elevation: 6000, base: 'floor', header: false, x: wingX, y: front - 1000 }),
      ];
      p.lighting.electrics = { count: 4, perBatten: 10, firstAt: 1500, spacing: 3000, trim: 13500, fixtureId: 'robe.megapointe' };
      p.audio = { ...p.audio, mainsPerSide: 14, trim: 15500, spread: wingX, subs: 12, frontFills: 6, monitors: 8 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 60000, depth: 50000, radius: 0, pit: 1800, density: 2, barricade: true };
      return p;
    },
  },

  /* ───────────── EDM & Festival ───────────── */
  {
    id: 'edm-mainstage', category: 'edm', name: 'Festival Mainstage (Scenic Façade)',
    summary: 'A 160′ scenic façade with LED set into its forms, centre DJ booth on a riser with an LED fascia, end towers and wing PA.',
    build: () => {
      const p = show('Festival Mainstage', 'edm-mainstage');
      p.stage = { ...p.stage, width: ft(160), depth: ft(48), height: ft(6) };
      const D = ft(48);
      p.presenter.visible = false;
      p.rigging.header.enabled = false;
      p.stage.risers = [{ id: 'dj', name: 'DJ riser', width: ft(16), depth: ft(8), height: ft(2), x: 0, y: ft(8) }];
      p.show!.booth = { enabled: true, x: 0, y: ft(12), width: 3000, decks: 4 };
      p.show!.blocks = [
        { id: 'core', name: 'Centre façade', x: 0, y: D + 1500, z: 0, width: 18000, depth: 2000, height: 26000, yawDeg: 0 },
        { id: 'l1', name: 'Façade left', x: -16000, y: D + 1000, z: 0, width: 12000, depth: 2000, height: 18000, yawDeg: 0 },
        { id: 'r1', name: 'Façade right', x: 16000, y: D + 1000, z: 0, width: 12000, depth: 2000, height: 18000, yawDeg: 0 },
        { id: 'l2', name: 'Outer wing left', x: -29500, y: D - 1500, z: 0, width: 14000, depth: 2000, height: 22000, yawDeg: 12 },
        { id: 'r2', name: 'Outer wing right', x: 29500, y: D - 1500, z: 0, width: 14000, depth: 2000, height: 22000, yawDeg: -12 },
        { id: 'l3', name: 'End tower left', x: -40000, y: 6000, z: 0, width: 4000, depth: 4000, height: 28000, yawDeg: 0 },
        { id: 'r3', name: 'End tower right', x: 40000, y: 6000, z: 0, width: 4000, depth: 4000, height: 28000, yawDeg: 0 },
      ];
      p.ledWalls = [
        placed(p, { id: 'main', name: 'Centre LED', cabinetId: 'roe.cb5-mkii', width: 13800, height: 14400, elevation: 4500, base: 'floor', header: false, x: 0, y: D + 400 }),
        placed(p, { id: 'l1', name: 'Left LED', cabinetId: 'roe.cb5-mkii', width: 9600, height: 9600, elevation: 4500, base: 'floor', header: false, x: -16000, y: D - 100 }),
        placed(p, { id: 'r1', name: 'Right LED', cabinetId: 'roe.cb5-mkii', width: 9600, height: 9600, elevation: 4500, base: 'floor', header: false, x: 16000, y: D - 100 }),
        placed(p, { id: 'l2', name: 'Wing LED left', cabinetId: 'roe.cb5-mkii', width: 10200, height: 10800, elevation: 6000, base: 'floor', yawDeg: 12, header: false, x: -29500 + 1300 * Math.sin(0.21), y: D - 2600 }),
        placed(p, { id: 'r2', name: 'Wing LED right', cabinetId: 'roe.cb5-mkii', width: 10200, height: 10800, elevation: 6000, base: 'floor', yawDeg: -12, header: false, x: 29500 - 1300 * Math.sin(0.21), y: D - 2600 }),
        placed(p, { id: 'booth', name: 'DJ riser fascia', width: 4000, height: 500, elevation: 50, header: false, x: 0, y: ft(8) - 100 }),
      ];
      p.lighting.electrics = { count: 3, perBatten: 14, firstAt: 2000, spacing: 3500, trim: 16000, fixtureId: 'robe.megapointe' };
      p.audio = { ...p.audio, mainsPerSide: 16, trim: 17000, spread: 36000, outfills: 0, subs: 24, frontFills: 8, monitors: 4 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 90000, depth: 56000, radius: 0, pit: 2000, density: 2, barricade: true };
      return p;
    },
  },
  {
    id: 'edm-geometric', category: 'edm', name: 'Geometric Truss Mainstage',
    summary: 'A diamond LED centrepiece inside nested diamonds of truss, angled side LED and geometric truss arms, DJ booth front and centre.',
    build: () => {
      const p = show('Geometric Truss Mainstage', 'edm-geometric');
      p.stage = { ...p.stage, width: ft(100), depth: ft(44), height: ft(6) };
      const D = ft(44), H = ft(6), y = D + 300;
      p.presenter.visible = false;
      p.rigging.header.enabled = false;
      p.show!.booth = { enabled: true, x: 0, y: 3000, width: 3000, decks: 4 };
      // the diamond: centred stepped rows of fine-pitch LED
      const rows = [2000, 5000, 8000, 11000, 8000, 5000, 2000], cz = 1500 + (rows.length * 1500) / 2;
      p.ledWalls = rows.map((w, i) => placed(p, { id: `d${i + 1}`, name: `Diamond row ${i + 1}`, width: w, height: 1500, elevation: 1500 + i * 1500, header: false, x: 0, y }));
      p.ledWalls.push(
        placed(p, { id: 'sl', name: 'Side LED left', cabinetId: 'roe.cb5-mkii', width: 7800, height: 10800, elevation: 600, yawDeg: 20, header: false, x: -14500, y: D - 2500 }),
        placed(p, { id: 'sr', name: 'Side LED right', cabinetId: 'roe.cb5-mkii', width: 7800, height: 10800, elevation: 600, yawDeg: -20, header: false, x: 14500, y: D - 2500 }),
      );
      const zc = H + cz, tr: [number, number, number, number, number][] = [];
      // two nested truss diamonds round it (half-width, half-height), the outer one stopping clear of the floor
      for (const [rx, rz] of [[8500, 6000], [11500, 7800]]) tr.push([-rx, 0, 0, rz, 0], [0, rz, rx, 0, 0], [rx, 0, 0, -rz, 0], [0, -rz, -rx, 0, 0]);
      const truss = tr.map(([x0, z0, x1, z1], i) => ({ id: `dia${i + 1}`, from: [x0, y + 600, zc + z0] as [number, number, number], to: [x1, y + 600, zc + z1] as [number, number, number] }));
      // arms rising out to each side
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) truss.push({ id: `arm${s < 0 ? 'l' : 'r'}${k + 1}`, from: [s * (19000 + k * 2500), D - 1000 - k * 800, H + 1500 + k * 3200], to: [s * (23000 + k * 2500), D - 1000 - k * 800, H + 3000 + k * 3200] });
      for (const s of [-1, 1]) truss.push({ id: `rake${s < 0 ? 'l' : 'r'}`, from: [s * 11500, y + 600, zc], to: [s * 27000, D - 3500, H + 15000] });
      p.structure!.truss = truss;
      p.lighting.electrics = { count: 3, perBatten: 12, firstAt: 2000, spacing: 3500, trim: 15000, fixtureId: 'glp.impression-x4-bar-20' };
      p.audio = { ...p.audio, mainsPerSide: 16, trim: 16000, spread: 22000, subs: 20, frontFills: 6, monitors: 4 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 64000, depth: 48000, radius: 0, pit: 2000, density: 2, barricade: true };
      return p;
    },
  },
  {
    id: 'dj-monolith', category: 'edm', name: 'DJ Monolith',
    summary: 'The DJ high up on a central LED monolith, flanked by two LED towers, on an LED floor in front of a tall vertical backdrop.',
    build: () => {
      const p = show('DJ Monolith', 'dj-monolith');
      p.stage = { ...p.stage, width: ft(96), depth: ft(40), height: ft(5) };
      const D = ft(40), H = ft(5), my = 6000;
      p.presenter.visible = false;
      p.rigging.header.enabled = false;
      p.show!.blocks = [{ id: 'core', name: 'Monolith core', x: 0, y: my, z: H, width: 5700, depth: 5700, height: 4000, yawDeg: 0 }];
      p.show!.booth = { enabled: true, x: 0, y: my, width: 2600, decks: 4, z: H + 4000 };
      p.ledWalls = [
        wall({ id: 'floor', name: 'LED floor', cabinetId: 'roe.bm4-matte', width: 42 * 609.6, height: 5 * 609.6, elevation: 135, surface: 'floor', upstageGap: 300 - D, header: false }),
        placed(p, { id: 'back', name: 'Vertical backdrop', cabinetId: 'roe.cb5-mkii', width: 9600, height: 18000, elevation: 0, header: false, x: 0, y: D + 300 }),
        ...ledBox(p, 'mono', 'Monolith', 0, my, 6000, 6000, 4000, 0, 'deck', 'roe.bp2v2'),
        ...ledBox(p, 'twl', 'Tower left', -11000, 7000, 3600, 3600, 15600, 0, 'deck', 'roe.cb5-mkii'),
        ...ledBox(p, 'twr', 'Tower right', 11000, 7000, 3600, 3600, 15600, 0, 'deck', 'roe.cb5-mkii'),
      ];
      p.lighting.electrics = { count: 1, perBatten: 12, firstAt: 2000, spacing: 3000, trim: 14000, fixtureId: 'robe.megapointe' };
      p.audio = { ...p.audio, mainsPerSide: 14, trim: 15000, spread: 17500, subs: 16, frontFills: 6, monitors: 2 };
      p.audience!.standing = { enabled: true, shape: 'front', width: 52000, depth: 40000, radius: 0, pit: 1800, density: 2, barricade: true };
      return p;
    },
  },
  {
    id: 'club-360', category: 'edm', name: 'Club 360',
    summary: 'DJ in the middle of the floor on a round riser, two concentric LED rings flown overhead, PA pods round the room, crowd on every side.',
    build: () => {
      const p = show('Club 360', 'club-360');
      p.stage = { ...p.stage, shape: 'round', width: ft(16), depth: ft(16), height: ft(4) };
      const cy = ft(8);
      p.presenter.visible = false;
      p.rigging.header.enabled = false;
      p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.show!.booth = { enabled: true, x: 0, y: cy, width: 2400, decks: 3 };
      p.ledWalls = [
        ring(p, 'inner', 'Inner LED ring', 0, cy, 6000, 1200, 6000, false, 'roe.cb5-mkii'),
        ring(p, 'outer', 'Outer LED ring', 0, cy, 10000, 1200, 7500, false, 'roe.cb5-mkii'),
      ];
      p.structure!.grid = { enabled: true, width: 26000, depth: 26000, trim: 9000, spacing: 4300 };
      p.audio = { ...p.audio, layout: 'quad', quadRadius: 13000, hangsPerPosition: 1, mainsPerSide: 8, trim: 8800, subs: 8, frontFills: 0, monitors: 2 };
      p.audience!.standing = { enabled: true, shape: 'surround', width: 0, depth: 0, radius: 17000, pit: 1200, density: 2, barricade: true };
      return p;
    },
  },

  /* ───────────── Cinematic & Immersive ───────────── */
  {
    id: 'pano-180', category: 'immersive', name: 'Panoramic Curve 180°',
    summary: 'A 50 m concave LED wall wrapping 180° (16 m radius) round a low deck, with curved raked seating at the centre of the arc.',
    build: () => {
      const p = base('Panoramic Curve 180°', 'pano-180');
      p.stage = { ...p.stage, width: ft(40), depth: ft(16), height: ft(2), finish: 'black' };
      p.rigging.front.enabled = false; p.lighting.count = 0;
      p.seating.enabled = false; p.broadcast!.enabled = false;
      p.ledWalls = [ring(p, 'pano', 'Panoramic wall', 0, -2000, 16000, 8000, 600, true, 'roe.bp2v2', 180)];
      p.lighting.electrics = { ...p.lighting.electrics, count: 2, trim: 9000 };
      p.audio = { ...DEFAULT_AUDIO, enabled: true, mainsPerSide: 10, trim: 9000, spread: 8500, subs: 4, frontFills: 4, monitors: 0 };
      p.audience!.stands = [stand({ id: 'house', name: 'Curved house', kind: 'arc', cx: 0, cy: -2000, r0: 5000, a0: 205, a1: 335, rows: 12, rowRise: 260, rowPitch: 950, base: 0 })];
      return p;
    },
  },
  {
    id: 'room-270', category: 'immersive', name: '270° Immersive Room',
    summary: 'Open-floor room with 22′ LED walls wrapping 270° and an LED floor; visitors walk freely (Illuminarium-type experience).',
    build: () => {
      const p = base('270° Immersive Room', 'room-270');
      p.stage = { ...p.stage, width: ft(12), depth: ft(8), height: ft(1), finish: 'black' };
      const cy = ft(4);
      p.rigging.front.enabled = false; p.rigging.header.enabled = false; p.lighting.count = 0; p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.seating.enabled = false; p.broadcast!.enabled = false; p.presenter.visible = false;
      p.ledWalls = [
        ring(p, 'room', '270° wall', 0, cy, 12000, 6500, 0, true, 'roe.bp2v2', 270),
        placed(p, { id: 'floor', name: 'LED floor', cabinetId: 'roe.bm4-matte', width: 26 * 609.6, height: 26 * 609.6, elevation: 135, base: 'floor', surface: 'floor', header: false, x: 0, y: cy - 13 * 609.6 }),
      ];
      p.audio = { ...DEFAULT_AUDIO, enabled: false };
      p.audience!.standing = { enabled: true, shape: 'surround', width: 0, depth: 0, radius: 10500, pit: 900, density: 1, barricade: false };
      return p;
    },
  },
  {
    id: 'ring-360', category: 'immersive', name: '360° Ring',
    summary: 'A closed 28 m LED cylinder round the whole audience: a centre performance disc, raked rings of seats and standing room behind.',
    build: () => {
      const p = base('360° Ring', 'ring-360');
      p.stage = { ...p.stage, shape: 'round', width: ft(24), depth: ft(24), height: ft(3), finish: 'black' };
      const cy = ft(12);
      p.rigging.front.enabled = false; p.rigging.header.enabled = false; p.lighting.count = 0; p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.seating.enabled = false; p.broadcast!.enabled = false;
      p.ledWalls = [ring(p, 'ring', '360° LED ring', 0, cy, 14000, 6000, 3000, true, 'roe.bp2v2')];
      p.structure!.grid = { enabled: true, width: 8000, depth: 8000, trim: 9000, spacing: 2600 };
      p.audio = { ...DEFAULT_AUDIO, enabled: true, layout: 'quad', quadRadius: 6500, hangsPerPosition: 1, mainsPerSide: 6, trim: 8500, subs: 4, frontFills: 0, monitors: 2 };
      p.audience!.stands = [stand({ id: 'rings', name: 'Seating rings', kind: 'arc', cx: 0, cy, r0: 6200, a0: 0, a1: 360, rows: 6, rowRise: 300, rowPitch: 950, base: 0 })];
      return p;
    },
  },
  {
    id: 'led-volume', category: 'immersive', name: 'LED Volume',
    summary: 'Virtual-production volume: a 270° wall 20′ tall and 75′ across with an LED ceiling, a practical set deck inside and video village outside.',
    build: () => {
      const p = base('LED Volume', 'led-volume');
      p.stage = { ...p.stage, width: ft(28), depth: ft(16), height: ft(1), finish: 'graphite' };
      const cy = ft(8), R = ft(75) / 2;
      p.rigging.front.enabled = false; p.rigging.header.enabled = false; p.lighting.count = 0; p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.seating.enabled = false; p.broadcast!.enabled = false;
      p.ledWalls = [
        ring(p, 'wall', 'Volume wall', 0, cy, R, 6000, 0, true, 'roe.bp2v2', 270),
        placed(p, { id: 'ceiling', name: 'LED ceiling', width: 14000, height: 14000, elevation: 7300, base: 'floor', surface: 'ceiling', header: false, x: 0, y: cy - 7000 }),
      ];
      p.structure!.grid = { enabled: true, width: 15000, depth: 15000, trim: 7900, spacing: 3000 };
      p.show!.blocks = [{ id: 'village', name: 'Video village', x: 0, y: cy - R - 6000, z: 0, width: 6000, depth: 3000, height: 900, yawDeg: 0 }];
      p.audio = { ...DEFAULT_AUDIO, enabled: false };
      return p;
    },
  },
  {
    id: 'led-dome', category: 'immersive', name: 'LED Dome',
    summary: '87′ (26.5 m) hemispherical LED dome over raked seating — the Cosm-type shared-reality format. The front sector is left open so you can see in; set Opening to 0° to close it.',
    build: () => {
      const p = base('LED Dome', 'led-dome');
      p.stage = { ...p.stage, width: ft(16), depth: ft(8), height: ft(1), finish: 'black' };
      p.rigging.front.enabled = false; p.rigging.header.enabled = false; p.lighting.count = 0; p.lighting.electrics = { ...p.lighting.electrics, count: 0 };
      p.seating.enabled = false; p.broadcast!.enabled = false; p.presenter.visible = false;
      p.ledWalls = [];
      p.show!.dome = { enabled: true, diameter: ft(87), springing: 2500, openingDeg: 70, cx: 0, cy: 3000 };
      p.audio = { ...DEFAULT_AUDIO, enabled: false };
      p.audience!.stands = [stand({ id: 'tiers', name: 'Raked tiers', kind: 'arc', cx: 0, cy: 3000, r0: 3000, a0: 215, a1: 325, rows: 9, rowRise: 450, rowPitch: 1100, base: 0, focus: [0, 3000 + ft(87) / 2, 2500] })];
      return p;
    },
  },
];

export const DEFAULT_PRESET = PRESETS[0];
export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
