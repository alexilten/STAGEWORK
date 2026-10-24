import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import type { SceneGraph } from '../core/engine/scene';
import { useStore } from '../ui/store';
import { beginDrag, type Axis } from './DragController';

type Vec3 = [number, number, number];

/** Which axes a selection can move along, and where the handle sits (STAGECRAFT mm). */
export function gizmoFor(group: string, scene: SceneGraph): { anchor: Vec3; axes: Axis[] } | null {
  const r = scene.report;
  if (group.startsWith('led:')) {
    const L = r.led.find((l) => `led:${l.id}` === group);
    return L ? { anchor: [L.origin[0], L.origin[1] - L.sagitta - 60, (L.origin[2] + L.top) / 2], axes: ['x', 'y', 'z'] } : null;
  }
  if (group === 'truss:front') {
    const T = r.truss.find((t) => t.id === 'FOH');
    return T ? { anchor: [T.center[0], T.center[1], T.bottom], axes: ['y', 'z'] } : null;
  }
  if (group.startsWith('riser:')) {
    const A = r.stage.areas.find((a) => a.group === group);
    return A ? { anchor: [(A.minX + A.maxX) / 2, (A.minY + A.maxY) / 2, A.top + 30], axes: ['x', 'y'] } : null;
  }
  if (group === 'seating' && r.seating?.count) return { anchor: [0, -r.seating.frontDistance - 400, 0], axes: ['y'] };
  return null;
}

// Apple system colours: x red, y (upstage) green, z blue
const COLOR: Record<Axis, string> = { x: '#ff453a', y: '#30d158', z: '#0a84ff' };
// unit arrow along +Y in local space, rotated per axis (in the Z-up world group)
const ROT: Record<Axis, THREE.Euler> = { x: new THREE.Euler(0, 0, -Math.PI / 2), y: new THREE.Euler(0, 0, 0), z: new THREE.Euler(Math.PI / 2, 0, 0) };

/** Axis handles on the selected draggable group. Each handle constrains the drag to its axis. */
export function Gizmo() {
  const sel = useStore((s) => s.selection);
  const scene = useStore((s) => s.scene);
  const dragging = useStore((s) => s.dragInfo != null);
  const spec = sel && !sel.objectId ? gizmoFor(sel.group, scene) : null;
  if (!spec || !sel) return null;
  return <Handles group={sel.group} anchor={spec.anchor} axes={spec.axes} dim={dragging} />;
}

function Handles({ group, anchor, axes, dim }: { group: string; anchor: Vec3; axes: Axis[]; dim: boolean }) {
  const ref = useRef<THREE.Group>(null!);
  const camera = useThree((s) => s.camera);
  const [hot, setHot] = useState<Axis | null>(null);
  const world = new THREE.Vector3();
  // constant on-screen size: scale with camera distance (world group is mm)
  useFrame(() => {
    ref.current.getWorldPosition(world);
    const k = camera.position.distanceTo(world) * 1000 * 0.075;
    ref.current.scale.setScalar(k);
  });
  const down = (axis: Axis) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    beginDrag(group, { ray: e.ray, shiftKey: false, axis });
  };
  return (
    <group ref={ref} position={anchor}>
      {axes.map((a) => {
        const on = hot === a;
        const mat = <meshBasicMaterial color={COLOR[a]} transparent opacity={dim && !on ? 0.35 : on ? 1 : 0.88} depthTest={false} toneMapped={false} />;
        return (
          <group key={a} rotation={ROT[a]}
            onPointerDown={down(a)} onClick={(e) => e.stopPropagation()}
            onPointerOver={(e) => { e.stopPropagation(); setHot(a); document.body.style.cursor = 'grab'; }}
            onPointerOut={() => { setHot(null); document.body.style.cursor = ''; }}>
            <mesh renderOrder={1000}><cylinderGeometry args={[on ? 0.03 : 0.022, on ? 0.03 : 0.022, 1.5, 12]} />{mat}</mesh>
            {[1, -1].map((s) => (
              <mesh key={s} renderOrder={1000} position={[0, s * 0.82, 0]} rotation={[s > 0 ? 0 : Math.PI, 0, 0]}>
                <coneGeometry args={[0.085, 0.22, 20]} />{mat}
              </mesh>
            ))}
            {/* generous invisible hit target */}
            <mesh><cylinderGeometry args={[0.12, 0.12, 1.9, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
          </group>
        );
      })}
      <mesh renderOrder={1001}><sphereGeometry args={[0.07, 20, 12]} /><meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} /></mesh>
    </group>
  );
}
