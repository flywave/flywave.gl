/* Copyright (C) 2025 flywave.gl contributors */



import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessorWithStack } from "../curve-processor";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";

/** Algorithmic class: Count LineSegment3d and LineString3d primitives.
 * @internal
 */
export class CountLinearPartsSearchContext extends RecursiveCurveProcessorWithStack {
    public numLineSegment: number;
    public numLineString: number;
    public numOther: number;
    constructor() {
        super();
        this.numLineSegment = 0;
        this.numLineString = 0;
        this.numOther = 0;
    }

    public static hasNonLinearPrimitives(target: CurveCollection): boolean {
        const context = new CountLinearPartsSearchContext();
        target.announceToCurveProcessor(context);
        return context.numOther > 0;
    }

    public override announceCurvePrimitive(curve: CurvePrimitive, _indexInParent: number): void {
        if (curve instanceof LineSegment3d) this.numLineSegment++;
        else if (curve instanceof LineString3d) this.numLineString++;
        else this.numOther++;
    }
}
