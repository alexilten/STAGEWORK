import { describe, expect, it } from 'vitest';
import { resolveScene } from '../src/core/engine/scene';
import { maxSeatsPerRow, requiredRowClear, rowLabel, SEAT_COUNT, wheelchairSpaces } from '../src/core/engine/seating';
import { getPreset } from '../src/core/presets';
import { parseProject, serializeProject, type Project, type SeatingLayout } from '../src/core/schema';

// broadcast off: camera positions remove seats ("seat kills"), tested in broadcast.test.ts
const project = (mut?: (p: Project) => void) => { const p = getPreset('minimal-keynote').build(); p.broadcast!.enabled = false; mut?.(p); return p; };
const seats = (s: ReturnType<typeof resolveScene>) => s.objects.filter((o) => o.system === 'seating');
const LAYOUTS: SeatingLayout[] = ['block', 'grid', 'radial'];

describe('Seating — code rules', () => {
  it('row clear width: 12″ up to 14 seats, +0.3″ per extra seat, capped at 22″', () => {
    expect(requiredRowClear(14)).toBeCloseTo(304.8, 1);
    expect(requiredRowClear(24)).toBeCloseTo(381, 1);
    expect(requiredRowClear(100)).toBeCloseTo(558.8, 1);
    expect(maxSeatsPerRow(300)).toBe(0);
    expect(maxSeatsPerRow(304.8)).toBe(14);
    expect(maxSeatsPerRow(375)).toBe(23);
    expect(maxSeatsPerRow(600)).toBe(100);
  });

  it('wheelchair spaces follow 2010 ADA table 221.2.1.1', () => {
    expect([25, 50, 150, 300, 500, 501, 650, 651, 1000, 5000].map(wheelchairSpaces)).toEqual([1, 2, 4, 5, 6, 7, 7, 8, 10, 36]);
  });

  it('row letters skip I and O and roll over to AA', () => {
    expect(rowLabel(0)).toBe('A');
    expect(rowLabel(7)).toBe('H');
    expect(rowLabel(8)).toBe('J');
    expect(rowLabel(23)).toBe('Z');
    expect(rowLabel(24)).toBe('AA');
  });
});

describe('Seating — layouts', () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: exact count at every 250 step from ${SEAT_COUNT.min} to ${SEAT_COUNT.max}`, () => {
      for (let n = SEAT_COUNT.min; n <= SEAT_COUNT.max; n += SEAT_COUNT.step) {
        const s = resolveScene(project((p) => { p.seating.layout = layout; p.seating.count = n; }));
        expect(seats(s)).toHaveLength(n);
        expect(s.report.seating!.count).toBe(n);
        expect(new Set(seats(s).map((o) => o.id)).size).toBe(n);
      }
    });

    it(`${layout}: rows satisfy the clear-width rule and chairs never overlap or touch the deck`, () => {
      for (const n of [250, 1000, 5000]) {
        const s = resolveScene(project((p) => { p.seating.layout = layout; p.seating.count = n; }));
        const r = s.report.seating!;
        expect(s.warnings.filter((w) => w.code === 'seating.rowclear')).toHaveLength(0);
        expect(r.longestRow).toBeLessThanOrEqual(maxSeatsPerRow(r.rowClear));
        if (layout !== 'grid') expect(r.longestRow).toBeLessThanOrEqual(14);
        const W = s.report.stage.width.resolved;
        const pts = seats(s).map((o) => o.position);
        // nothing on or right beside the deck
        for (const [x, y] of pts) expect(y < -r.chair.depth / 2 || Math.abs(x) > W / 2 + r.chair.width / 2).toBe(true);
        // spatial hash: no two chair centres closer than a chair width
        const cell = new Map<string, number[][]>();
        for (const p of pts) {
          const k = `${Math.floor(p[0] / 1000)},${Math.floor(p[1] / 1000)}`;
          (cell.get(k) ?? cell.set(k, []).get(k)!).push(p);
        }
        let minD = Infinity;
        for (const p of pts) {
          const cx = Math.floor(p[0] / 1000), cy = Math.floor(p[1] / 1000);
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
            for (const q of cell.get(`${cx + i},${cy + j}`) ?? []) if (q !== p) minD = Math.min(minD, Math.hypot(p[0] - q[0], p[1] - q[1]));
        }
        expect(minD).toBeGreaterThanOrEqual(r.chair.width);
      }
    });
  }

  it('straight layouts put the front row exactly at the requested distance and face the stage', () => {
    for (const layout of ['block', 'grid'] as const) {
      const s = resolveScene(project((p) => { p.seating.layout = layout; p.seating.frontDistance = 4000; }));
      expect(s.report.seating!.frontDistance).toBeCloseTo(4000, 3);
      expect(seats(s).every((o) => o.rotationZ === 0)).toBe(true);
    }
  });

  it('grid widens row spacing for long continental rows', () => {
    const s = resolveScene(project((p) => { p.seating.layout = 'grid'; p.seating.count = 2500; }));
    const r = s.report.seating!;
    expect(r.longestRow).toBeGreaterThan(14);
    expect(r.rowClear).toBeGreaterThanOrEqual(requiredRowClear(r.longestRow) - 0.01);
  });

  it('radial chairs turn to face the stage', () => {
    const s = resolveScene(project((p) => { p.seating.layout = 'radial'; }));
    const fy = s.report.stage.depth.resolved / 2;
    for (const o of seats(s).slice(0, 200)) {
      // facing vector (−sin θ, cos θ) points at the focus on the centreline
      const to = [0 - o.position[0], fy - o.position[1]];
      const f = [-Math.sin(o.rotationZ), Math.cos(o.rotationZ)];
      expect((to[0] * f[0] + to[1] * f[1]) / Math.hypot(to[0], to[1])).toBeGreaterThan(0.999);
    }
  });

  it('too many seats per block row is flagged', () => {
    const s = resolveScene(project((p) => { p.seating.seatsPerBlock = 30; }));
    expect(s.warnings.some((w) => w.code === 'seating.rowclear' && w.level === 'error')).toBe(true);
  });

  it('the seating layer can be switched off and old projects load with seating off', () => {
    expect(seats(resolveScene(project((p) => { p.seating.enabled = false; })))).toHaveLength(0);
    const old = JSON.parse(serializeProject(project()));
    delete old.seating;
    const p = parseProject(JSON.stringify(old));
    expect(p.seating.enabled).toBe(false);
    expect(seats(resolveScene(p))).toHaveLength(0);
  });
});
