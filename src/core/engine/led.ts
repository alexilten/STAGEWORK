import type { LedCabinet } from '../catalog';
import type { LedWallParams } from '../schema';
import { resolveModules } from './modular';
import type { BlockDef, Resolved1D, SceneObject, Vec3, Warning } from './types';

export interface LedColumn {
  /** centre of the column's front-face bottom edge, wall-local (x along wall, y upstage) */
  x: number;
  y: number;
  yaw: number; // radians about Z
}

export interface LedLayout {
  id: string;
  name: string;
  cabinet: LedCabinet;
  width: Resolved1D;
  height: Resolved1D;
  cols: number;
  rows: number;
  count: number;
  pixelsW: number;
  pixelsH: number;
  curveDeg: number;
  /** world-space placement of the wall origin (front face, bottom, centre) */
  origin: Vec3;
  surface: 'wall' | 'floor' | 'ceiling' | 'dome';
  /** yaw of the whole wall, radians */
  yaw: number;
  /** arc walls: plan centre of curvature (world) and the angle the wall wraps, degrees */
  arc: { center: [number, number]; radius: number; wrapDeg: number } | null;
  /** true for an ordinary upright wall facing the audience (dimensions, header truss, media span) */
  planar: boolean;
  columns: LedColumn[];
  /** chord width/depth of the (possibly curved) wall, wall-local */
  chord: number;
  sagitta: number;
  areaMm2: number;
  weightKg: number | null;
  powerMaxW: number | null;
  top: number; // world Z of LED top
}

export function cabinetBlockKey(cab: LedCabinet) {
  return `SC_LED_${cab.manufacturer}_${cab.model}`.replace(/[^\w.]+/g, '_').replace(/_+/g, '_');
}

/**
 * Resolve an LED wall to whole cabinets. Never produces partial cabinets: the requested
 * width/height are rounded to the nearest whole cabinet count and the nearest achievable
 * alternatives are reported when the request isn't exact.
 */
export function resolveLedWall(p: LedWallParams, cab: LedCabinet, base: { stageTop: number; stageDepth: number }) {
  const warnings: Warning[] = [];
  const width = resolveModules(p.width, cab.width, 1, 400);
  const height = resolveModules(p.height, cab.height, 1, 200);
  width.alternatives.forEach((a) => (a.label = `${Math.round(a.value / cab.width)} columns`));
  height.alternatives.forEach((a) => (a.label = `${Math.round(a.value / cab.height)} rows`));
  const rows = height.modules;

  const surface = p.surface ?? 'wall';
  // curvature: arc mode sets the joint angle from the radius; otherwise clamp to what the product documents
  let curveDeg = surface === 'wall' ? p.curveDeg : 0;
  let cols = width.modules;
  if (surface === 'wall' && p.radius && Math.abs(p.radius) > cab.width) {
    const R = Math.abs(p.radius);
    curveDeg = Math.sign(p.radius) * (2 * Math.asin(cab.width / (2 * R)) * 180) / Math.PI;
    // a ring closes at 360°: never more columns than go once round
    cols = Math.min(cols, Math.floor(360 / Math.abs(curveDeg) + 1e-6));
    const maxC = curveDeg >= 0 ? cab.curveConcaveMaxDeg : cab.curveConvexMaxDeg;
    if (maxC == null) warnings.push({ level: 'warn', code: 'led.curve.unsupported', target: `led:${p.id}`, message: `${cab.model}: ${curveDeg > 0 ? 'concave' : 'convex'} curving is not documented for this cabinet — choose a curve-capable product for a ${(R / 1000).toFixed(1)} m radius.` });
    else if (Math.abs(curveDeg) > maxC + 1e-6) warnings.push({ level: 'warn', code: 'led.curve.limit', target: `led:${p.id}`, message: `${p.name}: a ${(R / 1000).toFixed(1)} m radius needs ${Math.abs(curveDeg).toFixed(1)}° per joint; ${cab.model} is documented to ${maxC}°.` });
  } else {
    const maxC = curveDeg >= 0 ? cab.curveConcaveMaxDeg : cab.curveConvexMaxDeg;
    if (curveDeg !== 0 && maxC == null) {
      warnings.push({ level: 'warn', code: 'led.curve.unsupported', target: `led:${p.id}`, message: `${cab.model}: ${curveDeg > 0 ? 'concave' : 'convex'} curving is not documented for this cabinet — wall drawn flat.` });
      curveDeg = 0;
    } else if (maxC != null && Math.abs(curveDeg) > maxC) {
      warnings.push({ level: 'warn', code: 'led.curve.limit', target: `led:${p.id}`, message: `${cab.model}: curve limited to ${maxC}° per joint.` });
      curveDeg = Math.sign(curveDeg) * maxC;
    }
  }

  const yaw = ((p.yawDeg ?? 0) * Math.PI) / 180;
  const flat = surface !== 'wall';
  const local = flat ? layoutColumns(cols, cab.width, 0) : layoutColumns(cols, cab.width, (curveDeg * Math.PI) / 180);
  const xs = local.flatMap((c) => [c.x - (Math.cos(c.yaw) * cab.width) / 2, c.x + (Math.cos(c.yaw) * cab.width) / 2]);
  const ys = local.flatMap((c) => [c.y - (Math.sin(c.yaw) * cab.width) / 2, c.y + (Math.sin(c.yaw) * cab.width) / 2]);
  const chord = Math.max(...xs) - Math.min(...xs);
  const sagitta = Math.max(...ys) - Math.min(...ys);
  // whole-wall yaw: rotate the column layout about the wall origin
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const columns = local.map((c) => ({ x: c.x * cy - c.y * sy, y: c.x * sy + c.y * cy, yaw: c.yaw + yaw }));

  const origin: Vec3 = [p.offsetX, base.stageDepth + p.upstageGap, (p.base === 'floor' ? 0 : base.stageTop) + p.elevation];
  let arc: LedLayout['arc'] = null;
  if (!flat && curveDeg !== 0 && cols >= 3) {
    const a = columns[0], b = columns[Math.floor(cols / 2)], c = columns[cols - 1];
    const ctr = circumcentre([a.x, a.y], [b.x, b.y], [c.x, c.y]);
    if (ctr) arc = { center: [origin[0] + ctr[0], origin[1] + ctr[1]], radius: Math.hypot(a.x - ctr[0], a.y - ctr[1]), wrapDeg: Math.min(360, cols * Math.abs(curveDeg)) };
  }
  const planar = surface === 'wall' && Math.abs(yaw) < 1e-6 && (!arc || arc.wrapDeg <= 120);
  if (surface === 'floor' && !cab.floorLoadKgM2) warnings.push({ level: 'error', code: 'led.floor.rating', target: `led:${p.id}`, message: `${cab.model} is not a walkable LED floor product — choose a floor-rated tile.` });
  const count = cols * rows;
  const layout: LedLayout = {
    id: p.id, name: p.name, cabinet: cab, width, height, cols, rows, count,
    pixelsW: cols * cab.pixelsW, pixelsH: rows * cab.pixelsH, curveDeg,
    origin, surface, yaw, arc, planar, columns, chord, sagitta,
    areaMm2: count * cab.width * cab.height,
    weightKg: cab.weightKg == null ? null : count * cab.weightKg,
    powerMaxW: cab.powerMaxW == null ? null : count * cab.powerMaxW,
    top: flat ? origin[2] : origin[2] + rows * cab.height,
  };

  const block: BlockDef = {
    key: cabinetBlockKey(cab), description: `${cab.manufacturer} ${cab.model} — ${cab.width} × ${cab.height} × ${cab.depth} mm`, catalogId: cab.id,
    // origin: centre of the bottom edge of the front (pixel) face; body extends upstage (+Y)
    parts: [{ kind: 'box', min: [-cab.width / 2, 0, 0], max: [cab.width / 2, cab.depth, cab.height], mat: 'ledBody' }],
  };

  const group = `led:${p.id}`;
  const objects: SceneObject[] = [];
  const tagId = p.id.toUpperCase();
  columns.forEach((c, ci) => {
    const [wx, wy] = [origin[0] + c.x, origin[1] + c.y];
    for (let r = 0; r < rows; r++) {
      // floor: rows run upstage, face up (body below the surface); ceiling: rows run upstage, face down
      const along = surface === 'floor' ? r * cab.height : surface === 'ceiling' ? (r + 1) * cab.height : 0;
      const position: Vec3 = flat ? [wx - sy * along, wy + cy * along, origin[2]] : [wx, wy, origin[2] + r * cab.height];
      objects.push({
        id: `LED.${tagId}.C${pad(ci + 1)}R${pad(r + 1)}`, label: `${cab.model} ${surface === 'floor' ? 'floor tile' : 'cabinet'}`, layer: '20_LED::20_01_CABINETS', system: 'ledCabinets', group,
        block: block.key, position, rotationZ: c.yaw, ...(flat ? { tilt: surface === 'floor' ? -Math.PI / 2 : Math.PI / 2 } : {}),
        meta: { catalogId: cab.id, wall: p.name, column: ci + 1, row: r + 1, pixelPitch: cab.pixelPitch, pixels: `${cab.pixelsW} × ${cab.pixelsH}`, ...(flat ? { surface } : {}) },
      });
    }
  });

  // generic flying bars: one per pair of columns, sitting on the top row
  const barH = 80, barD = 100;
  for (let ci = 0; ci < (flat ? 0 : cols); ci += 2) {
    const n = Math.min(2, cols - ci);
    const a = columns[ci], b = columns[ci + n - 1];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, yaw = (a.yaw + b.yaw) / 2;
    const w = n * cab.width - 20;
    objects.push({
      id: `LED.${tagId}.BAR${pad(ci / 2 + 1)}`, label: `Flying bar ${n}-wide (generic)`, layer: '20_LED::20_02_SUPPORTS', system: 'ledSupports', group,
      parts: [{ kind: 'box', min: [-w / 2, cab.depth / 2 - barD / 2, 0], max: [w / 2, cab.depth / 2 + barD / 2, barH], mat: 'ledSupport' }],
      position: [origin[0] + cx, origin[1] + cy, layout.top], rotationZ: yaw,
      meta: { verification: 'generic', columns: n, note: 'Use the manufacturer hanging bar for the selected product' },
    });
  }

  if (!width.exact && !(surface === 'wall' && p.radius)) warnings.push({ level: 'warn', code: 'led.width', target: group, message: `${p.name}: requested width isn't a whole number of ${cab.width} mm cabinets — showing ${cols} columns.` });
  if (!height.exact) warnings.push({ level: 'warn', code: 'led.height', target: group, message: `${p.name}: requested height isn't a whole number of ${cab.height} mm cabinets — showing ${rows} rows.` });

  return { layout, block, objects, warnings, flyingBarHeight: barH };
}

/** Column placement along a polyline arc. Concave (θ>0) brings the wall edges toward the audience (−Y). */
export function layoutColumns(cols: number, w: number, theta: number): LedColumn[] {
  const mid = (cols - 1) / 2;
  const yaws = Array.from({ length: cols }, (_, i) => -(i - mid) * theta);
  // integrate joint positions from the left edge
  const joints: [number, number][] = [[0, 0]];
  for (let i = 0; i < cols; i++) {
    const [jx, jy] = joints[i];
    joints.push([jx + Math.cos(yaws[i]) * w, jy + Math.sin(yaws[i]) * w]);
  }
  const xs = joints.map((j) => j[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const maxY = Math.max(...joints.map((j) => j[1]));
  return yaws.map((yaw, i) => ({
    x: (joints[i][0] + joints[i + 1][0]) / 2 - cx,
    y: (joints[i][1] + joints[i + 1][1]) / 2 - maxY,
    yaw,
  }));
}

const pad = (n: number) => String(n).padStart(2, '0');

function circumcentre(a: [number, number], b: [number, number], c: [number, number]): [number, number] | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  return [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d];
}
