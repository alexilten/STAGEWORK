import { resolveMediaCanvas, type MediaCanvas } from '../core/engine/media';
import type { LedLayout } from '../core/engine/led';
import type { MediaParams } from '../core/schema';
import type { GlbMedia } from '../export/glb';

/** longest side kept for screen content — plenty for a preview, small enough to save inline */
const MAX_SIDE = 4096;

export interface ImportedImage { id: string; data: string; width: number; height: number; name: string }

export async function importImage(file: File): Promise<ImportedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  // logos keep their transparency; photos go to JPEG to keep saved projects small
  const alpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
  const data = c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9);
  bmp.close();
  // the source size is what matters for "is this sharp enough", not the preview copy
  return { id: `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, data, width: Math.round(w / k), height: Math.round(h / k), name: file.name.replace(/\.[^.]+$/, '') };
}

/**
 * A pixel-map template for content creators: the full content canvas at the main screen's
 * pixel pitch, with every screen outlined and named and the centre marked.
 */
export function pixelMapPng(m: MediaCanvas): Promise<Blob> {
  const k = Math.min(1, 16384 / Math.max(m.pixels.width, m.pixels.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(m.pixels.width * k)); c.height = Math.max(1, Math.round(m.pixels.height * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, c.width, c.height);
  const font = Math.max(14, Math.round(c.height / 40));
  m.walls.forEach((w, i) => {
    const x = w.x * k, y = w.y * k, ww = w.w * k, hh = w.h * k;
    const hue = w.main ? 212 : (40 + i * 67) % 360;
    g.fillStyle = `hsl(${hue} 55% 22%)`; g.fillRect(x, y, ww, hh);
    // 10 % grid so creators can see the scale
    g.strokeStyle = `hsl(${hue} 60% 34%)`; g.lineWidth = 1;
    for (let t = 1; t < 10; t++) {
      g.beginPath(); g.moveTo(x + (ww * t) / 10, y); g.lineTo(x + (ww * t) / 10, y + hh); g.stroke();
      g.beginPath(); g.moveTo(x, y + (hh * t) / 10); g.lineTo(x + ww, y + (hh * t) / 10); g.stroke();
    }
    g.strokeStyle = `hsl(${hue} 80% 62%)`; g.lineWidth = Math.max(2, font / 8); g.strokeRect(x, y, ww, hh);
    g.fillStyle = '#ffffff'; g.font = `600 ${font}px -apple-system, Helvetica, Arial, sans-serif`;
    g.fillText(`${w.name}${w.main ? ' (main)' : ''}`, x + font * 0.6, y + font * 1.4);
    g.font = `400 ${Math.round(font * 0.8)}px ui-monospace, Menlo, monospace`;
    g.fillText(`${w.w} × ${w.h} px  @ ${w.x}, ${w.y}`, x + font * 0.6, y + font * 2.5);
  });
  // centre of the main screen = centre of the content
  const cx = c.width / 2, cy = c.height / 2, r = font * 1.5;
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, font / 10);
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  g.beginPath(); g.arc(cx, cy, r * 0.6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `500 ${Math.round(font * 0.8)}px -apple-system, Helvetica, Arial, sans-serif`;
  g.fillText(`Content canvas ${m.pixels.width} × ${m.pixels.height} px · centre = main screen centre`, font * 0.6, c.height - font * 0.8);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not render the pixel map'))), 'image/png'));
}

/**
 * The screen image prepared for GLB: padded with black so it covers every wall's face,
 * with the rect it occupies in world X / Z. Same mapping as the viewport.
 */
export async function glbMedia(led: LedLayout[], media: MediaParams, data: string): Promise<GlbMedia | undefined> {
  const m = resolveMediaCanvas(led, media.width / media.height, media.fit);
  if (!m) return undefined;
  const r = m.rect;
  let x0 = r.cx - r.width / 2, x1 = r.cx + r.width / 2, z0 = r.cz - r.height / 2, z1 = r.cz + r.height / 2;
  for (const L of led) {
    x0 = Math.min(x0, L.origin[0] - L.chord / 2); x1 = Math.max(x1, L.origin[0] + L.chord / 2);
    z0 = Math.min(z0, L.origin[2]); z1 = Math.max(z1, L.top);
  }
  const k = 4096 / Math.max(x1 - x0, z1 - z0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((x1 - x0) * k)); c.height = Math.max(1, Math.round((z1 - z0) * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const img = new Image(); img.src = data; await img.decode();
  g.drawImage(img, (r.cx - r.width / 2 - x0) * k, (z1 - (r.cz + r.height / 2)) * k, r.width * k, r.height * k);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the screen image'))), 'image/jpeg', 0.9));
  return { image: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg', rect: { x0, z0, width: x1 - x0, height: z1 - z0 } };
}
