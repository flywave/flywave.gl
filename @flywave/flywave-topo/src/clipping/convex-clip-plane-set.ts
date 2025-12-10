/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import {
    type AnnounceNumberNumber,
    type AnnounceNumberNumberCurvePrimitive
} from "../curve/curve-primitive";
import { Geometry } from "../geometry";
import { type Angle } from "../geometry3d/angle";
import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Matrix3d } from "../geometry3d/matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { type Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { IndexedXYZCollectionPolygonOps, PolygonOps } from "../geometry3d/polygon-ops";
import { type Range3d, Range1d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Transform } from "../geometry3d/transform";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { type PolyfaceVisitor, Polyface } from "../polyface/polyface";
import { PolyfaceQuery } from "../polyface/polyface-query";
import { type ClipPlaneProps, ClipPlane } from "./clip-plane";
import {
    type Clipper,
    type PolygonClipper,
    ClipPlaneContainment,
    ClipUtilities
} from "./clip-utils";

export type ConvexClipPlaneSetProps = ClipPlaneProps[];

export class ConvexClipPlaneSet implements Clipper, PolygonClipper {
    public static readonly hugeVal = 1e37;
    private readonly _planes: ClipPlane[];
    private constructor(planes?: ClipPlane[]) {
        this._planes = planes ? planes : [];
    }

    public toJSON(): ConvexClipPlaneSetProps {
        const val: ClipPlaneProps[] = [];
        for (const plane of this._planes) val.push(plane.toJSON());
        return val;
    }

    public static fromJSON(
        json: ConvexClipPlaneSetProps | undefined,
        result?: ConvexClipPlaneSet
    ): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        result._planes.length = 0;
        if (!Array.isArray(json)) return result;
        for (const thisJson of json) {
            const plane = ClipPlane.fromJSON(thisJson);
            if (plane) result._planes.push(plane);
        }
        return result;
    }

    public isAlmostEqual(other: ConvexClipPlaneSet): boolean {
        if (this._planes.length !== other._planes.length) return false;
        for (let i = 0; i < this._planes.length; i++) {
            if (!this._planes[i].isAlmostEqual(other._planes[i])) return false;
        }
        return true;
    }

    public static createPlanes(
        planes: Array<ClipPlane | Plane3dByOriginAndUnitNormal>,
        result?: ConvexClipPlaneSet
    ): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        for (const plane of planes) {
            if (plane instanceof ClipPlane) {
                result._planes.push(plane);
            } else if (plane instanceof Plane3dByOriginAndUnitNormal) {
                const clipPlane = ClipPlane.createPlane(plane);
                result._planes.push(clipPlane);
            }
        }
        return result;
    }

    public static createRange3dPlanes(
        range: Range3d,
        lowX: boolean = true,
        highX: boolean = true,
        lowY: boolean = true,
        highY: boolean = true,
        lowZ: boolean = true,
        highZ: boolean = true
    ): ConvexClipPlaneSet {
        const result = ConvexClipPlaneSet.createEmpty();

        if (lowX) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(1, 0, 0, range.low.x, 0, 0)!);
        }
        if (highX) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(-1, 0, 0, range.high.x, 0, 0)!);
        }

        if (lowY) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(0, 1, 0, 0, range.low.y, 0)!);
        }
        if (highY) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(0, -1, 0, 0, range.high.y, 0)!);
        }

        if (lowZ) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(0, 0, 1, 0, 0, range.low.z)!);
        }
        if (highZ) {
            result.planes.push(ClipPlane.createNormalAndPointXYZXYZ(0, 0, -1, 0, 0, range.high.z)!);
        }

        return result;
    }

    public static createEmpty(result?: ConvexClipPlaneSet): ConvexClipPlaneSet {
        if (result) {
            result._planes.length = 0;
            return result;
        }
        return new ConvexClipPlaneSet();
    }

    public negateAllPlanes(): void {
        for (const plane of this._planes) plane.negateInPlace();
    }

    public static createXYBox(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        result?: ConvexClipPlaneSet
    ): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        result._planes.length = 0;
        const clip0 = ClipPlane.createNormalAndDistance(
            Vector3d.create(-1, 0, 0),
            -x1,
            false,
            true
        );
        const clip1 = ClipPlane.createNormalAndDistance(Vector3d.create(1, 0, 0), x0, false, true);
        const clip2 = ClipPlane.createNormalAndDistance(
            Vector3d.create(0, -1, 0),
            -y1,
            false,
            true
        );
        const clip3 = ClipPlane.createNormalAndDistance(Vector3d.create(0, 1, 0), y0, false, true);
        if (clip0 && clip1 && clip2 && clip3) {
            result._planes.push(clip0, clip1, clip2, clip3);
        }
        return result;
    }

    public static createXYPolyLine(
        points: Point3d[],
        interior: boolean[] | undefined,
        leftIsInside: boolean,
        result?: ConvexClipPlaneSet
    ): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        result._planes.length = 0;
        for (let i0 = 0; i0 + 1 < points.length; i0++) {
            const edgeVector: Vector3d = Vector3d.createStartEnd(points[i0], points[i0 + 1]);
            const perp: Vector3d = edgeVector.unitPerpendicularXY();
            perp.z = 0.0;

            if (!leftIsInside) perp.scaleInPlace(-1.0);

            const perpNormalized = perp.normalize();
            if (perpNormalized) {
                const flag = interior !== undefined ? interior[i0] : false;
                const clip = ClipPlane.createNormalAndPoint(perp, points[i0], flag, flag);
                if (clip) {
                    result._planes.push(clip);
                }
            }
        }
        return result;
    }

    public static createXYPolyLineInsideLeft(
        points: Point3d[],
        result?: ConvexClipPlaneSet
    ): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        result._planes.length = 0;
        for (let i0 = 0; i0 + 1 < points.length; i0++) {
            const edgeVector: Vector3d = Vector3d.createStartEnd(points[i0], points[i0 + 1]);
            const perp: Vector3d = edgeVector.unitPerpendicularXY();
            perp.z = 0.0;

            const perpNormalized = perp.normalize();
            if (perpNormalized) {
                const clip = ClipPlane.createNormalAndPoint(perp, points[i0], false, false);
                if (clip) {
                    result._planes.push(clip);
                }
            }
        }
        return result;
    }

    public static setPlaneAndXYLoopCCW(
        points: GrowableXYZArray,
        planeOfPolygon: ClipPlane,
        frustum: ConvexClipPlaneSet
    ) {
        const i0 = points.length - 1;
        const n = points.length;
        let x0 = points.getXAtUncheckedPointIndex(i0);
        let y0 = points.getYAtUncheckedPointIndex(i0);
        let x1, y1, nx, ny;
        frustum._planes.length = 0;
        const z0 = points.getZAtUncheckedPointIndex(i0); // z for planes can stay fixed
        const planeNormal = points.crossProductIndexIndexIndex(0, 2, 1)!;
        ClipPlane.createNormalAndPointXYZXYZ(
            planeNormal.x,
            planeNormal.y,
            planeNormal.z,
            x0,
            y0,
            z0,
            false,
            false,
            planeOfPolygon
        );
        if (planeNormal.normalizeInPlace()) {
            for (let i1 = 0; i1 < n; i1++, x0 = x1, y0 = y1) {
                x1 = points.getXAtUncheckedPointIndex(i1);
                y1 = points.getYAtUncheckedPointIndex(i1);
                nx = -(y1 - y0);
                ny = x1 - x0;
                const clipper = ClipPlane.createNormalAndPointXYZXYZ(nx, ny, 0, x1, y1, z0);
                if (clipper) frustum._planes.push(clipper);
            }
        }
    }

    public clone(result?: ConvexClipPlaneSet): ConvexClipPlaneSet {
        result = result ? result : new ConvexClipPlaneSet();
        result._planes.length = 0;
        for (const plane of this._planes) result._planes.push(plane.clone());
        return result;
    }

    public get planes(): ClipPlane[] {
        return this._planes;
    }

    public hasIntersectionWithRay(
        ray: Ray3d,
        result?: Range1d,
        tolerance: number = Geometry.smallMetricDistance
    ): boolean {
        let t0 = -Geometry.largeCoordinateResult;
        let t1 = Geometry.largeCoordinateResult;
        if (result) result.setNull();
        const velocityTolerance = 1.0e-13;
        for (const plane of this._planes) {
            const vD = plane.velocity(ray.direction);
            const vN = plane.altitude(ray.origin);

            if (Math.abs(vD) <= velocityTolerance) {
                if (vN < -tolerance) return false;
            } else {
                const rayFraction = -vN / vD;
                if (vD < 0.0) {
                    if (rayFraction < t1) t1 = rayFraction;
                } else {
                    if (rayFraction > t0) t0 = rayFraction;
                }
            }
        }
        if (t1 < t0) return false;
        if (result) {
            result.extendX(t0);
            result.extendX(t1);
        }
        return true;
    }

    public multiplyPlanesByMatrix4d(
        matrix: Matrix4d,
        invert: boolean = true,
        transpose: boolean = true
    ): boolean {
        if (invert) {
            const inverse = matrix.createInverse();
            if (!inverse) return false;
            return this.multiplyPlanesByMatrix4d(inverse, false, transpose);
        }
        for (const plane of this._planes) {
            plane.multiplyPlaneByMatrix4d(matrix, false, transpose);
        }
        return true;
    }

    public isPointInside(point: Point3d): boolean {
        for (const plane of this._planes) {
            if (!plane.isPointInside(point)) return false;
        }
        return true;
    }

    public isPointOnOrInside(
        point: Point3d,
        tolerance: number = Geometry.smallMetricDistance
    ): boolean {
        const interiorTolerance = Math.abs(tolerance);
        for (const plane of this._planes) {
            if (!plane.isPointOnOrInside(point, plane.interior ? interiorTolerance : tolerance)) {
                return false;
            }
        }
        return true;
    }

    public isSphereInside(centerPoint: Point3d, radius: number): boolean {
        const r1 = Math.abs(radius) + Geometry.smallMetricDistance;
        for (const plane of this._planes) {
            if (!plane.isPointOnOrInside(centerPoint, r1)) {
                return false;
            }
        }
        return true;
    }

    public announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: AnnounceNumberNumber
    ): boolean {
        let fraction: number | undefined;
        if (f1 < f0) return false;
        for (const plane of this._planes) {
            const hA = -plane.altitude(pointA);
            const hB = -plane.altitude(pointB);
            fraction = Geometry.conditionalDivideFraction(-hA, hB - hA);
            if (fraction === undefined) {
                if (hA > 0.0) return false;
            } else if (hB > hA) {
                if (fraction < f0) return false;
                if (fraction < f1) f1 = fraction;
            } else if (hA > hB) {
                if (fraction > f1) return false;
                if (fraction > f0) f0 = fraction;
            } else {
                if (hA > 0.0) return false;
            }
        }
        if (f1 >= f0) {
            if (announce) announce(f0, f1);
            return true;
        }
        return false;
    }

    private static readonly _clipArcFractionArray = new GrowableFloat64Array();

    public announceClippedArcIntervals(
        arc: Arc3d,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        const breaks = ConvexClipPlaneSet._clipArcFractionArray;
        breaks.clear();
        for (const clipPlane of this.planes) {
            clipPlane.appendIntersectionRadians(arc, breaks);
        }
        arc.sweep.radiansArrayToPositivePeriodicFractions(breaks);
        return ClipUtilities.selectIntervals01(arc, breaks, this, announce);
    }

    public clipUnboundedSegment(
        pointA: Point3d,
        pointB: Point3d,
        announce?: AnnounceNumberNumber
    ): boolean {
        return this.announceClippedSegmentIntervals(
            -Number.MAX_VALUE,
            Number.MAX_VALUE,
            pointA,
            pointB,
            announce
        );
    }

    public transformInPlace(transform: Transform) {
        for (const plane of this._planes) {
            plane.transformInPlace(transform);
        }
    }

    public clipConvexPolygonInPlace(
        xyz: GrowableXYZArray,
        work: GrowableXYZArray,
        tolerance: number = Geometry.smallMetricDistance
    ): void {
        for (const plane of this._planes) {
            plane.clipConvexPolygonInPlace(xyz, work, true, tolerance);
            if (xyz.length < 3) return;
        }
    }

    public clipInsidePushOutside(
        xyz: IndexedXYZCollection,
        outsideFragments: GrowableXYZArray[] | undefined,
        arrayCache: GrowableXYZArrayCache
    ): GrowableXYZArray | undefined {
        const perpendicularRange = Range1d.createNull();
        let newInside = arrayCache.grabFromCache();
        let newOutside = arrayCache.grabFromCache();
        let insidePart = arrayCache.grabFromCache();
        insidePart.pushFrom(xyz);

        for (const plane of this._planes) {
            IndexedXYZCollectionPolygonOps.splitConvexPolygonInsideOutsidePlane(
                plane,
                insidePart,
                newInside,
                newOutside,
                perpendicularRange
            );
            if (newOutside.length > 0) {
                if (outsideFragments) {
                    ClipUtilities.captureOrDrop(newOutside, 3, outsideFragments, arrayCache);
                }
                newOutside = arrayCache.grabFromCache();
                if (newInside.length === 0) {
                    insidePart.length = 0;
                    break;
                }
                arrayCache.dropToCache(insidePart);
                insidePart = newInside;
                newInside = arrayCache.grabFromCache();
            }
        }

        arrayCache.dropToCache(newInside);
        arrayCache.dropToCache(newOutside);
        if (insidePart.length > 0) return insidePart;
        arrayCache.dropToCache(insidePart);
        return undefined;
    }

    public classifyPointContainment(points: Point3d[], onIsOutside: boolean): ClipPlaneContainment {
        let allInside = true;
        const onTolerance = onIsOutside ? 1.0e-8 : -1.0e-8;
        const interiorTolerance = 1.0e-8;

        for (const plane of this._planes) {
            let nOutside = 0;
            for (const point of points) {
                if (plane.altitude(point) < (plane.interior ? interiorTolerance : onTolerance)) {
                    nOutside++;
                    allInside = false;
                }
            }
            if (nOutside === points.length) return ClipPlaneContainment.StronglyOutside;
        }
        return allInside ? ClipPlaneContainment.StronglyInside : ClipPlaneContainment.Ambiguous;
    }

    public static createSweptPolyline(
        points: Point3d[],
        upVector: Vector3d,
        tiltAngle?: Angle
    ): ConvexClipPlaneSet | undefined {
        const result = ConvexClipPlaneSet.createEmpty();
        let reverse = false;
        if (points.length > 3 && points[0].isAlmostEqual(points[points.length - 1])) {
            const polygonNormal: Vector3d = PolygonOps.areaNormal(points);
            const normalDot = polygonNormal.dotProduct(upVector);
            if (normalDot > 0.0) reverse = true;
        }
        for (let i = 0; i + 1 < points.length; i++) {
            if (reverse) {
                const toAdd = ClipPlane.createEdgeAndUpVector(
                    points[i + 1],
                    points[i],
                    upVector,
                    tiltAngle
                );
                if (toAdd) {
                    result.addPlaneToConvexSet(toAdd);
                } else {
                    return undefined;
                }
            } else {
                const toAdd = ClipPlane.createEdgeAndUpVector(
                    points[i],
                    points[i + 1],
                    upVector,
                    tiltAngle
                );
                if (toAdd) {
                    result.addPlaneToConvexSet(toAdd);
                } else {
                    return undefined;
                }
            }
        }
        return result;
    }

    public addPlaneToConvexSet(plane: ClipPlane | Plane3dByOriginAndUnitNormal | undefined) {
        if (plane instanceof ClipPlane) this._planes.push(plane);
        else if (plane instanceof Plane3dByOriginAndUnitNormal) {
            this._planes.push(ClipPlane.createPlane(plane));
        }
    }

    public clipPointsOnOrInside(points: Point3d[], inOrOn: Point3d[], out: Point3d[]) {
        inOrOn.length = 0;
        out.length = 0;
        for (const xyz of points) {
            if (this.isPointOnOrInside(xyz, 0.0)) {
                inOrOn.push(xyz);
            } else {
                out.push(xyz);
            }
        }
    }

    public polygonClip(
        input: GrowableXYZArray | Point3d[],
        output: GrowableXYZArray,
        work: GrowableXYZArray,
        planeToSkip?: ClipPlane
    ): void {
        if (input instanceof GrowableXYZArray) input.clone(output);
        else GrowableXYZArray.create(input, output);

        for (const plane of this._planes) {
            if (planeToSkip === plane) continue;
            if (output.length === 0) break;
            plane.clipConvexPolygonInPlace(output, work);
        }
    }

    public reloadSweptPolygon(
        points: Point3d[],
        sweepDirection: Vector3d,
        sideSelect: number
    ): number {
        this._planes.length = 0;
        const n = points.length;
        if (n <= 2) return 0;

        const planeNormal: Vector3d = PolygonOps.areaNormal(points);
        const isCCW = sweepDirection.dotProduct(planeNormal) > 0.0;

        const delta = isCCW ? 1 : n - 1;
        for (let i = 0; i < n; i++) {
            const i1 = (i + delta) % n;
            const xyz0: Point3d = points[i];
            const xyz1: Point3d = points[i1];
            if (xyz0.isAlmostEqual(xyz1)) continue;
            const edgeVector: Vector3d = Vector3d.createStartEnd(xyz0, xyz1);
            const inwardNormal: Vector3d = Vector3d.createCrossProduct(
                sweepDirection.x,
                sweepDirection.y,
                sweepDirection.z,
                edgeVector.x,
                edgeVector.y,
                edgeVector.z
            );
            const inwardNormalNormalized = inwardNormal.normalize();
            let distance;
            if (inwardNormalNormalized) {
                distance = inwardNormalNormalized.dotProduct(xyz0);
                const clipToAdd = ClipPlane.createNormalAndDistance(
                    inwardNormalNormalized,
                    distance,
                    false,
                    false
                );
                if (clipToAdd) {
                    this._planes.push(clipToAdd);
                }
            }
        }
        if (sideSelect !== 0.0) {
            let planeNormalNormalized = planeNormal.normalize();
            if (planeNormalNormalized) {
                const a = sweepDirection.dotProduct(planeNormalNormalized) * sideSelect;
                if (a < 0.0) planeNormalNormalized = planeNormalNormalized.negate();
                const xyz0: Point3d = points[0];
                const distance = planeNormalNormalized.dotProduct(xyz0);
                const clipToAdd = ClipPlane.createNormalAndDistance(
                    planeNormalNormalized,
                    distance,
                    false,
                    false
                );
                if (clipToAdd) {
                    this._planes.push(clipToAdd);
                }
            }
        }
        return isCCW ? 1 : -1;
    }

    public computePlanePlanePlaneIntersections(
        points: Point3d[] | undefined,
        rangeToExtend: Range3d | undefined,
        transform?: Transform,
        testContainment: boolean = true
    ): number {
        const normalRows = Matrix3d.createIdentity();
        const allPlanes = this._planes;
        const n = allPlanes.length;
        let numPoints = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                for (let k = j + 1; k < n; k++) {
                    Matrix3d.createRowValues(
                        allPlanes[i].inwardNormalRef.x,
                        allPlanes[i].inwardNormalRef.y,
                        allPlanes[i].inwardNormalRef.z,
                        allPlanes[j].inwardNormalRef.x,
                        allPlanes[j].inwardNormalRef.y,
                        allPlanes[j].inwardNormalRef.z,
                        allPlanes[k].inwardNormalRef.x,
                        allPlanes[k].inwardNormalRef.y,
                        allPlanes[k].inwardNormalRef.z,
                        normalRows
                    );
                    if (normalRows.computeCachedInverse(false)) {
                        const xyz = normalRows.multiplyInverseXYZAsPoint3d(
                            allPlanes[i].distance,
                            allPlanes[j].distance,
                            allPlanes[k].distance
                        )!;
                        if (
                            !testContainment ||
                            this.isPointOnOrInside(xyz, Geometry.smallMetricDistance)
                        ) {
                            numPoints++;
                            if (transform) transform.multiplyPoint3d(xyz, xyz);
                            if (points) points.push(xyz);
                            if (rangeToExtend) rangeToExtend.extendPoint(xyz);
                        }
                    }
                }
            }
        }
        return numPoints;
    }

    public setInvisible(invisible: boolean) {
        for (const plane of this._planes) {
            plane.setInvisible(invisible);
        }
    }

    public addZClipPlanes(invisible: boolean, zLow?: number, zHigh?: number) {
        if (zLow !== undefined) {
            this._planes.push(
                ClipPlane.createNormalAndDistance(Vector3d.create(0, 0, 1), zLow, invisible)!
            );
        }
        if (zHigh !== undefined) {
            this._planes.push(
                ClipPlane.createNormalAndDistance(Vector3d.create(0, 0, -1), -zHigh, invisible)!
            );
        }
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ): void {
        const newInside = this.clipInsidePushOutside(xyz, outsideFragments, arrayCache);
        if (newInside) insideFragments.push(newInside);
    }

    public static createConvexPolyface(
        convexMesh: Polyface | PolyfaceVisitor,
        result?: ConvexClipPlaneSet
    ): { clipper: ConvexClipPlaneSet; volume: number } {
        result = this.createEmpty(result);
        let vol = 0;
        let myMesh: Polyface | undefined;
        let myVisitor: PolyfaceVisitor;
        if (convexMesh instanceof Polyface) {
            myMesh = convexMesh;
            myVisitor = convexMesh.createVisitor(0);
        } else {
            myMesh = convexMesh.clientPolyface();
            myVisitor = convexMesh;
        }
        if (myMesh && myVisitor) {
            if (PolyfaceQuery.isPolyfaceClosedByEdgePairing(myMesh)) {
                vol = PolyfaceQuery.sumTetrahedralVolumes(myVisitor);
            }
            const scale = vol > 0.0 ? -1.0 : 1.0;
            const normal = Vector3d.create();
            const plane = Plane3dByOriginAndUnitNormal.createXYPlane();
            myVisitor.reset();
            while (myVisitor.moveToNextFacet()) {
                if (undefined !== PolygonOps.areaNormalGo(myVisitor.point, normal)) {
                    normal.scaleInPlace(scale);
                    if (
                        undefined !==
                        Plane3dByOriginAndUnitNormal.create(myVisitor.point.front()!, normal, plane)
                    ) {
                        result.addPlaneToConvexSet(plane);
                    }
                }
            }
        }
        return { clipper: result, volume: vol };
    }
}
