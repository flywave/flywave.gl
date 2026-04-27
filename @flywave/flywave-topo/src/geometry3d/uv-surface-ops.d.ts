import { LineString3d } from "../curve/line-string3d";
import { StrokeOptions } from "../curve/stroke-options";
import { type EllipsoidPatch } from "./ellipsoid";
import { type UVSurface } from "./geometry-handler";
import { Range3d } from "./range";
/**
 * Support methods to act on surfaces with 0..1 uv fractional parameterization
 * @public
 */
export declare class UVSurfaceOps {
    /** Return the range of sampled points at specified offset from the surface.
     * * point counts in each direction may be set in the optional `options` structure.
     * * numU and numV are clamped at (2,500).
     */
    static sampledRangeOfOffsetPatch(patch: UVSurface, offsetDistance: number | undefined, numU: number, numV: number): Range3d;
    /** Return the range of sampled points at specified offset from the surface.
     * * point counts in each direction may be set in the optional `options` structure, with angle ranges from the ellipsoid.
     * * Default evaluation is at 5 degree intervals.
     */
    static sampledRangeOfOffsetEllipsoidPatch(patch: EllipsoidPatch, offsetDistance: number | undefined, options?: StrokeOptions): Range3d;
    private constructor();
    /**
     * * evaluate `numEdge+1` points at surface uv parameters interpolated between (u0,v0) and (u1,v1)
     * * accumulate the xyz in a linestring.
     * * If xyzToUV is given, also accumulate transformed values as surfaceUV
     * * use xyzToUserUV transform to convert xyz to uv stored in the linestring (this uv is typically different from surface uv -- e.g. torus cap plane coordinates)
     * @param surface
     * @param u0 u coordinate at start of parameter space line
     * @param v0 v coordinate at end of parameter space line
     * @param u1 u coordinate at start of parameter space line
     * @param v1 v coordinate at end of parameter space line
     * @param numEdge number of edges.   (`numEdge+1` points are evaluated)
     * @param saveUV if true, save each surface uv fractions with `linestring.addUVParamsAsUV (u,v)`
     * @param saveFraction if true, save each fractional coordinate (along the u,v line) with `linestring.addFraction (fraction)`
     *
     * @param xyzToUV
     */
    static createLinestringOnUVLine(surface: UVSurface, u0: number, v0: number, u1: number, v1: number, numEdge: number, saveUV?: boolean, saveFraction?: boolean): LineString3d;
}
