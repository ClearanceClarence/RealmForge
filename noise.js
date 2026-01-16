/**
 * VORONOI MAP GENERATOR - NOISE
 * Uses simplex-noise.js library (https://github.com/jwagner/simplex-noise.js)
 * for fast, high-quality 2D simplex noise
 */

import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import { PRNG } from './prng.js';

export const Noise = {
    // Noise function from simplex-noise library
    noise2D: null,
    noise2D_secondary: null, // For domain warping
    noise2D_tertiary: null,  // For extra layers
    
    /**
     * Initialize noise with seed
     * Creates seeded PRNG for simplex-noise library
     */
    init(seed) {
        PRNG.setSeed(seed);
        
        // Create seeded random function compatible with simplex-noise
        const createSeededRandom = () => {
            return () => PRNG.random();
        };
        
        // Initialize primary noise
        this.noise2D = createNoise2D(createSeededRandom());
        
        // Initialize secondary noise with offset seed (for warping)
        PRNG.setSeed(seed + 31337);
        this.noise2D_secondary = createNoise2D(createSeededRandom());
        
        // Initialize tertiary noise (for extra layers)
        PRNG.setSeed(seed + 77777);
        this.noise2D_tertiary = createNoise2D(createSeededRandom());
    },
    
    /**
     * 2D Simplex noise - wrapper around library
     * Returns value in [-1, 1]
     */
    simplex2(x, y) {
        return this.noise2D(x, y);
    },
    
    /**
     * Fractal Brownian Motion - layered noise for natural terrain
     */
    fbm(x, y, options = {}) {
        const {
            octaves = 6,
            frequency = 1,
            amplitude = 1,
            lacunarity = 2,      // Frequency multiplier per octave
            persistence = 0.5    // Amplitude multiplier per octave
        } = options;
        
        let value = 0;
        let amp = amplitude;
        let freq = frequency;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amp * this.noise2D(x * freq, y * freq);
            maxValue += amp;
            amp *= persistence;
            freq *= lacunarity;
        }
        
        return value / maxValue; // Normalize to [-1, 1]
    },
    
    /**
     * Ridged multifractal - good for mountains
     */
    ridged(x, y, options = {}) {
        const {
            octaves = 6,
            frequency = 1,
            lacunarity = 2,
            gain = 2,
            offset = 1
        } = options;
        
        let value = 0;
        let freq = frequency;
        let amp = 0.5;
        let prev = 1;
        
        for (let i = 0; i < octaves; i++) {
            let n = this.noise2D(x * freq, y * freq);
            n = offset - Math.abs(n);
            n = n * n;
            n *= prev;
            prev = n;
            value += n * amp;
            freq *= lacunarity;
            amp *= gain;
        }
        
        return value;
    },
    
    /**
     * Valley noise - inverted ridged for carved valleys and river-like features
     */
    valleys(x, y, options = {}) {
        const {
            octaves = 5,
            frequency = 1,
            lacunarity = 2.2,
            sharpness = 2.0,
            depth = 0.6
        } = options;
        
        let value = 0;
        let freq = frequency;
        let amp = 1;
        let maxAmp = 0;
        
        for (let i = 0; i < octaves; i++) {
            // Get noise and create valley shape
            let n = this.noise2D(x * freq, y * freq);
            
            // Valley formula: creates channels where noise is near 0
            n = 1 - Math.pow(Math.abs(n), sharpness);
            
            value += n * amp;
            maxAmp += amp;
            
            freq *= lacunarity;
            amp *= 0.5;
        }
        
        // Normalize and invert for valleys
        value = value / maxAmp;
        value = 1 - value * depth;
        
        return value * 2 - 1; // Return in [-1, 1] range
    },
    
    /**
     * Erosion-like noise - simulates hydraulic erosion patterns
     */
    eroded(x, y, options = {}) {
        const {
            octaves = 6,
            frequency = 1,
            erosionStrength = 0.4,
            ridgeWeight = 0.3
        } = options;
        
        // Base terrain from FBM
        let base = this.fbm(x, y, { frequency, octaves });
        
        // Add ridge features for mountains
        let ridges = this.ridged(x, y, { frequency: frequency * 1.5, octaves: 4 });
        
        // Create erosion channels using valley noise
        let valleys = this.valleys(x * 1.2, y * 1.2, { frequency: frequency * 2, octaves: 4 });
        
        // Combine: base terrain + ridges - erosion
        let combined = base * (1 - ridgeWeight) + ridges * ridgeWeight * 0.5;
        
        // Apply erosion more strongly at lower elevations
        let erosionMask = Math.max(0, 1 - (combined + 1) / 2);
        combined -= valleys * erosionStrength * erosionMask;
        
        return Math.max(-1, Math.min(1, combined));
    },
    
    /**
     * Multi-warped noise - multiple layers of domain warping for very organic shapes
     */
    multiWarp(x, y, options = {}) {
        const {
            frequency = 1,
            octaves = 6,
            warpIterations = 3,
            warpStrength = 0.4
        } = options;
        
        let wx = x * frequency;
        let wy = y * frequency;
        
        // Apply multiple warp iterations
        for (let i = 0; i < warpIterations; i++) {
            const strength = warpStrength / (i + 1);
            const offset = i * 5.2;
            
            const warpX = this._fbmSecondary(wx + offset, wy, 3) * strength;
            const warpY = this._fbmSecondary(wx, wy + offset + 3.7, 3) * strength;
            
            wx += warpX;
            wy += warpY;
        }
        
        return this.fbm(wx, wy, { octaves, frequency: 1 });
    },
    
    /**
     * Swiss/Cheese terrain - rolling hills with occasional peaks
     */
    swiss(x, y, options = {}) {
        const {
            frequency = 1,
            octaves = 5,
            warpStrength = 0.3
        } = options;
        
        // Warped coordinates for organic feel
        const wx = x + this.noise2D_secondary(x * frequency * 2, y * frequency * 2) * warpStrength;
        const wy = y + this.noise2D_secondary(x * frequency * 2 + 5.2, y * frequency * 2) * warpStrength;
        
        let value = 0;
        let amp = 1;
        let freq = frequency;
        let maxAmp = 0;
        
        for (let i = 0; i < octaves; i++) {
            // Get noise
            let n = this.noise2D(wx * freq, wy * freq);
            
            // Swiss formula: smooth rolling with occasional peaks
            n = 1 - Math.abs(n);
            n = n * n;
            
            // Subtract some to create variation
            let n2 = this.noise2D_tertiary(wx * freq + 100, wy * freq);
            n = n - Math.abs(n2) * 0.5;
            
            value += n * amp;
            maxAmp += amp;
            
            freq *= 2;
            amp *= 0.5;
        }
        
        return value / maxAmp;
    },
    
    /**
     * Terraced noise - creates plateau/mesa-like terrain
     */
    terraced(x, y, options = {}) {
        const {
            frequency = 1,
            octaves = 6,
            levels = 8,
            sharpness = 0.7
        } = options;
        
        // Get base terrain
        let h = this.fbm(x, y, { frequency, octaves });
        
        // Add some warping
        const warp = this.noise2D_secondary(x * frequency * 2, y * frequency * 2) * 0.2;
        h += warp;
        
        // Convert to 0-1 range
        h = (h + 1) / 2;
        
        // Apply terracing
        const level = Math.floor(h * levels);
        const remainder = (h * levels) - level;
        
        // Smooth the terrace edges based on sharpness
        const smoothed = level + Math.pow(remainder, 1 / sharpness);
        
        h = smoothed / levels;
        
        // Back to -1 to 1
        return h * 2 - 1;
    },
    
    /**
     * Continental noise - good for large landmasses with realistic coastlines
     */
    continental(x, y, options = {}) {
        const {
            frequency = 1,
            octaves = 6,
            continentSize = 0.5,
            coastComplexity = 0.4
        } = options;
        
        // Large-scale continental shapes
        let continent = this.fbm(x, y, { 
            frequency: frequency * continentSize, 
            octaves: 3,
            persistence: 0.6
        });
        
        // Medium detail for coastlines
        let coast = this.multiWarp(x, y, {
            frequency: frequency * 2,
            octaves: 4,
            warpIterations: 2,
            warpStrength: coastComplexity
        });
        
        // Fine detail for terrain features
        let detail = this.fbm(x, y, {
            frequency: frequency * 4,
            octaves: octaves - 3,
            persistence: 0.4
        });
        
        // Combine at different scales
        let combined = continent * 0.6 + coast * 0.25 + detail * 0.15;
        
        return Math.max(-1, Math.min(1, combined));
    },
    
    /**
     * Warped noise - domain warping for more organic shapes
     */
    warped(x, y, options = {}) {
        const {
            frequency = 1,
            warpStrength = 0.5,
            octaves = 6
        } = options;
        
        // First pass - get warp offsets using secondary noise
        const warpX = this._fbmSecondary(x * frequency, y * frequency, 4) * warpStrength;
        const warpY = this._fbmSecondary(x * frequency + 5.2, y * frequency + 1.3, 4) * warpStrength;
        
        // Second pass - sample with warped coordinates
        return this.fbm(
            (x + warpX) * frequency,
            (y + warpY) * frequency,
            { octaves }
        );
    },
    
    /**
     * FBM using secondary noise (for warping)
     */
    _fbmSecondary(x, y, octaves = 4) {
        let value = 0;
        let amp = 1;
        let freq = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amp * this.noise2D_secondary(x * freq, y * freq);
            maxValue += amp;
            amp *= 0.5;
            freq *= 2;
        }
        
        return value / maxValue;
    }
};

/**
 * Heightmap generator for Voronoi cells
 */
const HeightmapGenerator = {
    /**
     * Generate heightmap values for all cells
     */
    generate(generator, options = {}) {
        const {
            seed = 12345,
            algorithm = 'continental',  // Many options now
            frequency = 2,              // Base frequency
            octaves = 6,                // Detail levels
            redistribution = 1,         // Power curve for redistribution
            seaLevel = 0.4,             // 0-1, affects land/water ratio
            falloff = 'none',           // 'none', 'radial', 'square'
            falloffStrength = 0.7       // How strong the edge falloff is
        } = options;
        
        // Initialize noise
        Noise.init(seed);
        
        const cellCount = generator.cellCount;
        const points = generator.points;
        const width = generator.width;
        const height = generator.height;
        
        // Allocate height array
        const heights = new Float32Array(cellCount);
        
        // Center for falloff calculations
        const cx = width / 2;
        const cy = height / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        
        // Generate heights for each cell
        for (let i = 0; i < cellCount; i++) {
            const x = points[i * 2];
            const y = points[i * 2 + 1];
            
            // Normalize coordinates to roughly 0-1 range
            const nx = x / width;
            const ny = y / height;
            
            // Get base noise value based on algorithm
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
            
            // Apply falloff
            if (falloff !== 'none') {
                const dx = (x - cx) / cx;
                const dy = (y - cy) / cy;
                let falloffValue;
                
                if (falloff === 'radial') {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    falloffValue = Math.min(1, dist);
                } else { // square
                    falloffValue = Math.max(Math.abs(dx), Math.abs(dy));
                }
                
                // Smooth falloff curve
                falloffValue = Math.pow(falloffValue, 2);
                h = h * (1 - falloffValue * falloffStrength);
            }
            
            // Apply redistribution (power curve)
            if (redistribution !== 1) {
                h = Math.pow(h, redistribution);
            }
            
            heights[i] = h;
        }
        
        return heights;
    },
    
    /**
     * Classify cells as land or water based on height
     */
    classifyTerrain(heights, seaLevel = 0.4) {
        const terrain = new Uint8Array(heights.length);
        
        for (let i = 0; i < heights.length; i++) {
            terrain[i] = heights[i] > seaLevel ? 1 : 0; // 1 = land, 0 = water
        }
        
        return terrain;
    },
    
    /**
     * Get grayscale color for height value
     */
    heightToGray(height) {
        const gray = Math.floor(height * 255);
        return `rgb(${gray},${gray},${gray})`;
    },
    
    /**
     * Get color with sea level distinction
     */
    heightToColor(height, seaLevel = 0.4) {
        if (height <= seaLevel) {
            // Water - blue tones
            const t = height / seaLevel;
            const v = Math.floor(40 + t * 60);
            return `rgb(${v * 0.3},${v * 0.5},${v})`;
        } else {
            // Land - grayscale
            const t = (height - seaLevel) / (1 - seaLevel);
            const v = Math.floor(80 + t * 175);
            return `rgb(${v},${v},${v})`;
        }
    }
};
