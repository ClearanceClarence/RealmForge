/**
 * Rendering methods for VoronoiGenerator. Defined as a plain object
 * literal and mixed into the class via Object.assign on the prototype
 * (see voronoi-generator.js bottom). That mix-in pattern is why every
 * method below uses object-literal comma syntax rather than the
 * comma-less class-method syntax used in voronoi-generator.js itself.
 *
 * The renderer uses a hybrid pipeline: a base canvas layer for
 * per-cell fills and tiled terrain, plus seven stacked SVG overlays
 * for crisp vector strokes and text (sea routes, rivers, kingdoms,
 * coastline, roads, cities, labels — in that z-order).
 */
import { 
    LAND_COLORS, OCEAN_COLORS, PRECIP_COLORS, 
    POLITICAL_COLORS, POLITICAL_OCEAN, POLITICAL_BORDER,
    ELEVATION 
} from './map-constants.js';

export const renderingMethods = {
/**
 * Full render of the map. Paints the canvas base layer and refreshes
 * every SVG overlay. Heavy — call on actual visual changes (terrain
 * regenerated, kingdoms changed, viewport settled). For pan/zoom in
 * progress, use renderLowRes() instead.
 */
render() {
    const start = performance.now();
    const ctx = this.ctx;
    
    // Clear canvas
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Clear SVG layers if not in political mode
    if (this.renderMode !== 'political') {
        const roadSvg = document.getElementById('road-svg');
        if (roadSvg) {
            roadSvg.innerHTML = '';
            roadSvg.style.opacity = '0';
        }
        const kingdomSvg = document.getElementById('kingdom-svg');
        if (kingdomSvg) {
            kingdomSvg.innerHTML = '';
            kingdomSvg.style.opacity = '0';
        }
        const citySvg = document.getElementById('city-svg');
        if (citySvg) {
            citySvg.innerHTML = '';
            citySvg.style.opacity = '0';
        }
        const labelSvg = document.getElementById('label-svg');
        if (labelSvg) {
            labelSvg.innerHTML = '';
            labelSvg.style.opacity = '0';
        }
    }
    
    // Clear river SVG only if not showing rivers or not in a mode that uses them
    if (!this.showRivers || 
        (this.renderMode !== 'political' && this.renderMode !== 'terrain' && this.renderMode !== 'heightmap')) {
        const riverSvg = document.getElementById('river-svg');
        if (riverSvg) {
            riverSvg.innerHTML = '';
            riverSvg.style.opacity = '0';
        }
    }
    
    if (!this.voronoi) {
        this.metrics.renderTime = performance.now() - start;
        this.metrics.visibleCells = 0;
        return;
    }
    
    // Full render
    ctx.save();
    ctx.translate(this.viewport.x, this.viewport.y);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);
    
    // Get visible bounds for culling
    const bounds = this.getVisibleBounds();
    
    // Render terrain-colored cells if heightmap exists
    if (this.heights && (this.renderMode === 'heightmap' || this.renderMode === 'terrain')) {
        this._renderTerrainCells(ctx, bounds);
        if (this.showRivers && this.rivers && this.rivers.length > 0) {
            this._updateRiverSVG();
        }
    }
    
    // Render precipitation if data exists
    if (this.renderMode === 'precipitation') {
        if (this.precipitation) {
            this._renderPrecipitationCells(ctx, bounds);
        } else if (this.heights) {
            this._renderTerrainCells(ctx, bounds);
        }
    }
    
    // Render political map (kingdoms)
    if (this.renderMode === 'political') {
        // Initialize hit boxes for hover detection
        this._labelHitBoxes = [];
        
        // Canvas: Base terrain (ocean, land, lakes)
        this._renderPoliticalBase(ctx, bounds);
        
        // SVG layers in order (z-order determined by HTML element order):
        // 0. Sea routes (SVG) - below everything, in the ocean
        if (this.seaRoutes && this.seaRoutes.length > 0) {
            this._updateSeaRouteSVG();
        }
        
        // 1. Rivers (SVG) - below kingdom colors so they get tinted
        if (this.showRivers && this.rivers && this.rivers.length > 0) {
            this._updateRiverSVG();
        }
        
        // 2. Kingdom fills and borders (SVG)
        if (this.kingdoms && this.kingdomCount > 0) {
            this._updateKingdomSVG();
        }
        
        // 3. Coastline (SVG) - above kingdoms
        // Always call _updateCoastlineSVG: when showCoastline is true it draws
        // a visible dark stroke (the actual coastline). When false it draws
        // an invisible seam-filler in the ocean color, hiding the antialiased
        // gap between canvas land fill and SVG kingdom fills (which would
        // otherwise show as a thin pale border).
        this._updateCoastlineSVG();
        // Lake borders only render when coastline is on (they're shorelines too)
        if (this.showCoastline) {
            this._updateLakeBordersSVG();
        }
        
        // 4. Roads (SVG)
        if (this.roads && this.roads.length > 0) {
            this._updateRoadSVG();
        }
        
        // 5. Cities and Capitols (SVG)
        this._updateCitySVG();
        
        // 6. All labels: kingdom names, city names (SVG)
        this._updateLabelSVG();
    }
    
    // Render Delaunay triangulation (behind)
    if (this.showDelaunay) {
        ctx.strokeStyle = this.colors.delaunay;
        ctx.lineWidth = 0.5 / this.viewport.zoom;
        ctx.beginPath();
        this.voronoi.render(ctx);
        ctx.stroke();
    }
    
    // Render Voronoi edges
    if (this.showEdges) {
        ctx.strokeStyle = this.colors.edge;
        ctx.lineWidth = Math.max(0.25, 0.5 / this.viewport.zoom);
        ctx.beginPath();
        this.voronoi.render(ctx);
        ctx.stroke();
    }
    
    // Render cell centers (only when zoomed in enough)
    if (this.showCenters) {
        ctx.fillStyle = this.colors.center;
        const radius = Math.max(1, 1.5 / this.viewport.zoom);
        ctx.beginPath();
        
        for (let i = 0; i < this.cellCount; i++) {
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            
            // Frustum culling
            if (x < bounds.left || x > bounds.right || 
                y < bounds.top || y > bounds.bottom) continue;
            
            ctx.moveTo(x + radius, y);
            ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
    }
    
    // Render hovered cell outline
    if (this.hoveredCell >= 0 && this.hoveredCell < this.cellCount) {
        this._renderHoveredCell(ctx);
    }
    
    // Render coordinate grid
    if (this.showGrid) {
        this._renderCoordinateGrid(ctx, bounds);
    }
    
    ctx.restore();
    
    // Draw zoom indicator
    this._drawZoomIndicator(ctx);
    
    // Save viewport state for CSS transform calculations
    this._lastRenderedViewport = {
        x: this.viewport.x,
        y: this.viewport.y,
        zoom: this.viewport.zoom
    };
    
    this.metrics.renderTime = performance.now() - start;
},

/**
 * Low-resolution render for smooth pan/zoom interaction
 * Skips expensive operations like labels, contours, rivers
 */
renderLowRes() {
    const ctx = this.ctx;
    const zoom = this.viewport.zoom;
    const tx = this.viewport.x;
    const ty = this.viewport.y;
    
    // Update all SVG group transforms to match viewport (keep them visible during pan/zoom)
    // Use direct style transform for GPU acceleration
    const svgIds = ['sea-route-svg', 'coastline-svg', 'road-svg', 'river-svg', 'kingdom-svg', 'city-svg', 'label-svg'];
    for (const id of svgIds) {
        const svg = document.getElementById(id);
        if (svg) {
            // Find the main content group (direct child of svg, not defs)
            const groups = svg.children;
            for (let i = 0; i < groups.length; i++) {
                const child = groups[i];
                if (child.tagName === 'g') {
                    child.setAttribute('transform', `translate(${tx}, ${ty}) scale(${zoom})`);
                }
            }
        }
    }
    
    // Clear canvas
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    
    if (!this.voronoi || !this.heights) return;
    
    ctx.save();
    ctx.translate(this.viewport.x, this.viewport.y);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);
    
    // Get visible bounds for culling
    const bounds = this.getVisibleBounds();
    
    // Render based on mode - simplified versions
    if (this.renderMode === 'political') {
        this._renderPoliticalBaseLowRes(ctx, bounds);
    } else {
        this._renderTerrainCellsLowRes(ctx, bounds);
    }
    
    ctx.restore();
},

/**
 * Low-res political base - just ocean and land, no cells visible
 */
_renderPoliticalBaseLowRes(ctx, bounds) {
    // Fill with ocean
    ctx.fillStyle = POLITICAL_OCEAN;
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    
    // Fill land with base color using coastline
    const coastLoops = this._coastlineCache || this._buildSmoothCoastlineLoops();
    if (coastLoops.length > 0) {
        ctx.fillStyle = '#E8DCC8';
        ctx.beginPath();
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[0][0], loop[0][1]);
            for (let i = 1; i < loop.length; i++) {
                ctx.lineTo(loop[i][0], loop[i][1]);
            }
            ctx.closePath();
        }
        ctx.fill();
    }
},


/**
 * Low-res terrain rendering - just colored cells, no smoothing
 */
_renderTerrainCellsLowRes(ctx, bounds) {
    const isGrayscale = this.renderMode === 'heightmap';
    const colorBatches = new Map();
    
    for (let i = 0; i < this.cellCount; i++) {
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        // Frustum culling with margin
        if (x < bounds.left - 20 || x > bounds.right + 20 ||
            y < bounds.top - 20 || y > bounds.bottom + 20) continue;
        
        const elevation = this.heights[i];
        let color;
        
        if (isGrayscale) {
            const normalized = (elevation - ELEVATION.MIN) / ELEVATION.RANGE;
            const gray = Math.floor(normalized * 255);
            color = `rgb(${gray},${gray},${gray})`;
        } else if (this.renderMode === 'precipitation' && this.precipitation) {
            const precipIdx = Math.floor(this.precipitation[i] * (PRECIP_COLORS.length - 1));
            color = PRECIP_COLORS[Math.max(0, Math.min(PRECIP_COLORS.length - 1, precipIdx))];
        } else {
            if (elevation < ELEVATION.SEA_LEVEL) {
                const depthRatio = Math.abs(elevation) / Math.abs(ELEVATION.MIN);
                const oceanIdx = Math.floor(depthRatio * (OCEAN_COLORS.length - 1));
                color = OCEAN_COLORS[Math.max(0, Math.min(OCEAN_COLORS.length - 1, oceanIdx))];
            } else {
                const heightRatio = elevation / ELEVATION.MAX;
                const landIdx = Math.floor(heightRatio * (LAND_COLORS.length - 1));
                color = LAND_COLORS[Math.max(0, Math.min(LAND_COLORS.length - 1, landIdx))];
            }
        }
        
        if (!colorBatches.has(color)) {
            colorBatches.set(color, []);
        }
        colorBatches.get(color).push(i);
    }
    
    // Draw batched by color
    for (const [color, cells] of colorBatches) {
        ctx.fillStyle = color;
        ctx.beginPath();
        
        for (const i of cells) {
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
        
        ctx.fill();
    }
},

/**
 * Draw zoom level indicator
 */
_drawZoomIndicator(ctx) {
    const zoom = this.viewport.zoom;
    const text = `${Math.round(zoom * 100)}%`;
    
    ctx.save();
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(text, this.width - 10, this.height - 10);
    ctx.restore();
},
/**
 * Render terrain-colored cells with frustum culling and optional contour smoothing
 */
_renderTerrainCells(ctx, bounds) {
    const isGrayscale = this.renderMode === 'heightmap';
    
    // Use tile cache for colored terrain (not grayscale heightmap)
    if (!isGrayscale && this.tileCache && this.useTileRendering) {
        this.tileCache.render(ctx, this.viewport, bounds, 'terrain');
        // Still render lakes on top
        if (this.lakeCells && this.lakeCells.size > 0) {
            this._renderSmoothLakes(ctx, bounds);
        }
        this.metrics.visibleCells = this.cellCount; // Approximation
        return;
    }
    
    // Use contour rendering if enabled (faster than subdivision)
    if (this.subdivisionLevel > 0 && this.heights) {
        this._renderContourTerrain(ctx, bounds, isGrayscale);
        return;
    }
    
    // Build smooth coastline loops first
    if (!this._coastlineCache) { this._coastlineCache = this._buildSmoothCoastlineLoops(); } const coastLoops = this._coastlineCache;
    
    // Standard rendering (no subdivision)
    const colorBatches = new Map();
    let visibleCount = 0;
    
    for (let i = 0; i < this.cellCount; i++) {
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        const margin = 50;
        if (x < bounds.left - margin || x > bounds.right + margin || 
            y < bounds.top - margin || y > bounds.bottom + margin) continue;
        
        visibleCount++;
        const elevation = this.heights[i];
        
        const color = isGrayscale ? this._getGrayscale(elevation) : this._getElevationColor(elevation);
        
        if (!colorBatches.has(color)) {
            colorBatches.set(color, []);
        }
        colorBatches.get(color).push(i);
    }
    
    // 1. Draw ocean cells first
    const oceanColor = OCEAN_COLORS[0];
    ctx.fillStyle = oceanColor;
    ctx.beginPath();
    for (const [color, indices] of colorBatches) {
        for (const i of indices) {
            if (this.heights[i] >= ELEVATION.SEA_LEVEL) continue;
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
    }
    ctx.fill();
    
    // 2. Draw smooth land fill as backing layer (fills gaps at coastline)
    // Use a mid-green color that won't be too visible
    const backingColor = '#4a7c59';
    ctx.fillStyle = backingColor;
    for (const loop of coastLoops) {
        if (loop.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    }
    
    // 3. Draw land cells on top
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.5 / this.viewport.zoom;
    
    for (const [color, indices] of colorBatches) {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        
        for (const i of indices) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue; // Skip ocean
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    // 4. Render smooth lakes on top
    if (this.lakeCells && this.lakeCells.size > 0) {
        this._renderSmoothLakes(ctx, bounds);
    }
    
    // 5. Mask angular edges that extend into ocean
    if (coastLoops.length > 0) {
        ctx.save();
        ctx.beginPath();
        
        // Large outer rectangle
        ctx.moveTo(bounds.left - 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.bottom + 1000);
        ctx.lineTo(bounds.left - 1000, bounds.bottom + 1000);
        ctx.closePath();
        
        // Cut out smooth coastline
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[loop.length - 1][0], loop[loop.length - 1][1]);
            for (let i = loop.length - 2; i >= 0; i--) {
                ctx.lineTo(loop[i][0], loop[i][1]);
            }
            ctx.closePath();
        }
        
        ctx.clip('evenodd');
        
        ctx.fillStyle = oceanColor;
        ctx.fillRect(bounds.left - 1000, bounds.top - 1000, 
                    bounds.right - bounds.left + 2000, bounds.bottom - bounds.top + 2000);
        
        ctx.restore();
    }
    
    // 6. Draw smooth coastline border
    const borderColor = '#5A4A3A';
    const lineWidth = Math.max(0.3, 1 / this.viewport.zoom);
    this._drawSmoothCoastStroke(ctx, coastLoops, borderColor, lineWidth);
    
    this.metrics.visibleCells = visibleCount;
},
/**
 * Render lakes as filled cells
 */
/**
 * Compute the lake fill color: ocean color with a very slight cyan/lighter tint
 * so lakes are distinguishable from ocean but clearly belong to the same family.
 * Mode-aware: terrain mode uses OCEAN_COLORS gradient, political modes use POLITICAL_OCEAN.
 *
 * @returns {string} CSS hex color, fully opaque
 */
_lakeFillColor() {
    // Tint helper: shift a hex color slightly lighter and toward cyan. This
    // is the small visual difference between lakes and ocean — barely visible
    // but enough to read as "freshwater" rather than "sea".
    const tint = (hex) => {
        // Parse #RRGGBB
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        // Tiny adjustments: +8 green, +12 blue, -4 red. Just enough to shift hue.
        const tr = Math.max(0, Math.min(255, r - 4));
        const tg = Math.max(0, Math.min(255, g + 8));
        const tb = Math.max(0, Math.min(255, b + 12));
        return `#${tr.toString(16).padStart(2,'0')}${tg.toString(16).padStart(2,'0')}${tb.toString(16).padStart(2,'0')}`;
    };
    
    if (this.renderMode === 'political' || this.renderMode === 'political-terrain') {
        return tint(POLITICAL_OCEAN);
    }
    // Terrain modes: use shallowest ocean color (matches what would appear at the coast)
    return tint(OCEAN_COLORS[0]);
},

_renderSmoothLakes(ctx, bounds) {
    if (!this.lakes || this.lakes.length === 0) return;
    
    const lakeColor = this._lakeFillColor();
    
    for (const lake of this.lakes) {
        if (!lake.cells || lake.cells.length === 0) continue;
        
        // Draw all lake cells as filled polygons (solid, opaque)
        ctx.fillStyle = lakeColor;
        for (const cellIndex of lake.cells) {
            const cell = this.voronoi.cellPolygon(cellIndex);
            if (!cell || cell.length < 3) continue;
            
            ctx.beginPath();
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
},

/**
 * Render base layer for political map - just ocean and land base color
 * Kingdom colors are rendered via SVG overlay
 * Coastline stroke is now rendered via SVG
 */
_renderPoliticalBase(ctx, bounds) {
    if (!this.heights) return;
    
    // 1. Fill with ocean color
    ctx.fillStyle = POLITICAL_OCEAN;
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    
    // Use cached coastline loops
    if (!this._coastlineCache) {
        this._coastlineCache = this._buildSmoothCoastlineLoops();
    }
    const coastLoops = this._coastlineCache;
    
    if (coastLoops.length === 0) return;
    
    // 2. Fill land. Iterate cell polygons rather than the smooth coastline
    // loops — for normal worlds (no land touching map edges) the two are
    // visually identical. For worlds where land runs off the map edges
    // (e.g. isthmus preset), the coastline loops can have artifacts at
    // map corners (d3-delaunay clips corner cells with a single diagonal
    // edge that the loop-chaining algorithm closes incorrectly), producing
    // visible triangular wedges of "land" in ocean regions. Painting per-
    // cell sidesteps the issue entirely: each cell knows for itself whether
    // it's land or ocean.
    ctx.fillStyle = '#E8DCC8'; // Base parchment - kingdoms will tint this
    ctx.beginPath();
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        if (this.lakeCells && this.lakeCells.has(i)) continue;  // lakes painted separately
        const cellPoly = this.voronoi.cellPolygon(i);
        if (!cellPoly || cellPoly.length < 3) continue;
        ctx.moveTo(cellPoly[0][0], cellPoly[0][1]);
        for (let j = 1; j < cellPoly.length; j++) {
            ctx.lineTo(cellPoly[j][0], cellPoly[j][1]);
        }
        ctx.closePath();
    }
    ctx.fill();
    
    // 3. Draw lakes (solid fill, ocean color with slight tint)
    if (this.lakeCells && this.lakeCells.size > 0) {
        ctx.fillStyle = this._lakeFillColor();
        for (const cellIndex of this.lakeCells) {
            const cell = this.voronoi.cellPolygon(cellIndex);
            if (!cell || cell.length < 3) continue;
            
            ctx.beginPath();
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Coastline stroke is now rendered via _updateCoastlineSVG()
},


/**
 * Render kingdom borders (extracted for use with tile cache)
 */
_renderKingdomBorders(ctx, bounds) {
    if (!this.kingdoms || this.kingdomCount <= 0) return;
    
    const zoom = this.viewport.zoom;
    ctx.strokeStyle = 'rgba(90, 74, 58, 0.6)';
    ctx.lineWidth = Math.max(0.4, 0.6 / zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dashUnit = Math.max(1, 2 / zoom);
    ctx.setLineDash([dashUnit, dashUnit * 0.75]);
    
    ctx.beginPath();
    
    // For each pair of neighboring cells in different kingdoms
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        if (this.lakeCells && this.lakeCells.has(i)) continue;  // skip lakes
        
        const myKingdom = this.kingdoms[i];
        if (myKingdom < 0) continue;
        
        // Frustum culling
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        const margin = 50;
        if (x < bounds.left - margin || x > bounds.right + margin || 
            y < bounds.top - margin || y > bounds.bottom + margin) continue;
        
        const cellI = this.voronoi.cellPolygon(i);
        if (!cellI || cellI.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (const j of neighbors) {
            if (j < 0 || j >= this.cellCount) continue;
            if (this.heights[j] < ELEVATION.SEA_LEVEL) continue;
            if (this.lakeCells && this.lakeCells.has(j)) continue;
            
            const neighborKingdom = this.kingdoms[j];
            if (neighborKingdom < 0 || neighborKingdom === myKingdom) continue;
            
            // Only draw from lower-indexed cell to avoid duplicates
            if (i > j) continue;
            
            // Find the edge in cell i that faces cell j
            const jx = this.points[j * 2];
            const jy = this.points[j * 2 + 1];
            
            let bestEdge = null;
            let bestDist = Infinity;
            
            for (let e = 0; e < cellI.length - 1; e++) {
                const v1 = cellI[e];
                const v2 = cellI[e + 1];
                const midX = (v1[0] + v2[0]) / 2;
                const midY = (v1[1] + v2[1]) / 2;
                const dist = (midX - jx) ** 2 + (midY - jy) ** 2;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestEdge = [v1, v2];
                }
            }
            
            if (bestEdge) {
                ctx.moveTo(bestEdge[0][0], bestEdge[0][1]);
                ctx.lineTo(bestEdge[1][0], bestEdge[1][1]);
            }
        }
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
},




/**
 * Collect border edges between different kingdoms (reusable helper)
 */
_collectKingdomBorderEdges() {
    const borderEdges = [];
    const addedEdges = new Set();
    
    // Helper to create a unique key for an edge (order-independent)
    const edgeKey = (x1, y1, x2, y2) => {
        const k1 = `${Math.round(x1*10)},${Math.round(y1*10)}`;
        const k2 = `${Math.round(x2*10)},${Math.round(y2*10)}`;
        return k1 < k2 ? `${k1}-${k2}` : `${k2}-${k1}`;
    };
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        // Skip lake cells: they may have stale kingdom assignments from
        // before the lake was formed (e.g. user changed the lake slider
        // after kingdoms were generated). Drawing a border edge between
        // two lake-adjacent kingdom cells via the lake interior produces
        // visible strokes inside the water.
        if (this.lakeCells && this.lakeCells.has(i)) continue;
        
        const myKingdom = this.kingdoms[i];
        if (myKingdom < 0) continue;
        
        const cellI = this.voronoi.cellPolygon(i);
        if (!cellI || cellI.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        // For each edge of the cell
        for (let e = 0; e < cellI.length - 1; e++) {
            const v1 = cellI[e];
            const v2 = cellI[e + 1];
            const midX = (v1[0] + v2[0]) / 2;
            const midY = (v1[1] + v2[1]) / 2;
            
            // Find which neighbor this edge faces
            let closestNeighbor = -1;
            let closestDist = Infinity;
            
            for (const j of neighbors) {
                if (j < 0 || j >= this.cellCount) continue;
                const jx = this.points[j * 2];
                const jy = this.points[j * 2 + 1];
                const dist = (midX - jx) ** 2 + (midY - jy) ** 2;
                if (dist < closestDist) {
                    closestDist = dist;
                    closestNeighbor = j;
                }
            }
            
            if (closestNeighbor < 0) continue;
            
            // Check if this is a border with a different kingdom (not ocean, not lake)
            const neighborHeight = this.heights[closestNeighbor];
            if (neighborHeight < ELEVATION.SEA_LEVEL) continue; // Skip ocean borders
            // Skip lake-bordering edges too — same rationale as above
            if (this.lakeCells && this.lakeCells.has(closestNeighbor)) continue;
            
            const neighborKingdom = this.kingdoms[closestNeighbor];
            if (neighborKingdom < 0 || neighborKingdom === myKingdom) continue;
            
            // Add this edge if not already added
            const key = edgeKey(v1[0], v1[1], v2[0], v2[1]);
            if (!addedEdges.has(key)) {
                addedEdges.add(key);
                borderEdges.push({ x1: v1[0], y1: v1[1], x2: v2[0], y2: v2[1] });
            }
        }
    }
    
    return borderEdges;
},


/**
 * Build smooth coastline loops - reusable for all render modes
 */
_buildSmoothCoastlineLoops() {
    if (!this.heights) return [];
    
    // Collect all coastline edges
    const coastEdges = [];
    
    // Cells right on the map edge will have polygon edges that lie along
    // the map boundary. These edges have no Voronoi neighbour on the other
    // side — but the nearest-neighbour heuristic below still finds some
    // interior neighbour (which is land). To make the coastline loop close
    // properly when land runs off the edge of the map (e.g. isthmus preset),
    // we explicitly treat map-boundary edges of land cells as coastline.
    //
    // CORNER CELL CAVEAT: d3-delaunay clips polygons to the bbox; for a cell
    // whose unclipped polygon would extend past a corner, the clipping
    // produces a single DIAGONAL edge from one map edge to another (e.g.
    // (50, 0) → (0, 50)) without inserting the corner vertex (0, 0).
    // Such a diagonal isn't actually a coastline — but if we just skip it,
    // the coastline loop has a gap at the corner and the polygon-fill
    // algorithm closes it with a straight line, which produces the visible
    // triangular wedge across the corner.
    //
    // Fix: when a land cell has a diagonal corner-clip edge (endpoints on
    // different map edges that share a corner), DECOMPOSE it into two edges
    // that route through the corner vertex, e.g. (50,0)→(0,0)→(0,50). The
    // chain algorithm then walks around the corner correctly.
    const W = this.width;
    const H = this.height;
    const EDGE_TOL = 0.5;
    const onLeft   = (x, y) => x <= EDGE_TOL;
    const onRight  = (x, y) => x >= W - EDGE_TOL;
    const onTop    = (x, y) => y <= EDGE_TOL;
    const onBottom = (x, y) => y >= H - EDGE_TOL;
    const sameMapEdge = (x1, y1, x2, y2) =>
        (onLeft(x1, y1)   && onLeft(x2, y2))   ||
        (onRight(x1, y1)  && onRight(x2, y2))  ||
        (onTop(x1, y1)    && onTop(x2, y2))    ||
        (onBottom(x1, y1) && onBottom(x2, y2));
    
    // Returns the corner [cx, cy] shared by the map edges containing the
    // two endpoints, or null if the endpoints aren't on adjacent edges
    // (i.e. one on top and one on bottom — which shouldn't happen for a
    // single cell polygon edge).
    const sharedCorner = (x1, y1, x2, y2) => {
        const e1Left = onLeft(x1, y1), e1Right = onRight(x1, y1);
        const e1Top  = onTop(x1, y1),  e1Bottom = onBottom(x1, y1);
        const e2Left = onLeft(x2, y2), e2Right = onRight(x2, y2);
        const e2Top  = onTop(x2, y2),  e2Bottom = onBottom(x2, y2);
        // Top-left corner: one on top, the other on left
        if ((e1Top    && e2Left) || (e2Top    && e1Left))   return [0, 0];
        if ((e1Top    && e2Right) || (e2Top    && e1Right)) return [W, 0];
        if ((e1Bottom && e2Left) || (e2Bottom && e1Left))   return [0, H];
        if ((e1Bottom && e2Right) || (e2Bottom && e1Right)) return [W, H];
        return null;
    };
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            // If both endpoints sit on the SAME edge of the map (top/bottom/
            // left/right), this is a map-edge coastline of a land cell —
            // treat as coast so the loop closes by walking along that edge.
            if (sameMapEdge(v1[0], v1[1], v2[0], v2[1])) {
                coastEdges.push([v1[0], v1[1], v2[0], v2[1]]);
                continue;
            }
            
            // If endpoints are on adjacent map edges (e.g. top + left), this
            // is a diagonal corner-clip edge of a land cell. Replace it with
            // two virtual edges that route through the corner vertex, so the
            // coastline chain walks around the corner instead of cutting it
            // off with a diagonal.
            const corner = sharedCorner(v1[0], v1[1], v2[0], v2[1]);
            if (corner !== null) {
                coastEdges.push([v1[0], v1[1], corner[0], corner[1]]);
                coastEdges.push([corner[0], corner[1], v2[0], v2[1]]);
                continue;
            }
            
            const edgeMidX = (v1[0] + v2[0]) / 2;
            const edgeMidY = (v1[1] + v2[1]) / 2;
            
            let neighborIdx = -1;
            let minDist = Infinity;
            
            for (const n of neighbors) {
                const nx = this.points[n * 2];
                const ny = this.points[n * 2 + 1];
                const dist = Math.hypot(nx - edgeMidX, ny - edgeMidY);
                if (dist < minDist) {
                    minDist = dist;
                    neighborIdx = n;
                }
            }
            
            const isCoast = neighborIdx < 0 || this.heights[neighborIdx] < ELEVATION.SEA_LEVEL;
            
            if (isCoast) {
                coastEdges.push([v1[0], v1[1], v2[0], v2[1]]);
            }
        }
    }
    
    // Chain edges into paths using vertex adjacency
    const vertexKey = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
    const adjacency = new Map();
    
    for (const edge of coastEdges) {
        const k1 = vertexKey(edge[0], edge[1]);
        const k2 = vertexKey(edge[2], edge[3]);
        
        if (!adjacency.has(k1)) adjacency.set(k1, []);
        if (!adjacency.has(k2)) adjacency.set(k2, []);
        
        adjacency.get(k1).push({ x: edge[2], y: edge[3], key: k2, fromX: edge[0], fromY: edge[1] });
        adjacency.get(k2).push({ x: edge[0], y: edge[1], key: k1, fromX: edge[2], fromY: edge[3] });
    }
    
    // Build closed loops using angle-based edge selection
    const usedEdges = new Set();
    const loops = [];
    
    for (const [startKey, startNeighbors] of adjacency) {
        if (startNeighbors.length === 0) continue;
        
        for (const firstNeighbor of startNeighbors) {
            const edgeId = startKey < firstNeighbor.key ? 
                `${startKey}|${firstNeighbor.key}` : `${firstNeighbor.key}|${startKey}`;
            
            if (usedEdges.has(edgeId)) continue;
            usedEdges.add(edgeId);
            
            const [sx, sy] = startKey.split(',').map(n => parseInt(n) / 10);
            const loop = [[sx, sy], [firstNeighbor.x, firstNeighbor.y]];
            
            let prevX = sx;
            let prevY = sy;
            let currentKey = firstNeighbor.key;
            let currentX = firstNeighbor.x;
            let currentY = firstNeighbor.y;
            
            for (let iter = 0; iter < 50000; iter++) {
                const neighbors = adjacency.get(currentKey);
                if (!neighbors) break;
                
                // Calculate incoming direction
                const inAngle = Math.atan2(currentY - prevY, currentX - prevX);
                
                // Find the best next edge (smallest left turn = most clockwise = follows coastline)
                let bestNext = null;
                let bestAngleDiff = Infinity;
                
                for (const next of neighbors) {
                    const nextEdgeId = currentKey < next.key ? 
                        `${currentKey}|${next.key}` : `${next.key}|${currentKey}`;
                    
                    if (usedEdges.has(nextEdgeId)) continue;
                    
                    // Calculate outgoing direction
                    const outAngle = Math.atan2(next.y - currentY, next.x - currentX);
                    
                    // Calculate turn angle (positive = left turn, negative = right turn)
                    let angleDiff = outAngle - inAngle;
                    // Normalize to [-PI, PI]
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    
                    // We want the smallest left turn (or largest right turn)
                    // This keeps us going around the coastline consistently
                    // Use negative angle diff to prefer right turns (clockwise)
                    const score = -angleDiff;
                    
                    if (bestNext === null || score > bestAngleDiff) {
                        bestAngleDiff = score;
                        bestNext = next;
                    }
                }
                
                if (!bestNext) break;
                
                const nextEdgeId = currentKey < bestNext.key ? 
                    `${currentKey}|${bestNext.key}` : `${bestNext.key}|${currentKey}`;
                usedEdges.add(nextEdgeId);
                loop.push([bestNext.x, bestNext.y]);
                
                prevX = currentX;
                prevY = currentY;
                currentKey = bestNext.key;
                currentX = bestNext.x;
                currentY = bestNext.y;
                
                if (currentKey === startKey) break;
            }
            
            // Only keep loops that are properly closed and have reasonable size
            if (loop.length >= 4) {
                // Check if loop closes properly
                const lastPt = loop[loop.length - 1];
                const firstPt = loop[0];
                const closesDist = Math.hypot(lastPt[0] - firstPt[0], lastPt[1] - firstPt[1]);
                if (closesDist < 5) { // Only keep closed loops
                    loops.push(loop);
                }
            }
        }
    }
    
    // Coastline detail comes from cell-level subdivision performed
    // during heightmap generation (see _subdivideCoastlineCells in
    // voronoi-generator.js) — the rendered loops just trace the
    // resulting cell graph honestly.
    return loops;
},

/**
 * Draw smooth coastline stroke
 */
_drawSmoothCoastStroke(ctx, loops, strokeColor, lineWidth) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    for (const loop of loops) {
        ctx.beginPath();
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
    }
},


// Canvas-based city icon code (the seven _drawCityIcon subtypes
// plus _renderCities) was removed — settlements are now rendered
// as plain SVG circles via _updateCitySVG. See git history for the
// detailed icon implementations if they're ever needed again.


/**
 * Render roads connecting cities
 */
/**
 * Update SVG overlay with road paths
 */
_updateRoadSVG() {
    const svg = document.getElementById('road-svg');
    if (!svg) return;
    
    // Show SVG (may have been hidden during low-res render)
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    if (!this.roads || this.roads.length === 0) return;
    
    const zoom = this.viewport.zoom;
    if (zoom < 0.5) return;
    
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // The road list is consolidated by _consolidateRoadNetwork at the
    // end of generation: every cell-edge belongs to exactly one road,
    // tagged with the highest tier that originally used it. So we can
    // just draw each road as its own <path> with no dedup logic — there
    // are no overlapping cells to deduplicate.
    
    for (const road of this.roads) {
        const path = road.path;
        if (!path || path.length < 2) continue;
        
        const points = path.map(p => ({ x: p.x, y: p.y }));
        const simplified = this._simplifyPath(points, 3);
        if (simplified.length < 2) continue;
        const d = this._buildRoadSVGPath(simplified);
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        
        // Style by road type
        let strokeWidth, dashLength, gapLength, customColor = null;
        if (road.type === 'trade') {
            strokeWidth = 1.4;
            dashLength = 0;
            gapLength = 0;
            customColor = 'rgb(96, 78, 60)';
        } else if (road.type === 'major') {
            strokeWidth = 0.9;
            dashLength = 2;
            gapLength = 1.2;
        } else if (road.type === 'pass') {
            strokeWidth = 0.6;
            dashLength = 1;
            gapLength = 2.5;
        } else {
            strokeWidth = 0.7;
            dashLength = 1;
            gapLength = 2;
        }
        
        pathEl.setAttribute('stroke-width', strokeWidth);
        if (dashLength > 0) {
            pathEl.setAttribute('stroke-dasharray', `${dashLength} ${gapLength}`);
        }
        if (customColor) {
            pathEl.setAttribute('stroke', customColor);
        }
        pathEl.setAttribute('class', `road-${road.type || 'minor'}`);
        
        g.appendChild(pathEl);
    }
    
    svg.appendChild(g);
},

/**
 * Update SVG overlay with sea routes
 */
_updateSeaRouteSVG() {
    const svg = document.getElementById('sea-route-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    if (!this.seaRoutes || this.seaRoutes.length === 0) return;
    
    const zoom = this.viewport.zoom;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Draw each sea route. We smooth the polyline (which follows actual
    // ocean cells from A*) using quadratic Beziers through midpoints — each
    // path point becomes a control point and the curves pass through the
    // midpoint of consecutive segments. This turns the cell-grid jaggedness
    // into a flowing curve that suggests a sailing route.
    for (const route of this.seaRoutes) {
        const path = route.path;
        if (!path || path.length < 2) continue;
        
        let d;
        if (path.length === 2) {
            // Just a straight line for two-point paths
            d = `M ${path[0].x} ${path[0].y} L ${path[1].x} ${path[1].y}`;
        } else {
            // Smoothed: M to first, then quadratic Beziers using each
            // middle point as a control and the midpoint to the next
            // as the curve endpoint. End with a final straight segment
            // to the actual last point.
            d = `M ${path[0].x} ${path[0].y}`;
            for (let i = 1; i < path.length - 1; i++) {
                const cx = path[i].x, cy = path[i].y;
                const mx = (path[i].x + path[i + 1].x) / 2;
                const my = (path[i].y + path[i + 1].y) / 2;
                d += ` Q ${cx} ${cy} ${mx} ${my}`;
            }
            d += ` L ${path[path.length - 1].x} ${path[path.length - 1].y}`;
        }
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', '#7A9AAA');
        pathEl.setAttribute('stroke-width', '0.8');
        pathEl.setAttribute('stroke-dasharray', '3 2');
        pathEl.setAttribute('stroke-linecap', 'round');
        pathEl.setAttribute('class', 'sea-route');
        
        g.appendChild(pathEl);
    }
    
    svg.appendChild(g);
},

/**
 * Update SVG overlay with coastline paths
 */
_updateCoastlineSVG() {
    const svg = document.getElementById('coastline-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    // Build coastline cache if needed
    if (!this._coastlineCache) {
        this._coastlineCache = this._buildSmoothCoastlineLoops();
    }
    
    const coastLoops = this._coastlineCache;
    if (!coastLoops || coastLoops.length === 0) return;
    
    const zoom = this.viewport.zoom;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Coastline style. When showCoastline is on, draw the real visible coast
    // (dark warm tan). When off, we still draw a stroke at the same place
    // but in the ambient ocean color, which hides the 1-2px antialiasing seam
    // that appears between the canvas-painted land and the SVG-painted kingdom
    // fills. Without this seam-filler, turning coastline off reveals a thin
    // pale border around every coast.
    let strokeColor;
    if (this.showCoastline) {
        strokeColor = '#A89880';
    } else {
        // Match the ocean color of whatever render mode we're in so the seam
        // blends invisibly into the surrounding water.
        const isPolitical = this.renderMode === 'political' || this.renderMode === 'political-terrain';
        strokeColor = isPolitical ? POLITICAL_OCEAN : OCEAN_COLORS[0];
    }
    const strokeWidth = 0.5; // Fixed width in world units
    
    // Draw each coastline loop as a path
    for (const loop of coastLoops) {
        if (loop.length < 3) continue;
        
        // Build SVG path string
        let d = `M ${loop[0][0]} ${loop[0][1]}`;
        for (let i = 1; i < loop.length; i++) {
            d += ` L ${loop[i][0]} ${loop[i][1]}`;
        }
        d += ' Z'; // Close path
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', strokeColor);
        pathEl.setAttribute('stroke-width', strokeWidth);
        pathEl.setAttribute('stroke-linejoin', 'round');
        pathEl.setAttribute('stroke-linecap', 'round');
        
        g.appendChild(pathEl);
    }
    
    svg.appendChild(g);
},

/**
 * Render thin border strokes around each lake, into the coastline SVG layer.
 *
 * Mirrors _updateCoastlineSVG but for lake-cell boundaries. Each edge between
 * a lake cell and a non-lake neighbour gets a line drawn. The result is a
 * crisp shoreline matching the coastline style.
 *
 * Gate this on `this.showCoastline` — when the user toggles coastline off,
 * lake borders should also disappear.
 *
 * Designed to be called RIGHT AFTER _updateCoastlineSVG so both render into
 * the same SVG group, sharing transform / zoom.
 */
_updateLakeBordersSVG() {
    if (!this.lakeCells || this.lakeCells.size === 0) return;
    
    const svg = document.getElementById('coastline-svg');
    if (!svg) return;
    
    // Find the existing transform group inside the SVG (created by
    // _updateCoastlineSVG). If the user has coastline disabled, the group
    // won't exist; we'd need to create our own. But we gate this whole
    // function on `this.showCoastline` from the caller, so by the time we
    // get here the group is guaranteed to exist.
    const g = svg.querySelector('g');
    if (!g) return;
    
    // Same style as coastline so they read as a unified shoreline language
    const strokeColor = '#A89880';
    const strokeWidth = 0.5;
    
    // Walk every lake cell, emit segments where neighbour is not also a lake cell.
    // Build a single SVG <path> with all border segments — much faster than
    // creating one path element per edge.
    let d = '';
    
    for (const cellIdx of this.lakeCells) {
        const cell = this.voronoi.cellPolygon(cellIdx);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(cellIdx));
        
        for (let e = 0; e < cell.length - 1; e++) {
            const v1 = cell[e];
            const v2 = cell[e + 1];
            const midX = (v1[0] + v2[0]) / 2;
            const midY = (v1[1] + v2[1]) / 2;
            
            // Find which neighbour cell this edge faces (cheapest: nearest centroid)
            let nearestN = -1;
            let nearestD = Infinity;
            for (const n of neighbors) {
                const nx = this.points[n * 2];
                const ny = this.points[n * 2 + 1];
                const d2 = (nx - midX) ** 2 + (ny - midY) ** 2;
                if (d2 < nearestD) {
                    nearestD = d2;
                    nearestN = n;
                }
            }
            
            // If neighbour exists AND is also a lake cell, this is interior — skip
            if (nearestN >= 0 && this.lakeCells.has(nearestN)) continue;
            
            d += `M ${v1[0]} ${v1[1]} L ${v2[0]} ${v2[1]} `;
        }
    }
    
    if (d.length === 0) return;
    
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', strokeColor);
    pathEl.setAttribute('stroke-width', strokeWidth);
    pathEl.setAttribute('stroke-linejoin', 'round');
    pathEl.setAttribute('stroke-linecap', 'round');
    
    g.appendChild(pathEl);
},

/**
 * Simplify path using Douglas-Peucker algorithm
 */
_simplifyPath(points, tolerance) {
    if (points.length <= 2) return points;
    
    // Find point with maximum distance from line between first and last
    let maxDist = 0;
    let maxIdx = 0;
    
    const first = points[0];
    const last = points[points.length - 1];
    
    for (let i = 1; i < points.length - 1; i++) {
        const dist = this._pointToLineDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }
    
    // If max distance is greater than tolerance, recursively simplify
    if (maxDist > tolerance) {
        const left = this._simplifyPath(points.slice(0, maxIdx + 1), tolerance);
        const right = this._simplifyPath(points.slice(maxIdx), tolerance);
        return left.slice(0, -1).concat(right);
    } else {
        return [first, last];
    }
},

/**
 * Calculate perpendicular distance from point to line
 */
_pointToLineDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
},

/**
 * Build SVG path with gentle quadratic curves at corners
 */
_buildRoadSVGPath(points) {
    if (points.length < 2) return '';
    
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    
    // Use straight lines with rounded corners
    let d = `M ${points[0].x} ${points[0].y}`;
    
    const cornerRadius = 5; // Small radius for gentle curves at corners
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        // Direction vectors
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        // Skip if segments are too short
        if (len1 < 1 || len2 < 1) {
            d += ` L ${curr.x} ${curr.y}`;
            continue;
        }
        
        // Calculate how far back to start the curve
        const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
        
        // Points where curve starts and ends
        const startX = curr.x - (dx1 / len1) * r;
        const startY = curr.y - (dy1 / len1) * r;
        const endX = curr.x + (dx2 / len2) * r;
        const endY = curr.y + (dy2 / len2) * r;
        
        // Line to curve start, then quadratic curve through corner
        d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
    }
    
    // Final line to last point
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    
    return d;
},




/**
 * Generate and cache contour paths for the entire map
 */
_generateContourCache() {
    // Don't generate if dependencies are missing
    if (!this.heights || !this.delaunay) {
        return;
    }
    
    const startTime = performance.now();
    
    // Initialize cache
    this._contourCache = [];
    
    try {
        // Fixed grid size for caching (covers whole map)
        const gridSize = 8;
        const gridWidth = Math.ceil(this.width / gridSize) + 2;
        const gridHeight = Math.ceil(this.height / gridSize) + 2;
        
        // Sample heights onto grid
        const grid = new Float32Array(gridWidth * gridHeight);
        
        for (let gy = 0; gy < gridHeight; gy++) {
            for (let gx = 0; gx < gridWidth; gx++) {
                const worldX = gx * gridSize;
                const worldY = gy * gridSize;
                const height = this._sampleHeightAt(worldX, worldY);
                grid[gy * gridWidth + gx] = height;
            }
        }
        
        // Contour levels
        const contourLevels = [100, 175, 250, 350, 450, 550, 700, 850, 1000, 1200, 1400, 1700, 2000, 2400, 2800];
        
        for (const level of contourLevels) {
            const segments = [];
        
        // Marching squares for this level
        for (let gy = 0; gy < gridHeight - 1; gy++) {
            for (let gx = 0; gx < gridWidth - 1; gx++) {
                const tl = grid[gy * gridWidth + gx];
                const tr = grid[gy * gridWidth + gx + 1];
                const bl = grid[(gy + 1) * gridWidth + gx];
                const br = grid[(gy + 1) * gridWidth + gx + 1];
                
                if (tl < 0 || tr < 0 || bl < 0 || br < 0) continue;
                
                let caseIndex = 0;
                if (tl >= level) caseIndex |= 1;
                if (tr >= level) caseIndex |= 2;
                if (br >= level) caseIndex |= 4;
                if (bl >= level) caseIndex |= 8;
                
                if (caseIndex === 0 || caseIndex === 15) continue;
                
                const x0 = gx * gridSize;
                const y0 = gy * gridSize;
                const x1 = x0 + gridSize;
                const y1 = y0 + gridSize;
                
                const lerp = (a, b, va, vb) => a + (level - va) / (vb - va) * (b - a);
                
                const top = { x: lerp(x0, x1, tl, tr), y: y0 };
                const right = { x: x1, y: lerp(y0, y1, tr, br) };
                const bottom = { x: lerp(x0, x1, bl, br), y: y1 };
                const left = { x: x0, y: lerp(y0, y1, tl, bl) };
                
                switch (caseIndex) {
                    case 1: case 14: segments.push([left, top]); break;
                    case 2: case 13: segments.push([top, right]); break;
                    case 3: case 12: segments.push([left, right]); break;
                    case 4: case 11: segments.push([right, bottom]); break;
                    case 5:
                        segments.push([left, top]);
                        segments.push([right, bottom]);
                        break;
                    case 6: case 9: segments.push([top, bottom]); break;
                    case 7: case 8: segments.push([left, bottom]); break;
                    case 10:
                        segments.push([top, right]);
                        segments.push([left, bottom]);
                        break;
                }
            }
        }
        
        if (segments.length === 0) continue;
        
        const paths = this._connectContourSegments(segments);
        
        if (paths.length > 0) {
            this._contourCache.push({ level, paths });
        }
    }
    
    } catch (e) {
        console.warn('Failed to generate contour cache:', e);
        this._contourCache = [];
    }
},

/**
 * Sample height at a world position using spatial grid lookup
 */
_sampleHeightAt(x, y) {
    // Quick bounds check
    if (x < 0 || x > this.width || y < 0 || y > this.height) {
        return -1000;
    }
    
    // Guard against missing delaunay
    if (!this.delaunay) {
        return -1000;
    }
    
    // Use Delaunay to find containing triangle (fast point location)
    const cellIdx = this.voronoi.find(x, y);
    if (cellIdx < 0 || cellIdx >= this.cellCount) {
        return -1000;
    }
    
    // Get height of nearest cell and its neighbors for interpolation
    const h0 = this.heights[cellIdx];
    const neighbors = this.getNeighbors(cellIdx);
    
    if (neighbors.length < 2) {
        return h0;
    }
    
    // Weighted average based on distance
    const cx = this.points[cellIdx * 2];
    const cy = this.points[cellIdx * 2 + 1];
    const d0 = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) + 0.1;
    
    let totalWeight = 1 / d0;
    let weightedHeight = h0 / d0;
    
    for (const ni of neighbors) {
        const nx = this.points[ni * 2];
        const ny = this.points[ni * 2 + 1];
        const dist = Math.sqrt((x - nx) * (x - nx) + (y - ny) * (y - ny)) + 0.1;
        const weight = 1 / dist;
        
        weightedHeight += this.heights[ni] * weight;
        totalWeight += weight;
    }
    
    return weightedHeight / totalWeight;
},

/**
 * Connect contour segments into continuous paths
 */
_connectContourSegments(segments) {
    if (segments.length === 0) return [];
    
    const paths = [];
    const used = new Array(segments.length).fill(false);
    const tolerance = 0.5;
    
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    
    for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        
        const path = [...segments[i]];
        used[i] = true;
        
        // Extend forward
        let extended = true;
        while (extended) {
            extended = false;
            const end = path[path.length - 1];
            
            for (let j = 0; j < segments.length; j++) {
                if (used[j]) continue;
                
                const seg = segments[j];
                if (dist(end, seg[0]) < tolerance) {
                    path.push(seg[1]);
                    used[j] = true;
                    extended = true;
                    break;
                } else if (dist(end, seg[1]) < tolerance) {
                    path.push(seg[0]);
                    used[j] = true;
                    extended = true;
                    break;
                }
            }
        }
        
        // Extend backward
        extended = true;
        while (extended) {
            extended = false;
            const start = path[0];
            
            for (let j = 0; j < segments.length; j++) {
                if (used[j]) continue;
                
                const seg = segments[j];
                if (dist(start, seg[1]) < tolerance) {
                    path.unshift(seg[0]);
                    used[j] = true;
                    extended = true;
                    break;
                } else if (dist(start, seg[0]) < tolerance) {
                    path.unshift(seg[1]);
                    used[j] = true;
                    extended = true;
                    break;
                }
            }
        }
        
        if (path.length >= 2) {
            paths.push(path);
        }
    }
    
    return paths;
},

/**
 * Find the best position for a kingdom label.
 *
 * Algorithm overview:
 *   1. Build a fine raster occupancy grid of the kingdom by sampling
 *      each grid cell's center against the Voronoi diagram. The grid
 *      resolution scales with kingdom size so small kingdoms get fine
 *      sampling and big kingdoms don't waste work on excessive detail.
 *   2. Compute a 2-pass distance transform — for every inside cell,
 *      the chamfer distance (in grid units) to the nearest outside
 *      cell. This is THE interior-distance metric; it handles concave
 *      shapes, holes (lakes!), and disconnected coastlines correctly,
 *      unlike the prior cell-center-only "boundary" approach.
 *   3. Estimate a target label rectangle (width × height in world
 *      units) given the kingdom's size and the desired font.
 *   4. For each inside grid cell, *score* it as a candidate label
 *      anchor. The score combines: how interior the WORST corner of
 *      the proposed label rectangle would be, a centrality bonus
 *      pulling toward the kingdom centroid, and a penalty for being
 *      near city/capital markers. The corner test is what makes this
 *      rectangle-aware — points where the rectangle would clip outside
 *      the kingdom or off the map are scored low even if their own
 *      grid cell is deeply interior.
 *   5. Return the highest-scoring candidate. Caller may shrink the
 *      font and retry if the best score is still too low for the
 *      requested label size.
 *
 * Returns: { centerX, centerY, spanWidth, regionWidth, regionHeight,
 *            minX, maxX, minY, maxY, score, gridStep, distanceField,
 *            gridOriginX, gridOriginY, gridW, gridH }
 * The grid metadata is included so the caller can call
 * `_kingdomLabelFits(...)` to test whether a smaller font would fit
 * better at a given location, without recomputing the field.
 */
_findBestKingdomLabelPosition(cells, kingdomId) {
    if (!cells || cells.length === 0) return null;
    
    // Step 1: Find connected components and pick the largest. Disconnected
    // territories are common (offshore islands belonging to a mainland
    // kingdom); the label always goes on the biggest landmass.
    const components = this._findConnectedComponents(cells);
    if (components.length === 0) return null;
    let largestComponent = components[0];
    for (const comp of components) {
        if (comp.length > largestComponent.length) largestComponent = comp;
    }
    const componentSet = new Set(largestComponent);
    
    // Step 2: Bounding box + centroid of the chosen component
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;
    for (const cellIdx of largestComponent) {
        const x = this.points[cellIdx * 2];
        const y = this.points[cellIdx * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
    }
    const regionWidth  = maxX - minX;
    const regionHeight = maxY - minY;
    const centroidX = sumX / largestComponent.length;
    const centroidY = sumY / largestComponent.length;
    
    // Step 3: Build occupancy grid. Resolution chosen so the grid is
    // around 60×60 for medium kingdoms. Bigger kingdoms get finer
    // granularity (capped at 100×100 to avoid quadratic blow-up on
    // continent-sized empires); tiny kingdoms get a floor of 24×24
    // so we still get a usable distance field.
    const targetCells = 60;
    const longSide = Math.max(regionWidth, regionHeight);
    const shortSide = Math.min(regionWidth, regionHeight);
    let gridStep = longSide / targetCells;
    // Clamp: small kingdoms might have a long side under 100px so
    // the step would be too small. Force a max grid extent of 100.
    const aspect = longSide / Math.max(1, shortSide);
    const gridW = Math.min(100, Math.max(24, Math.ceil(regionWidth / gridStep) + 1));
    const gridH = Math.min(100, Math.max(24, Math.ceil(regionHeight / gridStep) + 1));
    // Recompute gridStep based on clamped dimensions to keep it consistent
    const stepX = regionWidth / Math.max(1, gridW - 1);
    const stepY = regionHeight / Math.max(1, gridH - 1);
    gridStep = (stepX + stepY) / 2;
    
    // Sample occupancy. inside[gx + gy * gridW] = 1 if that grid point
    // lies in our kingdom component, 0 otherwise.
    const inside = new Uint8Array(gridW * gridH);
    for (let gy = 0; gy < gridH; gy++) {
        const py = minY + gy * stepY;
        for (let gx = 0; gx < gridW; gx++) {
            const px = minX + gx * stepX;
            const nearest = this.voronoi.find(px, py);
            if (componentSet.has(nearest)) inside[gx + gy * gridW] = 1;
        }
    }
    
    // Step 4: Distance transform via two-pass chamfer (3-4 metric).
    // Output: dist[idx] = chamfer distance in grid units to nearest
    // outside cell. Outside cells get distance 0.
    const dist = new Float32Array(gridW * gridH);
    const FAR = 1e9;
    for (let i = 0; i < dist.length; i++) {
        dist[i] = inside[i] ? FAR : 0;
    }
    // Forward pass (top-left → bottom-right)
    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            const idx = gx + gy * gridW;
            if (!inside[idx]) continue;
            let d = dist[idx];
            if (gx > 0)            d = Math.min(d, dist[idx - 1]       + 3);
            if (gy > 0)            d = Math.min(d, dist[idx - gridW]   + 3);
            if (gx > 0 && gy > 0)  d = Math.min(d, dist[idx - 1 - gridW] + 4);
            if (gx < gridW - 1 && gy > 0) d = Math.min(d, dist[idx + 1 - gridW] + 4);
            dist[idx] = d;
        }
    }
    // Backward pass (bottom-right → top-left)
    for (let gy = gridH - 1; gy >= 0; gy--) {
        for (let gx = gridW - 1; gx >= 0; gx--) {
            const idx = gx + gy * gridW;
            if (!inside[idx]) continue;
            let d = dist[idx];
            if (gx < gridW - 1)               d = Math.min(d, dist[idx + 1]       + 3);
            if (gy < gridH - 1)               d = Math.min(d, dist[idx + gridW]   + 3);
            if (gx < gridW - 1 && gy < gridH - 1) d = Math.min(d, dist[idx + 1 + gridW] + 4);
            if (gx > 0 && gy < gridH - 1)     d = Math.min(d, dist[idx - 1 + gridW] + 4);
            dist[idx] = d;
        }
    }
    
    // Step 5: Estimate desired label rectangle.
    //
    // The caller doesn't tell us its font size yet (font size depends on
    // available span, chicken-and-egg). So we estimate using the same
    // formula the renderer uses and iterate down if no good fit exists.
    // We START with the largest plausible label — this gives us a useful
    // signal of "where would the largest label fit best?" — then if the
    // best score is too low, retry with a smaller estimate.
    const name = (this.kingdomNames && this.kingdomNames[kingdomId]) || '';
    const { mainName } = this._parseKingdomName(name);
    const displayLen = (mainName || name).length;
    
    // Cities & capitals to avoid (in WORLD coordinates)
    const citiesToAvoid = [];
    if (this.capitols && this.capitols[kingdomId] >= 0) {
        const cc = this.capitols[kingdomId];
        citiesToAvoid.push({ x: this.points[cc * 2], y: this.points[cc * 2 + 1], r: 30 });
    }
    if (this.cities) {
        for (const city of this.cities) {
            if (city.kingdom === kingdomId) {
                citiesToAvoid.push({
                    x: this.points[city.cell * 2],
                    y: this.points[city.cell * 2 + 1],
                    r: 18
                });
            }
        }
    }
    
    // Try several font sizes from largest plausible to a floor.
    // The actual ratio of label-width/height is roughly (chars × 0.65) / 1
    // for an uppercase serif at letter-spacing 0.12em; we use that to
    // build a label rectangle in world units at each trial font.
    const trialFonts = [22, 18, 14, 11, 8, 6, 5];
    let best = null;
    
    for (const fontSize of trialFonts) {
        const labelW = Math.max(1, displayLen) * fontSize * 0.65;
        const labelH = fontSize * 1.1;  // 1 line height
        // Half-extents in grid units
        const hwGrid = (labelW / 2) / gridStep;
        const hhGrid = (labelH / 2) / gridStep;
        // For corner test: the label is "fitting" if dist[center] >=
        // chamferDistance(hwGrid, hhGrid). We compute the chamfer-equivalent
        // of the half-diagonal: chamfer distance for a Δ=(hwGrid, hhGrid)
        // step is min(hw, hh)*4 + (max(hw,hh) - min(hw,hh))*3 — i.e. travel
        // diagonally as far as possible, then orthogonally for the remainder.
        const a = Math.min(hwGrid, hhGrid);
        const b = Math.max(hwGrid, hhGrid);
        const requiredDist = a * 4 + (b - a) * 3;
        
        // Search every interior grid cell for the best candidate.
        let bestScore = -Infinity;
        let bestGx = -1, bestGy = -1;
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const idx = gx + gy * gridW;
                if (!inside[idx]) continue;
                const d = dist[idx];
                if (d < requiredDist) continue;  // label rectangle would clip outside the kingdom
                
                const wx = minX + gx * stepX;
                const wy = minY + gy * stepY;
                
                // Score components:
                //   - "fitness" = d - requiredDist : how much extra interior
                //     room beyond the bare minimum the label needs. Bigger
                //     is better; this is the dominant term.
                //   - centrality bonus: small pull toward (centroidX, centroidY)
                //     to break ties between equally-fit positions in favor
                //     of more "obvious" placements.
                //   - city penalty: subtract for proximity to known markers.
                let score = (d - requiredDist);
                
                const cdx = wx - centroidX;
                const cdy = wy - centroidY;
                const distFromCenter = Math.sqrt(cdx * cdx + cdy * cdy);
                // Centrality is at most 1/4 of typical "fitness" range, so
                // it influences ties without overriding genuine fit quality.
                const diagonal = Math.sqrt(regionWidth * regionWidth + regionHeight * regionHeight);
                score -= (distFromCenter / Math.max(1, diagonal)) * (requiredDist * 0.25);
                
                // City penalty
                let cityPenalty = 0;
                for (const c of citiesToAvoid) {
                    const ddx = wx - c.x, ddy = wy - c.y;
                    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dd < c.r + labelH / 2) {
                        // close to a city — penalize proportionally to overlap
                        cityPenalty += (c.r + labelH / 2 - dd) / gridStep;
                    }
                }
                score -= cityPenalty;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestGx = gx;
                    bestGy = gy;
                }
            }
        }
        
        if (bestGx >= 0) {
            best = {
                centerX: minX + bestGx * stepX,
                centerY: minY + bestGy * stepY,
                fontSize: fontSize,
                score: bestScore,
                spanWidth: labelW,        // we already verified the label fits
                regionWidth, regionHeight,
                componentSize: largestComponent.length,
                minX, maxX, minY, maxY
            };
            break;  // first font size that produces ANY fit wins
        }
    }
    
    // If no font fits at all (very tiny kingdom), fall back to centroid
    // with a tiny font; better to render something off-shape than nothing.
    if (!best) {
        best = {
            centerX: centroidX,
            centerY: centroidY,
            fontSize: 5,
            score: 0,
            spanWidth: regionWidth * 0.6,
            regionWidth, regionHeight,
            componentSize: largestComponent.length,
            minX, maxX, minY, maxY
        };
    }
    
    return best;
},

/**
 * Find connected components of kingdom cells using flood fill
 */
_findConnectedComponents(cells) {
    const cellSet = new Set(cells);
    const visited = new Set();
    const components = [];
    
    for (const startCell of cells) {
        if (visited.has(startCell)) continue;
        
        // BFS to find connected component (head pointer, no .shift())
        const component = [];
        const queue = [startCell];
        let qHead = 0;
        visited.add(startCell);
        
        while (qHead < queue.length) {
            const cell = queue[qHead++];
            component.push(cell);
            
            for (const neighbor of this.voronoi.neighbors(cell)) {
                if (cellSet.has(neighbor) && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        
        if (component.length > 0) {
            components.push(component);
        }
    }
    
    return components;
},



/**
 * Parse kingdom name to extract prefix and main name
 */
_parseKingdomName(name) {
    // Sorted by length (longest first) to avoid partial matches.
    //
    // This list must include EVERY title used by the name generator,
    // including the per-culture titles (Tsardom, Jarldom, Tuath, etc.)
    // — otherwise this parser falls through to the "Realm of" default
    // and we end up with double-titled labels like
    // "Realm of Tsardom of Polek". When new cultures are added to
    // name-generator.js, their titles must also be added here.
    const prefixes = [
        // Multi-word universals (must come before single-word matches
        // that are substrings of them)
        'Grand Duchy of',
        'Principality of',
        'Confederation of',
        'Commonwealth of',
        'Protectorate of',
        'Margraviate of',
        'Landgraviate of',
        'Free City of',
        'Federation of',
        'Electorate of',
        'Archduchy of',
        // Per-culture (sorted longest-first within length-tier)
        'Voivodeship of',
        'Konungriki of',
        'Stronghold of',
        'Hegemony of',
        'Archonate of',
        'Sultanate of',
        'Caliphate of',
        'Shogunate of',
        'Tlatoani of',
        'Altepetl of',
        'Chiefdom of',
        'Knyazdom of',
        'Basileia of',
        'Republic of',
        'Dominion of',
        'Province of',
        'Emirate of',
        'Tsardom of',
        'Jarldom of',
        'Kingdom of',
        'Khanate of',
        'Satrapy of',
        'County of',
        'Barony of',
        'Empire of',
        'Throne of',
        'Warband of',
        'Oblast of',
        'League of',
        'Tyranny of',
        'Domain of',
        'Haven of',
        'Horde of',
        'Tuath of',
        'Duchy of',
        'Realm of',
        'March of',
        'Union of',
        'Crown of',
        'Lands of',
        'House of',
        'Krai of',
        'Hird of',
        'Hold of',
        'Wood of',
        'Clan of',
        'Tribe of',
        'Ri of'
    ];
    
    for (const prefix of prefixes) {
        if (name.startsWith(prefix + ' ')) {
            return {
                prefix: prefix,
                mainName: name.slice(prefix.length + 1)
            };
        }
    }
    
    // Fallback: bare-name kingdom (the generator emits these ~15% of
    // the time via style: 'simple'). Render with no prefix at all
    // rather than tacking on a generic "Realm of".
    return { prefix: '', mainName: name };
},

/**
 * Render borders between kingdoms - traditional map style
 * (coastline borders are handled separately by smooth coastline rendering)
 */
_renderKingdomBorders(ctx, bounds) {
    if (!this.kingdoms || !this.heights) return;
    
    const zoom = this.viewport.zoom;
    const borderWidth = Math.max(0.2, 0.5 / zoom);   // thinner than before
    
    // Build smooth coastline for clipping
    if (!this._coastlineCache) { this._coastlineCache = this._buildSmoothCoastlineLoops(); } const coastLoops = this._coastlineCache;
    
    // Collect border edges between different kingdoms (not coastlines, not lakes)
    const borderEdges = [];
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        // Skip lake cells: they may carry stale kingdom assignments from
        // before lakes were formed (e.g. the user changed the lake slider
        // after kingdoms were generated). Drawing border edges through
        // lake cells creates the visible inter-lake strokes you'd otherwise
        // see crossing the water.
        if (this.lakeCells && this.lakeCells.has(i)) continue;
        
        const myKingdom = this.kingdoms[i];
        if (myKingdom < 0) continue;
        
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            const edgeMidX = (v1[0] + v2[0]) / 2;
            const edgeMidY = (v1[1] + v2[1]) / 2;
            
            let edgeNeighbor = -1;
            let minDist = Infinity;
            for (const n of neighbors) {
                const nx = this.points[n * 2];
                const ny = this.points[n * 2 + 1];
                const distSq = (nx - edgeMidX) ** 2 + (ny - edgeMidY) ** 2;
                if (distSq < minDist) {
                    minDist = distSq;
                    edgeNeighbor = n;
                }
            }
            
            const neighborIsOcean = edgeNeighbor < 0 || this.heights[edgeNeighbor] < ELEVATION.SEA_LEVEL;
            const neighborIsLake = edgeNeighbor >= 0 && this.lakeCells && this.lakeCells.has(edgeNeighbor);
            const neighborKingdom = edgeNeighbor >= 0 ? this.kingdoms[edgeNeighbor] : -1;
            
            // Only collect border if different kingdom AND not coastline AND not lakeshore
            if (!neighborIsOcean && !neighborIsLake && neighborKingdom !== myKingdom && neighborKingdom >= 0) {
                // Create sorted key to avoid duplicates
                const k1 = Math.min(myKingdom, neighborKingdom);
                const k2 = Math.max(myKingdom, neighborKingdom);
                borderEdges.push({
                    x1: v1[0], y1: v1[1],
                    x2: v2[0], y2: v2[1],
                    kingdoms: `${k1}-${k2}`
                });
            }
        }
    }
    
    if (borderEdges.length === 0) return;
    
    // Chain edges into continuous paths and smooth them
    const smoothedPaths = this._buildSmoothBorderPaths(borderEdges);
    
    // Clip to coastline to avoid angular corners at the shore
    ctx.save();
    if (coastLoops.length > 0) {
        ctx.beginPath();
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[0][0], loop[0][1]);
            for (let i = 1; i < loop.length; i++) {
                ctx.lineTo(loop[i][0], loop[i][1]);
            }
            ctx.closePath();
        }
        ctx.clip();
    }
    
    // Draw smoothed borders — dashed atlas-style
    ctx.strokeStyle = 'rgba(101, 85, 60, 0.7)';
    ctx.lineWidth = borderWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Always dashed (atlas-map style). Dash scales with zoom so the visual
    // density stays consistent. Kept tight to read as "small dashes".
    const dashLength = Math.max(2, 3 / zoom);
    const gapLength = Math.max(1.5, 2.2 / zoom);
    ctx.setLineDash([dashLength, gapLength]);
    
    for (const path of smoothedPaths) {
        if (path.length < 2) continue;
        
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i][0], path[i][1]);
        }
        
        ctx.stroke();
    }
    
    // Reset dash
    ctx.setLineDash([]);
    ctx.restore();
},
/**
 * Build smooth border paths from edges
 */
_buildSmoothBorderPaths(edges) {
    if (edges.length === 0) return [];
    
    // Build adjacency graph
    const vertexKey = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
    const adjacency = new Map();
    
    for (const edge of edges) {
        const k1 = vertexKey(edge.x1, edge.y1);
        const k2 = vertexKey(edge.x2, edge.y2);
        
        if (!adjacency.has(k1)) adjacency.set(k1, []);
        if (!adjacency.has(k2)) adjacency.set(k2, []);
        
        adjacency.get(k1).push({ x: edge.x2, y: edge.y2, key: k2 });
        adjacency.get(k2).push({ x: edge.x1, y: edge.y1, key: k1 });
    }
    
    // Chain into paths
    const usedEdges = new Set();
    const paths = [];
    
    for (const [startKey, startNeighbors] of adjacency) {
        if (startNeighbors.length === 0) continue;
        
        for (const firstNeighbor of startNeighbors) {
            const edgeId = startKey < firstNeighbor.key ? 
                `${startKey}|${firstNeighbor.key}` : `${firstNeighbor.key}|${startKey}`;
            
            if (usedEdges.has(edgeId)) continue;
            usedEdges.add(edgeId);
            
            const [sx, sy] = startKey.split(',').map(n => parseInt(n) / 10);
            const path = [[sx, sy], [firstNeighbor.x, firstNeighbor.y]];
            
            let prevKey = startKey;
            let currentKey = firstNeighbor.key;
            
            // Follow the chain
            for (let iter = 0; iter < 10000; iter++) {
                const neighbors = adjacency.get(currentKey);
                if (!neighbors) break;
                
                let foundNext = false;
                for (const next of neighbors) {
                    if (next.key === prevKey) continue;
                    
                    const nextEdgeId = currentKey < next.key ? 
                        `${currentKey}|${next.key}` : `${next.key}|${currentKey}`;
                    
                    if (usedEdges.has(nextEdgeId)) continue;
                    
                    usedEdges.add(nextEdgeId);
                    path.push([next.x, next.y]);
                    
                    prevKey = currentKey;
                    currentKey = next.key;
                    foundNext = true;
                    break;
                }
                
                if (!foundNext) break;
                if (currentKey === startKey) break;
            }
            
            if (path.length >= 2) {
                paths.push(path);
            }
        }
    }
    
    // Apply smoothing to each path
    const smoothedPaths = [];
    for (const path of paths) {
        // Check if closed loop
        const isClosed = path.length > 3 && 
            Math.abs(path[0][0] - path[path.length-1][0]) < 1 &&
            Math.abs(path[0][1] - path[path.length-1][1]) < 1;
        
        let smoothed = path;
        // Apply 2 iterations of Chaikin smoothing
        for (let iter = 0; iter < 2; iter++) {
            smoothed = this._chaikinSmoothPath(smoothed, isClosed);
        }
        smoothedPaths.push(smoothed);
    }
    
    return smoothedPaths;
},
/**
 * Chaikin smoothing for open or closed paths
 */
_chaikinSmoothPath(points, closed = false) {
    if (points.length < 3) return points;
    
    const result = [];
    const n = points.length;
    
    if (closed) {
        // Closed path - smooth all segments including wrap-around
        for (let i = 0; i < n; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % n];
            
            result.push([
                p1[0] * 0.75 + p2[0] * 0.25,
                p1[1] * 0.75 + p2[1] * 0.25
            ]);
            result.push([
                p1[0] * 0.25 + p2[0] * 0.75,
                p1[1] * 0.25 + p2[1] * 0.75
            ]);
        }
    } else {
        // Open path - preserve endpoints
        result.push([points[0][0], points[0][1]]);
        
        for (let i = 0; i < n - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            result.push([
                p1[0] * 0.75 + p2[0] * 0.25,
                p1[1] * 0.75 + p2[1] * 0.25
            ]);
            result.push([
                p1[0] * 0.25 + p2[0] * 0.75,
                p1[1] * 0.25 + p2[1] * 0.75
            ]);
        }
        
        result.push([points[n-1][0], points[n-1][1]]);
    }
    
    return result;
},
/**
 * Render precipitation-colored cells
 */
_renderPrecipitationCells(ctx, bounds) {
    if (!this.precipitation || !this.voronoi) return;
    
    // Build smooth coastline loops first
    if (!this._coastlineCache) { this._coastlineCache = this._buildSmoothCoastlineLoops(); } const coastLoops = this._coastlineCache;
    
    const colorBatches = new Map();
    let visibleCount = 0;
    
    for (let i = 0; i < this.cellCount; i++) {
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        const margin = 50;
        if (x < bounds.left - margin || x > bounds.right + margin || 
            y < bounds.top - margin || y > bounds.bottom + margin) continue;
        
        visibleCount++;
        const precip = this.precipitation[i] || 0;
        const color = this._getPrecipitationColor(precip);
        
        if (!color) continue;
        
        if (!colorBatches.has(color)) {
            colorBatches.set(color, []);
        }
        colorBatches.get(color).push(i);
    }
    
    // 1. Draw ocean cells first
    const oceanColor = OCEAN_COLORS[0];
    ctx.fillStyle = oceanColor;
    ctx.beginPath();
    for (const [color, indices] of colorBatches) {
        for (const i of indices) {
            if (this.heights[i] >= ELEVATION.SEA_LEVEL) continue;
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
    }
    ctx.fill();
    
    // 2. Draw smooth land fill as backing layer
    const backingColor = '#88aaff'; // Mid-blue for precipitation view
    ctx.fillStyle = backingColor;
    for (const loop of coastLoops) {
        if (loop.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    }
    
    // 3. Draw land cells on top
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5 / this.viewport.zoom;
    
    for (const [color, indices] of colorBatches) {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        
        for (const i of indices) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    // 4. Mask angular edges that extend into ocean
    if (coastLoops.length > 0) {
        ctx.save();
        ctx.beginPath();
        
        ctx.moveTo(bounds.left - 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.bottom + 1000);
        ctx.lineTo(bounds.left - 1000, bounds.bottom + 1000);
        ctx.closePath();
        
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[loop.length - 1][0], loop[loop.length - 1][1]);
            for (let i = loop.length - 2; i >= 0; i--) {
                ctx.lineTo(loop[i][0], loop[i][1]);
            }
            ctx.closePath();
        }
        
        ctx.clip('evenodd');
        
        ctx.fillStyle = oceanColor;
        ctx.fillRect(bounds.left - 1000, bounds.top - 1000, 
                    bounds.right - bounds.left + 2000, bounds.bottom - bounds.top + 2000);
        
        ctx.restore();
    }
    
    // 5. Draw smooth coastline border
    const borderColor = '#5A4A3A';
    const lineWidth = Math.max(0.35, 1 / this.viewport.zoom);
    this._drawSmoothCoastStroke(ctx, coastLoops, borderColor, lineWidth);
    
    this.metrics.visibleCells = visibleCount;
},
/**
 * Render outline for hovered cell (or entire lake if hovering lake)
 */
_renderHoveredCell(ctx) {
    // Check if hovered cell is part of a lake
    if (this.lakeCells && this.lakeCells.has(this.hoveredCell)) {
        // Find which lake this cell belongs to
        for (const lake of this.lakes) {
            if (lake.cells.includes(this.hoveredCell)) {
                this._renderHoveredLake(ctx, lake);
                return;
            }
        }
    }
    
    // Normal cell hover
    const cell = this.voronoi.cellPolygon(this.hoveredCell);
    if (!cell || cell.length < 3) return;
    
    // Draw outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 / this.viewport.zoom;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cell[0][0], cell[0][1]);
    for (let j = 1; j < cell.length; j++) {
        ctx.lineTo(cell[j][0], cell[j][1]);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Inner outline for contrast
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5 / this.viewport.zoom;
    ctx.stroke();
},

/**
 * Render a subtle coordinate grid overlay. The spacing snaps to a
 * "nice" 1-2-5 step in world units and adapts to zoom: ~10 lines
 * across the visible area, with finer subdivisions appearing as you
 * zoom in.
 *
 * Drawn inside the world-space transform, so we work in world units.
 * Bounds is the visible world rect.
 */
_renderCoordinateGrid(ctx, bounds) {
    const zoom = this.viewport.zoom;
    
    // Pick a spacing that yields ~10 lines across the visible width.
    // Snap to a "nice" 1-2-5 step on the map's own scale (a power of 10
    // of world units), so as you zoom in, finer subdivisions appear.
    const visibleW = bounds.right - bounds.left;
    if (visibleW <= 0) return;
    const targetLines = 10;
    const rawStep = visibleW / targetLines;
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / pow;
    let step;
    if (norm < 1.5)      step = 1  * pow;
    else if (norm < 3.5) step = 2  * pow;
    else if (norm < 7.5) step = 5  * pow;
    else                 step = 10 * pow;
    if (step <= 0 || !isFinite(step)) return;
    
    // Light, low-contrast lines so the grid reads as reference, not as
    // foreground. Uses world-space line widths (scaled by zoom) so it
    // looks consistent at any magnification.
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.18)';
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    
    const xStart = Math.ceil(bounds.left / step) * step;
    for (let x = xStart; x <= bounds.right; x += step) {
        ctx.moveTo(x, bounds.top);
        ctx.lineTo(x, bounds.bottom);
    }
    const yStart = Math.ceil(bounds.top / step) * step;
    for (let y = yStart; y <= bounds.bottom; y += step) {
        ctx.moveTo(bounds.left, y);
        ctx.lineTo(bounds.right, y);
    }
    
    ctx.stroke();
    ctx.restore();
},

/**
 * Render outline for entire hovered lake
 */
_renderHoveredLake(ctx, lake) {
    if (!lake.cells || lake.cells.length === 0) return;
    
    const lakeSet = new Set(lake.cells);
    const boundaryEdges = [];
    
    // Find all boundary edges
    for (const cellIndex of lake.cells) {
        const cell = this.voronoi.cellPolygon(cellIndex);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(cellIndex));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            const edgeMidX = (v1[0] + v2[0]) / 2;
            const edgeMidY = (v1[1] + v2[1]) / 2;
            
            let edgeNeighbor = -1;
            let minDist = Infinity;
            
            for (const n of neighbors) {
                const nx = this.points[n * 2];
                const ny = this.points[n * 2 + 1];
                const distSq = (nx - edgeMidX) ** 2 + (ny - edgeMidY) ** 2;
                
                if (distSq < minDist) {
                    minDist = distSq;
                    edgeNeighbor = n;
                }
            }
            
            // Only include boundary edges (not internal)
            if (edgeNeighbor >= 0 && !lakeSet.has(edgeNeighbor)) {
                boundaryEdges.push([v1[0], v1[1], v2[0], v2[1]]);
            }
        }
    }
    
    if (boundaryEdges.length === 0) return;
    
    // Draw white outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 / this.viewport.zoom;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of boundaryEdges) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    
    // Draw black inner outline for contrast
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 / this.viewport.zoom;
    ctx.stroke();
},

/**
 * Update SVG overlay with river paths
 */

_updateRiverSVG() {
    const svg = document.getElementById('river-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    if (!this.rivers || this.rivers.length === 0) return;
    if (!this.heights) return;
    
    const zoom = this.viewport.zoom;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create a group for all rivers with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Create clipping path from coastline using per-cell polygons (robust
    // against corner-clip artifacts; see comments in _updateKingdomSVG).
    if (this.heights && this.cellCount > 0) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', 'coastline-clip');
        
        let clipD = '';
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            if (this.lakeCells && this.lakeCells.has(i)) continue;
            const cellPoly = this.voronoi.cellPolygon(i);
            if (!cellPoly || cellPoly.length < 3) continue;
            clipD += `M ${cellPoly[0][0]} ${cellPoly[0][1]} `;
            for (let j = 1; j < cellPoly.length; j++) {
                clipD += `L ${cellPoly[j][0]} ${cellPoly[j][1]} `;
            }
            clipD += 'Z ';
        }
        
        if (clipD) {
            const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            clipPathEl.setAttribute('d', clipD);
            clipPath.appendChild(clipPathEl);
            defs.appendChild(clipPath);
            svg.appendChild(defs);
            
            g.setAttribute('clip-path', 'url(#coastline-clip)');
        }
    }
    
    // Width parameters (in world space, will scale with zoom)
    const minWidth = 0.3;
    const maxWidth = 2.0;
    
    for (const river of this.rivers) {
        const path = river.path;
        if (path.length < 2) continue;
        
        // Interpolate path using cardinal spline
        const smoothPath = this._interpolateRiverCurve(path);
        if (smoothPath.length < 2) continue;
        
        // Build tapered polygon
        const leftEdge = [];
        const rightEdge = [];
        
        for (let i = 0; i < smoothPath.length; i++) {
            const p = smoothPath[i];
            const progress = i / (smoothPath.length - 1);
            
            // Exponential width growth
            const width = minWidth + (maxWidth - minWidth) * Math.pow(progress, 1.5);
            
            // Calculate perpendicular direction
            let dx, dy;
            if (i === 0) {
                dx = smoothPath[1].x - p.x;
                dy = smoothPath[1].y - p.y;
            } else if (i === smoothPath.length - 1) {
                dx = p.x - smoothPath[i - 1].x;
                dy = p.y - smoothPath[i - 1].y;
            } else {
                dx = smoothPath[i + 1].x - smoothPath[i - 1].x;
                dy = smoothPath[i + 1].y - smoothPath[i - 1].y;
            }
            
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.001) continue;
            
            const px = -dy / len;
            const py = dx / len;
            
            leftEdge.push({ x: p.x + px * width, y: p.y + py * width });
            rightEdge.push({ x: p.x - px * width, y: p.y - py * width });
        }
        
        if (leftEdge.length < 2) continue;
        
        // Build SVG path data for polygon
        let d = `M ${leftEdge[0].x} ${leftEdge[0].y}`;
        for (let i = 1; i < leftEdge.length; i++) {
            d += ` L ${leftEdge[i].x} ${leftEdge[i].y}`;
        }
        for (let i = rightEdge.length - 1; i >= 0; i--) {
            d += ` L ${rightEdge[i].x} ${rightEdge[i].y}`;
        }
        d += ' Z';
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        g.appendChild(pathEl);
    }
    
    svg.appendChild(g);
},

/**
 * Update SVG overlay with kingdom fills and borders
 */
_updateKingdomSVG() {
    const svg = document.getElementById('kingdom-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    if (!this.kingdoms || this.kingdomCount <= 0) return;
    if (!this.kingdomCells) return;
    
    const zoom = this.viewport.zoom;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create clipping path from coastline. We construct it from per-cell
    // polygons rather than the smooth coastline loops, because the loop
    // chaining can produce artifacts at map corners (visible diagonal
    // wedges of "land" extending into ocean) when land touches the map
    // edges. Per-cell construction is robust because each cell knows
    // independently whether it's land or ocean.
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const hasLand = this.heights && this.cellCount > 0;
    
    if (hasLand) {
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', 'coast-clip');
        
        let clipD = '';
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            if (this.lakeCells && this.lakeCells.has(i)) continue;
            const cellPoly = this.voronoi.cellPolygon(i);
            if (!cellPoly || cellPoly.length < 3) continue;
            clipD += `M ${cellPoly[0][0]} ${cellPoly[0][1]} `;
            for (let j = 1; j < cellPoly.length; j++) {
                clipD += `L ${cellPoly[j][0]} ${cellPoly[j][1]} `;
            }
            clipD += 'Z ';
        }
        
        if (clipD) {
            const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            clipPathEl.setAttribute('d', clipD);
            clipPath.appendChild(clipPathEl);
            defs.appendChild(clipPath);
        }
    }
    svg.appendChild(defs);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    if (hasLand) {
        g.setAttribute('clip-path', 'url(#coast-clip)');
    }
    
    // 1. First pass: Render all kingdom fills (no strokes)
    for (let k = 0; k < this.kingdomCount; k++) {
        const cells = this.kingdomCells[k];
        if (!cells || cells.length === 0) continue;
        
        // Get kingdom color
        const palette = this._kingdomPalette || POLITICAL_COLORS;
        const colorIndex = (this.kingdomColors && this.kingdomColors[k] >= 0) 
            ? this.kingdomColors[k] 
            : k % palette.length;
        const color = palette[colorIndex];
        
        // Render the kingdom fill as the union of its cell polygons. We
        // build one SVG path with a Move-Line-Line-...-Z subpath per cell.
        // SVG renders adjacent subpaths cleanly via the nonzero fill rule
        // (default), so cell-shared edges don't appear as visible seams.
        //
        // Why per-cell instead of building one outline polygon? Because
        // tracing a kingdom outline that includes cells touching the map
        // edge runs into corner-clip artifacts: d3-delaunay clips corner
        // cells with a single diagonal edge, and the chain-closing
        // algorithm closes the kingdom polygon implicitly through that
        // diagonal — producing a visible triangular wedge of kingdom
        // color extending into the ocean. Per-cell rendering sidesteps
        // the issue: each cell knows its own shape; the union is exact.
        let d = '';
        for (const i of cells) {
            const cellPoly = this.voronoi.cellPolygon(i);
            if (!cellPoly || cellPoly.length < 3) continue;
            d += `M ${cellPoly[0][0]} ${cellPoly[0][1]} `;
            for (let j = 1; j < cellPoly.length; j++) {
                d += `L ${cellPoly[j][0]} ${cellPoly[j][1]} `;
            }
            d += 'Z ';
        }
        
        if (!d) continue;
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('fill', color);
        pathEl.setAttribute('stroke', 'none');
        pathEl.setAttribute('class', 'kingdom-fill');
        g.appendChild(pathEl);
    }
    
    // 2. Second pass: Draw border lines between different kingdoms
    const borderEdges = this._collectKingdomBorderEdges();
    // Dashed thin border style (atlas-map look). Width is in world coords so
    // it scales with zoom; dasharray same. Roughly: dash = 2 world units,
    // gap = 1.5 — short dotted-dashed. Tuning these tighter would feel busy;
    // looser would lose the dashed read at typical zooms.
    const strokeWidth = 1;
    const dashArray = '2';
    
    // 1.5: Paint lakes at full opacity, OVER the translucent kingdom fills.
    // This is what makes lakes look "solid" — without this step, the
    // semi-transparent kingdom layer above the canvas-painted lake cells
    // bleeds the kingdom color through (50% alpha on top of lake color).
    // Drawing lakes here, in the kingdom SVG layer above the kingdom fills,
    // gives them full visual priority. They still get clipped to land by
    // the coast-clip path on the parent group, which is correct (lakes
    // are inside land).
    if (this.lakeCells && this.lakeCells.size > 0) {
        const lakeColor = this._lakeFillColor();
        let lakeD = '';
        for (const cellIdx of this.lakeCells) {
            const cell = this.voronoi.cellPolygon(cellIdx);
            if (!cell || cell.length < 3) continue;
            lakeD += `M ${cell[0][0]} ${cell[0][1]} `;
            for (let j = 1; j < cell.length; j++) {
                lakeD += `L ${cell[j][0]} ${cell[j][1]} `;
            }
            lakeD += 'Z ';
        }
        if (lakeD) {
            const lakePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lakePath.setAttribute('d', lakeD);
            lakePath.setAttribute('fill', lakeColor);
            lakePath.setAttribute('stroke', 'none');
            lakePath.setAttribute('fill-rule', 'nonzero');
            g.appendChild(lakePath);
        }
    }
    
    if (borderEdges.length > 0) {
        // Chain edges into continuous paths
        const chainedPaths = this._chainEdgesIntoPaths(borderEdges);
        
        // Draw all paths as a single SVG path element
        let d = '';
        for (const path of chainedPaths) {
            if (path.length < 2) continue;
            d += `M ${path[0].x} ${path[0].y} `;
            for (let i = 1; i < path.length; i++) {
                d += `L ${path[i].x} ${path[i].y} `;
            }
        }
        
        if (d) {
            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('stroke', 'rgb(86, 86, 109)');
            pathEl.setAttribute('stroke-width', strokeWidth);
            pathEl.setAttribute('stroke-linecap', 'butt');
            pathEl.setAttribute('stroke-linejoin', 'round');
            pathEl.setAttribute('stroke-dasharray', dashArray);
            pathEl.setAttribute('class', 'kingdom-border');
            g.appendChild(pathEl);
        }
    }
    
    svg.appendChild(g);
},

/**
 * Chain disconnected edges into continuous paths
 */
_chainEdgesIntoPaths(edges) {
    if (edges.length === 0) return [];
    
    const tolerance = 0.5;
    const paths = [];
    const used = new Set();
    
    const dist = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
    
    for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (used.has(startIdx)) continue;
        
        const path = [];
        let currentEdge = edges[startIdx];
        used.add(startIdx);
        
        path.push({ x: currentEdge.x1, y: currentEdge.y1 });
        path.push({ x: currentEdge.x2, y: currentEdge.y2 });
        
        // Keep extending in both directions
        let extended = true;
        while (extended) {
            extended = false;
            
            const first = path[0];
            const last = path[path.length - 1];
            
            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue;
                
                const edge = edges[i];
                
                // Check if edge connects to end
                if (dist(edge.x1, edge.y1, last.x, last.y) < tolerance) {
                    path.push({ x: edge.x2, y: edge.y2 });
                    used.add(i);
                    extended = true;
                    break;
                } else if (dist(edge.x2, edge.y2, last.x, last.y) < tolerance) {
                    path.push({ x: edge.x1, y: edge.y1 });
                    used.add(i);
                    extended = true;
                    break;
                }
                
                // Check if edge connects to start
                if (dist(edge.x1, edge.y1, first.x, first.y) < tolerance) {
                    path.unshift({ x: edge.x2, y: edge.y2 });
                    used.add(i);
                    extended = true;
                    break;
                } else if (dist(edge.x2, edge.y2, first.x, first.y) < tolerance) {
                    path.unshift({ x: edge.x1, y: edge.y1 });
                    used.add(i);
                    extended = true;
                    break;
                }
            }
        }
        
        if (path.length >= 2) {
            paths.push(path);
        }
    }
    
    return paths;
},


/**
 * Update SVG overlay with city and capitol icons
 */
_updateCitySVG() {
    const svg = document.getElementById('city-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    const zoom = this.viewport.zoom;
    
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // ─────────────────────────────────────────────────────────────────
    // Minimal settlement markers:
    //   - Cities are drawn as a small filled circle with a hairline ring.
    //   - Capitols are drawn as a five-point star (filled, with a thin
    //     outline). Stars are large and offset upward so the label sits
    //     beside them comfortably, just like the previous castle icon.
    //
    // The label hit-boxes are kept in sync with the marker geometry so
    // hover/click pickup still works exactly as before.
    // ─────────────────────────────────────────────────────────────────
    const INK = '#3D2F1F';
    const RING = '#1A130C';
    
    // Marker sizes in WORLD space (the parent <g> applies viewport zoom,
    // so these stay visually consistent across zoom levels — they grow
    // with the map but the canvas marker layer compensates similarly).
    const cityRadius   = 1.6;   // small dot
    const capitolSize  = 5.0;   // star outer radius
    
    // Build a five-point star polygon centred at (0, 0) with the given
    // outer radius and an inner radius of outerR * 0.42 (classic 5-point
    // star proportions). Top point goes straight up.
    const starPoints = (outerR) => {
        const innerR = outerR * 0.42;
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const r = (i % 2 === 0) ? outerR : innerR;
            const a = -Math.PI / 2 + i * Math.PI / 5;
            pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
        }
        return pts.join(' ');
    };
    
    // Wrapper group that gets the viewport translation+zoom transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // ─── CAPITOLS — filled stars ───
    if (this.capitols && this.capitolNames) {
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            if (capitolCell < 0) continue;
            
            const x = this.points[capitolCell * 2];
            const y = this.points[capitolCell * 2 + 1];
            
            const star = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            star.setAttribute('points', starPoints(capitolSize));
            star.setAttribute('transform', `translate(${x}, ${y})`);
            star.setAttribute('fill', INK);
            star.setAttribute('stroke', RING);
            star.setAttribute('stroke-width', '0.4');
            star.setAttribute('stroke-linejoin', 'round');
            star.setAttribute('class', 'capitol-icon');
            g.appendChild(star);
            
            // Hit box matches a square inscribing the star
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'capital',
                    index: k,
                    cell: capitolCell,
                    kingdom: k,
                    name: this.capitolNames[k] || `Capitol ${k}`,
                    box: {
                        left: x - capitolSize - 1,
                        right: x + capitolSize + 1,
                        top: y - capitolSize - 1,
                        bottom: y + capitolSize + 1
                    }
                });
            }
        }
    }
    
    // ─── CITIES — filled circles, or squares-with-anchor for ports ───
    //
    // A "port" city is any non-capital city that sits at the endpoint of
    // a sea route. We collect those cells once up front by scanning the
    // consolidated sea routes for waypoints flagged port:true (those are
    // the settlement-coordinate waypoints prepended/appended in
    // _consolidateSeaRoutes — never an ocean cell).
    const portCells = new Set();
    if (this.seaRoutes && this.seaRoutes.length) {
        for (const route of this.seaRoutes) {
            if (!route.path) continue;
            for (const p of route.path) {
                if (p && p.port && typeof p.cell === 'number') {
                    portCells.add(p.cell);
                }
            }
        }
    }
    
    // Geometry for the port marker. Square is sized so its inscribed
    // circle roughly matches the regular city dot's diameter — the
    // square reads as a clear "different shape" without being visually
    // heavier than other cities.
    const portHalf = cityRadius * 1.55;     // half-side of the square
    
    // A minimal anchor glyph drawn as a single SVG path. Coordinates
    // are in a [-1, 1] design space; we scale and translate at render
    // time. Stem runs vertically, crossbar at top, curved hook at the
    // bottom that ends with little flared tips.
    const anchorPath =
        // Top ring (small circle)
        'M 0 -0.85 m -0.22 0 a 0.22 0.22 0 1 0 0.44 0 a 0.22 0.22 0 1 0 -0.44 0 ' +
        // Vertical stem
        'M 0 -0.62 L 0 0.55 ' +
        // Crossbar
        'M -0.45 -0.32 L 0.45 -0.32 ' +
        // Curved hook (semi-circle-ish)
        'M -0.55 0.30 Q -0.55 0.72 0 0.72 Q 0.55 0.72 0.55 0.30';
    const anchorScale = portHalf * 0.78;     // anchor sits inside the square
    
    if (zoom > 0.6 && this.cities && this.cityNames) {
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            if (!city || city.cell < 0) continue;
            
            const x = this.points[city.cell * 2];
            const y = this.points[city.cell * 2 + 1];
            
            const isPort = portCells.has(city.cell);
            
            if (isPort) {
                // Filled square + anchor glyph for port cities
                const square = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                square.setAttribute('x', x - portHalf);
                square.setAttribute('y', y - portHalf);
                square.setAttribute('width', portHalf * 2);
                square.setAttribute('height', portHalf * 2);
                square.setAttribute('fill', INK);
                square.setAttribute('stroke', RING);
                square.setAttribute('stroke-width', '0.3');
                square.setAttribute('class', 'city-icon port-icon');
                g.appendChild(square);
                
                const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                anchor.setAttribute('d', anchorPath);
                anchor.setAttribute(
                    'transform',
                    `translate(${x}, ${y}) scale(${anchorScale})`
                );
                anchor.setAttribute('fill', 'none');
                anchor.setAttribute('stroke', '#F4ECD9');   // parchment-light, contrasts on dark fill
                anchor.setAttribute('stroke-width', 0.32 / anchorScale);
                anchor.setAttribute('stroke-linecap', 'round');
                anchor.setAttribute('stroke-linejoin', 'round');
                anchor.setAttribute('class', 'port-anchor');
                g.appendChild(anchor);
                
                if (this._labelHitBoxes) {
                    this._labelHitBoxes.push({
                        type: 'city',
                        index: i,
                        cell: city.cell,
                        kingdom: city.kingdom,
                        name: this.cityNames[i] || `City ${i}`,
                        box: {
                            left: x - portHalf - 1,
                            right: x + portHalf + 1,
                            top: y - portHalf - 1,
                            bottom: y + portHalf + 1
                        }
                    });
                }
            } else {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
                dot.setAttribute('r', cityRadius);
                dot.setAttribute('fill', INK);
                dot.setAttribute('stroke', RING);
                dot.setAttribute('stroke-width', '0.3');
                dot.setAttribute('class', 'city-icon');
                g.appendChild(dot);
                
                if (this._labelHitBoxes) {
                    this._labelHitBoxes.push({
                        type: 'city',
                        index: i,
                        cell: city.cell,
                        kingdom: city.kingdom,
                        name: this.cityNames[i] || `City ${i}`,
                        box: {
                            left: x - cityRadius - 1,
                            right: x + cityRadius + 1,
                            top: y - cityRadius - 1,
                            bottom: y + cityRadius + 1
                        }
                    });
                }
            }
        }
    }
    
    svg.appendChild(g);
},

/**
 * Update SVG overlay with all labels (kingdom names, city names)
 */
_updateLabelSVG() {
    const svg = document.getElementById('label-svg');
    if (!svg) return;
    
    svg.style.opacity = '1';
    svg.innerHTML = '';
    
    const zoom = this.viewport.zoom;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Track placed labels for collision detection
    const placedLabels = [];
    
    // Text sizes need to be divided by zoom to appear constant on screen
    // 1. Kingdom names (largest first for priority)
    if (this.kingdomNames && this.kingdomCentroids && this.kingdomCells) {
        // Sort by size
        const kingdomOrder = [];
        for (let k = 0; k < this.kingdomCount; k++) {
            const cellCount = this.kingdomCells[k] ? this.kingdomCells[k].length : 0;
            kingdomOrder.push({ index: k, size: cellCount });
        }
        kingdomOrder.sort((a, b) => b.size - a.size);
        
        const maxSize = kingdomOrder[0]?.size || 1;
        
        for (const kingdom of kingdomOrder) {
            const k = kingdom.index;
            const name = this.kingdomNames[k];
            const cells = this.kingdomCells[k];
            
            if (!name || !cells || cells.length === 0) continue;
            
            // Find label position. The algorithm returns the largest font
            // size (from a fixed ladder of trial sizes) at which the label
            // is guaranteed to fit inside the kingdom's interior. We use
            // that as our upper bound, then take the min with a kingdom-
            // size-based aesthetic preference so a tiny duchy with a small
            // name doesn't get a giant font just because it geometrically
            // could. Floor of 5pt as before.
            const labelPos = this._findBestKingdomLabelPosition(cells, k);
            if (!labelPos) continue;
            
            const { centerX, centerY, fontSize: maxFitFont } = labelPos;
            
            const sizeRatio = Math.sqrt(kingdom.size / maxSize);
            const aestheticFontSize = 7 + (sizeRatio * 14);
            const fontSize = Math.max(5, Math.min(maxFitFont, aestheticFontSize));
            
            // Parse name for display
            const { prefix, mainName } = this._parseKingdomName(name);
            const displayText = (mainName || name).toUpperCase();
            
            // Calculate collision box for the entire label (including prefix)
            const estWidth = displayText.length * fontSize * 0.65;
            const totalHeight = prefix ? fontSize * 1.8 : fontSize;
            
            // Clamp center so the label's bounding box fits within the map.
            // Without this, kingdoms whose pole-of-inaccessibility lies near
            // a map edge (small or edge-hugging kingdoms — common with the
            // isthmus preset where land runs off the edges) get labels with
            // text that overflows the map and gets visually clipped.
            const halfW = estWidth / 2 + 3;
            const halfH = totalHeight / 2 + 3;
            const labelX = Math.max(halfW, Math.min(this.width  - halfW, centerX));
            const labelY = Math.max(halfH, Math.min(this.height - halfH, centerY));
            
            const box = {
                left: labelX - halfW,
                right: labelX + halfW,
                top: labelY - halfH,
                bottom: labelY + halfH
            };
            
            // Check collision
            let collides = false;
            for (const placed of placedLabels) {
                if (box.left < placed.right && box.right > placed.left &&
                    box.top < placed.bottom && box.bottom > placed.top) {
                    collides = true;
                    break;
                }
            }
            
            if (collides) continue;
            
            // Create text element
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('class', 'kingdom-label');
            text.setAttribute('font-size', fontSize);
            text.setAttribute('letter-spacing', '0.12em');
            text.textContent = displayText;
            
            // Add prefix if exists
            if (prefix) {
                const prefixText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                prefixText.setAttribute('x', labelX);
                prefixText.setAttribute('y', labelY - fontSize * 0.9);
                prefixText.setAttribute('text-anchor', 'middle');
                prefixText.setAttribute('dominant-baseline', 'middle');
                prefixText.setAttribute('class', 'kingdom-label');
                prefixText.setAttribute('font-size', fontSize * 0.45);
                prefixText.textContent = prefix;
                g.appendChild(prefixText);
            }
            
            g.appendChild(text);
            
            // Track for collision
            placedLabels.push(box);
            
            // Store hit box for click detection
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'kingdom',
                    index: k,
                    name: name,
                    box: box
                });
            }
        }
    }
    
    // 2. Lake names — labeled inside the lake itself (italic, like real
    // maps). Only lakes large enough to comfortably fit a small label
    // get one; tiny ponds stay anonymous to avoid map clutter.
    //
    // The lake generator may produce multiple `lake` records that are
    // physically adjacent (river-fed lake meeting an endorheic basin,
    // multi-pit drainage merges, etc.) — visually they look like one
    // body of water on the map. We don't want three names floating in
    // the same lake, so before placing labels we group lakes whose
    // cells touch into "clusters" via Voronoi adjacency, and label
    // only the LARGEST lake in each cluster. The smaller adjacent
    // lakes contribute their water to the cluster but don't get a
    // name of their own.
    if (this.lakes && this.lakes.length > 0 && this.lakeCells) {
        // Build cell → lake-record-index lookup so we can ask "which
        // lake does this neighbour belong to?" in O(1).
        const cellToLakeIdx = new Map();
        for (let li = 0; li < this.lakes.length; li++) {
            const cells = this.lakes[li].cells;
            if (!cells) continue;
            for (const c of cells) cellToLakeIdx.set(c, li);
        }
        
        // Union-find over lake records — merge any two lakes that have
        // at least one pair of Voronoi-adjacent cells. After this pass,
        // each connected body of water is one cluster regardless of
        // how many lake records cover it.
        const parent = new Array(this.lakes.length);
        for (let i = 0; i < parent.length; i++) parent[i] = i;
        const find = (x) => {
            while (parent[x] !== x) {
                parent[x] = parent[parent[x]];
                x = parent[x];
            }
            return x;
        };
        const union = (a, b) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        };
        for (let li = 0; li < this.lakes.length; li++) {
            const cells = this.lakes[li].cells;
            if (!cells) continue;
            for (const c of cells) {
                for (const n of this.voronoi.neighbors(c)) {
                    const nLake = cellToLakeIdx.get(n);
                    if (nLake !== undefined && nLake !== li) {
                        union(li, nLake);
                    }
                }
            }
        }
        
        // Pick the representative lake of each cluster: the largest by
        // cell count. That's the one whose name will be displayed.
        const clusterRep = new Map();   // cluster root → { lakeIdx, size }
        for (let li = 0; li < this.lakes.length; li++) {
            const size = (this.lakes[li].cells && this.lakes[li].cells.length) || 0;
            const root = find(li);
            const cur = clusterRep.get(root);
            if (!cur || size > cur.size) {
                clusterRep.set(root, { lakeIdx: li, size });
            }
        }
        
        // Each cluster contributes its FULL set of cells to "valid label
        // ground" (so the chosen name can sit anywhere in the connected
        // water, not just inside the largest lake's specific cells).
        const clusterCells = new Map();   // cluster root → Set of cell indices
        for (let li = 0; li < this.lakes.length; li++) {
            const root = find(li);
            let set = clusterCells.get(root);
            if (!set) { set = new Set(); clusterCells.set(root, set); }
            for (const c of this.lakes[li].cells) set.add(c);
        }
        
        // Build the placement list: one entry per cluster, sorted by
        // total cluster size so big lakes get their labels placed first
        // (and thus get priority if any geometry conflicts arise).
        const placementList = [];
        for (const [root, rep] of clusterRep) {
            const lake = this.lakes[rep.lakeIdx];
            if (!lake.name) continue;
            const cells = clusterCells.get(root);
            const totalSize = cells.size;
            if (totalSize < 8) continue;   // tiny ponds stay anonymous
            placementList.push({ lake, cells, totalSize });
        }
        placementList.sort((a, b) => b.totalSize - a.totalSize);
        
        for (const { lake, cells: clusterCellSet } of placementList) {
            // Compute cluster bbox over ALL cells of all merged lakes
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const cellIdx of clusterCellSet) {
                const x = this.points[cellIdx * 2];
                const y = this.points[cellIdx * 2 + 1];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            const w = maxX - minX, h = maxY - minY;
            if (w <= 0 || h <= 0) continue;
            
            // Try several font sizes. Match the kingdom-label style:
            // start big, shrink until the label rectangle fits inside the
            // lake's interior. The required fit is sampled at a few key
            // points along the rectangle perimeter.
            const trialFonts = [9, 7, 5.5, 4.5];
            const lakeName = lake.name;
            let placedFontSize = 0;
            let placedX = 0, placedY = 0;
            let placedBox = null;
            
            for (const fontSize of trialFonts) {
                const labelW = lakeName.length * fontSize * 0.5;  // italic, narrower than uppercase
                const labelH = fontSize;
                
                // The rectangle must fit comfortably inside the lake bbox
                // with some breathing room (the label needs to sit ON
                // water, not tight against the shore).
                const margin = fontSize * 0.6;
                if (labelW + margin * 2 > w) continue;
                if (labelH + margin * 2 > h) continue;
                
                // Search candidate positions on a coarse grid inside the
                // bbox, picking the first one where the label rectangle
                // fully covers lake cells (samples at corners + midpoints).
                const searchSteps = 5;
                const stepX = (w - labelW) / searchSteps;
                const stepY = (h - labelH) / searchSteps;
                
                // Try centers nearest the bbox center first (label feels
                // most natural when it's anchored toward the lake's middle)
                const centerOrderX = [];
                const centerOrderY = [];
                for (let i = 0; i <= searchSteps; i++) {
                    centerOrderX.push(i);
                    centerOrderY.push(i);
                }
                const midI = searchSteps / 2;
                centerOrderX.sort((a, b) => Math.abs(a - midI) - Math.abs(b - midI));
                centerOrderY.sort((a, b) => Math.abs(a - midI) - Math.abs(b - midI));
                
                let found = false;
                for (const iy of centerOrderY) {
                    for (const ix of centerOrderX) {
                        const cx = minX + labelW / 2 + ix * stepX;
                        const cy = minY + labelH / 2 + iy * stepY;
                        
                        // Sample 9 points across the proposed label
                        // rectangle (corners + midedges + center). All of
                        // them must lie inside this lake CLUSTER — the
                        // label may sit on water from any of the merged
                        // lake records as long as it doesn't drift onto
                        // land or into a separate body of water.
                        const hw = labelW / 2 + margin / 2;
                        const hh = labelH / 2 + margin / 2;
                        let allInside = true;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const sx = cx + dx * hw;
                                const sy = cy + dy * hh;
                                const cellIdx = this.voronoi.find(sx, sy);
                                if (!clusterCellSet.has(cellIdx)) {
                                    allInside = false;
                                    break;
                                }
                            }
                            if (!allInside) break;
                        }
                        if (!allInside) continue;
                        
                        // Provisional collision box including a small pad
                        const padW = labelW / 2 + 2;
                        const padH = labelH / 2 + 2;
                        const box = {
                            left: cx - padW,
                            right: cx + padW,
                            top: cy - padH,
                            bottom: cy + padH
                        };
                        
                        // Reject if it would collide with already-placed
                        // labels (kingdoms placed before us).
                        let collides = false;
                        for (const placed of placedLabels) {
                            if (box.left < placed.right && box.right > placed.left &&
                                box.top < placed.bottom && box.bottom > placed.top) {
                                collides = true;
                                break;
                            }
                        }
                        if (collides) continue;
                        
                        placedFontSize = fontSize;
                        placedX = cx;
                        placedY = cy;
                        placedBox = box;
                        found = true;
                        break;
                    }
                    if (found) break;
                }
                if (found) break;
            }
            
            if (placedFontSize === 0) continue;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', placedX);
            text.setAttribute('y', placedY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('class', 'lake-label');
            text.setAttribute('font-size', placedFontSize);
            text.textContent = lakeName;
            g.appendChild(text);
            
            placedLabels.push(placedBox);
        }
    }
    
    // 3. Capitol names - positioned below the castle icon
    if (this.capitols && this.capitolNames) {
        const fontSize = 5.5;
        
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            const capitolName = this.capitolNames[k];
            
            if (capitolCell < 0 || !capitolName) continue;
            
            const x = this.points[capitolCell * 2];
            const y = this.points[capitolCell * 2 + 1];
            
            // Position below the icon, centered (more space)
            const labelX = x;
            const labelY = y + 8;
            
            // Check collision before placing
            const estWidth = capitolName.length * fontSize * 0.55;
            const box = {
                left: labelX - estWidth / 2 - 2,
                right: labelX + estWidth / 2 + 2,
                top: labelY - fontSize / 2 - 2,
                bottom: labelY + fontSize / 2 + 2
            };
            
            let collides = false;
            for (const placed of placedLabels) {
                if (box.left < placed.right && box.right > placed.left &&
                    box.top < placed.bottom && box.bottom > placed.top) {
                    collides = true;
                    break;
                }
            }
            
            if (collides) continue;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('class', 'capitol-label');
            text.setAttribute('font-size', fontSize);
            text.textContent = capitolName;
            g.appendChild(text);
            
            // Track for collision
            placedLabels.push(box);
            
            // Store hit box for click detection (include icon area)
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'capital',
                    index: k,
                    cell: capitolCell,
                    kingdom: k,
                    name: capitolName,
                    box: {
                        left: Math.min(x - 10, box.left),
                        right: Math.max(x + 10, box.right),
                        top: y - 14,
                        bottom: box.bottom
                    }
                });
            }
        }
    }
    
    // 4. City names (only when zoomed in) - positioned below icon
    if (zoom > 1.2 && this.cities && this.cityNames) {
        const fontSize = 4.5;
        
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            const cityName = this.cityNames[i];
            
            if (!city || city.cell < 0 || !cityName) continue;
            
            const x = this.points[city.cell * 2];
            const y = this.points[city.cell * 2 + 1];
            
            // Position below the icon, centered (more space)
            const labelX = x;
            const labelY = y + 6;
            
            // Collision check with padding
            const estWidth = cityName.length * fontSize * 0.5;
            const box = {
                left: labelX - estWidth / 2 - 2,
                right: labelX + estWidth / 2 + 2,
                top: labelY - fontSize / 2 - 2,
                bottom: labelY + fontSize / 2 + 2
            };
            
            let collides = false;
            for (const placed of placedLabels) {
                if (box.left < placed.right && box.right > placed.left &&
                    box.top < placed.bottom && box.bottom > placed.top) {
                    collides = true;
                    break;
                }
            }
            
            if (collides) continue;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('class', 'city-label');
            text.setAttribute('font-size', fontSize);
            text.textContent = cityName;
            g.appendChild(text);
            
            placedLabels.push(box);
            
            // Store hit box for click detection (include icon area)
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'city',
                    index: i,
                    cell: city.cell,
                    kingdom: city.kingdom,
                    name: cityName,
                    box: {
                        left: Math.min(x - 6, box.left),
                        right: Math.max(x + 6, box.right),
                        top: y - 10,
                        bottom: box.bottom
                    }
                });
            }
        }
    }
    
    svg.appendChild(g);
},



/**
 * Interpolate river path using cardinal spline (D3-style)
 */
_interpolateRiverCurve(path) {
    if (path.length < 2) return path;
    if (path.length === 2) return path;
    
    const result = [];
    const tension = 0.5;
    const segments = 8;
    
    for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];
        
        if (i === 0) {
            result.push({ x: p1.x, y: p1.y });
        }
        
        for (let t = 1; t <= segments; t++) {
            const s = t / segments;
            const s2 = s * s;
            const s3 = s2 * s;
            
            const t0 = -tension * s + 2 * tension * s2 - tension * s3;
            const t1 = 1 + (tension - 3) * s2 + (2 - tension) * s3;
            const t2 = tension * s + (3 - 2 * tension) * s2 + (tension - 2) * s3;
            const t3 = -tension * s2 + tension * s3;
            
            const x = t0 * p0.x + t1 * p1.x + t2 * p2.x + t3 * p3.x;
            const y = t0 * p0.y + t1 * p1.y + t2 * p2.y + t3 * p3.y;
            
            result.push({ x, y });
        }
    }
    
    return result;
},



/**
 * Set hovered cell and re-render
 */
setHoveredCell(cellIndex) {
    if (this.hoveredCell !== cellIndex) {
        this.hoveredCell = cellIndex;
        this._debouncedRender();
    }
},
/**
 * Fast contour-based terrain rendering using rasterization
 * Much faster than recursive subdivision
 */
_renderContourTerrain(ctx, bounds, isGrayscale) {
    // Check if we need to regenerate contours
    const needsRegenerate = !this._contourCache || 
        this._contourCache.subdivisionLevel !== this.subdivisionLevel ||
        this._contourCache.heightsHash !== this._getHeightsHash();
    
    if (needsRegenerate) {
        this._generateContourCache();
    }
    
    if (!this._contourCache || !this._contourCache.contours) return;
    
    const { contours, scaleX, scaleY } = this._contourCache;
    
    // Build smooth coastline loops first
    if (!this._coastlineCache) { this._coastlineCache = this._buildSmoothCoastlineLoops(); } const coastLoops = this._coastlineCache;
    
    // 1. Draw ocean contours first
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.5 / this.viewport.zoom;
    
    for (const contour of contours) {
        const elevation = contour.value;
        if (elevation >= ELEVATION.SEA_LEVEL) continue;
        
        const color = isGrayscale ? this._getGrayscale(elevation) : this._getElevationColor(elevation);
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        
        for (const polygon of contour.coordinates) {
            for (const ring of polygon) {
                if (ring.length < 3) continue;
                ctx.moveTo(ring[0][0] * scaleX, ring[0][1] * scaleY);
                for (let i = 1; i < ring.length; i++) {
                    ctx.lineTo(ring[i][0] * scaleX, ring[i][1] * scaleY);
                }
                ctx.closePath();
            }
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    // 2. Draw smooth land fill as backing layer
    const backingColor = '#4a7c59';
    ctx.fillStyle = backingColor;
    for (const loop of coastLoops) {
        if (loop.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    }
    
    // 3. Draw land contours on top
    for (const contour of contours) {
        const elevation = contour.value;
        if (elevation < ELEVATION.SEA_LEVEL) continue;
        
        const color = isGrayscale ? this._getGrayscale(elevation) : this._getElevationColor(elevation);
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        
        for (const polygon of contour.coordinates) {
            for (const ring of polygon) {
                if (ring.length < 3) continue;
                ctx.moveTo(ring[0][0] * scaleX, ring[0][1] * scaleY);
                for (let i = 1; i < ring.length; i++) {
                    ctx.lineTo(ring[i][0] * scaleX, ring[i][1] * scaleY);
                }
                ctx.closePath();
            }
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    // 4. Mask angular edges that extend into ocean
    if (coastLoops.length > 0) {
        ctx.save();
        ctx.beginPath();
        
        ctx.moveTo(bounds.left - 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.top - 1000);
        ctx.lineTo(bounds.right + 1000, bounds.bottom + 1000);
        ctx.lineTo(bounds.left - 1000, bounds.bottom + 1000);
        ctx.closePath();
        
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[loop.length - 1][0], loop[loop.length - 1][1]);
            for (let i = loop.length - 2; i >= 0; i--) {
                ctx.lineTo(loop[i][0], loop[i][1]);
            }
            ctx.closePath();
        }
        
        ctx.clip('evenodd');
        
        const oceanColor = OCEAN_COLORS[0];
        ctx.fillStyle = oceanColor;
        ctx.fillRect(bounds.left - 1000, bounds.top - 1000, 
                    bounds.right - bounds.left + 2000, bounds.bottom - bounds.top + 2000);
        
        ctx.restore();
    }
    
    // 5. Draw smooth coastline border
    const borderColor = '#5A4A3A';
    const lineWidth = Math.max(0.3, 1 / this.viewport.zoom);
    this._drawSmoothCoastStroke(ctx, coastLoops, borderColor, lineWidth);
    
    this.metrics.visibleCells = this.cellCount;
},
/**
 * Generate and cache contour data
 */
_generateContourCache() {
    // Grid resolution based on subdivision level
    const baseRes = 200;
    const resolution = baseRes * (1 + this.subdivisionLevel * 0.5);
    
    const gridWidth = Math.ceil(Math.min(resolution, this.width));
    const gridHeight = Math.ceil(Math.min(resolution, this.height));
    
    const cellWidth = this.width / gridWidth;
    const cellHeight = this.height / gridHeight;
    
    // Build elevation grid by sampling Voronoi cells
    const grid = new Float32Array(gridWidth * gridHeight);
    let minElev = Infinity, maxElev = -Infinity;
    
    for (let gy = 0; gy < gridHeight; gy++) {
        for (let gx = 0; gx < gridWidth; gx++) {
            const wx = (gx + 0.5) * cellWidth;
            const wy = (gy + 0.5) * cellHeight;
            
            // Find cell at this point
            const cellIndex = this.voronoi.find(wx, wy);
            const elevation = cellIndex >= 0 ? this.heights[cellIndex] : 0;
            
            grid[gy * gridWidth + gx] = elevation;
            minElev = Math.min(minElev, elevation);
            maxElev = Math.max(maxElev, elevation);
        }
    }
    
    // Number of contour levels based on subdivision level
    const numLevels = 20 + this.subdivisionLevel * 30;
    
    // Generate thresholds from min to max elevation
    const thresholds = [];
    for (let i = 0; i <= numLevels; i++) {
        thresholds.push(minElev + (maxElev - minElev) * (i / numLevels));
    }
    
    // Use d3.contours for fast marching squares
    const contourGenerator = d3.contours()
        .size([gridWidth, gridHeight])
        .thresholds(thresholds);
    
    const contours = contourGenerator(grid);
    
    // Cache the results
    this._contourCache = {
        contours,
        scaleX: this.width / gridWidth,
        scaleY: this.height / gridHeight,
        subdivisionLevel: this.subdivisionLevel,
        heightsHash: this._getHeightsHash()
    };
},
/**
 * Simple hash of heights array for cache invalidation
 */
_getHeightsHash() {
    if (!this.heights || this.heights.length === 0) return 0;
    // Sample a few values for quick hash
    const samples = [0, 
        Math.floor(this.heights.length / 4),
        Math.floor(this.heights.length / 2),
        Math.floor(this.heights.length * 3 / 4),
        this.heights.length - 1
    ];
    let hash = this.heights.length;
    for (const i of samples) {
        hash = hash * 31 + (this.heights[i] | 0);
    }
    return hash;
},

/**
 * Hit test for labels - returns info about label at screen coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} - Label info or null if no hit
 */
hitTestLabel(screenX, screenY) {
    if (!this._labelHitBoxes || this._labelHitBoxes.length === 0) return null;
    
    // Convert screen coordinates to world coordinates
    const worldX = (screenX - this.viewport.x) / this.viewport.zoom;
    const worldY = (screenY - this.viewport.y) / this.viewport.zoom;
    
    // Check hit boxes in reverse order (last drawn = on top)
    for (let i = this._labelHitBoxes.length - 1; i >= 0; i--) {
        const label = this._labelHitBoxes[i];
        const box = label.box;
        
        if (worldX >= box.left && worldX <= box.right &&
            worldY >= box.top && worldY <= box.bottom) {
            return label;
        }
    }
    
    return null;
},

/**
/**
 * Build the data block for a kingdom info popup. Aggregates cells,
 * settlements, ports, capital info, terrain breakdown, and culture
 * for the given kingdom.
 *
 * Used by the click handler in app.js to populate the info panel.
 *
 * @param {number} kingdomIndex - Index into this.kingdomCells / this.kingdomNames.
 * @returns {Object|null} Kingdom stats, or null if the index is out of range.
 *   Shape: `{name, capitalName, capitalIsPort, capitalPopulation, culture,
 *           population, cellCount, cityCount, settlements, ports, terrain}`.
 *   - `settlements` is non-port cities only, sorted by population desc.
 *   - `ports` is port cities only, sorted by population desc.
 *   - Each entry in either is `{name, population}`.
 */
getKingdomStats(kingdomIndex) {
    if (kingdomIndex < 0 || kingdomIndex >= this.kingdomCount) return null;
    
    const cells = this.kingdomCells[kingdomIndex] || [];
    const name = this.kingdomNames ? this.kingdomNames[kingdomIndex] : `Kingdom ${kingdomIndex}`;
    const capitalName = this.capitolNames ? this.capitolNames[kingdomIndex] : null;
    const culture = this.kingdomCultures ? this.kingdomCultures[kingdomIndex] : null;
    
    // Get population
    const population = this.kingdomPopulations ? this.kingdomPopulations[kingdomIndex] : 0;
    
    // Build the set of port cells (cells that sit at a sea-route endpoint).
    // Port flag is attached only to settlement-coordinate waypoints in
    // _consolidateSeaRoutes — the cell field there points back at the
    // settlement, so we can intersect cleanly with this kingdom's cities.
    const portCells = new Set();
    if (this.seaRoutes) {
        for (const route of this.seaRoutes) {
            if (!route.path) continue;
            for (const p of route.path) {
                if (p && p.port && typeof p.cell === 'number') portCells.add(p.cell);
            }
        }
    }
    
    // Walk this kingdom's cities, splitting into ports and non-port
    // settlements. Each entry carries the name + population so the
    // popup can render proper tables.
    const settlements = [];   // non-port cities only
    const ports = [];         // port cities only
    if (this.cities) {
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            if (!city || city.kingdom !== kingdomIndex) continue;
            const cName = (this.cityNames && this.cityNames[i]) || `City ${i + 1}`;
            const entry = {
                name: cName,
                population: city.population || 0
            };
            if (portCells.has(city.cell)) {
                ports.push(entry);
            } else {
                settlements.push(entry);
            }
        }
    }
    
    // Sort each table by population descending so the most significant
    // settlement leads each section.
    settlements.sort((a, b) => b.population - a.population);
    ports.sort((a, b) => b.population - a.population);
    
    // Capital info — its name + population live separately from the
    // settlements/ports tables (rendered as the headline row in the
    // popup), and we expose isPort so the popup can mark the capital
    // with an anchor when applicable.
    const capitalCell = this.capitols ? this.capitols[kingdomIndex] : -1;
    const capitalIsPort = capitalCell >= 0 && portCells.has(capitalCell);
    const capitalPopulation = (this.capitalPopulations && this.capitalPopulations[kingdomIndex]) || 0;
    
    // Calculate terrain breakdown (still computed in case it's used
    // elsewhere; the popup itself no longer renders Territory).
    let mountains = 0, highlands = 0, lowlands = 0, coastal = 0;
    for (const cellIdx of cells) {
        const height = this.heights[cellIdx];
        if (height > 2000) mountains++;
        else if (height > 1000) highlands++;
        else lowlands++;
        
        // Check if coastal
        for (const n of this.voronoi.neighbors(cellIdx)) {
            if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                coastal++;
                break;
            }
        }
    }
    
    return {
        name,
        capitalName,
        capitalIsPort,
        capitalPopulation,
        culture,
        population,
        cellCount: cells.length,
        cityCount: settlements.length + ports.length,
        settlements,    // non-port cities only, [{name, population}]
        ports,          // port cities only, [{name, population}]
        terrain: {
            mountains: Math.round(mountains / cells.length * 100),
            highlands: Math.round(highlands / cells.length * 100),
            lowlands: Math.round(lowlands / cells.length * 100),
            coastalCells: coastal
        }
    };
},

/**
 * Get city statistics
 * @param {number} cityIndex - City index
 * @returns {Object} - City stats
 */
getCityStats(cityIndex) {
    if (!this.cities || cityIndex < 0 || cityIndex >= this.cities.length) return null;
    
    const city = this.cities[cityIndex];
    const name = (this.cityNames && this.cityNames[cityIndex]) ? this.cityNames[cityIndex] : `City ${cityIndex + 1}`;
    const kingdomName = (this.kingdomNames && city.kingdom >= 0 && this.kingdomNames[city.kingdom]) ? this.kingdomNames[city.kingdom] : 'Unknown';
    
    // Get population
    const population = city.population || 0;
    
    const cellIdx = city.cell;
    const height = this.heights ? Math.round(this.heights[cellIdx]) : 0;
    
    // Check terrain features
    let isCoastal = false;
    let isNearRiver = false;
    
    for (const n of this.voronoi.neighbors(cellIdx)) {
        if (this.heights[n] < ELEVATION.SEA_LEVEL) {
            isCoastal = true;
        }
    }
    
    // Check if near river
    if (this.rivers) {
        const x = this.points[cellIdx * 2];
        const y = this.points[cellIdx * 2 + 1];
        for (const river of this.rivers) {
            if (river.path) {
                for (const point of river.path) {
                    const px = point.x !== undefined ? point.x : this.points[point.cell * 2];
                    const py = point.y !== undefined ? point.y : this.points[point.cell * 2 + 1];
                    const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
                    if (dist < 30) {
                        isNearRiver = true;
                        break;
                    }
                }
            }
            if (isNearRiver) break;
        }
    }
    
    return {
        name,
        kingdomName,
        population,
        elevation: height,
        isCoastal,
        isNearRiver
    };
},

/**
 * Get capital statistics
 * @param {number} kingdomIndex - Kingdom index
 * @returns {Object} - Capital stats
 */
getCapitalStats(kingdomIndex) {
    if (kingdomIndex < 0 || kingdomIndex >= this.kingdomCount) return null;
    if (!this.capitols || this.capitols[kingdomIndex] < 0) return null;
    
    const cellIdx = this.capitols[kingdomIndex];
    const name = this.capitolNames ? this.capitolNames[kingdomIndex] : `Capital ${kingdomIndex}`;
    const kingdomName = this.kingdomNames ? this.kingdomNames[kingdomIndex] : `Kingdom ${kingdomIndex}`;
    
    // Get population
    const population = this.capitalPopulations ? this.capitalPopulations[kingdomIndex] : 0;
    
    const height = this.heights ? Math.round(this.heights[cellIdx]) : 0;
    
    // Check terrain features
    let isCoastal = false;
    let isNearRiver = false;
    
    for (const n of this.voronoi.neighbors(cellIdx)) {
        if (this.heights[n] < ELEVATION.SEA_LEVEL) {
            isCoastal = true;
        }
    }
    
    // Check if near river
    if (this.rivers) {
        const x = this.points[cellIdx * 2];
        const y = this.points[cellIdx * 2 + 1];
        for (const river of this.rivers) {
            if (river.path) {
                for (const point of river.path) {
                    const px = point.x !== undefined ? point.x : this.points[point.cell * 2];
                    const py = point.y !== undefined ? point.y : this.points[point.cell * 2 + 1];
                    const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
                    if (dist < 30) {
                        isNearRiver = true;
                        break;
                    }
                }
            }
            if (isNearRiver) break;
        }
    }
    
    // Count cities in this kingdom
    let cityCount = 0;
    if (this.cities) {
        for (const city of this.cities) {
            if (city.kingdom === kingdomIndex) cityCount++;
        }
    }
    
    return {
        name,
        kingdomName,
        population,
        elevation: height,
        isCoastal,
        isNearRiver,
        isCapital: true,
        cityCount
    };
}
};
