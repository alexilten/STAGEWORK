import type { Mm } from '../units';

export type Vec3 = [number, number, number];

export type MaterialKey =
  | 'deckTop' | 'deckFrame' | 'leg' | 'fascia'
  | 'ledBody' | 'ledSupport'
  | 'truss' | 'hoist' | 'fixture'
  | 'presenter';

export type Part =
  | { kind: 'box'; min: Vec3; max: Vec3; mat: MaterialKey }
  | { kind: 'cyl'; from: Vec3; to: Vec3; r: Mm; mat: MaterialKey };

/** Rhino layer paths (see docs/ARCHITECTURE.md §Rhino layer hierarchy) */
export type LayerPath =
  | '00_REFERENCE'
  | '10_STAGE::10_01_DECKING' | '10_STAGE::10_02_RISERS' | '10_STAGE::10_03_SUPPORTS' | '10_STAGE::10_04_FINISHES'
  | '20_LED::20_01_CABINETS' | '20_LED::20_02_SUPPORTS' | '20_LED::20_03_TRIM'
  | '30_RIGGING::30_01_TRUSS' | '30_RIGGING::30_02_HOISTS' | '30_RIGGING::30_03_HARDWARE'
  | '40_LIGHTING::40_01_FIXTURES' | '40_LIGHTING::40_02_ACCESSORIES'
  | '50_AUDIO' | '60_SCENIC'
  | '90_TECHNICAL::90_01_DIMENSIONS' | '90_TECHNICAL::90_02_CENTERLINES' | '90_TECHNICAL::90_03_REFERENCE';

/** UI layer toggles; several Rhino sub-layers can map to one toggle */
export type SystemKey = 'decking' | 'supports' | 'finishes' | 'ledCabinets' | 'ledSupports' | 'rigging' | 'lighting' | 'audio' | 'scenic' | 'dimensions' | 'reference';

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
  rotationZ: number; // radians, about the object's origin
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
