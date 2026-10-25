# STAGECRAFT — Roadmap, status and known limitations

**Current release: STAGECRAFT v1.0.0** (2026-10-25). The rounds below are the history that got it here; [v1.0.0](#stagecraft-v100--release-round) lists what the release round added and what comes next.

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
  - Code rules applied: clear width between rows ≥ 12″ for ≤ 14 seats, +0.3″ per extra seat, max 22″ / 100 seats (IBC/IFC Ch. 10, NFPA 101 Ch. 12–13). Grid widens the row pitch automatically; Block and Radial flag rows that exceed the limit. Wheelchair spaces and companion seats per 2010 ADA 221.2.1.1 / 221.3 are placed (toggle *Place wheelchair spaces*, on for new projects): paired 33″ spaces with a companion either side, 48″ deep, in rows with open floor in front (front row, first row behind each cross aisle) or behind (last row); where those run out, single 36″ × 60″ side-entry spaces at block ends beside an aisle, part-way back. Companions are shoulder-aligned 36″ behind the space front (802.3.1) and flagged movable. Spaces are dispersed across blocks and, over 300 seats, at more than one distance (221.2.3). Chairs taken by bays are added back so chairs + spaces = the requested count. Accessible routes to the spaces are not modelled.
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
- **Screen media** (`src/core/engine/media.ts`, `src/ui/MediaButton.tsx`): one-click image upload from the toolbar (or drop an image anywhere). The image is front-projected across every LED surface with its centre pinned to the main screen's centre (the wall called *main*, else the largest wall nearest the centreline). *Span all screens* cover-fits the whole array; *Fit main screen* contains it inside the main screen and leaves the rest black. Re-fits live with every wall change, never stretches. Shows the content canvas in pixels at the main screen's pitch and warns when the image will be upscaled > 1.5×; downloads a pixel-map template PNG (every screen outlined, named, with its pixel position). Saved project files carry the image inline; GLB export puts it on the LED faces as an emissive texture. **Video**: drop or pick a video and it plays across the screens through the same mapping (shared muted `<video>` → `VideoTexture`), with play/pause, scrub and loop. Videos ≤ 24 MB ride inline in the saved project; larger ones save a poster frame and ask to be relinked on open. GLB export bakes the frame on screen at export time (or the poster). Limits: one piece of content at a time; curved walls are front-projected, not unrolled the way a media server would map them; .3dm files do not carry the image.
- **Catalogue expansion** (`src/core/catalog/index.ts`): Robe MegaPointe (spot, manufacturer leaflet), Ayrton Perseo-S (IP65 profile), Chauvet Professional Maverick Storm 1 Wash (manufacturer sheet), GLP impression X4 Bar 20 (batten, manufacturer page), ETC Source Four LED Series 3 Lustr X8 (ellipsoidal), ROE Visual Carbon CB5 MKII 600 × 1200 mm LED panel (concave 15° / convex 10°). Every value is cited with its source; where the maker publishes only typical power (GLP, ETC) it is shown as typical and not counted as a maximum; ETC publishes no overall dimensions, so that envelope is marked as an estimate. Fixtures carry a body form (moving head, batten, ellipsoidal) for their planning envelope. FOH, overhead electrics and side booms each pick their own fixture; bar fixtures are never packed closer than their length along a batten.
- **Scenic** (`src/core/engine/scenic.ts`, `60_SCENIC` sub-layers): a hard portal (two legs + header) that frames the main screen with an even margin, 400 mm downstage of it, re-sizing with the screen, in its own finish; pairs of soft black masking legs down each side of the deck, overlapping the edge to hide the wings; a full-width upstage drape behind every screen. Inspector, production readout, dimensions (portal opening), Rhino + GLB materials. Warnings when a portal leg straddles the deck edge or stands on the floor. Limits: soft goods are drawn flat (no fullness, pipes or trims); portal bracing and fixings are the scenic builder's.
- **Broadcast** (`src/core/engine/broadcast.ts`, `80_BROADCAST` layers: cameras, platforms, track, prompters, crew). Sourced gear: Sony HDC-3500 bodies, Canon UJ90x9B box lens (9–810 mm), CJ20ex7.8B and CJ15ex4.3B portable lenses, Ross Furio SE track + dolly (360 mm gauge, 871 mm lift, VR100 / VR600 payloads), Autocue conference prompter, Autoscript EPIC-IP19 on-camera prompter. Rules:
  - FOH platform (4′ × 4′ modules per camera) behind the last row on the centreline, across a cross-aisle; in *Auto* it moves into the house when the throw is longer than the box lens can hold a close-up without its 2× extender (≈ 60 m), and the seats under it are removed and reported (seat kills). Height comes from the sightline over the heads in front (seated or standing) and people walking the aisle, in 8″ steps; guards above 30″ (IBC 1015.2).
  - Side cameras at the side aisles, starting at the front rows and sliding back until they are within 45° of the presenter's eyeline; portable lens while it still reaches an MCU without the extender, else a box lens.
  - Front rail between the deck and the front row, following a rounded apron (radius checked against Furio's 3 m), parked a quarter of the way along so it stays out of Cam 1's line; lens height inside the Furio lift range; warns when the stage-to-front-row gap is too small, when the payload needs the VR600 head (on-camera prompter), and how much of the presenter the low rail angle loses behind the deck lip.
  - Presidential glass pair at 2.4 m from the presenter, at whichever angle between 30° and 50° keeps furthest from every camera's line; downstage monitors (stands, leaning back, or recessed in the deck) towards the downstage corners; FOH confidence screens hung under the front truss or beside the camera platform, with a readability check (≈ 0.35 m per inch of diagonal, from Autocue's 17″ / 6 m).
  - **Camera view**: look through any camera with the right vertical field of view for its focal length on a 2/3″ sensor (9.6 × 5.4 mm image area), a 16:9 frame with a 90% safe guide, shot presets by frame height and a log zoom across the lens + extender range.
  - **Specialty cameras**: a Jimmy Jib Triangle (12′ / 18′ / 24′ / 30′ arm kits; 50 lb payload, 25 lb at 30′) on the house floor off either downstage corner, parked 20° nose up 7 m from the presenter, with the counterweight's tail swing cleared of seats; a Steadicam (Tiffen M-2 + G-70x arm, 5.8–32 kg) on the deck house right; up to four Panasonic AW-UE160 PTZs hung under the front truss or on the deck corners (downstage low cross-shots, then upstage reverse shots), with focal lengths given 2/3″-equivalent so the camera view is lens-true. Jib fulcrum height, tail ratio and Steadicam sled sizes are planning values; the jib's remote head is not in its payload check.
  Limits: planning start points for the director and camera supplier; cabling, cable ramps, large-lens adaptors and camera sight lines through hanging scenery are not modelled; framing presets assume a 1.75 m presenter at the mark; monitor sizes are generic.
- Left panel: only Stage is open when the app starts; every other section starts collapsed.
- **Preset library: 21 presets in four categories** (Tech & Brand, Concert & Touring, EDM & Festival, Cinematic & Immersive), picked from a thumbnail gallery in the toolbar. Full list, numbers and sources in [PRESETS.md](PRESETS.md). Engine features added for them:
  - Stage: `round` centre stage (custom circular deck, diameter = width) and `cross` (centre square + four arms of hire platforms); runway B-stage can be round.
  - LED: arc mode by radius (concave or convex, rings capped at 360°), whole-wall yaw, elevation from the floor, LED floors (face up, floor-rated tile required: ROE Black Marble BM4, manufacturer-verified) and ceilings (face down). Non-planar walls get no header truss and are excluded from media mapping, scenic framing and drag targets.
  - Audience: standing GA floor (front or surround) with capacity at a planning density, barricade along the deck edge at the pit depth, and raked stands (straight or arc) with a C-value check on every row.
  - Structure (`30_04_GROUND_SUPPORT`, `30_05_GRID`, `50_05_DELAYS`): Stageco roof envelopes from published figures with PA wings and wing IMAG, a mother grid, delay towers with delay hangs, free truss members between two points.
  - Audio: four-way PA round a centre stage, out-fill hangs.
  - Show (`60_04_ELEMENTS`, `60_05_DJ_BOOTH`): DJ booth with CDJ-3000 footprints, scenic blocks, hemispherical LED dome of generic tiles with an optional opening.
  - Rhino export frees openNURBS handles after each export, so stadium-size files no longer exhaust the wasm heap.
  Limits: dome tiles, barricade, mixer, roof members and scenic blocks are generic; roofs are envelopes, not engineered structures; crowd capacity is a planning figure, not a licensed capacity; media is front-projected and only onto upright walls.

Next:
Risers / multi-level decks, stage shapes (thrust, T, rounded front), ground-stacked LED, manufacturer flying bars, ~~Claypaky~~ (two fixtures in v1.0.0) and more LED products, lighting arrangement presets, seating follow-ups (~~placed wheelchair spaces~~ done), ~~jib / Steadicam / PTZ positions~~ (done), camera view for any point in the house, ~~video for screen media~~ (done), richer warnings (sightlines, trim vs. venue height).

## Round 4 — interoperability
Done:
- **FBX 7.4** (`src/export/fbx.ts`): mm, Z-up, one shared mesh per equipment block, a named model per component, layer hierarchy as empty nodes, metadata as user properties. Verified with Assimp (extents match the model, tilted cameras included).
- **DXF R12** (`src/export/dxf.ts`) for AutoCAD / Vectorworks / BricsCAD: Rhino layer tree (`$` separator), equipment as BLOCK + INSERT, tilted parts as 3DFACEs. Verified with ezdxf (audit clean, extents match). DWG is Autodesk's closed format and cannot be written reliably in a browser, so the app exports DXF: open it in AutoCAD and save as DWG.
- **STEP AP214** (`src/export/step.ts`): exact solids (planar B-rep boxes/prisms, true cylinders), blocks as mapped items, layers and colours. Verified with OpenCASCADE (7,812 valid solids for Minimal Keynote, extents match).

Next: ~~Rhino dimensions~~ (done in v1.0.0 with a RhinoPython script rather than Compute), automated geometry validation in CI.

## STAGECRAFT v1.0.0 — release round
Done:
- **People.** The viewport draws sculpted people while every exporter keeps the light two-cylinder proxy, so the .3dm / FBX / DXF / STEP / GLB files are unchanged in size (one person block, many instances). The figures are built offline (`scripts/people/`) from the CC0 MakeHuman body, posed on its skeleton and dressed with distance-field clothing, then shipped as tiny binary meshes (≈ 400 KB for all of them).
  - Presenter: ≈ 36k triangles, smooth shaded, blazer and trousers, a presenting pose. It is the figure in every camera look-up (MCU, Full, Wide).
  - Crowd: seven low-poly variants (cheering, phone up, arms crossed, hands in pockets…, ≈ 700 triangles) with a ≈ 400-triangle far level. Each GA figure picks a variant, a small yaw and a ±4% scale from its id, all drawn as instanced meshes (two draw calls per variant). Level of detail is re-bucketed at most four times a second and only when the camera moves, and slider changes only rewrite instance matrices, so dragging stays as fast as before. Camera operators and the DJ use crowd variants.
- **Hoists on venue rigging points.** With a rated venue built (and no ground-support roof), each hoist slides along its truss to the nearest free rated point within 1 m of the truss line, a chain drops to the point, and points off the line are counted as bridles. Loads per point: truss self-weight (published section weights, or per metre from the system's published sections), fixtures on the run and the LED wall on its header, split by the lever rule; plus hoist and chain. Points turn amber when loaded and red above 80% of their rating; warnings for over-rated points, unsnapped hoists, long spans after snapping and over-capacity hoists. LED headers now get enough hoists for the wall they carry. Toggle **Hang from venue rig points** in Rigging; the Production panel shows points used, the heaviest point and its share of the rating. See [VENUES.md](VENUES.md#rigging-points-and-hoists).
- **Section-cut fill.** With the venue cutaway on, cut faces of the arena and stadium bowls (and the walls) are painted solid, so the section reads as mass instead of hollow row shells.
- **Claypaky**: Ultimo Sharpy and Xtylos Aqua, manufacturer-verified dimensions, weight and power (VA taken as W). Mythos 2 and Arolla Profile HP were left out: Claypaky publishes no full overall dimensions for them.
- **Rhino dimensions.** rhino3dm cannot write dimension objects, so Export has **Rhino dimension script (.py)**: open the .3dm in Rhino 7 or 8, run `RunPythonScript` and pick the file. Every `DIM.*` line on `90_TECHNICAL::90_01_DIMENSIONS` becomes a native aligned dimension in a `STAGECRAFT` dimstyle (plan, elevation or upright, by direction); the source lines, ticks and labels move to a hidden `SC_SOURCE` sub-layer.

Next (v1.x): bridles and sub-grids between venue points (today a hoist with no point within 1 m is reported, not solved), continuous-beam truss loads, Pier 80 venue import (on hold), more Claypaky once dimensions are published, a lighter presenter level for phones.

## Round 5 — production-quality app
Performance (5k+ cabinets), catalogue search/filter UI, venue models (e.g. Pier 80 site model import), desktop packaging (Tauri/Electron), shared libraries, Grasshopper bridge.

## Known limitations (Round 1)
- ~~Rhino dimensions are lines + text dots, not native dimension objects.~~ v1.0.0: the .3dm still carries lines + text dots (rhino3dm cannot write dimensions); the exported RhinoPython script turns them into native dimensions.
- Equipment geometry is accurate envelopes (boxes/tubes), not manufacturer CAD models.
- Most catalogue data is *secondary* (dealer/rental listings) or *generic*; see docs/RESEARCH.md §2.3.
- Deck legs are drawn 4 per platform; real systems share legs/clamps.
- Curved walls hang from a straight header truss with no pickup geometry.
- Rectangular single-level stages only.
- Seating: accessible routes to the wheelchair spaces, exits, egress width and venue walls are not modelled; the chair is a generic envelope. Every seating plan needs venue / AHJ approval.
- FBX/DXF/STEP are written from the same scene as the .3dm; DWG ships as DXF. Curved parts are faceted (16 sides) in FBX/DXF; STEP has true cylinders. None has been opened in the commercial apps from the build environment; they are verified with Assimp, ezdxf and OpenCASCADE.
- The .3dm has not been opened in desktop Rhino from the build environment; it is verified with two openNURBS readers.
