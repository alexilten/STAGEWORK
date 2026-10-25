import { create } from 'zustand';
import { resolveScene, type SceneGraph } from '../core/engine/scene';
import type { SystemKey } from '../core/engine/types';
import { DEFAULT_PRESET, getPreset } from '../core/presets';
import type { Project } from '../core/schema';
import type { Shot } from './shot';

export type ViewMode = 'presentation' | 'technical';
export type CameraView = 'perspective' | 'front' | 'side' | 'plan' | 'iso' | 'house';
export interface Selection { group: string; objectId?: string }

export const ALL_LAYERS: { key: SystemKey; label: string; rhino: string }[] = [
  { key: 'decking', label: 'Stage decking', rhino: '10_01' },
  { key: 'supports', label: 'Stage supports', rhino: '10_03' },
  { key: 'finishes', label: 'Fascia & finishes', rhino: '10_04' },
  { key: 'ledCabinets', label: 'LED cabinets', rhino: '20_01' },
  { key: 'ledSupports', label: 'LED support', rhino: '20_02' },
  { key: 'rigging', label: 'Rigging', rhino: '30_01' },
  { key: 'structure', label: 'Ground support', rhino: '30_04' },
  { key: 'lighting', label: 'Lighting', rhino: '40' },
  { key: 'audio', label: 'Audio', rhino: '50' },
  { key: 'scenic', label: 'Scenic', rhino: '60' },
  { key: 'seating', label: 'Audience', rhino: '70' },
  { key: 'broadcast', label: 'Broadcast', rhino: '80' },
  { key: 'dimensions', label: 'Dimensions', rhino: '90_01' },
  { key: 'reference', label: 'Reference', rhino: '00' },
  { key: 'venue', label: 'Venue', rhino: '05' },
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
  /** looking through a broadcast camera (null = normal orbit view) */
  shot: Shot | null;
  setShot: (s: Shot | null) => void;
  addWall: () => void;
  duplicateWall: (id: string) => void;
  removeWall: (id: string) => void;
  /** live readout while dragging in the viewport */
  dragInfo: string | null;
  setDragInfo: (s: string | null) => void;
  /** screen-content images by asset id (data: URLs), kept out of the undo history */
  assets: Record<string, string>;
  addAsset: (id: string, data: string) => void;
}

const urlPreset = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preset') : null;
const initial = (urlPreset ? getPreset(urlPreset) : DEFAULT_PRESET).build();
const layersFor = (mode: ViewMode): Record<SystemKey, boolean> => ({
  decking: true, supports: mode === 'technical', finishes: true, ledCabinets: true, ledSupports: true,
  rigging: true, structure: true, lighting: true, audio: true, scenic: true, seating: true, broadcast: true, dimensions: mode === 'technical', reference: true, venue: true,
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
    // drags/nudges are one gesture regardless of frame time; slider edits merge within 800 ms
    const merge = key != null && key === lastEditKey && (key.startsWith('drag:') || now - lastEditAt < 800);
    set({
      project: next, scene: resolveScene(next),
      past: merge ? past : [...past.slice(-199), project], future: [],
      lastEditKey: key ?? null, lastEditAt: now,
    });
  },
  load: (raw) => {
    const p = withAssetsExtracted(raw);
    set({ project: p, scene: resolveScene(p), past: [...get().past, get().project], future: [], selection: null, activeWall: p.ledWalls[0]?.id ?? '', lastEditKey: null });
  },
  loadPreset: (id) => {
    const p = getPreset(id).build();
    // the building doesn't change when the show does
    const v = get().project.venue;
    if (v?.enabled) p.venue = structuredClone(v);
    get().load(p); set({ viewNonce: get().viewNonce + 1 });
  },
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
  setView: (v) => set({ view: v, viewNonce: get().viewNonce + 1, shot: null }),
  shot: null,
  setShot: (s) => set({ shot: s, ...(s ? {} : { viewNonce: get().viewNonce + 1 }) }),
  setActiveWall: (id) => set({ activeWall: id, selection: { group: `led:${id}` } }),
  addWall: () => {
    const id = uniqueWallId(get().project);
    get().edit((p) => {
      const ref = p.ledWalls[p.ledWalls.length - 1];
      const x = ref ? ref.offsetX + ref.width / 2 + 1500 + 1500 : 0;
      p.ledWalls.push({ id, name: `Screen ${p.ledWalls.length + 1}`, cabinetId: ref?.cabinetId ?? 'roe.bp2v2', width: 3000, height: 2000, elevation: 1500, offsetX: x, upstageGap: ref ? ref.upstageGap : 300, curveDeg: 0 });
    });
    set({ activeWall: id, selection: { group: `led:${id}` } });
  },
  duplicateWall: (src) => {
    const id = uniqueWallId(get().project);
    get().edit((p) => {
      const w = p.ledWalls.find((x) => x.id === src);
      if (!w) return;
      p.ledWalls.push({ ...w, id, name: `${w.name} copy`, offsetX: w.offsetX + w.width + 500 });
    });
    set({ activeWall: id, selection: { group: `led:${id}` } });
  },
  removeWall: (id) => {
    get().edit((p) => { p.ledWalls = p.ledWalls.filter((w) => w.id !== id); });
    set({ activeWall: get().project.ledWalls[0]?.id ?? '', selection: null });
  },
  dragInfo: null,
  setDragInfo: (s) => set({ dragInfo: s }),
  assets: {},
  addAsset: (id, data) => set({ assets: { ...get().assets, [id]: data } }),
}));

/** a saved project carries its screen image inline; move it into the asset cache */
function withAssetsExtracted(p: Project): Project {
  const m = p.media;
  if (!m?.data) return p;
  useStore.getState().addAsset(m.assetId, m.data);
  const { data: _data, ...rest } = m;
  return { ...p, media: rest };
}

/**
 * The project as saved to disk: screen content inlined so the file reopens with it.
 * A video too big to inline (held as a blob: URL) saves its poster only and is relinked on open.
 */
export function projectForSave(p: Project): Project {
  const data = p.media ? useStore.getState().assets[p.media.assetId] : undefined;
  return p.media && data?.startsWith('data:') ? { ...p, media: { ...p.media, data } } : p;
}

function uniqueWallId(p: Project) {
  let n = p.ledWalls.length + 1;
  while (p.ledWalls.some((w) => w.id === `s${n}`)) n++;
  return `s${n}`;
}

const fixWall = (p: Project, id: string) => (p.ledWalls.some((w) => w.id === id) ? id : p.ledWalls[0]?.id ?? '');

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __stagecraft: typeof useStore }).__stagecraft = useStore;
