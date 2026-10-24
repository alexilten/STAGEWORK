import { beforeAll, describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset } from '../src/core/presets';
import type { Project } from '../src/core/schema';
import { ft } from '../src/core/units';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';

const project = (mut?: (p: Project) => void) => { const p = getPreset('minimal-keynote').build(); mut?.(p); return p; };
const platforms = (s: ReturnType<typeof resolveScene>) => s.objects.filter((o) => o.system === 'decking' && o.block);

/** plan rectangle of a platform instance (rotation 0 or 90°) */
function footprint(s: ReturnType<typeof resolveScene>, o: ReturnType<typeof platforms>[number]) {
  const top = s.blocks[o.block!].parts[0] as { min: number[]; max: number[] };
  let [w, d] = [top.max[0] - top.min[0], top.max[1] - top.min[1]];
  if (Math.abs(o.rotationZ) > 0.1) [w, d] = [d, w];
  return { minX: o.position[0] - w / 2, maxX: o.position[0] + w / 2, minY: o.position[1] - d / 2, maxY: o.position[1] + d / 2, z: o.position[2] };
}
const overlaps = (a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) =>
  a.z === b.z && a.minX < b.maxX - 1 && a.maxX > b.minX + 1 && a.minY < b.maxY - 1 && a.maxY > b.minY + 1;

function noOverlaps(s: ReturnType<typeof resolveScene>) {
  const f = platforms(s).map((o) => footprint(s, o));
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) expect(overlaps(f[i], f[j])).toBe(false);
  return f;
}

describe('Stage shapes', () => {
  it('thrust: whole platforms only, tiling exactly the main deck plus the thrust', () => {
    const s = resolveScene(project((p) => { p.stage.shape = 'thrust'; p.stage.thrust = { width: ft(16), depth: ft(8) }; }));
    const f = noOverlaps(s);
    const area = f.reduce((a, r) => a + (r.maxX - r.minX) * (r.maxY - r.minY), 0);
    const st = s.report.stage;
    expect(area).toBeCloseTo(st.width.resolved * st.depth.resolved + ft(16) * ft(8), -2);
    const T = st.areas.find((a) => a.kind === 'thrust')!;
    expect([T.minX, T.maxX, T.minY, T.maxY]).toEqual([-ft(8), ft(8), -ft(8), 0]);
    expect(f.filter((r) => r.maxY <= 0.5)).toHaveLength(4); // 16′ × 8′ thrust = 2 rows of two 8′ × 4′ platforms
  });

  it('thrust: fascia wraps the thrust and is not built across the opening', () => {
    const s = resolveScene(project((p) => { p.stage.shape = 'thrust'; p.stage.thrust = { width: ft(16), depth: ft(8) }; }));
    const W = s.report.stage.width.resolved;
    const mainFront = s.objects.filter((o) => o.id.startsWith('FASCIA.MAIN.FRONT'));
    const len = mainFront.reduce((a, o) => { const b = o.parts![0] as { min: number[]; max: number[] }; return a + b.max[0] - b.min[0]; }, 0);
    expect(len).toBeCloseTo(W - ft(16), 0);
    expect(s.objects.some((o) => o.id === 'FASCIA.THRUST.FRONT')).toBe(true);
    expect(s.objects.some((o) => o.id.startsWith('FASCIA.THRUST.BACK'))).toBe(false);
  });

  it('runway: platforms run lengthwise and the B-stage sits at the end', () => {
    const s = resolveScene(project((p) => { p.stage.shape = 'runway'; p.stage.runway = { width: ft(8), length: ft(24), endWidth: ft(16), endDepth: ft(12) }; }));
    noOverlaps(s);
    const run = platforms(s).filter((o) => o.meta.area === 'Runway');
    expect(run.length).toBeGreaterThan(0);
    expect(run.every((o) => Math.abs(o.rotationZ - Math.PI / 2) < 1e-9)).toBe(true);
    const B = s.report.stage.areas.find((a) => a.kind === 'bstage')!;
    expect(B.maxY).toBeCloseTo(-ft(24), 3);
    expect(B.maxX - B.minX).toBeCloseTo(ft(16), 3);
  });

  it('rounded: a closed custom apron of the requested depth; seating starts in front of it', () => {
    const s = resolveScene(project((p) => { p.stage.shape = 'rounded'; p.stage.apron = { depth: 1500 }; }));
    const apron = s.objects.find((o) => o.id === 'APRON.CURVED')!;
    const prism = apron.parts![0] as { kind: string; points: [number, number][]; z1: number };
    expect(prism.kind).toBe('prism');
    expect(Math.min(...prism.points.map((p) => p[1]))).toBeCloseTo(-1500, 0);
    expect(prism.z1).toBe(s.report.stage.height.resolved);
    expect(s.report.seating!.frontDistance).toBeCloseTo(3050, 0);
  });

  it('seating keeps an aisle clear around a thrust and the front distance from its tip', () => {
    const s = resolveScene(project((p) => { p.stage.shape = 'thrust'; p.stage.thrust = { width: ft(16), depth: ft(12) }; }));
    const T = s.report.stage.areas.find((a) => a.kind === 'thrust')!;
    const chair = s.report.seating!.chair;
    for (const o of s.objects.filter((x) => x.system === 'seating')) {
      const [x, y] = o.position;
      const dx = Math.max(0, Math.abs(x) - (T.maxX - T.minX) / 2 - chair.width / 2);
      const dy = Math.max(0, T.minY - (y + chair.depth / 2));
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(1070 - 1);
      if (dx === 0) expect(dy).toBeGreaterThanOrEqual(3050 - 1);
    }
    expect(s.report.seating!.count).toBe(1000);
  });
});

describe('Risers', () => {
  const withRiser = (r: Partial<NonNullable<Project['stage']['risers']>[number]> = {}) =>
    resolveScene(project((p) => { p.stage.risers = [{ id: 'r1', name: 'Band riser', width: ft(16), depth: ft(8), height: ft(2), x: 0, y: ft(4), ...r }]; }));

  it('platforms sit at deck + riser height, legs stand on the deck', () => {
    const s = withRiser();
    const H = s.report.stage.height.resolved;
    const R = s.objects.filter((o) => o.group === 'riser:r1');
    const tops = R.filter((o) => o.system === 'decking');
    expect(tops).toHaveLength(4);
    expect(tops.every((o) => Math.abs(o.position[2] - (H + ft(2))) < 1e-6 && o.layer === '10_STAGE::10_02_RISERS')).toBe(true);
    const legs = R.filter((o) => o.system === 'supports');
    expect(legs.every((o) => o.position[2] === H)).toBe(true);
    expect(s.warnings.filter((w) => w.level === 'error')).toHaveLength(0);
  });

  it('flags a riser hanging off the deck and overlapping risers', () => {
    expect(withRiser({ x: 6000 }).warnings.some((w) => w.code === 'riser.outside')).toBe(true);
    const s = resolveScene(project((p) => {
      p.stage.risers = [
        { id: 'a', name: 'A', width: ft(8), depth: ft(8), height: ft(1), x: 0, y: 0 },
        { id: 'b', name: 'B', width: ft(8), depth: ft(8), height: ft(1), x: ft(4), y: 0 },
      ];
    }));
    expect(s.warnings.some((w) => w.code === 'riser.overlap')).toBe(true);
  });

  it('the presenter stands on top of a riser', () => {
    const s = withRiser({ y: 0 });
    const pres = s.objects.find((o) => o.id === 'REF.PRESENTER')!;
    expect(pres.position[2]).toBeCloseTo(s.report.stage.height.resolved + ft(2), 6);
  });
});

describe('Shapes in Rhino', () => {
  let rh: RhinoModule;
  beforeAll(async () => { rh = await rhino3dm(); });
  it('the curved apron exports as a closed solid at the right height', () => {
    const p = project((q) => { q.stage.shape = 'rounded'; q.stage.apron = { depth: 1500 }; q.seating.enabled = false; });
    const s = resolveScene(p);
    const info = inspect3dm(rh, exportRhino(rh, s, p));
    const apron = info.objects.find((o) => o.name === 'APRON.CURVED')!;
    expect(apron).toBeTruthy();
    expect(apron.bbox.min[2]).toBeCloseTo(0, 1);
    expect(apron.bbox.max[2]).toBeCloseTo(s.report.stage.height.resolved, 1);
  });
});

import { getCatalogItem, type Speaker } from '../src/core/catalog';

describe('Audio', () => {
  const withAudio = (mut?: (p: Project['audio']) => void) => resolveScene(project((p) => { p.audio = { ...p.audio, enabled: true }; mut?.(p.audio); }));
  const of = (s: ReturnType<typeof resolveScene>, g: string) => s.objects.filter((o) => o.group === g);

  it('builds two main hangs with the requested box count, descending and raked', () => {
    const s = withAudio((a) => { a.mainsPerSide = 12; a.splayPerBox = 2; a.trim = 9000; });
    const L = of(s, 'audio:main:l'), R = of(s, 'audio:main:r');
    expect(L).toHaveLength(12);
    expect(R).toHaveLength(12);
    const zs = R.map((o) => o.position[2]);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThan(zs[i - 1]); // each box lower than the one above
    expect(R[0].tilt).toBeCloseTo(0, 6);
    expect(R[11].tilt).toBeCloseTo(11 * 2 * Math.PI / 180, 6); // cumulative 2°/box
    expect(Math.max(...zs)).toBeLessThanOrEqual(9000 + 1);
  });

  it('subs, fills and wedges honour their counts and layers; wedges face upstage', () => {
    const s = withAudio((a) => { a.subs = 4; a.frontFills = 5; a.monitors = 3; });
    expect(of(s, 'audio:sub')).toHaveLength(4);
    expect(of(s, 'audio:fill')).toHaveLength(5);
    const mon = of(s, 'audio:monitor');
    expect(mon).toHaveLength(3);
    expect(mon.every((o) => o.layer === '50_AUDIO::50_04_MONITORS' && Math.abs(o.rotationZ - Math.PI) < 1e-9)).toBe(true);
    expect(s.objects.filter((o) => o.id.startsWith('SPK.SUB')).every((o) => o.layer === '50_AUDIO::50_02_SUBS')).toBe(true);
  });

  it('reports total weight from real box weights and can be switched off', () => {
    const s = withAudio((a) => { a.mainsPerSide = 10; a.subs = 4; a.frontFills = 0; a.monitors = 0; });
    const j8 = getCatalogItem<Speaker>('dbaudio.j8', 'speaker').weightKg!;
    const jsub = getCatalogItem<Speaker>('dbaudio.j-sub', 'speaker').weightKg!;
    expect(s.report.audio!.weightKg).toBeCloseTo(10 * 2 * j8 + 4 * jsub, 1);
    expect(resolveScene(project()).objects.some((o) => o.system === 'audio')).toBe(false);
  });

  it('exports speaker cabinets as tilted block instances in Rhino on the audio layers', async () => {
    const rh = await rhino3dm();
    const p = project((q) => { q.audio = { ...q.audio, enabled: true, mainsPerSide: 6, subs: 0, frontFills: 0, monitors: 0 }; });
    const s = resolveScene(p);
    const info = inspect3dm(rh, exportRhino(rh, s, p));
    const mains = info.objects.filter((o) => o.layer === '50_AUDIO::50_01_MAINS');
    expect(mains).toHaveLength(12);
    expect(mains.every((o) => o.type === 'InstanceReference')).toBe(true);
    // a raked box is wider in Y than an upright cabinet depth → the tilt made it into the file
    const low = mains.reduce((a, b) => (b.bbox.min[2] < a.bbox.min[2] ? b : a));
    expect(low.bbox.max[1] - low.bbox.min[1]).toBeGreaterThan(570);
  });
});
