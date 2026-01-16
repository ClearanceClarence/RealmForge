/**
 * VORONOI MAP GENERATOR - APPLICATION
 * UI controller and event handling
 */

import { VoronoiGenerator } from './voronoi-generator.js?v=200';
import { WorkerBridge } from './worker-bridge.js';

// Worker bridge for background generation
let workerBridge = null;
let useWorkerGeneration = true;  // Toggle for worker-based generation

function initWorker() {
    if (workerBridge) return;
    workerBridge = new WorkerBridge('./generation.worker.js');
    workerBridge.onProgress = (data) => {
        updateLoadingStatus(data.message);
    };
    workerBridge.onError = (error) => {
        console.error('Worker error:', error);
        useWorkerGeneration = false;  // Fallback to main thread
    };
}

// Loading Screen
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');

function showLoading(message = 'Loading...') {
    loadingStatus.textContent = message;
    loadingScreen.classList.remove('hidden');
}

function hideLoading() {
    loadingScreen.classList.add('hidden');
}

function updateLoadingStatus(message) {
    loadingStatus.textContent = message;
}

// DOM Elements - Generation
const canvas = document.getElementById('voronoi-canvas');
const cellCountInput = document.getElementById('cell-count');
const distributionSelect = document.getElementById('distribution');
const seedInput = document.getElementById('seed');
const randomSeedBtn = document.getElementById('random-seed');
const generateBtn = document.getElementById('generate-btn');
const generateBtnSidebar = document.getElementById('generate-btn-sidebar');

// DOM Elements - Heightmap
const noiseAlgorithm = document.getElementById('noise-algorithm');
const noiseFrequency = document.getElementById('noise-frequency');
const noiseFrequencyValue = document.getElementById('noise-frequency-value');
const noiseOctaves = document.getElementById('noise-octaves');
const noiseOctavesValue = document.getElementById('noise-octaves-value');
const seaLevel = document.getElementById('sea-level');
const seaLevelValue = document.getElementById('sea-level-value');
const falloffType = document.getElementById('falloff-type');
const falloffStrength = document.getElementById('falloff-strength');
const falloffStrengthValue = document.getElementById('falloff-strength-value');
const smoothing = document.getElementById('smoothing');
const smoothingValue = document.getElementById('smoothing-value');
const smoothingStrength = document.getElementById('smoothing-strength');
const smoothingStrengthValue = document.getElementById('smoothing-strength-value');
const generateHeightmapBtn = document.getElementById('generate-heightmap-btn');

// DOM Elements - Erosion
const erosionIterations = document.getElementById('erosion-iterations');
const erosionIterationsValue = document.getElementById('erosion-iterations-value');
const erosionStrength = document.getElementById('erosion-strength');
const erosionStrengthValue = document.getElementById('erosion-strength-value');
const depositionRate = document.getElementById('deposition-rate');
const depositionRateValue = document.getElementById('deposition-rate-value');
const applyErosionBtn = document.getElementById('apply-erosion-btn');

// DOM Elements - Climate
const windDirection = document.getElementById('wind-direction');
const windStrengthSlider = document.getElementById('wind-strength');
const windStrengthValue = document.getElementById('wind-strength-value');
const generatePrecipBtn = document.getElementById('generate-precip-btn');
const generateRiversBtn = document.getElementById('generate-rivers-btn');
const showRiversToggle = document.getElementById('show-rivers');
const numRiversSlider = document.getElementById('num-rivers');
const numRiversValue = document.getElementById('num-rivers-value');

// DOM Elements - Political
const numKingdomsSlider = document.getElementById('num-kingdoms');
const numKingdomsValue = document.getElementById('num-kingdoms-value');
const roadDensitySlider = document.getElementById('road-density');
const roadDensityValue = document.getElementById('road-density-value');
const generateKingdomsBtn = document.getElementById('generate-kingdoms-btn');

// DOM Elements - Display
const renderMode = document.getElementById('render-mode');
const subdivisionSlider = document.getElementById('subdivision');
const subdivisionValue = document.getElementById('subdivision-value');
const showWindroseToggle = document.getElementById('show-windrose');
const showEdgesToggle = document.getElementById('show-edges');
const showCentersToggle = document.getElementById('show-centers');
const showDelaunayToggle = document.getElementById('show-delaunay');
const showGridToggle = document.getElementById('show-grid');
const showScaleToggle = document.getElementById('show-scale');
const worldSizeSlider = document.getElementById('world-size-km');
const worldSizeValue = document.getElementById('world-size-km-val');

// DOM Elements - Viewport
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLevelDisplay = document.getElementById('zoom-level');

// DOM Elements - Overlays
const heightmapOverlay = document.getElementById('heightmap-overlay');
const toggleHeightmapBtn = document.getElementById('toggle-heightmap');

// DOM Elements - Export
const exportJsonBtn = document.getElementById('export-json');
const exportPngBtn = document.getElementById('export-png');

// Stats
const statCells = document.getElementById('stat-cells');
const statVisible = document.getElementById('stat-visible');
const statLand = document.getElementById('stat-land');
const statGenTime = document.getElementById('stat-gen-time');
const statRenderTime = document.getElementById('stat-render-time');

// Initialize generator
const generator = new VoronoiGenerator(canvas);

// ========================================
// DEBOUNCE UTILITY
// ========================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========================================
// GENERATION
// ========================================

async function generate() {
    const count = parseInt(cellCountInput.value) || 50000;
    const distribution = distributionSelect.value;
    const seed = parseInt(seedInput.value) || Date.now();
    
    // Validate count
    const validCount = Math.max(100, Math.min(100000, count));
    cellCountInput.value = validCount;
    
    // Show loading screen
    showLoading('Generating new landmass...');
    
    // Initialize worker if needed
    initWorker();
    
    // Get heightmap options from UI
    const heightmapOptions = {
        algorithm: noiseAlgorithm.value,
        frequency: parseFloat(noiseFrequency.value),
        octaves: parseInt(noiseOctaves.value),
        seaLevel: parseFloat(seaLevel.value),
        falloff: falloffType.value,
        falloffStrength: parseFloat(falloffStrength.value)
    };
    
    try {
        if (useWorkerGeneration && workerBridge) {
            // Use worker for point + heightmap generation
            updateLoadingStatus('Generating terrain in background...');
            
            const result = await workerBridge.generateFull({
                cellCount: validCount,
                width: generator.width,
                height: generator.height,
                seed: seed,
                distribution: distribution,
                relaxIterations: distribution === 'relaxed' ? 3 : 2,
                heightmapOptions
            });
            
            // Apply results from worker
            workerBridge.applyResults(generator, result);
            
            // Update stats
            statCells.textContent = generator.cellCount.toLocaleString();
            statGenTime.textContent = 'Worker';
            
        } else {
            // Fallback: Generate on main thread
            updateLoadingStatus('Creating terrain cells...');
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const metrics = generator.generate(validCount, distribution, seed, heightmapOptions);
            
            statCells.textContent = generator.cellCount.toLocaleString();
            statGenTime.textContent = metrics.genTime.toFixed(1) + 'ms';
            
            // Generate heightmap on main thread
            updateLoadingStatus('Sculpting terrain...');
            await new Promise(resolve => setTimeout(resolve, 20));
            
            generator.generateHeightmap({
                seed: seed + 1000,
                ...heightmapOptions,
                smoothing: parseInt(smoothing.value),
                smoothingStrength: parseFloat(smoothingStrength.value)
            });
        }
        
        // Continue with post-processing on main thread
        await postProcessGeneration(seed);
        
    } catch (error) {
        console.error('Generation failed:', error);
        hideLoading();
    }
}

// Post-processing steps (erosion, precipitation, kingdoms) run on main thread
async function postProcessGeneration(seed, skipSmoothing = false) {
    // Apply smoothing if heightmap was generated by worker (worker doesn't do smoothing)
    if (!skipSmoothing && useWorkerGeneration && parseInt(smoothing.value) > 0) {
        updateLoadingStatus('Smoothing terrain...');
        await new Promise(resolve => setTimeout(resolve, 10));
        generator.smoothHeights(parseInt(smoothing.value), parseFloat(smoothingStrength.value));
    }
    
    // Erosion
    updateLoadingStatus('Applying erosion...');
    await new Promise(resolve => setTimeout(resolve, 10));
    generator.applyHydraulicErosion({
        iterations: parseInt(erosionIterations.value),
        erosionStrength: parseFloat(erosionStrength.value),
        depositionRate: parseFloat(depositionRate.value)
    });
    
    // Climate
    updateLoadingStatus('Simulating climate...');
    await new Promise(resolve => setTimeout(resolve, 10));
    generator.generatePrecipitation({
        windDirection: parseInt(windDirection.value),
        windStrength: parseFloat(windStrengthSlider.value)
    });
    generator.calculateDrainage({
        numberOfRivers: parseInt(numRiversSlider.value)
    });
    
    // Kingdoms
    updateLoadingStatus('Forming kingdoms...');
    await new Promise(resolve => setTimeout(resolve, 10));
    if (generator.renderMode === 'political') {
        generator.generateKingdoms(parseInt(numKingdomsSlider.value), parseInt(roadDensitySlider.value));
    }
    
    // Final render
    updateLoadingStatus('Rendering map...');
    await new Promise(resolve => setTimeout(resolve, 10));
    generator.render();
    
    // Update stats
    const landCount = generator.getLandCount();
    const landPercent = ((landCount / generator.cellCount) * 100).toFixed(1);
    statLand.textContent = `${landPercent}%`;
    statRenderTime.textContent = generator.metrics.renderTime.toFixed(1) + 'ms';
    
    hideLoading();
}

// Legacy generateHeightmapWithLoading - now uses async pattern
async function generateHeightmapWithLoading() {
    if (!generator.points || generator.cellCount === 0) {
        hideLoading();
        return;
    }
    
    const seed = parseInt(seedInput.value) || 12345;
    
    updateLoadingStatus('Sculpting terrain...');
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const options = {
        seed: seed + 1000,
        algorithm: noiseAlgorithm.value,
        frequency: parseFloat(noiseFrequency.value),
        octaves: parseInt(noiseOctaves.value),
        seaLevel: parseFloat(seaLevel.value),
        falloff: falloffType.value,
        falloffStrength: parseFloat(falloffStrength.value),
        smoothing: parseInt(smoothing.value),
        smoothingStrength: parseFloat(smoothingStrength.value)
    };
    
    generator.generateHeightmap(options);
    
    // skipSmoothing=true because generateHeightmap already handles it
    await postProcessGeneration(seed, true);
}

generateBtn.addEventListener('click', generate);
if (generateBtnSidebar) generateBtnSidebar.addEventListener('click', generate);

// Generate on Enter in inputs
cellCountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generate();
});

seedInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generate();
});

// Random seed button
randomSeedBtn.addEventListener('click', () => {
    seedInput.value = Math.floor(Math.random() * 1000000);
});

// ========================================
// HEIGHTMAP
// ========================================

function generateHeightmap() {
    if (!generator.points || generator.cellCount === 0) return;
    
    // Show loading screen
    showLoading('Regenerating terrain...');
    
    // Use the loading version
    generateHeightmapWithLoading();
}

generateHeightmapBtn.addEventListener('click', generateHeightmap);

// Update slider value displays
noiseFrequency.addEventListener('input', (e) => {
    noiseFrequencyValue.textContent = parseFloat(e.target.value).toFixed(1);
});

noiseOctaves.addEventListener('input', (e) => {
    noiseOctavesValue.textContent = e.target.value;
});

seaLevel.addEventListener('input', (e) => {
    seaLevelValue.textContent = parseFloat(e.target.value).toFixed(2);
});

falloffStrength.addEventListener('input', (e) => {
    falloffStrengthValue.textContent = parseFloat(e.target.value).toFixed(2);
});

smoothing.addEventListener('input', (e) => {
    smoothingValue.textContent = e.target.value;
});

smoothingStrength.addEventListener('input', (e) => {
    smoothingStrengthValue.textContent = parseFloat(e.target.value).toFixed(2);
});

// Live update on sea level change - regenerates heightmap with new sea level
seaLevel.addEventListener('change', () => {
    if (generator.heights) {
        // Regenerate heightmap with new sea level
        generateHeightmap();
    }
});

// ========================================
// HYDRAULIC EROSION
// ========================================

erosionIterations.addEventListener('input', (e) => {
    erosionIterationsValue.textContent = e.target.value;
});

erosionStrength.addEventListener('input', (e) => {
    erosionStrengthValue.textContent = parseFloat(e.target.value).toFixed(2);
});

depositionRate.addEventListener('input', (e) => {
    depositionRateValue.textContent = parseFloat(e.target.value).toFixed(2);
});

function applyErosion() {
    if (!generator.heights) {
        alert('Generate terrain first');
        return;
    }
    
    applyErosionBtn.classList.add('loading');
    applyErosionBtn.textContent = 'Eroding...';
    
    setTimeout(() => {
        try {
            generator.applyHydraulicErosion({
                iterations: parseInt(erosionIterations.value),
                erosionStrength: parseFloat(erosionStrength.value),
                depositionRate: parseFloat(depositionRate.value)
            });
            generator.render();
            updateRenderStats();
        } finally {
            applyErosionBtn.classList.remove('loading');
            applyErosionBtn.textContent = 'Apply Erosion';
        }
    }, 10);
}

applyErosionBtn.addEventListener('click', applyErosion);

// ========================================
// CLIMATE / PRECIPITATION
// ========================================

windStrengthSlider.addEventListener('input', (e) => {
    windStrengthValue.textContent = parseFloat(e.target.value).toFixed(2);
});

// Number of rivers slider
numRiversSlider.addEventListener('input', (e) => {
    numRiversValue.textContent = e.target.value;
});

numRiversSlider.addEventListener('change', (e) => {
    if (generator.heights) {
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value)
        });
        generator.render();
        updateRenderStats();
    }
});

function generatePrecipitation() {
    if (!generator.heights || generator.cellCount === 0) {
        alert('Generate heightmap first!');
        return;
    }
    
    generatePrecipBtn.classList.add('loading');
    generatePrecipBtn.textContent = 'Generating';
    
    setTimeout(() => {
        generator.generatePrecipitation({
            windDirection: parseInt(windDirection.value),
            windStrength: parseFloat(windStrengthSlider.value)
        });
        
        // Switch to precipitation view
        renderMode.value = 'precipitation';
        generator.renderMode = 'precipitation';
        generator.render();
        updateRenderStats();
        
        generatePrecipBtn.classList.remove('loading');
        generatePrecipBtn.textContent = 'Generate Precipitation';
    }, 10);
}

generatePrecipBtn.addEventListener('click', generatePrecipitation);

function generateRivers() {
    if (!generator.heights || generator.cellCount === 0) {
        alert('Generate heightmap first!');
        return;
    }
    
    // Auto-generate precipitation if not exists
    if (!generator.precipitation) {
        generator.generatePrecipitation({
            windDirection: parseInt(windDirection.value),
            windStrength: parseFloat(windStrengthSlider.value)
        });
    }
    
    generateRiversBtn.classList.add('loading');
    generateRiversBtn.textContent = 'Calculating';
    
    setTimeout(() => {
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value)
        });
        
        // Switch to terrain view to see rivers
        renderMode.value = 'terrain';
        generator.renderMode = 'terrain';
        generator.render();
        updateRenderStats();
        
        generateRiversBtn.classList.remove('loading');
        generateRiversBtn.textContent = 'Rivers';
        
        
    }, 10);
}

generateRiversBtn.addEventListener('click', generateRivers);

// ========================================
// POLITICAL OPTIONS
// ========================================

numKingdomsSlider.addEventListener('input', (e) => {
    numKingdomsValue.textContent = e.target.value;
});

roadDensitySlider.addEventListener('input', (e) => {
    roadDensityValue.textContent = e.target.value;
});

// Regenerate cities and roads when slider is released
roadDensitySlider.addEventListener('change', (e) => {
    if (generator.kingdoms && generator.kingdomCount > 0) {
        generator.roadDensity = parseInt(e.target.value);
        // Regenerate cities (which also regenerates roads and population)
        generator._generateCities();
        generator.render();
    }
});

function generateKingdoms() {
    if (!generator.heights) {
        alert('Generate heightmap first');
        return;
    }
    
    generateKingdomsBtn.classList.add('loading');
    generateKingdomsBtn.textContent = 'Generating...';
    
    setTimeout(() => {
        try {
            const roadDensity = parseInt(roadDensitySlider.value);
            generator.generateKingdoms(parseInt(numKingdomsSlider.value), roadDensity);
            
            // Switch to political view
            renderMode.value = 'political';
            generator.renderMode = 'political';
            generator.render();
            updateRenderStats();
        } finally {
            generateKingdomsBtn.classList.remove('loading');
            generateKingdomsBtn.textContent = 'Generate Kingdoms';
        }
    }, 10);
}

generateKingdomsBtn.addEventListener('click', generateKingdoms);

// ========================================
// DISPLAY OPTIONS
// ========================================

renderMode.addEventListener('change', (e) => {
    generator.renderMode = e.target.value;
    
    // Auto-generate precipitation if switching to that mode and it doesn't exist
    if (e.target.value === 'precipitation' && !generator.precipitation && generator.heights) {
        generator.generatePrecipitation({
            windDirection: parseInt(windDirection.value),
            windStrength: parseFloat(windStrengthSlider.value)
        });
    }
    
    // Auto-calculate drainage if switching to flow arrows mode
    if (e.target.value === 'rivers' && !generator.drainage && generator.heights) {
        if (!generator.precipitation) {
            generator.generatePrecipitation({
                windDirection: parseInt(windDirection.value),
                windStrength: parseFloat(windStrengthSlider.value)
            });
        }
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value)
        });
    }
    
    // Auto-generate kingdoms if switching to political mode and they don't exist
    if (e.target.value === 'political' && !generator.kingdoms && generator.heights) {
        generator.generateKingdoms(parseInt(numKingdomsSlider.value), parseInt(roadDensitySlider.value));
    }
    
    generator.render();
    updateRenderStats();
});

subdivisionSlider.addEventListener('input', (e) => {
    subdivisionValue.textContent = e.target.value;
});

subdivisionSlider.addEventListener('change', (e) => {
    generator.subdivisionLevel = parseInt(e.target.value);
    generator.render();
    updateRenderStats();
});

showWindroseToggle.addEventListener('change', (e) => {
    generator.showWindrose = e.target.checked;
    generator.render();
    updateRenderStats();
});

showEdgesToggle.addEventListener('change', (e) => {
    generator.showEdges = e.target.checked;
    generator.render();
    updateRenderStats();
});

showCentersToggle.addEventListener('change', (e) => {
    generator.showCenters = e.target.checked;
    generator.render();
    updateRenderStats();
});

showDelaunayToggle.addEventListener('change', (e) => {
    generator.showDelaunay = e.target.checked;
    generator.render();
    updateRenderStats();
});

showRiversToggle.addEventListener('change', (e) => {
    generator.showRivers = e.target.checked;
    generator.render();
    updateRenderStats();
});

showGridToggle.addEventListener('change', (e) => {
    generator.showGrid = e.target.checked;
    generator.render();
    updateRenderStats();
});

showScaleToggle.addEventListener('change', (e) => {
    generator.showScale = e.target.checked;
    generator.render();
    updateRenderStats();
});

worldSizeSlider.addEventListener('input', (e) => {
    worldSizeValue.textContent = e.target.value;
    generator.worldSizeKm = parseInt(e.target.value);
    generator.render();
    updateRenderStats();
});

function updateRenderStats() {
    statRenderTime.textContent = generator.metrics.renderTime.toFixed(1) + 'ms';
    if (statVisible) {
        statVisible.textContent = generator.metrics.visibleCells?.toLocaleString() || generator.cellCount.toLocaleString();
    }
}

// ========================================
// HEIGHTMAP OVERLAY TOGGLE
// ========================================

let heightmapOverlayActive = false;
let heightmapCtx = null;
let lastOverlayViewport = { x: 0, y: 0, zoom: 1 };

if (toggleHeightmapBtn && heightmapOverlay) {
    heightmapCtx = heightmapOverlay.getContext('2d');
    
    toggleHeightmapBtn.addEventListener('click', () => {
        heightmapOverlayActive = !heightmapOverlayActive;
        toggleHeightmapBtn.classList.toggle('active', heightmapOverlayActive);
        heightmapOverlay.classList.toggle('active', heightmapOverlayActive);
        
        if (heightmapOverlayActive) {
            // Store current viewport as reference for transforms
            lastOverlayViewport = {
                x: generator.viewport.x,
                y: generator.viewport.y,
                zoom: generator.viewport.zoom
            };
            renderHeightmapOverlay();
        }
    });
}

function renderHeightmapOverlay() {
    if (!heightmapOverlay || !heightmapCtx) return;
    if (!generator.heights || !generator.voronoi) return;
    
    // Match main canvas size exactly (including DPR)
    const dpr = generator.dpr || window.devicePixelRatio || 1;
    heightmapOverlay.width = generator.width * dpr;
    heightmapOverlay.height = generator.height * dpr;
    
    // Match CSS size
    heightmapOverlay.style.width = generator.width + 'px';
    heightmapOverlay.style.height = generator.height + 'px';
    
    // Reset and apply same transform as main canvas
    heightmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    heightmapCtx.clearRect(0, 0, generator.width, generator.height);
    
    // Apply viewport transform (same as render method)
    heightmapCtx.save();
    heightmapCtx.translate(generator.viewport.x, generator.viewport.y);
    heightmapCtx.scale(generator.viewport.zoom, generator.viewport.zoom);
    
    const heights = generator.heights;
    const numCells = generator.cellCount;
    
    // Heights are in meters: sea level = 0, max = ~6000m
    const maxElevation = 6000;
    
    // Set line width to cover gaps between cells
    heightmapCtx.lineWidth = 1.5 / generator.viewport.zoom;
    heightmapCtx.lineJoin = 'round';
    
    // Draw each cell
    for (let i = 0; i < numCells; i++) {
        const h = heights[i];
        
        // Skip water cells (below sea level)
        if (h < 0) continue;
        
        // Get cell polygon from voronoi
        let polygon;
        try {
            polygon = generator.voronoi.cellPolygon(i);
        } catch (e) {
            continue;
        }
        
        if (!polygon || polygon.length < 3) continue;
        
        // Normalize height (0 to 1) based on elevation
        const normalizedHeight = Math.min(1, Math.max(0, h / maxElevation));
        
        // Apply contrast curve for more dramatic effect
        const contrast = Math.pow(normalizedHeight, 0.6);
        
        // For overlay blend: <128 darkens, >128 lightens
        // Low elevation = dark (darken map), high elevation = bright (lighten map)
        const shade = Math.round(30 + contrast * 225);
        const color = `rgb(${shade}, ${shade}, ${shade})`;
        
        heightmapCtx.fillStyle = color;
        heightmapCtx.strokeStyle = color;
        heightmapCtx.beginPath();
        heightmapCtx.moveTo(polygon[0][0], polygon[0][1]);
        for (let j = 1; j < polygon.length; j++) {
            heightmapCtx.lineTo(polygon[j][0], polygon[j][1]);
        }
        heightmapCtx.closePath();
        heightmapCtx.fill();
        heightmapCtx.stroke();
    }
    
    heightmapCtx.restore();
}

function applyOverlayTransform() {
    if (!heightmapOverlay || !heightmapOverlayActive) return;
    
    const last = lastOverlayViewport;
    const curr = generator.viewport;
    
    // Calculate the transform relative to last rendered state
    const scale = curr.zoom / last.zoom;
    const dx = curr.x - last.x * scale;
    const dy = curr.y - last.y * scale;
    
    heightmapOverlay.style.transformOrigin = '0 0';
    heightmapOverlay.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
}

function resetOverlayTransform() {
    if (!heightmapOverlay) return;
    heightmapOverlay.style.transform = '';
    lastOverlayViewport = {
        x: generator.viewport.x,
        y: generator.viewport.y,
        zoom: generator.viewport.zoom
    };
}

// Update overlay when map is re-rendered (full render)
const originalRender = generator.render.bind(generator);
generator.render = function(...args) {
    originalRender(...args);
    if (heightmapOverlayActive) {
        resetOverlayTransform();
        renderHeightmapOverlay();
    }
};

// Apply CSS transform during low-res render (interaction)
const originalRenderLowRes = generator.renderLowRes.bind(generator);
generator.renderLowRes = function(...args) {
    originalRenderLowRes(...args);
    if (heightmapOverlayActive) {
        applyOverlayTransform();
    }
};

function updateZoomDisplay() {
    const zoom = generator.viewport.zoom;
    zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
}

// ========================================
// VIEWPORT / ZOOM CONTROLS
// ========================================

zoomInBtn.addEventListener('click', () => {
    generator.setZoom(generator.viewport.zoom * 1.5);
    updateZoomDisplay();
    updateRenderStats();
});

zoomOutBtn.addEventListener('click', () => {
    generator.setZoom(generator.viewport.zoom / 1.5);
    updateZoomDisplay();
    updateRenderStats();
});

zoomResetBtn.addEventListener('click', () => {
    generator.resetView();
    updateZoomDisplay();
    updateRenderStats();
});

// Listen for zoom changes from mouse wheel/touch
canvas.addEventListener('zoomchange', (e) => {
    updateZoomDisplay();
    updateRenderStats();
});

// Debounced render stats update during pan/zoom
const debouncedStatsUpdate = debounce(() => {
    updateRenderStats();
}, 100);

// ========================================
// EXPORT
// ========================================

exportJsonBtn.addEventListener('click', () => {
    const data = generator.exportData();
    if (!data) return;
    
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `voronoi-map-${data.cellCount}-cells.json`;
    link.click();
    
    URL.revokeObjectURL(url);
});

exportPngBtn.addEventListener('click', () => {
    const dataUrl = generator.exportPNG();
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `voronoi-map-${generator.cellCount}-cells.png`;
    link.click();
});

// ========================================
// HOVER INTERACTION
// ========================================

let lastHoveredCell = -1;
let lastHoveredLabel = null;
let dragStartPos = null;
const DRAG_THRESHOLD = 5; // pixels
const tooltip = document.getElementById('cell-tooltip');
const infoPanel = document.getElementById('info-panel');
const infoPanelContent = document.getElementById('info-panel-content');
const infoPanelClose = document.getElementById('info-panel-close');

// Track drag start position
canvas.addEventListener('mousedown', (e) => {
    dragStartPos = { x: e.clientX, y: e.clientY };
});

// Close info panel
if (infoPanelClose) {
    infoPanelClose.addEventListener('click', (e) => {
        e.stopPropagation();
        infoPanel.classList.remove('visible');
    });
}

// Click handler for labels
canvas.addEventListener('click', (e) => {
    // Check if this was actually a drag (mouse moved significantly)
    if (dragStartPos) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
            dragStartPos = null;
            return; // This was a drag, not a click
        }
    }
    dragStartPos = null;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // In political mode, check for label clicks
    if (generator.renderMode === 'political') {
        const labelHit = generator.hitTestLabel(x, y);
        
        if (labelHit) {
            showInfoPanel(labelHit);
            return;
        }
    }
    
    // If clicked elsewhere, close the panel
    infoPanel.classList.remove('visible');
});

function showInfoPanel(labelHit) {
    let html = '';
    
    if (labelHit.type === 'kingdom') {
        const stats = generator.getKingdomStats(labelHit.index);
        if (stats) {
            html = `
                <div class="ip-header">
                    <span class="ip-icon">🏰</span>
                    <div>
                        <div class="ip-title">${stats.name}</div>
                        <div class="ip-subtitle">Kingdom</div>
                    </div>
                </div>
                <div class="ip-stats">
                    <div class="ip-stat">
                        <span class="ip-stat-label">Population</span>
                        <span class="ip-stat-value">${stats.population.toLocaleString()}</span>
                    </div>
                    <div class="ip-stat">
                        <span class="ip-stat-label">Capital</span>
                        <span class="ip-stat-value">${stats.capitalName || 'Unknown'}</span>
                    </div>
                    <div class="ip-stat">
                        <span class="ip-stat-label">Cities</span>
                        <span class="ip-stat-value">${stats.cityCount}</span>
                    </div>
                    <div class="ip-stat">
                        <span class="ip-stat-label">Territory</span>
                        <span class="ip-stat-value">${stats.cellCount.toLocaleString()} cells</span>
                    </div>
                    ${stats.terrain.coastalCells > 0 ? `
                    <div class="ip-stat">
                        <span class="ip-stat-label">Coastal</span>
                        <span class="ip-stat-value">Yes</span>
                    </div>` : ''}
                </div>
            `;
        }
    } else if (labelHit.type === 'capital') {
        const stats = generator.getCapitalStats(labelHit.index);
        if (stats) {
            html = `
                <div class="ip-header">
                    <span class="ip-icon">⭐</span>
                    <div>
                        <div class="ip-title">${stats.name}</div>
                        <div class="ip-subtitle">Capital of ${stats.kingdomName}</div>
                    </div>
                </div>
                <div class="ip-stats">
                    <div class="ip-stat">
                        <span class="ip-stat-label">Population</span>
                        <span class="ip-stat-value">${stats.population.toLocaleString()}</span>
                    </div>
                    <div class="ip-stat">
                        <span class="ip-stat-label">Elevation</span>
                        <span class="ip-stat-value">${Math.round(stats.elevation)}m</span>
                    </div>
                    ${stats.isCoastal ? `
                    <div class="ip-stat">
                        <span class="ip-stat-label">Coastal</span>
                        <span class="ip-stat-value">Yes</span>
                    </div>` : ''}
                    ${stats.isNearRiver ? `
                    <div class="ip-stat">
                        <span class="ip-stat-label">River Access</span>
                        <span class="ip-stat-value">Yes</span>
                    </div>` : ''}
                </div>
            `;
        }
    } else if (labelHit.type === 'city') {
        const stats = generator.getCityStats(labelHit.index);
        if (stats) {
            html = `
                <div class="ip-header">
                    <span class="ip-icon">🏘️</span>
                    <div>
                        <div class="ip-title">${stats.name}</div>
                        <div class="ip-subtitle">${stats.kingdomName}</div>
                    </div>
                </div>
                <div class="ip-stats">
                    <div class="ip-stat">
                        <span class="ip-stat-label">Population</span>
                        <span class="ip-stat-value">${stats.population.toLocaleString()}</span>
                    </div>
                    <div class="ip-stat">
                        <span class="ip-stat-label">Elevation</span>
                        <span class="ip-stat-value">${Math.round(stats.elevation)}m</span>
                    </div>
                    ${stats.isCoastal ? `
                    <div class="ip-stat">
                        <span class="ip-stat-label">Coastal</span>
                        <span class="ip-stat-value">Yes</span>
                    </div>` : ''}
                    ${stats.isNearRiver ? `
                    <div class="ip-stat">
                        <span class="ip-stat-label">River Access</span>
                        <span class="ip-stat-value">Yes</span>
                    </div>` : ''}
                </div>
            `;
        }
    }
    
    if (html) {
        infoPanelContent.innerHTML = html;
        infoPanel.classList.add('visible');
    }
}

canvas.addEventListener('mousemove', (e) => {
    // Don't update hover while dragging
    if (generator.isDragging) {
        tooltip.classList.remove('visible');
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // In political mode, change cursor on label hover (but no tooltip)
    if (generator.renderMode === 'political') {
        const labelHit = generator.hitTestLabel(x, y);
        
        if (labelHit) {
            canvas.style.cursor = 'pointer';
            lastHoveredLabel = labelHit;
            // Don't show tooltip for labels - click instead
            tooltip.classList.remove('visible');
            return;
        } else {
            canvas.style.cursor = 'grab';
            lastHoveredLabel = null;
        }
    }
    
    const cellIndex = generator.findCell(x, y);
    
    if (cellIndex !== lastHoveredCell) {
        lastHoveredCell = cellIndex;
        
        // Update hover outline (non-political modes only)
        if (generator.renderMode !== 'political') {
            generator.setHoveredCell(cellIndex);
        }
        
        if (cellIndex >= 0) {
            const elevation = generator.getCellHeight(cellIndex);
            const isLand = generator.isLand(cellIndex);
            const isLake = generator.lakeCells && generator.lakeCells.has(cellIndex);
            
            // Build clean tooltip HTML
            let html = '<div class="tt-content">';
            
            // Terrain info
            if (elevation !== null) {
                if (isLake) {
                    const depth = generator.lakeDepths ? generator.lakeDepths.get(cellIndex) || 0 : 0;
                    html += `<div class="tt-terrain tt-lake">`;
                    html += `<span class="tt-icon">💧</span>`;
                    html += `<span class="tt-info">Lake · ${Math.round(depth)}m deep</span>`;
                    html += `</div>`;
                } else if (isLand) {
                    const elev = Math.round(elevation);
                    let terrainType = 'Lowland';
                    if (elev > 2000) terrainType = 'Mountain';
                    else if (elev > 1000) terrainType = 'Highland';
                    else if (elev > 500) terrainType = 'Hills';
                    else if (elev > 200) terrainType = 'Plains';
                    
                    html += `<div class="tt-terrain tt-land">`;
                    html += `<span class="tt-icon">⛰️</span>`;
                    html += `<span class="tt-info">${terrainType} · ${elev}m</span>`;
                    html += `</div>`;
                } else {
                    const depth = Math.round(Math.abs(elevation));
                    let oceanType = 'Shallow';
                    if (depth > 200) oceanType = 'Deep';
                    else if (depth > 100) oceanType = 'Open';
                    
                    html += `<div class="tt-terrain tt-ocean">`;
                    html += `<span class="tt-icon">🌊</span>`;
                    html += `<span class="tt-info">${oceanType} Ocean · ${depth}m</span>`;
                    html += `</div>`;
                }
            }
            
            html += '</div>';
            
            tooltip.innerHTML = html;
            tooltip.classList.add('visible');
        } else {
            tooltip.classList.remove('visible');
        }
    }
    
    // Position tooltip relative to cursor
    if (tooltip.classList.contains('visible')) {
        positionTooltip(e, rect);
    }
});

function positionTooltip(e, rect) {
    const offsetX = 15;
    const offsetY = 15;
    let tooltipX = e.clientX - rect.left + offsetX;
    let tooltipY = e.clientY - rect.top + offsetY;
    
    // Keep tooltip within canvas bounds
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipX + tooltipRect.width > rect.width) {
        tooltipX = e.clientX - rect.left - tooltipRect.width - offsetX;
    }
    if (tooltipY + tooltipRect.height > rect.height) {
        tooltipY = e.clientY - rect.top - tooltipRect.height - offsetY;
    }
    
    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
}

canvas.addEventListener('mouseleave', () => {
    lastHoveredCell = -1;
    lastHoveredLabel = null;
    generator.setHoveredCell(-1);
    tooltip.classList.remove('visible');
});

// ========================================
// WINDOW RESIZE
// ========================================

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        generator.resize();
        updateRenderStats();
    }, 150);
});

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

document.addEventListener('keydown', (e) => {
    // Ignore if typing
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    switch (e.key.toLowerCase()) {
        case 'g':
            generate();
            break;
        case 'h':
            generateHeightmap();
            break;
        case 'p':
            generatePrecipitation();
            break;
        case 'v':
            generateRivers();
            break;
        case 'e':
            showEdgesToggle.checked = !showEdgesToggle.checked;
            showEdgesToggle.dispatchEvent(new Event('change'));
            break;
        case 'c':
            showCentersToggle.checked = !showCentersToggle.checked;
            showCentersToggle.dispatchEvent(new Event('change'));
            break;
        case 'd':
            showDelaunayToggle.checked = !showDelaunayToggle.checked;
            showDelaunayToggle.dispatchEvent(new Event('change'));
            break;
        case 'f':
            showRiversToggle.checked = !showRiversToggle.checked;
            showRiversToggle.dispatchEvent(new Event('change'));
            break;
        case '+':
        case '=':
            generator.setZoom(generator.viewport.zoom * 1.5);
            updateZoomDisplay();
            updateRenderStats();
            break;
        case '-':
        case '_':
            generator.setZoom(generator.viewport.zoom / 1.5);
            updateZoomDisplay();
            updateRenderStats();
            break;
        case '0':
            generator.resetView();
            updateZoomDisplay();
            updateRenderStats();
            break;
        case 'escape':
            infoPanel.classList.remove('visible');
            break;
    }
});

// ========================================
// INITIALIZATION
// ========================================

// Set random seed on load
const randomSeed = Math.floor(Math.random() * 1000000);
seedInput.value = randomSeed;

// Disable edges by default
showEdgesToggle.checked = false;

// Disable contour smoothing by default
subdivisionSlider.value = 0;
subdivisionValue.textContent = '0';

// Sync display options
generator.showEdges = showEdgesToggle.checked;
generator.showCenters = showCentersToggle.checked;
generator.showDelaunay = showDelaunayToggle.checked;
generator.showRivers = showRiversToggle.checked;
generator.showGrid = showGridToggle.checked;
generator.showScale = showScaleToggle.checked;
generator.worldSizeKm = parseInt(worldSizeSlider.value);
generator.renderMode = renderMode.value;
generator.subdivisionLevel = 0;

// Initial generation with loading screen
updateLoadingStatus('Generating cells');

setTimeout(() => {
    const count = parseInt(cellCountInput.value) || 50000;
    const distribution = distributionSelect.value;
    const seed = parseInt(seedInput.value) || Date.now();
    
    // Pass heightmap options for land-biased generation
    const heightmapOptions = {
        seed: seed + 1000,
        algorithm: noiseAlgorithm.value,
        frequency: parseFloat(noiseFrequency.value),
        seaLevel: parseFloat(seaLevel.value),
        falloff: falloffType.value,
        falloffStrength: parseFloat(falloffStrength.value)
    };
    
    const metrics = generator.generate(count, distribution, seed, heightmapOptions);
    statCells.textContent = generator.cellCount.toLocaleString();
    statGenTime.textContent = metrics.genTime.toFixed(1) + 'ms';
    
    updateLoadingStatus('Creating terrain');
    
    setTimeout(() => {
        const heightOptions = {
            seed: seed + 1000,
            algorithm: noiseAlgorithm.value,
            frequency: parseFloat(noiseFrequency.value),
            octaves: parseInt(noiseOctaves.value),
            seaLevel: parseFloat(seaLevel.value),
            falloff: falloffType.value,
            falloffStrength: parseFloat(falloffStrength.value),
            smoothing: parseInt(smoothing.value),
            smoothingStrength: parseFloat(smoothingStrength.value)
        };
        
        generator.generateHeightmap(heightOptions);
        updateLoadingStatus('Eroding terrain');
        
        // Apply hydraulic erosion automatically
        generator.applyHydraulicErosion({
            iterations: parseInt(erosionIterations.value),
            erosionStrength: parseFloat(erosionStrength.value),
            depositionRate: parseFloat(depositionRate.value)
        });
        
        updateLoadingStatus('Simulating climate');
        
        setTimeout(() => {
            generator.generatePrecipitation({
                windDirection: parseInt(windDirection.value),
                windStrength: parseFloat(windStrengthSlider.value)
            });
            
            updateLoadingStatus('Carving rivers');
            
            setTimeout(() => {
                generator.calculateDrainage({
                    numberOfRivers: parseInt(numRiversSlider.value)
                });
                
                updateLoadingStatus('Forming kingdoms');
                
                setTimeout(() => {
                    // Generate kingdoms for political view (default)
                    generator.generateKingdoms(parseInt(numKingdomsSlider.value), parseInt(roadDensitySlider.value));
                    
                    updateLoadingStatus('Rendering');
                    
                    setTimeout(() => {
                        generator.render();
                        
                        // Update stats
                        const landCount = generator.getLandCount();
                        const landPercent = ((landCount / generator.cellCount) * 100).toFixed(1);
                        statLand.textContent = `${landPercent}%`;
                        
                        hideLoading();
                        updateZoomDisplay();
                        console.log('Voronoi Map Generator initialized');
                    }, 50);
                }, 50);
            }, 50);
        }, 50);
    }, 50);
}, 100);

console.log('Shortcuts: G=Generate, H=Heightmap, P=Precipitation, V=Rivers, F=Toggle Rivers, E=Edges, C=Centers, D=Delaunay, +/-=Zoom, 0=Reset');
