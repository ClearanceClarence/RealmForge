/**
 * WORKER BRIDGE - Manages communication with generation worker
 * 
 * Provides async/await interface for worker operations.
 * Handles transferable arrays for zero-copy data transfer.
 * 
 * Usage:
 *   import { WorkerBridge } from './worker-bridge.js';
 *   
 *   const bridge = new WorkerBridge();
 *   bridge.onProgress = (data) => updateLoadingStatus(data.message);
 *   
 *   const result = await bridge.generateFull({ cellCount, seed, ... });
 *   // Apply result.points, result.heights, etc. to generator
 */

export class WorkerBridge {
    constructor(workerPath = './generation.worker.js') {
        this.worker = null;
        this.workerPath = workerPath;
        this.pendingCallbacks = new Map();
        this.callbackId = 0;
        
        // Progress callback
        this.onProgress = null;
        
        // Error callback
        this.onError = null;
        
        // Track if worker is initialized
        this.isInitialized = false;
    }
    
    /**
     * Initialize the worker (lazy initialization)
     */
    init() {
        if (this.worker) return;
        
        this.worker = new Worker(this.workerPath);
        
        this.worker.onmessage = (e) => {
            this.handleMessage(e.data);
        };
        
        this.worker.onerror = (e) => {
            console.error('Worker error:', e);
            this.onError?.(e);
        };
        
        this.isInitialized = true;
    }
    
    /**
     * Handle messages from worker
     */
    handleMessage(msg) {
        const { type, callbackId, data, error } = msg;
        
        // Progress updates don't have callbacks
        if (type === 'progress') {
            this.onProgress?.(data);
            return;
        }
        
        // Error handling
        if (type === 'error') {
            const callback = this.pendingCallbacks.get(callbackId);
            if (callback) {
                this.pendingCallbacks.delete(callbackId);
                callback.reject(new Error(error));
            }
            return;
        }
        
        // Resolve pending callback
        const callback = this.pendingCallbacks.get(callbackId);
        if (callback) {
            this.pendingCallbacks.delete(callbackId);
            callback.resolve(data);
        }
    }
    
    /**
     * Send message to worker and wait for response
     */
    _sendMessage(type, data, transferables = []) {
        this.init();
        
        return new Promise((resolve, reject) => {
            const id = ++this.callbackId;
            this.pendingCallbacks.set(id, { resolve, reject });
            
            this.worker.postMessage({
                type,
                callbackId: id,
                data
            }, transferables);
        });
    }
    
    /**
     * Generate points only (fastest, use when you want to control heightmap separately)
     */
    async generatePoints(options) {
        const {
            cellCount,
            width,
            height,
            seed,
            distribution = 'jittered',
            relaxIterations = 0
        } = options;
        
        return this._sendMessage('generate', {
            cellCount,
            width,
            height,
            seed,
            distribution,
            relaxIterations
        });
    }
    
    /**
     * Generate heightmap for existing points
     * Note: Points array will be transferred (become unusable in main thread)
     */
    async generateHeightmap(options) {
        const {
            points,
            cellCount,
            width,
            height,
            seed,
            algorithm = 'fbm',
            frequency = 3,
            octaves = 6,
            seaLevel = 0.4,
            falloff = 'radial',
            falloffStrength = 0.7
        } = options;
        
        // Copy points since they'll be transferred
        const pointsCopy = new Float64Array(points);
        
        return this._sendMessage('generateHeightmap', {
            points: pointsCopy,
            cellCount,
            width,
            height,
            seed,
            options: { algorithm, frequency, octaves, seaLevel, falloff, falloffStrength }
        }, [pointsCopy.buffer]);
    }
    
    /**
     * Full generation pipeline (points + heightmap in one call)
     * This is the most efficient option for initial generation.
     */
    async generateFull(options) {
        const {
            cellCount,
            width,
            height,
            seed,
            distribution = 'jittered',
            relaxIterations = 2,
            heightmapOptions = {}
        } = options;
        
        return this._sendMessage('generateFull', {
            cellCount,
            width,
            height,
            seed,
            distribution,
            relaxIterations,
            heightmapOptions: {
                algorithm: heightmapOptions.algorithm || 'fbm',
                frequency: heightmapOptions.frequency || 3,
                octaves: heightmapOptions.octaves || 6,
                seaLevel: heightmapOptions.seaLevel || 0.4,
                falloff: heightmapOptions.falloff || 'radial',
                falloffStrength: heightmapOptions.falloffStrength || 0.7
            }
        });
    }
    
    /**
     * Apply results from worker to generator instance
     */
    applyResults(generator, result) {
        // Apply points
        if (result.points) {
            generator.points = result.points;
            generator.cellCount = result.cellCount;
            
            // Rebuild local Voronoi (needed for interaction and kingdom generation)
            generator.updateDiagram();
        }
        
        // Apply heightmap
        if (result.heights) {
            generator.heights = result.heights;
            generator.elevations = result.heights;
            generator.terrain = result.terrain;
        }
        
        // Clear all caches
        generator.clearContourCache?.();
        generator._coastlineCache = null;
        generator._borderEdgesCache = null;
        generator._borderPathsCache = null;
        generator._kingdomBoundaryCache = null;
        
        // Invalidate tile cache
        if (generator.tileCache) {
            generator.tileCache.invalidate();
        }
    }
    
    /**
     * Terminate the worker (cleanup)
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
        }
        this.pendingCallbacks.clear();
    }
}

/**
 * Singleton instance for convenience
 */
let defaultBridge = null;

export function getWorkerBridge() {
    if (!defaultBridge) {
        defaultBridge = new WorkerBridge();
    }
    return defaultBridge;
}

export function terminateWorkerBridge() {
    if (defaultBridge) {
        defaultBridge.terminate();
        defaultBridge = null;
    }
}
