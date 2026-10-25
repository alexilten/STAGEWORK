import type { Mm } from '../units';

export type Vec3 = [number, number, number];

export type MaterialKey =
  | 'deckTop' | 'deckFrame' | 'leg' | 'fascia'
  | 'ledBody' | 'ledSupport'
  | 'truss' | 'hoist' | 'fixture'
  | 'presenter'
  | 'chairSeat' | 'chairFrame'
  | 'speaker' | 'speakerGrille'
  | 'scenicFlat' | 'drape'
  | 'camera' | 'platform' | 'glass' | 'screen'
  | 'crowd' | 'barricade' | 'stand' | 'structure' | 'roofSkin' | 'booth' | 'accessible'
  | 'venueWall' | 'venueDark' | 'venueFloor' | 'venueCarpet' | 'venueSteel' | 'venueColumn' | 'venuePipe' | 'venueDoor' | 'venueGlass' | 'rigPoint' | 'venueTier' | 'venueTurf';

export type Part =
  | { kind: 'box'; min: Vec3; max: Vec3; mat: MaterialKey }
  | { kind: 'cyl'; from: Vec3; to: Vec3; r: Mm; mat: MaterialKey }
  /** plan polygon (counter-clockwise, XY) extruded from z0 to z1 */
  | { kind: 'prism'; points: [number, number][]; z0: Mm; z1: Mm; mat: MaterialKey };

/** Rhino layer paths (see docs/ARCHITECTURE.md §Rhino layer hierarchy) */
export type LayerPath =
  | '00_REFERENCE'
  | '05_VENUE::05_01_SHELL' | '05_VENUE::05_02_STRUCTURE' | '05_VENUE::05_03_RIGGING' | '05_VENUE::05_04_FIXTURES' | '05_VENUE::05_05_SERVICES' | '05_VENUE::05_06_GRID_LINES'
  | '10_STAGE::10_01_DECKING' | '10_STAGE::10_02_RISERS' | '10_STAGE::10_03_SUPPORTS' | '10_STAGE::10_04_FINISHES'
  | '20_LED::20_01_CABINETS' | '20_LED::20_02_SUPPORTS' | '20_LED::20_03_TRIM'
  | '30_RIGGING::30_01_TRUSS' | '30_RIGGING::30_02_HOISTS' | '30_RIGGING::30_03_HARDWARE' | '30_RIGGING::30_04_GROUND_SUPPORT' | '30_RIGGING::30_05_GRID'
  | '40_LIGHTING::40_01_FIXTURES' | '40_LIGHTING::40_02_ACCESSORIES' | '40_LIGHTING::40_03_POSITIONS'
  | '50_AUDIO::50_01_MAINS' | '50_AUDIO::50_02_SUBS' | '50_AUDIO::50_03_FILLS' | '50_AUDIO::50_04_MONITORS' | '50_AUDIO::50_05_DELAYS'
  | '60_SCENIC::60_01_PORTAL' | '60_SCENIC::60_02_MASKING' | '60_SCENIC::60_03_DRAPES' | '60_SCENIC::60_04_ELEMENTS' | '60_SCENIC::60_05_DJ_BOOTH'
  | '70_AUDIENCE::70_01_SEATING' | '70_AUDIENCE::70_02_LAYOUT' | '70_AUDIENCE::70_03_STANDING' | '70_AUDIENCE::70_04_BARRICADE' | '70_AUDIENCE::70_05_STANDS' | '70_AUDIENCE::70_06_ACCESSIBLE'
  | '80_BROADCAST::80_01_CAMERAS' | '80_BROADCAST::80_02_PLATFORMS' | '80_BROADCAST::80_03_TRACK' | '80_BROADCAST::80_04_PROMPTERS' | '80_BROADCAST::80_05_CREW'
  | '90_TECHNICAL::90_01_DIMENSIONS' | '90_TECHNICAL::90_02_CENTERLINES' | '90_TECHNICAL::90_03_REFERENCE';

/** UI layer toggles; several Rhino sub-layers can map to one toggle */
export type SystemKey = 'decking' | 'supports' | 'finishes' | 'ledCabinets' | 'ledSupports' | 'rigging' | 'structure' | 'lighting' | 'audio' | 'scenic' | 'seating' | 'broadcast' | 'dimensions' | 'reference' | 'venue';

export interface BlockDef {
  key: string; // Rhino block name
  description: string;
  parts: Part[];
  catalogId?: string;
}

export type MetaValue = string | number | boolean | null;

export interface SceneObject {
  id: string; // stable within a resolve; also the Rhino object name
  label: string;
  layer: LayerPath;
  system: SystemKey;
  /** selection group: clicking any member highlights the group in the inspector */
  group: string;
  block?: string;
  parts?: Part[]; // unique (non-block) geometry
  position: Vec3;
  rotationZ: number; // radians, yaw about the object's local Z
  /** optional pitch about the object's local X axis, applied after rotationZ (radians) */
  tilt?: number;
  meta: Record<string, MetaValue>;
}

export interface Annotation {
  id: string;
  kind: 'dim' | 'line';
  layer: LayerPath;
  from: Vec3;
  to: Vec3;
  /** dim: label anchor and value */
  value?: Mm;
  label?: string;
}

export interface Warning {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  target?: string; // group id
}

export interface Alternative {
  label: string;
  value: Mm;
}

export interface Resolved1D {
  requested: Mm;
  resolved: Mm;
  modules: number;
  exact: boolean;
  alternatives: Alternative[]; // nearest achievable (below / above)
}
