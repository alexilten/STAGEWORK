import { describe, expect, it } from 'vitest';
import { resolveScene } from '../src/core/engine/scene';
import { C_VALUE } from '../src/core/engine/audience';
import { ROOFS } from '../src/core/engine/structure';
import { CATEGORIES, PRESETS, getPreset } from '../src/core/presets';
import { DEFAULT_STANDING, parseProject, serializeProject, type Project } from '../src/core/schema';
import { ft } from '../src/core/units';

const keynote = (mut?: (p: Project) => void) => { const p = getPreset('minimal-keynote').build(); mut?.(p); return p; };
const cabs = (s: ReturnType<typeof resolveScene>, id: string) => s.objects.filter((o) => o.group === `led:${id}` && o.system === 'ledCabinets');

describe('preset library', () => {
  it('21 presets in the four categories, unique ids', () => {
    expect(PRESETS).toHaveLength(21);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const c of CATEGORIES) expect(PRESETS.filter((p) => p.category === c.id).length, c.id).toBeGreaterThanOrEqual(4);
  });

  it.each(PRESETS.map((p) => p.id))('%s resolves with no warnings or errors and survives a JSON round trip', (id) => {
    const p = getPreset(id).build();
    const s = resolveScene(p);
    const bad = s.warnings.filter((w) => w.level !== 'info');
    expect(bad, bad.map((w) => w.message).join('\n')).toHaveLength(0);
    for (const o of s.objects) {
      for (const v of o.position) expect(Number.isFinite(v), o.id).toBe(true);
      expect(o.position[2], `${o.id} below the floor`).toBeGreaterThan(-1);
    }
    expect(new Set(s.objects.map((o) => o.id)).size).toBe(s.objects.length);
    const again = resolveScene(parseProject(serializeProject(p)));
    expect(again.objects.length).toBe(s.objects.length);
  });
});

describe('LED: arcs, rings, floors and ceilings', () => {
  it('a radius bends the wall to that radius', () => {
    const s = resolveScene(keynote((p) => { p.ledWalls[0] = { ...p.ledWalls[0], width: 12000, radius: 10000 }; }));
    const L = s.report.led[0];
    expect(L.arc).toBeTruthy();
    expect(L.arc!.radius).toBeCloseTo(10000, -1);
    expect(L.planar).toBe(true); // a shallow arc still faces the audience
    // every column sits on the circle
    for (const c of cabs(s, L.id)) expect(Math.hypot(c.position[0] - L.arc!.center[0], c.position[1] - L.arc!.center[1])).toBeGreaterThan(9800);
  });

  it('a full ring closes at 360° and never wraps past it', () => {
    const s = resolveScene(getPreset('ring-360').build());
    const L = s.report.led[0];
    expect(L.arc!.wrapDeg).toBeGreaterThan(350);
    expect(L.arc!.wrapDeg).toBeLessThanOrEqual(360);
    expect(L.planar).toBe(false);
  });

  it('an LED floor lies flat at deck height, needs a floor-rated tile', () => {
    const s = resolveScene(getPreset('dj-monolith').build());
    const F = s.report.led.find((l) => l.surface === 'floor')!;
    expect(F).toBeTruthy();
    expect(F.cabinet.id).toBe('roe.bm4-matte');
    const tiles = cabs(s, F.id);
    expect(new Set(tiles.map((t) => t.position[2].toFixed(3))).size).toBe(1);
    expect(tiles.every((t) => t.tilt === -Math.PI / 2)).toBe(true);
    const err = resolveScene(keynote((p) => { p.ledWalls[0] = { ...p.ledWalls[0], surface: 'floor' }; })).warnings;
    expect(err.some((w) => w.code === 'led.floor.rating' && w.level === 'error')).toBe(true);
  });

  it('floor and ceiling surfaces get no header truss', () => {
    const s = resolveScene(getPreset('led-volume').build());
    expect(s.report.truss.some((t) => t.id === 'HDR_CEILING')).toBe(false);
    expect(s.report.led.find((l) => l.id === 'ceiling')!.surface).toBe('ceiling');
  });
});

describe('stage shapes for centre stages', () => {
  it('round: one custom circular deck of diameter = width', () => {
    const s = resolveScene(keynote((p) => { p.stage = { ...p.stage, shape: 'round', width: ft(24), depth: ft(24) }; }));
    const main = s.report.stage.areas.find((a) => a.kind === 'main')!;
    expect(main.round!.r).toBeCloseTo(ft(12), 3);
  });

  it('cross: a centre square and four arms', () => {
    const s = resolveScene(getPreset('in-the-round').build());
    const xs = s.report.stage.areas.map((a) => [a.minX, a.maxX]).flat(), ys = s.report.stage.areas.map((a) => [a.minY, a.maxY]).flat();
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(s.report.stage.width.resolved);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(s.report.stage.depth.resolved);
  });

  it('runway with a round B-stage', () => {
    const s = resolveScene(getPreset('catwalk-b-stage').build());
    expect(s.report.stage.areas.find((a) => a.kind === 'bstage')!.round).toBeTruthy();
  });
});

describe('audience: GA floor, barricade and stands', () => {
  it('GA capacity = area × density, drawn no denser than the figure limit', () => {
    const s = resolveScene(keynote((p) => { p.seating.enabled = false; p.audience!.standing = { ...DEFAULT_STANDING, enabled: true, width: 20000, depth: 20000, density: 2 }; }));
    const g = s.report.audience!.standing!;
    expect(g.capacity).toBe(Math.floor((g.areaM2 * 2) / 10) * 10);
    expect(g.areaM2).toBeGreaterThan(350);
    expect(g.areaM2).toBeLessThanOrEqual(400);
    expect(g.figures).toBeLessThan(g.capacity); // drawn lighter than planned, for clarity
    expect(g.barricadeM).toBeGreaterThan(0);
  });

  it('a steeper rake raises the C-value', () => {
    const run = (rise: number) => resolveScene(keynote((p) => { p.seating.enabled = false; p.audience!.stands = [{ id: 's', name: 'S', kind: 'straight', x: 0, y: -15000, width: 15000, yawDeg: 0, cx: 0, cy: 0, r0: 0, a0: 0, a1: 0, rows: 12, rowRise: rise, rowPitch: 850, base: 0 }]; })).report.audience!.stands[0];
    const flat = run(150), steep = run(400);
    expect(steep.minC!).toBeGreaterThan(flat.minC!);
    expect(steep.seats).toBeGreaterThan(0);
  });

  it('every preset stand meets the C-value minimum', () => {
    for (const pr of PRESETS) for (const st of resolveScene(pr.build()).report.audience?.stands ?? []) if (st.minC != null) expect(st.minC, `${pr.id}/${st.id}`).toBeGreaterThanOrEqual(C_VALUE.min);
  });
});

describe('structure: roofs, grids, delays, free truss', () => {
  it('the roof snaps to a published Stageco span', () => {
    const p = getPreset('stadium-roof').build();
    p.structure!.roof.span = 31000;
    const r = resolveScene(p).report.structure!.roof!;
    expect(ROOFS[p.structure!.roof.system].spans).toContain(r.span);
  });

  it('delay towers report the sound delay at 343 m/s', () => {
    const p = getPreset('stadium-roof').build();
    const d = resolveScene(p).report.structure!.delays!;
    expect(d.count).toBe(p.structure!.delays.count);
    expect(d.delayMs).toBeGreaterThan(0);
  });

  it('free truss members are built from real section lengths', () => {
    const s = resolveScene(getPreset('edm-geometric').build());
    expect(s.report.structure!.freeTruss.count).toBeGreaterThan(0);
    expect(s.objects.some((o) => o.layer === '30_RIGGING::30_05_GRID' || o.system === 'rigging')).toBe(true);
  });
});

describe('audio and show elements', () => {
  it('quad PA: four positions round a centre stage', () => {
    const s = resolveScene(getPreset('town-hall-round').build());
    const a = s.report.audio!;
    expect(a.layout).toBe('quad');
    expect(a.hangs).toBe(4);
    const tops = s.objects.filter((o) => o.id.endsWith('.01') && o.id.startsWith('SPK.MAIN.'));
    expect(new Set(tops.map((o) => Math.sign(o.position[0]) + ',' + Math.sign(o.position[1] - ft(14)))).size).toBe(4);
  });

  it('DJ booth: one CDJ block per player', () => {
    const s = resolveScene(getPreset('dj-monolith').build());
    expect(s.report.show!.booth!.decks).toBeGreaterThan(0);
    expect(s.objects.filter((o) => o.group.startsWith('show:booth') && /CDJ/i.test(o.block ?? '')).length).toBe(s.report.show!.booth!.decks);
  });

  it('LED dome: an opening removes tiles', () => {
    const p = getPreset('led-dome').build();
    const open = resolveScene(p).report.show!.dome!;
    p.show!.dome.openingDeg = 0;
    const closed = resolveScene(p).report.show!.dome!;
    expect(closed.tiles).toBeGreaterThan(open.tiles);
    expect(closed.areaM2).toBeGreaterThan(0);
  });
});
