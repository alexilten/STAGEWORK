/**
 * DXF exporter (AutoCAD R12 / AC1009 ASCII), written directly from the SceneGraph.
 *
 * DWG is Autodesk's closed binary format and there is no dependable way to write it in a
 * browser; DXF is its open twin. AutoCAD, Vectorworks, BricsCAD, SketchUp, Revit and Rhino
 * open this file directly, and AutoCAD saves it on as .dwg. R12 is used because every one of
 * them reads it.
 *
 *  • Units mm ($INSUNITS 4), Z-up, origin floor / stage centreline / downstage edge.
 *  • Layers follow the Rhino tree with `$` between parent and child (as Rhino writes DWG layers),
 *    e.g. 70_AUDIENCE$70_01_SEATING.
 *  • Equipment blocks become DXF BLOCKs of 3DFACEs inserted with their rotation; components with
 *    a tilt (cameras, prompters) are written as 3DFACEs in place, since R12 INSERTs only turn in plan.
 *  • Curved parts are faceted (16 sides), like the GLB / FBX meshes.
 */
import type { SceneGraph } from '../core/engine/scene';
import type { Part, SystemKey } from '../core/engine/types';
import { boxPrim, cylPrim, prismPrim, type Prim } from './glb';
import { APP_VERSION, LAYER_TREE } from './rhino';
import { applyP, exportObjects, num, objectXform, partsOf } from './xform';

export interface DxfOptions { systems?: SystemKey[] }

/** AutoCAD colour index nearest each top-level layer colour */
const ACI: Record<string, number> = {
  '00_REFERENCE': 8, '05_VENUE': 252, '10_STAGE': 250, '20_LED': 5, '30_RIGGING': 30, '40_LIGHTING': 6,
  '50_AUDIO': 200, '60_SCENIC': 3, '70_AUDIENCE': 9, '80_BROADCAST': 4, '90_TECHNICAL': 1,
};

export const dxfLayer = (path: string) => path.replace(/::/g, '$').toUpperCase();

/** R12 names: ≤ 31 characters of A–Z 0–9 $ - _ */
export function dxfName(s: string, used: Map<string, string>) {
  if (used.has(s)) return used.get(s)!;
  let n = s.toUpperCase().replace(/[^A-Z0-9$_-]+/g, '_');
  if (n.length > 31) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    n = `${n.slice(0, 26)}_${h.toString(36).toUpperCase().padStart(4, '0').slice(-4)}`;
  }
  const taken = new Set(used.values());
  for (let k = 2; taken.has(n); k++) n = `${n.slice(0, 31 - String(k).length - 1)}~${k}`.replace('~', '-');
  used.set(s, n);
  return n;
}

const tessellate = (parts: Part[]) => {
  const prim: Prim = { positions: [], normals: [], indices: [] };
  for (const p of parts) p.kind === 'box' ? boxPrim(p.min, p.max, prim) : p.kind === 'prism' ? prismPrim(p.points, p.z0, p.z1, prim) : cylPrim(p.from, p.to, p.r, prim);
  return prim;
};

export function exportDxf(scene: SceneGraph, projectName: string, opts: DxfOptions = {}): string {
  const objects = exportObjects(scene, opts.systems);
  const out: string[] = [];
  const g = (code: number, v: string | number) => { out.push(String(code), typeof v === 'number' ? num(v, 3) : v); };

  const faces = (prim: Prim, layer: string, xf?: (p: number[]) => number[]) => {
    for (let t = 0; t < prim.indices.length; t += 3) {
      const pts = [0, 1, 2].map((k) => { const i = prim.indices[t + k] * 3; const p = prim.positions.slice(i, i + 3); return xf ? xf(p) : p; });
      g(0, '3DFACE'); g(8, layer);
      [...pts, pts[2]].forEach((p, k) => { g(10 + k, p[0]); g(20 + k, p[1]); g(30 + k, p[2]); });
    }
  };

  // ── header
  g(999, `${projectName} — STAGECRAFT ${APP_VERSION}. Units mm, Z-up; origin = floor, stage centreline, downstage edge.`);
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4);
  g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  g(0, 'ENDSEC');

  // ── layers
  const layers = LAYER_TREE.flatMap((l) => [{ name: l.name, aci: ACI[l.name] ?? 7 }, ...l.children.map((c) => ({ name: `${l.name}$${c}`, aci: ACI[l.name] ?? 7 }))]);
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length + 1);
  for (const l of [{ name: '0', aci: 7 }, ...layers]) { g(0, 'LAYER'); g(2, l.name); g(70, 0); g(62, l.aci); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  // ── blocks: one per equipment type, faces on layer 0 so they take the insert's layer
  const names = new Map<string, string>();
  const usedBlocks = [...new Set(objects.filter((o) => o.block && !o.tilt).map((o) => o.block!))];
  g(0, 'SECTION'); g(2, 'BLOCKS');
  for (const key of usedBlocks) {
    const b = scene.blocks[key];
    g(0, 'BLOCK'); g(8, '0'); g(2, dxfName(key, names)); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, dxfName(key, names));
    faces(tessellate(b.parts), '0');
    g(0, 'ENDBLK'); g(8, '0');
  }
  g(0, 'ENDSEC');

  // ── entities
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const o of objects) {
    const layer = dxfLayer(o.layer);
    if (o.block && !o.tilt) {
      g(0, 'INSERT'); g(8, layer); g(2, dxfName(o.block, names));
      g(10, o.position[0]); g(20, o.position[1]); g(30, o.position[2]);
      if (o.rotationZ) g(50, (o.rotationZ * 180) / Math.PI);
    } else {
      const m = objectXform(o);
      faces(tessellate(partsOf(scene, o)), layer, (p) => applyP(m, p));
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}
