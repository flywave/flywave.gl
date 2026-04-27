import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessorWithStack } from "../curve-processor";
/** Algorithmic class: Count LineSegment3d and LineString3d primitives.
 * @internal
 */
export declare class CountLinearPartsSearchContext extends RecursiveCurveProcessorWithStack {
    numLineSegment: number;
    numLineString: number;
    numOther: number;
    constructor();
    static hasNonLinearPrimitives(target: CurveCollection): boolean;
    announceCurvePrimitive(curve: CurvePrimitive, _indexInParent: number): void;
}
