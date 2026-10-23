# STAGECRAFT — Architecture

## 1. Principle: one authoritative parametric model

```
Project (JSON, design intent)          ← UI edits, presets, save/open, embedded in every .3dm
        │  resolveScene()  — pure, deterministic, unit-tested
        ▼
SceneGraph (physically resolved)       ← mm, Z-up world, blocks + instances + annotations + report + warnings
   ├── Viewport (React Three Fiber)    ← instanced rendering of the same blocks/parts
   ├── Production report / inspector
   ├── Rhino .3dm exporter (rhino3dm)  ← same blocks become Rhino block definitions
   └── BOM CSV  (later: GLB, FBX, DXF, STEP)
```

Nothing downstream of `resolveScene()` holds its own geometry. The viewport and the Rhino file are two renderings of the same `SceneGraph`, which is what Test 6 checks.

**Design intent vs. resolved geometry.** The project stores what the designer *asked for* (e.g. LED width 10.24 m). The engine stores what can be *built* (20 columns = 10.00 m) together with the nearest alternatives and a warning. The UI shows both and lets the designer pick an alternative.

## 2. Coordinate system & units

- **Canonical unit: millimetre**, everywhere (project file, engine, Rhino). Metric/imperial is display-only (`core/units.ts`).
- **Right-handed, Z up.** Origin = floor level, on the stage centreline, at the downstage (audience) edge of the deck.
- **+X** = house right (audience's right), **+Y** = upstage, **+Z** = up.
- The viewport wraps the model in a single transform (rotate −90° about X, scale 0.001) to map onto three.js' Y-up metres. No other conversions exist.

## 3. Source layout

```
src/core/units.ts            unit conversion, parsing (12.5 · 40'6" · 4500mm), formatting
src/core/schema.ts           Project schema (versioned) + coordinate-system contract
src/core/catalog/            equipment library: types + entries with sources & verification
src/core/presets.ts          five starting presets
src/core/engine/
   modular.ts                module snapping, alternatives, truss section picking
   deck.ts                   platform layout, legs, fascia
   led.ts                    cabinet grid, curved column layout, flying bars
   rigging.ts                truss runs, hoists, fixture geometry
   scene.ts                  resolveScene(): orchestration, conflicts, annotations, report
src/export/rhino.ts          SceneGraph → .3dm (layers, blocks, materials, user text)
src/export/inspect3dm.ts     re-open a .3dm and summarise it (used by tests)
src/export/bom.ts            bill of materials
src/export/browser.ts        lazy WASM load + downloads
src/viewport/                R3F scene, instanced batches, LED shader, camera rig
src/ui/                      store (zustand, undo/redo), panels, toolbar, controls
tests/                       engine + export tests (vitest)
scripts/                     sample export, independent Python verification
```

## 4. Technology decisions

| Area | Decision | Why / alternatives considered |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Fast local dev, no infrastructure. |
| 3D | three.js via React Three Fiber + drei; postprocessing N8AO for ambient occlusion | Instanced rendering keeps 1,000+ cabinets interactive; drei gives CameraControls, ContactShadows, procedural Lightformer environment (no HDR downloads). |
| State | zustand, project as immutable snapshots; undo/redo stack with edit coalescing | Small, predictable; snapshots make undo and persistence trivial. |
| Geometry | Our own primitive set (box, tube) inside block definitions | Stage hardware is overwhelmingly boxes and tubes; keeping primitives explicit makes Rhino output clean extrusions instead of meshes. Richer B-rep geometry can be added per catalogue item later. |
| **Rhino export** | **rhino3dm (McNeel's openNURBS WASM) in the browser** | No server, no licence, works offline. Produces native layers, block definitions/instances, closed Extrusions, materials, user text. Verified with both the JS build and the separate Python build. |
| Not chosen (yet) | Rhino Compute / RhinoCommon | Requires a Rhino licence + Windows server; only needed for true Rhino dimensions, booleans, Grasshopper solving. Revisit in Round 4/5. |
| Persistence | `*.stagecraft.json` (versioned schema) + the same JSON embedded in each .3dm (document user text) | A .3dm exported by STAGECRAFT can be re-opened in STAGECRAFT and regenerated. |

**No paid dependencies, no backend.** Everything is MIT/Apache-licensed and runs locally.

## 5. Rhino export — feasibility result

Milestone required by the brief: *generate a stage + LED wall, export a real .3dm, reopen it programmatically and verify*. Done in Round 1:

- `tests/rhino.test.ts` exports every preset and re-reads the bytes with openNURBS (rhino3dm.js) — units, the full layer tree, block definitions, instance counts, unique names, insertion points vs. the live scene, LED and deck bounding boxes, embedded project.
- `scripts/verify_3dm.py` re-reads the files with **McNeel's Python rhino3dm** (separate native build) and checks units, layers, dangling references, closed solids, duplicate names and the embedded project.
- A file exported **from the running web app** (headless Chromium) passes the Python check.

What the .3dm contains:
- Model units mm, absolute tolerance 0.01 mm; Rhino 8 format (Rhino 7 on request).
- Layer tree exactly as specified (00_REFERENCE … 90_TECHNICAL::90_03_REFERENCE) with layer colours.
- One block per equipment type (`SC_LED_ROE_Visual_Black_Pearl_BP2_V2`, `SC_DECK_8ftx4ft`, `SC_TRUSS_Prolyte_H30V_2000`, `SC_LEG_764`, …); each component is a named instance (`LED.MAIN.C03R07`, `DECK.R02C04`, `TRUSS.FOH.S03`).
- Per-object user text: `stagecraft.id`, `.system`, `.group`, `.catalogId`, `.manufacturer`, `.model`, `.verification`, plus row/column, length, weight etc.
- Dimensions as lines + text dots on `90_01_DIMENSIONS`, centreline and stage-front reference lines.

**Limitations (honest):**
- rhino3dm cannot author native Rhino dimension objects; dimensions are lines + text dots. (Rhino Compute or a small RhinoCommon plug-in would fix this.)
- Geometry is boxes/tubes — accurate envelopes, not manufacturer CAD. Catalogue items can later carry real geometry.
- Not yet opened in desktop Rhino from this environment (no Rhino available here) — **manual check requested**.
- rhino3dm ≥ 8.35 is required; 8.17 corrupted memory when adding many named block parts (found and fixed during Round 1).

## 6. Other formats (plan)

| Format | Route | Status |
|---|---|---|
| GLB/GLTF | three.js `GLTFExporter` from a scene built from the SceneGraph (not from the live viewport) | Round 2 |
| FBX (Maya) | No reliable browser writer. Options: Autodesk FBX SDK (C++/Python) in a small local service, or Blender/Maya batch convert from GLB with Y-up/cm handling | Round 4 — needs a decision on running a local converter |
| DXF | Direct writer is straightforward for lines/polylines and 3DFACE; plan/elevation drawings rather than solids | Round 4 |
| DWG | Proprietary — via ODA File Converter (free, registration) or Rhino Compute | Round 4 — external dependency to flag |
| STEP | Needs a B-rep kernel: OpenCascade (opencascade.js WASM, LGPL) or Rhino Compute | Round 4 — evaluate opencascade.js size/licence |

## 7. Major risks

1. **Equipment data quality** — specs vary by source; mitigated by per-item verification status and source links, and by keeping weights blank rather than guessed.
2. **Rhino-native dimensions & advanced geometry** need Rhino Compute (licensed, server) — a deliberate later decision.
3. **FBX/DWG/STEP** require external tools or kernels (see §6).
4. **Rigging safety** — the app plans geometry only; every rigging view carries an engineering-review notice.
5. **Performance at arena scale** (5,000+ cabinets) — instancing is in place; per-instance picking and shadows will need tuning.
