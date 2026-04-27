import { type GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { type Degree3PowerPolynomial, type Degree4PowerPolynomial } from "./polynomials";
/**
 * * BezierCoffs is an abstract base class for one-dimensional (u to f(u)) Bezier polynomials.
 * * The base class carries a Float64Array with coefficients.
 * * The Float64Array is NOT Growable unless derived classes add logic to do so.  Its length is the Bezier polynomial order.
 * * The family of derived classes is starts with low order (at least linear through cubic) with highly optimized calculations.
 * * The general degree Bezier class also uses this as its base class.
 * * The length of the coefficient array is NOT always the bezier order.   Use the `order` property to access the order.
 * @internal
 */
export declare abstract class BezierCoffs {
    /** Array of coefficients.
     * * The number of coefficients is the order of the Bezier polynomial.
     */
    coffs: Float64Array;
    /**
     * * If `data` is a number, an array of that size is created with zeros.
     * * If `data` is a Float64Array, it is cloned (NOT CAPTURED)
     * * If `data` is a number array, its values are copied.
     */
    constructor(data: number | Float64Array | number[]);
    /**
     * * Ensure the coefficient array size matches order.  (Reallocate as needed)
     * * fill with zeros.
     * @param order required order
     */
    protected allocateToOrder(order: number): void;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @param buffer optional destination for values.   ASSUMED large enough for order.
     * @returns Return a (newly allocated) array of basis function values.
     */
    abstract basisFunctions(u: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    abstract sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions derivatives at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    abstract sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** Return a deep clone of this bezier. */
    abstract clone(): BezierCoffs;
    /**
     * create an object of same order with zero coefficients.
     * The base implementation makes a generic Bezier of the same order.
     */
    createPeer(): BezierCoffs;
    /** Evaluate the polynomial at u.
     * @param u bezier parameter for evaluation.
     */
    abstract evaluate(u: number): number;
    /** The order (number of coefficients) as a readable property  */
    get order(): number;
    /** Copy coefficients from other Bezier. Note that the coefficient count (order) of "this" can change. */
    copyFrom(other: BezierCoffs): void;
    /**
     * Apply a scale factor to all coefficients.
     * @param scale scale factor to apply to all coefficients.
     */
    scaleInPlace(scale: number): void;
    /** add a constant to each coefficient.
     * @param a constant to add.
     */
    addInPlace(a: number): void;
    /** Compute parameter values where the bezier value matches targetValue.
     * * The base class finds roots only in 01.  (i.e. ignores _restrictTo01)
     * * Order-specific implementations apply special case analytic logic, e.g. for degree 1,2,3,4.
     */
    roots(targetValue: number, _restrictTo01: boolean): number[] | undefined;
    /** Given an array of numbers, optionally remove those not in the 0..1 interval.
     * @param roots candidate values
     * @param restrictTo01 If false, no filtering occurs and the pointer to the original array is unchanged.
     *     If true, filtering is done and values are returned, possibly in a new array and possibly in the original.
     */
    filter01(roots: number[] | undefined, restrictTo01?: boolean): number[] | undefined;
    /** zero out all coefficients. */
    zero(): void;
    /** Subdivide -- write results into caller-supplied bezier coffs (which must be of the same order) */
    subdivide(u: number, left: BezierCoffs, right: BezierCoffs): boolean;
    /** Return the maximum absolute difference between coefficients of two sets of BezierCoffs */
    static maxAbsDiff(dataA: BezierCoffs, dataB: BezierCoffs): number | undefined;
}
/**
 * Static methods to operate on univariate bezier polynomials, with coefficients in simple Float64Array or as components of blocked arrays.
 * @internal
 */
export declare class BezierPolynomialAlgebra {
    /**
     * * Univariate bezierA has its coefficients at offset indexA in each block within the array of blocks.
     * * Symbolically:   `product(s) += scale * (constA - polynomialA(s)) *polynomialB(s)`
     * * Where coefficients of polynomialA(s) are in column indexA and coefficients of polynomialB(s) are differences within column indexB.
     * * Treating data as 2-dimensional array:   `product = sum (iA) sum (iB)    (constA - basisFunction[iA} data[indexA][iA]) * basisFunction[iB] * (dataOrder-1)(data[iB + 1][indexB] - data[iB][indexB])`
     * * Take no action if product length is other than `dataOrder + dataOrder - 2`
     */
    static accumulateScaledShiftedComponentTimesComponentDelta(product: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, scale: number, indexA: number, constA: number, indexB: number): void;
    /**
     * * Univariate bezierA has its coefficients at offset indexA in each block within the array of blocks.
     * * Univariate bezierB has its coefficients at offset indexB in each block within the array of blocks.
     * * return the sum coefficients for `constA * polynomialA + constB * polynomialB`
     * * Symbolically:   `product(s) = (constA * polynomialA(s) + constB * polynomialB(s)`
     * * The two polynomials are the same order, so this just direct sum of scaled coefficients.
     *
     * * Take no action if product length is other than `dataOrder + dataOrder - 2`
     */
    static scaledComponentSum(sum: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, indexA: number, constA: number, indexB: number, constB: number): void;
    /**
     * * Univariate bezier has its coefficients at offset index in each block within the array of blocks.
     * * return the (dataOrder - 1) differences,
     *
     * * Take no action if difference length is other than `dataOrder - 1`
     */
    static componentDifference(difference: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, index: number): void;
    /**
     * * Univariate bezierA has its coefficients in dataA[i]
     * * Univariate bezierB has its coefficients in dataB[i]
     * * return the product coefficients for polynomialA(s) * polynomialB(s) * scale
     * * Take no action if product length is other than `orderA + orderB - 1`
     */
    static accumulateProduct(product: Float64Array, dataA: Float64Array, dataB: Float64Array, scale?: number): void;
    /**
     * * Univariate bezierA has its coefficients in dataA[i]
     * * Univariate bezierB has its coefficients in dataB[i]
     * * return the product coefficients for polynomialADifferences(s) * polynomialB(s) * scale
     * * Take no action if product length is other than `orderA + orderB - 2`
     */
    static accumulateProductWithDifferences(product: Float64Array, dataA: Float64Array, dataB: Float64Array, scale?: number): void;
    /**
     * * Univariate bezier has its coefficients in data[i]
     * * return the difference data[i+1]-data[i] in difference.
     * * Take no action if product length is other than `orderA + orderB - 1`
     */
    static univariateDifference(data: Float64Array, difference: Float64Array): void;
    /**
     * * Univariate bezierA has its coefficients in dataA[i]
     * * Univariate bezierB has its coefficients in resultB[i]
     * * add (with no scaling) bezierA to bezierB
     * * Take no action if resultB.length is other than dataA.length.
     */
    static accumulate(dataA: Float64Array, orderA: number, resultB: Float64Array): void;
}
/**
 * * The UnivariateBezier class is a univariate bezier polynomial with no particular order.
 * * More specific classes -- Order2Bezier, Order3Bezier, Order4Bezier -- can be used when a fixed order is known and the more specialized implementations are appropriate.
 * * When working with xy and xyz curves whose order is the common 2,3,4, various queries (e.g. project point to curve)
 *     generate higher order one-dimensional bezier polynomials with order that is a small multiple of the
 *     curve order.   Hence those polynomials commonly reach degree 8 to 12.
 * * Higher order bezier polynomials are possible, but performance and accuracy issues become significant.
 * * Some machine-level constraints apply for curves of extremely high order, e.g. 70.   For instance, at that level use of
 *     Pascal triangle coefficients becomes inaccurate because IEEE doubles cannot represent integers that
 *     large.
 * @internal
 */
export declare class UnivariateBezier extends BezierCoffs {
    private _order;
    /** Query the order of this bezier. */
    get order(): number;
    constructor(data: number | Float64Array | number[]);
    /** (Re) initialize with given order (and all coffs zero) */
    allocateOrder(order: number): void;
    /** Return a copy, optionally with coffs array length reduced to actual order. */
    clone(compressToMinimalAllocation?: boolean): UnivariateBezier;
    /** Create a new bezier which is a copy of other.
     * * Note that `other` may be a more specialized class such as `Order2Bezier`, but the result is general `Bezier`
     * @param other coefficients to copy.
     */
    static create(other: BezierCoffs): UnivariateBezier;
    /**
     * copy coefficients into a new bezier.
     * @param coffs coefficients for bezier
     */
    static createCoffs(data: number | number[] | Float64Array): UnivariateBezier;
    /**
     * copy coefficients into a new bezier.
     * * if result is omitted, a new UnivariateBezier is allocated and returned.
     * * if result is present but has other order, its coefficients are reallocated
     * * if result is present and has matching order, the values are replace.
     * @param coffs coefficients for bezier
     * @param index0 first index to access
     * @param order number of coefficients, i.e. order for the result
     * @param result optional result.
     *
     */
    static createArraySubset(coffs: number[] | Float64Array, index0: number, order: number, result?: UnivariateBezier): UnivariateBezier;
    /**
     * Create a product of 2 bezier polynomials.
     * @param bezierA
     * @param bezierB
     */
    static createProduct(bezierA: BezierCoffs, bezierB: BezierCoffs): UnivariateBezier;
    /**
     * Add a squared bezier polynomial (given as simple coffs)
     * @param coffA coefficients of bezier to square
     * @param scale scale factor
     * @return false if order mismatch -- must have `2 * bezierA.length  === this.order + 1`
     */
    addSquaredSquaredBezier(coffA: Float64Array, scale: number): boolean;
    /** Add a constant to each coefficient */
    addConstant(a: number): void;
    private _basisValues?;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @returns Return a (newly allocated) array of basis function values.
     */
    basisFunctions(u: number, result?: Float64Array): Float64Array;
    /**
     * Sum weights[i] * data[...] in blocks of numPerBlock.
     * This is for low level use -- counts are not checked.
     * @param weights
     * @param data
     * @param numPerBlock
     */
    private static sumWeightedBlocks;
    /**
     * Given (multidimensional) control points, sum the control points weighted by the basis function values at parameter u.
     * @param u bezier parameter
     * @param polygon Array with coefficients in blocks.
     * @param blockSize size of blocks
     * @param result `blockSize` summed values.
     */
    sumBasisFunctions(u: number, polygon: Float64Array, blockSize: number, result?: Float64Array): Float64Array;
    /**
     * Given (multidimensional) control points, sum the control points weighted by the basis function derivative values at parameter u.
     * @param u bezier parameter
     * @param polygon Array with coefficients in blocks.
     * @param blockSize size of blocks
     * @param result `blockSize` summed values.
     */
    sumBasisFunctionDerivatives(u: number, polygon: Float64Array, blockSize: number, result?: Float64Array): Float64Array;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluate(u: number): number;
    /**
     * Apply deflation from the left to a bezier.
     * * This assumes that the left coefficient is zero.
     */
    deflateLeft(): void;
    /**
     * Apply deflation from the right to a frame.
     * * This assumes that the right coefficient is zero.
     * @param frame frame description
     */
    deflateRight(): void;
    /**
     * * divide the polynomial by `(x-root)`.
     * * return the remainder
     * * If `root` truly is a root, the return is zero.
     * @param root root to remove
     */
    deflateRoot(root: number): number;
    private static _basisBuffer?;
    private static _basisBuffer1?;
    /**
     * Run a Newton iteration from startFraction.
     * @param startFraction [in] fraction for first iteration
     * @param tolerance [in] convergence tolerance.   The iteration is considered converged on the
     * second time the tolerance is satisfied.   For a typical iteration (not double root), the extra pass
     * will double the number of digits.  Hence this tolerance is normally set to 10 to 12 digits, trusting
     * that the final iteration will clean it up to nearly machine precision.
     * @returns final fraction of iteration if converged.  undefined if iteration failed to converge.
     */
    runNewton(startFraction: number, tolerance?: number): number | undefined;
    /** Find roots of a bezier polynomial
     * * As roots are found, deflate the polynomial.
     * * bezier coffs are changed (and order reduced) at each step.
     */
    static deflateRoots(bezier: UnivariateBezier): number[] | undefined;
}
/** Bezier polynomial specialized to order 2 (2 coefficients, straight line function)\
 * @internal
 */
export declare class Order2Bezier extends BezierCoffs {
    constructor(f0?: number, f1?: number);
    /** return an Order2Bezier (linear) with the two coefficients from this Order2Bezier */
    clone(): Order2Bezier;
    /** normally, return fractional coordinate where bezier (a0,a1) has a root.
     * but if the fraction would exceed Geometry.largeFractionResult, return undefined.
     */
    static solveCoffs(a0: number, a1: number): number | undefined;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @returns Return a (newly allocated) array of basis function values.
     */
    basisFunctions(u: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** evaluate the blocked derivative at u.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctionDerivatives(_u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluate(u: number): number;
    /** Same as `roots` method but returns single numeric value instead of array. */
    solve(rightHandSide: number): number | undefined;
    /**
     * Concrete implementation of the abstract roots method
     * @param targetValue target function value.
     * @param restrictTo01 flag for optional second step to eliminate root outside 0..1.
     * @returns If no roots, return undefined.  If single root, return an array with the root.
     */
    roots(targetValue: number, restrictTo01: boolean): number[] | undefined;
}
/** Bezier polynomial specialized to order 3 (3 coefficients, parabola  function)
 * @internal
 */
export declare class Order3Bezier extends BezierCoffs {
    constructor(f0?: number, f1?: number, f2?: number);
    /** Return a deep copy. */
    clone(): Order3Bezier;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @returns Return a (newly allocated) array of basis function values.
     */
    basisFunctions(u: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** evaluate the blocked derivative at u.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /**
     * Add the square of a linear bezier.
     * @param f0 linear factor value at u=0.
     * @param f1 linear factor value at u=1.
     * @param a  scale factor.
     */
    addSquareLinear(f0: number, f1: number, a: number): void;
    /**
     * Concrete implementation of the abstract roots method
     * @param targetValue target function value.
     * @param restrictTo01 flag for optional second step to eliminate root outside 0..1.
     * @returns If no roots, return undefined.  If roots exist, return as numeric array.
     */
    roots(targetValue: number, restrictTo01: boolean): number[] | undefined;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluate(u: number): number;
}
/** Bezier polynomial specialized to order 4 (4 coefficients, cubic  function)
 * @internal
 */
export declare class Order4Bezier extends BezierCoffs {
    constructor(f0?: number, f1?: number, f2?: number, f3?: number);
    /** return a deep copy */
    clone(): Order4Bezier;
    /** Create a product of a quadratic and a cubic. */
    static createProductOrder3Order2(factorA: Order3Bezier, factorB: Order2Bezier): Order4Bezier;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @returns Return a (newly allocated) array of basis function values.
     */
    basisFunctions(u: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** evaluate the blocked derivative at u.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluate(u: number): number;
    /**
     * convert a power polynomial to bezier
     */
    static createFromDegree3PowerPolynomial(source: Degree3PowerPolynomial): Order4Bezier;
    /** Find real roots, return in caller-allocated array. */
    realRoots(e: number, restrictTo01: boolean, roots: GrowableFloat64Array): any;
}
/** Bezier polynomial specialized to order 5 (5 coefficients, quartic  function)
 * @internal
 */
export declare class Order5Bezier extends BezierCoffs {
    constructor(f0?: number, f1?: number, f2?: number, f3?: number, f4?: number);
    /** Return a deep copy */
    clone(): Order5Bezier;
    /**
     * convert a power polynomial to bezier
     */
    static createFromDegree4PowerPolynomial(source: Degree4PowerPolynomial): Order5Bezier;
    /** evaluate the basis functions at specified u.
     * @param u bezier parameter for evaluation.
     * @returns Return a (newly allocated) array of basis function values.
     */
    basisFunctions(u: number, result?: Float64Array): Float64Array;
    /** evaluate the basis functions at specified u.   Sum multidimensional control points with basis weights.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /** evaluate the blocked derivative at u.
     * @param u bezier parameter for evaluation.
     * @param n dimension of control points.
     * @param polygon packed multidimensional control points.   ASSUMED contains `n*order` values.
     * @param result optional destination for values.   ASSUMED size `order`
     * @returns Return a (newly allocated) array of basis function values.
     */
    sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
    /**
     * Evaluate the bezier function at a parameter value.  (i.e. sum the basis functions times coefficients)
     * @param u parameter for evaluation
     */
    evaluate(u: number): number;
    /** Add the product of a pair of Order3Bezier to this one. */
    addProductOrder3BezierOrder3Bezier(f: Order3Bezier, g: Order3Bezier, a: number): void;
    /** Add a constant to all coefficients (thereby adding the constant to the evaluated bezier) */
    addConstant(a: number): void;
    /** Find real roots, return in caller-allocated array. */
    realRoots(e: number, restrictTo01: boolean, roots: GrowableFloat64Array): void;
}
