import { lensState, shotFor, type CameraSupport } from '../core/engine/broadcast';

const SUPPORT: Record<CameraSupport, string> = { tripod: 'Tripod on platform', rail: 'Robotic dolly on track', handheld: 'Handheld (RF)', jib: 'Jib with remote head', steadicam: 'Steadicam (RF)', ptz: 'PTZ (robotic)' };
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
  const [open, setOpen] = useState(true);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="section-title">Layers</span>
        <span className="chev"><Icon.chevron /></span>
      </button>
      <div className="section-body"><div>
        <LayerList />
      </div></div>
    </section>
  );
}

export function LayerList() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const scene = useStore((s) => s.scene);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of scene.objects) c[o.system] = (c[o.system] ?? 0) + 1;
    c.dimensions = scene.annotations.filter((a) => a.kind === 'dim').length;
    return c;
  }, [scene]);
  return (
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
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="kv"><span>{k}</span><span>{v}</span></div>;

export function Production() {
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
          {r.seating && <Metric label="Seats" value={r.seating.capacity.toLocaleString()} sub={`${r.seating.rows} rows · ${r.seating.wheelchairPlaced.length || r.seating.wheelchairSpaces} wheelchair${r.seating.wheelchairPlaced.length ? '' : ' (not placed)'}`} />}
          {r.audience?.standing && <Metric label="Standing" value={r.audience.standing.capacity.toLocaleString()} sub={`${r.audience.standing.areaM2.toLocaleString()} m² at ${r.audience.standing.density}/m²${r.audience.standing.barricadeM ? ` · ${Math.round(r.audience.standing.barricadeM)} m barricade` : ''}`} />}
          {r.audience && r.audience.stands.length > 0 && (() => {
            const cs = r.audience.stands.map((x) => x.minC).filter((c): c is number => c != null);
            return <Metric label="Stands" value={r.audience.standSeats.toLocaleString()} sub={`${r.audience.stands.length} stand${r.audience.stands.length === 1 ? '' : 's'}${cs.length ? ` · C-value ≥ ${Math.min(...cs)} mm` : ''}`} />;
          })()}
          {r.audio && <Metric label="PA" value={r.audio.layout === 'quad' ? `${r.audio.hangs} hangs` : `${r.audio.mainsPerSide}/side`} sub={`${r.audio.layout === 'quad' ? `${r.audio.mainsPerSide} boxes each · ` : ''}${r.audio.subs} subs · ${r.audio.frontFills} fills · ${r.audio.monitors} wedges`} />}
          {r.structure?.roof && <Metric label="Roof" value={`${r.structure.roof.span / 1000} m span`} sub={`${r.structure.roof.spec.name.replace('Stageco ', '')} · ${formatLength(r.structure.roof.clearance, u)} clear`} />}
          {r.structure?.delays && <Metric label="Delays" value={`${r.structure.delays.count} towers`} sub={`${formatLength(r.structure.delays.distance, u)} · ≈ ${r.structure.delays.delayMs} ms`} />}
          {r.show?.dome && <Metric label="LED dome" value={`${formatLength(r.show.dome.diameter, u)}`} sub={`${r.show.dome.tiles.toLocaleString()} tiles · ${Math.round(r.show.dome.areaM2).toLocaleString()} m²`} />}
          {r.scenic && <Metric label="Scenic" value={[r.scenic.portal && 'Portal', r.scenic.maskingLegs && `${r.scenic.maskingLegs} legs`, r.scenic.drape && 'Drape'].filter(Boolean).join(' · ')} sub={r.scenic.portal ? `Opening ${formatLength(r.scenic.portal.opening.width, u)} × ${formatLength(r.scenic.portal.opening.height, u)}` : 'Soft goods'} />}
          {r.broadcast && r.broadcast.cameras.length > 0 && <Metric label="Cameras" value={String(r.broadcast.cameras.length)} sub={[r.broadcast.platform && `FOH ${formatLength(-r.broadcast.platform.yFront, u)}`, r.broadcast.rail && 'rail', r.broadcast.seatKills && `${r.broadcast.seatKills} seat kills`].filter(Boolean).join(' · ')} />}
          {r.lightingPositions && <Metric label="LX positions" value={`${r.lightingPositions.electrics} electrics`} sub={`${r.lightingPositions.booms} booms · ${r.lightingPositions.fixtureTotal} fixtures`} />}
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

export function Inspector() {
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
            {selection.group === 'seating' ? (() => {
              const chairs = members.filter((m) => m.layer === '70_AUDIENCE::70_01_SEATING');
              const wc = members.length - chairs.length;
              return (<>
                {chairs[0] && <Row k={chairs[0].label.replace(/ \S+$/, '')} v={`× ${chairs.length.toLocaleString()}`} />}
                {wc > 0 && <Row k="Wheelchair spaces" v={`× ${wc}`} />}
              </>);
            })() : [...counts].map(([k, n]) => <Row key={k} k={k} v={`× ${n}`} />)}
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
  if (g === 'audio:main:l') return 'Main hang — house left';
  if (g === 'audio:main:r') return 'Main hang — house right';
  if (g === 'audio:sub') return 'Subwoofers';
  if (g === 'audio:fill') return 'Front fills';
  if (g === 'audio:monitor') return 'Stage monitors';
  if (g.startsWith('elx:')) return `Electric ${g.slice(4)}`;
  if (g === 'boom:l') return 'Lighting boom — house left';
  if (g === 'boom:r') return 'Lighting boom — house right';
  if (g === 'bcast:platform') return 'Camera platforms';
  if (g === 'bcast:rail') return 'Camera track';
  if (g === 'bcast:prompters') return 'Prompters & confidence monitors';
  if (g.startsWith('bcast:cam')) { const c = scene.report.broadcast?.cameras.find((x) => x.group === g); return c ? `${c.name} — ${c.role}` : 'Camera'; }
  if (g === 'scenic:portal') return 'Portal';
  if (g === 'scenic:masking') return 'Masking legs';
  if (g === 'scenic:drape') return 'Upstage drape';
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
  if (group.startsWith('audio:') && r.audio) {
    const A = r.audio;
    if (group.startsWith('audio:main')) return (<>
      <Row k="Array" v={`${A.mainsPerSide} × ${A.main.model}`} />
      <Row k="Trim (top)" v={formatLength(A.trim, u, { precise: true })} />
      <Row k="Outboard" v={formatLength(A.spread, u, { precise: true })} />
      {A.main.dispersionH && <Row k="Horizontal" v={`${A.main.dispersionH}°`} />}
      <p className="muted small">Splay and coverage are set by the audio vendor's prediction software.</p>
    </>);
    if (group === 'audio:sub') return (<><Row k="Subs" v={`${A.subs} × ${A.sub?.model ?? ''}`} /><Row k="Arrangement" v={A.subMode === 'ground' ? 'Ground-stacked' : 'Flown'} /></>);
    if (group === 'audio:fill') return <Row k="Front fills" v={`${A.frontFills} × ${A.fill?.model ?? ''}`} />;
    if (group === 'audio:monitor') return <Row k="Wedges" v={`${A.monitors} × ${A.monitor?.model ?? ''}`} />;
  }
  if ((group.startsWith('elx:') || group.startsWith('boom:')) && r.lightingPositions) {
    const fixCount = scene.objects.filter((o) => o.group === group && o.system === 'lighting' && o.block?.startsWith('SC_FIX')).length;
    return (<>
      <Row k="Fixtures" v={String(fixCount)} />
      <Row k="Type" v={group.startsWith('elx') ? 'Overhead electric' : 'Side boom'} />
      <p className="muted small">Positions and counts are planning inputs; the lighting designer sets focus and plot.</p>
    </>);
  }
  if (group.startsWith('scenic:') && r.scenic) {
    const S = r.scenic;
    if (group === 'scenic:portal' && S.portal) return (<>
      <Row k="Opening" v={`${formatLength(S.portal.opening.width, u)} × ${formatLength(S.portal.opening.height, u)}`} />
      <Row k="Outside" v={`${formatLength(S.portal.outer.width, u)} × ${formatLength(S.portal.outer.height, u)}`} />
      <p className="muted small">Hard flats, custom carpentry. Sized from the main screen; bracing and fixing are the scenic builder's.</p>
    </>);
    if (group === 'scenic:masking') return (<><Row k="Legs" v={`${S.maskingLegs} (${S.maskingLegs / 2} pairs)`} /><p className="muted small">Soft goods drawn flat; fullness and pipes not modelled.</p></>);
    if (group === 'scenic:drape' && S.drape) return <Row k="Size" v={`${formatLength(S.drape.width, u)} × ${formatLength(S.drape.height, u)}`} />;
  }
  if (group.startsWith('bcast:') && r.broadcast) return <BroadcastRows group={group} u={u} />;
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
      <Row k="Wheelchair spaces" v={S.wheelchairPlaced.length ? `${S.wheelchairPlaced.length} placed + ${S.wheelchairPlaced.length} companion` : `${S.wheelchairSpaces} + ${S.wheelchairSpaces} companion (not placed)`} />
      {S.wheelchairPlaced.length > 0 && <Row k="Spaces in rows" v={[...new Set(S.wheelchairPlaced.map((w) => w.row))].join(', ')} />}
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
      <Row k="Power" v={c.powerMaxW != null ? `${c.powerMaxW} W max` : c.powerTypW != null ? `${c.powerTypW} W typical` : '—'} />
    </>);
    case 'hoist': return <Row k="Capacity" v={`${c.capacityKg} kg`} />;
    case 'chair': return (<>
      <Row k="Footprint" v={`${c.width} × ${c.depth} mm`} />
      <Row k="Height / seat" v={`${c.height} / ${c.seatHeight} mm`} />
    </>);
    case 'speaker': return (<>
      <Row k="Cabinet" v={`${c.width} × ${c.depth} × ${c.height} mm`} />
      <Row k="Weight" v={c.weightKg != null ? `${c.weightKg} kg` : '—'} />
      {c.dispersionH != null && <Row k="Horizontal" v={`${c.dispersionH}°`} />}
      {c.splayRange && <Row k="Splay" v={`${c.splayRange[0]}–${c.splayRange[1]}°`} />}
    </>);
  }
}

export function Warnings() {
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

function BroadcastRows({ group, u }: { group: string; u: DisplayUnits }) {
  const r = useStore((s) => s.scene.report.broadcast)!;
  const setShot = useStore((s) => s.setShot);
  const cam = r.cameras.find((c) => c.group === group);
  if (cam) {
    const tight = shotFor(cam, 'mcu', r.presenter, r.stageWidth);
    const st = lensState(cam.lens, tight.focal);
    return (<>
      <Row k="Camera" v={cam.body} />
      <Row k="Support" v={SUPPORT[cam.support]} />
      <Row k="Lens" v={`${cam.lens.manufacturer} ${cam.lens.model}`} />
      <Row k="Range" v={`${cam.lens.fMin}–${cam.lens.fMax} mm${cam.lens.extender > 1 ? ` (×${cam.lens.extender})` : ''}${cam.support === 'ptz' ? ' (2/3″ equiv.)' : ''}`} />
      {cam.support === 'jib' && r.jib && <Row k="Jib" v={`${r.jib.reachFt}′ arm · ${r.jib.payloadKg.toFixed(1)} / ${r.jib.ratedKg} kg`} />}
      <Row k="To presenter" v={formatLength(cam.distance, u)} />
      <Row k="Lens height" v={formatLength(cam.pivot[2], u, { precise: true })} />
      <Row k="MCU needs" v={`${Math.round(tight.focal)} mm${st.outOfRange ? ' — out of range' : st.extender ? ' (extender)' : ''}`} />
      <Row k="Crew" v={cam.crew === 'robotic' ? 'Robotic (remote operator)' : 'Operator'} />
      <button className="disclose" onClick={() => setShot({ cam: cam.id, shot: 'mcu', focal: null })}>Look through {cam.name} →</button>
    </>);
  }
  if (group === 'bcast:platform' && r.platform) return (<>
    <Row k="FOH platform" v={`${formatLength(r.platform.width, u)} × ${formatLength(r.platform.depth, u)}`} />
    <Row k="Height" v={formatLength(r.platform.height, u, { precise: true })} />
    <Row k="Position" v={`${r.platform.placement === 'back' ? 'Back of house' : 'In the house'} · ${formatLength(-r.platform.yFront, u)} from stage`} />
    {r.sidePlatformHeight != null && <Row k="Side platforms" v={formatLength(r.sidePlatformHeight, u, { precise: true })} />}
    <Row k="Seat kills" v={String(r.seatKills)} />
    <p className="muted small">Height is set from the sightline over the heads in front, in 8″ steps of 4′ × 4′ modular platform. Guards above 30″ (IBC 1015.2).</p>
  </>);
  if (group === 'bcast:rail' && r.rail) return (<>
    <Row k="Track" v={`${formatLength(r.rail.length, u)}${r.rail.curved && r.rail.radius ? ` · ${formatLength(r.rail.radius, u)} radius` : ' straight'}`} />
    <Row k="Dolly" v={`Ross Furio SE · ${r.rail.head}`} />
    <Row k="Lens height" v={formatLength(r.rail.lensHeight, u, { precise: true })} />
    <Row k="Payload" v={`${r.rail.payloadKg.toFixed(1)} kg`} />
    <Row k="Stage → front row" v={`${formatLength(r.rail.gap, u, { precise: true })} (needs ${formatLength(r.rail.needed, u, { precise: true })})`} />
    <p className="muted small">360 mm gauge track, 890 × 460 mm dolly, up to 30 m and 3 m radius (Ross Furio SE brochure).</p>
  </>);
  if (group === 'bcast:prompters') return (<>
    <Row k="Presidential glass" v={r.prompters.presidential ? `${r.prompters.presidential} (17″)` : 'none'} />
    <Row k="Downstage monitors" v={r.prompters.dsm ? `${r.prompters.dsm} × 55″ ${r.prompters.dsmMode === 'recessed' ? 'in the deck' : 'on stands'}` : 'none'} />
    <Row k="FOH screens" v={r.prompters.foh ? `${r.prompters.foh} × 85″ ${r.prompters.fohMode === 'truss' ? 'hung' : 'on stands'}` : 'none'} />
    {r.prompters.onCamera && <Row k="On-camera" v="Autoscript EPIC-IP19 on the rail" />}
    <p className="muted small">Monitor sizes are generic. Readable distance ≈ 0.35 m per inch of diagonal, scaled from Autocue's 17″ / 6 m.</p>
  </>);
  return null;
}
