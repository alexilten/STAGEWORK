import { useMemo, useState, type ReactNode } from 'react';
import { CATALOG } from '../core/catalog';
import type { SceneGraph } from '../core/engine/scene';
import { formatArea, formatLength, formatWeight, type DisplayUnits } from '../core/units';
import { VerificationBadge } from './controls';
import { Icon } from './icons';
import { ALL_LAYERS, useStore } from './store';

export function RightPanel() {
  const selection = useStore((s) => s.selection);
  return (
    <aside className="panel right glass">
      <div className="panel-scroll">
        <Layers />
        {selection ? <Inspector /> : <Production />}
        <Warnings />
      </div>
    </aside>
  );
}

function Layers() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const scene = useStore((s) => s.scene);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of scene.objects) c[o.system] = (c[o.system] ?? 0) + 1;
    c.dimensions = scene.annotations.filter((a) => a.kind === 'dim').length;
    return c;
  }, [scene]);
  const [open, setOpen] = useState(true);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="section-title">Layers</span>
        <span className="chev"><Icon.chevron /></span>
      </button>
      <div className="section-body"><div>
        <ul className="layers">
          {ALL_LAYERS.map((l) => {
            const n = counts[l.key] ?? 0;
            return (
              <li key={l.key} className={`${layers[l.key] ? '' : 'off'} ${n ? '' : 'empty'}`}>
                <button onClick={() => toggle(l.key)} title={layers[l.key] ? 'Hide' : 'Show'}>
                  <span className="eye">{layers[l.key] ? <Icon.eye /> : <Icon.eyeOff />}</span>
                  <span className="layer-name">{l.label}</span>
                  <span className="layer-meta">{n || '—'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div></div>
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="kv"><span>{k}</span><span>{v}</span></div>;

function Production() {
  const scene = useStore((s) => s.scene);
  const u = useStore((s) => s.project.units);
  const r = scene.report;
  const cabinets = r.led.reduce((a, l) => a + l.count, 0);
  const ledArea = r.led.reduce((a, l) => a + l.areaMm2, 0);
  const ledWeight = r.led.every((l) => l.weightKg != null) ? r.led.reduce((a, l) => a + (l.weightKg ?? 0), 0) : null;
  const sections = r.truss.reduce((a, t) => a + t.sections.length, 0);
  const trussLen = r.truss.reduce((a, t) => a + t.length, 0);
  const hoists = r.truss.reduce((a, t) => a + t.hoists, 0);
  return (
    <section className="section open">
      <div className="section-head static"><span className="section-title">Production</span></div>
      <div className="section-body"><div>
        <div className="metric-grid">
          <Metric label="Stage" value={`${formatLength(r.stage.width.resolved, u).replace(/ m$/, '')} × ${formatLength(r.stage.depth.resolved, u)}`} sub={`${formatLength(r.stage.height.resolved, u)} high · ${formatArea(r.stage.areaMm2, u)}`} />
          <Metric label="Platforms" value={String(r.stage.primaryCount + r.stage.infillCount)} sub={`${r.stage.primaryCount} × ${r.stage.system.label}${r.stage.infillCount ? ` + ${r.stage.infillCount} × ${r.stage.system.infill.label}` : ''}`} />
          <Metric label="LED cabinets" value={String(cabinets)} sub={`${formatArea(ledArea, u)} · ${r.led.length} surface${r.led.length === 1 ? '' : 's'}`} />
          <Metric label="Truss" value={`${sections} sections`} sub={`${formatLength(trussLen, u)} · ${hoists} hoists`} />
          {r.seating && <Metric label="Seats" value={r.seating.count.toLocaleString()} sub={`${r.seating.rows} rows · ${r.seating.wheelchairSpaces} wheelchair`} />}
        </div>
        {r.led.map((l) => (
          <div className="sub-card" key={l.id}>
            <div className="sub-title">{l.name}</div>
            <Row k="Size" v={`${formatLength(l.chord, u, { precise: true })} × ${formatLength(l.rows * l.cabinet.height, u, { precise: true })}`} />
            <Row k="Grid" v={`${l.cols} × ${l.rows} = ${l.count}`} />
            <Row k="Resolution" v={`${l.pixelsW.toLocaleString()} × ${l.pixelsH.toLocaleString()} px`} />
            <Row k="Weight" v={l.weightKg != null ? `${formatWeight(l.weightKg, u)} (cabinets only)` : 'not verified'} />
            {l.powerMaxW != null && <Row k="Power (max)" v={`${(l.powerMaxW / 1000).toFixed(1)} kW`} />}
          </div>
        ))}
        <Row k="Fixtures" v={r.fixtures ? `${r.fixtures.count} × ${r.fixtures.fixture.model}` : '—'} />
        <Row k="LED weight (verified)" v={ledWeight != null ? formatWeight(ledWeight, u) : 'incomplete'} />
      </div></div>
    </section>
  );
}

const Metric = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{sub && <div className="metric-sub">{sub}</div>}</div>
);

function Inspector() {
  const scene = useStore((s) => s.scene);
  const selection = useStore((s) => s.selection)!;
  const select = useStore((s) => s.select);
  const u = useStore((s) => s.project.units);
  const [adv, setAdv] = useState(false);
  const members = scene.objects.filter((o) => o.group === selection.group);
  const obj = selection.objectId ? members.find((o) => o.id === selection.objectId) : undefined;
  const sample = obj ?? members[0];
  if (!sample) return null;
  const cat = typeof sample.meta.catalogId === 'string' ? CATALOG.find((c) => c.id === sample.meta.catalogId) : undefined;
  const title = groupTitle(selection.group, scene);
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.label, (counts.get(m.label) ?? 0) + 1);

  return (
    <section className="section open inspector">
      <div className="section-head static">
        <span className="section-title">{obj ? obj.label : title}</span>
        <button className="icon-btn" onClick={() => select(null)} title="Clear selection"><Icon.close /></button>
      </div>
      <div className="section-body"><div>
        {obj && <div className="crumb"><button onClick={() => select({ group: selection.group })}>{title}</button> / {obj.id}</div>}
        {cat && (
          <div className="sub-card">
            <div className="sub-title">{cat.manufacturer} {cat.model} <VerificationBadge v={cat.verification} /></div>
            <CatalogRows id={cat.id} u={u} />
          </div>
        )}
        {obj ? (
          <>
            <Row k="Position X" v={formatLength(obj.position[0], u, { precise: true })} />
            <Row k="Position Y" v={formatLength(obj.position[1], u, { precise: true })} />
            <Row k="Elevation Z" v={formatLength(obj.position[2], u, { precise: true })} />
            {obj.rotationZ !== 0 && <Row k="Rotation" v={`${((obj.rotationZ * 180) / Math.PI).toFixed(2)}°`} />}
            <Row k="Rhino layer" v={<code>{obj.layer.split('::').pop()}</code>} />
          </>
        ) : (
          <>
            {selection.group === 'seating' ? <Row k={sample.label.replace(/ \S+$/, '')} v={`× ${members.length.toLocaleString()}`} /> : [...counts].map(([k, n]) => <Row key={k} k={k} v={`× ${n}`} />)}
            <GroupRows group={selection.group} scene={scene} u={u} />
            <p className="muted small">Click again on a component to inspect it individually.</p>
          </>
        )}
        <button className="disclose" onClick={() => setAdv(!adv)}>{adv ? 'Hide' : 'Show'} advanced</button>
        {adv && (
          <div className="advanced">
            {Object.entries(sample.meta).map(([k, v]) => <Row key={k} k={k} v={String(v)} />)}
            {cat?.sources.map((s, i) => (
              <div className="source" key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}{s.note && <div className="muted small">{s.note}</div>}</div>
            ))}
            {cat?.notes?.map((n, i) => <p className="muted small" key={i}>{n}</p>)}
          </div>
        )}
      </div></div>
    </section>
  );
}

function groupTitle(g: string, scene: SceneGraph) {
  if (g === 'stage') return 'Stage';
  if (g === 'presenter') return 'Presenter reference';
  if (g === 'fixtures') return 'Front-of-house lighting';
  if (g === 'seating') return 'Audience seating';
  if (g.startsWith('riser:')) return scene.report.stage.areas.find((a) => a.group === g)?.label ?? 'Riser';
  if (g === 'truss:front') return 'Front light truss';
  if (g.startsWith('truss:header:')) return `${scene.report.led.find((l) => `truss:header:${l.id}` === g)?.name ?? ''} header truss`;
  if (g.startsWith('led:')) return scene.report.led.find((l) => `led:${l.id}` === g)?.name ?? 'LED wall';
  return g;
}

function GroupRows({ group, scene, u }: { group: string; scene: SceneGraph; u: DisplayUnits }) {
  const r = scene.report;
  if (group === 'stage') return (<>
    <Row k="Size" v={`${formatLength(r.stage.width.resolved, u, { precise: true })} × ${formatLength(r.stage.depth.resolved, u, { precise: true })}`} />
    <Row k="Deck height" v={formatLength(r.stage.height.resolved, u, { precise: true })} />
    <Row k="Leg length" v={formatLength(r.stage.legLength, u, { precise: true })} />
    <Row k="Legs" v={String(r.stage.legCount)} />
    <Row k="Shape" v={r.stage.shape === 'rect' ? 'Rectangle' : r.stage.shape === 'rounded' ? `Rounded · ${formatLength(r.stage.apron?.depth ?? 0, u)} apron` : r.stage.areas.filter((a) => a.kind !== 'main' && a.kind !== 'riser').map((a) => a.label).join(' + ')} />
  </>);
  const RA = group.startsWith('riser:') ? r.stage.areas.find((a) => a.group === group) : undefined;
  if (RA) return (<>
    <Row k="Size" v={`${formatLength(RA.maxX - RA.minX, u, { precise: true })} × ${formatLength(RA.maxY - RA.minY, u, { precise: true })}`} />
    <Row k="Height above deck" v={formatLength(RA.top - RA.base, u, { precise: true })} />
    <Row k="Top above floor" v={formatLength(RA.top, u, { precise: true })} />
  </>);
  const L = r.led.find((l) => `led:${l.id}` === group);
  if (L) return (<>
    <Row k="Size" v={`${formatLength(L.chord, u, { precise: true })} × ${formatLength(L.rows * L.cabinet.height, u, { precise: true })}`} />
    <Row k="Grid" v={`${L.cols} × ${L.rows}`} />
    <Row k="Bottom / top AFF" v={`${formatLength(L.origin[2], u, { precise: true })} / ${formatLength(L.top, u, { precise: true })}`} />
    <Row k="Resolution" v={`${L.pixelsW} × ${L.pixelsH}`} />
    {L.curveDeg !== 0 && <Row k="Curve" v={`${L.curveDeg}° / joint · ${formatLength(L.sagitta, u, { precise: true })} sagitta`} />}
  </>);
  if (group === 'seating' && r.seating) {
    const S = r.seating;
    return (<>
      <Row k="Layout" v={`${S.layout} · ${S.sections} ${S.sections === 1 ? 'section' : 'blocks'}`} />
      <Row k="Seats" v={`${S.count.toLocaleString()} in ${S.rows} rows`} />
      <Row k="Footprint" v={`${formatLength(S.width, u)} × ${formatLength(S.depth, u)}`} />
      <Row k="Front row" v={`${formatLength(S.frontDistance, u, { precise: true })} from deck`} />
      <Row k="Row pitch / clear" v={`${formatLength(S.rowPitch, u, { precise: true })} / ${formatLength(S.rowClear, u, { precise: true })}`} />
      <Row k="Longest block row" v={`${S.longestRow} seats (limit ${S.maxSeatsPerRow})`} />
      <Row k="Wheelchair spaces" v={`${S.wheelchairSpaces} + ${S.wheelchairSpaces} companion`} />
      <p className="muted small">Code checks follow IBC / IFC Chapter 10 and the 2010 ADA Standards. Egress and exits need venue / AHJ review.</p>
    </>);
  }
  const T = r.truss.find((t) => (group === 'truss:front' ? t.id === 'FOH' : `truss:header:${t.id.replace('HDR_', '').toLowerCase()}` === group));
  if (T) return (<>
    <Row k="Length" v={`${formatLength(T.length, u, { precise: true })} (target ${formatLength(T.target, u, { precise: true })})`} />
    <Row k="Sections" v={T.sections.map((s) => s / 1000).join(' + ') + ' m'} />
    <Row k="Bottom chord" v={formatLength(T.bottom, u, { precise: true })} />
    <Row k="Hoists" v={String(T.hoists)} />
    <p className="muted small">Loads require review by a qualified rigging engineer.</p>
  </>);
  return null;
}

function CatalogRows({ id, u }: { id: string; u: DisplayUnits }) {
  const c = CATALOG.find((x) => x.id === id)!;
  const L = (v: number) => formatLength(v, u, { precise: true });
  switch (c.category) {
    case 'led-cabinet': return (<>
      <Row k="Cabinet" v={`${c.width} × ${c.height} × ${c.depth} mm`} />
      <Row k="Pixel pitch" v={`${c.pixelPitch} mm · ${c.pixelsW}×${c.pixelsH}`} />
      <Row k="Weight" v={c.weightKg != null ? `${c.weightKg} kg` : 'not verified'} />
      <Row k="Curve" v={c.curveConcaveMaxDeg != null ? `up to ${c.curveConcaveMaxDeg}° concave` : 'not documented'} />
    </>);
    case 'deck': return (<>
      <Row k="Platform" v={`${L(c.long)} × ${L(c.short)}`} />
      <Row k="Frame depth" v={`${c.frameDepth} mm (estimate)`} />
      <Row k="Height range" v={`${L(c.minHeight)} – ${L(c.maxHeight)}`} />
    </>);
    case 'truss': return (<>
      <Row k="Profile" v={`${c.width} × ${c.height} mm ${c.profile}`} />
      <Row k="Chords" v={`Ø${c.chordDiameter} × ${c.chordWall} mm`} />
      <Row k="Connection" v={c.connection} />
    </>);
    case 'fixture': return (<>
      <Row k="Size" v={`${c.length} × ${c.width} × ${c.height} mm`} />
      <Row k="Weight" v={c.weightKg != null ? `${c.weightKg} kg` : '—'} />
      <Row k="Power" v={c.powerMaxW != null ? `${c.powerMaxW} W max` : '—'} />
    </>);
    case 'hoist': return <Row k="Capacity" v={`${c.capacityKg} kg`} />;
    case 'chair': return (<>
      <Row k="Footprint" v={`${c.width} × ${c.depth} mm`} />
      <Row k="Height / seat" v={`${c.height} / ${c.seatHeight} mm`} />
    </>);
  }
}

function Warnings() {
  const warnings = useStore((s) => s.scene.warnings);
  const select = useStore((s) => s.select);
  const shown = warnings.filter((w) => w.level !== 'info' || ['engineering', 'deck.infill', 'seating.ada', 'seating.sightline'].includes(w.code));
  if (!shown.length) return null;
  return (
    <section className="section open">
      <div className="section-head static"><span className="section-title">Checks</span><span className="section-summary">{shown.length}</span></div>
      <div className="section-body"><div>
        <ul className="warnings">
          {shown.map((w, i) => (
            <li key={i} className={w.level} onClick={() => w.target && select({ group: w.target })}>
              <span className="w-icon">{w.level === 'info' ? <Icon.info /> : <Icon.warn />}</span>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      </div></div>
    </section>
  );
}
