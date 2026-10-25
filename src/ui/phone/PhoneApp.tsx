import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Viewport } from '../../viewport/Viewport';
import { Segmented } from '../controls';
import { Icon } from '../icons';
import { LeftPanel } from '../LeftPanel';
import { LayerList, Inspector, Production, Warnings } from '../RightPanel';
import { PresetPicker } from '../PresetPicker';
import { MediaButton } from '../MediaButton';
import { CameraShot } from '../CameraShot';
import { ExportMenu, openProjectFile } from '../Toolbar';
import { exportProject } from '../../export/browser';
import { projectForSave, useStore, type CameraView } from '../store';
import { AccordionContext } from './usePhone';
import './phone.css';

/** left-panel sections in panel order; titles match each <Section title> */
const SECTIONS: { title: string; chip: string }[] = [
  { title: 'Stage', chip: 'Stage' }, { title: 'Risers', chip: 'Risers' }, { title: 'LED media', chip: 'LED' },
  { title: 'Audience', chip: 'Audience' }, { title: 'Rigging', chip: 'Rigging' }, { title: 'Lighting', chip: 'Lighting' },
  { title: 'Structure', chip: 'Structure' }, { title: 'Audio', chip: 'Audio' }, { title: 'Show elements', chip: 'Show' },
  { title: 'Scenic', chip: 'Scenic' }, { title: 'Broadcast', chip: 'Broadcast' }, { title: 'Venue', chip: 'Venue' },
];

type DockTab = 'overview' | 'layers' | 'checks';

/**
 * Phone portrait layout. Three fixed bands so the stage never moves:
 * design sheet (top), 3D stage (centre), data dock (bottom quarter).
 * Every band scrolls inside itself; nothing resizes the viewport.
 */
export function PhoneApp() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  const mode = useStore((s) => s.mode);
  useEffect(() => { document.body.dataset.mode = mode; }, [mode]);
  const info = useStore((s) => s.dragInfo);
  // leaving the camera view hands the full screen back to the stage band: reframe once the canvas has resized
  const inShot = useStore((s) => s.shot != null);
  const wasShot = useRef(false);
  useEffect(() => {
    if (wasShot.current && !inShot) {
      const t = window.setTimeout(() => { const st = useStore.getState(); st.setView(st.view); }, 150);
      wasShot.current = inShot;
      return () => window.clearTimeout(t);
    }
    wasShot.current = inShot;
  }, [inShot]);

  return (
    <div className="app phone">
      <div className="phone-stage">
        <Viewport />
        <PhoneViewbar />
        {info && <div className="drag-info glass">{info}</div>}
      </div>
      <PhoneBar onToast={showToast} />
      <PhoneSheet />
      <PhoneDock />
      <CameraShot />
      {toast && <div className="toast glass">{toast}</div>}
    </div>
  );
}

function PhoneBar({ onToast }: { onToast: (m: string) => void }) {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [more, setMore] = useState(false);
  return (
    <header className="phone-bar glass">
      <span className="logo-mark" aria-label="STAGECRAFT" />
      <PresetPicker onToast={onToast} />
      <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo"><Icon.undo /></button>
      <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo"><Icon.redo /></button>
      <button className={`icon-btn ${more ? 'on' : ''}`} onClick={() => setMore(!more)} aria-label="More"><Icon.more /></button>
      {more && <PhoneMenu onClose={() => setMore(false)} onToast={onToast} />}
    </header>
  );
}

function PhoneMenu({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const project = useStore((s) => s.project);
  const edit = useStore((s) => s.edit);
  const load = useStore((s) => s.load);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  if (exporting) return <div className="phone-menu-wrap"><ExportMenu onClose={onClose} onToast={onToast} /></div>;
  return (
    <div className="menu glass phone-menu">
      <input className="project-name" value={project.name} onChange={(e) => edit((p) => { p.name = e.target.value; }, 'name')} spellCheck={false} />
      <div className="menu-sep" />
      <div className="phone-menu-row"><span>View</span>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'presentation', label: 'Presentation' }, { value: 'technical', label: 'Technical' }]} />
      </div>
      <div className="phone-menu-row"><span>Units</span>
        <Segmented size="sm" value={project.units} onChange={(v) => edit((p) => { p.units = v; })} options={[{ value: 'metric', label: 'm' }, { value: 'imperial', label: 'ft' }]} />
      </div>
      <div className="phone-menu-row"><span>Screen media</span><MediaButton onToast={onToast} /></div>
      <div className="menu-sep" />
      <input ref={fileRef} type="file" accept=".json,.3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openProjectFile(f, load, onToast); e.target.value = ''; onClose(); }} />
      <button className="menu-item" onClick={() => fileRef.current?.click()}><span className="mi"><Icon.open /> Open project</span></button>
      <button className="menu-item" onClick={() => { exportProject(projectForSave(project)); onToast('Project saved'); onClose(); }}><span className="mi"><Icon.save /> Save project</span></button>
      <button className="primary wide" onClick={() => setExporting(true)}><Icon.export /> Export</button>
    </div>
  );
}

/** top band: a rail of section chips over one open section card */
function PhoneSheet() {
  const [open, setOpen] = useState('Stage');
  const rail = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // the chosen chip slides to the front of the rail; the card starts at its top
    rail.current?.querySelector<HTMLElement>('.on')?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    card.current?.querySelector('.panel-scroll')?.scrollTo({ top: 0 });
  }, [open]);
  return (
    <div className="phone-sheet">
      <nav className="phone-rail" ref={rail}>
        {SECTIONS.map((s) => (
          <button key={s.title} className={s.title === open ? 'on' : ''} onClick={() => setOpen(s.title)}>{s.chip}</button>
        ))}
      </nav>
      <div className="phone-card" ref={card} key={open}>
        <AccordionContext.Provider value={{ open, setOpen }}>
          <LeftPanel />
        </AccordionContext.Provider>
      </div>
    </div>
  );
}

const VIEWS: { value: CameraView; label: string }[] = [
  { value: 'perspective', label: '3D' }, { value: 'front', label: 'Front' }, { value: 'side', label: 'Side' },
  { value: 'plan', label: 'Plan' }, { value: 'iso', label: 'Iso' }, { value: 'house', label: 'House' },
];

function PhoneViewbar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const cams = useStore((s) => s.scene.report.broadcast?.cameras.length ?? 0);
  const setShot = useStore((s) => s.setShot);
  return (
    <div className="phone-viewbar glass">
      <Segmented<CameraView> size="sm" value={view} onChange={setView} options={VIEWS} />
      <button className="icon-btn" aria-label="Frame stage" onClick={() => setView(view)}><Icon.frame /></button>
      {cams > 0 && <button className="icon-btn" aria-label="Camera view" onClick={() => setShot({ cam: 'cam1', shot: 'mcu', focal: null })}><Icon.camera /></button>}
    </div>
  );
}

/** bottom quarter: production data, layers and checks behind icon tabs */
function PhoneDock() {
  const [tab, setTab] = useState<DockTab>('overview');
  const selection = useStore((s) => s.selection);
  const warnings = useStore((s) => s.scene.warnings);
  const issues = warnings.filter((w) => w.level !== 'info').length;
  // tapping something in the model brings its inspector forward
  useEffect(() => { if (selection) setTab('overview'); }, [selection]);
  const tabs: { id: DockTab; label: string; icon: () => ReactElement; badge?: number }[] = [
    { id: 'overview', label: selection ? 'Selection' : 'Overview', icon: selection ? Icon.target : Icon.grid },
    { id: 'layers', label: 'Layers', icon: Icon.layers },
    { id: 'checks', label: 'Checks', icon: Icon.warn, badge: issues },
  ];
  return (
    <section className="phone-dock glass">
      <nav className="dock-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="dock-icon"><t.icon />{t.badge ? <i>{t.badge}</i> : null}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="dock-pane" key={tab}>
        {tab === 'overview' && (selection ? <Inspector /> : <Production />)}
        {tab === 'layers' && <div className="dock-pad"><LayerList /></div>}
        {tab === 'checks' && (warnings.length ? <Warnings /> : <p className="muted small dock-pad">No checks to show.</p>)}
      </div>
    </section>
  );
}
