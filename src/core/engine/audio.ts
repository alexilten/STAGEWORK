import type { Speaker } from '../catalog';
import type { AudioParams } from '../schema';
import type { Mm } from '../units';
import type { BlockDef, Part, SceneObject, Vec3, Warning } from './types';

/**
 * Loudspeaker system: flown main line-array hangs (house left / right), subwoofers
 * (ground-stacked or flown), downstage front-fills and stage-monitor wedges.
 *
 * Geometry is a planning envelope. Real array curvature, splay angles, SPL coverage
 * and rigging capacity are set by the audio vendor's prediction software (ArrayCalc etc.);
 * the splay shown here is a nominal progressive rake, not an acoustic solution.
 */

export interface AudioReport {
  mainsPerSide: number;
  main: Speaker;
  sub: Speaker | null;
  subs: number;
  subMode: AudioParams['subMode'];
  fill: Speaker | null;
  frontFills: number;
  monitor: Speaker | null;
  monitors: number;
  trim: Mm;
  spread: Mm;
  /** total hung + stacked weight (kg) if every box weight is known */
  weightKg: number | null;
}

export interface AudioContext { stageWidth: Mm; stageDepth: Mm; stageTop: Mm; downstageY: Mm }

const DEG = Math.PI / 180;

function speakerBlock(sp: Speaker, key: string): BlockDef {
  const w = sp.width / 2, d = sp.depth / 2, h = sp.height;
  // cabinet body + a recessed grille on the front face (−Y)
  const parts: Part[] = [
    { kind: 'box', min: [-w, -d, 0], max: [w, d, h], mat: 'speaker' },
    { kind: 'box', min: [-w + 40, -d - 6, 40], max: [w - 40, -d + 4, h - 40], mat: 'speakerGrille' },
  ];
  return { key, description: `${sp.manufacturer} ${sp.model}`, catalogId: sp.id, parts };
}

const blockKey = (sp: Speaker) => `SC_SPKR_${sp.id}`.replace(/[^\w]+/g, '_').toUpperCase();

export function resolveAudio(p: AudioParams, getSpeaker: (id: string) => Speaker, ctx: AudioContext) {
  const objects: SceneObject[] = [];
  const blocks = new Map<string, BlockDef>();
  const warnings: Warning[] = [];
  const add = (sp: Speaker) => { const k = blockKey(sp); if (!blocks.has(k)) blocks.set(k, speakerBlock(sp, k)); return k; };
  let weight = 0, weightKnown = true;
  const tally = (sp: Speaker, n: number) => { if (sp.weightKg == null) weightKnown = false; else weight += sp.weightKg * n; };

  const main = getSpeaker(p.mainSpeakerId);
  const mainsPerSide = Math.max(1, Math.round(p.mainsPerSide));
  const spread = Math.max(ctx.stageWidth / 2 + 500, p.spread);
  const trim = Math.max(ctx.stageTop + main.height * mainsPerSide, p.trim);
  const splay = Math.min(p.splayPerBox, main.splayRange?.[1] ?? 4);

  // ── main hangs, house left (−X) and right (+X)
  const mainKey = add(main);
  for (const side of [-1, 1] as const) {
    const hx = side * spread;
    const hy = ctx.downstageY - main.depth / 2 - 300; // just downstage of the deck
    let top: Vec3 = [hx, hy, trim];
    let ang = 0; // pitch from straight down, grows toward the audience
    for (let i = 0; i < mainsPerSide; i++) {
      const dir: Vec3 = [0, -Math.sin(ang), -Math.cos(ang)];
      const center: Vec3 = [top[0] + dir[0] * main.height / 2, top[1] + dir[1] * main.height / 2, top[2] + dir[2] * main.height / 2];
      objects.push({
        id: `SPK.MAIN.${side < 0 ? 'L' : 'R'}.${String(i + 1).padStart(2, '0')}`,
        label: `${main.model} — ${side < 0 ? 'house left' : 'house right'} #${i + 1}`,
        layer: '50_AUDIO::50_01_MAINS', system: 'audio', group: `audio:main:${side < 0 ? 'l' : 'r'}`,
        block: mainKey, position: [center[0], center[1], center[2]], rotationZ: 0, tilt: ang,
        meta: { catalogId: main.id, weightKg: main.weightKg, hang: side < 0 ? 'House left' : 'House right', box: i + 1, splayDeg: +(ang / DEG).toFixed(1) },
      });
      top = [top[0] + dir[0] * main.height, top[1] + dir[1] * main.height, top[2] + dir[2] * main.height];
      ang += splay * DEG;
    }
    tally(main, mainsPerSide);
  }
  if (trim - mainsPerSide * main.height < ctx.stageTop)
    warnings.push({ level: 'info', code: 'audio.trim', target: 'audio:main:l', message: `The main hang reaches near the deck — raise the trim or reduce the box count for sightlines.` });

  // ── subwoofers
  let sub: Speaker | null = null;
  const nSub = Math.max(0, Math.round(p.subs));
  if (nSub > 0) {
    sub = getSpeaker(p.subSpeakerId);
    const subKey = add(sub);
    const perSide = Math.ceil(nSub / 2);
    let placed = 0;
    for (const side of [-1, 1] as const) {
      const n = Math.min(perSide, nSub - placed);
      for (let i = 0; i < n; i++) {
        const pos: Vec3 = p.subMode === 'flown'
          ? [side * spread, ctx.downstageY - sub.depth / 2 - 300, trim + 200 + i * sub.height]
          : [side * (ctx.stageWidth / 2 + sub.width / 2 + 400), ctx.downstageY - sub.depth / 2 - 200, i * sub.height];
        objects.push({
          id: `SPK.SUB.${side < 0 ? 'L' : 'R'}.${String(i + 1).padStart(2, '0')}`,
          label: `${sub.model} — ${side < 0 ? 'left' : 'right'} #${i + 1}`,
          layer: '50_AUDIO::50_02_SUBS', system: 'audio', group: `audio:sub`,
          block: subKey, position: pos, rotationZ: 0,
          meta: { catalogId: sub.id, weightKg: sub.weightKg, mode: p.subMode, side: side < 0 ? 'Left' : 'Right' },
        });
      }
      placed += n;
    }
    tally(sub, nSub);
  }

  // ── front fills along the downstage edge
  let fill: Speaker | null = null;
  const nFill = Math.max(0, Math.round(p.frontFills));
  if (nFill > 0) {
    fill = getSpeaker(p.fillSpeakerId);
    const fKey = add(fill);
    const usable = ctx.stageWidth - fill.width;
    for (let i = 0; i < nFill; i++) {
      const x = nFill === 1 ? 0 : -usable / 2 + (usable * i) / (nFill - 1);
      objects.push({
        id: `SPK.FILL.${String(i + 1).padStart(2, '0')}`, label: `${fill.model} — front fill #${i + 1}`,
        layer: '50_AUDIO::50_03_FILLS', system: 'audio', group: 'audio:fill',
        block: fKey, position: [x, ctx.downstageY - fill.depth / 2 - 50, ctx.stageTop], rotationZ: 0, tilt: 8 * DEG,
        meta: { catalogId: fill.id, weightKg: fill.weightKg, position: `Front fill #${i + 1}` },
      });
    }
    tally(fill, nFill);
  }

  // ── stage-monitor wedges across the downstage edge, facing the performer (+Y), tilted up
  let monitor: Speaker | null = null;
  const nMon = Math.max(0, Math.round(p.monitors));
  if (nMon > 0) {
    monitor = getSpeaker(p.monitorSpeakerId);
    const mKey = add(monitor);
    const usable = ctx.stageWidth - monitor.width - 600;
    for (let i = 0; i < nMon; i++) {
      const x = nMon === 1 ? 0 : -usable / 2 + (usable * i) / (nMon - 1);
      objects.push({
        id: `SPK.MON.${String(i + 1).padStart(2, '0')}`, label: `${monitor.model} — wedge #${i + 1}`,
        layer: '50_AUDIO::50_04_MONITORS', system: 'audio', group: 'audio:monitor',
        block: mKey, position: [x, 700, ctx.stageTop], rotationZ: Math.PI, tilt: 35 * DEG,
        meta: { catalogId: monitor.id, weightKg: monitor.weightKg, position: `Wedge #${i + 1}` },
      });
    }
    tally(monitor, nMon);
  }

  warnings.push({ level: 'info', code: 'audio.review', target: 'audio:main:l', message: 'Loudspeaker positions are for planning. Array splay, coverage, SPL and rigging loads require the audio vendor’s prediction software and a rigging engineer.' });

  const report: AudioReport = {
    mainsPerSide, main, sub, subs: nSub, subMode: p.subMode, fill, frontFills: nFill, monitor, monitors: nMon,
    trim, spread, weightKg: weightKnown ? +weight.toFixed(1) : null,
  };
  return { report, objects, blocks: [...blocks.values()], warnings };
}
