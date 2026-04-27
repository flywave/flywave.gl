import { type AngleProps, type Transform, type XYProps, type XYZProps, type YawPitchRollProps, Angle, Matrix3d, Point2d, Point3d, YawPitchRollAngles } from "../../core-geometry";
import { type Id64String } from "../../utils";
import { type ColorDefProps, ColorDef } from "../color-def";
export declare namespace AreaPattern {
    interface HatchDefLineProps {
        angle?: AngleProps;
        through?: XYProps;
        offset?: XYProps;
        dashes?: number[];
    }
    class HatchDefLine implements HatchDefLineProps {
        angle?: Angle;
        through?: Point2d;
        offset?: Point2d;
        dashes?: number[];
        constructor(json: HatchDefLineProps);
    }
    interface ParamsProps {
        origin?: XYZProps;
        rotation?: YawPitchRollProps;
        space1?: number;
        space2?: number;
        angle1?: AngleProps;
        angle2?: AngleProps;
        scale?: number;
        color?: ColorDefProps;
        weight?: number;
        invisibleBoundary?: boolean;
        snappable?: boolean;
        symbolId?: Id64String;
        defLines?: HatchDefLineProps[];
    }
    class Params {
        origin?: Point3d;
        rotation?: YawPitchRollAngles;
        space1?: number;
        space2?: number;
        angle1?: Angle;
        angle2?: Angle;
        scale?: number;
        color?: ColorDef;
        weight?: number;
        invisibleBoundary?: boolean;
        snappable?: boolean;
        symbolId?: Id64String;
        defLines?: HatchDefLine[];
        static fromJSON(json?: ParamsProps): Params;
        toJSON(): ParamsProps;
        clone(): Params;
        equals(other: Params): boolean;
        static transformPatternSpace(transform: Transform, oldSpace: number, patRot: Matrix3d, angle?: Angle): number;
        static getTransformPatternScale(transform: Transform): number;
        applyTransform(transform: Transform): boolean;
    }
}
