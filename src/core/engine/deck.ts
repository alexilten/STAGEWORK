import type { DeckSystem } from '../catalog';
import type { StageParams } from '../schema';
import { resolveModules, snapStep } from './modular';
import type { BlockDef, Part, Resolved1D, SceneObject, Warning } from './types';

export interface DeckLayout {
  width: Resolved1D;
  depth: Resolved1D;
  height: Resolved1D;
  primaryCount: number;
  infillCount: number;
  legCount: number;
  legLength: number;
  footprint: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Lay out platforms on a grid of `short`-sized cells. Each row (one platform deep)
 * is filled with primary platforms long-side along X, plus one infill square when
 * the column count is odd. Only full manufacturer platforms are ever produced.
 */
export function resolveDeck(stage: StageParams, sys: DeckSystem) {
  if (Math.abs(sys.long - 2 * sys.short) > 0.5 || Math.abs(sys.infill.long - sys.short) > 0.5)
    throw new Error(`Deck system ${sys.id}: layout requires long = 2 × short and a square infill`);

  const width = resolveModules(stage.width, sys.short, 2, 60);
  const depth = resolveModules(stage.depth, sys.short, 1, 40);
  const height = snapStep(stage.height, sys.minHeight, sys.heightStep, sys.minHeight, sys.maxHeight);
  label(width, sys.short, sys.label); label(depth, sys.short, sys.label);

  const cols = width.modules, rows = depth.modules;
  const W = width.resolved, D = depth.resolved, H = height.resolved;
  const legLength = H - sys.frameDepth;

  const blocks: BlockDef[] = [
    { key: `SC_DECK_${tag(sys.label)}`, description: `${sys.model} — ${sys.label}`, catalogId: sys.id, parts: platformParts(sys, sys.long, sys.short) },
    { key: `SC_DECK_${tag(sys.infill.label)}`, description: `${sys.model} infill — ${sys.infill.label}`, catalogId: sys.id, parts: platformParts(sys, sys.infill.long, sys.infill.short) },
    { key: `SC_LEG_${Math.round(legLength)}`, description: `Platform leg Ø${sys.legDiameter} × ${Math.round(legLength)} mm`, catalogId: sys.id,
      parts: [{ kind: 'cyl', from: [0, 0, 0], to: [0, 0, legLength], r: sys.legDiameter / 2, mat: 'leg' }] },
  ];

  const objects: SceneObject[] = [];
  let primaryCount = 0, infillCount = 0, legCount = 0;
  const x0 = -W / 2;
  for (let r = 0; r < rows; r++) {
    const yC = (r + 0.5) * sys.short;
    // odd columns: the infill goes in the centre so the stage stays symmetric
    const pieces: ('P' | 'I')[] = [];
    const nP = Math.floor(cols / 2);
    for (let i = 0; i < nP; i++) pieces.push('P');
    if (cols % 2) pieces.splice(Math.floor(nP / 2), 0, 'I');
    let cx = x0;
    pieces.forEach((p, c) => {
      const len = p === 'P' ? sys.long : sys.short;
      const xC = cx + len / 2;
      cx += len;
      const id = `DECK.R${pad(r + 1)}C${pad(c + 1)}`;
      if (p === 'P') primaryCount++; else infillCount++;
      objects.push({
        id, label: `${p === 'P' ? sys.label : sys.infill.label} platform`, layer: '10_STAGE::10_01_DECKING', system: 'decking', group: 'stage',
        block: p === 'P' ? blocks[0].key : blocks[1].key,
        position: [xC, yC, H], rotationZ: 0,
        meta: { catalogId: sys.id, module: p === 'P' ? sys.label : sys.infill.label, row: r + 1, col: c + 1 },
      });
      const hx = len / 2 - sys.legInset, hy = sys.short / 2 - sys.legInset;
      [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].forEach(([dx, dy], k) => {
        legCount++;
        objects.push({
          id: `${id}.LEG${k + 1}`, label: 'Platform leg', layer: '10_STAGE::10_03_SUPPORTS', system: 'supports', group: 'stage',
          block: blocks[2].key, position: [xC + dx, yC + dy, 0], rotationZ: 0,
          meta: { catalogId: sys.id, length: Math.round(legLength) },
        });
      });
    });
  }

  if (stage.fascia) {
    const t = 12;
    const fasciaH = H - 0;
    objects.push({
      id: 'FASCIA.FRONT', label: 'Stage fascia — front', layer: '10_STAGE::10_04_FINISHES', system: 'finishes', group: 'stage',
      parts: [{ kind: 'box', min: [-W / 2 - t, -t, 0], max: [W / 2 + t, 0, fasciaH], mat: 'fascia' }], position: [0, 0, 0], rotationZ: 0,
      meta: { material: `${stage.finish} fascia`, thickness: t },
    });
    for (const s of [-1, 1] as const) {
      const x = s * (W / 2 + t / 2);
      objects.push({
        id: `FASCIA.${s < 0 ? 'SL' : 'SR'}`, label: `Stage fascia — ${s < 0 ? 'house left' : 'house right'}`, layer: '10_STAGE::10_04_FINISHES', system: 'finishes', group: 'stage',
        parts: [{ kind: 'box', min: [x - t / 2, 0, 0], max: [x + t / 2, D, fasciaH], mat: 'fascia' }], position: [0, 0, 0], rotationZ: 0,
        meta: { material: `${stage.finish} fascia`, thickness: t },
      });
    }
  }

  const warnings: Warning[] = [];
  if (!width.exact) warnings.push({ level: 'info', code: 'deck.width', target: 'stage', message: `Stage width snapped to ${cols} × ${fmtMm(sys.short)} modules.` });
  if (!depth.exact) warnings.push({ level: 'info', code: 'deck.depth', target: 'stage', message: `Stage depth snapped to ${rows} platform rows.` });
  if (!height.exact) warnings.push({ level: 'info', code: 'deck.height', target: 'stage', message: `Stage height snapped to the ${fmtMm(sys.heightStep)} leg increment.` });
  if (infillCount > 0) warnings.push({ level: 'info', code: 'deck.infill', target: 'stage', message: `Odd module count: ${infillCount} × ${sys.infill.label} infill platforms used (centre column).` });

  const layout: DeckLayout = {
    width, depth, height, primaryCount, infillCount, legCount, legLength,
    footprint: { minX: -W / 2, maxX: W / 2, minY: 0, maxY: D },
  };
  return { layout, blocks, objects, warnings };
}

/** Platform geometry in local coordinates: origin at the centre of the TOP surface. */
function platformParts(sys: DeckSystem, L: number, S: number): Part[] {
  const t = sys.topThickness, fd = sys.frameDepth, rail = 40;
  return [
    { kind: 'box', min: [-L / 2, -S / 2, -t], max: [L / 2, S / 2, 0], mat: 'deckTop' },
    { kind: 'box', min: [-L / 2, -S / 2, -fd], max: [L / 2, -S / 2 + rail, -t], mat: 'deckFrame' },
    { kind: 'box', min: [-L / 2, S / 2 - rail, -fd], max: [L / 2, S / 2, -t], mat: 'deckFrame' },
    { kind: 'box', min: [-L / 2, -S / 2 + rail, -fd], max: [-L / 2 + rail, S / 2 - rail, -t], mat: 'deckFrame' },
    { kind: 'box', min: [L / 2 - rail, -S / 2 + rail, -fd], max: [L / 2, S / 2 - rail, -t], mat: 'deckFrame' },
  ];
}

function label(r: Resolved1D, module: number, sysLabel: string) {
  r.alternatives.forEach((a) => (a.label = `${Math.round(a.value / module)} modules (${sysLabel} system)`));
}
const tag = (s: string) => s.replace(/′/g, 'ft').replace(/×/g, 'x').replace(/[^\w.]+/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const fmtMm = (v: number) => `${Math.round(v)} mm`;
