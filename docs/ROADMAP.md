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

## Round 2 — refined UX & creative systems (in progress)
Done:
- Direct manipulation: select an LED wall (or the front truss), then drag it. Walls move in their own plane (offset + elevation); Shift-drag moves up/downstage; Alt disables snapping; arrow keys nudge. Snaps to half-cabinet / 50 mm; one undo step per drag; live readout.
- Add, duplicate, rename and remove LED surfaces.
- GLB export written directly from the SceneGraph: shared meshes per equipment block, one named node per component with metadata in `extras`, layer hierarchy, metres / Y-up. Passes the Khronos glTF validator for every preset and loads at true size in three.js (tests/glb.test.ts).
- Save the current design as a custom preset (stored in this browser).

Next:
1. Transform gizmo and snapping guides drawn in the viewport.
2. Subtle dimensions in Presentation mode; clearance indicators (LED bottom vs. presenter eye line, truss vs. LED).
3. Material refinement (stage finishes, LED glass, fascia options), studio backdrop options.
4. Usability pass with a designer workflow script (Test 7).

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
- No FBX/DXF/DWG/STEP yet (GLB done in Round 2).
- The .3dm has not been opened in desktop Rhino from the build environment; it is verified with two openNURBS readers.
