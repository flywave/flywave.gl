import { type PolygonLocation } from "../geometry";
import { TriangleLocationDetail } from "../geometry3d/barycentric-triangle";
import { type IndexedXYCollection } from "../geometry3d/indexed-xy-collection";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { type Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { PolygonLocationDetail } from "../geometry3d/polygon-ops";
import { type PolyfaceVisitor } from "./polyface";
/** Callback for processing the detail for an intersected facet.
 * @param detail reference to the intersection data, with `detail.IsInsideOn === true`. Note that `detail` is owned by the caller; to persist, use `detail.clone`.
 * @param visitor at currently intersected facet
 * @returns true to accept this intersection and stop processing; false to continue to the next facet
 * @public
 */
export type FacetIntersectCallback = (detail: FacetLocationDetail, visitor: PolyfaceVisitor) => boolean;
/** Options for computing and processing facet intersection methods.
 * @see PolyfaceQuery.intersectRay3d
 * @public
 */
export declare class FacetIntersectOptions {
    /** distance tolerance for testing coincidence with facet boundary */
    distanceTolerance: number;
    /** fractional tolerance for snapping barycentric coordinates to a triangular facet edge */
    parameterTolerance: number;
    /** whether to compute the normal at the intersection point */
    needNormal?: boolean;
    /** whether to compute the uv parameter at the intersection point */
    needParam?: boolean;
    /** whether to compute the color at the intersection point */
    needColor?: boolean;
    /** whether to compute the barycentric coordinates of the point for a convex facet */
    needBarycentricCoordinates?: boolean;
    /** optional callback to accept an intersected facet */
    acceptIntersection?: FacetIntersectCallback;
    /** constructor with defaults */
    constructor();
}
/**
 * Carries data about a point in the plane of a facet of a mesh.
 * @see PolyfaceQuery.intersectRay3d
 * @public
 */
export interface FacetLocationDetail {
    /** Get the index of the referenced facet. */
    get facetIndex(): number;
    /** Get the number of edges of this facet. */
    get edgeCount(): number;
    /** Get the world coordinates of the point. */
    get point(): Point3d;
    /** Get the application-specific number. */
    get a(): number;
    /** Get the projection of the point onto the closest facet edge. */
    get closestEdge(): {
        startVertexIndex: number;
        edgeParam: number;
    };
    /** Whether this instance specifies a valid location. */
    get isValid(): boolean;
    /** Whether the facet is convex. */
    get isConvex(): boolean;
    /** Whether the point is inside or on the facet. */
    get isInsideOrOn(): boolean;
    /** Get the code that classifies the location of the point with respect to the facet. */
    get classify(): PolygonLocation;
    /** Clone the instance */
    clone(): FacetLocationDetail;
    /** Set the instance contents from the other detail */
    copyContentsFrom(other: FacetLocationDetail): void;
    /** Get reference to cached normal interpolated from facet data. Inputs may be used to compute the cache. */
    getNormal(facetNormals?: IndexedXYZCollection, facetVertices?: IndexedXYZCollection, distanceTolerance?: number): Vector3d | undefined;
    /** Get reference to cached uv parameter interpolated from facet data. Inputs may be used to compute the cache. */
    getParam(facetParams?: IndexedXYCollection, facetVertices?: IndexedXYZCollection, distanceTolerance?: number): Point2d | undefined;
    /** Get cached color interpolated from facet data. Inputs may be used to compute the cache. */
    getColor(facetColors?: number[], facetVertices?: IndexedXYZCollection, distanceTolerance?: number): number | undefined;
    /** Get reference to cached barycentric coordinates of the point. Inputs may be used to compute the cache. */
    getBarycentricCoordinates(facetVertices?: IndexedXYZCollection, distanceTolerance?: number): number[] | undefined;
}
/**
 * Implementation of `FacetLocationDetail` for a triangular facet.
 * @public
 */
export declare class TriangularFacetLocationDetail implements FacetLocationDetail {
    private _facetIndex;
    private readonly _detail;
    private _normal?;
    private _param?;
    private _color?;
    /** captures the detail if provided */
    private constructor();
    /** Invalidate this detail. */
    invalidate(deep?: boolean): void;
    /** Create a detail.
     * @param result optional pre-allocated object to fill and return
     */
    static create(facetIndex: number, detail?: TriangleLocationDetail, result?: TriangularFacetLocationDetail): TriangularFacetLocationDetail;
    /** Get the facet index. */
    get facetIndex(): number;
    /** Get the edge count of this facet. */
    get edgeCount(): number;
    /** Get the world coordinates of the point. */
    get point(): Point3d;
    /** Get the application-specific number. */
    get a(): number;
    /** Get the projection of the point onto the closest facet edge. */
    get closestEdge(): {
        startVertexIndex: number;
        edgeParam: number;
    };
    /** Test validity of fields other than _detail. */
    private get _isValid();
    /** Whether this instance specifies a valid location. */
    get isValid(): boolean;
    /** Whether the facet is convex. */
    get isConvex(): boolean;
    /** Whether the point is inside or on the polygon. */
    get isInsideOrOn(): boolean;
    /** Get the code that classifies the location of the point with respect to the facet. */
    get classify(): PolygonLocation;
    /** Clone the instance */
    clone(): TriangularFacetLocationDetail;
    /** Set the instance contents from the other detail.
     * @param other detail to clone
     */
    copyContentsFrom(other: TriangularFacetLocationDetail): void;
    /** Get normal interpolated from facet data.
     * @param facetNormals used to compute the normal cache
     * @returns reference to cached normal
     */
    getNormal(facetNormals?: IndexedXYZCollection): Vector3d | undefined;
    /** Get uv parameter interpolated from facet data.
     * @param facetParams used to compute the uv parameter cache
     * @returns reference to cached uv parameter
     */
    getParam(facetParams?: IndexedXYCollection): Point2d | undefined;
    /** Get color interpolated from facet data.
     * * Assumes barycentric coordinates are already computed in the TriangleLocationDetail member.
     * @param facetColors used to compute the color cache
     * @returns cached color
     */
    getColor(facetColors?: number[]): number | undefined;
    /** Get the barycentric coordinates of this location.
     * @returns cached barycentric coordinates
     */
    getBarycentricCoordinates(): number[];
}
/**
 * Implementation of `FacetLocationDetail` for a non-convex facet.
 * * Facet vertex data interpolation is not available.
 * @public
 */
export declare class NonConvexFacetLocationDetail implements FacetLocationDetail {
    private _facetIndex;
    private _edgeCount;
    protected _detail: PolygonLocationDetail;
    /** captures the detail if provided */
    protected constructor(facetIndex?: number, edgeCount?: number, detail?: PolygonLocationDetail);
    /** Invalidate this detail. */
    invalidate(deep?: boolean): void;
    /** Create a detail.
     * @param result optional pre-allocated object to fill and return
     */
    static create(facetIndex: number, edgeCount: number, detail?: PolygonLocationDetail, result?: NonConvexFacetLocationDetail): NonConvexFacetLocationDetail;
    /** Get the facet index. */
    get facetIndex(): number;
    /** Get the edge count of this facet. */
    get edgeCount(): number;
    /** Get the world coordinates of the point. */
    get point(): Point3d;
    /** Get the application-specific number. */
    get a(): number;
    /** Get the projection of the point onto the closest facet edge. */
    get closestEdge(): {
        startVertexIndex: number;
        edgeParam: number;
    };
    /** Test validity of fields other than _detail. */
    private get _isValid();
    /** Whether this instance specifies a valid location. */
    get isValid(): boolean;
    /** Whether the facet is convex. */
    get isConvex(): boolean;
    /** Whether the point is inside or on the polygon. */
    get isInsideOrOn(): boolean;
    /** Get the code that classifies the location of the point with respect to the facet. */
    get classify(): PolygonLocation;
    /** Clone the instance */
    clone(): NonConvexFacetLocationDetail;
    /** Set the instance contents from the other detail.
     * @param other detail to clone
     */
    copyContentsFrom(other: NonConvexFacetLocationDetail): void;
    /** Interpolated data is not defined for a non-convex facet.
     * @returns undefined
     */
    getNormal(): Vector3d | undefined;
    /** Interpolated data is not defined for a non-convex facet.
     * @returns undefined
     */
    getParam(): Point2d | undefined;
    /** Interpolated data is not defined for a non-convex facet.
     * @returns undefined
     */
    getColor(): number | undefined;
    /** Barycentric coordinates are not defined for a non-convex facet.
     * @returns undefined
     */
    getBarycentricCoordinates(): number[] | undefined;
}
/**
 * Implementation of `FacetLocationDetail` for a convex facet.
 * * If `edgeCount` is 3, `TriangularFacetLocationDetail` is more efficient.
 * @public
 */
export declare class ConvexFacetLocationDetail extends NonConvexFacetLocationDetail {
    private _normal?;
    private _param?;
    private _color?;
    private _barycentricCoordinates?;
    /** captures the detail if provided */
    private constructor();
    /** Invalidate this detail. */
    invalidate(deep?: boolean): void;
    /** Create a detail.
     * @param result optional pre-allocated object to fill and return
     */
    static create(facetIndex: number, edgeCount: number, detail?: PolygonLocationDetail, result?: ConvexFacetLocationDetail): ConvexFacetLocationDetail;
    /** Whether the facet is convex. */
    get isConvex(): boolean;
    /** Clone the instance */
    clone(): ConvexFacetLocationDetail;
    /** Set the instance contents from the other detail.
     * @param other detail to clone
     */
    copyContentsFrom(other: ConvexFacetLocationDetail): void;
    /** Get normal interpolated from facet data.
     * @param facetNormals used to compute the normal cache
     * @param facetVertices used to compute the barycentric coordinate cache
     * @param distanceTolerance used to compute the barycentric coordinate cache
     * @returns reference to cached normal
     */
    getNormal(facetNormals?: IndexedXYZCollection, facetVertices?: IndexedXYZCollection, distanceTolerance?: number): Vector3d | undefined;
    /** Get uv parameter interpolated from facet data.
     * @param facetParams used to compute the uv parameter cache
     * @param facetVertices used to compute the barycentric coordinate cache
     * @param distanceTolerance used to compute the barycentric coordinate cache
     * @returns reference to cached uv parameter
     */
    getParam(facetParams?: IndexedXYCollection, facetVertices?: IndexedXYZCollection, distanceTolerance?: number): Point2d | undefined;
    /** Get color interpolated from facet data.
     * @param facetColors used to compute the color cache
     * @param facetVertices used to compute the barycentric coordinate cache
     * @param distanceTolerance used to compute the barycentric coordinate cache
     * @returns cached color
     */
    getColor(facetColors?: number[], facetVertices?: IndexedXYZCollection, distanceTolerance?: number): number | undefined;
    /** Get the barycentric coordinates of this location, if they have been computed.
     * @param facetVertices used to compute the barycentric coordinate cache
     * @param distanceTolerance used to compute the barycentric coordinate cache
     * @returns cached barycentric coordinates
     */
    getBarycentricCoordinates(facetVertices?: IndexedXYZCollection, distanceTolerance?: number): number[] | undefined;
}
