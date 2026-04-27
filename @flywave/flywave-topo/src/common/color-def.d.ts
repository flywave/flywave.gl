import { HSLColor } from "./hsl-color";
import { HSVColor } from "./hsv-color";
/** The JSON representation of a [[ColorDef]] - an unsigned 32-bit integer in 0xTTBBGGRR format.
 * @public
 * @extensions
 */
export type ColorDefProps = number;
/** An immutable integer representation of a color.
 *
 * A color consists of 4 components: Red, Blue, Green, and Transparency. Each component is an 8-bit unsigned integer in the range [0..255]. A value of zero means that component contributes nothing
 * to the color: e.g., a color with Red=0 contains no shade of red, and a color with Transparency=0 is fully opaque. A value of 255 means that component contributes its maximum
 * value to the color: e.g., a color with Red=255 is as red as it is possible to be, and a color with Transparency=255 is fully transparent.
 *
 * Internally, these 4 components are combined into a single 32-bit unsigned integer as represented by [[ColorDefProps]]. This representation can result in some confusion regarding:
 *  1. The ordering of the individual components; and
 *  2. Whether to specify transparency or opacity (sometimes referred to as "alpha").
 *
 * ColorDef uses `0xTTBBGGRR` internally, which uses Transparency and puts Red in the low byte and Transparency in the high byte. It can be converted to `0xRRGGBB` format (blue in the low byte)
 * using [[getRgb]] and `0xAABBGGRRx format (red in the low byte, using opacity instead of transparency) using [[getAbgr]].
 *
 * A ColorDef can be created from a numeric [[ColorDefProps]], from a string in one of the common HTML formats (e.g., [[fromString]]), or by specifying values for the individual components
 * (e.g., [[from]]).
 *
 * ColorDef is **immutable**. To obtain a modified copy of a ColorDef, use methods like [[adjustedForContrast]], [[inverse]], or [[withTransparency]]. For example:
 * ```ts
 *  const semiTransparentBlue = ColorDef.blue.withTransparency(100);
 * ```
 * @public
 * @extensions
 */
export declare class ColorDef {
    private readonly _tbgr;
    private constructor();
    /**
     * Create a new ColorDef.
     * @param val value to use.
     * If a number, it is interpreted as a 0xTTBBGGRR (Red in the low byte, high byte is transparency 0==fully opaque) value.
     * If a string, it must be in one of the forms supported by [[fromString]] - any unrecognized string will produce [[black]].
     */
    static create(val?: string | ColorDefProps): ColorDef;
    /** Compute the 0xTTBBGGRR value corresponding to the specified representation of a color.
     * @see [[fromString]] for a description of valid string representations.
     */
    static computeTbgr(val?: string | ColorDefProps): ColorDefProps;
    /** Convert this ColorDef to a 32 bit number representing the 0xTTBBGGRR value */
    toJSON(): ColorDefProps;
    /** Create a new ColorDef from a json object. If the json object is a number, it is assumed to be a 0xTTBBGGRR value. */
    static fromJSON(json?: ColorDefProps): ColorDef;
    /** Create a ColorDef from Red, Green, Blue, Transparency values. All inputs should be integers between 0-255. */
    static from(red: number, green: number, blue: number, transparency?: number): ColorDef;
    /** Compute the 0xTTBBGGRR value corresponding to the specified Red, Green, Blue, Transparency components. All inputs should be integers between 0-255. */
    static computeTbgrFromComponents(red: number, green: number, blue: number, transparency?: number): ColorDefProps;
    /** Create a ColorDef from its 0xTTBBGGRR representation. */
    static fromTbgr(tbgr: ColorDefProps): ColorDef;
    /** Create a ColorDef from its 0xAABBGGRR representation. */
    static fromAbgr(abgr: number): ColorDef;
    /** Create a ColorDef from a string representation. The following representations are supported:
     * *"rgb(255,0,0)"*
     * *"rgba(255,0,0,.2)"*
     * *"rgb(100%,0%,0%)"*
     * *"hsl(120,50%,50%)"*
     * *"#rrbbgg"*
     * *"blanchedAlmond"* (see possible values from [[ColorByName]]). Case-insensitive.
     *
     * If `val` is not a valid color string, this function returns [[black]].
     * @see [[isValidColor]] to determine if `val` is a valid color string.
     */
    static fromString(val: string): ColorDef;
    /** Determine whether the input is a valid representation of a ColorDef.
     * @see [[fromString]] for the definition of a valid string representation.
     * @see [[ColorDefProps]] for the definition of a valid numeric representation.
     */
    static isValidColor(val: string | number): boolean;
    /** Compute the 0xTTBBGGRR value corresponding to a string representation of a color.
     * If `val` is not a valid color string, this function returns 0 (black).
     * @see [[fromString]] for the definition of a valid color string.
     * @see [[tryComputeTbgrFromString]] to determine if `val` is a valid color string.
     */
    static computeTbgrFromString(val: string): ColorDefProps;
    /** Try to compute the 0xTTBBGGRR value corresponding to a string representation of a ColorDef.
     * @returns the corresponding numeric representation, or `undefined` if the input does not represent a color.
     * @see [[fromString]] for the definition of a valid color string.
     */
    static tryComputeTbgrFromString(val: string): ColorDefProps | undefined;
    /** Get the red, green, blue, and transparency values from this ColorDef. Values will be integers between 0-255. */
    get colors(): {
        r: number;
        g: number;
        b: number;
        t: number;
    };
    /** Get the r,g,b,t values encoded in an 0xTTBBGGRR value. Values will be integers between 0-255. */
    static getColors(tbgr: ColorDefProps): {
        b: number;
        g: number;
        r: number;
        t: number;
    };
    /** The color value of this ColorDef as an integer in the form 0xTTBBGGRR (red in the low byte) */
    get tbgr(): ColorDefProps;
    /** Get the value of the color as a number in 0xAABBGGRR format (i.e. red is in low byte). Transparency (0==fully opaque) converted to alpha (0==fully transparent).  */
    getAbgr(): number;
    /** Get the value of a 0xTTBBGGRR color as a number in 0xAABBGGRR format (i.e. red is in low byte). Transparency (0==fully opaque) converted to alpha (0==fully transparent).  */
    static getAbgr(tbgr: ColorDefProps): number;
    /** Get the RGB value of the color as a number in 0xRRGGBB format (i.e blue is in the low byte). Transparency is ignored. Value will be from 0 to 2^24 */
    getRgb(): number;
    /** Get the RGB value of the 0xTTBBGGRR color as a number in 0xRRGGBB format (i.e blue is in the low byte). Transparency is ignored. Value will be from 0 to 2^24 */
    static getRgb(tbgr: ColorDefProps): number;
    /** Return a copy of this ColorDef with the specified alpha component.
     * @param alpha the new alpha value as an integer between 0-255.
     * @returns A ColorDef with equivalent red, green, and blue components to this one but with the specified alpha.
     */
    withAlpha(alpha: number): ColorDef;
    /** Return a color equivalent to the specified 0xTTBBGGRR but with modified alpha component.
     * @param alpha the new alpha value as an integer between 0-255.
     * @returns The 0xTTBBGGRR value equivalent to `tbgr` but with the specified alpha.
     */
    static withAlpha(tbgr: ColorDefProps, alpha: number): number;
    /** Get the alpha value for this ColorDef. Will be between 0-255 */
    getAlpha(): number;
    /** Extract the alpha value from a 0xTTBBGGRR color. */
    static getAlpha(tbgr: ColorDefProps): number;
    /** True if this ColorDef is fully opaque. */
    get isOpaque(): boolean;
    /** True if the specified 0xTTBBGGRR color is fully opaque. */
    static isOpaque(tbgr: ColorDefProps): boolean;
    /** Get the transparency value for this ColorDef (inverse of alpha). Will be between 0-255. */
    getTransparency(): number;
    /** Extract the transparency component from a 0xTTBBGGRR color as an integer between 0-255.. */
    static getTransparency(tbgr: ColorDefProps): number;
    /** Create a copy of this ColorDef with the specified transparency.
     * @param transparency the new transparency value. Must be between 0-255, where 0 means 'fully opaque' and 255 means 'fully transparent'.
     * @returns a new ColorDef with the same color as this one and the specified transparency.
     */
    withTransparency(transparency: number): ColorDef;
    /** Compute the 0xTTBBGGRR value of the specified color and transparency.
     * @param transparency the new transparency as an integer between 0-255.
     * @returns The 0xTTBBGGRR value equivalent to `tbgr` but with the specified transparency.
     */
    static withTransparency(tbgr: ColorDefProps, transparency: number): ColorDefProps;
    /** The "known name" for this ColorDef. Will be undefined if color value is not in [[ColorByName]] list */
    get name(): string | undefined;
    /** Obtain the name of the color in the [[ColorByName]] list associated with the specified 0xTTBBGGRR value, or undefined if no such named color exists.
     * @note A handful of colors (like "aqua" and "cyan") have identical tbgr values; in such cases the first match will be returned.
     */
    static getName(tbgr: ColorDefProps): string | undefined;
    /** Convert this ColorDef to a string in the form "#rrggbb" where values are hex digits of the respective colors */
    toHexString(): string;
    /** Convert the 0xTTBBGGRR value to a string in the form "#rrggbb". */
    static toHexString(tbgr: ColorDefProps): string;
    private static getColorsString;
    /** Convert this ColorDef to a string in the form "rgb(r,g,b)" where values are decimal digits of the respective colors. */
    toRgbString(): string;
    /** Convert the 0xTTBBGGRR color to a string in the form "rgb(r,g,b)" where each component is specified in decimal. */
    static toRgbString(tbgr: ColorDefProps): string;
    /** Convert this ColorDef to a string in the form "rgba(r,g,b,a)" where color values are decimal digits and a is a fraction */
    toRgbaString(): string;
    /** Convert the 0xTTBBGGRR color to a string of the form "rgba(r,g,b,a)" where the color components are specified in decimal and the alpha component is a fraction. */
    static toRgbaString(tbgr: ColorDefProps): string;
    /** Create a ColorDef that is the linear interpolation of this ColorDef and another ColorDef, using a weighting factor.
     * @param color2 The other color
     * @param weight The weighting factor for color2. 0.0 = this color, 1.0 = color2.
     * @param result Optional ColorDef to hold result. If undefined, a new ColorDef is created.
     */
    lerp(color2: ColorDef, weight: number): ColorDef;
    /** Interpolate between two 0xTTBBGGRR colors using a weighting factor.
     * @param tbgr1 The first color
     * @param tbgr2 The other color
     * @param weight The weighting factor in [0..1]. A value of 0.0 selects `tbgr1`; 1.0 selects `tbgr2`; 0.5 mixes them evenly; etc.
     * @returns The linear interpolation between `tbgr1` and `tbgr2` using the specified weight.
     */
    static lerp(tbgr1: ColorDefProps, tbgr2: ColorDefProps, weight: number): ColorDefProps;
    /** Create a new ColorDef that is the inverse (all colors set to 255 - this) of this color. Ignores transparency - result has 0 transparency. */
    inverse(): ColorDef;
    /** Return a 0xTTBBGGRR color whose color components are the inverse of the input color. The result has 0 transparency. */
    static inverse(tbgr: ColorDefProps): ColorDefProps;
    /** Create a ColorDef from hue, saturation, lightness values */
    static fromHSL(h: number, s: number, l: number, transparency?: number): ColorDef;
    /** Compute the 0xTTBBGGRR color corresponding to the specified hue, saturation, lightness values. */
    static computeTbgrFromHSL(h: number, s: number, l: number, transparency?: number): ColorDefProps;
    /** Create an [[HSLColor]] from this ColorDef */
    toHSL(): HSLColor;
    /** Create an [[HSVColor]] from this ColorDef */
    toHSV(): HSVColor;
    /** Create a ColorDef from an HSVColor */
    static fromHSV(hsv: HSVColor, transparency?: number): ColorDef;
    private visibilityCheck;
    /**
     * Create a new ColorDef that is adjusted from this ColorDef for maximum contrast against another color. The color will either be lighter
     * or darker, depending on which has more visibility against the other color.
     * @param other the color to contrast with
     * @param alpha optional alpha value for the adjusted color. If not supplied alpha from this color is used.
     */
    adjustedForContrast(other: ColorDef, alpha?: number): ColorDef;
    /** True if the value of this ColorDef is the same as another ColorDef. */
    equals(other: ColorDef): boolean;
    /** pure black */
    static readonly black: ColorDef;
    /** pure white */
    static readonly white: ColorDef;
    /** pure red */
    static readonly red: ColorDef;
    /** pure green */
    static readonly green: ColorDef;
    /** pure blue */
    static readonly blue: ColorDef;
}
/** As part of a [[ColorIndex]], describes per-vertex colors for a [MeshArgs]($frontend) or [PolylineArgs]($frontend).
 * The [[colors]] array holds the set of unique colors. The [[indices]] array describes the color of each vertex as an index into [[colors]].
 * @note A `NonUniformColor` table cannot contain a mix of opaque and translucent colors. If any color in [[colors]] has a transparency greater
 * than zero, all of them must have a transparency greater than zero.
 * @public
 */
export declare class NonUniformColor {
    /** An array of 32-bit [[ColorDef]] values in `tbgr` format, indexed by [[indices]]. */
    readonly colors: Uint32Array;
    /** For each vertex, an index into [[colors]] indicating the color of that vertex. */
    readonly indices: Uint16Array;
    /** If `true`, indicates none of the [[colors]] have a transparency greater than zero; otherwise, all of
     * the colors have a transparency greater than zero.
     */
    readonly isOpaque: boolean;
    /** Constructor.
     * @param colors See [[colors]].
     * @param indices See [[indices]]
     * @param hasAlpha `true` if all `colors` have a transparency greater than zero, or `false` if they all have a transparency of zero.
     */
    constructor(colors: Uint32Array, indices: number[], hasAlpha: boolean);
}
/** Describes the color(s) of the vertices of a [MeshArgs]($frontend) or [PolylineArgs]($frontend).
 * This may be a uniform color to be applied to every vertex, or a table specifying individual per-vertex colors.
 * @public
 */
export declare class ColorIndex {
    private _color;
    /** Whether the color(s) in this index have transparency. */
    get hasAlpha(): boolean;
    /** Whether this index specifies a single uniform color for the entire mesh or polyline. */
    get isUniform(): boolean;
    /** The number of colors in this index. */
    get numColors(): number;
    /** Construct a default index specifying a uniform white color. */
    constructor();
    /** Reset this index to specify a uniform white color. */
    reset(): void;
    /** Returns the single color to be applied to all vertices, if [[isUniform]] is `true`; or `undefined` otherwise. */
    get uniform(): ColorDef | undefined;
    /** Set the specified color to be applied to all vertices. */
    initUniform(color: ColorDef | number): void;
    /** Returns the per-vertex colors, if [[isUniform]] is `false`; or `undefined` otherwise. */
    get nonUniform(): NonUniformColor | undefined;
    /** Set the per-vertex colors.
     * @param colors See [[NonUniformColor.colors]].
     * @param indices See [[NonUniformColor.indices]].
     * @param hasAlpha `true` if all `colors` have a transparency greater than zero, or `false` if they all have a transparency of zero.
     */
    initNonUniform(colors: Uint32Array, indices: number[], hasAlpha: boolean): void;
}
