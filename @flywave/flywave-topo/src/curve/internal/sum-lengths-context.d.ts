import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessor } from "../curve-processor";
/**
 * Algorithmic class: Sum lengths of curves
 * @internal
 */
export declare class SumLengthsContext extends RecursiveCurveProcessor {
    private _sum;
    private constructor();
    static sumLengths(target: CurveCollection): number;
    announceCurvePrimitive(curvePrimitive: CurvePrimitive, _indexInParent: number): void;
}
