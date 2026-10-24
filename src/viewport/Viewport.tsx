import { CameraControls, Environment, Grid, Html, Lightformer, Line } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SceneGraph } from '../core/engine/scene';
import { formatLength } from '../core/units';
import { useStore, type CameraView } from '../ui/store';
import { StageModel } from './StageModel';
import { DragController } from './DragController';
import { Gizmo } from './Gizmo';
import type { Annotation } from '../core/engine/types';

/** World is mm, Z-up (see core/schema.ts). three.js is Y-up metres → one wrapping transform. */
const WORLD_ROTATION = new THREE.Euler(-Math.PI / 2, 0, 0);
const MM = 0.001;
const toThree = (v: [number, number, number]) => new THREE.Vector3(v[0] * MM, v[2] * MM, -v[1] * MM);

export function Viewport() {
  const scene = useStore((s) => s.scene);
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const dims = useStore((s) => s.layers.dimensions);
  const tech = mode === 'technical';
  const b = scene.bounds;
  const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * MM;

  return (
    <Canvas
      className="viewport"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 32, near: 0.5, far: 1500, position: [-18, 10, 40] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0, preserveDrawingBuffer: true }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[tech ? '#f6f6f8' : '#f3f3f5']} />
      <hemisphereLight args={['#ffffff', '#e9e6e1', tech ? 1.4 : 0.55]} />
      <directionalLight
        position={[-9, 22, 16]} intensity={tech ? 0.9 : 2.1} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-camera-far={120}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 12, 2]} rotation-x={Math.PI / 2} scale={[30, 10, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-18, 5, 8]} rotation-y={Math.PI / 2} scale={[24, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[18, 5, 8]} rotation-y={-Math.PI / 2} scale={[24, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 4, 24]} scale={[30, 6, 1]} />
        <Lightformer form="ring" intensity={0.6} color="#dfe8ff" position={[0, 6, -22]} scale={10} />
      </Environment>

      <group rotation={WORLD_ROTATION} scale={MM}>
        <StageModel scene={scene} />
        {dims ? <Dimensions items={scene.annotations} /> : <SelectionDims scene={scene} />}
        <DragGuides scene={scene} />
        <Gizmo />
      </group>

      {/* shadow-catcher floor (ContactShadows accumulated stale shadows under postprocessing, which disables autoClear) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -(b.min[1] + b.max[1]) / 2 * MM]} receiveShadow>
        <planeGeometry args={[span * 6, span * 6]} />
        <shadowMaterial transparent opacity={tech ? 0.1 : 0.2} color="#23232b" />
      </mesh>
      {tech && (
        <Grid position={[0, 0, 0]} args={[200, 200]} cellSize={1} sectionSize={5} cellThickness={0.5} sectionThickness={0.9}
          cellColor="#d9d9de" sectionColor="#bdbdc6" fadeDistance={70} fadeStrength={1.6} infiniteGrid />
      )}
      <CameraRig scene={scene} />
      <DragController />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={0.9} intensity={tech ? 1.2 : 2.4} distanceFalloff={0.6} halfRes color="#1a1a22" />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * Presentation mode keeps the model clean: dimensions appear only for the current selection,
 * in a quieter style, plus the clearances that matter for it.
 */
function SelectionDims({ scene }: { scene: SceneGraph }) {
  const sel = useStore((s) => s.selection);
  const items = useMemo(() => (sel ? selectionDims(sel.group, scene) : []), [sel, scene]);
  return items.length ? <Dimensions items={items} subtle /> : null;
}

export function selectionDims(group: string, scene: SceneGraph): Annotation[] {
  const r = scene.report;
  const H = r.stage.height.resolved;
  const dimsWith = (prefix: string) => scene.annotations.filter((a) => a.kind === 'dim' && a.id.startsWith(prefix));
  if (group === 'stage') return [...dimsWith('DIM.STAGE.'), ...dimsWith('DIM.THRUST.'), ...dimsWith('DIM.RUNWAY.'), ...dimsWith('DIM.BSTAGE.'), ...dimsWith('DIM.APRON.')];
  if (group.startsWith('riser:')) return dimsWith(`DIM.RISER_${group.slice(6).toUpperCase()}.`);
  if (group === 'seating') return dimsWith('DIM.SEAT.');
  const L = r.led.find((l) => `led:${l.id}` === group);
  if (L) {
    const out = dimsWith(`DIM.LED.${L.id.toUpperCase()}.`);
    const hdr = r.truss.find((t) => t.id === `HDR_${L.id.toUpperCase()}`);
    const x = L.origin[0] + L.chord / 2 + 450, y = L.origin[1] - L.sagitta;
    if (hdr) out.push({ id: `CLR.LED.${L.id}.HEADER`, kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x, y, L.top], to: [x, y, hdr.bottom], value: hdr.bottom - L.top, label: 'Clearance to header truss' });
    return out;
  }
  const T = group === 'truss:front' ? r.truss.find((t) => t.id === 'FOH') : undefined;
  if (T) {
    const x = T.center[0] + T.length / 2 + 400;
    return [
      { id: 'CLR.FOH.TRIM', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x, T.center[1], H], to: [x, T.center[1], T.bottom], value: T.bottom - H, label: 'Trim above deck' },
      { id: 'CLR.FOH.DIST', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x, 0, H], to: [x, T.center[1], H], value: -T.center[1], label: 'Distance from stage' },
    ];
  }
  return [];
}

function Dimensions({ items, subtle }: { items: Annotation[]; subtle?: boolean }) {
  const units = useStore((s) => s.project.units);
  return (
    <group>
      {items.map((a) => {
        const mid: [number, number, number] = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2, (a.from[2] + a.to[2]) / 2];
        const color = a.kind === 'line' ? '#9b9ba3' : subtle ? '#6e6e78' : '#0a84ff';
        return (
          <group key={a.id}>
            <Line points={[a.from, a.to]} color={color} lineWidth={a.kind === 'line' ? 1 : 1.25} dashed={a.kind === 'line'} dashSize={300} gapSize={200} />
            {a.kind === 'dim' && (
              <>
                {[a.from, a.to].map((p, i) => (
                  <Line key={i} points={[[p[0], p[1], p[2] - 120], [p[0], p[1], p[2] + 120]]} color={color} lineWidth={1.25} />
                ))}
                <Html position={mid} center zIndexRange={[5, 0]} className="dim-label-wrap">
                  <div className={`dim-label ${subtle ? 'subtle' : ''}`} title={a.label}>{subtle && a.label ? <span>{a.label}</span> : null}{formatLength(a.value ?? 0, units, { precise: true })}</div>
                </Html>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

function viewFor(view: CameraView, b: SceneGraph['bounds']) {
  const c = toThree([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
  const w = (b.max[0] - b.min[0]) * MM, d = (b.max[1] - b.min[1]) * MM, h = (b.max[2] - b.min[2]) * MM;
  const s = Math.max(w, h * 1.6, d);
  switch (view) {
    case 'front': return { fov: 10, pos: c.clone().add(new THREE.Vector3(0, 0, s * 8.2)), target: c };
    case 'side': return { fov: 10, pos: c.clone().add(new THREE.Vector3(Math.max(d, h * 1.8) * 9.5 + w / 2, 0, 0)), target: c };
    case 'plan': return { fov: 10, pos: c.clone().add(new THREE.Vector3(0, s * 8.2, 0.001)), target: c };
    case 'house': return { fov: 32, pos: c.clone().add(new THREE.Vector3(-s * 0.3, s * 0.62, s * 1.05)), target: c.clone().add(new THREE.Vector3(0, 0, -d * 0.12)) };
    case 'iso': return { fov: 24, pos: c.clone().add(new THREE.Vector3(s * 1.25, s * 1.15, s * 1.85)), target: c };
    default: return { fov: 30, pos: c.clone().add(new THREE.Vector3(-s * 1.05, s * 0.72, s * 2.35)), target: c.clone().add(new THREE.Vector3(0, -h * 0.1, 0)) };
  }
}

function CameraRig({ scene }: { scene: SceneGraph }) {
  const ref = useRef<CameraControls>(null!);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const view = useStore((s) => s.view);
  const nonce = useStore((s) => s.viewNonce);
  const boundsKey = useMemo(() => JSON.stringify(view === 'house' ? scene.houseBounds : scene.bounds), [scene, view]);
  const first = useRef(true);
  useEffect(() => {
    const v = viewFor(view, view === 'house' ? scene.houseBounds : scene.bounds);
    const animate = !first.current;
    first.current = false;
    camera.fov = v.fov;
    camera.updateProjectionMatrix();
    ref.current?.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, nonce]);
  // keep the orbit target centred on the stage as it changes size, without moving the camera abruptly
  useEffect(() => {
    if (first.current) return;
    const v = viewFor(view, view === 'house' ? scene.houseBounds : scene.bounds);
    ref.current?.setTarget(v.target.x, v.target.y, v.target.z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);
  return <CameraControls ref={ref} makeDefault minDistance={2} maxDistance={400} maxPolarAngle={Math.PI * 0.495} smoothTime={0.35} draggingSmoothTime={0.08} dollyToCursor />;
}

/** While dragging: centreline, stage front and deck-top datum, so moves read against the stage. */
function DragGuides({ scene }: { scene: SceneGraph }) {
  const dragging = useStore((s) => s.dragInfo != null);
  const sel = useStore((s) => s.selection);
  if (!dragging) return null;
  const st = scene.report.stage;
  const W = st.width.resolved, D = st.depth.resolved, H = st.height.resolved;
  const L = scene.report.led.find((l) => `led:${l.id}` === sel?.group);
  const centred = L && Math.abs(L.origin[0]) < 0.5;
  return (
    <group>
      <Line points={[[0, -4000, H], [0, D + 6000, H]]} color={centred ? '#0a84ff' : '#a1a1a6'} lineWidth={centred ? 2 : 1} dashed dashSize={250} gapSize={150} />
      <Line points={[[0, D + 400, 0], [0, D + 400, 14000]]} color={centred ? '#0a84ff' : '#a1a1a6'} lineWidth={centred ? 2 : 1} dashed dashSize={250} gapSize={150} />
      <Line points={[[-W / 2 - 3000, D + 400, H], [W / 2 + 3000, D + 400, H]]} color="#a1a1a6" lineWidth={1} dashed dashSize={250} gapSize={150} />
      {L && <Line points={[[L.origin[0], L.origin[1] - L.sagitta - 20, H], [L.origin[0], L.origin[1] - L.sagitta - 20, L.origin[2]]]} color="#0a84ff" lineWidth={1.5} />}
    </group>
  );
}

