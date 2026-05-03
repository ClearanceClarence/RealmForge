/**
 * GENERATION WORKER - Phase 2 Implementation
 * Offloads heavy computation from main thread for responsive UI
 */

importScripts('https://cdn.jsdelivr.net/npm/d3-delaunay@6.0.4/dist/d3-delaunay.min.js');

// PRNG
const PRNG = {
    seed: 12345,
    setSeed(s) { this.seed = s >>> 0; },
    random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
};

// Simplex Noise
const Noise = {
    perm: null,
    permMod12: null,
    grad3: [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],
    F2: 0.5 * (Math.sqrt(3) - 1),
    G2: (3 - Math.sqrt(3)) / 6,
    
    init(seed) {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = seed >>> 0;
        for (let i = 255; i > 0; i--) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const j = s % (i + 1);
            [p[i], p[j]] = [p[j], p[i]];
        }
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
    },
    
    simplex2(xin, yin) {
        const F2 = this.F2, G2 = this.G2;
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s), j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - (i - t), y0 = yin - (j - t);
        const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const ii = i & 255, jj = j & 255;
        const gi0 = this.permMod12[ii + this.perm[jj]];
        const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
        const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
        
        let n0 = 0, n1 = 0, n2 = 0;
        let t0 = 0.5 - x0*x0 - y0*y0;
        if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (this.grad3[gi0][0]*x0 + this.grad3[gi0][1]*y0); }
        let t1 = 0.5 - x1*x1 - y1*y1;
        if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (this.grad3[gi1][0]*x1 + this.grad3[gi1][1]*y1); }
        let t2 = 0.5 - x2*x2 - y2*y2;
        if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (this.grad3[gi2][0]*x2 + this.grad3[gi2][1]*y2); }
        return 70 * (n0 + n1 + n2);
    },
    
    fbm(x, y, opt = {}) {
        const { frequency = 3, octaves = 6, persistence = 0.5, lacunarity = 2 } = opt;
        let value = 0, amplitude = 1, freq = frequency, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.simplex2(x * freq, y * freq);
            maxValue += amplitude;
            amplitude *= persistence;
            freq *= lacunarity;
        }
        return value / maxValue;
    },
    
    ridged(x, y, opt = {}) {
        const { frequency = 3, octaves = 6, persistence = 0.5, lacunarity = 2 } = opt;
        let value = 0, amplitude = 1, freq = frequency, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            let n = 1 - Math.abs(this.simplex2(x * freq, y * freq));
            n = n * n;
            value += amplitude * n;
            maxValue += amplitude;
            amplitude *= persistence;
            freq *= lacunarity;
        }
        return (value / maxValue) * 2 - 1;
    },
    
    warped(x, y, opt = {}) {
        const { frequency = 3, octaves = 6, warpStrength = 0.4 } = opt;
        const warpX = this.fbm(x + 100, y + 100, { frequency, octaves: 3 }) * warpStrength;
        const warpY = this.fbm(x + 200, y + 200, { frequency, octaves: 3 }) * warpStrength;
        return this.fbm(x + warpX, y + warpY, { frequency, octaves });
    }
};

const ELEVATION = { MIN: -4000, MAX: 6000, SEA_LEVEL: 0 };

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

/**
 * World-shape mask. Mirrors VoronoiGenerator._applyWorldMask().
 * Keep this in sync with the main-thread implementation.
 */
function applyWorldMask(h, x, y, width, height, preset, strength) {
    if (preset === 'none' || strength <= 0) return h;
    
    const cx = width / 2, cy = height / 2;
    const dx = (x - cx) / cx;
    const dy = (y - cy) / cy;
    const nx = x / width;
    const ny = y / height;
    
    let mult = 1, add = 0;
    
    switch (preset) {
        case 'radial': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            mult = 1 - smoothstep(0.3, 1.0, dist) * strength;
            break;
        }
        case 'square': {
            const f = smoothstep(0.4, 1.0, Math.max(Math.abs(dx), Math.abs(dy)));
            mult = 1 - f * strength;
            break;
        }
        case 'continental': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const f = smoothstep(0.55, 1.05, dist);
            mult = 1 - f * strength;
            add  = (1 - smoothstep(0.0, 0.6, dist)) * 0.10 * strength;
            break;
        }
        case 'archipelago': {
            const a = Noise.simplex2(nx * 2.5 + 17.3, ny * 2.5 + 31.7);
            const b = Noise.simplex2(nx * 5.0 - 11.1, ny * 5.0 + 7.9) * 0.4;
            const islandField = (a + b) * 0.7;
            const threshold = 0.15;
            let m = smoothstep(threshold - 0.25, threshold + 0.25, islandField);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const edge = 1 - smoothstep(0.7, 1.05, dist);
            m *= edge;
            mult = 1 - (1 - m) * strength * 0.95;
            break;
        }
        case 'two-continents': {
            const seam = Noise.simplex2(ny * 3.0, 5.7) * 0.12;
            const seaCenterX = 0 + seam;
            const distFromSeam = Math.abs(dx - seaCenterX);
            const verticalBias = 1 - Math.abs(dy) * 0.4;
            const seaWidth = 0.22 * verticalBias;
            const seaMask = smoothstep(seaWidth, seaWidth + 0.18, distFromSeam);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const edge = 1 - smoothstep(0.65, 1.05, dist);
            mult = 1 - (1 - seaMask * edge) * strength;
            if (seaMask > 0.5) {
                add = (seaMask - 0.5) * 0.15 * strength * edge;
            }
            break;
        }
        case 'isthmus': {
            // Mirror of voronoi-generator.js isthmus case. See comments there.
            // Wandering centerline + varying width, no east/west edge taper.
            const centerY = Noise.simplex2(nx * 1.5, 8.3) * 0.20;
            const halfWidth = 0.40 + Noise.simplex2(nx * 2.3, 41.7) * 0.12;
            const northWobble = Noise.simplex2(nx * 4.0, 11.7) * 0.06;
            const southWobble = Noise.simplex2(nx * 4.3, 53.1) * 0.06;
            const northCoastY = centerY - halfWidth + northWobble;
            const southCoastY = centerY + halfWidth + southWobble;
            const distFromNorthCoast = dy - northCoastY;
            const distFromSouthCoast = southCoastY - dy;
            const northMask = smoothstep(0, 0.10, distFromNorthCoast);
            const southMask = smoothstep(0, 0.10, distFromSouthCoast);
            const landBandMask = Math.min(northMask, southMask);
            mult = 1 - (1 - landBandMask) * strength;
            if (landBandMask > 0.5) {
                add = (landBandMask - 0.5) * 0.18 * strength;
            }
            break;
        }
        case 'pangaea': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const edge = smoothstep(0.7, 1.1, dist);
            add = (1 - edge) * 0.18 * strength;
            const seaNoise = Noise.simplex2(nx * 3.5 + 42.1, ny * 3.5 - 13.6);
            const seaMask = smoothstep(0.45, 0.7, seaNoise);
            add -= seaMask * 0.25 * strength * (1 - edge);
            mult = 1 - edge * strength * 0.9;
            break;
        }
        case 'coastal': {
            const angle = Math.PI * 0.25;
            const ax = Math.cos(angle), ay = Math.sin(angle);
            let coastDist = dx * ax + dy * ay;
            coastDist += Noise.simplex2(nx * 4.0, ny * 4.0) * 0.20;
            const landMask = smoothstep(-0.15, 0.15, coastDist);
            mult = 1 - (1 - landMask) * strength;
            add  = landMask * 0.12 * strength;
            break;
        }
        case 'inland-sea': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerDip = smoothstep(0.15, 0.55, dist);
            const outerFade = 1 - smoothstep(0.65, 1.05, dist);
            const ring = centerDip * outerFade;
            const wobble = Noise.simplex2(nx * 4.5, ny * 4.5) * 0.08;
            mult = (1 - strength) + ring * strength;
            add  = (ring * 0.18 + wobble * ring) * strength;
            break;
        }
        case 'lake-world': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const edge = smoothstep(0.85, 1.1, dist);
            add = (1 - edge) * 0.20 * strength;
            const lakeNoise = Noise.simplex2(nx * 8.0 + 99.1, ny * 8.0 + 23.5);
            const lakeMask = smoothstep(0.55, 0.78, lakeNoise);
            add -= lakeMask * 0.30 * strength * (1 - edge);
            mult = 1 - edge * strength;
            break;
        }
        case 'peninsula': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const baseFalloff = smoothstep(0.5, 1.0, dist);
            const fjordNoise = (Noise.simplex2(nx * 12.0, ny * 12.0) +
                                Noise.simplex2(nx * 24.0 + 5.3, ny * 24.0 + 7.7) * 0.5) / 1.5;
            const coastWeight = 4 * baseFalloff * (1 - baseFalloff);
            const carve = fjordNoise * coastWeight * 0.35;
            mult = 1 - (baseFalloff + carve) * strength;
            add  = (1 - smoothstep(0.0, 0.4, dist)) * 0.08 * strength;
            break;
        }
        case 'atoll': {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ringRadius = 0.5;
            const ringWidth  = 0.18;
            const ringDist = Math.abs(dist - ringRadius);
            const wobble = Noise.simplex2(Math.atan2(dy, dx) * 1.5, dist * 4) * 0.05;
            const ring = 1 - smoothstep(0, ringWidth + wobble, ringDist);
            const outer = 1 - smoothstep(ringRadius + ringWidth, 1.0, dist);
            const mask = ring * outer;
            mult = (1 - strength) + mask * strength * 1.2;
            add  = mask * 0.15 * strength;
            break;
        }
    }
    
    return Math.max(0, Math.min(1, h * mult + add));
}

// Point generation
function generateJitteredGrid(cellCount, width, height, margin = 1) {
    const points = new Float64Array(cellCount * 2);
    const w = width - margin * 2, h = height - margin * 2;
    const cols = Math.ceil(Math.sqrt(cellCount * w / h));
    const rows = Math.ceil(cellCount / cols);
    const cellW = w / cols, cellH = h / rows;
    let idx = 0;
    for (let row = 0; row < rows && idx < cellCount; row++) {
        for (let col = 0; col < cols && idx < cellCount; col++) {
            points[idx * 2] = margin + (col + 0.5 + (PRNG.random() - 0.5) * 0.8) * cellW;
            points[idx * 2 + 1] = margin + (row + 0.5 + (PRNG.random() - 0.5) * 0.8) * cellH;
            idx++;
        }
    }
    return { points, actualCount: idx };
}

function generatePoissonDisc(cellCount, width, height, margin = 1) {
    const w = width - margin * 2, h = height - margin * 2;
    const radius = Math.sqrt((w * h) / cellCount / Math.PI) * 0.8;
    const cellSize = radius / Math.sqrt(2);
    const gridW = Math.ceil(w / cellSize), gridH = Math.ceil(h / cellSize);
    const grid = new Int32Array(gridW * gridH).fill(-1);
    const points = new Float64Array(cellCount * 2);
    const active = [];
    
    let pointCount = 0;
    const x0 = margin + w / 2, y0 = margin + h / 2;
    points[0] = x0; points[1] = y0;
    grid[Math.floor((y0 - margin) / cellSize) * gridW + Math.floor((x0 - margin) / cellSize)] = 0;
    active.push(0);
    pointCount = 1;
    
    while (active.length > 0 && pointCount < cellCount) {
        const randIdx = Math.floor(PRNG.random() * active.length);
        const idx = active[randIdx];
        const px = points[idx * 2], py = points[idx * 2 + 1];
        let found = false;
        
        for (let i = 0; i < 30; i++) {
            const angle = PRNG.random() * Math.PI * 2;
            const dist = radius + PRNG.random() * radius;
            const nx = px + Math.cos(angle) * dist, ny = py + Math.sin(angle) * dist;
            
            if (nx < margin || nx >= width - margin || ny < margin || ny >= height - margin) continue;
            
            const ngx = Math.floor((nx - margin) / cellSize), ngy = Math.floor((ny - margin) / cellSize);
            let valid = true;
            
            outer: for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const cx = ngx + dx, cy = ngy + dy;
                    if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) continue;
                    const neighborIdx = grid[cy * gridW + cx];
                    if (neighborIdx !== -1) {
                        const d2 = (nx - points[neighborIdx * 2]) ** 2 + (ny - points[neighborIdx * 2 + 1]) ** 2;
                        if (d2 < radius * radius) { valid = false; break outer; }
                    }
                }
            }
            
            if (valid) {
                points[pointCount * 2] = nx;
                points[pointCount * 2 + 1] = ny;
                grid[ngy * gridW + ngx] = pointCount;
                active.push(pointCount);
                pointCount++;
                found = true;
                break;
            }
        }
        if (!found) active.splice(randIdx, 1);
    }
    
    while (pointCount < cellCount) {
        points[pointCount * 2] = margin + PRNG.random() * w;
        points[pointCount * 2 + 1] = margin + PRNG.random() * h;
        pointCount++;
    }
    return { points, actualCount: pointCount };
}

function relaxPoints(points, cellCount, width, height, iterations) {
    for (let iter = 0; iter < iterations; iter++) {
        const delaunay = new d3.Delaunay(points);
        const voronoi = delaunay.voronoi([0, 0, width, height]);
        
        for (let i = 0; i < cellCount; i++) {
            const cell = voronoi.cellPolygon(i);
            if (!cell || cell.length < 3) continue;
            let cx = 0, cy = 0, area = 0;
            for (let j = 0; j < cell.length - 1; j++) {
                const cross = cell[j][0] * cell[j + 1][1] - cell[j + 1][0] * cell[j][1];
                area += cross;
                cx += (cell[j][0] + cell[j + 1][0]) * cross;
                cy += (cell[j][1] + cell[j + 1][1]) * cross;
            }
            area /= 2;
            if (Math.abs(area) > 1e-10) {
                cx /= (6 * area); cy /= (6 * area);
                points[i * 2] = Math.max(1, Math.min(width - 1, cx));
                points[i * 2 + 1] = Math.max(1, Math.min(height - 1, cy));
            }
        }
        
        self.postMessage({ type: 'progress', data: { stage: 'relaxation', percent: (iter + 1) / iterations * 100, message: `Lloyd relaxation ${iter + 1}/${iterations}` } });
    }
    return points;
}

function generateHeightmap(points, cellCount, width, height, options) {
    const { seed = 12345, algorithm = 'fbm', frequency = 3, octaves = 6, seaLevel = 0.4, falloff = 'radial', falloffStrength = 0.7, islandDensity = 0 } = options;
    Noise.init(seed);
    
    const heights = new Float32Array(cellCount);
    const terrain = new Uint8Array(cellCount);
    const cx = width / 2, cy = height / 2;
    const progressInterval = Math.max(1, Math.floor(cellCount / 20));
    
    for (let i = 0; i < cellCount; i++) {
        const x = points[i * 2], y = points[i * 2 + 1];
        const nx = x / width, ny = y / height;
        
        let h;
        switch (algorithm) {
            case 'ridged': h = Noise.ridged(nx, ny, { frequency, octaves }); break;
            case 'warped': h = Noise.warped(nx, ny, { frequency, octaves }); break;
            default: h = Noise.fbm(nx, ny, { frequency, octaves });
        }
        
        h = (h + 1) / 2;
        
        h = applyWorldMask(h, x, y, width, height, falloff, falloffStrength);
        
        h = Math.max(0, Math.min(1, h));
        
        if (h <= seaLevel) {
            heights[i] = ELEVATION.MIN * (1 - h / seaLevel);
        } else {
            heights[i] = ELEVATION.MAX * (h - seaLevel) / (1 - seaLevel);
        }
        terrain[i] = heights[i] >= ELEVATION.SEA_LEVEL ? 1 : 0;
        
        if (i % progressInterval === 0) {
            self.postMessage({ type: 'progress', data: { stage: 'heightmap', percent: (i / cellCount) * 100, message: `Sculpting terrain... ${Math.floor(i / cellCount * 100)}%` } });
        }
    }
    
    // Sprinkle small islands using a separate noise channel.
    // The "broaden coastlines" step needs neighbour info, so it runs on the
    // main thread after the worker returns. This pass only needs per-cell
    // positions, so it works fine here.
    if (islandDensity > 0) {
        Noise.init(seed + 90210);
        const islandChance = islandDensity * 0.06;
        const threshold = 1 - islandChance * 14;
        for (let i = 0; i < cellCount; i++) {
            const h = heights[i];
            if (h < -800 || h > -50) continue;
            const x = points[i * 2], y = points[i * 2 + 1];
            const nx = x / width, ny = y / height;
            const n1 = Noise.simplex2(nx * 18.0, ny * 18.0);
            const n2 = Noise.simplex2(nx * 42.0 + 11.3, ny * 42.0 + 7.7) * 0.5;
            const sample = (n1 + n2) * 0.7;
            if (sample > threshold) {
                const lift = (sample - threshold) / (1 - threshold);
                heights[i] = Math.max(50, lift * 200);
                terrain[i] = 1;
            }
        }
    }
    
    return { heights, terrain };
}

function packGeometry(voronoi, cellCount) {
    let totalVerts = 0;
    const vertCounts = new Uint16Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length >= 3) { vertCounts[i] = cell.length; totalVerts += cell.length; }
    }
    
    const offsets = new Uint32Array(cellCount + 1);
    const vertices = new Float32Array(totalVerts * 2);
    let offset = 0;
    for (let i = 0; i < cellCount; i++) {
        offsets[i] = offset;
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length >= 3) {
            for (let j = 0; j < cell.length; j++) {
                vertices[offset * 2] = cell[j][0];
                vertices[offset * 2 + 1] = cell[j][1];
                offset++;
            }
        }
    }
    offsets[cellCount] = offset;
    return { offsets, vertices, vertexCounts: vertCounts };
}

// Message handler
self.onmessage = function(e) {
    const { type, data, callbackId } = e.data;
    
    try {
        if (type === 'generateFull') {
            const { cellCount, width, height, seed, distribution, relaxIterations = 2, heightmapOptions = {} } = data;
            PRNG.setSeed(seed);
            
            self.postMessage({ type: 'progress', data: { stage: 'points', percent: 0, message: 'Generating points...' } });
            
            let result = distribution === 'poisson' ? generatePoissonDisc(cellCount, width, height) : generateJitteredGrid(cellCount, width, height);
            let { points, actualCount } = result;
            
            if (relaxIterations > 0 && (distribution === 'relaxed' || distribution === 'jittered')) {
                points = relaxPoints(points, actualCount, width, height, distribution === 'relaxed' ? relaxIterations : Math.min(2, relaxIterations));
            }
            
            self.postMessage({ type: 'progress', data: { stage: 'voronoi', percent: 35, message: 'Computing Voronoi...' } });
            
            const delaunay = new d3.Delaunay(points);
            const voronoi = delaunay.voronoi([0, 0, width, height]);
            const geometry = packGeometry(voronoi, actualCount);
            
            self.postMessage({ type: 'progress', data: { stage: 'heightmap', percent: 50, message: 'Sculpting terrain...' } });
            
            const { heights, terrain } = generateHeightmap(points, actualCount, width, height, { seed: seed + 1000, ...heightmapOptions });
            
            self.postMessage({ type: 'progress', data: { stage: 'complete', percent: 100, message: 'Generation complete' } });
            
            const transferables = [points.buffer, geometry.offsets.buffer, geometry.vertices.buffer, geometry.vertexCounts.buffer, heights.buffer, terrain.buffer];
            
            self.postMessage({
                type: 'generateFullComplete',
                callbackId,
                data: { points, cellCount: actualCount, geometry, heights, terrain }
            }, transferables);
        }
    } catch (error) {
        self.postMessage({ type: 'error', callbackId, error: error.message });
    }
};
