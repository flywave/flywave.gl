import { type Range1dProps, Range1d } from "../core-geometry";
import { Gradient } from "./gradient";
import { type ThematicGradientSettingsProps, ThematicGradientSettings } from "./thematic-display";
/** JSON representation of an [[AnalysisStyleDisplacement]].
 * @see [[AnalysisStyleProps.displacement]].
 * @public
 * @extensions
 */
export interface AnalysisStyleDisplacementProps {
    /** See [[AnalysisStyleDisplacement.channelName]]. */
    channelName: string;
    /** See [[AnalysisStyleDisplacement.scale]].
     * Default value: 1.
     */
    scale?: number;
}
/** Describes how an [[AnalysisStyle]] deforms a [Polyface]($core-geometry) by applying translation to its vertices.
 * @see [[AnalysisStyle.displacement]].
 * @public
 */
export declare class AnalysisStyleDisplacement {
    /** The name of the [AuxChannel]($core-geometry) supplying the displacements to be applied to the vertices. */
    readonly channelName: string;
    /** A scale applied to the displacements to adjust the magnitude of the effect.
     * Default value: 1.
     */
    readonly scale: number;
    /** @internal */
    private constructor();
    /** Create from JSON representation. */
    static fromJSON(props: AnalysisStyleDisplacementProps): AnalysisStyleDisplacement;
    /** Convert to JSON representation. */
    toJSON(): AnalysisStyleDisplacementProps;
    /** Return true if `this` is equivalent to `other`. */
    equals(other: AnalysisStyleDisplacement): boolean;
}
/** JSON representation of an [[AnalysisStyleThematic]].
 * @see [[AnalysisStyleProps.scalar]].
 * @public
 * @extensions
 */
export interface AnalysisStyleThematicProps {
    /** See [[AnalysisStyleThematic.channelName]]. */
    channelName: string;
    /** See [[AnalysisStyleThematic.range]]. */
    range: Range1dProps;
    /** See [[AnalysisStyleThematic.thematicSettings]].
     * Default value: [[ThematicGradientSettings.defaults]].
     */
    thematicSettings?: ThematicGradientSettingsProps;
}
/** Describes how an [[AnalysisStyle]] recolors [Polyface]($core-geometry) vertices by mapping values of type
 * [AuxChannelDataType.Scalar]($core-geometry) or [AuxChannelDataType.Distance]($core-geometry) supplied
 * by an [AuxChannel]($core-geometry) to colors supplied by a [[Gradient]] image.
 * @see [[AnalysisStyle.thematic]].
 * @public
 */
export declare class AnalysisStyleThematic {
    /** The name of the [AuxChannel]($core-geometry) supplying the values from which the vertex colors are computed. */
    readonly channelName: string;
    /** The minimum and maximum values that map to colors in the [[Gradient]] image. Vertices with values outside of
     * this range are displayed with the gradient's margin color.
     */
    readonly range: Readonly<Range1d>;
    /** Settings used to produce the [[Gradient]] image. */
    readonly thematicSettings: ThematicGradientSettings;
    private _gradient?;
    /** @internal */
    private constructor();
    /** Create from JSON representation. */
    static fromJSON(props: AnalysisStyleThematicProps): AnalysisStyleThematic;
    /** Convert to JSON representation. */
    toJSON(): AnalysisStyleThematicProps;
    /** The gradient computed from [[thematicSettings]]. */
    get gradient(): Gradient.Symb;
    /** Return true if `this` is equivalent to `other`. */
    equals(other: AnalysisStyleThematic): boolean;
}
/** JSON representation of an [[AnalysisStyle]].
 * @public
 * @extensions
 */
export interface AnalysisStyleProps {
    /** See [[AnalysisStyle.displacement]]. */
    displacement?: AnalysisStyleDisplacementProps;
    /** JSON representation of [[AnalysisStyle.thematic]].
     * @note The name "scalar" is used instead of "thematic" for backwards compatibility.
     */
    scalar?: AnalysisStyleThematicProps;
    /** See [[AnalysisStyle.normalChannelName]]. */
    normalChannelName?: string;
}
/** At time of writing, the only iModel in existence that uses AnalysisStyle is the one created by the analysis-importer test app.
 * To avoid breaking existing saved views of that iModel, AnalysisStyle.fromJSON() continues  to accept the old JSON representation -
 * but that representation is not part of the public API.
 * @internal exported strictly for tests.
 */
export interface LegacyAnalysisStyleProps {
    displacementChannelName?: string;
    scalarChannelName?: string;
    normalChannelName?: string;
    displacementScale?: number;
    scalarRange?: Range1dProps;
    scalarThematicSettings?: ThematicGradientSettingsProps;
}
/** As part of a [[DisplayStyleSettings]], describes how to animate meshes in the view that have been augmented with
 * [PolyfaceAuxData]($core-geometry). The style specifies which channels to use, and can deform the meshes by
 * translating vertices and/or recolor vertices using [[ThematicDisplay]].
 * @see [[DisplayStyleSettings.analysisStyle]] to define the analysis style for a [DisplayStyle]($backend).
 * @see [[DisplayStyleSettings.analysisFraction]] to control playback of the animation.
 * @public
 */
export declare class AnalysisStyle {
    readonly displacement?: AnalysisStyleDisplacement;
    readonly thematic?: AnalysisStyleThematic;
    /** If defined, the name of the [AuxChannel]($core-geometry) from which to obtain normal vectors for the vertices. */
    readonly normalChannelName?: string;
    /** Create an analysis style from its JSON representation.
     * @note AnalysisStyle is an immutable type - use [[clone]] to produce a modified copy.
     */
    static fromJSON(props?: AnalysisStyleProps): AnalysisStyle;
    /** @internal */
    private constructor();
    /** Convert this style to its JSON representation. */
    toJSON(): AnalysisStyleProps;
    /** Produce a copy of this style identical except for properties explicitly specified by `changedProps`. */
    clone(changedProps: AnalysisStyleProps): AnalysisStyle;
    /** Return true if this style is equivalent to `other`. */
    equals(other: AnalysisStyle): boolean;
    static readonly defaults: AnalysisStyle;
}
