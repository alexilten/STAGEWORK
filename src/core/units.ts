/**
 * Units. Millimetres are the canonical internal unit everywhere in STAGECRAFT
 * (project files, engine, scene graph, Rhino export). Conversion happens only
 * at the UI boundary, so no value is ever stored in feet or metres.
 */
export type Mm = number;
export type DisplayUnits = 'metric' | 'imperial';

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

export const ft = (feet: number, inches = 0): Mm => feet * MM_PER_FOOT + inches * MM_PER_INCH;
export const m = (metres: number): Mm => metres * 1000;

/** Format a length for display. Metric shows metres (or mm under 1 m); imperial shows ft-in to 1/4". */
export function formatLength(mm: Mm, units: DisplayUnits, opts: { precise?: boolean } = {}): string {
  if (units === 'metric') {
    if (Math.abs(mm) < 1000 && opts.precise) return `${round(mm, 0)} mm`;
    return `${trimZeros((mm / 1000).toFixed(opts.precise ? 3 : 2))} m`;
  }
  const sign = mm < 0 ? '-' : '';
  const totalQuarters = Math.round(Math.abs(mm) / MM_PER_INCH * 4);
  const feet = Math.floor(totalQuarters / 48);
  const rem = totalQuarters - feet * 48;
  const inches = Math.floor(rem / 4);
  const q = rem % 4;
  const frac = q === 0 ? '' : q === 2 ? '½' : q === 1 ? '¼' : '¾';
  if (feet === 0) return `${sign}${inches}${frac}″`;
  if (inches === 0 && !frac) return `${sign}${feet}′`;
  return `${sign}${feet}′ ${inches}${frac}″`;
}

export function formatArea(mm2: number, units: DisplayUnits): string {
  if (units === 'metric') return `${round(mm2 / 1e6, 1)} m²`;
  return `${Math.round(mm2 / (MM_PER_FOOT * MM_PER_FOOT))} ft²`;
}

export function formatWeight(kg: number, units: DisplayUnits): string {
  if (units === 'metric') return kg >= 1000 ? `${round(kg / 1000, 2)} t` : `${Math.round(kg)} kg`;
  return `${Math.round(kg * 2.20462).toLocaleString()} lb`;
}

/** The value a numeric field shows/edits in the chosen display unit (m or ft). */
export const toDisplay = (mm: Mm, units: DisplayUnits) => (units === 'metric' ? mm / 1000 : mm / MM_PER_FOOT);
export const fromDisplay = (v: number, units: DisplayUnits): Mm => (units === 'metric' ? v * 1000 : v * MM_PER_FOOT);
export const displayUnitLabel = (units: DisplayUnits) => (units === 'metric' ? 'm' : 'ft');

export function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
function trimZeros(s: string) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/**
 * Parse a typed length. Bare numbers are in the current display unit (m or ft).
 * Accepts: 12.5 · 12.5m · 4500mm · 450cm · 40' · 40'6" · 40ft 6in · 18" · 18in
 */
export function parseLength(text: string, units: DisplayUnits): Mm | null {
  const s = text.trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/,/g, '.');
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(-?\d*\.?\d+)\s*mm$/))) return +m[1];
  if ((m = s.match(/^(-?\d*\.?\d+)\s*cm$/))) return +m[1] * 10;
  if ((m = s.match(/^(-?\d*\.?\d+)\s*m$/))) return +m[1] * 1000;
  if ((m = s.match(/^(-?\d*\.?\d+)\s*(?:'|ft)\s*(?:(\d*\.?\d+)\s*(?:"|in)?)?$/))) return +m[1] * MM_PER_FOOT + (m[2] ? +m[2] * MM_PER_INCH : 0);
  if ((m = s.match(/^(-?\d*\.?\d+)\s*(?:"|in)$/))) return +m[1] * MM_PER_INCH;
  if ((m = s.match(/^-?\d*\.?\d+$/))) return fromDisplay(+s, units);
  return null;
}
