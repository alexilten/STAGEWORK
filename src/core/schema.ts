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

export interface StageParams {
  /** design intent; the resolved width snaps to whole deck modules */
  width: Mm;
  depth: Mm;
  /** deck top above venue floor */
  height: Mm;
  deckSystemId: string;
  finish: StageFinish;
  fascia: boolean;
}

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
  count: number;
}

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
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(text: string): Project {
  const data = JSON.parse(text);
  if (data?.schema !== PROJECT_SCHEMA) throw new Error('Not a STAGECRAFT project file');
  if (typeof data.version !== 'number' || data.version > PROJECT_VERSION)
    throw new Error(`Project version ${data.version} is newer than this app supports (${PROJECT_VERSION})`);
  // future: migrations keyed by version
  return data as Project;
}
