/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumberCurvePrimitive } from "../curve/curve-primitive";
import { AxisOrder, Geometry } from "../geometry";
import { type Angle } from "../geometry3d/angle";
import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Matrix3d } from "../geometry3d/matrix3d";
import { Plane3d } from "../geometry3d/plane3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { IndexedXYZCollectionPolygonOps } from "../geometry3d/polygon-ops";
import { Range1d, Range3d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { Transform } from "../geometry3d/transform";
import { type XYZProps } from "../geometry3d/xyz-props";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { Point4d } from "../geometry4d/point4d";
import { AnalyticRoots } from "../numerics/polynomials";
import { type Clipper, type PolygonClipper, ClipUtilities } from "./clip-utils";

export interface ClipPlaneProps {
    normal?: XYZProps;
    dist?: number;
    invisible?: boolean;
    interior?: boolean;
}

export class ClipPlane extends Plane3d implements Clipper, PolygonClipper {
    private _inwardNormal: Vector3d;

    private _distanceFromOrigin: number;
    private _invisible: boolean;
    private _interior: boolean;

    private constructor(normal: Vector3d, distance: number, invisible: boolean, interior: boolean) {
        super();
        this._invisible = invisible;
        this._interior = interior;
        this._inwardNormal = normal;
        this._distanceFromOrigin = distance;
    }

    public isAlmostEqual(other: ClipPlane): boolean {
        return (
            Geometry.isSameCoordinate(this._distanceFromOrigin, other._distanceFromOrigin) &&
            this._inwardNormal.isAlmostEqual(other._inwardNormal) &&
            this._interior === other._interior &&
            this._invisible === other._invisible
        );
    }

    public clone(): ClipPlane {
        const result = new ClipPlane(
            this._inwardNormal.clone(),
            this._distanceFromOrigin,
            this._invisible,
            this._interior
        );
        return result;
    }

    public cloneNegated(): ClipPlane {
        const plane = new ClipPlane(
            this._inwardNormal.clone(),
            this._distanceFromOrigin,
            this._invisible,
            this._interior
        );
        plane.negateInPlace();
        return plane;
    }

    public static createPlane(
        plane: Plane3dByOriginAndUnitNormal,
        invisible: boolean = false,
        interior: boolean = false,
        result?: ClipPlane
    ): ClipPlane {
        const distance = plane.getNormalRef().dotProduct(plane.getOriginRef());
        if (result) {
            result._invisible = invisible;
            result._interior = interior;
            result._inwardNormal = plane.getNormalRef().clone();
            result._distanceFromOrigin = distance;
            return result;
        }
        return new ClipPlane(plane.getNormalRef().clone(), distance, invisible, interior);
    }

    public static createNormalAndDistance(
        normal: Vector3d,
        distance: number,
        invisible: boolean = false,
        interior: boolean = false,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const normalized = normal.normalize();
        if (normalized) {
            if (result) {
                result._invisible = invisible;
                result._interior = interior;
                result._inwardNormal = normalized;
                result._distanceFromOrigin = distance;
            }
            return new ClipPlane(normalized, distance, invisible, interior);
        }
        return undefined;
    }

    public static createNormalAndPoint(
        normal: Vector3d,
        point: Point3d,
        invisible: boolean = false,
        interior: boolean = false,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const normalized = normal.normalize();
        if (normalized) {
            const distance = normalized.dotProduct(point);
            if (result) {
                result._invisible = invisible;
                result._interior = interior;
                result._inwardNormal = normalized;
                result._distanceFromOrigin = distance;
            }
            return new ClipPlane(normalized, distance, invisible, interior);
        }
        return undefined;
    }

    public static createOriginAndVectors(
        origin: Point3d,
        vectorA: Vector3d,
        vectorB: Vector3d,
        invisible: boolean = false,
        interior: boolean = false,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const normalized = vectorB.crossProduct(vectorA);
        return this.createNormalAndPoint(normalized, origin, invisible, interior, result);
    }

    public static createNormalAndPointXYZXYZ(
        normalX: number,
        normalY: number,
        normalZ: number,
        originX: number,
        originY: number,
        originZ: number,
        invisible: boolean = false,
        interior: boolean = false,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const q = Geometry.hypotenuseXYZ(normalX, normalY, normalZ);
        const r = Geometry.conditionalDivideFraction(1, q);
        if (r !== undefined) {
            if (result) {
                result._inwardNormal.set(normalX * r, normalY * r, normalZ * r);
                result._distanceFromOrigin = result._inwardNormal.dotProductXYZ(
                    originX,
                    originY,
                    originZ
                );
                result._invisible = invisible;
                result._interior = interior;
                return result;
            }
            const normal = Vector3d.create(normalX * r, normalY * r, normalZ * r);
            return new ClipPlane(
                normal,
                normal.dotProductXYZ(originX, originY, originZ),
                invisible,
                interior
            );
        }
        return undefined;
    }

    public toJSON(): ClipPlaneProps {
        const props: ClipPlaneProps = {
            normal: this.inwardNormalRef.toJSON(),
            dist: this.distance
        };
        if (this.interior) props.interior = true;
        if (this.invisible) props.invisible = true;
        return props;
    }

    public static fromJSON(json: ClipPlaneProps, result?: ClipPlane): ClipPlane | undefined {
        if (json && json.normal && undefined !== json.dist && Number.isFinite(json.dist)) {
            return ClipPlane.createNormalAndDistance(
                Vector3d.fromJSON(json.normal),
                json.dist,
                !!json.invisible,
                !!json.interior
            );
        }
        return ClipPlane.createNormalAndDistance(Vector3d.unitZ(), 0, false, false, result);
    }

    public setFlags(invisible: boolean, interior: boolean) {
        this._invisible = invisible;
        this._interior = interior;
    }

    public get distance() {
        return this._distanceFromOrigin;
    }

    public get inwardNormalRef(): Vector3d {
        return this._inwardNormal;
    }

    public get interior() {
        return this._interior;
    }

    public get invisible() {
        return this._invisible;
    }

    public static createEdgeAndUpVector(
        point0: Point3d,
        point1: Point3d,
        upVector: Vector3d,
        tiltAngle?: Angle,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const edgeVector = Vector3d.createFrom(point1.minus(point0));
        let normal = upVector.crossProduct(edgeVector).normalize();

        if (normal) {
            if (tiltAngle !== undefined && !tiltAngle.isAlmostZero) {
                const tiltNormal = Vector3d.createRotateVectorAroundVector(
                    normal,
                    edgeVector,
                    tiltAngle
                );
                if (tiltNormal) {
                    normal = tiltNormal.clone();
                }
            }
            normal.negate(normal);
            return ClipPlane.createNormalAndPoint(normal, point0, false, false, result);
        }
        return undefined;
    }

    public static createEdgeXY(
        point0: Point3d,
        point1: Point3d,
        result?: ClipPlane
    ): ClipPlane | undefined {
        const normal = Vector3d.create(point0.y - point1.y, point1.x - point0.x);
        if (normal.normalizeInPlace()) {
            return ClipPlane.createNormalAndPoint(normal, point0, false, false, result);
        }
        return undefined;
    }

    public getPlane3d(): Plane3dByOriginAndUnitNormal {
        const d = this._distanceFromOrigin;
        return Plane3dByOriginAndUnitNormal.create(
            Point3d.create(
                this._inwardNormal.x * d,
                this._inwardNormal.y * d,
                this._inwardNormal.z * d
            ),
            this._inwardNormal
        )!;
    }

    public getPlane4d(): Point4d {
        return Point4d.create(
            this._inwardNormal.x,
            this._inwardNormal.y,
            this._inwardNormal.z,
            -this._distanceFromOrigin
        );
    }

    public setPlane4d(plane: Point4d) {
        const a = Math.sqrt(plane.x * plane.x + plane.y * plane.y + plane.z * plane.z);
        const r = a === 0.0 ? 1.0 : 1.0 / a;
        this._inwardNormal.x = r * plane.x;
        this._inwardNormal.y = r * plane.y;
        this._inwardNormal.z = r * plane.z;
        this._distanceFromOrigin = -r * plane.w;
    }

    public weightedAltitude(point: Point4d): number {
        return (
            point.x * this._inwardNormal.x +
            point.y * this._inwardNormal.y +
            point.z * this._inwardNormal.z -
            point.w * this._distanceFromOrigin
        );
    }

    public altitude(point: Point3d): number {
        return (
            point.x * this._inwardNormal.x +
            point.y * this._inwardNormal.y +
            point.z * this._inwardNormal.z -
            this._distanceFromOrigin
        );
    }

    public altitudeXYZ(x: number, y: number, z: number): number {
        return (
            x * this._inwardNormal.x +
            y * this._inwardNormal.y +
            z * this._inwardNormal.z -
            this._distanceFromOrigin
        );
    }

    public normalX(): number {
        return this._inwardNormal.x;
    }

    public normalY(): number {
        return this._inwardNormal.y;
    }

    public normalZ(): number {
        return this._inwardNormal.z;
    }

    public velocity(vector: Vector3d): number {
        return (
            vector.x * this._inwardNormal.x +
            vector.y * this._inwardNormal.y +
            vector.z * this._inwardNormal.z
        );
    }

    public velocityXYZ(x: number, y: number, z: number): number {
        return x * this._inwardNormal.x + y * this._inwardNormal.y + z * this._inwardNormal.z;
    }

    public dotProductPlaneNormalPoint(point: Point3d): number {
        return (
            point.x * this._inwardNormal.x +
            point.y * this._inwardNormal.y +
            point.z * this._inwardNormal.z
        );
    }

    public isPointOnOrInside(
        spacePoint: Point3d,
        tolerance: number = Geometry.smallMetricDistance
    ): boolean {
        let value = this.altitude(spacePoint);
        if (tolerance) {
            value += tolerance;
        }
        return value >= 0.0;
    }

    public isPointInside(
        point: Point3d,
        tolerance: number = Geometry.smallMetricDistance
    ): boolean {
        let value = this.altitude(point);
        if (tolerance) {
            value -= tolerance;
        }
        return value > 0.0;
    }

    public isPointOn(point: Point3d, tolerance: number = Geometry.smallMetricDistance): boolean {
        return Math.abs(this.altitude(point)) <= tolerance;
    }

    public appendIntersectionRadians(arc: Arc3d, intersectionRadians: GrowableFloat64Array) {
        const arcVectors = arc.toVectors();
        const alpha = this.altitude(arc.center);
        const beta = this.velocity(arcVectors.vector0);
        const gamma = this.velocity(arcVectors.vector90);
        AnalyticRoots.appendImplicitLineUnitCircleIntersections(
            alpha,
            beta,
            gamma,
            undefined,
            undefined,
            intersectionRadians
        );
    }

    private static readonly _clipArcFractionArray = new GrowableFloat64Array();

    public announceClippedArcIntervals(
        arc: Arc3d,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        const breaks = ClipPlane._clipArcFractionArray;
        breaks.clear();
        this.appendIntersectionRadians(arc, breaks);
        arc.sweep.radiansArrayToPositivePeriodicFractions(breaks);
        return ClipUtilities.selectIntervals01(arc, breaks, this, announce);
    }

    public getBoundedSegmentSimpleIntersection(
        pointA: Point3d,
        pointB: Point3d
    ): number | undefined {
        const h0 = this.altitude(pointA);
        const h1 = this.altitude(pointB);
        if (h0 * h1 > 0.0) return undefined;
        if (h0 === 0.0 && h1 === 0.0) {
            return undefined;
        }
        return -h0 / (h1 - h0);
    }

    public transformInPlace(transform: Transform): boolean {
        const plane: Plane3dByOriginAndUnitNormal = this.getPlane3d();
        const matrix: Matrix3d = transform.matrix;
        const newPoint = transform.multiplyPoint3d(plane.getOriginRef());
        const newNormal = matrix.multiplyInverseTranspose(plane.getNormalRef());
        if (!newNormal) return false;

        plane.set(newPoint, newNormal);
        const normalized = plane.getNormalRef().normalize();
        if (!normalized) return false;
        this._inwardNormal = normalized;
        this._distanceFromOrigin = this._inwardNormal.dotProduct(plane.getOriginRef());
        return true;
    }

    public setInvisible(invisible: boolean) {
        this._invisible = invisible;
    }

    public negateInPlace() {
        this._inwardNormal = this._inwardNormal.negate();
        this._distanceFromOrigin = -this._distanceFromOrigin;
    }

    public offsetDistance(offset: number) {
        this._distanceFromOrigin += offset;
    }

    public clipConvexPolygonInPlace(
        xyz: GrowableXYZArray,
        work: GrowableXYZArray,
        inside: boolean = true,
        tolerance: number = Geometry.smallMetricDistance
    ) {
        return IndexedXYZCollectionPolygonOps.clipConvexPolygonInPlace(
            this,
            xyz,
            work,
            inside,
            tolerance
        );
    }

    public multiplyPlaneByMatrix4d(
        matrix: Matrix4d,
        invert: boolean = true,
        transpose: boolean = true
    ): boolean {
        const plane: Point4d = this.getPlane4d();
        if (invert) {
            const inverse = matrix.createInverse();
            if (inverse) return this.multiplyPlaneByMatrix4d(inverse, false, transpose);
            return false;
        }
        if (transpose) matrix.multiplyTransposePoint4d(plane, plane);
        else matrix.multiplyPoint4d(plane, plane);
        this.setPlane4d(plane);
        return true;
    }

    public announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: (fraction0: number, fraction1: number) => void
    ): boolean {
        if (f1 < f0) return false;
        const h0 = -this.altitude(pointA);
        const h1 = -this.altitude(pointB);
        const delta = h1 - h0;
        const f = Geometry.conditionalDivideFraction(-h0, delta);
        if (f === undefined) {
            if (h0 <= 0.0) {
                if (announce) announce(f0, f1);
                return true;
            }
            return false;
        }
        if (delta > 0) {
            if (f < f1) f1 = f;
        } else {
            if (f > f0) f0 = f;
        }
        if (f1 < f0) return false;
        if (announce) announce(f0, f1);
        return true;
    }

    public getFrame(): Transform {
        const d = this._distanceFromOrigin;
        const origin = Point3d.create(
            this._inwardNormal.x * d,
            this._inwardNormal.y * d,
            this._inwardNormal.z * d
        );
        const matrix = Matrix3d.createRigidHeadsUp(this._inwardNormal, AxisOrder.ZXY);
        return Transform.createOriginAndMatrix(origin, matrix);
    }

    public intersectRange(
        range: Range3d,
        addClosurePoint: boolean = false
    ): GrowableXYZArray | undefined {
        if (range.isNull) return undefined;
        const corners = range.corners();
        const frameOnPlane = this.getFrame();
        frameOnPlane.multiplyInversePoint3dArrayInPlace(corners);
        const localRange = Range3d.createArray(corners);
        if (localRange.low.z * localRange.high.z > 0.0) return undefined;

        const xyzOut = new GrowableXYZArray();
        xyzOut.pushXYZ(localRange.low.x, localRange.low.y, 0);
        xyzOut.pushXYZ(localRange.high.x, localRange.low.y, 0);
        xyzOut.pushXYZ(localRange.high.x, localRange.high.y, 0);
        xyzOut.pushXYZ(localRange.low.x, localRange.high.y, 0);
        xyzOut.multiplyTransformInPlace(frameOnPlane);
        IndexedXYZCollectionPolygonOps.intersectRangeConvexPolygonInPlace(range, xyzOut);
        if (xyzOut.length === 0) return undefined;
        if (addClosurePoint) xyzOut.pushWrap(1);
        return xyzOut;
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ): void {
        const perpendicularRange = Range1d.createNull();
        const newInside = arrayCache.grabFromCache();
        const newOutside = arrayCache.grabFromCache();
        IndexedXYZCollectionPolygonOps.splitConvexPolygonInsideOutsidePlane(
            this,
            xyz,
            newInside,
            newOutside,
            perpendicularRange
        );
        ClipUtilities.captureOrDrop(newInside, 3, insideFragments, arrayCache);
        ClipUtilities.captureOrDrop(newOutside, 3, outsideFragments, arrayCache);
    }

    public projectPointToPlane(spacePoint: Point3d, result?: Point3d): Point3d {
        const d = -this.altitude(spacePoint);
        return spacePoint.plusXYZ(
            d * this._inwardNormal.x,
            d * this._inwardNormal.y,
            d * this._inwardNormal.z,
            result
        );
    }
}
