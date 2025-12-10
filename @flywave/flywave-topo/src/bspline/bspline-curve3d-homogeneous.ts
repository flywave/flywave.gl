/* Copyright (C) 2025 flywave.gl contributors */



import { CurvePrimitive } from "../curve/curve-primitive";
import { type LineString3d } from "../curve/line-string3d";
import { StrokeCountMap } from "../curve/query/stroke-count-map";
import { type StrokeOptions } from "../curve/stroke-options";
import { Geometry } from "../geometry";
import { type GeometryHandler, type IStrokeHandler } from "../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { type Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3dArray, Point4dArray } from "../geometry3d/point-helpers";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { Point4d } from "../geometry4d/point4d";
import { type BezierCurveBase } from "./bezier-curve-base";
import { BezierCurve3dH } from "./bezier-curve3d-homogeneous";
import { BSplineCurve3dBase } from "./bspline-curve";
import { KnotVector } from "./knot-vector";

export class BSplineCurve3dH extends BSplineCurve3dBase {
    private _workBezier?: BezierCurve3dH;
    private initializeWorkBezier(): BezierCurve3dH {
        if (this._workBezier === undefined) {
            this._workBezier = BezierCurve3dH.createOrder(this.order);
        }
        return this._workBezier;
    }

    public isSameGeometryClass(other: any): boolean {
        return other instanceof BSplineCurve3dH;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        Point4dArray.multiplyInPlace(transform, this._bcurve.packedData);
        return true;
    }

    public getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined {
        const k = this.poleIndexToDataIndex(poleIndex);
        if (k !== undefined) {
            const data = this._bcurve.packedData;
            const divW = Geometry.conditionalDivideFraction(1.0, data[k + 3]);
            if (divW !== undefined) {
                return Point3d.create(
                    data[k] * divW,
                    data[k + 1] * divW,
                    data[k + 2] * divW,
                    result
                );
            }
        }
        return undefined;
    }

    public getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined {
        const k = this.poleIndexToDataIndex(poleIndex);
        if (k !== undefined) {
            const data = this._bcurve.packedData;
            return Point4d.create(data[k], data[k + 1], data[k + 2], data[k + 3], result);
        }
        return undefined;
    }

    public spanFractionToKnot(span: number, localFraction: number): number {
        return this._bcurve.spanFractionToKnot(span, localFraction);
    }

    private constructor(numPoles: number, order: number, knots: KnotVector) {
        super(4, numPoles, order, knots);
    }

    public copyPoints(): any[] {
        return Point3dArray.unpackNumbersToNestedArrays(this._bcurve.packedData, 4);
    }

    public copyPointsFloat64Array(): Float64Array {
        return this._bcurve.packedData.slice();
    }

    public copyXYZFloat64Array(deweighted: boolean): Float64Array {
        const numValue = this.numPoles * 3;
        const result = new Float64Array(numValue);
        let k = 0;
        for (let poleIndex = 0; poleIndex < this.numPoles; poleIndex++) {
            let i = poleIndex * 4;
            if (deweighted) {
                const w = this._bcurve.packedData[i + 3];
                const dw = w === 0.0 ? 1.0 : 1.0 / w;
                result[k++] = this._bcurve.packedData[i++] * dw;
                result[k++] = this._bcurve.packedData[i++] * dw;
                result[k++] = this._bcurve.packedData[i++] * dw;
            } else {
                result[k++] = this._bcurve.packedData[i++];
                result[k++] = this._bcurve.packedData[i++];
                result[k++] = this._bcurve.packedData[i++];
            }
        }
        return result;
    }

    public copyWeightsFloat64Array(): Float64Array {
        const result = new Float64Array(this.numPoles);
        for (let poleIndex = 0; poleIndex < this.numPoles; poleIndex++) {
            result[poleIndex] = this._bcurve.packedData[4 * poleIndex + 3];
        }
        return result;
    }

    public static createUniformKnots(
        controlPoints: Point3d[] | Point4d[] | Float64Array,
        order: number
    ): BSplineCurve3dH | undefined {
        const numPoles =
            controlPoints instanceof Float64Array ? controlPoints.length / 4 : controlPoints.length;
        if (order < 1 || numPoles < order) return undefined;
        const knots = KnotVector.createUniformClamped(controlPoints.length, order - 1, 0.0, 1.0);
        const curve = new BSplineCurve3dH(numPoles, order, knots);
        let i = 0;
        if (controlPoints[0] instanceof Point3d) {
            for (const p of controlPoints as Point3d[]) {
                curve._bcurve.packedData[i++] = p.x;
                curve._bcurve.packedData[i++] = p.y;
                curve._bcurve.packedData[i++] = p.z;
                curve._bcurve.packedData[i++] = 1.0;
            }
        } else if (controlPoints[0] instanceof Point4d) {
            for (const p of controlPoints as Point4d[]) {
                curve._bcurve.packedData[i++] = p.x;
                curve._bcurve.packedData[i++] = p.y;
                curve._bcurve.packedData[i++] = p.z;
                curve._bcurve.packedData[i++] = p.w;
            }
        } else if (controlPoints instanceof Float64Array) {
            const numQ = controlPoints.length;
            for (let k = 0; k < numQ; k++) {
                curve._bcurve.packedData[k] = controlPoints[k];
            }
        } else {
            return undefined;
        }
        return curve;
    }

    public static assemblePackedXYZW(
        controlPoints:
            | Float64Array
            | Point4d[]
            | { xyz: Float64Array; weights: Float64Array }
            | Point3d[]
    ): Float64Array | undefined {
        if (controlPoints instanceof Float64Array) {
            return controlPoints.slice();
        } else if (Array.isArray(controlPoints)) {
            const cpArray = controlPoints as any[];
            if (cpArray[0] instanceof Point4d) {
                const numPoints = cpArray.length;
                const packedPoints = new Float64Array(4 * numPoints);
                let i = 0;
                for (const p of controlPoints as Point4d[]) {
                    packedPoints[i++] = p.x;
                    packedPoints[i++] = p.y;
                    packedPoints[i++] = p.z;
                    packedPoints[i++] = p.w;
                }
                return packedPoints;
            } else if (cpArray[0] instanceof Point3d) {
                const numPoints = cpArray.length;
                const packedPoints = new Float64Array(4 * numPoints);
                let i = 0;
                for (const p of controlPoints as Point3d[]) {
                    packedPoints[i++] = p.x;
                    packedPoints[i++] = p.y;
                    packedPoints[i++] = p.z;
                    packedPoints[i++] = 1.0;
                }
                return packedPoints;
            }
        } else {
            const obj = controlPoints as any;
            if (
                obj.xyz instanceof Float64Array &&
                obj.weights instanceof Float64Array &&
                obj.xyz.length === 3 * obj.weights.length
            ) {
                const numPoints = obj.weights.length;
                const packedPoints = new Float64Array(4 * numPoints);

                let m = 0;
                for (let i = 0; i < obj.weights.length; i++) {
                    const k = 3 * i;
                    packedPoints[m++] = obj.xyz[k];
                    packedPoints[m++] = obj.xyz[k + 1];
                    packedPoints[m++] = obj.xyz[k + 2];
                    packedPoints[m++] = obj.weights[i];
                }
                return packedPoints;
            }
        }
        return undefined;
    }

    public static create(
        controlPointData:
            | Float64Array
            | Point4d[]
            | { xyz: Float64Array; weights: Float64Array }
            | Point3d[],
        knotArray: Float64Array | number[],
        order: number
    ): BSplineCurve3dH | undefined {
        if (order < 2) return undefined;
        const controlPoints = this.assemblePackedXYZW(controlPointData);
        if (controlPoints instanceof Float64Array) {
            const numPoles = Math.floor(controlPoints.length / 4);
            const numKnots = knotArray.length;
            const skipFirstAndLast = numPoles + order === numKnots;
            const knots = KnotVector.create(knotArray, order - 1, skipFirstAndLast);
            if (numPoles < order) return undefined;
            const curve = new BSplineCurve3dH(numPoles, order, knots);
            let i = 0;
            for (const coordinate of controlPoints) {
                curve._bcurve.packedData[i++] = coordinate;
            }
            return curve;
        }
        return undefined;
    }

    public override clone(): BSplineCurve3dH {
        const knotVector1 = this._bcurve.knots.clone();
        const curve1 = new BSplineCurve3dH(this.numPoles, this.order, knotVector1);
        curve1._bcurve.packedData = this._bcurve.packedData.slice();
        return curve1;
    }

    public evaluatePointInSpan(spanIndex: number, spanFraction: number, result?: Point3d): Point3d {
        this._bcurve.evaluateBuffersInSpan(spanIndex, spanFraction);
        const xyzw = this._bcurve.poleBuffer;
        return Point4d.createRealPoint3dDefault000(xyzw[0], xyzw[1], xyzw[2], xyzw[3], result);
    }

    public evaluatePointAndDerivativeInSpan(
        spanIndex: number,
        spanFraction: number,
        result?: Ray3d
    ): Ray3d {
        this._bcurve.evaluateBuffersInSpan1(spanIndex, spanFraction);
        const xyzw = this._bcurve.poleBuffer;
        const dXYZW = this._bcurve.poleBuffer1;
        return Point4d.createRealDerivativeRay3dDefault000(
            xyzw[0],
            xyzw[1],
            xyzw[2],
            xyzw[3],
            dXYZW[0],
            dXYZW[1],
            dXYZW[2],
            dXYZW[3],
            result
        );
    }

    public knotToPoint(u: number, result?: Point3d): Point3d {
        this._bcurve.evaluateBuffersAtKnot(u);
        const xyzw = this._bcurve.poleBuffer;
        return Point4d.createRealPoint3dDefault000(xyzw[0], xyzw[1], xyzw[2], xyzw[3], result);
    }

    public knotToPointAndDerivative(u: number, result?: Ray3d): Ray3d {
        this._bcurve.evaluateBuffersAtKnot(u, 1);
        const xyzw = this._bcurve.poleBuffer;
        const dXYZW = this._bcurve.poleBuffer1;
        return Point4d.createRealDerivativeRay3dDefault000(
            xyzw[0],
            xyzw[1],
            xyzw[2],
            xyzw[3],
            dXYZW[0],
            dXYZW[1],
            dXYZW[2],
            dXYZW[3],
            result
        );
    }

    public knotToPointAnd2Derivatives(
        u: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        this._bcurve.evaluateBuffersAtKnot(u, 2);
        const xyzw = this._bcurve.poleBuffer;
        const dXYZW = this._bcurve.poleBuffer1;
        const ddXYZW = this._bcurve.poleBuffer2;
        return Point4d.createRealDerivativePlane3dByOriginAndVectorsDefault000(
            xyzw[0],
            xyzw[1],
            xyzw[2],
            xyzw[3],
            dXYZW[0],
            dXYZW[1],
            dXYZW[2],
            dXYZW[3],
            ddXYZW[0],
            ddXYZW[1],
            ddXYZW[2],
            ddXYZW[3],
            result
        );
    }

    public override isAlmostEqual(other: any): boolean {
        if (other instanceof BSplineCurve3dH) {
            return (
                this._bcurve.knots.isAlmostEqual(other._bcurve.knots) &&
                Point4dArray.isAlmostEqual(this._bcurve.packedData, other._bcurve.packedData)
            );
        }
        return false;
    }

    public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
        return Point4dArray.isCloseToPlane(this._bcurve.packedData, plane);
    }

    public quickLength(): number {
        return Point3dArray.sumEdgeLengths(this._bcurve.packedData);
    }

    public emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void {
        const needBeziers = (handler as any).announceBezierCurve;
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        let numStrokes;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3dOr3dH(spanIndex, false, workBezier);
            if (bezier) {
                numStrokes = bezier.computeStrokeCountForOptions(options);
                if (needBeziers) {
                    (handler as any).announceBezierCurve(
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

    public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3dH(spanIndex, workBezier);
            if (bezier) bezier.emitStrokes(dest, options);
        }
    }

    public computeStrokeCountForOptions(options?: StrokeOptions): number {
        const workBezier = this.initializeWorkBezier();
        const numSpan = this.numSpan;
        let numStroke = 0;
        for (let spanIndex = 0; spanIndex < numSpan; spanIndex++) {
            const bezier = this.getSaturatedBezierSpan3dH(spanIndex, workBezier);
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
            const bezier = this.getSaturatedBezierSpan3dH(spanIndex, workBezier);
            if (bezier) {
                const segmentLength = workBezier.curveLength();
                const numStrokeOnSegment = workBezier.computeStrokeCountForOptions(options);
                myData.addToCountAndLength(numStrokeOnSegment, segmentLength);
            }
        }
        CurvePrimitive.installStrokeCountMap(this, myData, parentStrokeMap);
    }

    public get isClosable(): boolean {
        if (!this._bcurve.knots.wrappable) return false;
        const degree = this.degree;
        const leftKnotIndex = this._bcurve.knots.leftKnotIndex;
        const rightKnotIndex = this._bcurve.knots.rightKnotIndex;
        const period = this._bcurve.knots.rightKnot - this._bcurve.knots.leftKnot;
        const indexDelta = rightKnotIndex - leftKnotIndex;
        for (let k0 = leftKnotIndex - degree + 1; k0 < leftKnotIndex + degree - 1; k0++) {
            const k1 = k0 + indexDelta;
            if (
                !Geometry.isSameCoordinate(
                    this._bcurve.knots.knots[k0] + period,
                    this._bcurve.knots.knots[k1]
                )
            ) {
                return false;
            }
        }
        const poleIndexDelta = this.numPoles - this.degree;
        for (let p0 = 0; p0 < degree; p0++) {
            const p1 = p0 + poleIndexDelta;
            if (
                !Geometry.isSamePoint3d(
                    this.getPolePoint3d(p0) as Point3d,
                    this.getPolePoint3d(p1) as Point3d
                )
            ) {
                return false;
            }
        }
        return true;
    }

    public getSaturatedBezierSpan3dH(
        spanIndex: number,
        result?: BezierCurveBase
    ): BezierCurveBase | undefined {
        if (spanIndex < 0 || spanIndex >= this.numSpan) return undefined;

        const order = this.order;
        if (result === undefined || !(result instanceof BezierCurve3dH) || result.order !== order) {
            result = BezierCurve3dH.createOrder(order);
        }
        const bezier = result as BezierCurve3dH;
        bezier.loadSpan4dPoles(this._bcurve.packedData, spanIndex);
        if (bezier.saturateInPlace(this._bcurve.knots, spanIndex)) return result;
        return undefined;
    }

    public getSaturatedBezierSpan3dOr3dH(
        spanIndex: number,
        _prefer3dH: boolean,
        result?: BezierCurveBase
    ): BezierCurveBase | undefined {
        return this.getSaturatedBezierSpan3dH(spanIndex, result);
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBSplineCurve3dH(this);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
        const buffer = this._bcurve.packedData;
        const n = buffer.length - 3;
        if (transform) {
            for (let i0 = 0; i0 < n; i0 += 4) {
                rangeToExtend.extendTransformedXYZW(
                    transform,
                    buffer[i0],
                    buffer[i0 + 1],
                    buffer[i0 + 2],
                    buffer[i0 + 3]
                );
            }
        } else {
            for (let i0 = 0; i0 < n; i0 += 4) {
                rangeToExtend.extendXYZW(
                    buffer[i0],
                    buffer[i0 + 1],
                    buffer[i0 + 2],
                    buffer[i0 + 3]
                );
            }
        }
    }
}
