/**
 * VORONOI MAP GENERATOR - CORE ENGINE
 * Optimized for 20k-100k cells
 * Uses flat Float64Array for maximum performance
 */

import { PRNG } from './prng.js';
import { Noise } from './noise.js';
import { NameGenerator } from './name-generator.js';
import { 
    LAND_COLORS, OCEAN_COLORS, PRECIP_COLORS, 
    POLITICAL_COLORS, POLITICAL_OCEAN, POLITICAL_BORDER,
    ELEVATION 
} from './map-constants.js';
import { renderingMethods } from './rendering-methods.js';
import { TileCache } from './tile-cache.js';

export class VoronoiGenerator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Core data structures
        this.points = null;      // Float64Array [x0, y0, x1, y1, ...]
        this.delaunay = null;    // d3.Delaunay instance
        this.voronoi = null;     // Voronoi diagram
        this.cellCount = 0;
        
        // Heightmap data
        this.heights = null;     // Float32Array of elevation values in meters (-4000 to 6000)
        this.elevations = null;  // Alias for heights (elevation in meters)
        this.terrain = null;     // Uint8Array of terrain type (0=water, 1=land)
        
        // Precipitation data
        this.precipitation = null;  // Float32Array of precipitation values (0-1)
        this.windDirection = 270;   // Wind direction in degrees (270 = from west)
        this.windStrength = 0.8;    // Wind strength (0-1)
        
        // River data
        this.rivers = [];           // Array of river paths [{path: [cellIndices], flow: number}]
        this.riverFlow = null;      // Float32Array of accumulated water flow per cell
        this.lakes = [];            // Array of lake cells [{cells: [indices], elevation: number}]
        this.lakeCells = null;      // Set of cell indices that are lakes
        this.lakeDepths = null;     // Map of cell index to lake depth
        this.drainage = null;       // Int32Array - which cell does each cell drain to (-1 = ocean/lake)
        
        // Hover state
        this.hoveredCell = -1;
        
        // Dimensions
        this.width = 0;
        this.height = 0;
        this.dpr = window.devicePixelRatio || 1;
        
        // Animation frame tracking
        this._animationFrameId = null;
        
        // Viewport / Camera system
        this.viewport = {
            x: 0,           // Pan offset X
            y: 0,           // Pan offset Y
            zoom: 1,        // Zoom level (1 = 100%)
            minZoom: 0.5,
            maxZoom: 20,
            targetZoom: 1,  // For smooth zoom animation
        };
        
        // Interaction state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.lastPan = { x: 0, y: 0 };
        
        // Display options
        this.showEdges = true;
        this.showCenters = false;
        this.showDelaunay = false;
        this.showWindrose = false;  // Show compass/wind rose on map
        this.showRivers = true;  // Show rivers on terrain
        this.showCoastline = true;  // Show coastline stroke on political map
        this.showGrid = true;    // Show coordinate grid
        
        // Coastline / island detail controls
        // coastJaggedness: 0 = smooth Voronoi-edge coastline; 1 = heavy fractal subdivision
        // islandDensity:   0 = no extra islands; 1 = many small islands sprinkled
        this.coastJaggedness = 0.5;
        this.islandDensity   = 0.3;
        
        // Lake controls
        // lakeDensity:  0 = no lakes; 1 = lots
        // lakeMinDepth: 0 = many small shallow lakes; 1 = few large deep lakes
        this.lakeDensity  = 0.5;
        this.lakeMinDepth = 0.3;
        this.showScale = true;   // Show scale bar
        this.worldSizeKm = 1000; // World size in kilometers (map width)
        this.renderMode = 'political'; // 'heightmap', 'terrain', 'precipitation', 'political'
        this.seaLevel = 0.4;
        this.subdivisionLevel = 2;  // 0 = no subdivision, 1-4 = subdivision levels
        
        // Colors
        this.colors = {
            bg: '#0c0c0e',
            edge: '#1a1a20',
            edgeWater: '#1a2a3a',
            edgeLand: '#2a3020',
            center: '#22d3ee',
            delaunay: '#1a1a1e',
        };
        
        // Performance metrics
        this.metrics = {
            genTime: 0,
            renderTime: 0,
            heightmapTime: 0,
            visibleCells: 0
        };
        
        // Name generator for kingdoms, counties, etc.
        this.nameGenerator = new NameGenerator();
        
        // Contour cache for fast rendering
        this._contourCache = null;
        
        // Render caches for expensive calculations
        this._coastlineCache = null;
        this._borderEdgesCache = null;
        this._borderPathsCache = null;
        this._kingdomBoundaryCache = null;
        
        // Tile cache for fast pan/zoom rendering
        this.tileCache = null;  // Initialized after resize when dimensions are known
        this.useTileRendering = false;  // Disabled - direct rendering is always crisp
        
        // Debounce timers
        this._renderDebounceTimer = null;
        this._zoomDebounceTimer = null;
        this._fullRenderTimer = null;
        
        // Interaction state for fast CSS transform
        this._isInteracting = false;
        this._lastRenderedViewport = { x: 0, y: 0, zoom: 1 };
        
        // Animation frame tracking
        this._animationFrameId = null;
        
        // Bind event handlers
        this._onWheel = this._onWheel.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        
        this.resize();
        this._setupEventListeners();
    }
    
    /**
     * Setup zoom and pan event listeners
     */
    _setupEventListeners() {
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
        
        // Mouse drag pan
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mouseup', this._onMouseUp);
        
        // Touch support
        this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this._onTouchEnd);
    }
    
    /**
     * Remove event listeners (cleanup)
     */
    destroy() {
        this.canvas.removeEventListener('wheel', this._onWheel);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('touchstart', this._onTouchStart);
        this.canvas.removeEventListener('touchmove', this._onTouchMove);
        this.canvas.removeEventListener('touchend', this._onTouchEnd);
    }
    
    /**
     * Mouse wheel zoom handler
     */
    _onWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate zoom
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.viewport.minZoom, 
                        Math.min(this.viewport.maxZoom, 
                        this.viewport.zoom * zoomFactor));
        
        if (newZoom !== this.viewport.zoom) {
            // Mark as interacting for fast CSS transform
            this._isInteracting = true;
            
            // Zoom toward mouse position
            const worldX = (mouseX - this.viewport.x) / this.viewport.zoom;
            const worldY = (mouseY - this.viewport.y) / this.viewport.zoom;
            
            this.viewport.zoom = newZoom;
            
            this.viewport.x = mouseX - worldX * newZoom;
            this.viewport.y = mouseY - worldY * newZoom;
            
            this._debouncedRender();
            this._onZoomChange();
        }
    }
    
    /**
     * Mouse down - start pan
     */
    _onMouseDown(e) {
        if (e.button !== 0) return; // Left click only
        
        this.isDragging = true;
        this._isInteracting = true;
        this.dragStart.x = e.clientX;
        this.dragStart.y = e.clientY;
        this.lastPan.x = this.viewport.x;
        this.lastPan.y = this.viewport.y;
        this.canvas.style.cursor = 'grabbing';
    }
    
    /**
     * Mouse move - pan
     */
    _onMouseMove(e) {
        if (!this.isDragging) return;
        
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        
        this.viewport.x = this.lastPan.x + dx;
        this.viewport.y = this.lastPan.y + dy;
        
        this._debouncedRender();
    }
    
    /**
     * Mouse up - end pan
     */
    _onMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            
            // Force full render on mouse up
            this._isInteracting = false;
            this.render();
        }
    }
    
    /**
     * Touch start
     */
    _onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this.isDragging = true;
            this._isInteracting = true;
            this.dragStart.x = touch.clientX;
            this.dragStart.y = touch.clientY;
            this.lastPan.x = this.viewport.x;
            this.lastPan.y = this.viewport.y;
        }
    }
    
    /**
     * Touch move - pan
     */
    _onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - this.dragStart.x;
            const dy = touch.clientY - this.dragStart.y;
            
            this.viewport.x = this.lastPan.x + dx;
            this.viewport.y = this.lastPan.y + dy;
            
            this._debouncedRender();
        }
    }
    
    /**
     * Touch end
     */
    _onTouchEnd(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this._isInteracting = false;
            this.render();
        }
    }
    
    /**
     * Debounced render for smooth interaction
     * Uses low-res render during interaction, full render after delay
     */
    _debouncedRender(delay = 16) {
        // Cancel any pending render
        if (this._renderDebounceTimer) {
            cancelAnimationFrame(this._renderDebounceTimer);
        }
        if (this._fullRenderTimer) {
            clearTimeout(this._fullRenderTimer);
        }
        
        // During active interaction, do immediate low-res render
        if (this._isInteracting) {
            this._renderDebounceTimer = requestAnimationFrame(() => {
                this.renderLowRes();
            });
            
            // Schedule full render after interaction stops
            this._fullRenderTimer = setTimeout(() => {
                this._isInteracting = false;
                this.render();
            }, 150);
        } else {
            // Normal render via requestAnimationFrame
            this._renderDebounceTimer = requestAnimationFrame(() => {
                this.render();
            });
        }
    }
    
    /**
    /**
     * Called when zoom level changes significantly
     */
    _onZoomChange() {
        // Debounce zoom change callback
        if (this._zoomDebounceTimer) {
            clearTimeout(this._zoomDebounceTimer);
        }
        this._zoomDebounceTimer = setTimeout(() => {
            // Emit zoom change event for UI updates
            const event = new CustomEvent('zoomchange', { 
                detail: { zoom: this.viewport.zoom } 
            });
            this.canvas.dispatchEvent(event);
        }, 150);
    }
    
    /**
     * Zoom to specific level
     */
    setZoom(zoom, centerX = null, centerY = null) {
        const newZoom = Math.max(this.viewport.minZoom, 
                        Math.min(this.viewport.maxZoom, zoom));
        
        if (centerX === null) centerX = this.width / 2;
        if (centerY === null) centerY = this.height / 2;
        
        const worldX = (centerX - this.viewport.x) / this.viewport.zoom;
        const worldY = (centerY - this.viewport.y) / this.viewport.zoom;
        
        this.viewport.zoom = newZoom;
        
        this.viewport.x = centerX - worldX * newZoom;
        this.viewport.y = centerY - worldY * newZoom;
        
        this.render();
        this._onZoomChange();
    }
    
    /**
     * Reset zoom and pan
     */
    resetView() {
        this.viewport.x = 0;
        this.viewport.y = 0;
        this.viewport.zoom = 1;
        this.render();
        this._onZoomChange();
    }
    
    /**
     * Fit content to view
     */
    fitToView() {
        this.viewport.x = 0;
        this.viewport.y = 0;
        this.viewport.zoom = 1;
        this.render();
        this._onZoomChange();
    }
    
    /**
     * Get visible bounds in world coordinates
     */
    getVisibleBounds() {
        const invZoom = 1 / this.viewport.zoom;
        return {
            left: -this.viewport.x * invZoom,
            top: -this.viewport.y * invZoom,
            right: (this.width - this.viewport.x) * invZoom,
            bottom: (this.height - this.viewport.y) * invZoom
        };
    }
    
    /**
     * Convert screen coordinates to world coordinates
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.viewport.x) / this.viewport.zoom,
            y: (screenY - this.viewport.y) / this.viewport.zoom
        };
    }
    
    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.viewport.zoom + this.viewport.x,
            y: worldY * this.viewport.zoom + this.viewport.y
        };
    }
    
    /**
     * Resize canvas to container
     */
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        
        // Initialize or reinitialize tile cache with new dimensions
        if (this.width > 0 && this.height > 0) {
            this.tileCache = new TileCache(this, {
                tileSize: 512  // Adjust based on typical cell density
            });
        }
        
        // Regenerate if we have points
        if (this.points && this.cellCount > 0) {
            this.updateDiagram();
            this.render();
        }
    }
    
    /**
     * Generate points with specified distribution
     */
    generate(count, distribution = 'jittered', seed = 12345, heightmapOptions = null) {
        const start = performance.now();
        
        // Store settings for potential redraw
        this._lastSeed = seed;
        this._lastDistribution = distribution;
        this._lastCellCount = count;
        
        PRNG.setSeed(seed);
        this.cellCount = count;
        
        // Allocate flat array for points
        this.points = new Float64Array(count * 2);
        
        // Clear heightmap, precipitation, rivers and contour cache
        this.heights = null;
        this.terrain = null;
        this.precipitation = null;
        this.rivers = [];
        this.lakes = [];
        this.lakeCells = null;
        this.lakeDepths = null;
        this.riverFlow = null;
        this.drainage = null;
        this._contourCache = null;
        this._coastlineCache = null;
        
        // Invalidate tile cache
        if (this.tileCache) {
            this.tileCache.invalidate();
        }
        
        const margin = 1;
        const w = this.width - margin * 2;
        const h = this.height - margin * 2;
        
        // Generate land probability map for biased distribution
        const landProb = heightmapOptions ? this._generateLandProbabilityMap(seed, heightmapOptions) : null;
        
        switch (distribution) {
            case 'random':
                this._generateRandomBiased(margin, w, h, landProb);
                break;
            case 'jittered':
                this._generateJitteredBiased(margin, w, h, landProb);
                break;
            case 'poisson':
                this._generatePoissonBiased(margin, w, h, landProb);
                break;
            case 'relaxed':
                this._generateJitteredBiased(margin, w, h, landProb);
                this._relaxPoints(3); // 3 iterations of Lloyd relaxation
                break;
            default:
                this._generateJitteredBiased(margin, w, h, landProb);
        }
        
        this.updateDiagram();
        this.metrics.genTime = performance.now() - start;
        
        this.render();
        
        return this.metrics;
    }
    
    /**
     * Generate heightmap using noise
     */
    generateHeightmap(options = {}) {
        const start = performance.now();
        
        // Clear rendering caches when terrain changes
        this._contourCache = null;
        this._coastlineCache = null;
        
        const {
            seed = 12345,
            algorithm = 'fbm',
            frequency = 3,
            octaves = 6,
            seaLevel = 0.4,      // 0-1, determines what fraction of cells are water
            falloff = 'radial',
            falloffStrength = 0.7,
            smoothing = 0,       // Number of smoothing iterations (0 = none)
            smoothingStrength = 0.6  // How much to blend with neighbors (0-1)
        } = options;
        
        // Store settings for potential redraw
        this._lastHeightmapOptions = { seed, algorithm, frequency, octaves, seaLevel, falloff, falloffStrength, smoothing, smoothingStrength };
        
        this.seaLevel = seaLevel;
        
        // Clear cached landmasses
        this.landmasses = null;
        this.landmassBoundaries = null;
        
        // Initialize noise
        Noise.init(seed);
        
        // Allocate arrays
        this.heights = new Float32Array(this.cellCount);  // Elevation in meters
        this.elevations = this.heights;  // Alias
        this.terrain = new Uint8Array(this.cellCount);
        
        const cx = this.width / 2;
        const cy = this.height / 2;
        
        // Generate height for each cell
        for (let i = 0; i < this.cellCount; i++) {
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            
            // Normalize coordinates
            const nx = x / this.width;
            const ny = y / this.height;
            
            // Get noise value based on algorithm (returns -1 to 1)
            let h;
            switch (algorithm) {
                case 'simplex':
                    h = Noise.simplex2(nx * frequency, ny * frequency);
                    break;
                case 'ridged':
                    h = Noise.ridged(nx, ny, { frequency, octaves });
                    h = h * 0.5; // Scale down ridged noise
                    break;
                case 'warped':
                    h = Noise.warped(nx, ny, { frequency, octaves, warpStrength: 0.4 });
                    break;
                case 'valleys':
                    h = Noise.valleys(nx, ny, { frequency, octaves, sharpness: 1.5, depth: 0.7 });
                    break;
                case 'eroded':
                    h = Noise.eroded(nx, ny, { frequency, octaves, erosionStrength: 0.5 });
                    break;
                case 'multiwarp':
                    h = Noise.multiWarp(nx, ny, { frequency, octaves, warpIterations: 3, warpStrength: 0.5 });
                    break;
                case 'swiss':
                    h = Noise.swiss(nx, ny, { frequency, octaves, warpStrength: 0.35 });
                    break;
                case 'terraced':
                    h = Noise.terraced(nx, ny, { frequency, octaves, levels: 10, sharpness: 0.6 });
                    break;
                case 'continental':
                    h = Noise.continental(nx, ny, { frequency, octaves, continentSize: 0.6, coastComplexity: 0.5 });
                    break;
                case 'fbm':
                default:
                    h = Noise.fbm(nx, ny, { frequency, octaves });
                    break;
            }
            
            // Convert from [-1, 1] to [0, 1]
            h = (h + 1) / 2;
            
            // Apply world-shape mask (continental, archipelago, two-continents, etc.)
            h = this._applyWorldMask(h, x, y, falloff, falloffStrength);
            
            // Clamp to 0-1
            h = Math.max(0, Math.min(1, h));
            
            // Convert to elevation in meters
            // seaLevel determines the cutoff point
            // Below seaLevel -> ocean (0m to -4000m)
            // Above seaLevel -> land (0m to 6000m)
            let elevation;
            if (h <= seaLevel) {
                // Ocean: map [0, seaLevel] to [-4000, 0]
                const t = h / seaLevel;  // 0 to 1
                elevation = ELEVATION.MIN * (1 - t);  // -4000 to 0
            } else {
                // Land: map [seaLevel, 1] to [0, 6000]
                const t = (h - seaLevel) / (1 - seaLevel);  // 0 to 1
                elevation = ELEVATION.MAX * t;  // 0 to 6000
            }
            
            this.heights[i] = elevation;
            this.terrain[i] = elevation >= ELEVATION.SEA_LEVEL ? 1 : 0;
        }
        
        // Sprinkle small islands + broaden coastlines based on islandDensity.
        // We do this BEFORE smoothing so smoothing rounds the new islands a bit;
        // and BEFORE erosion (which runs in a separate step) so the new
        // islands participate in drainage and erosion naturally.
        const islandDensity = this.islandDensity ?? 0;
        if (islandDensity > 0) {
            this._sprinkleIslands(seed, islandDensity);
            this._broadenCoastlines(seed, islandDensity);
        }
        
        // Apply per-cell coastal noise (the "real" jaggedness fix).
        // Runs after islands/broaden so newly-created islands also get jagged.
        const jagged = this.coastJaggedness ?? 0;
        if (jagged > 0) {
            this._applyCoastalNoise(seed, jagged);
        }
        
        // Apply smoothing passes if requested
        if (smoothing > 0) {
            this.smoothHeights(smoothing, smoothingStrength);
        }
        
        // Clear contour cache so it regenerates with new heights
        this.clearContourCache();
        
        // Invalidate tile cache
        if (this.tileCache) {
            this.tileCache.invalidate();
        }
        
        this.metrics.heightmapTime = performance.now() - start;
        this.render();
        
        return this.metrics;
    }
    
    /**
     * Smooth heights by averaging with neighbors
     * @param {number} iterations - Number of smoothing passes
     * @param {number} strength - Blend factor (0-1), higher = more smoothing
     */
    smoothHeights(iterations = 2, strength = 0.5) {
        if (!this.heights || !this.voronoi) return;
        
        const clampedStrength = Math.max(0, Math.min(1, strength));
        
        for (let iter = 0; iter < iterations; iter++) {
            const newHeights = new Float32Array(this.cellCount);
            
            for (let i = 0; i < this.cellCount; i++) {
                const neighbors = Array.from(this.voronoi.neighbors(i));
                
                if (neighbors.length === 0) {
                    newHeights[i] = this.heights[i];
                    continue;
                }
                
                // Calculate weighted average with neighbors
                let sum = 0;
                let totalWeight = 0;
                
                // Add neighbor contributions
                for (const n of neighbors) {
                    // Weight by inverse distance for smoother results
                    const dx = this.points[i * 2] - this.points[n * 2];
                    const dy = this.points[i * 2 + 1] - this.points[n * 2 + 1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const weight = 1 / (dist + 1);
                    
                    sum += this.heights[n] * weight;
                    totalWeight += weight;
                }
                
                const neighborAvg = sum / totalWeight;
                
                // Blend between original and neighbor average
                newHeights[i] = this.heights[i] * (1 - clampedStrength) + neighborAvg * clampedStrength;
            }
            
            // Copy back
            this.heights.set(newHeights);
        }
        
        // Reclassify terrain after smoothing
        for (let i = 0; i < this.cellCount; i++) {
            this.terrain[i] = this.heights[i] >= ELEVATION.SEA_LEVEL ? 1 : 0;
        }
    }
    
    /**
     * Sprinkle small islands across shallow ocean using high-frequency noise.
     *
     * Looks at every shallow-ocean cell (within ~800m of sea level) and rolls
     * a noise-based "should this be a tiny island?" check. Cells that pass
     * become small islands at low elevation. Most cells fail the check, so
     * we only get a few specks per region.
     *
     * @param {number} seed - world seed (used for an offset noise field)
     * @param {number} density - 0..1, fraction of mid-shallow cells that may become islands
     */
    _sprinkleIslands(seed, density) {
        if (!this.heights || density <= 0) return;
        
        // Use a separate noise channel offset from main terrain noise so islands
        // aren't correlated with the underlying continental noise (otherwise
        // they'd cluster in the same spots every time).
        Noise.init(seed + 90210);
        
        // How aggressive to be. density=1.0 means up to ~6% of shallow cells
        // become islands, which is already a LOT scattered across a large map.
        const islandChance = density * 0.06;
        
        // Only consider cells that are reasonably shallow — between -800m and
        // -50m. Deeper than that and an island would be implausible; shallower
        // than that and we'd be eating into the existing continent's coast.
        const minDepth = -800;
        const maxDepth = -50;
        
        for (let i = 0; i < this.cellCount; i++) {
            const h = this.heights[i];
            if (h < minDepth || h > maxDepth) continue;
            
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            const nx = x / this.width;
            const ny = y / this.height;
            
            // High-frequency noise = small clusters of islands rather than
            // perfectly uniform sprinkling. This gives archipelago feel.
            const n1 = Noise.simplex2(nx * 18.0, ny * 18.0);
            const n2 = Noise.simplex2(nx * 42.0 + 11.3, ny * 42.0 + 7.7) * 0.5;
            const sample = (n1 + n2) * 0.7;  // -1..1
            
            // Island wherever noise crosses a high threshold. The threshold
            // depends on density — denser = lower threshold = more islands.
            const threshold = 1 - islandChance * 14;  // density 0.5 -> 0.58, density 1.0 -> 0.16
            if (sample > threshold) {
                // Lift this cell to a low-elevation island. Elevation depends
                // on how far above the threshold we landed (so peaks form).
                const lift = (sample - threshold) / (1 - threshold);  // 0..1
                this.heights[i] = Math.max(50, lift * 200);  // 50-200m islands
                this.terrain[i] = 1;
            }
        }
    }
    
    /**
     * Broaden coastlines: cells that are just barely below sea level near
     * existing land have a chance to be lifted just barely above sea level.
     *
     * This produces barrier islands, peninsulas, and offshore reefs along
     * existing continental shores — the irregularity you see on real maps.
     *
     * @param {number} seed - world seed
     * @param {number} density - 0..1, how aggressively to broaden
     */
    _broadenCoastlines(seed, density) {
        if (!this.heights || density <= 0) return;
        
        Noise.init(seed + 12345);
        
        // Find shallow ocean cells adjacent to land
        const candidates = [];
        for (let i = 0; i < this.cellCount; i++) {
            // Must be shallow ocean, not deep
            if (this.heights[i] >= 0 || this.heights[i] < -200) continue;
            
            // Must touch land
            let touchesLand = false;
            for (const n of this.voronoi.neighbors(i)) {
                if (this.heights[n] >= ELEVATION.SEA_LEVEL) {
                    touchesLand = true;
                    break;
                }
            }
            if (!touchesLand) continue;
            
            candidates.push(i);
        }
        
        // Lift a noise-controlled fraction of them to land.
        // density=1.0 promotes ~50% of coastal-shallow cells; density=0.3 ~15%.
        const promoteChance = 0.5 * density;
        
        for (const i of candidates) {
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            const nx = x / this.width;
            const ny = y / this.height;
            
            // Mid-frequency noise so promoted cells form contiguous strips
            // (barrier islands, headlands) rather than isolated specks.
            const sample = Noise.simplex2(nx * 8.0, ny * 8.0);   // -1..1
            // Map to 0..1 and compare to threshold derived from density
            const normalized = (sample + 1) / 2;
            const threshold = 1 - promoteChance;
            
            if (normalized > threshold) {
                // Promote to just-above-sea-level land
                const lift = (normalized - threshold) / (1 - threshold);
                this.heights[i] = Math.max(20, lift * 150);
                this.terrain[i] = 1;
            }
        }
    }
    
    /**
     * Apply per-cell noise to coastal cells to make the actual cell graph jagged.
     *
     * This is the "real" jaggedness: instead of post-processing the rendered
     * coastline (which causes fill/coastline mismatch), we modify the underlying
     * heightmap so cells flip back and forth across sea level near the coast.
     * The result is that the Voronoi cells themselves form an irregular shore.
     *
     * Strategy: identify cells within ~3 cells of the land/water boundary,
     * sample high-frequency noise at each, and shift their elevations enough
     * to potentially flip them across sea level. Cells far from any coast
     * are untouched.
     *
     * @param {number} seed - world seed (offset for independent noise channel)
     * @param {number} jaggedness - 0..1, how strongly to displace coastal cells
     */
    _applyCoastalNoise(seed, jaggedness) {
        if (!this.heights || !this.voronoi || jaggedness <= 0) return;
        
        // Independent noise channel so coastline noise doesn't correlate with
        // terrain features (otherwise the same seed would always produce the
        // same coast pattern as terrain — looks artificial)
        Noise.init(seed + 54321);
        
        // 1) Find coastal cells via BFS up to N rings from any land/water boundary
        const ringDepth = 3;  // how many cell-rings deep to apply noise
        const ring = new Int8Array(this.cellCount);  // 0 = far from coast, 1..N = ring distance
        ring.fill(0);
        
        // Seed ring 1: cells that have a neighbour of opposite terrain type
        const queue = [];
        let qHead = 0;
        for (let i = 0; i < this.cellCount; i++) {
            const isLand = this.heights[i] >= ELEVATION.SEA_LEVEL;
            for (const n of this.voronoi.neighbors(i)) {
                const nIsLand = this.heights[n] >= ELEVATION.SEA_LEVEL;
                if (isLand !== nIsLand) {
                    ring[i] = 1;
                    queue.push(i);
                    break;
                }
            }
        }
        
        // BFS expand to ringDepth
        while (qHead < queue.length) {
            const cur = queue[qHead++];
            const r = ring[cur];
            if (r >= ringDepth) continue;
            for (const n of this.voronoi.neighbors(cur)) {
                if (ring[n] === 0) {
                    ring[n] = r + 1;
                    queue.push(n);
                }
            }
        }
        
        // 2) For each coastal cell, sample noise and shift its height.
        // Strength tapers with ring distance so the effect is concentrated at
        // the actual coastline and fades inland/seaward.
        // Magnitude is in METERS — 400m at jaggedness=1.0 is enough to flip
        // any cell within ~400m of sea level, which is the typical coastal range.
        const baseMagnitude = 400 * jaggedness;
        
        for (let i = 0; i < this.cellCount; i++) {
            const r = ring[i];
            if (r === 0) continue;
            
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            const nx = x / this.width;
            const ny = y / this.height;
            
            // Multi-octave high-freq noise. Higher freq = smaller-scale jaggedness.
            const n1 = Noise.simplex2(nx * 22.0,        ny * 22.0);
            const n2 = Noise.simplex2(nx * 55.0 + 17.3, ny * 55.0 + 7.7) * 0.5;
            const sample = (n1 + n2) / 1.5;  // -1..1
            
            // Taper by ring distance: ring 1 = full strength, ring N = falls off
            const taper = 1 - (r - 1) / ringDepth;  // 1.0, 0.66, 0.33 for depth=3
            
            const shift = sample * baseMagnitude * taper;
            this.heights[i] += shift;
        }
        
        // 3) Reclassify terrain
        for (let i = 0; i < this.cellCount; i++) {
            this.terrain[i] = this.heights[i] >= ELEVATION.SEA_LEVEL ? 1 : 0;
        }
        
        // 4) Invalidate caches that depend on coastline geometry
        this._coastlineCache = null;
        this._contourCache = null;
    }
    
    /**
     * Apply realistic hydraulic erosion simulation
     * Traces water from high points downhill to sea, carving valleys
     * @param {Object} options - Erosion parameters
     */
    applyHydraulicErosion(options = {}) {
        if (!this.heights || !this.voronoi) return;
        
        const {
            iterations = 50000,
            erosionStrength = 0.3,
            depositionRate = 0.3,
        } = options;
        
        const startTime = performance.now();
        
        // STEP 1: Fill ALL depressions so water can flow to ocean
        // Use priority-flood algorithm
        this._fillAllDepressions();
        
        // STEP 2: Calculate drainage for EVERY land cell
        const drainTo = new Int32Array(this.cellCount).fill(-1);
        
        for (let i = 0; i < this.cellCount; i++) {
            if (this.filledHeights[i] < ELEVATION.SEA_LEVEL) continue;
            
            let lowestN = -1;
            let lowestH = this.filledHeights[i];
            
            for (const n of this.voronoi.neighbors(i)) {
                if (this.filledHeights[n] < lowestH) {
                    lowestH = this.filledHeights[n];
                    lowestN = n;
                }
            }
            
            drainTo[i] = lowestN;
        }
        
        // STEP 3: Calculate flow accumulation (how much water passes through each cell)
        // Sort by filled height (highest first)
        const landCells = [];
        for (let i = 0; i < this.cellCount; i++) {
            if (this.filledHeights[i] >= ELEVATION.SEA_LEVEL) {
                landCells.push(i);
            }
        }
        landCells.sort((a, b) => this.filledHeights[b] - this.filledHeights[a]);
        
        // Each cell starts with 1 unit of water, passes it downstream
        const flowAccum = new Float32Array(this.cellCount).fill(1);
        
        for (const cell of landCells) {
            const downstream = drainTo[cell];
            if (downstream >= 0) {
                flowAccum[downstream] += flowAccum[cell];
            }
        }
        
        // Find max flow
        let maxFlow = 1;
        for (let i = 0; i < this.cellCount; i++) {
            if (flowAccum[i] > maxFlow) maxFlow = flowAccum[i];
        }
        
        
        // STEP 4: Erode based on flow - use stream power law
        // Only erode where significant water accumulates (rivers)
        const baseErosion = erosionStrength * 800;
        const flowThreshold = maxFlow * 0.02; // Only erode top 2% flow cells
        
        for (let i = 0; i < this.cellCount; i++) {
            if (flowAccum[i] < flowThreshold) continue; // Only erode river channels
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            
            // Stream power erosion - sqrt of flow ratio
            const flowRatio = (flowAccum[i] - flowThreshold) / (maxFlow - flowThreshold);
            const erosion = baseErosion * Math.pow(flowRatio, 0.5);
            
            // Don't erode below sea level
            const minH = ELEVATION.SEA_LEVEL + 1;
            this.heights[i] = Math.max(minH, this.heights[i] - erosion);
        }
        
        // STEP 5: Minimal valley widening - just immediate neighbors of river cells
        for (let i = 0; i < this.cellCount; i++) {
            if (flowAccum[i] < flowThreshold * 3) continue; // Only significant rivers
            if (this.heights[i] < ELEVATION.SEA_LEVEL + 10) continue;
            
            const flowRatio = (flowAccum[i] - flowThreshold) / (maxFlow - flowThreshold);
            const sideErosion = baseErosion * Math.pow(flowRatio, 0.5) * 0.2;
            const minH = ELEVATION.SEA_LEVEL + 1;
            
            // Only immediate neighbors, modest erosion
            for (const n of this.voronoi.neighbors(i)) {
                if (this.heights[n] < ELEVATION.SEA_LEVEL + 5) continue;
                if (flowAccum[n] >= flowThreshold) continue; // Don't double-erode river cells
                this.heights[n] = Math.max(minH, this.heights[n] - sideErosion);
            }
        }
        
        // STEP 6: Limit slopes only near river channels
        this._limitSlopes(flowAccum, flowThreshold);
        
        // STEP 7: Light smoothing for valley edges
        this._smoothErodedTerrain(flowAccum, flowThreshold);
        
        // Reclassify terrain
        for (let i = 0; i < this.cellCount; i++) {
            this.terrain[i] = this.heights[i] >= ELEVATION.SEA_LEVEL ? 1 : 0;
        }
        
        // Clear caches
        this._coastlineCache = null;
        this._contourCache = null;
        
        const elapsed = performance.now() - startTime;
    }
    
    /**
     * Limit slopes to prevent extreme height differences near rivers
     */
    _limitSlopes(flowAccum, flowThreshold) {
        const maxSlopePerCell = 300; // Maximum height difference
        const iterations = 2;
        
        for (let iter = 0; iter < iterations; iter++) {
            let changes = 0;
            
            for (let i = 0; i < this.cellCount; i++) {
                // Only limit slopes near river channels
                if (flowAccum[i] < flowThreshold) continue;
                if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
                
                const myHeight = this.heights[i];
                
                for (const n of this.voronoi.neighbors(i)) {
                    if (this.heights[n] < ELEVATION.SEA_LEVEL) continue;
                    
                    const diff = this.heights[n] - myHeight;
                    
                    // If neighbor is too much higher, pull it down
                    if (diff > maxSlopePerCell) {
                        this.heights[n] = myHeight + maxSlopePerCell;
                        changes++;
                    }
                }
            }
            
            if (changes === 0) break;
        }
    }
    
    /**
     * Light smoothing for valley edges only
     */
    _smoothErodedTerrain(flowAccum, flowThreshold) {
        const iterations = 1;
        const strength = 0.2;
        
        for (let iter = 0; iter < iterations; iter++) {
            const newHeights = new Float32Array(this.heights);
            
            for (let i = 0; i < this.cellCount; i++) {
                // Only smooth near rivers
                if (flowAccum[i] < flowThreshold * 0.5) continue;
                if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
                
                const neighbors = Array.from(this.voronoi.neighbors(i));
                if (neighbors.length === 0) continue;
                
                let sum = 0;
                let count = 0;
                
                for (const n of neighbors) {
                    if (this.heights[n] < ELEVATION.SEA_LEVEL) continue;
                    sum += this.heights[n];
                    count++;
                }
                
                if (count > 0) {
                    const neighborAvg = sum / count;
                    newHeights[i] = this.heights[i] * (1 - strength) + neighborAvg * strength;
                }
            }
            
            this.heights.set(newHeights);
        }
    }
    
    /**
     * Fill all depressions using priority-flood algorithm
     * Creates filledHeights where all water flows to ocean
     *
     * Implementation note: uses a binary min-heap for the priority queue.
     * The previous implementation used Array + .shift() + .sort() per
     * operation which was O(N^2 log N) and produced multi-second hangs at
     * 50k+ cells. This is ~O(N log N).
     */
    _fillAllDepressions() {
        this.filledHeights = new Float32Array(this.heights);
        
        // Binary min-heap. Each node is [height, cellIndex] but we store
        // them flat for speed: parallel arrays.
        const heapH = new Float32Array(this.cellCount * 2);  // height
        const heapI = new Int32Array(this.cellCount * 2);    // cell index
        let heapSize = 0;
        
        const heapPush = (h, idx) => {
            let i = heapSize++;
            heapH[i] = h;
            heapI[i] = idx;
            // Sift up
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (heapH[parent] <= heapH[i]) break;
                // swap
                const th = heapH[parent], ti = heapI[parent];
                heapH[parent] = heapH[i]; heapI[parent] = heapI[i];
                heapH[i] = th; heapI[i] = ti;
                i = parent;
            }
        };
        
        const heapPop = () => {
            const rootH = heapH[0], rootI = heapI[0];
            heapSize--;
            if (heapSize > 0) {
                heapH[0] = heapH[heapSize];
                heapI[0] = heapI[heapSize];
                // Sift down
                let i = 0;
                const n = heapSize;
                while (true) {
                    const l = 2 * i + 1;
                    const r = 2 * i + 2;
                    let smallest = i;
                    if (l < n && heapH[l] < heapH[smallest]) smallest = l;
                    if (r < n && heapH[r] < heapH[smallest]) smallest = r;
                    if (smallest === i) break;
                    const th = heapH[smallest], ti = heapI[smallest];
                    heapH[smallest] = heapH[i]; heapI[smallest] = heapI[i];
                    heapH[i] = th; heapI[i] = ti;
                    i = smallest;
                }
            }
            return [rootH, rootI];
        };
        
        const processed = new Uint8Array(this.cellCount);
        const margin = 5;
        
        // Seed the queue with ocean cells and edge cells
        for (let i = 0; i < this.cellCount; i++) {
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            
            if (this.heights[i] < ELEVATION.SEA_LEVEL ||
                x < margin || x > this.width - margin ||
                y < margin || y > this.height - margin) {
                heapPush(this.filledHeights[i], i);
                processed[i] = 1;
            }
        }
        
        // Process cells in height order, lowest first
        while (heapSize > 0) {
            const [, current] = heapPop();
            const currentH = this.filledHeights[current];
            
            for (const neighbor of this.voronoi.neighbors(current)) {
                if (processed[neighbor]) continue;
                processed[neighbor] = 1;
                
                // If neighbor is lower than current, raise it (fill depression)
                if (this.filledHeights[neighbor] <= currentH) {
                    this.filledHeights[neighbor] = currentH + 0.01;
                }
                
                heapPush(this.filledHeights[neighbor], neighbor);
            }
        }
    }
    
    /**
     * Light smoothing pass after erosion to reduce harsh edges
     */
    _smoothErosionResults(iterations = 1, strength = 0.3) {
        for (let iter = 0; iter < iterations; iter++) {
            const newHeights = new Float32Array(this.cellCount);
            
            for (let i = 0; i < this.cellCount; i++) {
                // Only smooth land cells
                if (this.heights[i] < ELEVATION.SEA_LEVEL) {
                    newHeights[i] = this.heights[i];
                    continue;
                }
                
                const neighbors = Array.from(this.voronoi.neighbors(i));
                if (neighbors.length === 0) {
                    newHeights[i] = this.heights[i];
                    continue;
                }
                
                let sum = this.heights[i];
                let count = 1;
                
                for (const n of neighbors) {
                    if (this.heights[n] >= ELEVATION.SEA_LEVEL) {
                        sum += this.heights[n];
                        count++;
                    }
                }
                
                const avg = sum / count;
                newHeights[i] = this.heights[i] * (1 - strength) + avg * strength;
            }
            
            this.heights.set(newHeights);
        }
    }
    
    /**
     * Fill small depressions/pits that were created by erosion
     * Uses a simple approach: raise any cell that is lower than all its neighbors
     */
    _fillDepressions() {
        const maxIterations = 50;
        
        for (let iter = 0; iter < maxIterations; iter++) {
            let changed = false;
            
            for (let i = 0; i < this.cellCount; i++) {
                const h = this.heights[i];
                
                // Skip ocean cells
                if (h < ELEVATION.SEA_LEVEL - 100) continue;
                
                const neighbors = Array.from(this.voronoi.neighbors(i));
                if (neighbors.length === 0) continue;
                
                // Find lowest neighbor
                let lowestNeighbor = Infinity;
                let allHigher = true;
                
                for (const n of neighbors) {
                    const nh = this.heights[n];
                    if (nh < lowestNeighbor) {
                        lowestNeighbor = nh;
                    }
                    if (nh <= h) {
                        allHigher = false;
                    }
                }
                
                // If this cell is a pit (lower than all neighbors), raise it
                if (allHigher && lowestNeighbor > h) {
                    // Raise to just below lowest neighbor to create drainage
                    this.heights[i] = lowestNeighbor - 0.1;
                    changed = true;
                }
            }
            
            if (!changed) break;
        }
    }
    
    /**
     * Generate precipitation based on wind direction and terrain
     * Windward slopes (facing wind) get rain, leeward slopes (behind mountains) are dry
     */
    generatePrecipitation(options = {}) {
        if (!this.heights || this.cellCount === 0) return;
        
        const {
            windDirection = this.windDirection,  // degrees, 0=N, 90=E, 180=S, 270=W
            windStrength = this.windStrength,    // 0-1
            basePrecip = 0.5,                    // base precipitation level
            orographicStrength = 2.0             // how much slopes affect rain
        } = options;
        
        this.windDirection = windDirection;
        this.windStrength = windStrength;
        
        // Wind blows FROM the specified direction
        // Wind FROM north (0°) means air moves southward (+Y in screen coords)
        // Wind FROM west (270°) means air moves eastward (+X)
        const windRad = windDirection * Math.PI / 180;
        const windToX = Math.sin(windRad);   // Direction wind blows TO
        const windToY = Math.cos(windRad);   // +Y is down on screen
        
        // Allocate array
        this.precipitation = new Float32Array(this.cellCount);
        
        // For each cell, calculate precipitation based on slope relative to wind
        for (let i = 0; i < this.cellCount; i++) {
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            const elevation = this.heights[i];
            const isOcean = elevation < ELEVATION.SEA_LEVEL;
            
            // Calculate elevation gradient in wind direction
            const neighbors = Array.from(this.voronoi.neighbors(i));
            
            let upwindElev = 0;
            let upwindCount = 0;
            let downwindElev = 0; 
            let downwindCount = 0;
            
            for (const n of neighbors) {
                const nx = this.points[n * 2];
                const ny = this.points[n * 2 + 1];
                const nElev = this.heights[n];
                
                // Vector from this cell to neighbor
                const toNeighborX = nx - x;
                const toNeighborY = ny - y;
                
                // Dot product with wind direction
                // Positive = neighbor is in downwind direction
                // Negative = neighbor is in upwind direction
                const dot = toNeighborX * windToX + toNeighborY * windToY;
                
                if (dot < -5) {  // Neighbor is upwind
                    upwindElev += nElev;
                    upwindCount++;
                } else if (dot > 5) {  // Neighbor is downwind
                    downwindElev += nElev;
                    downwindCount++;
                }
            }
            
            // Calculate slope in wind direction
            // Positive slope = terrain rises in wind direction (windward slope)
            // Negative slope = terrain falls in wind direction (leeward slope)
            let slope = 0;
            
            if (upwindCount > 0 && downwindCount > 0) {
                upwindElev /= upwindCount;
                downwindElev /= downwindCount;
                // Slope from upwind to this cell, normalized
                slope = (elevation - upwindElev) / 1000;
            } else if (upwindCount > 0) {
                upwindElev /= upwindCount;
                slope = (elevation - upwindElev) / 1000;
            }
            
            let precip;
            
            if (isOcean) {
                // Ocean has moderate, steady precipitation  
                precip = basePrecip * 1.1;
            } else {
                if (slope > 0.05) {
                    // WINDWARD slope - air rises, cools, releases moisture = HIGH rain
                    // The steeper the upward slope, the more rain
                    const lift = Math.min(1.5, slope * orographicStrength);
                    precip = basePrecip + lift * windStrength * 0.5;
                } else if (slope < -0.05) {
                    // LEEWARD slope - air descends, warms = LOW rain (rain shadow)
                    // The steeper the downward slope, the drier
                    const shadow = Math.min(1, Math.abs(slope) * orographicStrength);
                    precip = basePrecip - shadow * windStrength * 0.4;
                } else {
                    // Relatively flat area
                    precip = basePrecip;
                }
                
                // Very high elevations can still catch some moisture if windward
                if (slope > 0 && elevation > 2000) {
                    precip += 0.05 * (elevation / ELEVATION.MAX);
                }
            }
            
            this.precipitation[i] = Math.max(0.05, Math.min(1, precip));
        }
        
        // Smooth precipitation for more natural look
        this._smoothPrecipitation(3);
        
        // Normalize to use full color range
        let minP = Infinity, maxP = -Infinity;
        for (let i = 0; i < this.cellCount; i++) {
            minP = Math.min(minP, this.precipitation[i]);
            maxP = Math.max(maxP, this.precipitation[i]);
        }
        
        const range = maxP - minP || 1;
        for (let i = 0; i < this.cellCount; i++) {
            this.precipitation[i] = (this.precipitation[i] - minP) / range;
        }
        
        this.clearContourCache();
        
        return this.precipitation;
    }
    
    /**
     * Smooth precipitation values
     */
    _smoothPrecipitation(iterations = 1) {
        for (let iter = 0; iter < iterations; iter++) {
            const newPrecip = new Float32Array(this.cellCount);
            
            for (let i = 0; i < this.cellCount; i++) {
                const neighbors = Array.from(this.voronoi.neighbors(i));
                let sum = this.precipitation[i];
                
                for (const n of neighbors) {
                    sum += this.precipitation[n];
                }
                
                newPrecip[i] = sum / (neighbors.length + 1);
            }
            
            this.precipitation.set(newPrecip);
        }
    }
    
    /**
     * Calculate drainage direction for each cell (for flow visualization)
     * Uses precipitation to calculate flow accumulation which affects lake formation
     */
    calculateDrainage(options = {}) {
        if (!this.heights || this.cellCount === 0) {
            return;
        }
        
        const {
            fillInlandSeas = true,
            numberOfRivers = 30,
            lakeDensity = this.lakeDensity ?? 0,
            lakeMinDepth = this.lakeMinDepth ?? 0.3
        } = options;
        
        // Step 0: Initialize drainage array. _createLake writes to this.drainage
        // when it forms a lake (to route lake cells to the lake outlet), so we
        // need it allocated before lake detection runs. Default value is -1
        // ("doesn't drain anywhere yet"). Proper steepest-descent drainage is
        // computed below after _fillDepressions.
        this.drainage = new Int32Array(this.cellCount).fill(-1);
        
        // Step 1: Fill inland seas (ocean cells not connected to map edge)
        if (fillInlandSeas) {
            this._fillInlandSeas();
        }
        
        // Step 2: Detect endorheic basins (real depressions). Must happen
        // BEFORE _fillDepressions, which would otherwise erase the pits.
        this.lakes = [];
        this.lakeCells = new Set();
        this.lakeDepths = new Map();
        
        let endorheic = [];
        if (lakeDensity > 0) {
            // Map sliders to actual params
            const minDepthMeters = 15 + lakeMinDepth * 105;
            const maxSizeCells = Math.round(30 + lakeMinDepth * 170);
            
            endorheic = this.detectEndorheicLakes({
                density: lakeDensity,
                minDepth: minDepthMeters,
                maxSize: maxSizeCells
            });
            
            for (const lake of endorheic) {
                lake.type = 'endorheic';
                for (const c of lake.cells) {
                    this.lakeCells.add(c);
                    this.lakeDepths.set(c, lake.surfaceElevation - this.heights[c]);
                }
            }
        }
        
        // Step 3: Fill remaining depressions so non-lake water can flow to ocean.
        // Lake cells already have drainage routed to their outlet via _createLake,
        // so the fill below should leave them alone.
        this._fillDepressions();
        
        // Step 3b: Compute proper steepest-descent drainage for every land cell.
        // Each land cell drains to its lowest neighbour (using filledHeights so
        // there are no closed pits). Lake cells already have drainage[lake] = outlet
        // from _createLake; we preserve those by skipping them here.
        const filledH = this.filledHeights || this.heights;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.lakeCells.has(i)) continue;     // lake outlets already set
            if (this.heights[i] < ELEVATION.SEA_LEVEL) {
                this.drainage[i] = -1;               // ocean: drains to nowhere
                continue;
            }
            
            let lowestN = -1;
            let lowestH = filledH[i];
            for (const n of this.voronoi.neighbors(i)) {
                if (filledH[n] < lowestH) {
                    lowestH = filledH[n];
                    lowestN = n;
                }
            }
            this.drainage[i] = lowestN;
        }
        
        // Re-apply lake outlets in case Step 3b overwrote them
        // (it shouldn't because we skipped lake cells, but be defensive)
        for (const lake of endorheic) {
            for (const cell of lake.cells) {
                this.drainage[cell] = lake.outlet;
            }
        }
        
        // Clear river state but keep the lake state we built above
        this.rivers = [];
        
        // Find all land cells (lake cells count as land for river-tracing purposes
        // — water flows into a lake and out the spill point)
        const landCells = [];
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] >= ELEVATION.SEA_LEVEL) {
                landCells.push(i);
            }
        }
        
        if (landCells.length === 0) return;
        
        // Place river start points randomly across high elevation areas
        const startCells = this._selectRiverStartPoints(landCells, numberOfRivers);
        
        // Trace each river to ocean (or into a lake — _traceRiverToOcean follows drainage)
        let reachedOcean = 0;
        for (const startCell of startCells) {
            const river = this._traceRiverToOcean(startCell);
            if (river.path.length >= 5) {  // Minimum 5 cells for a river
                this.rivers.push(river);
                reachedOcean++;
            }
        }
        
        // Step 4: Detect river-fed lakes now that rivers exist
        if (lakeDensity > 0 && this.rivers.length > 0) {
            // Need flow accumulation for river-fed detection
            if (!this.riverFlow) {
                this.riverFlow = new Float32Array(this.cellCount);
                for (let i = 0; i < this.cellCount; i++) {
                    this.riverFlow[i] = (this.precipitation ? this.precipitation[i] : 0.5) * 0.1;
                }
                // Accumulate
                const sorted = [];
                for (let i = 0; i < this.cellCount; i++) {
                    if (this.heights[i] >= ELEVATION.SEA_LEVEL) {
                        sorted.push(i);
                    }
                }
                sorted.sort((a, b) => this.heights[b] - this.heights[a]);
                for (const i of sorted) {
                    const drainTo = this.drainage[i];
                    if (drainTo >= 0 && drainTo < this.cellCount) {
                        this.riverFlow[drainTo] += this.riverFlow[i];
                    }
                }
            }
            
            const riverFed = this.detectRiverFedLakes({
                density: lakeDensity * 0.6,
                minDepth: (15 + lakeMinDepth * 105) * 0.8,
                maxSize: Math.round((30 + lakeMinDepth * 170) * 0.8)
            });
            
            for (const lake of riverFed) {
                lake.type = 'river-fed';
                for (const c of lake.cells) {
                    this.lakeCells.add(c);
                    this.lakeDepths.set(c, lake.surfaceElevation - this.heights[c]);
                }
                this.lakes.push(lake);
            }
            
            // Add endorheic to this.lakes too (they were tracked separately above)
            for (const lake of endorheic) {
                this.lakes.push(lake);
            }
        } else {
            // No river-fed phase, but still need endorheic in this.lakes
            for (const lake of endorheic) {
                this.lakes.push(lake);
            }
        }
        
        // Step 5: Name lakes
        if (this.lakes.length > 0 && this.nameGenerator
            && typeof this.nameGenerator.generateLakeName === 'function') {
            for (const lake of this.lakes) {
                if (!lake.name) lake.name = this.nameGenerator.generateLakeName();
            }
        }
        
        // Generate names for rivers
        this._generateRiverNames();
        
        // Invalidate render caches that depend on water layout
        this._coastlineCache = null;
        this._contourCache = null;
        if (this.tileCache) this.tileCache.invalidate();
    }
    
    /**
     * Generate political kingdoms/states from land cells
     * Uses competitive flood fill from random seed points
     * Islands are assigned to nearest kingdom by distance
     */
    generateKingdoms(numKingdoms = 12, roadDensity = 5) {
        if (!this.heights) {
            console.warn('No heightmap - generate terrain first');
            return;
        }
        
        const startTime = performance.now();
        
        // Clear rendering caches when kingdoms change
        this._contourCache = null;
        this._coastlineCache = null;
        
        // Invalidate tile cache (political layer)
        if (this.tileCache) {
            this.tileCache.invalidate('political');
        }
        
        // Store road density for use in city/road generation
        this.roadDensity = roadDensity;
        
        
        // Get all land cells using typed array for speed
        const isLand = new Uint8Array(this.cellCount);
        const landCells = [];
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] >= ELEVATION.SEA_LEVEL) {
                isLand[i] = 1;
                landCells.push(i);
            }
        }
        
        if (landCells.length === 0) {
            console.warn('No land cells found');
            return;
        }
        
        // Initialize kingdom data
        this.kingdoms = new Int16Array(this.cellCount).fill(-1);
        this.kingdomCapitals = [];
        this.kingdomNames = [];
        this.kingdomCentroids = [];
        this.kingdomCells = [];
        
        // Fast landmass detection using typed arrays
        const landmassId = new Int16Array(this.cellCount).fill(-1);
        const landmasses = [];
        let currentLandmass = 0;
        
        // BFS for landmass detection - use index-based queue for speed
        const bfsQueue = new Int32Array(landCells.length);
        
        for (const startCell of landCells) {
            if (landmassId[startCell] >= 0) continue;
            
            let qHead = 0, qTail = 0;
            bfsQueue[qTail++] = startCell;
            landmassId[startCell] = currentLandmass;
            const cells = [];
            
            while (qHead < qTail) {
                const current = bfsQueue[qHead++];
                cells.push(current);
                
                for (const neighbor of this.voronoi.neighbors(current)) {
                    if (isLand[neighbor] && landmassId[neighbor] < 0) {
                        landmassId[neighbor] = currentLandmass;
                        bfsQueue[qTail++] = neighbor;
                    }
                }
            }
            
            landmasses.push({ cells, size: cells.length, id: currentLandmass });
            currentLandmass++;
        }
        
        // Sort landmasses by size (largest first)
        landmasses.sort((a, b) => b.size - a.size);
        
        // Calculate total land and minimum kingdom size
        const totalLand = landCells.length;
        const minCellsForKingdom = Math.max(10, totalLand * 0.01);
        
        const significantLandmasses = landmasses.filter(lm => lm.size >= minCellsForKingdom);
        const tinyLandmasses = landmasses.filter(lm => lm.size < minCellsForKingdom);
        
        let kingdomIdx = 0;
        
        // Pre-build river cell set ONCE for terrain costs (reused for all landmasses)
        const riverCellSet = new Set();
        if (this.rivers) {
            for (const river of this.rivers) {
                if (!river.path) continue;
                for (const point of river.path) {
                    const ci = point.cell !== undefined ? point.cell : point;
                    if (ci >= 0) riverCellSet.add(ci);
                }
            }
        }
        
        // Process each significant landmass
        for (const landmass of significantLandmasses) {
            const proportion = landmass.size / totalLand;
            let kingdomsForThis = Math.max(1, Math.round(proportion * numKingdoms));
            kingdomsForThis = Math.min(kingdomsForThis, Math.floor(landmass.size / 100));
            kingdomsForThis = Math.max(1, kingdomsForThis);
            
            const startK = kingdomIdx;
            const result = this._growKingdomsOnLandmass(
                landmass, kingdomsForThis, startK, isLand, landmassId, riverCellSet
            );
            
            // Record capitals (in the kingdomCapitals array, at index = kingdom id)
            for (let i = 0; i < result.capitals.length; i++) {
                this.kingdomCapitals.push(result.capitals[i]);
            }
            kingdomIdx += result.capitals.length;
        }
        
        // Handle tiny landmasses - sample capitals to find nearest
        if (tinyLandmasses.length > 0 && this.kingdomCapitals.length > 0) {
            for (const landmass of tinyLandmasses) {
                // Get centroid
                let cx = 0, cy = 0;
                for (const cell of landmass.cells) {
                    cx += this.points[cell * 2];
                    cy += this.points[cell * 2 + 1];
                }
                cx /= landmass.cells.length;
                cy /= landmass.cells.length;
                
                // Find nearest capital (fast - only check capitals, not all cells)
                let nearestKingdom = 0;
                let nearestDist = Infinity;
                
                for (let k = 0; k < this.kingdomCapitals.length; k++) {
                    const cap = this.kingdomCapitals[k];
                    if (landmassId[cap] === landmass.id) continue;
                    
                    const x = this.points[cap * 2];
                    const y = this.points[cap * 2 + 1];
                    const dist = (x - cx) ** 2 + (y - cy) ** 2;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestKingdom = this.kingdoms[cap];
                    }
                }
                
                for (const cell of landmass.cells) {
                    this.kingdoms[cell] = nearestKingdom;
                }
            }
        }
        
        // Fast cleanup pass for any unassigned land cells - run until all are assigned
        for (let pass = 0; pass < 100; pass++) {
            let changed = false;
            for (let i = 0; i < this.cellCount; i++) {
                if (!isLand[i] || this.kingdoms[i] >= 0) continue;
                
                for (const neighbor of this.voronoi.neighbors(i)) {
                    if (this.kingdoms[neighbor] >= 0) {
                        this.kingdoms[i] = this.kingdoms[neighbor];
                        changed = true;
                        break;
                    }
                }
            }
            if (!changed) break;
        }
        
        // Final fallback: assign any remaining unassigned land cells to nearest kingdom by distance
        for (let i = 0; i < this.cellCount; i++) {
            if (!isLand[i] || this.kingdoms[i] >= 0) continue;
            
            // This cell is still unassigned - find nearest assigned cell
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            
            let nearestKingdom = 0;
            let nearestDist = Infinity;
            
            // Check all kingdom capitals first (fast)
            for (let k = 0; k < this.kingdomCapitals.length; k++) {
                const cap = this.kingdomCapitals[k];
                const cx = this.points[cap * 2];
                const cy = this.points[cap * 2 + 1];
                const dist = (x - cx) ** 2 + (y - cy) ** 2;
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestKingdom = this.kingdoms[cap];
                }
            }
            
            this.kingdoms[i] = nearestKingdom;
        }
        
        // Update kingdom count
        this.kingdomCount = kingdomIdx;
        
        // Collect cells per kingdom and calculate centroids
        for (let k = 0; k < this.kingdomCount; k++) {
            this.kingdomCells[k] = [];
        }
        
        for (let i = 0; i < this.cellCount; i++) {
            const k = this.kingdoms[i];
            if (k >= 0 && k < this.kingdomCount) {
                this.kingdomCells[k].push(i);
            }
        }
        
        // Calculate centroid for each kingdom
        for (let k = 0; k < this.kingdomCount; k++) {
            const cells = this.kingdomCells[k];
            if (!cells || cells.length === 0) {
                this.kingdomCentroids[k] = { x: 0, y: 0 };
                continue;
            }
            
            let sumX = 0, sumY = 0;
            for (const cell of cells) {
                sumX += this.points[cell * 2];
                sumY += this.points[cell * 2 + 1];
            }
            this.kingdomCentroids[k] = {
                x: sumX / cells.length,
                y: sumY / cells.length
            };
        }
        
        // Generate names for all kingdoms
        this.nameGenerator.reset();
        this.kingdomNames = this.nameGenerator.generateNames(this.kingdomCount, 'kingdom');
        
        
        // Generate capitols for each kingdom
        this._generateCapitols();
        
        // Assign colors using graph coloring (no adjacent kingdoms share colors)
        this._assignKingdomColors();
        
        // Clear kingdom render caches
        this.clearKingdomCache();
        
    }
    
    /**
     * Fast capital selection using spatial distribution
     */
    _selectCapitalsFast(landCells, count) {
        if (count <= 0 || landCells.length === 0) return [];
        if (count === 1) return [landCells[Math.floor(landCells.length / 2)]];
        
        const capitals = [];
        const cellSet = new Set(landCells);
        
        // Start with a random cell near center
        let cx = 0, cy = 0;
        for (const cell of landCells) {
            cx += this.points[cell * 2];
            cy += this.points[cell * 2 + 1];
        }
        cx /= landCells.length;
        cy /= landCells.length;
        
        // Find cell nearest to centroid
        let nearestToCentroid = landCells[0];
        let nearestDist = Infinity;
        for (const cell of landCells) {
            const d = (this.points[cell * 2] - cx) ** 2 + (this.points[cell * 2 + 1] - cy) ** 2;
            if (d < nearestDist) {
                nearestDist = d;
                nearestToCentroid = cell;
            }
        }
        capitals.push(nearestToCentroid);
        
        // Add remaining capitals maximizing minimum distance to existing capitals
        while (capitals.length < count) {
            let bestCell = -1;
            let bestMinDist = -1;
            
            // Sample cells for speed (don't check all)
            const sampleSize = Math.min(500, landCells.length);
            const step = Math.max(1, Math.floor(landCells.length / sampleSize));
            
            for (let i = 0; i < landCells.length; i += step) {
                const cell = landCells[i];
                if (capitals.includes(cell)) continue;
                
                const x = this.points[cell * 2];
                const y = this.points[cell * 2 + 1];
                
                // Find minimum distance to any existing capital
                let minDist = Infinity;
                for (const cap of capitals) {
                    const d = (this.points[cap * 2] - x) ** 2 + (this.points[cap * 2 + 1] - y) ** 2;
                    if (d < minDist) minDist = d;
                }
                
                if (minDist > bestMinDist) {
                    bestMinDist = minDist;
                    bestCell = cell;
                }
            }
            
            if (bestCell >= 0) {
                capitals.push(bestCell);
            } else {
                break;
            }
        }
        
        return capitals;
    }
    
    /**
     * Score a cell for capital suitability.
     *
     * Real-world capitals tend to be on coasts, river mouths, or major
     * river bends, on flat-but-defensible terrain, and not in deserts/peaks.
     * Higher score = better capital site.
     *
     * @param {number} cell  - cell index
     * @param {Set<number>} riverCellSet - precomputed set of river cells
     * @returns {number} score in roughly [0, 100+]
     */
    _scoreCapitalSite(cell, riverCellSet) {
        const elev = this.heights[cell];
        if (elev < ELEVATION.SEA_LEVEL) return -Infinity;  // ocean
        if (this.lakeCells && this.lakeCells.has(cell)) return -Infinity;  // can't be on a lake
        
        let score = 10;  // base score for any land cell
        
        // ---- Elevation: prefer lowlands but not flat featureless terrain ----
        // Sweet spot is 50-400m. Penalize mountains.
        if (elev > 2500)      score -= 40;       // alpine, miserable
        else if (elev > 1500) score -= 15;       // highlands, harsh
        else if (elev > 800)  score -= 5;        // hills
        else if (elev < 50)   score += 5;        // coastal plain
        else                  score += 10;       // ideal lowlands
        
        // ---- Coastal/lake access: huge bonus ----
        // Cell is coastal if any neighbor is ocean OR lake
        let isCoastal = false;
        let isLakefront = false;
        let isRiver = riverCellSet.has(cell);
        let nearRiver = false;
        let nearMountain = false;
        const lakeCells = this.lakeCells;
        for (const n of this.voronoi.neighbors(cell)) {
            if (this.heights[n] < ELEVATION.SEA_LEVEL) isCoastal = true;
            if (lakeCells && lakeCells.has(n)) isLakefront = true;
            if (riverCellSet.has(n)) nearRiver = true;
            if (this.heights[n] > 2000) nearMountain = true;
        }
        if (isCoastal)   score += 25;            // ports, harbors
        if (isLakefront) score += 18;            // lakefront capitals (Geneva, Chicago)
        
        // ---- River access: bonus ----
        if (isRiver)   score += 15;
        else if (nearRiver) score += 10;
        
        // ---- Defensive bonus: near mountains is good (defensible) ----
        if (nearMountain && elev < 1500) score += 5;
        
        // ---- River mouth bonus: cell is BOTH coastal AND on/near a river ----
        if (isCoastal && (isRiver || nearRiver)) score += 15;
        
        return score;
    }
    
    /**
     * Pick capital seed cells for one landmass using terrain scoring.
     *
     * Uses a "score then space out" approach:
     *   1. Score every land cell on the landmass
     *   2. Pick the highest-scoring cell as the first capital
     *   3. For each remaining slot, pick the cell that maximizes
     *      (score) * (min distance to existing capitals)^0.6
     *      so we get terrain-appropriate sites that are also spread out
     *
     * @returns {{capitals: number[], scores: number[]}}
     */
    _selectCapitalsTerrainAware(landCells, count, riverCellSet) {
        if (count <= 0 || landCells.length === 0) return { capitals: [], scores: [] };
        
        // Score every cell on the landmass (sample if huge for speed)
        const sampleStride = landCells.length > 5000 ? Math.floor(landCells.length / 5000) : 1;
        const scored = [];
        for (let i = 0; i < landCells.length; i += sampleStride) {
            const cell = landCells[i];
            const score = this._scoreCapitalSite(cell, riverCellSet);
            if (score > -Infinity) scored.push({ cell, score });
        }
        
        if (scored.length === 0) return { capitals: [], scores: [] };
        
        // Sort by score descending — best sites first
        scored.sort((a, b) => b.score - a.score);
        
        const capitals = [];
        const capitalScores = [];
        
        // First capital: take the top-scoring site directly
        capitals.push(scored[0].cell);
        capitalScores.push(scored[0].score);
        
        if (count === 1) return { capitals, scores: capitalScores };
        
        // Subsequent capitals: trade off score vs. distance from existing capitals.
        // We don't want all 12 capitals piled on the best coastline.
        const candidatePool = scored.slice(0, Math.min(scored.length, 1000));
        const minSpacing2 = (Math.min(this.width, this.height) / Math.max(2, count)) ** 2 * 0.4;
        
        while (capitals.length < count) {
            let bestCell = -1;
            let bestScore = -Infinity;
            let bestSiteScore = 0;
            
            for (const { cell, score } of candidatePool) {
                if (capitals.includes(cell)) continue;
                
                const x = this.points[cell * 2];
                const y = this.points[cell * 2 + 1];
                
                // Distance to nearest existing capital (squared)
                let minD2 = Infinity;
                for (const cap of capitals) {
                    const dx = this.points[cap * 2] - x;
                    const dy = this.points[cap * 2 + 1] - y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < minD2) minD2 = d2;
                }
                
                // Reject if too close to an existing capital
                if (minD2 < minSpacing2) continue;
                
                // Combined: site score weighted by spacing.
                // Use sqrt of distance so it doesn't dominate; +20 to score so
                // negative-score sites still rank meaningfully.
                const combined = (score + 30) * Math.pow(minD2, 0.3);
                
                if (combined > bestScore) {
                    bestScore = combined;
                    bestCell = cell;
                    bestSiteScore = score;
                }
            }
            
            if (bestCell < 0) {
                // Couldn't find any cell satisfying minSpacing — relax it
                // and try again with whatever's left
                for (const { cell, score } of candidatePool) {
                    if (capitals.includes(cell)) continue;
                    if (score > bestScore) {
                        bestScore = score;
                        bestCell = cell;
                        bestSiteScore = score;
                    }
                }
            }
            
            if (bestCell < 0) break;
            capitals.push(bestCell);
            capitalScores.push(bestSiteScore);
        }
        
        return { capitals, scores: capitalScores };
    }
    
    /**
     * Compute the cost of expanding kingdom territory ACROSS the edge from
     * cell `from` into cell `to`. Higher cost = stronger barrier.
     *
     * The big idea: kingdoms that have to cross a river or a mountain pay
     * more "expansion budget" than kingdoms expanding across flat plains.
     * This naturally produces borders that hug rivers and ridges.
     *
     * @returns {number} cost in arbitrary units (~1.0 for normal terrain)
     */
    _kingdomEdgeCost(from, to, riverCellSet) {
        const hFrom = this.heights[from];
        const hTo   = this.heights[to];
        
        // Base cost: roughly the geographic distance (cells aren't uniform sized)
        const dx = this.points[to * 2]     - this.points[from * 2];
        const dy = this.points[to * 2 + 1] - this.points[from * 2 + 1];
        let cost = Math.sqrt(dx * dx + dy * dy);
        
        // Lake cells are forbidden — kingdoms can't claim a lake. The Dijkstra
        // expander won't be able to grow through lakes, which is exactly what
        // we want: borders naturally route around lake shores.
        if (this.lakeCells && this.lakeCells.has(to)) return Infinity;
        
        // Mountains: very expensive to expand into
        // (kingdoms historically stop at mountain ranges)
        if (hTo > 2000) cost *= 4.0 + (hTo - 2000) / 1000;
        else if (hTo > 1200) cost *= 2.0;
        else if (hTo > 600)  cost *= 1.3;
        
        // Crossing a river edge: significant barrier
        // We say "we crossed a river" if BOTH endpoints are river cells, OR
        // if one is a river cell and the other is on the opposite side.
        // Cheap heuristic: if `to` is a river cell and `from` is not (or
        // vice versa), we paid the river-crossing cost.
        const fromRiver = riverCellSet.has(from);
        const toRiver   = riverCellSet.has(to);
        if (fromRiver !== toRiver) cost *= 2.5;
        
        // Lake-shore bonus: borders prefer to follow lake shores. If the
        // 'to' cell touches a lake, give a small extra incentive (lower cost
        // here would actually attract borders TOWARD lakes; we want them to
        // be willing to expand right up to the shore but no further).
        // Implementation: do nothing extra here; the impassability check
        // above already does the right thing — kingdoms grow up to the lake
        // edge then stop, so the lake itself becomes the border.
        
        // Steep slope: hard to expand uphill quickly
        const slope = Math.abs(hTo - hFrom);
        if (slope > 400) cost *= 1.5;
        else if (slope > 200) cost *= 1.2;
        
        // Crossing into ocean: forbidden in this method (caller should also check)
        if (hTo < ELEVATION.SEA_LEVEL) cost = Infinity;
        
        return cost;
    }
    
    /**
     * Grow kingdoms across one landmass using cost-weighted Dijkstra.
     *
     * Each capital seeds a Dijkstra frontier. Cells go to whichever kingdom
     * can reach them most cheaply. Cost reflects terrain barriers (rivers,
     * mountains) so borders naturally settle on those features.
     *
     * Per-kingdom "power" multiplier means strong kingdoms expand farther
     * for the same terrain — this is how we get variable kingdom sizes.
     *
     * @returns {{capitals: number[]}} the chosen capital cells (caller assigns IDs)
     */
    _growKingdomsOnLandmass(landmass, kingdomCount, startKingdomId, isLand, landmassId, riverCellSet) {
        // 1) Pick capital seed cells based on terrain
        const { capitals } = this._selectCapitalsTerrainAware(
            landmass.cells, kingdomCount, riverCellSet
        );
        
        if (capitals.length === 0) return { capitals };
        
        const numK = capitals.length;
        
        // 2) Assign each kingdom a "power" multiplier (variable kingdom sizes).
        // Pareto-ish: most are around 1.0, a few are big (2-3x), one or two are tiny (0.3x).
        // We use a deterministic mix based on capital index so seed reproducibility is preserved.
        const kingdomPower = new Float32Array(numK);
        for (let k = 0; k < numK; k++) {
            // PRNG.random is the seeded one, used elsewhere in this module
            const r = PRNG.random();
            // Map uniform [0,1) to a power-law-ish range:
            //   ~10% become big empires (1.8 - 3.0x)
            //   ~25% are large (1.2 - 1.8x)
            //   ~40% are normal  (0.7 - 1.2x)
            //   ~25% are small / city-states (0.3 - 0.7x)
            let power;
            if      (r < 0.10) power = 1.8 + PRNG.random() * 1.2;
            else if (r < 0.35) power = 1.2 + PRNG.random() * 0.6;
            else if (r < 0.75) power = 0.7 + PRNG.random() * 0.5;
            else               power = 0.3 + PRNG.random() * 0.4;
            kingdomPower[k] = power;
        }
        
        // 3) Dijkstra expansion. cost[i] = cheapest kingdom-cost to reach cell i.
        // We use one global cost array indexed by cell to keep things simple.
        const N = this.cellCount;
        const cost = new Float32Array(N);
        cost.fill(Infinity);
        
        // Min-heap for the frontier: parallel arrays, [costValue, cellIndex].
        // A landmass can have at most landmass.cells.length entries pushed.
        // To allow re-pushes (same cell with lower cost), oversize 4x.
        const heapCap = landmass.cells.length * 4 + 16;
        const heapC = new Float32Array(heapCap);
        const heapI = new Int32Array(heapCap);
        let heapSize = 0;
        
        const heapPush = (c, idx) => {
            let i = heapSize++;
            heapC[i] = c;
            heapI[i] = idx;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heapC[p] <= heapC[i]) break;
                const tc = heapC[p], ti = heapI[p];
                heapC[p] = heapC[i]; heapI[p] = heapI[i];
                heapC[i] = tc; heapI[i] = ti;
                i = p;
            }
        };
        const heapPop = () => {
            const ri = heapI[0], rc = heapC[0];
            heapSize--;
            if (heapSize > 0) {
                heapC[0] = heapC[heapSize];
                heapI[0] = heapI[heapSize];
                let i = 0, n = heapSize;
                while (true) {
                    const l = 2 * i + 1, r = 2 * i + 2;
                    let smallest = i;
                    if (l < n && heapC[l] < heapC[smallest]) smallest = l;
                    if (r < n && heapC[r] < heapC[smallest]) smallest = r;
                    if (smallest === i) break;
                    const tc = heapC[smallest], ti = heapI[smallest];
                    heapC[smallest] = heapC[i]; heapI[smallest] = heapI[i];
                    heapC[i] = tc; heapI[i] = ti;
                    i = smallest;
                }
            }
            return [rc, ri];
        };
        
        // Seed: each capital starts at cost 0 with its kingdom assigned.
        for (let k = 0; k < numK; k++) {
            const cap = capitals[k];
            this.kingdoms[cap] = startKingdomId + k;
            cost[cap] = 0;
            heapPush(0, cap);
        }
        
        const targetLandmassId = landmass.id;
        
        // 4) Dijkstra. Each cell, when popped at its final cost, has its
        // kingdom set by whichever capital reached it cheapest.
        while (heapSize > 0) {
            const [c, current] = heapPop();
            if (c > cost[current]) continue;  // stale heap entry
            
            const myKingdom = this.kingdoms[current];
            if (myKingdom < startKingdomId || myKingdom >= startKingdomId + numK) continue;
            
            const myPower = kingdomPower[myKingdom - startKingdomId];
            
            for (const neighbor of this.voronoi.neighbors(current)) {
                // Only expand within this landmass (skip ocean + other landmasses)
                if (landmassId[neighbor] !== targetLandmassId) continue;
                if (!isLand[neighbor]) continue;
                
                const edgeCost = this._kingdomEdgeCost(current, neighbor, riverCellSet);
                if (!isFinite(edgeCost)) continue;
                
                // Powerful kingdoms expand more cheaply (so they get bigger territory)
                const newCost = c + edgeCost / myPower;
                
                if (newCost < cost[neighbor]) {
                    cost[neighbor] = newCost;
                    this.kingdoms[neighbor] = myKingdom;
                    heapPush(newCost, neighbor);
                }
            }
        }
        
        return { capitals };
    }

    /**
     * Generate capitol cities for each kingdom
     * Capitols are placed in suitable locations (not on mountains, preferably low-mid elevation)
     */
    _generateCapitols() {
        this.capitols = [];
        this.capitolNames = [];
        
        // Minimum distance between any two capitols
        const MIN_CAPITOL_DISTANCE = 80;
        
        for (let k = 0; k < this.kingdomCount; k++) {
            const cells = this.kingdomCells[k];
            if (!cells || cells.length === 0) {
                this.capitols.push(-1);
                this.capitolNames.push('');
                continue;
            }
            
            // Score each cell for capitol suitability
            // Prefer: low-mid elevation, near center, near rivers, not coastal
            let bestCell = -1;
            let bestScore = -Infinity;
            
            const centroid = this.kingdomCentroids[k];
            
            // Calculate kingdom size for distance normalization
            let maxDist = 0;
            for (const cellIdx of cells) {
                const x = this.points[cellIdx * 2];
                const y = this.points[cellIdx * 2 + 1];
                const dist = Math.sqrt((x - centroid.x) ** 2 + (y - centroid.y) ** 2);
                maxDist = Math.max(maxDist, dist);
            }
            maxDist = maxDist || 1;
            
            for (const cellIdx of cells) {
                const height = this.heights[cellIdx];
                const x = this.points[cellIdx * 2];
                const y = this.points[cellIdx * 2 + 1];
                
                // Skip water cells
                if (height < ELEVATION.SEA_LEVEL) continue;
                
                // Check distance to already placed capitols - skip if too close
                let tooCloseToCapitol = false;
                for (const existingCapitol of this.capitols) {
                    if (existingCapitol < 0) continue;
                    const capX = this.points[existingCapitol * 2];
                    const capY = this.points[existingCapitol * 2 + 1];
                    const distToCapitol = Math.sqrt((x - capX) ** 2 + (y - capY) ** 2);
                    if (distToCapitol < MIN_CAPITOL_DISTANCE) {
                        tooCloseToCapitol = true;
                        break;
                    }
                }
                if (tooCloseToCapitol) continue;
                
                let score = 0;
                
                // Elevation score: prefer low-mid elevation (100-1500m ideal)
                // Penalize mountains heavily, slight penalty for very low coastal areas
                if (height > 3000) {
                    score -= 100; // Heavy penalty for mountains
                } else if (height > 2000) {
                    score -= 50;  // Penalty for high elevation
                } else if (height > 1500) {
                    score -= 20;  // Slight penalty
                } else if (height > 500) {
                    score += 30;  // Ideal mid elevation
                } else if (height > 100) {
                    score += 20;  // Good low elevation
                } else {
                    score += 5;   // Very low, possibly coastal
                }
                
                // Distance from center: prefer central locations
                const dist = Math.sqrt((x - centroid.x) ** 2 + (y - centroid.y) ** 2);
                const normalizedDist = dist / maxDist;
                score += (1 - normalizedDist) * 40; // Up to 40 points for being central
                
                // River proximity bonus - prefer NEAR rivers, not ON them
                let isOnRiver = false;
                let isNearRiver = false;
                if (this.rivers) {
                    for (const river of this.rivers) {
                        if (!river.path) continue;
                        for (const point of river.path) {
                            const riverCellIdx = point.cell !== undefined ? point.cell : point;
                            if (riverCellIdx === cellIdx) {
                                isOnRiver = true;
                                break;
                            }
                        }
                        if (isOnRiver) break;
                    }
                    
                    // Check if near a river (neighbor is river)
                    if (!isOnRiver) {
                        const neighbors = this.getNeighbors(cellIdx);
                        for (const n of neighbors) {
                            for (const river of this.rivers) {
                                if (!river.path) continue;
                                for (const point of river.path) {
                                    const riverCellIdx = point.cell !== undefined ? point.cell : point;
                                    if (riverCellIdx === n) {
                                        isNearRiver = true;
                                        break;
                                    }
                                }
                                if (isNearRiver) break;
                            }
                            if (isNearRiver) break;
                        }
                    }
                }
                
                // Skip cells directly on rivers
                if (isOnRiver) continue;
                
                // Bonus for being near rivers
                if (isNearRiver) {
                    score += 30;
                }
                
                // Check if coastal (has water neighbor) - slight penalty
                const neighbors = this.getNeighbors(cellIdx);
                let isCoastal = false;
                for (const n of neighbors) {
                    if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                        isCoastal = true;
                        break;
                    }
                }
                if (isCoastal) {
                    score -= 10; // Slight penalty for coastal
                }
                
                // Bonus for distance from other capitols (prefer spread out)
                let minDistToCapitol = Infinity;
                for (const existingCapitol of this.capitols) {
                    if (existingCapitol < 0) continue;
                    const capX = this.points[existingCapitol * 2];
                    const capY = this.points[existingCapitol * 2 + 1];
                    const distToCapitol = Math.sqrt((x - capX) ** 2 + (y - capY) ** 2);
                    minDistToCapitol = Math.min(minDistToCapitol, distToCapitol);
                }
                if (minDistToCapitol < Infinity) {
                    score += Math.min(30, minDistToCapitol / 5); // Bonus for being far from other capitols
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestCell = cellIdx;
                }
            }
            
            // Fallback: if no good cell found (maybe all too close to other capitols), relax constraint
            if (bestCell < 0) {
                let minDist = Infinity;
                for (const cellIdx of cells) {
                    if (this.heights[cellIdx] < ELEVATION.SEA_LEVEL) continue;
                    const x = this.points[cellIdx * 2];
                    const y = this.points[cellIdx * 2 + 1];
                    const dist = Math.sqrt((x - centroid.x) ** 2 + (y - centroid.y) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        bestCell = cellIdx;
                    }
                }
            }
            
            this.capitols.push(bestCell);
        }
        
        // Generate capitol names with context (coastal/highland awareness)
        this.capitolNames = [];
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            if (capitolCell < 0) {
                this.capitolNames.push('');
                continue;
            }
            
            // Check if coastal
            let isCoastal = false;
            const neighbors = this.getNeighbors(capitolCell);
            for (const n of neighbors) {
                if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                    isCoastal = true;
                    break;
                }
            }
            
            const elevation = this.heights[capitolCell];
            const name = this.nameGenerator.generateSettlementName({
                isCoastal: isCoastal,
                isHighland: elevation > 1200,
                elevation: elevation,
                size: 'large'
            });
            this.capitolNames.push(name);
        }
        
        // Generate additional cities for each kingdom
        this._generateCities();
    }
    
    /**
     * Generate cities throughout each kingdom
     * Number of cities based on kingdom size
     */
    _generateCities() {
        // Clear old city names from used set before regenerating
        if (this.cityNames && this.nameGenerator) {
            this.nameGenerator.clearCityNames(this.cityNames);
        }
        
        this.cities = [];      // Array of {cell, kingdom, type}
        this.cityNames = [];
        
        // Build a set of river cells and near-river cells for scoring
        const riverCells = new Set();
        const nearRiverCells = new Set();
        if (this.rivers) {
            for (const river of this.rivers) {
                if (river.path) {
                    for (const point of river.path) {
                        const cellIdx = point.cell !== undefined ? point.cell : point;
                        if (cellIdx >= 0) {
                            riverCells.add(cellIdx);
                            const neighbors = this.getNeighbors(cellIdx);
                            for (const n of neighbors) {
                                if (!riverCells.has(n) && this.heights[n] >= ELEVATION.SEA_LEVEL) {
                                    nearRiverCells.add(n);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Build set of coastal cells for scoring
        const coastalCells = new Set();
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            const neighbors = this.getNeighbors(i);
            for (const n of neighbors) {
                if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                    coastalCells.add(i);
                    break;
                }
            }
        }
        
        for (let k = 0; k < this.kingdomCount; k++) {
            const cells = this.kingdomCells[k];
            if (!cells || cells.length === 0) continue;
            
            const capitolCell = this.capitols[k];
            
            // Calculate number of cities based on kingdom size and road density
            const density = this.roadDensity !== undefined ? this.roadDensity : 5;
            if (density === 0) continue;
            
            const densityFactor = 0.5 + (density / 5);
            const baseNumCities = Math.floor(cells.length / 40);
            const numCities = Math.min(20, Math.max(1, Math.floor(baseNumCities * densityFactor)));
            
            // Score all cells for city placement
            const cellScores = [];
            
            for (const cellIdx of cells) {
                const height = this.heights[cellIdx];
                
                // Skip water and very high mountains
                if (height < ELEVATION.SEA_LEVEL) continue;
                if (height > 3500) continue;
                
                // Skip if too close to capitol
                if (capitolCell >= 0) {
                    const capX = this.points[capitolCell * 2];
                    const capY = this.points[capitolCell * 2 + 1];
                    const x = this.points[cellIdx * 2];
                    const y = this.points[cellIdx * 2 + 1];
                    const distToCapitol = Math.sqrt((x - capX) ** 2 + (y - capY) ** 2);
                    if (distToCapitol < 40) continue;
                }
                
                let score = 0;
                const isCoastal = coastalCells.has(cellIdx);
                const isOnRiver = riverCells.has(cellIdx);
                const isNearRiver = nearRiverCells.has(cellIdx);
                
                // Skip cells directly on rivers
                if (isOnRiver) continue;
                
                // Score based on location (all are just "city" type now)
                if (isCoastal) {
                    score += 30;
                } else if (isNearRiver) {
                    score += 40;
                }
                
                // Elevation scoring
                if (height > 1200) {
                    score += 5;
                } else if (height > 500) {
                    score += 20;
                } else if (height > 100) {
                    score += 15;
                } else {
                    score += 10;
                }
                
                // Randomness to spread cities
                score += Math.random() * 25;
                
                cellScores.push({ cell: cellIdx, score });
            }
            
            // Sort by score descending
            cellScores.sort((a, b) => b.score - a.score);
            
            // Select cities ensuring minimum distance between them
            const selectedCities = [];
            const minCityDistance = Math.max(25, 50 - density * 2);
            
            for (const candidate of cellScores) {
                if (selectedCities.length >= numCities) break;
                
                const x = this.points[candidate.cell * 2];
                const y = this.points[candidate.cell * 2 + 1];
                
                // Check distance to already selected cities
                let tooClose = false;
                for (const existing of selectedCities) {
                    const ex = this.points[existing.cell * 2];
                    const ey = this.points[existing.cell * 2 + 1];
                    const dist = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
                    if (dist < minCityDistance) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    const isCoastal = coastalCells.has(candidate.cell);
                    const elevation = this.heights[candidate.cell];
                    selectedCities.push({
                        cell: candidate.cell,
                        kingdom: k,
                        type: 'city',
                        isCoastal: isCoastal,
                        elevation: elevation
                    });
                }
            }
            
            this.cities.push(...selectedCities);
        }
        
        // Generate names for all cities with context
        this.cityNames = [];
        for (const city of this.cities) {
            const name = this.nameGenerator.generateSettlementName({
                isCoastal: city.isCoastal,
                isHighland: city.elevation > 1200,
                elevation: city.elevation
            });
            this.cityNames.push(name);
        }
        
        // Ensure we have enough names (fallback for any missing)
        while (this.cityNames.length < this.cities.length) {
            this.cityNames.push(`City ${this.cityNames.length + 1}`);
        }
        
        // Generate roads connecting cities
        this._generateRoads();
        
        // Generate sea routes between coastal cities
        this._generateSeaRoutes();
        
        // Generate population distribution
        this._generatePopulation();
    }
    
    /**
     * Generate population distribution across kingdoms, capitals, and cities
     * Uses a realistic distribution where capitals have the most, then cities
     */
    _generatePopulation() {
        // Base population scales with land cells (roughly 50-200 people per cell)
        const landCells = this.heights.filter(h => h >= ELEVATION.SEA_LEVEL).length;
        const popPerCell = 50 + PRNG.random() * 150;
        this.totalPopulation = Math.round(landCells * popPerCell);
        
        // Initialize arrays
        this.kingdomPopulations = new Array(this.kingdomCount).fill(0);
        this.capitalPopulations = new Array(this.kingdomCount).fill(0);
        
        // Distribute population to kingdoms based on cell count
        let totalKingdomCells = 0;
        for (let k = 0; k < this.kingdomCount; k++) {
            totalKingdomCells += (this.kingdomCells[k] || []).length;
        }
        
        // First pass: assign kingdom populations proportional to territory
        let assignedPop = 0;
        for (let k = 0; k < this.kingdomCount; k++) {
            const cells = (this.kingdomCells[k] || []).length;
            // Add some variation (+/- 20%)
            const variation = 0.8 + PRNG.random() * 0.4;
            const proportion = cells / Math.max(1, totalKingdomCells);
            this.kingdomPopulations[k] = Math.round(this.totalPopulation * proportion * variation);
            assignedPop += this.kingdomPopulations[k];
        }
        
        // Normalize to match total
        const normFactor = this.totalPopulation / Math.max(1, assignedPop);
        for (let k = 0; k < this.kingdomCount; k++) {
            this.kingdomPopulations[k] = Math.round(this.kingdomPopulations[k] * normFactor);
        }
        
        // Distribute kingdom population to settlements
        // Capital gets 15-25% of kingdom pop, cities share 30-40%, rest is rural
        for (let k = 0; k < this.kingdomCount; k++) {
            const kingdomPop = this.kingdomPopulations[k];
            
            // Capital population (15-25%)
            const capitalShare = 0.15 + PRNG.random() * 0.10;
            this.capitalPopulations[k] = Math.round(kingdomPop * capitalShare);
            
            // Get cities in this kingdom
            const kingdomCities = this.cities.filter(c => c.kingdom === k);
            
            if (kingdomCities.length > 0) {
                // Cities share 30-40% of population
                const citiesShare = 0.30 + PRNG.random() * 0.10;
                const totalCityPop = Math.round(kingdomPop * citiesShare);
                
                // Distribute among cities with variation (larger share for earlier/better placed cities)
                let totalWeight = 0;
                const cityWeights = kingdomCities.map((city, idx) => {
                    // Earlier cities in the list tend to be better placed
                    const positionBonus = 1 + (kingdomCities.length - idx) / kingdomCities.length;
                    // Coastal and river cities get bonus
                    let bonus = 1;
                    const cellIdx = city.cell;
                    // Check coastal
                    for (const n of this.getNeighbors(cellIdx)) {
                        if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                            bonus += 0.3;
                            break;
                        }
                    }
                    const weight = positionBonus * bonus * (0.7 + PRNG.random() * 0.6);
                    totalWeight += weight;
                    return weight;
                });
                
                // Assign populations based on weights
                kingdomCities.forEach((city, idx) => {
                    const share = cityWeights[idx] / Math.max(0.001, totalWeight);
                    city.population = Math.round(totalCityPop * share);
                });
            }
        }
        
        // Assign population to cities that might not have a kingdom
        for (const city of this.cities) {
            if (city.population === undefined) {
                city.population = Math.round(1000 + PRNG.random() * 5000);
            }
        }
    }
    
    /**
     * Generate roads connecting cities within kingdoms
     * Creates a realistic road network - simple tree structure radiating from capitol
     * Plus a few key inter-kingdom trade routes
     */
    _generateRoads() {
        this.roads = [];
        
        // Track cells that have roads to avoid overlaps and a separate set of
        // cells that are 1-2 hops from an existing road. New paths get a
        // bonus for being on OR near existing roads, which strongly encourages
        // them to merge instead of running parallel.
        const roadCells = new Set();
        const nearRoadCells = new Set();
        
        // Pre-build river cell sets once (expensive to do per-pathfind)
        const riverCells = new Set();
        const nearRiverCells = new Set();
        
        if (this.rivers) {
            for (const river of this.rivers) {
                if (river.path) {
                    for (const point of river.path) {
                        const cellIdx = point.cell !== undefined ? point.cell : point;
                        if (cellIdx >= 0) {
                            riverCells.add(cellIdx);
                        }
                    }
                }
            }
            // Build near-river set after all river cells are known
            for (const cellIdx of riverCells) {
                const neighbors = this.getNeighbors(cellIdx);
                for (const n of neighbors) {
                    if (!riverCells.has(n) && this.heights[n] >= ELEVATION.SEA_LEVEL) {
                        nearRiverCells.add(n);
                    }
                }
            }
        }
        
        // PHASE 1: Internal kingdom roads (capitol to cities)
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            if (capitolCell < 0) continue;
            
            // Get all cities in this kingdom
            const kingdomCities = this.cities.filter(c => c.kingdom === k);
            if (kingdomCities.length === 0) continue;
            
            // Sort cities by distance to capitol
            const capitolX = this.points[capitolCell * 2];
            const capitolY = this.points[capitolCell * 2 + 1];
            
            kingdomCities.sort((a, b) => {
                const ax = this.points[a.cell * 2];
                const ay = this.points[a.cell * 2 + 1];
                const bx = this.points[b.cell * 2];
                const by = this.points[b.cell * 2 + 1];
                const distA = Math.sqrt((ax - capitolX) ** 2 + (ay - capitolY) ** 2);
                const distB = Math.sqrt((bx - capitolX) ** 2 + (by - capitolY) ** 2);
                return distA - distB;
            });
            
            // Track connected nodes (cities/capitol) and their positions
            const connectedNodes = [{
                cell: capitolCell,
                x: capitolX,
                y: capitolY
            }];
            
            // Connect each city to the nearest connected node (creates a minimum spanning tree-like structure)
            for (let i = 0; i < kingdomCities.length; i++) {
                const city = kingdomCities[i];
                const cityX = this.points[city.cell * 2];
                const cityY = this.points[city.cell * 2 + 1];
                
                // Find nearest connected node
                let nearestNode = connectedNodes[0];
                let nearestDist = Infinity;
                
                for (const node of connectedNodes) {
                    const dist = Math.sqrt((node.x - cityX) ** 2 + (node.y - cityY) ** 2);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestNode = node;
                    }
                }
                
                // Try to connect to nearest
                let road = this._findRoadPath(nearestNode.cell, city.cell, roadCells, riverCells, nearRiverCells);
                
                // If no path found, try connecting directly to capitol
                if (!road && nearestNode.cell !== capitolCell) {
                    road = this._findRoadPath(capitolCell, city.cell, roadCells, riverCells, nearRiverCells);
                }
                
                if (road && road.length >= 2) {
                    // Major road if directly connected to capitol or one of first 2 cities
                    const isMajor = nearestNode.cell === capitolCell || i < 2;
                    this.roads.push({
                        path: road,
                        kingdom: k,
                        type: isMajor ? 'major' : 'minor'
                    });
                    this._markRoadCells(road, roadCells);
                    connectedNodes.push({
                        cell: city.cell,
                        x: cityX,
                        y: cityY
                    });
                }
            }
        }
        
        // PHASE 2: Just 2-3 inter-kingdom trade routes connecting closest capitol pairs
        const capitolPairs = [];
        
        for (let k1 = 0; k1 < this.kingdomCount; k1++) {
            const capitol1 = this.capitols[k1];
            if (capitol1 < 0) continue;
            
            const cap1X = this.points[capitol1 * 2];
            const cap1Y = this.points[capitol1 * 2 + 1];
            
            for (let k2 = k1 + 1; k2 < this.kingdomCount; k2++) {
                const capitol2 = this.capitols[k2];
                if (capitol2 < 0) continue;
                
                const cap2X = this.points[capitol2 * 2];
                const cap2Y = this.points[capitol2 * 2 + 1];
                const dist = Math.sqrt((cap1X - cap2X) ** 2 + (cap1Y - cap2Y) ** 2);
                
                capitolPairs.push({ k1, k2, capitol1, capitol2, dist });
            }
        }
        
        // Sort by distance and only create the 2-3 shortest connections
        capitolPairs.sort((a, b) => a.dist - b.dist);
        const maxTradeRoutes = Math.min(3, Math.ceil(this.kingdomCount / 3));
        
        for (let i = 0; i < Math.min(maxTradeRoutes, capitolPairs.length); i++) {
            const pair = capitolPairs[i];
            const road = this._findRoadPath(pair.capitol1, pair.capitol2, roadCells, riverCells, nearRiverCells);
            if (road && road.length >= 2) {
                this.roads.push({
                    path: road,
                    kingdom: -1,
                    type: 'trade'
                });
                this._markRoadCells(road, roadCells);
            }
        }
    }
    
    /**
     * Remove any road that crosses through a lake cell.
     *
     * Called after the user changes lake parameters (slider) so the existing
     * road network — which was generated with the previous lake set — gets
     * cleaned up. We delete entire roads rather than truncating them because
     * a road that ends mid-wilderness looks wrong.
     *
     * Cheap operation: just walks each road's path once.
     */
    pruneRoadsAcrossLakes() {
        if (!this.roads || this.roads.length === 0) return;
        if (!this.lakeCells || this.lakeCells.size === 0) return;
        
        const lake = this.lakeCells;
        this.roads = this.roads.filter(road => {
            // road.path is an array of {x, y, cell} objects
            const path = road.path;
            if (!path) return true;
            for (const pt of path) {
                const c = (pt.cell !== undefined) ? pt.cell : pt;
                if (c >= 0 && lake.has(c)) return false;  // crosses lake — drop
            }
            return true;
        });
    }
    
    /**
     * Generate sea routes between coastal cities and capitols
     */
    _generateSeaRoutes() {
        this.seaRoutes = [];
        
        // Build set of lake cells to exclude from "coastal"
        const lakeCellSet = this.lakeCells || new Set();
        
        // Build set of ocean cells (water that's not lake)
        const oceanCells = new Set();
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL && !lakeCellSet.has(i)) {
                oceanCells.add(i);
            }
        }
        
        // Collect all settlements that border ocean (not lakes)
        const coastalSettlements = [];
        
        // Helper to check if cell borders ocean
        const bordersOcean = (cell) => {
            const neighbors = this.getNeighbors(cell);
            for (const n of neighbors) {
                if (oceanCells.has(n)) {
                    return true;
                }
            }
            return false;
        };
        
        // Check capitols
        for (let k = 0; k < this.kingdomCount; k++) {
            const capitolCell = this.capitols[k];
            if (capitolCell < 0) continue;
            
            if (bordersOcean(capitolCell)) {
                coastalSettlements.push({
                    cell: capitolCell,
                    x: this.points[capitolCell * 2],
                    y: this.points[capitolCell * 2 + 1],
                    kingdom: k,
                    type: 'capitol'
                });
            }
        }
        
        // Check cities
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            if (!city || city.cell < 0) continue;
            
            if (bordersOcean(city.cell)) {
                coastalSettlements.push({
                    cell: city.cell,
                    x: this.points[city.cell * 2],
                    y: this.points[city.cell * 2 + 1],
                    kingdom: city.kingdom,
                    type: 'city',
                    cityIndex: i
                });
            }
        }
        
        if (coastalSettlements.length < 2) return;
        
        // Find pairs of coastal settlements to connect
        const pairs = [];
        for (let i = 0; i < coastalSettlements.length; i++) {
            for (let j = i + 1; j < coastalSettlements.length; j++) {
                const s1 = coastalSettlements[i];
                const s2 = coastalSettlements[j];
                
                const dist = Math.sqrt((s1.x - s2.x) ** 2 + (s1.y - s2.y) ** 2);
                
                // Only connect settlements within reasonable sea distance and not too close
                if (dist < this.width * 0.35 && dist > 80) {
                    pairs.push({ s1, s2, dist });
                }
            }
        }
        
        // Sort by distance
        pairs.sort((a, b) => a.dist - b.dist);
        
        // Create sea routes - limit to a few routes
        const maxSeaRoutes = Math.min(4, Math.ceil(coastalSettlements.length / 3));
        const usedSettlements = new Set();
        
        for (const pair of pairs) {
            if (this.seaRoutes.length >= maxSeaRoutes) break;
            
            // Don't connect same settlement twice
            if (usedSettlements.has(pair.s1.cell) || usedSettlements.has(pair.s2.cell)) {
                continue;
            }
            
            // Find nearest ocean cells for each settlement
            const water1 = this._findNearestOceanCell(pair.s1.cell, oceanCells);
            const water2 = this._findNearestOceanCell(pair.s2.cell, oceanCells);
            
            if (water1 < 0 || water2 < 0) continue;
            
            const w1x = this.points[water1 * 2];
            const w1y = this.points[water1 * 2 + 1];
            const w2x = this.points[water2 * 2];
            const w2y = this.points[water2 * 2 + 1];
            
            // Check if path between water cells crosses land
            let crossesLand = false;
            const numChecks = 20;
            
            for (let t = 0.05; t <= 0.95; t += 0.05) {
                const checkX = w1x + (w2x - w1x) * t;
                const checkY = w1y + (w2y - w1y) * t;
                const checkCell = this.findCellWorld(checkX, checkY);
                
                if (checkCell >= 0 && this.heights[checkCell] >= ELEVATION.SEA_LEVEL) {
                    crossesLand = true;
                    break;
                }
            }
            
            if (crossesLand) continue;
            
            // Create the sea path
            const path = [
                { x: pair.s1.x, y: pair.s1.y },
                { x: w1x, y: w1y },
                { x: w2x, y: w2y },
                { x: pair.s2.x, y: pair.s2.y }
            ];
            
            this.seaRoutes.push({
                path: path,
                from: pair.s1,
                to: pair.s2
            });
            
            usedSettlements.add(pair.s1.cell);
            usedSettlements.add(pair.s2.cell);
        }
    }
    
    /**
     * Find nearest ocean cell to a land cell
     */
    _findNearestOceanCell(landCell, oceanCells) {
        const visited = new Set();
        const queue = [landCell];
        visited.add(landCell);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (oceanCells.has(current)) {
                return current;
            }
            
            const neighbors = this.getNeighbors(current);
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    visited.add(n);
                    queue.push(n);
                }
            }
            
            // Limit search
            if (visited.size > 100) break;
        }
        
        return -1;
    }
    
    /**
     * Mark cells along a road path as having roads
     */
    _markRoadCells(road, roadCells) {
        // Use the cells array if available, otherwise extract from points
        if (road.cells) {
            for (const cell of road.cells) {
                roadCells.add(cell);
            }
        } else {
            for (const point of road) {
                if (point.cell !== undefined) {
                    roadCells.add(point.cell);
                }
            }
        }
    }
    
    /**
     * Find a road path between two cells using A* pathfinding
     * Avoids water and rivers, prefers paths alongside rivers and existing roads
     */
    _findRoadPath(startCell, endCell, existingRoadCells = null, riverCells = null, nearRiverCells = null) {
        const startX = this.points[startCell * 2];
        const startY = this.points[startCell * 2 + 1];
        const endX = this.points[endCell * 2];
        const endY = this.points[endCell * 2 + 1];
        
        // Use provided river cells or empty sets
        const rivers = riverCells || new Set();
        const nearRivers = nearRiverCells || new Set();
        
        // A* pathfinding
        const openSet = new Map();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const heuristic = (cell) => {
            const x = this.points[cell * 2];
            const y = this.points[cell * 2 + 1];
            return Math.sqrt((x - endX) ** 2 + (y - endY) ** 2);
        };
        
        const getCost = (from, to) => {
            const toHeight = this.heights[to];
            
            // Water is completely impassable. Both ocean (below sea level)
            // and lakes (above sea level but flagged as water in this.lakeCells)
            // count as water for road purposes.
            if (toHeight < ELEVATION.SEA_LEVEL) return Infinity;
            if (this.lakeCells && this.lakeCells.has(to)) return Infinity;
            
            const x1 = this.points[from * 2];
            const y1 = this.points[from * 2 + 1];
            const x2 = this.points[to * 2];
            const y2 = this.points[to * 2 + 1];
            const baseDist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            
            // Rivers can be crossed but with high cost (represents bridges)
            let riverCost = 1;
            if (rivers.has(to)) {
                riverCost = 5;
            }
            
            // Elevation cost - prefer flat terrain, penalize steep climbs
            const fromHeight = this.heights[from];
            const elevDiff = Math.abs(toHeight - fromHeight);
            const elevCost = 1 + (elevDiff / 500) * 2;
            
            // High mountain penalty
            let mountainPenalty = 1;
            if (toHeight > 2500) mountainPenalty = 3;
            else if (toHeight > 2000) mountainPenalty = 2;
            else if (toHeight > 1500) mountainPenalty = 1.5;
            
            // Bonus for being near rivers (good trade routes)
            let riverBonus = 1;
            if (nearRivers.has(to)) riverBonus = 0.7;
            
            // Strong bonus for existing roads (roads merge together)
            let roadBonus = 1;
            if (existingRoadCells && existingRoadCells.has(to)) roadBonus = 0.3;
            
            return baseDist * elevCost * mountainPenalty * riverBonus * roadBonus * riverCost;
        };
        
        gScore.set(startCell, 0);
        fScore.set(startCell, heuristic(startCell));
        openSet.set(startCell, fScore.get(startCell));
        
        let iterations = 0;
        const maxIterations = 5000;
        
        while (openSet.size > 0 && iterations < maxIterations) {
            iterations++;
            
            // Get cell with lowest fScore
            let current = null;
            let lowestF = Infinity;
            for (const [cell, f] of openSet) {
                if (f < lowestF) {
                    lowestF = f;
                    current = cell;
                }
            }
            
            if (current === endCell) {
                // Reconstruct path with cell indices for road marking
                const path = [];
                const cells = [];
                let c = current;
                while (c !== undefined) {
                    path.unshift({
                        x: this.points[c * 2],
                        y: this.points[c * 2 + 1],
                        cell: c
                    });
                    cells.unshift(c);
                    c = cameFrom.get(c);
                }
                path.cells = cells; // Attach cell array to path
                return path;
            }
            
            openSet.delete(current);
            closedSet.add(current);
            
            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                if (closedSet.has(neighbor)) continue;
                
                const cost = getCost(current, neighbor);
                if (cost === Infinity) continue;
                
                const tentativeG = gScore.get(current) + cost;
                
                if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)) {
                    cameFrom.set(neighbor, current);
                    gScore.set(neighbor, tentativeG);
                    const f = tentativeG + heuristic(neighbor);
                    fScore.set(neighbor, f);
                    openSet.set(neighbor, f);
                }
            }
        }
        
        // No path found - return null (don't create a road that crosses water)
        return null;
    }
    
    /**
     * Assign colors to kingdoms using graph coloring algorithm
     * Ensures no two adjacent kingdoms share the same or similar colors
     */
    _assignKingdomColors() {
        if (!this.kingdoms || this.kingdomCount === 0) return;
        
        // Build kingdom adjacency graph
        const adjacency = new Map();
        for (let k = 0; k < this.kingdomCount; k++) {
            adjacency.set(k, new Set());
        }
        
        // Find which kingdoms border each other
        for (let i = 0; i < this.cellCount; i++) {
            const k1 = this.kingdoms[i];
            if (k1 < 0) continue;
            
            const neighbors = this.getNeighbors(i);
            for (const n of neighbors) {
                const k2 = this.kingdoms[n];
                if (k2 >= 0 && k2 !== k1) {
                    adjacency.get(k1).add(k2);
                    adjacency.get(k2).add(k1);
                }
            }
        }
        
        // Sort kingdoms by number of neighbors (most constrained first - DSATUR-like)
        const sortedKingdoms = Array.from({ length: this.kingdomCount }, (_, i) => i)
            .sort((a, b) => adjacency.get(b).size - adjacency.get(a).size);
        
        // Build the color palette to choose from. We start with POLITICAL_COLORS,
        // and if we somehow have more kingdoms than palette entries, we extend
        // with additional procedurally-generated hues so global uniqueness holds.
        const palette = POLITICAL_COLORS.slice();
        if (this.kingdomCount > palette.length) {
            // Extend palette with HSL hues filling gaps. We use the golden-ratio
            // hue offset (~137.5°) so successive new hues are maximally different.
            const extraNeeded = this.kingdomCount - palette.length;
            const goldenAngle = 137.508;
            // Start at a hue offset that doesn't collide with the existing palette
            let hue = 17;
            for (let i = 0; i < extraNeeded; i++) {
                hue = (hue + goldenAngle) % 360;
                // mid-saturation, mid-lightness so it sits with the existing palette
                const sat = 45 + ((i * 17) % 20);   // 45-65%
                const light = 55 + ((i * 11) % 15); // 55-70%
                const { r, g, b } = this._hslToRgb(hue / 360, sat / 100, light / 100);
                palette.push(`rgba(${r}, ${g}, ${b}, 0.5)`);
            }
        }
        
        const numColors = palette.length;
        
        // Track colors used globally — this is the change that guarantees
        // no two kingdoms share a color, ever.
        const globallyUsed = new Set();
        
        this.kingdomColors = new Array(this.kingdomCount).fill(-1);
        
        for (const k of sortedKingdoms) {
            // Build the set of forbidden colors for this kingdom:
            //   1. Every color already used by any other kingdom (uniqueness)
            //   2. Palette-adjacent colors of NEIGHBOURS (visual separation - softer constraint)
            const neighborAdjacentColors = new Set();
            for (const neighbor of adjacency.get(k)) {
                const nc = this.kingdomColors[neighbor];
                if (nc >= 0) {
                    neighborAdjacentColors.add((nc + 1) % numColors);
                    neighborAdjacentColors.add((nc - 1 + numColors) % numColors);
                }
            }
            
            // Pass 1: try to satisfy BOTH global uniqueness AND palette-adjacency
            let assigned = -1;
            for (let c = 0; c < numColors; c++) {
                if (globallyUsed.has(c)) continue;
                if (neighborAdjacentColors.has(c)) continue;
                assigned = c;
                break;
            }
            
            // Pass 2: relax the palette-adjacency rule, keep uniqueness.
            // Triggers when palette is mostly used up and we can't satisfy both.
            if (assigned === -1) {
                for (let c = 0; c < numColors; c++) {
                    if (!globallyUsed.has(c)) {
                        assigned = c;
                        break;
                    }
                }
            }
            
            // This should be impossible: palette was extended to >= kingdomCount.
            // But just in case, fall back to a unique-per-index value.
            if (assigned === -1) assigned = k;
            
            this.kingdomColors[k] = assigned;
            globallyUsed.add(assigned);
        }
        
        // Make the extended palette available to the renderer
        this._kingdomPalette = palette;
    }
    
    /**
     * HSL -> RGB conversion. h, s, l in [0, 1]. Returns ints 0-255.
     */
    _hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    /**
     * Calculate border costs - rivers and mountains make natural borders
     */
    _calculateBorderCosts() {
        const edgeCost = new Map();
        
        // Check if we have rivers
        const hasRivers = this.rivers && this.rivers.length > 0;
        
        // Build set of river edges for fast lookup
        const riverEdges = new Set();
        if (hasRivers) {
            for (const river of this.rivers) {
                const path = river.path;
                for (let i = 0; i < path.length - 1; i++) {
                    const c1 = path[i].cell;
                    const c2 = path[i + 1].cell;
                    const key = c1 < c2 ? `${c1}-${c2}` : `${c2}-${c1}`;
                    riverEdges.add(key);
                }
            }
        }
        
        // Calculate cost for each edge between land cells
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            
            for (const neighbor of this.voronoi.neighbors(i)) {
                if (this.heights[neighbor] < ELEVATION.SEA_LEVEL) continue;
                if (neighbor < i) continue; // Only process each edge once
                
                const key = `${i}-${neighbor}`;
                let cost = 1.0; // Base cost
                
                // River crossing - high cost (makes good border)
                if (riverEdges.has(key)) {
                    cost = 10.0;
                }
                
                // Mountain/elevation difference - medium cost
                const elevDiff = Math.abs(this.heights[i] - this.heights[neighbor]);
                if (elevDiff > 100) { // Use absolute elevation (meters)
                    cost = Math.max(cost, 3.0 + elevDiff * 0.01);
                }
                
                // High elevation (mountains) - slightly higher cost
                const avgElev = (this.heights[i] + this.heights[neighbor]) / 2;
                if (avgElev > ELEVATION.SEA_LEVEL + 800) {
                    cost = Math.max(cost, 2.0);
                }
                
                edgeCost.set(key, cost);
            }
        }
        
        return edgeCost;
    }
    
    /**
     * Smooth kingdom borders - reduce jaggedness
     */
    _smoothKingdomBorders(iterations = 3) {
        for (let iter = 0; iter < iterations; iter++) {
            const changes = [];
            
            for (let i = 0; i < this.cellCount; i++) {
                const myKingdom = this.kingdoms[i];
                if (myKingdom < 0) continue;
                
                // Count neighboring kingdoms (LAND cells only)
                const neighborCounts = new Map();
                let totalNeighbors = 0;
                
                for (const neighbor of this.voronoi.neighbors(i)) {
                    const nk = this.kingdoms[neighbor];
                    // Only count land cells with assigned kingdoms
                    if (nk >= 0 && this.heights[neighbor] >= ELEVATION.SEA_LEVEL) {
                        neighborCounts.set(nk, (neighborCounts.get(nk) || 0) + 1);
                        totalNeighbors++;
                    }
                }
                
                if (totalNeighbors === 0) continue;
                
                // If majority of neighbors are different kingdom, consider switching
                const myCount = neighborCounts.get(myKingdom) || 0;
                
                // Find most common neighbor kingdom
                let maxCount = 0;
                let dominantKingdom = myKingdom;
                for (const [kingdom, count] of neighborCounts) {
                    if (count > maxCount) {
                        maxCount = count;
                        dominantKingdom = kingdom;
                    }
                }
                
                // Switch if surrounded by other kingdom (>= 2/3 of neighbors)
                if (dominantKingdom !== myKingdom && maxCount >= totalNeighbors * 0.67) {
                    // Don't switch capitals
                    if (!this.kingdomCapitals.includes(i)) {
                        changes.push({ cell: i, newKingdom: dominantKingdom });
                    }
                }
            }
            
            // Apply changes
            for (const { cell, newKingdom } of changes) {
                this.kingdoms[cell] = newKingdom;
            }
            
            if (changes.length === 0) break;
        }
    }
    
    /**
     * Remove small exclaves - isolated cells of a kingdom
     * Reassigns disconnected cells to nearest appropriate kingdom
     */
    _removeKingdomExclaves() {
        // Limit iterations - some small exclaves are acceptable
        const maxIterations = 3;
        let iteration = 0;
        let totalRemoved = 0;
        
        while (iteration < maxIterations) {
            let removedThisPass = 0;
            
            // For each kingdom, find connected components
            for (let k = 0; k < this.kingdomCapitals.length; k++) {
                const capital = this.kingdomCapitals[k];
                if (capital < 0 || this.kingdoms[capital] !== k) continue;
                
                // BFS from capital to find main body
                // Uses head pointer instead of .shift() (which is O(N) per call)
                const mainBody = new Set();
                const queue = [capital];
                let qHead = 0;
                mainBody.add(capital);
                
                while (qHead < queue.length) {
                    const current = queue[qHead++];
                    
                    for (const neighbor of this.voronoi.neighbors(current)) {
                        if (this.kingdoms[neighbor] === k && !mainBody.has(neighbor)) {
                            mainBody.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }
                
                // Find all exclave cells (not connected to capital)
                const exclaveCells = [];
                for (let i = 0; i < this.cellCount; i++) {
                    if (this.kingdoms[i] === k && !mainBody.has(i)) {
                        exclaveCells.push(i);
                    }
                }
                
                // Reassign each exclave cell to best neighboring kingdom
                for (const i of exclaveCells) {
                    // Find most common neighboring kingdom (LAND cells only)
                    const neighborCounts = new Map();
                    for (const neighbor of this.voronoi.neighbors(i)) {
                        const nk = this.kingdoms[neighbor];
                        if (nk >= 0 && nk !== k && this.heights[neighbor] >= ELEVATION.SEA_LEVEL) {
                            neighborCounts.set(nk, (neighborCounts.get(nk) || 0) + 1);
                        }
                    }
                    
                    let maxCount = 0;
                    let bestKingdom = -1;
                    for (const [kingdom, count] of neighborCounts) {
                        if (count > maxCount) {
                            maxCount = count;
                            bestKingdom = kingdom;
                        }
                    }
                    
                    // If no land neighbors from other kingdoms, just unassign the cell
                    // (Skip expensive O(n²) nearest-cell search)
                    if (bestKingdom >= 0) {
                        this.kingdoms[i] = bestKingdom;
                        removedThisPass++;
                    }
                }
            }
            
            totalRemoved += removedThisPass;
            iteration++;
            
            // Stop if no exclaves were removed this pass
            if (removedThisPass === 0) break;
        }
        
        if (totalRemoved > 0) {
        }
    }
    
    /**
     * Select kingdom capital locations - spread across land (legacy - kept for compatibility)
     */
    _selectKingdomCapitals(landCells, count, existingCapitals = []) {
        // Shuffle land cells
        const shuffled = [...landCells];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(PRNG.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        // Minimum distance between capitals
        const totalCount = count + existingCapitals.length;
        const minDistSq = (this.width / Math.sqrt(totalCount * 2)) ** 2;
        
        const capitals = [];
        for (const cell of shuffled) {
            if (capitals.length >= count) break;
            
            const x = this.points[cell * 2];
            const y = this.points[cell * 2 + 1];
            
            // Check distance from existing capitals (both new and passed-in)
            let tooClose = false;
            
            // Check against newly selected capitals
            for (const existing of capitals) {
                const ex = this.points[existing * 2];
                const ey = this.points[existing * 2 + 1];
                const distSq = (x - ex) ** 2 + (y - ey) ** 2;
                if (distSq < minDistSq) {
                    tooClose = true;
                    break;
                }
            }
            
            // Check against passed-in existing capitals
            if (!tooClose) {
                for (const existing of existingCapitals) {
                    const ex = this.points[existing * 2];
                    const ey = this.points[existing * 2 + 1];
                    const distSq = (x - ex) ** 2 + (y - ey) ** 2;
                    if (distSq < minDistSq) {
                        tooClose = true;
                        break;
                    }
                }
            }
            
            if (!tooClose) {
                capitals.push(cell);
            }
        }
        
        // If we couldn't find enough spread capitals, just take what we can
        if (capitals.length < count) {
            for (const cell of shuffled) {
                if (capitals.length >= count) break;
                if (!capitals.includes(cell)) {
                    capitals.push(cell);
                }
            }
        }
        
        return capitals;
    }
    
    /**
     * Fill depressions using Priority-Flood algorithm
     * This ensures every land cell can drain to ocean
     */
    _fillDepressions() {
        // Priority-flood with binary heap (see _fillAllDepressions for notes
        // on why this needs to be a heap and not Array+sort).
        this.filledHeights = new Float32Array(this.heights);
        
        const heapH = new Float32Array(this.cellCount * 2);
        const heapI = new Int32Array(this.cellCount * 2);
        let heapSize = 0;
        
        const heapPush = (h, idx) => {
            let i = heapSize++;
            heapH[i] = h;
            heapI[i] = idx;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (heapH[parent] <= heapH[i]) break;
                const th = heapH[parent], ti = heapI[parent];
                heapH[parent] = heapH[i]; heapI[parent] = heapI[i];
                heapH[i] = th; heapI[i] = ti;
                i = parent;
            }
        };
        
        const heapPop = () => {
            const rootI = heapI[0];
            heapSize--;
            if (heapSize > 0) {
                heapH[0] = heapH[heapSize];
                heapI[0] = heapI[heapSize];
                let i = 0;
                const n = heapSize;
                while (true) {
                    const l = 2 * i + 1;
                    const r = 2 * i + 2;
                    let smallest = i;
                    if (l < n && heapH[l] < heapH[smallest]) smallest = l;
                    if (r < n && heapH[r] < heapH[smallest]) smallest = r;
                    if (smallest === i) break;
                    const th = heapH[smallest], ti = heapI[smallest];
                    heapH[smallest] = heapH[i]; heapI[smallest] = heapI[i];
                    heapH[i] = th; heapI[i] = ti;
                    i = smallest;
                }
            }
            return rootI;
        };
        
        const inQueue = new Uint8Array(this.cellCount);
        
        // Seed with all ocean cells
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) {
                heapPush(this.heights[i], i);
                inQueue[i] = 1;
            }
        }
        
        // Process cells in elevation order
        while (heapSize > 0) {
            const current = heapPop();
            const currentH = this.filledHeights[current];
            
            for (const neighbor of this.voronoi.neighbors(current)) {
                if (inQueue[neighbor]) continue;
                inQueue[neighbor] = 1;
                
                if (this.filledHeights[neighbor] <= currentH) {
                    this.filledHeights[neighbor] = currentH + 0.1;
                }
                
                heapPush(this.filledHeights[neighbor], neighbor);
            }
        }
    }
    
    /**
     * Select river start points from high elevations
     */
    _selectRiverStartPoints(landCells, count) {
        // Sort by FILLED elevation (highest first)
        const sorted = [...landCells].sort((a, b) => this.filledHeights[b] - this.filledHeights[a]);
        
        // Take from upper 15% of elevations for longer rivers
        const upperPortion = sorted.slice(0, Math.floor(sorted.length * 0.15));
        
        if (upperPortion.length === 0) return [];
        
        // Shuffle
        for (let i = upperPortion.length - 1; i > 0; i--) {
            const j = Math.floor(PRNG.random() * (i + 1));
            [upperPortion[i], upperPortion[j]] = [upperPortion[j], upperPortion[i]];
        }
        
        // Minimum distance between river starts
        const minDistSq = (this.width / Math.sqrt(count * 6)) ** 2;
        
        const starts = [];
        for (const cell of upperPortion) {
            if (starts.length >= count) break;
            
            const x = this.points[cell * 2];
            const y = this.points[cell * 2 + 1];
            
            let tooClose = false;
            for (const existing of starts) {
                const ex = this.points[existing * 2];
                const ey = this.points[existing * 2 + 1];
                const distSq = (x - ex) ** 2 + (y - ey) ** 2;
                if (distSq < minDistSq) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                starts.push(cell);
            }
        }
        
        return starts;
    }
    
    /**
     * Trace river using filled heights - guaranteed no loops
     * Extends one cell into ocean (will be clipped during render)
     */
    _traceRiverToOcean(startCell) {
        const path = [];
        let current = startCell;
        const visited = new Set();
        let oceanCellsAdded = 0;
        const maxOceanCells = 3; // Extend into ocean
        
        // Lake awareness: rivers should terminate at the lake shore, not flow
        // through the water surface. We treat the first lake cell encountered
        // as the terminator — we add it to the path so the rendered river
        // visually touches the shore, then stop.
        const lakeSet = this.lakeCells || new Set();
        
        // If the river somehow started inside a lake (shouldn't happen because
        // start points are upper-15% elevation), don't bother tracing.
        if (lakeSet.has(startCell)) {
            return { path: [] };
        }
        
        while (path.length < 3000) {
            const x = this.points[current * 2];
            const y = this.points[current * 2 + 1];
            const elevation = this.heights[current];
            
            const isOcean = this.heights[current] < ELEVATION.SEA_LEVEL;
            const isLake = lakeSet.has(current);
            path.push({ cell: current, x, y, elevation, isOcean });
            
            // If we just entered a lake cell, stop here. The path now has
            // exactly one lake cell at its tip, which gives the renderer a
            // clean termination point right at the shore (the lake cell
            // centroid is inside the water but the curve renderer will draw
            // up to it, visually terminating at the shoreline).
            if (isLake) break;
            
            // Track ocean cells and stop after a few
            if (isOcean) {
                oceanCellsAdded++;
                if (oceanCellsAdded >= maxOceanCells) {
                    break;
                }
            }
            
            visited.add(current);
            
            // Find lowest neighbor using FILLED heights (or regular for ocean)
            let bestNeighbor = -1;
            let bestElevation = Infinity;
            
            for (const n of this.voronoi.neighbors(current)) {
                if (visited.has(n)) continue;
                const nElev = this.filledHeights ? this.filledHeights[n] : this.heights[n];
                if (nElev < bestElevation) {
                    bestElevation = nElev;
                    bestNeighbor = n;
                }
            }
            
            if (bestNeighbor < 0) {
                break;
            }
            
            current = bestNeighbor;
        }
        
        return { path };
    }
    
    /**
     * Generate names for all rivers
     */
    _generateRiverNames() {
        if (!this.rivers || this.rivers.length === 0) return;
        
        // Generate unique river names
        const riverNames = this.nameGenerator.generateNames(this.rivers.length, 'river');
        
        // Assign names to rivers, prioritizing longer rivers
        const sortedIndices = this.rivers
            .map((r, i) => ({ index: i, length: r.path.length }))
            .sort((a, b) => b.length - a.length)
            .map(r => r.index);
        
        for (let i = 0; i < sortedIndices.length; i++) {
            const riverIndex = sortedIndices[i];
            this.rivers[riverIndex].name = riverNames[i];
            
            // Calculate midpoint for label placement
            const path = this.rivers[riverIndex].path;
            const midIndex = Math.floor(path.length / 2);
            this.rivers[riverIndex].labelPoint = path[midIndex];
            
            // Calculate angle at midpoint for text rotation
            if (midIndex > 0 && midIndex < path.length - 1) {
                const prev = path[midIndex - 1];
                const next = path[midIndex + 1];
                const dx = next.x - prev.x;
                const dy = next.y - prev.y;
                let angle = Math.atan2(dy, dx);
                // Normalize angle so text is never upside down
                if (angle > Math.PI / 2) angle -= Math.PI;
                if (angle < -Math.PI / 2) angle += Math.PI;
                this.rivers[riverIndex].labelAngle = angle;
            } else {
                this.rivers[riverIndex].labelAngle = 0;
            }
        }
    }
    
    /**
     * Carve a river into the heightmap
     */
    _carveRiver(river, depth) {
        for (const point of river.path) {
            if (point.cell < 0) continue;
            if (this.heights[point.cell] < ELEVATION.SEA_LEVEL) continue;  // Don't carve ocean
            if (this.lakeCells && this.lakeCells.has(point.cell)) continue;  // Don't carve lakes
            
            // Carve depth based on flow (more flow = deeper carving)
            const flowFactor = Math.min(2, 1 + point.flow);
            const carveAmount = depth * flowFactor;
            this.heights[point.cell] -= carveAmount;
        }
    }
    
    /**
     * Fill inland seas - convert ocean cells not connected to map edge to land
     */
    _fillInlandSeas() {
        const edgeConnected = new Set();
        const queue = [];
        
        // Find edge ocean cells
        const margin = 10;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] >= ELEVATION.SEA_LEVEL) continue;
            
            const x = this.points[i * 2];
            const y = this.points[i * 2 + 1];
            
            if (x < margin || x > this.width - margin || 
                y < margin || y > this.height - margin) {
                queue.push(i);
                edgeConnected.add(i);
            }
        }
        
        // BFS to find all ocean connected to edge (head pointer, no .shift())
        let qHead = 0;
        while (qHead < queue.length) {
            const current = queue[qHead++];
            
            for (const n of this.voronoi.neighbors(current)) {
                if (edgeConnected.has(n)) continue;
                if (this.heights[n] >= ELEVATION.SEA_LEVEL) continue;
                
                edgeConnected.add(n);
                queue.push(n);
            }
        }
        
        // Convert inland seas to low land
        let filledCount = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL && !edgeConnected.has(i)) {
                this.heights[i] = 50 + Math.random() * 100;
                this.terrain[i] = 1;
                filledCount++;
            }
        }
        
        if (filledCount > 0) {
        }
    }
    
    /**
     * Generate rivers based on terrain and precipitation
     * Water flows downhill, accumulating into rivers and lakes
     */
    generateRivers(options = {}) {
        if (!this.heights || !this.precipitation || this.cellCount === 0) {
            console.warn('Need heightmap and precipitation to generate rivers');
            return;
        }
        
        const {
            flowThreshold = 0.02,      // Minimum flow to be considered a river
            lakeThreshold = 0.005,     // Minimum flow to form a lake
            minRiverLength = 3         // Minimum cells for a river
        } = options;
        
        // Calculate drainage if not already done
        if (!this.drainage) {
            this.calculateDrainage();
        }
        
        // Initialize flow array
        this.riverFlow = new Float32Array(this.cellCount);
        this.rivers = [];
        
        // Accumulate flow - process cells from high to low elevation
        const sortedCells = [];
        for (let i = 0; i < this.cellCount; i++) {
            sortedCells.push({ index: i, elevation: this.heights[i] });
        }
        sortedCells.sort((a, b) => b.elevation - a.elevation);
        
        // Each cell starts with precipitation as its initial water
        for (let i = 0; i < this.cellCount; i++) {
            this.riverFlow[i] = this.precipitation[i] * 0.1;
        }
        
        // Flow accumulation - process from highest to lowest
        for (const { index: i } of sortedCells) {
            const drainTo = this.drainage[i];
            if (drainTo >= 0 && drainTo < this.cellCount) {
                this.riverFlow[drainTo] += this.riverFlow[i];
            }
        }
        
        // Extract river paths from high-flow cells
        const visited = new Set();
        const riverStarts = [];
        
        // Find cells with high flow that aren't already part of a river
        for (let i = 0; i < this.cellCount; i++) {
            if (this.riverFlow[i] >= flowThreshold && 
                this.heights[i] >= ELEVATION.SEA_LEVEL &&
                !visited.has(i)) {
                riverStarts.push(i);
            }
        }
        
        // Sort by flow descending to trace main rivers first
        riverStarts.sort((a, b) => this.riverFlow[b] - this.riverFlow[a]);
        
        // Trace each river
        for (const start of riverStarts) {
            if (visited.has(start)) continue;
            
            const river = this._traceRiver(start, visited, flowThreshold);
            if (river.path.length >= minRiverLength) {
                this.rivers.push(river);
            }
        }
        
        this.render();
        return { rivers: this.rivers.length, lakes: this.lakes.length };
    }
    
    /**
     * Create a lake using simple flood fill
     * Expand from depression to all connected cells within an elevation band
     */
    _createLake(startCell, processed, minLakeDepth = 30, maxLakeSize = 100) {
        const startElevation = this.heights[startCell];
        
        // Find all contiguous cells that could be part of this lake's basin
        // A cell is in the basin if we can reach it by only going through cells 
        // that are below a rising "water level"
        
        const basin = new Set([startCell]);
        const queue = [startCell];
        let waterLevel = startElevation;
        
        // Track the rim (cells adjacent to basin but not in basin)
        const rim = new Map(); // cell -> elevation
        
        // Initialize rim with neighbors
        for (const n of this.voronoi.neighbors(startCell)) {
            const nElev = this.heights[n];
            if (nElev < ELEVATION.SEA_LEVEL) {
                processed.add(startCell);
                return null;
            }
            rim.set(n, nElev);
        }
        
        // Expand basin by adding the lowest rim cell if it would be flooded
        while (rim.size > 0 && basin.size < maxLakeSize) {
            // Find lowest rim cell
            let lowestRimCell = null;
            let lowestRimElev = Infinity;
            for (const [cell, elev] of rim) {
                if (elev < lowestRimElev) {
                    lowestRimElev = elev;
                    lowestRimCell = cell;
                }
            }
            
            if (lowestRimCell === null) break;
            
            // Water rises to reach this cell
            // If it has to rise too much (> 200m above start), stop
            if (lowestRimElev > startElevation + 200) break;
            
            // Add to basin
            rim.delete(lowestRimCell);
            basin.add(lowestRimCell);
            waterLevel = Math.max(waterLevel, lowestRimElev);
            
            // Add its neighbors to rim
            for (const n of this.voronoi.neighbors(lowestRimCell)) {
                if (basin.has(n) || rim.has(n)) continue;
                const nElev = this.heights[n];
                if (nElev < ELEVATION.SEA_LEVEL) {
                    // Hit ocean
                    for (const c of basin) processed.add(c);
                    return null;
                }
                rim.set(n, nElev);
            }
        }
        
        // Mark basin as processed
        for (const c of basin) processed.add(c);
        
        // Spill point is lowest remaining rim cell
        let spillElevation = Infinity;
        let spillCell = -1;
        for (const [cell, elev] of rim) {
            if (elev < spillElevation) {
                spillElevation = elev;
                spillCell = cell;
            }
        }
        
        // If no rim left, check neighbors of basin
        if (spillCell < 0) {
            for (const cell of basin) {
                for (const n of this.voronoi.neighbors(cell)) {
                    if (basin.has(n)) continue;
                    const nElev = this.heights[n];
                    if (nElev >= ELEVATION.SEA_LEVEL && nElev < spillElevation) {
                        spillElevation = nElev;
                        spillCell = n;
                    }
                }
            }
        }
        
        if (spillCell < 0 || spillElevation === Infinity) return null;
        
        // Find lowest elevation in basin
        let lowestElevation = Infinity;
        for (const c of basin) {
            if (this.heights[c] < lowestElevation) {
                lowestElevation = this.heights[c];
            }
        }
        
        // Calculate depth
        const depth = spillElevation - lowestElevation;
        
        if (depth < minLakeDepth) return null;
        
        // Lake cells = basin cells below spill elevation
        const lakeCells = [];
        for (const c of basin) {
            if (this.heights[c] < spillElevation) {
                lakeCells.push(c);
            }
        }
        
        // Limit size
        if (lakeCells.length > maxLakeSize) {
            lakeCells.sort((a, b) => this.heights[a] - this.heights[b]);
            lakeCells.length = maxLakeSize;
        }
        
        // Reject lakes that are too small to read as proper lakes — single-cell
        // and 2-cell "lakes" produce visual noise (hundreds of tiny patches).
        // A real lake should be at least 3 cells.
        if (lakeCells.length < 3) return null;
        
        // Reject "wetland" lakes — basins that look like a swarm of disconnected
        // patches rather than a coherent body of water. This happens in shallow
        // valleys where the basin is large but only some cells dip below the
        // spill level, producing a fragmented multi-blob shape (the famous
        // swamp-pattern bug).
        //
        // Two checks:
        //   (1) Connectivity: the lake cells should form ONE connected component
        //       (allowing minor fragmentation up to 20% of cells in side-blobs).
        //   (2) Density: the bounding box of the lake cells should be at least
        //       50% lake — otherwise the lake is a sparse string through a
        //       larger area.
        const lakeSet = new Set(lakeCells);
        
        // BFS from the lowest cell to find the largest connected component
        let lowest = lakeCells[0];
        for (const c of lakeCells) {
            if (this.heights[c] < this.heights[lowest]) lowest = c;
        }
        const visited = new Set([lowest]);
        const ccQueue = [lowest];
        let ccHead = 0;
        while (ccHead < ccQueue.length) {
            const cur = ccQueue[ccHead++];
            for (const n of this.voronoi.neighbors(cur)) {
                if (lakeSet.has(n) && !visited.has(n)) {
                    visited.add(n);
                    ccQueue.push(n);
                }
            }
        }
        // If the largest connected component is less than 80% of the lake,
        // this is a fragmented mess — reject.
        if (visited.size < lakeCells.length * 0.8) return null;
        
        // Density check: bounding box of lake cells, count what fraction is lake.
        // Sparse strings of cells through a large bbox = swamp pattern.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const c of lakeCells) {
            const x = this.points[c * 2], y = this.points[c * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const bboxArea = Math.max(1, (maxX - minX) * (maxY - minY));
        // Each cell occupies roughly (mapArea / cellCount) of area
        const cellArea = (this.width * this.height) / this.cellCount;
        const lakeArea = lakeCells.length * cellArea;
        const density = lakeArea / bboxArea;
        // If lake takes up less than 35% of its bbox, it's spread too thin.
        if (density < 0.35) return null;
        
        // Check not adjacent to ocean
        for (const cell of lakeCells) {
            for (const n of this.voronoi.neighbors(cell)) {
                if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                    return null;
                }
            }
        }
        
        // Check for internal islands - reject lakes with too many
        // (lakeSet was already declared above for the connectivity check; reuse it)
        let islandCells = 0;
        for (const cell of lakeCells) {
            for (const n of this.voronoi.neighbors(cell)) {
                if (lakeSet.has(n)) continue;
                // This neighbor is not in lake - check if it's surrounded by lake
                const nNeighbors = Array.from(this.voronoi.neighbors(n));
                let surroundedByLake = true;
                for (const nn of nNeighbors) {
                    if (!lakeSet.has(nn) && this.heights[nn] >= ELEVATION.SEA_LEVEL) {
                        surroundedByLake = false;
                        break;
                    }
                }
                if (surroundedByLake) {
                    islandCells++;
                }
            }
        }
        
        // Reject if more than 2 island cells or more than 10% of lake is islands
        if (islandCells > 2 || (islandCells > 0 && islandCells / lakeCells.length > 0.1)) {
            return null;
        }
        
        // Perimeter-complexity check: count how many border edges the lake has.
        // A clean round lake has ~2-3 border edges per cell. A jagged lake with
        // many peninsulas has 4+. High ratio = the lake silhouette is messy
        // and will look like a swamp when rendered, with confusing inner outlines
        // around every peninsula reaching into the water.
        let borderEdgeCount = 0;
        for (const cell of lakeCells) {
            const cellPoly = this.voronoi.cellPolygon(cell);
            if (!cellPoly) continue;
            const neighbors = Array.from(this.voronoi.neighbors(cell));
            for (let e = 0; e < cellPoly.length - 1; e++) {
                const v1 = cellPoly[e], v2 = cellPoly[e + 1];
                const midX = (v1[0] + v2[0]) / 2, midY = (v1[1] + v2[1]) / 2;
                let nearest = -1, nearestD = Infinity;
                for (const n of neighbors) {
                    const nx = this.points[n * 2], ny = this.points[n * 2 + 1];
                    const d2 = (nx - midX) ** 2 + (ny - midY) ** 2;
                    if (d2 < nearestD) { nearestD = d2; nearest = n; }
                }
                if (nearest < 0 || !lakeSet.has(nearest)) borderEdgeCount++;
            }
        }
        const edgesPerCell = borderEdgeCount / lakeCells.length;
        // A "round" lake has ~2.5 edges per cell. We allow up to 3.5 before
        // rejecting — anything higher is a fingered/jagged silhouette that
        // will look bad in render.
        if (edgesPerCell > 3.5) return null;
        
        // Update drainage for lake cells to point to spillCell
        for (const cell of lakeCells) {
            this.drainage[cell] = spillCell;
        }
        
        // CRITICAL: Update spillCell's drainage to point AWAY from lake
        // The spillCell might currently drain into the lake, which is wrong
        let bestOutflow = -1;
        let lowestOutflowElev = Infinity;
        for (const n of this.voronoi.neighbors(spillCell)) {
            if (lakeSet.has(n)) continue; // Skip lake cells
            const nElev = this.heights[n];
            if (nElev < lowestOutflowElev) {
                lowestOutflowElev = nElev;
                bestOutflow = n;
            }
        }
        
        if (bestOutflow >= 0) {
            this.drainage[spillCell] = bestOutflow;
        }
        
        return {
            cells: lakeCells,
            surfaceElevation: spillElevation,
            lowestElevation: lowestElevation,
            depth: depth,
            outlet: spillCell
        };
    }
    
    /**
     * Detect endorheic basins and river-fed lakes, populate them as lakes,
     * and update drainage so rivers flow into them.
     *
     * Must run BEFORE the river tracing (in calculateDrainage). Strategy:
     *
     *   1. Pre-fill: don't. We *want* depressions for endorheic detection.
     *   2. Find every land cell that's lower than ALL its neighbours — those
     *      are pit candidates. Each pit may seed a lake basin.
     *   3. For each pit, run _createLake. It returns a lake or null.
     *   4. ALSO scan rivers (after they're computed) and look for cells where
     *      flow accumulates but the slope is near-flat — those become river-fed
     *      lakes.
     *
     * Settings come from this.lakeOptions (set by the caller):
     *   density:   0..1   how many candidate basins to convert (1 = all)
     *   minDepth:  meters lake basin must drop this much below spill
     *   maxSize:   cells  cap on lake size
     *
     * Populates: this.lakes, this.lakeCells, this.lakeDepths
     */
    detectEndorheicLakes(options = {}) {
        if (!this.heights || !this.voronoi) return [];
        
        const {
            density = 0.6,
            minDepth = 30,
            maxSize = 80
        } = options;
        
        // Find all pit cells: land cells that are significantly below their
        // lowest neighbour (otherwise micro-pits from coastal noise create
        // hundreds of tiny "lakes"). Lowest-neighbour drop must exceed pitDrop
        // for the cell to qualify.
        const pitDrop = 25;  // meters; pit must be at least this much below lowest neighbour
        const pitCandidates = [];
        for (let i = 0; i < this.cellCount; i++) {
            if (this.heights[i] < ELEVATION.SEA_LEVEL) continue;
            
            const myH = this.heights[i];
            let lowestNeighbourH = Infinity;
            let touchesOcean = false;
            
            for (const n of this.voronoi.neighbors(i)) {
                if (this.heights[n] < ELEVATION.SEA_LEVEL) {
                    touchesOcean = true;
                    break;
                }
                if (this.heights[n] < lowestNeighbourH) {
                    lowestNeighbourH = this.heights[n];
                }
            }
            
            if (touchesOcean) continue;          // coastal — not a basin
            if (lowestNeighbourH === Infinity) continue;  // weird (no neighbours?)
            if (lowestNeighbourH - myH < pitDrop) continue;  // not deep enough
            
            pitCandidates.push({ cell: i, elevation: myH });
        }
        
        // Sort pits by elevation, deepest first — these become the most
        // dramatic lakes (e.g. Caspian Sea is at -28m, lower than ocean)
        pitCandidates.sort((a, b) => a.elevation - b.elevation);
        
        // Convert a fraction based on density slider
        const targetCount = Math.ceil(pitCandidates.length * density);
        const selected = pitCandidates.slice(0, targetCount);
        
        // Build lakes
        const processed = new Set();
        const generated = [];
        
        // Spatial exclusion zone: after we successfully form a lake, mark all
        // cells within `exclusionRadius` BFS hops as "processed" so no other
        // pit nearby can form a *separate* lake. Without this, a continuous
        // marshy depression with many local pits gets fragmented into dozens
        // of tiny disconnected "lakes" because each pit's basin-fill terminates
        // when it bumps into a neighbouring lake's already-processed cells.
        // 4 cells is enough to suppress the swamp-pattern seen in low river
        // valleys without killing legitimate lakes that just happen to be
        // close to each other.
        const exclusionRadius = 4;
        const expandExclusion = (lake) => {
            // BFS outward from lake cells, marking cells as processed up to
            // exclusionRadius hops away.
            let frontier = Array.from(lake.cells);
            for (const c of frontier) processed.add(c);
            
            for (let r = 0; r < exclusionRadius; r++) {
                const next = [];
                for (const c of frontier) {
                    for (const n of this.voronoi.neighbors(c)) {
                        if (processed.has(n)) continue;
                        // Don't expand exclusion across ocean — only across land
                        if (this.heights[n] < ELEVATION.SEA_LEVEL) continue;
                        processed.add(n);
                        next.push(n);
                    }
                }
                frontier = next;
                if (frontier.length === 0) break;
            }
        };
        
        for (const { cell } of selected) {
            if (processed.has(cell)) continue;
            const lake = this._createLake(cell, processed, minDepth, maxSize);
            if (lake) {
                generated.push(lake);
                expandExclusion(lake);
            }
        }
        
        return generated;
    }
    
    /**
     * Detect river-fed lakes: along major river paths, find segments where
     * flow accumulates but the local terrain is unusually flat. Convert those
     * into lakes (the river fills a basin and overflows downstream).
     *
     * Must run AFTER river tracing has populated this.rivers and this.riverFlow.
     */
    detectRiverFedLakes(options = {}) {
        if (!this.rivers || !this.riverFlow) return [];
        
        const {
            density = 0.4,
            minDepth = 25,
            maxSize = 60,
            flowThresholdRel = 0.10   // only consider rivers in top 10% of flow
        } = options;
        
        if (this.rivers.length === 0) return [];
        
        // Determine flow threshold from highest river
        let maxFlow = 0;
        for (const r of this.rivers) {
            if (r.flow > maxFlow) maxFlow = r.flow;
        }
        const flowMin = maxFlow * flowThresholdRel;
        
        // Pick candidate cells along major rivers where the slope is shallow
        const processed = new Set();
        // Mark already-existing lake cells as processed so we don't overlap
        if (this.lakeCells) {
            for (const c of this.lakeCells) processed.add(c);
        }
        
        const candidates = [];
        for (const river of this.rivers) {
            if (river.flow < flowMin) continue;
            const path = river.path;
            if (!path || path.length < 5) continue;
            
            // Walk path looking for flat segments
            for (let i = 1; i < path.length - 1; i++) {
                const cell = (path[i].cell !== undefined) ? path[i].cell : path[i];
                if (cell < 0) continue;
                if (processed.has(cell)) continue;
                
                const prevCell = (path[i-1].cell !== undefined) ? path[i-1].cell : path[i-1];
                const nextCell = (path[i+1].cell !== undefined) ? path[i+1].cell : path[i+1];
                
                const slope = Math.abs(this.heights[prevCell] - this.heights[nextCell]);
                
                // Flat enough that water would pool (less than 15m drop over 2 cells)
                if (slope < 15 && this.heights[cell] >= ELEVATION.SEA_LEVEL + 20) {
                    candidates.push({ cell, flow: this.riverFlow[cell] || 1 });
                }
            }
        }
        
        // Sort by flow descending — biggest rivers get priority for lake-formation
        candidates.sort((a, b) => b.flow - a.flow);
        
        // Subsample by density
        const targetCount = Math.ceil(candidates.length * density);
        const selected = candidates.slice(0, targetCount);
        
        // Same spatial exclusion as endorheic: don't let a continuous flat
        // river valley spawn a chain of fragmented "lakes". After we form
        // one lake along a river, suppress new ones within a few cells.
        const exclusionRadius = 5;  // bigger for rivers because valleys are linear
        const expandExclusion = (lake) => {
            let frontier = Array.from(lake.cells);
            for (const c of frontier) processed.add(c);
            for (let r = 0; r < exclusionRadius; r++) {
                const next = [];
                for (const c of frontier) {
                    for (const n of this.voronoi.neighbors(c)) {
                        if (processed.has(n)) continue;
                        if (this.heights[n] < ELEVATION.SEA_LEVEL) continue;
                        processed.add(n);
                        next.push(n);
                    }
                }
                frontier = next;
                if (frontier.length === 0) break;
            }
        };
        
        const generated = [];
        for (const { cell } of selected) {
            if (processed.has(cell)) continue;
            // For river-fed lakes we accept smaller depth requirements
            const lake = this._createLake(cell, processed, minDepth, maxSize);
            if (lake) {
                generated.push(lake);
                expandExclusion(lake);
            }
        }
        
        return generated;
    }
    
    /**
     * High-level entry point: generate ALL lakes and integrate them with the
     * world state.
     *
     * Call AFTER drainage but BEFORE kingdoms (so kingdoms see lake cells in
     * their edge-cost calculations).
     *
     * @param {Object} options
     *   density       - 0..1 lake count multiplier
     *   minDepth      - 0..1 normalized; small (more lakes) to large (fewer, deeper)
     *   maxSize       - cells per lake (caps individual lake size)
     */
    generateLakes(options = {}) {
        if (!this.heights || !this.voronoi) return;
        
        // Reset lake state
        this.lakes = [];
        this.lakeCells = new Set();
        this.lakeDepths = new Map();
        
        const density = Math.max(0, Math.min(1, options.density ?? 0.5));
        if (density === 0) return;
        
        // minDepth slider value 0..1 maps to actual depth threshold in meters.
        // Low slider = lots of small shallow lakes (15m). High slider = few
        // big deep lakes (120m).
        const sliderDepth = Math.max(0, Math.min(1, options.minDepth ?? 0.3));
        const minDepthMeters = 15 + sliderDepth * 105;
        
        // maxSize: similar mapping. Slider 0 -> 30 cells, slider 1 -> 200 cells.
        const sliderSize = Math.max(0, Math.min(1, options.minDepth ?? 0.3));
        const maxSizeCells = Math.round(30 + sliderSize * 170);
        
        // Phase A: endorheic basins
        const endorheic = this.detectEndorheicLakes({
            density,
            minDepth: minDepthMeters,
            maxSize: maxSizeCells
        });
        for (const lake of endorheic) lake.type = 'endorheic';
        
        // Phase B: river-fed lakes
        // Need to populate this.lakeCells before river-fed pass so it doesn't
        // overlap with endorheic ones already created
        for (const lake of endorheic) {
            for (const c of lake.cells) this.lakeCells.add(c);
        }
        
        const riverFed = this.detectRiverFedLakes({
            density: density * 0.7,   // a bit fewer river-fed than endorheic
            minDepth: minDepthMeters * 0.8,
            maxSize: Math.round(maxSizeCells * 0.8)
        });
        for (const lake of riverFed) lake.type = 'river-fed';
        
        // Combine
        const allLakes = [...endorheic, ...riverFed];
        
        // Name each lake
        if (this.nameGenerator && typeof this.nameGenerator.generateLakeName === 'function') {
            for (const lake of allLakes) {
                lake.name = this.nameGenerator.generateLakeName();
            }
        }
        
        // Populate generator state
        this.lakes = allLakes;
        for (const lake of allLakes) {
            for (const cell of lake.cells) {
                this.lakeCells.add(cell);
                // Store water depth at this cell
                this.lakeDepths.set(cell, lake.surfaceElevation - this.heights[cell]);
            }
        }
        
        // Invalidate caches that depend on lake/water layout
        this._coastlineCache = null;
        this._contourCache = null;
        if (this.tileCache) this.tileCache.invalidate();
    }
    
    /**
     * Trace a river from start cell to ocean/lake
     */
    _traceRiver(start, visited, threshold) {
        const path = [];
        let current = start;
        let totalFlow = 0;
        
        while (current >= 0 && !visited.has(current)) {
            // Only include cells with significant flow
            if (this.riverFlow[current] >= threshold * 0.5) {
                path.push(current);
                visited.add(current);
                totalFlow += this.riverFlow[current];
            }
            
            // Stop if we reach ocean
            if (this.heights[current] < ELEVATION.SEA_LEVEL) {
                break;
            }
            
            current = this.drainage[current];
            
            // Prevent infinite loops
            if (path.length > 1000) break;
        }
        
        return {
            path: path,
            flow: totalFlow / Math.max(1, path.length)
        };
    }
    
    /**
     * Get color for precipitation value (0-1)
     * Red (dry) to Blue (wet)
     */
    _getPrecipitationColor(precip) {
        // Handle NaN or undefined
        if (precip === undefined || precip === null || isNaN(precip)) {
            return PRECIP_COLORS[0]; // Return dry color as fallback
        }
        const t = Math.max(0, Math.min(1, precip));
        const index = Math.min(PRECIP_COLORS.length - 1, Math.floor(t * (PRECIP_COLORS.length - 1)));
        return PRECIP_COLORS[index];
    }
    
    /**
     * Smooth interpolation
     */
    _smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
    
    /**
     * Apply a world-shape mask to the noise height value.
     *
     * Returns the modified height. The mask is applied via a
     * (multiplier, additive bias) pair so that some presets can SUPPRESS
     * land (oceans/falloff) while others RAISE it (continents, peninsulas).
     *
     * Coordinates: nx, ny are normalized in [0, 1] across the map.
     * h is the current noise value in [0, 1].
     *
     * @param {number} h        - current height in [0,1]
     * @param {number} x        - cell world x
     * @param {number} y        - cell world y
     * @param {string} preset   - mask preset name
     * @param {number} strength - 0..1, how strongly the mask applies
     * @returns {number} new height in [0,1]
     */
    _applyWorldMask(h, x, y, preset, strength) {
        if (preset === 'none' || strength <= 0) return h;
        
        const cx = this.width / 2;
        const cy = this.height / 2;
        const dx = (x - cx) / cx;        // normalized -1..1 from center
        const dy = (y - cy) / cy;
        const nx = x / this.width;       // 0..1
        const ny = y / this.height;
        
        // Each branch computes (mult, add).
        //   final = h * mult + add, then clamped to [0,1]
        // strength=0 should be a no-op, strength=1 = preset's natural strength.
        let mult = 1;
        let add  = 0;
        
        switch (preset) {
            // ---- Basic edge falloffs (kept for compatibility) ----
            case 'radial': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const f = this._smoothstep(0.3, 1.0, dist);
                mult = 1 - f * strength;
                break;
            }
            case 'square': {
                const f = this._smoothstep(0.4, 1.0, Math.max(Math.abs(dx), Math.abs(dy)));
                mult = 1 - f * strength;
                break;
            }
            
            // ---- Continental: one big landmass with ocean on the edges ----
            // Soft radial falloff that only kicks in near the very edge,
            // plus a small additive bias toward center so the middle reliably
            // becomes land regardless of seaLevel.
            case 'continental': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const f = this._smoothstep(0.55, 1.05, dist);
                mult = 1 - f * strength;
                add  = (1 - this._smoothstep(0.0, 0.6, dist)) * 0.10 * strength;
                break;
            }
            
            // ---- Archipelago: noise-driven scattered islands ----
            // Use a low-frequency noise field as a "land probability" mask.
            // Noise above threshold -> island cluster; below -> ocean. Adds a
            // gentle global edge falloff so islands don't bleed off the map.
            case 'archipelago': {
                // 2 layers of low-freq noise to break up the pattern
                const a = Noise.simplex2(nx * 2.5 + 17.3, ny * 2.5 + 31.7);
                const b = Noise.simplex2(nx * 5.0 - 11.1, ny * 5.0 + 7.9) * 0.4;
                const islandField = (a + b) * 0.7;     // -1..1ish
                
                // Map noise to a mask: only the highest peaks become land
                // Lower this threshold to get more/larger islands
                const threshold = 0.15;
                let m = this._smoothstep(threshold - 0.25, threshold + 0.25, islandField);
                
                // Soft global edge so islands fade near borders
                const dist = Math.sqrt(dx * dx + dy * dy);
                const edge = 1 - this._smoothstep(0.7, 1.05, dist);
                m *= edge;
                
                // Suppress everything not inside an island (m near 0)
                // Strong suppression so we get clear sea between islands
                mult = 1 - (1 - m) * strength * 0.95;
                break;
            }
            
            // ---- Two continents separated by a sea ----
            // Suppress land in a vertical band running through the middle
            // (with noisy edges for natural-looking coastlines on both sides).
            case 'two-continents': {
                // Noisy seam around x=0
                const seam = Noise.simplex2(ny * 3.0, 5.7) * 0.12;
                const seaCenterX = 0 + seam;
                const distFromSeam = Math.abs(dx - seaCenterX);
                
                // Sea is widest near vertical center (lozenge-shaped)
                const verticalBias = 1 - Math.abs(dy) * 0.4;
                const seaWidth = 0.22 * verticalBias;
                
                // Mask: 0 inside sea, 1 outside
                const seaMask = this._smoothstep(seaWidth, seaWidth + 0.18, distFromSeam);
                
                // Plus a soft global edge falloff so continents don't run off
                const dist = Math.sqrt(dx * dx + dy * dy);
                const edge = 1 - this._smoothstep(0.65, 1.05, dist);
                
                mult = 1 - (1 - seaMask * edge) * strength;
                // Add bias to centers of each continent so they're solidly land
                if (seaMask > 0.5) {
                    const continentBias = (seaMask - 0.5) * 0.15 * strength;
                    add = continentBias * edge;
                }
                break;
            }
            
            // ---- Pangaea: huge continent, inland seas carved out ----
            // Big continental mass via additive bias, plus low-freq noise that
            // carves out a few inland seas inside it.
            case 'pangaea': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const edge = this._smoothstep(0.7, 1.1, dist);
                
                // Strong upward push everywhere except near the rim
                add = (1 - edge) * 0.18 * strength;
                
                // Carve inland seas with low-freq noise (only inside the continent)
                const seaNoise = Noise.simplex2(nx * 3.5 + 42.1, ny * 3.5 - 13.6);
                const seaMask = this._smoothstep(0.45, 0.7, seaNoise);  // 0..1, 1 = sea
                add -= seaMask * 0.25 * strength * (1 - edge);
                
                // Edge taper to ocean
                mult = 1 - edge * strength * 0.9;
                break;
            }
            
            // ---- Coastal: land on one side, ocean on the other ----
            // Diagonal coastline with noisy edge.
            case 'coastal': {
                // Direction vector for the coast (top-left to bottom-right)
                // Pick angle from seed-derived noise so coastlines vary
                const angle = Math.PI * 0.25;  // 45deg, NW->SE
                const ax = Math.cos(angle), ay = Math.sin(angle);
                
                // Signed distance along coastal axis: -1 (deep sea) .. +1 (deep land)
                let coastDist = dx * ax + dy * ay;
                
                // Add a noisy wobble to break up the straight line
                coastDist += Noise.simplex2(nx * 4.0, ny * 4.0) * 0.20;
                
                // Smoothly transition: -0.1 -> ocean, +0.1 -> land
                const landMask = this._smoothstep(-0.15, 0.15, coastDist);
                
                mult = 1 - (1 - landMask) * strength;
                add  = landMask * 0.12 * strength;  // bias inland
                break;
            }
            
            // ---- Inland sea: ring of land around central ocean ----
            // Inverted radial: low in center (sea), high on a mid-radius ring,
            // tapering back down at the outer edge.
            case 'inland-sea': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Central depression: 0 at center, 1 by mid-radius
                const centerDip = this._smoothstep(0.15, 0.55, dist);
                
                // Outer falloff: 1 at mid-radius, 0 at edge
                const outerFade = 1 - this._smoothstep(0.65, 1.05, dist);
                
                // Ring mask: high on the donut, low at center & edge
                const ring = centerDip * outerFade;
                
                // Wobble the inner coast a bit
                const wobble = Noise.simplex2(nx * 4.5, ny * 4.5) * 0.08;
                
                mult = (1 - strength) + ring * strength;
                add  = (ring * 0.18 + wobble * ring) * strength;
                break;
            }
            
            // ---- Lake world: lots of land, scattered inland lakes/seas ----
            // Like Pangaea but bigger landmass and many small "lake holes".
            case 'lake-world': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const edge = this._smoothstep(0.85, 1.1, dist);   // very soft edge
                
                // Strong land bias almost everywhere
                add = (1 - edge) * 0.20 * strength;
                
                // High-frequency carve-outs for lakes (smaller features than pangaea)
                const lakeNoise = Noise.simplex2(nx * 8.0 + 99.1, ny * 8.0 + 23.5);
                const lakeMask = this._smoothstep(0.55, 0.78, lakeNoise);
                add -= lakeMask * 0.30 * strength * (1 - edge);
                
                mult = 1 - edge * strength;
                break;
            }
            
            // ---- Peninsulas & Fjords: heavily eroded coastline ----
            // Continental base, but multiplied by high-freq directional noise
            // to create lots of fingers and bays along the coast.
            case 'peninsula': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const baseFalloff = this._smoothstep(0.5, 1.0, dist);
                
                // High-freq noise to break up the coastline into fingers
                const fjordNoise = (Noise.simplex2(nx * 12.0, ny * 12.0) +
                                    Noise.simplex2(nx * 24.0 + 5.3, ny * 24.0 + 7.7) * 0.5) / 1.5;
                
                // Only apply fjord noise where we're near the coast (not deep inland or far at sea)
                const coastWeight = 4 * baseFalloff * (1 - baseFalloff);  // peaks at 0.5
                const carve = fjordNoise * coastWeight * 0.35;
                
                mult = 1 - (baseFalloff + carve) * strength;
                add  = (1 - this._smoothstep(0.0, 0.4, dist)) * 0.08 * strength;
                break;
            }
            
            // ---- Atoll / Ring island: thin ring with central lagoon ----
            case 'atoll': {
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Ring centered at radius 0.5, narrow
                const ringRadius = 0.5;
                const ringWidth  = 0.18;
                const ringDist = Math.abs(dist - ringRadius);
                
                // Noisy ring edge so the atoll isn't a perfect circle
                const wobble = Noise.simplex2(Math.atan2(dy, dx) * 1.5, dist * 4) * 0.05;
                const ring = 1 - this._smoothstep(0, ringWidth + wobble, ringDist);
                
                // Outer falloff to deep ocean
                const outer = 1 - this._smoothstep(ringRadius + ringWidth, 1.0, dist);
                
                // Inner lagoon: shallow water, not deep ocean. Suppress but not to 0.
                // (handled by leaving mult low and not adding)
                
                const mask = ring * outer;
                mult = (1 - strength) + mask * strength * 1.2;
                add  = mask * 0.15 * strength;
                break;
            }
        }
        
        return Math.max(0, Math.min(1, h * mult + add));
    }
    
    /**
     * Get color for elevation value (in meters)
     * Uses LAND_COLORS for elevations >= 0m
     * Uses single OCEAN_COLOR for elevations < 0m
     */
    _getElevationColor(elevation) {
        if (elevation >= ELEVATION.SEA_LEVEL) {
            // Land: map 0-6000m to color index 0-255
            const t = Math.min(1, elevation / ELEVATION.MAX);
            const index = Math.min(255, Math.floor(t * 255));
            return LAND_COLORS[index];
        } else {
            // Ocean: single color for all depths
            return OCEAN_COLORS[0];
        }
    }
    
    /**
     * Legacy function for compatibility
     */
    _getHeightColor(height, seaLevel) {
        // Convert 0-1 height to elevation if using legacy format
        const elevation = this._normalizedToElevation(height);
        return this._getElevationColor(elevation);
    }
    
    /**
     * Convert normalized height (0-1) to elevation in meters
     */
    _normalizedToElevation(normalizedHeight) {
        // Map 0-1 to MIN-MAX range
        return ELEVATION.MIN + normalizedHeight * ELEVATION.RANGE;
    }
    
    /**
     * Convert elevation in meters to normalized height (0-1)
     */
    _elevationToNormalized(elevation) {
        return (elevation - ELEVATION.MIN) / ELEVATION.RANGE;
    }
    
    /**
     * Linear interpolate between two hex colors
     */
    _lerpColor(color1, color2, t) {
        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);
        
        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);
        
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        
        return `rgb(${r},${g},${b})`;
    }
    
    /**
     * Get grayscale color for elevation (maps -4000 to 6000 -> 0 to 255)
     */
    _getGrayscale(elevation) {
        const normalized = this._elevationToNormalized(elevation);
        const v = Math.floor(Math.max(0, Math.min(1, normalized)) * 255);
        return `rgb(${v},${v},${v})`;
    }

    /**
     * Random uniform distribution (fallback)
     */
    _generateRandom(margin, w, h) {
        for (let i = 0; i < this.cellCount; i++) {
            this.points[i * 2] = margin + PRNG.random() * w;
            this.points[i * 2 + 1] = margin + PRNG.random() * h;
        }
    }
    
    /**
     * Jittered grid - fallback without biasing
     */
    _generateJittered(margin, w, h) {
        const cols = Math.ceil(Math.sqrt(this.cellCount * (w / h)));
        const rows = Math.ceil(this.cellCount / cols);
        const cellW = w / cols;
        const cellH = h / rows;
        const jitter = 0.4;
        
        let idx = 0;
        for (let row = 0; row < rows && idx < this.cellCount; row++) {
            for (let col = 0; col < cols && idx < this.cellCount; col++) {
                const baseX = margin + (col + 0.5) * cellW;
                const baseY = margin + (row + 0.5) * cellH;
                
                this.points[idx * 2] = baseX + (PRNG.random() - 0.5) * cellW * jitter * 2;
                this.points[idx * 2 + 1] = baseY + (PRNG.random() - 0.5) * cellH * jitter * 2;
                idx++;
            }
        }
    }
    
    /**
     * Generate land probability map for biased distribution.
     *
     * Builds a 32x32 grid that approximates the heightmap. Cells with
     * higher probability get more sample points, so an archipelago preset
     * actually places points in clusters (not uniformly across empty sea).
     *
     * Mirrors the same noise + world-mask pipeline used by generateHeightmap()
     * so the bias matches what the user will eventually see.
     */
    _generateLandProbabilityMap(seed, heightmapOptions) {
        const {
            algorithm = 'continental',
            frequency = 3,
            octaves = 6,
            seaLevel = 0.4,
            falloff = 'radial',
            falloffStrength = 0.7
        } = heightmapOptions || {};
        
        Noise.init(seed);
        
        const margin = 1;
        const w = this.width - margin * 2;
        const h = this.height - margin * 2;
        
        const gridSize = 32;
        const landProb = new Float32Array(gridSize * gridSize);
        
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const x = margin + (gx + 0.5) * (w / gridSize);
                const y = margin + (gy + 0.5) * (h / gridSize);
                
                const nx = x / this.width;
                const ny = y / this.height;
                
                // Get base noise value matching the heightmap algorithm
                let noiseVal;
                switch (algorithm) {
                    case 'continental':
                        noiseVal = Noise.continental(nx, ny, { frequency, octaves });
                        break;
                    case 'ridged':
                        noiseVal = Noise.ridged(nx, ny, { frequency, octaves }) * 0.5;
                        break;
                    case 'warped':
                        noiseVal = Noise.warped(nx, ny, { frequency, octaves, warpStrength: 0.4 });
                        break;
                    case 'eroded':
                        noiseVal = Noise.eroded(nx, ny, { frequency, octaves, erosionStrength: 0.5 });
                        break;
                    case 'multiwarp':
                        noiseVal = Noise.multiWarp(nx, ny, { frequency, octaves, warpIterations: 3, warpStrength: 0.5 });
                        break;
                    case 'swiss':
                        noiseVal = Noise.swiss(nx, ny, { frequency, octaves, warpStrength: 0.35 });
                        break;
                    case 'valleys':
                        noiseVal = Noise.valleys(nx, ny, { frequency, octaves, sharpness: 1.5, depth: 0.7 });
                        break;
                    case 'terraced':
                        noiseVal = Noise.terraced(nx, ny, { frequency, octaves, levels: 10, sharpness: 0.6 });
                        break;
                    default:
                        noiseVal = Noise.fbm(nx, ny, { frequency, octaves });
                }
                
                // Mirror the heightmap pipeline: -1..1 -> 0..1, then apply world mask
                let hVal = (noiseVal + 1) / 2;
                hVal = this._applyWorldMask(hVal, x, y, falloff, falloffStrength);
                
                // Probability of being land = how far above sea level this cell is
                // Above seaLevel -> high prob, below -> low prob (with smooth transition)
                const prob = this._smoothstep(seaLevel - 0.08, seaLevel + 0.08, hVal);
                landProb[gy * gridSize + gx] = prob;
            }
        }
        
        return { data: landProb, gridSize };
    }
    
    /**
     * Get density at a point based on land probability map
     */
    _getDensityAt(x, y, landProb, margin, w, h) {
        if (!landProb) return 1;
        
        const { data, gridSize } = landProb;
        const gx = Math.floor((x - margin) / w * gridSize);
        const gy = Math.floor((y - margin) / h * gridSize);
        const idx = Math.max(0, Math.min(gridSize - 1, gy)) * gridSize + Math.max(0, Math.min(gridSize - 1, gx));
        const p = data[idx];
        
        return p * 3.0 + (1 - p) * 0.3;
    }
    
    /**
     * Land-biased random distribution
     */
    _generateRandomBiased(margin, w, h, landProb) {
        if (!landProb) {
            return this._generateRandom(margin, w, h);
        }
        
        const points = [];
        const targetCount = this.cellCount;
        const maxAttempts = targetCount * 20;
        let attempts = 0;
        const maxDensity = 3.0;
        
        while (points.length < targetCount * 2 && attempts < maxAttempts) {
            const x = margin + PRNG.random() * w;
            const y = margin + PRNG.random() * h;
            
            const density = this._getDensityAt(x, y, landProb, margin, w, h);
            const acceptProb = density / maxDensity;
            
            if (PRNG.random() < acceptProb) {
                points.push(x, y);
            }
            attempts++;
        }
        
        this.cellCount = Math.floor(points.length / 2);
        this.points = new Float64Array(points);
    }
    
    /**
     * Land-biased jittered grid distribution
     */
    _generateJitteredBiased(margin, w, h, landProb) {
        if (!landProb) {
            return this._generateJittered(margin, w, h);
        }
        
        const { data, gridSize } = landProb;
        const landDensity = 3.0;
        const oceanDensity = 0.3;
        
        let totalWeight = 0;
        for (let i = 0; i < data.length; i++) {
            const p = data[i];
            totalWeight += p * landDensity + (1 - p) * oceanDensity;
        }
        
        const avgWeight = totalWeight / data.length;
        const basePointsPerCell = this.cellCount / (gridSize * gridSize * avgWeight);
        
        const points = [];
        const cellW = w / gridSize;
        const cellH = h / gridSize;
        const jitter = 0.8;
        
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const p = data[gy * gridSize + gx];
                const density = p * landDensity + (1 - p) * oceanDensity;
                const numPoints = Math.round(basePointsPerCell * density);
                
                const cellLeft = margin + gx * cellW;
                const cellTop = margin + gy * cellH;
                
                if (numPoints <= 1) {
                    if (numPoints === 1 || PRNG.random() < density / landDensity) {
                        const x = cellLeft + (0.5 + (PRNG.random() - 0.5) * jitter) * cellW;
                        const y = cellTop + (0.5 + (PRNG.random() - 0.5) * jitter) * cellH;
                        points.push(x, y);
                    }
                } else {
                    const subCols = Math.ceil(Math.sqrt(numPoints));
                    const subRows = Math.ceil(numPoints / subCols);
                    const subW = cellW / subCols;
                    const subH = cellH / subRows;
                    
                    let placed = 0;
                    for (let sy = 0; sy < subRows && placed < numPoints; sy++) {
                        for (let sx = 0; sx < subCols && placed < numPoints; sx++) {
                            const x = cellLeft + (sx + 0.5 + (PRNG.random() - 0.5) * jitter) * subW;
                            const y = cellTop + (sy + 0.5 + (PRNG.random() - 0.5) * jitter) * subH;
                            points.push(x, y);
                            placed++;
                        }
                    }
                }
            }
        }
        
        this.cellCount = Math.floor(points.length / 2);
        this.points = new Float64Array(points);
    }
    
    /**
     * Land-biased poisson disk sampling
     */
    _generatePoissonBiased(margin, w, h, landProb) {
        if (!landProb) {
            return this._generatePoisson(margin, w, h);
        }
        
        const baseMinDist = Math.sqrt((w * h) / this.cellCount) * 0.8;
        const minDistLand = baseMinDist * 0.6;
        const minDistOcean = baseMinDist * 1.8;
        
        const cellSize = minDistLand / Math.SQRT2;
        const gridW = Math.ceil(w / cellSize);
        const gridH = Math.ceil(h / cellSize);
        const grid = new Int32Array(gridW * gridH).fill(-1);
        
        const points = [];
        const active = [];
        const maxAttempts = 30;
        
        const startX = margin + PRNG.random() * w;
        const startY = margin + PRNG.random() * h;
        points.push(startX, startY);
        
        const gx = Math.floor((startX - margin) / cellSize);
        const gy = Math.floor((startY - margin) / cellSize);
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
            grid[gy * gridW + gx] = 0;
        }
        active.push(0);
        
        while (active.length > 0 && points.length / 2 < this.cellCount * 1.5) {
            const randIdx = PRNG.int(0, active.length - 1);
            const parentIdx = active[randIdx];
            const px = points[parentIdx * 2];
            const py = points[parentIdx * 2 + 1];
            
            const parentDensity = this._getDensityAt(px, py, landProb, margin, w, h);
            const localMinDist = parentDensity > 1.5 ? minDistLand : minDistOcean;
            
            let found = false;
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const angle = PRNG.random() * Math.PI * 2;
                const dist = localMinDist + PRNG.random() * localMinDist;
                const nx = px + Math.cos(angle) * dist;
                const ny = py + Math.sin(angle) * dist;
                
                if (nx < margin || nx > margin + w || ny < margin || ny > margin + h) {
                    continue;
                }
                
                const ngx = Math.floor((nx - margin) / cellSize);
                const ngy = Math.floor((ny - margin) / cellSize);
                
                const newDensity = this._getDensityAt(nx, ny, landProb, margin, w, h);
                const checkDist = newDensity > 1.5 ? minDistLand : minDistOcean;
                
                let valid = true;
                const checkRadius = Math.ceil(minDistOcean / cellSize) + 1;
                
                for (let dy = -checkRadius; dy <= checkRadius && valid; dy++) {
                    for (let dx = -checkRadius; dx <= checkRadius && valid; dx++) {
                        const cx = ngx + dx;
                        const cy = ngy + dy;
                        if (cx >= 0 && cx < gridW && cy >= 0 && cy < gridH) {
                            const neighborIdx = grid[cy * gridW + cx];
                            if (neighborIdx >= 0) {
                                const ex = points[neighborIdx * 2];
                                const ey = points[neighborIdx * 2 + 1];
                                const d = Math.hypot(nx - ex, ny - ey);
                                if (d < checkDist) valid = false;
                            }
                        }
                    }
                }
                
                if (valid) {
                    const newIdx = points.length / 2;
                    points.push(nx, ny);
                    
                    if (ngx >= 0 && ngx < gridW && ngy >= 0 && ngy < gridH) {
                        grid[ngy * gridW + ngx] = newIdx;
                    }
                    active.push(newIdx);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                active.splice(randIdx, 1);
            }
        }
        
        this.cellCount = Math.floor(points.length / 2);
        this.points = new Float64Array(points);
    }
    
    /**
     * Poisson disk sampling - maintains minimum distance between points
     * Slower but very uniform distribution
     */
    _generatePoisson(margin, w, h) {
        const minDist = Math.sqrt((w * h) / this.cellCount) * 0.8;
        const cellSize = minDist / Math.SQRT2;
        const gridW = Math.ceil(w / cellSize);
        const gridH = Math.ceil(h / cellSize);
        const grid = new Int32Array(gridW * gridH).fill(-1);
        
        const active = [];
        let pointCount = 0;
        const maxAttempts = 30;
        
        // Start with a random point
        const startX = margin + PRNG.random() * w;
        const startY = margin + PRNG.random() * h;
        this.points[0] = startX;
        this.points[1] = startY;
        
        const gx = Math.floor((startX - margin) / cellSize);
        const gy = Math.floor((startY - margin) / cellSize);
        grid[gy * gridW + gx] = 0;
        active.push(0);
        pointCount = 1;
        
        while (active.length > 0 && pointCount < this.cellCount) {
            const randIdx = PRNG.int(0, active.length - 1);
            const parentIdx = active[randIdx];
            const px = this.points[parentIdx * 2];
            const py = this.points[parentIdx * 2 + 1];
            
            let found = false;
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const angle = PRNG.random() * Math.PI * 2;
                const dist = minDist + PRNG.random() * minDist;
                const nx = px + Math.cos(angle) * dist;
                const ny = py + Math.sin(angle) * dist;
                
                // Check bounds
                if (nx < margin || nx > margin + w || ny < margin || ny > margin + h) {
                    continue;
                }
                
                const ngx = Math.floor((nx - margin) / cellSize);
                const ngy = Math.floor((ny - margin) / cellSize);
                
                // Check neighbors
                let valid = true;
                for (let dy = -2; dy <= 2 && valid; dy++) {
                    for (let dx = -2; dx <= 2 && valid; dx++) {
                        const cx = ngx + dx;
                        const cy = ngy + dy;
                        if (cx >= 0 && cx < gridW && cy >= 0 && cy < gridH) {
                            const neighborIdx = grid[cy * gridW + cx];
                            if (neighborIdx >= 0) {
                                const ex = this.points[neighborIdx * 2];
                                const ey = this.points[neighborIdx * 2 + 1];
                                const d = Math.hypot(nx - ex, ny - ey);
                                if (d < minDist) valid = false;
                            }
                        }
                    }
                }
                
                if (valid) {
                    this.points[pointCount * 2] = nx;
                    this.points[pointCount * 2 + 1] = ny;
                    grid[ngy * gridW + ngx] = pointCount;
                    active.push(pointCount);
                    pointCount++;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                active.splice(randIdx, 1);
            }
        }
        
        // Fill remaining with random points if needed
        while (pointCount < this.cellCount) {
            this.points[pointCount * 2] = margin + PRNG.random() * w;
            this.points[pointCount * 2 + 1] = margin + PRNG.random() * h;
            pointCount++;
        }
        
        this.cellCount = pointCount;
    }
    
    /**
     * Lloyd relaxation - moves points toward cell centroids
     */
    _relaxPoints(iterations) {
        for (let iter = 0; iter < iterations; iter++) {
            this.updateDiagram();
            
            for (let i = 0; i < this.cellCount; i++) {
                const cell = this.voronoi.cellPolygon(i);
                if (!cell || cell.length < 3) continue;
                
                // Calculate centroid
                let cx = 0, cy = 0, area = 0;
                for (let j = 0; j < cell.length - 1; j++) {
                    const cross = cell[j][0] * cell[j + 1][1] - cell[j + 1][0] * cell[j][1];
                    area += cross;
                    cx += (cell[j][0] + cell[j + 1][0]) * cross;
                    cy += (cell[j][1] + cell[j + 1][1]) * cross;
                }
                
                area /= 2;
                if (Math.abs(area) > 1e-10) {
                    cx /= (6 * area);
                    cy /= (6 * area);
                    
                    // Clamp to bounds
                    this.points[i * 2] = Math.max(1, Math.min(this.width - 1, cx));
                    this.points[i * 2 + 1] = Math.max(1, Math.min(this.height - 1, cy));
                }
            }
        }
    }
    
    /**
     * Update Delaunay triangulation and Voronoi diagram
     */
    updateDiagram() {
        // Use flat array constructor for best performance
        this.delaunay = new d3.Delaunay(this.points);
        this.voronoi = this.delaunay.voronoi([0, 0, this.width, this.height]);
    }
    
    /**
     * Main render function - optimized for high cell counts
     */
    
    /**
     * Clear contour cache (call when heights change)
     */
    clearContourCache() {
        this._contourCache = null;
        // Also clear render caches that depend on terrain
        this._coastlineCache = null;
        this._borderEdgesCache = null;
        this._borderPathsCache = null;
        this._kingdomBoundaryCache = null;
    }
    
    /**
     * Clear kingdom render caches (call when kingdoms change)
     */
    clearKingdomCache() {
        this._borderEdgesCache = null;
        this._borderPathsCache = null;
        this._kingdomBoundaryCache = null;
    }
    
    /**
     * Count land cells
     */
    getLandCount() {
        if (!this.terrain) return 0;
        let count = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.terrain[i] === 1) count++;
        }
        return count;
    }
    
    /**
     * Find cell at given screen coordinates (handles viewport transform)
     */
    findCell(screenX, screenY) {
        if (!this.delaunay) return -1;
        
        // Convert screen to world coordinates
        const world = this.screenToWorld(screenX, screenY);
        return this.delaunay.find(world.x, world.y);
    }
    
    /**
     * Find cell at world coordinates (no transform)
     */
    findCellWorld(worldX, worldY) {
        if (!this.delaunay) return -1;
        return this.delaunay.find(worldX, worldY);
    }
    
    /**
     * Get cell polygon by index
     */
    getCellPolygon(index) {
        if (!this.voronoi || index < 0 || index >= this.cellCount) return null;
        return this.voronoi.cellPolygon(index);
    }
    
    /**
     * Get cell center point
     */
    getCellCenter(index) {
        if (index < 0 || index >= this.cellCount) return null;
        return {
            x: this.points[index * 2],
            y: this.points[index * 2 + 1]
        };
    }
    
    /**
     * Get cell height
     */
    getCellHeight(index) {
        if (!this.heights || index < 0 || index >= this.cellCount) return null;
        return this.heights[index];
    }
    
    /**
     * Check if cell is land
     */
    isLand(index) {
        if (!this.terrain || index < 0 || index >= this.cellCount) return false;
        return this.terrain[index] === 1;
    }
    
    /**
     * Get neighboring cell indices
     */
    getNeighbors(index) {
        if (!this.voronoi || index < 0 || index >= this.cellCount) return [];
        return Array.from(this.voronoi.neighbors(index));
    }
    
    /**
     * Export cell data for map generation
     */
    exportData() {
        if (!this.voronoi) return null;
        
        const cells = [];
        
        for (let i = 0; i < this.cellCount; i++) {
            const polygon = this.voronoi.cellPolygon(i);
            if (!polygon) continue;
            
            // Calculate centroid and area
            let cx = 0, cy = 0, area = 0;
            for (let j = 0; j < polygon.length - 1; j++) {
                const cross = polygon[j][0] * polygon[j + 1][1] - polygon[j + 1][0] * polygon[j][1];
                area += cross;
                cx += (polygon[j][0] + polygon[j + 1][0]) * cross;
                cy += (polygon[j][1] + polygon[j + 1][1]) * cross;
            }
            area = Math.abs(area / 2);
            if (area > 0) {
                cx /= (6 * area / (area > 0 ? 1 : -1));
                cy /= (6 * area / (area > 0 ? 1 : -1));
            } else {
                cx = this.points[i * 2];
                cy = this.points[i * 2 + 1];
            }
            
            const cellData = {
                id: i,
                center: { x: this.points[i * 2], y: this.points[i * 2 + 1] },
                centroid: { x: cx, y: cy },
                area: area,
                polygon: polygon.map(p => ({ x: p[0], y: p[1] })),
                neighbors: this.getNeighbors(i)
            };
            
            // Add elevation data if available (in meters)
            if (this.heights) {
                cellData.elevation = this.heights[i];  // meters (-4000 to 6000)
                cellData.isLand = this.terrain[i] === 1;
                cellData.isOcean = this.terrain[i] === 0;
            }
            
            cells.push(cellData);
        }
        
        return {
            width: this.width,
            height: this.height,
            cellCount: this.cellCount,
            elevation: {
                unit: 'meters',
                seaLevel: ELEVATION.SEA_LEVEL,
                maxHeight: ELEVATION.MAX,
                maxDepth: ELEVATION.MIN
            },
            seaLevelThreshold: this.seaLevel,  // The 0-1 value used to determine land/water ratio
            cells: cells
        };
    }
    
    /**
     * Export as PNG data URL
     */
    exportPNG() {
        return this.canvas.toDataURL('image/png');
    }
}

// Add rendering methods to prototype
Object.assign(VoronoiGenerator.prototype, renderingMethods);
