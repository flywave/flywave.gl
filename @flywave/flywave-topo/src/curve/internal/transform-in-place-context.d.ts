import { type Transform } from "../../geometry3d/transform";
import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessor } from "../curve-processor";
/** Algorithmic class: Transform curves in place.
 * @internal
 */
export declare class TransformInPlaceContext extends RecursiveCurveProcessor {
    numFail: number;
    numOK: number;
    transform: Transform;
    constructor(transform: Transform);
    static tryTransformInPlace(target: CurveCollection, transform: Transform): boolean;
    announceCurvePrimitive(curvePrimitive: CurvePrimitive, _indexInParent: number): void;
}
