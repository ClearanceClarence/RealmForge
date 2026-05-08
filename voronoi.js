/**
 * Voronoi diagram on top of mapbox/delaunator.
 *
 * This is a port of Azgaar's Voronoi construction (from the Fantasy
 * Map Generator project) into vanilla ES module JS. Mapbox's delaunator
 * gives us only the raw Delaunay triangulation — flat arrays of
 * triangle indices and half-edges. This class walks that structure
 * once at construction time and pre-computes:
 *
 *   - For each input point (cell): which triangle vertices form its
 *     Voronoi polygon (cells.v[i]), which other cells border it
 *     (cells.c[i]), and whether it's a border cell (cells.b[i]).
 *   - For each triangle (vertex of the Voronoi diagram): its
 *     circumcenter coordinates (vertices.p[t]), its three adjacent
 *     triangles (vertices.v[t]), and the three cells it borders
 *     (vertices.c[t]).
 *
 * Everything else — neighbour lookup, polygon extraction, etc. —
 * becomes O(1) array access against these tables.
 *
 * COMPATIBILITY SHIM
 * Methods named `neighbors(i)`, `cellPolygon(i)`, `find(x, y)`, and
 * `render(ctx)` are provided so downstream code that was written
 * against d3-delaunay can keep working without changes.
 *
 * BOUNDARY POINTS
 * The convex-hull cells of a Voronoi diagram are infinite. To keep
 * every "real" cell bounded, the caller is expected to insert a
 * ring of pseudo-points just outside the map rect — see the helper
 * `addBoundaryPoints(points, width, height, spacing)` below. The
 * Voronoi class doesn't insert them automatically; it simply trusts
 * the caller's `pointsN` parameter (number of "real" points) and
 * ignores the boundary pseudo-cells when building neighbour lists.
 */

/**
 * Generate a ring of boundary points spaced around the rectangle
 * [0, 0] .. [width, height], extending `pad` units outside the rect.
 * Adding these to the points array before triangulation guarantees
 * every real point's Voronoi cell is closed (no infinite hull cells).
 *
 * @param {number} width Map width.
 * @param {number} height Map height.
 * @param {number} spacing Approximate distance between boundary points.
 * @returns {number[]} Flat [x0, y0, x1, y1, ...] array of boundary points.
 */
export function makeBoundaryPoints(width, height, spacing = 50) {
    const out = [];
    const pad = spacing;
    
    // Top + bottom edges
    const nX = Math.ceil((width + 2 * pad) / spacing);
    const stepX = (width + 2 * pad) / nX;
    for (let i = 0; i <= nX; i++) {
        const x = -pad + i * stepX;
        out.push(x, -pad);
        out.push(x, height + pad);
    }
    
    // Left + right edges (skip corners; they're already in the top/bottom rows)
    const nY = Math.ceil((height + 2 * pad) / spacing);
    const stepY = (height + 2 * pad) / nY;
    for (let i = 1; i < nY; i++) {
        const y = -pad + i * stepY;
        out.push(-pad, y);
        out.push(width + pad, y);
    }
    
    return out;
}

/**
 * Voronoi diagram derived from a Delaunator triangulation.
 *
 * @param {Delaunator} delaunay      A mapbox/delaunator instance.
 * @param {Float64Array|number[]} points  Flat [x0,y0,x1,y1,...] array,
 *                                        same one passed to Delaunator.
 * @param {number} pointsN           Number of REAL points (excluding
 *                                   any boundary points appended at the
 *                                   end of `points`). Cells with index
 *                                   >= pointsN are considered phantom
 *                                   and excluded from neighbour lists.
 */
export class Voronoi {
    constructor(delaunay, points, pointsN) {
        this.delaunay = delaunay;
        this.points = points;
        this.pointsN = pointsN;
        
        // cells.v[i] : array of triangle indices forming cell i's polygon (in order)
        // cells.c[i] : array of neighbouring cell indices (real cells only)
        // cells.b[i] : 1 if i is a border cell (touches a phantom), 0 otherwise
        this.cells = { v: new Array(pointsN), c: new Array(pointsN), b: new Uint8Array(pointsN) };
        
        // vertices.p[t] : [x, y] of circumcenter of triangle t
        // vertices.v[t] : array of 3 adjacent-triangle indices
        // vertices.c[t] : array of 3 cell indices that triangle t borders
        const triCount = delaunay.triangles.length / 3;
        this.vertices = {
            p: new Array(triCount),
            v: new Array(triCount),
            c: new Array(triCount)
        };
        
        // Half-edge walk. delaunay.triangles[e] = source point of half-edge e.
        // delaunay.halfedges[e] = twin half-edge in adjacent triangle, or -1.
        const tris = delaunay.triangles;
        const halfedges = delaunay.halfedges;
        const cellsV = this.cells.v;
        const cellsC = this.cells.c;
        const cellsB = this.cells.b;
        const verticesP = this.vertices.p;
        const verticesV = this.vertices.v;
        const verticesC = this.vertices.c;
        
        for (let e = 0; e < tris.length; e++) {
            // Cell-side: each half-edge points TO some vertex; nextHalfedge(e)
            // gives the half-edge starting at that vertex.
            const p = tris[this._next(e)];
            if (p < pointsN && !cellsC[p]) {
                const edges = this._edgesAroundPoint(e);
                cellsV[p] = edges.map(ee => this._tri(ee));
                
                // Adjacent cells filtered to real cells only.
                const adjAll = edges.map(ee => tris[ee]);
                const adjReal = adjAll.filter(c => c < pointsN);
                cellsC[p] = adjReal;
                cellsB[p] = adjAll.length > adjReal.length ? 1 : 0;
            }
            
            // Vertex-side: each triangle is a Voronoi vertex.
            const t = this._tri(e);
            if (!verticesP[t]) {
                verticesP[t] = this._triangleCenter(t);
                verticesV[t] = this._trianglesAdjacent(t);
                verticesC[t] = this._pointsOfTriangle(t);
            }
        }
    }
    
    // ─── Half-edge helpers (Delaunator data structure conventions) ──
    
    /** Next half-edge in same triangle (e: 0,1,2 → 1,2,0 within each tri). */
    _next(e) { return (e % 3 === 2) ? e - 2 : e + 1; }
    
    /** Triangle index containing half-edge e. */
    _tri(e) { return Math.floor(e / 3); }
    
    /** All three half-edge indices of triangle t. */
    _edgesOfTriangle(t) { return [3 * t, 3 * t + 1, 3 * t + 2]; }
    
    /** Three point indices of triangle t. */
    _pointsOfTriangle(t) {
        const tris = this.delaunay.triangles;
        return [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]];
    }
    
    /** Three adjacent triangle indices of triangle t (-1 sentinel for hull edges). */
    _trianglesAdjacent(t) {
        const halfedges = this.delaunay.halfedges;
        const result = [];
        for (const e of this._edgesOfTriangle(t)) {
            const opp = halfedges[e];
            result.push(opp === -1 ? -1 : this._tri(opp));
        }
        return result;
    }
    
    /**
     * All half-edges incident to the point that's the START of half-edge `start`.
     * Walks the fan around the point; returns up to 20 edges (loop guard).
     */
    _edgesAroundPoint(start) {
        const halfedges = this.delaunay.halfedges;
        const result = [];
        let incoming = start;
        do {
            result.push(incoming);
            const outgoing = this._next(incoming);
            incoming = halfedges[outgoing];
        } while (incoming !== -1 && incoming !== start && result.length < 20);
        return result;
    }
    
    /**
     * Circumcenter of triangle t. The Voronoi vertex coordinates are
     * the circumcenters of the Delaunay triangles.
     */
    _triangleCenter(t) {
        const pts = this._pointsOfTriangle(t);
        const ax = this.points[pts[0] * 2], ay = this.points[pts[0] * 2 + 1];
        const bx = this.points[pts[1] * 2], by = this.points[pts[1] * 2 + 1];
        const cx = this.points[pts[2] * 2], cy = this.points[pts[2] * 2 + 1];
        const ad = ax * ax + ay * ay;
        const bd = bx * bx + by * by;
        const cd = cx * cx + cy * cy;
        const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (D === 0) {
            // Degenerate triangle (collinear). Return centroid as a fallback;
            // shouldn't happen with our boundary-point setup but guards against
            // numerical edge cases.
            return [(ax + bx + cx) / 3, (ay + by + cy) / 3];
        }
        return [
            (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)) / D,
            (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax)) / D
        ];
    }
    
    // ─── Compatibility shim: d3-delaunay-style methods ──────────────
    
    /**
     * Return neighbouring cell indices for cell `i`. Compatible with
     * d3-delaunay's `voronoi.neighbors(i)` — except this returns an
     * array directly (not a generator), so callers using `for..of`
     * still work and iteration is faster.
     */
    neighbors(i) {
        return this.cells.c[i] || [];
    }
    
    /**
     * Return cell `i`'s polygon as an array of [x, y] vertices, closed
     * (last point equals first). Compatible with d3-delaunay's
     * `voronoi.cellPolygon(i)`.
     *
     * Returns null for non-existent cells; cells without exactly one
     * complete polygon (degenerate or hull cells when no boundary
     * points were used) get whatever vertices exist.
     */
    cellPolygon(i) {
        const tIndices = this.cells.v[i];
        if (!tIndices || tIndices.length < 3) return null;
        const verts = this.vertices.p;
        const out = new Array(tIndices.length + 1);
        for (let k = 0; k < tIndices.length; k++) {
            out[k] = verts[tIndices[k]];
        }
        out[tIndices.length] = out[0];   // close ring (d3-delaunay convention)
        return out;
    }
    
    /**
     * Find the index of the cell whose seed point is nearest to (x, y).
     * Compatible with d3-delaunay's `delaunay.find(x, y)` — but only
     * returns real cells (index < pointsN), never phantoms.
     *
     * Implementation: graph walk. Starts at a known cell, walks toward
     * the target by moving to whichever neighbour is closer, until no
     * neighbour is closer than the current cell. O(sqrt(N)) on average
     * for uniformly distributed points; degenerates to O(N) worst case.
     */
    find(x, y, hint = 0) {
        let i = (hint >= 0 && hint < this.pointsN) ? hint : 0;
        let bestD = this._dist2ToCell(i, x, y);
        // Walk: replace i with the neighbour closest to (x,y) until no
        // neighbour beats the current.
        let moved = true;
        let safety = 0;
        while (moved && safety++ < this.pointsN) {
            moved = false;
            const neighbours = this.cells.c[i];
            for (const n of neighbours) {
                const d = this._dist2ToCell(n, x, y);
                if (d < bestD) {
                    bestD = d;
                    i = n;
                    moved = true;
                }
            }
        }
        return i;
    }
    
    _dist2ToCell(i, x, y) {
        const dx = this.points[i * 2] - x;
        const dy = this.points[i * 2 + 1] - y;
        return dx * dx + dy * dy;
    }
    
    /**
     * Stroke every cell polygon onto a 2D canvas context. Compatible
     * with d3-delaunay's `voronoi.render(ctx)`. The caller is
     * responsible for ctx.beginPath() / ctx.stroke() bookkeeping; this
     * method only emits moveTo/lineTo for the cell edges.
     *
     * Renders only real cells (index < pointsN); phantom border cells
     * are skipped.
     */
    render(ctx) {
        for (let i = 0; i < this.pointsN; i++) {
            const tIndices = this.cells.v[i];
            if (!tIndices || tIndices.length < 3) continue;
            const verts = this.vertices.p;
            const first = verts[tIndices[0]];
            ctx.moveTo(first[0], first[1]);
            for (let k = 1; k < tIndices.length; k++) {
                const v = verts[tIndices[k]];
                ctx.lineTo(v[0], v[1]);
            }
            ctx.closePath();
        }
    }
}
