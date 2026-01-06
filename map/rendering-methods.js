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
            this._renderRivers(ctx, bounds);
        }
        if (this.showRiverSources && this.riverStartPoints && this.riverStartPoints.length > 0) {
            this._renderRiverSources(ctx, bounds);
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
        this._renderPoliticalMap(ctx, bounds);
        if (this.showRivers && this.rivers && this.rivers.length > 0) {
            this._renderRivers(ctx, bounds);
        }
        if (this.kingdoms && this.kingdomCount > 0 && this.kingdomNames && this.kingdomCentroids) {
            this._renderKingdomNames(ctx, bounds);
        }
    }
    
    // Render landmass view
    if (this.renderMode === 'landmass') {
        this._renderLandmassMap(ctx, bounds);
        if (this.showRivers && this.rivers && this.rivers.length > 0) {
            this._renderRivers(ctx, bounds);
        }
    }
    
    // Render flow mode
    if (this.renderMode === 'rivers') {
        if (this.heights) {
            this._renderTerrainCells(ctx, bounds);
        }
        // Always draw rivers in rivers mode
        if (this.rivers && this.rivers.length > 0) {
            this._renderRivers(ctx, bounds);
        }
        // Draw river source points
        if (this.showRiverSources && this.riverStartPoints && this.riverStartPoints.length > 0) {
            this._renderRiverSources(ctx, bounds);
        }
        // Draw flow direction arrows
        if (this.drainage) {
            this._renderFlowArrows(ctx, bounds);
        }
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
    
    ctx.restore();
    
    // Draw zoom indicator
    this._drawZoomIndicator(ctx);
    
    this.metrics.renderTime = performance.now() - start;
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
    
    // Use contour rendering if enabled (faster than subdivision)
    if (this.subdivisionLevel > 0 && this.heights) {
        this._renderContourTerrain(ctx, bounds, isGrayscale);
        return;
    }
    
    // Build smooth coastline loops first
    const coastLoops = this._buildSmoothCoastlineLoops();
    
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
    const lineWidth = Math.max(0.8, 1.5 / this.viewport.zoom);
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
 * Render political map - clean cell-based rendering
 */
_renderPoliticalMap(ctx, bounds) {
    if (!this.heights) return;
    
    const hasKingdoms = this.kingdoms && this.kingdomCount > 0;
    
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
        
        const kingdomId = hasKingdoms ? this.kingdoms[i] : 0;
        
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
        ctx.lineWidth = 1;
        ctx.lineJoin = 'miter';
        
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
    
    // 6. Draw kingdom borders using RAW cell edges (no smoothing - matches the fill)
    if (hasKingdoms) {
        const borderEdges = this._collectKingdomBorderEdges();
        
        ctx.strokeStyle = 'rgba(90, 74, 58, 0.8)';
        ctx.lineWidth = Math.max(1.5, 2.5 / this.viewport.zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (this.dashedBorders) {
            const dashLength = Math.max(4, 8 / this.viewport.zoom);
            const gapLength = Math.max(3, 6 / this.viewport.zoom);
            ctx.setLineDash([dashLength, gapLength]);
        } else {
            ctx.setLineDash([]);
        }
        
        // Draw each border edge
        ctx.beginPath();
        for (const edge of borderEdges) {
            ctx.moveTo(edge.x1, edge.y1);
            ctx.lineTo(edge.x2, edge.y2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Release clip
    ctx.restore();
    
    // 7. Draw smooth coastline border
    const borderColor = '#5A4A3A';
    const lineWidth = Math.max(0.8, 1.5 / this.viewport.zoom);
    this._drawSmoothCoastStroke(ctx, coastLoops, borderColor, lineWidth);
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
    
    // Smooth each loop
    const smoothedLoops = [];
    for (const loop of loops) {
        if (loop.length < 3) continue;
        
        let smoothed = loop;
        for (let iter = 0; iter < 2; iter++) {
            smoothed = this._smoothClosedLoop(smoothed);
        }
        smoothedLoops.push(smoothed);
    }
    
    return smoothedLoops;
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
            
            if (!neighborIsOcean && neighborKingdom !== myKingdom && neighborKingdom >= 0) {
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
    
    return borderEdges;
},
/**
 * Render landmass view - each landmass as a single merged polygon with smoothing
 */
_renderLandmassMap(ctx, bounds) {
    if (!this.heights) return;
    
    // Ocean color
    const oceanColor = '#B8C9C4';
    // Land color (parchment)
    const landColor = '#E8DCC4';
    // Border color
    const borderColor = '#5A4A3A';
    
    // Fill entire visible area with ocean
    ctx.fillStyle = oceanColor;
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    
    // Build smooth coastline loops
    const smoothedLoops = this._buildSmoothCoastlineLoops();
    
    if (smoothedLoops.length === 0) return;
    
    // Use clipping to constrain land fill to smooth coastline
    ctx.save();
    ctx.beginPath();
    for (const loop of smoothedLoops) {
        if (loop.length < 3) continue;
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
    }
    ctx.clip();
    
    // Fill land cells (clipped to smooth coastline)
    ctx.fillStyle = landColor;
    ctx.fillRect(bounds.left - 100, bounds.top - 100, 
                 bounds.right - bounds.left + 200, bounds.bottom - bounds.top + 200);
    
    // Draw lakes on top with ocean color (still clipped)
    if (this.lakeCells && this.lakeCells.size > 0) {
        ctx.fillStyle = oceanColor;
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
    
    // Restore (remove clipping)
    ctx.restore();
    
    // Draw smoothed coastline border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(0.8, 1.5 / this.viewport.zoom);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    for (const loop of smoothedLoops) {
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
        
        adjacency.get(k1).push({ x: edge[2], y: edge[3], key: k2 });
        adjacency.get(k2).push({ x: edge[0], y: edge[1], key: k1 });
    }
    
    // Build closed loops
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
            
            let prevKey = startKey;
            let currentKey = firstNeighbor.key;
            let currentX = firstNeighbor.x;
            let currentY = firstNeighbor.y;
            
            for (let iter = 0; iter < 50000; iter++) {
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
                    currentX = next.x;
                    currentY = next.y;
                    foundNext = true;
                    break;
                }
                
                if (!foundNext) break;
                if (currentKey === startKey) break;
            }
            
            if (loop.length >= 4) {
                loops.push(loop);
            }
        }
    }
    
    // Apply Chaikin smoothing to each loop
    const smoothedLoops = [];
    for (const loop of loops) {
        let smoothed = loop;
        for (let iter = 0; iter < 2; iter++) {
            smoothed = this._chaikinSmooth(smoothed);
        }
        smoothedLoops.push(smoothed);
    }
    
    return smoothedLoops;
},
/**
 * Draw smooth coastline fill (used by terrain/political modes)
 */
_drawSmoothCoastFill(ctx, loops, fillColor) {
    ctx.fillStyle = fillColor;
    for (const loop of loops) {
        ctx.beginPath();
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i][0], loop[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    }
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
    
    console.log(`Identified ${this.landmasses.length} landmasses`);
},
/**
 * Build smooth boundaries for all landmasses
 */
_buildLandmassBoundaries() {
    if (!this.landmasses) return;
    
    this.landmassBoundaries = [];
    
    for (const landmass of this.landmasses) {
        const boundaries = this._extractAndSmoothBoundary(landmass.cells);
        this.landmassBoundaries.push(boundaries);
    }
},
/**
 * Extract boundary and apply smoothing
 */
_extractAndSmoothBoundary(cellIndices) {
    if (!cellIndices || cellIndices.length === 0) return [];
    
    const cellSet = new Set(cellIndices);
    const boundaryEdges = [];
    
    // For each cell, check each edge
    for (const i of cellIndices) {
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        // Get neighbors
        const neighbors = new Set(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            // Check if this edge borders water
            // An edge borders water if the cell on the other side is not land
            let bordersWater = true;
            
            for (const neighbor of neighbors) {
                if (!cellSet.has(neighbor)) continue; // Neighbor is not in our landmass
                
                // Check if this neighbor shares this edge
                const neighborCell = this.voronoi.cellPolygon(neighbor);
                if (!neighborCell) continue;
                
                for (let k = 0; k < neighborCell.length - 1; k++) {
                    const nv1 = neighborCell[k];
                    const nv2 = neighborCell[k + 1];
                    
                    // Check if edges match (reversed direction)
                    const d1 = Math.hypot(v1[0] - nv2[0], v1[1] - nv2[1]);
                    const d2 = Math.hypot(v2[0] - nv1[0], v2[1] - nv1[1]);
                    
                    if (d1 < 1 && d2 < 1) {
                        bordersWater = false;
                        break;
                    }
                }
                if (!bordersWater) break;
            }
            
            if (bordersWater) {
                boundaryEdges.push({
                    x1: v1[0], y1: v1[1],
                    x2: v2[0], y2: v2[1]
                });
            }
        }
    }
    
    if (boundaryEdges.length === 0) return [];
    
    // Chain edges into continuous loops
    const loops = this._chainEdgesIntoLoops(boundaryEdges);
    
    // Apply smoothing to each loop
    const smoothedLoops = [];
    for (const loop of loops) {
        if (loop.length < 4) continue;
        
        // Apply Chaikin smoothing (2 iterations for gentle smoothing)
        let smoothed = loop;
        for (let iter = 0; iter < 2; iter++) {
            smoothed = this._chaikinSmooth(smoothed);
        }
        
        smoothedLoops.push(smoothed);
    }
    
    return smoothedLoops;
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
 * Extract boundary edges for a region (set of cells)
 * Returns array of closed paths (for regions with holes/islands)
 */
_extractRegionBoundary(cellIndices) {
    if (!cellIndices || cellIndices.length === 0) return [];
    
    const cellSet = new Set(cellIndices);
    const boundaryEdges = [];
    
    // Find all edges that are on the boundary (neighbor not in region)
    for (const i of cellIndices) {
        const cell = this.voronoi.cellPolygon(i);
        if (!cell || cell.length < 3) continue;
        
        const neighbors = Array.from(this.voronoi.neighbors(i));
        
        for (let j = 0; j < cell.length - 1; j++) {
            const v1 = cell[j];
            const v2 = cell[j + 1];
            
            // Find which neighbor shares this edge
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
            
            // If neighbor is not in region (or is ocean/outside), this is a boundary edge
            const neighborInRegion = edgeNeighbor >= 0 && cellSet.has(edgeNeighbor);
            
            if (!neighborInRegion) {
                boundaryEdges.push({
                    x1: v1[0], y1: v1[1],
                    x2: v2[0], y2: v2[1]
                });
            }
        }
    }
    
    // Chain edges into closed paths
    return this._chainEdgesIntoPaths(boundaryEdges);
},
/**
 * Chain edges into closed paths
 */
_chainEdgesIntoPaths(edges) {
    if (edges.length === 0) return [];
    
    const tolerance = 2.0;
    const paths = [];
    const used = new Set();
    
    for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (used.has(startIdx)) continue;
        
        const path = [];
        let currentEdge = edges[startIdx];
        used.add(startIdx);
        
        path.push({ x: currentEdge.x1, y: currentEdge.y1 });
        path.push({ x: currentEdge.x2, y: currentEdge.y2 });
        
        // Keep extending until we close the loop or can't extend
        let extended = true;
        let iterations = 0;
        const maxIter = edges.length * 2;
        
        while (extended && iterations < maxIter) {
            extended = false;
            iterations++;
            
            const lastPoint = path[path.length - 1];
            const firstPoint = path[0];
            
            // Check if we've closed the loop
            const closeDist = Math.abs(lastPoint.x - firstPoint.x) + Math.abs(lastPoint.y - firstPoint.y);
            if (path.length > 3 && closeDist < tolerance) {
                break; // Closed loop
            }
            
            // Try to extend forward
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
        
        if (path.length >= 3) {
            paths.push(path);
        }
    }
    
    return paths;
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
    for (let k = 0; k < this.kingdomCount; k++) {
        const cellCount = this.kingdomCells[k] ? this.kingdomCells[k].length : 0;
        kingdomOrder.push({ index: k, size: cellCount });
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
        
        // Calculate kingdom bounding box and centroid
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;
        
        for (const cellIdx of cells) {
            const x = this.points[cellIdx * 2];
            const y = this.points[cellIdx * 2 + 1];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            sumX += x;
            sumY += y;
        }
        
        const kingdomWidth = maxX - minX;
        const kingdomHeight = maxY - minY;
        const centerX = sumX / cellCount;
        const centerY = sumY / cellCount;
        
        // Skip if completely outside view
        if (maxX < bounds.left - 50 || minX > bounds.right + 50 ||
            maxY < bounds.top - 50 || minY > bounds.bottom + 50) continue;
        
        // Find the widest horizontal span at the centroid Y level
        const { spanWidth, spanCenterX } = this._findKingdomSpanAtY(cells, centerY, minX, maxX);
        
        // Calculate aspect ratio to determine if we should curve text
        const aspectRatio = kingdomWidth / (kingdomHeight || 1);
        const isElongated = aspectRatio > 2.0 || aspectRatio < 0.5;
        
        // Find principal axis angle
        const angle = this._getKingdomAngle(cells, centerX, centerY);
        
        // Use the span width as our available width (more accurate than bounding box)
        const availWidth = spanWidth * 0.85;
        const availHeight = kingdomHeight * 0.4;
        
        // Calculate font size to fit
        const minFontSize = 12 / zoom;
        const maxFontSize = 55 / zoom;
        
        // Parse name to see if we have a two-line layout
        const { prefix, mainName } = this._parseKingdomName(name);
        const displayText = mainName || name;
        
        // Find best font size
        let fontSize = maxFontSize;
        ctx.font = `${fontSize}px 'IM Fell English', Georgia, serif`;
        
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
        ctx.font = `${fontSize}px 'IM Fell English', Georgia, serif`;
        textWidth = ctx.measureText(displayText.toUpperCase()).width;
        
        // Use span center for better horizontal positioning
        const textCenterX = spanCenterX;
        const textCenterY = centerY;
        
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
        
        // Skip this label if it would overlap
        if (collides) continue;
        
        // Add to placed labels
        placedLabels.push(labelBox);
        
        // Draw text - curved for elongated kingdoms, straight otherwise
        if (isElongated && Math.abs(angle) < 0.3) {
            this._drawCurvedKingdomText(ctx, name, textCenterX, textCenterY, fontSize, spanWidth, zoom, aspectRatio > 1, cells, minX, maxX);
        } else {
            this._drawStraightKingdomText(ctx, name, textCenterX, textCenterY, fontSize, angle, zoom);
        }
    }
},
/**
 * Find the horizontal span of a kingdom at a given Y level
 */
_findKingdomSpanAtY(cells, targetY, minX, maxX) {
    const tolerance = (maxX - minX) * 0.15; // 15% tolerance band
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
    if (count === 0 || spanMinX >= spanMaxX) {
        return { spanWidth: maxX - minX, spanCenterX: (minX + maxX) / 2 };
    }
    
    return { 
        spanWidth: spanMaxX - spanMinX, 
        spanCenterX: (spanMinX + spanMaxX) / 2 
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
    
    if (prefix && mainName) {
        // Two-line layout: smaller italic prefix above, larger name below
        const prefixFontSize = fontSize * 0.42;
        const prefixY = -fontSize * 0.5;
        const mainY = fontSize * 0.32;
        
        // Draw prefix (smaller, italic)
        ctx.font = `italic ${prefixFontSize}px 'IM Fell English', Georgia, serif`;
        this._drawMapText(ctx, prefix, 0, prefixY, zoom, false);
        
        // Draw main name (larger, uppercase)
        ctx.font = `${fontSize}px 'IM Fell English', Georgia, serif`;
        this._drawMapText(ctx, mainName.toUpperCase(), 0, mainY, zoom, true);
    } else {
        // Single line
        ctx.font = `${fontSize}px 'IM Fell English', Georgia, serif`;
        this._drawMapText(ctx, name.toUpperCase(), 0, 0, zoom, true);
    }
    
    ctx.restore();
},

/**
 * Draw text with simple styling - just stroke outline and fill
 */
_drawMapText(ctx, text, x, y, zoom, isMain) {
    // Simple stroke outline for readability
    ctx.strokeStyle = 'rgba(255, 250, 240, 0.9)';
    ctx.lineWidth = isMain ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(text, x, y);
    
    // Main text fill
    ctx.fillStyle = '#1A1408';
    ctx.fillText(text, x, y);
},

/**
 * Parse kingdom name to extract prefix and main name
 */
_parseKingdomName(name) {
    const prefixes = [
        'Kingdom of', 'Empire of', 'Republic of', 'Duchy of', 'Grand Duchy of',
        'Principality of', 'Confederation of', 'United', 'Free City of',
        'Realm of', 'Dominion of', 'Commonwealth of', 'Federation of',
        'Sultanate of', 'Caliphate of', 'Khanate of', 'Shogunate of',
        'Margraviate of', 'Landgraviate of', 'County of', 'Barony of',
        'Holy', 'Greater', 'Lesser', 'Northern', 'Southern', 'Eastern', 'Western'
    ];
    
    for (const prefix of prefixes) {
        if (name.startsWith(prefix + ' ')) {
            return {
                prefix: prefix,
                mainName: name.slice(prefix.length + 1)
            };
        }
    }
    
    return { prefix: null, mainName: name };
},

/**
 * Draw curved text along the kingdom's natural spine
 */
_drawCurvedKingdomText(ctx, name, centerX, centerY, fontSize, spanWidth, zoom, curveUp, cells, minX, maxX) {
    // Find the kingdom's organic spine path by sampling cells
    const spinePath = this._findKingdomSpine(cells, centerX, centerY, minX, maxX);
    
    // Parse name
    const { prefix, mainName } = this._parseKingdomName(name);
    const displayName = mainName || name;
    
    // Calculate total path length
    const pathLength = this._getPathLength(spinePath);
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw prefix above main text if present
    if (prefix) {
        const prefixFontSize = fontSize * 0.42;
        ctx.font = `italic ${prefixFontSize}px 'IM Fell English', Georgia, serif`;
        
        const offsetY = -fontSize * 0.85;
        
        // Draw prefix as single unit at center of path
        const centerDist = pathLength / 2;
        const pos = this._getPointAtDistance(spinePath, centerDist);
        const angle = this._getAngleAtDistance(spinePath, centerDist);
        
        const perpX = Math.cos(angle + Math.PI/2) * offsetY;
        const perpY = Math.sin(angle + Math.PI/2) * offsetY;
        
        ctx.save();
        ctx.translate(pos.x + perpX, pos.y + perpY);
        ctx.rotate(angle);
        
        // Simple outline + fill
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.9)';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeText(prefix, 0, 0);
        ctx.fillStyle = '#1A1408';
        ctx.fillText(prefix, 0, 0);
        
        ctx.restore();
    }
    
    // Draw main name - character by character along spine
    ctx.font = `${fontSize}px 'IM Fell English', Georgia, serif`;
    
    const mainText = displayName.toUpperCase();
    const chars = mainText.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0);
    
    // Tight spacing between characters
    const spacing = fontSize * 0.02;
    const totalWithSpacing = totalWidth + spacing * (chars.length - 1);
    
    let currentDist = (pathLength - totalWithSpacing) / 2;
    const mainOffsetY = prefix ? fontSize * 0.4 : 0;
    
    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const charWidth = charWidths[i];
        const dist = currentDist + charWidth / 2;
        const pos = this._getPointAtDistance(spinePath, dist);
        const angle = this._getAngleAtDistance(spinePath, dist);
        
        // Calculate perpendicular offset
        const perpX = Math.cos(angle + Math.PI/2) * mainOffsetY;
        const perpY = Math.sin(angle + Math.PI/2) * mainOffsetY;
        
        ctx.save();
        ctx.translate(pos.x + perpX, pos.y + perpY);
        ctx.rotate(angle);
        
        // Simple outline + fill
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.9)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(char, 0, 0);
        ctx.fillStyle = '#1A1408';
        ctx.fillText(char, 0, 0);
        
        ctx.restore();
        
        currentDist += charWidth + spacing;
    }
},
/**
 * Find organic spine path through kingdom by sampling cell positions
 */
_findKingdomSpine(cells, centerX, centerY, minX, maxX) {
    const width = maxX - minX;
    const numSamples = 12;
    const sampleWidth = width / numSamples;
    
    // Sample average Y position at each X slice
    const samples = [];
    
    for (let i = 0; i <= numSamples; i++) {
        const sampleX = minX + i * sampleWidth;
        let sumY = 0;
        let count = 0;
        
        // Find cells near this X position
        for (const cellIdx of cells) {
            const cx = this.points[cellIdx * 2];
            const cy = this.points[cellIdx * 2 + 1];
            
            if (Math.abs(cx - sampleX) < sampleWidth * 0.8) {
                sumY += cy;
                count++;
            }
        }
        
        if (count > 0) {
            samples.push({ x: sampleX, y: sumY / count });
        }
    }
    
    // Need at least 2 points
    if (samples.length < 2) {
        return [
            { x: minX, y: centerY },
            { x: maxX, y: centerY }
        ];
    }
    
    // Smooth the path using Chaikin's algorithm
    let smoothed = samples;
    for (let iter = 0; iter < 2; iter++) {
        const newPoints = [];
        newPoints.push(smoothed[0]); // Keep first point
        
        for (let i = 0; i < smoothed.length - 1; i++) {
            const p0 = smoothed[i];
            const p1 = smoothed[i + 1];
            
            newPoints.push({
                x: p0.x * 0.75 + p1.x * 0.25,
                y: p0.y * 0.75 + p1.y * 0.25
            });
            newPoints.push({
                x: p0.x * 0.25 + p1.x * 0.75,
                y: p0.y * 0.25 + p1.y * 0.75
            });
        }
        
        newPoints.push(smoothed[smoothed.length - 1]); // Keep last point
        smoothed = newPoints;
    }
    
    return smoothed;
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
    const borderWidth = Math.max(0.6, 1.2 / zoom);
    
    // Build smooth coastline for clipping
    const coastLoops = this._buildSmoothCoastlineLoops();
    
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
 * Order boundary points into a continuous loop using nearest neighbor
 */
_orderBoundaryPoints(points) {
    if (points.length < 3) return points;
    
    const ordered = [];
    const remaining = [...points];
    
    // Start with the leftmost point
    remaining.sort((a, b) => a.x - b.x);
    ordered.push(remaining.shift());
    
    // Greedily add nearest point
    while (remaining.length > 0) {
        const last = ordered[ordered.length - 1];
        let nearestIdx = 0;
        let nearestDist = Infinity;
        
        for (let i = 0; i < remaining.length; i++) {
            const dist = (remaining[i].x - last.x) ** 2 + (remaining[i].y - last.y) ** 2;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }
        
        ordered.push(remaining.splice(nearestIdx, 1)[0]);
    }
    
    return ordered;
},
/**
 * Smooth boundary points using Catmull-Rom interpolation
 */
_smoothBoundary(points) {
    if (points.length < 4) return points;
    
    const result = [];
    const n = points.length;
    const segments = 3; // Points between each original point
    
    for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];
        
        for (let t = 0; t < segments; t++) {
            const s = t / segments;
            const s2 = s * s;
            const s3 = s2 * s;
            
            const x = 0.5 * (
                (2 * p1.x) +
                (-p0.x + p2.x) * s +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3
            );
            
            const y = 0.5 * (
                (2 * p1.y) +
                (-p0.y + p2.y) * s +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3
            );
            
            result.push({ x, y });
        }
    }
    
    return result;
},
/**
 * Render precipitation-colored cells
 */
_renderPrecipitationCells(ctx, bounds) {
    if (!this.precipitation || !this.voronoi) return;
    
    // Build smooth coastline loops first
    const coastLoops = this._buildSmoothCoastlineLoops();
    
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
    const lineWidth = Math.max(0.8, 1.5 / this.viewport.zoom);
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
 * Render flow direction arrows across the map
 * Shows where water would flow based on drainage
 */
_renderFlowArrows(ctx, bounds) {
    if (!this.drainage || this.cellCount === 0) return;
    
    // Arrow settings - bigger arrows
    const arrowLength = 18 / this.viewport.zoom;
    const arrowHeadSize = 7 / this.viewport.zoom;
    const lineWidth = 2.5 / this.viewport.zoom;
    
    ctx.strokeStyle = 'rgba(20, 80, 160, 0.85)';
    ctx.fillStyle = 'rgba(20, 80, 160, 0.85)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    
    // Sample cells to avoid overcrowding
    const sampleRate = Math.max(1, Math.floor(2 / this.viewport.zoom));
    
    for (let i = 0; i < this.cellCount; i += sampleRate) {
        // Skip ocean cells
        if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
        
        // Skip lake cells
        if (this.lakeCells && this.lakeCells.has(i)) continue;
        
        const drainTo = this.drainage[i];
        if (drainTo < 0) continue; // No outflow
        
        // Current cell position
        const x = this.points[i * 2];
        const y = this.points[i * 2 + 1];
        
        // Frustum culling
        if (x < bounds.left - 20 || x > bounds.right + 20 ||
            y < bounds.top - 20 || y > bounds.bottom + 20) continue;
        
        // Target cell position (lower neighbor)
        const tx = this.points[drainTo * 2];
        const ty = this.points[drainTo * 2 + 1];
        
        // Direction vector: from HERE to THERE (downhill)
        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        
        // Unit vector pointing downhill
        const ux = dx / dist;
        const uy = dy / dist;
        
        // Draw arrow from cell center toward the lower neighbor
        const startX = x;
        const startY = y;
        const endX = x + ux * arrowLength;
        const endY = y + uy * arrowLength;
        
        // Draw arrow shaft
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Draw arrow head
        const angle = Math.atan2(uy, ux);
        const headAngle = Math.PI / 5;
        
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowHeadSize * Math.cos(angle - headAngle),
            endY - arrowHeadSize * Math.sin(angle - headAngle)
        );
        ctx.lineTo(
            endX - arrowHeadSize * Math.cos(angle + headAngle),
            endY - arrowHeadSize * Math.sin(angle + headAngle)
        );
        ctx.closePath();
        ctx.fill();
    }
},
/**
 * Render rivers as filled polygons that get wider - single color, no 3D
 */
_renderRivers(ctx, bounds) {
    if (!this.rivers || this.rivers.length === 0) return;
    
    const zoom = this.viewport.zoom;
    const borderColor = '#5A4A3A';
    const borderWidth = Math.max(0.5, 1.0 / zoom);
    
    // Build smooth coastline for clipping
    const coastLoops = this._buildSmoothCoastlineLoops();
    
    // Collect all river polygon data first
    const riverPolygons = [];
    
    for (const river of this.rivers) {
        let path = river.path;
        if (path.length < 2) continue;
        
        // Clip path at coastline
        path = this._clipPathAtCoastline(path);
        if (path.length < 2) continue;
        
        // Check if river is in view
        let inView = false;
        for (const p of path) {
            if (p.x >= bounds.left - 100 && p.x <= bounds.right + 100 &&
                p.y >= bounds.top - 100 && p.y <= bounds.bottom + 100) {
                inView = true;
                break;
            }
        }
        if (!inView) continue;
        
        // Use D3 curve interpolation
        const smoothPath = this._interpolateRiverPathD3(path);
        if (smoothPath.length < 2) continue;
        
        // Width scaling
        const zoomFactor = Math.max(0.5, Math.min(2, zoom));
        const baseWidthStart = 0.8 / zoom * zoomFactor;
        const baseWidthEnd = 3.5 / zoom * zoomFactor;
        
        // Build polygon edges
        const leftEdge = [];
        const rightEdge = [];
        
        for (let i = 0; i < smoothPath.length; i++) {
            const p = smoothPath[i];
            const progress = i / (smoothPath.length - 1);
            const width = baseWidthStart + (baseWidthEnd - baseWidthStart) * progress;
            
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
        
        riverPolygons.push({ leftEdge, rightEdge });
    }
    
    if (riverPolygons.length === 0) return;
    
    // STEP 1: Create land clip path
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
    
    // STEP 2: Draw all river borders (clipped to land)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const { leftEdge, rightEdge } of riverPolygons) {
        // Draw left edge border
        ctx.beginPath();
        ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
        for (let i = 1; i < leftEdge.length; i++) {
            ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
        }
        ctx.stroke();
        
        // Draw right edge border
        ctx.beginPath();
        ctx.moveTo(rightEdge[0].x, rightEdge[0].y);
        for (let i = 1; i < rightEdge.length; i++) {
            ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
        }
        ctx.stroke();
    }
    
    ctx.restore();
    
    // STEP 3: Fill all rivers ON TOP (covers borders at merge points)
    ctx.beginPath();
    for (const { leftEdge, rightEdge } of riverPolygons) {
        ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
        for (let i = 1; i < leftEdge.length; i++) {
            ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
        }
        for (let i = rightEdge.length - 1; i >= 0; i--) {
            ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
        }
        ctx.closePath();
    }
    
    ctx.fillStyle = (this.renderMode === 'political' || this.renderMode === 'landmass') ? POLITICAL_OCEAN : OCEAN_COLORS[0];
    ctx.fill();
},
/**
 * Render 3D shadow effect on coastlines - outside only, no smoothing
 */
_renderCoastline3D(ctx, bounds) {
    if (!this.heights || !this.voronoi) return;
    
    const zoom = this.viewport.zoom;
    const shadowWidth = 3 / zoom;
    
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
 * Allow river to extend one cell into ocean for blending
 */
_clipPathAtCoastline(path) {
    // Don't clip - let rivers extend into ocean for natural blending
    // The river already stops after one ocean cell in _traceRiverToOcean
    return path;
},
/**
 * Find the intersection point of river with coastline edge
 */
_findCoastlineIntersection(landCell, oceanCell, landPoint, oceanPoint) {
    const polyLand = this.voronoi.cellPolygon(landCell);
    const polyOcean = this.voronoi.cellPolygon(oceanCell);
    
    if (!polyLand || !polyOcean) {
        // Fallback to midpoint
        return {
            x: (landPoint.x + oceanPoint.x) / 2,
            y: (landPoint.y + oceanPoint.y) / 2
        };
    }
    
    // Find shared edge vertices
    const tolerance = 1;
    const sharedVertices = [];
    
    for (let i = 0; i < polyLand.length - 1; i++) {
        const vL = polyLand[i];
        for (let j = 0; j < polyOcean.length - 1; j++) {
            const vO = polyOcean[j];
            const dist = Math.sqrt((vL[0] - vO[0]) ** 2 + (vL[1] - vO[1]) ** 2);
            if (dist < tolerance) {
                sharedVertices.push({ x: vL[0], y: vL[1] });
                break;
            }
        }
    }
    
    if (sharedVertices.length >= 2) {
        // Find intersection of river line with the shared edge
        const edgeStart = sharedVertices[0];
        const edgeEnd = sharedVertices[1];
        
        // Line-line intersection
        const intersection = this._lineIntersection(
            landPoint.x, landPoint.y, oceanPoint.x, oceanPoint.y,
            edgeStart.x, edgeStart.y, edgeEnd.x, edgeEnd.y
        );
        
        if (intersection) {
            return intersection;
        }
        
        // Fallback: midpoint of shared edge
        return {
            x: (edgeStart.x + edgeEnd.x) / 2,
            y: (edgeStart.y + edgeEnd.y) / 2
        };
    }
    
    // Fallback to midpoint between cells
    return {
        x: (landPoint.x + oceanPoint.x) / 2,
        y: (landPoint.y + oceanPoint.y) / 2
    };
},
/**
 * Calculate intersection point of two line segments
 */
_lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    
    return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
    };
},
/**
 * Interpolate river path using D3-style cardinal spline (tension 0.5)
 */
_interpolateRiverPathD3(path) {
    if (path.length < 3) return path;
    
    const result = [];
    const tension = 0.5;  // Cardinal spline tension (0 = Catmull-Rom, 1 = straight lines)
    const segments = 16;  // Points between each original point
    
    for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];
        
        // Add first point
        if (i === 0) {
            result.push({ x: p1.x, y: p1.y });
        }
        
        // For the last segment, use fewer interpolation steps and end exactly at p2
        const isLastSegment = (i === path.length - 2);
        const segCount = isLastSegment ? 8 : segments;
        
        // Cardinal spline interpolation
        for (let t = 1; t <= segCount; t++) {
            const s = t / segCount;
            const s2 = s * s;
            const s3 = s2 * s;
            
            // Cardinal spline basis functions with tension
            const t0 = -tension * s + 2 * tension * s2 - tension * s3;
            const t1 = 1 + (tension - 3) * s2 + (2 - tension) * s3;
            const t2 = tension * s + (3 - 2 * tension) * s2 + (tension - 2) * s3;
            const t3 = -tension * s2 + tension * s3;
            
            let x = t0 * p0.x + t1 * p1.x + t2 * p2.x + t3 * p3.x;
            let y = t0 * p0.y + t1 * p1.y + t2 * p2.y + t3 * p3.y;
            
            // Force last point to be exactly the end point
            if (isLastSegment && t === segCount) {
                x = p2.x;
                y = p2.y;
            }
            
            result.push({ x, y });
        }
    }
    
    return result;
},
/**
 * Interpolate river path using Catmull-Rom spline for smoothness
 */
_interpolateRiverPath(path) {
    if (path.length < 3) return path;
    
    const result = [];
    const segments = 4; // Points between each original point
    
    for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];
        
        // Add first point
        if (i === 0) {
            result.push({ x: p1.x, y: p1.y });
        }
        
        // Interpolate between p1 and p2
        for (let t = 1; t <= segments; t++) {
            const s = t / segments;
            const s2 = s * s;
            const s3 = s2 * s;
            
            // Catmull-Rom spline formula
            const x = 0.5 * (
                (2 * p1.x) +
                (-p0.x + p2.x) * s +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3
            );
            
            const y = 0.5 * (
                (2 * p1.y) +
                (-p0.y + p2.y) * s +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3
            );
            
            result.push({ x, y });
        }
    }
    
    return result;
},
/**
 * Render river source points as bright markers
 */
_renderRiverSources(ctx, bounds) {
    if (!this.riverStartPoints || this.riverStartPoints.length === 0) return;
    
    const radius = Math.max(8, 12 / this.viewport.zoom);
    
    for (const point of this.riverStartPoints) {
        // Frustum culling
        if (point.x < bounds.left - radius || point.x > bounds.right + radius ||
            point.y < bounds.top - radius || point.y > bounds.bottom + radius) continue;
        
        // Bright magenta circle with black outline
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(255, 0, 255)';
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2 / this.viewport.zoom;
        ctx.stroke();
    }
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
    const coastLoops = this._buildSmoothCoastlineLoops();
    
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
    const lineWidth = Math.max(0.8, 1.5 / this.viewport.zoom);
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
}
};
