/**
 * Shared helpers for the mesh / CAD exporters (FBX, DXF, STEP): an object's placement as a
 * 3 × 4 matrix (T · Rz(rotationZ) · Rx(tilt), the same as the viewport and GLB), and the
 * filter + naming rules every exporter applies.
 */
import type { SceneGraph } from '../core/engine/scene';
import type { SceneObject, SystemKey } from '../core/engine/types';

/** row-major 3 × 4: x' = m[0..2]·p + m[3], … */
export type M34 = [number, number, number, number, number, number, number, number, number, number, number, number];

export function objectXform(o: SceneObject): M34 {
  const c = Math.cos(o.rotationZ), s = Math.sin(o.rotationZ);
  const cx = Math.cos(o.tilt ?? 0), sx = Math.sin(o.tilt ?? 0);
  const [x, y, z] = o.position;
  return [
    c, -s * cx, s * sx, x,
    s, c * cx, -c * sx, y,
    0, sx, cx, z,
  ];
}
export const applyP = (m: M34, p: ArrayLike<number>): [number, number, number] => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
export const applyV = (m: M34, v: ArrayLike<number>): [number, number, number] => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
];

export const exportObjects = (scene: SceneGraph, systems?: SystemKey[]) =>
  scene.objects.filter((o) => (!systems || systems.includes(o.system)) && (o.block ? scene.blocks[o.block]?.parts.length : o.parts?.length));

/** parts of an object in its own frame (block definition or unique geometry) */
export const partsOf = (scene: SceneGraph, o: SceneObject) => (o.block ? scene.blocks[o.block].parts : o.parts!);

/** a number short enough for text formats, without trailing zeros */
export const num = (v: number, dp = 3) => {
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return Object.is(r, -0) ? '0' : String(r);
};
