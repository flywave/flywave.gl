import { LinePixels } from "../common";
/** Map a LinePixels value to an integer in [0..9] that can be used by shaders to index into the corresponding pixel pattern.
 * This is used for feature overrides, including those defined by InstancedGraphicParams.
 */
export declare function lineCodeFromLinePixels(pixels: LinePixels): number;
/** Describes one of the pre-defined line patterns. See Render.LinePixels.
 * @internal
 */
export declare namespace LineCode {
    function valueFromLinePixels(pixels: LinePixels): number;
    const solid = 0;
    const count = 16;
    const size = 32;
    const lineCodeData: number[];
}
