import type { ScenicParams } from '../schema';
import type { Mm } from '../units';
import type { LedLayout } from './led';
import { mainWall } from './media';
import type { Annotation, SceneObject, Warning } from './types';

/**
 * Scenic elements around the media:
 *  - portal: a hard, painted frame (two legs + header) just downstage of the main screen,
 *    with an even margin around it. Custom carpentry, so it is labelled as such.
 *  - masking: pairs of soft black legs down each side of the deck, facing the audience,
 *    to hide the wings.
 *  - drape: a full-width black drape upstage of everything.
 * Soft goods are drawn as flat 50 mm slabs; fullness, pipes and trims are not modelled.
 */

export interface ScenicReport {
  portal: { opening: { width: Mm; height: Mm }; outer: { width: Mm; height: Mm } } | null;
  maskingLegs: number;
  drape: { width: Mm; height: Mm } | null;
}

export interface ScenicContext {
  stageWidth: Mm; stageDepth: Mm; stageTop: Mm;
  deckTopAt: (x: Mm, y: Mm) => Mm;
  led: LedLayout[];
}

const SOFT = 50; // drawn thickness of a soft good

export function resolveScenic(p: ScenicParams, ctx: ScenicContext) {
  const objects: SceneObject[] = [];
  const annotations: Annotation[] = [];
  const warnings: Warning[] = [];
  const report: ScenicReport = { portal: null, maskingLegs: 0, drape: null };
  const W = ctx.stageWidth, D = ctx.stageDepth, H = ctx.stageTop;

  // ── portal around the main screen
  const M = mainWall(ctx.led);
  if (p.portal.enabled && !M) warnings.push({ level: 'info', code: 'scenic.portal.noled', target: 'scenic:portal', message: 'The portal frames the main screen — add an LED wall to place it.' });
  if (p.portal.enabled && M) {
    const { margin, legWidth: lw, headerHeight: hh, thickness: t } = p.portal;
    const x0 = M.origin[0] - M.chord / 2 - margin, x1 = M.origin[0] + M.chord / 2 + margin;
    const top = M.top + margin;
    const yFace = Math.max(t + 50, M.origin[1] - M.sagitta - 400); // 400 mm downstage of the screen face, never off the front of the deck
    const y0 = yFace - t, y1 = yFace;
    const legs: [number, number][] = [[x0 - lw, x0], [x1, x1 + lw]];
    legs.forEach(([a, b], i) => {
      const yc = (y0 + y1) / 2;
      const ea = ctx.deckTopAt(a + 1, yc), eb = ctx.deckTopAt(b - 1, yc);
      const base = Math.min(ea, eb);
      const side = i ? 'house-right' : 'house-left';
      if (Math.abs(ea - eb) > 1) warnings.push({ level: 'warn', code: 'scenic.portal.edge', target: 'scenic:portal', message: `The ${side} portal leg straddles the deck edge — narrow the margin or legs, or widen the stage.` });
      else if (base < H - 1) warnings.push({ level: 'info', code: 'scenic.portal.floor', target: 'scenic:portal', message: `The ${side} portal leg stands on the floor beside the deck.` });
      objects.push({
        id: `SCN.PORTAL.LEG.${i ? 'R' : 'L'}`, label: `Portal leg — ${i ? 'house right' : 'house left'}`, layer: '60_SCENIC::60_01_PORTAL', system: 'scenic', group: 'scenic:portal',
        parts: [{ kind: 'box', min: [a, y0, base], max: [b, y1, top + hh], mat: 'scenicFlat' }], position: [0, 0, 0], rotationZ: 0,
        meta: { width: Math.round(lw), height: Math.round(top + hh - base), thickness: t, build: 'Custom carpentry (hard flat)' },
      });
    });
    objects.push({
      id: 'SCN.PORTAL.HEADER', label: 'Portal header', layer: '60_SCENIC::60_01_PORTAL', system: 'scenic', group: 'scenic:portal',
      parts: [{ kind: 'box', min: [x0, y0, top], max: [x1, y1, top + hh], mat: 'scenicFlat' }], position: [0, 0, 0], rotationZ: 0,
      meta: { width: Math.round(x1 - x0), height: Math.round(hh), thickness: t, build: 'Custom carpentry (hard flat)' },
    });
    report.portal = { opening: { width: x1 - x0, height: top - H }, outer: { width: x1 - x0 + 2 * lw, height: top + hh - H } };
    annotations.push(
      { id: 'DIM.PORTAL.OPENING', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x0, y0 - 50, top - 300], to: [x1, y0 - 50, top - 300], value: x1 - x0, label: 'Portal opening' },
      { id: 'DIM.PORTAL.HEIGHT', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [x0 + 300, y0 - 50, H], to: [x0 + 300, y0 - 50, top], value: top - H, label: 'Portal opening height' },
    );
    if (x1 + lw - (x0 - lw) > W + 2 * lw + 1) warnings.push({ level: 'info', code: 'scenic.portal.wide', target: 'scenic:portal', message: 'The portal is wider than the stage — its legs stand on the floor.' });
  }

  // ── masking legs down each side of the deck, facing the audience
  if (p.masking.enabled && p.masking.pairs > 0) {
    const n = Math.round(p.masking.pairs);
    const lw = p.masking.legWidth;
    for (let i = 0; i < n; i++) {
      const y = (D * (i + 1)) / (n + 1);
      for (const side of [-1, 1] as const) {
        // legs overlap the deck edge by a third so the wing is masked from the house
        const a = side < 0 ? -W / 2 - (lw * 2) / 3 : W / 2 - lw / 3, b = a + lw;
        objects.push({
          id: `SCN.MASK.${side < 0 ? 'L' : 'R'}${i + 1}`, label: `Masking leg ${i + 1} — ${side < 0 ? 'house left' : 'house right'}`, layer: '60_SCENIC::60_02_MASKING', system: 'scenic', group: 'scenic:masking',
          parts: [{ kind: 'box', min: [a, y - SOFT / 2, 0], max: [b, y + SOFT / 2, H + p.masking.height], mat: 'drape' }], position: [0, 0, 0], rotationZ: 0,
          meta: { width: Math.round(lw), height: Math.round(H + p.masking.height), build: 'Soft goods (black velour), drawn flat' },
        });
        report.maskingLegs++;
      }
    }
  }

  // ── full-width upstage drape behind the screens
  if (p.drape.enabled) {
    let back = D, top = H + 6000;
    for (const L of ctx.led) { back = Math.max(back, L.origin[1] + L.cabinet.depth); top = Math.max(top, L.top + 1000); }
    const y = back + 900, w = W + 4000;
    objects.push({
      id: 'SCN.DRAPE.US', label: 'Upstage drape', layer: '60_SCENIC::60_03_DRAPES', system: 'scenic', group: 'scenic:drape',
      parts: [{ kind: 'box', min: [-w / 2, y, 0], max: [w / 2, y + SOFT, top], mat: 'drape' }], position: [0, 0, 0], rotationZ: 0,
      meta: { width: Math.round(w), height: Math.round(top), build: 'Soft goods (black velour), drawn flat' },
    });
    report.drape = { width: w, height: top };
  }

  return { report, objects, annotations, warnings };
}
