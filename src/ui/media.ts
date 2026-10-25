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

/** videos up to this size ride inline in the saved project; larger ones save a poster and are relinked */
export const INLINE_VIDEO_BYTES = 24 * 1024 * 1024;

export interface ImportedVideo extends ImportedImage { duration: number; poster: string; bytes: number; inline: boolean }

const readDataUrl = (f: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string); r.onerror = () => rej(r.error ?? new Error('Could not read the file'));
  r.readAsDataURL(f);
});

/** load a video's size and length, and grab a poster frame a moment in (first frames are often black) */
export async function importVideo(file: File): Promise<ImportedVideo> {
  if (!file.type.startsWith('video/')) throw new Error(`${file.name} is not a video`);
  const inline = file.size <= INLINE_VIDEO_BYTES;
  const data = inline ? await readDataUrl(file) : URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = data;
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error(`this browser cannot play ${file.name} (try H.264 MP4 or WebM)`));
  });
  if (!v.videoWidth) throw new Error(`${file.name} has no picture`);
  const duration = Number.isFinite(v.duration) ? v.duration : 0;
  v.currentTime = Math.min(0.5, duration / 2);
  await new Promise<void>((res) => { v.onseeked = () => res(); setTimeout(res, 3000); });
  const poster = frameDataUrl(v, 640, 0.8);
  const width = v.videoWidth, height = v.videoHeight;
  v.removeAttribute('src'); v.load();
  return {
    id: `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, data, width, height,
    name: file.name.replace(/\.[^.]+$/, ''), duration, poster, bytes: file.size, inline,
  };
}

/** the frame a video element is showing, as a JPEG data URL no longer than `side` px */
export function frameDataUrl(v: HTMLVideoElement, side = 4096, q = 0.9): string {
  const k = Math.min(1, side / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/**
 * One playing <video> per source, shared by the viewport and the media menu so play,
 * pause and scrub stay in step everywhere. Muted: the screens are picture only.
 */
const players = new Map<string, HTMLVideoElement>();
export function videoPlayer(src: string, loop = true): HTMLVideoElement {
  let v = players.get(src);
  if (!v) {
    for (const [k, old] of players) { old.pause(); old.removeAttribute('src'); old.load(); players.delete(k); if (k.startsWith('blob:')) URL.revokeObjectURL(k); }
    v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.autoplay = true;
    v.src = src;
    players.set(src, v);
    v.play().catch(() => { /* autoplay refused: the menu's play button starts it */ });
  }
  v.loop = loop;
  return v;
}

/** the still a screen shows in exports: the video's current frame once it has one, else its poster */
export function mediaStill(media: MediaParams, data: string): string {
  if (media.kind !== 'video') return data;
  const v = players.get(data);
  return v && v.readyState >= 2 && v.videoWidth ? frameDataUrl(v) : media.poster ?? '';
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
  const still = mediaStill(media, data);
  if (!still) return undefined;
  const img = new Image(); img.src = still; await img.decode();
  g.drawImage(img, (r.cx - r.width / 2 - x0) * k, (z1 - (r.cz + r.height / 2)) * k, r.width * k, r.height * k);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the screen image'))), 'image/jpeg', 0.9));
  return { image: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg', rect: { x0, z0, width: x1 - x0, height: z1 - z0 } };
}
