import { ft } from './units';
import { PROJECT_SCHEMA, PROJECT_VERSION, type LedWallParams, type Project } from './schema';

export interface Preset {
  id: string;
  name: string;
  summary: string;
  build: () => Project;
}

const wall = (o: Partial<LedWallParams> & Pick<LedWallParams, 'id' | 'name' | 'width' | 'height'>): LedWallParams => ({
  cabinetId: 'roe.bp2v2', elevation: 600, offsetX: 0, upstageGap: 300, curveDeg: 0, ...o,
});

function base(name: string, presetId: string): Project {
  return {
    schema: PROJECT_SCHEMA, version: PROJECT_VERSION, name, presetId, units: 'metric',
    stage: { width: ft(40), depth: ft(16), height: ft(3), deckSystemId: 'generic.deck-8x4', finish: 'white', fascia: true },
    ledWalls: [],
    rigging: {
      trussId: 'prolyte.h30v',
      header: { enabled: true, clearance: 600, overhang: 500, maxHoistSpacing: 6000 },
      front: { enabled: true, distance: 6000, trim: 8500, width: 14000 },
    },
    lighting: { enabled: true, fixtureId: 'martin.mac-aura-xb', count: 10 },
    presenter: { visible: true },
  };
}

export const PRESETS: Preset[] = [
  {
    id: 'minimal-keynote', name: 'Minimal Keynote',
    summary: 'Restrained 40′ deck with one large near-16:9 media wall. The default keynote canvas.',
    build: () => ({ ...base('Minimal Keynote', 'minimal-keynote'), ledWalls: [wall({ id: 'main', name: 'Main wall', width: 12500, height: 7000 })] }),
  },
  {
    id: 'panoramic-keynote', name: 'Panoramic Keynote',
    summary: 'Wide cinematic canvas (~4:1) with a gentle concave curve over a 56′ deck.',
    build: () => {
      const p = base('Panoramic Keynote', 'panoramic-keynote');
      p.stage.width = ft(56);
      p.rigging.front.width = 20000;
      p.lighting.count = 14;
      p.ledWalls = [wall({ id: 'main', name: 'Panoramic wall', width: 24000, height: 6000, elevation: 900, upstageGap: 1200, curveDeg: 1 })];
      return p;
    },
  },
  {
    id: 'product-launch', name: 'Product Launch',
    summary: 'Hero wall flanked by two portrait reveal screens; deeper deck for product reveals.',
    build: () => {
      const p = base('Product Launch', 'product-launch');
      p.stage.width = ft(56); p.stage.depth = ft(20);
      p.rigging.front.width = 20000;
      p.lighting.count = 12;
      p.ledWalls = [
        wall({ id: 'main', name: 'Hero wall', width: 10000, height: 5500, elevation: 900 }),
        wall({ id: 'left', name: 'Reveal left', width: 2500, height: 5500, elevation: 900, offsetX: -6750, upstageGap: -1500 }),
        wall({ id: 'right', name: 'Reveal right', width: 2500, height: 5500, elevation: 900, offsetX: 6750, upstageGap: -1500 }),
      ];
      return p;
    },
  },
  {
    id: 'multi-screen', name: 'Multi-Screen',
    summary: 'Three equal media surfaces in a modular rhythm, for multi-presenter or data-rich content.',
    build: () => {
      const p = base('Multi-Screen', 'multi-screen');
      p.stage.width = ft(48);
      p.rigging.front.width = 18000;
      p.rigging.header.overhang = 250;
      p.ledWalls = [-1, 0, 1].map((k) => wall({ id: ['l', 'c', 'r'][k + 1], name: ['Left', 'Centre', 'Right'][k + 1] + ' screen', width: 5000, height: 3000, elevation: 1500, offsetX: k * 5750 }));
      return p;
    },
  },
  {
    id: 'conversation', name: 'Conversation Stage',
    summary: 'Low, intimate 32′ deck at 24″ for fireside chats, with a calm backdrop wall.',
    build: () => {
      const p = base('Conversation Stage', 'conversation');
      p.stage.width = ft(32); p.stage.height = ft(2);
      p.rigging.front = { enabled: true, distance: 5000, trim: 7000, width: 11000 };
      p.lighting.count = 8;
      p.ledWalls = [wall({ id: 'main', name: 'Backdrop wall', width: 9000, height: 4500, elevation: 1000 })];
      return p;
    },
  },
];

export const DEFAULT_PRESET = PRESETS[0];
export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
