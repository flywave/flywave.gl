import { PolygonLocation } from "../geometry";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { Ray3d } from "./ray3d";
import { type Transform } from "./transform";
/**
 * Carries data about a location in the plane of a triangle.
 * * Each instance carries both world and barycentric coordinates for the point, and provides query
 * services on the latter.
 * * No tolerance is used when querying barycentric coordinates (e.g., `isInsideOrOn`, `classify`). Use
 * [[BarycentricTriangle.snapLocationToEdge]] to adjust the barycentric coordinates to a triangle edge
 * if they lie within a distance or parametric tolerance.
 *
 * Properties of the barycentric coordinates `(b0, b1, b2)` of a point `p` in the plane of a triangle
 * `T` with vertices `v0, v1, v2`:
 * * `1 = b0 + b1 + b2`
 * * `p = b0 * v0 + b1 * v1 + b2 * v2`
 * * If T is spanned by the vectors `U = v1 - v0` and `V = v2 - v0`, then the vector `P = p - v0` can
 * be written `P = b1 * U + b2 * V`.
 * * The coordinates are all nonnegative if and only if `p` is inside or on `T`.
 * * Exactly one coordinate is zero if and only if `p` lies on an (infinitely extended) edge of `T`.
 * * Exactly two coordinates are zero if and only if `p` coincides with a vertex of `T`.
 * * Note that if `p` can be written as a linear combination of the vertices of `T` using scales that do
 * NOT sum to 1, then `p` is not coplanar with `T`
 * @public
 */
export declare class TriangleLocationDetail {
    /** The Cartesian coordinates of the point p. */
    world: Point3d;
    /** The barycentric coordinates of p with respect to the triangle. Assumed to sum to one. */
    local: Point3d;
    /** Application-specific number */
    a: number;
    /** Index of the triangle vertex at the start of the closest edge to p. */
    closestEdgeIndex: number;
    /**
     * The parameter f along the closest edge to p of its projection q.
     * * We have q = v_i + f * (v_j - v_i) where i = closestEdgeIndex and j = (i + 1) % 3 are the indices
     * of the start vertex v_i and end vertex v_j of the closest edge to p.
     * * Note that 0 <= f <= 1.
     */
    closestEdgeParam: number;
    private constructor();
    /** Invalidate this detail (set all attributes to zero) . */
    invalidate(): void;
    /**
     * Create an invalid detail.
     * @param result optional pre-allocated object to fill and return
     */
    static create(result?: TriangleLocationDetail): TriangleLocationDetail;
    /**
     * Set the instance contents from the `other` detail.
     * @param other detail to clone
     */
    copyContentsFrom(other: TriangleLocationDetail): void;
    /** Whether this detail is invalid. */
    get isValid(): boolean;
    /**
     * Queries the barycentric coordinates to determine whether this instance specifies a location inside or
     * on the triangle.
     * @see classify
     */
    get isInsideOrOn(): boolean;
    /**
     * Queries this detail to classify the location of this instance with respect to the triangle.
     * @returns location code
     * @see isInsideOrOn
     */
    get classify(): PolygonLocation;
}
/**
 * 3 points defining a triangle to be evaluated with barycentric coordinates.
 * @public
 */
export declare class BarycentricTriangle {
    /** Array of 3 point coordinates for the triangle. */
    points: Point3d[];
    /** Edge length squared cache, indexed by opposite vertex index */
    protected edgeLength2: number[];
    private static _workPoint?;
    private static _workVector0?;
    private static _workVector1?;
    private static _workRay?;
    private static _workMatrix?;
    /**
     * Constructor.
     * * Point references are CAPTURED
     */
    protected constructor(point0: Point3d, point1: Point3d, point2: Point3d);
    /**
     * Copy contents of (not pointers to) the given points. A vertex is zeroed if its corresponding input point
     * is undefined.
     */
    set(point0: Point3d | undefined, point1: Point3d | undefined, point2: Point3d | undefined): void;
    /** Copy all values from `other` */
    setFrom(other: BarycentricTriangle): void;
    /**
     * Create a `BarycentricTriangle` with coordinates given by enumerated x,y,z of the 3 points.
     * @param result optional pre-allocated triangle.
     */
    static createXYZXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, result?: BarycentricTriangle): BarycentricTriangle;
    /** Create a triangle with coordinates cloned from given points. */
    static create(point0: Point3d, point1: Point3d, point2: Point3d, result?: BarycentricTriangle): BarycentricTriangle;
    /** Return a new `BarycentricTriangle` with the same coordinates. */
    clone(result?: BarycentricTriangle): BarycentricTriangle;
    /** Return a clone of the transformed instance */
    cloneTransformed(transform: Transform, result?: BarycentricTriangle): BarycentricTriangle;
    /** Return the area of the triangle. */
    get area(): number;
    /**
     * Compute squared length of the triangle edge opposite the vertex with the given index.
     * @see [[edgeStartVertexIndexToOppositeVertexIndex]]
     */
    edgeLengthSquared(oppositeVertexIndex: number): number;
    /**
     * Compute length of the triangle edge opposite the vertex with the given index.
     * @see [[edgeStartVertexIndexToOppositeVertexIndex]]
     */
    edgeLength(oppositeVertexIndex: number): number;
    /** Return area divided by sum of squared lengths. */
    get aspectRatio(): number;
    /** Return the perimeter of the triangle. */
    get perimeter(): number;
    /**
     * Return the unit normal of the triangle.
     * @param result optional pre-allocated vector to fill and return.
     * @returns unit normal, or undefined if cross product length is too small.
     */
    normal(result?: Vector3d): Vector3d | undefined;
    /**
     * Sum the triangle points with given scales.
     * * If the scales sum to 1, they are barycentric coordinates, and hence the result point is in the plane of
     * the triangle. If all coordinates are non-negative then the result point is inside the triangle.
     * * If the scales do not sum to 1, the point is inside the triangle scaled (by the scale sum) from the origin.
     * @param b0 scale to apply to vertex 0
     * @param b1 scale to apply to vertex 1
     * @param b2 scale to apply to vertex 2
     * @param result optional pre-allocated point to fill and return
     * @return linear combination of the vertices of this triangle
     * @see [[pointToFraction]]
     */
    fractionToPoint(b0: number, b1: number, b2: number, result?: Point3d): Point3d;
    /**
     * Compute the projection of the given `point` onto the plane of this triangle.
     * @param point point p to project
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the projection point `P = d.world`:
     * * `d.isValid` returns true if and only if `this.normal()` is defined.
     * * `d.classify` can be used to determine where P lies with respect to the triangle.
     * * `d.a` is the signed projection distance: `P = p + a * this.normal()`.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/BarycentricTriangle
     * @see [[fractionToPoint]]
     */
    pointToFraction(point: Point3d, result?: TriangleLocationDetail): TriangleLocationDetail;
    /** Convert from opposite-vertex to start-vertex edge indexing. */
    static edgeOppositeVertexIndexToStartVertexIndex(edgeIndex: number): number;
    /** Convert from start-vertex to opposite-vertex edge indexing. */
    static edgeStartVertexIndexToOppositeVertexIndex(startVertexIndex: number): number;
    /**
     * Examine a point's barycentric coordinates to determine if it lies inside the triangle but not on an edge/vertex.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns whether the point with barycentric coordinates is strictly inside the triangle.
     */
    static isInsideTriangle(b0: number, b1: number, b2: number): boolean;
    /**
     * Examine a point's barycentric coordinates to determine if it lies inside the triangle or on an edge/vertex.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns whether the point with barycentric coordinates is inside or on the triangle.
     */
    static isInsideOrOnTriangle(b0: number, b1: number, b2: number): boolean;
    /**
     * Examine a point's barycentric coordinates to determine if it lies outside an edge of the triangle.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns edge index i (opposite vertex i) for which b_i < 0 and b_j >= 0, and b_k >= 0. Otherwise, returns -1.
     */
    private static isInRegionBeyondEdge;
    /**
     * Examine a point's barycentric coordinates to determine if it lies outside a vertex of the triangle.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns index of vertex i for which b_j < 0 and b_k < 0. Otherwise, returns -1.
     */
    private static isInRegionBeyondVertex;
    /**
     * Examine a point's barycentric coordinates to determine if it lies on a vertex of the triangle.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns index of vertex i for which b_i = 1 and b_j = b_k = 0. Otherwise, returns -1.
     */
    private static isOnVertex;
    /**
     * Examine a point's barycentric coordinates to determine if it lies on a bounded edge of the triangle.
     * * No parametric tolerance is used.
     * * It is assumed b0 + b1 + b2 = 1.
     * @returns edge index i (opposite vertex i) for which b_i = 0, b_j > 0, and b_k > 0. Otherwise, returns -1.
     */
    private static isOnBoundedEdge;
    /** @returns edge/vertex index (0,1,2) for which the function has a minimum value */
    private static indexOfMinimum;
    /**
     * Compute the squared distance between two points given by their barycentric coordinates.
     * * It is assumed that a0 + a1 + a2 = b0 + b1 + b2 = 1.
     */
    distanceSquared(a0: number, a1: number, a2: number, b0: number, b1: number, b2: number): number;
    /** Return the index of the closest triangle vertex to the point given by its barycentric coordinates. */
    closestVertexIndex(b0: number, b1: number, b2: number): number;
    /** Compute dot product of the edge vectors based at the vertex with the given index. */
    dotProductOfEdgeVectorsAtVertex(baseVertexIndex: number): number;
    /**
     * Compute the projection of barycentric point p onto the (unbounded) edge e_k(v_i,v_j) of the triangle T(v_i,v_j,v_k).
     * @param k vertex v_k is opposite the edge e_k
     * @param b barycentric coordinates of point to project
     * @returns parameter f along e_k, such that:
     * * the projection point is q = v_i + f * (v_j - v_i)
     * * the barycentric coords of the projection are q_ijk = (1 - f, f, 0)
     */
    private computeProjectionToEdge;
    /**
     * Compute the projection of a barycentric point p to the triangle T(v_0,v_1,v_2).
     * @param b0 barycentric coordinate of p corresponding to v_0
     * @param b1 barycentric coordinate of p corresponding to v_1
     * @param b2 barycentric coordinate of p corresponding to v_2
     * @returns closest edge start vertex index i and projection parameter f such that the projection
     * q = v_i + f * (v_j - v_i).
     */
    closestPoint(b0: number, b1: number, b2: number): {
        closestEdgeIndex: number;
        closestEdgeParam: number;
    };
    /**
     * Compute the intersection of a line (parameterized as a ray) with the plane of this triangle.
     * * This method is slower than `Ray3d.intersectionWithTriangle`.
     * @param ray infinite line to intersect, as a ray
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the line-plane intersection point `d.world`:
     * * `d.a` is the intersection parameter along the ray.
     * * The line intersects the plane of the triangle if and only if `d.isValid` returns true.
     * * The ray intersects the plane of the triangle if and only if `d.isValid` returns true and `d.a` >= 0.
     * * The ray intersects the triangle if and only if `d.isValid` returns true, `d.a` >= 0, and `d.isInsideOrOn`
     * returns true.
     * * `d.classify` can be used to determine where the intersection lies with respect to the triangle.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/RayTriangleIntersection
     * @see [[pointToFraction]]
     */
    intersectRay3d(ray: Ray3d, result?: TriangleLocationDetail): TriangleLocationDetail;
    /**
     * Compute the intersection of a line (parameterized as a line segment) with the plane of this triangle.
     * @param point0 start point of segment on line to intersect
     * @param point1 end point of segment on line to intersect
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the line-plane intersection point `d.world`:
     * * `d.isValid` returns true if and only if the line intersects the plane.
     * * `d.classify` can be used to determine where the intersection lies with respect to the triangle.
     * * `d.a` is the intersection parameter. If `d.a` is in [0,1], the segment intersects the plane of the triangle.
     * @see [[intersectRay3d]]
     */
    intersectSegment(point0: Point3d, point1: Point3d, result?: TriangleLocationDetail): TriangleLocationDetail;
    /**
     * Adjust the location to the closest edge of the triangle if within either given tolerance.
     * @param location details of a point in the plane of the triangle (note that `location.local` and
     * `location.world` possibly updated to lie on the triangle closest edge)
     * @param distanceTolerance absolute distance tolerance (or zero to ignore)
     * @param parameterTolerance barycentric coordinate fractional tolerance (or zero to ignore)
     * @return whether the location was adjusted
     */
    snapLocationToEdge(location: TriangleLocationDetail, distanceTolerance?: number, parameterTolerance?: number): boolean;
    /**
     * Return the dot product of the scaled normals of the two triangles.
     * * The sign of the return value is useful for determining the triangles' relative orientation:
     * positive (negative) means the normals point into the same (opposite) half-space determined by
     * one of the triangles' planes; zero means the triangles are perpendicular.
     */
    dotProductOfCrossProductsFromOrigin(other: BarycentricTriangle): number;
    /** Return the centroid of the 3 points. */
    centroid(result?: Point3d): Point3d;
    /** Return the incenter of the triangle. */
    incenter(result?: Point3d): Point3d;
    /** Return the circumcenter of the triangle. */
    circumcenter(result?: Point3d): Point3d;
    /** Test for point-by-point `isAlmostEqual` relationship. */
    isAlmostEqual(other: BarycentricTriangle, tol?: number): boolean;
}
