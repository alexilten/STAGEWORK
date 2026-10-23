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
  const cols = width.modules, rows = height.modules;

  // curvature: clamp to what the product documents
  let curveDeg = p.curveDeg;
  const maxC = curveDeg >= 0 ? cab.curveConcaveMaxDeg : cab.curveConvexMaxDeg;
  if (curveDeg !== 0 && maxC == null) {
    warnings.push({ level: 'warn', code: 'led.curve.unsupported', target: `led:${p.id}`, message: `${cab.model}: ${curveDeg > 0 ? 'concave' : 'convex'} curving is not documented for this cabinet — wall drawn flat.` });
    curveDeg = 0;
  } else if (maxC != null && Math.abs(curveDeg) > maxC) {
    warnings.push({ level: 'warn', code: 'led.curve.limit', target: `led:${p.id}`, message: `${cab.model}: curve limited to ${maxC}° per joint.` });
    curveDeg = Math.sign(curveDeg) * maxC;
  }

  const columns = layoutColumns(cols, cab.width, (curveDeg * Math.PI) / 180);
  const xs = columns.flatMap((c) => [c.x - (Math.cos(c.yaw) * cab.width) / 2, c.x + (Math.cos(c.yaw) * cab.width) / 2]);
  const ys = columns.flatMap((c) => [c.y - (Math.sin(c.yaw) * cab.width) / 2, c.y + (Math.sin(c.yaw) * cab.width) / 2]);
  const chord = Math.max(...xs) - Math.min(...xs);
  const sagitta = Math.max(...ys) - Math.min(...ys);

  const origin: Vec3 = [p.offsetX, base.stageDepth + p.upstageGap, base.stageTop + p.elevation];
  const count = cols * rows;
  const layout: LedLayout = {
    id: p.id, name: p.name, cabinet: cab, width, height, cols, rows, count,
    pixelsW: cols * cab.pixelsW, pixelsH: rows * cab.pixelsH, curveDeg,
    origin, columns, chord, sagitta,
    areaMm2: count * cab.width * cab.height,
    weightKg: cab.weightKg == null ? null : count * cab.weightKg,
    powerMaxW: cab.powerMaxW == null ? null : count * cab.powerMaxW,
    top: origin[2] + rows * cab.height,
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
      objects.push({
        id: `LED.${tagId}.C${pad(ci + 1)}R${pad(r + 1)}`, label: `${cab.model} cabinet`, layer: '20_LED::20_01_CABINETS', system: 'ledCabinets', group,
        block: block.key, position: [wx, wy, origin[2] + r * cab.height], rotationZ: c.yaw,
        meta: { catalogId: cab.id, wall: p.name, column: ci + 1, row: r + 1, pixelPitch: cab.pixelPitch, pixels: `${cab.pixelsW} × ${cab.pixelsH}` },
      });
    }
  });

  // generic flying bars: one per pair of columns, sitting on the top row
  const barH = 80, barD = 100;
  for (let ci = 0; ci < cols; ci += 2) {
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

  if (!width.exact) warnings.push({ level: 'warn', code: 'led.width', target: group, message: `${p.name}: requested width isn't a whole number of ${cab.width} mm cabinets — showing ${cols} columns.` });
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
