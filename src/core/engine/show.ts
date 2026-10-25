import type { LedCabinet } from '../catalog';
import type { ShowParams } from '../schema';
import type { Mm } from '../units';
import { resolveModules } from './modular';
import type { LedLayout } from './led';
import type { BlockDef, Part, SceneObject, Warning } from './types';

/**
 * Show elements for DJ-led and immersive work:
 *  - a DJ booth with its players and mixer (AlphaTheta / Pioneer DJ CDJ-3000 dimensions from the spec sheet;
 *    the mixer is a generic envelope)
 *  - scenic blocks: plain massing for façades, towers and plinths (custom scenic build)
 *  - an LED dome: a hemisphere tiled ring by ring with 500 mm tiles (real domes use custom curved tiles;
 *    tile size, weight and pitch here are generic)
 */

/** CDJ-3000: 329 × 453 × 118 mm, 5.5 kg (spec sheet, see sources) */
export const CDJ_3000 = { width: 329, depth: 453, height: 118, weightKg: 5.5, source: 'https://www.djbox.ie/pages/cdj-3000-specs' } as const;
const MIXER = { width: 380, depth: 470, height: 110 }; // generic 4-channel club mixer envelope
const BOOTH = { depth: 900, height: 1050 }; // generic booth table: working height ≈ 1.05 m

/** generic dome tile, drawn like a cabinet so the LED face shader can light it */
export const DOME_TILE: LedCabinet = {
  id: 'generic.led-dome-tile-500', category: 'led-cabinet', manufacturer: 'Generic', model: 'LED dome tile 500 × 500 (curved, custom)', verification: 'generic',
  width: 500, height: 500, depth: 80, pixelPitch: 2.5, pixelsW: 200, pixelsH: 200, weightKg: null, powerMaxW: null, powerAvgW: null,
  curveConcaveMaxDeg: null, curveConvexMaxDeg: null, sources: [{ label: 'Generic planning tile — real LED domes use custom curved tiles' }],
};

export interface ShowReport {
  booth: { width: Mm; decks: number; gearWidth: Mm } | null;
  blocks: number;
  dome: { diameter: Mm; tiles: number; rings: number; areaM2: number } | null;
}

export interface ShowContext { deckTopAt: (x: Mm, y: Mm) => Mm }

export function resolveShow(p: ShowParams, ctx: ShowContext) {
  const objects: SceneObject[] = [];
  const blocks: BlockDef[] = [];
  const warnings: Warning[] = [];
  const led: LedLayout[] = [];

  // ── DJ booth: table facing the audience (−Y), the DJ stands upstage of it
  let booth: ShowReport['booth'] = null;
  if (p.booth.enabled) {
    const { x, y } = p.booth;
    const w = Math.max(1200, p.booth.width), decks = Math.max(0, Math.min(6, Math.round(p.booth.decks)));
    const z = p.booth.z ?? ctx.deckTopAt(x, y);
    const parts: Part[] = [
      { kind: 'box', min: [-w / 2, -BOOTH.depth / 2, 0], max: [w / 2, BOOTH.depth / 2, BOOTH.height - 40], mat: 'booth' },
      { kind: 'box', min: [-w / 2 - 20, -BOOTH.depth / 2 - 20, BOOTH.height - 40], max: [w / 2 + 20, BOOTH.depth / 2, BOOTH.height], mat: 'booth' },
    ];
    objects.push({ id: 'DJ.BOOTH', label: 'DJ booth (generic)', layer: '60_SCENIC::60_05_DJ_BOOTH', system: 'scenic', group: 'show:booth', parts, position: [x, y, z], rotationZ: 0,
      meta: { bom: 'DJ booth table (custom build)', verification: 'generic', width: w, height: BOOTH.height } });
    // players either side of the mixer, front edge 80 mm back from the booth front
    const gap = 40;
    const left = Math.ceil(decks / 2), right = decks - left;
    const gearWidth = decks * CDJ_3000.width + (decks ? decks * gap : 0) + MIXER.width;
    const gy = -BOOTH.depth / 2 + 80;
    const top = z + BOOTH.height;
    const cdj: BlockDef = { key: 'SC_DJ_CDJ_3000', description: 'AlphaTheta (Pioneer DJ) CDJ-3000 — 329 × 453 × 118 mm',
      parts: [{ kind: 'box', min: [-CDJ_3000.width / 2, 0, 0], max: [CDJ_3000.width / 2, CDJ_3000.depth, CDJ_3000.height], mat: 'fixture' }] };
    if (decks) blocks.push(cdj);
    let k = 0;
    for (const [side, n] of [[-1, left], [1, right]] as const)
      for (let i = 0; i < n; i++) {
        const cx = side * (MIXER.width / 2 + gap + CDJ_3000.width / 2 + i * (CDJ_3000.width + gap));
        objects.push({ id: `DJ.CDJ.${++k}`, label: `CDJ-3000 #${k}`, layer: '60_SCENIC::60_05_DJ_BOOTH', system: 'scenic', group: 'show:booth', block: cdj.key,
          position: [x + cx, y + gy, top], rotationZ: 0,
          meta: { bom: 'AlphaTheta (Pioneer DJ) CDJ-3000', manufacturer: 'AlphaTheta (Pioneer DJ)', model: 'CDJ-3000', weightKg: CDJ_3000.weightKg, verification: 'secondary', source: CDJ_3000.source } });
      }
    objects.push({ id: 'DJ.MIXER', label: 'DJ mixer (generic 4-channel)', layer: '60_SCENIC::60_05_DJ_BOOTH', system: 'scenic', group: 'show:booth',
      parts: [{ kind: 'box', min: [-MIXER.width / 2, 0, 0], max: [MIXER.width / 2, MIXER.depth, MIXER.height], mat: 'fixture' }], position: [x, y + gy, top], rotationZ: 0,
      meta: { bom: 'DJ mixer, 4-channel (generic envelope)', verification: 'generic' } });
    // the DJ, upstage of the booth facing the audience
    objects.push({ id: 'DJ.FIGURE', label: 'DJ scale figure (1.75 m)', layer: '00_REFERENCE', system: 'reference', group: 'show:booth',
      parts: [
        { kind: 'cyl', from: [0, 0, 0], to: [0, 0, 1480], r: 170, mat: 'presenter' },
        { kind: 'cyl', from: [0, 0, 1530], to: [0, 0, 1750], r: 105, mat: 'presenter' },
      ], position: [x, y + BOOTH.depth / 2 + 350, z], rotationZ: 0, meta: { height: 1750 }, figure: 'dj' });
    if (gearWidth > w - 100) warnings.push({ level: 'warn', code: 'show.booth.width', target: 'show:booth', message: `${decks} players and a mixer need about ${Math.round(gearWidth + 200)} mm of booth; it's ${Math.round(w)} mm wide.` });
    booth = { width: w, decks, gearWidth };
  }

  // ── scenic blocks
  for (const b of p.blocks) {
    objects.push({
      id: `SCENIC.BLOCK.${b.id.toUpperCase()}`, label: b.name, layer: '60_SCENIC::60_04_ELEMENTS', system: 'scenic', group: `show:block:${b.id}`,
      parts: [{ kind: 'box', min: [-b.width / 2, -b.depth / 2, 0], max: [b.width / 2, b.depth / 2, b.height], mat: 'scenicFlat' }],
      position: [b.x, b.y, b.z], rotationZ: (b.yawDeg * Math.PI) / 180,
      meta: { bom: `Scenic element ${(b.width / 1000).toFixed(1)} × ${(b.depth / 1000).toFixed(1)} × ${(b.height / 1000).toFixed(1)} m (custom build)`, verification: 'generic' },
    });
  }

  // ── LED dome: rings of tiles from the springing to near the crown, each tile facing the centre
  let dome: ShowReport['dome'] = null;
  if (p.dome.enabled) {
    const R = Math.max(3000, p.dome.diameter / 2), t = DOME_TILE.width;
    const { cx, cy, springing } = p.dome;
    const dE = t / R; // elevation step per ring
    const rings = Math.floor((Math.PI / 2 - dE * 0.6) / dE);
    const open = ((p.dome.openingDeg ?? 0) * Math.PI) / 180;
    const key = 'SC_LED_DOME_TILE_500';
    blocks.push({ key, description: DOME_TILE.model, parts: [{ kind: 'box', min: [-t / 2 + 4, 0, 0], max: [t / 2 - 4, DOME_TILE.depth, t], mat: 'ledBody' }] });
    let tiles = 0, maxCols = 1;
    for (let k = 0; k < rings; k++) {
      const e0 = k * dE, eMid = e0 + dE / 2;
      const n = Math.max(3, Math.floor((2 * Math.PI * R * Math.cos(eMid)) / t));
      maxCols = Math.max(maxCols, n);
      for (let i = 0; i < n; i++) {
        const th = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2; // start at the audience side
        if (open > 0 && Math.abs(angDiff(th, -Math.PI / 2)) < open / 2) continue;
        const ce = Math.cos(e0), se = Math.sin(e0);
        tiles++;
        objects.push({
          id: `LED.DOME.K${String(k + 1).padStart(2, '0')}T${String(i + 1).padStart(3, '0')}`, label: 'LED dome tile', layer: '20_LED::20_01_CABINETS', system: 'ledCabinets', group: 'led:dome',
          block: key, position: [cx + R * ce * Math.cos(th), cy + R * ce * Math.sin(th), springing + R * se], rotationZ: th - Math.PI / 2, tilt: e0 + dE / 2,
          meta: { bom: DOME_TILE.model, verification: 'generic', column: Math.round(((i + 0.5) / n) * maxCols - 0.5) + 1, row: k + 1, ring: k + 1 },
        });
      }
    }
    // springing ring and columns
    const ring: [number, number][] = [], inner: [number, number][] = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; ring.push([cx + (R + 400) * Math.cos(a), cy + (R + 400) * Math.sin(a)]); inner.push([cx + (R + 100) * Math.cos(a), cy + (R + 100) * Math.sin(a)]); }
    const parts: Part[] = [];
    for (let i = 0; i < 72; i++) parts.push({ kind: 'prism', points: [ring[i], ring[i + 1], inner[i + 1], inner[i]].map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), z0: springing - 400, z1: springing, mat: 'structure' });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (open > 0 && Math.abs(angDiff(a, -Math.PI / 2)) < open / 2) continue; parts.push({ kind: 'cyl', from: [cx + (R + 250) * Math.cos(a), cy + (R + 250) * Math.sin(a), 0], to: [cx + (R + 250) * Math.cos(a), cy + (R + 250) * Math.sin(a), springing - 400], r: 150, mat: 'structure' }); }
    if (springing > 450) objects.push({ id: 'DOME.RING', label: 'Dome springing ring (generic)', layer: '30_RIGGING::30_04_GROUND_SUPPORT', system: 'structure', group: 'led:dome', parts, position: [0, 0, 0], rotationZ: 0, meta: { bom: 'Dome ring beam and columns (custom)', verification: 'generic' } });
    const areaM2 = Math.round((tiles * t * t) / 1e6);
    dome = { diameter: 2 * R, tiles, rings, areaM2 };
    led.push({
      id: 'dome', name: 'LED dome', cabinet: DOME_TILE, width: resolveModules(2 * R, t, 1, 400), height: resolveModules(R, t, 1, 400), cols: maxCols, rows: rings, count: tiles,
      pixelsW: maxCols * DOME_TILE.pixelsW, pixelsH: rings * DOME_TILE.pixelsH, curveDeg: 0, origin: [cx, cy, springing], surface: 'dome', yaw: 0,
      arc: { center: [cx, cy], radius: R, wrapDeg: 360 - (p.dome.openingDeg ?? 0) }, planar: false, columns: [], chord: 2 * R, sagitta: 2 * R, areaMm2: tiles * t * t,
      weightKg: null, powerMaxW: null, top: springing + R,
    });
    warnings.push({ level: 'info', code: 'show.dome', target: 'led:dome', message: `LED dome Ø ${(2 * R / 1000).toFixed(1)} m: ${tiles.toLocaleString()} tiles in ${rings} rings (≈ ${areaM2.toLocaleString()} m²). Drawn with generic flat 500 mm tiles; real domes use custom curved tiles on a purpose-built frame.` });
  }

  return { report: { booth, blocks: p.blocks.length, dome } as ShowReport, objects, blocks, warnings, led };
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
