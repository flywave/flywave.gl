/* Copyright (C) 2025 flywave.gl contributors */



import { type Transform } from "../../geometry3d/transform";
import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessor } from "../curve-processor";

/** Algorithmic class: Transform curves in place.
 * @internal
 */
export class TransformInPlaceContext extends RecursiveCurveProcessor {
    public numFail: number;
    public numOK: number;
    public transform: Transform;
    constructor(transform: Transform) {
        super();
        this.numFail = 0;
        this.numOK = 0;
        this.transform = transform;
    }

    public static tryTransformInPlace(target: CurveCollection, transform: Transform): boolean {
        const context = new TransformInPlaceContext(transform);
        target.announceToCurveProcessor(context);
        return context.numFail === 0;
    }

    public override announceCurvePrimitive(
        curvePrimitive: CurvePrimitive,
        _indexInParent: number
    ): void {
        if (!curvePrimitive.tryTransformInPlace(this.transform)) this.numFail++;
        else this.numOK++;
    }
}
