import { create } from 'zustand';
import { resolveScene, type SceneGraph } from '../core/engine/scene';
import type { SystemKey } from '../core/engine/types';
import { DEFAULT_PRESET, getPreset } from '../core/presets';
import type { Project } from '../core/schema';

export type ViewMode = 'presentation' | 'technical';
export type CameraView = 'perspective' | 'front' | 'side' | 'plan' | 'iso';
export interface Selection { group: string; objectId?: string }

export const ALL_LAYERS: { key: SystemKey; label: string; rhino: string }[] = [
  { key: 'decking', label: 'Stage decking', rhino: '10_01' },
  { key: 'supports', label: 'Stage supports', rhino: '10_03' },
  { key: 'finishes', label: 'Fascia & finishes', rhino: '10_04' },
  { key: 'ledCabinets', label: 'LED cabinets', rhino: '20_01' },
  { key: 'ledSupports', label: 'LED support', rhino: '20_02' },
  { key: 'rigging', label: 'Rigging', rhino: '30' },
  { key: 'lighting', label: 'Lighting', rhino: '40' },
  { key: 'audio', label: 'Audio', rhino: '50' },
  { key: 'scenic', label: 'Scenic', rhino: '60' },
  { key: 'dimensions', label: 'Dimensions', rhino: '90_01' },
  { key: 'reference', label: 'Reference', rhino: '00' },
];

interface State {
  project: Project;
  scene: SceneGraph;
  past: Project[];
  future: Project[];
  lastEditKey: string | null;
  lastEditAt: number;
  selection: Selection | null;
  hover: string | null;
  layers: Record<SystemKey, boolean>;
  mode: ViewMode;
  view: CameraView;
  viewNonce: number;
  activeWall: string;
  /** apply an edit; consecutive edits with the same key within 800 ms merge into one undo step */
  edit: (fn: (p: Project) => void, key?: string) => void;
  load: (p: Project) => void;
  loadPreset: (id: string) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection | null) => void;
  setHover: (g: string | null) => void;
  toggleLayer: (k: SystemKey) => void;
  setMode: (m: ViewMode) => void;
  setView: (v: CameraView) => void;
  setActiveWall: (id: string) => void;
}

const urlPreset = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preset') : null;
const initial = (urlPreset ? getPreset(urlPreset) : DEFAULT_PRESET).build();
const layersFor = (mode: ViewMode): Record<SystemKey, boolean> => ({
  decking: true, supports: mode === 'technical', finishes: true, ledCabinets: true, ledSupports: true,
  rigging: true, lighting: true, audio: true, scenic: true, dimensions: mode === 'technical', reference: true,
});

export const useStore = create<State>((set, get) => ({
  project: initial,
  scene: resolveScene(initial),
  past: [], future: [], lastEditKey: null, lastEditAt: 0,
  selection: null, hover: null,
  layers: layersFor('presentation'),
  mode: 'presentation',
  view: 'perspective', viewNonce: 0,
  activeWall: initial.ledWalls[0]?.id ?? '',

  edit: (fn, key) => {
    const { project, past, lastEditKey, lastEditAt } = get();
    const next = structuredClone(project);
    fn(next);
    const now = performance.now();
    const merge = key != null && key === lastEditKey && now - lastEditAt < 800;
    set({
      project: next, scene: resolveScene(next),
      past: merge ? past : [...past.slice(-199), project], future: [],
      lastEditKey: key ?? null, lastEditAt: now,
    });
  },
  load: (p) => set({ project: p, scene: resolveScene(p), past: [...get().past, get().project], future: [], selection: null, activeWall: p.ledWalls[0]?.id ?? '', lastEditKey: null }),
  loadPreset: (id) => { get().load(getPreset(id).build()); set({ viewNonce: get().viewNonce + 1 }); },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, scene: resolveScene(prev), past: past.slice(0, -1), future: [project, ...future], lastEditKey: null, activeWall: fixWall(prev, get().activeWall) });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const nxt = future[0];
    set({ project: nxt, scene: resolveScene(nxt), past: [...past, project], future: future.slice(1), lastEditKey: null, activeWall: fixWall(nxt, get().activeWall) });
  },
  select: (s) => set({ selection: s }),
  setHover: (g) => set({ hover: g }),
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
  setMode: (m) => set({ mode: m, layers: { ...get().layers, dimensions: m === 'technical', supports: m === 'technical' ? true : get().layers.supports } }),
  setView: (v) => set({ view: v, viewNonce: get().viewNonce + 1 }),
  setActiveWall: (id) => set({ activeWall: id }),
}));

const fixWall = (p: Project, id: string) => (p.ledWalls.some((w) => w.id === id) ? id : p.ledWalls[0]?.id ?? '');
