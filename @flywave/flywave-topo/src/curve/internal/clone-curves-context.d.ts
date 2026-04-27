import { type Transform } from "../../geometry3d/transform";
import { CurveCollection } from "../curve-collection";
import { type CurvePrimitive } from "../curve-primitive";
import { RecursiveCurveProcessorWithStack } from "../curve-processor";
/**
 * Algorithmic class for cloning curve collections.
 * * recurse through collection nodes, building image nodes as needed and inserting clones of children.
 * * for individual primitive, invoke doClone (protected) for direct clone; insert into parent
 */
export declare class CloneCurvesContext extends RecursiveCurveProcessorWithStack {
    protected _result: CurveCollection | undefined;
    private readonly _transform;
    protected constructor(transform?: Transform);
    static clone(target: CurveCollection, transform?: Transform): CurveCollection | undefined;
    enter(c: CurveCollection): void;
    leave(): CurveCollection | undefined;
    protected doClone(primitive: CurvePrimitive): CurvePrimitive | CurvePrimitive[] | undefined;
    announceCurvePrimitive(primitive: CurvePrimitive, _indexInParent: number): void;
}
