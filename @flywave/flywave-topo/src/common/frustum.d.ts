import { type LowAndHighXY, type LowAndHighXYZ, type Plane3dByOriginAndUnitNormal, type Transform, type XYAndZ, ConvexClipPlaneSet, Map4d, Matrix3d, Point3d, Range3d } from "../core-geometry";
/** The 8 corners of the [Normalized Plane Coordinate]($docs/learning/glossary.md#npc) cube.
 * @public
 * @extensions
 */
export declare enum Npc {
    /** Left bottom rear */
    _000 = 0,
    /** Right bottom rear */
    _100 = 1,
    /** Left top rear */
    _010 = 2,
    /** Right top rear */
    _110 = 3,
    /** Left bottom front */
    _001 = 4,
    /** Right bottom front */
    _101 = 5,
    /** Left top front */
    _011 = 6,
    /** Right top front */
    _111 = 7,
    LeftBottomRear = 0,
    RightBottomRear = 1,
    LeftTopRear = 2,
    RightTopRear = 3,
    LeftBottomFront = 4,
    RightBottomFront = 5,
    LeftTopFront = 6,
    RightTopFront = 7,
    /** useful for sizing arrays */
    CORNER_COUNT = 8
}
/** The 8 corners of an [[Npc]] Frustum.
 * @public
 */
export declare const NpcCorners: Point3d[];
/** The center point of the [Normalized Plane Coordinate]($docs/learning/glossary.md#npc) cube.
 * @public
 */
export declare const NpcCenter: Point3d;
/** The region of physical (3d) space that appears in a view. It forms the field-of-view of a camera.
 * It is stored as 8 points, in [[Npc]] order, that must define a truncated pyramid.
 * @public
 */
export declare class Frustum {
    /** Array of the 8 points of this Frustum. */
    readonly points: Point3d[];
    /** Constructor for Frustum. Members are initialized to the Npc cube. */
    constructor();
    /** Initialize this Frustum to the 8 corners of the NPC cube. */
    initNpc(): this;
    /** Get a corner Point from this Frustum. */
    getCorner(i: number): Point3d;
    /** Get the point at the center of this Frustum (halfway between RightTopFront and LeftBottomRear. */
    getCenter(): Point3d;
    /** Get the distance between two corners of this Frustum. */
    distance(corner1: number, corner2: number): number;
    /** Get the ratio of the length of the diagonal of the front plane to the diagonal of the back plane. */
    getFraction(): number;
    /** Multiply all the points of this Frustum by a Transform, in place. */
    multiply(trans: Transform): void;
    /** Offset all of the points of this Frustum by a vector. */
    translate(offset: XYAndZ): void;
    /** Transform all the points of this Frustum and return the result in another Frustum. */
    transformBy(trans: Transform, result?: Frustum): Frustum;
    /** Calculate a bounding range from the 8 points in this Frustum. */
    toRange(range?: Range3d): Range3d;
    /** Make a copy of this Frustum.
     * @param result Optional Frustum for copy. If undefined allocate a new Frustum.
     */
    clone(result?: Frustum): Frustum;
    /** Set the points of this Frustum to be copies of the points in another Frustum. */
    setFrom(other: Frustum): void;
    /** Set the points of this frustum from array of corner points in NPC order. */
    setFromCorners(corners: Point3d[]): void;
    /** Scale this Frustum, in place, about its center by a scale factor. */
    scaleAboutCenter(scale: number): void;
    /** The point at the center of the front face of this frustum */
    get frontCenter(): Point3d;
    /** The point at the center of the rear face of this frustum */
    get rearCenter(): Point3d;
    /** Scale this frustum's XY (viewing) plane about its center */
    scaleXYAboutCenter(scale: number): void;
    /** Create a Map4d that converts world coordinates to/from [[Npc]] coordinates of this Frustum. */
    toMap4d(): Map4d | undefined;
    /** Get the rotation matrix to the frame of this frustum.  This is equivalent to the view rotation matrix. */
    getRotation(result?: Matrix3d): Matrix3d | undefined;
    /** Get the eye point  - undefined if parallel projection */
    getEyePoint(result?: Point3d): Point3d | undefined;
    /** Invalidate this Frustum by setting all 8 points to zero. */
    invalidate(): void;
    /** Return true if this Frustum is equal to another Frustum */
    equals(rhs: Frustum): boolean;
    /** Return true if all of the points in this Frustum are *almost* the same as the points in another Frustum.
     * @see [[equals]], [XYZ.isAlmostEqual]($geometry)
     */
    isSame(other: Frustum): boolean;
    /** Initialize this Frustum from a Range */
    initFromRange(range: LowAndHighXYZ | LowAndHighXY): void;
    /** Create a new Frustum from a Range3d */
    static fromRange(range: LowAndHighXYZ | LowAndHighXY, out?: Frustum): Frustum;
    /** Return true if this Frustum has a mirror (is not in the correct order.) */
    get hasMirror(): boolean;
    /** Make sure the frustum point order does not include mirroring. If so, reverse the order. */
    fixPointOrder(): void;
    /** Get a convex set of clipping planes bounding the region contained by this Frustum. */
    getRangePlanes(clipFront: boolean, clipBack: boolean, expandPlaneDistance: number): ConvexClipPlaneSet;
    /** Get a (convex) polygon that represents the intersection of this frustum with a plane, or undefined if no intersection exists */
    getIntersectionWithPlane(plane: Plane3dByOriginAndUnitNormal): Point3d[] | undefined;
}
