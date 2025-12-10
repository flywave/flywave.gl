/* Copyright (C) 2025 flywave.gl contributors */



import { CurveIntervalRole, CurveLocationDetail } from "../curve/curve-location-detail";
import { CurvePrimitive } from "../curve/curve-primitive";
import { CurveOffsetXYHandler } from "../curve/internal/curve-offset-xy-handler";
import { PlaneAltitudeRangeContext } from "../curve/internal/plane-altitude-range-context";
import { type LineString3d } from "../curve/line-string3d";
import { OffsetOptions } from "../curve/offset-options";
import { StrokeCountMap } from "../curve/query/stroke-count-map";
import { type StrokeOptions } from "../curve/stroke-options";
import { type PlaneAltitudeEvaluator, Geometry } from "../geometry";
import { type GeometryHandler, type IStrokeHandler } from "../geometry3d/geometry-handler";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3dArray } from "../geometry3d/point-helpers";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range3d, Range1d } from "../geometry3d/range";
import { Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { Point4d } from "../geometry4d/point4d";
import { UnivariateBezier } from "../numerics/bezier-polynomials";
import { type AkimaCurve3dOptions } from "./akima-curve3d";
import { type BezierCurveBase } from "./bezier-curve-base";
import { BezierCurve3d } from "./bezier-curve3d";
import { BezierCurve3dH } from "./bezier-curve3d-homogeneous";
import { Bezier1dNd } from "./bezier1d-nd";
import { BSplineCurveOps } from "./bspline-curve-ops";
import { BSpline1dNd } from "./bspline1d-nd";
import { type InterpolationCurve3dOptions } from "./interpolation-curve3d";
import { BSplineWrapMode, KnotVector } from "./knot-vector";

export abstract class BSplineCurve3dBase extends CurvePrimitive {
    public readonly curvePrimitiveType = "bsplineCurve";

    protected _bcurve: BSpline1dNd;
    private _definitionData?: any;
    public set definitionData(data: any) {
        this._definitionData = data;
    }

    public get definitionData(): any {
        return this._definitionData;
    }

    protected constructor(
        poleDimension: number,
        numPoles: number,
        order: number,
        knots: KnotVector
    ) {
        super();
        this._bcurve = BSpline1dNd.create(numPoles, poleDimension, order, knots) as BSpline1dNd;
    }

    public get degree(): number {
        return this._bcurve.degree;
    }

    public get order(): number {
        return this._bcurve.order;
    }

    public get numSpan(): number {
        return this._bcurve.numSpan;
    }

    public get numPoles(): number {
        return this._bcurve.numPoles;
    }

    public copyKnots(includeExtraEndKnot: boolean): number[] {
        return this._bcurve.knots.copyKnots(includeExtraEndKnot);
    }

    public setWrappable(value: BSplineWrapMode) {
        this._bcurve.knots.wrappable = value;
    }

    public abstract evaluatePointInSpan(
        spanIndex: number,
        spanFraction: number,
        result?: Point3d
    ): Point3d;

    public abstract evaluatePointAndDerivativeInSpan(
        spanIndex: number,
        spanFraction: number,
        result?: Ray3d
    ): Ray3d;

    public abstract knotToPoint(knot: number, result?: Point3d): Point3d;

    public abstract knotToPointAndDerivative(knot: number, result?: Ray3d): Ray3d;

    public abstract knotToPointAnd2Derivatives(
        knot: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors;

    public fractionToPoint(fraction: number, result?: Point3d): Point3d {
        return this.knotToPoint(this._bcurve.knots.fractionToKnot(fraction), result);
    }

    public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
        const knot = this._bcurve.knots.fractionToKnot(fraction);
        result = this.knotToPointAndDerivative(knot, result);
        result.direction.scaleInPlace(this._bcurve.knots.knotLength01);
        return result;
    }

    public fractionToPointAnd2Derivatives(
        fraction: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        const knot = this._bcurve.knots.fractionToKnot(fraction);
        result = this.knotToPointAnd2Derivatives(knot, result);
        const a = this._bcurve.knots.knotLength01;
        result.vectorU.scaleInPlace(a);
        result.vectorV.scaleInPlace(a * a);
        return result;
    }

    public override startPoint(): Point3d {
        return this.evaluatePointInSpan(0, 0.0);
    }

    public override endPoint(): Point3d {
        return this.evaluatePointInSpan(this.numSpan - 1, 1.0);
    }

    public reverseInPlace(): void {
        this._bcurve.reverseInPlace();
    }

    public collectBezierSpans(prefer3dH: boolean): BezierCurveBase[] {
        const result: BezierCurveBase[] = [];
        const numSpans = this.numSpan;
        for (let i = 0; i < numSpans; i++) {
            if (this._bcurve.knots.isIndexOfRealSpan(i)) {
                const span = this.getSaturatedBezierSpan3dOr3dH(i, prefer3dH);
                if (span) result.push(span);
            }
        }
        return result;
    }

    public abstract getSaturatedBezierSpan3dOr3dH(
        spanIndex: number,
        prefer3dH: boolean,
        result?: BezierCurveBase
    ): BezierCurveBase | undefined;

    public abstract getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined;

    public abstract getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined;

    public poleIndexToDataIndex(poleIndex: number): number | undefined {
        if (poleIndex >= 0 && poleIndex < this.numPoles) return poleIndex * this._bcurve.poleLength;
        return undefined;
    }

    public override closestPoint(
        spacePoint: Point3d,
        _extend: boolean
    ): CurveLocationDetail | undefined {
        const point = this.fractionToPoint(0);
        const result = CurveLocationDetail.createCurveFractionPointDistance(
            this,
            0.0,
            point,
            point.distance(spacePoint)
        );

        let span: BezierCurve3dH | undefined;
        const numSpans = this.numSpan;
        for (let i = 0; i < numSpans; i++) {
            if (this._bcurve.knots.isIndexOfRealSpan(i)) {
                span = this.getSaturatedBezierSpan3dOr3dH(i, true, span) as BezierCurve3dH;
                if (span) {
                    if (
                        span.updateClosestPointByTruePerpendicular(spacePoint, result, false, true)
                    ) {
                        result.curve = this;
                        result.fraction = span.fractionToParentFraction(result.fraction);
                    }
                }
            }
        }
        return result;
    }

    public abstract override clone(): BSplineCurve3dBase;

    public override cloneTransformed(transform: Transform): BSplineCurve3dBase {
        const curve1 = this.clone();
        curve1.tryTransformInPlace(transform);
        return curve1;
    }

    public override clonePartialCurve(fractionA: number, fractionB: number): BSplineCurve3dBase {
        const clone = this.clone();
        const origNumKnots = clone._bcurve.knots.knots.length;
        let knotA = clone._bcurve.knots.fractionToKnot(fractionA);
        let knotB = clone._bcurve.knots.fractionToKnot(fractionB);
        clone._bcurve.addKnot(knotA, clone.degree);
        clone._bcurve.addKnot(knotB, clone.degree);

        if (origNumKnots === clone._bcurve.knots.knots.length) return clone;
        if (knotA > knotB) {
            const tmp = knotA;
            knotA = knotB;
            knotB = tmp;
        }

        const iStartKnot = clone._bcurve.knots.knotToLeftKnotIndex(knotA) - clone.degree + 1;
        const iStartPole = iStartKnot * clone._bcurve.poleLength;
        const iLastKnot = clone._bcurve.knots.knotToLeftKnotIndex(knotB);
        let iLastKnotLeftMultiple =
            iLastKnot - clone._bcurve.knots.getKnotMultiplicityAtIndex(iLastKnot) + 1;
        if (clone._bcurve.knots.knots[iLastKnot] < knotB) iLastKnotLeftMultiple = iLastKnot + 1;
        const iEndPole = (iLastKnotLeftMultiple + 1) * clone._bcurve.poleLength;
        const iEndKnot = iLastKnotLeftMultiple + clone.degree;

        clone._bcurve.knots.setKnotsCapture(clone._bcurve.knots.knots.slice(iStartKnot, iEndKnot));
        clone._bcurve.packedData = clone._bcurve.packedData.slice(iStartPole, iEndPole);
        clone.setWrappable(BSplineWrapMode.None);
        return clone;
    }

    public override appendPlaneIntersectionPoints(
        plane: PlaneAltitudeEvaluator,
        result: CurveLocationDetail[]
    ): number {
        const numPole = this.numPoles;
        const order = this.order;
        const allCoffs = new Float64Array(numPole);
        const numSpan = this.numSpan;
        const point4d = Point4d.create();

        const minMax = Range1d.createNull();
        for (let i = 0; i < numPole; i++) {
            allCoffs[i] = plane.weightedAltitude(this.getPolePoint4d(i, point4d)!);
            minMax.extendX(allCoffs[i]);
        }

        let univariateBezier: UnivariateBezier | undefined;
        let numFound = 0;
        let previousFraction = -1000.0;
        if (minMax.containsX(0.0)) {
            for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
                if (this._bcurve.knots.isIndexOfRealSpan(spanIndex)) {
                    minMax.setNull();
                    minMax.extendArraySubset(allCoffs, spanIndex, order);
                    if (minMax.containsX(0.0)) {
                        univariateBezier = UnivariateBezier.createArraySubset(
                            allCoffs,
                            spanIndex,
                            order,
                            univariateBezier
                        )!;
                        Bezier1dNd.saturate1dInPlace(
                            univariateBezier.coffs,
                            this._bcurve.knots,
                            spanIndex
                        );
                        const roots = univariateBezier.roots(0.0, true);
                        if (roots) {
                            for (const spanFraction of roots) {
                                numFound++;
                                const fraction = this._bcurve.knots.spanFractionToFraction(
                                    spanIndex,
                                    spanFraction
                                );
                                if (!Geometry.isAlmostEqualNumber(fraction, previousFraction)) {
                                    const detail = CurveLocationDetail.createCurveEvaluatedFraction(
                                        this,
                                        fraction
                                    );
                                    detail.intervalRole = CurveIntervalRole.isolated;
                                    result.push(detail);
                                    previousFraction = fraction;
                                }
                            }
                        }
                    }
                }
            }
        }
        return numFound;
    }

    public override constructOffsetXY(
        offsetDistanceOrOptions: number | OffsetOptions
    ): CurvePrimitive | CurvePrimitive[] | undefined {
        const options = OffsetOptions.create(offsetDistanceOrOptions);
        const handler = new CurveOffsetXYHandler(this, options.leftOffsetDistance);
        this.emitStrokableParts(handler, options.strokeOptions);
        return handler.claimResult();
    }

    public override projectedParameterRange(
        ray: Vector3d | Ray3d,
        lowHigh?: Range1d
    ): Range1d | undefined {
        return PlaneAltitudeRangeContext.findExtremeFractionsAlongDirection(this, ray, lowHigh);
    }
}

export class BSplineCurve3d extends BSplineCurve3dBase {
    private _workBezier?: BezierCurve3d;
    private initializeWorkBezier(): BezierCurve3d {
        if (this._workBezier === undefined) {
            this._workBezier = BezierCurve3d.createOrder(this.order);
        }
        return this._workBezier;
    }

    public isSameGeometryClass(other: any): boolean {
        return other instanceof BSplineCurve3d;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        Point3dArray.multiplyInPlace(transform, this._bcurve.packedData);
        return true;
    }

    public getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined {
        const k = this.poleIndexToDataIndex(poleIndex);
        if (k !== undefined) {
            const data = this._bcurve.packedData;
            return Point3d.create(data[k], data[k + 1], data[k + 2], result);
        }
        return undefined;
    }

    public getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined {
        const k = this.poleIndexToDataIndex(poleIndex);
        if (k !== undefined) {
            const data = this._bcurve.packedData;
            return Point4d.create(data[k], data[k + 1], data[k + 2], 1.0, result);
        }
        return undefined;
    }

    public spanFractionToKnot(span: number, localFraction: number): number {
        return this._bcurve.spanFractionToKnot(span, localFraction);
    }

    private constructor(numPoles: number, order: number, knots: KnotVector) {
        super(3, numPoles, order, knots);
    }

    public copyPoints(): any[] {
        return Point3dArray.unpackNumbersToNestedArrays(this._bcurve.packedData, 3);
    }

    public copyPointsFloat64Array(): Float64Array {
        return this._bcurve.packedData.slice();
    }

    public override copyKnots(includeExtraEndKnot: boolean): number[] {
        return this._bcurve.knots.copyKnots(includeExtraEndKnot);
    }

    public static createUniformKnots(
        poles: Point3d[] | Float64Array | GrowableXYZArray,
        order: number
    ): BSplineCurve3d | undefined {
        const numPoles = poles instanceof Float64Array ? poles.length / 3 : poles.length;
        if (order < 2 || numPoles < order) return undefined;
        const knots = KnotVector.createUniformClamped(numPoles, order - 1, 0.0, 1.0);
        const curve = new BSplineCurve3d(numPoles, order, knots);
        if (poles instanceof Float64Array) {
            for (let i = 0; i < 3 * numPoles; i++) curve._bcurve.packedData[i] = poles[i];
        } else if (poles instanceof GrowableXYZArray) {
            curve._bcurve.packedData = poles.float64Data().slice(0, 3 * numPoles);
        } else {
            let i = 0;
            for (const p of poles) {
                curve._bcurve.packedData[i++] = p.x;
                curve._bcurve.packedData[i++] = p.y;
                curve._bcurve.packedData[i++] = p.z;
            }
        }
        return curve;
    }

    public static createPeriodicUniformKnots(
        poles: Point3d[] | Float64Array | GrowableXYZArray,
        order: number
    ): BSplineCurve3d | undefined {
        if (order < 2) return undefined;

        let numPoles = poles instanceof Float64Array ? poles.length / 3 : poles.length;
        const startPoint = Point3d.createZero();
        const endPoint = Point3d.createZero();
        let hasClosurePoint = false;
        do {
            if (poles instanceof Float64Array) {
                startPoint.set(poles[0], poles[1], poles[2]);
                endPoint.set(
                    poles[3 * numPoles - 3],
                    poles[3 * numPoles - 2],
                    poles[3 * numPoles - 1]
                );
            } else if (poles instanceof GrowableXYZArray) {
                startPoint.set(
                    poles.float64Data()[0],
                    poles.float64Data()[1],
                    poles.float64Data()[2]
                );
                endPoint.set(
                    poles.float64Data()[3 * numPoles - 3],
                    poles.float64Data()[3 * numPoles - 2],
                    poles.float64Data()[3 * numPoles - 1]
                );
            } else {
                startPoint.setFromPoint3d(poles[0]);
                endPoint.setFromPoint3d(poles[numPoles - 1]);
            }
            if ((hasClosurePoint = startPoint.isAlmostEqual(endPoint))) --numPoles;
        } while (hasClosurePoint && numPoles > 1);

        if (numPoles < order) return undefined;

        const degree = order - 1;
        const numIntervals = numPoles;
        const knots = KnotVector.createUniformWrapped(numIntervals, degree, 0.0, 1.0);
        knots.wrappable = BSplineWrapMode.OpenByAddingControlPoints;

        const curve = new BSplineCurve3d(numPoles + degree, order, knots);
        if (poles instanceof Float64Array) {
            for (let i = 0; i < 3 * numPoles; i++) curve._bcurve.packedData[i] = poles[i];
            for (let i = 0; i < 3 * degree; i++) {
                curve._bcurve.packedData[3 * numPoles + i] = poles[i];
            }
        } else if (poles instanceof GrowableXYZArray) {
            curve._bcurve.packedData = poles.float64Data().slice(0, 3 * numPoles);
            for (let i = 0; i < 3 * degree; i++) {
                curve._bcurve.packedData[3 * numPoles + i] = poles.float64Data()[i];
            }
        } else {
            let i = 0;
            for (let j = 0; j < numPoles; j++) {
                curve._bcurve.packedData[i++] = poles[j].x;
                curve._bcurve.packedData[i++] = poles[j].y;
                curve._bcurve.packedData[i++] = poles[j].z;
            }
            for (let j = 0; j < degree; j++) {
                curve._bcurve.packedData[i++] = poles[j].x;
                curve._bcurve.packedData[i++] = poles[j].y;
                curve._bcurve.packedData[i++] = poles[j].z;
            }
        }
        return curve;
    }

    public static createFromInterpolationCurve3dOptions(
        options: InterpolationCurve3dOptions
    ): BSplineCurve3d | undefined {
        return BSplineCurveOps.createThroughPointsC2Cubic(options);
    }

    public static createFromAkimaCurve3dOptions(
        options: AkimaCurve3dOptions
    ): BSplineCurve3d | undefined {
        return BSplineCurveOps.createThroughPoints(options.fitPoints, 4); // temporary
    }

    public static create(
        poleArray: Float64Array | Point3d[],
        knotArray: Float64Array | number[],
        order: number
    ): BSplineCurve3d | undefined {
        if (order < 2) return undefined;

        let numPoles = poleArray.length;
        if (poleArray instanceof Float64Array) {
            numPoles /= 3;
        }
        if (numPoles < order) return undefined;

        const numKnots = knotArray.length;
        let skipFirstAndLast;
        if (numPoles + order === numKnots) skipFirstAndLast = true;
        else if (numPoles + order === numKnots + 2) skipFirstAndLast = false;
        else return undefined;

        const knots = KnotVector.create(knotArray, order - 1, skipFirstAndLast);
        const curve = new BSplineCurve3d(numPoles, order, knots);

        let i = 0;
        if (poleArray instanceof Float64Array) {
            for (const coordinate of poleArray) curve._bcurve.packedData[i++] = coordinate;
        } else {
            for (const p of poleArray) {
                curve._bcurve.packedData[i++] = p.x;
                curve._bcurve.packedData[i++] = p.y;
                curve._bcurve.packedData[i++] = p.z;
            }
        }
        return curve;
    }

    public override clone(): BSplineCurve3d {
        const knotVector1 = this._bcurve.knots.clone();
        const curve1 = new BSplineCurve3d(this.numPoles, this.order, knotVector1);
        curve1._bcurve.packedData = this._bcurve.packedData.slice();
        return curve1;
    }

    public evaluatePointInSpan(spanIndex: number, spanFraction: number): Point3d {
        this._bcurve.evaluateBuffersInSpan(spanIndex, spanFraction);
        return Point3d.createFrom(this._bcurve.poleBuffer);
    }

    public evaluatePointAndDerivativeInSpan(spanIndex: number, spanFraction: number): Ray3d {
        this._bcurve.evaluateBuffersInSpan1(spanIndex, spanFraction);
        return Ray3d.createCapture(
            Point3d.createFrom(this._bcurve.poleBuffer),
            Vector3d.createFrom(this._bcurve.poleBuffer1)
        );
    }

    public knotToPoint(u: number, result?: Point3d): Point3d {
        this._bcurve.evaluateBuffersAtKnot(u);
        return Point3d.createFrom(this._bcurve.poleBuffer, result);
    }

    public knotToPointAndDerivative(u: number, result?: Ray3d): Ray3d {
        this._bcurve.evaluateBuffersAtKnot(u, 1);
        if (!result) {
            return Ray3d.createCapture(
                Point3d.createFrom(this._bcurve.poleBuffer),
                Vector3d.createFrom(this._bcurve.poleBuffer1)
            );
        }
        result.origin.setFrom(this._bcurve.poleBuffer);
        result.direction.setFrom(this._bcurve.poleBuffer1);
        return result;
    }

    public knotToPointAnd2Derivatives(
        u: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        this._bcurve.evaluateBuffersAtKnot(u, 2);
        return Plane3dByOriginAndVectors.createOriginAndVectorsXYZ(
            this._bcurve.poleBuffer[0],
            this._bcurve.poleBuffer[1],
            this._bcurve.poleBuffer[2],
            this._bcurve.poleBuffer1[0],
            this._bcurve.poleBuffer1[1],
            this._bcurve.poleBuffer1[2],
            this._bcurve.poleBuffer2[0],
            this._bcurve.poleBuffer2[1],
            this._bcurve.poleBuffer2[2],
            result
        );
    }

    public override isAlmostEqual(other: any): boolean {
        if (other instanceof BSplineCurve3d) {
            return (
                this._bcurve.knots.isAlmostEqual(other._bcurve.knots) &&
                Point3dArray.isAlmostEqual(this._bcurve.packedData, other._bcurve.packedData)
            );
        }
        return false;
    }

    public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
        return Point3dArray.isCloseToPlane(this._bcurve.packedData, plane);
    }

    public quickLength(): number {
        return Point3dArray.sumEdgeLengths(this._bcurve.packedData);
    }

    public emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void {
        const needBeziers = handler.announceBezierCurve !== undefined;
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        let numStrokes;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3dOr3dH(spanIndex, false, workBezier);
            if (bezier) {
                numStrokes = bezier.computeStrokeCountForOptions(options);
                if (needBeziers) {
                    handler.announceBezierCurve!(
                        bezier,
                        numStrokes,
                        this,
                        spanIndex,
                        this._bcurve.knots.spanFractionToFraction(spanIndex, 0.0),
                        this._bcurve.knots.spanFractionToFraction(spanIndex, 1.0)
                    );
                } else {
                    handler.announceIntervalForUniformStepStrokes(
                        this,
                        numStrokes,
                        this._bcurve.knots.spanFractionToFraction(spanIndex, 0.0),
                        this._bcurve.knots.spanFractionToFraction(spanIndex, 1.0)
                    );
                }
            }
        }
    }

    public computeStrokeCountForOptions(options?: StrokeOptions): number {
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        let numStroke = 0;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3d(spanIndex, workBezier);
            if (bezier) numStroke += bezier.computeStrokeCountForOptions(options);
        }
        return numStroke;
    }

    public override computeAndAttachRecursiveStrokeCounts(
        options?: StrokeOptions,
        parentStrokeMap?: StrokeCountMap
    ) {
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        const myData = StrokeCountMap.createWithCurvePrimitiveAndOptionalParent(
            this,
            parentStrokeMap,
            []
        );

        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3d(spanIndex, workBezier);
            if (bezier) {
                const segmentLength = workBezier.curveLength();
                const numStrokeOnSegment = workBezier.computeStrokeCountForOptions(options);
                myData.addToCountAndLength(numStrokeOnSegment, segmentLength);
            }
        }
        CurvePrimitive.installStrokeCountMap(this, myData, parentStrokeMap);
    }

    public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3d(spanIndex, workBezier);
            if (bezier) bezier.emitStrokes(dest, options);
        }
    }

    public get isClosable(): BSplineWrapMode {
        const mode = this._bcurve.knots.wrappable;
        if (mode === BSplineWrapMode.None) return BSplineWrapMode.None;
        if (!this._bcurve.knots.testClosable(mode)) return BSplineWrapMode.None;
        if (!this._bcurve.testCloseablePolygon(mode)) return BSplineWrapMode.None;
        return mode;
    }

    public getSaturatedBezierSpan3dOr3dH(
        spanIndex: number,
        prefer3dH: boolean,
        result?: BezierCurveBase
    ): BezierCurveBase | undefined {
        if (prefer3dH) return this.getSaturatedBezierSpan3dH(spanIndex, result);
        return this.getSaturatedBezierSpan3d(spanIndex, result);
    }

    public getSaturatedBezierSpan3d(
        spanIndex: number,
        result?: BezierCurveBase
    ): BezierCurveBase | undefined {
        if (spanIndex < 0 || spanIndex >= this.numSpan) return undefined;

        const order = this.order;
        if (result === undefined || !(result instanceof BezierCurve3d) || result.order !== order) {
            result = BezierCurve3d.createOrder(order);
        }
        const bezier = result as BezierCurve3d;
        bezier.loadSpanPoles(this._bcurve.packedData, spanIndex);
        if (bezier.saturateInPlace(this._bcurve.knots, spanIndex)) return result;
        return undefined;
    }

    public getSaturatedBezierSpan3dH(
        spanIndex: number,
        result?: BezierCurveBase
    ): BezierCurve3dH | undefined {
        if (spanIndex < 0 || spanIndex >= this.numSpan) return undefined;

        const order = this.order;
        if (result === undefined || !(result instanceof BezierCurve3dH) || result.order !== order) {
            result = BezierCurve3dH.createOrder(order);
        }
        const bezier = result as BezierCurve3dH;
        bezier.loadSpan3dPolesWithWeight(this._bcurve.packedData, spanIndex, 1.0);
        if (bezier.saturateInPlace(this._bcurve.knots, spanIndex)) return bezier;
        return undefined;
    }

    public override setWrappable(value: BSplineWrapMode) {
        this._bcurve.knots.wrappable = value;
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBSplineCurve3d(this);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
        const buffer = this._bcurve.packedData;
        const n = buffer.length - 2;
        if (transform) {
            for (let i0 = 0; i0 < n; i0 += 3) {
                rangeToExtend.extendTransformedXYZ(
                    transform,
                    buffer[i0],
                    buffer[i0 + 1],
                    buffer[i0 + 2]
                );
            }
        } else {
            for (let i0 = 0; i0 < n; i0 += 3) {
                rangeToExtend.extendXYZ(buffer[i0], buffer[i0 + 1], buffer[i0 + 2]);
            }
        }
    }
}
