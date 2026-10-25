/**
 * Native Rhino .3dm exporter (rhino3dm / openNURBS, runs in the browser and in Node).
 *
 * Input is the resolved SceneGraph — the same object the viewport draws — so the file
 * always matches what the designer sees. Output:
 *   • millimetre model units, world coordinates as documented in core/schema.ts
 *   • the fixed STAGECRAFT layer hierarchy (00_REFERENCE … 90_TECHNICAL)
 *   • one block definition per unique piece of equipment, placed as named instances
 *   • closed Extrusion solids (boxes / tubes) — no meshes
 *   • per-object user text (stagecraft.*) and the full project JSON in document user text
 */
import { CATALOG } from '../core/catalog';
import type { Project } from '../core/schema';
import { serializeProject } from '../core/schema';
import type { LayerPath, MaterialKey, Part, SceneObject, SystemKey } from '../core/engine/types';
import type { SceneGraph } from '../core/engine/scene';

// rhino3dm's bundled .d.ts lags the WASM bindings (wrong arities, enum shapes), so the module is typed loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RhinoModule = any;
type GeometryBase = any;
type ObjectAttributes = any;

export const APP_VERSION = '0.1.0';

/** Parent layers and their sub-layers, in the order they appear in Rhino. Colours are Rhino layer colours. */
export const LAYER_TREE: { name: string; color: [number, number, number]; children: string[] }[] = [
  { name: '00_REFERENCE', color: [150, 150, 150], children: [] },
  { name: '05_VENUE', color: [120, 124, 132], children: ['05_01_SHELL', '05_02_STRUCTURE', '05_03_RIGGING', '05_04_FIXTURES', '05_05_SERVICES', '05_06_GRID_LINES'] },
  { name: '10_STAGE', color: [60, 60, 60], children: ['10_01_DECKING', '10_02_RISERS', '10_03_SUPPORTS', '10_04_FINISHES'] },
  { name: '20_LED', color: [0, 112, 201], children: ['20_01_CABINETS', '20_02_SUPPORTS', '20_03_TRIM'] },
  { name: '30_RIGGING', color: [205, 120, 0], children: ['30_01_TRUSS', '30_02_HOISTS', '30_03_HARDWARE', '30_04_GROUND_SUPPORT', '30_05_GRID'] },
  { name: '40_LIGHTING', color: [200, 30, 90], children: ['40_01_FIXTURES', '40_02_ACCESSORIES', '40_03_POSITIONS'] },
  { name: '50_AUDIO', color: [120, 70, 190], children: ['50_01_MAINS', '50_02_SUBS', '50_03_FILLS', '50_04_MONITORS', '50_05_DELAYS'] },
  { name: '60_SCENIC', color: [40, 150, 100], children: ['60_01_PORTAL', '60_02_MASKING', '60_03_DRAPES', '60_04_ELEMENTS', '60_05_DJ_BOOTH'] },
  { name: '70_AUDIENCE', color: [110, 110, 130], children: ['70_01_SEATING', '70_02_LAYOUT', '70_03_STANDING', '70_04_BARRICADE', '70_05_STANDS', '70_06_ACCESSIBLE'] },
  { name: '80_BROADCAST', color: [0, 150, 170], children: ['80_01_CAMERAS', '80_02_PLATFORMS', '80_03_TRACK', '80_04_PROMPTERS', '80_05_CREW'] },
  { name: '90_TECHNICAL', color: [230, 40, 40], children: ['90_01_DIMENSIONS', '90_02_CENTERLINES', '90_03_REFERENCE'] },
];

/** Rhino display/render materials (simple, renderer-agnostic). */
export const RHINO_MATERIALS: Record<MaterialKey, { name: string; rgb: [number, number, number]; gloss?: number; transparency?: number }> = {
  deckTop: { name: 'SC_Deck_Top', rgb: [42, 42, 44], gloss: 0.15 },
  deckFrame: { name: 'SC_Deck_Frame_Steel', rgb: [70, 70, 72], gloss: 0.4 },
  leg: { name: 'SC_Leg_Steel', rgb: [120, 120, 124], gloss: 0.5 },
  fascia: { name: 'SC_Fascia', rgb: [36, 36, 38] },
  ledBody: { name: 'SC_LED_Cabinet', rgb: [18, 18, 20], gloss: 0.3 },
  ledSupport: { name: 'SC_LED_Support_Steel', rgb: [90, 90, 94] },
  truss: { name: 'SC_Truss_Aluminium', rgb: [200, 202, 206], gloss: 0.6 },
  hoist: { name: 'SC_Hoist', rgb: [30, 30, 32] },
  fixture: { name: 'SC_Fixture', rgb: [24, 24, 26] },
  presenter: { name: 'SC_Reference_Figure', rgb: [200, 196, 190] },
  chairSeat: { name: 'SC_Chair_Seat', rgb: [34, 34, 37], gloss: 0.1 },
  chairFrame: { name: 'SC_Chair_Frame_Steel', rgb: [150, 150, 155], gloss: 0.5 },
  accessible: { name: 'SC_Wheelchair_Space', rgb: [30, 96, 190], gloss: 0.1 },
  speaker: { name: 'SC_Speaker_Cabinet', rgb: [26, 26, 29], gloss: 0.2 },
  speakerGrille: { name: 'SC_Speaker_Grille', rgb: [12, 12, 14], gloss: 0.1 },
  scenicFlat: { name: 'SC_Scenic_Flat', rgb: [236, 235, 232], gloss: 0.05 },
  drape: { name: 'SC_Drape_Black_Velour', rgb: [14, 14, 15] },
  camera: { name: 'SC_Camera', rgb: [38, 38, 42], gloss: 0.3 },
  platform: { name: 'SC_Camera_Platform', rgb: [30, 30, 32] },
  glass: { name: 'SC_Prompter_Glass', rgb: [200, 214, 224], gloss: 0.9, transparency: 0.75 },
  screen: { name: 'SC_Monitor_Screen', rgb: [12, 16, 26], gloss: 0.6 },
  crowd: { name: 'SC_Crowd_Figure', rgb: [128, 132, 146] },
  barricade: { name: 'SC_Barricade_Steel', rgb: [150, 152, 158], gloss: 0.4 },
  stand: { name: 'SC_Seating_Stand', rgb: [92, 94, 100] },
  structure: { name: 'SC_Ground_Support_Steel', rgb: [110, 112, 118], gloss: 0.4 },
  roofSkin: { name: 'SC_Roof_Skin', rgb: [228, 228, 230], gloss: 0.1, transparency: 0.55 },
  booth: { name: 'SC_DJ_Booth', rgb: [22, 22, 24], gloss: 0.3 },
  venueWall: { name: 'SC_Venue_Wall', rgb: [228, 226, 221] },
  venueDark: { name: 'SC_Venue_Black', rgb: [52, 54, 60] },
  venueFloor: { name: 'SC_Venue_Slab', rgb: [214, 211, 204] },
  venueCarpet: { name: 'SC_Venue_Carpet', rgb: [196, 186, 172] },
  venueSteel: { name: 'SC_Venue_Steel', rgb: [125, 129, 137], gloss: 0.4 },
  venueColumn: { name: 'SC_Venue_Column', rgb: [169, 173, 181], gloss: 0.2 },
  venuePipe: { name: 'SC_Venue_Pipe_Grid', rgb: [85, 88, 95], gloss: 0.4 },
  venueDoor: { name: 'SC_Venue_Door', rgb: [154, 160, 170], gloss: 0.3 },
  venueGlass: { name: 'SC_Venue_Chandelier', rgb: [214, 226, 236], gloss: 0.9, transparency: 0.5 },
  rigPoint: { name: 'SC_Venue_Rig_Point', rgb: [58, 107, 255], gloss: 0.3 },
};

export interface RhinoExportOptions {
  /** Rhino file version (7 opens in Rhino 7 and 8). Default 8. */
  version?: 7 | 8;
  /** Restrict to these systems; default = all */
  systems?: SystemKey[];
  includeAnnotations?: boolean;
}

/** release a wasm-side handle once openNURBS has copied it into the document */
const free = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };

export function exportRhino(rh: RhinoModule, scene: SceneGraph, project: Project, opts: RhinoExportOptions = {}): Uint8Array {
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  doc.settings().modelAbsoluteTolerance = 0.01;
  doc.applicationName = 'STAGECRAFT';
  doc.applicationDetails = `STAGECRAFT ${APP_VERSION} — parametric stage configurator`;

  // ── layers
  const layerIndex = new Map<string, number>();
  for (const parent of LAYER_TREE) {
    const l = new rh.Layer();
    l.name = parent.name;
    l.color = rgba(parent.color);
    const pi = doc.layers().add(l);
    layerIndex.set(parent.name, pi);
    const pid = doc.layers().get(pi).id;
    for (const child of parent.children) {
      const c = new rh.Layer();
      c.name = child;
      c.parentLayerId = pid;
      c.color = rgba(parent.color);
      layerIndex.set(`${parent.name}::${child}`, doc.layers().add(c));
    }
  }
  const layer = (p: LayerPath) => {
    const i = layerIndex.get(p);
    if (i === undefined) throw new Error(`Layer ${p} missing`);
    return i;
  };

  // ── materials
  const matIndex = new Map<MaterialKey, number>();
  for (const [key, m] of Object.entries(RHINO_MATERIALS) as [MaterialKey, (typeof RHINO_MATERIALS)[MaterialKey]][]) {
    const mat = new rh.Material();
    mat.name = m.name;
    mat.diffuseColor = rgba(m.rgb);
    if (m.gloss) { mat.shine = m.gloss * 255; mat.reflectivity = m.gloss * 0.3; }
    if (m.transparency) mat.transparency = m.transparency;
    matIndex.set(key, doc.materials().add(mat));
  }

  const want = (s: SystemKey) => !opts.systems || opts.systems.includes(s);
  const objects = scene.objects.filter((o) => want(o.system));

  // ── block definitions (only those used)
  const usedBlocks = new Map<string, SceneObject>();
  for (const o of objects) if (o.block && !usedBlocks.has(o.block)) usedBlocks.set(o.block, o);
  const blockId = new Map<string, string>();
  for (const [key, first] of usedBlocks) {
    const def = scene.blocks[key];
    const geoms: GeometryBase[] = [];
    const attrs: ObjectAttributes[] = [];
    def.parts.forEach((part, i) => {
      geoms.push(partGeometry(rh, part));
      const a = new rh.ObjectAttributes();
      a.layerIndex = layer(first.layer);
      a.name = `${key}.${i + 1}`;
      a.materialIndex = matIndex.get(part.mat)!;
      a.materialSource = rh.ObjectMaterialSource.MaterialFromObject;
      attrs.push(a);
    });
    const idx = doc.instanceDefinitions().add(key, def.description, '', '', [0, 0, 0], geoms, attrs);
    free(...geoms, ...attrs);
    if (idx < 0) throw new Error(`Failed to add block ${key}`);
    blockId.set(key, doc.instanceDefinitions().get(idx).id);
  }

  // ── objects
  const catalogById = new Map(CATALOG.map((c) => [c.id, c]));
  const groupIndex = new Map<string, number>();
  for (const o of objects) {
    const xf = placement(rh, o);
    const base = (suffix = '') => {
      const a = new rh.ObjectAttributes();
      a.layerIndex = layer(o.layer);
      a.name = o.id + suffix;
      a.setUserString('stagecraft.id', o.id);
      a.setUserString('stagecraft.label', o.label);
      a.setUserString('stagecraft.system', o.system);
      a.setUserString('stagecraft.group', o.group);
      for (const [k, v] of Object.entries(o.meta)) if (v !== null && v !== undefined) a.setUserString(`stagecraft.${k}`, String(v));
      const cat = typeof o.meta.catalogId === 'string' ? catalogById.get(o.meta.catalogId) : undefined;
      if (cat) {
        a.setUserString('stagecraft.manufacturer', cat.manufacturer);
        a.setUserString('stagecraft.model', cat.model);
        a.setUserString('stagecraft.verification', cat.verification);
      }
      return a;
    };
    if (o.block) {
      const ref = new rh.InstanceReference(blockId.get(o.block)!, xf), a = base();
      doc.objects().add(ref, a);
      free(ref, a);
    } else if (o.parts) {
      let gi: number | undefined;
      if (o.parts.length > 1) {
        const g = new rh.Group();
        g.name = o.id;
        doc.groups().add(g);
        gi = doc.groups().count - 1;
        groupIndex.set(o.id, gi);
      }
      o.parts.forEach((part, i) => {
        const geom = partGeometry(rh, part);
        geom.transform(xf);
        const a = base(o.parts!.length > 1 ? `.${i + 1}` : '');
        a.materialIndex = matIndex.get(part.mat)!;
        a.materialSource = rh.ObjectMaterialSource.MaterialFromObject;
        if (gi !== undefined) a.addToGroup(gi);
        doc.objects().add(geom, a);
        free(geom, a);
      });
    }
    free(xf);
  }

  // ── annotations (lines + text dots; rhino3dm cannot author true Rhino dimensions yet)
  if (opts.includeAnnotations !== false) {
    for (const an of scene.annotations) {
      if (an.layer.startsWith('05_VENUE') && opts.systems && !opts.systems.includes('venue')) continue;
      const a = new rh.ObjectAttributes();
      a.layerIndex = layer(an.layer);
      a.name = an.id;
      a.setUserString('stagecraft.id', an.id);
      doc.objects().add(new rh.LineCurve(an.from, an.to), a);
      if (an.kind === 'dim' && an.value !== undefined) {
        a.setUserString('stagecraft.value_mm', String(Math.round(an.value * 10) / 10));
        const mid: [number, number, number] = [(an.from[0] + an.to[0]) / 2, (an.from[1] + an.to[1]) / 2, (an.from[2] + an.to[2]) / 2];
        const dot = new rh.TextDot(`${an.label}: ${fmt(an.value)}`, mid);
        const da = new rh.ObjectAttributes();
        da.layerIndex = layer(an.layer);
        da.name = `${an.id}.LABEL`;
        doc.objects().add(dot, da);
        // extension ticks
        for (const p of [an.from, an.to]) {
          const ta = new rh.ObjectAttributes(); ta.layerIndex = layer(an.layer); ta.name = `${an.id}.TICK`;
          doc.objects().add(new rh.LineCurve([p[0], p[1], p[2] - 150], [p[0], p[1], p[2] + 150]), ta);
        }
      }
    }
  }

  // ── parametric preservation: the project travels inside the file
  doc.strings().set('stagecraft.schema', 'stagecraft.project');
  doc.strings().set('stagecraft.appVersion', APP_VERSION);
  doc.strings().set('stagecraft.project', serializeProject(project));
  doc.strings().set('stagecraft.coordinateSystem', 'mm; Z up; origin = floor, stage centreline, downstage edge; +Y upstage; +X house right');
  doc.strings().set('stagecraft.note', 'Editable Rhino model generated by STAGECRAFT. Not a live Grasshopper definition. Re-open the embedded project in STAGECRAFT to regenerate.');

  const options = new rh.File3dmWriteOptions();
  options.version = opts.version ?? 8;
  const bytes = doc.toByteArrayOptions(options);
  // free the wasm-side document: big shows (crowds, stadium roofs) otherwise exhaust the wasm heap over repeated exports
  free(options, doc);
  return bytes;
}

function partGeometry(rh: RhinoModule, part: Part): GeometryBase {
  if (part.kind === 'box') {
    return rh.Extrusion.createBoxExtrusion(new rh.Box(new rh.BoundingBox(part.min, part.max)), true);
  }
  if (part.kind === 'prism') {
    const pl = new rh.Polyline(0);
    for (const [x, y] of part.points) pl.add(x, y, 0);
    pl.add(part.points[0][0], part.points[0][1], 0);
    // Extrusion.create extrudes along the profile normal, which flips with winding
    const ext = rh.Extrusion.create(pl.toPolylineCurve(), Math.sign(signedArea(part.points)) * (part.z1 - part.z0), true);
    ext.translate([0, 0, part.z0]);
    return ext;
  }
  const d = [part.to[0] - part.from[0], part.to[1] - part.from[1], part.to[2] - part.from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const ext = rh.Extrusion.createCylinderExtrusion(new rh.Cylinder(new rh.Circle(part.r), len), true, true);
  const dir = [d[0] / len, d[1] / len, d[2] / len];
  if (Math.abs(dir[2] - 1) > 1e-9) {
    // rotationVectors is degenerate for exactly opposite vectors
    const xf = Math.abs(dir[2] + 1) < 1e-9 ? rh.Transform.rotation(Math.PI, [1, 0, 0], [0, 0, 0]) : rh.Transform.rotationVectors([0, 0, 1], dir, [0, 0, 0]);
    ext.transform(xf);
  }
  ext.translate(part.from);
  return ext;
}

function placement(rh: RhinoModule, o: SceneObject) {
  let t = rh.Transform.translationXYZ(o.position[0], o.position[1], o.position[2]);
  if (o.rotationZ) t = rh.Transform.multiply(t, rh.Transform.rotation(o.rotationZ, [0, 0, 1], [0, 0, 0]));
  if (o.tilt) t = rh.Transform.multiply(t, rh.Transform.rotation(o.tilt, [1, 0, 0], [0, 0, 0]));
  return t;
}

function signedArea(pts: [number, number][]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; }
  return s / 2;
}

const rgba = ([r, g, b]: [number, number, number]) => ({ r, g, b, a: 255 });
const fmt = (mm: number) => `${(mm / 1000).toFixed(3)} m (${Math.round(mm)} mm)`;
