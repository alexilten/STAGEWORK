import { useEffect, useState } from 'react';
import { SHOTS, type ShotKey } from '../core/engine/broadcast';
import { formatLength } from '../core/units';
import { Icon } from './icons';
import { resolveShot, shotFrame } from './shot';
import { useStore } from './store';

/** 16:9 frame, title-safe guide and the shot bar while looking through a broadcast camera */
export function CameraShot() {
  const shot = useStore((s) => s.shot);
  const setShot = useStore((s) => s.setShot);
  const scene = useStore((s) => s.scene);
  const u = useStore((s) => s.project.units);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const rs = shot ? resolveShot(scene, shot) : null;
  useEffect(() => { if (shot && !rs) setShot(null); }, [shot, rs, setShot]);
  useEffect(() => {
    document.body.dataset.shot = shot ? '1' : '';
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShot(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shot, setShot]);
  if (!shot || !rs) return null;

  const cams = scene.report.broadcast!.cameras;
  const f = shotFrame(size.w, size.h);
  const { cam, lens } = rs;
  const max = cam.lens.fMax * cam.lens.extender;
  // logarithmic zoom: equal slider steps feel like equal zoom steps
  const toS = (fl: number) => Math.log(fl / cam.lens.fMin) / Math.log(max / cam.lens.fMin);
  const fromS = (v: number) => cam.lens.fMin * Math.pow(max / cam.lens.fMin, v);
  const pick = (k: ShotKey) => setShot({ ...shot, shot: k, focal: null });
  const flag = rs.wanted > max + 1e-6 ? `Needs ${Math.round(rs.wanted)} mm — beyond this lens` : rs.wanted < cam.lens.fMin - 1e-6 ? `Needs ${rs.wanted.toFixed(1)} mm — wider than this lens` : lens.extender ? '2× extender in — two stops darker' : null;
  return (
    <>
      <div className="shot-frame" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
        <div className="shot-safe" />
        <div className="shot-tag"><span className="tally" />{cam.name.toUpperCase()}<span>{cam.role}</span></div>
        <div className="shot-lens">{Math.round(rs.focal)} mm · {lens.hfov.toFixed(lens.hfov < 10 ? 1 : 0)}° H</div>
      </div>
      <div className="shot-bar glass">
        <div className="shot-row">
          {cams.map((c) => (
            <button key={c.id} className={`chip ${c.id === cam.id ? 'on' : ''}`} title={c.role} onClick={() => setShot({ ...shot, cam: c.id, focal: null })}>{c.name}</button>
          ))}
          <button className="icon-btn shot-exit" title="Back to the model (Esc)" onClick={() => setShot(null)}><Icon.close /></button>
        </div>
        <div className="shot-row">
          <div className="segmented sm">
            {SHOTS.map((s) => (
              <button key={s.key} className={shot.shot === s.key && shot.focal == null ? 'on' : ''} title={s.hint} onClick={() => pick(s.key)}>{s.label}</button>
            ))}
          </div>
          <input className="shot-zoom" type="range" min={0} max={1} step={0.001} value={toS(rs.focal)} aria-label="Zoom"
            onChange={(e) => setShot({ ...shot, focal: fromS(+e.target.value) })} />
        </div>
        <div className="shot-meta">
          <span>{cam.lens.manufacturer} {cam.lens.model} · {cam.lens.fMin}–{cam.lens.fMax} mm</span>
          <span>{formatLength(cam.distance, u)} to presenter</span>
          {flag && <span className="warn">{flag}</span>}
        </div>
      </div>
    </>
  );
}
