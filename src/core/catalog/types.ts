import type { Mm } from '../units';

/**
 * How much a catalogue entry can be trusted.
 *  - manufacturer: checked against the manufacturer's own datasheet
 *  - secondary:    real SKU, specs taken from a dealer / rental-house listing; re-check against the datasheet before production use
 *  - generic:      not a manufacturer SKU; representative dimensions for planning only
 */
export type Verification = 'manufacturer' | 'secondary' | 'generic';

export interface SourceRef {
  label: string;
  url?: string;
  accessed?: string; // ISO date
  note?: string;
}

interface CatalogBase {
  id: string; // stable, used in project files — never rename
  manufacturer: string; // "Generic" for generic entries
  model: string;
  category: 'led-cabinet' | 'deck' | 'truss' | 'fixture' | 'hoist' | 'chair' | 'speaker';
  verification: Verification;
  sources: SourceRef[];
  notes?: string[];
}

export interface LedCabinet extends CatalogBase {
  category: 'led-cabinet';
  width: Mm;
  height: Mm;
  depth: Mm;
  pixelPitch: Mm;
  pixelsW: number;
  pixelsH: number;
  weightKg: number | null;
  powerMaxW?: number | null; // per cabinet
  powerAvgW?: number | null;
  /** max inter-cabinet angle in degrees; concave positive. null = not documented → treat as flat only */
  curveConcaveMaxDeg: number | null;
  curveConvexMaxDeg: number | null;
}

export interface DeckSystem extends CatalogBase {
  category: 'deck';
  /** primary platform, long side placed along stage width */
  long: Mm;
  short: Mm;
  /** the infill platform used to complete odd module counts (short × short) */
  infill: { long: Mm; short: Mm; label: string };
  label: string; // e.g. "8′ × 4′"
  topThickness: Mm;
  frameDepth: Mm; // structural depth of the platform incl. top
  legDiameter: Mm;
  legInset: Mm; // leg centre from platform edge
  minHeight: Mm; // deck top above floor
  maxHeight: Mm;
  heightStep: Mm; // leg-height increment for snapping
  weightKg: number | null; // primary platform
  infillWeightKg: number | null;
  loadRatingKNm2: number | null;
}

export interface TrussSystem extends CatalogBase {
  category: 'truss';
  profile: 'box' | 'ladder' | 'triangle';
  width: Mm; // outer, chord centre to chord centre + chord dia
  height: Mm;
  chordDiameter: Mm;
  chordWall: Mm;
  braceDiameter: Mm;
  /** available straight section lengths, longest first */
  sections: { length: Mm; weightKg: number | null; verified: boolean }[];
  connection: string;
}

export interface Fixture extends CatalogBase {
  category: 'fixture';
  fixtureType: 'wash' | 'spot' | 'beam' | 'profile' | 'strobe';
  /** body form for the planning envelope (default moving head) */
  form?: 'moving-head' | 'batten' | 'ellipsoidal';
  /** front-to-back (Y) */
  length: Mm;
  /** side-to-side (X); for a batten, its length */
  width: Mm;
  height: Mm;
  weightKg: number | null;
  powerMaxW: number | null;
  /** typical draw where the maker publishes only that (not used as a max) */
  powerTypW?: number | null;
  mounting: string;
}

export interface Hoist extends CatalogBase {
  category: 'hoist';
  capacityKg: number;
  bodyW: Mm;
  bodyD: Mm;
  bodyH: Mm;
  weightKg: number | null;
}

export interface Chair extends CatalogBase {
  category: 'chair';
  /** overall footprint and height */
  width: Mm;
  depth: Mm;
  height: Mm;
  seatHeight: Mm;
  weightKg: number | null;
}

export interface Speaker extends CatalogBase {
  category: 'speaker';
  speakerType: 'line-array' | 'sub' | 'point' | 'monitor';
  /** cabinet envelope: width (X, left-right), depth (Y, front-back), height (Z) */
  width: Mm;
  depth: Mm;
  height: Mm;
  weightKg: number | null;
  /** nominal horizontal coverage, degrees (point/array) */
  dispersionH?: number | null;
  /** inter-cabinet splay range for line arrays, degrees [min,max] */
  splayRange?: [number, number] | null;
}

export type CatalogItem = LedCabinet | DeckSystem | TrussSystem | Fixture | Hoist | Chair | Speaker;
