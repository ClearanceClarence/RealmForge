/**
 * VORONOI MAP GENERATOR - APPLICATION
 * UI controller and event handling
 */

import { VoronoiGenerator } from './voronoi-generator.js';
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

// Lore-flavor messages cycled while the loading screen is open. These read
// like fragments from a creation myth — the world being shaped beneath the
// reader's gaze. Order is intentional: starts mysterious, builds to civilizations.
const flavorTexts = [
    "The world stirs awake...",
    "Mountains rise from the depths...",
    "Rivers carve their ancient paths...",
    "Forests spread across the lowlands...",
    "Storms gather over uncharted seas...",
    "The first travelers walk the wilderness...",
    "Hearths kindle in distant valleys...",
    "Fortresses are raised against the dark...",
    "Borders are drawn in blood and ink...",
    "Names are whispered into being...",
    "Crowns find their first heads...",
    "Roads stretch between rising kingdoms...",
    "The cartographer takes up the quill..."
];
let currentFlavorIndex = 0;
const flavorTextEl = document.getElementById('flavor-text');

// Rotate flavor text periodically
setInterval(() => {
    if (flavorTextEl && !loadingScreen.classList.contains('hidden')) {
        currentFlavorIndex = (currentFlavorIndex + 1) % flavorTexts.length;
        flavorTextEl.style.opacity = '0';
        setTimeout(() => {
            flavorTextEl.textContent = flavorTexts[currentFlavorIndex];
            flavorTextEl.style.opacity = '1';
        }, 300);
    }
}, 3000);

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
const coastJaggedness = document.getElementById('coast-jaggedness');
const coastJaggednessValue = document.getElementById('coast-jaggedness-value');
const islandDensity = document.getElementById('island-density');
const islandDensityValue = document.getElementById('island-density-value');
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
const lakeDensitySlider = document.getElementById('lake-density');
const lakeDensityValue = document.getElementById('lake-density-value');
const lakeSizeSlider = document.getElementById('lake-size');
const lakeSizeValue = document.getElementById('lake-size-value');

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
const showEdgesToggle = document.getElementById('show-edges');
const showCoastlineToggle = document.getElementById('show-coastline');
const showCentersToggle = document.getElementById('show-centers');
const showDelaunayToggle = document.getElementById('show-delaunay');
const showGridToggle = document.getElementById('show-grid');

// DOM Elements - Viewport
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLevelDisplay = document.getElementById('zoom-level');

// DOM Elements - Overlays
const heightmapOverlay = document.getElementById('heightmap-overlay');
const toggleHeightmapBtn = document.getElementById('toggle-heightmap');
const depthOverlay = document.getElementById('depth-overlay');
const toggleDepthBtn = document.getElementById('toggle-depth');

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
        falloffStrength: parseFloat(falloffStrength.value),
        islandDensity: parseFloat(islandDensity.value)
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
    // Broaden coastlines (sprinkle was done in worker, broaden needs neighbours
    // so it has to run here on the main thread where the Voronoi diagram exists)
    if (useWorkerGeneration && generator.islandDensity > 0) {
        updateLoadingStatus('Carving coastlines...');
        await new Promise(resolve => setTimeout(resolve, 10));
        generator._broadenCoastlines(seed + 1000, generator.islandDensity);
    }
    
    // Apply per-cell coastal noise for jagged shorelines.
    // Worker can't do this either (needs voronoi.neighbors).
    if (useWorkerGeneration && generator.coastJaggedness > 0) {
        updateLoadingStatus('Roughing coastlines...');
        await new Promise(resolve => setTimeout(resolve, 10));
        generator._applyCoastalNoise(seed + 1000, generator.coastJaggedness);
    }
    
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

coastJaggedness.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    coastJaggednessValue.textContent = v.toFixed(2);
    // Jaggedness is now baked into the cell graph during heightmap generation.
    // Just store the value; takes effect on next "Regenerate" / "New World" click.
    generator.coastJaggedness = v;
});

islandDensity.addEventListener('input', (e) => {
    islandDensityValue.textContent = parseFloat(e.target.value).toFixed(2);
    // Just store the value; takes effect on next world generation
    generator.islandDensity = parseFloat(e.target.value);
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

// Lake sliders
lakeDensitySlider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    lakeDensityValue.textContent = v.toFixed(2);
    generator.lakeDensity = v;
});

lakeDensitySlider.addEventListener('change', (e) => {
    // Re-run drainage so lakes regenerate with the new density
    if (generator.heights) {
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value),
            lakeDensity: generator.lakeDensity,
            lakeMinDepth: generator.lakeMinDepth
        });
        // Drop any pre-existing roads that the new lakes have swallowed
        generator.pruneRoadsAcrossLakes();
        generator.render();
        updateRenderStats();
    }
});

lakeSizeSlider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    lakeSizeValue.textContent = v.toFixed(2);
    generator.lakeMinDepth = v;
});

lakeSizeSlider.addEventListener('change', (e) => {
    if (generator.heights) {
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value),
            lakeDensity: generator.lakeDensity,
            lakeMinDepth: generator.lakeMinDepth
        });
        generator.pruneRoadsAcrossLakes();
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

showEdgesToggle.addEventListener('change', (e) => {
    generator.showEdges = e.target.checked;
    generator.render();
    updateRenderStats();
});

showCoastlineToggle.addEventListener('change', (e) => {
    generator.showCoastline = e.target.checked;
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
    if (!heightmapOverlay && !depthOverlay) return;
    
    const last = lastOverlayViewport;
    const curr = generator.viewport;
    
    // Calculate the transform relative to last rendered state
    const scale = curr.zoom / last.zoom;
    const dx = curr.x - last.x * scale;
    const dy = curr.y - last.y * scale;
    
    const cssTransform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    if (heightmapOverlayActive && heightmapOverlay) {
        heightmapOverlay.style.transformOrigin = '0 0';
        heightmapOverlay.style.transform = cssTransform;
    }
    if (depthOverlayActive && depthOverlay) {
        depthOverlay.style.transformOrigin = '0 0';
        depthOverlay.style.transform = cssTransform;
    }
}

function resetOverlayTransform() {
    if (heightmapOverlay) heightmapOverlay.style.transform = '';
    if (depthOverlay) depthOverlay.style.transform = '';
    lastOverlayViewport = {
        x: generator.viewport.x,
        y: generator.viewport.y,
        zoom: generator.viewport.zoom
    };
}

// ─── Sea-depth overlay ───
// Mirror of the heightmap-overlay machinery, but it draws WATER cells
// shaded by depth (light blue near the coast, deep blue far below sea
// level). Independent of the elevation overlay — both can be on at
// once and the user gets a layered view of land elevation + sea depth.
let depthOverlayActive = false;
let depthCtx = null;

if (toggleDepthBtn && depthOverlay) {
    depthCtx = depthOverlay.getContext('2d');
    
    toggleDepthBtn.addEventListener('click', () => {
        depthOverlayActive = !depthOverlayActive;
        toggleDepthBtn.classList.toggle('active', depthOverlayActive);
        depthOverlay.classList.toggle('active', depthOverlayActive);
        
        if (depthOverlayActive) {
            // Sync viewport reference if depth is the FIRST overlay
            // turned on (so its transform math matches the live map);
            // if heightmap is already on, lastOverlayViewport is
            // already correct.
            if (!heightmapOverlayActive) {
                lastOverlayViewport = {
                    x: generator.viewport.x,
                    y: generator.viewport.y,
                    zoom: generator.viewport.zoom
                };
            }
            renderDepthOverlay();
        }
    });
}

function renderDepthOverlay() {
    if (!depthOverlay || !depthCtx) return;
    if (!generator.heights || !generator.voronoi) return;
    
    const dpr = generator.dpr || window.devicePixelRatio || 1;
    depthOverlay.width = generator.width * dpr;
    depthOverlay.height = generator.height * dpr;
    depthOverlay.style.width = generator.width + 'px';
    depthOverlay.style.height = generator.height + 'px';
    
    depthCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    depthCtx.clearRect(0, 0, generator.width, generator.height);
    
    depthCtx.save();
    depthCtx.translate(generator.viewport.x, generator.viewport.y);
    depthCtx.scale(generator.viewport.zoom, generator.viewport.zoom);
    
    const heights = generator.heights;
    const numCells = generator.cellCount;
    
    // Heights: sea level = 0, ocean floor = roughly -4000m. Draw water
    // cells (and lake cells, which carry water-class but positive
    // height in this.lakeCells — we cover those by also reading
    // lakeCells if present).
    const minDepth = -4000;
    const lakeCells = generator.lakeCells || null;
    
    depthCtx.lineWidth = 1.5 / generator.viewport.zoom;
    depthCtx.lineJoin = 'round';
    
    for (let i = 0; i < numCells; i++) {
        const h = heights[i];
        const isLake = lakeCells && lakeCells.has(i);
        // Skip non-water cells. Water = ocean (h<0) or lake.
        if (h >= 0 && !isLake) continue;
        
        let polygon;
        try {
            polygon = generator.voronoi.cellPolygon(i);
        } catch (e) {
            continue;
        }
        if (!polygon || polygon.length < 3) continue;
        
        // Depth in 0..1: 0 = at sea level (lightest), 1 = deepest.
        // Lake cells get treated as shallow water.
        let depth01;
        if (isLake) {
            depth01 = 0.15;
        } else {
            depth01 = Math.min(1, Math.max(0, h / minDepth));
        }
        
        // Contrast curve so the gradient leans toward shallow tones —
        // most ocean is "deep" so without bending the curve, the whole
        // sea reads as one flat dark blue and you can't see the
        // continental shelf.
        const contrast = Math.pow(depth01, 0.55);
        
        // Blue ramp: shallow = pale icy blue, deep = navy.
        // RGB interpolation between (210,232,242) and (28,52,98).
        const sr = 210, sg = 232, sb = 242;
        const dr =  28, dg =  52, db =  98;
        const r = Math.round(sr + (dr - sr) * contrast);
        const g = Math.round(sg + (dg - sg) * contrast);
        const b = Math.round(sb + (db - sb) * contrast);
        const color = `rgb(${r}, ${g}, ${b})`;
        
        depthCtx.fillStyle = color;
        depthCtx.strokeStyle = color;
        depthCtx.beginPath();
        depthCtx.moveTo(polygon[0][0], polygon[0][1]);
        for (let j = 1; j < polygon.length; j++) {
            depthCtx.lineTo(polygon[j][0], polygon[j][1]);
        }
        depthCtx.closePath();
        depthCtx.fill();
        depthCtx.stroke();
    }
    
    depthCtx.restore();
}

// Update overlay when map is re-rendered (full render)
const originalRender = generator.render.bind(generator);
generator.render = function(...args) {
    originalRender(...args);
    if (heightmapOverlayActive) {
        resetOverlayTransform();
        renderHeightmapOverlay();
    }
    if (depthOverlayActive) {
        resetOverlayTransform();
        renderDepthOverlay();
    }
};

// Apply CSS transform during low-res render (interaction)
const originalRenderLowRes = generator.renderLowRes.bind(generator);
generator.renderLowRes = function(...args) {
    originalRenderLowRes(...args);
    if (heightmapOverlayActive || depthOverlayActive) {
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
            const cultureDisplay = stats.culture
                ? stats.culture.charAt(0).toUpperCase() + stats.culture.slice(1)
                : null;
            
            const esc = (s) => String(s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            // Round population to nearest 100 for display. The internal
            // values stay precise — only the popup smooths them.
            const round100 = (n) => Math.round((n || 0) / 100) * 100;
            const fmtPop = (n) => round100(n).toLocaleString();
            
            // Build the settlements table (capital row first, then
            // non-port cities sorted by population desc — ports are
            // EXCLUDED from this table per the design and shown in
            // their own table below).
            const settlementRows = [];
            // Capital always leads, with a ★ marker. If the capital
            // happens to also be a port, that's still fine to show
            // here as the headline of the kingdom — ports table will
            // not duplicate it.
            const capStar = '<span class="ip-tag ip-tag-capital">Capital</span>';
            const capPort = stats.capitalIsPort
                ? ' <span class="ip-tag ip-tag-port">⚓ Port</span>'
                : '';
            settlementRows.push(`
                <tr>
                    <td class="ip-tbl-name">${esc(stats.capitalName || 'Unknown')}</td>
                    <td class="ip-tbl-pop">${fmtPop(stats.capitalPopulation)}</td>
                    <td class="ip-tbl-tag">${capStar}${capPort}</td>
                </tr>
            `);
            for (const s of stats.settlements) {
                settlementRows.push(`
                    <tr>
                        <td class="ip-tbl-name">${esc(s.name)}</td>
                        <td class="ip-tbl-pop">${fmtPop(s.population)}</td>
                        <td class="ip-tbl-tag"></td>
                    </tr>
                `);
            }
            
            // Ports table — only rendered if there are non-capital ports.
            // (The capital can be a port and is marked above; we don't
            // re-list it here.)
            const portsTable = stats.ports.length > 0 ? `
                <div class="ip-section">
                    <div class="ip-section-title">Ports</div>
                    <div class="ip-table-scroll">
                        <table class="ip-table">
                            <thead>
                                <tr>
                                    <th class="ip-tbl-name">Name</th>
                                    <th class="ip-tbl-pop">Population</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.ports.map(p => `
                                    <tr>
                                        <td class="ip-tbl-name">⚓ ${esc(p.name)}</td>
                                        <td class="ip-tbl-pop">${fmtPop(p.population)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : '';
            
            // Coat of arms via Armoria API.
            // https://armoria.vercel.app/api/svg/{size}/{seed}?shield={shape}
            //
            // The seed (kingdom name) drives all procedural choices —
            // tinctures, ordinaries, charges — so each kingdom has a
            // stable, unique coat of arms. The shield SHAPE is then
            // overridden per culture so the silhouette carries cultural
            // signal: Norse round shields, Tolkien-elf noldor crests,
            // Polish szczyt for slavic realms, etc.
            //
            // Fallback: if the culture isn't recognised, no `shield`
            // override is sent and Armoria uses its default (heater).
            const cultureShields = {
                germanic:     'hessen',
                norse:        'targe',         // round was unsupported; targe reads similar
                celtic:       'targe2',
                romance:      'french',        // oldFrench was unsupported; modern french heater
                slavic:       'polish',
                hellenic:     'boeotian',
                arabic:       'kite',
                eastasian:    'square',
                mesoamerican: 'wedged',        // roman was unsupported; wedged is the closest broad-bottomed shape
                african:      'oval',
                elvish:       'gondor',        // noldor was unsupported; gondor is also Tolkien-elven
                dwarven:      'erebor',
                orcish:       'urukHai'
            };
            const shieldShape = cultureShields[stats.culture] || null;
            
            const coaSeed = encodeURIComponent(stats.name);
            const coaUrl = shieldShape
                ? `https://armoria.vercel.app/api/svg/200/${coaSeed}?shield=${shieldShape}`
                : `https://armoria.vercel.app/api/svg/200/${coaSeed}`;
            
            html = `
                <div class="ip-kingdom-header">
                    <div class="ip-coat" aria-label="Coat of arms">
                        <img src="${coaUrl}" alt="" loading="lazy"
                             onerror="this.style.display='none'">
                    </div>
                    <div class="ip-kingdom-titles">
                        <div class="ip-title">${esc(stats.name)}</div>
                        <div class="ip-subtitle">
                            ${cultureDisplay ? `<span class="ip-culture">${cultureDisplay}</span>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="ip-kingdom-summary">
                    <div class="ip-summary-row">
                        <span class="ip-summary-label">Population</span>
                        <span class="ip-summary-value">${fmtPop(stats.population)}</span>
                    </div>
                    <div class="ip-summary-row">
                        <span class="ip-summary-label">Cities</span>
                        <span class="ip-summary-value">${stats.cityCount}${stats.ports.length > 0 ? ` <span class="ip-summary-aside">(${stats.ports.length} ${stats.ports.length === 1 ? 'port' : 'ports'})</span>` : ''}</span>
                    </div>
                </div>
                
                <div class="ip-section">
                    <div class="ip-section-title">Settlements</div>
                    <div class="ip-table-scroll">
                        <table class="ip-table">
                            <thead>
                                <tr>
                                    <th class="ip-tbl-name">Name</th>
                                    <th class="ip-tbl-pop">Population</th>
                                    <th class="ip-tbl-tag"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${settlementRows.join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                ${portsTable}
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
generator.showCoastline = showCoastlineToggle.checked;
generator.showCenters = showCentersToggle.checked;
generator.showDelaunay = showDelaunayToggle.checked;
generator.showRivers = showRiversToggle.checked;
generator.showGrid = showGridToggle.checked;
generator.renderMode = renderMode.value;
generator.subdivisionLevel = 0;
generator.coastJaggedness = parseFloat(coastJaggedness.value);
generator.islandDensity = parseFloat(islandDensity.value);
generator.lakeDensity = parseFloat(lakeDensitySlider.value);
generator.lakeMinDepth = parseFloat(lakeSizeSlider.value);

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
        falloffStrength: parseFloat(falloffStrength.value),
        islandDensity: parseFloat(islandDensity.value)
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

// ============================================================
// COLLAPSIBLE SIDEBAR SECTIONS
// ============================================================
// Each .ctrl-section can be collapsed by clicking its head. State is saved
// to localStorage under 'realmforge.collapsed.<section-id>' so the user's
// preference survives reloads.

(function setupCollapsibleSections() {
    const sections = document.querySelectorAll('.ctrl-section');
    sections.forEach(sec => {
        const head = sec.querySelector('.ctrl-section-head');
        if (!head) return;
        
        const id = sec.dataset.sectionId
                || head.querySelector('span')?.textContent?.trim().toLowerCase()
                || '';
        const storageKey = `realmforge.collapsed.${id}`;
        
        // Restore previous state
        if (localStorage.getItem(storageKey) === '1') {
            sec.classList.add('collapsed');
        }
        
        head.addEventListener('click', (e) => {
            // Don't toggle when clicking buttons inside the head
            if (e.target.closest('.ctrl-action-btn, button')) return;
            sec.classList.toggle('collapsed');
            localStorage.setItem(storageKey, sec.classList.contains('collapsed') ? '1' : '0');
        });
    });
})();

// ============================================================
// STYLE PRESETS
// ============================================================
// Each preset is a bundle of slider/select values. Selecting a preset
// applies them to the controls and triggers any necessary recomputation.
// "Custom" means the user is hand-tuning — selecting it does nothing.
// If the user touches any control after applying a preset, the dropdown
// auto-flips back to Custom (so it's clear the settings have diverged).

const STYLE_PRESETS = {
    tolkien: {
        label: 'Middle-earth',
        // Big single continent, eroded mountainous, prominent rivers, several
        // kingdoms with varying sizes — Westmarch / Gondor / Mordor feel
        'noise-algorithm': 'eroded',
        'noise-frequency': 2.5,
        'noise-octaves': 6,
        'sea-level': 0.42,
        'falloff-type': 'continental',
        'falloff-strength': 0.75,
        'smoothing': 1,
        'coast-jaggedness': 0.6,
        'island-density': 0.2,
        'erosion-iterations': 200000,
        'erosion-strength': 1.0,
        'deposition-rate': 0.6,
        'wind-strength': 0.7,
        'num-rivers': 35,
        'lake-density': 0.4,
        'lake-size': 0.5,
        'num-kingdoms': 10,
        'road-density': 7
    },
    westeros: {
        label: 'Westeros',
        // Long N-S continent with many kingdoms (the Seven Kingdoms!),
        // moderate jaggedness, lots of rivers
        'noise-algorithm': 'continental',
        'noise-frequency': 3.0,
        'noise-octaves': 6,
        'sea-level': 0.45,
        'falloff-type': 'continental',
        'falloff-strength': 0.7,
        'smoothing': 0,
        'coast-jaggedness': 0.7,
        'island-density': 0.35,
        'erosion-iterations': 150000,
        'erosion-strength': 0.9,
        'deposition-rate': 0.5,
        'wind-strength': 0.8,
        'num-rivers': 50,
        'lake-density': 0.3,
        'lake-size': 0.3,
        'num-kingdoms': 14,
        'road-density': 8
    },
    earthlike: {
        label: 'Earth-like',
        // Two-continent configuration with realistic erosion and lots of variety
        'noise-algorithm': 'fbm',
        'noise-frequency': 3.5,
        'noise-octaves': 7,
        'sea-level': 0.5,
        'falloff-type': 'two-continents',
        'falloff-strength': 0.6,
        'smoothing': 1,
        'coast-jaggedness': 0.55,
        'island-density': 0.4,
        'erosion-iterations': 200000,
        'erosion-strength': 0.95,
        'deposition-rate': 0.6,
        'wind-strength': 0.85,
        'num-rivers': 40,
        'lake-density': 0.4,
        'lake-size': 0.4,
        'num-kingdoms': 16,
        'road-density': 7
    },
    alien: {
        label: 'Alien World',
        // Strange noise + warped terrain + extreme jaggedness
        'noise-algorithm': 'multiwarp',
        'noise-frequency': 5.0,
        'noise-octaves': 8,
        'sea-level': 0.35,
        'falloff-type': 'none',
        'falloff-strength': 0.3,
        'smoothing': 0,
        'coast-jaggedness': 0.95,
        'island-density': 0.7,
        'erosion-iterations': 50000,
        'erosion-strength': 0.5,
        'deposition-rate': 0.3,
        'wind-strength': 0.5,
        'num-rivers': 25,
        'lake-density': 0.7,
        'lake-size': 0.2,
        'num-kingdoms': 8,
        'road-density': 4
    },
    archipelago: {
        label: 'Archipelago Realms',
        // Tons of islands, smaller kingdoms each on their own
        'noise-algorithm': 'fbm',
        'noise-frequency': 4.0,
        'noise-octaves': 6,
        'sea-level': 0.55,
        'falloff-type': 'archipelago',
        'falloff-strength': 0.5,
        'smoothing': 1,
        'coast-jaggedness': 0.7,
        'island-density': 0.8,
        'erosion-iterations': 100000,
        'erosion-strength': 0.7,
        'deposition-rate': 0.5,
        'wind-strength': 0.9,
        'num-rivers': 20,
        'lake-density': 0.2,
        'lake-size': 0.2,
        'num-kingdoms': 18,
        'road-density': 5
    },
    frozen: {
        label: 'Frozen North',
        // Lake-world preset, jagged coastline, fewer kingdoms (harsh land)
        'noise-algorithm': 'ridged',
        'noise-frequency': 3.0,
        'noise-octaves': 7,
        'sea-level': 0.4,
        'falloff-type': 'lake-world',
        'falloff-strength': 0.6,
        'smoothing': 0,
        'coast-jaggedness': 0.85,
        'island-density': 0.5,
        'erosion-iterations': 80000,
        'erosion-strength': 0.6,
        'deposition-rate': 0.4,
        'wind-strength': 0.5,
        'num-rivers': 30,
        'lake-density': 0.85,
        'lake-size': 0.4,
        'num-kingdoms': 6,
        'road-density': 4
    }
};

(function setupStylePresets() {
    const presetSelect = document.getElementById('style-preset');
    if (!presetSelect) return;
    
    let isApplyingPreset = false;
    
    function applyPreset(name) {
        const preset = STYLE_PRESETS[name];
        if (!preset) return;
        
        isApplyingPreset = true;
        try {
            for (const [id, value] of Object.entries(preset)) {
                if (id === 'label') continue;
                const el = document.getElementById(id);
                if (!el) continue;
                
                el.value = value;
                
                // Update value display if present (e.g. for sliders)
                const valDisplay = document.getElementById(id + '-value');
                if (valDisplay) {
                    if (typeof value === 'number' && !Number.isInteger(value)) {
                        valDisplay.textContent = value.toFixed(2);
                    } else {
                        valDisplay.textContent = value;
                    }
                }
                
                // Fire input event so listeners react
                el.dispatchEvent(new Event('input', { bubbles: true }));
                // Also fire change for select/checkbox
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } finally {
            // Allow a tick for any reactive listeners before clearing flag
            setTimeout(() => { isApplyingPreset = false; }, 50);
        }
    }
    
    presetSelect.addEventListener('change', () => {
        const v = presetSelect.value;
        if (v && v !== 'custom') {
            applyPreset(v);
        }
    });
    
    // If user touches any slider/select after a preset is applied,
    // flip the preset selector back to "Custom" (so it's clear the
    // values no longer match the named preset).
    document.querySelectorAll('.sidebar input, .sidebar select').forEach(el => {
        if (el.id === 'style-preset') return;
        el.addEventListener('input', () => {
            if (isApplyingPreset) return;
            if (presetSelect.value !== 'custom') {
                presetSelect.value = 'custom';
            }
        });
    });
})();

