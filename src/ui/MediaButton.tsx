import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveMediaCanvas } from '../core/engine/media';
import { download } from '../export/browser';
import { Segmented } from './controls';
import { Icon } from './icons';
import { importImage, pixelMapPng } from './media';
import { useStore } from './store';

/** Put one image on every screen: click → pick a file. Drop an image anywhere works too. */
export function MediaButton({ onToast }: { onToast: (m: string) => void }) {
  const media = useStore((s) => s.project.media);
  const data = useStore((s) => (media ? s.assets[media.assetId] : undefined));
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
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      applyImage(f, onToast);
    };
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [onToast]);

  return (
    <div className="media-wrap" ref={wrapRef}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) applyImage(f, onToast); e.target.value = ''; setOpen(false); }} />
      <button className={`media-btn ${data ? 'has' : ''}`} title={data ? 'Screen media' : 'Put an image on the screens (or drop one anywhere)'}
        onClick={() => (data ? setOpen(!open) : fileRef.current?.click())}>
        {data ? <img src={data} alt="" /> : <Icon.image />}
        <span>{data ? 'Media' : 'Add media'}</span>
      </button>
      {open && media && data && <MediaMenu onReplace={() => fileRef.current?.click()} onClose={() => setOpen(false)} onToast={onToast} />}
    </div>
  );
}

async function applyImage(f: File, onToast: (m: string) => void) {
  try {
    const img = await importImage(f);
    const st = useStore.getState();
    st.addAsset(img.id, img.data);
    st.edit((p) => { p.media = { assetId: img.id, name: img.name, width: img.width, height: img.height, fit: p.media?.fit ?? 'span' }; });
    onToast(`${img.name} is on the screens`);
  } catch (e) { onToast(`Could not use that image: ${(e as Error).message}`); }
}

function MediaMenu({ onReplace, onClose, onToast }: { onReplace: () => void; onClose: () => void; onToast: (m: string) => void }) {
  const media = useStore((s) => s.project.media)!;
  const data = useStore((s) => s.assets[media.assetId]);
  const led = useStore((s) => s.scene.report.led);
  const edit = useStore((s) => s.edit);
  const aspect = media.width / media.height;
  const canvas = useMemo(() => resolveMediaCanvas(led, aspect, media.fit), [led, aspect, media.fit]);
  const template = useMemo(() => resolveMediaCanvas(led, aspect, 'span'), [led, aspect]);
  // how much the image is enlarged to fill the screens at their native resolution
  const up = canvas ? Math.max(canvas.rect.width / canvas.pitch[0] / media.width, canvas.rect.height / canvas.pitch[1] / media.height) : 1;

  return (
    <div className="menu media-menu glass">
      <div className="menu-title">Screen media</div>
      <div className="media-thumb"><img src={data} alt="" /></div>
      <div className="media-name">{media.name}<span>{media.width.toLocaleString()} × {media.height.toLocaleString()} px</span></div>
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
      <button className="menu-item" onClick={onReplace}>Replace image… <span>or drop</span></button>
      {template && <button className="menu-item" onClick={async () => {
        try { download(`pixel-map_${template.pixels.width}x${template.pixels.height}.png`, await pixelMapPng(template), 'image/png'); onToast('Pixel map template downloaded'); }
        catch (e) { onToast((e as Error).message); }
      }}>Pixel map template <span>.png</span></button>}
      <button className="menu-item preset-del" onClick={() => { edit((p) => { p.media = null; }); onClose(); }}>Remove media</button>
    </div>
  );
}
