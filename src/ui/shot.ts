import { lensState, shotFor, SHOTS, type BroadcastCamera, type ShotKey } from '../core/engine/broadcast';
import type { SceneGraph } from '../core/engine/scene';
import type { Vec3 } from '../core/engine/types';

/** looking through a broadcast camera: which camera, which framing, and an optional zoom override */
export interface Shot { cam: string; shot: ShotKey; focal: number | null }

/** chrome kept clear around the 16:9 frame (toolbar above, shot bar below) */
const MARGIN = { top: 70, bottom: 132, side: 24 };

/** the 16:9 frame that fits the viewport, in CSS pixels */
export function shotFrame(w: number, h: number) {
  const aw = Math.max(160, w - 2 * MARGIN.side), ah = Math.max(90, h - MARGIN.top - MARGIN.bottom);
  const fw = Math.min(aw, (ah * 16) / 9), fh = (fw * 9) / 16;
  return { x: (w - fw) / 2, y: MARGIN.top + (ah - fh) / 2, w: fw, h: fh };
}

export interface ResolvedShot {
  cam: BroadcastCamera; focal: number; target: Vec3;
  lens: ReturnType<typeof lensState>;
  /** focal length the framing asks for (may be outside the lens) */
  wanted: number;
}

export function resolveShot(scene: SceneGraph, s: Shot): ResolvedShot | null {
  const b = scene.report.broadcast;
  const cam = b?.cameras.find((c) => c.id === s.cam) ?? b?.cameras[0];
  if (!b || !cam) return null;
  const f = shotFor(cam, s.shot, b.presenter, b.stageWidth);
  const wanted = s.focal ?? f.focal;
  const st = lensState(cam.lens, wanted);
  return { cam, focal: st.clamped, target: f.target, lens: lensState(cam.lens, st.clamped), wanted };
}

export { SHOTS };
