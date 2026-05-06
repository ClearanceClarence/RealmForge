/**
 * Mulberry32-based seedable PRNG.
 *
 * Used as the foundation for all reproducible randomness in the
 * generator: noise field seeding (via `Noise.init`), point jitter,
 * culture picking, name generation. Same seed -> identical output.
 *
 * Module-level singleton — the entire generation pipeline shares one
 * stream, so the order of operations matters for reproducibility.
 */
export const PRNG = {
    seed: 12345,
    
    /** Set the seed (clamped to unsigned 32-bit). */
    setSeed(seed) {
        this.seed = seed >>> 0;
    },
    
    /** Mulberry32 step. Returns a value in [0, 1). */
    random() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    
    /** Random float in [min, max). */
    range(min, max) {
        return min + this.random() * (max - min);
    },
    
    /** Random integer in [min, max] (inclusive). */
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    },
    
    /** Pick a uniformly random element from `array`. */
    pick(array) {
        return array[this.int(0, array.length - 1)];
    }
};
