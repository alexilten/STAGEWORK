import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewport } from '../viewport/Viewport';
import { Segmented } from './controls';
import { Icon } from './icons';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { useStore, type CameraView } from './store';
import { Toolbar } from './Toolbar';
import { CameraShot } from './CameraShot';
import { PhoneApp } from './phone/PhoneApp';
import { usePhone } from './phone/usePhone';

export function App() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const mode = useStore((s) => s.mode);
  useEffect(() => { document.body.dataset.mode = mode; }, [mode]);
  const phone = usePhone();
  if (phone) return <PhoneApp />;

  return (
    <div className="app">
      <Viewport />
      <Toolbar onToast={showToast} />
      <LeftPanel />
      <RightPanel />
      <div className="viewbar glass">
        <Segmented<CameraView> size="sm" value={view} onChange={setView} options={[
          { value: 'perspective', label: 'Perspective', title: '1' }, { value: 'front', label: 'Front', title: '2' },
          { value: 'side', label: 'Side', title: '3' }, { value: 'plan', label: 'Plan', title: '4' }, { value: 'iso', label: 'Iso', title: '5' }, { value: 'house', label: 'House', title: '6 · stage and audience' },
        ]} />
        <button className="icon-btn" title="Frame stage" onClick={() => setView(view)}><Icon.frame /></button>
        <CameraButton />
      </div>
      <CameraShot />
      <Hud />
      <DragInfo />
      {toast && <div className="toast glass">{toast}</div>}
    </div>
  );
}

/** look through the first broadcast camera */
function CameraButton() {
  const cams = useStore((s) => s.scene.report.broadcast?.cameras.length ?? 0);
  const setShot = useStore((s) => s.setShot);
  if (!cams) return null;
  return <button className="icon-btn" title="Camera view — look through the broadcast cameras" onClick={() => setShot({ cam: 'cam1', shot: 'mcu', focal: null })}><Icon.camera /></button>;
}

function Hud() {
  const scene = useStore((s) => s.scene);
  const L = scene.report.led[0];
  const cabinets = scene.report.led.reduce((a, l) => a + l.count, 0);
  const errs = scene.warnings.filter((w) => w.level === 'error').length;
  return (
    <div className="hud">
      <span>{scene.report.stage.primaryCount + scene.report.stage.infillCount} platforms</span>
      <span>{cabinets} cabinets</span>
      {L && <span>{L.pixelsW.toLocaleString()} × {L.pixelsH.toLocaleString()}</span>}
      {scene.report.seating && <span>{scene.report.seating.capacity.toLocaleString()} seats</span>}
      <span>{scene.objects.length.toLocaleString()} objects</span>
      {errs > 0 && <span className="err">{errs} conflict{errs > 1 ? 's' : ''}</span>}
    </div>
  );
}

function DragInfo() {
  const info = useStore((s) => s.dragInfo);
  return info ? <div className="drag-info glass">{info}</div> : null;
}
