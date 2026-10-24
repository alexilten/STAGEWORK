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

## Round 2 — refined UX & creative systems (done)
- Direct manipulation: select an LED wall (or the front truss), then drag it. Walls move in their own plane (offset + elevation); Shift-drag moves up/downstage; Alt disables snapping; arrow keys nudge. Snaps to half-cabinet / 50 mm; one undo step per drag; live readout.
- Transform gizmo: axis handles on the selected LED wall (x / upstage / height), front truss (distance / trim) and seating (distance). Each handle constrains the drag to its axis; same snapping and undo as free drag.
- Add, duplicate, rename and remove LED surfaces.
- **Audience seating** (`src/core/engine/seating.ts`): Block, Grid (continental) and Radial layouts, 250–5000 seats in steps of 250, its own layer (`70_AUDIENCE::70_01_SEATING`) and every seat a named chair-block instance with row / seat user text in Rhino.
  - Code rules applied: clear width between rows ≥ 12″ for ≤ 14 seats, +0.3″ per extra seat, max 22″ / 100 seats (IBC/IFC Ch. 10, NFPA 101 Ch. 12–13). Grid widens the row pitch automatically; Block and Radial flag rows that exceed the limit. Wheelchair spaces and companion seats per 2010 ADA 221.2.1.1 / 221.3 are reported (not placed).
  - Planning defaults (labelled as such, not code): 36″ row pitch, 22″ seat pitch, 42″ aisles, a cross aisle every 20 rows, 10′ from the deck to the front row, generic 460 × 540 mm stacking chair.
  - Radial rows are concentric about the middle of the deck in a 90° fan; aisles are re-divided at each cross aisle so blocks stay ≤ the per-block seat limit; curved rows always keep at least an aisle width from the deck.
  - Sightline note when the front row looks up more than ~35° to the top of the main wall.
  - "House" camera view (6) frames stage and audience.
- Presentation mode shows subtle dimensions and clearances for the current selection only (LED width/height/elevation and clearance to header truss; truss trim and distance; stage size; seating front distance, depth and width). Technical mode still shows everything.
- Material polish: shadow-catcher floor (replaces ContactShadows, which accumulated stale shadows because postprocessing disables autoClear — moved or hidden items left ghosts), chair finishes, glass HUD.
- GLB export written directly from the SceneGraph: shared meshes per equipment block, one named node per component with metadata in `extras`, layer hierarchy, metres / Y-up. Passes the Khronos glTF validator for every preset and loads at true size in three.js (tests/glb.test.ts).
- Save the current design as a custom preset (stored in this browser).

Not done: a scripted usability pass (Test 7) still needs a human designer.

## Round 3 — technical production systems (in progress)
Done:
- Stage shapes (`stage.shape`): Straight, Thrust, Runway (+ optional B-stage), Rounded. Thrust, runway and B-stage are built from the same hire platforms (runway platforms run lengthwise); every area tiles with whole platforms only. The rounded front is a custom-built curved apron (exported as a closed extruded solid, `prism` part) and is labelled as carpentry, not hire stock.
- Fascia follows the outline: every exposed edge gets fascia, never across an opening between areas.
- Risers on the deck: add / rename / remove, width, depth, height above deck (leg increments), position snapped to deck seams, drag or arrow-handle move, legs standing on the deck, `10_02_RISERS` layer. Errors when a riser hangs off the deck or overlaps another. The presenter figure stands on whatever level is under it.
- Seating follows the shape: rows start in front of the apron, seats keep the front distance from any deck edge they face and an aisle width beside a thrust or runway.
- Presets: Panoramic → rounded apron, Product Launch → runway + B-stage, Multi-Screen → thrust, Conversation → chat riser.
- **Audio** (`src/core/engine/audio.ts`, `50_AUDIO` layers): flown main L/R line-array hangs with a nominal progressive J-rake (object `tilt` added to the model + all three exporters), subwoofers (ground-stacked or flown), downstage front-fills and stage-monitor wedges. Real d&b J8 / J-SUB data (manufacturer-verified) plus a generic fill and wedge. Panel, inspector, production readout, BOM, drag + gizmo on each hang (spread + trim). Labelled: splay, coverage and rigging loads are the audio vendor's.
- The app is published at https://alexilten.github.io/STAGEWORK/ on every push to main.

- **Lighting positions** (`src/core/engine/lighting.ts`, `40_03_POSITIONS`): overhead electrics (horizontal battens over the stage, each with a fixture count) and vertical side booms whose fixtures aim inboard (using the new object tilt + yaw). Panel, inspector, production readout and exporters.
- **Screen media** (`src/core/engine/media.ts`, `src/ui/MediaButton.tsx`): one-click image upload from the toolbar (or drop an image anywhere). The image is front-projected across every LED surface with its centre pinned to the main screen's centre (the wall called *main*, else the largest wall nearest the centreline). *Span all screens* cover-fits the whole array; *Fit main screen* contains it inside the main screen and leaves the rest black. Re-fits live with every wall change, never stretches. Shows the content canvas in pixels at the main screen's pitch and warns when the image will be upscaled > 1.5×; downloads a pixel-map template PNG (every screen outlined, named, with its pixel position). Saved project files carry the image inline; GLB export puts it on the LED faces as an emissive texture. Limits: one still image (no video); curved walls are front-projected, not unrolled the way a media server would map them; .3dm files do not carry the image.
- **Catalogue expansion** (`src/core/catalog/index.ts`): Robe MegaPointe (spot, manufacturer leaflet), Ayrton Perseo-S (IP65 profile), Chauvet Professional Maverick Storm 1 Wash (manufacturer sheet), GLP impression X4 Bar 20 (batten, manufacturer page), ETC Source Four LED Series 3 Lustr X8 (ellipsoidal), ROE Visual Carbon CB5 MKII 600 × 1200 mm LED panel (concave 15° / convex 10°). Every value is cited with its source; where the maker publishes only typical power (GLP, ETC) it is shown as typical and not counted as a maximum; ETC publishes no overall dimensions, so that envelope is marked as an estimate. Fixtures carry a body form (moving head, batten, ellipsoidal) for their planning envelope. FOH, overhead electrics and side booms each pick their own fixture; bar fixtures are never packed closer than their length along a batten.

Next:
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
- Seating: wheelchair locations, exits, egress width and venue walls are not modelled; the chair is a generic envelope. Every seating plan needs venue / AHJ approval.
- No FBX/DXF/DWG/STEP yet (GLB done in Round 2).
- The .3dm has not been opened in desktop Rhino from the build environment; it is verified with two openNURBS readers.
