import { describe, expect, it } from 'vitest';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset } from '../src/core/presets';
import { exportFbx } from '../src/export/fbx';
import { dxfLayer, dxfName, exportDxf } from '../src/export/dxf';
import { exportStep } from '../src/export/step';
import { exportObjects } from '../src/export/xform';

const scene = () => {
  const p = getPreset('minimal-keynote').build();
  p.broadcast!.jib.enabled = true; p.broadcast!.ptz = { count: 2, mount: 'truss' };
  return { p, s: resolveScene(p) };
};

describe('FBX export', () => {
  it('one named model per component under its layer, shared geometry per block, mm Z-up', () => {
    const { p, s } = scene();
    const fbx = exportFbx(s, p.name);
    const objs = exportObjects(s);
    expect(fbx.startsWith('; FBX 7.4.0 project file')).toBe(true);
    expect(fbx).toContain('P: "UnitScaleFactor", "double", "Number", "",0.1');
    expect(fbx).toContain('P: "UpAxis", "int", "Integer", "",2');
    const meshModels = [...fbx.matchAll(/Model: \d+, "Model::([^"]+)", "Mesh"/g)].map((m) => m[1]);
    expect(meshModels).toHaveLength(objs.length);
    expect(new Set(meshModels)).toEqual(new Set(objs.map((o) => o.id)));
    const geos = (fbx.match(/Geometry: \d+, "Geometry::/g) ?? []).length;
    expect(geos).toBe(new Set(objs.map((o) => o.block ?? o.id)).size);
    // every connection refers to an object that exists
    const ids = new Set([...fbx.matchAll(/^\t(?:Model|Geometry|Material): (\d+),/gm)].map((m) => m[1]));
    for (const [, a, b] of fbx.matchAll(/C: "OO",(\d+),(\d+)/g)) { expect(ids.has(a)).toBe(true); if (b !== '0') expect(ids.has(b)).toBe(true); }
    // polygon index lists end every triangle with a negated index
    const poly = fbx.match(/PolygonVertexIndex: \*(\d+) \{\n\t\t\ta: ([^}]+)\}/)!;
    const idx = poly[2].split(',').map(Number);
    expect(idx.length).toBe(+poly[1]);
    expect(idx.filter((v) => v < 0).length * 3).toBe(idx.length);
  });

  it('respects the system selection', () => {
    const { p, s } = scene();
    const fbx = exportFbx(s, p.name, { systems: ['ledCabinets'] });
    const n = [...fbx.matchAll(/Model: \d+, "Model::[^"]+", "Mesh"/g)].length;
    expect(n).toBe(s.objects.filter((o) => o.system === 'ledCabinets').length);
  });
});

describe('DXF export', () => {
  it('R12 with Rhino layers, one block per equipment type, inserts for untilted blocks', () => {
    const { p, s } = scene();
    const dxf = exportDxf(s, p.name);
    const objs = exportObjects(s);
    expect(dxf).toContain('$ACADVER\n1\nAC1009');
    expect(dxf).toContain('$INSUNITS\n70\n4');
    const inserts = (dxf.match(/\n0\nINSERT\n/g) ?? []).length;
    expect(inserts).toBe(objs.filter((o) => o.block && !o.tilt).length);
    for (const o of objs) expect(dxf).toContain(`\n8\n${dxfLayer(o.layer)}\n`);
    const blocks = [...dxf.matchAll(/\n0\nBLOCK\n8\n0\n2\n([^\n]+)\n/g)].map((m) => m[1]);
    expect(new Set(blocks).size).toBe(blocks.length);
    for (const b of blocks) expect(b).toMatch(/^[A-Z0-9$_-]{1,31}$/);
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
  });

  it('R12-safe names: long names are shortened uniquely', () => {
    const m = new Map<string, string>();
    const a = dxfName('SC_LED_ROE_Visual_Black_Pearl_BP2_V2_LONGER_A', m), b = dxfName('SC_LED_ROE_Visual_Black_Pearl_BP2_V2_LONGER_B', m);
    expect(a.length).toBeLessThanOrEqual(31); expect(a).not.toBe(b);
  });
});

describe('STEP export', () => {
  it('AP214 in mm with a mapped item per block instance and a solid per one-off part', () => {
    const { p, s } = scene();
    const step = exportStep(s, p.name);
    const objs = exportObjects(s);
    expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }'));");
    expect(step).toContain('SI_UNIT(.MILLI.,.METRE.)');
    expect((step.match(/=MAPPED_ITEM\(/g) ?? []).length).toBe(objs.filter((o) => o.block).length);
    expect((step.match(/=REPRESENTATION_MAP\(/g) ?? []).length).toBe(new Set(objs.filter((o) => o.block).map((o) => o.block)).size);
    // every #reference is defined, and no entity is written inline inside another
    const defined = new Set([...step.matchAll(/^#(\d+)=/gm)].map((m) => m[1]));
    for (const [, r] of step.matchAll(/[(,]#(\d+)/g)) expect(defined.has(r)).toBe(true);
    for (const line of step.split('\n').filter((l) => l.startsWith('#'))) expect(line.replace(/^#\d+=\(?[A-Z_0-9]+\(/, '')).not.toMatch(/[(,](VECTOR|LINE|CIRCLE|AXIS2_PLACEMENT_3D|CARTESIAN_POINT)\(/);
    // cylinders are true cylinders
    expect(step).toContain('CYLINDRICAL_SURFACE(');
    for (const layer of new Set(objs.map((o) => o.layer))) expect(step).toContain(`PRESENTATION_LAYER_ASSIGNMENT('${layer}'`);
  });
});
