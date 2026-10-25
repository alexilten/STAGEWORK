# Venue shells

The building the stage is set up in. Engine: `src/core/engine/venue.ts`. UI: the **Venue** section in the left panel.

## Flow

1. **Footprint.** Interior width (across the stage, X) and depth (stage wall to back of house, Y). "Swap width and depth" puts the stage on the other wall.
2. **Building type.** One of the archetypes below. Types the footprint does not fit are dimmed. Picking one anyway shows the reason, up to two types that do fit, and **Override and build anyway**. Without the override the venue is not built.
3. **Fit.** The stage wall sits `upstage` behind the most upstage element of the show. Clear height defaults to the type's typical value and can be overridden.

Loading a preset keeps the current venue, so you can try several shows in the same building.

## Archetypes (round 1)

| Type | Fits (each side) | Clear height | Structure | Rigging |
|---|---|---|---|---|
| Black box | 30–150 ft | grid 18 / 22 / 26 ft by size | none | 1½" pipe grid at 5 ft, points every 10 ft, 250 lb |
| Hotel ballroom | 60–350 ft, short side ≤ 200 ft | ceiling 18 / 24 / 30 ft by area | coffers at ~30 × 40 ft, airwalls every ~70 ft | house points at 20 ft, 1,000 lb |
| Convention hall | 150–2,000 ft | 35 ft to bottom chord | columns on a 90 ft module, trusses (depth = bay ÷ 12, 6–12 ft) | panel points every ~20 ft, 2,000 lb |
| Warehouse | 80–1,000 ft | 32 ft to joists | columns on a 50 ft module, joist girders, joists at 6 ft | none: roof assumed unrated |
| Sound stage | 60–300 ft | grid 30 ft (< 100 ft) or 38 ft | perimeter catwalks 8 ft below the grid | pipe grid at 8 ft, points every 16 ft, 500 lb |

Ratings are typical published values (for example the Henry B. González and Pennsylvania convention center rigging guides). The real venue's rigging plot governs.

**Scaling rule.** Repeated elements keep a preferred module: `n = round(L / module)`, bay = `L / n`, so bays always land on the walls (300 ft → three 100 ft bays; 180 ft → two 90 ft bays).

## Checks

- `venue.fit`: footprint outside the type's range (error until overridden; `venue.fit.override` after).
- `venue.clear`: the show's overhead reaches within 600 mm of the clear height.
- `venue.column.stage`: a building column lands in a stage deck.
- `venue.column.seats`: seats removed within 450 mm of a column (added to the seating report's seat kills).
- `venue.roof.unrated`: flown truss in a warehouse.
- `venue.width` / `venue.depth`: the show or audience runs past the walls.

## Viewport

Walls (and anything within 800 mm of them) on the side the camera looks in from are cut away above the cut height (default 1.2 m), so the room reads like a section model from any angle. The building does not take clicks. Turn the cut off, or change its height, in the Venue section.

## Export

Everything is on system `venue`, under `05_VENUE`:

```
05_VENUE
  05_01_SHELL        floor slab, walls, doors, soffits, airwalls
  05_02_STRUCTURE    columns, roof trusses / joist girders, joists
  05_03_RIGGING      pipe grids, catwalks, rated rigging points
  05_04_FIXTURES     chandeliers
  05_05_SERVICES     utility floor pits
  05_06_GRID_LINES   column grid lines 1, 2, 3 … / A, B, C … (from the stage wall)
```

Columns, truss panels, rigging points, pits and chandeliers are blocks. Rigging points carry `ratingKg`, `ratingLb` and `steel` as user text. Exports always carry the full, uncut building. The export menu has **Include the venue** (on by default when a venue is built); unticking it leaves the venue out of every format.
