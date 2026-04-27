import { IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { BSplineCurve3d } from "./bspline-curve";
import { type InterpolationCurve3dOptions, type InterpolationCurve3dProps } from "./interpolation-curve3d";
export declare class BSplineCurveOps {
    static createThroughPoints(points: IndexedXYZCollection | Point3d[], order: number): BSplineCurve3d | undefined;
    static createThroughPointsC2Cubic(options: InterpolationCurve3dOptions): BSplineCurve3d | undefined;
}
export declare namespace BSplineCurveOps {
    class C2CubicFit {
        private static normalizeKnots;
        private static constructChordLengthParameters;
        private static constructUniformParameters;
        private static removeDuplicateFitPoints;
        static constructFitParametersFromPoints(fitPoints: Point3d[], isChordLength: number | undefined, closed: boolean | undefined): number[] | undefined;
        static constructFitParameters(options: InterpolationCurve3dOptions): boolean;
        private static computeAlphaBetaGamma;
        private static setUpSystem2Points;
        private static setUpSystem3Points;
        private static setUpSystem4PointsOrMore;
        private static setUpSystem;
        private static setBesselEndCondition;
        private static setNaturalEndCondition;
        private static setChordLengthScaledEndCondition;
        private static setBesselLengthScaledEndCondition;
        private static setPhysicallyClosedEndCondition;
        private static setEndConditions;
        private static solveNearTridiagonal;
        static validateOptions(options: InterpolationCurve3dOptions): boolean;
        static convertCubicKnotVectorToFitParams(knots: number[] | undefined, numFitPoints: number, normalize?: boolean): number[] | undefined;
        static convertFitParamsToCubicKnotVector(params: number[] | undefined, closed?: boolean, legacy?: boolean): number[] | undefined;
        static convertToJsonKnots(props: InterpolationCurve3dProps): void;
        static constructPoles(options: InterpolationCurve3dOptions): Point3d[] | Float64Array | undefined;
    }
}
