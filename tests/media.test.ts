import { describe, expect, it } from 'vitest';
import { validateBytes } from 'gltf-validator';
import { mainWall, resolveMediaCanvas } from '../src/core/engine/media';
import { resolveScene } from '../src/core/engine/scene';
import { getPreset } from '../src/core/presets';
import { parseProject, serializeProject } from '../src/core/schema';
import { exportGlb } from '../src/export/glb';
import { projectForSave, useStore } from '../src/ui/store';

const ledOf = (id: string, mut?: (p: ReturnType<ReturnType<typeof getPreset>['build']>) => void) => {
  const p = getPreset(id).build(); mut?.(p); return resolveScene(p).report.led;
};
const centre = (L: ReturnType<typeof ledOf>[number]) => [L.origin[0], (L.origin[2] + L.top) / 2];

describe('Screen media mapping', () => {
  it('picks the wall called main, else the biggest wall nearest the centreline', () => {
    expect(mainWall(ledOf('minimal-keynote')).id).toBe('main');
    expect(mainWall(ledOf('multi-screen')).id).toBe('c'); // three equal screens → the centre one
  });

  it('span: the image centre is the main-screen centre and the image covers every screen', () => {
    for (const id of ['multi-screen', 'product-launch', 'panoramic-keynote']) {
      for (const aspect of [16 / 9, 32 / 9, 1, 0.5]) {
        const led = ledOf(id);
        const c = resolveMediaCanvas(led, aspect, 'span')!;
        const [mx, mz] = centre(mainWall(led));
        expect(c.rect.cx).toBeCloseTo(mx, 6); expect(c.rect.cz).toBeCloseTo(mz, 6);
        expect(c.rect.width / c.rect.height).toBeCloseTo(aspect, 6); // never stretched
        for (const L of led) {
          expect(L.origin[0] - L.chord / 2).toBeGreaterThanOrEqual(c.rect.cx - c.rect.width / 2 - 1e-6);
          expect(L.origin[0] + L.chord / 2).toBeLessThanOrEqual(c.rect.cx + c.rect.width / 2 + 1e-6);
          expect(L.origin[2]).toBeGreaterThanOrEqual(c.rect.cz - c.rect.height / 2 - 1e-6);
          expect(L.top).toBeLessThanOrEqual(c.rect.cz + c.rect.height / 2 + 1e-6);
        }
      }
    }
  });

  it('main: the whole image fits inside the main screen, touching it on one axis', () => {
    const led = ledOf('product-launch');
    const M = mainWall(led);
    for (const aspect of [4, 1, 0.3]) {
      const c = resolveMediaCanvas(led, aspect, 'main')!;
      const W = M.chord, H = M.top - M.origin[2];
      expect(c.rect.width).toBeLessThanOrEqual(W + 1e-6); expect(c.rect.height).toBeLessThanOrEqual(H + 1e-6);
      expect(Math.max(c.rect.width / W, c.rect.height / H)).toBeCloseTo(1, 6);
      expect(c.pixels).toEqual({ width: M.pixelsW, height: M.pixelsH }); // canvas = the main screen's own pixels
    }
  });

  it('re-fits as walls change, keeping the centre pinned to the main screen', () => {
    const before = resolveMediaCanvas(ledOf('multi-screen'), 16 / 9, 'span')!;
    const after = resolveMediaCanvas(ledOf('multi-screen', (p) => { p.ledWalls[0].offsetX -= 3000; p.ledWalls[1].elevation += 1000; }), 16 / 9, 'span')!;
    expect(after.rect.width).toBeGreaterThan(before.rect.width); // left screen moved out → wider canvas
    const [mx, mz] = centre(mainWall(ledOf('multi-screen', (p) => { p.ledWalls[1].elevation += 1000; })));
    expect(after.rect.cx).toBeCloseTo(mx, 6); expect(after.rect.cz).toBeCloseTo(mz, 6);
  });

  it('pixel map lists every screen inside the canvas, the main one centred', () => {
    const c = resolveMediaCanvas(ledOf('multi-screen'), 16 / 9, 'span')!;
    for (const w of c.walls) {
      expect(w.x).toBeGreaterThanOrEqual(0); expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x + w.w).toBeLessThanOrEqual(c.pixels.width + 1); expect(w.y + w.h).toBeLessThanOrEqual(c.pixels.height + 1);
    }
    const m = c.walls.find((w) => w.main)!;
    expect(Math.abs(m.x + m.w / 2 - c.pixels.width / 2)).toBeLessThanOrEqual(1);
  });

  it('a saved project keeps its image inline and old projects load without media', () => {
    const p = getPreset('minimal-keynote').build();
    p.media = { assetId: 'a', name: 'logo', width: 100, height: 50, fit: 'main', data: 'data:image/png;base64,AAAA' };
    expect(parseProject(serializeProject(p)).media?.data).toBe('data:image/png;base64,AAAA');
    const old = JSON.parse(serializeProject(getPreset('minimal-keynote').build()));
    expect(parseProject(JSON.stringify(old)).media ?? null).toBeNull();
  });

  it('a video project saves small videos inline and big ones as poster + relink', () => {
    const p = getPreset('minimal-keynote').build();
    const poster = 'data:image/jpeg;base64,BBBB';
    p.media = { assetId: 'v', name: 'loop', width: 3840, height: 1080, fit: 'span', kind: 'video', duration: 12.5, loop: true, poster, bytes: 1e6 };
    const st = useStore.getState();
    st.addAsset('v', 'data:video/mp4;base64,CCCC');
    const small = parseProject(serializeProject(projectForSave(p))).media!;
    expect(small).toMatchObject({ kind: 'video', duration: 12.5, loop: true, poster, data: 'data:video/mp4;base64,CCCC' });
    st.addAsset('v', 'blob:http://localhost/123');
    const big = parseProject(serializeProject(projectForSave(p))).media!;
    expect(big.data).toBeUndefined(); // a blob: URL dies with the tab; the poster stands in until relinked
    expect(big.poster).toBe(poster);
  });

  it('GLB carries the image as an emissive texture on one face mesh per wall, valid glTF', async () => {
    const p = getPreset('multi-screen').build();
    const scene = resolveScene(p);
    // 1×1 PNG
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const bytes = exportGlb(scene, p.name, { media: { image: png, mimeType: 'image/png', rect: { x0: -12000, z0: 0, width: 24000, height: 8000 } } });
    const report = await validateBytes(bytes);
    const errors = report.issues.messages.filter((m: any) => m.severity === 0);
    expect(errors, JSON.stringify(errors.slice(0, 3))).toHaveLength(0);
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + dv.getUint32(12, true))));
    expect(json.images).toHaveLength(1);
    expect(json.materials.find((m: any) => m.name === 'SC_LED_Content').emissiveTexture.index).toBe(0);
    expect(json.nodes.filter((n: any) => n.name?.startsWith('MEDIA.'))).toHaveLength(3);
  });
});
