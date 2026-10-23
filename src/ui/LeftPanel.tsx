import { CHAIRS, DECK_SYSTEMS, FIXTURES, LED_CABINETS, getCatalogItem, type DeckSystem, type LedCabinet } from '../core/catalog';
import { SEAT_COUNT } from '../core/engine/seating';
import { DEFAULT_SEATING, type SeatingLayout, type StageFinish } from '../core/schema';
import { formatLength } from '../core/units';
import { LengthControl, NumberControl, Section, Segmented, Select, Toggle, VerificationBadge } from './controls';
import { useStore } from './store';

const ASPECTS: { label: string; r: number }[] = [
  { label: '16:9', r: 16 / 9 }, { label: '21:9', r: 21 / 9 }, { label: '32:9', r: 32 / 9 }, { label: '4:1', r: 4 },
];

export function LeftPanel() {
  const project = useStore((s) => s.project);
  const scene = useStore((s) => s.scene);
  const edit = useStore((s) => s.edit);
  const activeWall = useStore((s) => s.activeWall);
  const setActiveWall = useStore((s) => s.setActiveWall);
  const addWall = useStore((s) => s.addWall);
  const duplicateWall = useStore((s) => s.duplicateWall);
  const removeWall = useStore((s) => s.removeWall);
  const u = project.units;
  const st = scene.report.stage;
  const deck = getCatalogItem<DeckSystem>(project.stage.deckSystemId, 'deck');
  const wi = Math.max(0, project.ledWalls.findIndex((w) => w.id === activeWall));
  const wall = project.ledWalls[wi];
  const L = scene.report.led.find((l) => l.id === wall?.id);
  const cab = wall ? getCatalogItem<LedCabinet>(wall.cabinetId, 'led-cabinet') : null;
  const curveMax = cab ? Math.max(cab.curveConcaveMaxDeg ?? 0, 0) : 0;
  const header = scene.report.truss.find((t) => t.id === `HDR_${wall?.id.toUpperCase()}`);
  const front = scene.report.truss.find((t) => t.id === 'FOH');

  return (
    <aside className="panel left glass">
      <div className="panel-scroll">
        <Section title="Stage" summary={`${formatLength(st.width.resolved, u)} × ${formatLength(st.depth.resolved, u)}`}>
          <LengthControl label="Width" units={u} value={project.stage.width} resolved={st.width}
            min={deck.short * 4} max={deck.short * 40} step={deck.short}
            hint={<>{st.width.modules} × {formatLength(deck.short, u)} modules</>}
            onChange={(v) => edit((p) => { p.stage.width = v; }, 'stage.width')} />
          <LengthControl label="Depth" units={u} value={project.stage.depth} resolved={st.depth}
            min={deck.short * 2} max={deck.short * 16} step={deck.short}
            hint={<>{st.depth.modules} platform rows</>}
            onChange={(v) => edit((p) => { p.stage.depth = v; }, 'stage.depth')} />
          <LengthControl label="Height" units={u} value={project.stage.height} resolved={st.height}
            min={deck.minHeight} max={deck.maxHeight} step={deck.heightStep}
            hint={<>Legs {formatLength(st.legLength, u, { precise: true })} · {formatLength(deck.heightStep, u)} increments</>}
            onChange={(v) => edit((p) => { p.stage.height = v; }, 'stage.height')} />
          <Select label="Decking system" value={project.stage.deckSystemId}
            options={DECK_SYSTEMS.map((d) => ({ value: d.id, label: `${d.label} — ${d.model}`, badge: d.verification === 'generic' ? 'generic' : undefined }))}
            onChange={(v) => edit((p) => { p.stage.deckSystemId = v; })} />
          <div className="ctl">
            <div className="ctl-row"><span className="ctl-label">Finish</span></div>
            <div className="swatches">
              {(['white', 'graphite', 'black', 'oak'] as StageFinish[]).map((f) => (
                <button key={f} title={f} className={`swatch ${f} ${project.stage.finish === f ? 'on' : ''}`} onClick={() => edit((p) => { p.stage.finish = f; })} />
              ))}
            </div>
          </div>
          <Toggle label="Fascia" checked={project.stage.fascia} onChange={(v) => edit((p) => { p.stage.fascia = v; })} />
        </Section>

        <Section title="LED media" summary={L ? `${project.ledWalls.length} surface${project.ledWalls.length === 1 ? '' : 's'} · ${scene.report.led.reduce((a, l) => a + l.count, 0)} cabinets` : 'none'}>
          <div className="surface-tabs">
            {project.ledWalls.map((w) => (
              <button key={w.id} className={w.id === wall?.id ? 'on' : ''} onClick={() => setActiveWall(w.id)}>{w.name.replace(/ (wall|screen)$/i, '')}</button>
            ))}
            <button className="add" onClick={addWall} title="Add an LED surface">+</button>
          </div>
          {!wall && <p className="muted small">No LED surfaces. Add one to start.</p>}
          {wall && L && cab && (<>
            <div className="ctl surface-head">
              <input id="wall-name" className="name-input" value={wall.name} spellCheck={false} onChange={(e) => edit((p) => { p.ledWalls[wi].name = e.target.value; }, `led.${wall.id}.name`)} />
              <button className="text-btn" onClick={() => duplicateWall(wall.id)}>Duplicate</button>
              <button className="text-btn danger" onClick={() => removeWall(wall.id)}>Remove</button>
            </div>
            <p className="muted small drag-hint">Select the wall in the viewport, then drag it. Shift-drag moves it up/downstage, Alt turns off snapping, arrow keys nudge.</p>
            <Select label="Cabinet" value={wall.cabinetId}
              options={LED_CABINETS.map((c) => ({ value: c.id, label: `${c.manufacturer === 'Generic' ? '' : c.manufacturer + ' '}${c.model}`, badge: `${c.width}×${c.height}` }))}
              onChange={(v) => edit((p) => { p.ledWalls[wi].cabinetId = v; })} />
            <div className="cab-meta">
              <VerificationBadge v={cab.verification} />
              <span>{cab.pixelPitch} mm pitch</span><span>{cab.pixelsW}×{cab.pixelsH} px</span>{cab.weightKg && <span>{cab.weightKg} kg</span>}
            </div>
            <LengthControl label="Width" units={u} value={wall.width} resolved={L.width}
              min={cab.width} max={cab.width * Math.floor(40000 / cab.width)} step={cab.width}
              hint={<>{L.cols} columns · {L.pixelsW.toLocaleString()} px</>}
              onChange={(v) => edit((p) => { p.ledWalls[wi].width = v; }, `led.${wall.id}.width`)} />
            <LengthControl label="Height" units={u} value={wall.height} resolved={L.height}
              min={cab.height} max={cab.height * Math.floor(12000 / cab.height)} step={cab.height}
              hint={<>{L.rows} rows · {L.pixelsH.toLocaleString()} px</>}
              onChange={(v) => edit((p) => { p.ledWalls[wi].height = v; }, `led.${wall.id}.height`)} />
            <div className="ctl">
              <div className="ctl-row"><span className="ctl-label">Aspect</span><span className="ctl-value static">{(L.width.resolved / L.height.resolved).toFixed(2)} : 1</span></div>
              <div className="chips">
                {ASPECTS.map((a) => (
                  <button key={a.label} className={`chip ${Math.abs(L.width.resolved / L.height.resolved - a.r) < 0.06 ? 'on' : ''}`}
                    onClick={() => edit((p) => { p.ledWalls[wi].height = Math.max(cab.height, Math.round(L.width.resolved / a.r / cab.height) * cab.height); })}>{a.label}</button>
                ))}
              </div>
            </div>
            <LengthControl label="Elevation above deck" units={u} value={wall.elevation} min={0} max={4000} step={50}
              hint={<>Bottom at {formatLength(L.origin[2], u, { precise: true })} AFF · top {formatLength(L.top, u, { precise: true })}</>}
              onChange={(v) => edit((p) => { p.ledWalls[wi].elevation = v; }, `led.${wall.id}.elev`)} />
            <LengthControl label="Horizontal offset" units={u} value={wall.offsetX} min={-15000} max={15000} step={cab.width / 2}
              onChange={(v) => edit((p) => { p.ledWalls[wi].offsetX = v; }, `led.${wall.id}.x`)} />
            <LengthControl label="Upstage of deck edge" units={u} value={wall.upstageGap} min={-3000} max={4000} step={50}
              onChange={(v) => edit((p) => { p.ledWalls[wi].upstageGap = v; }, `led.${wall.id}.y`)} />
            <NumberControl label="Curve per joint" value={L.curveDeg} min={0} max={curveMax || 1} step={0.5} suffix="°" disabled={!curveMax}
              hint={curveMax ? <>Concave · product limit {curveMax}° · sagitta {formatLength(L.sagitta, u, { precise: true })}</> : 'Curving not documented for this cabinet'}
              onChange={(v) => edit((p) => { p.ledWalls[wi].curveDeg = v; }, `led.${wall.id}.curve`)} />
          </>)}
        </Section>

        <AudienceSection />

        <Section title="Rigging" defaultOpen={false} summary={`${scene.report.truss.reduce((a, t) => a + t.sections.length, 0)} truss sections`}>
          <Toggle label="LED header truss" checked={project.rigging.header.enabled} onChange={(v) => edit((p) => { p.rigging.header.enabled = v; })} />
          <LengthControl label="Clearance above LED" units={u} value={project.rigging.header.clearance} min={200} max={3000} step={50} disabled={!project.rigging.header.enabled}
            hint={header ? <>Truss bottom {formatLength(header.bottom, u, { precise: true })} · {header.sections.length} sections · {header.hoists} hoists</> : undefined}
            onChange={(v) => edit((p) => { p.rigging.header.clearance = v; }, 'rig.clear')} />
          <Toggle label="Front light truss" checked={project.rigging.front.enabled} onChange={(v) => edit((p) => { p.rigging.front.enabled = v; })} />
          <LengthControl label="Trim height" units={u} value={project.rigging.front.trim} min={4000} max={15000} step={100} disabled={!project.rigging.front.enabled}
            onChange={(v) => edit((p) => { p.rigging.front.trim = v; }, 'rig.trim')} />
          <LengthControl label="Distance from stage" units={u} value={project.rigging.front.distance} min={1000} max={15000} step={100} disabled={!project.rigging.front.enabled}
            onChange={(v) => edit((p) => { p.rigging.front.distance = v; }, 'rig.dist')} />
          <LengthControl label="Truss length" units={u} value={project.rigging.front.width} min={3000} max={30000} step={250} disabled={!project.rigging.front.enabled}
            hint={front ? <>Resolved {formatLength(front.length, u, { precise: true })} from {front.sections.map((s) => s / 1000).join(' + ')} m</> : undefined}
            onChange={(v) => edit((p) => { p.rigging.front.width = v; }, 'rig.width')} />
        </Section>

        <Section title="Lighting" defaultOpen={false} summary={`${scene.report.fixtures?.count ?? 0} fixtures`}>
          <Toggle label="Front-of-house fixtures" checked={project.lighting.enabled} onChange={(v) => edit((p) => { p.lighting.enabled = v; })} />
          <Select label="Fixture" value={project.lighting.fixtureId} options={FIXTURES.map((f) => ({ value: f.id, label: `${f.manufacturer} ${f.model}` }))} onChange={(v) => edit((p) => { p.lighting.fixtureId = v; })} />
          <NumberControl label="Count" value={project.lighting.count} min={0} max={30} step={1} disabled={!project.lighting.enabled || !project.rigging.front.enabled}
            hint={!project.rigging.front.enabled ? 'Enable the front truss to hang fixtures' : 'Evenly spaced on the front truss'}
            onChange={(v) => edit((p) => { p.lighting.count = v; }, 'light.count')} />
        </Section>

        <Section title="Scenic" defaultOpen={false} summary="Round 3">
          <p className="muted small">Scenic panels, portals and architectural frames arrive in a later round. The <code>60_SCENIC</code> Rhino layer is already reserved in every export.</p>
        </Section>
      </div>
    </aside>
  );
}

const LAYOUTS: { value: SeatingLayout; label: string; hint: string }[] = [
  { value: 'block', label: 'Block', hint: 'Theatre blocks with aisles between them and a cross aisle every 20 rows.' },
  { value: 'grid', label: 'Grid', hint: 'Continental rows with side aisles only; row spacing widens with row length, as code requires.' },
  { value: 'radial', label: 'Radial', hint: 'Curved rows focused on the stage, in a 90° fan with radial aisles.' },
];

function AudienceSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.seating);
  const edit = useStore((s) => s.edit);
  const select = useStore((s) => s.select);
  const u = project.units;
  const p = project.seating ?? { ...DEFAULT_SEATING, enabled: false };
  const set = (fn: (s: typeof p) => void, key?: string) => edit((pr) => { pr.seating ??= { ...DEFAULT_SEATING, enabled: false }; fn(pr.seating); }, key);
  const chair = CHAIRS.find((c) => c.id === p.chairId) ?? CHAIRS[0];
  const layout = LAYOUTS.find((l) => l.value === p.layout)!;
  const off = !p.enabled;
  return (
    <Section title="Audience" summary={p.enabled && r ? `${r.count.toLocaleString()} seats · ${layout.label.toLowerCase()}` : 'off'}>
      <Toggle label="Seating" checked={p.enabled} onChange={(v) => set((s) => { s.enabled = v; })} />
      <div className={`ctl ${off ? 'disabled' : ''}`}>
        <Segmented value={p.layout} onChange={(v) => { set((s) => { s.layout = v; }); select({ group: 'seating' }); }} options={LAYOUTS.map((l) => ({ value: l.value, label: l.label, title: l.hint }))} />
        <div className="ctl-hint">{layout.hint}</div>
      </div>
      <NumberControl label="Seats" value={p.count} min={SEAT_COUNT.min} max={SEAT_COUNT.max} step={SEAT_COUNT.step} disabled={off}
        hint={r ? <>{r.rows} rows · {r.sections} {r.sections === 1 ? 'section' : 'blocks'} · {formatLength(r.width, u)} × {formatLength(r.depth, u)}</> : undefined}
        onChange={(v) => set((s) => { s.count = v; }, 'seat.count')} />
      <LengthControl label="Distance to stage" units={u} value={p.frontDistance} min={1500} max={10000} step={50} disabled={off}
        hint="Deck edge to the front row, on the centreline"
        onChange={(v) => set((s) => { s.frontDistance = v; }, 'seat.front')} />
      <LengthControl label="Row spacing" units={u} value={p.rowPitch} min={760} max={1220} step={5} disabled={off}
        hint={r ? <>{r.rowPitch !== p.rowPitch ? <>Widened to {formatLength(r.rowPitch, u, { precise: true })} for {r.longestRow}-seat rows · </> : null}{formatLength(r.rowClear, u, { precise: true })} clear · up to {r.maxSeatsPerRow} seats per row</> : 'Back to back'}
        onChange={(v) => set((s) => { s.rowPitch = v; }, 'seat.row')} />
      <LengthControl label="Seat spacing" units={u} value={p.seatPitch} min={chair.width} max={760} step={10} disabled={off}
        hint="Centre to centre"
        onChange={(v) => set((s) => { s.seatPitch = v; }, 'seat.pitch')} />
      <LengthControl label="Aisle width" units={u} value={p.aisleWidth} min={900} max={2400} step={10} disabled={off}
        onChange={(v) => set((s) => { s.aisleWidth = v; }, 'seat.aisle')} />
      {p.layout !== 'grid' && (
        <NumberControl label="Seats per block row" value={p.seatsPerBlock} min={6} max={30} step={1} disabled={off}
          onChange={(v) => set((s) => { s.seatsPerBlock = v; }, 'seat.block')} />
      )}
      <div className="cab-meta">
        <VerificationBadge v={chair.verification} />
        <span>{chair.width}×{chair.depth} mm chair</span>
        {r && <span>{r.wheelchairSpaces} wheelchair spaces (ADA)</span>}
      </div>
    </Section>
  );
}
