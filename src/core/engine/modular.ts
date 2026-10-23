import type { Mm } from '../units';
import type { Resolved1D } from './types';

const EPS = 0.5; // mm — anything closer than this is considered exact

/** Resolve a requested length to a whole number of modules (≥ min). */
export function resolveModules(requested: Mm, module: Mm, min = 1, max = Infinity): Resolved1D {
  const raw = requested / module;
  const n = clamp(Math.round(raw), min, max);
  const resolved = n * module;
  const exact = Math.abs(resolved - requested) < EPS;
  const lo = clamp(Math.floor(raw + 1e-9), min, max);
  const hi = clamp(Math.ceil(raw - 1e-9), min, max);
  const alternatives = exact ? [] : uniq([lo, hi]).map((k) => ({ label: `${k} × module`, value: k * module }));
  return { requested, resolved, modules: n, exact, alternatives };
}

/** Snap a value onto base + k·step within [min,max]. */
export function snapStep(requested: Mm, base: Mm, step: Mm, min: Mm, max: Mm): Resolved1D {
  const k = Math.round((requested - base) / step);
  const resolved = clamp(base + k * step, min, max);
  const exact = Math.abs(resolved - requested) < EPS;
  const lo = clamp(base + Math.floor((requested - base) / step + 1e-9) * step, min, max);
  const hi = clamp(base + Math.ceil((requested - base) / step - 1e-9) * step, min, max);
  return {
    requested, resolved, modules: k, exact,
    alternatives: exact ? [] : uniq([lo, hi]).map((v) => ({ label: 'step', value: v })),
  };
}

/**
 * Pick truss sections whose total is the smallest length ≥ target (fewest pieces on ties).
 * Unbounded knapsack over a 10 mm grid; lengths are assumed to be multiples of 10 mm.
 */
export function pickSections(target: Mm, lengths: Mm[]): Mm[] {
  const g = 10;
  const units = lengths.map((l) => Math.round(l / g));
  const maxU = Math.ceil(target / g) + Math.max(...units);
  const count = new Array<number>(maxU + 1).fill(Infinity);
  const from = new Array<number>(maxU + 1).fill(-1);
  count[0] = 0;
  for (let s = 1; s <= maxU; s++) {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u <= s && count[s - u] + 1 < count[s]) { count[s] = count[s - u] + 1; from[s] = i; }
    }
  }
  const t = Math.ceil(target / g - 1e-9);
  for (let s = t; s <= maxU; s++) {
    if (count[s] < Infinity) {
      const out: Mm[] = [];
      for (let c = s; c > 0; c -= units[from[c]]) out.push(lengths[from[c]]);
      return out.sort((a, b) => b - a);
    }
  }
  return [];
}

/** Arrange pieces symmetrically: longest in the middle, alternating outward. */
export function symmetricOrder<T>(sortedDesc: T[]): T[] {
  const out: T[] = [];
  sortedDesc.forEach((p, i) => (i % 2 === 0 ? out.push(p) : out.unshift(p)));
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const uniq = <T,>(a: T[]) => [...new Set(a)];
