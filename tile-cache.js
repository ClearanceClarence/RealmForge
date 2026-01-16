/**
 * TILE MANAGER - Cached tile-based rendering for Voronoi maps
 * 
 * Drop-in module for VoronoiGenerator
 * Caches static layers (terrain, kingdoms) as tiles, only redraws dynamic content per-frame.
 * 
 * Usage:
 *   import { TileCache } from './tile-cache.js';
 *   
 *   // In VoronoiGenerator constructor:
 *   this.tileCache = new TileCache(this);
 *   
 *   // After generate() or generateHeightmap():
 *   this.tileCache.invalidate();
 *   
 *   // In render(), replace cell-by-cell drawing with:
 *   this.tileCache.render(ctx, this.viewport, bounds, 'political');
 */

import { 
    LAND_COLORS, OCEAN_COLORS, POLITICAL_COLORS, 
    POLITICAL_OCEAN, ELEVATION 
} from './map-constants.js';

export class TileCache {
    constructor(generator, options = {}) {
        this.generator = generator;
        
        // Tile size in world units
        this.tileSize = options.tileSize || 512;
        
        // LOD levels: 1 = full res, 2 = half, 4 = quarter
        this.lodLevels = [1, 2, 4];
        
        // Cached tile ImageBitmaps/Canvases by layer and LOD
        // Key format: "lod:tx:ty"
        this.cache = {
            terrain: new Map(),
            political: new Map(),
        };
        
        // Cell-to-tile spatial index
        this.cellTileIndex = null;
        
        // Work canvas for tile rendering (reused)
        this.workCanvas = document.createElement('canvas');
        this.workCanvas.width = this.tileSize;
        this.workCanvas.height = this.tileSize;
        this.workCtx = this.workCanvas.getContext('2d');
        
        // Simplified geometry cache for LOD (indexed by LOD level)
        this.simplifiedGeometry = new Map();
        
        // Pending async renders
        this.pendingRenders = new Map();
        
        // Memory management - increased for multiple LOD levels
        this.maxCachedTiles = options.maxCachedTiles || 400;
        
        // Stats
        this.stats = {
            tilesRendered: 0,
            cacheHits: 0,
            cacheMisses: 0,
        };
    }
    
    /**
     * Choose LOD level based on zoom
     * Higher LOD = higher resolution (more pixels per tile)
     * LOD is a multiplier for tile resolution
     */
    chooseLOD(zoom) {
        // When zoomed in, we need MORE resolution to avoid pixelation
        // When zoomed out, we can use less resolution
        if (zoom >= 8) return 4;       // 4x resolution (2048px tiles) for extreme zoom
        if (zoom >= 4) return 2;       // 2x resolution (1024px tiles) 
        if (zoom >= 1.5) return 1;     // Normal resolution (512px tiles)
        if (zoom >= 0.8) return 0.5;   // Half resolution (256px tiles)
        return 0.25;                   // Quarter resolution (128px tiles) when zoomed out
    }
    
    /**
     * Get cache key for tile - includes LOD for zoom-appropriate caching
     */
    getTileKey(tx, ty, lod = 1) {
        return `${lod}:${tx}:${ty}`;
    }
    
    /**
     * Invalidate all cached tiles (call after terrain/kingdom changes)
     */
    invalidate(layer = null) {
        if (layer) {
            this.cache[layer]?.clear();
        } else {
            for (const cache of Object.values(this.cache)) {
                cache.clear();
            }
        }
        this.cellTileIndex = null;
        this.simplifiedGeometry.clear();
        this.stats.tilesRendered = 0;
    }
    
    /**
     * Build spatial index mapping cells to tiles
     * Call once after generation
     */
    buildIndex() {
        const gen = this.generator;
        if (!gen.voronoi || !gen.cellCount) return;
        
        this.cellTileIndex = new Map();
        
        const tilesX = Math.ceil(gen.width / this.tileSize);
        const tilesY = Math.ceil(gen.height / this.tileSize);
        
        // Initialize tile sets
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                this.cellTileIndex.set(`${tx}:${ty}`, new Set());
            }
        }
        
        // Assign cells to tiles based on centroid and vertices
        for (let i = 0; i < gen.cellCount; i++) {
            const x = gen.points[i * 2];
            const y = gen.points[i * 2 + 1];
            
            // Primary tile from centroid
            const tx = Math.floor(x / this.tileSize);
            const ty = Math.floor(y / this.tileSize);
            this.addCellToTile(tx, ty, i);
            
            // Check if polygon extends to neighboring tiles
            const cell = gen.voronoi.cellPolygon(i);
            if (cell) {
                for (const [vx, vy] of cell) {
                    const vtx = Math.floor(vx / this.tileSize);
                    const vty = Math.floor(vy / this.tileSize);
                    if (vtx !== tx || vty !== ty) {
                        this.addCellToTile(vtx, vty, i);
                    }
                }
            }
        }
    }
    
    addCellToTile(tx, ty, cellIndex) {
        const key = `${tx}:${ty}`;
        const set = this.cellTileIndex.get(key);
        if (set) set.add(cellIndex);
    }
    
    /**
     * Get visible tile coordinates with LOD
     */
    getVisibleTiles(viewport, canvasWidth, canvasHeight) {
        const invZoom = 1 / viewport.zoom;
        
        const left = -viewport.x * invZoom;
        const top = -viewport.y * invZoom;
        const right = (canvasWidth - viewport.x) * invZoom;
        const bottom = (canvasHeight - viewport.y) * invZoom;
        
        const margin = 1;
        const startTX = Math.max(0, Math.floor(left / this.tileSize) - margin);
        const startTY = Math.max(0, Math.floor(top / this.tileSize) - margin);
        const endTX = Math.floor(right / this.tileSize) + margin;
        const endTY = Math.floor(bottom / this.tileSize) + margin;
        
        // Choose LOD based on zoom
        const lod = this.chooseLOD(viewport.zoom);
        
        const tiles = [];
        for (let ty = startTY; ty <= endTY; ty++) {
            for (let tx = startTX; tx <= endTX; tx++) {
                tiles.push({ tx, ty, lod });
            }
        }
        return tiles;
    }
    
    /**
     * Main render function - draws cached tiles with LOD support
     */
    render(ctx, viewport, bounds, layer = 'terrain') {
        const gen = this.generator;
        
        // Build index if needed
        if (!this.cellTileIndex) {
            this.buildIndex();
        }
        
        const visibleTiles = this.getVisibleTiles(
            viewport, 
            gen.width, 
            gen.height
        );
        
        // Evict old tiles if needed
        this.evictIfNeeded(layer);
        
        // Draw each visible tile
        for (const { tx, ty, lod } of visibleTiles) {
            const key = this.getTileKey(tx, ty, lod);
            let tileCanvas = this.cache[layer]?.get(key);
            
            if (!tileCanvas) {
                // Render tile on-demand
                this.stats.cacheMisses++;
                tileCanvas = this.renderTile(tx, ty, layer, lod);
                if (this.cache[layer]) {
                    this.cache[layer].set(key, { canvas: tileCanvas, timestamp: Date.now() });
                }
                this.stats.tilesRendered++;
            } else {
                this.stats.cacheHits++;
                // Update timestamp for LRU
                tileCanvas.timestamp = Date.now();
                tileCanvas = tileCanvas.canvas;
            }
            
            if (tileCanvas) {
                const worldX = tx * this.tileSize;
                const worldY = ty * this.tileSize;
                
                ctx.drawImage(
                    tileCanvas,
                    worldX, worldY,
                    this.tileSize, this.tileSize
                );
            }
        }
    }
    
    /**
     * Evict old tiles if cache is full
     */
    evictIfNeeded(layer) {
        const cache = this.cache[layer];
        if (!cache || cache.size <= this.maxCachedTiles) return;
        
        // Sort by timestamp and remove oldest 25%
        const entries = Array.from(cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = Math.floor(entries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            cache.delete(entries[i][0]);
        }
    }
    
    /**
     * Render a single tile with LOD support
     */
    renderTile(tx, ty, layer, lod = 1) {
        const gen = this.generator;
        const ctx = this.workCtx;
        
        // LOD is now a multiplier: >1 = higher res when zoomed in, <1 = lower res when zoomed out
        // Base tile is 512px, so LOD 2 = 1024px, LOD 4 = 2048px, LOD 0.5 = 256px
        const resolution = Math.round(this.tileSize * lod);
        
        // Cap resolution to avoid memory issues
        const maxResolution = 2048;
        const actualResolution = Math.min(resolution, maxResolution);
        
        // Resize canvas if needed
        if (this.workCanvas.width !== actualResolution || this.workCanvas.height !== actualResolution) {
            this.workCanvas.width = actualResolution;
            this.workCanvas.height = actualResolution;
        }
        
        const tileLeft = tx * this.tileSize;
        const tileTop = ty * this.tileSize;
        
        // Clear with background color
        if (layer === 'political') {
            ctx.fillStyle = POLITICAL_OCEAN;
        } else {
            ctx.fillStyle = OCEAN_COLORS[0];
        }
        ctx.fillRect(0, 0, actualResolution, actualResolution);
        
        // Get cells for this tile
        const key = `${tx}:${ty}`;
        const cells = this.cellTileIndex?.get(key);
        if (!cells || cells.size === 0) {
            return this.cloneCanvas();
        }
        
        // Transform to tile-local coordinates with resolution scaling
        const scale = actualResolution / this.tileSize;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-tileLeft, -tileTop);
        
        // Simplify only when zoomed OUT (lod < 1), full detail when zoomed in
        const epsilon = lod < 1 ? Math.round(1 / lod) : 0;
        
        if (layer === 'political') {
            this.renderPoliticalCells(ctx, cells, epsilon);
        } else {
            this.renderTerrainCells(ctx, cells, epsilon);
        }
        
        ctx.restore();
        
        return this.cloneCanvas();
    }
    
    /**
     * Get simplification epsilon based on LOD level
     * Only simplify when zoomed out (low LOD)
     */
    getSimplificationEpsilon(lod) {
        if (lod >= 1) return 0;  // No simplification when zoomed in
        return Math.round(1 / lod); // More simplification when more zoomed out
    }
    
    /**
     * Get cell polygon, optionally simplified for LOD
     */
    getCellPolygon(cellIndex, epsilon = 0) {
        const gen = this.generator;
        const cell = gen.voronoi.cellPolygon(cellIndex);
        
        if (!cell || cell.length < 3) return null;
        if (epsilon <= 0) return cell;
        
        // Apply Ramer-Douglas-Peucker simplification
        return this.simplifyPolygon(cell, epsilon);
    }
    
    /**
     * Ramer-Douglas-Peucker polygon simplification
     */
    simplifyPolygon(points, epsilon) {
        if (points.length <= 4) return points; // Already minimal (triangle + closing point)
        
        // Find point with maximum distance from line between first and last
        let maxDist = 0;
        let maxIdx = 0;
        
        const start = points[0];
        const end = points[points.length - 2]; // -2 because polygon is closed
        
        for (let i = 1; i < points.length - 2; i++) {
            const dist = this.pointLineDistance(points[i], start, end);
            if (dist > maxDist) {
                maxDist = dist;
                maxIdx = i;
            }
        }
        
        // If max distance exceeds epsilon, recursively simplify
        if (maxDist > epsilon) {
            const left = this.simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
            const right = this.simplifyPolygon(points.slice(maxIdx), epsilon);
            // Combine, removing duplicate point at junction
            return left.slice(0, -1).concat(right);
        } else {
            // Return simplified (just endpoints + close)
            return [start, end, points[points.length - 1]];
        }
    }
    
    /**
     * Calculate perpendicular distance from point to line
     */
    pointLineDistance(point, lineStart, lineEnd) {
        const dx = lineEnd[0] - lineStart[0];
        const dy = lineEnd[1] - lineStart[1];
        const lenSq = dx * dx + dy * dy;
        
        if (lenSq === 0) {
            return Math.sqrt(
                (point[0] - lineStart[0]) ** 2 + 
                (point[1] - lineStart[1]) ** 2
            );
        }
        
        let t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        
        const projX = lineStart[0] + t * dx;
        const projY = lineStart[1] + t * dy;
        
        return Math.sqrt((point[0] - projX) ** 2 + (point[1] - projY) ** 2);
    }
    
    /**
     * Render terrain-colored cells
     */
    renderTerrainCells(ctx, cells, epsilon = 0) {
        const gen = this.generator;
        if (!gen.heights) return;
        
        // Batch cells by color
        const colorBatches = new Map();
        
        for (const i of cells) {
            const elevation = gen.heights[i];
            // Use generator's color method for consistency
            const color = gen._getElevationColor ? 
                gen._getElevationColor(elevation) : 
                this.getElevationColor(elevation);
            
            if (!colorBatches.has(color)) {
                colorBatches.set(color, []);
            }
            colorBatches.get(color).push(i);
        }
        
        // Draw batched by color
        ctx.lineJoin = 'round';
        ctx.lineWidth = 0.5;
        
        for (const [color, indices] of colorBatches) {
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.beginPath();
            
            for (const i of indices) {
                const cell = this.getCellPolygon(i, epsilon);
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
    }
    
    /**
     * Render political-colored cells
     */
    renderPoliticalCells(ctx, cells, epsilon = 0) {
        const gen = this.generator;
        if (!gen.heights) return;
        
        const hasKingdoms = gen.kingdoms && gen.kingdomCount > 0;
        
        // Batch cells by kingdom
        const kingdomBatches = new Map();
        
        for (const i of cells) {
            // Skip ocean cells
            if (gen.heights[i] < ELEVATION.SEA_LEVEL) continue;
            
            const kingdomId = hasKingdoms ? Math.max(0, gen.kingdoms[i]) : 0;
            
            if (!kingdomBatches.has(kingdomId)) {
                kingdomBatches.set(kingdomId, []);
            }
            kingdomBatches.get(kingdomId).push(i);
        }
        
        // Draw batched by kingdom
        ctx.lineJoin = 'round';
        ctx.lineWidth = 0.5;
        
        for (const [kingdomId, indices] of kingdomBatches) {
            const colorIndex = (gen.kingdomColors && gen.kingdomColors[kingdomId] >= 0)
                ? gen.kingdomColors[kingdomId]
                : kingdomId % POLITICAL_COLORS.length;
            const color = hasKingdoms ? POLITICAL_COLORS[colorIndex] : POLITICAL_COLORS[0];
            
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.beginPath();
            
            for (const i of indices) {
                const cell = this.getCellPolygon(i, epsilon);
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
        
        // Draw lakes on top
        if (gen.lakeCells && gen.lakeCells.size > 0) {
            ctx.fillStyle = POLITICAL_OCEAN;
            
            for (const cellIndex of gen.lakeCells) {
                if (!cells.has(cellIndex)) continue;
                
                const cell = this.getCellPolygon(cellIndex, epsilon);
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
    }
    
    /**
     * Get elevation color (simplified from your _getElevationColor)
     */
    getElevationColor(elevation) {
        if (elevation < ELEVATION.SEA_LEVEL) {
            // Ocean depths
            const depth = -elevation;
            if (depth < 200) return OCEAN_COLORS[0];
            if (depth < 1000) return OCEAN_COLORS[1];
            if (depth < 2000) return OCEAN_COLORS[2];
            if (depth < 3000) return OCEAN_COLORS[3];
            return OCEAN_COLORS[4] || OCEAN_COLORS[3];
        } else {
            // Land elevations
            if (elevation < 100) return LAND_COLORS[0];
            if (elevation < 300) return LAND_COLORS[1];
            if (elevation < 600) return LAND_COLORS[2];
            if (elevation < 1000) return LAND_COLORS[3];
            if (elevation < 1500) return LAND_COLORS[4];
            if (elevation < 2500) return LAND_COLORS[5];
            if (elevation < 4000) return LAND_COLORS[6];
            return LAND_COLORS[7] || LAND_COLORS[6];
        }
    }
    
    /**
     * Clone work canvas for caching
     */
    cloneCanvas() {
        const clone = document.createElement('canvas');
        clone.width = this.workCanvas.width;
        clone.height = this.workCanvas.height;
        clone.getContext('2d').drawImage(this.workCanvas, 0, 0);
        return clone;
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        let totalCached = 0;
        for (const cache of Object.values(this.cache)) {
            totalCached += cache.size;
        }
        
        return {
            ...this.stats,
            totalCached,
            hitRate: this.stats.cacheHits / 
                (this.stats.cacheHits + this.stats.cacheMisses) || 0
        };
    }
}

/**
 * Integration mixin for VoronoiGenerator
 * Adds tile caching with minimal code changes
 */
export function addTileCaching(VoronoiGenerator) {
    const proto = VoronoiGenerator.prototype;
    
    // Store original methods
    const originalGenerate = proto.generate;
    const originalGenerateHeightmap = proto.generateHeightmap;
    const originalGenerateKingdoms = proto.generateKingdoms;
    
    // Initialize tile cache lazily
    proto._ensureTileCache = function() {
        if (!this.tileCache) {
            this.tileCache = new TileCache(this);
        }
    };
    
    // Patch generate to rebuild tile index
    proto.generate = function(...args) {
        const result = originalGenerate.apply(this, args);
        this._ensureTileCache();
        this.tileCache.invalidate();
        return result;
    };
    
    // Patch generateHeightmap to invalidate terrain tiles
    proto.generateHeightmap = function(...args) {
        const result = originalGenerateHeightmap.apply(this, args);
        if (this.tileCache) {
            this.tileCache.invalidate();
        }
        return result;
    };
    
    // Patch generateKingdoms to invalidate political tiles
    if (originalGenerateKingdoms) {
        proto.generateKingdoms = function(...args) {
            const result = originalGenerateKingdoms.apply(this, args);
            if (this.tileCache) {
                this.tileCache.invalidate('political');
            }
            return result;
        };
    }
    
    // Add tile-based render method
    proto.renderTiled = function() {
        const start = performance.now();
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, this.width, this.height);
        
        if (!this.voronoi) {
            this.metrics.renderTime = performance.now() - start;
            return;
        }
        
        // Ensure tile cache exists
        this._ensureTileCache();
        
        ctx.save();
        ctx.translate(this.viewport.x, this.viewport.y);
        ctx.scale(this.viewport.zoom, this.viewport.zoom);
        
        const bounds = this.getVisibleBounds();
        
        // Determine layer based on render mode
        let layer = 'terrain';
        if (this.renderMode === 'political') {
            layer = 'political';
        }
        
        // Draw cached tiles
        this.tileCache.render(ctx, this.viewport, bounds, layer);
        
        // Draw dynamic overlays
        this._renderDynamicContent(ctx, bounds);
        
        ctx.restore();
        
        this._drawZoomIndicator(ctx);
        
        this._lastRenderedViewport = {
            x: this.viewport.x,
            y: this.viewport.y,
            zoom: this.viewport.zoom
        };
        
        this.metrics.renderTime = performance.now() - start;
    };
    
    // Helper to render dynamic content on top of tiles
    proto._renderDynamicContent = function(ctx, bounds) {
        // Rivers
        if (this.showRivers && this.rivers && this.rivers.length > 0) {
            this._renderRivers(ctx, bounds);
        }
        
        // Political overlays
        if (this.renderMode === 'political') {
            // Contour lines
            if (this.heights) {
                this._renderContourLines?.(ctx, bounds);
            }
            
            // Kingdom names
            if (this.kingdoms && this.kingdomCount > 0 && this.kingdomNames) {
                this._renderKingdomNames(ctx, bounds);
            }
            
            // Roads
            if (this.roads && this.roads.length > 0) {
                this._renderRoads?.(ctx, bounds);
            }
            
            // Cities and capitals
            this._placedCityLabels = [];
            if (this.capitols && this.capitolNames) {
                this._renderCapitols(ctx, bounds);
            }
            if (this.cities && this.cityNames) {
                this._renderCities(ctx, bounds);
            }
            this._placedCityLabels = null;
        }
        
        // Voronoi edges
        if (this.showEdges) {
            ctx.strokeStyle = this.colors.edge;
            ctx.lineWidth = Math.max(0.25, 0.5 / this.viewport.zoom);
            ctx.beginPath();
            this.voronoi.render(ctx);
            ctx.stroke();
        }
        
        // Cell centers
        if (this.showCenters) {
            this._renderCellCenters?.(ctx, bounds);
        }
        
        // Hover highlight
        if (this.hoveredCell >= 0 && this.hoveredCell < this.cellCount) {
            this._renderHoveredCell(ctx);
        }
        
        // Grid and scale
        if (this.showGrid) {
            this._renderCoordinateGrid(ctx, bounds);
        }
        if (this.showScale) {
            this._renderScaleBar(ctx);
        }
        if (this.showWindrose) {
            this._renderWindrose(ctx);
        }
    };
    
    return VoronoiGenerator;
}
