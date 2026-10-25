/**
 * FBX 7.4 (ASCII) exporter, written directly from the SceneGraph.
 *
 *  • Units mm, Z-up (GlobalSettings UnitScaleFactor 0.1 = 1 unit is 1 mm; UpAxis Z, front −Y),
 *    so Maya / 3ds Max / Blender / Unreal / Unity / C4D convert to their own scene units on import.
 *  • Equipment blocks become one shared Geometry each; every component is its own named Model
 *    using that Geometry (instancing, like Rhino blocks and the GLB meshes).
 *  • Hierarchy: STAGECRAFT → parent layer → sub-layer → components, as empty (Null) models.
 *  • Placement: Lcl Translation + Lcl Rotation (Euler XYZ: tilt about X, then yaw about Z).
 *  • Materials are Phong with the Rhino / GLB colours; component metadata goes into user properties.
 * ASCII rather than binary keeps the writer small and the file diffable; every FBX SDK reader opens it.
 */
import type { SceneGraph } from '../core/engine/scene';
import type { MaterialKey, Part, SceneObject, SystemKey } from '../core/engine/types';
import type { StageFinish } from '../core/schema';
import { boxPrim, cylPrim, materialTable, prismPrim, type Prim } from './glb';
import { APP_VERSION } from './rhino';
import { exportObjects, num, partsOf } from './xform';

export interface FbxOptions { systems?: SystemKey[]; finish?: StageFinish; scenicFinish?: StageFinish }

const esc = (s: string) => s.replace(/["\r\n]/g, "'").replace(/::/g, '|');
const list = (vals: (string | number)[]) => {
  // FBX ASCII arrays: "*N { a: v,v,v }" — wrap long lines
  const out: string[] = [];
  for (let i = 0; i < vals.length; i += 64) out.push(vals.slice(i, i + 64).join(','));
  return `*${vals.length} {\n\t\t\ta: ${out.join(',\n\t\t\t')}\n\t\t}`;
};

interface Geo { id: number; mats: MaterialKey[] }

export function exportFbx(scene: SceneGraph, projectName: string, opts: FbxOptions = {}): string {
  const table = materialTable(opts.finish ?? 'white', opts.scenicFinish ?? 'white');
  const objects = exportObjects(scene, opts.systems);
  let nextId = 1_000_000;
  const id = () => ++nextId;
  const out: string[] = [];
  const conns: string[] = [];
  const counts = { Model: 0, Geometry: 0, Material: 0 };

  // ── materials
  const matId = new Map<MaterialKey, number>();
  const matFor = (k: MaterialKey) => {
    if (matId.has(k)) return matId.get(k)!;
    const m = table[k], i = id();
    const [r, g, b] = m.rgb.map((c) => num(c / 255, 4));
    out.push(`\tMaterial: ${i}, "Material::${esc(m.name)}", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tMultiLayer: 0
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",${r},${g},${b}
\t\t\tP: "Diffuse", "Vector3D", "Vector", "",${r},${g},${b}
\t\t\tP: "SpecularFactor", "Number", "", "A",${num(Math.max(0, 1 - m.rough) * 0.5, 3)}
\t\t\tP: "Shininess", "Number", "", "A",${num((1 - m.rough) * 60, 2)}
\t\t\tP: "Opacity", "double", "Number", "",${m.alpha ?? 1}
\t\t\tP: "TransparencyFactor", "Number", "", "A",${num(1 - (m.alpha ?? 1), 3)}
\t\t}
\t}`);
    counts.Material++;
    matId.set(k, i);
    return i;
  };

  // ── geometry: one mesh per block / unique object, polygons tagged with a material slot
  const geoFor = new Map<string, Geo>();
  const buildGeo = (name: string, parts: Part[]): Geo => {
    const byMat = new Map<MaterialKey, Prim>();
    for (const p of parts) {
      const prim = byMat.get(p.mat) ?? byMat.set(p.mat, { positions: [], normals: [], indices: [] }).get(p.mat)!;
      if (p.kind === 'box') boxPrim(p.min, p.max, prim);
      else if (p.kind === 'prism') prismPrim(p.points, p.z0, p.z1, prim);
      else cylPrim(p.from, p.to, p.r, prim);
    }
    const verts: string[] = [], poly: number[] = [], normals: string[] = [], polyMat: number[] = [];
    const mats = [...byMat.keys()];
    mats.forEach((k, slot) => {
      const prim = byMat.get(k)!;
      const base = verts.length / 3;
      for (let i = 0; i < prim.positions.length; i++) verts.push(num(prim.positions[i], 2));
      for (let t = 0; t < prim.indices.length; t += 3) {
        const [a, b, c] = [prim.indices[t], prim.indices[t + 1], prim.indices[t + 2]];
        poly.push(base + a, base + b, -(base + c) - 1);
        for (const v of [a, b, c]) normals.push(num(prim.normals[3 * v], 4), num(prim.normals[3 * v + 1], 4), num(prim.normals[3 * v + 2], 4));
        polyMat.push(slot);
      }
    });
    const gid = id();
    out.push(`\tGeometry: ${gid}, "Geometry::${esc(name)}", "Mesh" {
\t\tVertices: ${list(verts)}
\t\tPolygonVertexIndex: ${list(poly)}
\t\tGeometryVersion: 124
\t\tLayerElementNormal: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tNormals: ${list(normals)}
\t\t}
\t\tLayerElementMaterial: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "${mats.length === 1 ? 'AllSame' : 'ByPolygon'}"
\t\t\tReferenceInformationType: "IndexToDirect"
\t\t\tMaterials: ${list(mats.length === 1 ? [0] : polyMat)}
\t\t}
\t\tLayer: 0 {
\t\t\tVersion: 100
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementNormal"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementMaterial"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t}
\t}`);
    counts.Geometry++;
    return { id: gid, mats };
  };

  const props = (extra: string[]) => `\t\tProperties70:  {\n${extra.map((l) => `\t\t\t${l}`).join('\n')}\n\t\t}`;
  const model = (name: string, kind: 'Null' | 'Mesh', p: string[]) => {
    const i = id();
    out.push(`\tModel: ${i}, "Model::${esc(name)}", "${kind}" {
\t\tVersion: 232
${props(['P: "RotationOrder", "enum", "", "",0', 'P: "DefaultAttributeIndex", "int", "Integer", "",0', ...p])}
\t\tShading: T
\t\tCulling: "CullingOff"
\t}`);
    counts.Model++;
    return i;
  };

  // ── hierarchy: root → layer → sub-layer
  const root = model('STAGECRAFT', 'Null', [`P: "Origin", "KString", "", "U", "floor, stage centreline, downstage edge (mm, Z-up)"`]);
  conns.push(`\tC: "OO",${root},0`);
  const layerNode = new Map<string, number>();
  const nodeFor = (path: string): number => {
    if (layerNode.has(path)) return layerNode.get(path)!;
    const segs = path.split('::');
    const parent = segs.length === 1 ? root : nodeFor(segs.slice(0, -1).join('::'));
    const n = model(segs[segs.length - 1], 'Null', []);
    conns.push(`\tC: "OO",${n},${parent}`);
    layerNode.set(path, n);
    return n;
  };

  for (const o of objects) {
    const key = o.block ?? `__obj:${o.id}`;
    const geo = geoFor.get(key) ?? geoFor.set(key, buildGeo(o.block ?? o.id, partsOf(scene, o))).get(key)!;
    const m = model(o.id, 'Mesh', [
      `P: "Lcl Translation", "Lcl Translation", "", "A",${num(o.position[0], 2)},${num(o.position[1], 2)},${num(o.position[2], 2)}`,
      `P: "Lcl Rotation", "Lcl Rotation", "", "A",${num(((o.tilt ?? 0) * 180) / Math.PI, 5)},0,${num((o.rotationZ * 180) / Math.PI, 5)}`,
      ...userProps(o),
    ]);
    conns.push(`\tC: "OO",${m},${nodeFor(o.layer)}`, `\tC: "OO",${geo.id},${m}`);
    for (const k of geo.mats) conns.push(`\tC: "OO",${matFor(k)},${m}`);
  }

  const t = new Date();
  const head = `; FBX 7.4.0 project file
; ${projectName} — STAGECRAFT ${APP_VERSION}. Units mm, Z-up; origin = floor, stage centreline, downstage edge.
; ----------------------------------------------------

FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreationTimeStamp:  {
\t\tVersion: 1000
\t\tYear: ${t.getUTCFullYear()}
\t\tMonth: ${t.getUTCMonth() + 1}
\t\tDay: ${t.getUTCDate()}
\t\tHour: ${t.getUTCHours()}
\t\tMinute: ${t.getUTCMinutes()}
\t\tSecond: ${t.getUTCSeconds()}
\t\tMillisecond: 0
\t}
\tCreator: "STAGECRAFT ${APP_VERSION}"
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",2
\t\tP: "UpAxisSign", "int", "Integer", "",1
\t\tP: "FrontAxis", "int", "Integer", "",1
\t\tP: "FrontAxisSign", "int", "Integer", "",-1
\t\tP: "CoordAxis", "int", "Integer", "",0
\t\tP: "CoordAxisSign", "int", "Integer", "",1
\t\tP: "OriginalUpAxis", "int", "Integer", "",2
\t\tP: "OriginalUpAxisSign", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",0.1
\t\tP: "OriginalUnitScaleFactor", "double", "Number", "",0.1
\t}
}

Documents:  {
\tCount: 1
\tDocument: 1000000, "${esc(projectName)}", "Scene" {
\t\tProperties70:  {
\t\t\tP: "SourceObject", "object", "", ""
\t\t\tP: "ActiveAnimStackName", "KString", "", "", ""
\t\t}
\t\tRootNode: 0
\t}
}

References:  {
}

Definitions:  {
\tVersion: 100
\tCount: ${1 + counts.Model + counts.Geometry + counts.Material}
\tObjectType: "GlobalSettings" {
\t\tCount: 1
\t}
\tObjectType: "Model" {
\t\tCount: ${counts.Model}
\t}
\tObjectType: "Geometry" {
\t\tCount: ${counts.Geometry}
\t}
\tObjectType: "Material" {
\t\tCount: ${counts.Material}
\t}
}

Objects:  {
`;
  return `${head}${out.join('\n')}\n}\n\nConnections:  {\n${conns.join('\n')}\n}\n`;
}

/** component metadata as FBX user properties (shown as custom attributes in Maya / Max / Blender) */
function userProps(o: SceneObject): string[] {
  const p = [`P: "stagecraft_label", "KString", "", "U", "${esc(o.label)}"`, `P: "stagecraft_layer", "KString", "", "U", "${esc(o.layer)}"`, `P: "stagecraft_group", "KString", "", "U", "${esc(o.group)}"`];
  for (const [k, v] of Object.entries(o.meta)) {
    if (v == null) continue;
    const key = `sc_${k.replace(/\W+/g, '_')}`;
    if (typeof v === 'number') p.push(`P: "${key}", "double", "Number", "U",${num(v, 4)}`);
    else if (typeof v === 'boolean') p.push(`P: "${key}", "bool", "", "U",${v ? 1 : 0}`);
    else p.push(`P: "${key}", "KString", "", "U", "${esc(String(v))}"`);
  }
  return p;
}
