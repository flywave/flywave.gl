/* Copyright (C) 2025 flywave.gl contributors */



import { type CurveLocationDetail } from "../curve/curve-location-detail";
import { Geometry } from "../geometry";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { Point4d } from "../geometry4d/point4d";
import { BezierPolynomialAlgebra } from "../numerics/bezier-polynomials";
import { BezierCurveBase } from "./bezier-curve-base";

export class BezierCurve3dH extends BezierCurveBase {
    public isSameGeometryClass(other: any): boolean {
        return other instanceof BezierCurve3dH;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        const data = this._workData0;
        for (let i = 0; i < this._polygon.order; i++) {
            this._polygon.getPolygonPoint(i, data);
            transform.multiplyXYZWToFloat64Array(data[0], data[1], data[2], data[3], data);
            this._polygon.setPolygonPoint(i, data);
        }
        return true;
    }

    public tryMultiplyMatrix4dInPlace(matrix: Matrix4d) {
        matrix.multiplyBlockedFloat64ArrayInPlace(this._polygon.packedData);
    }

    private readonly _workRay0: Ray3d;
    private readonly _workRay1: Ray3d;

    public getPolePoint4d(i: number, result?: Point4d): Point4d | undefined {
        const data = this._polygon.getPolygonPoint(i, this._workData0);
        if (data) return Point4d.create(data[0], data[1], data[2], data[3], result);
        return undefined;
    }

    public getPolePoint3d(i: number, result?: Point3d): Point3d | undefined {
        const data = this._polygon.getPolygonPoint(i, this._workData0);
        if (data) return Point3d.createFromPackedXYZW(data, 0, result);
        return undefined;
    }

    public isUnitWeight(tolerance?: number): boolean {
        if (tolerance === undefined) tolerance = Geometry.smallAngleRadians;
        const aLow = 1.0 - tolerance;
        const aHigh = 1.0 + tolerance;
        const data = this._polygon.packedData;
        const n = data.length;
        let a;
        for (let i = 3; i < n; i += 4) {
            a = data[i];
            if (a < aLow || a > aHigh) return false;
        }
        return true;
    }

    private constructor(polygon: Float64Array) {
        super(4, polygon);
        this._workRay0 = Ray3d.createXAxis();
        this._workRay1 = Ray3d.createXAxis();
    }

    public static create(data: Point3d[] | Point4d[] | Point2d[]): BezierCurve3dH | undefined {
        if (data.length < 1) return undefined;
        const polygon = new Float64Array(data.length * 4);
        if (data[0] instanceof Point3d) {
            let i = 0;
            for (const p of data as Point3d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = p.z;
                polygon[i++] = 1.0;
            }
            return new BezierCurve3dH(polygon);
        } else if (data[0] instanceof Point4d) {
            let i = 0;
            for (const p of data as Point4d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = p.z;
                polygon[i++] = p.w;
            }
            return new BezierCurve3dH(polygon);
        } else if (data[0] instanceof Point2d) {
            let i = 0;
            for (const p of data as Point2d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = 0.0;
                polygon[i++] = 1.0;
            }
            return new BezierCurve3dH(polygon);
        }
        return undefined;
    }

    public static createOrder(order: number): BezierCurve3dH {
        const polygonArray = new Float64Array(order * 4);
        return new BezierCurve3dH(polygonArray);
    }

    public loadSpan3dPolesWithWeight(data: Float64Array, spanIndex: number, weight: number) {
        this._polygon.loadSpanPolesWithWeight(data, 3, spanIndex, weight);
    }

    public loadSpan4dPoles(data: Float64Array, spanIndex: number) {
        this._polygon.loadSpanPoles(data, spanIndex);
    }

    public override clone(): BezierCurve3dH {
        return new BezierCurve3dH(this._polygon.clonePolygon());
    }

    public fractionToPoint(fraction: number, result?: Point3d): Point3d {
        this._polygon.evaluate(fraction, this._workData0);
        result = Point3d.createFromPackedXYZW(this._workData0, 0, result);
        return result ? result : Point3d.createZero();
    }

    public fractionToPoint4d(fraction: number, result?: Point4d): Point4d {
        this._polygon.evaluate(fraction, this._workData0);
        return Point4d.createFromPackedXYZW(this._workData0, 0, result);
    }

    public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
        this._polygon.evaluate(fraction, this._workData0);
        this._polygon.evaluateDerivative(fraction, this._workData1);
        result = Ray3d.createWeightedDerivative(this._workData0, this._workData1, result);
        if (result) return result;
        return Ray3d.createXAxis();
    }

    public fractionToPointAnd2Derivatives(
        fraction: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        const epsilon = 1.0e-8;
        const a = 1.0 / (2.0 * epsilon);
        if (!result) result = Plane3dByOriginAndVectors.createXYPlane();
        const ray = this.fractionToPointAndDerivative(fraction, this._workRay0);
        result.origin.setFrom(ray.origin);
        result.vectorU.setFrom(ray.direction);
        const ray0 = this.fractionToPointAndDerivative(fraction - epsilon, this._workRay0);
        const ray1 = this.fractionToPointAndDerivative(fraction + epsilon, this._workRay1);
        Vector3d.createAdd2Scaled(ray0.direction, -a, ray1.direction, a, result.vectorV);
        return result;
    }

    public override isAlmostEqual(other: any): boolean {
        if (other instanceof BezierCurve3dH) {
            return this._polygon.isAlmostEqual(other._polygon);
        }
        return false;
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBezierCurve3dH(this);
    }

    public poleProductsXYZW(
        products: Float64Array,
        ax: number,
        ay: number,
        az: number,
        aw: number
    ) {
        const n = this.numPoles;
        const data = this._polygon.packedData;
        for (let i = 0, k = 0; i < n; i++, k += 4) {
            products[i] = ax * data[k] + ay * data[k + 1] + az * data[k + 2] + aw * data[k + 3];
        }
    }

    public updateClosestPointByTruePerpendicular(
        spacePoint: Point3d,
        detail: CurveLocationDetail,
        testAt0: boolean = false,
        testAt1: boolean = false
    ): boolean {
        let numUpdates = 0;
        let roots: number[] | undefined;
        if (this.isUnitWeight()) {
            const productOrder = 2 * this.order - 2;
            this.allocateAndZeroBezierWorkData(productOrder, 0, 0);
            const bezier = this._workBezier!;

            BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                bezier.coffs,
                this._polygon.packedData,
                4,
                this.order,
                1.0,
                0,
                -spacePoint.x,
                0
            );
            BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                bezier.coffs,
                this._polygon.packedData,
                4,
                this.order,
                1.0,
                1,
                -spacePoint.y,
                1
            );
            BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                bezier.coffs,
                this._polygon.packedData,
                4,
                this.order,
                1.0,
                2,
                -spacePoint.z,
                2
            );
            roots = bezier.roots(0.0, true);
        } else {
            const orderA = this.order;
            const orderB = 2 * this.order - 2;
            const productOrder = orderA + orderB - 1;
            this.allocateAndZeroBezierWorkData(productOrder, orderA, orderB);
            const bezier = this._workBezier!;
            const workA = this._workCoffsA!;
            const workB = this._workCoffsB!;
            const packedData = this._polygon.packedData;
            for (let i = 0; i < 3; i++) {
                for (let k = 0; k < workA.length; k++) workA[k] = 0;
                for (let k = 0; k < workB.length; k++) workB[k] = 0;
                BezierPolynomialAlgebra.scaledComponentSum(
                    workA,
                    packedData,
                    4,
                    orderA,
                    3,
                    spacePoint.at(i),
                    i,
                    -1.0
                );
                BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                    workB,
                    packedData,
                    4,
                    orderA,
                    1.0,
                    3,
                    0.0,
                    i
                );
                BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                    workB,
                    packedData,
                    4,
                    orderA,
                    -1.0,
                    i,
                    0.0,
                    3
                );
                BezierPolynomialAlgebra.accumulateProduct(bezier.coffs, workA, workB);
            }
            roots = bezier.roots(0.0, true);
        }
        if (roots) {
            for (const fraction of roots) {
                const xyz = this.fractionToPoint(fraction);
                const a = xyz.distance(spacePoint);
                numUpdates += detail.updateIfCloserCurveFractionPointDistance(
                    this,
                    fraction,
                    xyz,
                    a
                )
                    ? 1
                    : 0;
            }
        }
        if (testAt0) numUpdates += this.updateDetailAtFraction(detail, 0.0, spacePoint) ? 1 : 0;
        if (testAt1) numUpdates += this.updateDetailAtFraction(detail, 1.0, spacePoint) ? 1 : 0;
        return numUpdates > 0;
    }

    private updateDetailAtFraction(
        detail: CurveLocationDetail,
        fraction: number,
        spacePoint: Point3d
    ): boolean {
        const xyz = this.fractionToPoint(fraction);
        const a = xyz.distance(spacePoint);
        return detail.updateIfCloserCurveFractionPointDistance(this, fraction, xyz, a);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform) {
        const order = this.order;
        if (!transform) {
            this.allocateAndZeroBezierWorkData(order * 2 - 2, 0, 0);
            const bezier = this._workBezier!;
            const data = this._polygon.packedData;
            this.getPolePoint3d(0, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
            this.getPolePoint3d(order - 1, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
            for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
                bezier.zero();
                BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                    bezier.coffs,
                    data,
                    4,
                    order,
                    1.0,
                    axisIndex,
                    0.0,
                    3
                );
                BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
                    bezier.coffs,
                    data,
                    4,
                    order,
                    -1.0,
                    3,
                    0.0,
                    axisIndex
                );
                const roots = bezier.roots(0.0, true);
                if (roots) {
                    for (const r of roots) {
                        this.fractionToPoint(r, this._workPoint0);
                        rangeToExtend.extend(this._workPoint0);
                    }
                }
            }
        } else {
            this.allocateAndZeroBezierWorkData(order * 2 - 2, order, order);
            const componentCoffs = this._workCoffsA!;
            const weightCoffs = this._workCoffsB!;
            const bezier = this._workBezier!;

            this.getPolePoint3d(0, this._workPoint0);
            rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
            this.getPolePoint3d(order - 1, this._workPoint0);
            rangeToExtend.extendTransformedPoint(transform, this._workPoint0);

            const data = this._polygon.packedData;

            let weight;
            for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
                bezier.zero();
                for (let i = 0, k = 0; i < order; i++, k += 4) {
                    weight = data[k + 3];
                    componentCoffs[i] = transform.multiplyComponentXYZW(
                        axisIndex,
                        data[k],
                        data[k + 1],
                        data[k + 2],
                        weight
                    );
                    weightCoffs[i] = weight;
                }
                BezierPolynomialAlgebra.accumulateProductWithDifferences(
                    bezier.coffs,
                    componentCoffs,
                    weightCoffs,
                    1.0
                );
                BezierPolynomialAlgebra.accumulateProductWithDifferences(
                    bezier.coffs,
                    weightCoffs,
                    componentCoffs,
                    -1.0
                );
                const roots = bezier.roots(0.0, true);
                if (roots && roots.length > 0) {
                    for (const r of roots) {
                        this.fractionToPoint(r, this._workPoint0);
                        rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
                    }
                }
            }
        }
    }
}
