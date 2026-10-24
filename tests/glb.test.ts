import { describe, expect, it } from 'vitest';
import { validateBytes } from 'gltf-validator';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { resolveScene } from '../src/core/engine/scene';
import { PRESETS, getPreset } from '../src/core/presets';
import { exportGlb } from '../src/export/glb';

const parseJson = (b: Uint8Array) => {
  const dv = new DataView(b.buffer, b.byteOffset);
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
};

describe('GLB export', () => {
  it.each(PRESETS.map((p) => p.id))('%s passes the Khronos glTF validator with no errors', async (id) => {
    const p = getPreset(id).build();
    const bytes = exportGlb(resolveScene(p), p.name, { finish: p.stage.finish });
    const report = await validateBytes(bytes);
    const errors = report.issues.messages.filter((m: any) => m.severity === 0);
    expect(errors, JSON.stringify(errors.slice(0, 3))).toHaveLength(0);
  });

  it('one named node per component, shared meshes per equipment block', () => {
    const p = getPreset('minimal-keynote').build();
    const scene = resolveScene(p);
    const json = parseJson(exportGlb(scene, p.name));
    const named = new Set(json.nodes.map((n: any) => n.name));
    for (const o of scene.objects) expect(named.has(o.id)).toBe(true);
    const cabs = json.nodes.filter((n: any) => n.extras?.system === 'ledCabinets');
    expect(cabs).toHaveLength(scene.report.led[0].count);
    expect(new Set(cabs.map((n: any) => n.mesh)).size).toBe(1); // instanced
    expect(cabs[0].extras.catalogId).toBe('roe.bp2v2');
    expect(json.nodes.some((n: any) => n.name === '20_LED')).toBe(true);
  });

  it('loads in three.js at true size in metres, Y-up', async () => {
    const p = getPreset('minimal-keynote').build();
    p.ledWalls[0] = { ...p.ledWalls[0], width: 10000, height: 3000 };
    const scene = resolveScene(p);
    const bytes = exportGlb(scene, p.name, { systems: ['ledCabinets'] });
    const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(bytes.slice().buffer, '', res, rej));
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(10.0, 3); // 20 cabinets × 0.5 m
    expect(size.y).toBeCloseTo(3.0, 2); // height is glTF Y
    expect(box.min.y).toBeCloseTo((scene.report.stage.height.resolved + 600) / 1000, 3);
    // upstage (+Y in STAGECRAFT) maps to −Z in glTF
    expect(box.max.z).toBeLessThan(0);
  });
});
