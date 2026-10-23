# STAGECRAFT — Research (Round 0)

Two questions drove the research: *what do contemporary technology keynote stages actually look like spatially*, and *what real hardware dimensions must the parametric engine respect*. Everything below separates **confirmed facts** (with a source) from **visual estimates / design patterns** (our reading of broadcast footage and photography, not published data).

Research was carried out on 2026‑10‑23 using public web sources. Manufacturer PDFs were not always reachable from the research environment; where specs came from dealers or rental houses they are marked **secondary** in the catalogue.

---

## 1. Contemporary technology-keynote stage design

### 1.1 Confirmed facts (published)

| Event | Fact | Source |
|---|---|---|
| Microsoft Ignite 2025 (Chase Center, SF) | ~2,700 ROE panels across 20 layered walls: 8 × V4ST (684 panels), 8 × CB3 (900), 3 curved Topaz TP‑C2.6 (714), 1 Graphite GP2.6 sidewall (420); ~130 M pixels; 42 Brompton SX40 processors; LED hung ~80 ft high | [ROE Visual news](https://www.roevisual.com/news-and-events/news/meyerpro-delivers-a-massive-layered-led-production-for-microsoft-ignite-with-roe-visual) |
| NVIDIA GTC 2024 (SAP Center, San José) | Upstage LED wall of >53 M pixels plus the arena's ribbon LED; PIXERA media servers | [AV Stumpfl](https://avstumpfl.com/en/showcase/pixera-powers-keynote-visuals-for-nvidia-gtc/), [invidis](https://invidis.com/sixteen-nine/2024/03/20/generative-art-by-refik-anadol-on-huge-video-wall-opens-nvidias-big-gtc-event/) |
| SAP Sapphire 2026 (OCCC, Orlando) | ROE Black Pearl for keynotes, Black Marble floor LED; >1,000 ft² LED; 4K fibre backbone (LMG) | [LMG case study](https://lmg.net/case-studies/executing-seamless-visuals-at-sap-sapphire-2026) |
| SAPPHIRE NOW (earlier edition, Orlando) | ~300 Black Marble BM4 floor panels + three curved Carbon CB5 walls | [ROE Visual](https://roevisual.com/en/what-we-do/lmg-chooses-roe-visual-led-displays-for-sap-conference) |
| Samsung Unpacked 2019 (Barclays Center) | 19.2 × 19.2 m LED backdrop; two 43.2 × 25.6 m arches; 54.4 M pixels total | [BizBash](https://www.bizbash.com/event-fabrication/8-experiential-highlights-from-samsung-s-10th-unpacked-event) |
| Meta Connect 2025 | Held at the Meta campus, Menlo Park; Done+Dusted handled creative consulting, set build and scenic | [Done+Dusted](https://www.doneanddusted.com/work/meta-connect-2025) |
| Google I/O 2023 (Shoreline Amphitheatre) | Sets in Google's warm primary-colour palette; large display for live product showcases | [Done+Dusted](https://www.doneanddusted.com/work/google-io23) |

**Observation:** producers publish pixel counts and product names, almost never stage or screen *dimensions*. Real dimensions for a specific show need production drawings from the vendor — STAGECRAFT should therefore make dimensioning fast rather than rely on reference geometry.

### 1.2 Design patterns (visual estimates — not published data)

Derived from broadcast footage and press photography of WWDC/Apple events, Google I/O, Meta Connect, OpenAI DevDay, NVIDIA GTC, Figma Config, SAP Sapphire, Samsung Unpacked, Microsoft Build/Ignite and Stripe Sessions. Treat every number here as an estimate.

| Pattern | Seen at (examples) | Spatial signature (estimate) |
|---|---|---|
| **Monolith** — one dominant 16:9-ish wall, low clean deck, little visible hardware | Apple (Steve Jobs Theater), Figma Config, Stripe Sessions, OpenAI DevDay | Wall ≈ 1.0–1.3 × deck width; LED bottom 0–1 m above deck; deck 0.6–1.0 m; rigging hidden or blacked out |
| **Panoramic canvas** — very wide (3:1–5:1) LED, often gently curved | NVIDIA GTC, Microsoft Ignite/Build, Samsung Unpacked | Wall wider than the deck; 6–9 m tall; concave curve; presenter dwarfed — scale relies on IMAG |
| **Hero + reveal** — central wall plus portrait side screens or reveal portals | Product launches (Google, Samsung, Meta) | Side screens 1/4–1/3 of hero width, often downstage of it |
| **Modular multi-screen** — rhythm of equal screens, data-rich | Cloud / enterprise keynotes (SAP, Google Cloud Next) | 3–5 equal walls, equal gaps, consistent bottom trim |
| **Conversation set** — low deck, soft backdrop, furniture | Fireside chats at most of the above | Deck 0.4–0.6 m; wall elevated above seated eye line (≈ 1 m) |

Cross-cutting observations:
1. **Proportion beats ornament.** The strongest stages are one or two big gestures: a precise wall-to-deck ratio, a single clean deck edge, black or white fascia, no visible legs.
2. **Media-to-stage relationship is the key design variable**: LED bottom height above the deck, LED width vs deck width, and upstage gap. These became first-class parameters.
3. **Lighting is mostly invisible** in the shot — front light from FOH truss/positions, back/side light hidden above the wall. Hence a separate front truss in the model.
4. **Presenter scale (≈ 1.75 m) vs. a 6–8 m wall** is what reads on camera; a scale figure is part of every preset.
5. **Camera sightlines** favour LED bottom ≥ presenter shoulder height when IMAG is used, or wall-to-floor when the wall is the set.
6. **Modularity is universal**: every surface is built from repeated cabinets, platforms and truss sections — which is exactly what makes a parametric tool viable.

### 1.3 Presets derived from the patterns

All presets are original, generic and fully adjustable (see `src/core/presets.ts`).

| Preset | Deck | Media | Rigging / light |
|---|---|---|---|
| Minimal Keynote | 40′ × 16′ × 3′ (8×4 platforms) | 12.5 × 7.0 m (25 × 14 BP2 V2), 600 mm above deck | Header truss, FOH truss @ 8.5 m, 10 washes |
| Panoramic Keynote | 56′ × 16′ × 3′ | 24 × 6 m (48 × 12), 1°/joint concave | Header, FOH 20 m, 14 washes |
| Product Launch | 56′ × 20′ × 3′ | Hero 10 × 5.5 m + two 2.5 × 5.5 m portrait reveal screens downstage | Header per wall, FOH, 12 washes |
| Multi-Screen | 48′ × 16′ × 3′ | Three 5 × 3 m walls, 750 mm gaps, 1.5 m above deck | Header per wall |
| Conversation Stage | 32′ × 16′ × 2′ | 9 × 4.5 m backdrop 1 m above deck | FOH @ 7 m, 8 washes |

---

## 2. Production hardware landscape

### 2.1 Catalogue status

| Item | Key data | Verification | Source |
|---|---|---|---|
| ROE Visual Black Pearl BP2 V2 | 500 × 500 × 90 mm, 2.84 mm, 176 × 176 px, 9.35 kg, 160/80 W, up to 10° concave | secondary | 4Wall listing (manufacturer PDF unreachable) |
| Absen PL3.9 V10 | 500 × 500 × 88 mm, 3.9 mm, 128 × 128 px, 7.7 kg, 540/180 W/m² | secondary (listing self-conflicts on weight/brightness) | Full Compass |
| INFiLED AR10 | 500 × 1000 × 108, 10.41 mm, 48 × 96 px, 12.4 (units not stated) | secondary | Lang Iberia |
| Generic 500 × 500 · 2.6 mm | planning cabinet | generic | — |
| Generic 600 × 337.5 · 1.56 mm (16:9) | planning cabinet | generic | — |
| Prolyte H30V box truss | 290 × 290 mm, chords Ø48.3 × 3, braces Ø16 × 2, 2.0 m = 14.49 kg, CCS6 conical couplers; 0.25/0.5/0.71/1.5/2.0/2.5 m confirmed, 1.0/3.0 m assumed | secondary | Huss Licht & Ton |
| Steel-frame platform 8′ × 4′ (Steeldeck-type) | 2438.4 × 1219.2 mm, 18 mm ply; reference data: 7.5 kN/m², 69–85.5 kg (listing conflicts), 2″ steel legs | generic (informed by Steeldeck) | Encore EMEA hire |
| Aluminium platform 2 × 1 m | European metric format | generic | Encore EMEA (Revostage) |
| Martin MAC Aura XB | 302 × 302 × 360 mm, 6.5 kg, 400 W, M12 clamp | secondary | Full Compass |
| 1 t chain hoist | planning envelope | generic | — |

### 2.2 What the engine takes from this

- **LED** — the cabinet's real width/height/depth drives the column/row count; partial cabinets are never generated. Curvature is limited to what the product documents; if nothing is documented the wall stays flat with a warning.
- **Decking** — platform layouts use only full platforms, primary long-side along the stage width, with a centred square infill when the module count is odd. Heights snap to the leg increment (6″ imperial / 100 mm metric).
- **Truss** — runs are built from real section lengths (shortest total ≥ target, fewest pieces), arranged symmetrically; hoists at ≤ 6 m spacing.
- **Weights** are only summed where a value exists; the UI says "not verified" otherwise.

### 2.3 Still to verify (open items)

- ROE BP2 V2, Absen PL, INFiLED AR datasheets direct from manufacturers (PDFs); convex curve limits.
- Prolyte H30V full section list and per-length weights; corner/junction blocks.
- Real platform frame depths and weights for the chosen staging vendor (StageRight, Steeldeck, Litedeck, TAIT Deck, Stageco).
- Lighting: Robe, Ayrton, Claypaky, ETC, Chauvet fixtures (Round 3).
- Manufacturer flying bars / ground stacks for each LED product (currently generic).
