import { type DisplayParams } from "../common/render/primitives/display-params";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";
export declare class StrokesPrimitivePointList {
    points: Point3d[];
    constructor(points?: Point3d[]);
}
export declare class StrokesPrimitivePointLists extends Array<StrokesPrimitivePointList> {
    constructor(...args: StrokesPrimitivePointList[]);
}
export declare class StrokesPrimitive {
    readonly displayParams: DisplayParams;
    readonly isDisjoint: boolean;
    readonly isPlanar: boolean;
    strokes: StrokesPrimitivePointLists;
    static create(params: DisplayParams, isDisjoint: boolean, isPlanar: boolean): StrokesPrimitive;
    private constructor();
    transform(trans: Transform): void;
}
export declare class StrokesPrimitiveList extends Array<StrokesPrimitive> {
    constructor(...args: StrokesPrimitive[]);
}
