/**
 * VORONOI MAP GENERATOR - APPLICATION
 * UI controller and event handling
 */

import { VoronoiGenerator } from './voronoi-generator.js?v=200';

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

// DOM Elements - Climate
const windDirection = document.getElementById('wind-direction');
const windStrengthSlider = document.getElementById('wind-strength');
const windStrengthValue = document.getElementById('wind-strength-value');
const generatePrecipBtn = document.getElementById('generate-precip-btn');
const generateRiversBtn = document.getElementById('generate-rivers-btn');
const showRiversToggle = document.getElementById('show-rivers');
const showRiverSourcesToggle = document.getElementById('show-river-sources');
const numRiversSlider = document.getElementById('num-rivers');
const numRiversValue = document.getElementById('num-rivers-value');

// DOM Elements - Political
const numKingdomsSlider = document.getElementById('num-kingdoms');
const numKingdomsValue = document.getElementById('num-kingdoms-value');
const generateKingdomsBtn = document.getElementById('generate-kingdoms-btn');
const dashedBordersToggle = document.getElementById('dashed-borders');

// DOM Elements - Display
const renderMode = document.getElementById('render-mode');
const subdivisionSlider = document.getElementById('subdivision');
const subdivisionValue = document.getElementById('subdivision-value');
const showEdgesToggle = document.getElementById('show-edges');
const showCentersToggle = document.getElementById('show-centers');
const showDelaunayToggle = document.getElementById('show-delaunay');

// DOM Elements - Viewport
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLevelDisplay = document.getElementById('zoom-level');
const suggestedCellsDisplay = document.getElementById('suggested-cells');
const redrawBtn = document.getElementById('redraw-btn');

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

function generate() {
    const count = parseInt(cellCountInput.value) || 50000;
    const distribution = distributionSelect.value;
    const seed = parseInt(seedInput.value) || Date.now();
    
    // Validate count
    const validCount = Math.max(100, Math.min(100000, count));
    cellCountInput.value = validCount;
    
    // Show loading state
    generateBtn.classList.add('loading');
    generateBtn.textContent = 'Generating';
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
        const metrics = generator.generate(validCount, distribution, seed);
        
        // Update stats
        statCells.textContent = validCount.toLocaleString();
        statLand.textContent = '—';
        statGenTime.textContent = metrics.genTime.toFixed(1) + 'ms';
        statRenderTime.textContent = metrics.renderTime.toFixed(1) + 'ms';
        
        // Reset button
        generateBtn.classList.remove('loading');
        generateBtn.textContent = 'Generate';
        
        // Auto-generate heightmap
        generateHeightmap();
    }, 10);
}

generateBtn.addEventListener('click', generate);

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
    
    const seed = parseInt(seedInput.value) || 12345;
    
    const options = {
        seed: seed + 1000, // Offset from cell seed
        algorithm: noiseAlgorithm.value,
        frequency: parseFloat(noiseFrequency.value),
        octaves: parseInt(noiseOctaves.value),
        seaLevel: parseFloat(seaLevel.value),
        falloff: falloffType.value,
        falloffStrength: parseFloat(falloffStrength.value),
        smoothing: parseInt(smoothing.value),
        smoothingStrength: parseFloat(smoothingStrength.value)
    };
    
    generateHeightmapBtn.classList.add('loading');
    generateHeightmapBtn.textContent = 'Generating';
    
    setTimeout(() => {
        generator.generateHeightmap(options);
        
        // Always generate precipitation and drainage for flow visualization
        generator.generatePrecipitation({
            windDirection: parseInt(windDirection.value),
            windStrength: parseFloat(windStrengthSlider.value)
        });
        generator.calculateDrainage({
            numberOfRivers: parseInt(numRiversSlider.value)
        });
        
        // Auto-generate kingdoms if in political mode
        if (generator.renderMode === 'political') {
            generator.generateKingdoms(parseInt(numKingdomsSlider.value));
        }
        
        generator.render();
        
        // Update stats
        const landCount = generator.getLandCount();
        const landPercent = ((landCount / generator.cellCount) * 100).toFixed(1);
        statLand.textContent = `${landPercent}%`;
        statRenderTime.textContent = generator.metrics.renderTime.toFixed(1) + 'ms';
        
        generateHeightmapBtn.classList.remove('loading');
        generateHeightmapBtn.textContent = 'Generate Heightmap';
    }, 10);
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
        
        // Switch to flow arrows view
        renderMode.value = 'rivers';
        generator.renderMode = 'rivers';
        generator.render();
        updateRenderStats();
        
        generateRiversBtn.classList.remove('loading');
        generateRiversBtn.textContent = 'Generate Rivers';
        
        console.log(`Created ${generator.rivers.length} rivers, ${generator.lakes.length} lakes`);
    }, 10);
}

generateRiversBtn.addEventListener('click', generateRivers);

// ========================================
// POLITICAL OPTIONS
// ========================================

numKingdomsSlider.addEventListener('input', (e) => {
    numKingdomsValue.textContent = e.target.value;
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
            generator.generateKingdoms(parseInt(numKingdomsSlider.value));
            
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
        generator.generateKingdoms(parseInt(numKingdomsSlider.value));
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

showRiverSourcesToggle.addEventListener('change', (e) => {
    generator.showRiverSources = e.target.checked;
    generator.render();
    updateRenderStats();
});

dashedBordersToggle.addEventListener('change', (e) => {
    generator.dashedBorders = e.target.checked;
    generator.render();
    updateRenderStats();
});

function updateRenderStats() {
    statRenderTime.textContent = generator.metrics.renderTime.toFixed(1) + 'ms';
    if (statVisible) {
        statVisible.textContent = generator.metrics.visibleCells?.toLocaleString() || generator.cellCount.toLocaleString();
    }
}

function updateZoomDisplay() {
    const zoom = generator.viewport.zoom;
    zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
    
    // Update suggested cells based on zoom
    const suggested = generator.getSuggestedCellCount();
    suggestedCellsDisplay.textContent = suggested.toLocaleString();
    
    // Enable/disable redraw button based on zoom
    redrawBtn.disabled = zoom <= 1.0;
    redrawBtn.title = zoom <= 1.0 
        ? 'Zoom in first to enable redraw' 
        : `Regenerate ${suggested.toLocaleString()} cells for current view`;
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

// Redraw at enhanced resolution
redrawBtn.addEventListener('click', () => {
    if (generator.viewport.zoom <= 1.0) {
        console.log('Zoom in first to use redraw');
        return;
    }
    
    redrawBtn.disabled = true;
    redrawBtn.textContent = 'Redrawing...';
    
    // Use requestAnimationFrame to let UI update
    requestAnimationFrame(() => {
        const result = generator.redrawAtResolution({
            regenerateHeightmap: true
        });
        
        if (result) {
            console.log(`Redrew with ${result.newCellCount.toLocaleString()} cells (was ${generator.viewport.zoom.toFixed(1)}x zoom)`);
            
            // Update all stats
            statCells.textContent = generator.cellCount.toLocaleString();
            statGenTime.textContent = generator.metrics.genTime.toFixed(1) + 'ms';
            
            const landCount = generator.getLandCount();
            const landPercent = ((landCount / generator.cellCount) * 100).toFixed(1);
            statLand.textContent = `${landPercent}%`;
        }
        
        redrawBtn.textContent = 'Redraw at Resolution';
        updateZoomDisplay();
        updateRenderStats();
    });
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
const tooltip = document.getElementById('cell-tooltip');

canvas.addEventListener('mousemove', (e) => {
    // Don't update hover while dragging
    if (generator.isDragging) {
        tooltip.classList.remove('visible');
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
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
            
            // Check for kingdom info
            const hasKingdom = generator.kingdoms && generator.kingdoms[cellIndex] >= 0;
            const kingdomId = hasKingdom ? generator.kingdoms[cellIndex] : -1;
            const kingdomName = hasKingdom && generator.kingdomNames ? generator.kingdomNames[kingdomId] : null;
            
            // Build clean tooltip HTML
            let html = '<div class="tt-content">';
            
            // Kingdom name as title (if available and in political mode)
            if (generator.renderMode === 'political' && kingdomName) {
                html += `<div class="tt-title">${kingdomName}</div>`;
            }
            
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
});

canvas.addEventListener('mouseleave', () => {
    lastHoveredCell = -1;
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
        case 'r':
            // Redraw at resolution
            if (generator.viewport.zoom > 1.0) {
                redrawBtn.click();
            }
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
generator.renderMode = renderMode.value;
generator.subdivisionLevel = 0;

// Initial generation with loading screen
updateLoadingStatus('Generating cells');

setTimeout(() => {
    const count = parseInt(cellCountInput.value) || 50000;
    const distribution = distributionSelect.value;
    const seed = parseInt(seedInput.value) || Date.now();
    
    const metrics = generator.generate(count, distribution, seed);
    statCells.textContent = count.toLocaleString();
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
                    generator.generateKingdoms(parseInt(numKingdomsSlider.value));
                    
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

console.log('Shortcuts: G=Generate, H=Heightmap, P=Precipitation, V=Flow, F=Rivers, R=Redraw, E=Edges, C=Centers, D=Delaunay, +/-=Zoom, 0=Reset');
