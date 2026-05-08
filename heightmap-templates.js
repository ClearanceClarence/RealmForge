/**
 * Heightmap templates — recognizable continent shapes via composed
 * primitives, inspired by Azgaar's heightmap template DSL but
 * cell-native rather than pixel-grid.
 *
 * Each TEMPLATE is a function that takes a TemplateBuilder and emits
 * a sequence of primitive operations on the cell graph: hill, range,
 * trough, pit, strait, add, multiply, mask, smooth, invert.
 *
 * The primitives operate directly on `gen.heights` (a Float32Array
 * keyed by cell index) using BFS through `gen.voronoi.neighbors(i)`
 * to spread radial / linear effects across cells. No grid sampling;
 * features place naturally regardless of cell density.
 *
 * Coordinate convention: x and y are PERCENTAGES of the map (0–100).
 * Ranges are [min, max] arrays — the builder picks a random value in
 * the range using its own deterministic PRNG fork.
 *
 * Example usage:
 *   const builder = new TemplateBuilder(gen);
 *   templates.volcano(builder);
 *   builder.finish();
 *
 * @module heightmap-templates
 */

import { PRNG } from './prng.js';
import { Noise } from './noise.js';
import { ELEVATION } from './map-constants.js';

/**
 * TemplateBuilder — applies primitive operations to a generator's
 * heightmap. Maintains a private PRNG fork so template runs are
 * deterministic per (seed, template) pair without perturbing other
 * subsystems' streams.
 *
 * Builder lifetime is one heightmap-generation pass.
 *
 * The scratch buffer starts at a small NEGATIVE baseline so untouched
 * cells default to ocean. Templates raise specific regions above 0
 * with hills/ranges to create land. This mirrors Azgaar's behavior:
 * the world starts as sea, primitives sculpt land into it.
 */
export class TemplateBuilder {
    constructor(gen) {
        this.gen = gen;
        this.rng = PRNG.fork('heightmap-template');
        
        // Scratch buffer for accumulated template heights. Default
        // value is a small negative — untouched cells become shallow
        // ocean unless a primitive raises them.
        const N = gen.cellCount;
        this._scratch = new Float32Array(N);
        for (let i = 0; i < N; i++) this._scratch[i] = -20;
        
        // Cache average cell radius in world units. Used as the
        // distance unit for radial falloff so hills shrink the same
        // amount per world-unit regardless of cell density.
        this._cellRadius = Math.sqrt((gen.width * gen.height) / N) * 0.5;
        
        // Auto-noise defaults. Templates can override via setNoise()
        // before finish() runs. Lower values preserve narrow features;
        // higher values give more organic coastline texture.
        this._macroNoiseAmp = 18;
        this._microNoiseAmp = 8;
    }
    
    /**
     * Override the auto-noise amplitudes used by finish(). Call this
     * from a template that has narrow features (bridges, thin
     * peninsulas) which would otherwise fragment under default noise.
     */
    setNoise(opts = {}) {
        if (opts.macro !== undefined) this._macroNoiseAmp = opts.macro;
        if (opts.micro !== undefined) this._microNoiseAmp = opts.micro;
    }
    
    /** Pick a value in `[min, max)`. Accepts either a 2-tuple or a number. */
    _pick(value) {
        if (Array.isArray(value)) return this.rng.range(value[0], value[1]);
        return value;
    }
    
    /** Pick an integer count. Either a number or a [min, max] range. */
    _pickInt(value) {
        if (Array.isArray(value)) return this.rng.int(value[0], value[1]);
        return Math.round(value);
    }
    
    /** Convert a percentage [0..100] to map x in world units. */
    _px(percent) { return (percent / 100) * this.gen.width; }
    /** Convert a percentage [0..100] to map y in world units. */
    _py(percent) { return (percent / 100) * this.gen.height; }
    
    /** Find the cell index closest to a world (x, y) point. */
    _cellAt(x, y) {
        return this.gen.voronoi.find(x, y);
    }
    
    // ─── PRIMITIVES ────────────────────────────────────────────────
    
    /**
     * Place radial hills. A hill is a single peak that falls off
     * smoothly with distance from its center cell.
     *
     * @param {Object} opts
     * @param {number|[number,number]} opts.count   How many hills.
     * @param {number|[number,number]} opts.height  Peak height (normalized 0-100).
     * @param {[number,number]} opts.x  X range as map-percentage.
     * @param {[number,number]} opts.y  Y range as map-percentage.
     */
    hill(opts) {
        const count = this._pickInt(opts.count);
        for (let i = 0; i < count; i++) {
            const peak = this._pick(opts.height);
            const x = this._px(this._pick(opts.x));
            const y = this._py(this._pick(opts.y));
            // Radius scales with peak: bigger hills cover more world area.
            // Roughly: a hill of peak 100 covers ~25% of map width.
            const radius = this._radiusFor(peak);
            this._radialAdd(x, y, peak, radius);
        }
    }
    
    /**
     * Place mountain ranges. A range is an elongated chain of bumps
     * connecting two random points, with a gentle bend.
     */
    range(opts) {
        const count = this._pickInt(opts.count);
        for (let i = 0; i < count; i++) {
            const peak = this._pick(opts.height);
            const x1 = this._px(this._pick(opts.x));
            const y1 = this._py(this._pick(opts.y));
            const x2 = this._px(this._pick(opts.x));
            const y2 = this._py(this._pick(opts.y));
            // Ranges are narrower than hills — half the radius so they
            // read as elongated rather than blobby.
            const radius = this._radiusFor(peak) * 0.5;
            this._linearChain(x1, y1, x2, y2, peak, radius);
        }
    }
    
    /** Carve troughs (inverse of range — long valleys). */
    trough(opts) {
        const count = this._pickInt(opts.count);
        for (let i = 0; i < count; i++) {
            const depth = this._pick(opts.height);
            const x1 = this._px(this._pick(opts.x));
            const y1 = this._py(this._pick(opts.y));
            const x2 = this._px(this._pick(opts.x));
            const y2 = this._py(this._pick(opts.y));
            const radius = this._radiusFor(depth) * 0.5;
            this._linearChain(x1, y1, x2, y2, -depth, radius);
        }
    }
    
    /** Carve pits (inverse of hill — depressions). */
    pit(opts) {
        const count = this._pickInt(opts.count);
        for (let i = 0; i < count; i++) {
            const depth = this._pick(opts.height);
            const x = this._px(this._pick(opts.x));
            const y = this._py(this._pick(opts.y));
            const radius = this._radiusFor(depth);
            this._radialAdd(x, y, -depth, radius);
        }
    }
    
    /**
     * Convert a peak/depth amplitude (normalized 0–100) to a radius
     * in world units. Bigger amplitudes get wider footprints — a
     * small bump of 10 spans only a few cell-widths, a giant peak
     * of 100 spans roughly a third of the map.
     */
    _radiusFor(amplitude) {
        const a = Math.abs(amplitude);
        const minMapDim = Math.min(this.gen.width, this.gen.height);
        // Linear: 0 -> 0, 100 -> 0.35 of min dimension.
        return (a / 100) * minMapDim * 0.35;
    }
    
    /**
     * Carve a sea strait across the map.
     *
     * @param {Object} opts
     * @param {number|[number,number]} opts.width  Strait width as map-percentage.
     * @param {('vertical'|'horizontal')} opts.axis
     */
    strait(opts) {
        const widthPct = this._pick(opts.width);
        const axis = opts.axis || 'vertical';
        const W = this.gen.width, H = this.gen.height;
        const heights = this._scratch;
        
        if (axis === 'vertical') {
            // Strait runs from top to bottom, passing through map middle ±
            // a wandering offset. Carve cells where x is within the strait.
            const cx = W / 2;
            const halfW = (widthPct / 100) * W * 0.5;
            for (let i = 0; i < this.gen.cellCount; i++) {
                const x = this.gen.points[i * 2];
                const y = this.gen.points[i * 2 + 1];
                // Wandering centerline: small noise-like offset based on y
                const wander = Math.sin(y * 0.005) * halfW * 0.3 +
                               Math.sin(y * 0.013 + 1.7) * halfW * 0.2;
                const dx = Math.abs(x - cx - wander);
                if (dx < halfW) {
                    // Falloff to zero at the strait edge
                    const t = 1 - dx / halfW;
                    heights[i] -= 30 * t;
                }
            }
        } else {
            const cy = H / 2;
            const halfW = (widthPct / 100) * H * 0.5;
            for (let i = 0; i < this.gen.cellCount; i++) {
                const x = this.gen.points[i * 2];
                const y = this.gen.points[i * 2 + 1];
                const wander = Math.sin(x * 0.005) * halfW * 0.3 +
                               Math.sin(x * 0.013 + 1.7) * halfW * 0.2;
                const dy = Math.abs(y - cy - wander);
                if (dy < halfW) {
                    const t = 1 - dy / halfW;
                    heights[i] -= 30 * t;
                }
            }
        }
    }
    
    /**
     * Add a flat amount to cells matching a region filter.
     *
     * @param {Object} opts
     * @param {number} opts.amount  Amount to add (can be negative).
     * @param {('all'|'land'|[number,number])} [opts.range='all']
     *   'all' = every cell. 'land' = cells currently above 0.
     *   [a, b] = cells whose current normalized height is in [a, b].
     */
    add(opts) {
        const amount = opts.amount;
        const heights = this._scratch;
        const region = opts.range || 'all';
        for (let i = 0; i < this.gen.cellCount; i++) {
            if (region === 'all') {
                heights[i] += amount;
            } else if (region === 'land') {
                if (heights[i] > 0) heights[i] += amount;
            } else if (Array.isArray(region)) {
                if (heights[i] >= region[0] && heights[i] <= region[1]) {
                    heights[i] += amount;
                }
            }
        }
    }
    
    /** Multiply heights by `factor` for cells in `range`. Same range semantics as add(). */
    multiply(opts) {
        const factor = opts.factor;
        const heights = this._scratch;
        const region = opts.range || 'all';
        for (let i = 0; i < this.gen.cellCount; i++) {
            if (region === 'all') {
                heights[i] *= factor;
            } else if (region === 'land') {
                if (heights[i] > 0) heights[i] *= factor;
            } else if (Array.isArray(region)) {
                if (heights[i] >= region[0] && heights[i] <= region[1]) {
                    heights[i] *= factor;
                }
            }
        }
    }
    
    /**
     * Edge-falloff mask. Pushes cells near the map edge toward water
     * proportionally to their distance from center. Strength > 0 pulls
     * edges DOWN (toward and below sea level). Larger strength = more
     * oceanic edges. Strength of 1 fully pulls corners to deep ocean
     * (-50 baseline) while leaving the center untouched.
     *
     * Uses a smooth radial cosine falloff anchored at the map center
     * by default. Pass `side: 'left'|'right'|'top'|'bottom'` for a
     * directional pull instead — useful for coastal templates that
     * want land flush against one map edge with open ocean on the
     * other side.
     */
    mask(opts) {
        const strength = opts.strength;
        const side = opts.side || null;
        const heights = this._scratch;
        const W = this.gen.width, H = this.gen.height;
        
        if (side) {
            // Directional pull. Cells deep into the named side get
            // pulled toward ocean; cells far from that side are
            // untouched.
            for (let i = 0; i < this.gen.cellCount; i++) {
                const x = this.gen.points[i * 2];
                const y = this.gen.points[i * 2 + 1];
                let depthIntoSide;   // 0 = at far edge, 1 = at this side
                if (side === 'right')      depthIntoSide = x / W;
                else if (side === 'left')  depthIntoSide = 1 - x / W;
                else if (side === 'bottom')depthIntoSide = y / H;
                else if (side === 'top')   depthIntoSide = 1 - y / H;
                else depthIntoSide = 0;
                // Smoothstep: zero pull at depth 0..0.4, ramping to full
                // pull at depth 0.7+. Keeps the "near" side untouched
                // and only attacks the far half.
                const t = Math.max(0, Math.min(1, (depthIntoSide - 0.4) / 0.3));
                const pull = strength * t * t * (3 - 2 * t);
                heights[i] = heights[i] * (1 - pull) + (-50) * pull;
            }
            return;
        }
        
        // Radial mask (default).
        const cx = W / 2, cy = H / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        for (let i = 0; i < this.gen.cellCount; i++) {
            const dx = this.gen.points[i * 2] - cx;
            const dy = this.gen.points[i * 2 + 1] - cy;
            const r = Math.sqrt(dx * dx + dy * dy) / maxR;   // 0 center -> 1 corner
            // Cosine: 1 at center, 0 at corner.
            const m = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, r)));
            // Pull toward -50 (deep ocean) by `strength * (1 - m)`.
            // At center (m=1): no change. At corner (m=0): full pull.
            const pull = strength * (1 - m);
            heights[i] = heights[i] * (1 - pull) + (-50) * pull;
        }
    }
    
    /**
     * Smoothing pass — averages each cell with its neighbours.
     *
     * @param {number} [iterations=1]
     */
    smooth(opts) {
        const iters = (opts && opts.iterations) || 1;
        const heights = this._scratch;
        const buf = new Float32Array(this.gen.cellCount);
        for (let pass = 0; pass < iters; pass++) {
            for (let i = 0; i < this.gen.cellCount; i++) {
                let sum = heights[i];
                let count = 1;
                for (const n of this.gen.voronoi.neighbors(i)) {
                    if (n >= this.gen.cellCount) continue;   // skip phantoms
                    sum += heights[n];
                    count++;
                }
                buf[i] = sum / count;
            }
            heights.set(buf);
        }
    }
    
    /**
     * Layer fractal noise onto every cell. This is what turns the
     * blobby radial gradients from hill/range into recognisable
     * terrain — without it, the surfaces are too smooth and look
     * artificial. Noise can be 'fbm' (rolling hills) or 'ridged'
     * (mountainous, sharper).
     *
     * The noise field is sampled at world coordinates so the texture
     * scale stays consistent across map sizes. Amplitude is the
     * peak-to-valley range in scratch units.
     *
     * @param {Object} opts
     * @param {number} [opts.amplitude=15]   How much terrain variation to add.
     * @param {number} [opts.frequency=4]    Cycles per map width.
     * @param {number} [opts.octaves=5]      Detail levels.
     * @param {('fbm'|'ridged')} [opts.type='fbm']
     * @param {boolean} [opts.landOnly=false]   Only apply to currently-positive cells.
     */
    noise(opts = {}) {
        const amplitude = opts.amplitude ?? 15;
        const frequency = opts.frequency ?? 4;
        const octaves = opts.octaves ?? 5;
        const type = opts.type || 'fbm';
        const landOnly = opts.landOnly === true;
        
        // Each noise call uses a different sub-seed so multiple noise
        // layers don't correlate (otherwise stacking two calls just
        // doubles the same pattern).
        const noiseSeed = Math.floor(this.rng.random() * 1e9);
        Noise.init(noiseSeed);
        
        const heights = this._scratch;
        const W = this.gen.width;
        const H = this.gen.height;
        for (let i = 0; i < this.gen.cellCount; i++) {
            if (landOnly && heights[i] <= 0) continue;
            const x = this.gen.points[i * 2] / W;
            const y = this.gen.points[i * 2 + 1] / H;
            const n = (type === 'ridged')
                ? Noise.ridged(x, y, { frequency, octaves })
                : Noise.fbm(x, y, { frequency, octaves });
            heights[i] += n * amplitude;
        }
    }
    
    /**
     * Disable the automatic noise pass that finish() normally
     * applies. Use this for templates that want intentionally
     * smooth/clean shapes (e.g. atoll's perfect ring, or geometric
     * test cases). Templates can still call b.noise() manually for
     * custom noise patterns.
     */
    skipAutoNoise() {
        this._skipAutoNoise = true;
    }
    
    /** Invert heights along an axis (for peninsula-style mirroring). */
    invert(opts) {
        const t = opts.t || 0.5;
        const axis = opts.axis || 'both';
        const heights = this._scratch;
        const W = this.gen.width, H = this.gen.height;
        for (let i = 0; i < this.gen.cellCount; i++) {
            const x = this.gen.points[i * 2];
            const y = this.gen.points[i * 2 + 1];
            // For each axis, find the mirror cell index and blend.
            // Simple flip-around-center approach.
            let mx = x, my = y;
            if (axis === 'x' || axis === 'both') mx = W - x;
            if (axis === 'y' || axis === 'both') my = H - y;
            const mirror = this.gen.voronoi.find(mx, my);
            if (mirror >= 0 && mirror < this.gen.cellCount) {
                heights[i] = heights[i] * (1 - t) + heights[mirror] * t;
            }
        }
    }
    
    // ─── INTERNAL HELPERS ──────────────────────────────────────────
    
    /**
     * Add a radial bump centered on world coords (x, y). Walks
     * outward through the cell graph but uses world-DISTANCE for
     * the falloff curve, not hop count — so a hill at peak=80 with
     * radius=200 always covers ~200 world units of cells regardless
     * of local cell density. The BFS just controls which cells get
     * visited (those reachable from the seed); the amplitude at
     * each cell is computed from straight-line distance to the
     * center.
     *
     * Falloff curve: amp(d) = peak * (1 - (d/radius)^2), clamped to
     * [0, peak]. Smooth quadratic falloff to zero at the radius.
     */
    _radialAdd(x, y, peak, radius) {
        const startCell = this._cellAt(x, y);
        if (startCell < 0 || startCell >= this.gen.cellCount) return;
        if (radius <= 0) return;
        
        const heights = this._scratch;
        const visited = new Uint8Array(this.gen.cellCount);
        const queue = [startCell];
        visited[startCell] = 1;
        const r2 = radius * radius;
        const points = this.gen.points;
        // Apply at center.
        heights[startCell] += peak;
        
        let head = 0;
        while (head < queue.length) {
            const c = queue[head++];
            for (const n of this.gen.voronoi.neighbors(c)) {
                if (n >= this.gen.cellCount || visited[n]) continue;
                visited[n] = 1;
                const dx = points[n * 2] - x;
                const dy = points[n * 2 + 1] - y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= r2) continue;   // outside the bump's radius
                const t = Math.sqrt(d2) / radius;   // 0 at center, 1 at edge
                // Smoothstep-style cubic falloff: gentler than quadratic,
                // and the inflection at t=0.5 means the visible "edge" of
                // the hill isn't where the gradient is steepest, which
                // breaks the obvious circular look.
                const f = 1 - (3 * t * t - 2 * t * t * t);
                heights[n] += peak * f;
                queue.push(n);
            }
        }
    }
    
    /**
     * Lay a chain of bumps along the line from (x1,y1) to (x2,y2).
     * Each step adds a radial bump with `falloff` (smaller than for
     * a hill, so the chain reads as elongated rather than blobby).
     */
    _linearChain(x1, y1, x2, y2, peak, radius) {
        const dx = x2 - x1, dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) {
            this._radialAdd(x1, y1, peak, radius);
            return;
        }
        // Step roughly every (radius * 0.6) world units, so the bumps
        // overlap into a continuous ridge rather than a row of dots.
        const stepDist = Math.max(this._cellRadius * 2, radius * 0.6);
        const steps = Math.max(2, Math.ceil(length / stepDist));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            // Slight per-step jitter so the range isn't a perfect line.
            const jx = (this.rng.random() - 0.5) * this._cellRadius * 2;
            const jy = (this.rng.random() - 0.5) * this._cellRadius * 2;
            this._radialAdd(x + jx, y + jy, peak * 0.7, radius);
        }
    }
    
    /**
     * Finalize the build: copy the scratch buffer into the generator's
     * heights array, mapping the [-100, +100]-ish normalized range to
     * actual elevation in metres.
     *
     * Mapping: scratch value 0 → SEA_LEVEL (0m). Positive values map
     * linearly to 0..MAX_HEIGHT. Negative values map to 0..MIN_HEIGHT.
     * Roughly: scratch 50 → 3000m, scratch -50 → -2000m.
     */
    finish() {
        const heights = this._scratch;
        const out = this.gen.heights;
        const N = this.gen.cellCount;
        
        // Auto-apply natural terrain texture unless the template
        // already disabled it via b.skipAutoNoise(). The radial
        // primitives produce smooth circular falloffs which look
        // artificial on their own — layered fractal noise breaks
        // up the surface and gives the terrain real texture.
        //
        // Two passes:
        //   1) Macro fbm: big rolling variations, breaks up the
        //      perfect radial shape of each hill. This is what
        //      stops a single hill from looking like a smooth disc.
        //   2) Micro ridged: small-scale sharp ridges, gives land
        //      its mountainy character.
        //
        // We apply BEFORE clamping/mapping so the noise contributes
        // both to land elevation AND to potentially flipping
        // marginal cells across sea level — that's what produces
        // organic, irregular coastlines.
        //
        // Templates with narrow features (isthmus bridges, thin
        // peninsulas) should call setNoise() to lower the macro
        // amplitude — otherwise noise can fragment the connector.
        if (!this._skipAutoNoise) {
            this.noise({ amplitude: this._macroNoiseAmp, frequency: 3, octaves: 5, type: 'fbm' });
            this.noise({ amplitude: this._microNoiseAmp, frequency: 10, octaves: 4, type: 'ridged', landOnly: true });
        }
        
        // Sanity check: detect NaN in the scratch buffer before mapping.
        let nanCount = 0;
        for (let i = 0; i < N; i++) {
            if (Number.isNaN(heights[i])) {
                nanCount++;
                heights[i] = -20;   // recover with baseline
            }
        }
        if (nanCount > 0) {
            console.warn(`[template] scratch had ${nanCount} NaN values, recovered to -20`);
        }
        
        // Find the actual scratch min/max so the elevation mapping
        // uses the realised range rather than assumed bounds — keeps
        // generated maps from clipping at peak heights when a template
        // runs especially tall.
        let lo = Infinity, hi = -Infinity;
        let landCount = 0;
        for (let i = 0; i < N; i++) {
            if (heights[i] < lo) lo = heights[i];
            if (heights[i] > hi) hi = heights[i];
            if (heights[i] >= 0) landCount++;
        }
        console.log(`[template] scratch: range [${lo.toFixed(1)}, ${hi.toFixed(1)}], ${landCount}/${N} land (${(landCount/N*100).toFixed(1)}%)`);
        if (hi <= 0) hi = 1;
        if (lo >= 0) lo = -1;
        
        for (let i = 0; i < N; i++) {
            const h = heights[i];
            if (h >= 0) {
                out[i] = (h / hi) * ELEVATION.MAX * 0.85;
            } else {
                out[i] = (h / lo) * ELEVATION.MIN * 0.85;
            }
        }
        // Reclassify terrain to match.
        for (let i = 0; i < N; i++) {
            this.gen.terrain[i] = out[i] >= ELEVATION.SEA_LEVEL ? 1 : 0;
        }
    }
}

// ───────────────────────────────────────────────────────────────────
// TEMPLATES
//
// Each template is a function (b) => void that emits primitive ops.
// The order of operations matters — later ops accumulate on top of
// earlier ones via the scratch buffer.
//
// Numbers are generally normalized: heights in [0, 100], coordinates
// as map-percentages [0, 100]. Tuned by feel rather than by formula
// — adjust if a template feels off.
// ───────────────────────────────────────────────────────────────────

export const templates = {
    /**
     * Volcano: a single dominant peak in the center, with smaller
     * outliers and a depression rim.
     */
    volcano(b) {
        b.hill({ count: 1, height: [90, 100], x: [44, 56], y: [40, 60] });
        b.multiply({ factor: 0.8, range: [50, 100] });
        b.range({ count: [1, 2], height: [30, 55], x: [45, 55], y: [40, 60] });
        b.smooth({ iterations: 3 });
        b.hill({ count: [1, 2], height: [35, 45], x: [25, 30], y: [20, 75] });
        b.hill({ count: 1, height: [35, 55], x: [75, 80], y: [25, 75] });
        b.hill({ count: 1, height: [20, 25], x: [10, 15], y: [20, 25] });
        b.mask({ strength: 0.5 });
    },
    
    /**
     * High Island: a single dominant mountainous island in the middle
     * of an open sea, with a few smaller satellite islands offshore.
     */
    highIsland(b) {
        // Big mountainous core in the middle of the map.
        b.hill({ count: 1, height: [95, 100], x: [45, 55], y: [40, 60] });
        b.hill({ count: [4, 6], height: [60, 80], x: [30, 70], y: [30, 70] });
        b.hill({ count: [4, 6], height: [40, 60], x: [25, 75], y: [25, 75] });
        // Mountain spine running through the centre.
        b.range({ count: [1, 2], height: [70, 90], x: [35, 65], y: [35, 65] });
        b.smooth({ iterations: 1 });
        // Small satellite islands scattered offshore.
        b.hill({ count: [2, 4], height: [20, 35], x: [10, 30], y: [20, 80] });
        b.hill({ count: [2, 4], height: [20, 35], x: [70, 90], y: [20, 80] });
        // Bays cutting into the main island's coast.
        b.trough({ count: [3, 4], height: [40, 55], x: [25, 75], y: [25, 75] });
        // Edge mask so the open sea is visible all around.
        b.mask({ strength: 0.55 });
    },
    
    /**
     * Low Island: a large but low-lying island, mostly lowland with a
     * few modest hills. Lots of irregular coastline detail.
     */
    lowIsland(b) {
        // Broad shallow landmass — many medium hills, no dominant peak.
        b.hill({ count: [3, 5], height: [40, 55], x: [30, 70], y: [30, 70] });
        b.hill({ count: [6, 9], height: [25, 40], x: [20, 80], y: [20, 80] });
        b.hill({ count: [4, 6], height: [15, 25], x: [15, 85], y: [15, 85] });
        b.smooth({ iterations: 2 });
        // Carve plenty of irregular coastline detail.
        b.trough({ count: [4, 6], height: [25, 40], x: [15, 85], y: [10, 30] });
        b.trough({ count: [4, 6], height: [25, 40], x: [15, 85], y: [70, 90] });
        b.pit({ count: [3, 5], height: [15, 25], x: [25, 75], y: [25, 75] });
        b.mask({ strength: 0.5 });
    },
    
    /**
     * Continents: two large landmasses on the left and right, separated
     * by a sea down the middle. Each continent runs off its respective
     * edge for a "continues beyond the map" feel.
     */
    continents(b) {
        // West continent — anchored to the LEFT edge.
        b.hill({ count: 1, height: [95, 100], x: [-10, 5], y: [40, 60] });
        b.hill({ count: 1, height: [85, 95], x: [-5, 10], y: [15, 35] });
        b.hill({ count: 1, height: [85, 95], x: [-5, 10], y: [65, 85] });
        b.hill({ count: [5, 7], height: [55, 75], x: [0, 30], y: [10, 90] });
        b.hill({ count: [4, 6], height: [35, 55], x: [10, 35], y: [10, 90] });
        // East continent — anchored to the RIGHT edge.
        b.hill({ count: 1, height: [95, 100], x: [95, 110], y: [40, 60] });
        b.hill({ count: 1, height: [85, 95], x: [90, 105], y: [15, 35] });
        b.hill({ count: 1, height: [85, 95], x: [90, 105], y: [65, 85] });
        b.hill({ count: [5, 7], height: [55, 75], x: [70, 100], y: [10, 90] });
        b.hill({ count: [4, 6], height: [35, 55], x: [65, 90], y: [10, 90] });
        // Mountain ranges along the inland coasts.
        b.range({ count: [1, 2], height: [55, 75], x: [5, 20], y: [10, 90] });
        b.range({ count: [1, 2], height: [55, 75], x: [80, 95], y: [10, 90] });
        b.smooth({ iterations: 1 });
        // A scatter of small islands in the central sea.
        b.hill({ count: [2, 4], height: [15, 30], x: [40, 60], y: [25, 75] });
        // Bays cutting into the inner shores.
        b.trough({ count: [3, 4], height: [40, 55], x: [25, 45], y: [10, 90] });
        b.trough({ count: [3, 4], height: [40, 55], x: [55, 75], y: [10, 90] });
        // Pull only the central N/S strips toward ocean — leave the
        // east and west edges alone since landmasses run off them.
        b.mask({ side: 'top', strength: 0.45 });
        b.mask({ side: 'bottom', strength: 0.45 });
    },
    
    /**
     * Archipelago: many small to medium islands scattered widely. No
     * dominant landmass.
     */
    archipelago(b) {
        b.add({ amount: 11 });
        b.range({ count: [2, 3], height: [40, 60], x: [20, 80], y: [20, 80] });
        b.hill({ count: 5, height: [15, 20], x: [10, 90], y: [30, 70] });
        b.hill({ count: 2, height: [10, 15], x: [10, 30], y: [20, 80] });
        b.hill({ count: 2, height: [10, 15], x: [60, 90], y: [20, 80] });
        b.smooth({ iterations: 3 });
        b.trough({ count: 10, height: [20, 30], x: [5, 95], y: [5, 95] });
        b.strait({ width: 2, axis: 'vertical' });
        b.strait({ width: 2, axis: 'horizontal' });
    },
    
    /**
     * Mediterranean: an inland sea in the centre, bordered by solid
     * landmasses on north and south. Peninsulas reach in from east
     * and west. Think the actual Mediterranean.
     */
    mediterranean(b) {
        // North landmass — runs off the top edge.
        b.hill({ count: 1, height: [95, 100], x: [40, 60], y: [-15, 0] });
        b.hill({ count: 1, height: [85, 95], x: [10, 30], y: [-10, 5] });
        b.hill({ count: 1, height: [85, 95], x: [70, 90], y: [-10, 5] });
        b.hill({ count: [5, 7], height: [55, 75], x: [5, 95], y: [0, 25] });
        b.hill({ count: [4, 6], height: [35, 55], x: [10, 90], y: [10, 30] });
        // South landmass — runs off the bottom edge.
        b.hill({ count: 1, height: [95, 100], x: [40, 60], y: [100, 115] });
        b.hill({ count: 1, height: [85, 95], x: [10, 30], y: [95, 110] });
        b.hill({ count: 1, height: [85, 95], x: [70, 90], y: [95, 110] });
        b.hill({ count: [5, 7], height: [55, 75], x: [5, 95], y: [75, 100] });
        b.hill({ count: [4, 6], height: [35, 55], x: [10, 90], y: [70, 90] });
        // Peninsulas reaching in from east and west.
        b.hill({ count: [1, 2], height: [40, 60], x: [-5, 15], y: [40, 60] });
        b.hill({ count: [1, 2], height: [40, 60], x: [85, 105], y: [40, 60] });
        // Mountain ranges on inland coasts (the south coast of north,
        // the north coast of south).
        b.range({ count: [2, 3], height: [60, 80], x: [10, 90], y: [15, 30] });
        b.range({ count: [2, 3], height: [60, 80], x: [10, 90], y: [70, 85] });
        b.smooth({ iterations: 1 });
        // Carve the central inland sea.
        b.trough({ count: [4, 6], height: [50, 65], x: [15, 85], y: [40, 60] });
        // Mask only the left and right edges so the inland sea is bounded.
        b.mask({ side: 'left', strength: 0.35 });
        b.mask({ side: 'right', strength: 0.35 });
    },
    
    /**
     * Pangea: one giant supercontinent stretching across the map with
     * a central mountain range. Land runs off all four edges.
     */
    pangea(b) {
        // Massive central mass — anchored at the centre with high
        // amplitude so even after mask the perimeter stays land.
        b.add({ amount: 25 });   // pull the whole map up — most cells are land
        b.hill({ count: 1, height: [95, 100], x: [40, 60], y: [40, 60] });
        b.hill({ count: [4, 6], height: [70, 90], x: [25, 75], y: [25, 75] });
        b.hill({ count: [6, 8], height: [50, 70], x: [15, 85], y: [15, 85] });
        b.hill({ count: [6, 8], height: [30, 50], x: [5, 95], y: [5, 95] });
        // Big central mountain range.
        b.range({ count: [3, 4], height: [70, 90], x: [15, 85], y: [40, 60] });
        b.smooth({ iterations: 1 });
        // A few inland seas (troughs) but not big enough to break Pangea.
        b.trough({ count: [3, 4], height: [30, 45], x: [10, 90], y: [10, 25] });
        b.trough({ count: [3, 4], height: [30, 45], x: [10, 90], y: [75, 90] });
        b.pit({ count: [4, 6], height: [25, 40], x: [20, 80], y: [20, 80] });
        // Pull only the very edges down — most of the map should be land.
        b.mask({ strength: 0.35 });
    },
    
    /**
     * Isthmus: two large landmasses (one on each side of the map)
     * joined across the middle by a thick strip of land. Sea on
     * the north and south sides of the bridge. Think Panama joining
     * the Americas, or the Sinai joining Africa to Eurasia.
     *
     * Noise amplitude is lowered before finish() because a strong
     * macro fbm would fragment the connector strip. The land here
     * needs solid, predictable shape — accept slightly smoother
     * surfaces in exchange for the bridge actually existing.
     */
    isthmus(b) {
        b.setNoise({ macro: 8, micro: 4 });
        
        // Left landmass — anchored OUTSIDE the left edge so the
        // landmass runs off the map rather than tapering.
        b.hill({ count: 1, height: [95, 100], x: [-15, 5], y: [40, 60] });
        b.hill({ count: 1, height: [80, 95], x: [-10, 10], y: [10, 35] });
        b.hill({ count: 1, height: [80, 95], x: [-10, 10], y: [65, 90] });
        b.hill({ count: [4, 6], height: [55, 75], x: [0, 25], y: [15, 85] });
        // Right landmass — mirror.
        b.hill({ count: 1, height: [95, 100], x: [95, 115], y: [40, 60] });
        b.hill({ count: 1, height: [80, 95], x: [90, 110], y: [10, 35] });
        b.hill({ count: 1, height: [80, 95], x: [90, 110], y: [65, 90] });
        b.hill({ count: [4, 6], height: [55, 75], x: [75, 100], y: [15, 85] });
        // THE BRIDGE — multiple overlapping high hills covering the
        // full middle band. Heights stay strongly above sea level
        // (peaks of 70-90, valley overlap regions still ~40-50)
        // even after the now-weakened auto-noise. The bridge is wider
        // than usual (y 38-62) so erosion of the edges still leaves
        // a continuous strip.
        b.hill({ count: 1, height: [80, 90], x: [25, 35], y: [45, 55] });
        b.hill({ count: 1, height: [80, 90], x: [40, 50], y: [45, 55] });
        b.hill({ count: 1, height: [80, 90], x: [55, 65], y: [45, 55] });
        b.hill({ count: 1, height: [80, 90], x: [65, 75], y: [45, 55] });
        // Plus filler hills to widen the bridge so it doesn't pinch
        // off where the main hills don't quite touch.
        b.hill({ count: [4, 6], height: [50, 70], x: [25, 75], y: [40, 60] });
        b.smooth({ iterations: 1 });
        // Carve open sea on the north and south sides. Troughs stop
        // well clear of the bridge band so they can't eat it.
        b.trough({ count: [3, 4], height: [40, 55], x: [25, 75], y: [0, 25] });
        b.trough({ count: [3, 4], height: [40, 55], x: [25, 75], y: [75, 100] });
        // Mask only the top and bottom edges so open sea reads as
        // open sea. Left and right edges stay alone because
        // landmasses run off them.
        b.mask({ side: 'top', strength: 0.6 });
        b.mask({ side: 'bottom', strength: 0.6 });
    },
    
    /**
     * Shattered: many small landmasses with chaotic boundaries. No
     * coherent continent — adventure-map territory.
     */
    shattered(b) {
        b.hill({ count: 8, height: [35, 40], x: [15, 85], y: [30, 70] });
        b.trough({ count: [10, 20], height: [40, 50], x: [5, 95], y: [5, 95] });
        b.range({ count: [5, 7], height: [30, 40], x: [10, 90], y: [20, 80] });
        b.pit({ count: [12, 20], height: [30, 40], x: [15, 85], y: [20, 80] });
    },
    
    /**
     * Atoll: a thin ring of land surrounding a central lagoon. Tropical
     * pacific feel.
     */
    atoll(b) {
        b.hill({ count: 1, height: [75, 80], x: [50, 60], y: [45, 55] });
        b.hill({ count: [1, 2], height: [30, 50], x: [25, 75], y: [30, 70] });
        b.hill({ count: 1, height: [30, 50], x: [25, 35], y: [30, 70] });
        b.smooth({ iterations: 1 });
        b.multiply({ factor: 0.2, range: [25, 100] });
        b.hill({ count: 1, height: [10, 20], x: [50, 55], y: [48, 52] });
    },
    
    /**
     * Coastal: one large landmass running off the LEFT edge of the
     * map (no coastline on the west), with open sea to the EAST.
     * The "coast" is the eastern shore of this landmass — kingdoms
     * sit on the mainland and look out over open ocean. No clean
     * borders on the north or south either; the land wraps off
     * those edges too.
     */
    coastal(b) {
        // Strong land bias all the way down the left half. We use
        // multiple overlapping hills anchored OUTSIDE the map edge
        // (negative x percentages) so the inland portion of the
        // landmass has no falloff visible — it just runs off the
        // edge as if there's more continent beyond.
        b.add({ amount: 10 });   // raise the whole map a bit so margins lean toward land
        // Big core hills along the western edge — three overlapping
        // discs covering the left side from top to bottom.
        b.hill({ count: 1, height: [95, 100], x: [-15, 0], y: [40, 60] });
        b.hill({ count: 1, height: [95, 100], x: [-15, 0], y: [15, 35] });
        b.hill({ count: 1, height: [95, 100], x: [-15, 0], y: [65, 85] });
        // Inland fillers — multiple overlapping hills across the
        // left third so the landmass is solid rather than blobby.
        b.hill({ count: [6, 8], height: [60, 80], x: [0, 30], y: [10, 90] });
        b.hill({ count: [5, 7], height: [40, 60], x: [10, 40], y: [10, 90] });
        b.hill({ count: [4, 6], height: [25, 40], x: [25, 50], y: [10, 90] });
        // Coastal mountain spine running N-S along the inland coast.
        b.range({ count: [2, 3], height: [60, 80], x: [10, 25], y: [10, 90] });
        b.smooth({ iterations: 1 });
        // Scattered small offshore islands in the open sea.
        b.hill({ count: [3, 5], height: [15, 30], x: [50, 70], y: [15, 85] });
        // Bays carved into the eastern coast.
        b.trough({ count: [4, 6], height: [35, 50], x: [35, 55], y: [10, 90] });
        // Pull the EAST side down to open ocean.
        b.mask({ side: 'right', strength: 0.75 });
    }
};

/**
 * Run a named template against the supplied generator. Convenience
 * wrapper around TemplateBuilder.
 *
 * @param {VoronoiGenerator} gen
 * @param {string} name  Key of an entry in `templates`.
 * @returns {boolean} true if applied; false if the name is unknown.
 */
export function applyTemplate(gen, name) {
    const fn = templates[name];
    if (!fn) return false;
    const builder = new TemplateBuilder(gen);
    fn(builder);
    builder.finish();
    return true;
}
