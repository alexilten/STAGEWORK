import type { DisplayUnits, Mm } from './units';

/**
 * STAGECRAFT project file — the single authoritative description of a stage.
 * The viewport, the production report and every exporter are derived from this
 * via resolveScene(); nothing downstream is edited by hand.
 *
 * World coordinates (mm, right-handed, Z up):
 *   origin  = floor level, on the stage centreline, at the downstage (audience) edge of the stage
 *   +X      = stage left → stage right as seen by the AUDIENCE (house right)
 *   +Y      = upstage (away from the audience)
 *   +Z      = up
 */
export const PROJECT_SCHEMA = 'stagecraft.project';
export const PROJECT_VERSION = 1;

export type StageFinish = 'black' | 'white' | 'graphite' | 'oak';

/**
 * rect / thrust / runway / rounded: end stages (audience in front).
 * round: a circular custom-built centre stage (diameter = width).
 * cross: a centre square with four arms, for 360° (in-the-round) staging.
 */
export type StageShape = 'rect' | 'thrust' | 'runway' | 'rounded' | 'round' | 'cross';

/** A raised platform on top of the main deck (band riser, upstage level, presenter step-up). */
export interface RiserParams {
  id: string;
  name: string;
  width: Mm;
  depth: Mm;
  /** riser top above the main deck top */
  height: Mm;
  /** centre offset from the stage centreline */
  x: Mm;
  /** downstage edge of the riser, measured upstage from the main deck's downstage edge */
  y: Mm;
}

export interface StageParams {
  /** design intent; the resolved width snaps to whole deck modules */
  width: Mm;
  depth: Mm;
  /** deck top above venue floor */
  height: Mm;
  deckSystemId: string;
  finish: StageFinish;
  fascia: boolean;
  shape?: StageShape;
  /** thrust: a wide centre extension into the audience */
  thrust?: { width: Mm; depth: Mm };
  /** runway: a narrow walkway into the audience, optionally ending in a B-stage */
  runway?: { width: Mm; length: Mm; endWidth: Mm; endDepth: Mm; endShape?: 'rect' | 'round' };
  /** cross: arms of this width and length out from each side of the centre square */
  cross?: { armWidth: Mm; armLength: Mm };
  /** rounded front: custom-built curved apron across the deck front; depth at the centreline */
  apron?: { depth: Mm };
  risers?: RiserParams[];
}

export const DEFAULT_SHAPES = {
  thrust: { width: 4877, depth: 3658 },
  runway: { width: 2438, length: 7315, endWidth: 4877, endDepth: 3658 },
  apron: { depth: 1500 },
};

export interface LedWallParams {
  id: string;
  name: string;
  cabinetId: string;
  /** requested (design-intent) size; resolved to whole cabinets */
  width: Mm;
  height: Mm;
  /** bottom of LED above the stage deck top */
  elevation: Mm;
  /** horizontal offset of the wall centre from the stage centreline */
  offsetX: Mm;
  /** distance from the upstage edge of the stage to the LED front face (negative = on the deck) */
  upstageGap: Mm;
  /** angle between adjacent columns, degrees; positive = concave toward audience */
  curveDeg: number;
  /** arc mode: bend the wall to this radius (overrides curveDeg). Positive = concave (faces the centre), negative = convex (faces out) */
  radius?: Mm;
  /** yaw of the whole wall about its origin, degrees (positive turns the face toward house right) */
  yawDeg?: number;
  /** what elevation is measured from: the main deck top (default) or the venue floor */
  base?: 'deck' | 'floor';
  /** wall (default), floor (laid flat, face up: width along X, height runs upstage) or ceiling (face down) */
  surface?: 'wall' | 'floor' | 'ceiling';
  /** hang a header truss above this wall (default true; only upright walls facing the audience get one) */
  header?: boolean;
}

export interface RiggingParams {
  trussId: string;
  header: { enabled: boolean; clearance: Mm; overhang: Mm; maxHoistSpacing: Mm };
  front: { enabled: boolean; distance: Mm; trim: Mm; width: Mm };
}

export interface LightingParams {
  enabled: boolean;
  fixtureId: string;
  /** front-of-house fixtures on the front truss */
  count: number;
  /** overhead electrics: horizontal lighting battens over the stage */
  electrics: { count: number; perBatten: number; firstAt: Mm; spacing: Mm; trim: Mm; fixtureId?: string };
  /** vertical side booms, house left and right */
  booms: { enabled: boolean; perBoom: number; height: Mm; fixtureId?: string };
}

export const DEFAULT_LIGHTING_POSITIONS = {
  electrics: { count: 3, perBatten: 8, firstAt: 1000, spacing: 1500, trim: 7000 },
  booms: { enabled: false, perBoom: 4, height: 4000 },
};

export type SeatingLayout = 'block' | 'grid' | 'radial';

/**
 * Audience seating. Spacing defaults follow common US assembly-occupancy practice
 * (IBC / IFC Chapter 10, NFPA 101 Ch. 12–13); the engine checks row clear width
 * against the seats-per-row rule but the final plan always needs the venue / AHJ.
 */
export interface SeatingParams {
  enabled: boolean;
  layout: SeatingLayout;
  /** target seat count, 250–5000 */
  count: number;
  chairId: string;
  /** downstage edge of the deck → front of the first row */
  frontDistance: Mm;
  /** back-to-back row spacing */
  rowPitch: Mm;
  /** seat centre-to-centre */
  seatPitch: Mm;
  aisleWidth: Mm;
  /** seats per row in each block (block / radial layouts) */
  seatsPerBlock: number;
  /** place the ADA wheelchair spaces and companion seats in the plan (else only report how many) */
  accessible?: boolean;
}

export const DEFAULT_SEATING: SeatingParams = {
  enabled: true, layout: 'block', count: 1000, chairId: 'generic.chair-stack',
  frontDistance: 3050, rowPitch: 915, seatPitch: 560, aisleWidth: 1070, seatsPerBlock: 14, accessible: true,
};

export interface AudioParams {
  enabled: boolean;
  mainSpeakerId: string;
  /** boxes per flown hang (house left and right) */
  mainsPerSide: number;
  /** bottom-of-array planning: top-of-array trim height AFF */
  trim: Mm;
  /** outboard offset of each hang from the centreline */
  spread: Mm;
  /** nominal progressive inter-cabinet splay, degrees */
  splayPerBox: number;
  subSpeakerId: string;
  subs: number;
  subMode: 'ground' | 'flown';
  fillSpeakerId: string;
  frontFills: number;
  monitorSpeakerId: string;
  monitors: number;
  /** lr: house left / right hangs (end stage). quad: four positions round a centre stage, for 360° */
  layout?: 'lr' | 'quad';
  /** quad: plan distance of each position from the stage centre */
  quadRadius?: Mm;
  /** quad: hangs per position, side by side */
  hangsPerPosition?: number;
  /** side / out-fill hang outboard of each main (boxes per side; 0 = none) */
  outfills?: number;
}

export const DEFAULT_AUDIO: AudioParams = {
  enabled: false,
  mainSpeakerId: 'dbaudio.j8', mainsPerSide: 12, trim: 8000, spread: 7000, splayPerBox: 2,
  subSpeakerId: 'dbaudio.j-sub', subs: 4, subMode: 'ground',
  fillSpeakerId: 'generic.fill', frontFills: 4,
  monitorSpeakerId: 'generic.wedge', monitors: 4,
};

/**
 * Screen content: one still image or video loop mapped across the LED surfaces
 * (see engine/media.ts). The pixels themselves live outside the undo history; a saved
 * project file carries them inline as `data` (a data: URL) so it reopens with its content.
 * Videos too large to inline are saved with their poster frame only and relinked on open.
 */
export interface MediaParams {
  assetId: string;
  name: string;
  /** source image size in pixels */
  width: number;
  height: number;
  /** span = cover every screen; main = fit inside the main screen */
  fit: 'span' | 'main';
  data?: string;
  /** still (default) or a video that plays on the screens */
  kind?: 'image' | 'video';
  /** video only: length in seconds */
  duration?: number;
  /** video only: loop at the end (default on) */
  loop?: boolean;
  /** video only: a small JPEG of the first frames, shown until the video is linked and in exports */
  poster?: string;
  /** video only: source file size in bytes */
  bytes?: number;
}

/**
 * Scenic: a hard portal that frames the main screen, soft masking legs down the
 * sides of the deck, and an upstage drape. Planning envelopes only — portal is
 * custom carpentry; soft goods are drawn flat without fullness or pipe hardware.
 */
export interface ScenicParams {
  portal: { enabled: boolean; margin: Mm; legWidth: Mm; headerHeight: Mm; thickness: Mm; finish: StageFinish };
  masking: { enabled: boolean; pairs: number; legWidth: Mm; height: Mm };
  drape: { enabled: boolean };
}

export const DEFAULT_SCENIC: ScenicParams = {
  portal: { enabled: false, margin: 300, legWidth: 1200, headerHeight: 1200, thickness: 150, finish: 'white' },
  masking: { enabled: false, pairs: 2, legWidth: 1830, height: 6000 },
  drape: { enabled: false },
};

/**
 * Broadcast / IMAG camera plan (see engine/broadcast.ts). Positions are derived from the
 * stage and the seating, so they follow the audience as it grows, shrinks or changes shape.
 */
export interface BroadcastParams {
  enabled: boolean;
  /** long-lens cameras on a platform at the back of (or in) the house, facing the stage */
  foh: {
    cameras: number;
    /** auto = behind the last row unless the throw is too long for a close-up, then in the house */
    placement: 'auto' | 'back' | 'custom';
    /** custom: stage front → platform front edge */
    distance: Mm;
    /** clear the heads of a standing audience (walk-ons, ovations) rather than a seated one */
    standing: boolean;
  };
  /** cross-shot cameras on low platforms at the front corners of the house */
  sideCams: boolean;
  /** robotic camera on a straight (or apron-following) track between the stage and the front row */
  rail: { enabled: boolean; length: Mm; prompter: boolean };
  /** roaming RF handheld, shown at its start position */
  handheld: boolean;
  /** Steadicam on the deck (house right), shown at its start position */
  steadicam: boolean;
  /** camera jib on the house floor off a downstage corner */
  jib: { enabled: boolean; side: 'left' | 'right'; reachFt: number };
  /** robotic PTZ cameras: under the front truss, or on the deck corners */
  ptz: { count: number; mount: 'truss' | 'deck' };
  prompters: {
    /** presidential (conference) glass pair either side of the presenter */
    presidential: boolean;
    /** downstage confidence monitors: on stands at the lip, or recessed into the deck */
    dsm: 'off' | 'stand' | 'recessed';
    dsmCount: number;
    /** large confidence screens out front: on the camera platform, or hung under the front truss */
    foh: 'off' | 'riser' | 'truss';
  };
}

export const DEFAULT_BROADCAST: BroadcastParams = {
  enabled: false,
  foh: { cameras: 2, placement: 'auto', distance: 25000, standing: false },
  sideCams: true,
  rail: { enabled: true, length: 9000, prompter: false },
  handheld: true,
  steadicam: false,
  jib: { enabled: false, side: 'left', reachFt: 24 },
  ptz: { count: 0, mount: 'truss' },
  prompters: { presidential: true, dsm: 'stand', dsmCount: 2, foh: 'truss' },
};

/**
 * Standing (GA) audience and raked seating stands (see engine/audience.ts).
 * Standing capacity is planned at `density` persons per m² of clear floor; 2 / m² is common
 * open-air planning practice, and crowds above ~4 / m² are generally treated as unsafe.
 */
export interface StandingParams {
  enabled: boolean;
  /** front: a rectangle in front of the stage. surround: a ring all the way round a centre stage */
  shape: 'front' | 'surround';
  /** front: floor width and depth; surround: outer radius from the stage centre */
  width: Mm;
  depth: Mm;
  radius: Mm;
  /** barricade setback from the deck edge (the pit) */
  pit: Mm;
  /** planning density, persons per m² */
  density: number;
  barricade: boolean;
}

/** A raked seating stand: straight (front row centre at x, y, facing yawDeg) or an arc about (cx, cy) */
export interface StandParams {
  id: string;
  name: string;
  kind: 'straight' | 'arc';
  x: Mm; y: Mm; width: Mm;
  /** straight: direction the audience faces, degrees (0 = toward +Y, i.e. upstage) */
  yawDeg: number;
  cx: Mm; cy: Mm;
  /** arc: radius of the front row and the angle range it covers (degrees, CCW from +X) */
  r0: Mm; a0: number; a1: number;
  rows: number;
  rowRise: Mm;
  rowPitch: Mm;
  /** height of the first tread above the floor */
  base: Mm;
  /** point of focus for the sightline (C-value) check; default: the nearest deck edge at deck height */
  focus?: [Mm, Mm, Mm];
}

export interface AudienceParams {
  standing: StandingParams;
  stands: StandParams[];
}

export const DEFAULT_STANDING: StandingParams = { enabled: false, shape: 'front', width: 30000, depth: 25000, radius: 24000, pit: 1800, density: 2, barricade: true };
export const DEFAULT_AUDIENCE: AudienceParams = { standing: { ...DEFAULT_STANDING }, stands: [] };

/**
 * Ground-support structure and big-show rigging (see engine/structure.ts): a festival / stadium roof
 * with PA wings, a mother grid over the stage, delay towers in the field and free truss members.
 */
export type RoofSystem = 'stageco.roof-25x10' | 'stageco.classic-4-tower' | 'stageco.super-roof';
export interface StructureParams {
  roof: { enabled: boolean; system: RoofSystem; span: Mm; wings: boolean; wingImag: boolean };
  grid: { enabled: boolean; width: Mm; depth: Mm; trim: Mm; spacing: Mm };
  delays: { enabled: boolean; count: number; distance: Mm; spread: Mm; height: Mm };
  /** free truss members between two points (scenic / geometric rigs) */
  truss: { id: string; from: [Mm, Mm, Mm]; to: [Mm, Mm, Mm] }[];
}
export const DEFAULT_STRUCTURE: StructureParams = {
  roof: { enabled: false, system: 'stageco.roof-25x10', span: 25000, wings: true, wingImag: true },
  grid: { enabled: false, width: 20000, depth: 12000, trim: 12000, spacing: 3000 },
  delays: { enabled: false, count: 2, distance: 45000, spread: 22000, height: 14000 },
  truss: [],
};

/**
 * Show elements (see engine/show.ts): DJ booth, scenic blocks (façades, towers, plinths) and an LED dome.
 */
export interface ScenicBlockParams { id: string; name: string; x: Mm; y: Mm; z: Mm; width: Mm; depth: Mm; height: Mm; yawDeg: number }
export interface ShowParams {
  /** z: booth floor height (default: the deck top under it) */
  booth: { enabled: boolean; x: Mm; y: Mm; width: Mm; decks: number; z?: Mm };
  blocks: ScenicBlockParams[];
  /** hemispherical LED dome: centre (cx, cy), springing = height of its base ring, opening = a wedge left open toward the audience side (−Y) */
  dome: { enabled: boolean; diameter: Mm; springing: Mm; openingDeg: number; cx: Mm; cy: Mm };
}
export const DEFAULT_SHOW: ShowParams = {
  booth: { enabled: false, x: 0, y: 2400, width: 2400, decks: 4 },
  blocks: [],
  dome: { enabled: false, diameter: 26500, springing: 2000, openingDeg: 0, cx: 0, cy: 0 },
};

/**
 * Venue shell (see engine/venue.ts): the building the stage sits in. The footprint is the interior
 * width (across the stage, X) × depth (stage wall to the back of house, Y); the archetype fits its
 * structure to it. The stage wall is the +Y wall, `upstage` behind everything on the stage.
 */
export type VenueArchetype = 'black-box' | 'ballroom' | 'convention' | 'warehouse' | 'sound-stage';
export interface VenueParams {
  enabled: boolean;
  archetype: VenueArchetype;
  width: Mm;
  depth: Mm;
  /** clear distance from the most upstage element of the show to the stage wall */
  upstage: Mm;
  /** build even though the footprint is outside the archetype's range (the user confirmed it) */
  override: boolean;
  /** clear height override (bottom of steel / grid / ceiling); default from the archetype */
  clearHeight?: Mm;
  /** viewport cutaway: walls between the camera and the room drop to `height` */
  cut: { enabled: boolean; height: Mm };
}
export const DEFAULT_VENUE: VenueParams = {
  enabled: false, archetype: 'convention', width: 91440, depth: 128016, upstage: 3000, override: false, cut: { enabled: true, height: 1200 },
};

export interface Project {
  schema: typeof PROJECT_SCHEMA;
  version: number;
  name: string;
  presetId?: string;
  units: DisplayUnits;
  stage: StageParams;
  ledWalls: LedWallParams[];
  rigging: RiggingParams;
  lighting: LightingParams;
  presenter: { visible: boolean };
  seating: SeatingParams;
  audio: AudioParams;
  media?: MediaParams | null;
  scenic?: ScenicParams;
  broadcast?: BroadcastParams;
  audience?: AudienceParams;
  structure?: StructureParams;
  show?: ShowParams;
  venue?: VenueParams;
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(text: string): Project {
  const data = JSON.parse(text);
  if (data?.schema !== PROJECT_SCHEMA) throw new Error('Not a STAGECRAFT project file');
  if (typeof data.version !== 'number' || data.version > PROJECT_VERSION)
    throw new Error(`Project version ${data.version} is newer than this app supports (${PROJECT_VERSION})`);
  // additive fields from later rounds: fill defaults rather than bumping the version
  if (!data.seating) data.seating = { ...DEFAULT_SEATING, enabled: false };
  if (!data.audio) data.audio = { ...DEFAULT_AUDIO };
  if (!data.scenic) data.scenic = structuredClone(DEFAULT_SCENIC);
  if (!data.broadcast) data.broadcast = structuredClone(DEFAULT_BROADCAST);
  data.broadcast.steadicam ??= false;
  data.broadcast.jib ??= structuredClone(DEFAULT_BROADCAST.jib);
  data.broadcast.ptz ??= structuredClone(DEFAULT_BROADCAST.ptz);
  if (!data.audience) data.audience = structuredClone(DEFAULT_AUDIENCE);
  if (!data.structure) data.structure = structuredClone(DEFAULT_STRUCTURE);
  if (!data.show) data.show = structuredClone(DEFAULT_SHOW);
  if (!data.venue) data.venue = structuredClone(DEFAULT_VENUE);
  if (!data.lighting.electrics) data.lighting.electrics = { ...DEFAULT_LIGHTING_POSITIONS.electrics };
  if (!data.lighting.booms) data.lighting.booms = { ...DEFAULT_LIGHTING_POSITIONS.booms };
  return data as Project;
}
