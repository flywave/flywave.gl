import { MathUtils, Matrix4, Vector3, Box3, Sphere } from "three";
import { Ellipsoid } from "./Ellipsoid";

const PI = Math.PI;
const HALF_PI = PI / 2;

// Reusable worker objects to avoid allocations
const _orthoX = new Vector3();
const _orthoY = new Vector3();
const _orthoZ = new Vector3();
const _invMatrix = new Matrix4();

// Object pool for temporary vectors
let _poolIndex = 0;
const _pointsPool: Vector3[] = [];

function getVector(usePool: boolean = false): Vector3 {
    if (!usePool) {
        return new Vector3();
    }

    if (!_pointsPool[_poolIndex]) {
        _pointsPool[_poolIndex] = new Vector3();
    }

    _poolIndex++;
    return _pointsPool[_poolIndex - 1];
}

function resetPool(): void {
    _poolIndex = 0;
}

export class EllipsoidRegion extends Ellipsoid {
    public latStart: number;
    public latEnd: number;
    public lonStart: number;
    public lonEnd: number;
    public heightStart: number;
    public heightEnd: number;

    constructor(
        x: number = 1,
        y: number = 1,
        z: number = 1,
        latStart: number = -HALF_PI,
        latEnd: number = HALF_PI,
        lonStart: number = 0,
        lonEnd: number = 2 * PI,
        heightStart: number = 0,
        heightEnd: number = 0
    ) {
        super(x, y, z);
        this.latStart = latStart;
        this.latEnd = latEnd;
        this.lonStart = lonStart;
        this.lonEnd = lonEnd;
        this.heightStart = heightStart;
        this.heightEnd = heightEnd;
    }

    private _getPoints(usePool: boolean = false): Vector3[] {
        const { latStart, latEnd, lonStart, lonEnd, heightStart, heightEnd } = this;

        const midLat = MathUtils.mapLinear(0.5, 0, 1, latStart, latEnd);
        const midLon = MathUtils.mapLinear(0.5, 0, 1, lonStart, lonEnd);

        const lonOffset = Math.floor(lonStart / HALF_PI) * HALF_PI;
        const latlon: [number, number][] = [
            [-PI / 2, 0],
            [PI / 2, 0],
            [0, lonOffset],
            [0, lonOffset + PI / 2],
            [0, lonOffset + PI],
            [0, lonOffset + (3 * PI) / 2],

            [latStart, lonEnd],
            [latEnd, lonEnd],
            [latStart, lonStart],
            [latEnd, lonStart],

            [0, lonStart],
            [0, lonEnd],

            [midLat, midLon],
            [latStart, midLon],
            [latEnd, midLon],
            [midLat, lonStart],
            [midLat, lonEnd]
        ];

        const target: Vector3[] = [];
        const total = latlon.length;

        for (let z = 0; z <= 1; z++) {
            const height = MathUtils.mapLinear(z, 0, 1, heightStart, heightEnd);
            for (let i = 0, l = total; i < l; i++) {
                const [lat, lon] = latlon[i];
                if (lat >= latStart && lat <= latEnd && lon >= lonStart && lon <= lonEnd) {
                    const v = getVector(usePool);
                    target.push(v);
                    this.getCartographicToPosition(lat, lon, height, v);
                }
            }
        }

        return target;
    }

    /**
     * Computes the bounding box of the ellipsoid region
     * @param box The target Box3 to store the result
     * @param matrix The matrix to transform the points into local frame
     */
    getBoundingBox(box: Box3, matrix: Matrix4): void {
        resetPool();

        const { latStart, latEnd, lonStart, lonEnd } = this;
        const latRange = latEnd - latStart;

        if (latRange < PI / 2) {
            // Get the midway point for the region
            const midLat = MathUtils.mapLinear(0.5, 0, 1, latStart, latEnd);
            const midLon = MathUtils.mapLinear(0.5, 0, 1, lonStart, lonEnd);

            // Get the frame matrix for the box - works well for smaller regions
            this.getCartographicToNormal(midLat, midLon, _orthoZ);
            _orthoY.set(0, 0, 1);
            _orthoX.crossVectors(_orthoY, _orthoZ).normalize();
            _orthoY.crossVectors(_orthoZ, _orthoX).normalize();
            matrix.makeBasis(_orthoX, _orthoY, _orthoZ);
        } else {
            // Use default orientation for large regions
            matrix.identity();
        }

        // Transform the points into the local frame
        _invMatrix.copy(matrix).invert();
        const points = this._getPoints(true);
        for (let i = 0, l = points.length; i < l; i++) {
            points[i].applyMatrix4(_invMatrix);
        }

        // Initialize the box
        box.makeEmpty();
        box.setFromPoints(points);
    }

    /**
     * Computes the bounding sphere of the ellipsoid region
     * @param sphere The target Sphere to store the result
     * @param center Optional center point for the sphere
     */
    getBoundingSphere(sphere: Sphere, center?: Vector3): void {
        resetPool();
        const points = this._getPoints(true);
        sphere.makeEmpty();
        sphere.setFromPoints(points, center);
    }
}
