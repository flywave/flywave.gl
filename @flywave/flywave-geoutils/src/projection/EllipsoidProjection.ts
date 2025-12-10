/* Copyright (C) 2025 flywave.gl contributors */
import * as THREE from "three";

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { type GeoCoordinatesLike, isGeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { type Box3Like, isBox3Like } from "../math/Box3Like";
import { type OrientedBox3Like, isOrientedBox3Like } from "../math/OrientedBox3Like";
import { type TransformLike } from "../math/TransformLike";
import { type Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { Projection, ProjectionType } from "./Projection";
import { mercatorProjection, webMercatorProjection } from "./MercatorProjection";
import { OrientedBox3 } from "../math/OrientedBox3";
import { EllipsoidTangentPlane } from "../math/EllipsoidTangentPlane";

/**
 * ECEF (Earth-Centered, Earth-Fixed) projection implementation using WGS84 ellipsoid (EPSG:4979)
 * 
 * Earth-Centered, Earth-Fixed coordinate system:
 * - X-axis: Intersection of prime meridian and equator
 * - Y-axis: 90° east of prime meridian at equator  
 * - Z-axis: North pole direction
 */
class EllipsoidProjection extends Projection {
    readonly type: ProjectionType = ProjectionType.Spherical;

    private readonly a: number = EarthConstants.EQUATORIAL_RADIUS;
    private readonly f: number = 1 / 298.257223563;
    private readonly b: number = this.a * (1 - this.f);
    private readonly e2: number = 2 * this.f - this.f * this.f;

    /**
     * Gets the scale factor at a specific world point
     * @param worldPoint - Point in ECEF coordinates
     * @returns Scale factor relative to Earth's radius
     */
    getScaleFactor(worldPoint: Vector3Like): number {
        const geo = this.unprojectPoint(worldPoint);
        const φ = THREE.MathUtils.degToRad(geo.latitude);
        const sinφ = Math.sin(φ);
        const cosφ = Math.cos(φ);

        // Prime vertical radius of curvature
        const N = this.a / Math.sqrt(1 - this.e2 * sinφ * sinφ);

        // Meridional radius of curvature
        const M = this.a * (1 - this.e2) / Math.pow(1 - this.e2 * sinφ * sinφ, 1.5);

        // Average radius for scale calculation
        const avgRadius = Math.sqrt(N * M);
        const scale = avgRadius / this.a;

        return scale;
    }

    /**
     * Computes the world extent for given altitude range
     * @param minAltitude - Minimum altitude above ellipsoid (meters)
     * @param maxAltitude - Maximum altitude above ellipsoid (meters)
     * @param result - Optional output bounding box
     * @returns Bounding box in ECEF coordinates
     */
    worldExtent<WorldBoundingBox extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const output =
            result ||
            ({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } as WorldBoundingBox);
        const maxRadius = this.a + maxAltitude;

        output.min.x = -maxRadius;
        output.min.y = -maxRadius;
        output.min.z = -this.b - maxAltitude;
        output.max.x = maxRadius;
        output.max.y = maxRadius;
        output.max.z = this.b + maxAltitude;

        return output;
    }

    /**
     * Converts geographic coordinates to ECEF Cartesian coordinates
     * 
     * ECEF coordinates calculation:
     * x = (N + h) * cos(φ) * cos(λ)
     * y = (N + h) * cos(φ) * sin(λ) 
     * z = (N * (1 - e²) + h) * sin(φ)
     * 
     * Where:
     * - N: Prime vertical radius of curvature
     * - h: Height above ellipsoid (meters)
     * - φ: Latitude (radians), λ: Longitude (radians)
     */
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        const output = result || ({ x: 0, y: 0, z: 0 } as WorldCoordinates);
        const φ = THREE.MathUtils.degToRad(geoPoint.latitude);
        const λ = THREE.MathUtils.degToRad(geoPoint.longitude);
        const h = geoPoint.altitude ?? 0;

        const sinφ = Math.sin(φ);
        const cosφ = Math.cos(φ);
        const sinλ = Math.sin(λ);
        const cosλ = Math.cos(λ);

        // Prime vertical radius of curvature
        const N = this.a / Math.sqrt(1 - this.e2 * sinφ * sinφ);

        // Calculate ECEF coordinates
        output.x = (N + h) * cosφ * cosλ;
        output.y = (N + h) * cosφ * sinλ;
        output.z = (N * (1 - this.e2) + h) * sinφ;

        return output;
    }

    /**
     * Projects a 3D point onto the ellipsoid surface using Newton-Raphson iteration
     * 
     * Iteration solves: (x² + y²)/a² + z²/b² = 1
     * Returns the scaled point lying on the ellipsoid surface
     */
    private scaleToGeodeticSurface(worldPoint: Vector3Like, result?: Vector3Like): Vector3Like {
        const { x, y, z } = worldPoint;
        const a = this.a;
        const b = this.b;

        // Initial scaling to get close to the surface
        const scale = Math.sqrt((x * x + y * y) / (a * a) + (z * z) / (b * b));
        let xScale = x / scale;
        let yScale = y / scale;
        let zScale = z / scale;

        // Newton-Raphson iteration for better accuracy
        for (let i = 0; i < 5; i++) {
            const x2 = xScale * xScale;
            const y2 = yScale * yScale;
            const z2 = zScale * zScale;

            // Error function: f(x,y,z) = (x²+y²)/a² + z²/b² - 1
            const f = (x2 + y2) / (a * a) + z2 / (b * b) - 1;

            // Partial derivatives
            const dfdx = (2 * xScale) / (a * a);
            const dfdy = (2 * yScale) / (a * a);
            const dfdz = (2 * zScale) / (b * b);

            const denom = dfdx * dfdx + dfdy * dfdy + dfdz * dfdz;
            xScale -= (f * dfdx) / denom;
            yScale -= (f * dfdy) / denom;
            zScale -= (f * dfdz) / denom;
        }

        const output = result || { x: 0, y: 0, z: 0 };
        output.x = xScale;
        output.y = yScale;
        output.z = zScale;
        return output;
    }

    /**
     * Converts ECEF Cartesian coordinates to geographic coordinates
     * 
     * Algorithm:
     * 1. Project point to ellipsoid surface
     * 2. Calculate longitude from X,Y components
     * 3. Calculate latitude from surface point
     * 4. Compute altitude as signed distance along surface normal
     */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const { x, y, z } = worldPoint;

        // 改进的 Bowring 1985 算法，精度更高
        const a = this.a;
        const b = this.b;
        const e2 = this.e2;

        // 计算辅助变量
        const p = Math.sqrt(x * x + y * y);

        // 初始纬度估计
        let φ = Math.atan2(z, p * (1 - e2));

        // 迭代求解纬度
        const maxIterations = 10;
        const tolerance = 1e-12;

        for (let i = 0; i < maxIterations; i++) {
            const sinφ = Math.sin(φ);
            const N = a / Math.sqrt(1 - e2 * sinφ * sinφ);

            const h = p / Math.cos(φ) - N;
            const φNext = Math.atan2(z + e2 * N * sinφ, p);

            if (Math.abs(φNext - φ) < tolerance) {
                φ = φNext;
                break;
            }
            φ = φNext;
        }

        // 计算经度
        const λ = Math.atan2(y, x);

        // 计算高度
        const sinφ = Math.sin(φ);
        const N = a / Math.sqrt(1 - e2 * sinφ * sinφ);
        const h = p / Math.cos(φ) - N;

        // 对于接近极点的特殊情况
        if (p < 1e-12) {
            // 在极点处
            return GeoCoordinates.fromRadians(
                Math.PI / 2 * Math.sign(z),
                0,
                Math.abs(z) - b
            );
        }

        return GeoCoordinates.fromRadians(φ, λ, h);
    }

    /**
     * Extracts altitude from an ECEF point
     */
    unprojectAltitude(worldPoint: Vector3Like): number {
        return this.unprojectPoint(worldPoint).altitude ?? 0;
    }

    /**
     * Projects a GeoBox to either Axis-Aligned Bounding Box or Oriented Bounding Box
     * @param geoBox - Geographic bounding box
     * @param result - Optional output box (AABB or OBB)
     * @returns Projected bounding box in ECEF coordinates
     */
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        // Create result object if not provided
        if (!result) {
            if (isOrientedBox3Like(result as any)) {
                result = new OrientedBox3() as OrientedBox3Like as WorldBoundingBox;
            } else {
                result = new THREE.Box3() as Box3Like as WorldBoundingBox;
            }
        }

        if (isBox3Like(result)) {
            // Process as Axis-Aligned Bounding Box
            const min = { x: Infinity, y: Infinity, z: Infinity };
            const max = { x: -Infinity, y: -Infinity, z: -Infinity };

            const keyPoints = this.sampleGeoBoxPoints(geoBox);

            for (const point of keyPoints) {
                const pos = this.projectPoint(point);
                min.x = Math.min(min.x, pos.x);
                min.y = Math.min(min.y, pos.y);
                min.z = Math.min(min.z, pos.z);
                max.x = Math.max(max.x, pos.x);
                max.y = Math.max(max.y, pos.y);
                max.z = Math.max(max.z, pos.z);
            }

            result.min.x = min.x;
            result.min.y = min.y;
            result.min.z = min.z;
            result.max.x = max.x;
            result.max.y = max.y;
            result.max.z = max.z;

        } else if (isOrientedBox3Like(result)) {
            // Process as Oriented Bounding Box
            const rectangle = {
                west: THREE.MathUtils.degToRad(geoBox.west),
                south: THREE.MathUtils.degToRad(geoBox.south),
                east: THREE.MathUtils.degToRad(geoBox.east),
                north: THREE.MathUtils.degToRad(geoBox.north)
            };
            const minimumHeight = geoBox.minAltitude ?? 0;
            const maximumHeight = geoBox.maxAltitude ?? 0;

            this.computeOrientedBoundingBoxFromRectangle(
                rectangle,
                minimumHeight,
                maximumHeight,
                result
            );
        }

        return result;
    }

    /**
     * Samples key points from a GeoBox for accurate projection
     */
    private sampleGeoBoxPoints(geoBox: GeoBox): GeoCoordinates[] {
        const keyPoints: GeoCoordinates[] = [];

        const minLon = geoBox.west;
        const maxLon = geoBox.east;
        const minLat = geoBox.south;
        const maxLat = geoBox.north;
        const minHeight = geoBox.minAltitude ?? 0;
        const maxHeight = geoBox.maxAltitude ?? 0;

        // Add corner points at maximum height
        keyPoints.push(
            new GeoCoordinates(maxLat, minLon, maxHeight),
            new GeoCoordinates(maxLat, maxLon, maxHeight),
            new GeoCoordinates(minLat, minLon, maxHeight),
            new GeoCoordinates(minLat, maxLon, maxHeight)
        );

        // Add edge midpoints and center for better coverage
        const midLat = (minLat + maxLat) * 0.5;
        const midLon = (minLon + maxLon) * 0.5;

        keyPoints.push(
            new GeoCoordinates(midLat, minLon, maxHeight),
            new GeoCoordinates(midLat, maxLon, maxHeight),
            new GeoCoordinates(maxLat, midLon, maxHeight),
            new GeoCoordinates(minLat, midLon, maxHeight),
            new GeoCoordinates(midLat, midLon, maxHeight)
        );

        // Add minimum height point if different from maximum
        if (minHeight !== maxHeight) {
            keyPoints.push(
                new GeoCoordinates(midLat, midLon, minHeight)
            );
        }

        return keyPoints;
    }

    /**
     * Computes an Oriented Bounding Box from a geographic rectangle
     */
    private computeOrientedBoundingBoxFromRectangle(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        result: OrientedBox3Like
    ): void {
        const { west, south, east, north } = rectangle;
        const EPSILON = 1e-10;

        // Validate rectangle dimensions
        let width = east - west;
        let height = north - south;

        // Check width range (with epsilon for floating point precision)
        if (width < -EPSILON || width > Math.PI * 2 + EPSILON) {
            throw new Error(`Rectangle width must be between 0 and 2π, got ${width}`);
        }

        // Check height range (with epsilon for floating point precision)
        if (height < -EPSILON || height > Math.PI + EPSILON) {
            throw new Error(`Rectangle height must be between 0 and π, got ${height}`);
        }

        // Normalize near-boundary values
        if (Math.abs(width) < EPSILON) width = 0;
        if (Math.abs(width - Math.PI * 2) < EPSILON) width = Math.PI * 2;
        if (Math.abs(height) < EPSILON) height = 0;
        if (Math.abs(height - Math.PI) < EPSILON) height = Math.PI;

        // Final validation
        if (width < 0 || width > Math.PI * 2) {
            throw new Error("Rectangle width must be between 0 and 2 * pi");
        }
        if (height < 0 || height > Math.PI) {
            throw new Error("Rectangle height must be between 0 and pi");
        }

        // Choose appropriate OBB computation method based on rectangle size
        this.computeUnifiedRectangleOBB(rectangle, minimumHeight, maximumHeight, result);
    }

    /**
     * Unified method to compute OBB for rectangles of any size
     */
    private computeUnifiedRectangleOBB(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        result: OrientedBox3Like
    ): void {
        const { west, south, east, north } = rectangle;
        let width = east - west;

        // Normalize width to [0, 2π] range
        if (width < 0) {
            width += 2 * Math.PI;
        }

        if (width <= Math.PI) {
            // Small rectangle: width ≤ π
            this.computeSmallRectangleOBB(rectangle, minimumHeight, maximumHeight, result);
        } else {
            // Large rectangle: width > π
            this.computeLargeRectangleOBB(rectangle, minimumHeight, maximumHeight, result);
        }
    }

    /**
     * Computes OBB for small rectangles (width ≤ π)
     */
    private computeSmallRectangleOBB(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        result: OrientedBox3Like
    ): void {
        const { west, south, east, north } = rectangle;

        // Determine rectangle center
        const centerLon = (west + east) * 0.5;

        // Use equator as center latitude if rectangle spans the equator
        const spansEquator = south < 0 && north > 0;
        const centerLat = spansEquator ? 0 : (south + north) * 0.5;

        const centerGeo = new GeoCoordinates(
            THREE.MathUtils.radToDeg(centerLat),
            THREE.MathUtils.radToDeg(centerLon)
        );

        // Get tangent plane at center
        const tangentPlane = this.computeRobustTangentPlane(centerGeo);

        // Compute boundary points
        const boundaryPoints = this.computeSmallRectangleBoundaryPoints(
            rectangle, minimumHeight, maximumHeight, spansEquator
        );

        // Compute bounds in tangent space
        const { minX, maxX, minY, maxY, minZ, maxZ } = this.computeBoundsInTangentSpace(
            boundaryPoints, tangentPlane
        );

        this.setOrientedBoxFromTangentPlane(tangentPlane, minX, maxX, minY, maxY, minZ, maxZ, result);
    }

    /**
     * Computes boundary points for small rectangles
     */
    private computeSmallRectangleBoundaryPoints(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        spansEquator: boolean
    ): GeoCoordinates[] {
        const { west, south, east, north } = rectangle;
        const points: GeoCoordinates[] = [];

        const centerLon = (west + east) * 0.5;
        const centerLat = spansEquator ? 0 : (south + north) * 0.5;

        // Corner points
        const corners = [
            [north, west],
            [north, east],
            [south, west],
            [south, east]
        ];

        // Edge midpoint
        const edgeMidPoints = [
            [north, centerLon],  // North edge midpoint
            [south, centerLon],  // South edge midpoint
            [centerLat, west],   // West edge midpoint
            [centerLat, east]    // East edge midpoint
        ];

        // Center point
        const centerPoint = [centerLat, centerLon];

        // Add all points at maximum height
        [...corners, ...edgeMidPoints, centerPoint].forEach(([lat, lon]) => {
            points.push(new GeoCoordinates(
                THREE.MathUtils.radToDeg(lat),
                THREE.MathUtils.radToDeg(lon),
                maximumHeight
            ));
        });

        // Add minimum height points if different
        if (minimumHeight !== maximumHeight) {
            // Add minimum height corners
            corners.forEach(([lat, lon]) => {
                points.push(new GeoCoordinates(
                    THREE.MathUtils.radToDeg(lat),
                    THREE.MathUtils.radToDeg(lon),
                    minimumHeight
                ));
            });

            // Add minimum height center
            points.push(new GeoCoordinates(
                THREE.MathUtils.radToDeg(centerLat),
                THREE.MathUtils.radToDeg(centerLon),
                minimumHeight
            ));
        }

        return points;
    }

    /**
     * Computes OBB for large rectangles (width > π)
     */
    private computeLargeRectangleOBB(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        result: OrientedBox3Like
    ): void {
        const { west, south, east, north } = rectangle;

        // Determine rectangle's relationship to equator
        const fullyAboveEquator = south > 0;
        const fullyBelowEquator = north < 0;
        const latitudeNearestToEquator = fullyAboveEquator ? south :
            fullyBelowEquator ? north : 0.0;

        const centerLongitude = (west + east) * 0.5;

        // Create tangent plane at equator-near point
        const planeOriginGeo = new GeoCoordinates(
            THREE.MathUtils.radToDeg(latitudeNearestToEquator),
            THREE.MathUtils.radToDeg(centerLongitude),
            maximumHeight
        );

        const planeOrigin = this.projectPoint(planeOriginGeo, new THREE.Vector3());

        // Create tangent plane (mimicking Cesium's approach for large rectangles)
        const normal = new THREE.Vector3();
        const isPole = Math.abs(planeOrigin.x) < 1e-10 && Math.abs(planeOrigin.y) < 1e-10;

        if (!isPole) {
            normal.copy(planeOrigin).normalize();
        } else {
            normal.set(1, 0, 0); // Handle pole case
        }

        const yAxis = new THREE.Vector3(0, 0, 1);
        const xAxis = new THREE.Vector3().crossVectors(normal, yAxis).normalize();

        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            normal,
            planeOrigin
        );

        const tangentPlane = {
            origin: planeOrigin,
            xAxis: xAxis,
            yAxis: yAxis,
            zAxis: normal,
            plane: plane
        };

        // Compute boundary points
        const boundaryPoints = this.computeLargeRectangleBoundaryPoints(
            rectangle, minimumHeight, maximumHeight, latitudeNearestToEquator
        );

        // Compute bounds in tangent space
        const { minX, maxX, minY, maxY, minZ, maxZ } = this.computeBoundsInTangentSpace(
            boundaryPoints, tangentPlane
        );

        this.setOrientedBoxFromTangentPlane(tangentPlane, minX, maxX, minY, maxY, minZ, maxZ, result);
    }

    /**
     * Computes boundary points for large rectangles
     */
    private computeLargeRectangleBoundaryPoints(
        rectangle: { west: number; south: number; east: number; north: number },
        minimumHeight: number,
        maximumHeight: number,
        latitudeNearestToEquator: number
    ): GeoCoordinates[] {
        const { west, south, east, north } = rectangle;
        const points: GeoCoordinates[] = [];

        const centerLongitude = (west + east) * 0.5;
        const fullyAboveEquator = south > 0;
        const fullyBelowEquator = north < 0;

        // Key points for large rectangle
        const keyPoints = [
            [north, west],
            [north, east],
            [south, west],
            [south, east],
            [latitudeNearestToEquator, west],
            [latitudeNearestToEquator, east],
            [latitudeNearestToEquator, centerLongitude]
        ];

        // Add points with appropriate heights
        keyPoints.forEach(([lat, lon], index) => {
            // Use minimum height for depth point, maximum for others
            const height = index < 4 ? maximumHeight :
                (fullyBelowEquator || fullyAboveEquator) ? maximumHeight :
                    index === 6 ? minimumHeight : maximumHeight;

            points.push(new GeoCoordinates(
                THREE.MathUtils.radToDeg(lat),
                THREE.MathUtils.radToDeg(lon),
                height
            ));
        });

        // Add extra points for equator-spanning rectangles
        if (!fullyAboveEquator && !fullyBelowEquator) {
            // Rectangle spans equator
            points.push(new GeoCoordinates(0, THREE.MathUtils.radToDeg(west), maximumHeight));
            points.push(new GeoCoordinates(0, THREE.MathUtils.radToDeg(east), maximumHeight));
            points.push(new GeoCoordinates(0, THREE.MathUtils.radToDeg(centerLongitude), maximumHeight));
        }

        return points;
    }

    /**
     * Sets the oriented box properties from tangent plane and bounds
     */
    private setOrientedBoxFromTangentPlane(
        tangentPlane: any,
        minX: number, maxX: number,
        minY: number, maxY: number,
        minZ: number, maxZ: number,
        result: OrientedBox3Like
    ): void {
        // Calculate extents
        const extentX = (maxX - minX) * 0.5;
        const extentY = (maxY - minY) * 0.5;
        const extentZ = (maxZ - minZ) * 0.5;

        // Calculate center in tangent space
        const centerX = minX + extentX;
        const centerY = minY + extentY;
        const centerZ = minZ + extentZ;

        // Set axes from tangent plane
        result.xAxis.x = tangentPlane.xAxis.x;
        result.xAxis.y = tangentPlane.xAxis.y;
        result.xAxis.z = tangentPlane.xAxis.z;

        result.yAxis.x = tangentPlane.yAxis.x;
        result.yAxis.y = tangentPlane.yAxis.y;
        result.yAxis.z = tangentPlane.yAxis.z;

        result.zAxis.x = tangentPlane.zAxis.x;
        result.zAxis.y = tangentPlane.zAxis.y;
        result.zAxis.z = tangentPlane.zAxis.z;

        // Set extents
        result.extents.x = extentX;
        result.extents.y = extentY;
        result.extents.z = extentZ;

        // Calculate world space center
        const worldCenter = new THREE.Vector3();
        worldCenter.copy(tangentPlane.origin);
        worldCenter.addScaledVector(tangentPlane.xAxis, centerX);
        worldCenter.addScaledVector(tangentPlane.yAxis, centerY);
        worldCenter.addScaledVector(tangentPlane.zAxis, centerZ);

        result.position.x = worldCenter.x;
        result.position.y = worldCenter.y;
        result.position.z = worldCenter.z;
    }

    /**
     * Computes a robust tangent plane at a geographic point
     */
    private computeRobustTangentPlane(centerGeo: GeoCoordinates): any {
        const worldPoint = this.projectPoint(centerGeo, new THREE.Vector3());

        // Calculate ENU (East-North-Up) coordinate system
        const φ = THREE.MathUtils.degToRad(centerGeo.latitude);
        const λ = THREE.MathUtils.degToRad(centerGeo.longitude);

        const sinφ = Math.sin(φ);
        const cosφ = Math.cos(φ);
        const sinλ = Math.sin(λ);
        const cosλ = Math.cos(λ);

        // Up direction (surface normal)
        const up = new THREE.Vector3(
            cosφ * cosλ,
            cosφ * sinλ,
            sinφ
        ).normalize();

        // East direction
        const east = new THREE.Vector3(-sinλ, cosλ, 0).normalize();

        // North direction
        const north = new THREE.Vector3().crossVectors(up, east).normalize();

        return {
            origin: worldPoint,
            xAxis: east,
            yAxis: north,
            zAxis: up,
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
                up,
                worldPoint
            )
        };
    }

    /**
     * Computes bounds in tangent space for a set of points
     */
    private computeBoundsInTangentSpace(
        points: GeoCoordinates[],
        tangentPlane: any
    ): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const geoPoint of points) {
            const worldPoint = this.projectPoint(geoPoint);

            // Transform to tangent space
            const offset = new THREE.Vector3().subVectors(worldPoint, tangentPlane.origin);
            const localX = offset.dot(tangentPlane.xAxis);
            const localY = offset.dot(tangentPlane.yAxis);
            const localZ = offset.dot(tangentPlane.zAxis);

            // Update bounds
            minX = Math.min(minX, localX);
            maxX = Math.max(maxX, localX);
            minY = Math.min(minY, localY);
            maxY = Math.max(maxY, localY);
            minZ = Math.min(minZ, localZ);
            maxZ = Math.max(maxZ, localZ);
        }

        return { minX, maxX, minY, maxY, minZ, maxZ };
    }

    /**
     * Reprojects a point from another projection to this ECEF projection
     */
    reprojectPoint(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result?: Vector3Like
    ): Vector3Like {
        // Handle Mercator projections specifically
        if (sourceProjection === mercatorProjection || sourceProjection === webMercatorProjection) {
            const { x, y, z } = worldPos;

            if (result === undefined) {
                result = {} as Vector3Like;
            }

            // Convert from Mercator coordinates
            const mx = x / this.a - Math.PI;
            const my = y / this.a - Math.PI;

            const lat = 2 * Math.atan(Math.exp(my)) - Math.PI / 2;

            const sinLat = Math.sin(lat);
            const cosLat = Math.cos(lat);
            const sinLon = Math.sin(mx);
            const cosLon = Math.cos(mx);

            const N = this.a / Math.sqrt(1 - this.e2 * sinLat * sinLat);
            const altitude = z;

            // Convert to ECEF
            result.x = (N + altitude) * cosLat * cosLon;
            result.y = (N + altitude) * cosLat * sinLon;
            result.z = (N * (1 - this.e2) + altitude) * sinLat;

            // Handle Web Mercator Z-axis inversion
            if (sourceProjection === webMercatorProjection) {
                result.z = -result.z;
            }

            return result;
        }

        // Fall back to default implementation for other projections
        return super.reprojectPoint(sourceProjection, worldPos, result!);
    }

    /**
     * Unprojects an ECEF bounding box to geographic coordinates
     */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        return GeoBox.fromCoordinates(minGeo, maxGeo);
    }

    /**
     * Calculates ground distance (altitude) from an ECEF point
     */
    groundDistance(worldPoint: Vector3Like): number {
        return this.unprojectAltitude(worldPoint);
    }

    /**
     * Scales a point to the ellipsoid surface
     */
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        const surfacePoint = this.scaleToGeodeticSurface(worldPoint);
        worldPoint.x = surfacePoint.x;
        worldPoint.y = surfacePoint.y;
        worldPoint.z = surfacePoint.z;
        return worldPoint;
    }

    /**
     * Computes surface normal at an ECEF point
     */
    surfaceNormal(worldPoint: Vector3Like, normal?: Vector3Like): Vector3Like {
        if (!normal) {
            normal = { x: 0, y: 0, z: 0 };
        }

        // Get geographic coordinates for the point
        const geo = this.unprojectPoint(worldPoint);
        const φ = THREE.MathUtils.degToRad(geo.latitude);
        const λ = THREE.MathUtils.degToRad(geo.longitude);

        // Compute surface normal
        normal.x = Math.cos(φ) * Math.cos(λ);
        normal.y = Math.cos(φ) * Math.sin(λ);
        normal.z = Math.sin(φ);

        return normal;
    }

    /**
     * Computes local tangent space transformation at a point
     */
    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike {
        let worldPoint: Vector3Like;
        let geoPoint: GeoCoordinates;

        // Handle both coordinate types
        if (isGeoCoordinatesLike(point)) {
            geoPoint = new GeoCoordinates(point.latitude, point.longitude, point.altitude);
            worldPoint = this.projectPoint(geoPoint);
            result.position.x = worldPoint.x;
            result.position.y = worldPoint.y;
            result.position.z = worldPoint.z;
        } else {
            worldPoint = point;
            geoPoint = this.unprojectPoint(point);
            result.position.x = point.x;
            result.position.y = point.y;
            result.position.z = point.z;
        }

        // Create tangent plane at the point
        const tangentPlane = new EllipsoidTangentPlane(
            new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
        );

        // Set transformation axes
        result.xAxis.x = tangentPlane.xAxis.x;
        result.xAxis.y = tangentPlane.xAxis.y;
        result.xAxis.z = tangentPlane.xAxis.z;

        result.yAxis.x = tangentPlane.yAxis.x;
        result.yAxis.y = tangentPlane.yAxis.y;
        result.yAxis.z = tangentPlane.yAxis.z;

        result.zAxis.x = tangentPlane.zAxis.x;
        result.zAxis.y = tangentPlane.zAxis.y;
        result.zAxis.z = tangentPlane.zAxis.z;

        return result;
    }

    /**
     * Performs ray casting to the WGS84 ellipsoid
     * 
     * Solves quadratic equation for ray-ellipsoid intersection:
     * A*t² + B*t + C = 0
     * 
     * Where coefficients are derived from ellipsoid equation:
     * (x² + y²)/a² + z²/b² = 1
     * 
     * @param result - Intersection point in ECEF coordinates
     * @param rayOrigin - Ray origin in ECEF coordinates  
     * @param rayTarget - Ray target point in ECEF coordinates
     * @param altitude - Altitude above ellipsoid surface (default: 0)
     * @returns Distance from ray origin to intersection, or -1 if no intersection
     */
    rayCast(
        result: Vector3Like,
        rayOrigin: Vector3Like,
        rayTarget: Vector3Like,
        altitude: number = 0
    ): number {
        // Calculate ray direction
        const dirX = rayTarget.x - rayOrigin.x;
        const dirY = rayTarget.y - rayOrigin.y;
        const dirZ = rayTarget.z - rayOrigin.z;

        const rayLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        if (rayLength < 1e-15) return -1;

        const invRayLength = 1 / rayLength;
        const rayDir = {
            x: dirX * invRayLength,
            y: dirY * invRayLength,
            z: dirZ * invRayLength
        };

        // Scale ellipsoid radii by altitude offset
        const scaledA = this.a + altitude;
        const scaledB = this.b + altitude;

        // Quadratic coefficients for ray-ellipsoid intersection
        const a = (rayDir.x * rayDir.x + rayDir.y * rayDir.y) / (scaledA * scaledA) +
            (rayDir.z * rayDir.z) / (scaledB * scaledB);

        const b = 2 * ((rayOrigin.x * rayDir.x + rayOrigin.y * rayDir.y) / (scaledA * scaledA) +
            (rayOrigin.z * rayDir.z) / (scaledB * scaledB));

        const c = (rayOrigin.x * rayOrigin.x + rayOrigin.y * rayOrigin.y) / (scaledA * scaledA) +
            (rayOrigin.z * rayOrigin.z) / (scaledB * scaledB) - 1;

        // Solve quadratic equation
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return -1;

        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b - sqrtD) / (2 * a);
        const t2 = (-b + sqrtD) / (2 * a);

        // Determine if ray origin is inside the ellipsoid
        const originDistSq = (rayOrigin.x * rayOrigin.x + rayOrigin.y * rayOrigin.y) / (scaledA * scaledA) +
            (rayOrigin.z * rayOrigin.z) / (scaledB * scaledB);
        const isInside = originDistSq < 1;

        let t = -1;

        // Select appropriate intersection based on ray position
        if (isInside) {
            if (t2 >= 0 && t2 <= rayLength * 2) {
                t = t2; // Exit intersection
            }
        } else {
            if (t1 >= 0) {
                t = t1; // Entry intersection
            }
        }

        // Fallback to closest valid intersection
        if (t < 0) {
            if (t1 >= 0 && t1 <= rayLength * 2) t = t1;
            else if (t2 >= 0 && t2 <= rayLength * 2) t = t2;
        }

        if (t < 0) return -1;

        // Calculate intersection point
        result.x = rayOrigin.x + rayDir.x * t;
        result.y = rayOrigin.y + rayDir.y * t;
        result.z = rayOrigin.z + rayDir.z * t;

        return t;
    }
}

// Singleton instance for ECEF projection
export const ellipsoidProjection = new EllipsoidProjection(EarthConstants.EQUATORIAL_RADIUS);

export type { EllipsoidProjection };