/**
 * Write every preset to examples/<preset>.stagecraft.json, and the original five keynote presets to
 * samples/<preset>.3dm (+ GLB, BOM .csv) with a reopened summary. The big concert / festival / immersive
 * shows are 5–13 MB each as .3dm, so they are left out of the repo: export them from the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import rhino3dm from 'rhino3dm';
import { resolveScene } from '../src/core/engine/scene';
import { PRESETS } from '../src/core/presets';
import { serializeProject } from '../src/core/schema';
import { exportRhino } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';
import { bomCsv } from '../src/export/bom';
import { exportGlb } from '../src/export/glb';

const out = path.resolve('samples');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync('examples', { recursive: true });
const SAMPLES = new Set(['minimal-keynote', 'panoramic-keynote', 'product-launch', 'multi-screen', 'conversation']);
for (const preset of PRESETS) {
  const project = preset.build();
  fs.writeFileSync(path.join('examples', `${preset.id}.stagecraft.json`), serializeProject(project));
  if (!SAMPLES.has(preset.id)) continue;
  const rh = await rhino3dm(); // fresh openNURBS heap per file
  const scene = resolveScene(project);
  const bytes = exportRhino(rh, scene, project);
  fs.writeFileSync(path.join(out, `${preset.id}.3dm`), bytes);
  fs.writeFileSync(path.join(out, `${preset.id}.bom.csv`), bomCsv(scene));
  fs.writeFileSync(path.join(out, `${preset.id}.glb`), exportGlb(scene, project.name, { finish: project.stage.finish }));
  const info = inspect3dm(rh, bytes);
  const perLayer: Record<string, number> = {};
  for (const o of info.objects) perLayer[o.layer] = (perLayer[o.layer] ?? 0) + 1;
  console.log(`\n${preset.name} → samples/${preset.id}.3dm (${(bytes.length / 1024).toFixed(0)} KB, ${info.units}, v${info.archiveVersion})`);
  console.log(`  ${info.objects.length} objects · ${info.blocks.length} blocks · ${info.layers.length} layers · ${info.materials.length} materials`);
  for (const [l, n] of Object.entries(perLayer)) console.log(`    ${l.padEnd(34)} ${n}`);
}
