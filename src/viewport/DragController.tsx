import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useStore } from '../ui/store';
import { dragTargetFor, fromThree, toThree, type DragTarget } from './drag';

let controlsRef: { enabled: boolean } | null = null;
let justDragged = false;
let active: { target: DragTarget; plane: THREE.Plane; start: THREE.Vector3; shift: boolean; moved: boolean } | null = null;

/** Called by an instanced batch on pointer-down; returns true when a drag started. */
export function beginDrag(group: string, e: { ray: THREE.Ray; shiftKey: boolean }) {
  const { selection } = useStore.getState();
  if (!selection || selection.group !== group) return false;
  const target = dragTargetFor(group);
  if (!target) return false;
  const anchor = toThree(target.anchor);
  const plane = e.shiftKey
    ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -anchor.y)
    : new THREE.Plane(new THREE.Vector3(0, 0, 1), -anchor.z);
  const start = new THREE.Vector3();
  if (!e.ray.intersectPlane(plane, start)) return false;
  active = { target, plane, start, shift: e.shiftKey, moved: false };
  if (controlsRef) controlsRef.enabled = false;
  return true;
}
/** true while a drag is in progress or for the click that ends it */
export const isDragging = () => !!active?.moved || justDragged;

export function DragController() {
  const { camera, gl, controls } = useThree() as any;
  const setDragInfo = useStore((s) => s.setDragInfo);
  useEffect(() => { controlsRef = controls ?? null; }, [controls]);
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
      active.moved = true;
      setDragInfo(active.target.apply({ x: d1.x - d0.x, y: d1.y - d0.y, z: d1.z - d0.z }, active.shift, ev.altKey));
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
