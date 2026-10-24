import { CHAIRS, DECK_SYSTEMS, FIXTURES, LED_CABINETS, SPEAKERS, getCatalogItem, type DeckSystem, type LedCabinet, type Speaker } from '../core/catalog';
import { SEAT_COUNT } from '../core/engine/seating';
import { C_VALUE } from '../core/engine/audience';
import { ROOFS } from '../core/engine/structure';
import { useState } from 'react';
import { DEFAULT_AUDIENCE, DEFAULT_SHOW, DEFAULT_STRUCTURE, type AudienceParams, type RoofSystem, type ShowParams, type StructureParams, DEFAULT_AUDIO, DEFAULT_BROADCAST, type BroadcastParams, DEFAULT_SCENIC, DEFAULT_SEATING, type ScenicParams, DEFAULT_SHAPES, type AudioParams, type SeatingLayout, type StageFinish, type StageShape } from '../core/schema';
import { formatLength } from '../core/units';
import { LengthControl, NumberControl, Section, Segmented, Select, Toggle, VerificationBadge } from './controls';
import { useStore } from './store';
import { Icon } from './icons';

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

        <Section title="LED media" defaultOpen={false} summary={L ? `${project.ledWalls.length} surface${project.ledWalls.length === 1 ? '' : 's'} · ${scene.report.led.reduce((a, l) => a + l.count, 0)} cabinets` : 'none'}>
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
            <LedArrangement wi={wi} />
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

        <StructureSection />
        <AudioSection />
        <ShowSection />
        <ScenicSection />
        <BroadcastSection />
      </div>
    </aside>
  );
}

function LedArrangement({ wi }: { wi: number }) {
  const project = useStore((s) => s.project);
  const scene = useStore((s) => s.scene);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const wall = project.ledWalls[wi];
  const L = scene.report.led.find((l) => l.id === wall.id);
  const surface = wall.surface ?? 'wall';
  const set = (patch: Partial<typeof wall>, key?: string) => edit((p) => { p.ledWalls[wi] = { ...p.ledWalls[wi], ...patch }; }, key);
  return (<>
    <div className="sub-label">Arrangement</div>
    <div className="ctl">
      <Segmented value={surface} onChange={(v) => set({ surface: v })} options={[
        { value: 'wall', label: 'Wall' },
        { value: 'floor', label: 'Floor', title: 'Laid flat, face up. Height runs upstage. Needs a floor-rated tile.' },
        { value: 'ceiling', label: 'Ceiling', title: 'Flown flat, face down. Height runs upstage.' },
      ]} />
    </div>
    <div className="ctl">
      <div className="ctl-row"><span className="ctl-label">Elevation from</span></div>
      <Segmented value={wall.base ?? 'deck'} onChange={(v) => set({ base: v })} options={[{ value: 'deck', label: 'Deck top' }, { value: 'floor', label: 'Venue floor' }]} />
    </div>
    {surface === 'wall' && (<>
      <Toggle label="Bend to a radius" checked={!!wall.radius} onChange={(on) => set({ radius: on ? 12000 : undefined })} />
      {!!wall.radius && (
        <LengthControl label="Radius" units={u} value={wall.radius} min={-60000} max={60000} step={250}
          hint={L?.arc ? <>{Math.round(L.arc.wrapDeg)}° wrap · {L.curveDeg.toFixed(2)}° per joint · negative = convex (faces out)</> : 'Positive = concave, negative = convex'}
          onChange={(v) => set({ radius: v }, `led.${wall.id}.radius`)} />
      )}
      <Toggle label="Header truss" checked={wall.header !== false} onChange={(v) => set({ header: v })} />
    </>)}
    <NumberControl label="Rotation" value={wall.yawDeg ?? 0} min={-180} max={180} step={5} suffix="°"
      hint="Turns the whole surface about its origin"
      onChange={(v) => set({ yawDeg: v }, `led.${wall.id}.yaw`)} />
  </>);
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
  const ar = useStore((s) => s.scene.report.audience);
  const audienceSummary = [
    p.enabled && r && `${r.count.toLocaleString()} seats`,
    ar?.standing && `${ar.standing.capacity.toLocaleString()} GA`,
    ar && ar.standSeats > 0 && `${ar.standSeats.toLocaleString()} in stands`,
  ].filter(Boolean).join(' · ') || 'off';
  return (
    <Section title="Audience" defaultOpen={false} summary={audienceSummary}>
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
      <StandingControls />
      <StandsControls />
    </Section>
  );
}

const SHAPES: { value: StageShape; label: string; hint: string }[] = [
  { value: 'rect', label: 'Straight', hint: 'Straight-front end stage.' },
  { value: 'thrust', label: 'Thrust', hint: 'A wide centre extension into the audience, built from the same platforms.' },
  { value: 'runway', label: 'Runway', hint: 'A walkway into the house with an optional B-stage at the end. Platforms run lengthwise.' },
  { value: 'rounded', label: 'Rounded', hint: 'A curved apron across the front. The apron is custom carpentry, not hire decking.' },
  { value: 'round', label: 'Round', hint: 'A circular centre stage, diameter = width. Custom carpentry on a hire-deck substructure.' },
  { value: 'cross', label: 'Cross', hint: 'A centre square with four arms, for in-the-round (360°) shows.' },
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
  const cross = { armWidth: 2438, armLength: 4877, ...project.stage.cross };
  const T = area('thrust'), R = area('runway'), B = area('bstage');
  const dim = (a?: { minX: number; maxX: number; minY: number; maxY: number }) => (a ? `${formatLength(a.maxX - a.minX, u)} × ${formatLength(a.maxY - a.minY, u)}` : '');
  return (<>
    <div className="ctl">
      <div className="ctl-row"><span className="ctl-label">Shape</span></div>
      <Segmented wrap value={shape} onChange={(v) => edit((p) => { p.stage.shape = v; })} options={SHAPES.map((o) => ({ value: o.value, label: o.label, title: o.hint }))} />
      <div className="ctl-hint">{SHAPES.find((o) => o.value === shape)?.hint}</div>
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
        <div className="ctl">
          <Segmented value={runway.endShape ?? 'rect'} onChange={(v) => edit((p) => { p.stage.runway = { ...runway, endShape: v }; })}
            options={[{ value: 'rect', label: 'Square B-stage' }, { value: 'round', label: 'Round B-stage', title: 'A circle of the B-stage width, custom carpentry' }]} />
        </div>
      </>)}
    </>)}
    {shape === 'cross' && (<>
      <LengthControl label="Arm width" units={u} value={cross.armWidth} min={S} max={st.width.resolved} step={S}
        onChange={(v) => edit((p) => { p.stage.cross = { ...cross, armWidth: v }; }, 'stage.cross.w')} />
      <LengthControl label="Arm length" units={u} value={cross.armLength} min={S} max={S * 16} step={S}
        hint="Out from each side of the centre square"
        onChange={(v) => edit((p) => { p.stage.cross = { ...cross, armLength: v }; }, 'stage.cross.l')} />
    </>)}
    {shape === 'round' && <p className="muted small">Diameter follows the stage width. Audience, PA and rigging presets for a centre stage sit around its centre.</p>}
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
    <Section title="Risers" defaultOpen={false} summary={risers.length ? `${risers.length} riser${risers.length > 1 ? 's' : ''}` : 'none'}>
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
    <Section title="Audio" defaultOpen={false} summary={a.enabled && r ? `${r.hangs} hangs × ${r.mainsPerSide} · ${r.subs} subs` : 'off'}>
      <Toggle label="PA system" checked={a.enabled} onChange={(v) => set((x) => { x.enabled = v; })} />
      <p className="muted small" style={{ marginTop: off ? 0 : undefined, opacity: off ? 0.5 : 1 }}>Main L/R line-array hangs, subs, front fills and monitors. Positions are for planning — the audio vendor sets array splay and coverage.</p>
      <div className="ctl">
        <Segmented value={a.layout ?? 'lr'} onChange={(v) => set((x) => { x.layout = v; })} options={[
          { value: 'lr', label: 'Left / right', title: 'Two main hangs either side of an end stage' },
          { value: 'quad', label: 'Four-way', title: 'Four positions on the diagonals round a centre stage' },
        ]} />
      </div>
      {a.layout === 'quad' && (<>
        <LengthControl label="Distance from centre" units={u} value={a.quadRadius ?? 10000} min={4000} max={40000} step={250} disabled={off} onChange={(v) => set((x) => { x.quadRadius = v; }, 'audio.qr')} />
        <NumberControl label="Hangs per position" value={a.hangsPerPosition ?? 3} min={1} max={4} step={1} disabled={off} hint={r ? <>{r.hangs} hangs in all</> : undefined} onChange={(v) => set((x) => { x.hangsPerPosition = v; }, 'audio.hpp')} />
      </>)}
      <div className="sub-label">Main hangs</div>
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
      {a.layout !== 'quad' && <NumberControl label="Out-fill boxes per side" value={a.outfills ?? 0} min={0} max={16} step={1} disabled={off} hint="A side hang outboard of each main, turned out" onChange={(v) => set((x) => { x.outfills = v; }, 'audio.out')} />}
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

function BroadcastSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.broadcast);
  const edit = useStore((s) => s.edit);
  const setShot = useStore((s) => s.setShot);
  const select = useStore((s) => s.select);
  const u = project.units;
  const b = project.broadcast ?? DEFAULT_BROADCAST;
  const set = (fn: (x: BroadcastParams) => void, key?: string) => edit((p) => { p.broadcast ??= structuredClone(DEFAULT_BROADCAST); fn(p.broadcast); }, key);
  const off = !b.enabled;
  const pl = r?.platform;
  const summary = b.enabled && r ? `${r.cameras.length} camera${r.cameras.length === 1 ? '' : 's'}${r.prompters.presidential ? ' · prompters' : ''}` : 'off';
  return (
    <Section title="Broadcast" defaultOpen={false} summary={summary}>
      <Toggle label="Cameras & prompters" checked={b.enabled} onChange={(v) => set((x) => { x.enabled = v; })} />
      {!off && r && (<>
        {r.cameras.length > 0 && (
          <div className="cam-list">
            {r.cameras.map((c) => (
              <button key={c.id} title={`Look through ${c.name}`} onClick={() => setShot({ cam: c.id, shot: c.role.includes('wide') ? 'wide' : 'mcu', focal: null })}>
                <span>{c.name}</span><span>{c.role}</span><Icon.camera />
              </button>
            ))}
          </div>
        )}
        <div className="sub-label">Front of house</div>
        <NumberControl label="Platform cameras" value={b.foh.cameras} min={0} max={3} step={1}
          hint={pl ? <>{pl.placement === 'back' ? 'Behind the last row' : 'In the house'} · {formatLength(-pl.yFront, u)} from the stage · {formatLength(pl.height, u, { precise: true })} high</> : 'Long-lens cameras facing the stage'}
          onChange={(v) => { set((x) => { x.foh.cameras = v; }, 'bc.foh'); select({ group: 'bcast:platform' }); }} />
        {b.foh.cameras > 0 && (<>
          <div className="ctl">
            <Segmented value={b.foh.placement} onChange={(v) => set((x) => { x.foh.placement = v; })} options={[
              { value: 'auto', label: 'Auto', title: 'Behind the last row, moving into the house when the throw is too long for a close-up' },
              { value: 'back', label: 'Back of house', title: 'Always behind the last row' },
              { value: 'custom', label: 'Distance', title: 'Set the distance from the stage' },
            ]} />
          </div>
          {b.foh.placement === 'custom' && (
            <LengthControl label="Distance from stage" units={u} value={b.foh.distance} min={5000} max={80000} step={500}
              onChange={(v) => set((x) => { x.foh.distance = v; }, 'bc.dist')} />
          )}
          <Toggle label="Clear a standing audience" checked={b.foh.standing} onChange={(v) => set((x) => { x.foh.standing = v; })} />
        </>)}
        <Toggle label="Side cameras (house L/R)" checked={b.sideCams} onChange={(v) => set((x) => { x.sideCams = v; })} />
        <div className="sub-label">Stage</div>
        <Toggle label="Front rail with robotic dolly" checked={b.rail.enabled} onChange={(v) => set((x) => { x.rail.enabled = v; })} />
        {b.rail.enabled && (<>
          <LengthControl label="Track length" units={u} value={b.rail.length} min={2000} max={30000} step={500}
            hint={r.rail ? <>Lens {formatLength(r.rail.lensHeight, u, { precise: true })} · {r.rail.head} head · {r.rail.payloadKg.toFixed(1)} kg</> : undefined}
            onChange={(v) => set((x) => { x.rail.length = v; }, 'bc.rail')} />
          <Toggle label="On-camera prompter" checked={b.rail.prompter} onChange={(v) => set((x) => { x.rail.prompter = v; })} />
        </>)}
        <Toggle label="RF handheld" checked={b.handheld} onChange={(v) => set((x) => { x.handheld = v; })} />
        <div className="sub-label">Prompters</div>
        <Toggle label="Presidential glass (pair)" checked={b.prompters.presidential} onChange={(v) => set((x) => { x.prompters.presidential = v; })} />
        <div className="ctl">
          <div className="ctl-row"><span className="ctl-label">Downstage monitors</span></div>
          <Segmented value={b.prompters.dsm} onChange={(v) => set((x) => { x.prompters.dsm = v; })} options={[
            { value: 'off', label: 'Off' }, { value: 'stand', label: 'On stands', title: 'Angled up at the presenter from the downstage edge' }, { value: 'recessed', label: 'In the deck', title: 'Recessed under glass, flush with the deck' },
          ]} />
        </div>
        {b.prompters.dsm !== 'off' && <NumberControl label="Monitors" value={b.prompters.dsmCount} min={1} max={4} step={1} onChange={(v) => set((x) => { x.prompters.dsmCount = v; }, 'bc.dsm')} />}
        <div className="ctl">
          <div className="ctl-row"><span className="ctl-label">FOH confidence screens</span></div>
          <Segmented value={b.prompters.foh} onChange={(v) => set((x) => { x.prompters.foh = v; })} options={[
            { value: 'off', label: 'Off' }, { value: 'truss', label: 'Hung', title: 'Hung under the front truss' }, { value: 'riser', label: 'At cameras', title: 'On stands beside the camera platform' },
          ]} />
          {r.prompters.foh > 0 && <div className="ctl-hint">{formatLength(r.prompters.fohDistance, u)} from the presenter · readable to ≈ {formatLength(r.prompters.fohReadable, u)}</div>}
        </div>
        {r.seatKills > 0 && <p className="muted small">{r.seatKills} seat{r.seatKills === 1 ? '' : 's'} removed for camera positions.</p>}
      </>)}
    </Section>
  );
}

function useAudience() {
  const project = useStore((s) => s.project);
  const edit = useStore((s) => s.edit);
  const a = project.audience ?? DEFAULT_AUDIENCE;
  const set = (fn: (x: AudienceParams) => void, key?: string) => edit((p) => { p.audience ??= structuredClone(DEFAULT_AUDIENCE); fn(p.audience); }, key);
  return { a, set, u: project.units };
}

function StandingControls() {
  const { a, set, u } = useAudience();
  const r = useStore((s) => s.scene.report.audience?.standing);
  const g = a.standing;
  const off = !g.enabled;
  return (<>
    <div className="sub-label">Standing (GA)</div>
    <Toggle label="Standing floor" checked={g.enabled} onChange={(v) => set((x) => { x.standing.enabled = v; })} />
    {!off && (<>
      <div className="ctl">
        <Segmented value={g.shape} onChange={(v) => set((x) => { x.standing.shape = v; })} options={[
          { value: 'front', label: 'In front', title: 'A rectangle of floor in front of the stage' },
          { value: 'surround', label: 'Surround', title: 'A ring all the way round a centre stage' },
        ]} />
      </div>
      {g.shape === 'front' ? (<>
        <LengthControl label="Floor width" units={u} value={g.width} min={5000} max={120000} step={500} onChange={(v) => set((x) => { x.standing.width = v; }, 'ga.w')} />
        <LengthControl label="Floor depth" units={u} value={g.depth} min={5000} max={150000} step={500} onChange={(v) => set((x) => { x.standing.depth = v; }, 'ga.d')} />
      </>) : (
        <LengthControl label="Outer radius" units={u} value={g.radius} min={5000} max={100000} step={500} hint="From the stage centre" onChange={(v) => set((x) => { x.standing.radius = v; }, 'ga.r')} />
      )}
      <NumberControl label="Density" value={g.density} min={0.5} max={4} step={0.25} suffix="/m²"
        hint={r ? <>{r.areaM2.toLocaleString()} m² · {r.capacity.toLocaleString()} people · 2/m² is common planning practice, above 4/m² is unsafe</> : undefined}
        onChange={(v) => set((x) => { x.standing.density = v; }, 'ga.dens')} />
      <Toggle label="Front-of-stage barricade" checked={g.barricade} onChange={(v) => set((x) => { x.standing.barricade = v; })} />
      {g.barricade && (
        <LengthControl label="Pit depth" units={u} value={g.pit} min={900} max={4000} step={100}
          hint={r ? <>{Math.round(r.barricadeM)} m of barricade · generic sections</> : 'Deck edge to the barricade'}
          onChange={(v) => set((x) => { x.standing.pit = v; }, 'ga.pit')} />
      )}
    </>)}
  </>);
}

const NO_STANDS: never[] = [];

function StandsControls() {
  const { a, set, u } = useAudience();
  const reports = useStore((s) => s.scene.report.audience?.stands) ?? NO_STANDS;
  const [picked, setPicked] = useState<string | null>(null);
  const i = Math.max(0, a.stands.findIndex((s) => s.id === picked));
  const st = a.stands[i];
  const rep = st ? reports.find((r) => r.id === st.id) : undefined;
  const add = () => {
    let n = a.stands.length + 1;
    while (a.stands.some((x) => x.id === `s${n}`)) n++;
    const id = `s${n}`;
    set((x) => { x.stands.push({ id, name: `Stand ${n}`, kind: 'straight', x: 0, y: -30000, width: 20000, yawDeg: 0, cx: 0, cy: 0, r0: 20000, a0: 200, a1: 340, rows: 15, rowRise: 300, rowPitch: 850, base: 0 }); });
    setPicked(id);
  };
  const cTone = (c: number | null) => (c == null ? '' : c >= C_VALUE.recommended ? 'ok' : c >= C_VALUE.min ? 'warn' : 'bad');
  return (<>
    <div className="sub-label">Raked stands</div>
    <div className="surface-tabs">
      {a.stands.map((x) => <button key={x.id} className={x.id === st?.id ? 'on' : ''} onClick={() => setPicked(x.id)}>{x.name}</button>)}
      <button className="add" onClick={add} title="Add a seating stand">+</button>
    </div>
    {!st && <p className="muted small">Stepped seating stands, straight or curved round the stage. Sightlines are checked with the C-value (60 mm minimum, 90 recommended).</p>}
    {st && (<>
      <div className="ctl surface-head">
        <input className="name-input" value={st.name} spellCheck={false} onChange={(e) => set((x) => { x.stands[i].name = e.target.value; }, `stand.${st.id}.name`)} />
        <button className="text-btn danger" onClick={() => set((x) => { x.stands = x.stands.filter((s) => s.id !== st.id); })}>Remove</button>
      </div>
      {rep && <div className="cab-meta"><span>{rep.seats.toLocaleString()} seats</span><span>{rep.rows} rows</span>{rep.minC != null && <span className={cTone(rep.minC)}>C-value {Math.round(rep.minC)} mm</span>}<span>top {formatLength(rep.topHeight, u)}</span></div>}
      <NumberControl label="Rows" value={st.rows} min={1} max={60} step={1} onChange={(v) => set((x) => { x.stands[i].rows = v; }, `stand.${st.id}.rows`)} />
      <LengthControl label="Row rise" units={u} value={st.rowRise} min={100} max={600} step={10} hint="Riser height per row; raise it if the C-value is low" onChange={(v) => set((x) => { x.stands[i].rowRise = v; }, `stand.${st.id}.rise`)} />
      <LengthControl label="Row depth" units={u} value={st.rowPitch} min={760} max={1200} step={10} onChange={(v) => set((x) => { x.stands[i].rowPitch = v; }, `stand.${st.id}.pitch`)} />
      <LengthControl label="First row height" units={u} value={st.base} min={0} max={15000} step={100} onChange={(v) => set((x) => { x.stands[i].base = v; }, `stand.${st.id}.base`)} />
      {st.kind === 'straight' ? (<>
        <LengthControl label="Width" units={u} value={st.width} min={3000} max={120000} step={500} onChange={(v) => set((x) => { x.stands[i].width = v; }, `stand.${st.id}.w`)} />
        <LengthControl label="Front row X" units={u} value={st.x} min={-100000} max={100000} step={500} onChange={(v) => set((x) => { x.stands[i].x = v; }, `stand.${st.id}.x`)} />
        <LengthControl label="Front row Y" units={u} value={st.y} min={-150000} max={100000} step={500} onChange={(v) => set((x) => { x.stands[i].y = v; }, `stand.${st.id}.y`)} />
        <NumberControl label="Facing" value={st.yawDeg} min={-180} max={180} step={5} suffix="°" hint="0° faces upstage, toward the stage" onChange={(v) => set((x) => { x.stands[i].yawDeg = v; }, `stand.${st.id}.yaw`)} />
      </>) : (<>
        <LengthControl label="Front row radius" units={u} value={st.r0} min={3000} max={100000} step={500} onChange={(v) => set((x) => { x.stands[i].r0 = v; }, `stand.${st.id}.r0`)} />
        <NumberControl label="Start angle" value={st.a0} min={-360} max={360} step={5} suffix="°" onChange={(v) => set((x) => { x.stands[i].a0 = v; }, `stand.${st.id}.a0`)} />
        <NumberControl label="End angle" value={st.a1} min={-360} max={360} step={5} suffix="°" onChange={(v) => set((x) => { x.stands[i].a1 = v; }, `stand.${st.id}.a1`)} />
      </>)}
    </>)}
  </>);
}

const ROOF_OPTIONS = (Object.keys(ROOFS) as RoofSystem[]).map((k) => ({ value: k, label: ROOFS[k].name }));

function StructureSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.structure);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const p = project.structure ?? DEFAULT_STRUCTURE;
  const set = (fn: (x: StructureParams) => void, key?: string) => edit((pr) => { pr.structure ??= structuredClone(DEFAULT_STRUCTURE); fn(pr.structure); }, key);
  const spec = ROOFS[p.roof.system];
  const summary = [p.roof.enabled && 'roof', p.grid.enabled && 'grid', p.delays.enabled && `${p.delays.count} delays`, p.truss.length > 0 && `${p.truss.length} truss`].filter(Boolean).join(' · ') || 'off';
  return (
    <Section title="Structure" defaultOpen={false} summary={summary}>
      <Toggle label="Ground-support roof" checked={p.roof.enabled} onChange={(v) => set((x) => { x.roof.enabled = v; })} />
      {p.roof.enabled && (<>
        <Select label="System" value={p.roof.system} options={ROOF_OPTIONS} onChange={(v) => set((x) => { x.roof.system = v as RoofSystem; x.roof.span = ROOFS[v as RoofSystem].spans[0]; })} />
        {spec.spans.length > 1 && (
          <div className="ctl"><div className="ctl-row"><span className="ctl-label">Span</span></div>
            <Segmented value={String(r?.roof?.span ?? p.roof.span)} onChange={(v) => set((x) => { x.roof.span = +v; })} options={spec.spans.map((s) => ({ value: String(s), label: `${s / 1000} m` }))} />
          </div>
        )}
        <div className="cab-meta"><VerificationBadge v="generic" />
          <span>{spec.spans.map((s) => s / 1000).join(' / ')} m span</span><span>{formatLength(spec.clearance, u)} clear</span>{spec.gridLoadT != null && <span>{spec.gridLoadT} t grid</span>}
        </div>
        <p className="muted small">Envelope from <a href={spec.source} target="_blank" rel="noreferrer">Stageco's published figures</a> ({spec.verified.join(', ')}). Tower and roof members are drawn generically.</p>
        <Toggle label="PA wings" checked={p.roof.wings} onChange={(v) => set((x) => { x.roof.wings = v; })} />
        {p.roof.wings && <Toggle label="IMAG screens on the wings" checked={p.roof.wingImag} onChange={(v) => set((x) => { x.roof.wingImag = v; })} />}
      </>)}
      <div className="sub-label">Mother grid</div>
      <Toggle label="Truss grid over the stage" checked={p.grid.enabled} onChange={(v) => set((x) => { x.grid.enabled = v; })} />
      {p.grid.enabled && (<>
        <LengthControl label="Grid width" units={u} value={p.grid.width} min={4000} max={40000} step={500} onChange={(v) => set((x) => { x.grid.width = v; }, 'grid.w')} />
        <LengthControl label="Grid depth" units={u} value={p.grid.depth} min={3000} max={40000} step={500} onChange={(v) => set((x) => { x.grid.depth = v; }, 'grid.d')} />
        <LengthControl label="Trim" units={u} value={p.grid.trim} min={4000} max={25000} step={250} onChange={(v) => set((x) => { x.grid.trim = v; }, 'grid.trim')} />
        <LengthControl label="Run spacing" units={u} value={p.grid.spacing} min={1500} max={8000} step={250} hint={r?.grid ? <>{r.grid.runs} runs</> : undefined} onChange={(v) => set((x) => { x.grid.spacing = v; }, 'grid.sp')} />
      </>)}
      <div className="sub-label">Delay towers</div>
      <Toggle label="Delay towers in the field" checked={p.delays.enabled} onChange={(v) => set((x) => { x.delays.enabled = v; })} />
      {p.delays.enabled && (<>
        <NumberControl label="Towers" value={p.delays.count} min={1} max={8} step={1} onChange={(v) => set((x) => { x.delays.count = v; }, 'dly.n')} />
        <LengthControl label="Distance from mains" units={u} value={p.delays.distance} min={20000} max={150000} step={1000}
          hint={r?.delays ? <>≈ {r.delays.delayMs} ms delay at 343 m/s</> : undefined}
          onChange={(v) => set((x) => { x.delays.distance = v; }, 'dly.dist')} />
        <LengthControl label="Spread" units={u} value={p.delays.spread} min={0} max={100000} step={1000} onChange={(v) => set((x) => { x.delays.spread = v; }, 'dly.spread')} />
        <LengthControl label="Tower height" units={u} value={p.delays.height} min={6000} max={25000} step={500} onChange={(v) => set((x) => { x.delays.height = v; }, 'dly.h')} />
      </>)}
      {p.truss.length > 0 && <p className="muted small">{p.truss.length} free truss members{r ? ` · ${(r.freeTruss.lengthMm / 1000).toFixed(1)} m` : ''}, set by the preset.</p>}
    </Section>
  );
}

function ShowSection() {
  const project = useStore((s) => s.project);
  const r = useStore((s) => s.scene.report.show);
  const edit = useStore((s) => s.edit);
  const u = project.units;
  const p = project.show ?? DEFAULT_SHOW;
  const set = (fn: (x: ShowParams) => void, key?: string) => edit((pr) => { pr.show ??= structuredClone(DEFAULT_SHOW); fn(pr.show); }, key);
  const summary = [p.booth.enabled && 'DJ booth', p.blocks.length > 0 && `${p.blocks.length} blocks`, p.dome.enabled && 'dome'].filter(Boolean).join(' · ') || 'off';
  return (
    <Section title="Show elements" defaultOpen={false} summary={summary}>
      <Toggle label="DJ booth" checked={p.booth.enabled} onChange={(v) => set((x) => { x.booth.enabled = v; })} />
      {p.booth.enabled && (<>
        <NumberControl label="Players" value={p.booth.decks} min={1} max={6} step={1} hint="Pioneer DJ CDJ-3000 footprints, plus a generic mixer" onChange={(v) => set((x) => { x.booth.decks = v; }, 'booth.n')} />
        <LengthControl label="Table width" units={u} value={p.booth.width} min={1200} max={6000} step={100} hint={r?.booth ? <>Gear {formatLength(r.booth.gearWidth, u)} wide</> : undefined} onChange={(v) => set((x) => { x.booth.width = v; }, 'booth.w')} />
        <LengthControl label="Upstage of deck edge" units={u} value={p.booth.y} min={0} max={20000} step={100} onChange={(v) => set((x) => { x.booth.y = v; }, 'booth.y')} />
      </>)}
      <div className="sub-label">LED dome</div>
      <Toggle label="LED dome" checked={p.dome.enabled} onChange={(v) => set((x) => { x.dome.enabled = v; })} />
      {p.dome.enabled && (<>
        <LengthControl label="Diameter" units={u} value={p.dome.diameter} min={6000} max={40000} step={500} onChange={(v) => set((x) => { x.dome.diameter = v; }, 'dome.d')} />
        <LengthControl label="Springing height" units={u} value={p.dome.springing} min={0} max={8000} step={100} hint="Height of the base ring" onChange={(v) => set((x) => { x.dome.springing = v; }, 'dome.s')} />
        <NumberControl label="Opening" value={p.dome.openingDeg} min={0} max={180} step={5} suffix="°" hint="Wedge left open toward the audience" onChange={(v) => set((x) => { x.dome.openingDeg = v; }, 'dome.o')} />
        {r?.dome && <div className="cab-meta"><VerificationBadge v="generic" /><span>{r.dome.tiles.toLocaleString()} tiles</span><span>{r.dome.rings} rings</span><span>{Math.round(r.dome.areaM2).toLocaleString()} m²</span></div>}
      </>)}
      {p.blocks.length > 0 && <p className="muted small">{p.blocks.length} scenic blocks, set by the preset.</p>}
    </Section>
  );
}
