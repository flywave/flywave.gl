import { type BagOfCurves, type CurveCollection } from "./curve-collection";
import { CurvePrimitive } from "./curve-primitive";
import { type AnyCurve } from "./curve-types";
import { type Loop } from "./loop";
import { type ParityRegion } from "./parity-region";
import { type Path } from "./path";
import { type UnionRegion } from "./union-region";
/** base class for detailed traversal of curve artifacts.
 * * This recurses to children in the quickest way (no records of path)
 * * Use the RecursiveCurveProcessorWithStack to record the path along the visit.
 * @public
 */
export declare abstract class RecursiveCurveProcessor {
    protected constructor();
    /** process error content */
    announceUnexpected(_data: AnyCurve, _indexInParent: number): void;
    /** process a leaf primitive. */
    announceCurvePrimitive(_data: CurvePrimitive, _indexInParent?: number): void;
    /** announce a path (recurse to children) */
    announcePath(data: Path, _indexInParent?: number): void;
    /** announce a loop (recurse to children) */
    announceLoop(data: Loop, _indexInParent?: number): void;
    /** announce beginning or end of loops in a parity region */
    announceParityRegion(data: ParityRegion, _indexInParent?: number): void;
    /** announce beginning or end of a parity region */
    announceUnionRegion(data: UnionRegion, _indexInParent?: number): void;
    /** announce a bag of curves.
     * * The default implementation visits each child and calls the appropriate dispatch to
     * * `this.announceCurvePrimitive(child)`
     * * `child.announceToCurveProcessor(this)`
     */
    announceBagOfCurves(data: BagOfCurves, _indexInParent?: number): void;
}
/** base class for detailed traversal of curve artifacts
 * * During recursion,  maintains a stack that shows complete path to each artifact.
 * * Use the QuickRecursiveCurveProcessor to visit without recording the path.
 * @public
 */
export declare abstract class RecursiveCurveProcessorWithStack extends RecursiveCurveProcessor {
    /** Stack of curve collections that are "up the tree" from the current point of the traversal. */
    protected _stack: CurveCollection[];
    protected constructor();
    /** Push `data` onto the stack so its status is available during processing of children.
     * * Called when `data` is coming into scope.
     */
    enter(data: CurveCollection): void;
    /** Pop the stack
     * * called when the top of the stack goes out of scope
     */
    leave(): CurveCollection | undefined;
    /** process error content */
    announceUnexpected(_data: AnyCurve, _indexInParent: number): void;
    /** process a leaf primitive. */
    announceCurvePrimitive(_data: CurvePrimitive, _indexInParent?: number): void;
    /** announce a path (recurse to children) */
    announcePath(data: Path, indexInParent?: number): void;
    /** announce a loop (recurse to children) */
    announceLoop(data: Loop, indexInParent?: number): void;
    /** announce beginning or end of loops in a parity region */
    announceParityRegion(data: ParityRegion, _indexInParent?: number): void;
    /** announce beginning or end of a parity region */
    announceUnionRegion(data: UnionRegion, indexInParent?: number): void;
    /**
     * Announce members of an unstructured collection.
     * * push the collection reference on the stack
     * * announce children
     * * pop the stack
     * @param data the collection
     * @param _indexInParent index where the collection appears in its parent.
     */
    announceBagOfCurves(data: BagOfCurves, _indexInParent?: number): void;
}
