/**
 * Direct manipulation. Dragging a selected LED wall moves it in its own plane
 * (horizontal offset + elevation); with Shift it moves on the floor plane (offset + upstage).
 * The front truss drags its trim height (Shift: distance from the stage). Seating slides up/downstage.
 * Values snap to production-meaningful steps; hold Alt for 1 mm steps.
 * Every move goes through store.edit(), so the engine re-resolves and undo is one step per drag.
 */
import * as THREE from 'three';
import { getCatalogItem, type LedCabinet } from '../core/catalog';
import { formatLength } from '../core/units';
import { useStore } from '../ui/store';

export interface DragTarget {
  group: string;
  label: string;
  /** apply a world-space delta (mm, STAGECRAFT axes) to the starting params */
  apply: (d: { x: number; y: number; z: number }, shift: boolean, fine: boolean) => string;
  /** plane to drag on, in STAGECRAFT world mm: a point on the plane */
  anchor: [number, number, number];
  /** drag on the floor plane regardless of Shift */
  floor?: boolean;
}

const snap = (v: number, step: number) => Math.round(v / step) * step;

export function dragTargetFor(group: string): DragTarget | null {
  const { project, scene } = useStore.getState();
  const units = project.units;
  if (group.startsWith('led:')) {
    const id = group.slice(4);
    const i = project.ledWalls.findIndex((w) => w.id === id);
    const L = scene.report.led.find((l) => l.id === id);
    if (i < 0 || !L) return null;
    const w0 = { ...project.ledWalls[i] };
    const cab = getCatalogItem<LedCabinet>(w0.cabinetId, 'led-cabinet');
    const key = `drag:${group}:${performance.now()}`;
    return {
      group, label: w0.name, anchor: [L.origin[0], L.origin[1] - L.sagitta, L.origin[2]],
      apply: (d, shift, fine) => {
        const sx = fine ? 1 : cab.width / 2, sz = fine ? 1 : 50;
        const offsetX = w0.offsetX + snap(d.x, sx);
        const elevation = shift ? w0.elevation : Math.max(-2000, w0.elevation + snap(d.z, sz));
        const upstageGap = shift ? w0.upstageGap + snap(d.y, sz) : w0.upstageGap;
        useStore.getState().edit((p) => { Object.assign(p.ledWalls[i], { offsetX, elevation, upstageGap }); }, key);
        return shift
          ? `${w0.name} · x ${formatLength(offsetX, units, { precise: true })} · upstage ${formatLength(upstageGap, units, { precise: true })}`
          : `${w0.name} · x ${formatLength(offsetX, units, { precise: true })} · ${formatLength(elevation, units, { precise: true })} above deck`;
      },
    };
  }
  if (group === 'truss:front') {
    const f0 = { ...project.rigging.front };
    const key = `drag:${group}:${performance.now()}`;
    return {
      group, label: 'Front truss', anchor: [0, -f0.distance, f0.trim],
      apply: (d, shift, fine) => {
        const st = fine ? 1 : 100;
        const trim = shift ? f0.trim : Math.max(3000, f0.trim + snap(d.z, st));
        const distance = shift ? Math.max(500, f0.distance - snap(d.y, st)) : f0.distance;
        useStore.getState().edit((p) => { p.rigging.front.trim = trim; p.rigging.front.distance = distance; }, key);
        return shift ? `Front truss · ${formatLength(distance, units, { precise: true })} from stage` : `Front truss · trim ${formatLength(trim, units, { precise: true })}`;
      },
    };
  }
  if (group.startsWith('riser:')) {
    const id = group.slice(6);
    const i = (project.stage.risers ?? []).findIndex((r) => r.id === id);
    const A = scene.report.stage.areas.find((a) => a.group === group);
    if (i < 0 || !A) return null;
    const r0 = { ...project.stage.risers![i] };
    const S = scene.report.stage.system.short;
    const key = `drag:${group}:${performance.now()}`;
    return {
      group, label: r0.name, anchor: [(A.minX + A.maxX) / 2, A.minY, A.top], floor: true,
      apply: (d, _shift, fine) => {
        const x = r0.x + snap(d.x, fine ? 1 : S / 2);
        const y = Math.max(0, r0.y + snap(d.y, fine ? 1 : S));
        useStore.getState().edit((p) => { Object.assign(p.stage.risers![i], { x, y }); }, key);
        return `${r0.name} · x ${formatLength(x, units, { precise: true })} · ${formatLength(y, units, { precise: true })} upstage`;
      },
    };
  }
  if (group === 'seating' && project.seating && scene.report.seating) {
    const s0 = { ...project.seating };
    const key = `drag:${group}:${performance.now()}`;
    return {
      group, label: 'Seating', anchor: [0, -scene.report.seating.frontDistance, 0], floor: true,
      apply: (d, _shift, fine) => {
        const frontDistance = Math.max(1000, s0.frontDistance - snap(d.y, fine ? 1 : 50));
        useStore.getState().edit((p) => { p.seating.frontDistance = frontDistance; }, key);
        return `Seating · front row ${formatLength(frontDistance, units, { precise: true })} from stage`;
      },
    };
  }
  return null;
}

/** STAGECRAFT mm (Z-up) ↔ three.js metres (Y-up) */
export const toThree = (v: [number, number, number]) => new THREE.Vector3(v[0] / 1000, v[2] / 1000, -v[1] / 1000);
export const fromThree = (v: THREE.Vector3) => ({ x: v.x * 1000, y: -v.z * 1000, z: v.y * 1000 });
