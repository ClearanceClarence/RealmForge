/**
 * Seeded PRNG — singleton wrapper around SeedForge.
 *
 * SeedForge (github.com/ClearanceClarence/seedforge-prng) is loaded
 * as a UMD global from index.html (`<script src="...seedforge.js">`),
 * exposing `window.PRNG` as a namespace with `.PRNG` as the class.
 * That class supports multiple algorithms, statistical distributions,
 * fork(), state save/restore, etc. We use the `sfc32` algorithm —
 * fastest with excellent statistical quality, recommended by the
 * library author.
 *
 * This module wraps a single SeedForge instance behind the same
 * compact API our codebase already uses (`PRNG.setSeed`,
 * `PRNG.random`, `PRNG.range`, `PRNG.int`, `PRNG.pick`), so the
 * 50-ish existing call sites keep working unchanged.
 *
 * Additional capabilities exposed on top of the singleton:
 *
 *   PRNG.fork(label)        Return a new INDEPENDENT generator keyed
 *                           by the current seed + label. Use this to
 *                           give a subsystem its own deterministic
 *                           stream that can't accidentally collide
 *                           with the main one.
 *   PRNG.normal(mean, sd)   Box-Muller normal distribution.
 *   PRNG.weighted(items, weights)  Weighted random pick.
 *
 * The instance is replaced (not seeded in place) on setSeed() so
 * algorithm-specific state is fully reset between worlds.
 */

// Lazy-init the SeedForge instance. Defer until first use so the
// module load order doesn't matter — the script tag loading SeedForge
// runs synchronously before any module code that imports `PRNG` has
// a chance to call into it.
let _instance = null;
let _currentSeed = 12345;

function _ensure() {
    if (_instance) return _instance;
    if (typeof window === 'undefined' || !window.PRNG || !window.PRNG.PRNG) {
        throw new Error('SeedForge PRNG library not loaded. Include seedforge.js before this module.');
    }
    _instance = new window.PRNG.PRNG(_currentSeed, 'sfc32');
    return _instance;
}

/**
 * Singleton seeded PRNG. All map generation pulls randomness from here
 * unless explicitly forked via `PRNG.fork()`.
 */
export const PRNG = {
    /** Read-only mirror of the last seed set. */
    get seed() { return _currentSeed; },
    
    /**
     * Set the seed and reset the generator to that seed's start state.
     * Callers can pass any number (or string — SeedForge accepts both).
     */
    setSeed(seed) {
        _currentSeed = seed;
        _instance = new window.PRNG.PRNG(seed, 'sfc32');
    },
    
    /** Random float in [0, 1). */
    random() { return _ensure().random(); },
    
    /** Random float in [min, max). */
    range(min, max) { return _ensure().float(min, max); },
    
    /** Random integer in [min, max] (inclusive). */
    int(min, max) { return _ensure().int(min, max); },
    
    /** Pick a uniformly random element from `array`. */
    pick(array) { return _ensure().pick(array); },
    
    /**
     * Fork an independent generator from the current seed + label.
     * The returned object exposes the same compact API (random, range,
     * int, pick, normal, weighted), but its stream is separate from
     * the singleton — pulling from it doesn't advance the main stream
     * and vice versa. Use this to give subsystems (e.g. coastline
     * subdivision, ocean cull) their own deterministic stream so
     * changes in one system can't perturb others.
     *
     * @param {string} label A short identifier for this stream.
     * @returns {Object} A SeedForge-backed generator with the same
     *                   API surface as this singleton.
     */
    fork(label) {
        const child = _ensure().fork(label);
        return {
            random: () => child.random(),
            range: (a, b) => child.float(a, b),
            int: (a, b) => child.int(a, b),
            pick: (arr) => child.pick(arr),
            normal: (mean = 0, sd = 1) => child.normal(mean, sd),
            weighted: (items, weights) => child.weightedPick(items, weights)
        };
    },
    
    /**
     * Box-Muller normal distribution. Available directly on the
     * singleton so generation code can pull bell-curve values
     * without forking.
     */
    normal(mean = 0, sd = 1) { return _ensure().normal(mean, sd); },
    
    /**
     * Weighted pick: items[i] gets selected with probability
     * weights[i] / sum(weights).
     */
    weighted(items, weights) { return _ensure().weightedPick(items, weights); }
};
