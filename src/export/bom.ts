import { CATALOG } from '../core/catalog';
import type { SceneGraph } from '../core/engine/scene';

export interface BomLine {
  system: string; layer: string; manufacturer: string; model: string; item: string;
  qty: number; unitWeightKg: number | null; totalWeightKg: number | null; verification: string; catalogId: string;
}

/** Bill of materials straight from the resolved scene — one line per (catalogue item, block / item kind). */
export function buildBom(scene: SceneGraph): BomLine[] {
  const cat = new Map(CATALOG.map((c) => [c.id, c]));
  const lines = new Map<string, BomLine>();
  for (const o of scene.objects) {
    if (o.system === 'reference' || o.meta.bomSkip) continue;
    const catalogId = typeof o.meta.catalogId === 'string' ? o.meta.catalogId : '';
    const c = cat.get(catalogId);
    const str = (k: string) => (typeof o.meta[k] === 'string' ? (o.meta[k] as string) : undefined);
    // items outside the main catalogue (broadcast gear) carry their own BOM line in meta
    const item = str('bom');
    const key = item ? `bom|${item}` : `${o.block ?? o.label}|${catalogId}`;
    const unit = typeof o.meta.weightKg === 'number' ? o.meta.weightKg
      : c && 'weightKg' in c && o.layer === '20_LED::20_01_CABINETS' ? c.weightKg : null;
    const line = lines.get(key) ?? {
      system: o.system, layer: o.layer, manufacturer: c?.manufacturer ?? str('manufacturer') ?? 'Generic', model: c?.model ?? str('model') ?? '—',
      item: item ?? o.label, qty: 0, unitWeightKg: unit ?? null, totalWeightKg: null, verification: c?.verification ?? str('verification') ?? 'generic', catalogId,
    };
    line.qty++;
    lines.set(key, line);
  }
  for (const l of lines.values()) l.totalWeightKg = l.unitWeightKg == null ? null : +(l.unitWeightKg * l.qty).toFixed(2);
  return [...lines.values()];
}

export function bomCsv(scene: SceneGraph): string {
  const head = ['System', 'Rhino layer', 'Manufacturer', 'Model', 'Item', 'Qty', 'Unit weight (kg)', 'Total weight (kg)', 'Verification', 'Catalogue id'];
  const rows = buildBom(scene).map((l) => [l.system, l.layer, l.manufacturer, l.model, l.item, l.qty, l.unitWeightKg ?? '', l.totalWeightKg ?? '', l.verification, l.catalogId]);
  const esc = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}
