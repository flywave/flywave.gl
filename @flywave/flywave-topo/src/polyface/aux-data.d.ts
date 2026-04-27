import { Range1d, Range3d } from "../geometry3d/range";
import { type Transform } from "../geometry3d/transform";
/** The types of data that can be represented by an [[AuxChannelData]]. Each type of data contributes differently to the
 * animation applied by an [AnalysisStyle]($common) and responds differently when the host [[PolyfaceAuxData]] is transformed.
 * @public
 */
export declare enum AuxChannelDataType {
    /** General-purpose scalar values like stress, temperature, etc., used to recolor the [[Polyface]]'s vertices.
     * When the host Polyface is transformed, scalar values remain unmodified.
     */
    Scalar = 0,
    /** Distances in meters used to recolor the [[Polyface]]'s vertices.
     * When the host [[Polyface]] is transformed the [[Transform]]'s scale is applied to the distances.
     */
    Distance = 1,
    /** (X, Y, Z) displacement vectors added to the [[Polyface]]'s vertex positions resulting in deformation of the mesh.
     * When the host Polyface is transformed the displacements are rotated and scaled accordingly.
     */
    Vector = 2,
    /** (X, Y, Z) normal vectors that replace the host [[Polyface]]'s own normals.
     * When the Polyface is transformed the normals are rotated accordingly.
     */
    Normal = 3
}
/**  Represents the [[AuxChannel]] data at a single input value.
 * @public
 */
export declare class AuxChannelData {
    /** The input value for this data. */
    input: number;
    /** The vertex values for this data. A single value per vertex for scalar and distance types and 3 values (x,y,z) for normal or vector channels. */
    values: number[];
    /** Construct a new [[AuxChannelData]] from input value and vertex values. */
    constructor(input: number, values: number[] | Float64Array);
    /** Copy blocks of size `blockSize` from (blocked index) `thisIndex` in this AuxChannelData to (blockIndex) `otherIndex` of `other` */
    copyValues(other: AuxChannelData, thisIndex: number, otherIndex: number, blockSize: number): void;
    /** return a deep copy */
    clone(): AuxChannelData;
    /** toleranced comparison of the `input` and `value` fields.
     * * Default tolerance is 1.0e-8
     */
    isAlmostEqual(other: AuxChannelData, tol?: number): boolean;
}
/**  Represents a single [[PolyfaceAuxData]] channel.
 * @public
 */
export declare class AuxChannel {
    /** An array of [[AuxChannelData]] that represents the vertex data at one or more input values. */
    data: AuxChannelData[];
    /** The type of data stored in this channel. */
    dataType: AuxChannelDataType;
    /** The channel name. This is used to present the [[AuxChannel]] to the user and also to select the [[AuxChannel]] for display from AnalysisStyle */
    name?: string;
    /** The input name. */
    inputName?: string;
    /** Create a [[AuxChannel]] */
    constructor(data: AuxChannelData[], dataType: AuxChannelDataType, name?: string, inputName?: string);
    /** Return a deep copy. */
    clone(): AuxChannel;
    /** Toleranced comparison of contents. */
    isAlmostEqual(other: AuxChannel, tol?: number): boolean;
    /** True if [[entriesPerValue]] is `1`. */
    get isScalar(): boolean;
    /** The number of values in `data.values` per entry - 1 for scalar and distance types, 3 for normal and vector types. */
    get entriesPerValue(): number;
    /** The number of entries in `data.values`. */
    get valueCount(): number;
    /** The minimum and maximum values in `data.values`, or `undefined` if [[isScalar]] is false. */
    get scalarRange(): Range1d | undefined;
    /** Compute the range of this channel's displacement values, if [[dataType]] is [[AuxChannelDataType.Vector]].
     * @param scale Scale by which to multiply each displacement.
     * @param result Preallocated object in which to store result.
     * @returns The range encompassing all this channel's displacements scaled by `scale`; or a null range if this channel does not contain displacements.
     */
    computeDisplacementRange(scale?: number, result?: Range3d): Range3d;
}
/**  The `PolyfaceAuxData` structure contains one or more analytical data channels for each vertex of a [[Polyface]], allowing the polyface to be styled
 * using an [AnalysisStyle]($common).
 * Typically a polyface will contain only vertex data required for its basic display: the vertex position, normal
 * and possibly texture parameter. `PolyfaceAuxData` provides supplemental data that is generally computed
 * in an analysis program or other external data source. This can be scalar data used to either override the vertex colors through, or
 * XYZ data used to deform the mesh by adjusting the vertex positions and/or normals.
 * @see [[PolyfaceData.auxData]] to associate auxiliary data with a polyface.
 * @public
 */
export declare class PolyfaceAuxData {
    /** Array with one or more channels of auxiliary data for the associated polyface. */
    channels: AuxChannel[];
    /** The indices (shared by all data in all channels) mapping the data to the mesh facets. */
    indices: number[];
    constructor(channels: AuxChannel[], indices: number[]);
    /** Return a deep copy. */
    clone(): PolyfaceAuxData;
    /** Returns true if `this` is equivalent to `other` within `tolerance`.
     * The indices are compared for exact equality. The data in the channels are compared using `tolerance`, which defaults to 1.0e-8.
     */
    isAlmostEqual(other: PolyfaceAuxData, tolerance?: number): boolean;
    /** Returns true if both `left` and `right` are undefined, or both are defined and equivalent within `tolerance` (default: 1.0e-8). */
    static isAlmostEqual(left: PolyfaceAuxData | undefined, right: PolyfaceAuxData | undefined, tol?: number): boolean;
    /** Create a PolyfaceAuxData for use by a [[PolyfaceVisitor]].  */
    createForVisitor(): PolyfaceAuxData;
    /** Apply `transform` to the data in each channel.
     * @see [[AuxChannelDataType]] for details regarding how each data type is affected by the transform.
     * @note This method may fail if a channel of [[AuxChannelDataType.Normal]] exists and `transform.matrix` is non-invertible.
     * @returns true if the channels were all successfully transformed.
     */
    tryTransformInPlace(transform: Transform): boolean;
}
