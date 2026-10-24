/** Browser-side export actions. rhino3dm (≈ 2.7 MB WASM, ~1 MB gzipped) is loaded lazily on first export. */
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import type { SceneGraph } from '../core/engine/scene';
import type { SystemKey } from '../core/engine/types';
import { serializeProject, type Project } from '../core/schema';
import { bomCsv } from './bom';
import { exportRhino, type RhinoModule } from './rhino';
import { exportGlb, type GlbMedia } from './glb';

let rhinoPromise: Promise<RhinoModule> | null = null;
export function loadRhino(): Promise<RhinoModule> {
  rhinoPromise ??= import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ locateFile: () => wasmUrl }));
  return rhinoPromise;
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_') || 'stage';

export async function export3dm(scene: SceneGraph, project: Project, opts: { version: 7 | 8; systems?: SystemKey[] }) {
  const rh = await loadRhino();
  const bytes = exportRhino(rh, scene, project, { version: opts.version, systems: opts.systems });
  download(`${slug(project.name)}${opts.version === 7 ? '_R7' : ''}.3dm`, bytes as BlobPart, 'application/octet-stream');
  return bytes.length;
}
export const exportProject = (p: Project) => download(`${slug(p.name)}.stagecraft.json`, serializeProject(p), 'application/json');
export const exportBom = (s: SceneGraph, p: Project) => download(`${slug(p.name)}_BOM.csv`, bomCsv(s), 'text/csv');
export const exportGlbFile = (s: SceneGraph, p: Project, systems?: SystemKey[], media?: GlbMedia) =>
  download(`${slug(p.name)}.glb`, exportGlb(s, p.name, { systems, finish: p.stage.finish, media }) as BlobPart, 'model/gltf-binary');
