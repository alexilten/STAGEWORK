import { beforeAll, describe, expect, it } from 'vitest';
import rhino3dm from 'rhino3dm';
import type { RhinoModule } from '../src/export/rhino';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset, PRESETS } from '../src/core/presets';
import { parseProject } from '../src/core/schema';
import { exportRhino, LAYER_TREE } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';

let rh: RhinoModule;
beforeAll(async () => { rh = await rhino3dm(); });

const build = (mut?: (p: ReturnType<ReturnType<typeof getPreset>['build']>) => void) => {
  const p = getPreset('minimal-keynote').build();
  p.ledWalls[0] = { ...p.ledWalls[0], width: 10000, height: 3000 };
  mut?.(p);
  return p;
};

describe('Test 5 — Rhino export reopens with correct structure', () => {
  it('units, layers, blocks, object counts, names, metadata', () => {
    const project = build();
    const scene = resolveScene(project);
    const bytes = exportRhino(rh, scene, project);
    const info = inspect3dm(rh, bytes);

    expect(info.units).toBe('Millimeters');
    const expectedLayers = LAYER_TREE.flatMap((l) => [l.name, ...l.children.map((c) => `${l.name}::${c}`)]);
    expect(info.layers.sort()).toEqual(expectedLayers.sort());

    // one block per used equipment type
    const usedBlocks = new Set(scene.objects.filter((o) => o.block).map((o) => o.block));
    expect(info.blocks.map((b) => b.name).sort()).toEqual([...usedBlocks].sort());

    // 120 LED cabinet instances on the cabinets layer, each named and pointing at the cabinet block
    const cabs = info.objects.filter((o) => o.layer === '20_LED::20_01_CABINETS');
    expect(cabs).toHaveLength(120);
    expect(cabs.every((c) => c.type === 'InstanceReference' && c.block === 'SC_LED_ROE_Visual_Black_Pearl_BP2_V2')).toBe(true);
    expect(new Set(cabs.map((c) => c.name)).size).toBe(120);
    expect(cabs[0].user['stagecraft.manufacturer']).toBe('ROE Visual');

    // every scene object is present exactly once (no duplicates, nothing lost)
    const sceneIds = scene.objects.flatMap((o) => (o.parts && o.parts.length > 1 ? o.parts.map((_, i) => `${o.id}.${i + 1}`) : [o.id]));
    const fileIds = info.objects.filter((o) => !o.layer.startsWith('90_TECHNICAL')).map((o) => o.name);
    expect(fileIds.sort()).toEqual(sceneIds.sort());

    // the project is embedded and re-openable
    expect(parseProject(info.strings['stagecraft.project'])).toEqual(project);
  });

  it('block geometry has the true cabinet size; deck block the true platform size', () => {
    const project = build();
    const info = inspect3dm(rh, exportRhino(rh, resolveScene(project), project));
    const cab = info.blocks.find((b) => b.name.startsWith('SC_LED_'))!;
    expect(cab.bbox.size.map((v) => +v.toFixed(3))).toEqual([500, 90, 500]);
    const deck = info.blocks.find((b) => b.name === 'SC_DECK_8ftx4ft')!;
    expect(deck.bbox.size[0]).toBeCloseTo(2438.4, 3);
    expect(deck.bbox.size[1]).toBeCloseTo(1219.2, 3);
    expect(deck.bbox.size[2]).toBeCloseTo(150, 3);
  });

  it('writes Rhino 7 files on request', () => {
    const project = build();
    const info = inspect3dm(rh, exportRhino(rh, resolveScene(project), project, { version: 7 }));
    expect(info.archiveVersion).toBe(70);
  });

  it('can export selected systems only', () => {
    const project = build();
    const info = inspect3dm(rh, exportRhino(rh, resolveScene(project), project, { systems: ['ledCabinets'], includeAnnotations: false }));
    expect(info.objects.every((o) => o.layer === '20_LED::20_01_CABINETS')).toBe(true);
    expect(info.blocks).toHaveLength(1);
  });
});

describe('Test 6 — exported geometry matches the live scene', () => {
  it.each(PRESETS.map((p) => p.id))('%s: world-space bounding boxes match the scene graph', async (id) => {
    // a fresh openNURBS module per show: stadium-size files fill the 32-bit wasm heap if read one after another
    const rh = await rhino3dm();
    const project = getPreset(id).build();
    const scene = resolveScene(project);
    const info = inspect3dm(rh, exportRhino(rh, scene, project));
    const byName = new Map(info.objects.map((o) => [o.name, o]));
    for (const o of scene.objects) {
      if (!o.block) continue;
      const f = byName.get(o.id)!;
      expect(f, o.id).toBeTruthy();
      // the instance's insertion point is exactly the scene object's position
      expect(f.insertion!.map((v) => +v.toFixed(4))).toEqual(o.position.map((v) => +v.toFixed(4)));
    }
    // overall LED wall extents
    for (const L of scene.report.led) {
      const cabs = info.objects.filter((o) => o.user['stagecraft.group'] === `led:${L.id}` && o.layer === '20_LED::20_01_CABINETS');
      expect(cabs).toHaveLength(L.count);
      if (L.surface !== 'wall') continue; // floor / ceiling / dome: placement is checked per instance above
      const minZ = Math.min(...cabs.map((c) => c.bbox.min[2])), maxZ = Math.max(...cabs.map((c) => c.bbox.max[2]));
      expect(minZ).toBeCloseTo(L.origin[2], 3);
      expect(maxZ - minZ).toBeCloseTo(L.rows * L.cabinet.height, 3);
      if (L.curveDeg === 0 && L.planar) {
        const minX = Math.min(...cabs.map((c) => c.bbox.min[0])), maxX = Math.max(...cabs.map((c) => c.bbox.max[0]));
        expect(maxX - minX).toBeCloseTo(L.cols * L.cabinet.width, 3);
      }
    }
    // stage deck top
    const decks = info.objects.filter((o) => o.layer === '10_STAGE::10_01_DECKING');
    expect(Math.max(...decks.map((d) => d.bbox.max[2]))).toBeCloseTo(scene.report.stage.height.resolved, 3);
    const main = scene.report.stage.areas.filter((a) => a.kind === 'main');
    const minX = Math.min(...decks.map((d) => d.bbox.min[0])), maxX = Math.max(...decks.map((d) => d.bbox.max[0]));
    const areaX = Math.max(...scene.report.stage.areas.map((a) => a.maxX)) - Math.min(...scene.report.stage.areas.map((a) => a.minX));
    const expected = main.length ? Math.max(scene.report.stage.width.resolved, areaX) : areaX;
    // a round deck's Rhino bounding box is the loose (control-polygon) box of its curved outline
    if (scene.report.stage.areas.some((a) => a.round)) { expect(maxX - minX).toBeGreaterThanOrEqual(expected - 1); expect(maxX - minX).toBeLessThan(expected * 1.06); }
    else expect(maxX - minX).toBeCloseTo(expected, 3);
  });
});

describe('Seating in Rhino', () => {
  it('every seat is a named chair-block instance on 70_AUDIENCE with row / seat user text', () => {
    const project = build((p) => { p.seating.layout = 'radial'; p.seating.count = 750; });
    const scene = resolveScene(project);
    const info = inspect3dm(rh, exportRhino(rh, scene, project));
    const chairs = info.objects.filter((o) => o.layer === '70_AUDIENCE::70_01_SEATING');
    expect(chairs).toHaveLength(750);
    expect(chairs.every((c) => c.type === 'InstanceReference' && c.block === 'SC_CHAIR_GENERIC_CHAIR_STACK')).toBe(true);
    expect(chairs[0].name).toBe('SEAT.A.1');
    expect(chairs[0].user['stagecraft.row']).toBe('A');
    expect(chairs[0].user['stagecraft.seat']).toBe('1');
  });
});
