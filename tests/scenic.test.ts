import { beforeAll, describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import { mainWall } from '../src/core/engine/media';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset } from '../src/core/presets';
import { parseProject, serializeProject } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';

const box = (o: { parts?: { kind: string; min?: number[]; max?: number[] }[] }) => o.parts![0] as { min: number[]; max: number[] };

describe('Scenic', () => {
  it('portal frames the main screen with an even margin, downstage of it, standing on the deck', () => {
    const p = getPreset('conversation').build();
    const s = resolveScene(p);
    const M = mainWall(s.report.led);
    const H = s.report.stage.height.resolved;
    const legL = box(s.objects.find((o) => o.id === 'SCN.PORTAL.LEG.L')!), legR = box(s.objects.find((o) => o.id === 'SCN.PORTAL.LEG.R')!);
    const head = box(s.objects.find((o) => o.id === 'SCN.PORTAL.HEADER')!);
    const m = p.scenic!.portal.margin;
    expect(legL.max[0]).toBeCloseTo(M.origin[0] - M.chord / 2 - m, 6);
    expect(legR.min[0]).toBeCloseTo(M.origin[0] + M.chord / 2 + m, 6);
    expect(head.min[2]).toBeCloseTo(M.top + m, 6);
    expect(legL.min[2]).toBeCloseTo(H, 6); // on the deck
    expect(legL.max[1]).toBeLessThan(M.origin[1] - M.sagitta); // in front of the screen
    expect(s.report.scenic!.portal!.opening.width).toBeCloseTo(M.chord + 2 * m, 6);
  });

  it('warns when a portal leg straddles the deck edge', () => {
    const p = getPreset('conversation').build(); p.scenic!.portal.legWidth = 1500;
    expect(resolveScene(p).warnings.some((w) => w.code === 'scenic.portal.edge')).toBe(true);
    expect(resolveScene(getPreset('conversation').build()).warnings.some((w) => w.code.startsWith('scenic.portal'))).toBe(false);
  });

  it('re-sizes with the screen', () => {
    const a = resolveScene(getPreset('conversation').build()).report.scenic!.portal!.opening.width;
    const p = getPreset('conversation').build(); p.ledWalls[0].width += 2000;
    expect(resolveScene(p).report.scenic!.portal!.opening.width).toBeGreaterThan(a + 1500);
  });

  it('masking legs come in mirrored pairs overlapping the deck edge; drape sits behind every screen', () => {
    const s = resolveScene(getPreset('product-launch').build());
    const W = s.report.stage.width.resolved;
    const legs = s.objects.filter((o) => o.group === 'scenic:masking');
    expect(legs).toHaveLength(4);
    for (const o of legs) { const b = box(o); expect(b.min[0] < W / 2 && b.max[0] > -W / 2).toBe(true); expect(Math.abs(b.min[0]) < W / 2 || Math.abs(b.max[0]) < W / 2).toBe(true); }
    const drape = box(s.objects.find((o) => o.id === 'SCN.DRAPE.US')!);
    for (const L of s.report.led) { expect(drape.min[1]).toBeGreaterThan(L.origin[1] + L.cabinet.depth); expect(drape.max[2]).toBeGreaterThan(L.top); }
  });

  it('old projects load with scenic off', () => {
    const old = JSON.parse(serializeProject(getPreset('minimal-keynote').build())); delete old.scenic;
    const p = parseProject(JSON.stringify(old));
    expect(p.scenic!.portal.enabled).toBe(false);
    expect(resolveScene(p).objects.some((o) => o.system === 'scenic')).toBe(false);
  });

  describe('in Rhino', () => {
    let rh: RhinoModule;
    beforeAll(async () => { rh = await rhino3dm(); });
    it('exports to the 60_SCENIC sub-layers', () => {
      const p = getPreset('product-launch').build(); p.scenic!.portal.enabled = true;
      const s = resolveScene(p);
      const info = inspect3dm(rh, exportRhino(rh, s, p));
      const layers = new Set(info.objects.map((o: any) => o.layer));
      for (const l of ['60_SCENIC::60_01_PORTAL', '60_SCENIC::60_02_MASKING', '60_SCENIC::60_03_DRAPES']) expect(layers.has(l), l).toBe(true);
    });
  });
});
