/**
 * VORONOI MAP GENERATOR - PRNG
 * Seedable pseudorandom number generator (Mulberry32)
 * Fast and provides good distribution for map generation
 */

export const PRNG = {
    seed: 12345,
    
    /**
     * Set the seed for reproducible generation
     */
    setSeed(seed) {
        this.seed = seed >>> 0; // Ensure unsigned 32-bit
    },
    
    /**
     * Mulberry32 PRNG - fast and good quality
     * Returns value in [0, 1)
     */
    random() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    
    /**
     * Random float in range [min, max)
     */
    range(min, max) {
        return min + this.random() * (max - min);
    },
    
    /**
     * Random integer in range [min, max]
     */
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    },
    
    /**
     * Gaussian (normal) distribution using Box-Muller transform
     * mean: center of distribution
     * stdDev: standard deviation
     */
    gaussian(mean = 0, stdDev = 1) {
        const u1 = this.random();
        const u2 = this.random();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return z0 * stdDev + mean;
    },
    
    /**
     * Shuffle array in place using Fisher-Yates
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },
    
    /**
     * Pick random element from array
     */
    pick(array) {
        return array[this.int(0, array.length - 1)];
    }
};
