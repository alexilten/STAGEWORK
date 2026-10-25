import { useEffect, useRef, useState } from 'react';
import type { SystemKey } from '../core/engine/types';
import { parseProject } from '../core/schema';
import { export3dm, exportBom, exportDimensionScript, exportDxfFile, exportFbxFile, exportGlbFile, exportProject, exportStepFile, loadRhino } from '../export/browser';
import { getCatalogItem, type LedCabinet } from '../core/catalog';
import { PresetPicker } from './PresetPicker';
import { Segmented } from './controls';
import { Icon } from './icons';
import { MediaButton } from './MediaButton';
import { glbMedia } from './media';
import { projectForSave, useStore } from './store';

export function Toolbar({ onToast }: { onToast: (msg: string) => void }) {
  const project = useStore((s) => s.project);
  const edit = useStore((s) => s.edit);
  const load = useStore((s) => s.load);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) { redo(); } else { undo(); } }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportProject(projectForSave(useStore.getState().project)); }
      if (!mod && e.key === 't') setMode(useStore.getState().mode === 'technical' ? 'presentation' : 'technical');
      const views = { '1': 'perspective', '2': 'front', '3': 'side', '4': 'plan', '5': 'iso', '6': 'house' } as const;
      if (!mod && e.key in views) useStore.getState().setView(views[e.key as keyof typeof views]);
      if (e.key === 'Escape') useStore.getState().select(null);
      if (e.key.startsWith('Arrow')) {
        const st = useStore.getState();
        const g = st.selection?.group;
        if (!g?.startsWith('led:')) return;
        const i = st.project.ledWalls.findIndex((w) => `led:${w.id}` === g);
        if (i < 0) return;
        e.preventDefault();
        const w = st.project.ledWalls[i];
        const step = e.altKey ? 10 : 0;
        const sx = step || getCatalogItem<LedCabinet>(w.cabinetId, 'led-cabinet').width / 2, sz = step || 50;
        st.edit((p) => {
          const t = p.ledWalls[i];
          if (e.key === 'ArrowLeft') t.offsetX -= sx;
          if (e.key === 'ArrowRight') t.offsetX += sx;
          if (e.key === 'ArrowUp') e.shiftKey ? (t.upstageGap += sz) : (t.elevation += sz);
          if (e.key === 'ArrowDown') e.shiftKey ? (t.upstageGap -= sz) : (t.elevation -= sz);
        }, `nudge:${g}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setMode]);

  const openFile = (f: File) => openProjectFile(f, load, onToast);

  return (
    <header className="toolbar glass">
      <div className="tb-group">
        <div className="logo" aria-label="STAGECRAFT"><span className="logo-mark" />STAGECRAFT</div>
        <span className="tb-sep" />
        <input className="project-name" value={project.name} onChange={(e) => edit((p) => { p.name = e.target.value; }, 'name')} spellCheck={false} />
      </div>
      <div className="tb-group">
        <PresetPicker onToast={onToast} />
        <MediaButton onToast={onToast} />
        <span className="tb-sep" />
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"><Icon.undo /></button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)"><Icon.redo /></button>
        <span className="tb-sep" />
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'presentation', label: 'Presentation' }, { value: 'technical', label: 'Technical', title: 'T' }]} />
        <Segmented size="sm" value={project.units} onChange={(v) => edit((p) => { p.units = v; })} options={[{ value: 'metric', label: 'm' }, { value: 'imperial', label: 'ft' }]} />
      </div>
      <div className="tb-group">
        <input ref={fileRef} type="file" accept=".json,.3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Open project (.stagecraft.json or STAGECRAFT .3dm)"><Icon.open /></button>
        <button className="icon-btn" onClick={() => exportProject(projectForSave(project))} title="Save project (⌘S)"><Icon.save /></button>
        <div className="export-wrap">
          <button className="primary" onClick={() => setExportOpen(!exportOpen)}><Icon.export /> Export</button>
          {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} onToast={onToast} />}
        </div>
      </div>
    </header>
  );
}

/** open a .stagecraft.json, or a .3dm that STAGECRAFT wrote (the project rides along as a document string) */
export async function openProjectFile(f: File, load: (p: ReturnType<typeof parseProject>) => void, onToast: (m: string) => void) {
  try {
    if (f.name.endsWith('.3dm')) {
      const rh = await loadRhino();
      const doc = rh.File3dm.fromByteArray(new Uint8Array(await f.arrayBuffer()));
      let json: string | null = null;
      for (let i = 0; i < doc.strings().count; i++) { const [k, v] = doc.strings().get(i); if (k === 'stagecraft.project') json = v; }
      if (!json) throw new Error('This .3dm was not created by STAGECRAFT (no embedded project).');
      load(parseProject(json));
    } else load(parseProject(await f.text()));
    onToast(`Opened ${f.name}`);
  } catch (e) { onToast(`Could not open: ${(e as Error).message}`); }
}

export const SYSTEM_SETS: { label: string; systems?: SystemKey[] }[] = [
  { label: 'Entire stage' },
  { label: 'Stage only', systems: ['decking', 'supports', 'finishes'] },
  { label: 'LED only', systems: ['ledCabinets', 'ledSupports'] },
  { label: 'Rigging + lighting', systems: ['rigging', 'lighting'] },
  { label: 'Audience only', systems: ['seating'] },
];

const ALL_SYSTEMS: SystemKey[] = ['decking', 'supports', 'finishes', 'ledCabinets', 'ledSupports', 'rigging', 'structure', 'lighting', 'audio', 'scenic', 'seating', 'broadcast', 'dimensions', 'reference', 'venue'];

export function ExportMenu({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [version, setVersion] = useState<'8' | '7'>('8');
  const [set, setSet] = useState(0);
  const hasVenue = useStore((s) => !!s.scene.report.venue?.built);
  const [withVenue, setWithVenue] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown> | unknown, msg: string) => {
    setBusy(true);
    try { await fn(); onToast(msg); onClose(); } catch (e) { onToast(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const { scene, project } = useStore.getState();
  // the venue rides along with whichever selection is picked, unless it's unticked
  const chosen = SYSTEM_SETS[set].systems;
  const systems: SystemKey[] | undefined = !hasVenue ? chosen : withVenue ? (chosen ? [...chosen, 'venue'] : undefined) : (chosen ?? ALL_SYSTEMS).filter((k) => k !== 'venue');
  return (
    <div className="menu glass" onMouseLeave={onClose}>
      <div className="menu-title">Export</div>
      <div className="menu-row">
        <Segmented size="sm" value={version} onChange={setVersion} options={[{ value: '8', label: 'Rhino 8' }, { value: '7', label: 'Rhino 7' }]} />
      </div>
      <div className="menu-row column">
        {SYSTEM_SETS.map((s, i) => (
          <label key={s.label} className="radio"><input type="radio" checked={set === i} onChange={() => setSet(i)} /> {s.label}</label>
        ))}
        {hasVenue && <label className="radio venue-check"><input type="checkbox" checked={withVenue} onChange={(e) => setWithVenue(e.target.checked)} /> Include the venue</label>}
      </div>
      <button className="primary wide" disabled={busy} onClick={() => go(async () => {
        const n = await export3dm(scene, project, { version: +version as 7 | 8, systems });
        return n;
      }, 'Rhino .3dm exported')}>{busy ? 'Preparing…' : 'Export .3dm'}</button>
      <button className="menu-item" title="Run in Rhino 7 or 8 (RunPythonScript) after opening the .3dm: turns the dimension lines into native aligned dimensions" onClick={() => go(() => exportDimensionScript(), 'Dimension script saved — in Rhino run RunPythonScript and pick it')}>Rhino dimension script <span>.py</span></button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => go(async () => {
        const data = project.media && (useStore.getState().assets[project.media.assetId] ?? project.media.poster);
        const media = project.media && data ? await glbMedia(scene.report.led, project.media, data) : undefined;
        exportGlbFile(scene, project, systems, media);
      }, 'GLB exported')}>glTF binary (selection above) <span>.glb</span></button>
      <button className="menu-item" onClick={() => go(() => exportBom(scene, project), 'Bill of materials exported')}>Bill of materials <span>.csv</span></button>
      <button className="menu-item" onClick={() => go(() => exportProject(projectForSave(project)), 'Project saved')}>Project file <span>.json</span></button>
      <button className="menu-item" title="Maya, 3ds Max, Blender, Cinema 4D, Unreal, Unity — mm, Z-up, blocks as instances" onClick={() => go(() => exportFbxFile(scene, project, systems), 'FBX exported')}>FBX (selection above) <span>.fbx</span></button>
      <button className="menu-item" title="AutoCAD, Vectorworks, BricsCAD, SketchUp, Revit — open it and save as .dwg; DWG itself is a closed format" onClick={() => go(() => exportDxfFile(scene, project, systems), 'DXF exported — open in AutoCAD and save as DWG if needed')}>DXF for AutoCAD / DWG <span>.dxf</span></button>
      <button className="menu-item" title="SolidWorks, Inventor, Fusion, Creo, NX, CATIA, FreeCAD — exact solids, AP214" onClick={() => go(() => exportStepFile(scene, project, systems), 'STEP exported')}>STEP solids (selection above) <span>.step</span></button>
    </div>
  );
}
