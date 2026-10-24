import { describe, expect, it } from 'vitest';
import { CATALOG, FIXTURES, LED_CABINETS, getCatalogItem, type Fixture } from '../src/core/catalog';
import { fixtureParts } from '../src/core/engine/rigging';
import { resolveScene } from '../src/core/engine/scene';
import { PRESETS, getPreset } from '../src/core/presets';

describe('Catalogue', () => {
  it('ids are unique and every real (non-generic) entry cites a source with a URL', () => {
    const ids = CATALOG.map((c) => `${c.category}:${c.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATALOG.filter((x) => x.verification !== 'generic')) expect(c.sources.some((s) => s.url), c.id).toBe(true);
  });

  it('LED pixel counts agree with cabinet size and pitch', () => {
    for (const c of LED_CABINETS) {
      expect(Math.abs(c.pixelsW * c.pixelPitch - c.width), c.id).toBeLessThan(c.pixelPitch * 1.5);
      expect(Math.abs(c.pixelsH * c.pixelPitch - c.height), c.id).toBeLessThan(c.pixelPitch * 1.5);
    }
  });

  it('fixture envelopes stay inside the published size for every body form', () => {
    for (const f of FIXTURES) {
      const parts = fixtureParts(f);
      let x = 0, y = 0, z = 0;
      for (const p of parts) {
        if (p.kind === 'box') { x = Math.max(x, Math.abs(p.min[0]), Math.abs(p.max[0])); y = Math.max(y, Math.abs(p.min[1]), Math.abs(p.max[1])); z = Math.max(z, Math.abs(p.min[2]), Math.abs(p.max[2])); }
        if (p.kind === 'cyl') for (const q of [p.from, p.to]) { x = Math.max(x, Math.abs(q[0]) + (q[0] === 0 ? p.r : 0)); z = Math.max(z, Math.abs(q[2])); }
      }
      expect(2 * x, f.id).toBeLessThanOrEqual(f.width + 1);
      expect(z, f.id).toBeLessThanOrEqual(f.height + 1);
    }
  });

  it('each lighting position can hang its own fixture', () => {
    const s = resolveScene(getPreset('product-launch').build());
    const ids = (pre: string) => new Set(s.objects.filter((o) => o.id.startsWith(pre)).map((o) => o.meta.catalogId));
    expect([...ids('FIX.FOH')]).toEqual(['martin.mac-aura-xb']);
    expect([...ids('FIX.ELX')]).toEqual(['robe.megapointe']);
    expect([...ids('FIX.BOOM')]).toEqual(['chauvet.maverick-storm-1-wash']);
  });

  it('bar fixtures never overlap along a batten', () => {
    const p = getPreset('minimal-keynote').build();
    p.lighting.electrics = { ...p.lighting.electrics, fixtureId: 'glp.impression-x4-bar-20', perBatten: 24 };
    const s = resolveScene(p);
    const bar = getCatalogItem<Fixture>('glp.impression-x4-bar-20', 'fixture');
    const xs = s.objects.filter((o) => o.group === 'elx:1' && o.id.startsWith('FIX')).map((o) => o.position[0]).sort((a, b) => a - b);
    expect(xs.length).toBeLessThan(24);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(bar.width);
    expect(s.warnings.some((w) => w.code === 'light.elx.full')).toBe(true);
  });

  it('every preset still resolves with its fixtures', () => {
    for (const pr of PRESETS) expect(resolveScene(pr.build()).objects.length, pr.id).toBeGreaterThan(0);
  });
});
