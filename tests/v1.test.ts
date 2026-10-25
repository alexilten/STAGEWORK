import { beforeAll, describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import { FIXTURES, HOISTS } from '../src/core/catalog';
import { snapAndLoad } from '../src/core/engine/rigload';
import { resolveScene } from '../src/core/engine/scene';
import type { SceneObject } from '../src/core/engine/types';
import { VENUE_SPECS } from '../src/core/engine/venue';
import { getPreset, PRESETS } from '../src/core/presets';
import { DEFAULT_VENUE, type VenueArchetype } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';

let rh: RhinoModule;
beforeAll(async () => { rh = await rhino3dm(); });

const hoist = HOISTS[0];
const inVenue = (preset: string, a: VenueArchetype) => {
  const p = getPreset(preset).build();
  const [w, d] = VENUE_SPECS[a].example;
  p.venue = { ...structuredClone(DEFAULT_VENUE), enabled: true, archetype: a, width: w, depth: d };
  return { p, s: resolveScene(p) };
};

/** a straight run along X at y, hoists at the given offsets from its middle */
const run = (id: string, y: number, length: number, at: number[]): SceneObject[] => at.map((t, i) => ({
  id: `${id}.H${i + 1}`, label: 'hoist', layer: '30_RIGGING::30_02_HOISTS', system: 'rigging', group: id, block: 'SC_HOIST',
  position: [t, y, 7000], rotationZ: 0, meta: { run: id, along: t, runLength: length, maxSpacing: 6000 },
}));
const point = (i: number, x: number, y: number, ratingKg = 454): SceneObject => ({
  id: `VENUE.RP.${i}`, label: 'point', layer: '05_VENUE::05_03_RIGGING', system: 'venue', group: 'venue', block: 'SC_VENUE_RIG_POINT',
  position: [x, y, 12000], rotationZ: 0, meta: { ratingKg },
});

describe('Hoists on venue rigging points', () => {
  it('slides each hoist along its truss to the nearest rated point and drops a chain to it', () => {
    const objs = [...run('T1', 0, 12000, [-5000, 0, 5000]), point(1, -4600, 300), point(2, 400, -200), point(3, 5300, 0), point(4, 0, 4000)];
    const r = snapAndLoad(objs, hoist, [], { snap: true });
    expect(r.report.snapped).toBe(3);
    expect(r.report.unsnapped).toBe(0);
    const hs = objs.filter((o) => o.meta.run === 'T1');
    expect(hs.map((h) => h.meta.rigPoint)).toEqual(['VENUE.RP.1', 'VENUE.RP.2', 'VENUE.RP.3']);
    // the hoist stays on the truss line; only its position along the run changes
    expect(hs.map((h) => h.position[0])).toEqual([-4600, 400, 5300]);
    expect(hs.every((h) => h.position[1] === 0)).toBe(true);
    // 300 mm off the line needs a bridle; 200 mm too; plumb on the line does not
    expect(r.report.bridled).toBe(2);
    expect(r.objects.filter((o) => o.id.endsWith('.CHAIN'))).toHaveLength(3);
  });

  it('leaves hoists with no point within 1 m of the truss line where they were, and says so', () => {
    const objs = [...run('T1', 0, 12000, [-5000, 5000]), point(1, -5000, 2500)];
    const r = snapAndLoad(objs, hoist, [], { snap: true });
    expect(r.report.snapped).toBe(0);
    expect(r.report.unsnapped).toBe(2);
    expect(r.warnings.map((w) => w.code)).toContain('rig.unsnapped');
  });

  it('splits the hung load by the lever rule and flags points over their rating', () => {
    // 20 kg fixtures every metre on a 10 m run with two end hoists on 113 kg (250 lb) points
    const objs: SceneObject[] = [...run('T1', 0, 10400, [-5000, 5000]), point(1, -5000, 0, 113), point(2, 5000, 0, 113)];
    for (let x = -4500; x <= 4500; x += 1000) objs.push({
      id: `FX.${x}`, label: 'fixture', layer: '40_LIGHTING::40_01_FIXTURES', system: 'lighting', group: 'fx', position: [x, 0, 6600], rotationZ: 0, meta: { weightKg: 20 },
    });
    const r = snapAndLoad(objs, hoist, [], { snap: true });
    // 200 kg of fixtures, symmetric: 100 kg a hoist before the motor and the truss
    const hs = objs.filter((o) => o.meta.run === 'T1');
    expect(hs.map((h) => h.meta.loadKg)).toEqual([100, 100]);
    expect(r.report.over).toBe(2);
    expect(r.report.maxPointKg).toBeGreaterThan(113);
    expect(r.warnings.find((w) => w.code === 'rig.point.over')?.level).toBe('error');
    // the over-loaded points turn red in the model
    expect(objs.filter((o) => o.block === 'SC_VENUE_RIG_POINT_OVER')).toHaveLength(2);
    expect(r.blocks.map((b) => b.key)).toContain('SC_VENUE_RIG_POINT_OVER');
  });

  it('does nothing without snapping: hoists keep their spacing and points stay plain', () => {
    const objs = [...run('T1', 0, 12000, [-5000, 0, 5000]), point(1, -4600, 0)];
    const r = snapAndLoad(objs, hoist, [], { snap: false });
    expect(r.report.snapped).toBe(0);
    expect(objs.find((o) => o.id === 'VENUE.RP.1')!.block).toBe('SC_VENUE_RIG_POINT');
  });

  it('snaps an arena end stage onto a proscenium gridiron and reports every used point', () => {
    const { s } = inVenue('arena-end-stage', 'proscenium');
    const r = s.report.rigLoad;
    expect(r.snapped).toBeGreaterThan(20);
    expect(r.points).toHaveLength(r.snapped);
    expect(r.ratingKg).toBe(454);
    for (const p of r.points) expect(s.objects.find((o) => o.id === p.id)!.meta.hoist).toBe(p.hoist);
    expect(s.objects.some((o) => o.block === 'SC_VENUE_RIG_POINT_LOADED')).toBe(true);
  });

  it('can be switched off, and never snaps under a ground-supported roof', () => {
    const { p } = inVenue('arena-end-stage', 'proscenium');
    p.rigging.snapToVenue = false;
    expect(resolveScene(p).report.rigLoad.snapped).toBe(0);
    expect(resolveScene(getPreset('stadium-roof').build()).report.rigLoad.snapped).toBe(0);
  });

  it('sizes every LED header with enough hoists for the wall it carries', () => {
    for (const pr of PRESETS) {
      const s = resolveScene(pr.build());
      expect(s.report.rigLoad.maxHoistKg, pr.id).toBeLessThanOrEqual(hoist.capacityKg);
      expect(s.warnings.map((w) => w.code), pr.id).not.toContain('rig.hoist.over');
    }
  });
});

describe('Claypaky fixtures', () => {
  for (const id of ['claypaky.ultimo-sharpy', 'claypaky.xtylos-aqua']) it(`${id}: manufacturer-verified dimensions, weight and power`, () => {
    const f = FIXTURES.find((x) => x.id === id)!;
    expect(f.manufacturer).toBe('Claypaky');
    expect(f.verification).toBe('manufacturer');
    expect(f.sources.every((s) => s.url?.includes('claypaky.it'))).toBe(true);
    expect(f.weightKg).toBeGreaterThan(15);
  });
});

describe('People', () => {
  it('marks the presenter, crowd, crew and DJ as figures', () => {
    expect(resolveScene(getPreset('minimal-keynote').build()).objects.find((o) => o.id === 'REF.PRESENTER')?.figure).toBe('presenter');
    const s = resolveScene(getPreset('edm-mainstage').build());
    const crowd = s.objects.filter((o) => o.figure === 'crowd');
    expect(crowd.length).toBeGreaterThan(500);
    expect(resolveScene(getPreset('dj-monolith').build()).objects.some((o) => o.figure === 'dj')).toBe(true);
  });

  it('turns every standing figure to face the stage (figures face −Y in their own frame)', () => {
    const s = resolveScene(getPreset('edm-mainstage').build());
    for (const o of s.objects.filter((x) => x.figure === 'crowd').slice(0, 200)) {
      // facing direction of −Y rotated by rotationZ points back toward the stage (+Y)
      const fy = -Math.cos(o.rotationZ);
      expect(fy).toBeGreaterThan(-0.05);
    }
  });

  it('keeps the light two-cylinder proxies in the Rhino file: one person block, many instances', () => {
    const project = getPreset('edm-mainstage').build();
    const scene = resolveScene(project);
    const info = inspect3dm(rh, exportRhino(rh, scene, project));
    const people = info.objects.filter((o) => o.block === 'SC_PERSON_STANDING');
    expect(people.length).toBe(scene.objects.filter((o) => o.figure === 'crowd').length);
    const def = info.blocks.find((b) => b.name === 'SC_PERSON_STANDING')!;
    expect(def).toBeDefined();
    expect(def.parts).toBeLessThanOrEqual(3);
  });
});
