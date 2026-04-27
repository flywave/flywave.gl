/** Support class for quadrature -- approximate integrals by summing weighted function values.
 * These are filled with x and weight for quadrature between xA and xB
 *
 * Since quadrature is done in side tight loops, these methods are structured for minimum object
 * allocation.
 * For methods names setupGauss<N> (where N is a smallish integer), the CALLER creates arrays xMapped and wMapped
 * The method installs particular x and weight values.
 * @internal
 */
export declare class Quadrature {
    /** x value for 1 point gauss rule in 0..1 interval */
    static readonly gaussX1Interval01: Float64Array<ArrayBuffer>;
    /** weight for 1 point gauss rule in 0..1 interval */
    static readonly gaussW1Interval01: Float64Array<ArrayBuffer>;
    /** x value for 2 point gauss rule in 0..1 interval */
    static readonly gaussX2Interval01: Float64Array<ArrayBuffer>;
    /** weight for 2 point gauss rule in 0..1 interval */
    static readonly gaussW2Interval01: Float64Array<ArrayBuffer>;
    /** x value for 3 point gauss rule in 0..1 interval */
    static readonly gaussX3Interval01: Float64Array<ArrayBuffer>;
    /** weight for 3 point gauss rule in 0..1 interval */
    static readonly gaussW3Interval01: Float64Array<ArrayBuffer>;
    /** x value for 4 point gauss rule in 0..1 interval */
    static readonly gaussX4Interval01: Float64Array<ArrayBuffer>;
    /** weight for 4 point gauss rule in 0..1 interval */
    static readonly gaussW4Interval01: Float64Array<ArrayBuffer>;
    /** x value for 5 point gauss rule in 0..1 interval */
    static readonly gaussX5Interval01: Float64Array<ArrayBuffer>;
    /** weight for 5 point gauss rule in 0..1 interval */
    static readonly gaussW5Interval01: Float64Array<ArrayBuffer>;
    /**
     * Given points and weights in a reference interval (usually 0 to 1):
     *
     * * map each xRef[i] to xA + h * xRef[i];
     * * scale each weight wRef[i] to h * wRef[i]
     * * all arrays are assumed to have xRef.length entries.
     * * the return value is xRef.length
     * @param xA beginning of target interval
     * @param h length of target interval
     * @param xRef x coordinates in reference interval
     * @param wRef weights for integration in the reference interval
     * @param xMapped x coordinates to evaluate integrands
     * @param wMapped weights for evaluated integrands
     */
    static mapWeights(xA: number, h: number, xRef: Float64Array, wRef: Float64Array, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Install 1 (ONE) x and weight values for quadrature from xA to xB. */
    static setupGauss1(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Install 2 (TWO) x and weight values for quadrature from xA to xB. */
    static setupGauss2(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Install 3 (THREE) x and weight values for quadrature from xA to xB. */
    static setupGauss3(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Install 5 (FIVE) x and weight values for quadrature from xA to xB. */
    static setupGauss5(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Install 4 (FOUR) x and weight values for quadrature from xA to xB. */
    static setupGauss4(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
    /** Sum function values with given weights and x values. */
    static sum1(xx: Float64Array, ww: Float64Array, n: number, f: (x: number) => number): number;
    /**
     * Do a Guass quadrature integral for a (number)=>number function over an interval, with caller specified sub-interval count and
     * @param x0 start of overall interval
     * @param x1 end of overall interval
     * @param f function to evaluate
     * @param numInterval number of internal intervals
     * @param numGauss number of gauss points.    must be supported by GaussMapper, i.e. 1,2,3,4,5
     */
    static doGaussIntegral(x0: number, x1: number, f: (x: number) => number, numInterval: number, numGauss?: number): number;
}
/**
 * This class carries public members as needed for users to have gauss points that are used
 * in the callers loops.
 * @internal
 */
export declare class GaussMapper {
    /** x values for integration */
    gaussX: Float64Array;
    /** weights for integration */
    gaussW: Float64Array;
    /** function to be called (at each interval) to map integration values */
    mapXAndWFunction: (xA: number, xB: number, xx: Float64Array, ww: Float64Array) => number;
    /** Execute the mapXAndWFunction to set up arrays for integration from xA to xB */
    mapXAndW(xA: number, xB: number): number;
    /** setup gauss arrays.
     * * Number of gauss points must be 1 to 5 (inclusive)
     * @param numGauss requested number of gauss points.
     */
    constructor(numGaussPoints: number);
}
