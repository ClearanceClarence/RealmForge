/**
 * VORONOI MAP RENDERING METHODS
 * All rendering, drawing, and display methods
 * These methods are mixed into VoronoiGenerator.prototype
 */
import { 
    LAND_COLORS, OCEAN_COLORS, PRECIP_COLORS, 
    POLITICAL_COLORS, POLITICAL_OCEAN, POLITICAL_BORDER,
    ELEVATION 
} from './map-constants.js';
export const renderingMethods = {
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
        this._updateCoastlineSVG();
        
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
        this.delaunay.render(ctx);
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
    
    // Render wind rose overlay
    if (this.showWindrose) {
        this._renderWindrose(ctx);
    }
    
    // Render scale bar
    if (this.showScale) {
        this._renderScaleBar(ctx);
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
 * Low-res political map rendering - DEPRECATED
 */
_renderPoliticalCellsLowRes(ctx, bounds) {
    const hasKingdoms = this.kingdoms && this.kingdomCount > 0;
    
    // Batch by kingdom for fewer state changes
    const kingdomBatches = new Map();
    
    for (let i = 0; i < this.cellCount; i++) {
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        // Frustum culling with margin
        if (x < bounds.left - 20 || x > bounds.right + 20 ||
            y < bounds.top - 20 || y > bounds.bottom + 20) continue;
        
        // Ocean cells
        if (this.heights[i] < ELEVATION.SEA_LEVEL) {
            if (!kingdomBatches.has(-1)) {
                kingdomBatches.set(-1, []);
            }
            kingdomBatches.get(-1).push(i);
            continue;
        }
        
        // Land cells - group by kingdom
        const kingdomId = hasKingdoms ? Math.max(0, this.kingdoms[i]) : 0;
        
        if (!kingdomBatches.has(kingdomId)) {
            kingdomBatches.set(kingdomId, []);
        }
        kingdomBatches.get(kingdomId).push(i);
    }
    
    // Draw ocean cells first
    if (kingdomBatches.has(-1)) {
        ctx.fillStyle = POLITICAL_OCEAN;
        ctx.beginPath();
        
        for (const i of kingdomBatches.get(-1)) {
            const cell = this.voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            
            ctx.moveTo(cell[0][0], cell[0][1]);
            for (let j = 1; j < cell.length; j++) {
                ctx.lineTo(cell[j][0], cell[j][1]);
            }
            ctx.closePath();
        }
        ctx.fill();
        kingdomBatches.delete(-1);
    }
    
    // Draw each kingdom
    for (const [kingdomId, cells] of kingdomBatches) {
        // Get color index - kingdomColors stores indices into POLITICAL_COLORS
        const colorIndex = (this.kingdomColors && this.kingdomColors[kingdomId] >= 0) 
            ? this.kingdomColors[kingdomId] 
            : kingdomId % POLITICAL_COLORS.length;
        const color = POLITICAL_COLORS[colorIndex];
        
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
_renderSmoothLakes(ctx, bounds) {
    if (!this.lakes || this.lakes.length === 0) return;
    
    // Use shallow ocean color to match ocean
    const lakeColor = OCEAN_COLORS[0];  // Shallow ocean blue
    
    for (const lake of this.lakes) {
        if (!lake.cells || lake.cells.length === 0) continue;
        
        // Draw all lake cells as filled polygons
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
    
    // 2. Fill land with base parchment color
    ctx.fillStyle = '#E8DCC8'; // Base parchment - kingdoms will tint this
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
    
    // 3. Draw lakes
    if (this.lakeCells && this.lakeCells.size > 0) {
        ctx.fillStyle = POLITICAL_OCEAN;
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
 * Render political map - clean cell-based rendering
 */
_renderPoliticalMap(ctx, bounds) {
    if (!this.heights) return;
    
    const hasKingdoms = this.kingdoms && this.kingdomCount > 0;
    
    // Use tile cache for kingdom cell colors (major performance boost)
    if (this.tileCache && this.useTileRendering) {
        // Draw cached tiles for kingdom colors
        this.tileCache.render(ctx, this.viewport, bounds, 'political');
        
        // Draw lakes on top (semi-dynamic)
        if (this.lakeCells && this.lakeCells.size > 0) {
            ctx.fillStyle = POLITICAL_OCEAN;
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
        
        // Draw kingdom borders (dynamic - scales with zoom)
        if (hasKingdoms) {
            this._renderKingdomBorders(ctx, bounds);
        }
        
        // Draw coastline border
        if (!this._coastlineCache) {
            this._coastlineCache = this._buildSmoothCoastlineLoops();
        }
        const borderColor = '#5A4A3A';
        const lineWidth = Math.max(0.3, 1 / this.viewport.zoom);
        this._drawSmoothCoastStroke(ctx, this._coastlineCache, borderColor, lineWidth);
        
        return;
    }
    
    // Original non-cached rendering below
    // 1. Fill entire visible area with ocean
    ctx.fillStyle = POLITICAL_OCEAN;
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    
    // Use cached coastline loops (expensive to calculate)
    if (!this._coastlineCache) {
        this._coastlineCache = this._buildSmoothCoastlineLoops();
    }
    const coastLoops = this._coastlineCache;
    
    if (coastLoops.length === 0) return;
    
    // 2. Clip to coastline - kingdoms will be clipped to smooth coast
    ctx.save();
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
    
    // 3. Batch cells by kingdom - only process visible cells
    const kingdomBatches = new Map();
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        const margin = 50;
        if (x < bounds.left - margin || x > bounds.right + margin || 
            y < bounds.top - margin || y > bounds.bottom + margin) continue;
        
        // Use kingdom ID, or 0 for unassigned land cells
        const kingdomId = hasKingdoms ? Math.max(0, this.kingdoms[i]) : 0;
        
        if (!kingdomBatches.has(kingdomId)) {
            kingdomBatches.set(kingdomId, []);
        }
        kingdomBatches.get(kingdomId).push(i);
    }
    
    // 4. Draw each kingdom - batch all cells into single path per kingdom
    for (const [kingdomId, indices] of kingdomBatches) {
        const colorIndex = (this.kingdomColors && this.kingdomColors[kingdomId] >= 0) 
            ? this.kingdomColors[kingdomId] 
            : kingdomId % POLITICAL_COLORS.length;
        const color = hasKingdoms ? POLITICAL_COLORS[colorIndex] : POLITICAL_COLORS[0];
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5; // Thin stroke to prevent gaps between cells
        ctx.lineJoin = 'round';
        
        // Batch all cells into one path for efficient rendering
        ctx.beginPath();
        for (const i of indices) {
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
    
    // 5. Draw lakes on top
    if (this.lakeCells && this.lakeCells.size > 0) {
        ctx.fillStyle = POLITICAL_OCEAN;
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
    
    // 6. Draw kingdom borders between neighboring cells of different kingdoms
    if (hasKingdoms) {
        const zoom = this.viewport.zoom;
        ctx.strokeStyle = 'rgba(90, 74, 58, 0.5)';
        ctx.lineWidth = Math.max(0.5, 1.2 / zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        
        ctx.beginPath();
        
        // For each pair of neighboring cells in different kingdoms
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            
            const myKingdom = this.kingdoms[i];
            if (myKingdom < 0) continue;
            
            const cellI = this.voronoi.cellPolygon(i);
            if (!cellI || cellI.length < 3) continue;
            
            const neighbors = Array.from(this.voronoi.neighbors(i));
            
            for (const j of neighbors) {
                if (j < 0 || j >= this.cellCount) continue;
                if (this.heights[j] < ELEVATION.SEA_LEVEL) continue;
                
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
    }
    
    // Release clip
    ctx.restore();
    
    // 7. Draw smooth coastline border (thicker than kingdom borders)
    const borderColor = '#5A4A3A';
    const lineWidth = Math.max(0.3, 1 / this.viewport.zoom);
    this._drawSmoothCoastStroke(ctx, coastLoops, borderColor, lineWidth);
},

/**
 * Render kingdom borders (extracted for use with tile cache)
 */
_renderKingdomBorders(ctx, bounds) {
    if (!this.kingdoms || this.kingdomCount <= 0) return;
    
    const zoom = this.viewport.zoom;
    ctx.strokeStyle = 'rgba(90, 74, 58, 0.5)';
    ctx.lineWidth = Math.max(0.5, 1.2 / zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    
    ctx.beginPath();
    
    // For each pair of neighboring cells in different kingdoms
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
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
},

/**
 * Build smooth boundary for a single kingdom
 */
_buildKingdomBoundary(kingdomId) {
    const cells = this.kingdomCells[kingdomId];
    if (!cells || cells.length === 0) return [];
    
    const cellSet = new Set(cells);
    const boundaryEdges = [];
    
    // Collect all boundary edges
    for (const i of cells) {
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            // Find which neighbor this edge borders
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
            
            // Edge is boundary if neighbor is not in this kingdom
            const isBoundary = edgeNeighbor < 0 || !cellSet.has(edgeNeighbor);
            
            if (isBoundary) {
                boundaryEdges.push([v1[0], v1[1], v2[0], v2[1]]);
            }
        }
    }
    
    if (boundaryEdges.length === 0) return [];
    
    // Chain edges into loops
    const loops = this._chainBoundaryEdges(boundaryEdges);
    
    // Return loops without smoothing
    return loops.filter(loop => loop.length >= 3);
},

/**
 * Chain boundary edges into closed loops
 */
_chainBoundaryEdges(edges) {
    if (edges.length === 0) return [];
    
    const vertexKey = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
    const adjacency = new Map();
    
    for (const edge of edges) {
        const k1 = vertexKey(edge[0], edge[1]);
        const k2 = vertexKey(edge[2], edge[3]);
        
        if (!adjacency.has(k1)) adjacency.set(k1, []);
        if (!adjacency.has(k2)) adjacency.set(k2, []);
        
        adjacency.get(k1).push({ x: edge[2], y: edge[3], key: k2 });
        adjacency.get(k2).push({ x: edge[0], y: edge[1], key: k1 });
    }
    
    const usedEdges = new Set();
    const loops = [];
    
    for (const [startKey, startNeighbors] of adjacency) {
        for (const firstNeighbor of startNeighbors) {
            const edgeId = startKey < firstNeighbor.key ? 
                `${startKey}|${firstNeighbor.key}` : `${firstNeighbor.key}|${startKey}`;
            
            if (usedEdges.has(edgeId)) continue;
            usedEdges.add(edgeId);
            
            const [sx, sy] = startKey.split(',').map(n => parseInt(n) / 100);
            const loop = [[sx, sy], [firstNeighbor.x, firstNeighbor.y]];
            
            let prevKey = startKey;
            let currentKey = firstNeighbor.key;
            
            for (let iter = 0; iter < 100000; iter++) {
                const neighbors = adjacency.get(currentKey);
                if (!neighbors) break;
                
                let foundNext = false;
                for (const next of neighbors) {
                    if (next.key === prevKey) continue;
                    
                    const nextEdgeId = currentKey < next.key ? 
                        `${currentKey}|${next.key}` : `${next.key}|${currentKey}`;
                    
                    if (usedEdges.has(nextEdgeId)) continue;
                    
                    usedEdges.add(nextEdgeId);
                    loop.push([next.x, next.y]);
                    
                    prevKey = currentKey;
                    currentKey = next.key;
                    foundNext = true;
                    break;
                }
                
                if (!foundNext) break;
                if (currentKey === startKey) break;
            }
            
            if (loop.length >= 3) {
                loops.push(loop);
            }
        }
    }
    
    return loops;
},

/**
 * Smooth a closed loop using Chaikin's algorithm
 */
_smoothClosedLoop(points) {
    if (points.length < 3) return points;
    
    const result = [];
    const n = points.length;
    
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
    
    return result;
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
            
            // Check if this is a border with a different kingdom (not ocean)
            const neighborHeight = this.heights[closestNeighbor];
            if (neighborHeight < ELEVATION.SEA_LEVEL) continue; // Skip ocean borders
            
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
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
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
    
    // Return loops without smoothing
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
/**
 * Identify all connected landmasses
 */
_identifyLandmasses() {
    if (!this.heights) return;
    
    this.landmasses = [];
    this.landmassBoundaries = null; // Clear cached boundaries
    const visited = new Uint8Array(this.cellCount);
    
    for (let i = 0; i < this.cellCount; i++) {
        if (visited[i]) continue;
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
        // BFS to find all connected land cells
        const cells = [];
        const queue = [i];
        visited[i] = 1;
        
        while (queue.length > 0) {
            const current = queue.shift();
            cells.push(current);
            
            for (const neighbor of this.voronoi.neighbors(current)) {
                if (visited[neighbor]) continue;
                if (this.heights[neighbor] < ELEVATION.SEA_LEVEL) continue;
                
                visited[neighbor] = 1;
                queue.push(neighbor);
            }
        }
        
        this.landmasses.push({ cells, size: cells.length });
    }
    
},
/**
 * Chain edges into continuous loops
 */
_chainEdgesIntoLoops(edges) {
    if (edges.length === 0) return [];
    
    const tolerance = 1.0;
    const used = new Array(edges.length).fill(false);
    const loops = [];
    
    while (true) {
        // Find first unused edge
        let startIdx = -1;
        for (let i = 0; i < edges.length; i++) {
            if (!used[i]) {
                startIdx = i;
                break;
            }
        }
        
        if (startIdx === -1) break;
        
        // Start a new loop
        const loop = [];
        used[startIdx] = true;
        loop.push([edges[startIdx].x1, edges[startIdx].y1]);
        loop.push([edges[startIdx].x2, edges[startIdx].y2]);
        
        let currentEnd = [edges[startIdx].x2, edges[startIdx].y2];
        const loopStart = [edges[startIdx].x1, edges[startIdx].y1];
        
        let changed = true;
        let iterations = 0;
        const maxIterations = edges.length * 2;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            for (let i = 0; i < edges.length; i++) {
                if (used[i]) continue;
                
                const e = edges[i];
                
                // Check if edge connects to current end
                const d1Start = Math.hypot(e.x1 - currentEnd[0], e.y1 - currentEnd[1]);
                const d1End = Math.hypot(e.x2 - currentEnd[0], e.y2 - currentEnd[1]);
                
                if (d1Start < tolerance) {
                    loop.push([e.x2, e.y2]);
                    currentEnd = [e.x2, e.y2];
                    used[i] = true;
                    changed = true;
                    break;
                } else if (d1End < tolerance) {
                    loop.push([e.x1, e.y1]);
                    currentEnd = [e.x1, e.y1];
                    used[i] = true;
                    changed = true;
                    break;
                }
            }
        }
        
        if (loop.length >= 4) {
            loops.push(loop);
        }
    }
    
    return loops;
},
/**
 * Chaikin's corner-cutting algorithm for smoothing
 */
_chaikinSmooth(points) {
    if (points.length < 3) return points;
    
    const smoothed = [];
    
    for (let i = 0; i < points.length; i++) {
        const p0 = points[i];
        const p1 = points[(i + 1) % points.length];
        
        // Cut at 1/4 and 3/4 of each edge
        const q = [
            p0[0] * 0.75 + p1[0] * 0.25,
            p0[1] * 0.75 + p1[1] * 0.25
        ];
        const r = [
            p0[0] * 0.25 + p1[0] * 0.75,
            p0[1] * 0.25 + p1[1] * 0.75
        ];
        
        smoothed.push(q);
        smoothed.push(r);
    }
    
    return smoothed;
},
/**
 * Smooth a path using Catmull-Rom splines
 */
_smoothPath(path) {
    if (path.length < 4) return path;
    
    const smoothed = [];
    const segments = 3; // Points per segment
    
    for (let i = 0; i < path.length; i++) {
        const p0 = path[(i - 1 + path.length) % path.length];
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        const p3 = path[(i + 2) % path.length];
        
        for (let t = 0; t < segments; t++) {
            const s = t / segments;
            const s2 = s * s;
            const s3 = s2 * s;
            
            // Catmull-Rom coefficients
            const x = 0.5 * (
                2 * p1.x +
                (-p0.x + p2.x) * s +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3
            );
            
            const y = 0.5 * (
                2 * p1.y +
                (-p0.y + p2.y) * s +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3
            );
            
            smoothed.push({ x, y });
        }
    }
    
    return smoothed;
},
/**
 * Lighten a hex color by a factor
 */
_lightenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const newR = Math.min(255, Math.round(r + (255 - r) * factor));
    const newG = Math.min(255, Math.round(g + (255 - g) * factor));
    const newB = Math.min(255, Math.round(b + (255 - b) * factor));
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
},
/**
 * Render kingdom names at their centroids with collision detection
 */
_renderKingdomNames(ctx, bounds) {
    if (!this.kingdomNames || !this.kingdomCentroids || !this.kingdomCells) return;
    
    const zoom = this.viewport.zoom;
    
    // Sort kingdoms by size (largest first - they get label priority)
    const kingdomOrder = [];
    let totalCells = 0;
    let maxKingdomSize = 0;
    
    for (let k = 0; k < this.kingdomCount; k++) {
        const cellCount = this.kingdomCells[k] ? this.kingdomCells[k].length : 0;
        kingdomOrder.push({ index: k, size: cellCount });
        totalCells += cellCount;
        maxKingdomSize = Math.max(maxKingdomSize, cellCount);
    }
    kingdomOrder.sort((a, b) => b.size - a.size);
    
    // Track placed labels for collision detection
    const placedLabels = [];
    
    for (const kingdom of kingdomOrder) {
        const k = kingdom.index;
        const name = this.kingdomNames[k];
        const cells = this.kingdomCells[k];
        const cellCount = kingdom.size;
        
        if (!name || cellCount === 0) continue;
        
        // Find the best label position using advanced algorithm
        const labelPos = this._findBestKingdomLabelPosition(cells, k);
        
        if (!labelPos) continue;
        
        const { centerX, centerY, spanWidth, regionWidth, regionHeight, minX, maxX, minY, maxY } = labelPos;
        
        // Skip if completely outside view
        if (centerX < bounds.left - 100 || centerX > bounds.right + 100 ||
            centerY < bounds.top - 100 || centerY > bounds.bottom + 100) continue;
        
        // Calculate aspect ratio to determine if we should curve text
        const aspectRatio = regionWidth / (regionHeight || 1);
        const isElongated = aspectRatio > 2.0 || aspectRatio < 0.5;
        
        // Find principal axis angle
        const angle = this._getKingdomAngle(cells, centerX, centerY);
        
        // Use the span width as our available width
        const availWidth = spanWidth * 0.85;
        const availHeight = regionHeight * 0.4;
        
        // Calculate font size based on kingdom size (relative to largest)
        const sizeRatio = Math.sqrt(cellCount / maxKingdomSize);
        const baseFontSize = 10 + (sizeRatio * 28);
        
        const minFontSize = 6 / zoom;
        const maxFontSize = baseFontSize / zoom;
        
        // Parse name to see if we have a two-line layout
        const { prefix, mainName } = this._parseKingdomName(name);
        const displayText = mainName || name;
        
        // Find best font size
        let fontSize = maxFontSize;
        ctx.font = `500 ${fontSize}px 'Cinzel', 'IM Fell English', Georgia, serif`;
        
        let textWidth = ctx.measureText(displayText.toUpperCase()).width;
        
        // Scale down to fit width
        if (textWidth > availWidth) {
            fontSize = fontSize * (availWidth / textWidth);
        }
        
        // For two-line layout, allow more height
        const heightFactor = prefix ? 1.1 : 0.85;
        if (fontSize > availHeight * heightFactor) {
            fontSize = availHeight * heightFactor;
        }
        
        fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));
        ctx.font = `500 ${fontSize}px 'Cinzel', 'IM Fell English', Georgia, serif`;
        textWidth = ctx.measureText(displayText.toUpperCase()).width;
        
        // Use computed center
        let textCenterX = centerX;
        let textCenterY = centerY;
        
        // Calculate rough text bounds
        const textHalfWidth = textWidth / 2 + fontSize * 0.5;
        const textHalfHeight = fontSize * 1.2;
        const cityPadding = 15 / zoom;
        
        // Collect all city/capitol positions in this kingdom to avoid
        const citiesToAvoid = [];
        
        // Add capitol
        if (this.capitols && this.capitols[k] >= 0) {
            const capitolCell = this.capitols[k];
            citiesToAvoid.push({
                x: this.points[capitolCell * 2],
                y: this.points[capitolCell * 2 + 1],
                padding: 20 / zoom
            });
        }
        
        // Add regular cities in this kingdom
        if (this.cities) {
            for (const city of this.cities) {
                if (city.kingdom === k) {
                    citiesToAvoid.push({
                        x: this.points[city.cell * 2],
                        y: this.points[city.cell * 2 + 1],
                        padding: cityPadding
                    });
                }
            }
        }
        
        // Check if text would overlap with any city and find best position
        let needsShift = false;
        let closestCity = null;
        let closestDist = Infinity;
        
        for (const city of citiesToAvoid) {
            const overlapsX = Math.abs(textCenterX - city.x) < textHalfWidth + city.padding;
            const overlapsY = Math.abs(textCenterY - city.y) < textHalfHeight + city.padding;
            
            if (overlapsX && overlapsY) {
                needsShift = true;
                const dist = Math.sqrt((textCenterX - city.x) ** 2 + (textCenterY - city.y) ** 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestCity = city;
                }
            }
        }
        
        if (needsShift && closestCity) {
            // Shift text away from closest overlapping city
            const spaceAbove = closestCity.y - minY;
            const spaceBelow = maxY - closestCity.y;
            
            const shiftAmount = textHalfHeight + closestCity.padding + fontSize * 0.3;
            
            if (spaceAbove > spaceBelow && closestCity.y - shiftAmount > minY + textHalfHeight) {
                textCenterY = closestCity.y - shiftAmount;
            } else if (closestCity.y + shiftAmount < maxY - textHalfHeight) {
                textCenterY = closestCity.y + shiftAmount;
            } else {
                const spaceLeft = closestCity.x - minX;
                const spaceRight = maxX - closestCity.x;
                
                if (spaceRight > spaceLeft && closestCity.x + textHalfWidth + closestCity.padding < maxX) {
                    textCenterX = closestCity.x + textHalfWidth + closestCity.padding;
                } else if (closestCity.x - textHalfWidth - closestCity.padding > minX) {
                    textCenterX = closestCity.x - textHalfWidth - closestCity.padding;
                }
            }
        }
        
        // Calculate label bounding box for collision detection
        // Account for rotation by computing the axis-aligned bounding box of the rotated rectangle
        const padding = fontSize * 0.4;
        const halfWidth = textWidth / 2 + padding;
        const halfHeight = fontSize / 2 + padding;
        
        // For rotated text, compute corners and find AABB
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        // Four corners of the rotated rectangle
        const corners = [
            { x: textCenterX + (-halfWidth) * cosA - (-halfHeight) * sinA,
              y: textCenterY + (-halfWidth) * sinA + (-halfHeight) * cosA },
            { x: textCenterX + (halfWidth) * cosA - (-halfHeight) * sinA,
              y: textCenterY + (halfWidth) * sinA + (-halfHeight) * cosA },
            { x: textCenterX + (halfWidth) * cosA - (halfHeight) * sinA,
              y: textCenterY + (halfWidth) * sinA + (halfHeight) * cosA },
            { x: textCenterX + (-halfWidth) * cosA - (halfHeight) * sinA,
              y: textCenterY + (-halfWidth) * sinA + (halfHeight) * cosA }
        ];
        
        const labelBox = {
            left: Math.min(...corners.map(c => c.x)),
            right: Math.max(...corners.map(c => c.x)),
            top: Math.min(...corners.map(c => c.y)),
            bottom: Math.max(...corners.map(c => c.y))
        };
        
        // Check for collision with already placed labels
        let collides = false;
        for (const placed of placedLabels) {
            if (labelBox.left < placed.right && labelBox.right > placed.left &&
                labelBox.top < placed.bottom && labelBox.bottom > placed.top) {
                collides = true;
                break;
            }
        }
        
        // Always show names - don't skip even if overlapping
        // if (collides) continue;
        
        // Add to placed labels
        placedLabels.push(labelBox);
        
        // Store hit box for hover detection
        if (this._labelHitBoxes) {
            this._labelHitBoxes.push({
                type: 'kingdom',
                index: k,
                name: name,
                box: labelBox
            });
        }
        
        // Draw text - curved for elongated kingdoms, straight otherwise
        if (isElongated && Math.abs(angle) < 0.3) {
            this._drawCurvedKingdomText(ctx, name, textCenterX, textCenterY, fontSize, spanWidth, zoom, aspectRatio > 1, cells, minX, maxX);
        } else {
            this._drawStraightKingdomText(ctx, name, textCenterX, textCenterY, fontSize, angle, zoom);
        }
    }
},

/**
 * Render capitol cities for each kingdom
 */
_renderCapitols(ctx, bounds) {
    if (!this.capitols || !this.capitolNames) return;
    
    const zoom = this.viewport.zoom;
    const placedLabels = this._placedCityLabels || [];
    
    for (let k = 0; k < this.kingdomCount; k++) {
        const capitolCell = this.capitols[k];
        const capitolName = this.capitolNames[k];
        
        if (capitolCell < 0 || !capitolName) continue;
        
        const x = this.points[capitolCell * 2];
        const y = this.points[capitolCell * 2 + 1];
        
        // Skip if outside view
        if (x < bounds.left - 50 || x > bounds.right + 50 ||
            y < bounds.top - 50 || y > bounds.bottom + 50) continue;
        
        // Scale for zoom
        const scale = Math.max(0.5, 1 / zoom);
        const baseSize = 12;
        const s = baseSize * scale;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Draw detailed castle/fortress icon
        const inkColor = '#2C2416';
        const lightColor = 'rgba(255, 252, 245, 0.95)';
        const strokeWidth = Math.max(0.3, 0.8 * scale);
        
        // Light glow/halo behind for visibility
        ctx.shadowColor = lightColor;
        ctx.shadowBlur = 4 * scale;
        
        // Main castle body
        ctx.fillStyle = inkColor;
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';
        
        // Central keep (tall rectangle)
        ctx.beginPath();
        ctx.rect(-s * 0.25, -s * 0.9, s * 0.5, s * 0.9);
        ctx.fill();
        
        // Keep battlements (crenellations on top)
        ctx.beginPath();
        const keepBattleWidth = s * 0.12;
        const keepBattleHeight = s * 0.15;
        for (let i = 0; i < 3; i++) {
            const bx = -s * 0.25 + i * keepBattleWidth * 1.5 + keepBattleWidth * 0.25;
            ctx.rect(bx, -s * 0.9 - keepBattleHeight, keepBattleWidth, keepBattleHeight);
        }
        ctx.fill();
        
        // Left tower
        ctx.beginPath();
        ctx.rect(-s * 0.6, -s * 0.65, s * 0.3, s * 0.65);
        ctx.fill();
        
        // Left tower roof (pointed)
        ctx.beginPath();
        ctx.moveTo(-s * 0.65, -s * 0.65);
        ctx.lineTo(-s * 0.45, -s * 0.95);
        ctx.lineTo(-s * 0.25, -s * 0.65);
        ctx.closePath();
        ctx.fill();
        
        // Right tower  
        ctx.beginPath();
        ctx.rect(s * 0.3, -s * 0.65, s * 0.3, s * 0.65);
        ctx.fill();
        
        // Right tower roof (pointed)
        ctx.beginPath();
        ctx.moveTo(s * 0.25, -s * 0.65);
        ctx.lineTo(s * 0.45, -s * 0.95);
        ctx.lineTo(s * 0.65, -s * 0.65);
        ctx.closePath();
        ctx.fill();
        
        // Walls connecting towers
        ctx.beginPath();
        ctx.rect(-s * 0.6, -s * 0.35, s * 0.35, s * 0.35);
        ctx.rect(s * 0.25, -s * 0.35, s * 0.35, s * 0.35);
        ctx.fill();
        
        // Wall battlements
        ctx.beginPath();
        const wallBattleWidth = s * 0.08;
        const wallBattleHeight = s * 0.1;
        // Left wall
        for (let i = 0; i < 3; i++) {
            const bx = -s * 0.58 + i * wallBattleWidth * 1.3;
            ctx.rect(bx, -s * 0.35 - wallBattleHeight, wallBattleWidth, wallBattleHeight);
        }
        // Right wall
        for (let i = 0; i < 3; i++) {
            const bx = s * 0.27 + i * wallBattleWidth * 1.3;
            ctx.rect(bx, -s * 0.35 - wallBattleHeight, wallBattleWidth, wallBattleHeight);
        }
        ctx.fill();
        
        // Gate (arched doorway)
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.moveTo(-s * 0.12, 0);
        ctx.lineTo(-s * 0.12, -s * 0.25);
        ctx.arc(0, -s * 0.25, s * 0.12, Math.PI, 0, false);
        ctx.lineTo(s * 0.12, 0);
        ctx.closePath();
        ctx.fill();
        
        // Flag on central keep
        ctx.fillStyle = inkColor;
        ctx.beginPath();
        // Pole
        ctx.rect(-s * 0.02, -s * 1.3, s * 0.04, s * 0.25);
        ctx.fill();
        // Flag
        ctx.beginPath();
        ctx.moveTo(s * 0.02, -s * 1.3);
        ctx.lineTo(s * 0.25, -s * 1.2);
        ctx.lineTo(s * 0.02, -s * 1.1);
        ctx.closePath();
        ctx.fill();
        
        // Small windows on keep
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.rect(-s * 0.08, -s * 0.7, s * 0.06, s * 0.1);
        ctx.rect(s * 0.02, -s * 0.7, s * 0.06, s * 0.1);
        ctx.rect(-s * 0.03, -s * 0.5, s * 0.06, s * 0.08);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // Draw capitol name with collision detection
        const markerSize = s * 1.3;
        const fontSize = Math.max(6, 11 / zoom);
        ctx.font = `600 ${fontSize}px 'IM Fell English', Georgia, serif`;
        
        const textWidth = ctx.measureText(capitolName).width;
        const textHeight = fontSize;
        const padding = 3 / zoom;
        
        // Try different label positions
        const positions = [
            { // Right (default)
                textX: x + markerSize + padding,
                textY: y,
                align: 'left',
                box: {
                    left: x + markerSize,
                    right: x + markerSize + textWidth + padding * 2,
                    top: y - textHeight * 0.6,
                    bottom: y + textHeight * 0.6
                }
            },
            { // Left
                textX: x - markerSize - padding,
                textY: y,
                align: 'right',
                box: {
                    left: x - markerSize - textWidth - padding * 2,
                    right: x - markerSize,
                    top: y - textHeight * 0.6,
                    bottom: y + textHeight * 0.6
                }
            },
            { // Above-right
                textX: x + markerSize * 0.5,
                textY: y - markerSize - padding,
                align: 'left',
                box: {
                    left: x + markerSize * 0.5 - padding,
                    right: x + markerSize * 0.5 + textWidth + padding,
                    top: y - markerSize - textHeight - padding,
                    bottom: y - markerSize
                }
            },
            { // Below-right
                textX: x + markerSize * 0.5,
                textY: y + markerSize + padding + textHeight * 0.5,
                align: 'left',
                box: {
                    left: x + markerSize * 0.5 - padding,
                    right: x + markerSize * 0.5 + textWidth + padding,
                    top: y + markerSize,
                    bottom: y + markerSize + textHeight + padding
                }
            }
        ];
        
        // Find first non-colliding position
        let bestPos = positions[0]; // Default to right
        for (const pos of positions) {
            let collides = false;
            for (const placed of placedLabels) {
                if (pos.box.left < placed.right && pos.box.right > placed.left &&
                    pos.box.top < placed.bottom && pos.box.bottom > placed.top) {
                    collides = true;
                    break;
                }
            }
            if (!collides) {
                bestPos = pos;
                break;
            }
        }
        
        ctx.textAlign = bestPos.align;
        ctx.textBaseline = 'middle';
        
        // Soft halo for legibility
        const shadowLayers = [
            { blur: 3, alpha: 0.4 },
            { blur: 2, alpha: 0.6 },
            { blur: 1, alpha: 0.8 }
        ];
        for (const layer of shadowLayers) {
            ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
            ctx.shadowBlur = layer.blur;
            ctx.fillStyle = 'rgba(255, 252, 245, 0.85)';
            ctx.fillText(capitolName, bestPos.textX, bestPos.textY);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2C2416';
        ctx.fillText(capitolName, bestPos.textX, bestPos.textY);
        
        // Track this label
        placedLabels.push(bestPos.box);
        
        // Store hit box for hover detection (include marker area)
        if (this._labelHitBoxes) {
            this._labelHitBoxes.push({
                type: 'capital',
                index: k,
                cell: capitolCell,
                name: capitolName,
                box: {
                    left: Math.min(x - markerSize, bestPos.box.left),
                    right: Math.max(x + markerSize, bestPos.box.right),
                    top: Math.min(y - markerSize, bestPos.box.top),
                    bottom: Math.max(y + markerSize, bestPos.box.bottom)
                }
            });
        }
    }
},

/**
 * Render cities (non-capitol settlements)
 */
_renderCities(ctx, bounds) {
    if (!this.cities || !this.cityNames) return;
    
    const zoom = this.viewport.zoom;
    
    // Only show city labels when zoomed in enough
    const showLabels = zoom > 1.2;
    // Only show markers when somewhat zoomed in
    const showMarkers = zoom > 0.6;
    
    if (!showMarkers) return;
    
    // First pass: collect all city positions and draw markers
    const cityPositions = [];
    
    for (let i = 0; i < this.cities.length; i++) {
        const city = this.cities[i];
        const cityName = this.cityNames && this.cityNames[i] ? this.cityNames[i] : `City ${i + 1}`;
        
        if (!city || city.cell < 0) continue;
        
        const x = this.points[city.cell * 2];
        const y = this.points[city.cell * 2 + 1];
        
        // Skip if outside view
        if (x < bounds.left - 50 || x > bounds.right + 50 ||
            y < bounds.top - 50 || y > bounds.bottom + 50) continue;
        
        // Scale for zoom
        const scale = Math.max(0.4, 0.8 / zoom);
        const baseSize = 8;
        const s = baseSize * scale;
        const markerSize = s * 1.2;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Draw detailed town icon
        const inkColor = '#2C2416';
        const lightColor = 'rgba(255, 252, 245, 0.95)';
        const strokeWidth = Math.max(0.2, 0.5 * scale);
        
        ctx.globalAlpha = Math.min(1, zoom * 0.8);
        
        // Light glow behind
        ctx.shadowColor = lightColor;
        ctx.shadowBlur = 2 * scale;
        
        ctx.fillStyle = inkColor;
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';
        
        // Church/cathedral spire (center, tallest)
        ctx.beginPath();
        // Spire
        ctx.moveTo(0, -s * 1.1);
        ctx.lineTo(-s * 0.12, -s * 0.5);
        ctx.lineTo(s * 0.12, -s * 0.5);
        ctx.closePath();
        ctx.fill();
        // Church body
        ctx.beginPath();
        ctx.rect(-s * 0.18, -s * 0.5, s * 0.36, s * 0.5);
        ctx.fill();
        
        // Cross on top
        ctx.beginPath();
        ctx.rect(-s * 0.02, -s * 1.25, s * 0.04, s * 0.12);
        ctx.rect(-s * 0.06, -s * 1.2, s * 0.12, s * 0.03);
        ctx.fill();
        
        // Left building (house with peaked roof)
        ctx.beginPath();
        ctx.rect(-s * 0.55, -s * 0.35, s * 0.3, s * 0.35);
        ctx.fill();
        // Roof
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s * 0.35);
        ctx.lineTo(-s * 0.4, -s * 0.6);
        ctx.lineTo(-s * 0.2, -s * 0.35);
        ctx.closePath();
        ctx.fill();
        
        // Right building (house with peaked roof)
        ctx.beginPath();
        ctx.rect(s * 0.25, -s * 0.3, s * 0.28, s * 0.3);
        ctx.fill();
        // Roof
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.3);
        ctx.lineTo(s * 0.39, -s * 0.55);
        ctx.lineTo(s * 0.58, -s * 0.3);
        ctx.closePath();
        ctx.fill();
        
        // Small tower/turret on right building
        ctx.beginPath();
        ctx.rect(s * 0.42, -s * 0.5, s * 0.1, s * 0.2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.5);
        ctx.lineTo(s * 0.47, -s * 0.65);
        ctx.lineTo(s * 0.54, -s * 0.5);
        ctx.closePath();
        ctx.fill();
        
        // Windows (tiny bright spots)
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        // Church window (arched)
        ctx.arc(0, -s * 0.25, s * 0.06, Math.PI, 0, false);
        ctx.rect(-s * 0.06, -s * 0.25, s * 0.12, s * 0.1);
        ctx.fill();
        // House windows
        ctx.beginPath();
        ctx.rect(-s * 0.48, -s * 0.22, s * 0.06, s * 0.08);
        ctx.rect(-s * 0.35, -s * 0.22, s * 0.06, s * 0.08);
        ctx.rect(s * 0.32, -s * 0.18, s * 0.05, s * 0.07);
        ctx.rect(s * 0.42, -s * 0.18, s * 0.05, s * 0.07);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
        
        if (showLabels) {
            cityPositions.push({ x, y, name: cityName, markerSize, index: i });
        }
    }
    
    if (!showLabels || cityPositions.length === 0) return;
    
    // Use shared placed labels array (capitols already added)
    const placedLabels = this._placedCityLabels || [];
    
    // Second pass: draw city labels with collision detection
    const fontSize = Math.max(5, 9 / zoom);
    ctx.font = `italic ${fontSize}px 'IM Fell English', Georgia, serif`;
    
    for (const city of cityPositions) {
        const { x, y, name, markerSize, index } = city;
        
        const textWidth = ctx.measureText(name).width;
        const textHeight = fontSize;
        const padding = 2 / zoom;
        
        // Try different label positions: right, left, above-right, below-right, above, below, above-left, below-left
        const positions = [
            { // Right (default)
                textX: x + markerSize + padding,
                textY: y,
                align: 'left',
                box: {
                    left: x + markerSize,
                    right: x + markerSize + textWidth + padding * 2,
                    top: y - textHeight * 0.6,
                    bottom: y + textHeight * 0.6
                }
            },
            { // Left
                textX: x - markerSize - padding,
                textY: y,
                align: 'right',
                box: {
                    left: x - markerSize - textWidth - padding * 2,
                    right: x - markerSize,
                    top: y - textHeight * 0.6,
                    bottom: y + textHeight * 0.6
                }
            },
            { // Above-right (diagonal)
                textX: x + markerSize * 0.5,
                textY: y - markerSize - textHeight * 0.3,
                align: 'left',
                box: {
                    left: x + markerSize * 0.5 - padding,
                    right: x + markerSize * 0.5 + textWidth + padding,
                    top: y - markerSize - textHeight,
                    bottom: y - markerSize + textHeight * 0.2
                }
            },
            { // Below-right (diagonal)
                textX: x + markerSize * 0.5,
                textY: y + markerSize + textHeight * 0.5,
                align: 'left',
                box: {
                    left: x + markerSize * 0.5 - padding,
                    right: x + markerSize * 0.5 + textWidth + padding,
                    top: y + markerSize - textHeight * 0.2,
                    bottom: y + markerSize + textHeight
                }
            },
            { // Above center
                textX: x,
                textY: y - markerSize - padding - textHeight * 0.3,
                align: 'center',
                box: {
                    left: x - textWidth / 2 - padding,
                    right: x + textWidth / 2 + padding,
                    top: y - markerSize - textHeight - padding,
                    bottom: y - markerSize
                }
            },
            { // Below center
                textX: x,
                textY: y + markerSize + padding + textHeight * 0.5,
                align: 'center',
                box: {
                    left: x - textWidth / 2 - padding,
                    right: x + textWidth / 2 + padding,
                    top: y + markerSize,
                    bottom: y + markerSize + textHeight + padding
                }
            },
            { // Above-left (diagonal)
                textX: x - markerSize * 0.5,
                textY: y - markerSize - textHeight * 0.3,
                align: 'right',
                box: {
                    left: x - markerSize * 0.5 - textWidth - padding,
                    right: x - markerSize * 0.5 + padding,
                    top: y - markerSize - textHeight,
                    bottom: y - markerSize + textHeight * 0.2
                }
            },
            { // Below-left (diagonal)
                textX: x - markerSize * 0.5,
                textY: y + markerSize + textHeight * 0.5,
                align: 'right',
                box: {
                    left: x - markerSize * 0.5 - textWidth - padding,
                    right: x - markerSize * 0.5 + padding,
                    top: y + markerSize - textHeight * 0.2,
                    bottom: y + markerSize + textHeight
                }
            }
        ];
        
        // Find first non-colliding position
        let bestPos = null;
        for (const pos of positions) {
            let collides = false;
            for (const placed of placedLabels) {
                if (pos.box.left < placed.right && pos.box.right > placed.left &&
                    pos.box.top < placed.bottom && pos.box.bottom > placed.top) {
                    collides = true;
                    break;
                }
            }
            if (!collides) {
                bestPos = pos;
                break;
            }
        }
        
        // If all positions collide, skip this label entirely to keep map clean
        if (!bestPos) {
            continue;
        }
        
        // Draw the label
        ctx.save();
        ctx.font = `italic ${fontSize}px 'IM Fell English', Georgia, serif`;
        ctx.textAlign = bestPos.align;
        ctx.textBaseline = 'middle';
        
        // Soft halo for legibility
        const shadowLayers = [
            { blur: 2, alpha: 0.5 },
            { blur: 1, alpha: 0.7 }
        ];
        for (const layer of shadowLayers) {
            ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
            ctx.shadowBlur = layer.blur;
            ctx.fillStyle = 'rgba(255, 252, 245, 0.8)';
            ctx.fillText(name, bestPos.textX, bestPos.textY);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#3D3425';
        ctx.fillText(name, bestPos.textX, bestPos.textY);
        
        ctx.restore();
        
        // Add this label to placed labels
        placedLabels.push(bestPos.box);
        
        // Store hit box for hover detection (include marker area)
        if (this._labelHitBoxes) {
            const cityObj = this.cities[index];
            this._labelHitBoxes.push({
                type: 'city',
                index: index,
                cell: cityObj ? cityObj.cell : -1,
                kingdom: cityObj ? cityObj.kingdom : -1,
                name: name,
                box: {
                    left: Math.min(x - markerSize, bestPos.box.left),
                    right: Math.max(x + markerSize, bestPos.box.right),
                    top: Math.min(y - markerSize, bestPos.box.top),
                    bottom: Math.max(y + markerSize, bestPos.box.bottom)
                }
            });
        }
    }
},

/**
 * Render roads connecting cities
 */
/**
 * Render roads connecting cities
 */
_renderRoads(ctx, bounds) {
    // Roads are rendered via SVG overlay, not canvas
    this._updateRoadSVG();
},
/**
 * Update SVG overlay with road paths
 */
_updateRoadSVG() {
    const svg = document.getElementById('road-svg');
    if (!svg) return;
    
    // Show SVG (may have been hidden during low-res render)
    svg.style.opacity = '1';
    
    // Clear existing paths
    svg.innerHTML = '';
    
    if (!this.roads || this.roads.length === 0) return;
    
    const zoom = this.viewport.zoom;
    
    // Only show roads when somewhat zoomed in
    if (zoom < 0.5) return;
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create a group for all roads with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Draw each road as its own path
    for (const road of this.roads) {
        const path = road.path;
        if (!path || path.length < 2) continue;
        
        // Simplify path to remove redundant points
        const points = path.map(p => ({ x: p.x, y: p.y }));
        const simplified = this._simplifyPath(points, 3);
        
        // Build path with gentle curves
        const d = this._buildRoadSVGPath(simplified);
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', d);
        
        // Style based on road type
        let strokeWidth, dashLength, gapLength;
        
        if (road.type === 'major' || road.type === 'trade') {
            // Major roads and trade routes - slightly wider, smaller gaps
            strokeWidth = 0.8;
            dashLength = 1.5;
            gapLength = 1.5;
        } else if (road.type === 'pass') {
            // Mountain pass roads - thinner, longer gaps
            strokeWidth = 0.6;
            dashLength = 1;
            gapLength = 2.5;
        } else {
            // Minor roads
            strokeWidth = 0.7;
            dashLength = 1;
            gapLength = 2;
        }
        
        pathEl.setAttribute('stroke-width', strokeWidth);
        pathEl.setAttribute('stroke-dasharray', `${dashLength} ${gapLength}`);
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
    
    // Draw each sea route
    for (const route of this.seaRoutes) {
        const path = route.path;
        if (!path || path.length < 2) continue;
        
        // Build SVG path string
        let d = `M ${path[0].x} ${path[0].y}`;
        for (let i = 1; i < path.length; i++) {
            d += ` L ${path[i].x} ${path[i].y}`;
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
    
    // Coastline style - faint but full opacity
    const strokeColor = '#A89880';
    const strokeWidth = 1; // Fixed width in world units
    
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
 * Build connected paths from segments
 */
_buildRoadPaths(segments) {
    if (segments.length === 0) return [];
    
    // Build adjacency map
    const adjacency = new Map();
    const usedSegments = new Set();
    
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        
        if (!adjacency.has(seg.k1)) adjacency.set(seg.k1, []);
        if (!adjacency.has(seg.k2)) adjacency.set(seg.k2, []);
        
        adjacency.get(seg.k1).push({ idx: i, otherKey: seg.k2, x: seg.x2, y: seg.y2 });
        adjacency.get(seg.k2).push({ idx: i, otherKey: seg.k1, x: seg.x1, y: seg.y1 });
    }
    
    const paths = [];
    
    // Build paths starting from endpoints (degree 1 nodes)
    for (const [key, neighbors] of adjacency) {
        // Check if this is an endpoint with unused edges
        const unusedNeighbors = neighbors.filter(n => !usedSegments.has(n.idx));
        if (unusedNeighbors.length !== 1) continue;
        
        // Start building path from this endpoint
        const seg = segments[unusedNeighbors[0].idx];
        const path = [{ x: seg.k1 === key ? seg.x1 : seg.x2, y: seg.k1 === key ? seg.y1 : seg.y2 }];
        
        let currentKey = key;
        
        while (true) {
            const neighbors = adjacency.get(currentKey) || [];
            let found = false;
            
            for (const neighbor of neighbors) {
                if (!usedSegments.has(neighbor.idx)) {
                    usedSegments.add(neighbor.idx);
                    path.push({ x: neighbor.x, y: neighbor.y });
                    currentKey = neighbor.otherKey;
                    found = true;
                    break;
                }
            }
            
            if (!found) break;
        }
        
        if (path.length >= 2) {
            paths.push(path);
        }
    }
    
    // Handle any remaining segments (cycles or isolated)
    for (let i = 0; i < segments.length; i++) {
        if (usedSegments.has(i)) continue;
        
        const seg = segments[i];
        usedSegments.add(i);
        
        const path = [{ x: seg.x1, y: seg.y1 }];
        let currentKey = seg.k2;
        path.push({ x: seg.x2, y: seg.y2 });
        
        // Try to extend
        while (true) {
            const neighbors = adjacency.get(currentKey) || [];
            let found = false;
            
            for (const neighbor of neighbors) {
                if (!usedSegments.has(neighbor.idx)) {
                    usedSegments.add(neighbor.idx);
                    path.push({ x: neighbor.x, y: neighbor.y });
                    currentKey = neighbor.otherKey;
                    found = true;
                    break;
                }
            }
            
            if (!found) break;
        }
        
        if (path.length >= 2) {
            paths.push(path);
        }
    }
    
    return paths;
},

/**
 * Interpolate road path using cardinal spline for smooth curves
 */
_interpolateRoadPath(path) {
    if (path.length < 2) return path;
    if (path.length === 2) {
        // For 2 points, just return them as-is (straight line)
        return path;
    }
    
    const result = [];
    const tension = 0.3; // Lower tension for subtler curves
    const segments = 4; // Fewer interpolation points
    
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
 * Render proper contour lines using cached paths
 */
_renderContourLines(ctx, bounds) {
    if (!this.heights || !this.delaunay) return;
    
    const zoom = this.viewport.zoom;
    
    // Only show contours when zoomed in enough
    if (zoom < 1.0) return;
    
    // Generate contours once and cache them (check for null OR empty)
    if (!this._contourCache || this._contourCache.length === 0) {
        this._generateContourCache();
    }
    
    // Safety check - ensure cache is a non-empty array
    if (!Array.isArray(this._contourCache) || this._contourCache.length === 0) return;
    
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw cached contour paths
    for (const contour of this._contourCache) {
        // Style - very subtle brown lines
        const isMajor = contour.level % 500 === 0;
        ctx.strokeStyle = isMajor ? 'rgba(100, 80, 60, 0.12)' : 'rgba(100, 80, 60, 0.06)';
        ctx.lineWidth = isMajor ? Math.max(0.4, 0.8 / zoom) : Math.max(0.3, 0.6 / zoom);
        
        ctx.beginPath();
        
        for (const path of contour.paths) {
            if (path.length < 2) continue;
            
            // Quick bounds check for path
            let inView = false;
            for (const p of path) {
                if (p.x >= bounds.left - 20 && p.x <= bounds.right + 20 &&
                    p.y >= bounds.top - 20 && p.y <= bounds.bottom + 20) {
                    inView = true;
                    break;
                }
            }
            if (!inView) continue;
            
            ctx.moveTo(path[0].x, path[0].y);
            
            if (path.length > 2) {
                for (let i = 1; i < path.length - 1; i++) {
                    const xc = (path[i].x + path[i + 1].x) / 2;
                    const yc = (path[i].y + path[i + 1].y) / 2;
                    ctx.quadraticCurveTo(path[i].x, path[i].y, xc, yc);
                }
            }
            ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
        }
        
        ctx.stroke();
    }
    
    ctx.restore();
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
    const cellIdx = this.delaunay.find(x, y);
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
 * Find the horizontal span of a kingdom at a given Y level
 */
/**
 * Find the best position for a kingdom label using advanced algorithm
 * Handles disconnected regions (islands) by finding the largest connected component
 * Then finds the visual center (pole of inaccessibility) within that region
 */
_findBestKingdomLabelPosition(cells, kingdomId) {
    if (!cells || cells.length === 0) return null;
    
    // Step 1: Find connected components of this kingdom
    const components = this._findConnectedComponents(cells);
    
    if (components.length === 0) return null;
    
    // Step 2: Find the largest component by cell count
    let largestComponent = components[0];
    for (const comp of components) {
        if (comp.length > largestComponent.length) {
            largestComponent = comp;
        }
    }
    
    // Step 3: Calculate bounding box and centroid of largest component
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;
    
    for (const cellIdx of largestComponent) {
        const x = this.points[cellIdx * 2];
        const y = this.points[cellIdx * 2 + 1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        sumX += x;
        sumY += y;
    }
    
    const regionWidth = maxX - minX;
    const regionHeight = maxY - minY;
    const centroidX = sumX / largestComponent.length;
    const centroidY = sumY / largestComponent.length;
    
    // Collect city/capitol positions to avoid
    const citiesToAvoid = [];
    const zoom = this.viewport.zoom;
    
    if (this.capitols && this.capitols[kingdomId] >= 0) {
        const capCell = this.capitols[kingdomId];
        citiesToAvoid.push({
            x: this.points[capCell * 2],
            y: this.points[capCell * 2 + 1],
            radius: Math.max(80, 120 / zoom)
        });
    }
    if (this.cities) {
        for (const city of this.cities) {
            if (city.kingdom === kingdomId) {
                citiesToAvoid.push({
                    x: this.points[city.cell * 2],
                    y: this.points[city.cell * 2 + 1],
                    radius: Math.max(50, 80 / zoom)
                });
            }
        }
    }
    
    // Step 4: Find the "pole of inaccessibility" - point furthest from edges AND cities
    const bestPoint = this._findPoleOfInaccessibility(largestComponent, minX, maxX, minY, maxY, citiesToAvoid);
    
    // Step 5: Find the horizontal span at the best Y position
    const { spanWidth, spanCenterX } = this._findKingdomSpanAtY(
        largestComponent, 
        bestPoint.y, 
        minX, 
        maxX
    );
    
    return {
        centerX: bestPoint.x,
        centerY: bestPoint.y,
        spanWidth: Math.max(spanWidth, regionWidth * 0.3), // Minimum span
        regionWidth,
        regionHeight,
        componentSize: largestComponent.length,
        minX, maxX, minY, maxY
    };
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
        
        // BFS to find connected component
        const component = [];
        const queue = [startCell];
        visited.add(startCell);
        
        while (queue.length > 0) {
            const cell = queue.shift();
            component.push(cell);
            
            // Check neighbors
            const neighbors = Array.from(this.voronoi.neighbors(cell));
            for (const neighbor of neighbors) {
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
 * Find the pole of inaccessibility - the point furthest from the boundary
 * Uses iterative grid refinement for efficiency
 * Also avoids cities/capitols if provided
 */
_findPoleOfInaccessibility(cells, minX, maxX, minY, maxY, citiesToAvoid = []) {
    const cellSet = new Set(cells);
    
    // Build a set of boundary cells (cells with non-kingdom neighbors)
    const boundaryCells = [];
    for (const cellIdx of cells) {
        const neighbors = Array.from(this.voronoi.neighbors(cellIdx));
        let isBoundary = false;
        for (const n of neighbors) {
            if (!cellSet.has(n)) {
                isBoundary = true;
                break;
            }
        }
        if (isBoundary) {
            boundaryCells.push({
                x: this.points[cellIdx * 2],
                y: this.points[cellIdx * 2 + 1]
            });
        }
    }
    
    // If no boundary (shouldn't happen), return centroid
    if (boundaryCells.length === 0) {
        let sumX = 0, sumY = 0;
        for (const cellIdx of cells) {
            sumX += this.points[cellIdx * 2];
            sumY += this.points[cellIdx * 2 + 1];
        }
        return { x: sumX / cells.length, y: sumY / cells.length };
    }
    
    // Grid search: find point with maximum distance to nearest boundary AND cities
    const gridResolution = 8; // Initial grid
    let bestX = (minX + maxX) / 2;
    let bestY = (minY + maxY) / 2;
    let bestDist = 0;
    
    // Multiple passes with refinement
    let searchMinX = minX, searchMaxX = maxX;
    let searchMinY = minY, searchMaxY = maxY;
    
    for (let pass = 0; pass < 3; pass++) {
        const stepX = (searchMaxX - searchMinX) / gridResolution;
        const stepY = (searchMaxY - searchMinY) / gridResolution;
        
        for (let gy = 0; gy <= gridResolution; gy++) {
            for (let gx = 0; gx <= gridResolution; gx++) {
                const testX = searchMinX + gx * stepX;
                const testY = searchMinY + gy * stepY;
                
                // Check if point is inside the kingdom (find nearest cell)
                const nearestCell = this.delaunay.find(testX, testY);
                if (!cellSet.has(nearestCell)) continue;
                
                // Find minimum distance to any boundary cell
                let minDist = Infinity;
                for (const bc of boundaryCells) {
                    const dist = Math.sqrt((testX - bc.x) ** 2 + (testY - bc.y) ** 2);
                    minDist = Math.min(minDist, dist);
                }
                
                // Also check distance to cities - penalize being too close
                for (const city of citiesToAvoid) {
                    const dist = Math.sqrt((testX - city.x) ** 2 + (testY - city.y) ** 2);
                    // If within city radius, heavily penalize
                    if (dist < city.radius) {
                        minDist = Math.min(minDist, dist * 0.3); // Strong penalty
                    }
                }
                
                if (minDist > bestDist) {
                    bestDist = minDist;
                    bestX = testX;
                    bestY = testY;
                }
            }
        }
        
        // Refine search area around best point
        const margin = Math.max(stepX, stepY) * 1.5;
        searchMinX = Math.max(minX, bestX - margin);
        searchMaxX = Math.min(maxX, bestX + margin);
        searchMinY = Math.max(minY, bestY - margin);
        searchMaxY = Math.min(maxY, bestY + margin);
    }
    
    return { x: bestX, y: bestY, distance: bestDist };
},

_findKingdomSpanAtY(cells, targetY, minX, maxX) {
    const tolerance = (maxX - minX) * 0.08; // 8% tolerance band (tighter for better accuracy)
    let spanMinX = Infinity;
    let spanMaxX = -Infinity;
    let count = 0;
    
    for (const cellIdx of cells) {
        const y = this.points[cellIdx * 2 + 1];
        if (Math.abs(y - targetY) <= tolerance) {
            const x = this.points[cellIdx * 2];
            spanMinX = Math.min(spanMinX, x);
            spanMaxX = Math.max(spanMaxX, x);
            count++;
        }
    }
    
    // Fallback to full width if no cells found at target Y
    if (count < 2 || spanMinX >= spanMaxX) {
        return { spanWidth: maxX - minX, spanCenterX: (minX + maxX) / 2, cellCount: count };
    }
    
    return { 
        spanWidth: spanMaxX - spanMinX, 
        spanCenterX: (spanMinX + spanMaxX) / 2,
        cellCount: count
    };
},
/**
 * Draw straight (possibly rotated) kingdom text
 */
_drawStraightKingdomText(ctx, name, centerX, centerY, fontSize, angle, zoom) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    
    // Parse name to split title prefix from kingdom name
    const { prefix, mainName } = this._parseKingdomName(name);
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Always use two-line layout: smaller italic prefix above, larger name below
    const prefixFontSize = fontSize * 0.42;
    const prefixY = -fontSize * 0.5;
    const mainY = fontSize * 0.32;
    
    // Draw prefix (smaller, italic)
    ctx.font = `italic ${prefixFontSize}px 'IM Fell English', Georgia, serif`;
    this._drawMapText(ctx, prefix, 0, prefixY, zoom, false);
    
    // Draw main name (larger, uppercase with Cinzel)
    ctx.font = `500 ${fontSize}px 'Cinzel', 'IM Fell English', Georgia, serif`;
    this._drawMapText(ctx, mainName.toUpperCase(), 0, mainY, zoom, true);
    
    ctx.restore();
},

/**
 * Draw text with elegant antique map styling
 * Uses soft shadow halo instead of harsh stroke
 */
_drawMapText(ctx, text, x, y, zoom, isMain) {
    const shadowColor = 'rgba(255, 252, 245, 0.85)';
    const textColor = '#2C2416';
    
    ctx.save();
    
    if (isMain) {
        // For main text: elegant soft halo with multiple layers
        const layers = [
            { blur: 8, alpha: 0.3 },
            { blur: 5, alpha: 0.4 },
            { blur: 3, alpha: 0.6 },
            { blur: 2, alpha: 0.8 }
        ];
        
        for (const layer of layers) {
            ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
            ctx.shadowBlur = layer.blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = shadowColor;
            ctx.fillText(text, x, y);
        }
    } else {
        // For prefix: lighter, subtler halo
        const layers = [
            { blur: 4, alpha: 0.3 },
            { blur: 2, alpha: 0.5 },
            { blur: 1, alpha: 0.7 }
        ];
        
        for (const layer of layers) {
            ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
            ctx.shadowBlur = layer.blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = shadowColor;
            ctx.fillText(text, x, y);
        }
    }
    
    // Clear shadow for crisp main text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // Draw main text
    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);
    
    ctx.restore();
},

/**
 * Parse kingdom name to extract prefix and main name
 */
_parseKingdomName(name) {
    // Sorted by length (longest first) to avoid partial matches
    const prefixes = [
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
        'Sultanate of',
        'Caliphate of',
        'Shogunate of',
        'Republic of',
        'Dominion of',
        'Province of',
        'Kingdom of',
        'Khanate of',
        'County of',
        'Barony of',
        'Empire of',
        'Throne of',
        'Duchy of',
        'Realm of',
        'March of',
        'Union of',
        'Crown of',
        'Lands of',
        'House of'
    ];
    
    for (const prefix of prefixes) {
        if (name.startsWith(prefix + ' ')) {
            return {
                prefix: prefix,
                mainName: name.slice(prefix.length + 1)
            };
        }
    }
    
    // Fallback: if no prefix found, use "Realm of" as default
    return { prefix: 'Realm of', mainName: name };
},

/**
 * Draw curved text along the kingdom's natural spine
 */
_drawCurvedKingdomText(ctx, name, centerX, centerY, fontSize, spanWidth, zoom, curveUp, cells, minX, maxX) {
    // Parse name - always returns prefix and mainName
    const { prefix, mainName } = this._parseKingdomName(name);
    
    // Create a simple smooth bezier curve for the text path
    const width = maxX - minX;
    const curveHeight = width * 0.08; // Gentle curve
    const curveDir = curveUp ? -1 : 1;
    
    // Quadratic bezier: start, control, end
    const startX = minX + width * 0.1;
    const endX = maxX - width * 0.1;
    const midX = centerX;
    
    // Use the passed centerY (which may have been adjusted for capitol collision)
    const avgY = centerY;
    
    const startY = avgY;
    const endY = avgY;
    const controlY = avgY + curveDir * curveHeight;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Function to get point on quadratic bezier
    const getBezierPoint = (t) => {
        const mt = 1 - t;
        return {
            x: mt * mt * startX + 2 * mt * t * midX + t * t * endX,
            y: mt * mt * startY + 2 * mt * t * controlY + t * t * endY
        };
    };
    
    // Function to get tangent angle on bezier
    const getBezierAngle = (t) => {
        const mt = 1 - t;
        const dx = 2 * mt * (midX - startX) + 2 * t * (endX - midX);
        const dy = 2 * mt * (controlY - startY) + 2 * t * (endY - controlY);
        return Math.atan2(dy, dx);
    };
    
    // Draw prefix above main text at center
    const prefixFontSize = fontSize * 0.42;
    ctx.font = `italic ${prefixFontSize}px 'IM Fell English', Georgia, serif`;
    
    const centerPos = getBezierPoint(0.5);
    const centerAngle = getBezierAngle(0.5);
    const prefixOffsetY = -fontSize * 0.85;
    
    const prefixPerpX = Math.cos(centerAngle + Math.PI/2) * prefixOffsetY;
    const prefixPerpY = Math.sin(centerAngle + Math.PI/2) * prefixOffsetY;
    
    ctx.save();
    ctx.translate(centerPos.x + prefixPerpX, centerPos.y + prefixPerpY);
    ctx.rotate(centerAngle);
    
    // Elegant halo effect for prefix
    const shadowLayers = [
        { blur: 4, alpha: 0.3 },
        { blur: 2, alpha: 0.5 },
        { blur: 1, alpha: 0.7 }
    ];
    for (const layer of shadowLayers) {
        ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
        ctx.shadowBlur = layer.blur;
        ctx.fillStyle = 'rgba(255, 252, 245, 0.85)';
        ctx.fillText(prefix, 0, 0);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2C2416';
    ctx.fillText(prefix, 0, 0);
    
    ctx.restore();
    
    // Draw main name - character by character along curve
    ctx.font = `500 ${fontSize}px 'Cinzel', 'IM Fell English', Georgia, serif`;
    
    const mainText = mainName.toUpperCase();
    const chars = mainText.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0);
    const spacing = fontSize * 0.05;
    const totalWithSpacing = totalWidth + spacing * (chars.length - 1);
    
    // Calculate t range for text (centered on curve)
    const curveLength = endX - startX; // Approximate
    const textRatio = Math.min(0.9, totalWithSpacing / curveLength);
    const startT = (1 - textRatio) / 2;
    const tPerPixel = textRatio / totalWithSpacing;
    
    let currentT = startT;
    const mainOffsetY = fontSize * 0.4;
    
    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const charWidth = charWidths[i];
        
        // Get position at middle of character
        const charT = currentT + (charWidth / 2) * tPerPixel;
        const pos = getBezierPoint(charT);
        const angle = getBezierAngle(charT);
        
        // Calculate perpendicular offset for main text (below prefix)
        const perpX = Math.cos(angle + Math.PI/2) * mainOffsetY;
        const perpY = Math.sin(angle + Math.PI/2) * mainOffsetY;
        
        ctx.save();
        ctx.translate(pos.x + perpX, pos.y + perpY);
        ctx.rotate(angle);
        
        // Elegant halo effect for each character
        const charShadowLayers = [
            { blur: 6, alpha: 0.3 },
            { blur: 4, alpha: 0.4 },
            { blur: 2, alpha: 0.6 },
            { blur: 1, alpha: 0.8 }
        ];
        for (const layer of charShadowLayers) {
            ctx.shadowColor = `rgba(255, 252, 245, ${layer.alpha})`;
            ctx.shadowBlur = layer.blur;
            ctx.fillStyle = 'rgba(255, 252, 245, 0.85)';
            ctx.fillText(char, 0, 0);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2C2416';
        ctx.fillText(char, 0, 0);
        
        ctx.restore();
        
        currentT += (charWidth + spacing) * tPerPixel;
    }
},
/**
 * Get total length of a path
 */
_getPathLength(path) {
    let length = 0;
    for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i-1].x;
        const dy = path[i].y - path[i-1].y;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
},
/**
 * Get point at a specific distance along the path
 */
_getPointAtDistance(path, targetDist) {
    if (path.length < 2) return path[0] || { x: 0, y: 0 };
    
    let dist = 0;
    for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i-1].x;
        const dy = path[i].y - path[i-1].y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        
        if (dist + segLen >= targetDist) {
            const t = (targetDist - dist) / segLen;
            return {
                x: path[i-1].x + dx * t,
                y: path[i-1].y + dy * t
            };
        }
        dist += segLen;
    }
    
    return path[path.length - 1];
},
/**
 * Get tangent angle at a specific distance along the path
 */
_getAngleAtDistance(path, targetDist) {
    if (path.length < 2) return 0;
    
    let dist = 0;
    for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i-1].x;
        const dy = path[i].y - path[i-1].y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        
        if (dist + segLen >= targetDist || i === path.length - 1) {
            return Math.atan2(dy, dx);
        }
        dist += segLen;
    }
    
    return 0;
},
/**
 * Calculate the best angle for kingdom text based on shape
 */
_getKingdomAngle(cells, centerX, centerY) {
    // Calculate covariance to find principal axis
    let covXX = 0, covXY = 0, covYY = 0;
    
    for (const cellIdx of cells) {
        const x = this.points[cellIdx * 2] - centerX;
        const y = this.points[cellIdx * 2 + 1] - centerY;
        covXX += x * x;
        covXY += x * y;
        covYY += y * y;
    }
    
    // Find principal eigenvector direction
    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const eigenvalue1 = trace / 2 + Math.sqrt(Math.max(0, trace * trace / 4 - det));
    
    let angle = 0;
    if (Math.abs(covXY) > 0.001) {
        angle = Math.atan2(eigenvalue1 - covXX, covXY);
    } else if (covXX > covYY) {
        angle = 0;
    } else {
        angle = Math.PI / 2;
    }
    
    // Keep angle in readable range (-45 to +45 degrees)
    while (angle > Math.PI / 4) angle -= Math.PI / 2;
    while (angle < -Math.PI / 4) angle += Math.PI / 2;
    
    return angle;
},
/**
 * Render borders between kingdoms - traditional map style
 * (coastline borders are handled separately by smooth coastline rendering)
 */
_renderKingdomBorders(ctx, bounds) {
    if (!this.kingdoms || !this.heights) return;
    
    const zoom = this.viewport.zoom;
    const borderWidth = Math.max(0.25, 1 / zoom);
    
    // Build smooth coastline for clipping
    if (!this._coastlineCache) { this._coastlineCache = this._buildSmoothCoastlineLoops(); } const coastLoops = this._coastlineCache;
    
    // Collect border edges between different kingdoms (not coastlines)
    const borderEdges = [];
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
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
            const neighborKingdom = edgeNeighbor >= 0 ? this.kingdoms[edgeNeighbor] : -1;
            
            // Only collect border if different kingdom AND not coastline
            if (!neighborIsOcean && neighborKingdom !== myKingdom && neighborKingdom >= 0) {
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
    
    // Draw smoothed borders
    ctx.strokeStyle = 'rgba(101, 85, 60, 0.7)';
    ctx.lineWidth = borderWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Set dash pattern if enabled
    if (this.dashedBorders) {
        const dashLength = Math.max(4, 8 / zoom);
        const gapLength = Math.max(3, 6 / zoom);
        ctx.setLineDash([dashLength, gapLength]);
    } else {
        ctx.setLineDash([]);
    }
    
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
 * Chain border edges into continuous paths
 */
_chainBorderEdges(edges) {
    if (edges.length === 0) return [];
    
    const tolerance = 1.5;
    const paths = [];
    const used = new Set();
    
    for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (used.has(startIdx)) continue;
        
        const path = [];
        let currentEdge = edges[startIdx];
        used.add(startIdx);
        
        path.push({ x: currentEdge.x1, y: currentEdge.y1 });
        path.push({ x: currentEdge.x2, y: currentEdge.y2 });
        
        // Extend forward
        let extended = true;
        while (extended) {
            extended = false;
            const lastPoint = path[path.length - 1];
            
            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue;
                
                const edge = edges[i];
                const d1 = Math.abs(edge.x1 - lastPoint.x) + Math.abs(edge.y1 - lastPoint.y);
                const d2 = Math.abs(edge.x2 - lastPoint.x) + Math.abs(edge.y2 - lastPoint.y);
                
                if (d1 < tolerance) {
                    path.push({ x: edge.x2, y: edge.y2 });
                    used.add(i);
                    extended = true;
                    break;
                } else if (d2 < tolerance) {
                    path.push({ x: edge.x1, y: edge.y1 });
                    used.add(i);
                    extended = true;
                    break;
                }
            }
        }
        
        // Extend backward
        extended = true;
        while (extended) {
            extended = false;
            const firstPoint = path[0];
            
            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue;
                
                const edge = edges[i];
                const d1 = Math.abs(edge.x1 - firstPoint.x) + Math.abs(edge.y1 - firstPoint.y);
                const d2 = Math.abs(edge.x2 - firstPoint.x) + Math.abs(edge.y2 - firstPoint.y);
                
                if (d1 < tolerance) {
                    path.unshift({ x: edge.x2, y: edge.y2 });
                    used.add(i);
                    extended = true;
                    break;
                } else if (d2 < tolerance) {
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
 * Smooth a border path using Chaikin's algorithm
 */
_smoothBorderPath(path, iterations = 1) {
    if (path.length < 3) return path;
    
    let points = path;
    
    for (let iter = 0; iter < iterations; iter++) {
        const newPoints = [];
        
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            
            if (i === 0) {
                newPoints.push(p0);
            }
            
            newPoints.push({
                x: 0.75 * p0.x + 0.25 * p1.x,
                y: 0.75 * p0.y + 0.25 * p1.y
            });
            newPoints.push({
                x: 0.25 * p0.x + 0.75 * p1.x,
                y: 0.25 * p0.y + 0.75 * p1.y
            });
            
            if (i === points.length - 2) {
                newPoints.push(p1);
            }
        }
        
        points = newPoints;
    }
    
    return points;
},
/**
 * Get all boundary vertices of a lake (points on the edge)
 */
_getLakeBoundaryPoints(lake) {
    const lakeSet = new Set(lake.cells);
    const allLakeCells = this.lakeCells || new Set();
    const boundaryPoints = [];
    const addedKeys = new Set();
    
    for (const cellIndex of lake.cells) {
        const cell = this.voronoi.cellPolygon(cellIndex);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(cellIndex));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            const edgeMidX = (v1[0] + v2[0]) / 2;
            const edgeMidY = (v1[1] + v2[1]) / 2;
            
            // Find neighbor on other side of this edge
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
            
            // If edge is on boundary (neighbor not in lake), add both vertices
            if (edgeNeighbor >= 0 && !allLakeCells.has(edgeNeighbor)) {
                const key1 = `${v1[0].toFixed(1)},${v1[1].toFixed(1)}`;
                const key2 = `${v2[0].toFixed(1)},${v2[1].toFixed(1)}`;
                
                if (!addedKeys.has(key1)) {
                    boundaryPoints.push({ x: v1[0], y: v1[1], key: key1 });
                    addedKeys.add(key1);
                }
                if (!addedKeys.has(key2)) {
                    boundaryPoints.push({ x: v2[0], y: v2[1], key: key2 });
                    addedKeys.add(key2);
                }
            }
        }
    }
    
    return boundaryPoints;
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
 * Render rivers via SVG overlay
 */
_renderRivers(ctx, bounds) {
    // Rivers are rendered via SVG overlay, not canvas
    this._updateRiverSVG();
    
    // Still render river names on canvas
    this._renderRiverNames(ctx, bounds);
},

/**
 * Update SVG overlay with river paths
 */
/**
 * Render rivers on canvas (for political mode where rivers are below kingdom colors)
 */
_renderRiversCanvas(ctx, bounds) {
    if (!this.rivers || this.rivers.length === 0) return;
    if (!this.heights) return;
    
    const zoom = this.viewport.zoom;
    
    // Clip rivers to coastline
    const coastLoops = this._coastlineCache || this._buildSmoothCoastlineLoops();
    const hasClip = coastLoops.length > 0;
    if (hasClip) {
        ctx.save();
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
    
    // Width parameters (in world space, will scale with zoom)
    const minWidth = 0.3;
    const maxWidth = 2.0;
    
    for (const river of this.rivers) {
        const path = river.path;
        if (path.length < 2) continue;
        
        // Check if river is in view
        let inView = false;
        for (const p of path) {
            if (p.x >= bounds.left - 50 && p.x <= bounds.right + 50 &&
                p.y >= bounds.top - 50 && p.y <= bounds.bottom + 50) {
                inView = true;
                break;
            }
        }
        if (!inView) continue;
        
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
        
        // Draw filled river polygon
        ctx.beginPath();
        ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
        for (let i = 1; i < leftEdge.length; i++) {
            ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
        }
        for (let i = rightEdge.length - 1; i >= 0; i--) {
            ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
        }
        ctx.closePath();
        
        // River fill color
        ctx.fillStyle = 'rgb(166, 155, 125)';
        ctx.fill();
    }
    
    if (hasClip) {
        ctx.restore();
    }
},

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
    
    // Create clipping path from coastline
    const coastLoops = this._coastlineCache || this._buildSmoothCoastlineLoops();
    if (coastLoops.length > 0) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', 'coastline-clip');
        
        let clipD = '';
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            clipD += `M ${loop[0][0]} ${loop[0][1]} `;
            for (let i = 1; i < loop.length; i++) {
                clipD += `L ${loop[i][0]} ${loop[i][1]} `;
            }
            clipD += 'Z ';
        }
        
        const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        clipPathEl.setAttribute('d', clipD);
        clipPath.appendChild(clipPathEl);
        defs.appendChild(clipPath);
        svg.appendChild(defs);
        
        g.setAttribute('clip-path', 'url(#coastline-clip)');
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
    
    // Create clipping path from coastline
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const coastLoops = this._coastlineCache || this._buildSmoothCoastlineLoops();
    
    if (coastLoops.length > 0) {
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', 'coast-clip');
        
        let clipD = '';
        for (const loop of coastLoops) {
            if (loop.length < 3) continue;
            clipD += `M ${loop[0][0]} ${loop[0][1]} `;
            for (let i = 1; i < loop.length; i++) {
                clipD += `L ${loop[i][0]} ${loop[i][1]} `;
            }
            clipD += 'Z ';
        }
        
        const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        clipPathEl.setAttribute('d', clipD);
        clipPath.appendChild(clipPathEl);
        defs.appendChild(clipPath);
    }
    svg.appendChild(defs);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    if (coastLoops.length > 0) {
        g.setAttribute('clip-path', 'url(#coast-clip)');
    }
    
    // 1. First pass: Render all kingdom fills (no strokes)
    for (let k = 0; k < this.kingdomCount; k++) {
        const cells = this.kingdomCells[k];
        if (!cells || cells.length === 0) continue;
        
        // Build smooth boundary for this kingdom
        const boundaries = this._buildKingdomBoundary(k);
        if (boundaries.length === 0) continue;
        
        // Get kingdom color
        const colorIndex = (this.kingdomColors && this.kingdomColors[k] >= 0) 
            ? this.kingdomColors[k] 
            : k % POLITICAL_COLORS.length;
        const color = POLITICAL_COLORS[colorIndex];
        
        // Draw each boundary loop as a filled path (no stroke)
        for (const boundary of boundaries) {
            if (boundary.length < 3) continue;
            
            let d = `M ${boundary[0][0]} ${boundary[0][1]}`;
            for (let i = 1; i < boundary.length; i++) {
                d += ` L ${boundary[i][0]} ${boundary[i][1]}`;
            }
            d += ' Z';
            
            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('fill', color);
            pathEl.setAttribute('stroke', 'none');
            pathEl.setAttribute('class', 'kingdom-fill');
            g.appendChild(pathEl);
        }
    }
    
    // 2. Second pass: Draw border lines between different kingdoms
    const borderEdges = this._collectKingdomBorderEdges();
    const strokeWidth = 1.2; // Fixed width in world coordinates - scales with transform
    
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
            pathEl.setAttribute('stroke', '#9A8A7A');
            pathEl.setAttribute('stroke-width', strokeWidth);
            pathEl.setAttribute('stroke-linecap', 'round');
            pathEl.setAttribute('stroke-linejoin', 'round');
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
 * Smooth an open path (not closed loop)
 */
_smoothOpenPath(points) {
    if (points.length < 3) return points;
    
    const smoothed = [points[0]]; // Keep first point
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        // Average with neighbors
        const x = (prev[0] + curr[0] * 2 + next[0]) / 4;
        const y = (prev[1] + curr[1] * 2 + next[1]) / 4;
        smoothed.push([x, y]);
    }
    
    smoothed.push(points[points.length - 1]); // Keep last point
    return smoothed;
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
    
    // Set SVG viewBox to match canvas
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    
    // Create defs for icon symbols
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Capitol icon - grand castle with towers and flags
    const capitolSymbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    capitolSymbol.setAttribute('id', 'capitol-icon');
    capitolSymbol.setAttribute('viewBox', '0 0 32 24');
    capitolSymbol.innerHTML = `
        <g fill="#3D2F1F">
            <!-- Left tower -->
            <rect x="1" y="10" width="6" height="14"/>
            <rect x="0" y="8" width="8" height="3"/>
            <rect x="0" y="6" width="1.5" height="2"/>
            <rect x="3.25" y="6" width="1.5" height="2"/>
            <rect x="6.5" y="6" width="1.5" height="2"/>
            
            <!-- Left wall -->
            <rect x="7" y="16" width="4" height="8"/>
            
            <!-- Center keep -->
            <rect x="11" y="8" width="10" height="16"/>
            <rect x="10" y="5" width="12" height="4"/>
            <rect x="10" y="3" width="2" height="2"/>
            <rect x="14" y="3" width="4" height="2"/>
            <rect x="20" y="3" width="2" height="2"/>
            
            <!-- Main tower/spire -->
            <rect x="14.5" y="0" width="3" height="3"/>
            <polygon points="16,0 14,3 18,3"/>
            
            <!-- Flag -->
            <rect x="15.75" y="-4" width="0.5" height="4"/>
            <polygon points="16.25,-4 16.25,-1.5 19,-2.75"/>
            
            <!-- Right wall -->
            <rect x="21" y="16" width="4" height="8"/>
            
            <!-- Right tower -->
            <rect x="25" y="10" width="6" height="14"/>
            <rect x="24" y="8" width="8" height="3"/>
            <rect x="24" y="6" width="1.5" height="2"/>
            <rect x="27.25" y="6" width="1.5" height="2"/>
            <rect x="30.5" y="6" width="1.5" height="2"/>
            
            <!-- Gate -->
            <rect x="14" y="18" width="4" height="6" fill="#C4B998"/>
            <path d="M14,18 Q16,15 18,18" fill="#3D2F1F"/>
        </g>
    `;
    defs.appendChild(capitolSymbol);
    
    // City icon - medieval town with church and buildings
    const citySymbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    citySymbol.setAttribute('id', 'city-icon');
    citySymbol.setAttribute('viewBox', '0 0 24 18');
    citySymbol.innerHTML = `
        <g fill="#3D2F1F">
            <!-- Left small house -->
            <rect x="0" y="12" width="5" height="6"/>
            <polygon points="0,12 2.5,8 5,12"/>
            
            <!-- Left medium building -->
            <rect x="5" y="10" width="4" height="8"/>
            <polygon points="5,10 7,6 9,10"/>
            
            <!-- Church (center) -->
            <rect x="9" y="8" width="6" height="10"/>
            <polygon points="9,8 12,3 15,8"/>
            <rect x="11.5" y="0" width="1" height="3"/>
            <rect x="10.5" y="0.5" width="3" height="0.8"/>
            
            <!-- Right building -->
            <rect x="15" y="11" width="4" height="7"/>
            <polygon points="15,11 17,7 19,11"/>
            
            <!-- Right small house -->
            <rect x="19" y="13" width="5" height="5"/>
            <polygon points="19,13 21.5,9 24,13"/>
        </g>
    `;
    defs.appendChild(citySymbol);
    
    svg.appendChild(defs);
    
    // Create a group with transform
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${this.viewport.x}, ${this.viewport.y}) scale(${zoom})`);
    
    // Icon scale in world space
    const capitolScale = 0.5;
    const cityScale = 0.45;
    
    // Draw capitols
    if (this.capitols && this.capitolNames) {
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            if (capitolCell < 0) continue;
            
            const x = this.points[capitolCell * 2];
            const y = this.points[capitolCell * 2 + 1];
            
            const w = 32 * capitolScale;
            const h = 24 * capitolScale;
            
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#capitol-icon');
            use.setAttribute('x', x - w / 2);
            use.setAttribute('y', y - h + 2);
            use.setAttribute('width', w);
            use.setAttribute('height', h);
            use.setAttribute('class', 'capitol-icon');
            g.appendChild(use);
            
            // Add hit box for capitol icon
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'capital',
                    index: k,
                    cell: capitolCell,
                    kingdom: k,
                    name: this.capitolNames[k] || `Capitol ${k}`,
                    box: {
                        left: x - w / 2 - 2,
                        right: x + w / 2 + 2,
                        top: y - h,
                        bottom: y + 4
                    }
                });
            }
        }
    }
    
    // Draw cities (only when zoomed in enough)
    if (zoom > 0.6 && this.cities && this.cityNames) {
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            if (!city || city.cell < 0) continue;
            
            const x = this.points[city.cell * 2];
            const y = this.points[city.cell * 2 + 1];
            
            const w = 24 * cityScale;
            const h = 18 * cityScale;
            
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#city-icon');
            use.setAttribute('x', x - w / 2);
            use.setAttribute('y', y - h + 1);
            use.setAttribute('width', w);
            use.setAttribute('height', h);
            use.setAttribute('class', 'city-icon');
            g.appendChild(use);
            
            // Add hit box for city icon
            if (this._labelHitBoxes) {
                this._labelHitBoxes.push({
                    type: 'city',
                    index: i,
                    cell: city.cell,
                    kingdom: city.kingdom,
                    name: this.cityNames[i] || `City ${i}`,
                    box: {
                        left: x - w / 2 - 2,
                        right: x + w / 2 + 2,
                        top: y - h,
                        bottom: y + 3
                    }
                });
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
            
            // Find label position
            const labelPos = this._findBestKingdomLabelPosition(cells, k);
            if (!labelPos) continue;
            
            const { centerX, centerY, spanWidth, regionHeight } = labelPos;
            
            // Calculate font size based on kingdom size (smaller overall)
            const sizeRatio = Math.sqrt(kingdom.size / maxSize);
            const baseFontSize = 4 + (sizeRatio * 10);
            const fontSize = Math.max(2.5, Math.min(baseFontSize, spanWidth * 0.08, regionHeight * 0.2));
            
            // Parse name for display
            const { prefix, mainName } = this._parseKingdomName(name);
            const displayText = (mainName || name).toUpperCase();
            
            // Calculate collision box for the entire label (including prefix)
            const estWidth = displayText.length * fontSize * 0.65;
            const totalHeight = prefix ? fontSize * 1.8 : fontSize;
            const box = {
                left: centerX - estWidth / 2 - 3,
                right: centerX + estWidth / 2 + 3,
                top: centerY - totalHeight / 2 - 3,
                bottom: centerY + totalHeight / 2 + 3
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
            text.setAttribute('x', centerX);
            text.setAttribute('y', centerY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('class', 'kingdom-label');
            text.setAttribute('font-size', fontSize);
            text.setAttribute('letter-spacing', '0.2em');
            text.textContent = displayText;
            
            // Add prefix if exists
            if (prefix) {
                const prefixText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                prefixText.setAttribute('x', centerX);
                prefixText.setAttribute('y', centerY - fontSize * 0.9);
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
    
    // 2. Capitol names - positioned below the castle icon
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
    
    // 3. City names (only when zoomed in) - positioned below icon
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
 * Render river names along the river paths - subtle vintage style
 */
_renderRiverNames(ctx, bounds) {
    if (!this.rivers || this.rivers.length === 0) return;
    
    const zoom = this.viewport.zoom;
    
    // Only show river names at sufficient zoom
    if (zoom < 1.0) return;
    
    ctx.save();
    
    // Style for river labels - subtle, no outline
    const fontSize = Math.max(6, Math.min(9, 8 / zoom));
    ctx.font = `italic ${fontSize}px "Times New Roman", Georgia, serif`;
    ctx.fillStyle = 'rgba(60, 80, 100, 0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Only label longer rivers
    const minLength = 30;
    
    for (const river of this.rivers) {
        if (!river.name) continue;
        if (river.path.length < minLength) continue;
        
        // Find a relatively straight section of the river for the label
        const labelSection = this._findStraightSection(river.path);
        if (!labelSection) continue;
        
        // Check if this section is in view
        if (labelSection.x < bounds.minX - 50 || labelSection.x > bounds.maxX + 50 ||
            labelSection.y < bounds.minY - 50 || labelSection.y > bounds.maxY + 50) {
            continue;
        }
        
        // Draw text along a straight line following the river direction
        ctx.save();
        ctx.translate(labelSection.x, labelSection.y);
        ctx.rotate(labelSection.angle);
        
        // Add letter spacing for elegant look
        const text = river.name;
        let xOffset = 0;
        for (const char of text) {
            ctx.fillText(char, xOffset, 0);
            xOffset += ctx.measureText(char).width + fontSize * 0.15;
        }
        
        ctx.restore();
    }
    
    ctx.restore();
},

/**
 * Find a relatively straight section of the river path for labeling
 */
_findStraightSection(path) {
    if (path.length < 10) return null;
    
    // Look at the middle portion of the river
    const startSearch = Math.floor(path.length * 0.3);
    const endSearch = Math.floor(path.length * 0.7);
    
    let bestSection = null;
    let bestStraightness = Infinity;
    
    // Sample sections and find the straightest one
    const sectionLength = Math.min(15, Math.floor((endSearch - startSearch) / 2));
    
    for (let i = startSearch; i < endSearch - sectionLength; i += 3) {
        const p1 = path[i];
        const p2 = path[i + sectionLength];
        
        // Calculate direct distance vs path distance
        const directDist = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
        );
        
        let pathDist = 0;
        for (let j = i; j < i + sectionLength; j++) {
            const pa = path[j];
            const pb = path[j + 1];
            pathDist += Math.sqrt(
                Math.pow(pb.x - pa.x, 2) + Math.pow(pb.y - pa.y, 2)
            );
        }
        
        // Straightness = how much longer the path is than direct line
        const straightness = pathDist / Math.max(directDist, 1);
        
        if (straightness < bestStraightness && directDist > 30) {
            bestStraightness = straightness;
            
            // Calculate angle
            let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            // Flip if text would be upside down
            if (angle > Math.PI / 2) angle -= Math.PI;
            if (angle < -Math.PI / 2) angle += Math.PI;
            
            // Use midpoint of section
            const midIdx = i + Math.floor(sectionLength / 2);
            bestSection = {
                x: path[midIdx].x,
                y: path[midIdx].y,
                angle: angle
            };
        }
    }
    
    // Only use if reasonably straight (path is less than 1.3x direct distance)
    if (bestStraightness > 1.5) return null;
    
    return bestSection;
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
 * Render 3D shadow effect on coastlines - outside only, no smoothing
 */
_renderCoastline3D(ctx, bounds) {
    if (!this.heights || !this.voronoi) return;
    
    const zoom = this.viewport.zoom;
    const shadowWidth = 1 / zoom;
    
    // Collect all coastline edges from land cells
    const coastEdges = [];
    
    for (let i = 0; i < this.cellCount; i++) {
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue; // Skip ocean
        
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        // Check each edge of this land cell
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            // Find neighbor for this edge
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
            
            // If neighbor is ocean, this is coastline
            if (edgeNeighbor >= 0 && this.heights[edgeNeighbor] < ELEVATION.SEA_LEVEL) {
                coastEdges.push({
                    x1: v1[0], y1: v1[1],
                    x2: v2[0], y2: v2[1]
                });
            }
        }
    }
    
    if (coastEdges.length === 0) return;
    
    // Draw all edges as shadow strokes
    ctx.beginPath();
    for (const edge of coastEdges) {
        ctx.moveTo(edge.x1, edge.y1);
        ctx.lineTo(edge.x2, edge.y2);
    }
    ctx.strokeStyle = 'rgba(30, 60, 100, 0.4)';
    ctx.lineWidth = shadowWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
},

/**
 * Render decorative wind rose / compass in corner of map
 */
_renderWindrose(ctx) {
    ctx.save();
    
    // Reset transform to draw in screen coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Position in top-left corner
    const size = 140;
    const margin = 30;
    const cx = margin + size/2;
    const cy = margin + size/2;
    
    // Draw dashed lines extending from compass to edge of screen
    ctx.strokeStyle = 'rgba(90, 74, 58, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    
    const lineLength = Math.max(this.width, this.height) * 1.5;
    const directions = [0, 45, 90, 135, 180, 225, 270, 315];
    
    for (const deg of directions) {
        const rad = deg * Math.PI / 180;
        const startDist = size/2 + 10;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(rad) * startDist, cy - Math.cos(rad) * startDist);
        ctx.lineTo(cx + Math.sin(rad) * lineLength, cy - Math.cos(rad) * lineLength);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // Background circle (parchment colored)
    ctx.beginPath();
    ctx.arc(cx, cy, size/2 + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(212, 196, 168, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Outer decorative rings
    ctx.beginPath();
    ctx.arc(cx, cy, size/2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, size/2 - 8, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#7a6a5a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.beginPath();
    ctx.arc(cx, cy, size/2 - 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Degree tick marks
    ctx.strokeStyle = '#5a4a3a';
    for (let i = 0; i < 360; i += 10) {
        const rad = i * Math.PI / 180;
        const inner = i % 30 === 0 ? size/2 - 14 : size/2 - 10;
        const outer = size/2 - 4;
        ctx.lineWidth = i % 30 === 0 ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(rad) * inner, cy - Math.cos(rad) * inner);
        ctx.lineTo(cx + Math.sin(rad) * outer, cy - Math.cos(rad) * outer);
        ctx.stroke();
    }
    
    // Cardinal direction letters
    ctx.font = 'bold 16px "Times New Roman", Georgia, serif';
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - size/2 + 28);
    ctx.fillText('S', cx, cy + size/2 - 28);
    ctx.fillText('E', cx + size/2 - 28, cy);
    ctx.fillText('W', cx - size/2 + 28, cy);
    
    // Intercardinal labels (smaller)
    ctx.font = '10px "Times New Roman", Georgia, serif';
    ctx.fillStyle = '#5a4a3a';
    const offset = size/2 - 30;
    const diagOffset = offset * 0.707;
    ctx.fillText('NE', cx + diagOffset, cy - diagOffset);
    ctx.fillText('SE', cx + diagOffset, cy + diagOffset);
    ctx.fillText('SW', cx - diagOffset, cy + diagOffset);
    ctx.fillText('NW', cx - diagOffset, cy - diagOffset);
    
    // Draw compass star points
    const starRadius = size/2 - 35;
    
    // 8 small diagonal points (22.5 degree offsets)
    ctx.fillStyle = '#8a7a6a';
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 8; i++) {
        const angle = (22.5 + i * 45) * Math.PI / 180;
        this._drawCompassPoint(ctx, cx, cy, angle, starRadius * 0.5, 3);
    }
    
    // 4 intercardinal points (45, 135, 225, 315)
    ctx.fillStyle = '#6a5a4a';
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
        const angle = (45 + i * 90) * Math.PI / 180;
        this._drawCompassPoint(ctx, cx, cy, angle, starRadius * 0.7, 5);
    }
    
    // 4 cardinal points (N, E, S, W)
    // North - Red
    ctx.fillStyle = '#8b0000';
    ctx.strokeStyle = '#5a0000';
    ctx.lineWidth = 1;
    this._drawCompassPoint(ctx, cx, cy, 0, starRadius, 8);
    
    // South, East, West - Dark brown
    ctx.fillStyle = '#4a3a2a';
    ctx.strokeStyle = '#2a1a0a';
    this._drawCompassPoint(ctx, cx, cy, Math.PI, starRadius, 8);
    this._drawCompassPoint(ctx, cx, cy, Math.PI/2, starRadius, 8);
    this._drawCompassPoint(ctx, cx, cy, -Math.PI/2, starRadius, 8);
    
    // Center decoration
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#d4c4a8';
    ctx.fill();
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#c4b393';
    ctx.fill();
    ctx.strokeStyle = '#6a5a4a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3a2a';
    ctx.fill();
    
    ctx.restore();
},

/**
 * Draw a single compass point (triangle)
 */
_drawCompassPoint(ctx, cx, cy, angle, length, width) {
    const tipX = cx + Math.sin(angle) * length;
    const tipY = cy - Math.cos(angle) * length;
    const baseX = cx + Math.sin(angle) * 12;
    const baseY = cy - Math.cos(angle) * 12;
    
    // Perpendicular offset for base width
    const perpX = Math.cos(angle) * width;
    const perpY = Math.sin(angle) * width;
    
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX, baseY + perpY);
    ctx.lineTo(cx, cy);
    ctx.lineTo(baseX - perpX, baseY - perpY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
},

/**
 * Draw a single star point - kept for compatibility
 */
_drawStarPoint(ctx, cx, cy, angle, length, width, color, filled) {
    // No longer used but kept to avoid errors
},

/**
 * Render coordinate grid overlay
 */
_renderCoordinateGrid(ctx, bounds) {
    // Calculate km per pixel
    const kmPerPixel = this.worldSizeKm / this.width;
    
    // Determine grid spacing based on zoom and world size
    const viewWidthKm = (bounds.maxX - bounds.minX) * kmPerPixel;
    
    // Choose appropriate grid spacing in km
    const spacingOptions = [5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000];
    let gridSpacingKm = spacingOptions[spacingOptions.length - 1];
    for (const spacing of spacingOptions) {
        const linesInView = viewWidthKm / spacing;
        if (linesInView >= 3 && linesInView <= 10) {
            gridSpacingKm = spacing;
            break;
        }
    }
    
    // Convert to pixels
    const gridSpacingPx = gridSpacingKm / kmPerPixel;
    
    // Skip if spacing is too small
    if (gridSpacingPx < 20) return;
    
    // Calculate grid start points (align to grid, starting from 0)
    const startX = Math.max(0, Math.floor(bounds.minX / gridSpacingPx) * gridSpacingPx);
    const startY = Math.max(0, Math.floor(bounds.minY / gridSpacingPx) * gridSpacingPx);
    const endX = Math.min(this.width, bounds.maxX);
    const endY = Math.min(this.height, bounds.maxY);
    
    // Grid line style - more visible, dashed
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 6]);
    
    // Draw vertical lines
    for (let x = startX; x <= endX; x += gridSpacingPx) {
        if (x < 0) continue;
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, bounds.minY));
        ctx.lineTo(x, Math.min(this.height, bounds.maxY));
        ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = startY; y <= endY; y += gridSpacingPx) {
        if (y < 0) continue;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, bounds.minX), y);
        ctx.lineTo(Math.min(this.width, bounds.maxX), y);
        ctx.stroke();
    }
    
    ctx.setLineDash([]);
    ctx.restore();
    
    // Draw coordinate labels in screen space
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    const zoom = this.viewport.zoom;
    const panX = this.viewport.x;
    const panY = this.viewport.y;
    
    ctx.font = 'bold 12px "Times New Roman", Georgia, serif';
    ctx.fillStyle = 'rgba(60, 45, 30, 0.85)';
    
    // X-axis labels along top edge
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = startX; x <= endX; x += gridSpacingPx) {
        if (x <= 0) continue;
        const screenX = x * zoom + panX;
        if (screenX < 50 || screenX > this.canvas.width - 50) continue;
        const kmX = Math.round(x * kmPerPixel);
        ctx.fillText(`${kmX}`, screenX, 10);
    }
    
    // Y-axis labels along left edge
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = startY; y <= endY; y += gridSpacingPx) {
        if (y <= 0) continue;
        const screenY = y * zoom + panY;
        if (screenY < 50 || screenY > this.canvas.height - 50) continue;
        const kmY = Math.round(y * kmPerPixel);
        ctx.fillText(`${kmY}`, 10, screenY);
    }
    
    ctx.restore();
},

/**
 * Render scale bar - centered at bottom, bigger design
 */
_renderScaleBar(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Calculate km per pixel based on current zoom
    const kmPerPixel = this.worldSizeKm / this.width;
    const effectiveKmPerPixel = kmPerPixel / this.viewport.zoom;
    
    // Target scale bar width in screen pixels (wider: 300-400px)
    const targetWidthPx = 350;
    const targetWidthKm = targetWidthPx * effectiveKmPerPixel;
    
    // Round to nice number
    const niceNumbers = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    let scaleKm = niceNumbers[0];
    for (const n of niceNumbers) {
        if (n <= targetWidthKm * 1.3 && n >= targetWidthKm * 0.6) {
            scaleKm = n;
            break;
        }
        if (n > targetWidthKm) {
            scaleKm = n;
            break;
        }
    }
    
    // Calculate actual bar width in pixels
    const barWidthPx = scaleKm / effectiveKmPerPixel;
    
    // Position centered at bottom
    const barHeight = 8;
    const margin = 30;
    const x = (this.canvas.width - barWidthPx) / 2;
    const y = this.canvas.height - margin - barHeight;
    
    // Draw scale bar - simple line with end ticks
    ctx.strokeStyle = 'rgba(50, 40, 30, 0.8)';
    ctx.fillStyle = 'rgba(50, 40, 30, 0.8)';
    ctx.lineWidth = 2;
    
    // Main horizontal line
    ctx.beginPath();
    ctx.moveTo(x, y + barHeight / 2);
    ctx.lineTo(x + barWidthPx, y + barHeight / 2);
    ctx.stroke();
    
    // End ticks (vertical lines)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + barHeight);
    ctx.moveTo(x + barWidthPx, y);
    ctx.lineTo(x + barWidthPx, y + barHeight);
    ctx.stroke();
    
    // Middle tick
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + barWidthPx / 2, y + 1);
    ctx.lineTo(x + barWidthPx / 2, y + barHeight - 1);
    ctx.stroke();
    
    // Quarter ticks
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + barWidthPx / 4, y + 2);
    ctx.lineTo(x + barWidthPx / 4, y + barHeight - 2);
    ctx.moveTo(x + barWidthPx * 3 / 4, y + 2);
    ctx.lineTo(x + barWidthPx * 3 / 4, y + barHeight - 2);
    ctx.stroke();
    
    // Labels - bigger
    ctx.font = 'bold 14px "Times New Roman", Georgia, serif';
    ctx.textBaseline = 'bottom';
    
    // "0" on left
    ctx.textAlign = 'center';
    ctx.fillText('0', x, y - 4);
    
    // Distance on right
    ctx.fillText(`${scaleKm} km`, x + barWidthPx, y - 4);
    
    // Middle value
    ctx.font = '11px "Times New Roman", Georgia, serif';
    ctx.fillText(`${scaleKm / 2}`, x + barWidthPx / 2, y - 4);
    
    ctx.restore();
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
            const cellIndex = this.delaunay.find(wx, wy);
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
 * Get kingdom statistics
 * @param {number} kingdomIndex - Kingdom index
 * @returns {Object} - Kingdom stats
 */
getKingdomStats(kingdomIndex) {
    if (kingdomIndex < 0 || kingdomIndex >= this.kingdomCount) return null;
    
    const cells = this.kingdomCells[kingdomIndex] || [];
    const name = this.kingdomNames ? this.kingdomNames[kingdomIndex] : `Kingdom ${kingdomIndex}`;
    const capitalName = this.capitolNames ? this.capitolNames[kingdomIndex] : null;
    
    // Get population
    const population = this.kingdomPopulations ? this.kingdomPopulations[kingdomIndex] : 0;
    
    // Count cities in this kingdom
    let cityCount = 0;
    if (this.cities) {
        for (const city of this.cities) {
            if (city.kingdom === kingdomIndex) cityCount++;
        }
    }
    
    // Calculate approximate area (using average cell size)
    const avgCellArea = (this.width * this.height) / this.cellCount;
    const areaKm2 = Math.round(cells.length * avgCellArea / 100); // Arbitrary scale
    
    // Calculate terrain breakdown
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
        population,
        cellCount: cells.length,
        cityCount,
        areaKm2,
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
