/* Copyright (C) 2025 flywave.gl contributors */



import { BSplineCurve3d, BSplineCurve3dBase } from "../../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../../bspline/bspline-curve3d-homogeneous";
import { type BezierCurve3d } from "../../core-geometry";
import { Geometry } from "../../geometry";
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/plane3d-by-origin-and-unit-normal";
import { Vector2d } from "../../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { SmallSystem, TrigPolynomial } from "../../numerics/polynomials";
import { Arc3d } from "../arc3d";
import { CurveChainWithDistanceIndex } from "../curve-chain-with-distance-index";
import { CurveCollection } from "../curve-collection";
import {
    CurveIntervalRole,
    CurveLocationDetail,
    CurveLocationDetailPair
} from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { type AnyCurve } from "../curve-types";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";

// cspell:word XYRR

/**
 * Handler class for XYZ intersections between _geometryB and another geometry.
 * * Instances are initialized and called from CurveCurve.
 * * geometryB is saved for later reference.
 * @internal
 */
export class CurveCurveIntersectXYZ extends RecurseToCurvesGeometryHandler {
    private readonly _extendA: boolean;
    private _geometryB: AnyCurve;
    private readonly _extendB: boolean;
    private _results: CurveLocationDetailPair[];
    private static readonly _workVector2dA = Vector2d.create();
    private static readonly _workPointAA0 = Point3d.create();
    private static readonly _workPointAA1 = Point3d.create();
    private static readonly _workPointBB0 = Point3d.create();
    private static readonly _workPointBB1 = Point3d.create();
    /**
     * @param extendA flag to enable using extension of the other geometry.
     * @param geometryB second curve for intersection.  Saved for reference by specific handler methods.
     * @param extendB flag for extension of geometryB.
     */
    public constructor(extendA: boolean, geometryB: AnyCurve, extendB: boolean) {
        super();
        this._extendA = extendA;
        this._geometryB = geometryB;
        this._extendB = extendB;
        this._results = [];
    }

    /** Reset the geometry, leaving all other parts unchanged (and preserving accumulated intersections). */
    public resetGeometry(geometryB: AnyCurve): void {
        this._geometryB = geometryB;
    }

    /**
     * Return the results structure for the intersection calculation, structured as an array of CurveLocationDetailPair.
     * @param reinitialize if true, a new results structure is created for use by later calls.
     */
    public grabPairedResults(reinitialize: boolean = false): CurveLocationDetailPair[] {
        const result = this._results;
        if (reinitialize) this._results = [];
        return result;
    }

    private acceptFraction(extend0: boolean, fraction: number, extend1: boolean) {
        if (!extend0 && fraction < 0.0) return false;
        if (!extend1 && fraction > 1.0) return false;
        return true;
    }

    /**
     * Compute intersection of two line segments.
     * Filter by extension rules.
     * Reject if evaluated points do not match coordinates (e.g. close approach point).
     * Record with fraction mapping.
     */
    private recordPointWithLocalFractions(
        localFractionA: number,
        cpA: CurvePrimitive,
        fractionA0: number,
        fractionA1: number,
        localFractionB: number,
        cpB: CurvePrimitive,
        fractionB0: number,
        fractionB1: number,
        reversed: boolean
    ): void {
        const globalFractionA = Geometry.interpolate(fractionA0, localFractionA, fractionA1);
        const globalFractionB = Geometry.interpolate(fractionB0, localFractionB, fractionB1);
        // ignore duplicate of most recent point
        const numPrevious = this._results.length;
        if (numPrevious > 0) {
            const oldDetailA = this._results[numPrevious - 1].detailA;
            const oldDetailB = this._results[numPrevious - 1].detailB;
            if (reversed) {
                if (
                    oldDetailB.isSameCurveAndFraction({ curve: cpA, fraction: globalFractionA }) &&
                    oldDetailA.isSameCurveAndFraction({ curve: cpB, fraction: globalFractionB })
                ) {
                    return;
                }
            } else {
                if (
                    oldDetailA.isSameCurveAndFraction({ curve: cpA, fraction: globalFractionA }) &&
                    oldDetailB.isSameCurveAndFraction({ curve: cpB, fraction: globalFractionB })
                ) {
                    return;
                }
            }
        }
        const pointA = cpA.fractionToPoint(globalFractionA);
        const pointB = cpB.fractionToPoint(globalFractionB);
        if (!pointA.isAlmostEqualMetric(pointB)) return;
        const detailA = CurveLocationDetail.createCurveFractionPoint(cpA, globalFractionA, pointA);
        detailA.setIntervalRole(CurveIntervalRole.isolated);
        const detailB = CurveLocationDetail.createCurveFractionPoint(cpB, globalFractionB, pointB);
        detailB.setIntervalRole(CurveIntervalRole.isolated);
        if (reversed) {
            const pair = new CurveLocationDetailPair(detailB, detailA);
            this._results.push(pair);
        } else {
            const pair = new CurveLocationDetailPair(detailA, detailB);
            this._results.push(pair);
        }
    }

    /**
     * Compute intersection of two line segments.
     * Filter by extension rules.
     * Record with fraction mapping.
     */
    private computeSegmentSegment3D(
        cpA: CurvePrimitive,
        extendA0: boolean,
        pointA0: Point3d,
        fractionA0: number,
        pointA1: Point3d,
        fractionA1: number,
        extendA1: boolean,
        cpB: CurvePrimitive,
        extendB0: boolean,
        pointB0: Point3d,
        fractionB0: number,
        pointB1: Point3d,
        fractionB1: number,
        extendB1: boolean,
        reversed: boolean
    ): void {
        const uv = CurveCurveIntersectXYZ._workVector2dA;
        if (
            SmallSystem.lineSegment3dClosestApproachUnbounded(
                pointA0,
                pointA1,
                pointB0,
                pointB1,
                uv
            ) &&
            this.acceptFraction(extendA0, uv.x, extendA1) &&
            this.acceptFraction(extendB0, uv.y, extendB1)
        ) {
            this.recordPointWithLocalFractions(
                uv.x,
                cpA,
                fractionA0,
                fractionA1,
                uv.y,
                cpB,
                fractionB0,
                fractionB1,
                reversed
            );
        }
    }

    // Caller accesses data from a line segment and passes to here.
    // The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.
    // The fraction and extend parameters allow all combinations to be passed in.
    // This method applies transform.
    private dispatchSegmentSegment(
        cpA: CurvePrimitive,
        extendA0: boolean,
        pointA0: Point3d,
        fractionA0: number,
        pointA1: Point3d,
        fractionA1: number,
        extendA1: boolean,
        cpB: CurvePrimitive,
        extendB0: boolean,
        pointB0: Point3d,
        fractionB0: number,
        pointB1: Point3d,
        fractionB1: number,
        extendB1: boolean,
        reversed: boolean
    ): void {
        this.computeSegmentSegment3D(
            cpA,
            extendA0,
            pointA0,
            fractionA0,
            pointA1,
            fractionA1,
            extendA1,
            cpB,
            extendB0,
            pointB0,
            fractionB0,
            pointB1,
            fractionB1,
            extendB1,
            reversed
        );
    }

    /**
     * Create a plane whose normal is the "better" cross product: `vectorA.crossProduct(vectorB)` or
     * `vectorA.crossProduct(vectorC)`
     * * The heuristic for "better" is:
     *   * first choice is cross product with `vectorB`, if `vectorA` and `vectorB` are sufficiently far from parallel
     * (or anti-parallel).
     *   * otherwise use vectorC
     * @param origin plane origin
     * @param vectorA vector which must be in the plane.
     * @param cosineValue largest cosine of the angle theta between vectorA and vectorB to prefer their cross product, e.g.
     * passing 0.94 ~ cos(20deg) will switch to using vectorC in the cross product if theta < ~20deg or theta > ~160deg.
     * @param vectorB first candidate for additional in-plane vector
     * @param vectorC second candidate for additional in-plane vector
     */
    public createPlaneWithPreferredPerpendicular(
        origin: Point3d,
        vectorA: Vector3d,
        cosineValue: number,
        vectorB: Vector3d,
        vectorC: Vector3d
    ): Plane3dByOriginAndUnitNormal | undefined {
        cosineValue = Geometry.restrictToInterval(
            Math.abs(cosineValue),
            0.0,
            1.0 - Geometry.smallFraction
        );
        const dotAA = vectorA.magnitudeSquared();
        const dotBB = vectorB.magnitudeSquared();
        const dotAB = Math.abs(vectorA.dotProduct(vectorB));
        const cross = vectorA.unitCrossProduct(
            dotAB * dotAB <= cosineValue * cosineValue * dotAA * dotBB ? vectorB : vectorC
        );
        if (cross) return Plane3dByOriginAndUnitNormal.create(origin, cross);
        return undefined;
    }

    // Caller accesses data from a linestring or segment and passes it here.
    // The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.
    // The fraction and extend parameters allow all combinations to be passed in.
    private dispatchSegmentArc(
        cpA: CurvePrimitive,
        extendA0: boolean,
        pointA0: Point3d,
        fractionA0: number,
        pointA1: Point3d,
        fractionA1: number,
        extendA1: boolean,
        arc: Arc3d,
        extendB0: boolean,
        extendB1: boolean,
        reversed: boolean
    ): void {
        const lineVector = Vector3d.createStartEnd(pointA0, pointA1);
        const plane = this.createPlaneWithPreferredPerpendicular(
            pointA0,
            lineVector,
            0.94,
            arc.perpendicularVector,
            arc.vector0
        );
        if (plane !== undefined) {
            const candidates: CurveLocationDetail[] = [];
            arc.appendPlaneIntersectionPoints(plane, candidates);
            let lineFraction;
            let linePoint: Point3d | undefined;
            for (const c of candidates) {
                if (this.acceptFraction(extendB0, c.fraction, extendB1)) {
                    lineFraction = SmallSystem.lineSegment3dClosestPointUnbounded(
                        pointA0,
                        pointA1,
                        c.point
                    );
                    if (lineFraction !== undefined) {
                        linePoint = pointA0.interpolate(lineFraction, pointA1, linePoint);
                        if (
                            linePoint.isAlmostEqualMetric(c.point) &&
                            this.acceptFraction(extendA0, lineFraction, extendA1)
                        ) {
                            this.recordPointWithLocalFractions(
                                lineFraction,
                                cpA,
                                fractionA0,
                                fractionA1,
                                c.fraction,
                                arc,
                                0,
                                1,
                                reversed
                            );
                        }
                    }
                }
            }
        }
    }

    // Caller promises arcs are coplanar.
    // Passes "other" as {center, vector0, vector90} in local xy space of cpA
    // Solves the arc-arc equations for that local ellipse with unit circle.
    // Solution fractions map directly to original arcs.
    private dispatchArcArcInPlane(
        cpA: Arc3d,
        extendA: boolean,
        cpB: Arc3d,
        extendB: boolean,
        reversed: boolean
    ): void {
        const otherVectors = cpA.otherArcAsLocalVectors(cpB);
        if (otherVectors !== undefined) {
            const ellipseRadians: number[] = [];
            const circleRadians: number[] = [];
            TrigPolynomial.solveUnitCircleHomogeneousEllipseIntersection(
                otherVectors.center.x,
                otherVectors.center.y,
                1.0,
                otherVectors.vector0.x,
                otherVectors.vector0.y,
                0.0,
                otherVectors.vector90.x,
                otherVectors.vector90.y,
                0.0,
                ellipseRadians,
                circleRadians
            );
            for (let i = 0; i < ellipseRadians.length; i++) {
                const fractionA = cpA.sweep.radiansToSignedPeriodicFraction(circleRadians[i]);
                const fractionB = cpB.sweep.radiansToSignedPeriodicFraction(ellipseRadians[i]);
                // hm .. do we really need to check the fractions?  We know they are internal to the beziers
                if (
                    this.acceptFraction(extendA, fractionA, extendA) &&
                    this.acceptFraction(extendB, fractionB, extendB)
                ) {
                    this.recordPointWithLocalFractions(
                        fractionA,
                        cpA,
                        0,
                        1,
                        fractionB,
                        cpB,
                        0,
                        1,
                        reversed
                    );
                }
            }
        }
    }

    // Caller accesses data from two arcs.
    // Selects the best conditioned arc (in xy parts) as "circle after inversion".
    // Solves the arc-arc equations.
    private dispatchArcArc(
        cpA: Arc3d,
        extendA: boolean,
        cpB: Arc3d,
        extendB: boolean,
        reversed: boolean
    ): void {
        // If arcs are in different planes:
        // 1) Intersect each plane with the other arc (quadratic)
        // 2) accept points that appear in both intersection sets.
        // If arcs are in parallel planes -- no intersections.
        // If arcs are in the same plane -- xy intersection in that plane.
        const planeA = Plane3dByOriginAndUnitNormal.create(cpA.center, cpA.perpendicularVector);
        const planeB = Plane3dByOriginAndUnitNormal.create(cpB.center, cpB.perpendicularVector);
        if (planeA === undefined || planeB === undefined) return;
        if (planeA.getNormalRef().isParallelTo(planeB.getNormalRef())) {
            if (
                planeA.isPointInPlane(planeB.getOriginRef()) &&
                planeB.isPointInPlane(planeA.getOriginRef())
            ) {
                // coplanar
                this.dispatchArcArcInPlane(cpA, extendA, cpB, extendB, reversed);
            }
        } else {
            const arcBPoints: CurveLocationDetail[] = [];
            cpB.appendPlaneIntersectionPoints(planeA, arcBPoints);
            const arcAPoints: CurveLocationDetail[] = [];
            cpA.appendPlaneIntersectionPoints(planeB, arcAPoints);
            for (const detailB of arcBPoints) {
                for (const detailA of arcAPoints) {
                    if (detailA.point.isAlmostEqual(detailB.point)) {
                        if (
                            this.acceptFraction(extendA, detailA.fraction, extendA) &&
                            this.acceptFraction(extendB, detailB.fraction, extendB)
                        ) {
                            this.recordPointWithLocalFractions(
                                detailA.fraction,
                                cpA,
                                0,
                                1,
                                detailB.fraction,
                                cpB,
                                0,
                                1,
                                reversed
                            );
                        }
                    }
                }
            }
        }
    }

    // Caller accesses data from two arcs.
    // Selects the best conditioned arc (in xy parts) as "circle after inversion".
    // Solves the arc-arc equations.
    private dispatchArcBsplineCurve3d(
        arc: Arc3d,
        extendA: boolean,
        bcurve: BSplineCurve3d,
        extendB: boolean,
        reversed: boolean
    ): void {
        // 创建圆弧所在平面
        const plane = Plane3dByOriginAndUnitNormal.create(arc.center, arc.perpendicularVector);
        if (plane === undefined) return;

        // 计算B样条曲线与平面的交点
        const intersections: CurveLocationDetail[] = [];
        bcurve.appendPlaneIntersectionPoints(plane, intersections);

        // 验证交点是否在圆弧上
        for (const detail of intersections) {
            if (!this.acceptFraction(extendB, detail.fraction, extendB)) continue;

            // 修复：使用closestPoint获取圆弧参数
            const closestDetail = arc.closestPoint(detail.point, extendA);
            const arcFraction = closestDetail.fraction;
            if (arcFraction === undefined) continue;
            if (!this.acceptFraction(extendA, arcFraction, extendA)) continue;

            // 验证点重合
            const arcPoint = arc.fractionToPoint(arcFraction);
            if (!arcPoint.isAlmostEqualMetric(detail.point)) continue;

            // 记录交点
            this.recordPointWithLocalFractions(
                arcFraction,
                arc,
                0,
                1,
                detail.fraction,
                bcurve,
                0,
                1,
                reversed
            );
        }
    }

    private dispatchBSplineCurve3dBSplineCurve3d(
        bcurveA: BSplineCurve3dBase,
        bcurveB: BSplineCurve3dBase,
        reversed: boolean
    ): void {
        // 获取曲线A的贝塞尔段并断言为BezierCurve3d数组
        const bezierSpansA = bcurveA.collectBezierSpans(false) as BezierCurve3d[];
        // 获取曲线B的贝塞尔段并断言为BezierCurve3d数组
        const bezierSpansB = bcurveB.collectBezierSpans(false) as BezierCurve3d[];

        // 遍历所有贝塞尔段对
        for (const bezierA of bezierSpansA) {
            for (const bezierB of bezierSpansB) {
                // 计算段对之间的交点（使用类型断言）
                const intersections = (bezierA as any).intersectBezier3d(bezierB);
                for (const intersect of intersections) {
                    // 映射回原始曲线参数（使用BSplineCurve3d的spanFractionToKnot方法）
                    const fractionA = (bcurveA as BSplineCurve3d).spanFractionToKnot(
                        bezierSpansA.indexOf(bezierA),
                        intersect.fractionA
                    );
                    const fractionB = (bcurveB as BSplineCurve3d).spanFractionToKnot(
                        bezierSpansB.indexOf(bezierB),
                        intersect.fractionB
                    );

                    // 检查参数有效性
                    if (!this.acceptFraction(this._extendA, fractionA, this._extendA)) continue;
                    if (!this.acceptFraction(this._extendB, fractionB, this._extendB)) continue;

                    // 记录交点
                    this.recordPointWithLocalFractions(
                        fractionA,
                        bcurveA,
                        0,
                        1,
                        fractionB,
                        bcurveB,
                        0,
                        1,
                        reversed
                    );
                }
            }
        }
    }

    private dispatchSegmentBsplineCurve(
        cpA: CurvePrimitive,
        extendA0: boolean,
        pointA0: Point3d,
        fractionA0: number,
        pointA1: Point3d,
        fractionA1: number,
        extendA1: boolean,
        bcurve: BSplineCurve3d,
        extendB: boolean,
        reversed: boolean
    ): void {
        // 创建线段方向向量
        const lineDirection = Vector3d.createStartEnd(pointA0, pointA1);
        // 创建线段平面（使用垂直向量）
        const plane = Plane3dByOriginAndUnitNormal.create(pointA0, lineDirection);
        if (plane === undefined) return;

        // 计算B样条与平面交点
        const intersections: CurveLocationDetail[] = [];
        bcurve.appendPlaneIntersectionPoints(plane, intersections);

        // 处理每个交点
        for (const detail of intersections) {
            if (!this.acceptFraction(extendB, detail.fraction, extendB)) continue;

            // 计算在线段上的参数
            const lineFraction = SmallSystem.lineSegment3dClosestPointUnbounded(
                pointA0,
                pointA1,
                detail.point
            );
            if (lineFraction === undefined) continue;
            if (!this.acceptFraction(extendA0, lineFraction, extendA1)) continue;

            // 验证点重合
            const linePoint = pointA0.interpolate(lineFraction, pointA1);
            if (!linePoint.isAlmostEqualMetric(detail.point)) continue;

            // 记录交点
            this.recordPointWithLocalFractions(
                lineFraction,
                cpA,
                fractionA0,
                fractionA1,
                detail.fraction,
                bcurve,
                0,
                1,
                reversed
            );
        }
    }

    public dispatchLineStringBSplineCurve(
        lsA: LineString3d,
        extendA: boolean,
        curveB: BSplineCurve3d,
        extendB: boolean,
        reversed: boolean
    ): void {
        const numA = lsA.numPoints();
        if (numA < 2) return;

        const pointA0 = Point3d.create();
        const pointA1 = Point3d.create();
        const df = 1.0 / (numA - 1);

        // 遍历折线所有线段
        for (let i = 0; i < numA - 1; i++) {
            const f0 = i * df;
            const f1 = (i + 1) * df;
            lsA.pointAt(i, pointA0);
            lsA.pointAt(i + 1, pointA1);

            // 处理每个线段与B样条的交点
            this.dispatchSegmentBsplineCurve(
                lsA,
                extendA && i === 0, // 起始扩展
                pointA0,
                f0,
                pointA1,
                f1,
                extendA && i === numA - 2, // 结束扩展
                curveB,
                extendB,
                reversed
            );
        }
    }

    /** Detail computation for segment intersecting linestring. */
    public computeSegmentLineString(
        lsA: LineSegment3d,
        extendA: boolean,
        lsB: LineString3d,
        extendB: boolean,
        reversed: boolean
    ): any {
        const pointA0 = lsA.point0Ref;
        const pointA1 = lsA.point1Ref;
        const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
        const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
        const numB = lsB.numPoints();
        if (numB > 1) {
            const dfB = 1.0 / (numB - 1);
            let fB0;
            let fB1;
            fB0 = 0.0;
            lsB.pointAt(0, pointB0);
            for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1) {
                lsB.pointAt(ib, pointB1);
                fB1 = ib * dfB;
                this.dispatchSegmentSegment(
                    lsA,
                    extendA,
                    pointA0,
                    0.0,
                    pointA1,
                    1.0,
                    extendA,
                    lsB,
                    ib === 1 && extendB,
                    pointB0,
                    fB0,
                    pointB1,
                    fB1,
                    ib + 1 === numB && extendB,
                    reversed
                );
            }
        }
        return undefined;
    }

    /** Detail computation for arc intersecting linestring. */
    public computeArcLineString(
        arcA: Arc3d,
        extendA: boolean,
        lsB: LineString3d,
        extendB: boolean,
        reversed: boolean
    ): any {
        const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
        const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
        const numB = lsB.numPoints();
        if (numB > 1) {
            const dfB = 1.0 / (numB - 1);
            let fB0;
            let fB1;
            fB0 = 0.0;
            lsB.pointAt(0, pointB0);
            for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1) {
                lsB.pointAt(ib, pointB1);
                fB1 = ib * dfB;
                this.dispatchSegmentArc(
                    lsB,
                    ib === 1 && extendB,
                    pointB0,
                    fB0,
                    pointB1,
                    fB1,
                    ib + 1 === numB && extendB,
                    arcA,
                    extendA,
                    extendA,
                    !reversed
                );
            }
        }
        return undefined;
    }

    /** Detail computation for linestring intersecting linestring. */
    private computeLineStringLineString(
        lsA: LineString3d,
        lsB: LineString3d,
        reversed: boolean
    ): void {
        const pointA0 = CurveCurveIntersectXYZ._workPointAA0;
        const pointA1 = CurveCurveIntersectXYZ._workPointAA1;
        const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
        const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
        const numA = lsA.numPoints();
        const numB = lsB.numPoints();
        if (numA > 1 && numB > 1) {
            lsA.pointAt(0, pointA0);
            const dfA = 1.0 / (numA - 1);
            const dfB = 1.0 / (numB - 1);
            let fA0 = 0.0;
            let fB0;
            let fA1;
            let fB1;
            const extendA = this._extendA;
            const extendB = this._extendB;
            lsA.pointAt(0, pointA0);
            for (let ia = 1; ia < numA; ia++, pointA0.setFrom(pointA1), fA0 = fA1) {
                fA1 = ia * dfA;
                fB0 = 0.0;
                lsA.pointAt(ia, pointA1);
                lsB.pointAt(0, pointB0);
                for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1) {
                    lsB.pointAt(ib, pointB1);
                    fB1 = ib * dfB;
                    this.dispatchSegmentSegment(
                        lsA,
                        ia === 1 && extendA,
                        pointA0,
                        fA0,
                        pointA1,
                        fA1,
                        ia + 1 === numA && extendA,
                        lsB,
                        ib === 1 && extendB,
                        pointB0,
                        fB0,
                        pointB1,
                        fB1,
                        ib + 1 === numB && extendB,
                        reversed
                    );
                }
            }
        }
    }

    /** Low level dispatch of curve collection. */
    private dispatchCurveCollection(geomA: AnyCurve, geomAHandler: (geomA: any) => any): void {
        const geomB = this._geometryB; // save
        if (!geomB || !geomB.children || !(geomB instanceof CurveCollection)) return;
        for (const child of geomB.children) {
            this.resetGeometry(child);
            geomAHandler(geomA);
        }
        this._geometryB = geomB; // restore
    }

    /** Low level dispatch to geomA given a CurveChainWithDistanceIndex in geometryB. */
    private dispatchCurveChainWithDistanceIndex(
        geomA: AnyCurve,
        geomAHandler: (geomA: any) => any
    ): void {
        if (!this._geometryB || !(this._geometryB instanceof CurveChainWithDistanceIndex)) return;
        if (geomA instanceof CurveChainWithDistanceIndex) {
            return;
        }
        const index0 = this._results.length;
        const geomB = this._geometryB; // save
        for (const child of geomB.path.children) {
            this.resetGeometry(child);
            geomAHandler(geomA);
        }
        this.resetGeometry(geomB); // restore
        this._results = CurveChainWithDistanceIndex.convertChildDetailToChainDetail(
            this._results,
            index0,
            undefined,
            geomB,
            true
        );
    }

    /** Double dispatch handler for strongly typed segment. */
    public override handleLineSegment3d(segmentA: LineSegment3d): any {
        if (this._geometryB instanceof LineSegment3d) {
            const segmentB = this._geometryB;
            this.dispatchSegmentSegment(
                segmentA,
                this._extendA,
                segmentA.point0Ref,
                0.0,
                segmentA.point1Ref,
                1.0,
                this._extendA,
                segmentB,
                this._extendB,
                segmentB.point0Ref,
                0.0,
                segmentB.point1Ref,
                1.0,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof LineString3d) {
            this.computeSegmentLineString(
                segmentA,
                this._extendA,
                this._geometryB,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof Arc3d) {
            this.dispatchSegmentArc(
                segmentA,
                this._extendA,
                segmentA.point0Ref,
                0.0,
                segmentA.point1Ref,
                1.0,
                this._extendA,
                this._geometryB,
                this._extendB,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof BSplineCurve3d) {
            this.dispatchSegmentBsplineCurve(
                segmentA,
                this._extendA,
                segmentA.point0Ref,
                0.0,
                segmentA.point1Ref,
                1.0,
                this._extendA,
                this._geometryB,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof CurveCollection) {
            this.dispatchCurveCollection(segmentA, this.handleLineSegment3d.bind(this));
        } else if (this._geometryB instanceof CurveChainWithDistanceIndex) {
            this.dispatchCurveChainWithDistanceIndex(segmentA, this.handleLineSegment3d.bind(this));
        }
        return undefined;
    }

    /** double dispatch handler for strongly typed linestring. */
    public override handleLineString3d(lsA: LineString3d): any {
        if (this._geometryB instanceof LineString3d) {
            const lsB = this._geometryB;
            this.computeLineStringLineString(lsA, lsB, false);
        } else if (this._geometryB instanceof LineSegment3d) {
            this.computeSegmentLineString(this._geometryB, this._extendB, lsA, this._extendA, true);
        } else if (this._geometryB instanceof Arc3d) {
            this.computeArcLineString(this._geometryB, this._extendB, lsA, this._extendA, true);
        } else if (this._geometryB instanceof BSplineCurve3d) {
            this.dispatchLineStringBSplineCurve(
                lsA,
                this._extendA,
                this._geometryB,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof CurveCollection) {
            this.dispatchCurveCollection(lsA, this.handleLineString3d.bind(this));
        } else if (this._geometryB instanceof CurveChainWithDistanceIndex) {
            this.dispatchCurveChainWithDistanceIndex(lsA, this.handleLineString3d.bind(this));
        }
        return undefined;
    }

    /** Double dispatch handler for strongly typed arc. */
    public override handleArc3d(arc0: Arc3d): any {
        if (this._geometryB instanceof LineSegment3d) {
            this.dispatchSegmentArc(
                this._geometryB,
                this._extendB,
                this._geometryB.point0Ref,
                0.0,
                this._geometryB.point1Ref,
                1.0,
                this._extendB,
                arc0,
                this._extendA,
                this._extendA,
                true
            );
        } else if (this._geometryB instanceof LineString3d) {
            this.computeArcLineString(arc0, this._extendA, this._geometryB, this._extendB, false);
        } else if (this._geometryB instanceof Arc3d) {
            this.dispatchArcArc(arc0, this._extendA, this._geometryB, this._extendB, false);
        } else if (this._geometryB instanceof BSplineCurve3d) {
            this.dispatchArcBsplineCurve3d(
                arc0,
                this._extendA,
                this._geometryB,
                this._extendB,
                false
            );
        } else if (this._geometryB instanceof CurveCollection) {
            this.dispatchCurveCollection(arc0, this.handleArc3d.bind(this));
        } else if (this._geometryB instanceof CurveChainWithDistanceIndex) {
            this.dispatchCurveChainWithDistanceIndex(arc0, this.handleArc3d.bind(this));
        }
        return undefined;
    }

    /** Double dispatch handler for strongly typed bspline curve. */
    public override handleBSplineCurve3d(curve: BSplineCurve3d): any {
        if (this._geometryB instanceof LineSegment3d) {
            this.dispatchSegmentBsplineCurve(
                this._geometryB,
                this._extendB,
                this._geometryB.point0Ref,
                0.0,
                this._geometryB.point1Ref,
                1.0,
                this._extendB,
                curve,
                this._extendA,
                true
            );
        } else if (this._geometryB instanceof LineString3d) {
            this.dispatchLineStringBSplineCurve(
                this._geometryB,
                this._extendB,
                curve,
                this._extendA,
                true
            );
        } else if (this._geometryB instanceof Arc3d) {
            this.dispatchArcBsplineCurve3d(
                this._geometryB,
                this._extendB,
                curve,
                this._extendA,
                true
            );
        } else if (this._geometryB instanceof BSplineCurve3dBase) {
            this.dispatchBSplineCurve3dBSplineCurve3d(curve, this._geometryB, false);
        } else if (this._geometryB instanceof CurveCollection) {
            this.dispatchCurveCollection(curve, this.handleBSplineCurve3d.bind(this));
        } else if (this._geometryB instanceof CurveChainWithDistanceIndex) {
            this.dispatchCurveChainWithDistanceIndex(curve, this.handleBSplineCurve3d.bind(this));
        }
        return undefined;
    }

    /** Double dispatch handler for strongly typed CurveChainWithDistanceIndex. */
    public override handleCurveChainWithDistanceIndex(chain: CurveChainWithDistanceIndex): any {
        super.handleCurveChainWithDistanceIndex(chain);
        // if _geometryB is also a CurveChainWithDistanceIndex, it will already have been converted by dispatchCurveChainWithDistanceIndex
        this._results = CurveChainWithDistanceIndex.convertChildDetailToChainDetail(
            this._results,
            0,
            chain,
            undefined,
            true
        );
    }

    /** Double dispatch handler for strongly typed homogeneous bspline curve. */
    public override handleBSplineCurve3dH(_curve: BSplineCurve3dH): any {
        /*
    // NEEDS WORK -- make "dispatch" methods tolerant of both 3d and 3dH
    // "easy" if both present BezierCurve3dH span loaders
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentBsplineCurve(
        this._geometryB, this._extendB, this._geometryB.point0Ref, 0.0, this._geometryB.point1Ref, 1.0, this._extendB,
        curve, this._extendA, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.dispatchLineStringBSplineCurve(this._geometryB, this._extendB, curve, this._extendA, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcBsplineCurve3d(this._geometryB, this._extendB, curve, this._extendA, true);
    }
    */
        return undefined;
    }
}
