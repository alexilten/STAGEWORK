import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useStore } from '../ui/store';
import { dragTargetFor, fromThree, toThree, type DragTarget } from './drag';

let controlsRef: { enabled: boolean } | null = null;
let justDragged = false;
export type Axis = 'x' | 'y' | 'z';
let active: { target: DragTarget; plane: THREE.Plane; start: THREE.Vector3; shift: boolean; moved: boolean; axis?: Axis } | null = null;

/** STAGECRAFT axis → three.js direction */
const AXIS: Record<Axis, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) };

/**
 * Called on pointer-down by an instanced batch (free drag) or a gizmo handle (axis-constrained);
 * returns true when a drag started.
 */
export function beginDrag(group: string, e: { ray: THREE.Ray; shiftKey: boolean; axis?: Axis }) {
  const { selection } = useStore.getState();
  if (!selection || selection.group !== group) return false;
  const target = dragTargetFor(group);
  if (!target) return false;
  const anchor = toThree(target.anchor);
  let plane: THREE.Plane;
  if (e.axis) {
    // the plane through the axis that faces the camera best
    const a = AXIS[e.axis];
    const n = a.clone().cross(e.ray.direction.clone().cross(a)).normalize();
    plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, anchor);
  } else plane = e.shiftKey || target.floor
    ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -anchor.y)
    : new THREE.Plane(new THREE.Vector3(0, 0, 1), -anchor.z);
  const start = new THREE.Vector3();
  if (!e.ray.intersectPlane(plane, start)) return false;
  active = { target, plane, start, shift: e.axis ? e.axis === 'y' : e.shiftKey, moved: false, axis: e.axis };
  if (controlsRef) controlsRef.enabled = false;
  return true;
}
/** true while a drag is in progress or for the click that ends it */
export const isDragging = () => !!active?.moved || justDragged;

export function DragController() {
  const { camera, gl, controls, scene: threeScene } = useThree() as any;
  const setDragInfo = useStore((s) => s.setDragInfo);
  useEffect(() => { controlsRef = controls ?? null; }, [controls]);
  // dev hook for browser tests: project STAGECRAFT mm to canvas pixels
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__three = threeScene;
    (window as any).__project = (v: [number, number, number]) => {
      const p = toThree(v).project(camera);
      const r = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
      return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
    };
  }, [camera, gl, threeScene]);
  useEffect(() => {
    const el = gl.domElement as HTMLCanvasElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const move = (ev: PointerEvent) => {
      if (!active) return;
      const r = el.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(active.plane, hit)) return;
      const d0 = fromThree(active.start), d1 = fromThree(hit);
      const d = { x: d1.x - d0.x, y: d1.y - d0.y, z: d1.z - d0.z };
      if (active.axis) for (const k of ['x', 'y', 'z'] as const) if (k !== active.axis) d[k] = 0;
      active.moved = true;
      setDragInfo(active.target.apply(d, active.shift, ev.altKey));
      document.body.style.cursor = 'grabbing';
    };
    const up = () => {
      if (!active) return;
      justDragged = active.moved;
      setTimeout(() => { justDragged = false; }, 0);
      active = null;
      if (controls) controls.enabled = true;
      setDragInfo(null);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [camera, gl, controls, setDragInfo]);
  return null;
}
