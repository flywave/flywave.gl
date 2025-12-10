/* Copyright (C) 2025 flywave.gl contributors */



import { Geometry } from "../../geometry";
import { type IndexedXYZCollection } from "../../geometry3d/indexed-xyz-collection";
import { type Point3d, type Vector3d } from "../../geometry3d/point3d-vector3d";
import { ClipPlane } from "../clip-plane";
import { ConvexClipPlaneSet } from "../convex-clip-plane-set";
import { UnionOfConvexClipPlaneSets } from "../union-of-convex-clip-plane-sets";

export class LineStringOffsetClipperContext {
    private readonly _positiveOffsetLeft: number;
    private readonly _positiveOffsetRight: number;
    private readonly _turnDegrees: number;

    private constructor(positiveOffsetLeft: number, positiveOffsetRight: number) {
        this._positiveOffsetLeft = positiveOffsetLeft;
        this._positiveOffsetRight = positiveOffsetRight;
        this._turnDegrees = 60.0;
    }

    public static createUnit(
        points: IndexedXYZCollection,
        index0: number,
        closed: boolean,
        xyOnly: boolean = true
    ): Vector3d | undefined {
        let k0 = index0;
        let k1 = index0 + 1;
        const last = points.length - 1;
        if (closed) {
            if (index0 < 0) {
                k0 = last - 1;
                k1 = last;
            } else if (index0 >= last) {
                k0 = 0;
                k1 = 1;
            }
        } else {
            if (index0 === 0) {
                k0 = 0;
                k1 = 1;
            } else if (k1 > last) {
                k0 = last - 1;
                k1 = last;
            }
        }
        const result = points.vectorIndexIndex(k0, k1);
        if (result) {
            if (xyOnly) result.z = 0.0;
            return result.normalize(result);
        }
        return undefined;
    }

    private static createDirectedPlane(
        basePoint: Point3d,
        vector: Vector3d,
        shift: number,
        normalScale: number,
        interior: boolean = false
    ): ClipPlane | undefined {
        return ClipPlane.createNormalAndPointXYZXYZ(
            vector.x * normalScale,
            vector.y * normalScale,
            vector.z * normalScale,
            basePoint.x + shift * vector.x,
            basePoint.y + shift * vector.y,
            basePoint.z + shift * vector.z,
            interior,
            interior
        );
    }

    private createChamferCut(
        clipSet: ConvexClipPlaneSet,
        point: Point3d,
        unitA: Vector3d,
        unitB: Vector3d
    ) {
        const degreesA = unitA.angleToXY(unitB).degrees;
        if (Math.abs(degreesA) > this._turnDegrees) {
            const perpAB = unitA.interpolate(0.5, unitB);
            perpAB.rotate90CCWXY(perpAB);
            perpAB.normalizeInPlace();
            if (degreesA > 0) {
                clipSet.addPlaneToConvexSet(
                    LineStringOffsetClipperContext.createDirectedPlane(
                        point,
                        perpAB,
                        -this._positiveOffsetRight,
                        1.0,
                        false
                    )
                );
            } else {
                clipSet.addPlaneToConvexSet(
                    LineStringOffsetClipperContext.createDirectedPlane(
                        point,
                        perpAB,
                        this._positiveOffsetLeft,
                        -1.0,
                        false
                    )
                );
            }
        }
    }

    private createOffsetFromSegment(
        pointA: Point3d,
        pointB: Point3d,
        unitA: Vector3d | undefined,
        unitB: Vector3d | undefined,
        unitC: Vector3d | undefined
    ): ConvexClipPlaneSet | undefined {
        if (unitB === undefined) return undefined;
        if (unitA === undefined) unitA = unitB;
        if (unitC === undefined) unitC = unitB;
        const unitAB = unitA.interpolate(0.5, unitB);
        unitAB.normalizeInPlace();
        const perpB = unitB.rotate90CCWXY();
        const unitBC = unitB.interpolate(0.5, unitC);
        unitBC.normalizeInPlace();
        const clipSet = ConvexClipPlaneSet.createEmpty();
        clipSet.addPlaneToConvexSet(
            LineStringOffsetClipperContext.createDirectedPlane(
                pointA,
                perpB,
                this._positiveOffsetLeft,
                -1.0,
                false
            )
        );
        clipSet.addPlaneToConvexSet(
            LineStringOffsetClipperContext.createDirectedPlane(
                pointA,
                perpB,
                -this._positiveOffsetRight,
                1.0,
                false
            )
        );
        clipSet.addPlaneToConvexSet(
            LineStringOffsetClipperContext.createDirectedPlane(pointA, unitAB, 0, 1.0, true)
        );
        clipSet.addPlaneToConvexSet(
            LineStringOffsetClipperContext.createDirectedPlane(pointB, unitBC, 0, -1.0, true)
        );
        this.createChamferCut(clipSet, pointA, unitA, unitB);
        this.createChamferCut(clipSet, pointB, unitB, unitC);
        return clipSet;
    }

    public static createClipBetweenOffsets(
        points: IndexedXYZCollection,
        positiveOffsetLeft: number,
        positiveOffsetRight: number,
        z0: number | undefined,
        z1: number | undefined
    ): UnionOfConvexClipPlaneSets {
        const context = new LineStringOffsetClipperContext(positiveOffsetLeft, positiveOffsetRight);
        const result = UnionOfConvexClipPlaneSets.createEmpty();
        if (points.length > 1) {
            const closed = Geometry.isSmallMetricDistance(
                points.distanceIndexIndex(0, points.length - 1)!
            );
            for (let i = 0; i + 1 < points.length; i++) {
                const unitVectorA = this.createUnit(points, i - 1, closed);
                const unitVectorB = this.createUnit(points, i, closed);
                const unitVectorC = this.createUnit(points, i + 1, closed);
                const clipSet = context.createOffsetFromSegment(
                    points.getPoint3dAtUncheckedPointIndex(i),
                    points.getPoint3dAtUncheckedPointIndex(i + 1),
                    unitVectorA,
                    unitVectorB,
                    unitVectorC
                );
                clipSet?.addZClipPlanes(false, z0, z1);
                if (clipSet) result.addConvexSet(clipSet);
            }
        } else {
            const clipSet = ConvexClipPlaneSet.createEmpty();
            clipSet?.addZClipPlanes(false, z0, z1);
            if (clipSet.planes.length > 0) result.addConvexSet(clipSet);
        }
        return result;
    }
}
