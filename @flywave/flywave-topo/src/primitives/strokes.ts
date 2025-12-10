/* Copyright (C) 2025 flywave.gl contributors */



import { type DisplayParams } from "../common/render/primitives/display-params";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";

export class StrokesPrimitivePointList {
    public points: Point3d[];
    constructor(points: Point3d[] = []) {
        this.points = [...points];
    }
}

export class StrokesPrimitivePointLists extends Array<StrokesPrimitivePointList> {
    constructor(...args: StrokesPrimitivePointList[]) {
        super(...args);
    }
}

export class StrokesPrimitive {
    public readonly displayParams: DisplayParams;
    public readonly isDisjoint: boolean;
    public readonly isPlanar: boolean;
    public strokes: StrokesPrimitivePointLists;

    public static create(params: DisplayParams, isDisjoint: boolean, isPlanar: boolean) {
        return new StrokesPrimitive(params, isDisjoint, isPlanar);
    }

    private constructor(params: DisplayParams, isDisjoint: boolean, isPlanar: boolean) {
        this.displayParams = params;
        this.strokes = new StrokesPrimitivePointLists();
        this.isDisjoint = isDisjoint;
        this.isPlanar = isPlanar;
    }

    public transform(trans: Transform) {
        for (const strk of this.strokes) {
            trans.multiplyPoint3dArrayInPlace(strk.points);
        }
    }
}

export class StrokesPrimitiveList extends Array<StrokesPrimitive> {
    constructor(...args: StrokesPrimitive[]) {
        super(...args);
    }
}
