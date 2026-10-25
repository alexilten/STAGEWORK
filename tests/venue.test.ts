import { describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import { resolveScene } from '../src/core/engine/scene';
import { bays, VENUE_ORDER, VENUE_SPECS, venueFit } from '../src/core/engine/venue';
import { getPreset } from '../src/core/presets';
import { DEFAULT_VENUE, parseProject, serializeProject, type Project, type VenueArchetype } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';
import { exportDxf } from '../src/export/dxf';
import { exportFbx } from '../src/export/fbx';
import { exportStep } from '../src/export/step';
import { exportObjects } from '../src/export/xform';

const FT = 304.8;
const withVenue = (a: VenueArchetype, w?: number, d?: number, extra: Partial<Project['venue']> = {}) => {
  const p = getPreset('minimal-keynote').build();
  const [ew, ed] = VENUE_SPECS[a].example;
  p.venue = { ...structuredClone(DEFAULT_VENUE), enabled: true, archetype: a, width: w ?? ew, depth: d ?? ed, ...extra };
  return { p, s: resolveScene(p) };
};

describe('Venue shells', () => {
  it('is off by default and old project files open without one', () => {
    const p = getPreset('minimal-keynote').build();
    expect(p.venue?.enabled).toBe(false);
    expect(resolveScene(p).objects.some((o) => o.system === 'venue')).toBe(false);
    const old = JSON.parse(serializeProject(p)); delete old.venue;
    expect(parseProject(JSON.stringify(old)).venue).toEqual(DEFAULT_VENUE);
  });

  for (const a of VENUE_ORDER) {
    it(`${a}: builds at its example footprint around the show, on 05_VENUE`, () => {
      const { p, s } = withVenue(a);
      const r = s.report.venue!;
      expect(r.built).toBe(true);
      const v = s.objects.filter((o) => o.system === 'venue');
      expect(v.length).toBeGreaterThan(5);
      for (const o of v) expect(o.layer.startsWith('05_VENUE::')).toBe(true);
      expect(v.filter((o) => o.id.startsWith('VENUE.WALL.'))).toHaveLength(4);
      // footprint = interior box, stage wall behind the show
      expect(r.box.x1 - r.box.x0).toBeCloseTo(p.venue!.width, 3);
      expect(r.box.y1 - r.box.y0).toBeCloseTo(p.venue!.depth, 3);
      expect(r.box.y1).toBeGreaterThanOrEqual(s.bounds.max[1] + p.venue!.upstage - 1);
      // the house view frames the whole building
      expect(s.houseBounds.min[1]).toBeLessThanOrEqual(r.box.y0);
      expect(new Set(s.objects.map((o) => o.id)).size).toBe(s.objects.length);
    });
  }

  it('repeats a module: column bays stretch so they land on the walls', () => {
    expect(bays(300 * FT, 90 * FT)).toEqual({ n: 3, b: 100 * FT });
    for (const [w, d, nx, ny] of [[180, 240, 2, 3], [300, 420, 3, 5], [450, 600, 5, 7]]) {
      const r = withVenue('convention', w * FT, d * FT).s.report.venue!;
      expect([r.bays!.nx, r.bays!.ny]).toEqual([nx, ny]);
      expect(r.columns).toHaveLength((nx + 1) * (ny + 1));
      expect(r.rigPoints).toBeGreaterThan(0);
    }
  });

  it('blocks an oversized footprint, suggests types that fit, and builds on override', () => {
    const f = venueFit('black-box', 1000 * FT, 1000 * FT);
    expect(f.ok).toBe(false);
    expect(f.issue).toBe('big');
    expect(f.suggest).toEqual(['warehouse', 'convention']);
    const blocked = withVenue('black-box', 1000 * FT, 1000 * FT).s;
    expect(blocked.report.venue!.built).toBe(false);
    expect(blocked.objects.some((o) => o.system === 'venue')).toBe(false);
    expect(blocked.warnings.some((w) => w.code === 'venue.fit' && w.level === 'error')).toBe(true);
    const forced = withVenue('black-box', 160 * FT, 160 * FT, { override: true }).s;
    expect(forced.report.venue!.built).toBe(true);
    expect(forced.warnings.some((w) => w.code === 'venue.fit.override')).toBe(true);
    expect(venueFit('ballroom', 250 * FT, 300 * FT).issue).toBe('big'); // short side cap
    expect(venueFit('convention', 80 * FT, 100 * FT).suggest[0]).toBe('black-box');
  });

  it('flags a rig taller than the room, columns in the stage, and clears seats around columns', () => {
    expect(withVenue('ballroom', 70 * FT, 90 * FT, { clearHeight: 4000 }).s.warnings.some((w) => w.code === 'venue.clear')).toBe(true);
    expect(withVenue('convention').s.warnings.some((w) => w.code === 'venue.clear')).toBe(false);
    // 120 ft warehouse: two 60 ft bays put a column line on the centreline
    const house = withVenue('warehouse', 120 * FT, 200 * FT).s;
    expect(house.report.seating!.seatKills).toBeGreaterThan(0);
    expect(house.warnings.some((w) => w.code === 'venue.column.seats')).toBe(true);
    const onStage = withVenue('warehouse', 120 * FT, 200 * FT, { upstage: 12000 }).s;
    expect(onStage.warnings.some((w) => w.code === 'venue.column.stage')).toBe(true);
    expect(house.warnings.some((w) => w.code === 'venue.roof.unrated')).toBe(true);
  });

  it('exports with the show in every format, and drops out when unticked', async () => {
    const { p, s } = withVenue('convention', 200 * FT, 300 * FT);
    const rh = (await rhino3dm()) as RhinoModule;
    const info = inspect3dm(rh, exportRhino(rh, s, p));
    expect(info.layers).toContain('05_VENUE::05_02_STRUCTURE');
    const venueObjs = info.objects.filter((o) => o.layer.startsWith('05_VENUE'));
    expect(venueObjs.length).toBeGreaterThan(s.objects.filter((o) => o.system === 'venue').length - 1);
    const rp = info.objects.find((o) => o.name.startsWith('VENUE.RP.'))!;
    expect(rp.user['stagecraft.ratingLb']).toBe('2000');
    const all = ['decking', 'supports', 'finishes', 'ledCabinets', 'ledSupports', 'rigging', 'structure', 'lighting', 'audio', 'scenic', 'seating', 'broadcast', 'dimensions', 'reference'] as const;
    const without = inspect3dm(rh, exportRhino(rh, s, p, { systems: [...all] }));
    expect(without.objects.some((o) => o.layer.startsWith('05_VENUE'))).toBe(false);

    const n = exportObjects(s).filter((o) => o.system === 'venue').length;
    expect([...exportFbx(s, p.name).matchAll(/"Model::VENUE\.[^"]+", "Mesh"/g)]).toHaveLength(n);
    expect(exportDxf(s, p.name)).toContain('05_VENUE$05_02_STRUCTURE');
    expect(exportStep(s, p.name)).toContain('VENUE.WALL.STAGE');
    expect(exportFbx(s, p.name, { systems: [...all] })).not.toContain('Model::VENUE.');
  });
});
