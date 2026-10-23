# STAGECRAFT — Roadmap, status and known limitations

## Round 1 — functional proof of concept ✅ (checkpoint)

Implemented and tested:
- Three-panel white spatial UI: floating glass configurator, layers/inspector/production panel, toolbar, camera bar.
- Live R3F viewport: instanced geometry, soft studio lighting, AO, contact shadows, animated LED content shader; Presentation and Technical (outlines, cabinet grid, floor grid, dimensions) modes.
- Camera presets: perspective, front, side, plan, iso (1–5 keys); orbit/pan/zoom.
- Stage width/depth/height with modular snapping (8′×4′ or 2×1 m systems, legs, fascia, finishes).
- LED walls: product selection, width/height in whole cabinets, aspect chips, elevation, offsets, concave curvature within product limits; multiple walls per project.
- Rigging: header truss per wall + front-of-house truss from real section lengths, hoists. Lighting: N fixtures on the FOH truss.
- Inspector: group → component drill-down, catalogue data with verification badge and sources.
- Production summary, BOM CSV, conflict/constraint checks.
- Save/open project JSON; open a STAGECRAFT .3dm to regenerate; undo/redo; m/ft units.
- Native Rhino .3dm export (Rhino 8 or 7), entire stage or selected systems.
- All five presets (Round 2 item pulled forward because they are pure parameter sets).

Tests (`npm test`, 24 passing): LED modularity, stage geometry, modular constraints, persistence, Rhino export structure, scene/export consistency for all presets, unit parsing. Plus `npm run verify:3dm` (independent Python reader).

## Round 2 — refined UX & creative systems (next)
1. Direct manipulation: drag LED walls / stage in the viewport with snapping guides; transform gizmo.
2. Add / remove / duplicate LED surfaces in the UI; per-wall header toggle.
3. GLB export from the SceneGraph.
4. Real-time dimension annotations in Presentation mode (subtle), clearance indicators.
5. Preset customisation & save as preset; project thumbnails.
6. Material refinement (stage finishes, LED glass, fascia options), studio backdrop options.
7. Usability pass with a designer workflow script (Test 7).

## Round 3 — technical production systems
Risers / multi-level decks, stage shapes (thrust, T, rounded front), ground-stacked LED, manufacturer flying bars, expanded LED/lighting catalogue (Robe, Ayrton, Claypaky, ETC, Chauvet), lighting positions & arrangement presets, audio (line arrays, fills), scenic panels/portals, richer warnings (sightlines, trim vs. venue height).

## Round 4 — interoperability
Rhino dimensions via Compute (decision needed), FBX (local converter), DXF, DWG (ODA), STEP (opencascade.js), export dialog, automated geometry validation.

## Round 5 — production-quality app
Performance (5k+ cabinets), catalogue search/filter UI, venue models (e.g. Pier 80 site model import), desktop packaging (Tauri/Electron), shared libraries, Grasshopper bridge.

## Known limitations (Round 1)
- Rhino dimensions are lines + text dots, not native dimension objects.
- Equipment geometry is accurate envelopes (boxes/tubes), not manufacturer CAD models.
- Most catalogue data is *secondary* (dealer/rental listings) or *generic*; see docs/RESEARCH.md §2.3.
- Deck legs are drawn 4 per platform; real systems share legs/clamps.
- Curved walls hang from a straight header truss with no pickup geometry.
- Rectangular single-level stages only.
- No GLB/FBX/DXF/STEP yet.
- The .3dm has not been opened in desktop Rhino from the build environment; it is verified with two openNURBS readers.
