import { type ColorDefProps, ColorDef } from "./color-def";
import { LinePixels } from "./line-pixels";
/** Namespace containing types controlling how edges and surfaces should be drawn in "hidden line" and "solid fill" [[RenderMode]]s.
 * @public
 */
export declare namespace HiddenLine {
    /** Describes the symbology with which edges should be drawn. */
    interface StyleProps {
        /** @internal
         * This JSON representation is awkward, but it must match that used in the db.
         * If the JSON came from the db then all members are present and:
         *  - color is overridden only if ovrColor = true.
         *  - width is overridden only if width != 0
         *  - pattern is overridden only if pattern != LinePixels.Invalid
         * The 'public' JSON representation is more sensible:
         *  - Color, width, and pattern are each overridden iff they are not undefined.
         * To make this work for both scenarios, the rules are:
         *  - color is overridden if color != undefined and ovrColor != false
         *  - width is overridden if width != undefined and width != 0
         *  - pattern is overridden if pattern != undefined and pattern != LinePixels.Invalid
         */
        ovrColor?: boolean;
        /** If defined, the color used to draw the edges. If undefined, edges are drawn using the element's line color. */
        color?: ColorDefProps;
        /** If defined, the pixel pattern used to draw the edges. If undefined, edges are drawn using the element's line pattern. */
        pattern?: LinePixels;
        /** If defined, the width of the edges in pixels. If undefined (or 0), edges are drawn using the element's line width.
         * @note Non-integer values are truncated, and values are clamped to the range [1, 32].
         */
        width?: number;
    }
    /** Describes the symbology with which edges should be drawn. */
    class Style {
        /** @internal */
        get ovrColor(): boolean;
        /** If defined, the color used to draw the edges. If undefined, edges are drawn using the element's line color. */
        readonly color?: ColorDef;
        /** If defined, the pixel pattern used to draw the edges. If undefined, edges are drawn using the element's line pattern. */
        readonly pattern?: LinePixels;
        /** If defined, the width of the edges in pixels. If undefined (or 0), edges are drawn using the element's line width.
         * @note Non-integer values are truncated, and values are clamped to the range [1, 32].
         */
        readonly width?: number;
        private constructor();
        static readonly defaultVisible: Style;
        static readonly defaultHidden: Style;
        static fromJSON(json?: StyleProps, hidden?: true): Style;
        /** Create a Style equivalent to this one but with the specified color override. */
        overrideColor(color: ColorDef | undefined): Style;
        /** Create a Style equivalent to this one but with the specified pattern override. */
        overridePattern(pattern: LinePixels | undefined): Style;
        /** Create a Style equivalent to this one but with the specified width override. */
        overrideWidth(width: number | undefined): Style;
        /** Returns true if this Style is equivalent to the supplied Style. */
        equals(other: Style): boolean;
        toJSON(): StyleProps;
    }
    /** The JSON representation of a [[HiddenLine.Settings]]. */
    interface SettingsProps {
        /** See [[HiddenLine.Settings.visible]]. */
        visible?: StyleProps;
        /** See [[HiddenLine.Settings.hidden]]. */
        hidden?: StyleProps;
        /** See [[HiddenLine.Settings.transparencyThreshold. */
        transThreshold?: number;
    }
    /** Describes how visible and hidden edges and transparent surfaces should be rendered in "hidden line" and "solid fill" [[RenderMode]]s. */
    class Settings {
        /** Describes how visible edges (those unobscured by other geometry) should be displayed. */
        readonly visible: Style;
        /** Describes how hidden edges (those obscured by other geometry) should be displayed. */
        readonly hidden: Style;
        /** A value in the range [0.0, 1.0] specifying a threshold below which transparent surfaces should not be drawn.
         * A value of 0.0 indicates any surface that is not 100% opaque should not be drawn.
         * A value of 0.25 indicates any surface that is less than 25% opaque should not be drawn.
         * A value of 1.0 indicates that all surfaces should be drawn regardless of transparency.
         * @note values will be clamped to the range [0.0, 1.0].
         * @note Defaults to 1.0.
         */
        readonly transparencyThreshold: number;
        /** An alias for [[transparencyThreshold]]. */
        get transThreshold(): number;
        /** The default display settings. */
        static defaults: Settings;
        /** Create a DisplaySettings from its JSON representation. */
        static fromJSON(json?: SettingsProps): Settings;
        toJSON(): SettingsProps;
        /** Create a Settings equivalent to this one with the exception of those properties defined in the supplied JSON. */
        override(props: SettingsProps): Settings;
        equals(other: Settings): boolean;
        get matchesDefaults(): boolean;
        private constructor();
    }
}
