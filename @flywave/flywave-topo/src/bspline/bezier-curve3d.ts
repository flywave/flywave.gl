/* Copyright (C) 2025 flywave.gl contributors */



import { LineString3d } from "../curve/line-string3d";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { Point4d } from "../geometry4d/point4d";
import { BezierPolynomialAlgebra } from "../numerics/bezier-polynomials";
import { BezierCurveBase } from "./bezier-curve-base";

export class BezierCurve3d extends BezierCurveBase {
    public isSameGeometryClass(other: any): boolean {
        return other instanceof BezierCurve3d;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        const data = this._workData0;
        for (let i = 0; i < this._polygon.order; i++) {
            this._polygon.getPolygonPoint(i, data);
            transform.multiplyXYZToFloat64Array(data[0], data[1], data[2], data);
            this._polygon.setPolygonPoint(i, data);
        }
        return true;
    }

    private readonly _workRay0: Ray3d;
    private readonly _workRay1: Ray3d;

    public getPolePoint3d(i: number, result?: Point3d): Point3d | undefined {
        const data = this._polygon.getPolygonPoint(i, this._workData0);
        if (data) return Point3d.create(data[0], data[1], data[2], result);
        return undefined;
    }

    public getPolePoint4d(i: number, result?: Point4d): Point4d | undefined {
        const data = this._polygon.getPolygonPoint(i, this._workData0);
        if (data) return Point4d.create(data[0], data[1], data[2], 1.0, result);
        return undefined;
    }

    private constructor(polygon: Float64Array) {
        super(3, polygon);
        this._workRay0 = Ray3d.createXAxis();
        this._workRay1 = Ray3d.createXAxis();
    }

    public copyPointsAsLineString(): LineString3d {
        const result = LineString3d.create();
        for (let i = 0; i < this._polygon.order; i++) result.addPoint(this.getPolePoint3d(i)!);
        return result;
    }

    public static create(data: Point3d[] | Point2d[]): BezierCurve3d | undefined {
        if (data.length < 1) return undefined;
        const polygon = new Float64Array(data.length * 3);
        if (data[0] instanceof Point3d) {
            let i = 0;
            for (const p of data as Point3d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = p.z;
            }
            return new BezierCurve3d(polygon);
        } else if (data[0] instanceof Point2d) {
            let i = 0;
            for (const p of data as Point2d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = 0.0;
            }
            return new BezierCurve3d(polygon);
        }
        return undefined;
    }

    public static createOrder(order: number): BezierCurve3d {
        const polygonArray = new Float64Array(order * 3);
        return new BezierCurve3d(polygonArray);
    }

    public loadSpanPoles(data: Float64Array, spanIndex: number) {
        this._polygon.loadSpanPoles(data, spanIndex);
    }

    public override clone(): BezierCurve3d {
        return new BezierCurve3d(this._polygon.clonePolygon());
    }

    public fractionToPoint(fraction: number, result?: Point3d): Point3d {
        this._polygon.evaluate(fraction, this._workData0);
        return Point3d.create(this._workData0[0], this._workData0[1], this._workData0[2], result);
    }

    public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
        this._polygon.evaluate(fraction, this._workData0);
        this._polygon.evaluateDerivative(fraction, this._workData1);
        return Ray3d.createXYZUVW(
            this._workData0[0],
            this._workData0[1],
            this._workData0[2],
            this._workData1[0],
            this._workData1[1],
            this._workData1[2],
            result
        );
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
        if (other instanceof BezierCurve3d) {
            return this._polygon.isAlmostEqual(other._polygon);
        }
        return false;
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBezierCurve3d(this);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform) {
        const order = this.order;
        if (!transform) {
            this.allocateAndZeroBezierWorkData(order - 1, 0, 0);
            const bezier = this._workBezier!;
            this.getPolePoint3d(0, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
            this.getPolePoint3d(order - 1, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
            for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
                BezierPolynomialAlgebra.componentDifference(
                    bezier.coffs,
                    this._polygon.packedData,
                    3,
                    order,
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
            this.allocateAndZeroBezierWorkData(order - 1, order, 0);
            const bezier = this._workBezier!;
            const componentCoffs = this._workCoffsA!;

            this.getPolePoint3d(0, this._workPoint0);
            rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
            this.getPolePoint3d(order - 1, this._workPoint0);
            rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
            const data = this._polygon.packedData;
            for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
                for (let i = 0, k = 0; i < order; i++, k += 3) {
                    componentCoffs[i] = transform.multiplyComponentXYZ(
                        axisIndex,
                        data[k],
                        data[k + 1],
                        data[k + 2]
                    );
                }
                BezierPolynomialAlgebra.univariateDifference(componentCoffs, bezier.coffs);
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
