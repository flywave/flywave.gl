/* Copyright (C) 2025 flywave.gl contributors */



import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessor } from "../curve-processor";

/**
 * Algorithmic class: Sum lengths of curves
 * @internal
 */
export class SumLengthsContext extends RecursiveCurveProcessor {
    private _sum: number;
    private constructor() {
        super();
        this._sum = 0.0;
    }

    public static sumLengths(target: CurveCollection): number {
        const context = new SumLengthsContext();
        target.announceToCurveProcessor(context);
        return context._sum;
    }

    public override announceCurvePrimitive(
        curvePrimitive: CurvePrimitive,
        _indexInParent: number
    ): void {
        this._sum += curvePrimitive.curveLength();
    }
}
