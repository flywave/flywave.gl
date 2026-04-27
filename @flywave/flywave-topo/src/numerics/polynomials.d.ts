import { AngleSweep } from "../geometry3d/angle-sweep";
import { type OptionalGrowableFloat64Array, GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { LongitudeLatitudeNumber } from "../geometry3d/longitude-latitude-altitude";
import { Point2d, Vector2d } from "../geometry3d/point2d-vector2d";
import { type XYZ, Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Range1d, Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type XAndY } from "../geometry3d/xyz-props";
import { type Point4d } from "../geometry4d/point4d";
/**
 * degree 2 (quadratic) polynomial in for y = c0 + c1*x + c2*x^2
 * @internal
 */
export declare class Degree2PowerPolynomial {
    /** The three coefficients for the quartic */
    coffs: number[];
    constructor(c0?: number, c1?: number, c2?: number);
    /**
     * * Return 2 duplicate roots in double root case.
     * * The solutions are always in algebraic order.
     * @returns 0, 1, or 2 solutions of the usual quadratic (a*x*x + b * x + c = 0)
     */
    static solveQuadratic(a: number, b: number, c: number): number[] | undefined;
    /** Add `a` to the constant term. */
    addConstant(a: number): void;
    /** Add  `s * (a + b*x)^2` to the quadratic coefficients */
    addSquaredLinearTerm(a: number, b: number, s?: number): void;
    /** Return the real roots of this polynomial */
    realRoots(): number[] | undefined;
    /** Evaluate the quadratic at x. */
    evaluate(x: number): number;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluateDerivative(x: number): number;
    /** Factor the polynomial in to the form `y0 + c * (x-x0)^2)`, i.e. complete the square. */
    tryGetVertexFactorization(): {
        x0: number;
        y0: number;
        c: number;
    } | undefined;
    /** Construct a quadratic from input form `c2 * (x-root0) * (x-root1)` */
    static fromRootsAndC2(root0: number, root1: number, c2?: number): Degree2PowerPolynomial;
}
/**
 * degree 3 (cubic) polynomial in for y = c0 + c1*x + c2*x^2 + c3*x^3
 * @internal
 */
export declare class Degree3PowerPolynomial {
    /** polynomial coefficients, index corresponds to power */
    coffs: number[];
    constructor(c0?: number, c1?: number, c2?: number, c3?: number);
    /** Add `a` to the constant term. */
    addConstant(a: number): void;
    /** Add `s * (a + b*x)^2` to the cubic */
    addSquaredLinearTerm(a: number, b: number, s?: number): void;
    /**
     * Evaluate the polynomial at x
     * @param u parameter for evaluation
     */
    evaluate(x: number): number;
    /**
     * Evaluate the polynomial derivative
     * @param u parameter for evaluation
     */
    evaluateDerivative(x: number): number;
    /** Construct a cubic from the form `c3 * (x-root0) * (x - root1) * (x- root2)` */
    static fromRootsAndC3(root0: number, root1: number, root2: number, c3?: number): Degree3PowerPolynomial;
}
/**
 * degree 4 (quartic) polynomial in for y = c0 + c1*x + c2*x^2 + c4*x^4
 * @internal
 */
export declare class Degree4PowerPolynomial {
    /** polynomial coefficients, index corresponds to power */
    coffs: number[];
    constructor(c0?: number, c1?: number, c2?: number, c3?: number, c4?: number);
    /** Add `a` to the constant term. */
    addConstant(a: number): void;
    /**
     * Evaluate the polynomial
     * @param x x coordinate for evaluation
     */
    evaluate(x: number): number;
    /**
     * Evaluate the derivative
     * @param x x coordinate for evaluation
     */
    evaluateDerivative(x: number): number;
    /** Construct a quartic from the form `c3 * (x-root0) * (x - root1) * (x- root2) * (x-root3)` */
    static fromRootsAndC4(root0: number, root1: number, root2: number, root3: number, c4?: number): Degree4PowerPolynomial;
}
/**
 * polynomial services for an implicit torus with
 * * z axis is "through the donut hole"
 * * `majorRadius` is the radius of the circle "around the z axis"
 * * `minorRadius` is the radius of circles around the major circle
 * * for simple xyz the implicit form is
 *   * `(x^2+y^2+z^2+(R^2-r^2))^2 = 4 R^2(x^2+y^2)`
 * * In weighted form
 *   * `(x^2+y^2+z^2+(R^2-r^2)w^2)^2 = 4 R^2 w^2 (x^2+y^2)`
 * @internal
 */
export declare class TorusImplicit {
    /** major (xy plane) radius */
    majorRadius: number;
    /** hoop (perpendicular to major circle) radius */
    minorRadius: number;
    constructor(majorRadius: number, minorRadius: number);
    /** Return sum of (absolute) major and minor radii, which is (half) the box size in x and y directions */
    boxSize(): number;
    /** Return scale factor appropriate to control the magnitude of the implicit function. */
    implicitFunctionScale(): number;
    /**
     * At space point (x,y,z) evaluate the implicit form of the torus (See `ImplicitTorus`)
     */
    evaluateImplicitFunctionXYZ(x: number, y: number, z: number): number;
    /** Evaluate the implicit function at a point. */
    evaluateImplicitFunctionPoint(xyz: Point3d): number;
    /** Evaluate the implicit function at homogeneous coordinates */
    evaluateImplicitFunctionXYZW(x: number, y: number, z: number, w: number): number;
    /** Evaluate the surface point at angles (in radians) on the major and minor circles. */
    evaluateThetaPhi(thetaRadians: number, phiRadians: number): Point3d;
    /** Evaluate partial derivatives at angles (int radians) on major and minor circles. */
    evaluateDerivativesThetaPhi(thetaRadians: number, phiRadians: number, dxdTheta: Vector3d, dxdPhi: Vector3d): void;
    /** Evaluate space point at major and minor angles (in radians) and distance from major hoop. */
    evaluateThetaPhiDistance(thetaRadians: number, phiRadians: number, distance: number): Point3d;
    /** Given an xyz coordinate in the local system of the toroid, compute the torus parametrization
     * * theta = angular coordinate in xy plane
     * * phi = angular coordinate in minor circle.
     * * distance = distance from major circle
     * * rho = distance from origin to xy part of the input.
     * @param xyz space point in local coordinates.
     * @return object with properties theta, phi, distance, rho
     */
    xyzToThetaPhiDistance(xyz: Point3d): {
        theta: number;
        phi: number;
        distance: number;
        rho: number;
        safePhi: boolean;
    };
}
/**
 * evaluation methods for an implicit sphere
 * * xyz function `x*x + y*y + z*z - r*r = 0`.
 * * xyzw function `x*x + y*y + z*z - r*r*w*w = 0`.
 * @internal
 */
export declare class SphereImplicit {
    /** Radius of sphere. */
    radius: number;
    constructor(r: number);
    /** Evaluate the implicit function at coordinates x,y,z */
    evaluateImplicitFunction(x: number, y: number, z: number): number;
    /** Evaluate the implicit function at homogeneous coordinates x,y,z,w */
    evaluateImplicitFunctionXYZW(wx: number, wy: number, wz: number, w: number): number;
    /** Given an xyz coordinate in the local system of the toroid, compute the sphere parametrization
     * * theta = angular coordinate in xy plane
     * * phi = rotation from xy plane towards z axis.
     * @param xyz space point in local coordinates.
     * @return object with properties thetaRadians, phi, r
     */
    xyzToThetaPhiR(xyz: Point3d): {
        thetaRadians: number;
        phiRadians: number;
        r: number;
        valid: boolean;
    };
    /** Return the range of a uv-aligned patch of the sphere. */
    static patchRangeStartEndRadians(center: Point3d, radius: number, theta0Radians: number, theta1Radians: number, phi0Radians: number, phi1Radians: number, result?: Range3d): Range3d;
    /** Compute intersections with a ray.
     * * Return the number of intersections
     * * Fill any combinations of arrays of
     *    * rayFractions = fractions along the ray
     *    * xyz = xyz intersection coordinates points in space
     *    * thetaPhiRadians = sphere longitude and latitude in radians.
     * * For each optional array, caller must of course initialize an array (usually empty)
     */
    static intersectSphereRay(center: Point3d, radius: number, ray: Ray3d, rayFractions: number[] | undefined, xyz: Point3d[] | undefined, thetaPhiRadians: LongitudeLatitudeNumber[] | undefined): number;
    /** Compute the point on a sphere at angular coordinates.
     * @param thetaRadians latitude angle
     * @param phiRadians longitude angle
     */
    evaluateThetaPhi(thetaRadians: number, phiRadians: number, result?: Point3d): Point3d;
    /**
     * * convert radians to xyz on unit sphere
     * * Note that there is no radius used -- implicitly radius is 1
     * * Evaluation is always to a preallocated xyz.
     */
    static radiansToUnitSphereXYZ(thetaRadians: number, phiRadians: number, xyz: XYZ): void;
    /** Compute the derivatives with respect to spherical angles.
     * @param thetaRadians latitude angle
     * @param phiRadians longitude angle
     */
    evaluateDerivativesThetaPhi(thetaRadians: number, phiRadians: number, dxdTheta: Vector3d, dxdPhi: Vector3d): void;
}
/** AnalyticRoots has static methods for solving quadratic, cubic, and quartic equations.
 * @internal
 *
 */
export declare class AnalyticRoots {
    private static readonly _EQN_EPS;
    private static readonly _safeDivideFactor;
    /** Absolute zero test with a tolerance that has worked well for the analytic root use case . . . */
    private static isZero;
    /** Without actually doing a division, test if (x/y) is small.
     * @param x numerator
     * @param y denominator
     * @param absTol absolute tolerance
     * @param relTol relative tolerance
     */
    private static isSmallRatio;
    /** Return the (real, signed) principal cube root of x */
    static cbrt(x: number): number;
    /**
     * Try to divide `numerator/denominator` and place the result (or defaultValue) in `values[offset]`
     * @param values array of values.  `values[offset]` will be replaced.
     * @param numerator numerator for division.
     * @param denominator denominator for division.
     * @param defaultValue value to save if denominator is too small to divide.
     * @param offset index of value to replace.
     */
    private static safeDivide;
    private static checkRootProximity;
    private static newtonMethodAdjustment;
    private static improveRoots;
    /**
     * Append (if defined) value to results.
     * @param value optional value to append
     * @param results growing array
     */
    private static appendSolution;
    /**
     * Append 2 solutions -- note that both are required args, no option of omitting as in single solution case
     * @param value1
     * @param value2
     * @param results
     */
    private static append2Solutions;
    /**
     * If `co/c1` is a safe division, append it to the values array.
     * @param c0 numerator
     * @param c1 denominator
     * @param values array to expand
     */
    static appendLinearRoot(c0: number, c1: number, values: GrowableFloat64Array): void;
    /**
     * * Compute the mean of all the entries in `data`
     * * Return the data value that is farthest away
     */
    static mostDistantFromMean(data: GrowableFloat64Array | undefined): number;
    /**
     * Append 0, 1, or 2 solutions of a quadratic to the values array.
     * @param c array of coefficients for quadratic `c[0] + c[1] * x + c[2] * x*x`
     * @param values array to be expanded.
     */
    static appendQuadraticRoots(c: Float64Array | number[], values: GrowableFloat64Array): void;
    /** Add `a` to the constant term. */
    private static addConstant;
    private static signedCubeRoot;
    /**
     * RWD Nickalls Cubic solution
     * The Mathematical Gazette (1993) (vol 77) pp 354-359
     * * ASSUME a is nonzero.
     */
    private static appendFullCubicSolutions;
    /** Compute roots of cubic 'c[0] + c[1] * x + c[2] * x^2 + c[3] * x^3 */
    static appendCubicRoots(c: Float64Array | number[], results: GrowableFloat64Array): void;
    /** Compute roots of quartic 'c[0] + c[1] * x + c[2] * x^2 + c[3] * x^3 + c[4] * x^4 */
    static appendQuarticRoots(c: Float64Array | number[], results: GrowableFloat64Array): void;
    private static appendCosSinRadians;
    /**
     * * Solve the simultaneous equations in variables`c` and`s`:
     *   * A line: `alpha + beta*c + gamma*s = 0`
     *   * The unit circle `c*c + s*s = 1`
     * * Solution values are returned as 0, 1, or 2(c, s) pairs
     * * Return value indicates one of these solution states:
     *   * -2 -- all coefficients identically 0.   The entire c, s plane-- and therefore the entire unit circle-- is a solution.
     *   * -1 -- beta, gamma are zero, alpha is not.There is no line defined.There are no solutions.
     *   * 0 -- the line is well defined, but passes completely outside the unit circle.
     *     * In this case, (c1, s1) is the circle point closest to the line and(c2, s2) is the line point closest to the circle.
     * * 1 -- the line is tangent to the unit circle.
     *   * Tangency is determined by tolerances, which calls a "close approach" point a tangency.
     *    * (c1, s1) is the closest circle point
     *    * (c2, s2) is the line point.
     * * 2 -- two simple intersections.
     * @param alpha constant coefficient on line
     * @param beta x cosine coefficient on line
     * @param gamma y sine coefficient on line
     * @param relTol relative tolerance for tangencies
     * @param cosValues (caller allocated) array to receive solution `c` values
     * @param sinValues (caller allocated) array to receive solution `s` values
     * @param radiansValues (caller allocated) array to receive solution radians values.
     */
    static appendImplicitLineUnitCircleIntersections(alpha: number, beta: number, gamma: number, cosValues: OptionalGrowableFloat64Array, sinValues: OptionalGrowableFloat64Array, radiansValues: OptionalGrowableFloat64Array, relTol?: number): number;
}
/**
 * Manipulations of polynomials with where `coff[i]` multiplies x^i
 * @internal
 */
export declare class PowerPolynomial {
    /** Evaluate a standard basis polynomial at `x`, with `degree` possibly less than `coff.length` */
    static degreeKnownEvaluate(coff: Float64Array, degree: number, x: number): number;
    /** Evaluate the standard basis polynomial of degree `coff.length` at `x` */
    static evaluate(coff: Float64Array, x: number): number;
    /**
     * * Accumulate Q*scale into P. Both are treated as full degree.
     * * (Expect Address exceptions if P is smaller than Q)
     * * Returns degree of result as determined by comparing trailing coefficients to zero
     */
    static accumulate(coffP: Float64Array, coffQ: Float64Array, scaleQ: number): number;
    /** Zero all coefficients */
    static zero(coff: Float64Array): void;
}
/**
 * manipulation of polynomials with powers of sine and cosine
 * @internal
 */
export declare class TrigPolynomial {
    private static readonly _smallAngle;
    /** Standard Basis coefficients for rational sine numerator. */
    static readonly S: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for rational cosine numerator. */
    static readonly C: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for rational denominator. */
    static readonly W: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for cosine*weight numerator */
    static readonly CW: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for sine*weight numerator */
    static readonly SW: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for sine*cosine numerator */
    static readonly SC: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for sine^2 numerator */
    static readonly SS: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for cosine^2 numerator */
    static readonly CC: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for weight^2 */
    static readonly WW: Float64Array<ArrayBuffer>;
    /** Standard Basis coefficients for (Math.Cos^2 - sine^2) numerator */
    static readonly CCminusSS: Float64Array<ArrayBuffer>;
    /**
     *  Solve a polynomial created from trigonometric condition using
     * Trig.S, Trig.C, Trig.W.  Solution logic includes inferring angular roots
     * corresponding zero leading coefficients (roots at infinity)
     * @param coff Coefficients
     * @param nominalDegree degree of the polynomial under most complex
     *     root case.  If there are any zero coefficients up to this degree, a single root
     *     "at infinity" is recorded as its corresponding angular parameter at negative pi/2
     * @param referenceCoefficient A number which represents the size of coefficients
     *     at various stages of computation.  A small fraction of this will be used as a zero
     *     tolerance
     * @param angles Roots are placed here. Assumed preallocated with adequate size.
     * @param numRoots Number of roots  .  Zero roots is possible. (Passed as array of size
     * one to pass-by-reference)
     * Returns false if equation is all zeros.   This usually means any angle is a solution.
     */
    static solveAngles(coff: Float64Array, nominalDegree: number, referenceCoefficient: number, radians: number[]): boolean;
    private static readonly _coefficientRelTol;
    /**
     * Compute intersections of unit circle `x^2 + y^2 = 1` with general quadric
     * `axx * x^2 + axy * x * y + ayy * y^2 + ax * x + ay * y + a1 = 0`
     * Solutions are returned as angles. Sine and Cosine of the angles are the x, y results.
     * @param axx  Coefficient of x^2
     * @param axy  Coefficient of xy
     * @param ayy  Coefficient of y^2
     * @param ax  Coefficient of x
     * @param ay  Coefficient of y
     * @param a1  Constant coefficient
     * @param radians  solution angles
     * @param numAngle  number of solution angles(Passed as array to make changes to reference)
     */
    static solveUnitCircleImplicitQuadricIntersection(axx: number, axy: number, ayy: number, ax: number, ay: number, a1: number, radians: number[]): boolean;
    /**
     * Compute intersections of unit circle x^2 + y 2 = 1 with the ellipse
     *         (x,y) = (cx + ux Math.Cos + vx sin, cy + uy Math.Cos + vy sin)
     * Solutions are returned as angles in the ellipse space.
     * @param cx center x
     * @param cy center y
     * @param ux 0 degree vector x
     * @param uy 0 degree vector y
     * @param vx 90 degree vector x
     * @param vy 90 degree vector y
     * @param ellipseRadians solution angles in ellipse parameter space
     * @param circleRadians solution angles in circle parameter space
     */
    static solveUnitCircleEllipseIntersection(cx: number, cy: number, ux: number, uy: number, vx: number, vy: number, ellipseRadians: number[], circleRadians: number[]): boolean;
    /**
     * Compute intersections of unit circle x^2 + y^2 = w^2 with the ellipse
     *         (x,y) = (cx + ux Math.Cos + vx sin, cy + uy Math.Cos + vy sin)/ (cw + uw Math.Cos + vw * Math.Sin)
     * Solutions are returned as angles in the ellipse space.
     * @param cx center x
     * @param cy center y
     * @param cw center w
     * @param ux 0 degree vector x
     * @param uy 0 degree vector y
     * @param uw 0 degree vector w
     * @param vx 90 degree vector x
     * @param vy 90 degree vector y
     * @param vw 90 degree vector w
     * @param ellipseRadians solution angles in ellipse parameter space
     * @param circleRadians solution angles in circle parameter space
     */
    static solveUnitCircleHomogeneousEllipseIntersection(cx: number, cy: number, cw: number, ux: number, uy: number, uw: number, vx: number, vy: number, vw: number, ellipseRadians: number[], circleRadians: number[]): boolean;
}
/**
 * static methods for commonly appearing sets of equations in 2 or 3 variables
 * @public
 */
export declare class SmallSystem {
    /**
     * Return true if lines (a0,a1) to (b0, b1) have a simple intersection.
     * Return the fractional (not xy) coordinates in result.x, result.y
     * @param a0 start point of line a
     * @param a1  end point of line a
     * @param b0  start point of line b
     * @param b1 end point of line b
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static lineSegment2dXYTransverseIntersectionUnbounded(a0: Point2d, a1: Point2d, b0: Point2d, b1: Point2d, result: Vector2d): boolean;
    /**
     * * (ax0,ay0) to (ax0+ux,ay0+uy) are line A.
     * * (bx0,by0) to (bx0+vx,by0+vy) are lineB.
     * * Return true if the lines have a simple intersection.
     * * Return the fractional (not xy) coordinates in result.x, result.y
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static lineSegmentXYUVTransverseIntersectionUnbounded(ax0: number, ay0: number, ux: number, uy: number, bx0: number, by0: number, vx: number, vy: number, result: Vector2d): boolean;
    /**
     * Return true if lines (a0,a1) to (b0, b1) have a simple intersection using only xy parts
     * Return the fractional (not xy) coordinates in result.x, result.y
     * @param a0 start point of line a
     * @param a1  end point of line a
     * @param b0  start point of line b
     * @param b1 end point of line b
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static lineSegment3dXYTransverseIntersectionUnbounded(a0: Point3d, a1: Point3d, b0: Point3d, b1: Point3d, result: Vector2d): boolean;
    /**
     * Return true if lines (a0,a1) to (b0, b1) have a simple intersection using only xy parts of WEIGHTED 4D Points
     * Return the fractional (not xy) coordinates in result.x, result.y
     * @param hA0 homogeneous start point of line a
     * @param hA1 homogeneous end point of line a
     * @param hB0 homogeneous start point of line b
     * @param hB1 homogeneous end point of line b
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static lineSegment3dHXYTransverseIntersectionUnbounded(hA0: Point4d, hA1: Point4d, hB0: Point4d, hB1: Point4d, result?: Vector2d): Vector2d | undefined;
    /**
     * Return the line fraction at which the (homogeneous) line is closest to a space point as viewed in xy only.
     * @param hA0 homogeneous start point of line a
     * @param hA1 homogeneous end point of line a
     * @param spacePoint homogeneous point in space
     */
    static lineSegment3dHXYClosestPointUnbounded(hA0: Point4d, hA1: Point4d, spacePoint: Point4d): number | undefined;
    /**
     * Return the line fraction at which the line is closest to a space point as viewed in xy only.
     * @param pointA0 start point
     * @param pointA1 end point
     * @param spacePoint homogeneous point in space
     */
    static lineSegment3dXYClosestPointUnbounded(pointA0: XAndY, pointA1: XAndY, spacePoint: XAndY): number | undefined;
    /**
     * Return the line fraction at which the line is closest to a space point
     * @param pointA0 start point
     * @param pointA1 end point
     * @param spacePoint homogeneous point in space
     */
    static lineSegment3dClosestPointUnbounded(pointA0: Point3d, pointA1: Point3d, spacePoint: Point3d): number | undefined;
    /**
     * Return true if lines (a0,a1) to (b0, b1) have closest approach (go by each other) in 3d
     * Return the fractional (not xy) coordinates in result.x, result.y
     * @param a0 start point of line a
     * @param a1  end point of line a
     * @param b0  start point of line b
     * @param b1 end point of line b
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static lineSegment3dClosestApproachUnbounded(a0: Point3d, a1: Point3d, b0: Point3d, b1: Point3d, result: Vector2d): boolean;
    /**
     * Return true if lines (a0,a1) to (b0, b1) have closest approach (go by each other) in 3d
     * Return the fractional (not xy) coordinates as x and y parts of a Point2d.
     * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
     */
    static ray3dXYZUVWClosestApproachUnbounded(ax: number, ay: number, az: number, au: number, av: number, aw: number, bx: number, by: number, bz: number, bu: number, bv: number, bw: number, result: Vector2d): boolean;
    /**
     * Solve the pair of linear equations
     * * `ux * x + vx * y = cx`
     * * `uy * x + vy * y = cy`
     * @param ux xx coefficient
     * @param vx xy coefficient
     * @param uy yx coefficient
     * @param vy yy coefficient
     * @param cx x right hand side
     * @param cy y right hand side
     * @param result (x,y) solution (MUST be preallocated by caller)
     */
    static linearSystem2d(ux: number, vx: number, // first row of matrix
    uy: number, vy: number, // second row of matrix
    cx: number, cy: number, // right side
    result: Vector2d): boolean;
    /**
     * Solve a linear system
     * * x equation: `ux *u * vx * v + wx * w = cx`
     * * y equation: `uy *u * vy * v + wy * w = cy`
     * * z equation: `uz *u * vz * v + wz * w = cz`
     * @param axx row 0, column 0 coefficient
     * @param axy row 0, column 1 coefficient
     * @param axz row 0, column 1 coefficient
     * @param ayx row 1, column 0 coefficient
     * @param ayy row 1, column 1 coefficient
     * @param ayz row 1, column 2 coefficient
     * @param azx row 2, column 0 coefficient
     * @param azy row 2, column 1 coefficient
     * @param azz row 2, column 2 coefficient
     * @param cx right hand side row 0 coefficient
     * @param cy right hand side row 1 coefficient
     * @param cz right hand side row 2 coefficient
     * @param result optional result.
     */
    static linearSystem3d(axx: number, axy: number, axz: number, // first row of matrix
    ayx: number, ayy: number, ayz: number, // second row of matrix
    azx: number, azy: number, azz: number, // second row of matrix
    cx: number, cy: number, cz: number, // right side
    result?: Vector3d): Vector3d | undefined;
    /**
     * Compute the intersection of three planes.
     * @param xyzA point on the first plane
     * @param normalA normal of the first plane
     * @param xyzB point on the second plane
     * @param normalB normal of the second plane
     * @param xyzC point on the third plane
     * @param normalC normal of the third plane
     * @param result optional result
     * @returns intersection point of the three planes (as a Vector3d), or undefined if at least two planes are parallel.
     */
    static intersect3Planes(xyzA: Point3d, normalA: Vector3d, xyzB: Point3d, normalB: Vector3d, xyzC: Point3d, normalC: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * * in rowB, replace `rowB[j] += a * rowB[pivot] * rowA[j] / rowA[pivot]` for `j>pivot`
     * @param rowA row that does not change
     * @param pivotIndex index of pivot (divisor) in rowA.
     * @param rowB row where elimination occurs.
     */
    static eliminateFromPivot(rowA: Float64Array, pivotIndex: number, rowB: Float64Array, a: number): boolean;
    /**
     * Solve a pair of bilinear equations
     * * First equation: `a0 + b0 * u + c0 * v + d0 * u * v = 0`
     * * Second equation: `a0 + b0 * u + c0 * v + d0 * u * v = 0`
     */
    static solveBilinearPair(a0: number, b0: number, c0: number, d0: number, a1: number, b1: number, c1: number, d1: number): Point2d[] | undefined;
}
/**
 * * bilinear expression
 * * `f(u,v) = a + b * u * c * v + d * u * v`
 * @internal
 */
export declare class BilinearPolynomial {
    /** constant coefficient */
    a: number;
    /** u coefficient */
    b: number;
    /** v coefficient */
    c: number;
    /** uv coefficient */
    d: number;
    /**
     *
     * @param a constant coefficient
     * @param b `u` coefficient
     * @param c `v` coefficient
     * @param d `u*v` coefficient
     */
    constructor(a: number, b: number, c: number, d: number);
    /**
     * Evaluate the bilinear expression at u,v
     */
    evaluate(u: number, v: number): number;
    /** Create a bilinear polynomial z=f(u,v) given z values at 00, 10, 01, 11.
     */
    static createUnitSquareValues(f00: number, f10: number, f01: number, f11: number): BilinearPolynomial;
    /**
     * Solve the simultaneous equations
     * * `p(u,v) = pValue`
     * * `q(u,v) = qValue`
     * @param p
     * @param pValue
     * @param q
     * @param qValue
     */
    static solvePair(p: BilinearPolynomial, pValue: number, q: BilinearPolynomial, qValue: number): Point2d[] | undefined;
}
/**
 * * trigonometric expresses `f(theta) = a + cosineCoff * cos(theta) + sineCoff * sin(theta)`
 * @internal
 */
export declare class SineCosinePolynomial {
    /** constant coefficient */
    a: number;
    /** cosine coefficient */
    cosineCoff: number;
    /** sine coefficient */
    sineCoff: number;
    /**
     *
     * @param a constant coefficient
     * @param cosineCoff `cos(theta)` coefficient
     * @param sinCoff `sin(theta)` coefficient
     */
    constructor(a: number, cosCoff: number, sinCoff: number);
    /** set all coefficients */
    set(a: number, cosCoff: number, sinCoff: number): void;
    /** Return the function value at given angle in radians */
    evaluateRadians(theta: number): number;
    /** Return the range of function values over the entire angle range. */
    range(result?: Range1d): Range1d;
    /** Return the min and max values of the function over theta range from radians0 to radians1  inclusive. */
    rangeInStartEndRadians(radians0: number, radians1: number, result?: Range1d): Range1d;
    /** Return the min and max values of the function over theta range from radians0 to radians1  inclusive. */
    rangeInSweep(sweep: AngleSweep, result?: Range1d): Range1d;
    /**
     * Return a representative angle (in radians) for min and max values.
     * * The radians value is atan2(sineCoff, cosineCoff)
     * * Hence the candidates for min and max of the function are at this value and this value plus PI
     */
    referenceMinMaxRadians(): number;
}
/**
 * Support for an implicit linear equation (half space)
 * f(x,y) = a0 + x * ax + y * ay
 * @internal
 */
export declare class ImplicitLineXY {
    /**
     * constant coefficient
     */
    a: number;
    /**
     * x coefficient
     */
    ax: number;
    /**
     * y coefficient
     */
    ay: number;
    /** construct the ImplicitLineXY from coefficients */
    constructor(a: number, ax: number, ay: number);
    /** Compute 2 points of a line segment with
     * * the segment is on the zero-line of this ImplicitLineXY
     * * the start and endpoints are distance `b` from the projection of the origin onto the ImplicitLineXY
     * @returns undefined if ax,ay are both zero.   Otherwise the two points of the segment.
     */
    convertToSegmentPoints(b: number): Point3d[] | undefined;
    /**
     * Evaluate the half-space function at an xy point
     * @param xy xy values for evaluation
     * @returns evaluation.
     */
    evaluatePoint(xy: XAndY): number;
    /**
     * add scale * (a,ax,ay) to the respective coefficients.
     */
    addScaledCoefficientsInPlace(a: number, ax: number, ay: number, scale: number): void;
}
