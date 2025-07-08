import { Point2d, Point3d, Range3d, Transform } from "../core-geometry";

export interface InstancedGraphicParams {
    readonly count: number;
    readonly transforms: Float32Array;
    readonly transformCenter: Point3d;
    readonly featureIds?: Uint8Array;
    readonly symbologyOverrides?: Uint8Array;
    readonly range?: Range3d;
}

export interface PatternGraphicParams {
    readonly xyOffsets: Float32Array;
    readonly featureId?: number;
    readonly orgTransform: Transform;
    readonly scale: number;
    readonly spacing: Point2d;
    readonly origin: Point2d;
    readonly patternToModel: Transform;
    readonly range: Range3d;
    readonly symbolTranslation: Point3d;
    readonly viewIndependentOrigin?: Point3d;
}
