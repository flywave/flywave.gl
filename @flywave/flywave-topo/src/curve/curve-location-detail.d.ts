import { type Vector3d, Point3d } from "../geometry3d/point3d-vector3d";
import { type Ray3d } from "../geometry3d/ray3d";
import { type CurvePrimitive } from "./curve-primitive";
/**
 * An enumeration of special conditions being described by a CurveLocationDetail.
 * @public
 */
export declare enum CurveIntervalRole {
    /** This point is an isolated point NOT at a primary vertex. */
    isolated = 0,
    /** This point is an isolated vertex hit */
    isolatedAtVertex = 1,
    /** This is the beginning of an interval */
    intervalStart = 10,
    /** This is an interior point of an interval. */
    intervalInterior = 11,
    /** This is the end of an interval */
    intervalEnd = 12
}
/**
 * Return code for CurvePrimitive method `moveSignedDistanceFromFraction`
 * @public
 */
export declare enum CurveSearchStatus {
    /** Unimplemented or zero length curve  */
    error = 0,
    /** Complete success of search */
    success = 1,
    /** Search ended prematurely (e.g. at incomplete distance moved) at start or end of curve */
    stoppedAtBoundary = 2
}
/**
 * CurveLocationDetail carries point and parameter data about a point evaluated on a curve.
 * * These are returned by a variety of queries.
 * * Particular contents can vary among the queries.
 * @public
 */
export declare class CurveLocationDetail {
    /** The curve being evaluated */
    curve?: CurvePrimitive;
    /** Optional ray */
    ray?: Ray3d;
    /** The fractional position along the curve */
    fraction: number;
    /** Detail condition of the role this point has in some context */
    intervalRole?: CurveIntervalRole;
    /** The point on the curve */
    point: Point3d;
    /** A vector (e.g. tangent vector) in context */
    vectorInCurveLocationDetail?: Vector3d;
    /** A context-specific numeric value. (e.g. a distance) */
    a: number;
    /**
     * Optional CurveLocationDetail with more detail of location. For instance, a detail for fractional position
     * within a CurveChainWithDistanceIndex returns fraction and distance along the chain as its primary data and
     * further detail of the particular curve within the chain in the childDetail.
     */
    childDetail?: CurveLocationDetail;
    /**
     * A status indicator for certain searches.
     * * e.g. CurvePrimitive.moveSignedDistanceFromFraction
     */
    curveSearchStatus?: CurveSearchStatus;
    /** (Optional) second fraction, e.g. end of interval of coincident curves */
    fraction1?: number;
    /** (Optional) second point, e.g. end of interval of coincident curves */
    point1?: Point3d;
    /** A context-specific additional point */
    pointQ: Point3d;
    /** Constructor */
    constructor();
    /** Set the (optional) intervalRole field */
    setIntervalRole(value: CurveIntervalRole): void;
    /** Set the (optional) fraction1 and point1, using direct assignment (capture!) to point1 */
    captureFraction1Point1(fraction1: number, point1: Point3d): void;
    /** Test if this pair has fraction1 defined */
    get hasFraction1(): boolean;
    /** Test if this is an isolated point. This is true if intervalRole is any of (undefined, isolated, isolatedAtVertex) */
    get isIsolated(): boolean;
    /** Return the fraction delta. (0 if no fraction1) */
    get fractionDelta(): number;
    /**
     * If (fraction1, point1) are defined, make them the primary (and only) data.
     * * No action if undefined.
     */
    collapseToEnd(): void;
    /** Make (fraction, point) the primary (and only) data. */
    collapseToStart(): void;
    /**
     * Return a complete copy, WITH CAVEATS . . .
     * * curve member is copied as a reference.
     * * point and vector members are cloned.
     */
    clone(result?: CurveLocationDetail): CurveLocationDetail;
    /**
     * Updated in this instance.
     * * Note that if caller omits `vector` and `a`, those fields are updated to the call-list defaults (NOT left as-is)
     * * point and vector updates are by data copy (not capture of pointers)
     * @param fraction (required) fraction to install
     * @param point  (required) point to install
     * @param vector (optional) vector to install.
     * @param a (optional) numeric value to install.
     */
    setFP(fraction: number, point: Point3d, vector?: Vector3d, a?: number): void;
    /**
     * Updated in this instance.
     * * Note that if caller omits a`, that field is updated to the call-list default (NOT left as-is)
     * * point and vector updates are by data copy (not capture of the ray members)
     * @param fraction (required) fraction to install
     * @param ray  (required) point and vector to install
     * @param a (optional) numeric value to install.
     */
    setFR(fraction: number, ray: Ray3d, a?: number): void;
    /** Set the CurvePrimitive pointer, leaving all other properties untouched. */
    setCurve(curve: CurvePrimitive): void;
    /** Record the distance from the CurveLocationDetail's point to the parameter point. */
    setDistanceTo(point: Point3d): void;
    /** Create with a CurvePrimitive pointer but no coordinate data. */
    static create(curve?: CurvePrimitive, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create a new detail using CurvePrimitive pointer, fraction, and point coordinates. */
    static createCurveFractionPoint(curve: CurvePrimitive | undefined, fraction: number, point: Point3d, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create a new detail with only ray, fraction, and point. */
    static createRayFractionPoint(ray: Ray3d, fraction: number, point: Point3d, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with CurvePrimitive pointer, fraction, and point coordinates */
    static createCurveFractionPointDistanceCurveSearchStatus(curve: CurvePrimitive | undefined, fraction: number, point: Point3d, distance: number, status: CurveSearchStatus, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with curveSearchStatus affected by allowExtension. */
    static createConditionalMoveSignedDistance(allowExtension: boolean, curve: CurvePrimitive, startFraction: number, endFraction: number, requestedSignedDistance: number, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with CurvePrimitive pointer and fraction for evaluation. */
    static createCurveEvaluatedFraction(curve: CurvePrimitive, fraction: number, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with CurvePrimitive pointer and fraction for evaluation. */
    static createCurveEvaluatedFractionPointAndDerivative(curve: CurvePrimitive, fraction: number, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with CurvePrimitive pointer and 2 fractions for evaluation. */
    static createCurveEvaluatedFractionFraction(curve: CurvePrimitive, fraction0: number, fraction1: number, result?: CurveLocationDetail): CurveLocationDetail;
    /** Create with CurvePrimitive pointer, fraction, and point coordinates. */
    static createCurveFractionPointDistance(curve: CurvePrimitive, fraction: number, point: Point3d, a: number, result?: CurveLocationDetail): CurveLocationDetail;
    /**
     * Update or create if closer than current contents.
     * @param curve candidate curve
     * @param fraction candidate fraction
     * @param point candidate point
     * @param a candidate distance
     * @returns true if the given distance is smaller (and hence this detail was updated.)
     */
    updateIfCloserCurveFractionPointDistance(curve: CurvePrimitive, fraction: number, point: Point3d, a: number): boolean;
    /**
     * Exchange the (fraction,fraction1) and (point, point1) pairs.
     * * (Skip each swap if its "1" value is undefined)
     */
    swapFractionsAndPoints(): void;
    /**
     * Return the fraction where f falls between fraction and fraction1.
     * * ASSUME fraction1 defined
     */
    inverseInterpolateFraction(f: number, defaultFraction?: number): number;
    /**
     * Return the detail with smaller `a` value -- detailA returned if equal.
     * @param detailA first candidate
     * @param detailB second candidate
     */
    static chooseSmallerA(detailA: CurveLocationDetail | undefined, detailB: CurveLocationDetail | undefined): CurveLocationDetail | undefined;
    /** Compare only the curve and fraction of this detail with `other`. */
    isSameCurveAndFraction(other: CurveLocationDetail | {
        curve: CurvePrimitive;
        fraction: number;
    }): boolean;
}
/**
 * Enumeration of configurations for intersections and min/max distance-between-curve
 * @public
 */
export declare enum CurveCurveApproachType {
    /** Intersection at a single point */
    Intersection = 0,
    /** Distinct points on the two curves, with each curve's tangent perpendicular to the chord between the points */
    PerpendicularChord = 1,
    /** Completely coincident geometry */
    CoincidentGeometry = 2,
    /** Completely parallel geometry. */
    ParallelGeometry = 3
}
/**
 * A pair of CurveLocationDetail.
 * @public
 */
export declare class CurveLocationDetailPair {
    /** The first of the two details. */
    detailA: CurveLocationDetail;
    /** The second of the two details. */
    detailB: CurveLocationDetail;
    /**
     * Enumeration of how the detail pairs relate.
     * * This is set only by certain closeApproach calculations.
     */
    approachType?: CurveCurveApproachType;
    constructor(detailA?: CurveLocationDetail, detailB?: CurveLocationDetail);
    /** Create a curve detail pair using references to two CurveLocationDetails */
    static createCapture(detailA: CurveLocationDetail, detailB: CurveLocationDetail, result?: CurveLocationDetailPair): CurveLocationDetailPair;
    /**
     * Create a curve detail pair using references to two CurveLocationDetails.
     * * optionally install in reversed positions
     */
    static createCaptureOptionalReverse(detailA: CurveLocationDetail, detailB: CurveLocationDetail, reversed: boolean, result?: CurveLocationDetailPair): CurveLocationDetailPair;
    /** Make a deep copy of this CurveLocationDetailPair */
    clone(result?: CurveLocationDetailPair): CurveLocationDetailPair;
    /** Swap the details of A, B */
    swapDetails(): void;
    /**
     * Mutate the input array by removing the second of two adjacent duplicate pairs.
     * * Ignores details representing coincident intervals (e.g., for which `fraction1` is defined).
     * * Comparison is performed by [[CurveLocationDetail.isSameCurveAndFraction]].
     * * No sorting is performed.
     * @param pairs array to de-duplicate in place
     * @param index0 look for duplicates in the tail of the array starting at index0
     * @return reference to input array
     * @internal
     */
    static removeAdjacentDuplicates(pairs: CurveLocationDetailPair[], index0?: number): CurveLocationDetailPair[];
}
/**
 * Data bundle for a pair of arrays of CurveLocationDetail structures.
 * @deprecated in 4.x. Use CurveLocationDetailPair[] instead.
 * @public
 */
export declare class CurveLocationDetailArrayPair {
    /** First array of details. */
    dataA: CurveLocationDetail[];
    /** Second array of details. */
    dataB: CurveLocationDetail[];
    constructor();
}
