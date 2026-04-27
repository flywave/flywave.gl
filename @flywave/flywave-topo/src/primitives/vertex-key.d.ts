import { type OctEncodedNormal } from "../common";
import { type Point2d, type Point3d, type XYAndZ } from "../core-geometry";
import { IndexMap } from "../utils";
export interface VertexKeyProps {
    position: Point3d;
    fillColor: number;
    normal?: OctEncodedNormal;
    uvParam?: Point2d;
}
export declare class VertexKey {
    readonly position: Point3d;
    readonly normal?: OctEncodedNormal;
    readonly uvParam?: Point2d;
    readonly fillColor: number;
    constructor(position: Point3d, fillColor: number, normal?: OctEncodedNormal, uvParam?: Point2d);
    static create(props: VertexKeyProps): VertexKey;
    equals(rhs: VertexKey, tolerance: XYAndZ): boolean;
    compare(rhs: VertexKey, tolerance: XYAndZ): number;
}
export declare class VertexMap extends IndexMap<VertexKey> {
    private readonly _tolerance;
    constructor(tolerance: XYAndZ);
    insertKey(props: VertexKeyProps, onInsert?: (vk: VertexKey) => any): number;
    arePositionsAlmostEqual(p0: VertexKeyProps, p1: VertexKeyProps): boolean;
    comparePositions(p0: VertexKeyProps, p1: VertexKeyProps): number;
}
