import { describe, expect, it } from 'vitest';
import { BOX_LENS, IMAGE_AREA, PORTABLE_LENS, WIDE_LENS, lensState, maxThrow, shotFor } from '../src/core/engine/broadcast';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset } from '../src/core/presets';
import { parseProject, serializeProject } from '../src/core/schema';

const keynote = () => getPreset('minimal-keynote').build();
const STEP = 8 * 25.4;

describe('Broadcast', () => {
  it('puts the FOH camera platform behind the last row, on the centreline, in 8″ steps', () => {
    const s = resolveScene(keynote());
    const b = s.report.broadcast!;
    const pl = b.platform!;
    expect(pl.placement).toBe('back');
    expect(pl.yFront).toBeLessThan(s.report.seating!.min[1]);
    expect(pl.height / STEP).toBeCloseTo(Math.round(pl.height / STEP), 6);
    expect(b.cameras[0].role).toMatch(/tight/);
    expect(b.cameras[0].lens).toBe(BOX_LENS);
    expect(b.seatKills).toBe(0);
  });

  it('follows the audience as it grows', () => {
    const small = keynote(); small.seating.count = 500;
    const big = keynote(); big.seating.count = 3000;
    const a = resolveScene(small).report.broadcast!.platform!, c = resolveScene(big).report.broadcast!.platform!;
    expect(c.yFront).toBeLessThan(a.yFront - 5000);
  });

  it('moves into the house when the throw is too long for a close-up, killing the seats under it', () => {
    const p = keynote(); p.seating.count = 5000; p.seating.layout = 'radial';
    const s = resolveScene(p);
    const b = s.report.broadcast!, pl = b.platform!;
    expect(pl.placement).toBe('in-house');
    expect(b.cameras[0].distance).toBeLessThanOrEqual(maxThrow(BOX_LENS) + 1500);
    expect(b.seatKills).toBeGreaterThan(0);
    expect(s.report.seating!.count).toBe(5000 - b.seatKills);
    const seats = s.objects.filter((o) => o.system === 'seating');
    expect(seats.length).toBe(s.report.seating!.count);
    const inside = seats.filter((o) => Math.abs(o.position[0]) < pl.width / 2 && o.position[1] < pl.yFront && o.position[1] > pl.yFront - pl.depth);
    expect(inside).toHaveLength(0);
  });

  it('lens clears the heads in front (seated, and standing when asked)', () => {
    for (const standing of [false, true]) {
      const p = keynote(); p.broadcast!.foh.standing = standing; p.broadcast!.foh.placement = 'custom'; p.broadcast!.foh.distance = 15000;
      const s = resolveScene(p);
      const cam = s.report.broadcast!.cameras[0];
      const P = s.report.broadcast!.presenter, tz = P[2] + 1300;
      const head = standing ? 1750 : 1270;
      for (const seat of s.objects.filter((o) => o.system === 'seating' && Math.abs(o.position[0] - cam.pivot[0]) < 300 && o.position[1] > cam.pivot[1])) {
        const t = (seat.position[1] - cam.pivot[1]) / (P[1] - cam.pivot[1]);
        const z = cam.pivot[2] + (tz - cam.pivot[2]) * t;
        expect(z).toBeGreaterThanOrEqual(head + 99);
      }
    }
  });

  it('side cameras stay within 45° of the presenter and outside the seating', () => {
    const p = keynote(); p.seating.count = 3000;
    const s = resolveScene(p);
    const P = s.report.broadcast!.presenter;
    const side = s.report.broadcast!.cameras.filter((c) => c.role.startsWith('Side'));
    expect(side).toHaveLength(2);
    for (const c of side) expect(Math.atan2(Math.abs(c.pivot[0] - P[0]), P[1] - c.pivot[1])).toBeLessThanOrEqual(Math.PI / 4 + 0.01);
  });

  it('lens maths match the Canon datasheets', () => {
    expect(lensState(BOX_LENS, 9).hfov).toBeCloseTo(56.1, 0);
    expect(lensState(BOX_LENS, 810).hfov).toBeCloseTo(0.68, 1);
    expect(lensState(PORTABLE_LENS, 7.8).hfov).toBeCloseTo(63.2, 0);
    expect(lensState(WIDE_LENS, 4.3).hfov).toBeCloseTo(96.3, 0);
    expect(lensState(BOX_LENS, 1000)).toMatchObject({ extender: true, outOfRange: false });
    expect(lensState(PORTABLE_LENS, 400)).toMatchObject({ outOfRange: true, clamped: 312 });
    const s = resolveScene(keynote());
    const cam = s.report.broadcast!.cameras[0];
    const f = shotFor(cam, 'full', s.report.broadcast!.presenter, s.report.broadcast!.stageWidth);
    const d = Math.hypot(f.target[0] - cam.eye[0], f.target[1] - cam.eye[1], f.target[2] - cam.eye[2]);
    expect(f.focal).toBeCloseTo((d * IMAGE_AREA.h) / 2200, 6);
  });

  it('front rail sits between the deck and the front row, and warns when the gap is too small', () => {
    const s = resolveScene(keynote());
    const r = s.report.broadcast!.rail!;
    expect(r.y).toBeLessThan(0);
    expect(r.y).toBeGreaterThan(-s.report.seating!.frontDistance);
    expect(r.head).toBe('VR100');
    expect(s.warnings.some((w) => w.code === 'bcast.rail.gap')).toBe(false);
    const p = keynote(); p.seating.frontDistance = 1000;
    expect(resolveScene(p).warnings.some((w) => w.code === 'bcast.rail.gap')).toBe(true);
    const q = keynote(); q.broadcast!.rail.prompter = true;
    const rq = resolveScene(q).report.broadcast!.rail!;
    expect(rq.head).toBe('VR600');
    expect(rq.payloadKg).toBeCloseTo(5 + 2.19 + 14.7, 6);
  });

  it('places prompters on the deck and out of the camera lines', () => {
    for (const id of ['minimal-keynote', 'panoramic-keynote', 'product-launch', 'multi-screen', 'conversation']) {
      const s = resolveScene(getPreset(id).build());
      const pres = s.objects.filter((o) => /^BC\.PROMPT\.PRES\.[LR]$/.test(o.id));
      expect(pres).toHaveLength(2);
      for (const o of pres) expect(o.position[2]).toBeGreaterThan(0);
      expect(s.warnings.some((w) => w.code === 'bcast.prompter.deck' || w.code === 'bcast.prompter.shot')).toBe(false);
      // and at least 600 mm (in plan) from every camera's line to the presenter
      const P = s.report.broadcast!.presenter;
      for (const o of pres) for (const c of s.report.broadcast!.cameras) {
        const dx = P[0] - c.eye[0], dy = P[1] - c.eye[1], L2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((o.position[0] - c.eye[0]) * dx + (o.position[1] - c.eye[1]) * dy) / L2));
        expect(Math.hypot(o.position[0] - c.eye[0] - t * dx, o.position[1] - c.eye[1] - t * dy)).toBeGreaterThanOrEqual(599);
      }
    }
  });

  it('hangs FOH confidence screens from the front truss, or stands them by the cameras without one', () => {
    const p = keynote();
    expect(resolveScene(p).report.broadcast!.prompters.fohMode).toBe('truss');
    p.rigging.front.enabled = false;
    const s = resolveScene(p);
    expect(s.report.broadcast!.prompters.fohMode).toBe('riser');
    expect(s.report.broadcast!.prompters.foh).toBe(2);
  });

  it('is off for older project files and survives a save round trip', () => {
    const p = keynote();
    const old = JSON.parse(serializeProject(p)); delete old.broadcast;
    expect(parseProject(JSON.stringify(old)).broadcast!.enabled).toBe(false);
    expect(parseProject(serializeProject(p)).broadcast).toEqual(p.broadcast);
  });
});
