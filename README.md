# STAGECRAFT

Parametric stage design configurator for technology keynotes — real equipment dimensions, a calm white spatial interface, and native, layered, editable **Rhino .3dm** export.

> Creative exploration → parametric configuration → production intelligence → professional CAD deliverable.

![Minimal Keynote](docs/screenshots/01-minimal-keynote.png)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (?preset=panoramic-keynote etc.)
npm test             # engine + Rhino export tests
npm run export:samples   # samples/*.3dm, *.bom.csv, examples/*.stagecraft.json
pip install rhino3dm && npm run verify:3dm   # independent check with McNeel's Python rhino3dm
```

Requires Node 20+ (tested on 22). No backend, no paid services; Rhino export runs in the browser via McNeel's `rhino3dm` WASM.

## Using it
1. Pick a preset in the toolbar (Minimal Keynote, Panoramic, Product Launch, Multi-Screen, Conversation).
2. Drag sliders — stage and LED move in valid modular steps. Click any value to type an exact one (`12.5`, `40'6"`, `4500mm`); if it isn't buildable you'll see the nearest valid options.
3. Orbit (drag), pan (right-drag), zoom (scroll). Views: **1** perspective · **2** front · **3** side · **4** plan · **5** iso. **T** toggles Technical mode.
4. Click an object to inspect its system; click again to inspect the single component.
5. **Export → .3dm** (Rhino 8 or 7; whole stage or selected systems), BOM CSV, or project JSON. Opening a STAGECRAFT .3dm in the app restores the parametric project.

## Coordinate system
Millimetres, Z up. Origin at floor level on the stage centreline at the downstage edge; +X house right, +Y upstage.

## Docs
- [Research](docs/RESEARCH.md) — stage design landscape, hardware catalogue, sources & verification status
- [Architecture](docs/ARCHITECTURE.md) — data model, pipeline, technology decisions, Rhino export plan, risks
- [Roadmap & limitations](docs/ROADMAP.md)

Planning tool only — rigging, structural and load decisions require review by qualified engineers.
