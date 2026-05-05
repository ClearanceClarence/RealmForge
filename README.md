# RealmForge — Fantasy Map Generator

A procedural fantasy map generator that produces detailed worlds with terrain,
climate, kingdoms, cities, lakes, rivers, roads, and sea routes. Vanilla
JavaScript, no build step. The only third-party runtime dependency is
[D3-Delaunay](https://github.com/d3/d3-delaunay) for Voronoi tessellation.

## Features

### Terrain Generation
- **Voronoi-based cells**: Irregular polygonal cells produce natural-looking
  landmasses
- **Multiple noise algorithms**: Continental, Eroded, Warped (multi-warp),
  Hills (Swiss), Valleys, Plateaus (terraced), Ridges, plain FBM
- **World shape presets** (falloff masks): Continent, Archipelago, Two
  Continents, Isthmus, Pangaea, Coastal, Inland Sea, Lake World, Peninsulas &
  Fjords, Atoll. Plus basic radial/square/open edges.
- **Hydraulic erosion**: Configurable iterations, strength, and deposition
  rate. Carves realistic valleys and smooths ridges.
- **Coastal jaggedness**: Slider from smooth Voronoi-edge coastlines to
  heavily fractal-subdivided shores.
- **Island sprinkling**: Density slider adds small islands and broadens
  barrier islands along coasts.

### Climate & Water
- **Precipitation**: Wind-direction-dependent rainfall with rain shadows.
- **Rivers**: Steepest-descent drainage on a depression-filled heightmap.
  Rivers extend into the ocean for visual continuity. Procedurally named.
- **Lakes**: Two detection passes:
  - *Endorheic basins*: Real terrain depressions with no outlet.
  - *River-fed lakes*: Where flow accumulates without reaching ocean.
  Adjustable density and minimum depth/size sliders. Each connected body
  of water gets a single name (multiple lake records that share Voronoi
  adjacency are clustered for naming).

### Political Features
- **Kingdoms**: Weighted flood-fill from capital seeds, with terrain-aware
  scoring (land type, river access, mountain proximity).
- **Cities**: Multiple subtypes — port, lakeside, coastal, mountain,
  highland, river, plains. Picked by terrain priority during placement.
- **Capitals**: Drawn as filled 5-pointed stars. Other cities as small
  filled circles.
- **Borders**: Dashed kingdom boundaries; lakes painted at full opacity
  on top so kingdom fills don't bleed through them.
- **Continent-aware trade routes**: Capitals are flood-filled into
  continents (connected land components). Each continent gets one MST
  trade-route backbone using Euclidean distance for the spanning tree
  and A* only for the chosen edges (so 19 A* runs on a 20-capital
  continent instead of 190). A two-pass relaxation lets the routes see
  each other's cells and merge onto shared trunks where geometry allows.
- **City feeders**: Local roads from cities to their capital using A*
  with a strong on-road bonus (cells already used by other roads are
  ~8× cheaper) and a weaker near-road bonus, so feeders naturally
  latch onto trade trunks instead of running parallel.
- **Network consolidation**: After all roads are generated, the entire
  road list is collapsed into a single edge graph keyed on cell pairs.
  Each edge keeps the highest-priority tier (trade > major > minor >
  pass) of any road that used it. Continuous polylines are walked per
  tier and emitted as fresh roads — so the renderer never draws the
  same cell twice. A feeder that overlapped a trade trunk is **promoted
  to trade** through the shared cells.
- **Sea routes**: Coastal-port-to-port shipping lanes. A* runs in ocean
  cells with shore-avoidance: cells adjacent to land cost 5× more,
  cells two hops from land cost 2× more — so routes sweep around
  peninsulas instead of hugging the coast and chording across bays.
  The same edge-graph consolidation applied to roads is also applied
  to sea routes, so two ports that connect to the same hub via A*
  share a single visible trunk.

### Procedural Naming
- **Cultural styles**: Germanic, Celtic, Romance, Slavic, Hellenic, Eastern
  syllable patterns.
- **Specialized generators**: Kingdoms (with government prefixes —
  "Republic of", "Duchy of", "Kingdom of"), capitals, cities, rivers,
  lakes (Mere/Lagoon/Pond/Loch/Tarn variants), seas, mountains.
- **Unique-tracking**: Won't repeat names within a generation.

### Visual Rendering
- **View modes**: Political Map (default), Terrain, Heightmap, Precipitation.
- **Hybrid render pipeline**: Canvas base layer + seven stacked SVG
  overlays (sea routes → rivers → kingdoms → coastline → roads →
  cities → labels). The SVG layers handle anything that needs crisp
  vector strokes or text; the canvas handles per-cell fills.
- **Smooth coastlines**: Catmull-Rom spline interpolation over Voronoi
  edges. Coastline stroke width 0.5 in tan (`#A89880`).
- **Lake borders**: Same shoreline language as coastlines (matching
  width and color) so they read as one unified water-edge style.
- **Kingdom borders**: Dashed `2` stroke in `rgb(86, 86, 109)`, butt
  linecap, 1px width.
- **Rivers**: Tapered polygons in `rgb(93, 151, 187)` with the same
  color used for both canvas (terrain mode) and SVG (political mode)
  pipelines.
- **Roads**: Solid trade trunks in `rgb(96, 78, 60)` at 1.4 stroke
  width; major roads at 0.9 with `2 1.2` dasharray; minor roads at 0.7
  with `1 2` dasharray; mountain passes at 0.6 with `1 2.5` dasharray.
- **Coordinate grid**: Subtle reference lines at "nice" 1-2-5 step
  intervals in world units. Spacing adapts to zoom (~10 lines across
  the visible width regardless of magnification).
- **Kingdom labels**: 2-pass chamfer distance transform on a 24×24 to
  100×100 occupancy grid drives label fitting. Tries fonts 22pt → 5pt
  and scores candidate cells by (distance from boundary − required
  half-extent) − centrality drift − city-overlap penalty. Letter-
  spaced 0.12em with a parchment-colored stroke halo via paint-order.
- **Lake labels**: Italic blue (`#2A4458`) with parchment halo, font
  ladder 9 → 4.5pt. Only lakes with ≥8 cells get a label, and only one
  label per connected body of water.
- **City labels**: Italic, appear when zoomed to ≥1.2× to keep the
  overview view legible.

### User Interface
- **Pan & Zoom**: Mouse drag, mouse-wheel zoom (rAF-coalesced for
  responsiveness during fast scroll bursts).
- **Style presets**: Custom, Middle-earth (Tolkien), Westeros (Game of
  Thrones), Earth-like, Alien, Archipelago Realms, Frozen North.
- **Live controls**: Sliders for every generation parameter, with
  live update on change.
- **Real-time stats**: Cell count, land percentage, generation time
  in the sidebar footer.
- **Export**: PNG image and JSON data dumps.

## Getting Started

### Prerequisites
- Modern browser (Chrome 80+, Firefox 75+, Safari 14+, Edge 80+).
- Local web server — ES modules require `http://` not `file://`.

### Installation

```bash
# Python
python -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000

# XAMPP — drop into htdocs/ and visit https://localhost/realmforge/
```

Open `http://localhost:8000` in a browser. The repo includes a
`.htaccess` that disables HTTP caching for `.js`/`.css`/`.html`, so
during development a normal F5 picks up edits without cache-bust query
strings.

### Quick Start

1. Click **New World** in the sidebar (or the topbar Generate button).
2. Adjust parameters in the sidebar sections:
   - **Terrain** — type, scale, detail, sea level, world shape, smoothing,
     coast jaggedness, island density. Section has a *Regenerate* button
     to rebuild the heightmap with current values.
   - **Erosion** — iterations, strength, valleys (deposition rate). Has
     an *Apply* button.
   - **Climate** — wind direction & strength, river count, lake density,
     lake size. Has *Rain* and *Rivers* action buttons.
   - **Nations** — kingdom count, settlement density. *Generate* button.
   - **Display** — contour subdivision slider; checkboxes for edges,
     coastline, centers, mesh, coordinate grid.
   - **Export** — PNG / JSON buttons.
3. Mouse wheel zooms; drag pans.

## Configuration Reference

### Top-level
| Control | Range | Effect |
|--|--|--|
| Seed | integer | Reproducible RNG seed for entire generation |
| Cells | 100–100000 | Voronoi cell count (detail / density) |
| Layout | random / jittered / poisson / relaxed | Point distribution |
| Style preset | dropdown | Bundle of slider settings for a target aesthetic |

### Terrain
| Slider | Range | Effect |
|--|--|--|
| Type | dropdown | Noise algorithm (continental, eroded, warped, hills, valleys, plateaus, ridges, fbm) |
| Scale | 0.5–8 | Lower = larger continents; higher = more numerous landmasses |
| Detail | 1–8 | Octave count; more = finer ridges, slower at high values |
| Sea Level | 0–0.8 | Lower = more land; higher = more ocean |
| World | dropdown | Falloff mask shape (Continent, Archipelago, Two Continents, Isthmus, Pangaea, Coastal, Inland Sea, Lake World, Peninsulas, Atoll, plus basic radial/square/open) |
| Strength | 0–1 | How strongly the World shape is enforced |
| Smooth | 0–10 | Terrain smoothing pass count |
| Jaggedness | 0–1 | Coastline irregularity (0 = smooth Voronoi edges, 1 = heavy fractal subdivision) |
| Islands | 0–1 | Sprinkle small islands, broaden barrier islands |

### Erosion
| Slider | Range | Effect |
|--|--|--|
| Iterations | 10k–200k | Carving passes |
| Strength | 0.1–1 | Aggressiveness of water cutting |
| Valleys | 0.1–0.8 | Sediment deposition rate (wider valleys at high values) |

### Climate
| Slider | Range | Effect |
|--|--|--|
| Wind | 8 directions | Prevailing wind |
| Strength | 0.1–1 | How far moisture is carried |
| Rivers | 5–100 | Number of major rivers traced |
| Lakes | 0–1 | Lake density |
| Lake Size | 0–1 | 0 = many small shallow, 1 = few large deep |

### Nations
| Slider | Range | Effect |
|--|--|--|
| Kingdoms | 3–30 | Number of independent states |
| Settlements | 0–10 | Cities per kingdom |

### Display
| Control | Effect |
|--|--|
| Contours | Subdivision level for terrain contours (0–4) |
| Edges | Show cell edges |
| Coastline | Show coastline stroke |
| Centers | Show cell center points |
| Mesh | Show Delaunay triangulation |
| Coordinate Grid | Subtle reference grid |

## Technical Architecture

### File Structure
```
realmforge/
├── index.html                # Main HTML structure
├── styles.css                # Sidebar, map UI, tooltip, info-panel styles
├── app.js                    # UI binding, event handlers, render loop kickoff
├── voronoi-generator.js      # Core class with all generation algorithms
├── rendering-methods.js      # Canvas + SVG rendering, mixed in via Object.assign
├── map-constants.js          # Color palettes, elevation/category constants
├── name-generator.js         # Procedural naming (cultures + named entities)
├── noise.js                  # Multi-algorithm noise (Perlin, Simplex, etc.)
├── prng.js                   # Seeded RNG
├── tile-cache.js             # Canvas tile cache for terrain mode
├── generation.worker.js      # Heavy generation steps run in a Web Worker
├── worker-bridge.js          # Main-thread ↔ worker postMessage wrapper
├── .htaccess                 # No-cache headers for .js/.css/.html
└── README.md                 # This file
```

### Core Classes

**`VoronoiGenerator`** (`voronoi-generator.js`) — owns the world.
Methods:
- `generate(count, distribution, seed, heightmapOptions)` — full
  point-and-terrain pipeline.
- `generateKingdoms(numKingdoms, roadDensity)` — political division.
  Internally calls capital placement, city placement, road generation,
  sea-route generation.
- `_generateRoads()` — Phase 1 continent detection, Phase 2 trade-route
  MST per continent, Phase 3 city feeders, Phase 4 network
  consolidation via `_consolidateRoadNetwork()`.
- `_generateSeaRoutes()` — port-pairing, ocean A*, then
  `_consolidateSeaRoutes()` to merge shared trunks.
- `render()` — dispatches to canvas + all SVG layer updates.
- `resize()` — handles canvas size changes; scales all stored
  world-space coordinates (points, road `{x,y,cell}` paths,
  sea-route paths, kingdom centroids) proportionally so the map
  always fills the canvas.

Rendering methods are defined in `rendering-methods.js` as a plain
object literal and **mixed into the class via `Object.assign(VoronoiGenerator.prototype, methods)`**.
This is why methods in `rendering-methods.js` use the object-method
comma syntax (`},`) while methods in `voronoi-generator.js` use
class-method syntax (no commas).

**`NameGenerator`** (`name-generator.js`) — culture-driven naming.
Generators for kingdoms, cities, rivers, lakes (with prefixes like
"Mere", "Lagoon", "The Golden ..."), seas, and mountains. Tracks used
names per generation to avoid duplicates.

### Key Algorithms

**A* with binary heap**
Road and sea-route pathfinding both use A* with a binary min-heap as
the open set. The heap supports lazy invalidation: stale entries are
skipped on pop by comparing the popped fScore to the current fScore.
This makes A* O(N log N) instead of O(N²) — critical because a single
generation runs A* dozens of times.

**Continent detection**
Flood-fill from each capital across land-only Voronoi neighbours.
Each capital's continent ID = its connected land component. Used to
decide how many trade-route backbones to build (one MST per continent
with ≥2 capitals).

**Trade-route MST**
Euclidean distance is used as the MST edge weight (Kruskal). Only
the N−1 selected MST edges run A*, instead of the N×(N−1)/2 pairwise
A* runs the brute-force version would need. A relaxation pass then
re-runs A* for each MST edge with ALL other trade routes' cells in
roadCells, so routes can see each other and converge onto shared trunks.

**Network consolidation (post-process)**
Replaces `this.roads` after generation. For every cell-edge used by
any road, records the highest-priority tier (trade > major > minor >
pass). For each tier, builds an adjacency graph and walks continuous
polylines anchored at endpoints (degree 1) and junctions (degree ≥3),
absorbing degree-2 cells. Each polyline becomes a fresh road object.
Result: zero overlapping cells between any two roads, so the renderer
just draws each road as one `<path>` with no dedup logic. A feeder
that originally overlapped a trade trunk is automatically *promoted*
to trade through the shared cells. Same algorithm applied to sea
routes via `_consolidateSeaRoutes`.

**Sea-route shore avoidance**
Pre-computes `shoreCells` (ocean cells with at least one land
neighbour) and `nearShoreCells` (ocean cells with at least one shore
neighbour). A* cost multiplier is 5× into a shore cell, 2× into a
near-shore cell, 1× into deep water. The pathfinder strongly prefers
deep water for the bulk of the route, only dipping to the coast at
the start/end. Keeps routes from cutting across peninsulas.

**Kingdom label placement**
Builds a 24×24 to 100×100 occupancy grid via `delaunay.find` for the
kingdom. Two-pass chamfer distance transform (3-4 weights) computes
distance-to-boundary at each grid cell. Tries a font ladder
(22 → 5pt); for each font, every interior grid cell is scored by
`(distance − required-half-extent) − centrality_drift × 0.25
− city_overlap_penalty`. First font where any cell passes wins.

**Lake naming consolidation**
Union-find pass over `this.lakes` keyed on Voronoi cell adjacency.
Lakes whose cells touch get merged into one cluster. Each cluster
gets one label (the largest member's name), positioned over the
cluster's combined cells. The lake-generation algorithm itself
isn't changed — it can legitimately produce multiple lake records
for adjacent water bodies; only naming is consolidated.

**Marching squares contours**
16-case lookup, Catmull-Rom smoothing, controlled by the Display →
Contours slider.

### Performance

- Heavy generation steps run in a Web Worker (`generation.worker.js`,
  bridged via `worker-bridge.js`) so the UI thread stays responsive.
- Canvas terrain rendering uses a tile cache (`tile-cache.js`) so
  pan/zoom doesn't repaint untouched regions.
- Render caches: coastline loops, contour paths, kingdom border
  edges, kingdom border paths, kingdom-boundary topology. Invalidated
  surgically on resize/regeneration.
- Wheel events are coalesced via a single rAF per frame instead of
  triggering an immediate render per event.
- Post-interaction full-render is debounced 80ms after pan/zoom ends.

## Customization

### Color Palettes
`map-constants.js`:
```javascript
export const POLITICAL_COLORS = [...];   // 40-color kingdom palette
export const POLITICAL_OCEAN = "#C8D4C8";
export const POLITICAL_BORDER = "#5A4A3A";
```

### Naming
`name-generator.js`: cultural syllable patterns, government type
prefixes, lake-prefix lists, etc.

### Road / coastline / border styling
`rendering-methods.js`:
- Road colours and widths in `_updateRoadSVG`
- Coastline and lake-border widths in `_updateCoastlineSVG` /
  `_updateLakeBorderSVG`
- Kingdom border attributes in `_updateKingdomSVG`

### Contour levels
In `_generateContourCache` (within `rendering-methods.js`):
```javascript
const contourLevels = [100, 175, 250, 350, 450, 550, 700, 850,
                       1000, 1200, 1400, 1700, 2000, 2400, 2800];
```

## Export Formats

### PNG
Full-resolution rasterized map with all visible elements. Browser
canvas size limits apply (~16k pixels).

### JSON
World data dump including seed, dimensions, cells, heights, kingdoms,
kingdom names, cities, city names, roads, rivers (with names), lakes
(with names), and sea routes.

## Known Limitations
- Cell counts above 50,000 stress older hardware.
- Mobile devices struggle with complex maps; touch pan/zoom works but
  generation is slow.
- City labels only appear at zoom ≥1.2 to keep the overview readable.
- PNG export is bound by the browser's canvas size limit.

## Roadmap
- [ ] Mountain range labelling
- [ ] Sea / ocean naming
- [ ] Biome visualisation mode
- [ ] Historical aging (faded ink, foxing)
- [ ] SVG export

## Credits
- **Voronoi/Delaunay**: [D3-Delaunay](https://github.com/d3/d3-delaunay) by Mike Bostock
- **Inspiration**: [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/), Martin O'Leary's procedural map generation writing

## License
MIT.
