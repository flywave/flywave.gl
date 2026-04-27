import { type AngleProps, Angle } from "../core-geometry";
import { type ColorDefProps, ColorDef } from "./color-def";
import { ImageBuffer } from "./image";
import { type ThematicGradientSettingsProps, ThematicGradientSettings } from "./thematic-display";
/** Namespace containing types for defining a color gradient, often used for filled planar regions.
 * @see [[GeometryParams]]
 * @see [[GraphicParams]]
 * @public
 */
export declare namespace Gradient {
    /** Flags applied to a [[Gradient.Symb]]. */
    enum Flags {
        /** No flags. */
        None = 0,
        /** Reverse the order of the gradient keys. */
        Invert = 1,
        /** Draw an outline around the surface to which the gradient is applied. */
        Outline = 2
    }
    /** Enumerates the modes by which a [[Gradient.Symb]]'s keys are applied to create an image. */
    enum Mode {
        None = 0,
        Linear = 1,
        Curved = 2,
        Cylindrical = 3,
        Spherical = 4,
        Hemispherical = 5,
        /** For a gradient created based for [[ThematicDisplay]]. */
        Thematic = 6
    }
    /** Gradient fraction value to [[ColorDef]] pair */
    interface KeyColorProps {
        /** Fraction from 0.0 to 1.0 to denote position along gradient */
        value: number;
        /** Color value for given fraction */
        color: ColorDefProps;
    }
    /** Gradient fraction value to [[ColorDef]] pair
     * @see [[Gradient.KeyColorProps]]
     */
    class KeyColor {
        value: number;
        color: ColorDef;
        constructor(json: KeyColorProps);
    }
    /** Compare two KeyColor objects for equality. Returns true if equal. */
    function keyColorEquals(a: KeyColor, b: KeyColor): boolean;
    /** Multi-color area fill defined by a range of colors that vary by position */
    interface SymbProps {
        /** Gradient type, must be set to something other than [[Gradient.Mode.None]] to display fill */
        mode: Mode;
        /** Gradient flags to enable outline display and invert color fractions, Flags.None if undefined */
        flags?: Flags;
        /** Gradient rotation angle, 0.0 if undefined */
        angle?: AngleProps;
        /** Gradient tint value from 0.0 to 1.0, only used when [[Gradient.KeyColorProps]] size is 1, 0.0 if undefined */
        tint?: number;
        /** Gradient shift value from 0.0 to 1.0, 0.0 if undefined */
        shift?: number;
        /** Gradient fraction value/color pairs, 1 minimum (uses tint for 2nd color), 8 maximum */
        keys: KeyColorProps[];
        /** Settings applicable to [[ThematicDisplay]]. */
        thematicSettings?: ThematicGradientSettingsProps;
    }
    /** Arguments supplied to [[Gradient.Symb.produceImage]].
     * @public
     */
    interface ProduceImageArgs {
        /** The desired width of the image in pixels. Must be an integer greater than zero. */
        width: number;
        /** The desired height of the image in pixels. Must be an integer greater than zero. */
        height: number;
        /** If true and the gradient uses [[Gradient.Mode.Thematic]], the margin color specified by [[ThematicGradientSettings.marginColor]] will be included
         * in the top and bottom rows of the image; otherwise only the gradient colors will be included in the image.
         */
        includeThematicMargin?: boolean;
    }
    /** Multi-color area fill defined by a range of colors that vary by position.
     * Gradient fill can be applied to planar regions.
     * @see [[Gradient.SymbProps]]
     */
    class Symb {
        mode: Mode;
        flags: Flags;
        angle?: Angle;
        tint?: number;
        shift: number;
        thematicSettings?: ThematicGradientSettings;
        keys: KeyColor[];
        /** create a GradientSymb from a json object. */
        static fromJSON(json?: SymbProps): Symb;
        private static readonly _fixedSchemeKeys;
        private static readonly _fixedCustomKeys;
        /** Create for [[ThematicDisplay]]. */
        static createThematic(settings: ThematicGradientSettings): Symb;
        toJSON(): SymbProps;
        clone(): Symb;
        /** Returns true if this symbology is equal to another, false otherwise. */
        equals(other: Symb): boolean;
        /** Compares two gradient symbologies. Used for ordering Gradient.Symb objects.
         * @param lhs First gradient to compare
         * @param rhs Second gradient to compare
         * @returns 0 if lhs is equivalent to rhs, a negative number if lhs compares less than rhs, or a positive number if lhs compares greater than rhs.
         */
        static compareSymb(lhs: Gradient.Symb, rhs: Gradient.Symb): number;
        /** Compare this symbology to another.
         * @see [[Gradient.Symb.compareSymb]]
         */
        compare(other: Symb): number;
        /**
         * Ensure the value given is within the range of 0 to 255,
         * and truncate the value to only the 8 least significant bits.
         */
        private roundToByte;
        /** Maps a value to an RGBA value adjusted from a color present in this symbology's array. */
        mapColor(value: number): ColorDef;
        get hasTranslucency(): boolean;
        /** Returns true if the [[Gradient.Flags.Outline]] flag is set. */
        get isOutlined(): boolean;
        /** This function (for internal use only) provides the WebGL renderer with a thematic image that its shaders
         * can use properly with various thematic rendering techniques.
         * If you want a regular gradient image, use the method [[Gradient.Symb.getImage]].
         * @internal
         */
        getThematicImageForRenderer(maxDimension: number): ImageBuffer;
        /** Produces a bitmap image from this gradient.
         * @param width Width of the image
         * @param height Height of the image
         * @note If this gradient uses [[Gradient.Mode.Thematic]], then the width of the image will be 1 and the margin color will be included in the top and bottom rows.
         * @see [[produceImage]] for more customization.
         */
        getImage(width: number, height: number): ImageBuffer;
        /** Produces a bitmap image from this gradient. */
        produceImage(args: ProduceImageArgs): ImageBuffer;
    }
}
