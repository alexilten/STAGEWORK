import { describe, expect, it } from 'vitest';
import { resolveScene } from '../src/core/engine/scene';
import { layoutColumns } from '../src/core/engine/led';
import { pickSections } from '../src/core/engine/modular';
import { PRESETS, getPreset } from '../src/core/presets';
import { parseProject, serializeProject, type Project } from '../src/core/schema';
import { ft } from '../src/core/units';

const project = (mut?: (p: Project) => void) => { const p = getPreset('minimal-keynote').build(); mut?.(p); return p; };
const cabinets = (s: ReturnType<typeof resolveScene>, wall = 'main') => s.objects.filter((o) => o.group === `led:${wall}` && o.system === 'ledCabinets');

describe('Test 1 — LED modularity', () => {
  it('10 m × 3 m of 500 × 500 cabinets → exactly 120 cabinets, 20 × 6', () => {
    const s = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], cabinetId: 'roe.bp2v2', width: 10000, height: 3000 }; }));
    const L = s.report.led[0];
    expect([L.cols, L.rows, L.count]).toEqual([20, 6, 120]);
    expect(L.width.resolved).toBe(10000);
    expect(L.height.resolved).toBe(3000);
    expect(cabinets(s)).toHaveLength(120);
    const xs = cabinets(s).map((o) => o.position[0]);
    expect(Math.max(...xs) - Math.min(...xs) + 500).toBeCloseTo(10000, 6);
    expect(L.pixelsW).toBe(20 * 176);
  });

  it('changing width updates geometry and count', () => {
    const s = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], width: 12000, height: 3000 }; }));
    expect(s.report.led[0].count).toBe(24 * 6);
    expect(cabinets(s)).toHaveLength(144);
  });

  it('respects the selected product geometry (500 × 1000 cabinet)', () => {
    const s = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], cabinetId: 'infiled.ar10', width: 6000, height: 4000 }; }));
    const L = s.report.led[0];
    expect([L.cols, L.rows]).toEqual([12, 4]);
  });
});

describe('Test 2 — stage geometry', () => {
  it('width/depth/height drive deck count and world positions', () => {
    const s = resolveScene(project((p) => { p.stage.width = ft(40); p.stage.depth = ft(16); p.stage.height = ft(4); }));
    const st = s.report.stage;
    expect(st.width.resolved).toBeCloseTo(ft(40), 6);
    expect(st.depth.resolved).toBeCloseTo(ft(16), 6);
    expect(st.height.resolved).toBeCloseTo(ft(4), 6);
    expect(st.primaryCount).toBe(5 * 4);
    expect(st.infillCount).toBe(0);
    const decks = s.objects.filter((o) => o.system === 'decking');
    for (const d of decks) expect(d.position[2]).toBeCloseTo(ft(4), 6);
    const xs = decks.map((d) => d.position[0]);
    expect(Math.min(...xs)).toBeCloseTo(-ft(20) + ft(4), 6); // first 8′ deck centred 4′ in
    expect(Math.max(...decks.map((d) => d.position[1]))).toBeCloseTo(ft(14), 6);
    // LED sits on the stage datum: bottom = deck top + elevation
    const L = s.report.led[0];
    expect(L.origin[2]).toBeCloseTo(ft(4) + 600, 6);
    expect(L.origin[1]).toBeCloseTo(ft(16) + 300, 6);
  });

  it('odd module counts use a centred infill', () => {
    const s = resolveScene(project((p) => { p.stage.width = ft(44); }));
    expect(s.report.stage.primaryCount).toBe(5 * 4);
    expect(s.report.stage.infillCount).toBe(4);
  });
});

describe('Test 3 — modular constraints', () => {
  it('invalid LED width snaps to nearest whole cabinet and reports alternatives', () => {
    const s = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], width: 10240, height: 3000 }; }));
    const L = s.report.led[0];
    expect(L.width.exact).toBe(false);
    expect(L.width.resolved).toBe(10000);
    expect(L.width.alternatives.map((a) => a.value)).toEqual([10000, 10500]);
    expect(s.warnings.some((w) => w.code === 'led.width')).toBe(true);
    expect(cabinets(s)).toHaveLength(120); // never partial cabinets
  });

  it('stage height snaps to leg increments within system limits', () => {
    const s = resolveScene(project((p) => { p.stage.height = 1000; }));
    expect(s.report.stage.height.resolved).toBeCloseTo(ft(3, 6), 6); // 39.4″ → nearest 6″ step is 42″
    const t = resolveScene(project((p) => { p.stage.height = 99999; }));
    expect(t.report.stage.height.resolved).toBeCloseTo(ft(6), 6);
  });

  it('curve is clamped to the product limit and refused when undocumented', () => {
    const a = resolveScene(project((p) => { p.ledWalls[0].curveDeg = 25; }));
    expect(a.report.led[0].curveDeg).toBe(10);
    const b = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], cabinetId: 'absen.pl3.9-v10', curveDeg: 5 }; }));
    expect(b.report.led[0].curveDeg).toBe(0);
    expect(b.warnings.some((w) => w.code === 'led.curve.unsupported')).toBe(true);
  });

  it('detects LED / deck collision', () => {
    const s = resolveScene(project((p) => { p.ledWalls[0] = { ...p.ledWalls[0], upstageGap: -1000, elevation: -200 }; }));
    expect(s.warnings.some((w) => w.code === 'led.collision.deck')).toBe(true);
  });

  it('truss runs use real section lengths ≥ target', () => {
    expect(pickSections(13500, [3000, 2500, 2000, 1500, 1000, 710, 500, 250]).reduce((a, b) => a + b)).toBe(13500);
    const s = resolveScene(project());
    for (const t of s.report.truss) expect(t.length).toBeGreaterThanOrEqual(t.target - 0.5);
  });

  it('curved columns keep joints closed', () => {
    const cols = layoutColumns(9, 500, (3 * Math.PI) / 180);
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i], b = cols[i + 1];
      const ar = [a.x + Math.cos(a.yaw) * 250, a.y + Math.sin(a.yaw) * 250];
      const bl = [b.x - Math.cos(b.yaw) * 250, b.y - Math.sin(b.yaw) * 250];
      expect(Math.hypot(ar[0] - bl[0], ar[1] - bl[1])).toBeLessThan(1e-6);
    }
    expect(cols[0].y).toBeLessThan(0); // edges come toward the audience
  });
});

describe('Test 4 — project persistence', () => {
  it('save → open reproduces identical geometry for every preset', () => {
    for (const preset of PRESETS) {
      const p = preset.build();
      const reopened = parseProject(serializeProject(p));
      expect(reopened).toEqual(p);
      expect(JSON.stringify(resolveScene(reopened))).toBe(JSON.stringify(resolveScene(p)));
    }
  });
  it('rejects foreign files', () => {
    expect(() => parseProject('{"hello":1}')).toThrow();
  });
});

import { parseLength, formatLength } from '../src/core/units';
describe('units', () => {
  it('parses typed lengths in either system', () => {
    expect(parseLength('12.5', 'metric')).toBe(12500);
    expect(parseLength('4500mm', 'imperial')).toBe(4500);
    expect(parseLength("40'6\"", 'metric')).toBeCloseTo(ft(40, 6), 9);
    expect(parseLength('40', 'imperial')).toBeCloseTo(ft(40), 9);
    expect(parseLength('18in', 'metric')).toBeCloseTo(457.2, 9);
    expect(parseLength('abc', 'metric')).toBeNull();
  });
  it('formats ft-in exactly for imperial modules', () => {
    expect(formatLength(ft(40), 'imperial')).toBe('40′');
    expect(formatLength(ft(3, 6), 'imperial')).toBe('3′ 6″');
    expect(formatLength(12500, 'metric')).toBe('12.5 m');
  });
});

describe('LED surface management', () => {
  it('a project with no LED surfaces still resolves and exports cleanly', () => {
    const s = resolveScene(project((p) => { p.ledWalls = []; }));
    expect(s.report.led).toHaveLength(0);
    expect(s.objects.some((o) => o.system === 'ledCabinets')).toBe(false);
  });
  it('several surfaces each get their own header truss and cabinet group', () => {
    const s = resolveScene(getPreset('multi-screen').build());
    expect(s.report.led).toHaveLength(3);
    expect(s.report.truss.filter((t) => t.id.startsWith('HDR_'))).toHaveLength(3);
  });
});
