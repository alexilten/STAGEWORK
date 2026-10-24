import type { MediaParams } from '../schema';
import type { LedLayout } from './led';

/**
 * Screen content mapping. One image is projected straight-on (as the audience sees it,
 * looking upstage) across the LED surfaces. The image centre is always pinned to the
 * centre of the main screen, so resizing or moving walls re-fits the content around it.
 *
 *  - span:  the image covers every screen (cover-fit around the main-screen centre)
 *  - main:  the image fits inside the main screen (contain), other screens go black
 *
 * Curved walls are mapped by front projection, not unrolled: a media server would
 * normally unroll a curve, so treat the curved-wall look as a preview.
 */

export interface MediaRect {
  /** image centre in world X / Z (mm) = main screen centre */
  cx: number;
  cz: number;
  /** placed image size (mm) */
  width: number;
  height: number;
}

export interface MediaCanvas {
  rect: MediaRect;
  /** the area the content has to cover (mm, centred on the main screen) */
  target: { width: number; height: number };
  /** main screen the image is centred on */
  mainId: string;
  /** pixel canvas a media server would need for this mapping, at the main screen's pixel pitch */
  pixels: { width: number; height: number };
  /** mm per pixel of the main screen (horizontal, vertical) */
  pitch: [number, number];
  /** walls in canvas pixels, for a pixel-map template (origin top-left) */
  walls: { id: string; name: string; x: number; y: number; w: number; h: number; main: boolean }[];
}

/** the wall called "main", else the largest, preferring the one nearest the centreline */
export const mainWall = (led: LedLayout[]) =>
  led.find((l) => l.id === 'main') ??
  [...led].sort((a, b) => b.areaMm2 - a.areaMm2 || Math.abs(a.origin[0]) - Math.abs(b.origin[0]))[0];

/** world X range of a wall's front face */
const xRange = (L: LedLayout): [number, number] => [L.origin[0] - L.chord / 2, L.origin[0] + L.chord / 2];

export function resolveMediaCanvas(all: LedLayout[], aspect: number, fit: MediaParams['fit']): MediaCanvas | null {
  // content maps onto upright walls; LED floors and ceilings keep their own look
  const led = all.filter((L) => (L.surface ?? 'wall') === 'wall');
  const M = mainWall(led);
  if (!M || !(aspect > 0)) return null;
  const cx = M.origin[0], cz = (M.origin[2] + M.top) / 2;
  const targets = fit === 'main' ? [M] : led;
  let hw = 0, hh = 0;
  for (const L of targets) {
    const [x0, x1] = xRange(L);
    hw = Math.max(hw, Math.abs(x0 - cx), Math.abs(x1 - cx));
    hh = Math.max(hh, Math.abs(L.origin[2] - cz), Math.abs(L.top - cz));
  }
  const tw = 2 * hw, th = 2 * hh;
  // span = cover (no gaps on any screen); main = contain (whole image visible on the main screen)
  const cover = fit !== 'main';
  const wider = aspect > tw / th;
  const width = cover === wider ? th * aspect : tw;
  const height = cover === wider ? th : tw / aspect;

  const pitch: [number, number] = [M.chord / M.pixelsW, (M.top - M.origin[2]) / M.pixelsH];
  const px = (mm: number, p: number) => Math.round(mm / p);
  const x0 = cx - tw / 2, zTop = cz + th / 2;
  const walls = led.map((L) => {
    const [a, b] = xRange(L);
    return { id: L.id, name: L.name, x: px(a - x0, pitch[0]), y: px(zTop - L.top, pitch[1]), w: px(b - a, pitch[0]), h: px(L.top - L.origin[2], pitch[1]), main: L === M };
  });
  return {
    rect: { cx, cz, width, height }, target: { width: tw, height: th }, mainId: M.id,
    pixels: { width: px(tw, pitch[0]), height: px(th, pitch[1]) }, pitch, walls,
  };
}
