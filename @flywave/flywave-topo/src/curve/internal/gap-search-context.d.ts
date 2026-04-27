import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessorWithStack } from "../curve-processor";
/**
 * Algorithmic class: Accumulate maximum gap between adjacent primitives of CurveChain.
 * @internal
 */
export declare class GapSearchContext extends RecursiveCurveProcessorWithStack {
    maxGap: number;
    constructor();
    static maxGap(target: CurveCollection): number;
    announceCurvePrimitive(curve: CurvePrimitive, _indexInParent: number): void;
}
