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

export type StageShape = 'rect' | 'thrust' | 'runway' | 'rounded';

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
  runway?: { width: Mm; length: Mm; endWidth: Mm; endDepth: Mm };
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
}

export const DEFAULT_SEATING: SeatingParams = {
  enabled: true, layout: 'block', count: 1000, chairId: 'generic.chair-stack',
  frontDistance: 3050, rowPitch: 915, seatPitch: 560, aisleWidth: 1070, seatsPerBlock: 14,
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
}

export const DEFAULT_AUDIO: AudioParams = {
  enabled: false,
  mainSpeakerId: 'dbaudio.j8', mainsPerSide: 12, trim: 8000, spread: 7000, splayPerBox: 2,
  subSpeakerId: 'dbaudio.j-sub', subs: 4, subMode: 'ground',
  fillSpeakerId: 'generic.fill', frontFills: 4,
  monitorSpeakerId: 'generic.wedge', monitors: 4,
};

/**
 * Screen content: one still image mapped across the LED surfaces (see engine/media.ts).
 * The pixels themselves live outside the undo history; a saved project file carries
 * them inline as `data` (a data: URL) so it reopens with its content.
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
  prompters: { presidential: true, dsm: 'stand', dsmCount: 2, foh: 'truss' },
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
  if (!data.lighting.electrics) data.lighting.electrics = { ...DEFAULT_LIGHTING_POSITIONS.electrics };
  if (!data.lighting.booms) data.lighting.booms = { ...DEFAULT_LIGHTING_POSITIONS.booms };
  return data as Project;
}
