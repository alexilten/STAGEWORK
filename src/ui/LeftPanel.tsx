import { DECK_SYSTEMS, FIXTURES, LED_CABINETS, getCatalogItem, type DeckSystem, type LedCabinet } from '../core/catalog';
import type { StageFinish } from '../core/schema';
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

        {wall && L && cab && (
          <Section title="LED media" summary={`${L.cols} × ${L.rows} · ${L.count} cabinets`}>
            {project.ledWalls.length > 1 && (
              <Segmented size="sm" value={wall.id} onChange={setActiveWall}
                options={project.ledWalls.map((w) => ({ value: w.id, label: w.name.replace(/ (wall|screen)$/i, '') }))} />
            )}
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
          </Section>
        )}

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
