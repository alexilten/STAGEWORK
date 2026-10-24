import { ft } from '../units';
import type { CatalogItem, Chair, DeckSystem, Fixture, Hoist, LedCabinet, Speaker, TrussSystem } from './types';
export * from './types';

const ACCESSED = '2026-10-23';
const ACCESS2 = '2026-10-24';

/* ───────────────────────────── LED cabinets ───────────────────────────── */

export const LED_CABINETS: LedCabinet[] = [
  {
    id: 'roe.bp2v2',
    category: 'led-cabinet',
    manufacturer: 'ROE Visual',
    model: 'Black Pearl BP2 V2',
    verification: 'secondary',
    width: 500, height: 500, depth: 90,
    pixelPitch: 2.84, pixelsW: 176, pixelsH: 176,
    weightKg: 9.35, powerMaxW: 160, powerAvgW: 80,
    curveConcaveMaxDeg: 10, curveConvexMaxDeg: null,
    sources: [
      { label: '4Wall Entertainment rental listing — ROE BP2 Version 2', url: 'https://www.4wall.com/rentals/9759063/roe-bp2-version-2', accessed: ACCESSED },
      { label: 'ROE Visual BP2 V2 spec sheet (PDF, not reachable during research)', url: 'https://www.roevisual.com/uploads/Images/Products/Black Pearl 2 V2/bp-v2-specs.pdf', note: 'verify against this' },
    ],
    notes: ['Convex curve capability not documented in source; modelled as concave-only.'],
  },
  {
    id: 'absen.pl3.9-v10',
    category: 'led-cabinet',
    manufacturer: 'Absen',
    model: 'PL3.9 V10',
    verification: 'secondary',
    width: 500, height: 500, depth: 88,
    pixelPitch: 3.9, pixelsW: 128, pixelsH: 128,
    weightKg: 7.7, powerMaxW: 135, powerAvgW: 45,
    curveConcaveMaxDeg: null, curveConvexMaxDeg: null,
    sources: [
      { label: 'Full Compass product listing — Absen PL3.9 V10', url: 'https://www.fullcompass.com/prod/623261-absen-pl3-9-v10-pl-series-3-9mm-pixel-pitch-video-wall-panel', accessed: ACCESSED },
    ],
    notes: [
      'Power listed as 540 / 180 W/m² (max/avg); per-cabinet values derived ×0.25 m².',
      'Listing has conflicting weight and brightness figures; 7.7 kg is the spec-table value.',
      'Curving not documented in source; flat only until verified.',
    ],
  },
  {
    id: 'infiled.ar10',
    category: 'led-cabinet',
    manufacturer: 'INFiLED',
    model: 'AR10 (500 × 1000)',
    verification: 'secondary',
    width: 500, height: 1000, depth: 108,
    pixelPitch: 10.41, pixelsW: 48, pixelsH: 96,
    weightKg: 12.4, powerMaxW: null, powerAvgW: null,
    curveConcaveMaxDeg: null, curveConvexMaxDeg: null,
    sources: [
      { label: 'Lang Iberia rental listing — INFiLED AR10 500×1000', url: 'https://lang-iberia.com/product/infiled-ar10-indoor-outdoor-led-cabinet-500x1000mm/', accessed: ACCESSED, note: 'units not stated on page; mm / kg assumed' },
    ],
    notes: ['Coarse-pitch indoor/outdoor product — included to exercise a 500 × 1000 mm cabinet geometry (IMAG / side screens).'],
  },
  {
    id: 'generic.led-500-2.6',
    category: 'led-cabinet',
    manufacturer: 'Generic',
    model: '500 × 500 mm · 2.6 mm',
    verification: 'generic',
    width: 500, height: 500, depth: 85,
    pixelPitch: 2.6, pixelsW: 192, pixelsH: 192,
    weightKg: null, powerMaxW: null, powerAvgW: null,
    curveConcaveMaxDeg: 7.5, curveConvexMaxDeg: 7.5,
    sources: [{ label: 'Generic planning cabinet — typical of 2.6 mm touring products' }],
  },
  {
    id: 'roe.cb5-mkii',
    category: 'led-cabinet',
    manufacturer: 'ROE Visual',
    model: 'Carbon CB5 MKII (600 × 1200)',
    verification: 'secondary',
    width: 600, height: 1200, depth: 79,
    pixelPitch: 5.77, pixelsW: 104, pixelsH: 208,
    weightKg: 12.2, powerMaxW: 480, powerAvgW: 240,
    curveConcaveMaxDeg: 15, curveConvexMaxDeg: 10,
    sources: [
      { label: '4Wall Entertainment rental listing — ROE CB5 MKII', url: 'https://europe.4wall.com/rentals/9759078/5-77mm-roe-cb5-mkii', accessed: ACCESS2,
        note: '600 × 1200 × 79 mm, 5.77 mm, 104 × 208 px, 12.2 kg, 480 W max / 240 W typical, concave 15° to convex 10°' },
    ],
    notes: ['Large-format rental panel for IMAG side screens and big backdrops.'],
  },
  {
    id: 'generic.led-600x337.5-1.5',
    category: 'led-cabinet',
    manufacturer: 'Generic',
    model: '600 × 337.5 mm · 1.56 mm (16:9)',
    verification: 'generic',
    width: 600, height: 337.5, depth: 60,
    pixelPitch: 1.5625, pixelsW: 384, pixelsH: 216,
    weightKg: null, powerMaxW: null, powerAvgW: null,
    curveConcaveMaxDeg: null, curveConvexMaxDeg: null,
    sources: [{ label: 'Generic fine-pitch 16:9 cabinet format' }],
  },
];

/* ───────────────────────────── Staging ───────────────────────────── */

export const DECK_SYSTEMS: DeckSystem[] = [
  {
    id: 'generic.deck-8x4',
    category: 'deck',
    manufacturer: 'Generic',
    model: 'Steel-frame platform 8′ × 4′',
    label: '8′ × 4′',
    verification: 'generic',
    long: ft(8), short: ft(4),
    infill: { long: ft(4), short: ft(4), label: '4′ × 4′' },
    topThickness: 18, frameDepth: 150,
    legDiameter: 48.3, legInset: 75,
    minHeight: ft(0, 12), maxHeight: ft(6), heightStep: ft(0, 6),
    weightKg: null, infillWeightKg: null, loadRatingKNm2: null,
    sources: [
      { label: 'Encore EMEA hire listing — Steeldeck 8ft × 4ft (reference)', url: 'https://hire.encore-emea.com/product/steeldeck-8ft-x-4ft-2-44m-x-1-22m-46/', accessed: ACCESSED,
        note: 'Steeldeck 8×4: 18 mm birch ply top, 7.5 kN/m² UDL, 69–85.5 kg (listing conflicts), 2″ steel tube legs' },
    ],
    notes: [
      'Generic platform informed by Steeldeck-type rostra. Weight and load rating intentionally left unset — they differ between manufacturers.',
      'Frame depth 150 mm is a planning estimate.',
    ],
  },
  {
    id: 'generic.deck-2x1',
    category: 'deck',
    manufacturer: 'Generic',
    model: 'Aluminium platform 2 m × 1 m',
    label: '2 m × 1 m',
    verification: 'generic',
    long: 2000, short: 1000,
    infill: { long: 1000, short: 1000, label: '1 m × 1 m' },
    topThickness: 18, frameDepth: 150,
    legDiameter: 60, legInset: 60,
    minHeight: 300, maxHeight: 2000, heightStep: 100,
    weightKg: null, infillWeightKg: null, loadRatingKNm2: null,
    sources: [
      { label: 'Encore EMEA hire listing — Revostage 2m × 1m (format reference)', url: 'https://hire.encore-emea.com/?p=301999', accessed: ACCESSED },
    ],
    notes: ['Metric 2 × 1 m format common to European aluminium staging systems.'],
  },
];

/* ───────────────────────────── Truss ───────────────────────────── */

export const TRUSS_SYSTEMS: TrussSystem[] = [
  {
    id: 'prolyte.h30v',
    category: 'truss',
    manufacturer: 'Prolyte',
    model: 'H30V (box, 4-chord)',
    profile: 'box',
    verification: 'secondary',
    width: 290, height: 290,
    chordDiameter: 48.3, chordWall: 3, braceDiameter: 16,
    sections: [
      { length: 3000, weightKg: null, verified: false },
      { length: 2500, weightKg: null, verified: true },
      { length: 2000, weightKg: 14.49, verified: true },
      { length: 1500, weightKg: null, verified: true },
      { length: 1000, weightKg: null, verified: false },
      { length: 710, weightKg: null, verified: true },
      { length: 500, weightKg: null, verified: true },
      { length: 250, weightKg: null, verified: true },
    ],
    connection: 'CCS6 conical coupler',
    sources: [
      { label: 'Huss Licht & Ton product sheet — Prolyte H30V 2.0 m', url: 'https://www.huss-licht-ton.de/print_product_info.php/products_id/22155', accessed: ACCESSED,
        note: '290 × 290 mm, chords 48.3 × 3 mm, diagonals 16 × 2 mm, 14.49 kg, CCS6' },
    ],
    notes: ['0.25 / 0.5 / 0.71 / 1.5 / 2.0 / 2.5 m lengths seen in dealer listings; 1.0 and 3.0 m assumed from the standard range — verify.'],
  },
];

/* ───────────────────────────── Lighting & hoists ───────────────────────────── */

export const FIXTURES: Fixture[] = [
  {
    id: 'martin.mac-aura-xb',
    category: 'fixture',
    manufacturer: 'Martin Professional',
    model: 'MAC Aura XB',
    fixtureType: 'wash',
    verification: 'secondary',
    length: 302, width: 302, height: 360,
    weightKg: 6.5, powerMaxW: 400,
    mounting: 'Rigging clamp via M12 hole; any orientation',
    sources: [
      { label: 'Full Compass product listing — Martin MAC Aura XB', url: 'https://www.fullcompass.com/prod/276614-martin-pro-mac-aura-xb-mac-aura-xb-compact-led-wash-light-fixture', accessed: ACCESSED },
    ],
  },
  {
    id: 'robe.megapointe',
    category: 'fixture',
    manufacturer: 'Robe',
    model: 'MegaPointe',
    fixtureType: 'spot',
    verification: 'manufacturer',
    length: 230, width: 396, height: 640,
    weightKg: 22, powerMaxW: 670,
    mounting: 'Omega brackets with quarter-turn clamps; any orientation',
    sources: [
      { label: 'Robe — MegaPointe leaflet (PDF)', url: 'https://www.robe.cz/res/downloads/catalogues/ROBE_MegaPointe_leaflet.pdf', accessed: ACCESS2,
        note: 'H 640 mm (head vertical) × W 396 mm × D 230 mm, 22 kg, 670 W at 230 V' },
    ],
    notes: ['Robe lists 670 W at 230 V without calling it a maximum; used as the planning max.'],
  },
  {
    id: 'ayrton.perseo-s',
    category: 'fixture',
    manufacturer: 'Ayrton',
    model: 'Perseo-S (IP65 profile)',
    fixtureType: 'profile',
    verification: 'secondary',
    length: 330, width: 490, height: 710,
    weightKg: 38.8, powerMaxW: 800,
    mounting: 'Omega brackets; IP65 for outdoor use',
    sources: [
      { label: 'Full Compass product listing — Ayrton Perseo-S', url: 'https://fullcompass.com/prod/625947-ayrton-perseo-s-500w-ip65-led-profile-7-to-56-degree', accessed: ACCESS2,
        note: '490 × 710 × 330 mm (l × h × d), 38.8 kg, 800 W max' },
    ],
  },
  {
    id: 'chauvet.maverick-storm-1-wash',
    category: 'fixture',
    manufacturer: 'Chauvet Professional',
    model: 'Maverick Storm 1 Wash',
    fixtureType: 'wash',
    verification: 'manufacturer',
    length: 319, width: 414, height: 477,
    weightKg: 27, powerMaxW: 477,
    mounting: 'Omega brackets; IP65 for outdoor use',
    sources: [
      { label: 'Chauvet Professional — Maverick Storm 1 Wash spec sheet (PDF)', url: 'https://chauvetprofessional.com/wp-content/uploads/pdf/en/MAVERICKSTORM1WASH.pdf', accessed: ACCESS2,
        note: '319 × 414 × 477 mm, 27 kg, 477 W at 120 V' },
    ],
    notes: ['The sheet gives 319 × 414 × 477 mm without axis labels; read as length × width × height.', '477 W is the highest listed draw (120 V); used as the planning max.'],
  },
  {
    id: 'glp.impression-x4-bar-20',
    category: 'fixture',
    manufacturer: 'GLP',
    model: 'impression X4 Bar 20',
    fixtureType: 'wash',
    form: 'batten',
    verification: 'manufacturer',
    length: 100, width: 1000, height: 240,
    weightKg: 16, powerMaxW: null, powerTypW: 400,
    mounting: 'Two omega brackets; tilting batten',
    sources: [
      { label: 'GLP — impression X4 Bar 20 product page', url: 'https://www.glp.de/en/products/moving-lights-led/impression-x4-bar-20', accessed: ACCESS2,
        note: '1000 mm long (across yoke) × 100 mm wide × 240 mm high, 16 kg net, typical power 400 W at 230 V' },
    ],
    notes: ['GLP publishes typical power only (400 W); no maximum is shown, so power totals leave this fixture out.'],
  },
  {
    id: 'etc.s4-led-s3-lustr',
    category: 'fixture',
    manufacturer: 'ETC',
    model: 'Source Four LED Series 3 Lustr X8',
    fixtureType: 'profile',
    form: 'ellipsoidal',
    verification: 'secondary',
    length: 600, width: 300, height: 450,
    weightKg: 8.87, powerMaxW: null, powerTypW: 305,
    mounting: 'C-clamp on yoke',
    sources: [
      { label: 'Full Compass product listing — ETC Source Four LED Series 3 Lustr X8', url: 'https://www.fullcompass.com/prod/599947-etc-source-four-led-series-3-s4-led-series-3-light-engine-only-lustr-x8-black', accessed: ACCESS2,
        note: '8.87 kg with barrel (6.76 kg without); typical 307 W at 120 V / 305 W at 230 V' },
      { label: 'ETC S4LEDS3LS spec sheet (via dealer)', url: 'https://goknight.com/content/documentation/S4LEDS3LS Spec Sheet.pdf', accessed: ACCESS2, note: 'lens-tube lengths only, e.g. 26°–50° XDLT 190 mm' },
    ],
    notes: ['ETC lists weight and typical power but no overall dimensions; the 600 × 300 × 450 mm envelope (with a 26° lens tube) is a planning estimate.'],
  },
];

export const HOISTS: Hoist[] = [
  {
    id: 'generic.hoist-1t',
    category: 'hoist',
    manufacturer: 'Generic',
    model: '1 t electric chain hoist',
    verification: 'generic',
    capacityKg: 1000,
    bodyW: 260, bodyD: 300, bodyH: 450,
    weightKg: null,
    sources: [{ label: 'Generic planning envelope' }],
  },
];

export const CHAIRS: Chair[] = [
  {
    id: 'generic.chair-stack',
    category: 'chair',
    manufacturer: 'Generic',
    model: 'Stacking event chair',
    verification: 'generic',
    width: 460, depth: 540, height: 830, seatHeight: 450,
    weightKg: null,
    sources: [{ label: 'Representative envelope of common stacking / banquet chairs (≈18″ W × 21″ D × 33″ H); not a manufacturer SKU' }],
    notes: ['Swap for the rental house chair before production — row spacing and clear width depend on the real chair depth.'],
  },
];


/* ───────────────────────────── Audio ───────────────────────────── */

export const SPEAKERS: Speaker[] = [
  {
    id: 'dbaudio.j8',
    category: 'speaker',
    manufacturer: 'd&b audiotechnik',
    model: 'J8 (line array)',
    speakerType: 'line-array',
    verification: 'manufacturer',
    width: 1100, depth: 570, height: 360,
    weightKg: 60,
    dispersionH: 80,
    splayRange: [0, 7],
    sources: [
      { label: 'd&b audiotechnik — J8 product page', url: 'https://www.dbaudio.com/global/en/products/series/j-series/j8/', accessed: ACCESSED,
        note: '360 (H) × 1100 (W) × 570 (D) mm, 60 kg, 80° horizontal, 0–7° inter-cabinet splay in 1° steps' },
    ],
  },
  {
    id: 'dbaudio.j-sub',
    category: 'speaker',
    manufacturer: 'd&b audiotechnik',
    model: 'J-SUB (cardioid sub)',
    speakerType: 'sub',
    verification: 'manufacturer',
    width: 1100, depth: 1062, height: 540,
    weightKg: 106,
    sources: [
      { label: 'd&b audiotechnik — J-SUB architectural spec', url: 'https://www.dbaudio.com/assets/products/downloads/architectural-specifications/dbaudio-arch-specs-j-sub-en.txt', accessed: ACCESSED,
        note: 'max 540 (H) × 1100 (W) × 1062 (D) mm, 106 kg' },
    ],
  },
  {
    id: 'generic.fill',
    category: 'speaker',
    manufacturer: 'Generic',
    model: 'Front-fill point source',
    speakerType: 'point',
    verification: 'generic',
    width: 300, depth: 360, height: 500,
    weightKg: 15,
    dispersionH: 90,
    sources: [{ label: 'Representative compact 10"/12" point-source envelope; not a manufacturer SKU' }],
    notes: ['Swap for the specified fill box before production.'],
  },
  {
    id: 'generic.wedge',
    category: 'speaker',
    manufacturer: 'Generic',
    model: 'Stage monitor wedge',
    speakerType: 'monitor',
    verification: 'generic',
    width: 600, depth: 500, height: 400,
    weightKg: 18,
    sources: [{ label: 'Representative 12"/15" floor wedge envelope; not a manufacturer SKU' }],
  },
];

export const CATALOG: CatalogItem[] = [...LED_CABINETS, ...DECK_SYSTEMS, ...TRUSS_SYSTEMS, ...FIXTURES, ...HOISTS, ...CHAIRS, ...SPEAKERS];

export function getCatalogItem<T extends CatalogItem>(id: string, category: T['category']): T {
  const item = CATALOG.find((c) => c.id === id && c.category === category);
  if (!item) throw new Error(`Unknown ${category} '${id}'`);
  return item as T;
}
