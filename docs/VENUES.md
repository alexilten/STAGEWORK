# Venue shells

The building the stage is set up in. Engine: `src/core/engine/venue.ts`. UI: the **Venue** section in the left panel.

## Flow

1. **Footprint.** Interior width (across the stage, X) and depth (stage wall to back of house, Y). "Swap width and depth" puts the stage on the other wall.
2. **Building type.** One of the archetypes below. Types the footprint does not fit are dimmed. Picking one anyway shows the reason, up to two types that do fit (the same kind of building first: a room for a room, a seated venue for a seated venue), and **Override and build anyway**. Without the override the venue is not built.
3. **Fit.** The stage wall sits `upstage` behind the most upstage element of the show. Clear height defaults to the type's typical value and can be overridden.

Loading a preset keeps the current venue, so you can try several shows in the same building.

## Rooms

| Type | Fits (each side) | Clear height | Structure | Rigging |
|---|---|---|---|---|
| Black box | 30–150 ft | grid 18 / 22 / 26 ft by size | none | 1½" pipe grid at 5 ft, points every 10 ft, 250 lb |
| Hotel ballroom | 60–350 ft, short side ≤ 200 ft | ceiling 18 / 24 / 30 ft by area | coffers at ~30 × 40 ft, airwalls every ~70 ft | house points at 20 ft, 1,000 lb |
| Convention hall | 150–2,000 ft | 35 ft to bottom chord | columns on a 90 ft module, trusses (depth = bay ÷ 12, 6–12 ft) | panel points every ~20 ft, 2,000 lb |
| Warehouse | 80–1,000 ft | 32 ft to joists | columns on a 50 ft module, joist girders, joists at 6 ft | none: roof assumed unrated |
| Sound stage | 60–300 ft | grid 30 ft (< 100 ft) or 38 ft | perimeter catwalks 8 ft below the grid | pipe grid at 8 ft, points every 16 ft, 500 lb |
| Clearspan tent | span 10–60 m, length 10–200 m | between eave and ridge at the rig points | aluminium portal frames every 5 m, purlins, fabric roof and walls | rafter quarter points, 500 kg |

A tent snaps up to the next standard span (10, 15, 20, 25, 30, 40, 50, 60 m) and to whole 5 m bays. Eave 3–6 m by span; ridge = eave + 0.13 × span.

## Venues with their own seating

| Type | Fits | Clear height | Structure and seating | Rigging |
|---|---|---|---|---|
| Proscenium theatre | 80–200 ft wide × 120–320 ft deep | gridiron = 2.5 × the opening height, max 90 ft | opening W ÷ 2.2 (30–60 ft) × 0.6 of that (20–35 ft); stage house at least 40 ft deep; raked orchestra up to 40 rows; 8-row balcony when the house is deeper than 80 ft; FOH catwalks | gridiron points every 10 ft, 1,000 lb; counterweight line sets at 8 in |
| Arena | 300–700 ft, short side ≤ 600 ft | 100 ft to steel | 85 × 200 ft event floor at the stage end; bowl of up to 24 + 22 rows with a concourse | trusses every ~50 ft, catwalks, points every 15 ft over the floor, 2,000 lb |
| Stadium | 600–1,300 ft | open air | 200 × 400 ft field (turf); bowl of up to 30 + 30 rows | none: bring a ground-supported roof (Structure) |
| Amphitheatre | 250–800 ft wide × 250–700 ft deep | grid 62 ft | stage house 0.3 × W (80–130 ft); fan of up to 40 reserved rows, lawn terraces, covered pavilion | grid points every 10 ft, 1,000 lb |

Bowls are open at the stage end (an end-stage setup). Rows are solid stepped massing, one prism per row, on the `venueTier` material. House seat counts are estimates at 20 in a seat; lawn at about 10 sq ft a person.

Ratings are typical published values (for example the Henry B. González and Pennsylvania convention center rigging guides). The real venue's rigging plot governs.

**Scaling rule.** Repeated elements keep a preferred module: `n = round(L / module)`, bay = `L / n`, so bays always land on the walls (300 ft → three 100 ft bays; 180 ft → two 90 ft bays).

## Checks

- `venue.fit`: footprint outside the type's range (error until overridden; `venue.fit.override` after).
- `venue.clear`: the show's overhead reaches within 600 mm of the clear height.
- `venue.column.stage`: a building column lands in a stage deck.
- `venue.column.seats`: seats removed within 450 mm of a column (added to the seating report's seat kills).
- `venue.roof.unrated`: flown truss in a warehouse.
- `venue.openair`: flown truss in a stadium without a Structure roof.
- `venue.seating.fixed`: Audience seating is on in a theatre or amphitheatre that has its own house seats.
- `venue.floor`: in an arena or stadium, the stage or audience runs off the event floor into the bowl.
- `venue.width` / `venue.depth`: the show or audience runs past the walls.

## Viewport

Venue geometry on the side the camera looks in from is cut away above the cut height (default 1.2 m), so the building reads like a section model from any angle. What is kept whole depends on the type:

- rooms and the proscenium theatre: everything inside the walls (the walls themselves, and anything within 800 mm of them, are cut), so a theatre keeps its proscenium, raked house and balcony;
- arena and stadium: the event floor; the bowl is cut like the walls, so the near end drops to a footprint and the floor shows;
- amphitheatre: the stage house; the fan and lawn stay whole;
- tent: cut along the ridge, so the half facing the camera drops away. The building does not take clicks. Turn the cut off, or change its height, in the Venue section.

Cut faces are filled: where the cut opens a wall or a bowl row, its inside is painted a flat section grey, so the bowl reads as solid mass rather than hollow row shells.

## Rigging points and hoists

With a rated venue built and no ground-support roof, flown hoists hang from the venue's rated points (Rigging → **Hang from venue rig points**, on by default):

1. Each truss run keeps its line. Its hoists slide along it, in order, to the nearest free rated point within 1 m of the line in plan and within reach of where the run wanted them (at least 1.5 m, or 60% of the hoist spacing). Two hoists never share a point or land closer than 600 mm.
2. A chain drops from the hoist to the point (`30_03_HARDWARE`). A point more than 150 mm off the truss line is counted as a bridle (`rig.bridle`).
3. A hoist with no point in reach stays where it was and is reported (`rig.unsnapped`): it needs a bridle between two points, a beam clamp or a sub-grid.
4. Loads: truss self-weight (published section weights; sections without one take the per-metre weight of the system's published sections), fixtures within 600 mm of the run, and an LED wall on its header truss, split onto the hoists by the lever rule (each span simply supported, ends as cantilevers). Point load = hoist reaction + hoist and chain.
5. Points carrying a hoist turn amber; points above 80% of their rating turn red. `rig.point.over` (error) and `rig.point.near` (warning) report them; `rig.span` flags a span that grew past the truss's limit after snapping; `rig.hoist.over` flags a hoist over its working load. Hoisted points carry `loadKg`, `hoist` and `utilisation` as user text in the .3dm.

A continuous truss loads its inner hoists more than the simply supported estimate, which is why points above 80% are flagged too. This is a first look for planning; the venue's rigging plot and a qualified rigger decide.

## Export

Everything is on system `venue`, under `05_VENUE`:

```
05_VENUE
  05_01_SHELL        floor slab, walls, doors, soffits, airwalls, proscenium,
                     seating bowls, raked house, balcony, fan, lawn, tent fabric
  05_02_STRUCTURE    columns, roof trusses / joist girders, joists, tent frames,
                     pavilion columns and roof
  05_03_RIGGING      pipe grids, gridiron, line sets, fly gallery, catwalks,
                     rated rigging points
  05_04_FIXTURES     chandeliers
  05_05_SERVICES     utility floor pits
  05_06_GRID_LINES   column grid lines 1, 2, 3 … / A, B, C … (from the stage wall)
```

Columns, truss panels, tent frames, line sets, rigging points, pits and chandeliers are blocks. Rigging points carry `ratingKg`, `ratingLb` and `steel` as user text. Exports always carry the full, uncut building. The export menu has **Include the venue** (on by default when a venue is built); unticking it leaves the venue out of every format.
