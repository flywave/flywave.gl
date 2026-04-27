import { type Point3d } from "./point3d-vector3d";
import { Transform } from "./transform";
/**
 * context for constructing smooth motion a startFrustum and endFrustum.
 * The externally interesting calls are
 * * Create a context to shift corner0 to corner1, with the(NPC coordinate) point(fractionU, fractionV, fractionW) moving along its connecting segment, all other points rotating smoothly from the start orientation to end orientation:
 * `const context = SmoothTransformBetweenFrusta (cornerA, cornerB)`
 *  * Get any intermediate 8 corners(at fraction) with `context.fractionToWorldCorners(fraction)`
 * * Frustum corners are ordered by "x varies fastest, then y, then z", hence (xyz) order on nondimensional space is
 *   * (left lower rear) (000)
 *   * (right lower rear) (100)
 *   * (left upper rear) (010)
 *   * (right upper rear) (100)
 *   * (left lower front) (001)
 *   * (right lower front) (101)
 *   * (left upper front) (011)
 *   * (right upper front) (101)
 * * which uses names
 *    * (left,right) for horizontal (x)
 *    * (bottom, top) for vertical (y)
 *    * (rear, front) for back and front planes (z)
 * @public
 */
export declare class SmoothTransformBetweenFrusta {
    private readonly _localCornerA;
    private readonly _localCornerB;
    private readonly _localToWorldA;
    private readonly _localToWorldB;
    /** (property accessor) rigid frame at start of motion */
    get localToWorldA(): Transform;
    /** (property accessor) rigid frame at end of motion */
    get localToWorldB(): Transform;
    private readonly _rotationAxis;
    private readonly _rotationAngle;
    /**
     * CAPTURE local corners, pickup and putdown frames, and rotation-around-vector data
     * @param localCornerA
     * @param localCornerB
     * @param localToWordA
     * @param localToWordB
     * @param rotationAxis
     * @param rotationAngle
     */
    private constructor();
    /**
     * Set up rotation data for smooth transition from 8 point frusta cornerA and cornerB
     * @param cornerA
     * @param cornerB
     */
    static create(cornerA: Point3d[], cornerB: Point3d[], preferSimpleRotation?: boolean): SmoothTransformBetweenFrusta | undefined;
    /** interpolate local corner coordinates at fractional move from m_localFrustum0 to m_localFrustum1 */
    interpolateLocalCorners(fraction: number, result?: Point3d[]): Point3d[];
    /**
     * After initialization, call this for various intermediate fractions.
     * The returned corner points are in world coordinates "between" start and end positions.
     */
    fractionToWorldCorners(fraction: number, result?: Point3d[]): Point3d[];
}
