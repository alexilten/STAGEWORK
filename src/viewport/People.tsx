import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { FigureKind, SceneObject } from '../core/engine/types';
import { useStore, type ViewMode } from '../ui/store';
import { ACCENT, lookFor } from './materials';
import { isDragging } from './DragController';

/**
 * People in the viewport. The engine keeps every person as a two-cylinder proxy (that is what the
 * Rhino / CAD exports carry); here each one is swapped for a sculpted figure built offline by
 * scripts/people/build_people.py from the CC0 MakeHuman body:
 *   presenter  ~36k triangles, smooth: the figure every camera view frames
 *   crowd-a…g  seven low-poly audience figures, ~700 triangles near, ~350 far, flat shaded
 * Meshes load once and are shared; sliders only rewrite instance matrices, never geometry.
 */
const FILES = import.meta.glob('./people/*.bin', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const CROWD = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
/** beyond this distance (m) a crowd figure switches to its far mesh and stops casting a shadow */
const NEAR_M = 32;

type Meshes = Record<string, THREE.BufferGeometry>;
let loading: Promise<Meshes> | null = null;
let loaded: Meshes | null = null;

function parse(buf: ArrayBuffer, flat: boolean) {
  const [nv, nt] = new Uint32Array(buf, 0, 2);
  const q = new Int16Array(buf, 8, nv * 3);
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i] / 10; // 0.1 mm → mm
  const off = 8 + nv * 6;
  const idx = nv > 65535 ? new Uint32Array(buf.slice(off, off + nt * 12)) : new Uint16Array(buf.slice(off, off + nt * 6));
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (flat) g = g.toNonIndexed(); // faceted, like low-poly scan people
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function loadPeople(): Promise<Meshes> {
  if (!loading) {
    loading = Promise.all(Object.entries(FILES).map(async ([path, url]) => {
      const name = path.split('/').pop()!.replace('.bin', '');
      const buf = await (await fetch(url)).arrayBuffer();
      return [name, parse(buf, name !== 'presenter')] as const;
    })).then((list) => (loaded = Object.fromEntries(list)));
  }
  return loading;
}

/** the sculpted meshes once they have loaded (null until then: the proxies draw meanwhile) */
export function usePeople() {
  const [m, setM] = useState<Meshes | null>(loaded);
  useEffect(() => { if (!m) loadPeople().then(setM).catch(() => undefined); }, [m]);
  return m;
}

/** stable 0…1 from an id, so a figure keeps its variant, height and turn while sliders move */
function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function figureMatrix(o: SceneObject, out: THREE.Matrix4, jitter: boolean) {
  const h = jitter ? hash(o.id) : 0.5;
  _q.setFromAxisAngle(_z, o.rotationZ + (jitter ? (h - 0.5) * 0.7 : 0));
  const k = jitter ? 0.96 + ((h * 7.31) % 1) * 0.08 : 1;
  return out.compose(_p.set(o.position[0], o.position[1], o.position[2]), _q, _s.set(k, k, k));
}

const MESH_FOR: Record<Exclude<FigureKind, 'crowd'>, string> = { presenter: 'presenter', crew: 'crowd-a', dj: 'crowd-g' };

export function People({ objects, meshes }: { objects: SceneObject[]; meshes: Meshes }) {
  const mode = useStore((s) => s.mode);
  const by = useMemo(() => {
    const out: Record<FigureKind, SceneObject[]> = { presenter: [], crowd: [], crew: [], dj: [] };
    for (const o of objects) out[o.figure!].push(o);
    return out;
  }, [objects]);
  return (
    <group>
      {(['presenter', 'crew', 'dj'] as const).map((k) => by[k].length > 0 && meshes[MESH_FOR[k]] && (
        <Figures key={k + mode} geo={meshes[MESH_FOR[k]]} objects={by[k]} mode={mode} mat={k === 'crew' ? 'crowd' : 'presenter'} flat={k !== 'presenter'} />
      ))}
      {by.crowd.length > 0 && <Crowd objects={by.crowd} meshes={meshes} mode={mode} />}
    </group>
  );
}

function useLook(mat: 'presenter' | 'crowd', mode: ViewMode, flat: boolean) {
  const look = lookFor(mat, mode, 'white');
  const material = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: flat }), [flat]);
  useLayoutEffect(() => {
    material.color.set('#ffffff');
    material.roughness = look.roughness;
    material.metalness = 0;
    material.envMapIntensity = mode === 'technical' ? 0.4 : 0.9;
  }, [material, look.roughness, mode]);
  useEffect(() => () => material.dispose(), [material]);
  return { material, color: look.color };
}

function tint(o: SceneObject, base: THREE.Color, out: THREE.Color, mode: ViewMode) {
  const { selection, hover } = useStore.getState();
  out.copy(base);
  if (selection && (selection.objectId ? selection.objectId === o.id : selection.group === o.group)) out.lerp(ACCENT, mode === 'technical' ? 0.55 : 0.4);
  else if (selection && selection.group === o.group) out.lerp(ACCENT, 0.18);
  else if (hover === o.group) out.lerp(ACCENT, 0.12);
  return out;
}

/** a handful of individual figures (presenter, camera operators, DJ) */
function Figures({ geo, objects, mode, mat, flat }: { geo: THREE.BufferGeometry; objects: SceneObject[]; mode: ViewMode; mat: 'presenter' | 'crowd'; flat: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const { material, color } = useLook(mat, mode, flat);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const handlers = handlersFor(() => objects);
  useLayoutEffect(() => {
    const m = ref.current, M = new THREE.Matrix4();
    objects.forEach((o, i) => m.setMatrixAt(i, figureMatrix(o, M, false)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [objects]);
  useLayoutEffect(() => {
    const m = ref.current, base = new THREE.Color(color), c = new THREE.Color();
    objects.forEach((o, i) => m.setColorAt(i, tint(o, base, c, mode)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [objects, color, selection, hover, mode]);
  return <instancedMesh ref={ref} args={[geo, material, objects.length]} castShadow receiveShadow {...handlers} />;
}

/**
 * The standing crowd: seven variants, each a near and a far instanced mesh. Every figure keeps its
 * variant, turn and height from its id; which mesh it sits in follows the camera (checked a few
 * times a second, only when the camera has moved).
 */
function Crowd({ objects, meshes, mode }: { objects: SceneObject[]; meshes: Meshes; mode: ViewMode }) {
  const { material, color } = useLook('crowd', mode, true);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const nearRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const farRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  // instance index → object, per mesh, for picking
  const lists = useRef<{ near: SceneObject[][]; far: SceneObject[][] }>({ near: [], far: [] });
  const variants = useMemo(() => {
    const v: SceneObject[][] = CROWD.map(() => []);
    for (const o of objects) v[Math.floor(hash(o.id) * CROWD.length) % CROWD.length].push(o);
    return v;
  }, [objects]);
  const matrices = useMemo(() => {
    const M = new THREE.Matrix4();
    return variants.map((list) => list.map((o) => figureMatrix(o, M, true).clone()));
  }, [variants]);
  const last = useRef({ t: -1, x: NaN, y: NaN, z: NaN });

  const assign = (cam: THREE.Vector3) => {
    const P = new THREE.Vector3();
    variants.forEach((list, v) => {
      const near = nearRefs.current[v], far = farRefs.current[v];
      if (!near || !far) return;
      const ln: SceneObject[] = [], lf: SceneObject[] = [];
      list.forEach((o, i) => {
        // model mm, Z up → three.js metres, Y up
        P.set(o.position[0] / 1000, o.position[2] / 1000, -o.position[1] / 1000);
        const close = P.distanceTo(cam) < NEAR_M;
        const mesh = close ? near : far, arr = close ? ln : lf;
        mesh.setMatrixAt(arr.length, matrices[v][i]);
        arr.push(o);
      });
      near.count = ln.length; far.count = lf.length;
      near.instanceMatrix.needsUpdate = far.instanceMatrix.needsUpdate = true;
      near.computeBoundingSphere(); far.computeBoundingSphere();
      lists.current.near[v] = ln; lists.current.far[v] = lf;
    });
    paint();
  };
  const paint = () => {
    const base = new THREE.Color(color), c = new THREE.Color();
    for (const [refs, key] of [[nearRefs, 'near'], [farRefs, 'far']] as const) {
      refs.current.forEach((m, v) => {
        if (!m) return;
        (lists.current[key][v] ?? []).forEach((o, i) => m.setColorAt(i, tint(o, base, c, mode)));
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });
    }
  };

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime, c = camera.position, L = last.current;
    if (L.t >= 0 && t - L.t < 0.25) return;
    if (L.t >= 0 && Math.hypot(c.x - L.x, c.y - L.y, c.z - L.z) < 0.75) return;
    L.t = t; L.x = c.x; L.y = c.y; L.z = c.z;
    assign(c);
  });
  // new layout (slider moved): reassign right away from the last camera position
  useLayoutEffect(() => { last.current.t = -1; }, [matrices]);
  useLayoutEffect(paint, [selection, hover, color, mode]);

  return (
    <group>
      {CROWD.map((k, v) => {
        const n = Math.max(1, variants[v].length);
        const hn = handlersFor(() => lists.current.near[v] ?? []);
        const hf = handlersFor(() => lists.current.far[v] ?? []);
        return (
          <group key={k}>
            <instancedMesh ref={(m) => { nearRefs.current[v] = m; }} args={[meshes[`crowd-${k}`], material, n]} count={0} castShadow receiveShadow frustumCulled={false} {...hn} />
            <instancedMesh ref={(m) => { farRefs.current[v] = m; }} args={[meshes[`crowd-${k}-far`] ?? meshes[`crowd-${k}`], material, n]} count={0} receiveShadow frustumCulled={false} {...hf} />
          </group>
        );
      })}
    </group>
  );
}

/** click selects the figure's group (again: the single figure); hover highlights it */
function handlersFor(list: () => SceneObject[]) {
  const { select, setHover } = useStore.getState();
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (isDragging()) return;
      const o = list()[e.instanceId ?? 0];
      if (!o) return;
      const s = useStore.getState().selection;
      select(s && s.group === o.group ? { group: o.group, objectId: o.id } : { group: o.group });
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(list()[e.instanceId ?? 0]?.group ?? null);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => { setHover(null); document.body.style.cursor = ''; },
  };
}
