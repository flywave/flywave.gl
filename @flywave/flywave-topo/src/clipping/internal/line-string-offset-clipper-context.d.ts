import { type IndexedXYZCollection } from "../../geometry3d/indexed-xyz-collection";
import { type Vector3d } from "../../geometry3d/point3d-vector3d";
import { UnionOfConvexClipPlaneSets } from "../union-of-convex-clip-plane-sets";
export declare class LineStringOffsetClipperContext {
    private readonly _positiveOffsetLeft;
    private readonly _positiveOffsetRight;
    private readonly _turnDegrees;
    private constructor();
    static createUnit(points: IndexedXYZCollection, index0: number, closed: boolean, xyOnly?: boolean): Vector3d | undefined;
    private static createDirectedPlane;
    private createChamferCut;
    private createOffsetFromSegment;
    static createClipBetweenOffsets(points: IndexedXYZCollection, positiveOffsetLeft: number, positiveOffsetRight: number, z0: number | undefined, z1: number | undefined): UnionOfConvexClipPlaneSets;
}
