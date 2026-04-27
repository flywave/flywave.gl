import { ColorDef } from "./color-def";
/** JSON representation of an [[RgbColor]], with each component an integer in the range [0, 255].
 * @public
 * @extensions
 */
export interface RgbColorProps {
    r: number;
    g: number;
    b: number;
}
/** An immutable representation of a color with red, green, and blue components each in the integer range [0, 255].
 * @public
 */
export declare class RgbColor {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    /** Constructs from red, green, and blue components.
     * @param r Red
     * @param g Green
     * @param b Blue
     */
    constructor(r: number, g: number, b: number);
    /** Constructs from the red, green, and blue components of a ColorDef. The transparency component is ignored. */
    static fromColorDef(colorDef: ColorDef): RgbColor;
    /** Converts this RgbColor to a ColorDef.
     * @param transparency Value to use for the transparency component of the ColorDef.
     * @param out If defined, this ColorDef will be modified in-place and returned; otherwise a new ColorDef will be allocated.
     * @returns A ColorDef with RGB components equivalent to those of this RgbColor and transparency component as specified.
     */
    toColorDef(transparency?: number): ColorDef;
    /** Convert this color to its JSON representation. */
    toJSON(): RgbColorProps;
    /** Create an RgbColor from its JSON representation.
     * If `json` is `undefined`, the result is pure white.
     */
    static fromJSON(json: RgbColorProps | undefined): RgbColor;
    /** Returns true if this color's red, green, and blue components are identical to those of `other`. */
    equals(other: RgbColor): boolean;
    /** Compare this color to another color using the rules of an [OrderedComparator]($bentley). */
    compareTo(other: RgbColor): number;
    /** Convert this color to a string in the form "#rrggbb" where the values are the hex digits of the respective color components. */
    toHexString(): string;
}
