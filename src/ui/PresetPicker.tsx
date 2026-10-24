import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, PRESETS, type PresetCategory } from '../core/presets';
import { Segmented } from './controls';
import { Icon } from './icons';
import { useStore } from './store';
import { deleteUserPreset, listUserPresets, loadUserPreset, saveUserPreset } from './userPresets';

const thumb = (id: string) => `${import.meta.env.BASE_URL}presets/${id}.png`;

/** Preset gallery: a category row and a thumbnail grid, plus the presets saved in this browser. */
export function PresetPicker({ onToast }: { onToast: (m: string) => void }) {
  const project = useStore((s) => s.project);
  const loadPreset = useStore((s) => s.loadPreset);
  const load = useStore((s) => s.load);
  const [open, setOpen] = useState(false);
  const [userPresets, setUserPresets] = useState(listUserPresets);
  const current = PRESETS.find((p) => p.id === project.presetId);
  const [cat, setCat] = useState<PresetCategory | 'mine'>(current?.category ?? 'tech');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const label = current?.name ?? userPresets.find((u) => `user:${u.id}` === project.presetId)?.name ?? 'Custom';
  const info = CATEGORIES.find((c) => c.id === cat);
  const list = PRESETS.filter((p) => p.category === cat);

  return (
    <div className="preset-wrap" ref={wrapRef}>
      <button className={`preset-btn ${open ? 'on' : ''}`} title="Start from a preset" onClick={() => { setCat(current?.category ?? cat); setOpen(!open); }}>
        <span className="preset-btn-cat">{current ? CATEGORIES.find((c) => c.id === current.category)?.name : 'Preset'}</span>
        <span className="preset-btn-name">{label}</span>
        <span className="chev"><Icon.chevron /></span>
      </button>
      {open && (
        <div className="menu preset-menu glass">
          <Segmented size="sm" value={cat} onChange={setCat}
            options={[...CATEGORIES.map((c) => ({ value: c.id as PresetCategory | 'mine', label: c.name, title: c.blurb })), { value: 'mine', label: 'Mine', title: 'Presets saved in this browser' }]} />
          {info && <p className="preset-blurb">{info.blurb}</p>}
          {cat !== 'mine' ? (
            <div className="preset-grid">
              {list.map((p) => (
                <button key={p.id} className={`preset-card ${p.id === project.presetId ? 'on' : ''}`} title={p.summary}
                  onClick={() => { loadPreset(p.id); setOpen(false); }}>
                  <span className="preset-thumb"><img src={thumb(p.id)} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} /></span>
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-sum">{p.summary}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="preset-mine">
              {userPresets.length === 0 && <p className="preset-blurb">Nothing saved yet. Save the current design to come back to it in this browser.</p>}
              {userPresets.map((u) => (
                <div key={u.id} className="menu-item">
                  <button className="preset-mine-load" onClick={() => { load({ ...loadUserPreset(u), presetId: `user:${u.id}` }); setOpen(false); }}>{u.name}</button>
                  <button className="text-btn danger" onClick={() => { setUserPresets(deleteUserPreset(u.id)); onToast('Preset removed'); }}>Remove</button>
                </div>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setUserPresets(saveUserPreset(project)); onToast(`Saved “${project.name}” as a preset in this browser`); }}>Save current as preset</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
