/**
 * STEP AP214 exporter (ISO 10303-21), written directly from the SceneGraph.
 *
 * Exact B-rep solids, not meshes: boxes and extruded plan polygons become planar-faced
 * solids, cylinders (legs, truss chords, lenses…) true CYLINDRICAL_SURFACEs with circular
 * edges, so SolidWorks, Inventor, Fusion, Creo, NX, CATIA and FreeCAD get measurable
 * geometry. Units mm, Z-up, origin floor / stage centreline / downstage edge.
 *
 *  • Equipment blocks are written once (REPRESENTATION_MAP) and placed with MAPPED_ITEMs,
 *    the STEP equivalent of block instances; one-off components are solids in place.
 *  • Every solid / instance is named with the component id; Rhino layers become
 *    PRESENTATION_LAYER_ASSIGNMENTs and materials become surface colours.
 */
import type { SceneGraph } from '../core/engine/scene';
import type { MaterialKey, Part, SceneObject, SystemKey } from '../core/engine/types';
import type { StageFinish } from '../core/schema';
import { materialTable } from './glb';
import { APP_VERSION } from './rhino';
import { applyP, applyV, exportObjects, num, objectXform, type M34 } from './xform';

export interface StepOptions { systems?: SystemKey[]; finish?: StageFinish; scenicFinish?: StageFinish; fileName?: string }

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_')}'`;
const f = (v: number) => { const s = num(v, 6); return s.includes('.') || s.includes('e') ? s : `${s}.`; };

class Writer {
  lines: string[] = [];
  n = 0;
  add(e: string) { this.lines.push(`#${++this.n}=${e};`); return `#${this.n}`; }
  pt = new Map<string, string>();
  dir = new Map<string, string>();
  point(p: V) { const k = p.map((x) => f(x)).join(','); return this.pt.get(k) ?? (this.pt.set(k, this.add(`CARTESIAN_POINT('',(${k}))`)), this.pt.get(k)!); }
  direction(d: V) { const u = unit(d); const k = u.map((x) => f(x)).join(','); return this.dir.get(k) ?? (this.dir.set(k, this.add(`DIRECTION('',(${k}))`)), this.dir.get(k)!); }
  axis(o: V, z: V, x: V) { return this.add(`AXIS2_PLACEMENT_3D('',${this.point(o)},${this.direction(z)},${this.direction(x)})`); }
}

/** any vector not parallel to n, made perpendicular to it */
const refDir = (n: V): V => { const a: V = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; return unit(cross(cross(n, a), n)); };

/** planar polyhedron (faces CCW seen from outside) as a closed shell */
function polyBrep(w: Writer, name: string, verts: V[], faces: number[][]) {
  const vp = verts.map((p) => w.add(`VERTEX_POINT('',${w.point(p)})`));
  const edges = new Map<string, string>();
  const edge = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!edges.has(k)) {
      const [i, j] = a < b ? [a, b] : [b, a];
      const d = sub(verts[j], verts[i]);
      const line = w.add(`LINE('',${w.point(verts[i])},${w.add(`VECTOR('',${w.direction(d)},${f(len(d))})`)})`);
      edges.set(k, w.add(`EDGE_CURVE('',${vp[i]},${vp[j]},${line},.T.)`));
    }
    return { e: edges.get(k)!, sense: a < b };
  };
  const fs = faces.map((loop) => {
    // Newell normal: outward for a CCW loop
    let n: V = [0, 0, 0];
    for (let i = 0; i < loop.length; i++) {
      const p = verts[loop[i]], q = verts[loop[(i + 1) % loop.length]];
      n = [n[0] + (p[1] - q[1]) * (p[2] + q[2]), n[1] + (p[2] - q[2]) * (p[0] + q[0]), n[2] + (p[0] - q[0]) * (p[1] + q[1])];
    }
    const oe = loop.map((a, i) => { const { e, sense } = edge(a, loop[(i + 1) % loop.length]); return w.add(`ORIENTED_EDGE('',*,*,${e},${sense ? '.T.' : '.F.'})`); });
    const el = w.add(`EDGE_LOOP('',(${oe.join(',')}))`);
    const bound = w.add(`FACE_OUTER_BOUND('',${el},.T.)`);
    const plane = w.add(`PLANE('',${w.axis(verts[loop[0]], n, refDir(unit(n)))})`);
    return w.add(`ADVANCED_FACE('',(${bound}),${plane},.T.)`);
  });
  const shell = w.add(`CLOSED_SHELL('',(${fs.join(',')}))`);
  return w.add(`MANIFOLD_SOLID_BREP(${str(name)},${shell})`);
}

function cylBrep(w: Writer, name: string, from: V, to: V, r: number) {
  const ax = sub(to, from), z = unit(ax), x = refDir(z);
  const p0: V = [from[0] + x[0] * r, from[1] + x[1] * r, from[2] + x[2] * r];
  const p1: V = [to[0] + x[0] * r, to[1] + x[1] * r, to[2] + x[2] * r];
  const v0 = w.add(`VERTEX_POINT('',${w.point(p0)})`), v1 = w.add(`VERTEX_POINT('',${w.point(p1)})`);
  const c0 = w.add(`EDGE_CURVE('',${v0},${v0},${w.add(`CIRCLE('',${w.axis(from, z, x)},${f(r)})`)},.T.)`);
  const c1 = w.add(`EDGE_CURVE('',${v1},${v1},${w.add(`CIRCLE('',${w.axis(to, z, x)},${f(r)})`)},.T.)`);
  const seam = w.add(`EDGE_CURVE('',${v0},${v1},${w.add(`LINE('',${w.point(p0)},${w.add(`VECTOR('',${w.direction(z)},${f(len(ax))})`)})`)},.T.)`);
  const oe = (e: string, s: boolean) => w.add(`ORIENTED_EDGE('',*,*,${e},${s ? '.T.' : '.F.'})`);
  const face = (loop: string[], surf: string) => w.add(`ADVANCED_FACE('',(${w.add(`FACE_OUTER_BOUND('',${w.add(`EDGE_LOOP('',(${loop.join(',')}))`)},.T.)`)}),${surf},.T.)`);
  const side = face([oe(c0, true), oe(seam, true), oe(c1, false), oe(seam, false)], w.add(`CYLINDRICAL_SURFACE('',${w.axis(from, z, x)},${f(r)})`));
  const bottom = face([oe(c0, false)], w.add(`PLANE('',${w.axis(from, [-z[0], -z[1], -z[2]], x)})`));
  const top = face([oe(c1, true)], w.add(`PLANE('',${w.axis(to, z, x)})`));
  return w.add(`MANIFOLD_SOLID_BREP(${str(name)},${w.add(`CLOSED_SHELL('',(${side},${bottom},${top}))`)})`);
}

/** one part as a solid, optionally moved into world space */
function partBrep(w: Writer, name: string, p: Part, m?: M34): string | null {
  const P = (q: ArrayLike<number>): V => (m ? applyP(m, q) : [q[0], q[1], q[2]]);
  if (p.kind === 'cyl') {
    if (!(p.r > 0.01) || len(sub(p.to as V, p.from as V)) < 0.01) return null;
    return cylBrep(w, name, P(p.from), P(p.to), p.r);
  }
  if (p.kind === 'box') {
    const [x0, y0, z0] = p.min, [x1, y1, z1] = p.max;
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return null;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(P);
    return polyBrep(w, name, v, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
  }
  // prism: CCW plan polygon extruded z0 → z1
  let pts = p.points.filter((q, i, a) => Math.hypot(q[0] - a[(i + 1) % a.length][0], q[1] - a[(i + 1) % a.length][1]) > 0.01);
  if (pts.length < 3 || p.z1 - p.z0 < 0.01) return null;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) pts = [...pts].reverse();
  const n = pts.length;
  const v = [...pts.map(([x, y]) => P([x, y, p.z0])), ...pts.map(([x, y]) => P([x, y, p.z1]))];
  const faces = [
    Array.from({ length: n }, (_, i) => n - 1 - i), // bottom, reversed
    Array.from({ length: n }, (_, i) => n + i), // top
    ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i]),
  ];
  return polyBrep(w, name, v, faces);
}

export function exportStep(scene: SceneGraph, projectName: string, opts: StepOptions = {}): string {
  const table = materialTable(opts.finish ?? 'white', opts.scenicFinish ?? 'white');
  const objects = exportObjects(scene, opts.systems);
  const w = new Writer();

  const appCtx = w.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const prodCtx = w.add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`);
  const product = w.add(`PRODUCT(${str(projectName)},${str(projectName)},'STAGECRAFT stage model',(${prodCtx}))`);
  w.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${product}))`);
  const pdf = w.add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const pdCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const pd = w.add(`PRODUCT_DEFINITION('design','',${pdf},${pdCtx})`);
  const pds = w.add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const mm = w.add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const rad = w.add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const sr = w.add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.01),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx = w.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr}))REPRESENTATION_CONTEXT('',''))`);
  const origin = w.axis([0, 0, 0], [0, 0, 1], [1, 0, 0]);

  // colours, one style per material
  const styles = new Map<MaterialKey, string>();
  const styled: string[] = [];
  const style = (k: MaterialKey) => {
    if (!styles.has(k)) {
      const m = table[k];
      const col = w.add(`COLOUR_RGB(${str(m.name)},${m.rgb.map((c) => f(c / 255)).join(',')})`);
      const fill = w.add(`FILL_AREA_STYLE('',(${w.add(`FILL_AREA_STYLE_COLOUR('',${col})`)}))`);
      const side = w.add(`SURFACE_SIDE_STYLE('',(${w.add(`SURFACE_STYLE_FILL_AREA(${fill})`)}))`);
      styles.set(k, w.add(`PRESENTATION_STYLE_ASSIGNMENT((${w.add(`SURFACE_STYLE_USAGE(.BOTH.,${side})`)}))`));
    }
    return styles.get(k)!;
  };
  const solid = (name: string, p: Part, m?: M34) => {
    const b = partBrep(w, name, p, m);
    if (b) styled.push(w.add(`STYLED_ITEM('',(${style(p.mat)}),${b})`));
    return b;
  };

  // block definitions → representation maps
  const maps = new Map<string, string>();
  const mapFor = (key: string) => {
    if (!maps.has(key)) {
      const parts = scene.blocks[key].parts;
      const items = parts.map((p, i) => solid(`${key}.${i + 1}`, p)).filter((x): x is string => !!x);
      const rep = w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(key)},(${[origin, ...items].join(',')}),${ctx})`);
      maps.set(key, w.add(`REPRESENTATION_MAP(${origin},${rep})`));
    }
    return maps.get(key)!;
  };

  const top: string[] = [];
  const byLayer = new Map<string, string[]>();
  const onLayer = (o: SceneObject, item: string) => (byLayer.get(o.layer) ?? byLayer.set(o.layer, []).get(o.layer)!).push(item);
  for (const o of objects) {
    const m = objectXform(o);
    if (o.block) {
      const target = w.axis(o.position as V, applyV(m, [0, 0, 1]), applyV(m, [1, 0, 0]));
      const mi = w.add(`MAPPED_ITEM(${str(o.id)},${mapFor(o.block)},${target})`);
      top.push(mi); onLayer(o, mi);
    } else {
      o.parts!.forEach((p, i) => {
        const b = solid(o.parts!.length > 1 ? `${o.id}.${i + 1}` : o.id, p, m);
        if (b) { top.push(b); onLayer(o, b); }
      });
    }
  }
  const shapeRep = w.add(`SHAPE_REPRESENTATION(${str(projectName)},(${[origin, ...top].join(',')}),${ctx})`);
  w.add(`SHAPE_DEFINITION_REPRESENTATION(${pds},${shapeRep})`);
  for (const [layer, items] of byLayer) w.add(`PRESENTATION_LAYER_ASSIGNMENT(${str(layer)},'',(${items.join(',')}))`);
  if (styled.length) w.add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);

  const now = new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('STAGECRAFT stage model, mm, Z-up, origin floor / stage centreline / downstage edge'),'2;1');`,
    `FILE_NAME(${str(opts.fileName ?? `${projectName}.step`)},'${now}',('STAGECRAFT'),(''),'STAGECRAFT ${APP_VERSION}','STAGECRAFT ${APP_VERSION}','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }'));`,
    'ENDSEC;',
    'DATA;',
    ...w.lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

