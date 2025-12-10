/* Copyright (C) 2025 flywave.gl contributors */



import { CurvePrimitive } from "../curve/curve-primitive";
import { CurveOffsetXYHandler } from "../curve/internal/curve-offset-xy-handler";
import { PlaneAltitudeRangeContext } from "../curve/internal/plane-altitude-range-context";
import { type LineString3d } from "../curve/line-string3d";
import { OffsetOptions } from "../curve/offset-options";
import { StrokeOptions } from "../curve/stroke-options";
import { Geometry } from "../geometry";
import { Angle } from "../geometry3d/angle";
import { type IStrokeHandler } from "../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { type Vector3d, Point3d } from "../geometry3d/point3d-vector3d";
import { type Range1d, type Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { type Point4d } from "../geometry4d/point4d";
import { UnivariateBezier } from "../numerics/bezier-polynomials";
import { Bezier1dNd } from "./bezier1d-nd";
import { type KnotVector } from "./knot-vector";

export abstract class BezierCurveBase extends CurvePrimitive {
    public readonly curvePrimitiveType = "bezierCurve";

    protected _polygon: Bezier1dNd;
    protected _workData0: Float64Array;
    protected _workData1: Float64Array;
    protected _workPoint0: Point3d;
    protected _workPoint1: Point3d;

    protected constructor(blockSize: number, data: Float64Array) {
        super();
        this._polygon = new Bezier1dNd(blockSize, data);
        this._workPoint0 = Point3d.create();
        this._workPoint1 = Point3d.create();
        this._workData0 = new Float64Array(blockSize);
        this._workData1 = new Float64Array(blockSize);
    }

    public reverseInPlace(): void {
        this._polygon.reverseInPlace();
    }

    public saturateInPlace(knotVector: KnotVector, spanIndex: number): boolean {
        const boolStat = this._polygon.saturateInPlace(knotVector, spanIndex);
        if (boolStat) {
            this.setInterval(
                knotVector.spanFractionToFraction(spanIndex, 0.0),
                knotVector.spanFractionToFraction(spanIndex, 1.0)
            );
        }
        return boolStat;
    }

    public get degree(): number {
        return this._polygon.order - 1;
    }

    public get order(): number {
        return this._polygon.order;
    }

    public get numPoles(): number {
        return this._polygon.order;
    }

    public abstract getPolePoint3d(i: number, point?: Point3d): Point3d | undefined;

    public abstract getPolePoint4d(i: number, point?: Point4d): Point4d | undefined;

    public setInterval(a: number, b: number) {
        this._polygon.setInterval(a, b);
    }

    public fractionToParentFraction(fraction: number): number {
        return this._polygon.fractionToParentFraction(fraction);
    }

    public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
        const numPerSpan = this.computeStrokeCountForOptions(options);
        const fractionStep = 1.0 / numPerSpan;
        for (let i = 0; i <= numPerSpan; i++) {
            const fraction = i * fractionStep;
            this.fractionToPoint(fraction, this._workPoint0);
            dest.appendStrokePoint(this._workPoint0);
        }
    }

    public emitStrokableParts(handler: IStrokeHandler, _options?: StrokeOptions): void {
        const numPerSpan = this.computeStrokeCountForOptions(_options);
        handler.announceIntervalForUniformStepStrokes(this, numPerSpan, 0.0, 1.0);
    }

    public copyPolesAsJsonArray(): any[] {
        return this._polygon.unpackToJsonArrays();
    }

    public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
        let point: Point3d | undefined = this._workPoint0;
        for (let i = 0; ; i++) {
            point = this.getPolePoint3d(i, point);
            if (!point) return true;
            if (!plane.isPointInPlane(point)) break;
        }
        return false;
    }

    public polygonLength(): number {
        if (!this.getPolePoint3d(0, this._workPoint0)) return 0.0;
        let i = 0;
        let sum = 0.0;
        while (this.getPolePoint3d(++i, this._workPoint1)) {
            sum += this._workPoint0.distance(this._workPoint1);
            this._workPoint0.setFrom(this._workPoint1);
        }
        return sum;
    }

    public override startPoint(): Point3d {
        const result = this.getPolePoint3d(0)!;
        return result;
    }

    public override endPoint(): Point3d {
        const result = this.getPolePoint3d(this.order - 1)!;
        return result;
    }

    public quickLength(): number {
        return this.polygonLength();
    }

    public abstract override extendRange(rangeToExtend: Range3d, transform?: Transform): void;

    protected _workBezier?: UnivariateBezier;

    protected _workCoffsA?: Float64Array;

    protected _workCoffsB?: Float64Array;

    protected allocateAndZeroBezierWorkData(
        primaryBezierOrder: number,
        orderA: number,
        orderB: number
    ) {
        if (primaryBezierOrder > 0) {
            if (this._workBezier !== undefined && this._workBezier.order === primaryBezierOrder) {
                this._workBezier.zero();
            } else this._workBezier = new UnivariateBezier(primaryBezierOrder);
        }
        if (orderA > 0) {
            if (this._workCoffsA !== undefined && this._workCoffsA.length === orderA) {
                this._workCoffsA.fill(0);
            } else this._workCoffsA = new Float64Array(orderA);
        }
        if (orderB > 0) {
            if (this._workCoffsB !== undefined && this._workCoffsB.length === orderB) {
                this._workCoffsB.fill(0);
            } else this._workCoffsB = new Float64Array(orderB);
        }
    }

    public computeStrokeCountForOptions(options?: StrokeOptions): number {
        this.getPolePoint3d(0, this._workPoint0);
        this.getPolePoint3d(1, this._workPoint1);
        let numStrokes = 1;
        if (this._workPoint0 && this._workPoint1) {
            let dx0 = this._workPoint1.x - this._workPoint0.x;
            let dy0 = this._workPoint1.y - this._workPoint0.y;
            let dz0 = this._workPoint1.z - this._workPoint0.z;
            let dx1, dy1, dz1;
            let sumRadians = 0.0;
            let thisLength = Geometry.hypotenuseXYZ(dx0, dy0, dz0);
            this._workPoint1.setFromPoint3d(this._workPoint0);
            let sumLength = thisLength;
            let maxLength = thisLength;
            let maxRadians = 0.0;
            let thisRadians;
            for (let i = 2; this.getPolePoint3d(i, this._workPoint1); i++) {
                dx1 = this._workPoint1.x - this._workPoint0.x;
                dy1 = this._workPoint1.y - this._workPoint0.y;
                dz1 = this._workPoint1.z - this._workPoint0.z;
                thisRadians = Angle.radiansBetweenVectorsXYZ(dx0, dy0, dz0, dx1, dy1, dz1);
                sumRadians += thisRadians;
                maxRadians = Geometry.maxAbsXY(thisRadians, maxRadians);
                thisLength = Geometry.hypotenuseXYZ(dx1, dy1, dz1);
                sumLength += thisLength;
                maxLength = Geometry.maxXY(maxLength, thisLength);
                dx0 = dx1;
                dy0 = dy1;
                dz0 = dz1;
                this._workPoint0.setFrom(this._workPoint1);
            }
            const length1 = maxLength * this.degree;
            const length2 = Math.sqrt(length1 * sumLength);
            let radians1 = maxRadians * (this.degree - 1);
            if (this.degree < 3) radians1 *= 3;
            const radians2 = Math.sqrt(radians1 * sumRadians);
            const minCount = this.degree;
            numStrokes = StrokeOptions.applyAngleTol(
                options,
                StrokeOptions.applyMaxEdgeLength(options, minCount, length2),
                radians2,
                0.1
            );
            if (options) {
                numStrokes = options.applyChordTolToLengthAndRadians(
                    numStrokes,
                    sumLength,
                    radians1
                );
            }
        }
        return numStrokes;
    }

    public abstract override clone(): BezierCurveBase;

    public override cloneTransformed(transform: Transform): BezierCurveBase {
        const curve1 = this.clone();
        curve1.tryTransformInPlace(transform);
        return curve1;
    }

    public override constructOffsetXY(
        offsetDistanceOrOptions: number | OffsetOptions
    ): CurvePrimitive | CurvePrimitive[] | undefined {
        const options = OffsetOptions.create(offsetDistanceOrOptions);
        const handler = new CurveOffsetXYHandler(this, options.leftOffsetDistance);
        this.emitStrokableParts(handler, options.strokeOptions);
        return handler.claimResult();
    }

    public override clonePartialCurve(fractionA: number, fractionB: number): BezierCurveBase {
        const partialCurve = this.clone();
        partialCurve._polygon.subdivideToIntervalInPlace(fractionA, fractionB);
        return partialCurve;
    }

    public override projectedParameterRange(
        ray: Vector3d | Ray3d,
        lowHigh?: Range1d
    ): Range1d | undefined {
        return PlaneAltitudeRangeContext.findExtremeFractionsAlongDirection(this, ray, lowHigh);
    }
}
