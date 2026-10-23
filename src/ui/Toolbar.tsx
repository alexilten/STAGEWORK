import { useEffect, useRef, useState } from 'react';
import type { SystemKey } from '../core/engine/types';
import { PRESETS } from '../core/presets';
import { parseProject } from '../core/schema';
import { export3dm, exportBom, exportProject, loadRhino } from '../export/browser';
import { Segmented } from './controls';
import { Icon } from './icons';
import { useStore } from './store';

export function Toolbar({ onToast }: { onToast: (msg: string) => void }) {
  const project = useStore((s) => s.project);
  const edit = useStore((s) => s.edit);
  const loadPreset = useStore((s) => s.loadPreset);
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
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportProject(useStore.getState().project); }
      if (!mod && e.key === 't') setMode(useStore.getState().mode === 'technical' ? 'presentation' : 'technical');
      const views = { '1': 'perspective', '2': 'front', '3': 'side', '4': 'plan', '5': 'iso' } as const;
      if (!mod && e.key in views) useStore.getState().setView(views[e.key as keyof typeof views]);
      if (e.key === 'Escape') useStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setMode]);

  const openFile = async (f: File) => {
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
  };

  return (
    <header className="toolbar glass">
      <div className="tb-group">
        <div className="logo" aria-label="STAGECRAFT"><span className="logo-mark" />STAGECRAFT</div>
        <span className="tb-sep" />
        <input className="project-name" value={project.name} onChange={(e) => edit((p) => { p.name = e.target.value; }, 'name')} spellCheck={false} />
      </div>
      <div className="tb-group">
        <div className="select tb-select">
          <select value={project.presetId ?? ''} onChange={(e) => loadPreset(e.target.value)} title="Start from a preset">
            {!project.presetId && <option value="">Custom</option>}
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="chev"><Icon.chevron /></span>
        </div>
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
        <button className="icon-btn" onClick={() => exportProject(project)} title="Save project (⌘S)"><Icon.save /></button>
        <div className="export-wrap">
          <button className="primary" onClick={() => setExportOpen(!exportOpen)}><Icon.export /> Export</button>
          {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} onToast={onToast} />}
        </div>
      </div>
    </header>
  );
}

const SYSTEM_SETS: { label: string; systems?: SystemKey[] }[] = [
  { label: 'Entire stage' },
  { label: 'Stage only', systems: ['decking', 'supports', 'finishes'] },
  { label: 'LED only', systems: ['ledCabinets', 'ledSupports'] },
  { label: 'Rigging + lighting', systems: ['rigging', 'lighting'] },
];

function ExportMenu({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [version, setVersion] = useState<'8' | '7'>('8');
  const [set, setSet] = useState(0);
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown> | unknown, msg: string) => {
    setBusy(true);
    try { await fn(); onToast(msg); onClose(); } catch (e) { onToast(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const { scene, project } = useStore.getState();
  return (
    <div className="menu glass" onMouseLeave={onClose}>
      <div className="menu-title">Rhino model</div>
      <div className="menu-row">
        <Segmented size="sm" value={version} onChange={setVersion} options={[{ value: '8', label: 'Rhino 8' }, { value: '7', label: 'Rhino 7' }]} />
      </div>
      <div className="menu-row column">
        {SYSTEM_SETS.map((s, i) => (
          <label key={s.label} className="radio"><input type="radio" checked={set === i} onChange={() => setSet(i)} /> {s.label}</label>
        ))}
      </div>
      <button className="primary wide" disabled={busy} onClick={() => go(async () => {
        const n = await export3dm(scene, project, { version: +version as 7 | 8, systems: SYSTEM_SETS[set].systems });
        return n;
      }, 'Rhino .3dm exported')}>{busy ? 'Preparing…' : 'Export .3dm'}</button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => go(() => exportBom(scene, project), 'Bill of materials exported')}>Bill of materials <span>.csv</span></button>
      <button className="menu-item" onClick={() => go(() => exportProject(project), 'Project saved')}>Project file <span>.json</span></button>
      <div className="menu-item disabled" title="Round 4">GLB · FBX · DXF · STEP <span>planned</span></div>
    </div>
  );
}
