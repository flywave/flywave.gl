import { ColorDef } from "./color-def";
/** An immutable color defined by Hue, Saturation, and Lightness.
 * @see [here](https://en.wikipedia.org/wiki/HSL_and_HSV) for difference between HSL and HSV
 * @public
 */
export declare class HSLColor {
    /** Hue */
    readonly h: number;
    /** Saturation */
    readonly s: number;
    /** Lightness */
    readonly l: number;
    constructor(hue?: number, saturation?: number, lightness?: number);
    clone(hue?: number, saturation?: number, lightness?: number): HSLColor;
    toColorDef(transparency?: number): ColorDef;
    static fromColorDef(val: ColorDef): HSLColor;
}
