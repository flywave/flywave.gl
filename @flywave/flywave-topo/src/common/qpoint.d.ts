import { type XAndY, type XYAndZ, Point2d, Point3d, Range2d, Range3d, Vector2d, Vector3d } from "../core-geometry";
import { Uint16ArrayBuilder } from "../utils";
/**
 * Provides facilities for quantizing floating point values within a specified range into 16-bit unsigned integers.
 * This is a lossy compression technique.
 * Given a floating point range [min, max], a floating point value `x` within that range is quantized by subtracting
 * `min`, scaling the result according to `max`, and truncating the result to an integer.
 * Therefore min quantizes to 0, max to 0xffff, (min+max)/2 to 0x7fff, and so on.
 * These routines are chiefly used by classes like [[QPoint2d]] and [[QPoint3d]] to reduce the space required to store
 * coordinate values for [RenderGraphic]($frontend)s.
 * @public
 * @extensions
 */
export declare namespace Quantization {
    const rangeScale16 = 65535;
    const rangeScale8 = 255;
    /** Compute the scale factor required to quantize `extent` to `rangeScale` discrete values. */
    function computeScale(extent: number, rangeScale?: number): number;
    /** @internal */
    function isInRange(qpos: number, rangeScale?: number): boolean;
    /** Return `pos` quantized to the range [`origin`, `origin + rangeScale`].
     * @see [[Quantization.unquantize]] for the inverse operation.
     */
    function quantize(pos: number, origin: number, scale: number, rangeScale?: number): number;
    /** @internal */
    function isQuantizable(pos: number, origin: number, scale: number, rangeScale?: number): boolean;
    /** Give `qpos` quantized to the range [`origin`, `origin + rangeScale`], return the unquantized value.
     * @see [[Quantization.quantize]] for the inverse operation.
     */
    function unquantize(qpos: number, origin: number, scale: number): number;
    /** @internal */
    function isQuantized(qpos: number): boolean;
}
/** @alpha */
export interface QParams2dProps {
    origin: XAndY;
    scale: XAndY;
}
/** Parameters used for [[Quantization]] of 2d points such that the `x` and `y` components are each quantized to 16-bit unsigned integers.
 * @see [[QPoint2d]] for the quantized representation of a [Point2d]($core-geometry).
 * @see [[QPoint2dList]] for a list of [[QPoint2d]]s quantized using a [[QParams2d]].
 * @public
 * @extensions
 */
export declare class QParams2d {
    /** The origin of the quantization range. */
    readonly origin: Point2d;
    /** The scale applied to coordinates to quantize them. */
    readonly scale: Point2d;
    private constructor();
    private setFrom;
    /** Set [[origin]] and [[scale]] from `src`. */
    copyFrom(src: QParams2d): void;
    /** Create a copy of these params.
     * @param out If supplied, these QParams2d will be modified and returned; otherwise a new QParams2d object will be created and returned.
     */
    clone(out?: QParams2d): QParams2d;
    /** Initialize these parameters to support quantization of values within the specified range. */
    setFromRange(range: Range2d, rangeScale?: number): void;
    /** Create parameters to support quantization of values within the specified range. */
    static fromRange(range: Range2d, out?: QParams2d, rangeScale?: number): QParams2d;
    /** Return the unquantized point for the input `x` and `y` components. If `out` is supplied, it will be modified to hold the result and returned. */
    unquantize(x: number, y: number, out?: Point2d): Point2d;
    /** Creates parameters supporting quantization of values within the range [-1.0, 1.0], appropriate for normalized 2d vectors. */
    static fromNormalizedRange(rangeScale?: number): QParams2d;
    /** Create parameters supporting quantization of values within the range [0.0, 1.0]. */
    static fromZeroToOne(rangeScale?: number): QParams2d;
    /** Create parameters from origin and scale components */
    static fromOriginAndScale(originX: number, originY: number, scaleX: number, scaleY: number): QParams2d;
    /** @internal */
    get rangeDiagonal(): Vector2d;
    /** Return true if the point point is quantizable using these parameters. */
    isQuantizable(point: Point2d): boolean;
    /** @alpha */
    toJSON(): QParams2dProps;
    /** @alpha */
    static fromJSON(src: QParams2dProps): QParams2d;
}
/** Represents a [Point2d]($core-geometry) compressed such that each component `x` and `y` is quantized to the 16-bit integer range [0, 0xffff].
 * These are primarily used to reduce the space required for coordinates used by [RenderGraphic]($frontend)s.
 * @see [[QParams2d]] to define quantization parameters for a range of points.
 * @see [[QPoint2dList]] for a list of points all quantized to the same range.
 * @public
 * @extensions
 */
export declare class QPoint2d {
    private _x;
    private _y;
    /** The quantized x component. */
    get x(): number;
    set x(x: number);
    /** The quantized y component. */
    get y(): number;
    set y(y: number);
    /** Construct with `x` and `y` initialized to zero. */
    constructor();
    /** Initialize this point by quantizing the supplied { x, y } using the specified params */
    init(pos: XAndY, params: QParams2d): void;
    /** Create a quantized point from the supplied Point2d using the specified params */
    static create(pos: Point2d, params: QParams2d): QPoint2d;
    /** Initialize `x` and `y` from `src`. */
    copyFrom(src: QPoint2d): void;
    /** Create a copy of this point.
     * @param out If supplied, it will be modified in-place and returned; otherwise a new QPoint2d will be allocated and returned.
     */
    clone(out?: QPoint2d): QPoint2d;
    /**
     * Set the x and y components directly.
     * @param x Must be an integer in the range [0, 0xffff]
     * @param y Must be an integer in the range [0, 0xffff]
     */
    setFromScalars(x: number, y: number): void;
    /**
     * Create a QPoint2d directly from x and y components.
     * @param x Must be an integer in the range [0, 0xffff]
     * @param y Must be an integer in the range [0, 0xffff]
     */
    static fromScalars(x: number, y: number): QPoint2d;
    /** Return a Point2d unquantized according to the supplied `params`. If `out` is supplied, it will be modified in-place and returned. */
    unquantize(params: QParams2d, out?: Point2d): Point2d;
}
/** A compact representation of a list of [[QPoint2d]]s stored in a `Uint16Array`
 * This representation is particularly useful when passing data to WebGL; for example, see [RealityMeshParams.uvs]($frontend).
 * @see [[QPoint3dBuffer]] for 3d points.
 * @public
 * @extensions
 */
export interface QPoint2dBuffer {
    /** The parameters used to quantize the [[points]]. */
    params: QParams2d;
    /** The [[QPoint2d]]s as pairs of unsigned 16-bit integers. The length must be a multiple of 2; the number of points in the array is half the array's length.
     * To obtain the `n`th point, use `QPoint2d.fromScalars(buffer.points[n * 2], buffer.points[n * 2 + 1])`.
     */
    points: Uint16Array;
}
/** @public
 * @extensions
 */
export declare namespace QPoint2dBuffer {
    /** Extracts the point at the specified index from a buffer.
     * @param points The buffer in which each consecutive pair of integers is a 2d quantized point.
     * @param pointIndex The index of the point to extract, ranging from zero to one less than the number of points in the buffer.
     * @param result If supplied, a preallocated [[QPoint2d]] to initialize with the result and return.
     * @returns The point at `pointIndex`.
     * @throws Error if `pointIndex` is out of bounds.
     */
    function getQPoint(points: Uint16Array, pointIndex: number, result?: QPoint2d): QPoint2d;
    /** Extracts and unquantizes the point at the specified index from a buffer.
     * @param buffer The array of points and the quantization parameters.
     * @param The index of the point to extract, ranging from zero to one less than the number of points in the buffer.
     * @param result If supplied, a preallocated [Point2d]($core-geometry) to initialize with the result and return.
     * @returns The point at `pointIndex`.
     * @throws Error if `pointIndex` is out of bounds.
     */
    function unquantizePoint(buffer: QPoint2dBuffer, pointIndex: number, result?: Point2d): Point2d;
}
/** A list of [[QPoint2d]]s all quantized to the same range.
 * @public
 * @extensions
 */
export declare class QPoint2dList {
    /** Parameters used to quantize the points. */
    readonly params: QParams2d;
    private readonly _list;
    /** The list of quantized points. */
    get list(): readonly QPoint2d[];
    /** Construct an empty list set up to use the supplied quantization parameters. */
    constructor(params: QParams2d);
    /** Removes all points from the list. */
    clear(): void;
    /** Removes all points from the list and change the quantization parameters. */
    reset(params: QParams2d): void;
    /** Quantizes the supplied Point2d to this list's range and appends it to the list. */
    add(pt: Point2d): void;
    /** Adds a previously-quantized point to this list. */
    push(qpt: QPoint2d): void;
    /** The number of points in the list. */
    get length(): number;
    /** Returns the unquantized value of the point at the specified index in the list. */
    unquantize(index: number, out?: Point2d): Point2d;
    /** Changes the quantization parameters and requantizes all points in the list to the new range.
     * @note The loss of precision is compounded each time the points are requantized to a new range.
     */
    requantize(params: QParams2d): void;
    /** Extracts the current contents of the list as a Uint16Array such that the first element of the array corresponds to the first point's `x` component,
     * the second to the first point's `y` component, and so on.
     */
    toTypedArray(): Uint16Array;
    /**  Create from a Uint16Array laid out such that `array[0]` corresponds to the first point's `x` component, `array[1]` to the first point's `y` component, and so on. */
    fromTypedArray(range: Range2d, array: Uint16Array): void;
    /** Construct a QPoint2dList containing all points in the supplied list, quantized to the range of those points. */
    static fromPoints(points: Point2d[], out?: QPoint2dList): any;
}
/** @alpha */
export interface QParams3dProps {
    origin: XYAndZ;
    scale: XYAndZ;
}
/** Parameters used for [[Quantization]] of 3d points such that the `x`, `y`, and `z` components are each quantized to 16-bit unsigned integers.
 * @see [[QPoint3d]] for the quantized representation of a [Point3d]($core-geometry).
 * @see [[QPoint3dList]] for a list of [[QPoint3d]]s quantized using a [[QParams3d]].
 * @public
 * @extensions
 */
export declare class QParams3d {
    /** The origin of the quantization range. */
    readonly origin: Point3d;
    /** The scale applied to coordinates to quantize them. */
    readonly scale: Point3d;
    private constructor();
    private setFrom;
    /** Set `x`, `y`, and `z` from `src. */
    copyFrom(src: QParams3d): void;
    /** Create a copy of these parameters.
     * @param out If supplied, it will be modified in-place and returned instead of allocating a new QParams3d.
     */
    clone(out?: QParams3d): QParams3d;
    /** Initialize from origin and scale */
    setFromOriginAndScale(origin: Point3d, scale: Point3d): void;
    /** Initialize these parameters to support quantization of values within the specified range. */
    setFromRange(range: Range3d, rangeScale?: number): void;
    /** Return the unquantized point for the input components.
     * @param out If supplied, it will be modified in-place and returned instead of allocating a new Point3d.
     */
    unquantize(x: number, y: number, z: number, out?: Point3d): Point3d;
    /** Creates parameters to support quantization of values within the specified range.
     * If `out` is supplied, it will be modified in-place and returned instead of allocating a new QParams3d.
     */
    static fromRange(range: Range3d, out?: QParams3d, rangeScale?: number): QParams3d;
    /** Creates parameters supporting quantization of values within the range [-1.0, 1.0].
     * If `out` is supplied, it will be modified in-place and returned instead of allocating a new QParams3d.
     */
    static fromOriginAndScale(origin: Point3d, scale: Point3d, out?: QParams3d): QParams3d;
    /** Creates parameters supporting quantization of values within the range [-1.0, 1.0]. */
    static fromNormalizedRange(rangeScale?: number): QParams3d;
    /** Creates parameters supporting quantization of values within the range [0.0, 1.0]. */
    static fromZeroToOne(rangeScale?: number): QParams3d;
    /** @internal */
    get rangeDiagonal(): Vector3d;
    /** Return true if the point point is quantizable using these parameters. */
    isQuantizable(point: Point3d): boolean;
    /** Compute the range to which these parameters quantize. */
    computeRange(out?: Range3d): Range3d;
    /** @alpha */
    toJSON(): QParams3dProps;
    /** @alpha */
    static fromJSON(src: QParams3dProps, out?: QParams3d): QParams3d;
}
/** Represents a [Point3d]($core-geometry) compressed such that each component `x`, `y`, and `z` is quantized to the 16-bit integer range [0, 0xffff].
 * These are primarily used to reduce the space required for coordinates used by [RenderGraphic]($frontend)s.
 * @see [[QParams3d]] to define quantization parameters for a range of points.
 * @see [[QPoint3dList]] for a list of points all quantized to the same range.
 * @public
 * @extensions
 */
export declare class QPoint3d {
    private _x;
    private _y;
    private _z;
    /** The quantized x component. */
    get x(): number;
    set x(x: number);
    /** The quantized y component. */
    get y(): number;
    set y(y: number);
    /** The quantized z component. */
    get z(): number;
    set z(z: number);
    /** Construct with all components initialized to zero. */
    constructor();
    /** Initialize this point by quantizing the supplied { x, y, z } using the specified params */
    init(pos: XYAndZ, params: QParams3d): void;
    /** Creates a quantized point from the supplied Point3d using the specified params */
    static create(pos: Point3d, params: QParams3d): QPoint3d;
    /** Set this points components from `src`. */
    copyFrom(src: QPoint3d): void;
    /** Create a copy of this point.
     * @param out If supplied, it will be modified in-place instead of allocating a new QPoint3d.
     */
    clone(out?: QPoint3d): QPoint3d;
    /**
     * Sets the x, y, and z components directly.
     * @param x Must be an integer in the range [0, 0xffff]
     * @param y Must be an integer in the range [0, 0xffff]
     * @param z Must be an integer in the range [0, 0xffff]
     */
    setFromScalars(x: number, y: number, z: number): void;
    /**
     * Creates a QPoint3d directly from x, y, and z components.
     * @param x Must be an integer in the range [0, 0xffff]
     * @param y Must be an integer in the range [0, 0xffff]
     * @param z Must be an integer in the range [0, 0xffff]
     * @param out If supplied, it will be modified in-place instead of allocating a new QPoint3d.
     */
    static fromScalars(x: number, y: number, z: number, out?: QPoint3d): QPoint3d;
    /** Returns a Point3d unquantized according to the supplied params.
     * If `out` is supplied, it will be modified in-place instead of allocating a new Point3d.
     */
    unquantize(params: QParams3d, out?: Point3d): Point3d;
    /** Return true if this point's components are identical to the other point's components. */
    equals(other: QPoint3d): boolean;
    /** Perform ordinal comparison to another point. The function returns:
     *  - Zero if this point is identical to `rhs`; or
     *  - A number less than zero if this point is ordered before `rhs`; or
     *  - A number greater than zero if this point is ordered after `rhs`.
     * @see [OrderedComparator]($core-bentley).
     */
    compare(rhs: QPoint3d): number;
}
/** A compact representation of a list of [[QPoint3d]]s stored in a `Uint16Array`.
 * This representation is particularly useful when passing data to WebGL; for example, see [RealityMeshParams.positions]($frontend).
 * @public
 * @extensions
 */
export interface QPoint3dBuffer {
    /** The parameters used to quantize the [[points]]. */
    params: QParams3d;
    /** The [[QPoint3d]]s as pairs of unsigned 16-bit integers. The length must be a multiple of 3; the number of points in the array is half the array's length.
     * To obtain the `n`th point, use `QPoint3d.fromScalars(buffer.points[n * 3], buffer.points[n * 3 + 1], buffer.points[n * 3 + 2])`.
     */
    points: Uint16Array;
}
/** @public
 * @extensions
 */
export declare namespace QPoint3dBuffer {
    /** Extracts the point at the specified index from a buffer.
     * @param points The buffer in which each consecutive pair of integers is a 3d quantized point.
     * @param pointIndex The index of the point to extract, ranging from zero to one less than the number of points in the buffer.
     * @param result If supplied, a preallocated [[QPoint3d]] to initialize with the result and return.
     * @returns The point at `pointIndex`.
     * @throws Error if `pointIndex` is out of bounds.
     */
    function getQPoint(points: Uint16Array, pointIndex: number, result?: QPoint3d): QPoint3d;
    /** Extracts and unquantizes the point at the specified index from a buffer.
     * @param buffer The array of points and the quantization parameters.
     * @param buffer The index of the point to extract, ranging from zero to one less than the number of points in the buffer.
     * @param result If supplied, a preallocated [Point3d]($core-geometry) to initialize with the result and return.
     * @returns The point at `pointIndex`.
     * @throws Error if `pointIndex` is out of bounds.
     */
    function unquantizePoint(buffer: QPoint3dBuffer, pointIndex: number, result?: Point3d): Point3d;
}
/** A list of [[QPoint3d]]s all quantized to the same range.
 * @public
 * @extensions
 */
export declare class QPoint3dList {
    /** Parameters used to quantize the points. */
    readonly params: QParams3d;
    private readonly _list;
    /** The list of quantized points. */
    get list(): readonly QPoint3d[];
    /** Construct an empty list set up to quantize to the supplied range.
     * @param params The quantization parameters. If omitted, a null range will be used.
     */
    constructor(params?: QParams3d);
    /** Construct a QPoint3dList containing all points in the supplied list, quantized to the range of those points.
     * @param points The points to quantize and add to the list.
     * @param out If supplied, it will be cleared, its parameters recomputed, and the points will be added to it; otherwise, a new QPoint3dList will be created and returned.
     */
    static fromPoints(points: Point3d[], out?: QPoint3dList): QPoint3dList;
    /** Removes all points from the list. */
    clear(): void;
    /** Clears out the contents of the list and changes the quantization parameters. */
    reset(params: QParams3d): void;
    /** Quantizes the supplied Point3d to this list's range and appends it to the list. */
    add(pt: Point3d): void;
    /** Adds a previously-quantized point to this list. */
    push(qpt: QPoint3d): void;
    /** The number of points in the list. */
    get length(): number;
    /** Returns the unquantized value of the point at the specified index in the list. */
    unquantize(index: number, out?: Point3d): Point3d;
    /** Changes the quantization parameters and requantizes all points in the list to the new range.
     * @note The loss of precision is compounded each time the points are requantized to a new range.
     */
    requantize(params: QParams3d): void;
    /** Extracts the current contents of the list as a Uint16Array such that the first 3 elements contain the first point's x, y, and z components,
     * the second three elements contain the second point's components, and so on.
     */
    toTypedArray(): Uint16Array;
    /** Reinitialize from a Uint16Array in which the first three elements specify the x, y, and z components of the first point, the second three elements specify the components
     * of the second point, and so on.
     */
    fromTypedArray(range: Range3d, array: Uint16Array): void;
    /** Construct a list containing all points in the supplied list, quantized using the supplied parameters. */
    static createFrom(points: Point3d[], params: QParams3d): QPoint3dList;
    /** An iterator over the points in the list. */
    [Symbol.iterator](): ArrayIterator<QPoint3d>;
}
/** Options used to construct a [[QPoint2dBufferBuilder]].
 * @beta
 * @extensions
 */
interface QPoint2dBufferBuilderOptions {
    /** The range to which the points will be quantized. This must be large enough to contain all of the points that will be added to the buffer. */
    range: Range2d;
    /** The number of points for which to allocate space.
     * @see [TypedArrayBuilderOptions.initialCapacity]($bentley).
     */
    initialCapacity?: number;
    /** Multiplier used to compute new capacity when resizing the buffer.
     * @see [TypedArrayBuilderOptions.growthFactor]($bentley).
     */
    growthFactor?: number;
}
/** Constructs a [[QPoint2dBuffer]] using a [Uint16ArrayBuilder]($bentley).
 * @public
 * @extensions
 */
export declare class QPoint2dBufferBuilder {
    private readonly _scratchQPoint2d;
    /** The parameters used to quantize the points in the [[buffer]]. */
    readonly params: QParams2d;
    /** The buffer that holds the points. */
    readonly buffer: Uint16ArrayBuilder;
    /** Construct a new buffer with a [[length]] of zero. */
    constructor(options: QPoint2dBufferBuilderOptions);
    /** Append a point with the specified quantized coordinates. */
    pushXY(x: number, y: number): void;
    /** Append a point with the specified quantized coordinates. */
    push(pt: XAndY): void;
    /** The number of points currently in the [[buffer]]. */
    get length(): number;
    /** Returns the quantized point at the specified index in [[buffer]].
     * @param pointIndex The index of the point of interest, ranging from zero to one minus the number of points currently in the [[buffer]].
     * @param result If supplied, a [[QPoint2d]] to initialize with the result and return.
     * @returns The quantized point at the specified index in [[buffer]].
     * @throws Error if `pointIndex` is out of bounds.
     */
    get(pointIndex: number, result?: QPoint2d): QPoint2d;
    /** Returns the unquantized point at the specified index in [[buffer]].
     * @param pointIndex The index of the point of interest, ranging from zero to one minus the number of points currently in the [[buffer]].
     * @param result If supplied, a [Point2d]($core-geometry) to initialize with the result and return.
     * @returns The unquantized point at the specified index in [[buffer]].
     * @throws Error if `pointIndex` is out of bounds.
     */
    unquantize(pointIndex: number, result?: Point2d): Point2d;
    /** Obtain a [[QPoint2dBuffer]] containing all of the points that have been appended by this builder. */
    finish(): QPoint2dBuffer;
}
/** Options used to construct a [[QPoint3dBufferBuilder]].
 * @beta
 * @extensions
 */
interface QPoint3dBufferBuilderOptions {
    /** The range to which the points will be quantized. This must be large enough to contain all of the points that will be added to the buffer. */
    range: Range3d;
    /** The number of points for which to allocate space.
     * @see [TypedArrayBuilderOptions.initialCapacity]($bentley).
     */
    initialCapacity?: number;
    /** Multiplier used to compute new capacity when resizing the buffer.
     * @see [TypedArrayBuilderOptions.growthFactor]($bentley).
     */
    growthFactor?: number;
}
/** Constructs a [[QPoint3dBuffer]] using a [Uint16ArrayBuilder]($bentley).
 * @public
 * @extensions
 */
export declare class QPoint3dBufferBuilder {
    private readonly _scratchQPoint3d;
    /** The parameters used to quantize the points in the [[buffer]]. */
    readonly params: QParams3d;
    /** The buffer that holds the points. */
    readonly buffer: Uint16ArrayBuilder;
    /** Construct a new buffer with a [[length]] of zero. */
    constructor(options: QPoint3dBufferBuilderOptions);
    /** Append a point with the specified quantized coordinates. */
    pushXYZ(x: number, y: number, z: number): void;
    /** Append a point with the specified quantized coordinates. */
    push(pt: XYAndZ): void;
    /** The number of points currently in the [[buffer]]. */
    get length(): number;
    /** Returns the quantized point at the specified index in [[buffer]].
     * @param pointIndex The index of the point of interest, ranging from zero to one minus the number of points currently in the [[buffer]].
     * @param result If supplied, a [[QPoint3d]] to initialize with the result and return.
     * @returns The quantized point at the specified index in [[buffer]].
     * @throws Error if `pointIndex` is out of bounds.
     */
    get(pointIndex: number, result?: QPoint3d): QPoint3d;
    /** Returns the unquantized point at the specified index in [[buffer]].
     * @param pointIndex The index of the point of interest, ranging from zero to one minus the number of points currently in the [[buffer]].
     * @param result If supplied, a [Point3d]($core-geometry) to initialize with the result and return.
     * @returns The unquantized point at the specified index in [[buffer]].
     * @throws Error if `pointIndex` is out of bounds.
     */
    unquantize(pointIndex: number, result?: Point3d): Point3d;
    /** Obtain a [[QPoint3dBuffer]] containing all of the points that have been appended by this builder. */
    finish(): QPoint3dBuffer;
}
export {};
