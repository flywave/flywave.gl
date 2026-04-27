import { type Range1dProps, type XYZProps, Point3d, Range1d, Vector3d } from "../core-geometry";
import { type ColorDefProps, ColorDef } from "./color-def";
import { Gradient } from "./gradient";
/** A thematic gradient mode used to generate and apply a thematic effect to a scene.
 * @see [[ThematicGradientSettings.mode]]
 * @public
 * @extensions
 */
export declare enum ThematicGradientMode {
    /** Apply a smooth color gradient to the scene. */
    Smooth = 0,
    /** Apply a stepped color gradient to the scene. */
    Stepped = 1,
    /** Apply a stepped color gradient to the scene with delimiters (lines between the color steps). Can only be used with [[ThematicDisplayMode.Height]]. */
    SteppedWithDelimiter = 2,
    /** Apply isolines to the scene to achieve an effect similar to a contour map. Can only be used with [[ThematicDisplayMode.Height]]. */
    IsoLines = 3
}
/** A color scheme used to generate the colors of a thematic gradient within an applied range.
 * @see [[ThematicGradientSettings.colorScheme]]
 * @see [[ThematicDisplay.range]]
 * @public
 * @extensions
 */
export declare enum ThematicGradientColorScheme {
    /** A color gradient scheme that represents a blue-to-red gradation. */
    BlueRed = 0,
    /** A color gradient scheme that represents a red-to-blue gradation. */
    RedBlue = 1,
    /** A color gradient scheme that represents a monochrome (black-to-white) gradation. */
    Monochrome = 2,
    /** A color gradient scheme that suits a topographic gradation. */
    Topographic = 3,
    /** A color gradient scheme that suits a sea-mountain gradation. */
    SeaMountain = 4,
    /** A custom color gradient scheme configured by the user.
     * @see [[ThematicGradientSettings.customKeys]]
     */
    Custom = 5
}
/** JSON representation of a [[ThematicGradientSettings]].
 * @public
 * @extensions
 **/
export interface ThematicGradientSettingsProps {
    /** See [[ThematicGradientSettings.mode]]. */
    mode?: ThematicGradientMode;
    /** See [[ThematicGradientSettings.stepCount]]. */
    stepCount?: number;
    /** See [[ThematicGradientSettings.marginColor]]. */
    marginColor?: ColorDefProps;
    /** See [[ThematicGradientSettings.colorScheme]]. */
    colorScheme?: ThematicGradientColorScheme;
    /** See [[ThematicGradientSettings.customKeys. */
    customKeys?: Gradient.KeyColorProps[];
    /** See [[ThematicGradientSettings.colorMix]]. */
    colorMix?: number;
}
/** Thematic settings specific to creating a color gradient used by [[ThematicDisplay]].
 * @public
 */
export declare class ThematicGradientSettings {
    /** The thematic image mode used to generate the gradient. Defaults to [[ThematicGradientMode.Smooth]]. */
    readonly mode: ThematicGradientMode;
    /** The step count value used for [[ThematicGradientMode.Stepped]], [[ThematicGradientMode.SteppedWithDelimiter]], and [[ThematicGradientMode.IsoLines]]. Defaults to 10. Cannot be less than 2. */
    readonly stepCount: number;
    /** The margin color used at the extremes of the gradient, when outside the applied range. Defaults to a black color using [[ColorDef.fromJSON]] with no arguments. */
    readonly marginColor: ColorDef;
    /** The color scheme used to generate the colors of the gradient color within the applied range. Defaults to [[ThematicGradientColorScheme.BlueRed]]. */
    readonly colorScheme: ThematicGradientColorScheme;
    /** The key color values that must be provided when using a custom thematic color scheme.
     * Defaults to empty, unless using a custom thematic color scheme. In that case, this defaults to two key colors going from white to black.
     * When using a custom thematic color scheme, there must be at least two entries in here. If there are not, it will revert to the default settings.
     */
    readonly customKeys: Gradient.KeyColor[];
    /** The percentage to mix in the original color with the thematic display gradient color (0-1).
     * Applies to background map terrain and point clouds only.  Defaults to 0. */
    readonly colorMix: number;
    static get margin(): number;
    static get contentRange(): number;
    static get contentMax(): number;
    static readonly defaults: ThematicGradientSettings;
    private static readonly _defaultCustomKeys;
    equals(other: ThematicGradientSettings): boolean;
    /** Compares two sets of thematic gradient settings.
     * @param lhs First set of thematic gradient settings to compare
     * @param rhs Second set of thematic gradient settings to compare
     * @returns 0 if lhs is equivalent to rhs, a negative number if lhs compares less than rhs, or a positive number if lhs compares greater than rhs.
     */
    static compare(lhs: ThematicGradientSettings, rhs: ThematicGradientSettings): number;
    private constructor();
    static fromJSON(json?: ThematicGradientSettingsProps): ThematicGradientSettings;
    toJSON(): ThematicGradientSettingsProps;
    /** Create a copy of this ThematicGradientSettings, optionally modifying some of its properties.
     * @param changedProps JSON representation of the properties to change.
     * @returns A ThematicGradientSettings with all of its properties set to match those of `this`, except those explicitly defined in `changedProps`.
     */
    clone(changedProps?: ThematicGradientSettingsProps): ThematicGradientSettings;
}
/** JSON representation of a [[ThematicDisplaySensor]].
 * @public
 * @extensions
 */
export interface ThematicDisplaySensorProps {
    /** The world position of the sensor in X, Y, and Z. Defaults to {0,0,0}. */
    position?: XYZProps;
    /** The value of the sensor used when accessing the thematic gradient texture; expected range is 0 to 1. Defaults to 0. */
    value?: number;
}
/** A sensor in world space, used for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 */
export declare class ThematicDisplaySensor {
    /** The world position of the sensor in X, Y, and Z. Defaults to {0,0,0}. */
    position: Readonly<Point3d>;
    /** The value of the sensor used when accessing the thematic gradient texture; expected range is 0 to 1. Defaults to 0. */
    readonly value: number;
    private constructor();
    equals(other: ThematicDisplaySensor): boolean;
    static fromJSON(json?: ThematicDisplaySensorProps): ThematicDisplaySensor;
    toJSON(): ThematicDisplaySensorProps;
}
/** JSON representation of a [[ThematicDisplaySensorSettings]] for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 * @extensions
 */
export interface ThematicDisplaySensorSettingsProps {
    /** This is the list of sensors. Defaults to an empty array. */
    sensors?: ThematicDisplaySensorProps[];
    /** This is the distance cutoff in meters. For a position on screen to be affected by a sensor, it must be at least this close to the sensor.
     * If this is zero or negative, then no distance cutoff is applied (all sensors affect all positions regardless of nearness).
     * Defaults to zero.
     * @note Using a suitable distance cutoff imparts a significant performance benefit. The larger this value becomes, performance will degrade.
     */
    distanceCutoff?: number;
}
/** Settings for sensor-based thematic display for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 */
export declare class ThematicDisplaySensorSettings {
    /** This is the list of sensors. Defaults to an empty array. */
    readonly sensors: ThematicDisplaySensor[];
    /** This is the distance cutoff in meters. For a position on screen to be affected by a sensor, it must be at least this close to the sensor.
     * If this is zero or negative, then no distance cutoff is applied (all sensors affect all positions regardless of nearness).
     * Defaults to zero.
     * @note Using a suitable distance cutoff imparts a significant performance benefit. The larger this value becomes, performance will degrade.
     */
    readonly distanceCutoff: number;
    private constructor();
    equals(other: ThematicDisplaySensorSettings): boolean;
    static fromJSON(json?: ThematicDisplaySensorSettingsProps): ThematicDisplaySensorSettings;
    toJSON(): ThematicDisplaySensorSettingsProps;
}
/** The thematic display mode. This determines how to apply the thematic color gradient to the geometry.
 * @public
 * @extensions
 */
export declare enum ThematicDisplayMode {
    /** The color gradient will be mapped to surface geometry and point clouds based on world height in meters. */
    Height = 0,
    /** The color gradient will be mapped to surface geometry and point clouds using inverse distance weighting based on world positions and corresponding values from a list of sensors.
     * @note Performance will decrease as more sensors are added.
     */
    InverseDistanceWeightedSensors = 1,
    /** The color gradient will be mapped to surface geometry based on the slope of the surface. The slope value is calculated based on the angle between the surface and the axis specified in the associated [[ThematicDisplay]] object.
     * @note This display mode does not affect point clouds.
     */
    Slope = 2,
    /** The color gradient will be mapped to surface geometry based on the direction of a sun shining on the surface.
     * @note This display mode does not affect point clouds.
     */
    HillShade = 3
}
/** JSON representation of the thematic display setup of a [[DisplayStyle3d]].
 * @public
 * @extensions
 */
export interface ThematicDisplayProps {
    /** The thematic display mode. This determines how to apply the thematic color gradient to the geometry. Defaults to [[ThematicDisplayMode.Height]]. */
    displayMode?: ThematicDisplayMode;
    /** The settings used to create a color gradient applied to the geometry. Defaults to an instantiation using [[ThematicGradientSettings.fromJSON]] with no arguments. */
    gradientSettings?: ThematicGradientSettingsProps;
    /** The range to use when applying the thematic gradient for height and slope mode.
     * For [[ThematicDisplayMode.Height]], this is world space in meters and represents the range in which to apply the gradient along the specified axis.
     * For [[ThematicDisplayMode.Slope]], this is a range in degrees with a minimum low value of 0 degrees and a maximum high value of 90 degrees.
     * Defaults to a null range.
     */
    range?: Range1dProps;
    /** For [[ThematicDisplayMode.Height]], this is the axis along which to apply the thematic gradient in the scene. For [[ThematicDisplayMode.Slope]], calculating the slope of a surface is done in relation to the axis. Defaults to {0,0,0}. */
    axis?: XYZProps;
    /** For [[ThematicDisplayMode.HillShade]], this is the direction of the sun in world space. Defaults to {0,0,0}. */
    sunDirection?: XYZProps;
    /** For [[ThematicDisplayMode.InverseDistanceWeightedSensors]], these are the settings that control the sensors. Defaults to an instantiation using [[ThematicDisplaySensorSettings.fromJSON]] with no arguments.
     * @public
     */
    sensorSettings?: ThematicDisplaySensorSettingsProps;
}
/** The thematic display setup of a [[DisplayStyle3d]].
 * Thematic display allows a user to colorize a scene using a color gradient in a way that provides a visual cue about certain attributes of the rendered geometry. This scene colorization will be done based on certain geometric attributes like height, surface slope, position of surfaces relative to a sun position, or geometric position relative to a list of sensors.
 * The documentation for [[ThematicDisplayMode]] describes how each mode colorizes the scene.
 * @note Applying thematic display to geometry prevents shadows from applying to the same geometry.
 * @public
 */
export declare class ThematicDisplay {
    /** The thematic display mode. This determines how to apply the thematic color gradient to the geometry. Defaults to [[ThematicDisplayMode.Height]]. */
    readonly displayMode: ThematicDisplayMode;
    /** The settings used to create a color gradient applied to the geometry. Defaults to an instantiation using [[ThematicGradientSettings.fromJSON]] with no arguments. */
    readonly gradientSettings: ThematicGradientSettings;
    /** The range to use when applying the thematic gradient for height and slope mode.
     * For [[ThematicDisplayMode.Height]], this is world space in meters and represents the range in which to apply the gradient along the specified axis.
     * For [[ThematicDisplayMode.Slope]], this is a range in radians with a minimum low value of 0 degrees and a maximum high value of 90 degrees.
     * Defaults to a null range.
     */
    readonly range: Range1d;
    /** For [[ThematicDisplayMode.Height]], this is the axis along which to apply the thematic gradient in the scene. For [[ThematicDisplayMode.Slope]], the slope of a surface is calculated in relation to this axis. Defaults to {0,0,0}. */
    readonly axis: Vector3d;
    /** For [[ThematicDisplayMode.HillShade]], this is the direction of the sun in world space. Defaults to {0,0,0}. */
    readonly sunDirection: Vector3d;
    /** For [[ThematicDisplayMode.InverseDistanceWeightedSensors]], these are the settings that control the sensors. Defaults to an instantiation using [[ThematicDisplaySensorSettings.fromJSON]] with no arguments.
     * @public
     */
    readonly sensorSettings: ThematicDisplaySensorSettings;
    equals(other: ThematicDisplay): boolean;
    private constructor();
    static fromJSON(json?: ThematicDisplayProps): ThematicDisplay;
    toJSON(): ThematicDisplayProps;
}
