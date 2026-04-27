import { Plane3dByOriginAndVectors } from "../../geometry3d/plane3d-by-origin-and-vectors";
import { type Vector3d, Point3d } from "../../geometry3d/point3d-vector3d";
import { Ray3d } from "../../geometry3d/ray3d";
/**
 * XYCurveEvaluator is an abstract with methods for evaluating X and Y parts of a curve parameterized by a fraction.
 * * The required methods call for independent X and Y evaluation.
 * * Base class methods package those (multiple) calls into point, ray, and plane structures.
 *    * A implementation that has evaluation substantial cost that can be shared among x,y parts or between
 *       primary functions and derivatives might choose to implement the point and derivative methods directly.
 * @internal
 */
export declare abstract class XYCurveEvaluator {
    /** return a deep copy of the evaluator */
    abstract clone(): XYCurveEvaluator;
    /** test for near identical evaluator */
    abstract isAlmostEqual(other: any): boolean;
    /** Evaluate X at fractional position. */
    abstract fractionToX(fraction: number): number;
    /** Evaluate Y at fractional position. */
    abstract fractionToY(fraction: number): number;
    /** Evaluate derivative of X with respect to fraction at fractional position. */
    abstract fractionToDX(fraction: number): number;
    /** Evaluate derivative of Y with respect to fraction at fractional position. */
    abstract fractionToDY(fraction: number): number;
    /** Evaluate second derivative of X with respect to fraction at fractional position. */
    abstract fractionToDDX(fraction: number): number;
    /** Evaluate second derivative of Y with respect to fraction at fractional position. */
    abstract fractionToDDY(fraction: number): number;
    /** Evaluate both X and Y at fractional coordinate, return bundled as a point. */
    /** Evaluate second derivative of X with respect to fraction at fractional position. */
    abstract fractionToD3X(fraction: number): number;
    /** Evaluate second derivative of Y with respect to fraction at fractional position. */
    abstract fractionToD3Y(fraction: number): number;
    /** Evaluate both X and Y at fractional coordinate, return bundled as a point. */
    fractionToPoint(fraction: number, result?: Point3d): Point3d;
    /** Evaluate both X and Y and their first derivatives at fractional coordinate, return bundled as origin and (non-unit) direction vector. */
    fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
    /** Evaluate both X and Y and their second derivatives at fractional coordinate, return bundled as origin and (non-unit) vectorU an vectorV. */
    fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Return the magnitude of the tangent vector at fraction.
     * @param fraction fractional position along the curve
     */
    fractionToTangentMagnitude(fraction: number): number;
    /** Invert the fractionToX function for given X. */
    abstract xToFraction(x: number): number | undefined;
    /** Initialize class level work arrays for 5 point Gaussian Quadrature. */
    protected static _gaussX: Float64Array;
    protected static _gaussWeight: Float64Array;
    protected static _gaussMapper: (xA: number, xB: number, arrayX: Float64Array, arrayW: Float64Array) => number;
    static initWorkSpace(): void;
    /**
     * Integrate between nominal fractions with default gauss rule.
     * * The caller is expected to choose nearby fractions so that the single gauss interval accuracy is good.
     * @param fraction0
     * @param fraction1
     */
    integrateDistanceBetweenFractions(fraction0: number, fraction1: number): number;
    /**
     * Inverse integrated distance
     * @param fraction0 start of fraction interval
     * @param fraction1 end of fraction interval
     * @param distance0 distance at start
     * @param distance1 distance at end
     * @param targetDistance intermediate distance.
     */
    inverseDistanceFraction(fraction0: number, fraction1: number, distance0: number, distance1: number, targetDistance: number): number | undefined;
    /**
     *
     * @param fraction fractional position along x axis
     * @param xy xy coordinates of point on the curve
     * @param d1xy
     * @param d2xy
     * @param d3xy
     */
    fractionToPointAnd3Derivatives(fraction: number, xy: Point3d, d1xy?: Vector3d, d2xy?: Vector3d, d3xy?: Vector3d): void;
    /** Apply a uniform scale around the origin. */
    abstract scaleInPlace(scaleFactor: number): void;
}
