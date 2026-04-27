import { type PlaneAltitudeEvaluator, PolygonLocation } from "../geometry";
import { Matrix4d } from "../geometry4d/matrix4d";
import { GrowableXYZArray } from "./growable-xyz-array";
import { type IndexedReadWriteXYZCollection, IndexedXYZCollection } from "./indexed-xyz-collection";
import { Point2d } from "./point2d-vector2d";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { type Range1d, type Range3d } from "./range";
import { Ray3d } from "./ray3d";
import { type XAndY } from "./xyz-props";
/**
 * Carries data about a point in the plane of a polygon.
 * @public
 */
export declare class PolygonLocationDetail {
    /** The coordinates of the point p. */
    point: Point3d;
    /** Application-specific number */
    a: number;
    /** Application-specific vector */
    v: Vector3d;
    /** A number that classifies the point's location with respect to the polygon. */
    code: PolygonLocation;
    /** Index of the polygon vertex at the base of the edge closest to p. */
    closestEdgeIndex: number;
    /** The parameter along the closest edge of the projection of p. */
    closestEdgeParam: number;
    private constructor();
    /** Invalidate this detail. */
    invalidate(): void;
    /** Create an invalid detail.
     * @param result optional pre-allocated object to fill and return
     */
    static create(result?: PolygonLocationDetail): PolygonLocationDetail;
    /** Set the instance contents from the other detail.
     * @param other detail to clone
     */
    copyContentsFrom(other: PolygonLocationDetail): void;
    /** Whether this detail is valid. */
    get isValid(): boolean;
    /** Whether this instance specifies a location inside or on the polygon. */
    get isInsideOrOn(): boolean;
}
/**
 * Carrier for a loop extracted from clip operation, annotated for sorting
 * @internal
 */
export declare class CutLoop {
    xyz: GrowableXYZArray;
    edge?: Ray3d;
    sortCoordinate0: number;
    sortCoordinate1: number;
    sortDelta: number;
    isNotch: boolean;
    constructor(xyz: GrowableXYZArray);
    /**
     * Create a `CutLoop` structure annotated with the vector from last point to first.
     * @param xyz coordinates to capture
     */
    static createCaptureWithReturnEdge(xyz: GrowableXYZArray): CutLoop;
    /**
     * Set up coordinates for sort steps:
     * * Make `sortCoordinate0` and `sortCoordinate` the (algebraically sorted) start and end fractions along the ray
     * * Make `sortDelta` the oriented difference of those two
     * * Hence sorting on the coordinates puts loops in left-to-right order by the their edge vector leftmost point.
     */
    setSortCoordinates(ray: Ray3d): void;
    /** Return
     * * 0 if other sort limits are not strictly contained in this.
     * * 1 if other sort limits are strictly contained with same direction
     * * -1 if other sort limits are strictly contained in opposite direction.
     */
    containsSortLimits(other: CutLoop): number;
    /**
     * * push coordinates from other onto this
     * * reset this.sortCoordinate0 to other.sortCoordinate1
     * @param other new coordinates
     */
    absorb(other: CutLoop): void;
    /** Comparison function for system sort function applied to an array of CutLoop .... */
    static sortFunction(loopA: CutLoop, loopB: CutLoop): number;
    /** Return first point coordinates.
     * * For type checking, assume array is not empty.
     */
    front(result?: Point3d): Point3d;
    /** Return last point coordinates.
     * * For type checking, assume array is not empty.
     */
    back(result?: Point3d): Point3d;
}
/**
 * Context to hold an array of input loops and apply sort logic.
 * * This is used when a non-convex face is clipped by a plane
 * *  Simple convex clip logic in this case generates double-back edges that need to be eliminated.
 * * This class manages the elimination.
 * * Usage pattern is:
 * @internal
 */
export declare class CutLoopMergeContext {
    /** Array (filled by user code) of loops being sorted. Contents are subject to being changed during sort. */
    inputLoops: CutLoop[];
    /** Array (filled by sortAndMergeLoops) of reorganized loops. */
    outputLoops: CutLoop[];
    constructor();
    /**
     *  * Search all start and end points for the one most distant from point0.
     */
    private mostDistantPoint;
    /**
     * * Find a long (probably longest) edge through start and end points of inputs.
     * * Setup sortCoordinate0 and sortCoordinate1 along that edge for each loop
     * * sort all inputLoop members by sortCoordinate0.
     */
    private sortInputs;
    /**
     * * sort all input loops by coordinate along the cut edge
     * * sweep left to right, using start and end coordinates to decide if loops are outer or hole, and combine holes into their containing outer loops.
     */
    sortAndMergeLoops(): void;
}
/**
 * Various static methods to perform computations on an array of points interpreted as a polygon.
 * @public
 */
export declare class PolygonOps {
    /** Sum areas of triangles from points[0] to each far edge.
     * * Consider triangles from points[0] to each edge.
     * * Sum the absolute areas (without regard to orientation) all these triangles.
     * @returns sum of absolute triangle areas.
     */
    static sumTriangleAreas(points: Point3d[] | GrowableXYZArray): number;
    /** Sum areas of triangles from points[0] to each far edge, as viewed with upVector pointing up.
     * * Consider triangles from points[0] to each edge.
     * * Sum the areas perpendicular to the upVector.
     * * If the upVector is near-zero length, a simple z vector is used.
     * @returns sum of triangle areas.
     */
    static sumTriangleAreasPerpendicularToUpVector(points: Point3d[] | GrowableXYZArray, upVector: Vector3d): number;
    /** Sum areas of triangles from points[0] to each far edge.
     * * Consider triangles from points[0] to each edge.
     * * Sum the signed areas of all these triangles. (An area can be negative at a concave corner.)
     * @returns sum of signed triangle areas.
     */
    static sumTriangleAreasXY(points: Point3d[]): number;
    /** These values are the integrated area moment products [xx,xy,xz, x]
     * for a right triangle in the first quadrant at the origin -- (0,0),(1,0),(0,1)
     */
    private static readonly _triangleMomentWeights;
    /** These values are the integrated volume moment products [xx,xy,xz, x, yx,yy,yz,y, zx,zy,zz,z,x,y,z,1]
     * for a tetrahedron in the first quadrant at the origin -- (0,00),(1,0,0),(0,1,0),(0,0,1)
     */
    private static readonly _tetrahedralMomentWeights;
    private static readonly _vector0;
    private static readonly _vector1;
    private static readonly _vector2;
    private static readonly _vectorOrigin;
    private static readonly _normal;
    private static readonly _matrixA;
    private static readonly _matrixB;
    private static readonly _matrixC;
    /** return a vector which is perpendicular to the polygon and has magnitude equal to the polygon area. */
    static areaNormalGo(points: IndexedXYZCollection, result?: Vector3d): Vector3d | undefined;
    /** return a vector which is perpendicular to the polygon and has magnitude equal to the polygon area. */
    static areaNormal(points: Point3d[], result?: Vector3d): Vector3d;
    /** return the area of the polygon.
     * * This assumes the polygon is planar
     * * This does NOT assume the polygon is on the xy plane.
     */
    static area(points: Point3d[]): number;
    /** return the projected XY area of the polygon. */
    static areaXY(points: Point3d[] | IndexedXYZCollection): number;
    /** Sum the areaXY () values for multiple polygons */
    static sumAreaXY(polygons: Point3d[][]): number;
    /**
     * Return a Ray3d with (assuming the polygon is planar and not self-intersecting)
     * * origin at the centroid of the (3D) polygon
     * * normal is a unit vector perpendicular to the plane
     * * 'a' member is the area.
     * @param points
     */
    static centroidAreaNormal(points: IndexedXYZCollection | Point3d[]): Ray3d | undefined;
    /**
     * * Return (in caller-allocated centroid) the centroid of the xy polygon.
     * * Return (as function value)  the area
     */
    static centroidAndAreaXY(points: Point2d[], centroid: Point2d): number | undefined;
    /**
     * Return a unit normal to the plane of the polygon.
     * @param points array of points around the polygon.
     * @param result caller-allocated result vector.
     * @return true if and only if result has unit length
     */
    static unitNormal(points: IndexedXYZCollection, result: Vector3d): boolean;
    /** Accumulate to the matrix of area products of a polygon with respect to an origin.
     * The polygon is assumed to be planar and non-self-intersecting.
     */
    /** Accumulate to the matrix of area products of a polygon with respect to an origin.
     * * The polygon is assumed to be planar and non-self-intersecting.
     * * Accumulated values are integrals over triangles from point 0 of the polygon to other edges of the polygon.
     * * Integral over each triangle is transformed to integrals from the given origin.
     * @param points array of points around the polygon.   Final closure point is not needed.
     * @param origin origin for global accumulation.
     * @param moments 4x4 matrix where products are accumulated.
     */
    static addSecondMomentAreaProducts(points: IndexedXYZCollection, origin: Point3d, moments: Matrix4d): void;
    /** Accumulate to the matrix of volume products of a polygon with respect to an origin.
     * * The polygon is assumed to be planar and non-self-intersecting.
     * * Accumulated values are integrals over tetrahedra from the origin to triangles on the polygon.
     * @param points array of points around the polygon.   Final closure point is not needed.
     * @param origin origin for tetrahedra
     * @param moments 4x4 matrix where products are accumulated.
     */
    static addSecondMomentVolumeProducts(points: IndexedXYZCollection, origin: Point3d, moments: Matrix4d): void;
    /** Return the matrix of area products of a polygon with respect to an origin.
     * The polygon is assumed to be planar and non-self-intersecting.
     * * `frameType===2` has xy vectors in the plane of the polygon, plus a unit normal z. (Used for area integrals)
     * * `frameType===3` has vectors from origin to 3 points in the triangle. (Used for volume integrals)
     */
    private static addSecondMomentTransformedProducts;
    /** Test the direction of turn at the vertices of the polygon, ignoring z-coordinates.
     * * For a polygon without self-intersections and successive colinear edges, this is a convexity and orientation test: all positive is convex and counterclockwise, all negative is convex and clockwise.
     * * Beware that a polygon which turns through more than a full turn can cross itself and close, but is not convex.
     * @returns 1 if all turns are to the left, -1 if all to the right, and 0 if there are any zero or reverse turns
     */
    static testXYPolygonTurningDirections(points: Point2d[] | Point3d[]): number;
    /**
     * Determine whether the polygon is convex.
     * @param polygon vertices, closure point optional
     * @returns whether the polygon is convex.
     */
    static isConvex(polygon: Point3d[] | IndexedXYZCollection): boolean;
    /**
     * Test if point (x,y) is IN, OUT or ON a polygon.
     * @return (1) for in, (-1) for OUT, (0) for ON
     * @param x x coordinate
     * @param y y coordinate
     * @param points array of xy coordinates.
     */
    static classifyPointInPolygon(x: number, y: number, points: XAndY[]): number | undefined;
    /**
     * Test if point (x,y) is IN, OUT or ON a polygon.
     * @return (1) for in, (-1) for OUT, (0) for ON
     * @param x x coordinate
     * @param y y coordinate
     * @param points array of xy coordinates.
     */
    static classifyPointInPolygonXY(x: number, y: number, points: IndexedXYZCollection): number | undefined;
    /**
     * Reverse loops as necessary to make them all have CCW orientation for given outward normal.
     * @param loops
     * @param outwardNormal
     * @return the number of loops reversed.
     */
    static orientLoopsCCWForOutwardNormalInPlace(loops: IndexedReadWriteXYZCollection | IndexedReadWriteXYZCollection[], outwardNormal: Vector3d): number;
    /**
     * Reverse and reorder loops in the xy-plane for consistency and containment.
     * @param loops multiple polygons in any order and orientation, z-coordinates ignored
     * @returns array of arrays of polygons that capture the input pointers. In each first level array:
     * * The first polygon is an outer loop, oriented counterclockwise.
     * * Any subsequent polygons are holes of the outer loop, oriented clockwise.
     * @see [[RegionOps.sortOuterAndHoleLoopsXY]]
     */
    static sortOuterAndHoleLoopsXY(loops: IndexedReadWriteXYZCollection[]): IndexedReadWriteXYZCollection[][];
    /**
     * Exactly like `sortOuterAndHoleLoopsXY` but allows loops in any plane.
     * @param loops multiple loops to sort and reverse.
     * @param defaultNormal optional normal for the loops, if known
     * @see [[sortOuterAndHoleLoopsXY]]
     */
    static sortOuterAndHoleLoops(loops: IndexedReadWriteXYZCollection[], defaultNormal: Vector3d | undefined): IndexedReadWriteXYZCollection[][];
    /** Compute the closest point on the polygon boundary to the given point.
     * @param polygon points of the polygon, closure point optional
     * @param testPoint point p to project onto the polygon edges. Works best when p is in the plane of the polygon.
     * @param tolerance optional distance tolerance to determine point-vertex and point-edge coincidence.
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the closest point `d.point`:
     * * `d.isValid()` returns true if and only if the polygon is nontrivial.
     * * `d.edgeIndex` and `d.edgeParam` specify the location of the closest point, within `distTol`.
     * * `d.code` classifies the closest point as a vertex (`PolygonLocation.OnPolygonVertex`) or as a point on an edge (`PolygonLocation.OnPolygonEdgeInterior`).
     * * `d.a` is the distance from testPoint to the closest point.
     * * `d.v` can be used to classify p (if p and polygon are coplanar): if n is the polygon normal then `d.v.dotProduct(n)` is +/-/0 if and only if p is inside/outside/on the polygon.
     */
    static closestPointOnBoundary(polygon: Point3d[] | IndexedXYZCollection, testPoint: Point3d, tolerance?: number, result?: PolygonLocationDetail): PolygonLocationDetail;
    private static _workXYZ?;
    private static _workXY0?;
    private static _workXY1?;
    private static _workXY2?;
    private static _workRay?;
    private static _workMatrix3d?;
    private static _workPlane?;
    /** Compute the intersection of a line (parameterized as a ray) with the plane of this polygon.
     * @param polygon points of the polygon, closure point optional
     * @param ray infinite line to intersect, as a ray
     * @param tolerance optional distance tolerance to determine point-vertex and point-edge coincidence.
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the line-plane intersection `d.point`:
     * * `d.isValid()` returns true if and only if the line intersects the plane.
     * * `d.code` indicates where the intersection lies with respect to the polygon.
     * * `d.a` is the ray intersection parameter. If `d.a` >= 0, the ray intersects the plane of the polygon.
     * * `d.edgeIndex` and `d.edgeParam` specify the location of the closest point on the polygon to the intersection, within `distTol`.
     */
    static intersectRay3d(polygon: Point3d[] | IndexedXYZCollection, ray: Ray3d, tolerance?: number, result?: PolygonLocationDetail): PolygonLocationDetail;
    /** Compute the intersection of a line (parameterized as a line segment) with the plane of this polygon.
     * @param polygon points of the polygon, closure point optional
     * @param point0 start point of segment on line to intersect
     * @param point1 end point of segment on line to intersect
     * @param tolerance optional distance tolerance to determine point-vertex and point-edge coincidence.
     * @param result optional pre-allocated object to fill and return
     * @returns details d of the line-plane intersection `d.point`:
     * * `d.isValid()` returns true if and only if the line intersects the plane.
     * * `d.code` indicates where the intersection lies with respect to the polygon.
     * * `d.a` is the segment intersection parameter. If `d.a` is in [0,1], the segment intersects the plane of the polygon.
     * * `d.edgeIndex` and `d.edgeParam` specify the location of the closest point on the polygon to the intersection, within `distTol`.
     * @see intersectRay3d
     */
    static intersectSegment(polygon: Point3d[] | IndexedXYZCollection, point0: Point3d, point1: Point3d, tolerance?: number, result?: PolygonLocationDetail): PolygonLocationDetail;
    /** Compute edge data for the barycentric coordinate computation, ignoring all z-coordinates.
     * @param polygon points of the polygon (without closure point)
     * @param edgeStartVertexIndex index of start vertex of the edge (unchecked)
     * @param point point to project to the edge
     * @param edgeOutwardUnitNormal pre-allocated vector to be populated on return with the unit perpendicular to the edge, facing outward, in xy-plane
     * @param tolerance used to clamp outputs
     * @param result optional pre-allocated result
     * @returns x: signed projection distance of `point` to the edge, y: edge parameter of the projection
     */
    private static computeEdgeDataXY;
    /** Compute the barycentric coordinates for a point on either of a pair of adjacent edges of a convex polygon.
     * @param polygon points of the polygon, assumed to be convex. Assumed to have no closure point.
     * @param iPrev start index of previous edge
     * @param prevNormal outward unit normal of previous edge
     * @param prevProj x = signed distance from point to previous edge; y = edge parameter of this projection in [0,1]
     * @param i start index of current edge
     * @param normal outward unit normal of current edge
     * @param proj x = signed distance from point to current edge; y = edge parameter of this projection in [0,1]
     * @param coords pre-allocated barycentric coordinate array to return, assumed to have length at least `polygon.length`
     * @returns barycentric coordinates, or undefined if not on either edge
     */
    private static convexBarycentricCoordinatesOnEdge;
    /** Compute the barycentric coordinates for a point inside a convex polygon.
     * @param polygon points of the polygon, assumed to be convex. Closure point optional.
     * @param point point assumed to be inside or on polygon
     * @param tolerance distance tolerance for point to be considered on a polygon edge
     * @return barycentric coordinates of the interior point, or undefined if invalid polygon or exterior point. Length is same as `polygon.length`.
     * @see BarycentricTriangle.pointToFraction
     */
    static convexBarycentricCoordinates(polygon: Point3d[] | IndexedXYZCollection, point: Point3d, tolerance?: number): number[] | undefined;
}
/**
 *  `IndexedXYZCollectionPolygonOps` class contains _static_ methods for typical operations on polygons carried as `IndexedXYZCollection`
 * @public
 */
export declare class IndexedXYZCollectionPolygonOps {
    private static readonly _xyz0Work;
    private static readonly _xyz1Work;
    private static readonly _xyz2Work;
    /**
     * Split a (convex) polygon into 2 parts based on altitude evaluations.
     * * POSITIVE ALTITUDE IS IN
     * @param plane any `PlaneAltitudeEvaluator` object that can evaluate `plane.altitude(xyz)` for distance from the plane.
     * @param xyz original polygon
     * @param xyzPositive array to receive inside part (altitude > 0)
     * @param xyzNegative array to receive outside part
     * @param altitudeRange min and max altitudes encountered.
     */
    static splitConvexPolygonInsideOutsidePlane(plane: PlaneAltitudeEvaluator, xyz: IndexedXYZCollection, xyzPositive: IndexedReadWriteXYZCollection, xyzNegative: IndexedReadWriteXYZCollection, altitudeRange: Range1d): void;
    /**
     * Clip a polygon to one side of a plane.
     * * Results with 2 or fewer points are ignored.
     * * Other than ensuring capacity in the arrays, there are no object allocations during execution of this function.
     * * plane is passed as unrolled Point4d (ax,ay,az,aw) point (x,y,z) acts as homogeneous (x,y,z,1)
     *   * `keepPositive === true` selects positive altitudes.
     * @param plane any type that has `plane.altitude`
     * @param xyz input points.
     * @param work work buffer
     * @param tolerance tolerance for "on plane" decision.
     * @return the number of crossings.   If this is larger than 2, the result is "correct" in a parity sense but may have overlapping (hence cancelling) parts.
     */
    static clipConvexPolygonInPlace(plane: PlaneAltitudeEvaluator, xyz: GrowableXYZArray, work: GrowableXYZArray, keepPositive?: boolean, tolerance?: number): number;
    /** Return an array containing
     * * All points that are exactly on the plane.
     * * Crossing points between adjacent points that are (strictly) on opposite sides.
     */
    static polygonPlaneCrossings(plane: PlaneAltitudeEvaluator, xyz: IndexedXYZCollection, crossings: Point3d[]): void;
    /**
     * * Input a "clipped" polygon (from clipConvexPolygonInPlace) with more than 2 crossings, i.e. is from a non-convex polygon with configurations like:
     *   * multiple distinct polygons
     *   * single polygon, but cut lines overlap and cancel by parity rules.
     * * return 1 or more polygons, each having first and last points "on" the plane and intermediate points "off"
     * * `minChainLength` indicates the shortest chain to be returned.
     * @internal
     */
    static gatherCutLoopsFromPlaneClip(plane: PlaneAltitudeEvaluator, xyz: GrowableXYZArray, minChainLength?: number, tolerance?: number): CutLoopMergeContext;
    /**
     * * Input the loops from `gatherCutLoopsFromClipPlane`
     * * Consolidate loops for reentrant configurations.
     * * WARNING: The output reuses and modifies input loops whenever possible.
     * @internal
     */
    static reorderCutLoops(loops: CutLoopMergeContext): void;
    /**
     * Return the intersection of the plane with a range cube.
     * @param range
     * @param xyzOut intersection polygon.  This is convex.
     * @return reference to xyz if the polygon still has points; undefined if all points are clipped away.
     */
    static intersectRangeConvexPolygonInPlace(range: Range3d, xyz: GrowableXYZArray): GrowableXYZArray | undefined;
}
/**
 * `Point3dArrayPolygonOps` class contains _static_ methods for typical operations on polygons carried as `Point3d[]`
 * @public
 */
export declare class Point3dArrayPolygonOps {
    private static readonly _xyz0Work;
    /**
     * Split a (convex) polygon into 2 parts.
     * @param xyz original polygon
     * @param xyzIn array to receive inside part
     * @param xyzOut array to receive outside part
     * @param altitudeRange min and max altitudes encountered.
     */
    static convexPolygonSplitInsideOutsidePlane(plane: PlaneAltitudeEvaluator, xyz: Point3d[], xyzIn: Point3d[], xyzOut: Point3d[], altitudeRange: Range1d): void;
    /** Return an array containing
     * * All points that are exactly on the plane.
     * * Crossing points between adjacent points that are (strictly) on opposite sides.
     */
    static polygonPlaneCrossings(plane: PlaneAltitudeEvaluator, xyz: Point3d[], crossings: Point3d[]): void;
    /**
     * Clip a polygon, returning the clip result in the same object.
     * @param xyz input/output polygon
     * @param work scratch object
     * @param tolerance tolerance for on-plane decision.
     */
    static convexPolygonClipInPlace(plane: PlaneAltitudeEvaluator, xyz: Point3d[], work: Point3d[] | undefined, tolerance?: number): void;
}
