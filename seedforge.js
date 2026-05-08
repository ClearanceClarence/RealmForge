/**
 * Advanced PRNG Library
 * A comprehensive pseudo-random number generator library with multiple algorithms,
 * statistical distributions, and utility functions for procedural generation.
 * 
 * @version 1.1.0
 * @license MIT
 */

(function(global) {
    'use strict';

    // ============================================================
    // SEEDING UTILITIES
    // ============================================================

    /**
     * Convert a string to a numeric seed using a hash function
     * @param {string} str - Input string
     * @returns {number} 32-bit integer seed
     */
    function stringToSeed(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash >>> 0; // Ensure unsigned
    }

    /**
     * Cyrb128 hash - produces four 32-bit hashes from a string
     * Useful for seeding generators that need multiple seed values
     * @param {string} str - Input string
     * @returns {number[]} Array of four 32-bit integers
     */
    function cyrb128(str) {
        let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
        for (let i = 0, k; i < str.length; i++) {
            k = str.charCodeAt(i);
            h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
            h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
            h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
            h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
        }
        h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
        h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
        h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
        h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
        h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
        return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
    }

    /**
     * SplitMix64 - excellent for generating seeds for other generators
     * @param {number} seed - Initial seed
     * @returns {function} Generator function
     */
    function splitmix64(seed) {
        let state = BigInt(seed >>> 0);
        return function() {
            state += 0x9e3779b97f4a7c15n;
            let z = state;
            z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
            z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
            z = z ^ (z >> 31n);
            return Number(z & 0xffffffffn) >>> 0;
        };
    }

    // ============================================================
    // PRNG ALGORITHMS
    // ============================================================

    /**
     * Mulberry32 - Simple, fast 32-bit generator
     * Period: ~2^32, suitable for games and simple applications
     */
    class Mulberry32 {
        constructor(seed = Date.now()) {
            this.name = 'mulberry32';
            this.seed = typeof seed === 'string' ? stringToSeed(seed) : seed >>> 0;
            this.state = this.seed;
        }

        next() {
            let t = this.state += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }

        nextInt() {
            let t = this.state += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return (t ^ t >>> 14) >>> 0;
        }

        getState() {
            return { state: this.state, seed: this.seed };
        }

        setState(savedState) {
            this.state = savedState.state;
            this.seed = savedState.seed;
        }

        reset() {
            this.state = this.seed;
        }

        clone() {
            const cloned = new Mulberry32(this.seed);
            cloned.state = this.state;
            return cloned;
        }
    }

    /**
     * Xoshiro128** - High quality, fast generator
     * Period: 2^128 - 1, excellent statistical properties
     */
    class Xoshiro128SS {
        constructor(seed = Date.now()) {
            this.name = 'xoshiro128**';
            this.originalSeed = seed;
            
            // Initialize state from seed
            const seedStr = typeof seed === 'string' ? seed : String(seed);
            const seeds = cyrb128(seedStr);
            this.s = new Uint32Array(seeds);
        }

        _rotl(x, k) {
            return (x << k) | (x >>> (32 - k));
        }

        next() {
            return this.nextInt() / 4294967296;
        }

        nextInt() {
            const result = Math.imul(this._rotl(Math.imul(this.s[1], 5), 7), 9) >>> 0;
            const t = this.s[1] << 9;

            this.s[2] ^= this.s[0];
            this.s[3] ^= this.s[1];
            this.s[1] ^= this.s[2];
            this.s[0] ^= this.s[3];

            this.s[2] ^= t;
            this.s[3] = this._rotl(this.s[3], 11);

            return result;
        }

        /**
         * Jump function - equivalent to 2^64 calls to next()
         * Useful for parallel streams
         */
        jump() {
            const JUMP = [0x8764000b, 0xf542d2d3, 0x6fa035c3, 0x77f2db5b];
            let s0 = 0, s1 = 0, s2 = 0, s3 = 0;

            for (let i = 0; i < 4; i++) {
                for (let b = 0; b < 32; b++) {
                    if (JUMP[i] & (1 << b)) {
                        s0 ^= this.s[0];
                        s1 ^= this.s[1];
                        s2 ^= this.s[2];
                        s3 ^= this.s[3];
                    }
                    this.nextInt();
                }
            }

            this.s[0] = s0 >>> 0;
            this.s[1] = s1 >>> 0;
            this.s[2] = s2 >>> 0;
            this.s[3] = s3 >>> 0;
        }

        getState() {
            return {
                s: Array.from(this.s),
                originalSeed: this.originalSeed
            };
        }

        setState(savedState) {
            this.s = new Uint32Array(savedState.s);
            this.originalSeed = savedState.originalSeed;
        }

        reset() {
            const seedStr = typeof this.originalSeed === 'string' 
                ? this.originalSeed 
                : String(this.originalSeed);
            const seeds = cyrb128(seedStr);
            this.s = new Uint32Array(seeds);
        }

        clone() {
            const cloned = new Xoshiro128SS(this.originalSeed);
            cloned.s = new Uint32Array(this.s);
            return cloned;
        }
    }

    /**
     * Xorshift128 - Very fast, good quality (32-bit optimized)
     * Period: 2^128 - 1
     */
    class Xorshift128Plus {
        constructor(seed = Date.now()) {
            this.name = 'xorshift128+';
            this.originalSeed = seed;
            
            const seedStr = typeof seed === 'string' ? seed : String(seed);
            const seeds = cyrb128(seedStr);
            // Use 4x 32-bit state instead of 2x 64-bit BigInt
            this.s = new Uint32Array(seeds);
        }

        next() {
            // Xorshift128 algorithm using 32-bit operations
            let t = this.s[3];
            const s = this.s[0];
            
            this.s[3] = this.s[2];
            this.s[2] = this.s[1];
            this.s[1] = s;
            
            t ^= t << 11;
            t ^= t >>> 8;
            this.s[0] = t ^ s ^ (s >>> 19);
            
            return this.s[0] / 4294967296;
        }

        nextInt() {
            let t = this.s[3];
            const s = this.s[0];
            
            this.s[3] = this.s[2];
            this.s[2] = this.s[1];
            this.s[1] = s;
            
            t ^= t << 11;
            t ^= t >>> 8;
            this.s[0] = t ^ s ^ (s >>> 19);
            
            return this.s[0] >>> 0;
        }

        getState() {
            return {
                s: Array.from(this.s),
                originalSeed: this.originalSeed
            };
        }

        setState(savedState) {
            this.s = new Uint32Array(savedState.s);
            this.originalSeed = savedState.originalSeed;
        }

        reset() {
            const seedStr = typeof this.originalSeed === 'string' 
                ? this.originalSeed 
                : String(this.originalSeed);
            const seeds = cyrb128(seedStr);
            this.s = new Uint32Array(seeds);
        }

        clone() {
            const cloned = new Xorshift128Plus(this.originalSeed);
            cloned.s = new Uint32Array(this.s);
            return cloned;
        }
    }

    /**
     * PCG (Permuted Congruential Generator) - Excellent quality, compact state
     * Period: 2^64, statistically excellent
     * This is a 32-bit optimized version
     */
    class PCG32 {
        constructor(seed = Date.now(), sequence = 1) {
            this.name = 'pcg32';
            this.originalSeed = seed;
            this.originalSequence = sequence;
            
            const numSeed = typeof seed === 'string' ? stringToSeed(seed) : seed >>> 0;
            
            // Use two 32-bit values to represent 64-bit state
            this.stateHi = 0;
            this.stateLo = 0;
            this.incHi = 0;
            this.incLo = (sequence << 1) | 1;
            
            // Warm up
            this.nextInt();
            this._add64(numSeed, 0);
            this.nextInt();
        }

        // Add a 64-bit value to state (stateLo/stateHi)
        _add64(lo, hi) {
            const newLo = (this.stateLo + lo) >>> 0;
            const carry = (newLo < this.stateLo) ? 1 : 0;
            this.stateLo = newLo;
            this.stateHi = (this.stateHi + hi + carry) >>> 0;
        }

        // Multiply state by the LCG multiplier (6364136223846793005)
        // Multiplier in 32-bit parts: 0x5851F42D, 0x4C957F2D
        _multiply() {
            const multHi = 0x5851F42D;
            const multLo = 0x4C957F2D;
            
            // 64-bit multiplication using 32-bit parts
            const a = this.stateLo >>> 16;
            const b = this.stateLo & 0xFFFF;
            const c = multLo >>> 16;
            const d = multLo & 0xFFFF;
            
            let low = b * d;
            let mid1 = a * d;
            let mid2 = b * c;
            let high = a * c;
            
            mid1 += low >>> 16;
            mid1 += mid2;
            if (mid1 < mid2) high += 0x10000;
            
            const newLo = (low & 0xFFFF) | ((mid1 & 0xFFFF) << 16);
            const newHi = high + (mid1 >>> 16);
            
            // Add cross terms for high part
            const crossHi = (this.stateLo * multHi + this.stateHi * multLo) >>> 0;
            
            this.stateLo = newLo >>> 0;
            this.stateHi = (newHi + crossHi) >>> 0;
        }

        nextInt() {
            const oldHi = this.stateHi;
            const oldLo = this.stateLo;
            
            // Advance state: state = state * mult + inc
            this._multiply();
            this._add64(this.incLo, this.incHi);
            
            // Calculate output using xorshift and rotation
            const xorshifted = (((oldHi >>> 18) ^ oldHi) >>> 27) ^ (oldLo >>> 27);
            const rot = oldHi >>> 27;
            
            return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
        }

        next() {
            return this.nextInt() / 4294967296;
        }

        getState() {
            return {
                stateHi: this.stateHi,
                stateLo: this.stateLo,
                incHi: this.incHi,
                incLo: this.incLo,
                originalSeed: this.originalSeed,
                originalSequence: this.originalSequence
            };
        }

        setState(savedState) {
            this.stateHi = savedState.stateHi;
            this.stateLo = savedState.stateLo;
            this.incHi = savedState.incHi;
            this.incLo = savedState.incLo;
            this.originalSeed = savedState.originalSeed;
            this.originalSequence = savedState.originalSequence;
        }

        reset() {
            const numSeed = typeof this.originalSeed === 'string' 
                ? stringToSeed(this.originalSeed) 
                : this.originalSeed >>> 0;
            
            this.stateHi = 0;
            this.stateLo = 0;
            this.incHi = 0;
            this.incLo = (this.originalSequence << 1) | 1;
            
            this.nextInt();
            this._add64(numSeed, 0);
            this.nextInt();
        }

        clone() {
            const cloned = new PCG32(this.originalSeed, this.originalSequence);
            cloned.stateHi = this.stateHi;
            cloned.stateLo = this.stateLo;
            cloned.incHi = this.incHi;
            cloned.incLo = this.incLo;
            return cloned;
        }
    }

    /**
     * SFC32 (Simple Fast Counter) - Very fast, passes BigCrush
     * Period: ~2^128
     */
    class SFC32 {
        constructor(seed = Date.now()) {
            this.name = 'sfc32';
            this.originalSeed = seed;
            
            const seedStr = typeof seed === 'string' ? seed : String(seed);
            const seeds = cyrb128(seedStr);
            [this.a, this.b, this.c, this.counter] = seeds;
        }

        nextInt() {
            const t = (this.a + this.b + this.counter++) >>> 0;
            this.a = this.b ^ (this.b >>> 9);
            this.b = (this.c + (this.c << 3)) >>> 0;
            this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
            this.c = (this.c + t) >>> 0;
            return t;
        }

        next() {
            return this.nextInt() / 4294967296;
        }

        getState() {
            return {
                a: this.a, b: this.b, c: this.c, counter: this.counter,
                originalSeed: this.originalSeed
            };
        }

        setState(savedState) {
            this.a = savedState.a;
            this.b = savedState.b;
            this.c = savedState.c;
            this.counter = savedState.counter;
            this.originalSeed = savedState.originalSeed;
        }

        reset() {
            const seedStr = typeof this.originalSeed === 'string' 
                ? this.originalSeed 
                : String(this.originalSeed);
            const seeds = cyrb128(seedStr);
            [this.a, this.b, this.c, this.counter] = seeds;
        }

        clone() {
            const cloned = new SFC32(this.originalSeed);
            cloned.a = this.a;
            cloned.b = this.b;
            cloned.c = this.c;
            cloned.counter = this.counter;
            return cloned;
        }
    }

    /**
     * LCG (Linear Congruential Generator) - Classic, fast but lower quality
     * Included for educational purposes and compatibility
     */
    class LCG {
        constructor(seed = Date.now(), a = 1664525, c = 1013904223, m = 4294967296) {
            this.name = 'lcg';
            this.seed = typeof seed === 'string' ? stringToSeed(seed) : seed >>> 0;
            this.state = this.seed;
            this.a = a;
            this.c = c;
            this.m = m;
        }

        nextInt() {
            this.state = (this.a * this.state + this.c) % this.m;
            return this.state >>> 0;
        }

        next() {
            return this.nextInt() / this.m;
        }

        getState() {
            return { state: this.state, seed: this.seed, a: this.a, c: this.c, m: this.m };
        }

        setState(savedState) {
            Object.assign(this, savedState);
        }

        reset() {
            this.state = this.seed;
        }

        clone() {
            const cloned = new LCG(this.seed, this.a, this.c, this.m);
            cloned.state = this.state;
            return cloned;
        }
    }

    // ============================================================
    // PRNG WRAPPER WITH DISTRIBUTIONS AND UTILITIES
    // ============================================================

    class PRNG {
        /**
         * Create a new PRNG instance
         * @param {string|number} seed - Seed value (string or number)
         * @param {string} algorithm - Algorithm name: 'mulberry32', 'xoshiro128', 'xorshift128', 'pcg32', 'sfc32', 'lcg'
         */
        constructor(seed = Date.now(), algorithm = 'xoshiro128') {
            this.setSeed(seed, algorithm);
        }

        /**
         * Set or change the seed and optionally the algorithm
         */
        setSeed(seed, algorithm = this.generator?.name || 'xoshiro128') {
            switch (algorithm.toLowerCase()) {
                case 'mulberry32':
                case 'mulberry':
                    this.generator = new Mulberry32(seed);
                    break;
                case 'xoshiro128':
                case 'xoshiro128**':
                case 'xoshiro':
                    this.generator = new Xoshiro128SS(seed);
                    break;
                case 'xorshift128':
                case 'xorshift128+':
                case 'xorshift':
                    this.generator = new Xorshift128Plus(seed);
                    break;
                case 'pcg32':
                case 'pcg':
                    this.generator = new PCG32(seed);
                    break;
                case 'sfc32':
                case 'sfc':
                    this.generator = new SFC32(seed);
                    break;
                case 'lcg':
                    this.generator = new LCG(seed);
                    break;
                default:
                    throw new Error(`Unknown algorithm: ${algorithm}`);
            }
            
            // Cache for normal distribution (Box-Muller)
            this._spareNormal = null;
            this._hasSpareNormal = false;
        }

        // --------------------------------------------------------
        // BASIC GENERATION
        // --------------------------------------------------------

        /**
         * Generate a random float in [0, 1)
         */
        random() {
            return this.generator.next();
        }

        /**
         * Generate a random 32-bit unsigned integer
         */
        randomInt() {
            return this.generator.nextInt();
        }

        /**
         * Generate a random float in [min, max)
         */
        float(min = 0, max = 1) {
            return min + this.random() * (max - min);
        }

        /**
         * Generate a random integer in [min, max] (inclusive)
         */
        int(min, max) {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(this.random() * (max - min + 1)) + min;
        }

        /**
         * Generate a random boolean with given probability of true
         */
        bool(probability = 0.5) {
            return this.random() < probability;
        }

        /**
         * Generate a random sign (-1 or 1)
         */
        sign(probability = 0.5) {
            return this.bool(probability) ? 1 : -1;
        }

        // --------------------------------------------------------
        // STATISTICAL DISTRIBUTIONS
        // --------------------------------------------------------

        /**
         * Normal (Gaussian) distribution using Box-Muller transform
         * @param {number} mean - Mean of the distribution
         * @param {number} stdDev - Standard deviation
         */
        normal(mean = 0, stdDev = 1) {
            if (this._hasSpareNormal) {
                this._hasSpareNormal = false;
                return this._spareNormal * stdDev + mean;
            }

            let u, v, s;
            do {
                u = this.random() * 2 - 1;
                v = this.random() * 2 - 1;
                s = u * u + v * v;
            } while (s >= 1 || s === 0);

            const mul = Math.sqrt(-2 * Math.log(s) / s);
            this._spareNormal = v * mul;
            this._hasSpareNormal = true;

            return u * mul * stdDev + mean;
        }

        /**
         * Exponential distribution
         * @param {number} lambda - Rate parameter (1/mean)
         */
        exponential(lambda = 1) {
            return -Math.log(1 - this.random()) / lambda;
        }

        /**
         * Poisson distribution
         * @param {number} lambda - Average number of events
         */
        poisson(lambda) {
            const L = Math.exp(-lambda);
            let k = 0;
            let p = 1;

            do {
                k++;
                p *= this.random();
            } while (p > L);

            return k - 1;
        }

        /**
         * Binomial distribution
         * @param {number} n - Number of trials
         * @param {number} p - Probability of success
         */
        binomial(n, p) {
            let successes = 0;
            for (let i = 0; i < n; i++) {
                if (this.random() < p) successes++;
            }
            return successes;
        }

        /**
         * Pareto distribution (power law)
         * @param {number} alpha - Shape parameter
         * @param {number} xm - Scale parameter (minimum value)
         */
        pareto(alpha = 1, xm = 1) {
            return xm / Math.pow(1 - this.random(), 1 / alpha);
        }

        /**
         * Beta distribution
         * @param {number} alpha - Shape parameter α
         * @param {number} beta - Shape parameter β
         */
        beta(alpha, beta) {
            // Using Jöhnk's algorithm for alpha, beta < 1
            // and rejection method otherwise
            if (alpha <= 0 || beta <= 0) {
                throw new Error('Alpha and beta must be positive');
            }

            const gamma1 = this.gamma(alpha, 1);
            const gamma2 = this.gamma(beta, 1);
            return gamma1 / (gamma1 + gamma2);
        }

        /**
         * Gamma distribution
         * @param {number} shape - Shape parameter (k or α)
         * @param {number} scale - Scale parameter (θ)
         */
        gamma(shape, scale = 1) {
            if (shape < 1) {
                return this.gamma(1 + shape, scale) * Math.pow(this.random(), 1 / shape);
            }

            const d = shape - 1 / 3;
            const c = 1 / Math.sqrt(9 * d);

            while (true) {
                let x, v;
                do {
                    x = this.normal();
                    v = 1 + c * x;
                } while (v <= 0);

                v = v * v * v;
                const u = this.random();

                if (u < 1 - 0.0331 * (x * x) * (x * x)) {
                    return d * v * scale;
                }

                if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                    return d * v * scale;
                }
            }
        }

        /**
         * Triangular distribution
         * @param {number} min - Minimum value
         * @param {number} max - Maximum value
         * @param {number} mode - Most likely value
         */
        triangular(min = 0, max = 1, mode = 0.5) {
            const u = this.random();
            const fc = (mode - min) / (max - min);
            
            if (u < fc) {
                return min + Math.sqrt(u * (max - min) * (mode - min));
            } else {
                return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
            }
        }

        /**
         * Log-normal distribution
         * @param {number} mu - Mean of the underlying normal distribution
         * @param {number} sigma - Standard deviation of the underlying normal
         */
        logNormal(mu = 0, sigma = 1) {
            return Math.exp(this.normal(mu, sigma));
        }

        /**
         * Weibull distribution
         * @param {number} scale - Scale parameter (λ)
         * @param {number} shape - Shape parameter (k)
         */
        weibull(scale = 1, shape = 1) {
            return scale * Math.pow(-Math.log(1 - this.random()), 1 / shape);
        }

        /**
         * Cauchy distribution (heavy tails)
         * @param {number} location - Location parameter
         * @param {number} scale - Scale parameter
         */
        cauchy(location = 0, scale = 1) {
            return location + scale * Math.tan(Math.PI * (this.random() - 0.5));
        }

        /**
         * Geometric distribution - number of trials until first success
         * @param {number} p - Probability of success (0 < p <= 1)
         * @returns {number} Number of trials (1, 2, 3, ...)
         */
        geometric(p) {
            if (p <= 0 || p > 1) {
                throw new Error('Probability must be in (0, 1]');
            }
            return Math.ceil(Math.log(1 - this.random()) / Math.log(1 - p));
        }

        /**
         * Zipf distribution - power law for rankings (word frequencies, city sizes)
         * @param {number} n - Number of elements (max rank)
         * @param {number} s - Exponent parameter (typically 1.0)
         * @returns {number} Rank from 1 to n
         */
        zipf(n, s = 1) {
            if (n < 1) throw new Error('n must be >= 1');
            if (s < 0) throw new Error('s must be >= 0');
            
            // Calculate normalization constant (generalized harmonic number)
            let hns = 0;
            for (let i = 1; i <= n; i++) {
                hns += 1 / Math.pow(i, s);
            }
            
            const u = this.random();
            let sum = 0;
            for (let k = 1; k <= n; k++) {
                sum += 1 / (Math.pow(k, s) * hns);
                if (sum >= u) return k;
            }
            return n;
        }

        /**
         * Chi-squared distribution
         * @param {number} k - Degrees of freedom (positive integer)
         * @returns {number} Chi-squared distributed value
         */
        chiSquared(k) {
            if (k < 1) throw new Error('Degrees of freedom must be >= 1');
            // Chi-squared is a special case of gamma distribution
            return this.gamma(k / 2, 2);
        }

        /**
         * Student's t-distribution
         * @param {number} df - Degrees of freedom
         * @returns {number} t-distributed value
         */
        studentT(df) {
            if (df <= 0) throw new Error('Degrees of freedom must be positive');
            // t = Z / sqrt(V/df) where Z ~ N(0,1) and V ~ chi-squared(df)
            const z = this.normal();
            const v = this.chiSquared(df);
            return z / Math.sqrt(v / df);
        }

        /**
         * Von Mises distribution - circular/directional distribution
         * @param {number} mu - Mean direction in radians
         * @param {number} kappa - Concentration parameter (0 = uniform, higher = more concentrated)
         * @returns {number} Angle in radians [-π, π]
         */
        vonMises(mu = 0, kappa = 1) {
            if (kappa < 0) throw new Error('Kappa must be non-negative');
            
            if (kappa === 0) {
                // Uniform distribution on circle
                return (this.random() * 2 - 1) * Math.PI;
            }
            
            // Best-Fisher algorithm
            const tau = 1 + Math.sqrt(1 + 4 * kappa * kappa);
            const rho = (tau - Math.sqrt(2 * tau)) / (2 * kappa);
            const r = (1 + rho * rho) / (2 * rho);
            
            while (true) {
                const u1 = this.random();
                const z = Math.cos(Math.PI * u1);
                const f = (1 + r * z) / (r + z);
                const c = kappa * (r - f);
                
                const u2 = this.random();
                if (u2 < c * (2 - c) || u2 <= c * Math.exp(1 - c)) {
                    const u3 = this.random();
                    const theta = (u3 > 0.5) ? Math.acos(f) : -Math.acos(f);
                    return ((theta + mu + Math.PI) % (2 * Math.PI)) - Math.PI;
                }
            }
        }

        /**
         * Hypergeometric distribution - sampling without replacement
         * @param {number} N - Population size
         * @param {number} K - Number of success states in population
         * @param {number} n - Number of draws
         * @returns {number} Number of successes in the sample
         */
        hypergeometric(N, K, n) {
            if (N < 0 || K < 0 || n < 0) throw new Error('Parameters must be non-negative');
            if (K > N) throw new Error('K cannot exceed N');
            if (n > N) throw new Error('n cannot exceed N');
            
            let successes = 0;
            let population = N;
            let successesLeft = K;
            
            for (let i = 0; i < n; i++) {
                if (this.random() < successesLeft / population) {
                    successes++;
                    successesLeft--;
                }
                population--;
            }
            
            return successes;
        }

        // --------------------------------------------------------
        // ARRAY UTILITIES
        // --------------------------------------------------------

        /**
         * Shuffle an array in place (Fisher-Yates)
         * @param {Array} array - Array to shuffle
         * @returns {Array} The shuffled array
         */
        shuffle(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = this.int(0, i);
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        /**
         * Return a shuffled copy of an array
         */
        shuffled(array) {
            return this.shuffle([...array]);
        }

        /**
         * Pick a random element from an array
         */
        pick(array) {
            if (array.length === 0) return undefined;
            return array[this.int(0, array.length - 1)];
        }

        /**
         * Pick n random elements from an array (without replacement)
         */
        sample(array, n) {
            const shuffled = this.shuffled(array);
            return shuffled.slice(0, Math.min(n, array.length));
        }

        /**
         * Pick a random element with weights
         * @param {Array} items - Array of items
         * @param {Array<number>} weights - Array of weights (same length as items)
         */
        weightedPick(items, weights) {
            if (items.length !== weights.length) {
                throw new Error('Items and weights must have same length');
            }

            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            let random = this.random() * totalWeight;

            for (let i = 0; i < items.length; i++) {
                random -= weights[i];
                if (random <= 0) return items[i];
            }

            return items[items.length - 1];
        }

        /**
         * Pick from items with weights specified as an object
         * @param {Object} weightedItems - Object with items as keys and weights as values
         */
        weightedPickObject(weightedItems) {
            const items = Object.keys(weightedItems);
            const weights = Object.values(weightedItems);
            return this.weightedPick(items, weights);
        }

        /**
         * Generate an array of random values
         * @param {number} length - Length of the array
         * @param {function} generator - Generator function (defaults to random())
         */
        array(length, generator = () => this.random()) {
            return Array.from({ length }, generator);
        }

        // --------------------------------------------------------
        // GEOMETRIC UTILITIES
        // --------------------------------------------------------

        /**
         * Random point in a circle (uniform distribution)
         * @param {number} radius - Circle radius
         * @returns {{x: number, y: number}}
         */
        pointInCircle(radius = 1) {
            const r = radius * Math.sqrt(this.random());
            const theta = this.random() * Math.PI * 2;
            return {
                x: r * Math.cos(theta),
                y: r * Math.sin(theta)
            };
        }

        /**
         * Random point on a circle's edge
         * @param {number} radius - Circle radius
         */
        pointOnCircle(radius = 1) {
            const theta = this.random() * Math.PI * 2;
            return {
                x: radius * Math.cos(theta),
                y: radius * Math.sin(theta)
            };
        }

        /**
         * Random point in a sphere (uniform distribution)
         * @param {number} radius - Sphere radius
         */
        pointInSphere(radius = 1) {
            const u = this.random();
            const v = this.random();
            const theta = u * 2 * Math.PI;
            const phi = Math.acos(2 * v - 1);
            const r = radius * Math.cbrt(this.random());
            
            return {
                x: r * Math.sin(phi) * Math.cos(theta),
                y: r * Math.sin(phi) * Math.sin(theta),
                z: r * Math.cos(phi)
            };
        }

        /**
         * Random point on a sphere's surface
         * @param {number} radius - Sphere radius
         */
        pointOnSphere(radius = 1) {
            const u = this.random();
            const v = this.random();
            const theta = u * 2 * Math.PI;
            const phi = Math.acos(2 * v - 1);
            
            return {
                x: radius * Math.sin(phi) * Math.cos(theta),
                y: radius * Math.sin(phi) * Math.sin(theta),
                z: radius * Math.cos(phi)
            };
        }

        /**
         * Random direction vector (2D)
         */
        direction2D() {
            const angle = this.random() * Math.PI * 2;
            return { x: Math.cos(angle), y: Math.sin(angle) };
        }

        /**
         * Random direction vector (3D)
         */
        direction3D() {
            const point = this.pointOnSphere(1);
            return point;
        }

        /**
         * Random point in a rectangle
         */
        pointInRect(x, y, width, height) {
            return {
                x: x + this.random() * width,
                y: y + this.random() * height
            };
        }

        /**
         * Random point in a box (3D)
         */
        pointInBox(x, y, z, width, height, depth) {
            return {
                x: x + this.random() * width,
                y: y + this.random() * height,
                z: z + this.random() * depth
            };
        }

        // --------------------------------------------------------
        // SPECIAL GENERATORS
        // --------------------------------------------------------

        /**
         * Generate a UUID v4
         */
        uuid() {
            const hex = '0123456789abcdef';
            let uuid = '';
            
            for (let i = 0; i < 36; i++) {
                if (i === 8 || i === 13 || i === 18 || i === 23) {
                    uuid += '-';
                } else if (i === 14) {
                    uuid += '4';
                } else if (i === 19) {
                    uuid += hex[(this.int(0, 15) & 0x3) | 0x8];
                } else {
                    uuid += hex[this.int(0, 15)];
                }
            }
            
            return uuid;
        }

        /**
         * Generate a random hex color
         */
        color() {
            return '#' + this.int(0, 0xFFFFFF).toString(16).padStart(6, '0');
        }

        /**
         * Generate a random RGB color
         */
        colorRGB() {
            return {
                r: this.int(0, 255),
                g: this.int(0, 255),
                b: this.int(0, 255)
            };
        }

        /**
         * Generate a random HSL color
         */
        colorHSL(saturation = null, lightness = null) {
            return {
                h: this.int(0, 360),
                s: saturation ?? this.int(0, 100),
                l: lightness ?? this.int(0, 100)
            };
        }

        /**
         * Generate a random character from a set
         * @param {string} charset - Characters to choose from
         */
        char(charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
            return charset[this.int(0, charset.length - 1)];
        }

        /**
         * Generate a random string
         * @param {number} length - String length
         * @param {string} charset - Characters to choose from
         */
        string(length, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
            let result = '';
            for (let i = 0; i < length; i++) {
                result += this.char(charset);
            }
            return result;
        }

        // --------------------------------------------------------
        // STATE MANAGEMENT
        // --------------------------------------------------------

        /**
         * Get the current state (for saving)
         */
        getState() {
            return {
                algorithm: this.generator.name,
                generatorState: this.generator.getState(),
                normalCache: {
                    spare: this._spareNormal,
                    hasSpare: this._hasSpareNormal
                }
            };
        }

        /**
         * Restore from a saved state
         */
        setState(savedState) {
            this.setSeed(0, savedState.algorithm); // Initialize with correct algorithm
            this.generator.setState(savedState.generatorState);
            this._spareNormal = savedState.normalCache.spare;
            this._hasSpareNormal = savedState.normalCache.hasSpare;
        }

        /**
         * Reset to initial seed
         */
        reset() {
            this.generator.reset();
            this._spareNormal = null;
            this._hasSpareNormal = false;
        }

        /**
         * Clone this PRNG instance
         */
        clone() {
            const cloned = new PRNG(0, this.generator.name);
            cloned.generator = this.generator.clone();
            cloned._spareNormal = this._spareNormal;
            cloned._hasSpareNormal = this._hasSpareNormal;
            return cloned;
        }

        /**
         * Create a child PRNG with a derived seed
         * Useful for creating reproducible sub-generators
         */
        fork(label = '') {
            const derivedSeed = this.generator.name + '_' + this.randomInt() + '_' + label;
            return new PRNG(derivedSeed, this.generator.name);
        }
    }

    // ============================================================
    // NOISE GENERATORS
    // ============================================================

    /**
     * 1D/2D/3D Value Noise generator
     */
    class ValueNoise {
        constructor(seed = Date.now()) {
            this.rng = new PRNG(seed, 'xoshiro128');
            this.permutation = this._generatePermutation();
        }

        _generatePermutation() {
            const p = Array.from({ length: 256 }, (_, i) => i);
            this.rng.shuffle(p);
            return [...p, ...p]; // Double for overflow
        }

        _fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        _lerp(a, b, t) {
            return a + t * (b - a);
        }

        _hash(...coords) {
            let hash = 0;
            for (const c of coords) {
                hash = this.permutation[(hash + c) & 255];
            }
            return hash / 255;
        }

        /**
         * 1D noise
         */
        noise1D(x) {
            const xi = Math.floor(x) & 255;
            const xf = x - Math.floor(x);
            const u = this._fade(xf);
            
            return this._lerp(
                this._hash(xi),
                this._hash(xi + 1),
                u
            );
        }

        /**
         * 2D noise
         */
        noise2D(x, y) {
            const xi = Math.floor(x) & 255;
            const yi = Math.floor(y) & 255;
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            
            const u = this._fade(xf);
            const v = this._fade(yf);
            
            return this._lerp(
                this._lerp(this._hash(xi, yi), this._hash(xi + 1, yi), u),
                this._lerp(this._hash(xi, yi + 1), this._hash(xi + 1, yi + 1), u),
                v
            );
        }

        /**
         * 3D noise
         */
        noise3D(x, y, z) {
            const xi = Math.floor(x) & 255;
            const yi = Math.floor(y) & 255;
            const zi = Math.floor(z) & 255;
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            const zf = z - Math.floor(z);
            
            const u = this._fade(xf);
            const v = this._fade(yf);
            const w = this._fade(zf);
            
            return this._lerp(
                this._lerp(
                    this._lerp(this._hash(xi, yi, zi), this._hash(xi + 1, yi, zi), u),
                    this._lerp(this._hash(xi, yi + 1, zi), this._hash(xi + 1, yi + 1, zi), u),
                    v
                ),
                this._lerp(
                    this._lerp(this._hash(xi, yi, zi + 1), this._hash(xi + 1, yi, zi + 1), u),
                    this._lerp(this._hash(xi, yi + 1, zi + 1), this._hash(xi + 1, yi + 1, zi + 1), u),
                    v
                ),
                w
            );
        }

        /**
         * Fractal Brownian Motion (fBm) - layered noise
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;
            
            for (let i = 0; i < octaves; i++) {
                if (z !== null) {
                    value += amplitude * this.noise3D(x * frequency, y * frequency, z * frequency);
                } else if (y !== null) {
                    value += amplitude * this.noise2D(x * frequency, y * frequency);
                } else {
                    value += amplitude * this.noise1D(x * frequency);
                }
                
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value / maxValue;
        }
    }

    /**
     * Simplex Noise implementation
     */
    class SimplexNoise {
        constructor(seed = Date.now()) {
            this.rng = new PRNG(seed, 'xoshiro128');
            this.perm = new Uint8Array(512);
            this.permMod12 = new Uint8Array(512);
            
            const p = Array.from({ length: 256 }, (_, i) => i);
            this.rng.shuffle(p);
            
            for (let i = 0; i < 512; i++) {
                this.perm[i] = p[i & 255];
                this.permMod12[i] = this.perm[i] % 12;
            }
        }

        static grad3 = [
            [1,1,0], [-1,1,0], [1,-1,0], [-1,-1,0],
            [1,0,1], [-1,0,1], [1,0,-1], [-1,0,-1],
            [0,1,1], [0,-1,1], [0,1,-1], [0,-1,-1]
        ];

        _dot2(g, x, y) {
            return g[0] * x + g[1] * y;
        }

        _dot3(g, x, y, z) {
            return g[0] * x + g[1] * y + g[2] * z;
        }

        /**
         * 2D Simplex noise
         */
        noise2D(xin, yin) {
            const F2 = 0.5 * (Math.sqrt(3) - 1);
            const G2 = (3 - Math.sqrt(3)) / 6;
            
            let n0, n1, n2;
            
            const s = (xin + yin) * F2;
            const i = Math.floor(xin + s);
            const j = Math.floor(yin + s);
            const t = (i + j) * G2;
            const X0 = i - t;
            const Y0 = j - t;
            const x0 = xin - X0;
            const y0 = yin - Y0;
            
            let i1, j1;
            if (x0 > y0) { i1 = 1; j1 = 0; }
            else { i1 = 0; j1 = 1; }
            
            const x1 = x0 - i1 + G2;
            const y1 = y0 - j1 + G2;
            const x2 = x0 - 1 + 2 * G2;
            const y2 = y0 - 1 + 2 * G2;
            
            const ii = i & 255;
            const jj = j & 255;
            const gi0 = this.permMod12[ii + this.perm[jj]];
            const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
            const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
            
            let t0 = 0.5 - x0 * x0 - y0 * y0;
            if (t0 < 0) n0 = 0;
            else {
                t0 *= t0;
                n0 = t0 * t0 * this._dot2(SimplexNoise.grad3[gi0], x0, y0);
            }
            
            let t1 = 0.5 - x1 * x1 - y1 * y1;
            if (t1 < 0) n1 = 0;
            else {
                t1 *= t1;
                n1 = t1 * t1 * this._dot2(SimplexNoise.grad3[gi1], x1, y1);
            }
            
            let t2 = 0.5 - x2 * x2 - y2 * y2;
            if (t2 < 0) n2 = 0;
            else {
                t2 *= t2;
                n2 = t2 * t2 * this._dot2(SimplexNoise.grad3[gi2], x2, y2);
            }
            
            return 70 * (n0 + n1 + n2);
        }

        /**
         * 3D Simplex noise
         */
        noise3D(xin, yin, zin) {
            const F3 = 1 / 3;
            const G3 = 1 / 6;
            
            let n0, n1, n2, n3;
            
            const s = (xin + yin + zin) * F3;
            const i = Math.floor(xin + s);
            const j = Math.floor(yin + s);
            const k = Math.floor(zin + s);
            const t = (i + j + k) * G3;
            const X0 = i - t;
            const Y0 = j - t;
            const Z0 = k - t;
            const x0 = xin - X0;
            const y0 = yin - Y0;
            const z0 = zin - Z0;
            
            let i1, j1, k1, i2, j2, k2;
            
            if (x0 >= y0) {
                if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
                else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
                else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
            } else {
                if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
                else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
                else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
            }
            
            const x1 = x0 - i1 + G3;
            const y1 = y0 - j1 + G3;
            const z1 = z0 - k1 + G3;
            const x2 = x0 - i2 + 2 * G3;
            const y2 = y0 - j2 + 2 * G3;
            const z2 = z0 - k2 + 2 * G3;
            const x3 = x0 - 1 + 3 * G3;
            const y3 = y0 - 1 + 3 * G3;
            const z3 = z0 - 1 + 3 * G3;
            
            const ii = i & 255;
            const jj = j & 255;
            const kk = k & 255;
            const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
            const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
            const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
            const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];
            
            let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
            if (t0 < 0) n0 = 0;
            else {
                t0 *= t0;
                n0 = t0 * t0 * this._dot3(SimplexNoise.grad3[gi0], x0, y0, z0);
            }
            
            let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
            if (t1 < 0) n1 = 0;
            else {
                t1 *= t1;
                n1 = t1 * t1 * this._dot3(SimplexNoise.grad3[gi1], x1, y1, z1);
            }
            
            let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
            if (t2 < 0) n2 = 0;
            else {
                t2 *= t2;
                n2 = t2 * t2 * this._dot3(SimplexNoise.grad3[gi2], x2, y2, z2);
            }
            
            let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
            if (t3 < 0) n3 = 0;
            else {
                t3 *= t3;
                n3 = t3 * t3 * this._dot3(SimplexNoise.grad3[gi3], x3, y3, z3);
            }
            
            return 32 * (n0 + n1 + n2 + n3);
        }

        /**
         * Fractal Brownian Motion
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;
            
            for (let i = 0; i < octaves; i++) {
                if (z !== null) {
                    value += amplitude * this.noise3D(x * frequency, y * frequency, z * frequency);
                } else if (y !== null) {
                    value += amplitude * this.noise2D(x * frequency, y * frequency);
                }
                
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value / maxValue;
        }

        /**
         * Turbulence - absolute value noise for fire, smoke effects
         * Different from billowed: no normalization, frequency-based offsets create swirling patterns
         */
        turbulence(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            
            for (let i = 0; i < octaves; i++) {
                // Add offset based on octave to create swirling effect
                const ox = x * frequency + i * 1.7;
                const oy = y !== null ? y * frequency + i * 2.3 : null;
                const oz = z !== null ? z * frequency + i * 3.1 : null;
                
                let noise;
                if (oz !== null) {
                    noise = this.noise3D(ox, oy, oz);
                } else if (oy !== null) {
                    noise = this.noise2D(ox, oy);
                }
                // Use absolute value but don't square - creates sharper features
                value += amplitude * Math.abs(noise);
                
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            // Don't normalize - let values accumulate for more dramatic effect
            // Clamp to reasonable range
            return Math.min(1, value * 0.7);
        }

        /**
         * Domain warping - distort coordinates using noise
         */
        warp(x, y, warpStrength = 1, octaves = 4) {
            const qx = this.fbm(x, y, null, octaves);
            const qy = this.fbm(x + 5.2, y + 1.3, null, octaves);
            
            return this.fbm(
                x + warpStrength * qx,
                y + warpStrength * qy,
                null,
                octaves
            );
        }

        /**
         * Double domain warping for more complex patterns
         */
        warp2(x, y, warpStrength = 1, octaves = 4) {
            const qx = this.fbm(x, y, null, octaves);
            const qy = this.fbm(x + 5.2, y + 1.3, null, octaves);
            
            const rx = this.fbm(x + warpStrength * qx + 1.7, y + warpStrength * qy + 9.2, null, octaves);
            const ry = this.fbm(x + warpStrength * qx + 8.3, y + warpStrength * qy + 2.8, null, octaves);
            
            return this.fbm(
                x + warpStrength * rx,
                y + warpStrength * ry,
                null,
                octaves
            );
        }
    }

    /**
     * Classic Perlin Noise implementation
     */
    class PerlinNoise {
        constructor(seed = Date.now()) {
            this.rng = new PRNG(seed, 'xoshiro128');
            this.perm = new Uint8Array(512);
            
            const p = Array.from({ length: 256 }, (_, i) => i);
            this.rng.shuffle(p);
            
            for (let i = 0; i < 512; i++) {
                this.perm[i] = p[i & 255];
            }
        }

        static grad3 = [
            [1,1,0], [-1,1,0], [1,-1,0], [-1,-1,0],
            [1,0,1], [-1,0,1], [1,0,-1], [-1,0,-1],
            [0,1,1], [0,-1,1], [0,1,-1], [0,-1,-1]
        ];

        _fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        _lerp(a, b, t) {
            return a + t * (b - a);
        }

        _grad2(hash, x, y) {
            const h = hash & 3;
            const u = h < 2 ? x : y;
            const v = h < 2 ? y : x;
            return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
        }

        _grad3(hash, x, y, z) {
            const g = PerlinNoise.grad3[hash % 12];
            return g[0] * x + g[1] * y + g[2] * z;
        }

        /**
         * 2D Perlin noise
         */
        noise2D(x, y) {
            const xi = Math.floor(x) & 255;
            const yi = Math.floor(y) & 255;
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            
            const u = this._fade(xf);
            const v = this._fade(yf);
            
            const aa = this.perm[this.perm[xi] + yi];
            const ab = this.perm[this.perm[xi] + yi + 1];
            const ba = this.perm[this.perm[xi + 1] + yi];
            const bb = this.perm[this.perm[xi + 1] + yi + 1];
            
            const x1 = this._lerp(this._grad2(aa, xf, yf), this._grad2(ba, xf - 1, yf), u);
            const x2 = this._lerp(this._grad2(ab, xf, yf - 1), this._grad2(bb, xf - 1, yf - 1), u);
            
            return this._lerp(x1, x2, v);
        }

        /**
         * 3D Perlin noise
         */
        noise3D(x, y, z) {
            const xi = Math.floor(x) & 255;
            const yi = Math.floor(y) & 255;
            const zi = Math.floor(z) & 255;
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            const zf = z - Math.floor(z);
            
            const u = this._fade(xf);
            const v = this._fade(yf);
            const w = this._fade(zf);
            
            const aaa = this.perm[this.perm[this.perm[xi] + yi] + zi];
            const aba = this.perm[this.perm[this.perm[xi] + yi + 1] + zi];
            const aab = this.perm[this.perm[this.perm[xi] + yi] + zi + 1];
            const abb = this.perm[this.perm[this.perm[xi] + yi + 1] + zi + 1];
            const baa = this.perm[this.perm[this.perm[xi + 1] + yi] + zi];
            const bba = this.perm[this.perm[this.perm[xi + 1] + yi + 1] + zi];
            const bab = this.perm[this.perm[this.perm[xi + 1] + yi] + zi + 1];
            const bbb = this.perm[this.perm[this.perm[xi + 1] + yi + 1] + zi + 1];
            
            const x1 = this._lerp(
                this._lerp(this._grad3(aaa, xf, yf, zf), this._grad3(baa, xf-1, yf, zf), u),
                this._lerp(this._grad3(aba, xf, yf-1, zf), this._grad3(bba, xf-1, yf-1, zf), u),
                v
            );
            const x2 = this._lerp(
                this._lerp(this._grad3(aab, xf, yf, zf-1), this._grad3(bab, xf-1, yf, zf-1), u),
                this._lerp(this._grad3(abb, xf, yf-1, zf-1), this._grad3(bbb, xf-1, yf-1, zf-1), u),
                v
            );
            
            return this._lerp(x1, x2, w);
        }

        /**
         * Fractal Brownian Motion
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;
            
            for (let i = 0; i < octaves; i++) {
                if (z !== null) {
                    value += amplitude * this.noise3D(x * frequency, y * frequency, z * frequency);
                } else if (y !== null) {
                    value += amplitude * this.noise2D(x * frequency, y * frequency);
                }
                
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value / maxValue;
        }
    }

    /**
     * Worley (Cellular/Voronoi) Noise
     * Great for stone textures, biological patterns, cracked earth
     */
    class WorleyNoise {
        constructor(seed = Date.now()) {
            this.rng = new PRNG(seed, 'xoshiro128');
            this.seed = seed;
        }

        _hash(x, y, z = 0) {
            // Create deterministic random point positions per cell
            const rng = new PRNG(`${this.seed}_${x}_${y}_${z}`, 'xoshiro128');
            return {
                x: x + rng.random(),
                y: y + rng.random(),
                z: z + rng.random()
            };
        }

        /**
         * 2D Worley noise
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @param {string} distanceType - 'euclidean', 'manhattan', or 'chebyshev'
         * @param {number} returnType - 0 = F1, 1 = F2, 2 = F2-F1
         */
        noise2D(x, y, distanceType = 'euclidean', returnType = 0) {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            
            const distances = [];
            
            // Check 3x3 neighborhood
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const cellX = xi + dx;
                    const cellY = yi + dy;
                    const point = this._hash(cellX, cellY);
                    
                    let dist;
                    const px = point.x - x;
                    const py = point.y - y;
                    
                    switch (distanceType) {
                        case 'manhattan':
                            dist = Math.abs(px) + Math.abs(py);
                            break;
                        case 'chebyshev':
                            dist = Math.max(Math.abs(px), Math.abs(py));
                            break;
                        default: // euclidean
                            dist = Math.sqrt(px * px + py * py);
                    }
                    
                    distances.push(dist);
                }
            }
            
            distances.sort((a, b) => a - b);
            
            switch (returnType) {
                case 1: return distances[1]; // F2 (second closest)
                case 2: return distances[1] - distances[0]; // F2 - F1 (cell edges)
                default: return distances[0]; // F1 (closest)
            }
        }

        /**
         * 3D Worley noise
         */
        noise3D(x, y, z, distanceType = 'euclidean', returnType = 0) {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const zi = Math.floor(z);
            
            const distances = [];
            
            // Check 3x3x3 neighborhood
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const cellX = xi + dx;
                        const cellY = yi + dy;
                        const cellZ = zi + dz;
                        const point = this._hash(cellX, cellY, cellZ);
                        
                        let dist;
                        const px = point.x - x;
                        const py = point.y - y;
                        const pz = point.z - z;
                        
                        switch (distanceType) {
                            case 'manhattan':
                                dist = Math.abs(px) + Math.abs(py) + Math.abs(pz);
                                break;
                            case 'chebyshev':
                                dist = Math.max(Math.abs(px), Math.abs(py), Math.abs(pz));
                                break;
                            default: // euclidean
                                dist = Math.sqrt(px * px + py * py + pz * pz);
                        }
                        
                        distances.push(dist);
                    }
                }
            }
            
            distances.sort((a, b) => a - b);
            
            switch (returnType) {
                case 1: return distances[1];
                case 2: return distances[1] - distances[0];
                default: return distances[0];
            }
        }

        /**
         * FBM for Worley noise
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5, distanceType = 'euclidean', returnType = 0) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;
            
            for (let i = 0; i < octaves; i++) {
                if (z !== null) {
                    value += amplitude * this.noise3D(x * frequency, y * frequency, z * frequency, distanceType, returnType);
                } else if (y !== null) {
                    value += amplitude * this.noise2D(x * frequency, y * frequency, distanceType, returnType);
                }
                
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value / maxValue;
        }
    }

    /**
     * Ridged Multifractal Noise
     * Great for mountain ridges, lightning, veins
     */
    class RidgedNoise {
        constructor(seed = Date.now()) {
            this.simplex = new SimplexNoise(seed);
        }

        _ridge(value, offset = 1) {
            value = offset - Math.abs(value);
            return value * value;
        }

        /**
         * 2D Ridged noise
         */
        noise2D(x, y) {
            return this._ridge(this.simplex.noise2D(x, y));
        }

        /**
         * 3D Ridged noise
         */
        noise3D(x, y, z) {
            return this._ridge(this.simplex.noise3D(x, y, z));
        }

        /**
         * Ridged multifractal FBM
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5, offset = 1) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let weight = 1;
            
            for (let i = 0; i < octaves; i++) {
                let noise;
                if (z !== null) {
                    noise = this.simplex.noise3D(x * frequency, y * frequency, z * frequency);
                } else if (y !== null) {
                    noise = this.simplex.noise2D(x * frequency, y * frequency);
                }
                
                // Ridge transformation
                noise = offset - Math.abs(noise);
                noise = noise * noise;
                
                // Weight successive contributions by previous signal
                noise *= weight;
                weight = Math.min(1, Math.max(0, noise * 2));
                
                value += noise * amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value;
        }
    }

    /**
     * Billowed Noise (abs of regular noise)
     * Great for clouds, soft terrain
     */
    class BillowedNoise {
        constructor(seed = Date.now()) {
            this.simplex = new SimplexNoise(seed);
        }

        /**
         * 2D Billowed noise
         */
        noise2D(x, y) {
            return Math.abs(this.simplex.noise2D(x, y));
        }

        /**
         * 3D Billowed noise
         */
        noise3D(x, y, z) {
            return Math.abs(this.simplex.noise3D(x, y, z));
        }

        /**
         * Billowed FBM
         */
        fbm(x, y = null, z = null, octaves = 4, lacunarity = 2, persistence = 0.5) {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;
            
            for (let i = 0; i < octaves; i++) {
                if (z !== null) {
                    value += amplitude * Math.abs(this.simplex.noise3D(x * frequency, y * frequency, z * frequency));
                } else if (y !== null) {
                    value += amplitude * Math.abs(this.simplex.noise2D(x * frequency, y * frequency));
                }
                
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            
            return value / maxValue;
        }
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    const PRNG_Library = {
        // Main class
        PRNG,
        
        // Algorithm classes (for direct use)
        Algorithms: {
            Mulberry32,
            Xoshiro128SS,
            Xorshift128Plus,
            PCG32,
            SFC32,
            LCG
        },
        
        // Noise generators
        Noise: {
            ValueNoise,
            SimplexNoise,
            PerlinNoise,
            WorleyNoise,
            RidgedNoise,
            BillowedNoise
        },
        
        // Utility functions
        Utils: {
            stringToSeed,
            cyrb128,
            splitmix64
        },
        
        // Factory function
        create(seed, algorithm) {
            return new PRNG(seed, algorithm);
        },
        
        // Quick access to a global instance
        _globalInstance: null,
        
        seed(seed, algorithm = 'xoshiro128') {
            this._globalInstance = new PRNG(seed, algorithm);
            return this;
        },
        
        random() {
            if (!this._globalInstance) this._globalInstance = new PRNG();
            return this._globalInstance.random();
        }
    };

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PRNG_Library;
    } else if (typeof define === 'function' && define.amd) {
        define(function() { return PRNG_Library; });
    } else {
        global.PRNG = PRNG_Library;
    }

})(typeof window !== 'undefined' ? window : global);
