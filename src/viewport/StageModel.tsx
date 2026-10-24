import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MaterialKey, Part, SceneObject } from '../core/engine/types';
import type { SceneGraph } from '../core/engine/scene';
import type { StageFinish } from '../core/schema';
import { useStore, type ViewMode } from '../ui/store';
import { ACCENT, lookFor, makeEdgeMaterial, makeLedFaceMaterial } from './materials';
import { beginDrag, isDragging } from './DragController';
import { resolveMediaCanvas, type MediaRect } from '../core/engine/media';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** Local matrix that maps the unit primitive onto a Part (mm, Z-up object space). */
function partMatrix(p: Part, out: THREE.Matrix4) {
  if (p.kind === 'prism') return out.makeTranslation(0, 0, p.z0);
  if (p.kind === 'box') {
    const s = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
    return out.compose(
      new THREE.Vector3((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2),
      new THREE.Quaternion(), new THREE.Vector3(s[0], s[1], s[2]));
  }
  const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to);
  const d = b.clone().sub(a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize());
  return out.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(p.r, len, p.r));
}

const _qz = new THREE.Quaternion(), _qx = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0), _az = new THREE.Vector3(0, 0, 1);
function objectMatrix(o: SceneObject, out: THREE.Matrix4) {
  _qz.setFromAxisAngle(_az, o.rotationZ);
  if (o.tilt) _qz.multiply(_qx.setFromAxisAngle(_ax, o.tilt));
  return out.compose(new THREE.Vector3(...o.position), _qz, new THREE.Vector3(1, 1, 1));
}

interface Batch { key: string; part: Part; objects: SceneObject[]; capsule?: boolean }

export function StageModel({ scene }: { scene: SceneGraph }) {
  const layers = useStore((s) => s.layers);
  const mode = useStore((s) => s.mode);
  const finish = useStore((s) => s.project.stage.finish);
  const visible = useMemo(() => scene.objects.filter((o) => layers[o.system]), [scene, layers]);

  // group visible objects into instanced batches: one per (block|unique object, part)
  const batches = useMemo(() => {
    const byKey = new Map<string, SceneObject[]>();
    for (const o of visible) {
      const k = o.block ?? `__obj:${o.id}`;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(o);
    }
    const out: Batch[] = [];
    for (const [k, objs] of byKey) {
      const parts = objs[0].block ? scene.blocks[objs[0].block].parts : objs[0].parts!;
      parts.forEach((part, i) => out.push({ key: `${k}#${i}`, part, objects: objs, capsule: part.mat === 'presenter' }));
    }
    return out;
  }, [visible, scene.blocks]);

  const media = useScreenMedia(scene);
  const leds = useMemo(() => scene.report.led.map((L) => ({
    L, objects: visible.filter((o) => o.group === `led:${L.id}` && o.system === 'ledCabinets'),
  })).filter((x) => x.objects.length), [scene, visible]);

  return (
    <group>
      {batches.map((b) => <InstancedBatch key={b.key + mode} batch={b} mode={mode} finish={finish} />)}
      {leds.map(({ L, objects }) => <LedFaces key={L.id} id={L.id} cols={L.cols} rows={L.rows} w={L.cabinet.width} h={L.cabinet.height} objects={objects} mode={mode} media={media} />)}
    </group>
  );
}

function InstancedBatch({ batch, mode, finish }: { batch: Batch; mode: ViewMode; finish: StageFinish }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const material = useMemo(() => makeEdgeMaterial(), []);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const select = useStore((s) => s.select);
  const setHover = useStore((s) => s.setHover);
  const look = lookFor(batch.part.mat as MaterialKey, mode, finish);
  const n = batch.objects.length;
  const geom = useMemo(() => {
    const p = batch.part;
    if (p.kind === 'box') return BOX;
    if (p.kind === 'prism') {
      const shape = new THREE.Shape(p.points.map(([x, y]) => new THREE.Vector2(x, y)));
      return new THREE.ExtrudeGeometry(shape, { depth: p.z1 - p.z0, bevelEnabled: false, curveSegments: 1 });
    }
    if (!batch.capsule) return CYL;
    const len = Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1], p.to[2] - p.from[2]);
    return new THREE.CapsuleGeometry(p.r, Math.max(1, len - 2 * p.r), 8, 24);
  }, [batch]);

  useLayoutEffect(() => {
    material.color.set('#ffffff');
    material.metalness = look.metalness;
    material.roughness = look.roughness;
    material.userData.uniforms.uEdge.value = batch.part.kind === 'box' ? look.edge : 0;
    material.userData.uniforms.uEdgeColor.value.set(look.edgeColor ?? '#000');
    material.envMapIntensity = mode === 'technical' ? 0.4 : 1;
  }, [material, look, batch.part.kind, mode]);

  useLayoutEffect(() => {
    const m = ref.current, om = new THREE.Matrix4(), pm = new THREE.Matrix4();
    const p = batch.part;
    if (batch.capsule && p.kind === 'cyl') {
      // capsule fills the same envelope as the exported cylinder, unscaled so the caps stay round
      partMatrix(p, pm);
      const pos = new THREE.Vector3(), q = new THREE.Quaternion();
      pm.decompose(pos, q, new THREE.Vector3());
      pm.compose(pos, q, new THREE.Vector3(1, 1, 1));
    } else partMatrix(p, pm);
    batch.objects.forEach((o, i) => m.setMatrixAt(i, objectMatrix(o, om).multiply(pm)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [batch]);

  useLayoutEffect(() => {
    const m = ref.current, base = new THREE.Color(look.color), c = new THREE.Color();
    batch.objects.forEach((o, i) => {
      c.copy(base);
      if (selection && (selection.objectId ? selection.objectId === o.id : selection.group === o.group)) c.lerp(ACCENT, mode === 'technical' ? 0.55 : 0.4);
      else if (selection && selection.group === o.group) c.lerp(ACCENT, 0.18);
      else if (hover === o.group) c.lerp(ACCENT, 0.12);
      m.setColorAt(i, c);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [batch, look.color, selection, hover, mode]);

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isDragging()) return;
    const o = batch.objects[e.instanceId ?? 0];
    if (!o) return;
    const s = useStore.getState().selection;
    // first click selects the system group; clicking again inside it drills to the single component
    select(s && s.group === o.group ? { group: o.group, objectId: o.id } : { group: o.group });
  };

  return (
    <instancedMesh
      ref={ref}
      args={[geom, material, n]}
      castShadow={!batch.part.mat.startsWith('chair')} receiveShadow
      onClick={pick}
      onPointerDown={(e) => {
        const o = batch.objects[e.instanceId ?? 0];
        if (o && beginDrag(o.group, { ray: e.ray, shiftKey: e.shiftKey })) e.stopPropagation();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        const g = batch.objects[e.instanceId ?? 0]?.group ?? null;
        setHover(g);
        const sel = useStore.getState().selection;
        document.body.style.cursor = sel && sel.group === g && (g?.startsWith('led:') || g?.startsWith('riser:') || g?.startsWith('audio:main:') || g === 'truss:front' || g === 'seating') ? 'grab' : 'pointer';
      }}
      onPointerOut={() => { setHover(null); document.body.style.cursor = ''; }}
    />
  );
}

interface ScreenMedia { texture: THREE.Texture; rect: MediaRect }

/** the uploaded screen image as a texture, plus where it lands in world X/Z for the current walls */
function useScreenMedia(scene: SceneGraph): ScreenMedia | null {
  const media = useStore((s) => s.project.media);
  const data = useStore((s) => (media ? s.assets[media.assetId] : undefined));
  const texture = useMemo(() => {
    if (!data) return null;
    const t = new THREE.TextureLoader().load(data, () => { t.needsUpdate = true; });
    t.colorSpace = THREE.SRGBColorSpace; // decoded to linear; the output pass re-encodes, so it shows as authored
    t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }, [data]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return useMemo(() => {
    if (!texture || !media) return null;
    const c = resolveMediaCanvas(scene.report.led, media.width / media.height, media.fit);
    return c ? { texture, rect: c.rect } : null;
  }, [texture, media, scene]);
}

function LedFaces({ id, cols, rows, w, h, objects, mode, media }: { id: string; cols: number; rows: number; w: number; h: number; objects: SceneObject[]; mode: ViewMode; media: ScreenMedia | null }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const material = useMemo(() => makeLedFaceMaterial(), []);
  const selection = useStore((s) => s.selection);
  const geom = useMemo(() => {
    const g = PLANE.clone();
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(objects.length * 2), 2));
    return g;
  }, [objects.length]);
  useEffect(() => () => geom.dispose(), [geom]);

  useLayoutEffect(() => {
    const m = ref.current, om = new THREE.Matrix4();
    // plane (XY, +Z normal) → just proud of the cabinet front face (y = −4 mm, facing −Y)
    const face = new THREE.Matrix4().compose(new THREE.Vector3(0, -4, h / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(w, h, 1));
    const cell = geom.getAttribute('aCell') as THREE.InstancedBufferAttribute;
    objects.forEach((o, i) => {
      m.setMatrixAt(i, objectMatrix(o, om).multiply(face));
      cell.setXY(i, (o.meta.column as number) - 1, (o.meta.row as number) - 1);
    });
    cell.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    material.uniforms.uGrid.value.set(cols, rows);
  }, [objects, geom, w, h, cols, rows, material]);

  useLayoutEffect(() => {
    material.uniforms.uTech.value = mode === 'technical' ? 1 : 0;
    material.uniforms.uSelected.value = selection?.group === `led:${id}` ? 1 : 0;
  }, [mode, selection, id, material]);

  useLayoutEffect(() => {
    const u = material.uniforms;
    u.uHasMap.value = media ? 1 : 0;
    u.uMap.value = media?.texture ?? null;
    if (media) { const r = media.rect; u.uRect.value.set(r.cx - r.width / 2, r.cz - r.height / 2, r.width, r.height); }
  }, [media, material]);

  useFrame((_, dt) => { material.uniforms.uTime.value += dt; });

  return <instancedMesh ref={ref} args={[geom, material, objects.length]} raycast={() => null} />;
}
