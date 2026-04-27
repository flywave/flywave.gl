import { type CurveCollection } from "../curve-collection";
import { type AnyCurve } from "../curve-types";
/**
 * Context for splitting curves.
 * * Sets startCut and endCut details on CurvePrimitive fragments.
 * @internal
 */
export declare class CurveSplitContext {
    private static hasInteriorDetailAIntersections;
    private collectFragmentAndAdvanceCut;
    /** Collect fragments from an intersections array, with the array detailA entries all referencing to curveToCut.
     * * The `intersections` array is sorted on its detailA field.
     */
    private collectSinglePrimitiveFragments;
    static cloneCurvesWithXYSplits(curvesToCut: AnyCurve | undefined, cutterCurves: CurveCollection): AnyCurve | undefined;
}
