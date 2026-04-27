import { type CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { CloneCurvesContext } from "./clone-curves-context";
/**
 * Algorithmic class for cloning with linestrings expanded to line segments
 * @internal
 */
export declare class CloneWithExpandedLineStrings extends CloneCurvesContext {
    constructor();
    protected doClone(primitive: CurvePrimitive): CurvePrimitive | CurvePrimitive[];
    static clone(target: CurveCollection): CurveCollection;
}
