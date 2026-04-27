import { type Range3d } from "../geometry3d/range";
import { CurveCollection } from "./curve-collection";
import { CurvePrimitive } from "./curve-primitive";
import { type AnyCurve } from "./curve-types";
import { type LineString3d } from "./line-string3d";
import { Loop } from "./loop";
import { type OffsetOptions } from "./offset-options";
import { Path } from "./path";
import { type ChainTypes } from "./region-ops";
import { type StrokeOptions } from "./stroke-options";
/**
 * Static methods for miscellaneous curve operations.
 * @public
 */
export declare class CurveOps {
    /** Recursively sum curve lengths, allowing CurvePrimitive, CurveCollection, or array of such at any level. */
    static sumLengths(curves: AnyCurve | AnyCurve[]): number;
    /** Recursively extend the range by each curve's range, allowing CurvePrimitive, CurveCollection, or array of such at any level. */
    static extendRange(range: Range3d, curves: AnyCurve | AnyCurve[]): Range3d;
    /**
     * Construct a separate xy-offset for each input curve.
     * * For best offset results, the inputs should be parallel to the xy-plane.
     * @param curves input curve(s), z-coordinates ignored. Only [[ChainTypes]] are handled.
     * @param offset offset distance (positive to left of curve, negative to right)
     * @param result array to collect offset curves
     * @returns summed length of offset curves
     */
    static appendXYOffsets(curves: AnyCurve | AnyCurve[] | undefined, offset: number, result: AnyCurve[]): number;
    /**
     * Restructure curve fragments as Paths and Loops, and construct xy-offsets of the chains.
     * * If the inputs do not form Loop(s), the classification of offsets is suspect.
     * * For best offset results, the inputs should be parallel to the xy-plane.
     * * Chain formation is dependent upon input fragment order, as a greedy algorithm is employed.
     * @param fragments fragments to be chained and offset
     * @param offsetDistance offset distance, applied to both sides of each fragment to produce inside and outside xy-offset curves.
     * @param gapTolerance distance to be treated as "effectively zero" when joining head-to-tail
     * @returns object with named chains, insideOffsets, outsideOffsets
     */
    static collectInsideAndOutsideXYOffsets(fragments: AnyCurve[], offsetDistance: number, gapTolerance: number): {
        insideOffsets: AnyCurve[];
        outsideOffsets: AnyCurve[];
        chains: ChainTypes;
    };
    /**
     * Construct curves that are offset from a Path or Loop as viewed in xy-plane (ignoring z).
     * * The construction will remove "some" local effects of features smaller than the offset distance, but will not detect self intersection among widely separated edges.
     * @param curves base curves.
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or options object.
     */
    static constructCurveXYOffset(curves: Path | Loop, offsetDistanceOrOptions: number | OffsetOptions): CurveCollection | undefined;
    /**
     * Create the offset of a single curve primitive as viewed in the xy-plane (ignoring z).
     * @param curve primitive to offset
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or options object
     */
    static createSingleOffsetPrimitiveXY(curve: CurvePrimitive, offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /**
     * Restructure curve fragments as Paths and Loops.
     * * Chain formation is dependent upon input fragment order, as a greedy algorithm is employed.
     * @param fragments fragments to be chained
     * @param gapTolerance distance to be treated as "effectively zero" when assembling fragments head-to-tail
     * @param planeTolerance tolerance for considering a closed chain to be planar. If undefined, only create Path. If defined, create Loops for closed chains within tolerance of a plane.
     * @returns chains, possibly wrapped in a [[BagOfCurves]].
     */
    static collectChains(fragments: AnyCurve[], gapTolerance?: number, planeTolerance?: number | undefined): ChainTypes;
    /**
     * Restructure curve fragments as Paths and Loops, to be stroked and passed into the callback.
     * * Chain formation is dependent upon input fragment order, as a greedy algorithm is employed.
     * @param fragments fragments to be chained and stroked
     * @param announceChain callback to process each stroked Path and Loop
     * @param strokeOptions options for stroking the chains
     * @param gapTolerance distance to be treated as "effectively zero" when assembling fragments head-to-tail. Also used for removing duplicate points in the stroked chains.
     * @param planeTolerance tolerance for considering a closed chain to be planar. If undefined, only create Path. If defined, create Loops for closed chains within tolerance of a plane.
     */
    static collectChainsAsLineString3d(fragments: AnyCurve[], announceChain: (chainPoints: LineString3d) => void, strokeOptions?: StrokeOptions, gapTolerance?: number, planeTolerance?: number | undefined): void;
}
