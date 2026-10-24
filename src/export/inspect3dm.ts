/**
 * Re-open a .3dm and summarise it. Used by the automated export tests and the
 * sample-export script — it reads the file back through openNURBS rather than
 * trusting the exporter's own bookkeeping.
 */
import type { RhinoModule } from './rhino';

export interface BBoxInfo { min: number[]; max: number[]; size: number[] }
export interface ObjInfo {
  name: string; layer: string; type: string; block?: string; insertion?: number[];
  bbox: BBoxInfo; user: Record<string, string>;
}
export interface FileInfo {
  units: string; archiveVersion: number; layers: string[];
  blocks: { name: string; parts: number; bbox: BBoxInfo; instances: number }[];
  objects: ObjInfo[]; materials: string[]; strings: Record<string, string>;
}

export function inspect3dm(rh: RhinoModule, bytes: Uint8Array): FileInfo {
  const doc = rh.File3dm.fromByteArray(bytes);
  if (!doc) throw new Error('openNURBS could not read the file');
  const layersById = new Map<string, { name: string; parent: string }>();
  const layerByIndex: string[] = [];
  for (let i = 0; i < doc.layers().count; i++) {
    const l = doc.layers().get(i);
    layersById.set(l.id, { name: l.name, parent: l.parentLayerId });
  }
  const fullPath = (id: string): string => {
    const l = layersById.get(id)!;
    return layersById.has(l.parent) ? `${fullPath(l.parent)}::${l.name}` : l.name;
  };
  for (let i = 0; i < doc.layers().count; i++) layerByIndex.push(fullPath(doc.layers().get(i).id));

  const unitsEnum = rh.UnitSystem as unknown as Record<string, { value: number }>;
  const u = doc.settings().modelUnitSystem as unknown as { value: number };
  const units = Object.keys(unitsEnum).find((k) => unitsEnum[k]?.value === u.value) ?? String(u.value);

  const idefs = new Map<string, { name: string; ids: string[] }>();
  for (let i = 0; i < doc.instanceDefinitions().count; i++) {
    const d = doc.instanceDefinitions().get(i);
    idefs.set(d.id, { name: d.name, ids: d.getObjectIds() as unknown as string[] });
  }
  const objById = new Map<string, any>();
  const all: any[] = [];
  for (let i = 0; i < doc.objects().count; i++) {
    const o = doc.objects().get(i);
    all.push(o);
    objById.set(o.attributes().id, o);
  }
  const bboxOf = (b: any): BBoxInfo => ({ min: b.min, max: b.max, size: [0, 1, 2].map((k) => b.max[k] - b.min[k]) });
  const unionBox = (geoms: any[], xf?: any): BBoxInfo => {
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (const g of geoms) {
      const dup = g.duplicate();
      if (xf) dup.transform(xf);
      const b = dup.getBoundingBox();
      dup.delete();
      for (let k = 0; k < 3; k++) { mins[k] = Math.min(mins[k], b.min[k]); maxs[k] = Math.max(maxs[k], b.max[k]); }
    }
    return bboxOf({ min: mins, max: maxs });
  };

  // block part geometry, read once per definition (every handle is a wasm-side copy)
  const defGeoms = new Map<string, any[]>();
  const geomsOf = (def: { name: string; ids: string[] }) => {
    let g = defGeoms.get(def.name);
    if (!g) defGeoms.set(def.name, (g = def.ids.map((id) => objById.get(id).geometry())));
    return g;
  };
  const instanceCount = new Map<string, number>();
  const objects: ObjInfo[] = [];
  for (const o of all) {
    const a = o.attributes();
    if (a.isInstanceDefinitionObject) continue;
    const g = o.geometry();
    const type = g.constructor.name;
    const user: Record<string, string> = {};
    const keys = a.getUserStrings() as unknown as [string, string][];
    for (const [k, v] of keys) user[k] = v;
    const info: ObjInfo = { name: a.name, layer: layerByIndex[a.layerIndex], type, user, bbox: bboxOf(g.getBoundingBox()) };
    if (type === 'InstanceReference') {
      const def = idefs.get(g.parentIdefId)!;
      info.block = def.name;
      const xf = g.xform;
      info.insertion = [xf.m03, xf.m13, xf.m23];
      info.bbox = unionBox(geomsOf(def), xf);
      instanceCount.set(def.name, (instanceCount.get(def.name) ?? 0) + 1);
    }
    objects.push(info);
  }
  const blocks = [...idefs.values()].map((d) => ({
    name: d.name, parts: d.ids.length, instances: instanceCount.get(d.name) ?? 0,
    bbox: unionBox(geomsOf(d)),
  }));
  const materials: string[] = [];
  for (let i = 0; i < doc.materials().count; i++) materials.push(doc.materials().get(i).name);
  const strings: Record<string, string> = {};
  for (let i = 0; i < doc.strings().count; i++) {
    const kv = doc.strings().get(i) as unknown as [string, string];
    strings[kv[0]] = kv[1];
  }
  const archiveVersion = (doc as any).archiveVersion ?? (rh.File3dm as any).readArchiveVersion?.(bytes);
  (doc as unknown as { delete(): void }).delete();
  return { units, archiveVersion, layers: layerByIndex, blocks, objects, materials, strings };
}
