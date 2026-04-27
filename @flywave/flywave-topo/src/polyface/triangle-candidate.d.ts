import { BarycentricTriangle } from "../geometry3d/barycentric-triangle";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
/**
 * `TriangleCandidate` is a `BarycentricTriangle` with additional application-specific label data:
 * * `quality` = numeric indicator of quality (e.g. aspect ratio of this triangle or a combination with other triangles)
 * * `isValid` = boolean flag.
 * * `id` = application specific identifier
 * @internal
 */
export declare class TriangleCandidate extends BarycentricTriangle {
    private _quality;
    private _isValid;
    id: number;
    private constructor();
    /**
     * Copy all coordinate and label data from `other` to this.
     * @param other source triangle
     */
    setFrom(other: TriangleCandidate): this;
    /** Create (always) a TriangleCandidate.
     * * Access points from multiple `IndexedXYZCollection`
     * * mark invalid if any indices are invalid.
     */
    static createFromIndexedXYZ(source0: IndexedXYZCollection, index0: number, source1: IndexedXYZCollection, index1: number, source2: IndexedXYZCollection, index2: number, id: number, result?: TriangleCandidate): TriangleCandidate;
    /** (property) return the validity flag. */
    get isValid(): boolean;
    /**
     * * Mark this triangle invalid.
     * * optionally set aspect ratio.
     * * points are not changed
     * @param aspectRatio
     */
    markInvalid(quality?: number): void;
    /**
     * * Recompute the aspect ratio.
     * * Mark invalid if aspect ratio is 0 or negative.
     */
    updateAspectRatio(): void;
    /**
     * Clone all coordinate and label data.
     * @param result optional preallocated `TriangleCandidate`
     */
    clone(result?: TriangleCandidate): TriangleCandidate;
    /**
     * Return a `TriangleCandidate` with
     *  * coordinate data and labels from `candidateA`
     *  * LOWER quality of the two candidates.
     *  * quality reduced by 1 if triangles have opposing normals (negative dot product of the two normals)
     * @param candidateA candidate known to be valid
     * @param candidateB candidate that may by valid
     * @param result copy of candidate A, but if candidateB is valid the result aspect ratio is reduced (a) to the minimum of the two ratios and then (b) reduced by 1 if orientations clash.
     */
    static copyWithLowerQuality(candidateA: TriangleCandidate, candidateB: TriangleCandidate, result?: TriangleCandidate): TriangleCandidate;
    /**
     * choose better aspect ratio of triangle, other.
     * @param triangle known valid triangle, to be updated
     * @param other candidate replacement
     */
    static updateIfOtherHasHigherQuality(triangle: TriangleCandidate, other: TriangleCandidate): void;
}
