import { useContext, useState, type ReactNode } from 'react';
import type { Resolved1D } from '../core/engine/types';
import { formatLength, parseLength, type DisplayUnits } from '../core/units';
import { Icon } from './icons';
import { AccordionContext } from './phone/usePhone';

export function Section({ title, summary, children, defaultOpen = true }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const acc = useContext(AccordionContext);
  // phone: only the open section is drawn — the others wait as chips in the section rail
  if (acc && acc.open !== title) return null;
  const open = acc ? true : ownOpen;
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => (acc ? undefined : setOwnOpen(!open))}>
        <span className="section-title">{title}</span>
        {(!open || acc) && summary && <span className="section-summary">{summary}</span>}
        <span className="chev"><Icon.chevron /></span>
      </button>
      <div className="section-body"><div>{children}</div></div>
    </section>
  );
}

interface LengthProps {
  label: string;
  value: number; // requested (design intent)
  resolved?: Resolved1D; // physically resolved result, if modular
  min: number; max: number; step: number;
  units: DisplayUnits;
  hint?: ReactNode;
  disabled?: boolean;
  onChange: (mm: number) => void;
}

/** Slider + exact numeric entry. Sliders move in valid modular steps; typed values are kept as design intent and resolved by the engine. */
export function LengthControl({ label, value, resolved, min, max, step, units, hint, disabled, onChange }: LengthProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const shown = resolved ? resolved.resolved : value;
  const commit = () => {
    const mm = parseLength(text, units);
    setEditing(false);
    if (mm != null && Number.isFinite(mm)) onChange(mm);
  };
  const pct = ((Math.min(max, Math.max(min, shown)) - min) / (max - min)) * 100;
  return (
    <div className={`ctl ${disabled ? 'disabled' : ''}`}>
      <div className="ctl-row">
        <span className="ctl-label">{label}</span>
        {editing ? (
          <input
            className="ctl-input" autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          />
        ) : (
          <button className="ctl-value" disabled={disabled} title="Click to type an exact value (e.g. 12.5 m, 40′6″, 4500 mm)"
            onClick={() => { setText(formatLength(shown, units, { precise: true }).replace(/ m$/, '')); setEditing(true); }}>
            {formatLength(shown, units, { precise: true })}
          </button>
        )}
      </div>
      <input
        type="range" className="slider" min={min} max={max} step={step} value={shown} disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(+e.target.value)}
      />
      {hint && <div className="ctl-hint">{hint}</div>}
      {resolved && !resolved.exact && (
        <div className="resolve">
          <div className="resolve-line">Requested {formatLength(resolved.requested, units, { precise: true })} — not a whole module</div>
          <div className="chips">
            {resolved.alternatives.map((a) => (
              <button key={a.value} className={`chip ${Math.abs(a.value - resolved.resolved) < 0.5 ? 'on' : ''}`} onClick={() => onChange(a.value)}>
                {formatLength(a.value, units, { precise: true })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NumberControl({ label, value, min, max, step, suffix, onChange, disabled, hint }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void; disabled?: boolean; hint?: ReactNode }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`ctl ${disabled ? 'disabled' : ''}`}>
      <div className="ctl-row">
        <span className="ctl-label">{label}</span>
        <span className="stepper">
          <button disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}>−</button>
          <span className="ctl-value static">{value}{suffix}</span>
          <button disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(3)))}>+</button>
        </span>
      </div>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} disabled={disabled} style={{ ['--pct' as string]: `${pct}%` }} onChange={(e) => onChange(+e.target.value)} />
      {hint && <div className="ctl-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span className="ctl-label">{label}</span>
      <button role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size, wrap }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm'; wrap?: boolean }) {
  return (
    <div className={`segmented ${size ?? ''} ${wrap ? 'wrap' : ''}`}>
      {options.map((o) => (
        <button key={o.value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { value: T; label: string; badge?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="ctl">
      {label && <div className="ctl-row"><span className="ctl-label">{label}</span></div>}
      <div className="select">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}{o.badge ? ` · ${o.badge}` : ''}</option>)}
        </select>
        <span className="chev"><Icon.chevron /></span>
      </div>
    </div>
  );
}

export function VerificationBadge({ v }: { v: 'manufacturer' | 'secondary' | 'generic' }) {
  const label = { manufacturer: 'Verified', secondary: 'Dealer data', generic: 'Generic' }[v];
  const title = {
    manufacturer: 'Specs checked against the manufacturer datasheet',
    secondary: 'Real product; specs from a dealer / rental listing — verify against the manufacturer datasheet before production',
    generic: 'Not a manufacturer SKU — representative planning dimensions',
  }[v];
  return <span className={`badge ${v}`} title={title}>{label}</span>;
}
