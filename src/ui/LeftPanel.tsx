import { CHAIRS, DECK_SYSTEMS, FIXTURES, LED_CABINETS, SPEAKERS, getCatalogItem, type DeckSystem, type LedCabinet, type Speaker } from '../core/catalog';
import { SEAT_COUNT } from '../core/engine/seating';
import { useState } from 'react';
import { DEFAULT_AUDIO, DEFAULT_SCENIC, DEFAULT_SEATING, type ScenicParams, DEFAULT_SHAPES, type AudioParams, type SeatingLayout, type StageFinish, type StageShape } from '../core/schema';
import { formatLength } from '../core/units';
import { LengthControl, NumberControl, Section, Segmented, Select, Toggle, VerificationBadge } from './controls';
import { useStore } from './store';

const ASPECTS: { label: string; r: number }[] = [
  { label: '16:9', r: 16 / 9 }, { label: '21:9', r: 21 / 9 }, { label: '32:9', r: 32 / 9 }, { label: '4:1', r: 4 },
];

const FIXTURE_OPTIONS = FIXTURES.map((f) => ({ value: f.id, label: `${f.manufacturer} ${f.model}`, badge: f.form === 'batten' ? 'batten' : f.fixtureType }));

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
          <ShapeControls />
        </Section>

        <RiserSection />

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

        <Section title="Lighting" defaultOpen={false} summary={`${scene.report.fixtures?.count ?? 0} FOH · ${scene.report.lightingPositions?.fixtureTotal ?? 0} positions`}>
          <Toggle label="Lighting" checked={project.lighting.enabled} onChange={(v) => edit((p) => { p.lighting.enabled = v; })} />
          <Select label="FOH fixture" value={project.lighting.fixtureId} options={FIXTURE_OPTIONS} onChange={(v) => edit((p) => { p.lighting.fixtureId = v; })} />
          <NumberControl label="FOH count" value={project.lighting.count} min={0} max={30} step={1} disabled={!project.lighting.enabled || !project.rigging.front.enabled}
            hint={!project.rigging.front.enabled ? 'Enable the front truss to hang fixtures' : 'Evenly spaced on the front truss'}
            onChange={(v) => edit((p) => { p.lighting.count = v; }, 'light.count')} />
          <div className="sub-label">Overhead electrics</div>
          <Select label="Electrics fixture" value={project.lighting.electrics.fixtureId ?? project.lighting.fixtureId} options={FIXTURE_OPTIONS} onChange={(v) => edit((p) => { p.lighting.electrics.fixtureId = v; })} />
          <NumberControl label="Battens" value={project.lighting.electrics.count} min={0} max={8} step={1} disabled={!project.lighting.enabled}
            hint={scene.report.lightingPositions ? <>{scene.report.lightingPositions.electrics < project.lighting.electrics.count ? `${scene.report.lightingPositions.electrics} of ${project.lighting.electrics.count} fit` : scene.report.lightingPositions.electrics} over the stage · {scene.report.lightingPositions.electrics * scene.report.lightingPositions.perBatten} fixtures</> : 'Battens over the stage'}
            onChange={(v) => edit((p) => { p.lighting.electrics.count = v; }, 'light.elx.n')} />
          <NumberControl label="Fixtures per batten" value={project.lighting.electrics.perBatten} min={0} max={24} step={1} disabled={!project.lighting.enabled}
            hint={scene.report.lightingPositions && scene.report.lightingPositions.perBatten < project.lighting.electrics.perBatten ? `${scene.report.lightingPositions.perBatten} fit along the batten` : undefined}
            onChange={(v) => edit((p) => { p.lighting.electrics.perBatten = v; }, 'light.elx.m')} />
          <LengthControl label="Electrics trim" units={u} value={project.lighting.electrics.trim} min={3000} max={14000} step={100} disabled={!project.lighting.enabled}
            onChange={(v) => edit((p) => { p.lighting.electrics.trim = v; }, 'light.elx.trim')} />
          <LengthControl label="First batten upstage" units={u} value={project.lighting.electrics.firstAt} min={0} max={8000} step={100} disabled={!project.lighting.enabled}
            onChange={(v) => edit((p) => { p.lighting.electrics.firstAt = v; }, 'light.elx.first')} />
          <LengthControl label="Batten spacing" units={u} value={project.lighting.electrics.spacing} min={500} max={5000} step={100} disabled={!project.lighting.enabled}
            onChange={(v) => edit((p) => { p.lighting.electrics.spacing = v; }, 'light.elx.sp')} />
          <div className="sub-label">Side booms</div>
          <Toggle label="Side booms (L/R)" checked={project.lighting.booms.enabled} onChange={(v) => edit((p) => { p.lighting.booms.enabled = v; })} />
          {project.lighting.booms.enabled && <Select label="Boom fixture" value={project.lighting.booms.fixtureId ?? project.lighting.fixtureId} options={FIXTURE_OPTIONS} onChange={(v) => edit((p) => { p.lighting.booms.fixtureId = v; })} />}
          <NumberControl label="Fixtures per boom" value={project.lighting.booms.perBoom} min={0} max={12} step={1} disabled={!project.lighting.enabled || !project.lighting.booms.enabled}
            onChange={(v) => edit((p) => { p.lighting.booms.perBoom = v; }, 'light.boom.m')} />
          <LengthControl label="Boom height" units={u} value={project.lighting.booms.height} min={1500} max={7000} step={100} disabled={!project.lighting.enabled || !project.lighting.booms.enabled}
            onChange={(v) => edit((p) => { p.lighting.booms.height = v; }, 'light.boom.h')} />
        </Section>

        <AudioSection />
        <ScenicSection />

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

const SHAPES: { value: StageShape; label: string; hint: string }[] = [
  { value: 'rect', label: 'Straight', hint: 'Straight-front end stage.' },
  { value: 'thrust', label: 'Thrust', hint: 'A wide centre extension into the audience, built from the same platforms.' },
  { value: 'runway', label: 'Runway', hint: 'A walkway into the house with an optional B-stage at the end. Platforms run lengthwise.' },
  { value: 'rounded', label: 'Rounded', hint: 'A curved apron across the front. The apron is custom carpentry, not hire decking.' },
];

function ShapeControls() {
  const project = useStore((s) => s.project);
  const st = useStore((s) => s.scene.report.stage);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const deck = getCatalogItem<DeckSystem>(project.stage.deckSystemId, 'deck');
  const S = deck.short;
  const shape = project.stage.shape ?? 'rect';
  const area = (k: string) => st.areas.find((a) => a.kind === k);
  const thrust = { ...DEFAULT_SHAPES.thrust, ...project.stage.thrust };
  const runway = { ...DEFAULT_SHAPES.runway, ...project.stage.runway };
  const apron = { ...DEFAULT_SHAPES.apron, ...project.stage.apron };
  const T = area('thrust'), R = area('runway'), B = area('bstage');
  const dim = (a?: { minX: number; maxX: number; minY: number; maxY: number }) => (a ? `${formatLength(a.maxX - a.minX, u)} × ${formatLength(a.maxY - a.minY, u)}` : '');
  return (<>
    <div className="ctl">
      <div className="ctl-row"><span className="ctl-label">Shape</span></div>
      <Segmented value={shape} onChange={(v) => edit((p) => { p.stage.shape = v; })} options={SHAPES.map((o) => ({ value: o.value, label: o.label, title: o.hint }))} />
      <div className="ctl-hint">{SHAPES.find((o) => o.value === shape)!.hint}</div>
    </div>
    {shape === 'thrust' && (<>
      <LengthControl label="Thrust width" units={u} value={thrust.width} resolved={undefined} min={S} max={st.width.resolved} step={S}
        hint={T ? <>{T.cols} modules · {dim(T)}</> : undefined}
        onChange={(v) => edit((p) => { p.stage.thrust = { ...thrust, width: v }; }, 'stage.thrust.w')} />
      <LengthControl label="Thrust depth" units={u} value={thrust.depth} min={S} max={S * 12} step={S}
        hint={T ? <>{T.rows} platform rows</> : undefined}
        onChange={(v) => edit((p) => { p.stage.thrust = { ...thrust, depth: v }; }, 'stage.thrust.d')} />
    </>)}
    {shape === 'runway' && (<>
      <LengthControl label="Runway width" units={u} value={runway.width} min={S} max={S * 4} step={S}
        hint={R ? <>{R.cols} module{R.cols > 1 ? 's' : ''} wide</> : undefined}
        onChange={(v) => edit((p) => { p.stage.runway = { ...runway, width: v }; }, 'stage.runway.w')} />
      <LengthControl label="Runway length" units={u} value={runway.length} min={S * 2} max={S * 30} step={S}
        hint={R ? <>{formatLength(R.maxY - R.minY, u)} into the house</> : undefined}
        onChange={(v) => edit((p) => { p.stage.runway = { ...runway, length: v }; }, 'stage.runway.l')} />
      <Toggle label="B-stage at the end" checked={runway.endWidth > 0 && runway.endDepth > 0}
        onChange={(on) => edit((p) => { p.stage.runway = { ...runway, endWidth: on ? DEFAULT_SHAPES.runway.endWidth : 0, endDepth: on ? DEFAULT_SHAPES.runway.endDepth : 0 }; })} />
      {B && (<>
        <LengthControl label="B-stage width" units={u} value={runway.endWidth} min={S} max={S * 12} step={S} hint={dim(B)}
          onChange={(v) => edit((p) => { p.stage.runway = { ...runway, endWidth: v }; }, 'stage.runway.ew')} />
        <LengthControl label="B-stage depth" units={u} value={runway.endDepth} min={S} max={S * 8} step={S}
          onChange={(v) => edit((p) => { p.stage.runway = { ...runway, endDepth: v }; }, 'stage.runway.ed')} />
      </>)}
    </>)}
    {shape === 'rounded' && (
      <LengthControl label="Apron depth" units={u} value={apron.depth} min={300} max={Math.max(600, st.width.resolved / 2)} step={50}
        hint={st.apron ? <>Arc across the full {formatLength(st.width.resolved, u)} front</> : undefined}
        onChange={(v) => edit((p) => { p.stage.apron = { depth: v }; }, 'stage.apron')} />
    )}
  </>);
}

function RiserSection() {
  const project = useStore((s) => s.project);
  const st = useStore((s) => s.scene.report.stage);
  const edit = useStore((s) => s.edit);
  const select = useStore((s) => s.select);
  const sel = useStore((s) => s.selection);
  const u = project.units;
  const deck = getCatalogItem<DeckSystem>(project.stage.deckSystemId, 'deck');
  const S = deck.short;
  const risers = project.stage.risers ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const fromSel = sel?.group.startsWith('riser:') ? sel.group.slice(6) : null;
  const ri = Math.max(0, risers.findIndex((r) => r.id === (fromSel ?? picked)));
  const r = risers[ri];
  const A = r ? st.areas.find((a) => a.group === `riser:${r.id}`) : undefined;
  const pick = (id: string) => { setPicked(id); select({ group: `riser:${id}` }); };
  const add = () => {
    let n = risers.length + 1;
    while (risers.some((x) => x.id === `r${n}`)) n++;
    const id = `r${n}`;
    edit((p) => {
      p.stage.risers = [...(p.stage.risers ?? []), { id, name: `Riser ${n}`, width: S * 4, depth: S * 2, height: deck.minHeight + deck.heightStep * 2, x: 0, y: Math.max(0, st.depth.resolved - S * 2) }];
    });
    pick(id);
  };
  const set = (patch: Partial<NonNullable<typeof r>>, key?: string) => edit((p) => { p.stage.risers![ri] = { ...p.stage.risers![ri], ...patch }; }, key);
  return (
    <Section title="Risers" defaultOpen={risers.length > 0} summary={risers.length ? `${risers.length} riser${risers.length > 1 ? 's' : ''}` : 'none'}>
      <div className="surface-tabs">
        {risers.map((x) => <button key={x.id} className={x.id === r?.id ? 'on' : ''} onClick={() => pick(x.id)}>{x.name}</button>)}
        <button className="add" onClick={add} title="Add a riser on the deck">+</button>
      </div>
      {!r && <p className="muted small">Raised platforms on the deck: band risers, an upstage level, a presenter step-up.</p>}
      {r && A && (<>
        <div className="ctl surface-head">
          <input className="name-input" value={r.name} spellCheck={false} onChange={(e) => set({ name: e.target.value }, `riser.${r.id}.name`)} />
          <button className="text-btn danger" onClick={() => { edit((p) => { p.stage.risers = (p.stage.risers ?? []).filter((x) => x.id !== r.id); }); select(null); }}>Remove</button>
        </div>
        <p className="muted small drag-hint">Select it in the viewport and drag, or use the arrow handles. It snaps to the deck seams.</p>
        <LengthControl label="Width" units={u} value={r.width} min={S} max={st.width.resolved} step={S} hint={<>{A.cols} modules</>}
          onChange={(v) => set({ width: v }, `riser.${r.id}.w`)} />
        <LengthControl label="Depth" units={u} value={r.depth} min={S} max={st.depth.resolved} step={S} hint={<>{A.rows} platform rows</>}
          onChange={(v) => set({ depth: v }, `riser.${r.id}.d`)} />
        <LengthControl label="Height above deck" units={u} value={r.height} min={deck.minHeight} max={deck.maxHeight} step={deck.heightStep}
          hint={<>Top at {formatLength(A.top, u, { precise: true })} above the floor</>}
          onChange={(v) => set({ height: v }, `riser.${r.id}.h`)} />
        <LengthControl label="Offset from centre" units={u} value={r.x} min={-st.width.resolved / 2} max={st.width.resolved / 2} step={S / 2}
          onChange={(v) => set({ x: v }, `riser.${r.id}.x`)} />
        <LengthControl label="Upstage of deck edge" units={u} value={r.y} min={0} max={st.depth.resolved - S} step={S}
          onChange={(v) => set({ y: v }, `riser.${r.id}.y`)} />
      </>)}
    </Section>
  );
}

const speakersOf = (t: Speaker['speakerType']) => SPEAKERS.filter((x) => x.speakerType === t);

function AudioSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.audio);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const a = project.audio ?? DEFAULT_AUDIO;
  const set = (fn: (x: AudioParams) => void, key?: string) => edit((p) => { p.audio ??= { ...DEFAULT_AUDIO }; fn(p.audio); }, key);
  const off = !a.enabled;
  const main = getCatalogItem<Speaker>(a.mainSpeakerId, 'speaker');
  return (
    <Section title="Audio" defaultOpen={false} summary={a.enabled && r ? `${r.mainsPerSide}/side · ${r.subs} subs` : 'off'}>
      <Toggle label="PA system" checked={a.enabled} onChange={(v) => set((x) => { x.enabled = v; })} />
      <p className="muted small" style={{ marginTop: off ? 0 : undefined, opacity: off ? 0.5 : 1 }}>Main L/R line-array hangs, subs, front fills and monitors. Positions are for planning — the audio vendor sets array splay and coverage.</p>
      <div className="sub-label">Main hangs (L/R)</div>
      <Select label="Box" value={a.mainSpeakerId} options={speakersOf('line-array').map((x) => ({ value: x.id, label: `${x.manufacturer} ${x.model}` }))} onChange={(v) => set((x) => { x.mainSpeakerId = v; })} />
      <NumberControl label="Boxes per side" value={a.mainsPerSide} min={1} max={24} step={1} disabled={off}
        hint={r ? <>{r.mainsPerSide * 2} boxes · {main.dispersionH ?? '—'}° horizontal</> : undefined}
        onChange={(v) => set((x) => { x.mainsPerSide = v; }, 'audio.n')} />
      <LengthControl label="Array trim (top)" units={u} value={a.trim} min={3000} max={16000} step={250} disabled={off}
        hint={r ? <>Top of array above the floor</> : undefined} onChange={(v) => set((x) => { x.trim = v; }, 'audio.trim')} />
      <LengthControl label="Outboard spread" units={u} value={a.spread} min={2000} max={20000} step={250} disabled={off}
        hint="Each hang's offset from the centreline" onChange={(v) => set((x) => { x.spread = v; }, 'audio.spread')} />
      <NumberControl label="Splay per box" value={a.splayPerBox} min={0} max={Math.max(1, main.splayRange?.[1] ?? 7)} step={0.5} suffix="°" disabled={off}
        hint={main.splayRange ? <>Nominal rake · product range {main.splayRange[0]}–{main.splayRange[1]}°</> : undefined}
        onChange={(v) => set((x) => { x.splayPerBox = v; }, 'audio.splay')} />
      <div className="sub-label">Subs</div>
      <Select label="Box" value={a.subSpeakerId} options={speakersOf('sub').map((x) => ({ value: x.id, label: `${x.manufacturer} ${x.model}` }))} onChange={(v) => set((x) => { x.subSpeakerId = v; })} />
      <NumberControl label="Count" value={a.subs} min={0} max={24} step={1} disabled={off} onChange={(v) => set((x) => { x.subs = v; }, 'audio.subs')} />
      <div className="ctl"><Segmented value={a.subMode} onChange={(v) => set((x) => { x.subMode = v; })} options={[{ value: 'ground', label: 'Ground-stacked' }, { value: 'flown', label: 'Flown' }]} /></div>
      <div className="sub-label">Fills & monitors</div>
      <NumberControl label="Front fills" value={a.frontFills} min={0} max={16} step={1} disabled={off} onChange={(v) => set((x) => { x.frontFills = v; }, 'audio.fills')} />
      <NumberControl label="Stage wedges" value={a.monitors} min={0} max={16} step={1} disabled={off} onChange={(v) => set((x) => { x.monitors = v; }, 'audio.mons')} />
      {r?.weightKg != null && <div className="cab-meta"><VerificationBadge v={main.verification} /><span>{(r.weightKg / 1000).toFixed(2)} t total</span></div>}
    </Section>
  );
}

function ScenicSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.scenic);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const sc = project.scenic ?? DEFAULT_SCENIC;
  const set = (fn: (x: ScenicParams) => void, key?: string) => edit((p) => { p.scenic ??= structuredClone(DEFAULT_SCENIC); fn(p.scenic); }, key);
  const P = sc.portal, M = sc.masking;
  const summary = [P.enabled && 'portal', M.enabled && `${M.pairs * 2} legs`, sc.drape.enabled && 'drape'].filter(Boolean).join(' · ') || 'off';
  return (
    <Section title="Scenic" defaultOpen={false} summary={summary}>
      <Toggle label="Portal around the main screen" checked={P.enabled} onChange={(v) => set((x) => { x.portal.enabled = v; })} />
      {P.enabled && (<>
        <LengthControl label="Margin around screen" units={u} value={P.margin} min={0} max={2000} step={50}
          hint={r?.portal ? <>Opening {formatLength(r.portal.opening.width, u)} × {formatLength(r.portal.opening.height, u)}</> : 'Frames the main screen'}
          onChange={(v) => set((x) => { x.portal.margin = v; }, 'scn.margin')} />
        <LengthControl label="Leg width" units={u} value={P.legWidth} min={300} max={4000} step={50} onChange={(v) => set((x) => { x.portal.legWidth = v; }, 'scn.leg')} />
        <LengthControl label="Header height" units={u} value={P.headerHeight} min={300} max={4000} step={50} onChange={(v) => set((x) => { x.portal.headerHeight = v; }, 'scn.head')} />
        <div className="ctl">
          <div className="ctl-row"><span className="ctl-label">Portal finish</span></div>
          <div className="swatches">
            {(['white', 'graphite', 'black', 'oak'] as StageFinish[]).map((f) => (
              <button key={f} title={f} className={`swatch ${f} ${P.finish === f ? 'on' : ''}`} onClick={() => set((x) => { x.portal.finish = f; })} />
            ))}
          </div>
        </div>
      </>)}
      <div className="sub-label">Soft goods</div>
      <Toggle label="Masking legs (sides)" checked={M.enabled} onChange={(v) => set((x) => { x.masking.enabled = v; })} />
      {M.enabled && (<>
        <NumberControl label="Pairs" value={M.pairs} min={1} max={5} step={1} hint="Down each side of the deck, facing the house" onChange={(v) => set((x) => { x.masking.pairs = v; }, 'scn.pairs')} />
        <LengthControl label="Leg width" units={u} value={M.legWidth} min={600} max={4000} step={50} onChange={(v) => set((x) => { x.masking.legWidth = v; }, 'scn.mw')} />
        <LengthControl label="Height above deck" units={u} value={M.height} min={2000} max={12000} step={100} onChange={(v) => set((x) => { x.masking.height = v; }, 'scn.mh')} />
      </>)}
      <Toggle label="Upstage drape" checked={sc.drape.enabled} onChange={(v) => set((x) => { x.drape.enabled = v; })} />
    </Section>
  );
}
