import type { BroadcastParams, SeatingParams } from '../schema';
import type { Mm } from '../units';
import type { DeckLip } from './audio';
import type { SeatingReport } from './seating';
import type { Annotation, BlockDef, Part, SceneObject, Vec3, Warning } from './types';

/**
 * Broadcast / IMAG camera plan for an end-stage keynote.
 *
 * What is sourced (manufacturer pages, accessed 2026-10-24):
 *  - Sony HDC-3500 system camera: 138 × 268 × 368 mm (W × H × D, no hood), ≈ 5.0 kg, 2/3″ 4K CMOS
 *  - Canon UHD-DIGISUPER 90 (UJ90x9B) box lens: 9–810 mm, 2× extender (18–1620 mm), f/2.4 to 486 mm,
 *    image area 9.6 × 5.4 mm (16:9), 250.6 × 255.5 × 610 mm, 23.2 kg, MOD 3.0 m
 *  - Canon CJ20ex7.8B portable lens: 7.8–156 mm, 2× extender, 169.9 × 114.4 × 230 mm, 2.18 kg, MOD 0.8 m
 *  - Canon CJ15ex4.3B wide portable lens: 4.3–65 mm, 2× extender, 163.0 × 107.6 × 249.6 mm, 2.19 kg, MOD 0.3 m
 *  - Ross Furio SE robotic dolly: 360 mm track gauge, dolly 890 × 460 × 230 mm, 871 mm lift,
 *    optical centre up to 2208 mm (VR100 head) / 2228 mm (VR600), payload 20 kg (VR100) / 30 kg (VR600),
 *    19″ prompter max on VR600, track up to 30 m, curves down to 3.0 m radius (outer rail)
 *  - Autocue conference (presidential) prompter: 17″ monitor at the base, stand 1.42–2.20 m,
 *    readable to about 6 m; used in pairs either side of the lectern
 *  - Autoscript EPIC-IP19 on-camera prompter package: 14.7 kg (dimensions not published)
 *  - IBC 1015.2 / 1015.3: guards on walking surfaces more than 30″ (762 mm) above the floor below, 42″ high
 *  - Panasonic AW-UE160 PTZ: 213 × 277 × 240 mm (W × H × D, no bracket), ≈ 4.6 kg, 1-type 4K sensor,
 *    20× zoom 8.8–176 mm (24.5–490 mm in 35 mm terms) — accessed 2026-10-25
 *  - Jimmy Jib Triangle: arm 12′ to 30′ reach in kits (12′ / 18′ Super / 24′ Super Plus / 30′ Extreme),
 *    payload 50 lb (22.7 kg), 25 lb (11.3 kg) at 30′ (rental house listing) — accessed 2026-10-25
 *  - Tiffen Steadicam M-2 with G-70x arm: arm lifts 13–70 lb (5.8–32 kg), 29″ (730 mm) boom range
 *    (dealer listing) — accessed 2026-10-25
 *
 * Planning conventions (NOT standards, labelled in the UI):
 *  - camera platforms in 4′ × 4′ modules, heights in 8″ steps; lens 1.5 m above the platform
 *  - seated head top 1270 mm, standing head top 1750 mm, 100 mm clearance over heads
 *  - shot framings (full, medium, MCU, CU) by frame height on a 1.75 m presenter
 *  - the long lens should hold a close-up without its 2× extender (the extender costs two stops)
 *  - prompter text is readable to ≈ 0.35 m per inch of screen diagonal (scaled from Autocue's 17″ / 6 m)
 *  - jib fulcrum 1.8 m above the floor, counterweight side a quarter of the front reach, a remote
 *    head hanging 300 mm under the nose; parked 20° nose up with the nose 7 m from the presenter,
 *    out past the downstage corner (25–50° off the centreline), the base in the house
 *  - Steadicam lens 1.45 m above the deck; sled post 0.7 m below the camera
 *  - PTZ focal lengths are given 2/3″-equivalent (35 mm equivalent ÷ 3.75, matching the 16:9 frame
 *    width) so the camera view's field of view is right on the same image area as the system cameras
 */

export interface Lens {
  id: string; manufacturer: string; model: string;
  fMin: Mm; fMax: Mm; extender: number;
  width: Mm; height: Mm; length: Mm; weightKg: number; mod: Mm;
}
export const IMAGE_AREA = { w: 9.6, h: 5.4 } as const;

export const BOX_LENS: Lens = { id: 'canon.uj90x9b', manufacturer: 'Canon', model: 'UHD-DIGISUPER 90 (UJ90x9B)', fMin: 9, fMax: 810, extender: 2, width: 250.6, height: 255.5, length: 610, weightKg: 23.2, mod: 3000 };
export const PORTABLE_LENS: Lens = { id: 'canon.cj20ex7.8b', manufacturer: 'Canon', model: 'CJ20ex7.8B', fMin: 7.8, fMax: 156, extender: 2, width: 169.9, height: 114.4, length: 230, weightKg: 2.18, mod: 800 };
export const WIDE_LENS: Lens = { id: 'canon.cj15ex4.3b', manufacturer: 'Canon', model: 'CJ15ex4.3B', fMin: 4.3, fMax: 65, extender: 2, width: 163, height: 107.6, length: 249.6, weightKg: 2.19, mod: 300 };
export const CAMERA_BODY = { id: 'sony.hdc-3500', manufacturer: 'Sony', model: 'HDC-3500', width: 138, height: 268, depth: 368, weightKg: 5.0 };
export const FURIO = {
  id: 'ross.furio-se', model: 'Ross Furio SE', gauge: 360, dolly: { length: 890, width: 460, height: 230 }, lift: 871,
  heads: { VR100: { maxLens: 2208, payloadKg: 20, prompterIn: 15 }, VR600: { maxLens: 2228, payloadKg: 30, prompterIn: 19 } },
  maxTrack: 30000, minRadius: 3000,
};
export const PTZ = { id: 'panasonic.aw-ue160', manufacturer: 'Panasonic', model: 'AW-UE160', width: 213, height: 277, depth: 240, weightKg: 4.6 };
/** the PTZ's built-in 20× zoom, 2/3″-equivalent (24.5–490 mm in 35 mm terms ÷ 3.75) */
export const PTZ_LENS: Lens = { id: 'panasonic.aw-ue160', manufacturer: 'Panasonic', model: 'AW-UE160 20× (built in)', fMin: 6.5, fMax: 130.7, extender: 1, width: 213, height: 277, length: 0, weightKg: 0, mod: 0 };
export const JIB = {
  id: 'jimmyjib.triangle', manufacturer: 'Jimmy Jib', model: 'Triangle',
  /** arm kits by reach (ft) */
  reachesFt: [12, 18, 24, 30] as const, payloadKg: 22.7, payloadKgAt30: 11.3,
};
export const STEADICAM = { id: 'tiffen.steadicam-m2', manufacturer: 'Tiffen', model: 'Steadicam M-2 + G-70x arm', armMinKg: 5.8, armMaxKg: 32, boomRange: 730 };
const JIB_FULCRUM = 1800, JIB_BACK = 0.25, JIB_DROP = 300, JIB_NOSE = 7000;
const STEADI_LENS = 1450;
export const ON_CAM_PROMPTER = { id: 'autoscript.epic-ip19', model: 'Autoscript EPIC-IP19', weightKg: 14.7, inches: 19 };
export const CONF_PROMPTER = { id: 'autocue.conference', model: 'Autocue conference prompter (17″)', inches: 17, standMin: 1420, standMax: 2200 };

export const SOURCES = [
  { label: 'Sony HDC-3500 specifications', url: 'https://pro.sony/en_AE/pdf/hdc-3500v' },
  { label: 'Canon UHD-DIGISUPER 90 specifications', url: 'https://www.canon-europe.com/broadcast/tv_lenses/studio_field_lenses/uhd_digisuper_90/specifications/' },
  { label: 'Canon CJ20ex7.8B specifications', url: 'https://www.canon-europe.com/broadcast/cj20ex7-8b/specifications/' },
  { label: 'Canon CJ15ex4.3B specifications', url: 'https://www.canon-europe.com/broadcast/cj15ex43b/specifications/' },
  { label: 'Ross Furio SE brochure', url: 'https://documentation.rossvideo.com/files/Brochures/Robotic%20Camera%20Systems/Furio/Furio%20SE%20Studio%20Brochure.pdf' },
  { label: 'Ross Furio SE Live — setting up the track and robot', url: 'https://documentation.rossvideo.com/files/Manuals/Camera%20Motion%20Systems/Furio/Furio%20Live/Furio_SE_Live-Setting_Up_the_Track_and_Robot_(5100DR-051-04).pdf' },
  { label: 'Autocue manual conference system', url: 'https://expandore.com/singapore/Autocue/Manual_Conference_System.htm' },
  { label: 'What is a presidential teleprompter (teleprompter.com)', url: 'https://www.teleprompter.com/blog/what-is-a-presidential-teleprompter' },
  { label: 'Downstage monitors (Endless Events)', url: 'https://helloendless.com/dsm-down-stage-monitor/' },
  { label: 'GTC — corporate live events camera practice', url: 'https://www.gtc.org.uk/media/fm/Zerb%20articles/drp-Corporate.pdf' },
  { label: 'Panasonic AW-UE160 specifications (Markertek)', url: 'https://www.markertek.com/product/pan-aw-ue160kpj/panasonic-aw-ue160-uhd-4k-20x-zoom-ptz-camera-with-hdmi-and-3g-sdi-smpte-st2110-standard-compatible-black' },
  { label: 'Jimmy Jib Triangle rental kit (Expressway Cine)', url: 'https://www.expresswaycine.com/products/jimmy-jib-triangle-jib-arm-and-four-wheel-dolly-12-base-version' },
  { label: 'Steadicam M-2 (Lemac)', url: 'https://lemac.com.au/Products/SteadicamM-2.aspx' },
];

const IN = 25.4;
const STEP = 8 * IN; // platform height step
const MODULE = 4 * 12 * IN; // 4′ platform module
const LENS_ON_PLATFORM = 1500;
const SEATED_HEAD = 1270, STANDING_HEAD = 1750, HEAD_CLEAR = 100;
const GUARD_AT = 30 * IN, GUARD_H = 42 * IN;
const READ_PER_INCH = 6000 / 17;
const DSM = { inches: 55, w: 1232, h: 712, d: 60 };
const FOH_MON = { inches: 85, w: 1910, h: 1095, d: 80 };

export type ShotKey = 'wide' | 'full' | 'medium' | 'mcu' | 'cu';
/** frame heights on a 1.75 m presenter, top of frame 100 mm above the head */
export const SHOTS: { key: ShotKey; label: string; frameH?: Mm; hint: string }[] = [
  { key: 'wide', label: 'Wide', hint: 'Whole stage width' },
  { key: 'full', label: 'Full', frameH: 2200, hint: 'Head to toe' },
  { key: 'medium', label: 'Medium', frameH: 1000, hint: 'Waist up' },
  { key: 'mcu', label: 'MCU', frameH: 600, hint: 'Chest up — the usual IMAG shot' },
  { key: 'cu', label: 'CU', frameH: 400, hint: 'Head and shoulders' },
];
const HEAD_TOP = 1750, HEADROOM = 100;
const CU_FRAME = 400;
/** furthest a long lens holds a close-up without its extender */
export const maxThrow = (l: Lens) => (l.fMax * CU_FRAME) / IMAGE_AREA.h;

export type CameraSupport = 'tripod' | 'rail' | 'handheld' | 'jib' | 'steadicam' | 'ptz';

export interface BroadcastCamera {
  id: string; name: string; role: string; group: string;
  lens: Lens; crew: 'operator' | 'robotic';
  /** camera body, e.g. "Sony HDC-3500" */
  body: string;
  support: CameraSupport;
  pivot: Vec3; eye: Vec3; yaw: number; tilt: number;
  /** eye → presenter chest */
  distance: Mm;
}

export interface BroadcastReport {
  cameras: BroadcastCamera[];
  platform: { x: Mm; yFront: Mm; width: Mm; depth: Mm; height: Mm; placement: 'back' | 'in-house'; guard: boolean } | null;
  sidePlatformHeight: Mm | null;
  seatKills: number;
  rail: { length: Mm; y: Mm; lensHeight: Mm; head: 'VR100' | 'VR600'; payloadKg: number; curved: boolean; radius: Mm | null; gap: Mm; needed: Mm; seesFrom: Mm } | null;
  jib: { reach: Mm; reachFt: number; side: 'left' | 'right'; base: Vec3; lensHeight: Mm; payloadKg: number; ratedKg: number; swing: Mm; tailSwing: Mm } | null;
  steadicam: { payloadKg: number } | null;
  ptz: { count: number; mount: 'truss' | 'deck' } | null;
  prompters: { presidential: number; dsm: number; dsmMode: BroadcastParams['prompters']['dsm']; foh: number; fohMode: BroadcastParams['prompters']['foh']; fohReadable: Mm; fohDistance: Mm; onCamera: boolean };
  presenter: Vec3;
  stageWidth: Mm;
}

export interface BroadcastContext {
  stageWidth: Mm; stageDepth: Mm; stageTop: Mm;
  deckTopAt: (x: Mm, y: Mm) => Mm;
  lip: DeckLip;
  /** presenter mark: centre of the feet, on the deck */
  presenter: Vec3;
  seating: { report: SeatingReport; params: SeatingParams; seats: SceneObject[] } | null;
  frontTruss: { y: Mm; bottom: Mm; length: Mm } | null;
}

// ── geometry helpers
export function aim(from: Vec3, to: Vec3) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, dy), tilt: Math.atan2(dz, Math.hypot(dx, dy)), dist: Math.hypot(dx, dy, dz) };
}
/** local (x, y) in an object yawed by `yaw` → world plan offset */
const rot = (yaw: number, lx: number, ly: number): [number, number] => [lx * Math.cos(yaw) - ly * Math.sin(yaw), lx * Math.sin(yaw) + ly * Math.cos(yaw)];
const ahead = (p: Vec3, yaw: number, tilt: number, d: number): Vec3 => [p[0] - Math.sin(yaw) * Math.cos(tilt) * d, p[1] + Math.cos(yaw) * Math.cos(tilt) * d, p[2] + Math.sin(tilt) * d];
const box = (min: Vec3, max: Vec3, mat: Part['mat']): Part => ({ kind: 'box', min, max, mat });
const r1 = (v: number) => Math.round(v * 10) / 10;

/** camera head blocks: origin = pan/tilt pivot on the optical axis, lens pointing +Y */
function cameraBlock(lens: Lens): BlockDef {
  const B = CAMERA_BODY;
  const big = lens === BOX_LENS;
  const back = big ? -480 : -250;
  const lensFrom = back + B.depth;
  const parts: Part[] = [
    box([-B.width / 2, back, -B.height / 2], [B.width / 2, back + B.depth, B.height / 2], 'camera'),
    // viewfinder on top, towards the back
    box([-110, back + 20, B.height / 2], [110, back + 200, B.height / 2 + 150], 'camera'),
  ];
  if (big) parts.push(box([-lens.width / 2, lensFrom, -lens.height / 2], [lens.width / 2, lensFrom + lens.length, lens.height / 2], 'camera'));
  else parts.push({ kind: 'cyl', from: [0, lensFrom, 0], to: [0, lensFrom + lens.length, 0], r: lens.height / 2, mat: 'camera' });
  return { key: `SC_CAM_HDC3500_${lens.model.replace(/[^\w]+/g, '_').toUpperCase()}`, description: `${B.manufacturer} ${B.model} + ${lens.manufacturer} ${lens.model}`, catalogId: lens.id, parts };
}
/** distance from pivot to the lens front */
const lensFront = (lens: Lens) => (lens === PTZ_LENS ? 90 : (lens === BOX_LENS ? -480 : -250) + CAMERA_BODY.depth + lens.length);

/** PTZ block: origin = tilt axis, lens pointing +Y; base and yoke below, drawn upright (inverted mounts flip it) */
const PTZ_BLOCK: BlockDef = {
  key: 'SC_CAM_PANASONIC_AW_UE160', description: `${PTZ.manufacturer} ${PTZ.model} PTZ`, catalogId: PTZ.id,
  parts: [
    box([-PTZ.width / 2, -PTZ.depth / 2, -170], [PTZ.width / 2, PTZ.depth / 2, -110], 'camera'), // base
    box([-PTZ.width / 2 + 10, -50, -110], [-PTZ.width / 2 + 40, 50, 60], 'camera'), box([PTZ.width / 2 - 40, -50, -110], [PTZ.width / 2 - 10, 50, 60], 'camera'), // yoke
    box([-70, -95, -65], [70, 95, 65], 'camera'), // head
    { kind: 'cyl', from: [0, 95, 0], to: [0, 110, 0], r: 45, mat: 'glass' },
  ],
};

const PROMPTER_BLOCK: BlockDef = {
  key: 'SC_PROMPTER_EPIC_IP19', description: `${ON_CAM_PROMPTER.model} (envelope estimated)`, catalogId: ON_CAM_PROMPTER.id,
  parts: [
    box([-240, 0, -200], [240, 40, 240], 'screen'), // hood back / prompt monitor
    box([-240, 40, -240], [240, 520, -200], 'camera'), // monitor tray under the hood
    box([-240, 40, 200], [240, 520, 240], 'camera'), // hood top
    box([-240, 40, -200], [-210, 520, 200], 'camera'), box([210, 40, -200], [240, 520, 200], 'camera'),
  ],
};

/** a figure the size of the presenter reference (1.75 m) */
const figure = (): Part[] => [
  { kind: 'cyl', from: [0, 0, 0], to: [0, 0, 1480], r: 170, mat: 'presenter' },
  { kind: 'cyl', from: [0, 0, 1530], to: [0, 0, 1750], r: 105, mat: 'presenter' },
];

function tripod(h: Mm): Part[] {
  const parts: Part[] = [box([-90, -90, -230], [90, 90, -60], 'camera')];
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;
    parts.push({ kind: 'cyl', from: [0, 0, -230], to: [Math.cos(a) * 480, Math.sin(a) * 480, -h], r: 16, mat: 'leg' });
  }
  return parts;
}

/** frame a shot from a camera: focal length, aim point and whether the lens gets there */
export function shotFor(cam: BroadcastCamera, key: ShotKey, presenter: Vec3, stageWidth: Mm) {
  const s = SHOTS.find((x) => x.key === key)!;
  const frameH = s.frameH ?? (stageWidth * 1.1 * 9) / 16;
  const top = presenter[2] + HEAD_TOP + HEADROOM;
  const target: Vec3 = s.frameH ? [presenter[0], presenter[1], top - frameH / 2] : [0, presenter[1], presenter[2] + frameH * 0.38];
  const d = Math.hypot(target[0] - cam.eye[0], target[1] - cam.eye[1], target[2] - cam.eye[2]);
  return { focal: (d * IMAGE_AREA.h) / frameH, target, frameH };
}
export function lensState(lens: Lens, focal: Mm) {
  const max = lens.fMax * lens.extender;
  return {
    focal, extender: focal > lens.fMax + 1e-6, outOfRange: focal < lens.fMin - 1e-6 || focal > max + 1e-6,
    clamped: Math.min(max, Math.max(lens.fMin, focal)),
    hfov: (2 * Math.atan(IMAGE_AREA.w / 2 / focal) * 180) / Math.PI,
    vfov: (2 * Math.atan(IMAGE_AREA.h / 2 / focal) * 180) / Math.PI,
  };
}

/**
 * Lowest lens height (above the floor) that sees `target` over the heads in front.
 * Heads are seats within half a metre of the line of sight; `extra` adds standing people (an aisle).
 */
function sightlineLens(from: [number, number], target: Vec3, seats: SceneObject[], head: Mm, extra: [number, number][] = []) {
  const [cx, cy] = from;
  const tx = target[0] - cx, ty = target[1] - cy, L2 = tx * tx + ty * ty;
  let need = 0;
  const test = (px: number, py: number, hz: number) => {
    const t = ((px - cx) * tx + (py - cy) * ty) / L2;
    if (t <= 0 || t >= 1) return;
    const off = Math.abs((px - cx) * ty - (py - cy) * tx) / Math.sqrt(L2);
    if (off > 500) return;
    need = Math.max(need, (hz + HEAD_CLEAR - target[2] * t) / (1 - t));
  };
  for (const s of seats) test(s.position[0], s.position[1], head);
  for (const [x, y] of extra) test(x, y, STANDING_HEAD);
  return need;
}

export function resolveBroadcast(p: BroadcastParams, ctx: BroadcastContext) {
  const objects: SceneObject[] = [];
  const annotations: Annotation[] = [];
  const warnings: Warning[] = [];
  const blocks: BlockDef[] = [];
  const cameras: BroadcastCamera[] = [];
  const kills = new Set<string>();
  const W = ctx.stageWidth, H = ctx.stageTop;
  const P = ctx.presenter;
  const chest: Vec3 = [P[0], P[1], P[2] + 1300];
  const eyeZ = P[2] + 1620;
  const st = ctx.seating;
  const seatsAll = st?.seats ?? [];
  const chair = st?.report.chair;
  const head = p.foh.standing ? STANDING_HEAD : SEATED_HEAD;
  const usedBlocks = new Set<string>();
  const useBlock = (b: BlockDef) => { if (!usedBlocks.has(b.key)) { usedBlocks.add(b.key); blocks.push(b); } return b.key; };

  /** remove seats under a plan rectangle (expanded by `m`) */
  const killRect = (x0: number, y0: number, x1: number, y1: number, m: number) => {
    if (!chair) return;
    for (const s of seatsAll) {
      const [sx, sy] = s.position;
      if (sx + chair.width / 2 > x0 - m && sx - chair.width / 2 < x1 + m && sy + chair.depth / 2 > y0 - m && sy - chair.depth / 2 < y1 + m) kills.add(s.id);
    }
  };
  const liveSeats = () => seatsAll.filter((s) => !kills.has(s.id));

  const platform = (id: string, label: string, x0: number, y0: number, x1: number, y1: number, h: number) => {
    const parts: Part[] = [box([x0, y0, 0], [x1, y1, h], 'platform')];
    const guard = h >= GUARD_AT - 1;
    if (guard) {
      // guards on the sides and back; the front stays open for the lenses
      const t = 40, top = h + GUARD_H;
      parts.push(box([x0, y0, top - t], [x0 + t, y1, top], 'leg'), box([x1 - t, y0, top - t], [x1, y1, top], 'leg'), box([x0, y0, top - t], [x1, y0 + t, top], 'leg'));
      for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const)
        parts.push({ kind: 'cyl', from: [px + (px === x0 ? t / 2 : -t / 2), py + (py === y0 ? t / 2 : -t / 2), h], to: [px + (px === x0 ? t / 2 : -t / 2), py + (py === y0 ? t / 2 : -t / 2), top], r: 20, mat: 'leg' });
    }
    objects.push({
      id, label, layer: '80_BROADCAST::80_02_PLATFORMS', system: 'broadcast', group: 'bcast:platform', parts, position: [0, 0, 0], rotationZ: 0,
      meta: { ...bom(`Camera platform ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} × ${Math.round(h)} mm`), width: Math.round(x1 - x0), depth: Math.round(y1 - y0), height: Math.round(h), guardrail: guard, build: 'Modular 4′ × 4′ camera platform (planning)' },
    });
    return guard;
  };

  /** a crewed or robotic camera: head block at the pivot, tripod, operator */
  const addCamera = (o: { n: number; role: string; lens: Lens; pivot: Vec3; base: Mm; crew: 'operator' | 'robotic'; support: CameraSupport; tripod?: boolean; handheld?: boolean; op?: Vec3 }) => {
    const id = `cam${o.n}`, group = `bcast:${id}`, name = `Cam ${o.n}`;
    const a = aim(o.pivot, chest);
    const ptz = o.lens === PTZ_LENS;
    const key = useBlock(ptz ? PTZ_BLOCK : cameraBlock(o.lens));
    const eye = ahead(o.pivot, a.yaw, a.tilt, lensFront(o.lens));
    const body = ptz ? `${PTZ.manufacturer} ${PTZ.model}` : `${CAMERA_BODY.manufacturer} ${CAMERA_BODY.model}`;
    objects.push({
      id: `BC.CAM.${o.n}`, label: ptz ? `${name} — ${body} PTZ` : `${name} — ${body} + ${o.lens.manufacturer} ${o.lens.model}`, layer: '80_BROADCAST::80_01_CAMERAS', system: 'broadcast', group,
      block: key, position: o.pivot.map(r1) as Vec3, rotationZ: a.yaw, tilt: a.tilt,
      meta: ptz
        ? { ...bom(`${PTZ.model} PTZ camera`, PTZ.manufacturer, PTZ.model, 'manufacturer'), catalogId: PTZ.id, role: o.role, weightKg: PTZ.weightKg, lens: '8.8–176 mm, 1-type (20×)', throwM: +(a.dist / 1000).toFixed(1) }
        : { ...bom(`${CAMERA_BODY.model} + ${o.lens.model}`, `${CAMERA_BODY.manufacturer} / ${o.lens.manufacturer}`, `${CAMERA_BODY.model} + ${o.lens.model}`, 'manufacturer'), catalogId: o.lens.id, role: o.role, weightKg: +(CAMERA_BODY.weightKg + o.lens.weightKg).toFixed(2), lens: `${o.lens.fMin}–${o.lens.fMax} mm (×${o.lens.extender})`, throwM: +(a.dist / 1000).toFixed(1) },
    });
    if (o.tripod) objects.push({
      id: `BC.CAM.${o.n}.SUPPORT`, label: `${name} tripod / pedestal`, layer: '80_BROADCAST::80_01_CAMERAS', system: 'broadcast', group,
      parts: tripod(o.pivot[2] - o.base), position: o.pivot.map(r1) as Vec3, rotationZ: a.yaw, meta: { ...bom('Camera tripod / pedestal (generic)'), generic: true },
    });
    if (o.crew === 'operator') {
      const [ox, oy] = rot(a.yaw, o.handheld ? 160 : 0, o.handheld ? -120 : -700);
      const at: Vec3 = o.op ?? [o.pivot[0] + ox, o.pivot[1] + oy, o.base];
      objects.push({
        id: `BC.CAM.${o.n}.OP`, label: `${name} operator`, layer: '80_BROADCAST::80_05_CREW', system: 'broadcast', group,
        // figures face −Y in their own frame; the camera looks along its +Y, so the operator turns half round
        parts: figure(), position: at.map(r1) as Vec3, rotationZ: a.yaw + Math.PI, meta: { ...bom('Camera operator (crew)'), height: 1750 }, figure: 'crew',
      });
    }
    cameras.push({ id, name, role: o.role, group, lens: o.lens, crew: o.crew, body, support: o.support, pivot: o.pivot, eye, yaw: a.yaw, tilt: a.tilt, distance: Math.hypot(chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]) });
    return cameras[cameras.length - 1];
  };

  let n = 0;
  // ── FOH camera platform
  let plat: BroadcastReport['platform'] = null;
  const nFoh = Math.max(0, Math.min(3, Math.round(p.foh.cameras)));
  if (nFoh > 0) {
    const width = Math.max(2, nFoh) * MODULE, depth = 2 * MODULE;
    const backFront = st && st.report.count ? st.report.min[1] - st.params.aisleWidth : -20000;
    if (!st || !st.report.count) warnings.push({ level: 'info', code: 'bcast.foh.noseats', target: 'bcast:platform', message: 'No seating — the camera platform is placed 20 m from the stage.' });
    let yFront = backFront, placement: 'back' | 'in-house' = 'back';
    const throwAt = (yf: number) => Math.hypot(P[1] - (yf - 400), chest[2] - 1800);
    const limit = maxThrow(BOX_LENS);
    if (p.foh.placement === 'custom') {
      yFront = -Math.max(3000, p.foh.distance);
      if (yFront > backFront) placement = 'in-house'; else yFront = Math.max(yFront, backFront - 30000);
    } else if (p.foh.placement === 'auto' && throwAt(backFront) > limit) {
      yFront = P[1] + 400 - Math.sqrt(Math.max(0, limit * limit - (chest[2] - 1800) ** 2));
      placement = 'in-house';
    }
    if (p.foh.placement === 'auto' && placement === 'in-house')
      warnings.push({ level: 'info', code: 'bcast.foh.moved', target: 'bcast:platform', message: `The back of the house is ${(throwAt(backFront) / 1000).toFixed(0)} m from the presenter — further than a ${BOX_LENS.fMax} mm lens holds a close-up without its extender (${(limit / 1000).toFixed(0)} m). The camera platform moves into the house.` });
    if (p.foh.placement === 'back' && throwAt(backFront) > limit)
      warnings.push({ level: 'warn', code: 'bcast.foh.throw', target: 'bcast:platform', message: `${(throwAt(backFront) / 1000).toFixed(0)} m throw: close-ups need the 2× extender, which costs two stops of light.` });
    const x0 = -width / 2, x1 = width / 2, y0 = yFront - depth, y1 = yFront;
    if (placement === 'in-house') killRect(x0, y0, x1, y1, 450);

    // lens positions: centre-most is Cam 1
    const xs = Array.from({ length: nFoh }, (_, i) => (i - (nFoh - 1) / 2) * MODULE).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const pivotY = yFront - 900;
    // platform height from the sightline over the heads in front (and people walking the aisle)
    let needLens = 0;
    for (const x of xs) needLens = Math.max(needLens, sightlineLens([x, pivotY], chest, liveSeats(), head, [[x, yFront + 600]]));
    const h = Math.max(STEP, Math.ceil((needLens - LENS_ON_PLATFORM) / STEP - 1e-6) * STEP);
    if (h > 6 * 12 * IN) warnings.push({ level: 'warn', code: 'bcast.foh.tall', target: 'bcast:platform', message: `The camera platform needs to be ${(h / 1000).toFixed(2)} m tall to clear ${p.foh.standing ? 'a standing' : 'the'} audience — taller than modular platforms; it needs an engineered riser or scaffold.` });
    const guard = platform('BC.PLATFORM.FOH', 'FOH camera platform', x0, y0, x1, y1, h);
    if (guard) warnings.push({ level: 'info', code: 'bcast.foh.guard', target: 'bcast:platform', message: `Camera platform is ${(h / 1000).toFixed(2)} m high — guards needed on open sides above 30″ (IBC 1015.2), 42″ high.` });
    plat = { x: 0, yFront, width, depth, height: h, placement, guard };
    xs.forEach((x, i) => {
      const lens = nFoh > 1 && i === nFoh - 1 ? PORTABLE_LENS : BOX_LENS;
      const role = lens === PORTABLE_LENS ? 'FOH wide' : i === 0 ? 'FOH tight (IMAG)' : 'FOH long — second angle';
      addCamera({ n: ++n, role, lens, pivot: [x, pivotY, h + LENS_ON_PLATFORM], base: h, crew: 'operator', support: 'tripod', tripod: true });
    });
    annotations.push({ id: 'DIM.BCAST.THROW', kind: 'dim', layer: '90_TECHNICAL::90_01_DIMENSIONS', from: [width / 2 + 600, yFront, 0], to: [width / 2 + 600, 0, 0], value: -yFront, label: 'Stage to camera platform' });
  }

  // ── side cameras at the front corners of the house
  let sideH: Mm | null = null;
  if (p.sideCams && st && st.report.count && chair) {
    // start at the front rows, outside the seating; slide back down the side aisle until the
    // camera is within 45° of the presenter's eyeline (a planning rule for usable cross-shots)
    const frontY = st.report.max[1];
    const halfAt = (y: number) => {
      const near = liveSeats().filter((s) => Math.abs(s.position[1] - y) < 1500);
      return near.length ? Math.max(...near.map((s) => Math.abs(s.position[0]))) + chair.width / 2 : 0;
    };
    let cy = frontY - 1.5 * st.report.rowPitch, cx = 0;
    for (let i = 0; i < 6; i++) {
      cx = Math.max(halfAt(cy), W / 2) + st.params.aisleWidth + MODULE / 2;
      const ok = Math.atan2(cx, P[1] - cy) <= Math.PI / 4 + 1e-3;
      if (ok) break;
      cy = Math.max(st.report.min[1], P[1] - cx);
    }
    let need = 0;
    const spots = ([-1, 1] as const).map((side) => ({ side, cx: side * cx }));
    for (const s of spots) {
      killRect(s.cx - MODULE / 2, cy - MODULE / 2, s.cx + MODULE / 2, cy + MODULE / 2, 300);
      need = Math.max(need, sightlineLens([s.cx, cy], chest, liveSeats(), head, [[s.cx - s.side * (MODULE / 2 + 600), cy]]));
    }
    sideH = Math.max(STEP, Math.ceil((need - LENS_ON_PLATFORM) / STEP - 1e-6) * STEP);
    for (const s of spots) {
      const tag = s.side < 0 ? 'L' : 'R';
      platform(`BC.PLATFORM.SIDE.${tag}`, `Side camera platform — house ${s.side < 0 ? 'left' : 'right'}`, s.cx - MODULE / 2, cy - MODULE / 2, s.cx + MODULE / 2, cy + MODULE / 2, sideH);
      // a portable lens while it still reaches an MCU without the extender, else a box lens
      const d = Math.hypot(s.cx - chest[0], cy - chest[1]);
      const lens = (d * IMAGE_AREA.h) / 600 <= PORTABLE_LENS.fMax ? PORTABLE_LENS : BOX_LENS;
      addCamera({ n: ++n, role: `Side cross-shot — house ${s.side < 0 ? 'left' : 'right'}`, lens, pivot: [s.cx, cy + 200, sideH + LENS_ON_PLATFORM], base: sideH, crew: 'operator', support: 'tripod', tripod: true });
    }
  }

  // ── front rail: robotic dolly on track between the stage and the front row
  let rail: BroadcastReport['rail'] = null;
  if (p.rail.enabled) {
    const lip = ctx.lip;
    const maxLen = Math.min(FURIO.maxTrack, lip.maxX - lip.minX);
    const len = Math.max(1000, Math.min(p.rail.length, maxLen));
    if (p.rail.length > maxLen + 1) warnings.push({ level: 'info', code: 'bcast.rail.short', target: 'bcast:rail', message: `Track shortened to ${(len / 1000).toFixed(1)} m — ${maxLen === FURIO.maxTrack ? 'the Furio maximum is 30 m' : 'the width of the front deck edge'}.` });
    const OFF = 300 + FURIO.dolly.width / 2; // clear of the deck face
    const xc = (lip.minX + lip.maxX) / 2;
    const xa = Math.max(lip.minX, xc - len / 2), xb = Math.min(lip.maxX, xc + len / 2);
    const segs = Math.max(1, Math.ceil((xb - xa) / 600));
    const pts: [number, number][] = Array.from({ length: segs + 1 }, (_, i) => { const x = xa + ((xb - xa) * i) / segs; return [x, lip.y(x) - OFF]; });
    const curved = pts.some(([, y]) => Math.abs(y - pts[0][1]) > 5);
    let radius: number | null = null;
    if (curved) {
      // circumradius of the ends and the middle of the track
      const A = pts[0], B = pts[Math.floor(segs / 2)], C = pts[segs];
      const a = Math.hypot(B[0] - C[0], B[1] - C[1]), b = Math.hypot(A[0] - C[0], A[1] - C[1]), c = Math.hypot(A[0] - B[0], A[1] - B[1]);
      const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
      radius = area > 1 ? (a * b * c) / (4 * area) : null;
      if (radius != null && radius + FURIO.gauge / 2 < FURIO.minRadius) warnings.push({ level: 'warn', code: 'bcast.rail.radius', target: 'bcast:rail', message: `The track follows a ${(radius / 1000).toFixed(1)} m curve — tighter than Furio's 3.0 m minimum; needs custom track.` });
    }
    // rails and a sleeper, one object per track section
    for (let i = 0; i < segs; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const yaw = Math.atan2(by - ay, bx - ax);
      const L = Math.hypot(bx - ax, by - ay);
      objects.push({
        id: `BC.TRACK.${String(i + 1).padStart(2, '0')}`, label: `Camera track section ${i + 1}`, layer: '80_BROADCAST::80_03_TRACK', system: 'broadcast', group: 'bcast:rail',
        parts: [
          box([0, -FURIO.gauge / 2 - 15, 0], [L, -FURIO.gauge / 2 + 15, 45], 'leg'),
          box([0, FURIO.gauge / 2 - 15, 0], [L, FURIO.gauge / 2 + 15, 45], 'leg'),
          box([L / 2 - 30, -FURIO.gauge / 2 - 70, 0], [L / 2 + 30, FURIO.gauge / 2 + 70, 20], 'camera'),
        ],
        position: [r1(ax), r1(ay), 0], rotationZ: yaw, meta: { ...bom('Camera track section (up to 600 mm)', 'Ross Video', 'Furio SE track, 360 mm gauge', 'manufacturer'), length: Math.round(L), gauge: FURIO.gauge, curved },
      });
    }
    // dolly parked a quarter of the way along (house left), out of the centre camera's line to the presenter
    const xm = xa + (xb - xa) / 4, mid: [number, number] = [xm, lip.y(xm) - OFF];
    const yawT = Math.atan2(lip.y(xm + 50) - lip.y(xm - 50), 100);
    const payload = CAMERA_BODY.weightKg + WIDE_LENS.weightKg + (p.rail.prompter ? ON_CAM_PROMPTER.weightKg : 0);
    const headKey = payload > FURIO.heads.VR100.payloadKg || p.rail.prompter ? 'VR600' : 'VR100';
    const headSpec = FURIO.heads[headKey];
    const minLens = headSpec.maxLens - FURIO.lift;
    const lensH = Math.min(headSpec.maxLens, Math.max(minLens, H + 600));
    if (payload > FURIO.heads.VR600.payloadKg) warnings.push({ level: 'error', code: 'bcast.rail.payload', target: 'bcast:rail', message: `Rail camera payload ${payload.toFixed(1)} kg exceeds the Furio VR600's 30 kg.` });
    // lowest point of the presenter the rail camera sees over the deck lip
    const lipY = lip.y(mid[0]);
    const seesFrom = lensH >= H ? 0 : Math.max(0, (lensH + ((H - lensH) * (P[1] - mid[1])) / (lipY - mid[1])) - H);
    if (seesFrom > 900) warnings.push({ level: 'warn', code: 'bcast.rail.low', target: 'bcast:rail', message: `The deck is high for the rail camera: from ${(lensH / 1000).toFixed(2)} m it sees the presenter from ${(seesFrom / 1000).toFixed(2)} m up only.` });
    objects.push({
      id: 'BC.TRACK.DOLLY', label: `${FURIO.model} dolly + ${headKey} head`, layer: '80_BROADCAST::80_03_TRACK', system: 'broadcast', group: 'bcast:cam' + (n + 1),
      parts: [
        box([-FURIO.dolly.length / 2, -FURIO.dolly.width / 2, 45], [FURIO.dolly.length / 2, FURIO.dolly.width / 2, 45 + FURIO.dolly.height], 'camera'),
        { kind: 'cyl', from: [0, 0, 45 + FURIO.dolly.height], to: [0, 0, lensH - 330], r: 90, mat: 'leg' },
        box([-150, -150, lensH - 330], [150, 150, lensH - 160], 'camera'),
      ],
      position: [r1(mid[0]), r1(mid[1]), 0], rotationZ: yawT, meta: { ...bom(`Furio SE dolly + ${headKey}`, 'Ross Video', `Furio SE + ${headKey}`, 'manufacturer'), catalogId: FURIO.id, head: headKey, payloadKg: +payload.toFixed(2), lensHeight: Math.round(lensH) },
    });
    const cam = addCamera({ n: ++n, role: 'Front rail (robotic)', lens: WIDE_LENS, pivot: [mid[0], mid[1], lensH], base: 0, crew: 'robotic', support: 'rail' });
    if (p.rail.prompter) {
      objects.push({
        id: 'BC.CAM.RAIL.PROMPTER', label: `${ON_CAM_PROMPTER.model} on ${cam.name}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: cam.group,
        block: useBlock(PROMPTER_BLOCK), position: ahead(cam.pivot, cam.yaw, cam.tilt, lensFront(WIDE_LENS) - 60).map(r1) as Vec3, rotationZ: cam.yaw, tilt: cam.tilt,
        meta: { ...bom(ON_CAM_PROMPTER.model, 'Autoscript', 'EPIC-IP19', 'secondary'), catalogId: ON_CAM_PROMPTER.id, weightKg: ON_CAM_PROMPTER.weightKg, dimensions: 'estimated envelope' },
      });
      const readable = ON_CAM_PROMPTER.inches * READ_PER_INCH;
      if (cam.distance > readable) warnings.push({ level: 'warn', code: 'bcast.rail.read', target: 'bcast:rail', message: `The presenter is ${(cam.distance / 1000).toFixed(1)} m from the on-camera prompter — a 19″ prompter reads to about ${(readable / 1000).toFixed(1)} m.` });
    }
    // gap to the front row: deck face clearance + dolly + cable bundle / walkway
    const needed = 300 + FURIO.dolly.width + 600;
    const gap = st?.report.count ? st.report.frontDistance : Infinity;
    if (gap < needed) warnings.push({ level: 'warn', code: 'bcast.rail.gap', target: 'bcast:rail', message: `Only ${(gap / 1000).toFixed(2)} m from the stage to the front row — the track needs about ${(needed / 1000).toFixed(2)} m (deck clearance, dolly and cable run). Move the seating back.` });
    if (chair) for (const [x, y] of pts) killRect(x - 300, y - FURIO.dolly.width / 2 - 600, x + 300, y + FURIO.dolly.width / 2, 0);
    rail = { length: xb - xa, y: mid[1], lensHeight: lensH, head: headKey, payloadKg: payload, curved, radius, gap: Number.isFinite(gap) ? gap : 0, needed, seesFrom };
    if (st?.report.count) warnings.push({ level: 'info', code: 'bcast.rail.op', target: 'bcast:rail', message: 'The rail camera is robotic: its operator needs a view of the whole track, or a monitor of it, and the cable bundle must never hang over a stage edge (Ross Furio set-up guide).' });
  }

  // ── RF handheld on the deck, house left (start position)
  if (p.handheld) {
    const x = -(W / 2 - 900), y = Math.max(600, Math.min(P[1], ctx.stageDepth * 0.3));
    const base = ctx.deckTopAt(x, y) || H;
    addCamera({ n: ++n, role: 'RF handheld (roaming)', lens: WIDE_LENS, pivot: [x, y, base + 1600], base, crew: 'operator', support: 'handheld', handheld: true });
  }

  // ── Steadicam on the deck, house right (opposite the handheld)
  let steadicam: BroadcastReport['steadicam'] = null;
  if (p.steadicam) {
    const x = W / 2 - 1300, y = Math.max(600, Math.min(P[1], ctx.stageDepth * 0.3));
    const base = ctx.deckTopAt(x, y) || H;
    const pivot: Vec3 = [x, y, base + STEADI_LENS];
    const a = aim(pivot, chest);
    // operator stands behind and to the side of the sled; the arm runs from the vest to the gimbal
    const [ox, oy] = rot(a.yaw, 420, -380);
    const cam = addCamera({ n: ++n, role: 'Steadicam (roaming)', lens: WIDE_LENS, pivot, base, crew: 'operator', support: 'steadicam', op: [x + ox, y + oy, base] });
    const [hx, hy] = rot(a.yaw, 420 - 170, -380 + 120); // vest hip, local to the sled
    const post = STEADI_LENS - 150;
    objects.push({
      id: `BC.CAM.${n}.RIG`, label: `${cam.name} — ${STEADICAM.manufacturer} ${STEADICAM.model}`, layer: '80_BROADCAST::80_01_CAMERAS', system: 'broadcast', group: cam.group,
      parts: [
        { kind: 'cyl', from: [0, 0, post], to: [0, 0, post - 700], r: 20, mat: 'leg' }, // post
        box([-110, -140, post - 820], [110, 140, post - 700], 'camera'), // battery / electronics base
        box([-90, -30, post - 690], [90, 0, post - 570], 'screen'), // monitor
        { kind: 'cyl', from: [hx, hy, 1000], to: [0, 0, post - 250], r: 28, mat: 'leg' }, // arm
      ],
      position: [r1(x), r1(y), base], rotationZ: 0,
      meta: { ...bom(STEADICAM.model, STEADICAM.manufacturer, 'M-2 + G-70x', 'secondary'), catalogId: STEADICAM.id, armLift: `${STEADICAM.armMinKg}–${STEADICAM.armMaxKg} kg`, envelope: 'post and sled drawn to planning sizes' },
    });
    const payload = CAMERA_BODY.weightKg + WIDE_LENS.weightKg;
    if (payload > STEADICAM.armMaxKg) warnings.push({ level: 'error', code: 'bcast.steadi.payload', target: cam.group, message: `Steadicam payload ${payload.toFixed(1)} kg is over the G-70x arm's ${STEADICAM.armMaxKg} kg.` });
    warnings.push({ level: 'info', code: 'bcast.steadi.path', target: cam.group, message: 'Steadicam: keep a clear 1.5 m walking path on the deck and a cable-free route for the RF link; the operator works with a grip spotting them.' });
    steadicam = { payloadKg: payload };
  }

  // ── jib on the house floor off a downstage corner, swinging over the front of the stage
  let jib: BroadcastReport['jib'] = null;
  if (p.jib.enabled) {
    const side = p.jib.side === 'right' ? 1 : -1;
    const ft = JIB.reachesFt.reduce((b, f) => (Math.abs(f - p.jib.reachFt) < Math.abs(b - p.jib.reachFt) ? f : b), JIB.reachesFt[0] as number);
    const reach = ft * 12 * IN;
    // the nose parks 7 m from the presenter (a wide lens holds the whole stage from there), on a
    // line out past the downstage corner; the base sits a nose-up arm length further out, in the house
    const cornerX = side > 0 ? ctx.lip.maxX : ctx.lip.minX;
    const off = Math.min(50, Math.max(25, (Math.atan2(Math.abs(cornerX - P[0]) + 1500, P[1] - ctx.lip.y(cornerX) + 2500) * 180) / Math.PI)) * Math.PI / 180;
    const dx = side * Math.sin(off), dy = -Math.cos(off);
    const boom = Math.PI / 9; // 20° nose up
    const plan = reach * Math.cos(boom);
    const tipZ = JIB_FULCRUM + reach * Math.sin(boom);
    const bx = P[0] + dx * (JIB_NOSE + plan), by = P[1] + dy * (JIB_NOSE + plan);
    const yaw = Math.atan2(-(P[0] - bx), P[1] - by);
    const [tx, ty] = rot(yaw, 0, plan);
    const pivot: Vec3 = [bx + tx, by + ty, tipZ - JIB_DROP];
    const back = reach * JIB_BACK;
    const bz = JIB_FULCRUM - ((tipZ - JIB_FULCRUM) * back) / reach;
    const bp = (plan * back) / reach;
    const [opx, opy] = rot(yaw, -side * 700, -bp - 500);
    const cam = addCamera({ n: ++n, role: `Jib — ${ft}′ arm, house ${side < 0 ? 'left' : 'right'}`, lens: WIDE_LENS, pivot, base: 0, crew: 'operator', support: 'jib', op: [bx + opx, by + opy, 0] });
    objects.push({
      id: `BC.JIB`, label: `${cam.name} — ${JIB.manufacturer} ${JIB.model}, ${ft}′ reach`, layer: '80_BROADCAST::80_01_CAMERAS', system: 'broadcast', group: cam.group,
      parts: [
        // heavy-duty tripod base, legs spread 1.5 m
        ...[0, 1, 2].map((i): Part => { const t = (i * 2 * Math.PI) / 3 + Math.PI / 2; return { kind: 'cyl', from: [0, 0, JIB_FULCRUM - 230], to: [Math.cos(t) * 760, Math.sin(t) * 760, 0], r: 24, mat: 'leg' }; }),
        { kind: 'cyl', from: [0, 0, JIB_FULCRUM - 230], to: [0, 0, JIB_FULCRUM - 60], r: 70, mat: 'camera' },
        box([-120, -120, JIB_FULCRUM - 60], [120, 120, JIB_FULCRUM], 'camera'), // fulcrum
        { kind: 'cyl', from: [0, -bp, bz], to: [0, plan, tipZ], r: 55, mat: 'leg' }, // arm
        { kind: 'cyl', from: [0, -bp * 0.6, bz + 300], to: [0, plan * 0.6, (JIB_FULCRUM + tipZ) / 2 + 250], r: 12, mat: 'leg' }, // triangle top chord
        box([-180, -bp - 300, bz - 260], [180, -bp, bz + 40], 'camera'), // counterweights
        { kind: 'cyl', from: [0, plan, tipZ], to: [0, plan, tipZ - JIB_DROP + 150], r: 30, mat: 'leg' }, // remote head drop
      ],
      position: [r1(bx), r1(by), 0], rotationZ: yaw,
      meta: { ...bom(`Jib arm, ${ft}′ reach, with remote head`, JIB.manufacturer, `${JIB.model} (${ft}′)`, 'secondary'), catalogId: JIB.id, reachFt: ft, fulcrum: JIB_FULCRUM, lensHeight: Math.round(pivot[2]) },
    });
    // counterweight end swings at head height: clear its circle plus a walkway, and the operator's spot
    const tail = back + 600;
    if (chair) for (const s of seatsAll) if (Math.hypot(s.position[0] - bx, s.position[1] - by) < Math.max(tail, 1200) + chair.width / 2) kills.add(s.id);
    killRect(bx + opx - 400, by + opy - 400, bx + opx + 400, by + opy + 400, 0);
    const payload = CAMERA_BODY.weightKg + WIDE_LENS.weightKg;
    const rated = ft >= 30 ? JIB.payloadKgAt30 : JIB.payloadKg;
    if (payload > rated) warnings.push({ level: 'error', code: 'bcast.jib.payload', target: cam.group, message: `Jib payload ${payload.toFixed(1)} kg is over the ${ft}′ arm's ${rated} kg.` });
    warnings.push({ level: 'info', code: 'bcast.jib.swing', target: cam.group, message: `Jib swings through a ${((reach + back) * 2 / 1000).toFixed(1)} m circle; the counterweight end sweeps ${(back / 1000).toFixed(1)} m behind the base at head height — keep it roped off. Remote head weight is not in the payload check.` });
    jib = { reach, reachFt: ft, side: side < 0 ? 'left' : 'right', base: [bx, by, 0], lensHeight: pivot[2], payloadKg: payload, ratedKg: rated, swing: reach, tailSwing: back };
  }

  // ── PTZ robotic cameras: under the front truss, or low at the deck corners
  let ptzR: BroadcastReport['ptz'] = null;
  const nPtz = Math.max(0, Math.min(4, Math.round(p.ptz.count)));
  if (nPtz) {
    let mount = p.ptz.mount;
    if (mount === 'truss' && !ctx.frontTruss) {
      warnings.push({ level: 'info', code: 'bcast.ptz.notruss', target: 'bcast:ptz', message: 'No front truss to hang the PTZ cameras from — they sit on the deck corners instead.' });
      mount = 'deck';
    }
    for (let i = 0; i < nPtz; i++) {
      let pivot: Vec3, role: string, base: Mm;
      if (mount === 'truss') {
        const T = ctx.frontTruss!;
        const span = Math.min(T.length - 1200, W * 0.8);
        const x = nPtz === 1 ? 0 : -span / 2 + (span * i) / (nPtz - 1);
        pivot = [x, T.y - 300, T.bottom - 250]; base = T.bottom;
        role = `PTZ on the front truss (${i + 1})`;
      } else {
        // downstage corners first (low cross-shots), then upstage corners (reverse shots over the presenter)
        const up = i >= 2, side = i % 2 ? 1 : -1;
        const y = up ? ctx.stageDepth * 0.8 : Math.max(400, ctx.lip.y(side * (W / 2 - 500)) + 400);
        const x = side * (W / 2 - 500);
        base = ctx.deckTopAt(x, y) || H;
        pivot = [x, y, base + (up ? 2100 : 450)];
        role = up ? `PTZ reverse — upstage ${side < 0 ? 'left' : 'right'}` : `PTZ low — downstage ${side < 0 ? 'left' : 'right'}`;
        objects.push({
          id: `BC.PTZ.${i + 1}.STAND`, label: `PTZ ${up ? 'stand' : 'floor plate'} ${i + 1}`, layer: '80_BROADCAST::80_01_CAMERAS', system: 'broadcast', group: `bcast:cam${n + 1}`,
          parts: [box([-200, -200, 0], [200, 200, 20], 'camera'), { kind: 'cyl', from: [0, 0, 20], to: [0, 0, pivot[2] - base - 170], r: 25, mat: 'leg' }],
          position: [r1(x), r1(y), base], rotationZ: 0, meta: { ...bom(up ? 'PTZ camera stand (generic)' : 'PTZ floor plate (generic)') },
        });
      }
      addCamera({ n: ++n, role, lens: PTZ_LENS, pivot, base, crew: 'robotic', support: 'ptz' });
    }
    warnings.push({ level: 'info', code: 'bcast.ptz.op', target: `bcast:cam${n}`, message: `${nPtz} PTZ camera${nPtz > 1 ? 's' : ''}: one remote operator can run several from a joystick controller; ${mount === 'truss' ? 'truss-hung PTZs need an inverted mount and a safety bond' : 'deck PTZs need cable runs taped down off the walking line'}.` });
    ptzR = { count: nPtz, mount };
  }

  // ── presidential (conference) prompter pair
  let pres = 0;
  if (p.prompters.presidential) {
    // 25–60° either side of the presenter's eyeline, 1.8–3.0 m away (well inside the 6 m reading
    // distance), kept clear in plan of every camera's line to the presenter so it stays out of the shots
    const spot = (side: number, a: number, d: number): [number, number] => [P[0] + side * d * Math.sin(a), Math.max(400, P[1] - d * Math.cos(a))];
    const clearance = ([x, y]: [number, number]) => Math.min(Infinity, ...cameras.map((c) => {
      const ex = c.eye[0], ey = c.eye[1], dx = P[0] - ex, dy = P[1] - ey, L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - ex) * dx + (y - ey) * dy) / L2));
      return Math.hypot(x - ex - t * dx, y - ey - t * dy);
    }));
    for (const side of [-1, 1] as const) {
      // nearest to the conventional spot that keeps 600 mm clear of every camera line, else the clearest
      let ang = (40 * Math.PI) / 180, dist = 2400, best = -1, bestPref = Infinity;
      for (let deg = 25; deg <= 60; deg++) for (let d = 1800; d <= 3000; d += 100) {
        const xy = spot(side, (deg * Math.PI) / 180, d);
        if (ctx.deckTopAt(xy[0], xy[1]) <= 0) continue;
        const c = Math.min(600, clearance(xy));
        const pref = Math.abs(deg - 40) + Math.abs(d - 2400) / 100;
        if (c > best + 1 || (Math.abs(c - best) <= 1 && pref < bestPref)) { best = c; bestPref = pref; ang = (deg * Math.PI) / 180; dist = d; }
      }
      if (best < 450) warnings.push({ level: 'info', code: 'bcast.prompter.shot', target: 'bcast:prompters', message: `The ${side < 0 ? 'house-left' : 'house-right'} prompter is within ${Math.round(Math.max(0, best))} mm of a camera's line to the presenter — it will show in that shot.` });
      const [x, y] = spot(side, ang, dist);
      const base = ctx.deckTopAt(x, y);
      if (best < 0 || base <= 0) { warnings.push({ level: 'warn', code: 'bcast.prompter.deck', target: 'bcast:prompters', message: 'A presidential prompter falls off the deck — move the presenter upstage or widen the stage.' }); continue; }
      const glassZ = Math.min(base + CONF_PROMPTER.standMax, Math.max(base + CONF_PROMPTER.standMin, eyeZ));
      const a = aim([x, y, glassZ], [P[0], P[1], eyeZ]);
      const tag = side < 0 ? 'L' : 'R';
      objects.push(
        {
          id: `BC.PROMPT.PRES.${tag}`, label: `${CONF_PROMPTER.model} stand — ${side < 0 ? 'house left' : 'house right'}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-250, -250, 0], [250, 250, 25], 'camera'), { kind: 'cyl', from: [0, -60, 25], to: [0, -60, glassZ - base - 210], r: 18, mat: 'leg' }],
          position: [r1(x), r1(y), base], rotationZ: a.yaw, meta: { ...bom('Conference prompter (17″), stand + monitor + glass', 'Autocue', 'Conference prompter (17″)', 'secondary'), catalogId: CONF_PROMPTER.id, monitor: '17″', glassHeight: Math.round(glassZ - base), angleDeg: Math.round((Math.atan2(Math.abs(x - P[0]), P[1] - y) * 180) / Math.PI), distance: Math.round(Math.hypot(x - P[0], y - P[1])) },
        },
        {
          id: `BC.PROMPT.PRES.${tag}.MON`, label: `Prompter monitor (17″) — ${side < 0 ? 'house left' : 'house right'}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-190, -25, -150], [190, 25, 150], 'screen')], ...posed([x, y, base + 300], a.yaw, (135 * Math.PI) / 180), meta: { bomSkip: true, angle: '45° up (teleprompter.com)' },
        },
        {
          id: `BC.PROMPT.PRES.${tag}.GLASS`, label: `Prompter glass — ${side < 0 ? 'house left' : 'house right'}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-215, -3, -200], [215, 3, 200], 'glass')], ...posed([x, y, glassZ], a.yaw, (-22.5 * Math.PI) / 180), meta: { bomSkip: true, coating: 'beam-splitter (70:30)' },
        },
      );
      pres++;
    }
  }

  // ── downstage confidence monitors
  let dsm = 0;
  const nDsm = p.prompters.dsm === 'off' ? 0 : Math.max(0, Math.min(4, Math.round(p.prompters.dsmCount)));
  for (let i = 0; i < nDsm; i++) {
    // towards the downstage corners, clear of the centre camera's shot; one alone sits centre
    const spread = Math.min(W - 2000, nDsm === 2 ? W / 2 : W * 0.6);
    const x = nDsm === 1 ? 0 : -spread / 2 + (spread * i) / (nDsm - 1);
    const y = ctx.lip.y(Math.max(ctx.lip.minX, Math.min(ctx.lip.maxX, x))) + 500;
    const base = ctx.deckTopAt(x, y);
    if (base <= 0) continue;
    const tag = String(i + 1);
    if (p.prompters.dsm === 'recessed') {
      const yaw = aim([x, y, base], [P[0], P[1], eyeZ]).yaw;
      objects.push({
        id: `BC.DSM.${tag}`, label: `Recessed confidence monitor ${tag} (${DSM.inches}″, generic)`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
        parts: [box([-DSM.w / 2, -DSM.h / 2, -160], [DSM.w / 2, DSM.h / 2, -2], 'screen'), box([-DSM.w / 2 - 40, -DSM.h / 2 - 40, -2], [DSM.w / 2 + 40, DSM.h / 2 + 40, 0], 'glass')],
        position: [r1(x), r1(y), base], rotationZ: yaw, meta: { ...bom(`Recessed confidence monitor ${DSM.inches}″ (generic)`), size: `${DSM.inches}″`, build: 'Cut-out in the deck under a glass lid — custom carpentry' },
      });
    } else {
      // low and leaning back, so it stays under the presenter's knees in the FOH shot
      const c: Vec3 = [x, y, base + 380];
      const a = aim(c, [P[0], P[1], eyeZ]);
      a.tilt = Math.max(a.tilt, Math.PI / 4);
      objects.push(
        {
          id: `BC.DSM.${tag}`, label: `Downstage confidence monitor ${tag} (${DSM.inches}″, generic)`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-DSM.w / 2, -DSM.d / 2, -DSM.h / 2], [DSM.w / 2, DSM.d / 2, DSM.h / 2], 'screen')], ...posed(c, a.yaw, a.tilt), meta: { ...bom(`Confidence monitor ${DSM.inches}″ on floor stand (generic)`), size: `${DSM.inches}″`, tiltDeg: Math.round((a.tilt * 180) / Math.PI) },
        },
        {
          id: `BC.DSM.${tag}.STAND`, label: `Confidence monitor stand ${tag}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-300, -200, 0], [300, 200, 25], 'camera'), { kind: 'cyl', from: [0, -60, 25], to: [0, -60, 260], r: 30, mat: 'leg' }],
          position: [r1(x), r1(y), base], rotationZ: a.yaw, meta: { bomSkip: true },
        },
      );
    }
    dsm++;
  }
  if (p.prompters.dsm === 'recessed' && dsm) warnings.push({ level: 'info', code: 'bcast.dsm.recess', target: 'bcast:prompters', message: 'Recessed monitors need cut-outs in the deck — custom carpentry, check with the staging supplier.' });

  // ── FOH confidence screens: hung under the front truss, or on the camera platform
  let fohN = 0, fohDist = 0;
  let fohMode = p.prompters.foh;
  if (fohMode === 'truss' && !ctx.frontTruss) {
    warnings.push({ level: 'info', code: 'bcast.foh.notruss', target: 'bcast:prompters', message: 'No front truss to hang the confidence screens from — they stand on the camera platform instead.' });
    fohMode = 'riser';
  }
  if (fohMode === 'riser' && !plat) fohMode = 'off';
  if (fohMode !== 'off') {
    for (const side of [-1, 1] as const) {
      let c: Vec3, drop: Part[], at: Vec3, label: string;
      if (fohMode === 'truss') {
        const T = ctx.frontTruss!;
        const x = side * Math.min(W / 4, T.length / 2 - FOH_MON.w / 2 - 300);
        c = [x, T.y, T.bottom - 300 - FOH_MON.h / 2];
        at = [x, T.y, 0];
        drop = [-1, 1].map((k) => ({ kind: 'cyl' as const, from: [k * FOH_MON.w * 0.3, 0, c[2] + FOH_MON.h / 2] as Vec3, to: [k * FOH_MON.w * 0.3, 0, T.bottom] as Vec3, r: 12, mat: 'leg' as const }));
        label = 'hung under the front truss';
      } else {
        const x = side * (plat!.width / 2 + 1200);
        c = [x, plat!.yFront - 300, 2600];
        at = [x, plat!.yFront - 300, 0];
        killRect(x - 400, at[1] - 400, x + 400, at[1] + 400, 0);
        drop = [{ kind: 'cyl', from: [0, 0, 0], to: [0, 0, c[2] - FOH_MON.h / 2], r: 40, mat: 'leg' }, box([-400, -400, 0], [400, 400, 30], 'camera')];
        label = 'on a stand beside the camera platform';
      }
      const a = aim(c, [P[0], P[1], eyeZ]);
      const tag = side < 0 ? 'L' : 'R';
      objects.push(
        {
          id: `BC.FOHMON.${tag}`, label: `FOH confidence screen ${tag} (${FOH_MON.inches}″, generic) — ${label}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: [box([-FOH_MON.w / 2, -FOH_MON.d / 2, -FOH_MON.h / 2], [FOH_MON.w / 2, FOH_MON.d / 2, FOH_MON.h / 2], 'screen')], ...posed(c, a.yaw, a.tilt),
          meta: { ...bom(`FOH confidence screen ${FOH_MON.inches}″ (generic)`), size: `${FOH_MON.inches}″`, distanceM: +(a.dist / 1000).toFixed(1) },
        },
        {
          id: `BC.FOHMON.${tag}.MOUNT`, label: `FOH confidence screen ${tag} ${fohMode === 'truss' ? 'drops' : 'stand'}`, layer: '80_BROADCAST::80_04_PROMPTERS', system: 'broadcast', group: 'bcast:prompters',
          parts: drop,
          position: fohMode === 'truss' ? [r1(c[0]), r1(c[1]), 0] : at.map(r1) as Vec3, rotationZ: fohMode === 'truss' ? 0 : a.yaw, meta: { ...bom(fohMode === 'truss' ? 'Screen drop pipes (pair)' : 'Screen floor stand (generic)') },
        },
      );
      fohN++;
      fohDist = Math.max(fohDist, a.dist);
    }
    const readable = FOH_MON.inches * READ_PER_INCH;
    if (fohDist > readable) warnings.push({ level: 'warn', code: 'bcast.foh.read', target: 'bcast:prompters', message: `FOH confidence screens are ${(fohDist / 1000).toFixed(0)} m from the presenter; ${FOH_MON.inches}″ screens read to about ${(readable / 1000).toFixed(0)} m. Hang them from the front truss or use larger screens.` });
  }

  if (kills.size) warnings.push({ level: 'info', code: 'bcast.kills', target: 'bcast:platform', message: `${kills.size} seat${kills.size === 1 ? '' : 's'} removed for camera positions ("seat kills").` });
  if (cameras.length) warnings.push({ level: 'info', code: 'bcast.planning', message: 'Camera positions are a planning start point: confirm with the director and the camera supplier. Camera bodies are drawn without large-lens adaptors, cables or cable ramps.' });

  const report: BroadcastReport = {
    cameras, platform: plat, sidePlatformHeight: sideH, seatKills: kills.size, rail, jib, steadicam, ptz: ptzR,
    prompters: { presidential: pres, dsm, dsmMode: p.prompters.dsm, foh: fohN, fohMode, fohReadable: FOH_MON.inches * READ_PER_INCH, fohDistance: fohDist, onCamera: !!(p.rail.enabled && p.rail.prompter) },
    presenter: P, stageWidth: W,
  };
  return { report, objects, blocks, annotations, warnings, kills };
}

/** BOM line for an object that is not in the main catalogue */
const bom = (item: string, manufacturer = 'Generic', model = '—', verification: 'manufacturer' | 'secondary' | 'generic' = 'generic') => ({ bom: item, manufacturer, model, verification });
const posed = (c: Vec3, yaw: number, tilt: number) => ({ position: c.map(r1) as Vec3, rotationZ: yaw, tilt });
