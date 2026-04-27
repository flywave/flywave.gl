import { ColorDef } from "./color-def";
import { type Gradient } from "./gradient";
import { LinePixels } from "./line-pixels";
import { type RenderMaterial } from "./render-material";
/** Flags indicating whether and how the interiors of closed planar regions is displayed within a view.
 * @public
 * @extensions
 */
export declare enum FillFlags {
    /** No fill */
    None = 0,
    /** Use the element's fill color when fill is enabled in the view's [[ViewFlags]]. */
    ByView = 1,
    /** Use the element's fill color even when fill is disabled in the view's [[ViewFlags]]. */
    Always = 2,
    /** Render the fill behind other geometry belonging to the same element.
     * For example if an element's geometry contains text with background fill, the text always renders in front of the fill.
     */
    Behind = 4,
    /** Combines Behind and Always flags. */
    Blanking = 6,
    /** Use the view's background color instead of the element's fill color. */
    Background = 8
}
/** The "cooked" material and symbology for a [[RenderGraphic]]. This determines the appearance
 * (e.g. texture, color, width, linestyle, etc.) used to draw Geometry.
 * @public
 */
export declare class GraphicParams {
    /** Describes how fill is applied to planar regions in wireframe mode. */
    fillFlags: FillFlags;
    /** The line pattern applied to curves and edges. */
    linePixels: LinePixels;
    /** The width, in pixels, of curves and edges. Values are clamped to [1..31] at display time. */
    rasterWidth: number;
    /** The color of curves and edges. */
    lineColor: ColorDef;
    /** The color of surfaces. */
    fillColor: ColorDef;
    /** Material applied to surfaces. */
    material?: RenderMaterial;
    /** Gradient fill applied to surfaces. */
    gradient?: Gradient.Symb;
    /** Set the transparency of the line color, where 0=fully opaque and 255=full transparent. */
    setLineTransparency(transparency: number): void;
    /** Set the transparency of the fill color, where 0=fully opaque and 255=full transparent. */
    setFillTransparency(transparency: number): void;
    clone(out?: GraphicParams): GraphicParams;
    /** Conveniently create a GraphicParams the most commonly-used properties. */
    static fromSymbology(lineColor: ColorDef, fillColor: ColorDef, lineWidth: number, linePixels?: LinePixels): GraphicParams;
    /** Create a GraphicParams with blanking fill of the specified color.
     * @see [[FillFlags.Blanking]].
     */
    static fromBlankingFill(fillColor: ColorDef): GraphicParams;
}
