import { beforeAll, describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import { resolveScene } from '../src/core/engine/scene';
import { PRESETS } from '../src/core/presets';
import { DEFAULT_AUDIO, parseProject, serializeProject, type Project, type StageShape } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { exportGlb } from '../src/export/glb';
import { buildBom } from '../src/export/bom';

/** Seeded random projects across the full UI slider ranges: nothing may crash, go NaN or collide on ids. */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

function randomProject(r: () => number): Project {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => a + r() * (b - a);
  const p = PRESETS[Math.floor(r() * PRESETS.length)].build();
  const S = 1220;
  p.stage.width = between(S * 4, S * 40); p.stage.depth = between(S * 2, S * 16); p.stage.height = between(200, 1800);
  p.stage.shape = pick<StageShape>(['rect', 'thrust', 'runway', 'rounded', 'round', 'cross']);
  p.stage.cross = { armWidth: between(S, p.stage.width), armLength: between(S, S * 16) };
  p.stage.thrust = { width: between(S, p.stage.width), depth: between(S, S * 12) };
  p.stage.runway = { width: between(S, S * 4), length: between(S * 2, S * 30), endWidth: between(S, S * 12), endDepth: between(S, S * 8), endShape: pick(['rect', 'round'] as const) };
  p.stage.apron = { depth: between(300, Math.max(600, p.stage.width / 2)) };
  if (r() < 0.5) p.stage.risers = [{ id: 'r', name: 'Riser', width: between(S, p.stage.width), depth: between(S, p.stage.depth), height: between(200, 1200), x: between(-p.stage.width / 2, p.stage.width / 2), y: between(0, p.stage.depth - S) }];
  for (const w of p.ledWalls) { w.elevation = between(0, 4000); w.upstageGap = between(-3000, 4000); w.curveDeg = r() < 0.5 ? 0 : between(0, 5); }
  p.rigging.front = { enabled: r() < 0.8, distance: between(1000, 15000), trim: between(4000, 15000), width: between(3000, 30000) };
  p.lighting.enabled = r() < 0.9; p.lighting.count = Math.round(between(0, 30));
  p.lighting.electrics = { count: Math.round(between(0, 8)), perBatten: Math.round(between(0, 24)), trim: between(3000, 14000), firstAt: between(0, 8000), spacing: between(500, 5000) };
  p.lighting.booms = { enabled: r() < 0.5, perBoom: Math.round(between(0, 12)), height: between(1500, 7000) };
  p.seating = { ...p.seating, enabled: r() < 0.8, layout: pick(['block', 'grid', 'radial'] as const), count: 250 * Math.round(between(1, 20)),
    frontDistance: between(1500, 10000), rowPitch: between(760, 1220), seatPitch: between(510, 760), aisleWidth: between(900, 2400), seatsPerBlock: Math.round(between(6, 30)) };
  p.audio = { ...DEFAULT_AUDIO, enabled: r() < 0.7, mainsPerSide: Math.round(between(1, 24)), trim: between(3000, 16000), spread: between(2000, 20000),
    splayPerBox: between(0, 7), subs: Math.round(between(0, 24)), subMode: pick(['ground', 'flown'] as const), frontFills: Math.round(between(0, 16)), monitors: Math.round(between(0, 16)) };
  return p;
}

const finite = (v: number[]) => v.every(Number.isFinite);

describe('fuzz: random projects across the slider ranges', () => {
  let rh: RhinoModule;
  beforeAll(async () => { rh = await rhino3dm(); });
  const r = rng(20261024);
  const cases = Array.from({ length: 60 }, () => randomProject(r));

  it('resolve without NaN, duplicate ids, missing blocks or objects below the floor', () => {
    const problems: string[] = [];
    cases.forEach((p, i) => {
      const s = resolveScene(p);
      const ids = new Set<string>();
      for (const o of s.objects) {
        if (ids.has(o.id)) problems.push(`#${i} duplicate id ${o.id}`); ids.add(o.id);
        if (!finite([...o.position, o.rotationZ, o.tilt ?? 0])) problems.push(`#${i} NaN on ${o.id}`);
        if (o.block && !s.blocks[o.block]) problems.push(`#${i} missing block ${o.block}`);
        if (o.position[2] < -1) problems.push(`#${i} ${o.id} below floor`);
      }
      if (!finite([...s.bounds.min, ...s.bounds.max, ...s.houseBounds.min, ...s.houseBounds.max])) problems.push(`#${i} NaN bounds`);
    });
    expect(problems.slice(0, 20)).toEqual([]);
  }, 30000);

  it('round-trip through JSON and export to .3dm, GLB and BOM', () => {
    for (const p of cases.slice(0, 15)) {
      const q = parseProject(serializeProject(p));
      const s = resolveScene(q);
      expect(resolveScene(p).objects.length).toBe(s.objects.length);
      expect(exportRhino(rh, s, q).byteLength).toBeGreaterThan(1000);
      expect(exportGlb(s, q.name).byteLength).toBeGreaterThan(1000);
      expect(buildBom(s).length).toBeGreaterThan(0);
    }
  }, 60000);
});

