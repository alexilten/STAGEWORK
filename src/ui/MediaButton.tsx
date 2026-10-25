import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { resolveMediaCanvas } from '../core/engine/media';
import { download } from '../export/browser';
import { Segmented } from './controls';
import { Icon } from './icons';
import { importImage, importVideo, INLINE_VIDEO_BYTES, pixelMapPng, videoPlayer } from './media';
import { useStore } from './store';

/** Put one image or video on every screen: click → pick a file. Dropping one anywhere works too. */
export function MediaButton({ onToast }: { onToast: (m: string) => void }) {
  const media = useStore((s) => s.project.media);
  const data = useStore((s) => (media ? s.assets[media.assetId] : undefined));
  // a video saved without its file still has content on the screens (its poster) until it is relinked
  const thumb = media?.kind === 'video' ? media.poster : data;
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  // drop an image anywhere on the page
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); };
    const drop = (e: DragEvent) => {
      document.body.classList.remove('dropping');
      const f = [...(e.dataTransfer?.files ?? [])].find(isMedia);
      if (!f) return;
      e.preventDefault();
      applyMedia(f, onToast);
    };
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [onToast]);

  return (
    <div className="media-wrap" ref={wrapRef}>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) applyMedia(f, onToast); e.target.value = ''; setOpen(false); }} />
      <button className={`media-btn ${thumb ? 'has' : ''}`} title={thumb ? 'Screen media' : 'Put an image or video on the screens (or drop one anywhere)'}
        onClick={() => (thumb ? setOpen(!open) : fileRef.current?.click())}>
        {thumb ? <img src={thumb} alt="" /> : <Icon.image />}
        <span>{thumb ? 'Media' : 'Add media'}</span>
      </button>
      {open && media && thumb && <MediaMenu onReplace={() => fileRef.current?.click()} onClose={() => setOpen(false)} onToast={onToast} />}
    </div>
  );
}

const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');

async function applyMedia(f: File, onToast: (m: string) => void) {
  const video = f.type.startsWith('video/');
  try {
    const st = useStore.getState();
    if (video) {
      const v = await importVideo(f);
      st.addAsset(v.id, v.data);
      st.edit((p) => {
        p.media = { assetId: v.id, name: v.name, width: v.width, height: v.height, fit: p.media?.fit ?? 'span', kind: 'video', duration: v.duration, loop: p.media?.loop ?? true, poster: v.poster, bytes: v.bytes };
      });
      onToast(v.inline ? `${v.name} is playing on the screens` : `${v.name} is playing — over ${INLINE_VIDEO_BYTES >> 20} MB, so saved projects keep its poster and ask to relink it`);
    } else {
      const img = await importImage(f);
      st.addAsset(img.id, img.data);
      st.edit((p) => { p.media = { assetId: img.id, name: img.name, width: img.width, height: img.height, fit: p.media?.fit ?? 'span' }; });
      onToast(`${img.name} is on the screens`);
    }
  } catch (e) { onToast(`Could not use that ${video ? 'video' : 'image'}: ${(e as Error).message}`); }
}

/** play state of the shared screen video, re-rendered on its media events */
function useVideo(src: string | undefined) {
  const v = src ? videoPlayer(src) : null;
  const subscribe = (cb: () => void) => {
    if (!v) return () => {};
    const ev = ['play', 'pause', 'timeupdate', 'seeked', 'ended'];
    ev.forEach((e) => v.addEventListener(e, cb));
    return () => ev.forEach((e) => v.removeEventListener(e, cb));
  };
  const t = useSyncExternalStore(subscribe, () => (v ? `${v.paused ? 0 : 1}:${v.currentTime.toFixed(1)}` : ''));
  return { v, playing: t.startsWith('1'), time: v?.currentTime ?? 0 };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function MediaMenu({ onReplace, onClose, onToast }: { onReplace: () => void; onClose: () => void; onToast: (m: string) => void }) {
  const media = useStore((s) => s.project.media)!;
  const data = useStore((s) => s.assets[media.assetId]) as string | undefined;
  const led = useStore((s) => s.scene.report.led);
  const isVideo = media.kind === 'video';
  const { v, playing, time } = useVideo(isVideo ? data : undefined);
  const dur = media.duration ?? 0;
  const edit = useStore((s) => s.edit);
  const aspect = media.width / media.height;
  const canvas = useMemo(() => resolveMediaCanvas(led, aspect, media.fit), [led, aspect, media.fit]);
  const template = useMemo(() => resolveMediaCanvas(led, aspect, 'span'), [led, aspect]);
  // how much the image is enlarged to fill the screens at their native resolution
  const up = canvas ? Math.max(canvas.rect.width / canvas.pitch[0] / media.width, canvas.rect.height / canvas.pitch[1] / media.height) : 1;

  return (
    <div className="menu media-menu glass">
      <div className="menu-title">Screen media</div>
      <div className="media-thumb"><img src={isVideo ? media.poster : data} alt="" /></div>
      <div className="media-name">{media.name}<span>{media.width.toLocaleString()} × {media.height.toLocaleString()} px{isVideo && ` · ${clock(dur)}`}</span></div>
      {isVideo && (v ? (
        <div className="media-transport">
          <button className="icon-btn" title={playing ? 'Pause' : 'Play'} onClick={() => (playing ? v.pause() : v.play().catch(() => onToast('The browser would not start the video')))}>
            {playing ? <Icon.pause /> : <Icon.play />}
          </button>
          <input type="range" min={0} max={dur || 1} step={0.04} value={Math.min(time, dur || 1)} aria-label="Scrub"
            onChange={(e) => { v.currentTime = +e.target.value; }} />
          <span className="media-time">{clock(time)}</span>
          <label className="media-loop" title="Loop at the end"><input type="checkbox" checked={media.loop ?? true} onChange={(e) => edit((p) => { p.media!.loop = e.target.checked; })} /> Loop</label>
        </div>
      ) : (
        <div className="media-facts"><div className="warn"><span>Video file</span>Not in this project — showing its poster</div></div>
      ))}
      <div className="menu-row">
        <Segmented size="sm" value={media.fit} onChange={(v) => edit((p) => { p.media!.fit = v; })}
          options={[{ value: 'span', label: 'Span all screens', title: 'Cover every screen, centred on the main screen' }, { value: 'main', label: 'Fit main screen', title: 'Whole image inside the main screen, e.g. a logo' }]} />
      </div>
      {canvas && (
        <div className="media-facts">
          <div><span>Content canvas</span>{canvas.pixels.width.toLocaleString()} × {canvas.pixels.height.toLocaleString()} px</div>
          <div className={up > 1.5 ? 'warn' : ''}><span>Image scale</span>{up > 1.05 ? `${up.toFixed(1)}× upscaled${up > 1.5 ? ' — may look soft' : ''}` : 'Sharp at native resolution'}</div>
        </div>
      )}
      <div className="menu-sep" />
      {isVideo && !v && <button className="menu-item" onClick={onReplace}>Relink video… <span>{media.name}</span></button>}
      <button className="menu-item" onClick={onReplace}>Replace image or video… <span>or drop</span></button>
      {template && <button className="menu-item" onClick={async () => {
        try { download(`pixel-map_${template.pixels.width}x${template.pixels.height}.png`, await pixelMapPng(template), 'image/png'); onToast('Pixel map template downloaded'); }
        catch (e) { onToast((e as Error).message); }
      }}>Pixel map template <span>.png</span></button>}
      <button className="menu-item preset-del" onClick={() => { edit((p) => { p.media = null; }); onClose(); }}>Remove media</button>
    </div>
  );
}
