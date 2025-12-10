/* Copyright (C) 2025 flywave.gl contributors */

import { ViewRanges } from "@flywave/flywave-datasource-protocol/ViewRanges";
import {
    type GeoCoordinatesLike,
    EarthConstants,
    GeoBox,
    GeoCoordinates,
    Projection,
    ProjectionType
} from "@flywave/flywave-geoutils";
import { type Box3Like } from "@flywave/flywave-geoutils/math/Box3Like";
import { type OrientedBox3Like } from "@flywave/flywave-geoutils/math/OrientedBox3Like";
import { type Vector3Like } from "@flywave/flywave-geoutils/math/Vector3Like";
import { expect } from "chai";
import * as THREE from "three";

import { type ClipPlanesEvaluator, TiltViewClipPlanesEvaluator } from "../src/ClipPlanesEvaluator";
import { type ElevationProvider } from "../src/ElevationProvider";

class MockProjection extends Projection {
    readonly type: ProjectionType = ProjectionType.Planar;

    constructor() {
        super(1);
    }

    groundDistance(position: Vector3Like): number {
        return 1000; // 1km above ground
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (result) {
            result.x = 0;
            result.y = 0;
            result.z = 0;
            return result;
        }
        return { x: 0, y: 0, z: 0 } as WorldCoordinates;
    }

    projectBox(geoBox: GeoBox): Box3Like;
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result: WorldBoundingBox
    ): WorldBoundingBox;
    projectBox(geoBox: GeoBox, result?: Box3Like | OrientedBox3Like): Box3Like | OrientedBox3Like {
        if (arguments.length === 1) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
        }
        if (!result) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
        }
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        return new GeoCoordinates(0, 0, 0);
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        return new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(1, 1));
    }

    worldExtent<Bounds extends Box3Like>(
        minElevation: number,
        maxElevation: number,
        result?: Bounds
    ): Bounds {
        if (!result) {
            return {
                min: { x: 0, y: 0, z: minElevation },
                max: { x: 1, y: 1, z: maxElevation }
            } as Bounds;
        }
        return result;
    }

    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    getScaleFactor(worldPoint: Vector3Like): number {
        return 1;
    }

    surfaceNormal(worldPoint: Vector3Like): Vector3Like;
    surfaceNormal<Normal extends Vector3Like>(worldPoint: Vector3Like, result: Normal): Normal;
    surfaceNormal(worldPoint: Vector3Like, result?: Vector3Like): Vector3Like {
        if (result) {
            result.x = 0;
            result.y = 0;
            result.z = 1;
            return result;
        }
        return { x: 0, y: 0, z: 1 };
    }

    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        return { x: worldPoint.x, y: worldPoint.y, z: 0 };
    }
}

class MockSphericalProjection extends Projection {
    readonly type: ProjectionType = ProjectionType.Spherical;

    constructor() {
        super(1);
    }

    groundDistance(position: Vector3Like): number {
        // Distance from Earth center minus Earth radius
        const distance = Math.sqrt(
            position.x * position.x + position.y * position.y + position.z * position.z
        );
        return distance - EarthConstants.EQUATORIAL_RADIUS;
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (result) {
            result.x = 0;
            result.y = 0;
            result.z = 0;
            return result;
        }
        return { x: 0, y: 0, z: 0 } as WorldCoordinates;
    }

    projectBox(geoBox: GeoBox): Box3Like;
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result: WorldBoundingBox
    ): WorldBoundingBox;
    projectBox(geoBox: GeoBox, result?: Box3Like | OrientedBox3Like): Box3Like | OrientedBox3Like {
        if (arguments.length === 1) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
        }
        if (!result) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
        }
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        return new GeoCoordinates(0, 0, 0);
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        return new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(1, 1));
    }

    worldExtent<Bounds extends Box3Like>(
        minElevation: number,
        maxElevation: number,
        result?: Bounds
    ): Bounds {
        if (!result) {
            return {
                min: { x: 0, y: 0, z: minElevation },
                max: { x: 1, y: 1, z: maxElevation }
            } as Bounds;
        }
        return result;
    }

    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    getScaleFactor(worldPoint: Vector3Like): number {
        return 1;
    }

    surfaceNormal(worldPoint: Vector3Like): Vector3Like;
    surfaceNormal<Normal extends Vector3Like>(worldPoint: Vector3Like, result: Normal): Normal;
    surfaceNormal(worldPoint: Vector3Like, result?: Vector3Like): Vector3Like {
        const length = Math.sqrt(
            worldPoint.x * worldPoint.x + worldPoint.y * worldPoint.y + worldPoint.z * worldPoint.z
        );
        if (length === 0) {
            if (result) {
                result.x = 0;
                result.y = 0;
                result.z = 1;
                return result;
            }
            return { x: 0, y: 0, z: 1 };
        }
        const normalized = {
            x: worldPoint.x / length,
            y: worldPoint.y / length,
            z: worldPoint.z / length
        };
        if (result) {
            result.x = normalized.x;
            result.y = normalized.y;
            result.z = normalized.z;
            return result;
        }
        return normalized;
    }

    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        const length = Math.sqrt(
            worldPoint.x * worldPoint.x + worldPoint.y * worldPoint.y + worldPoint.z * worldPoint.z
        );
        if (length === 0) {
            return { x: EarthConstants.EQUATORIAL_RADIUS, y: 0, z: 0 };
        }
        const scale = EarthConstants.EQUATORIAL_RADIUS / length;
        return {
            x: worldPoint.x * scale,
            y: worldPoint.y * scale,
            z: worldPoint.z * scale
        };
    }
}

class MockElevationProvider implements ElevationProvider {
    getHeight(_geoPoint: GeoCoordinates, _level?: number): number | undefined {
        return undefined;
    }

    sampleHeight(_geoPoint: GeoCoordinates, _tileDisplacementMap: any): number {
        return 0;
    }

    rayCast(_x: number, _y: number): THREE.Vector3 | undefined {
        return undefined;
    }

    getDisplacementMap(_tileKey: any): any {
        return undefined;
    }

    getTilingScheme(): any {
        return undefined;
    }

    clearCache(): void {
        // Empty implementation
    }
}

describe("ClipPlanesEvaluator", function () {
    let evaluator: ClipPlanesEvaluator;
    let camera: THREE.PerspectiveCamera;
    let projection: Projection;
    let sphericalProjection: Projection;
    let elevationProvider: ElevationProvider;

    beforeEach(function () {
        evaluator = new TiltViewClipPlanesEvaluator();
        camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
        projection = new MockProjection();
        sphericalProjection = new MockSphericalProjection();
        elevationProvider = new MockElevationProvider();
    });

    describe("TiltViewClipPlanesEvaluator", function () {
        it("constructor sets default values", function () {
            const defaultEvaluator = new TiltViewClipPlanesEvaluator();
            expect(defaultEvaluator.maxElevation).to.equal(EarthConstants.MAX_BUILDING_HEIGHT);
            expect(defaultEvaluator.minElevation).to.equal(0);
        });

        it("constructor accepts custom values", function () {
            const customEvaluator = new TiltViewClipPlanesEvaluator(1000, -500, 0.5, 0.1, 10);
            expect(customEvaluator.maxElevation).to.equal(1000);
            expect(customEvaluator.minElevation).to.equal(-500);
            expect((customEvaluator as any).nearMin).to.equal(0.5);
            expect((customEvaluator as any).nearFarMarginRatio).to.equal(0.1);
            expect((customEvaluator as any).farMaxRatio).to.equal(10);
        });

        it("evaluateClipPlanes returns valid ViewRanges for planar projection", function () {
            // Set camera position above ground
            camera.position.set(0, 0, 1000);
            camera.lookAt(0, 0, 0);

            const viewRanges = evaluator.evaluateClipPlanes(camera, projection, elevationProvider,
                true);

            // Check that we get valid ViewRanges
            expect(viewRanges).to.not.be.undefined;
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
            expect(viewRanges.minimum).to.be.greaterThan(0);
            expect(viewRanges.maximum).to.be.greaterThanOrEqual(viewRanges.far);
        });

        it("evaluateClipPlanes returns valid ViewRanges for spherical projection", function () {
            // Set camera position in space (Earth radius + altitude)
            const altitude = 1000000; // 1000 km above Earth surface
            camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + altitude);
            camera.lookAt(0, 0, 0);

            const sphericalEvaluator = new TiltViewClipPlanesEvaluator();
            const viewRanges = sphericalEvaluator.evaluateClipPlanes(
                camera,
                sphericalProjection,
                elevationProvider,
                true
            );

            // Check that we get valid ViewRanges
            expect(viewRanges).to.not.be.undefined;
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
            expect(viewRanges.minimum).to.be.greaterThan(0);
            expect(viewRanges.maximum).to.be.greaterThanOrEqual(viewRanges.far);
        });

        it("maxElevation setter validates input", function () {
            evaluator.maxElevation = 5000;
            expect(evaluator.maxElevation).to.equal(5000);
            expect(evaluator.minElevation).to.be.at.most(5000);
        });

        it("minElevation setter validates input", function () {
            evaluator.minElevation = -1000;
            expect(evaluator.minElevation).to.equal(-1000);
            expect(evaluator.maxElevation).to.be.at.least(-1000);
        });

        it("evaluateClipPlanes handles edge cases", function () {
            // Test with camera at ground level
            camera.position.set(0, 0, 0);
            camera.lookAt(0, 1, 0);

            const viewRanges = evaluator.evaluateClipPlanes(camera, projection, elevationProvider,
                true);

            // Should still return valid ViewRanges even in edge cases
            expect(viewRanges).to.not.be.undefined;
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
        });

        it("validateViewRanges ensures proper constraints", function () {
            // Create evaluator with very small nearMin to test ratio constraints
            const testEvaluator = new TiltViewClipPlanesEvaluator(
                EarthConstants.MAX_ELEVATION,
                EarthConstants.MIN_ELEVATION,
                0.001, // Very small nearMin
                0.01,
                10000 // Very large farMaxRatio
            );

            // Set camera position
            camera.position.set(0, 0, 10000);
            camera.lookAt(0, 0, 0);

            const viewRanges = testEvaluator.evaluateClipPlanes(
                camera,
                projection,
                elevationProvider,
                true
            );

            // Check that constraints are maintained
            expect(viewRanges.near).to.be.gte(0.001);
            expect(viewRanges.far).to.be.gte(viewRanges.near);
            expect(viewRanges.minimum).to.be.gte(0.001);
            expect(viewRanges.maximum).to.be.gte(viewRanges.minimum);

            // Check that ratio is reasonable (not too extreme)
            const ratio = viewRanges.far / viewRanges.near;
            expect(ratio).to.be.lte(1e7); // Reasonable upper limit
        });

        // New comprehensive tests for the fixes
        it("prevents negative near planes in ground level scenarios", function () {
            // Test ground level camera looking at tall buildings
            const groundLevelEvaluator = new TiltViewClipPlanesEvaluator(
                EarthConstants.MAX_BUILDING_HEIGHT, // 828m tall buildings
                0, // sea level
                1.0 // minimum near plane of 1m
            );

            // Camera at ground level (2m)
            camera.position.set(0, 0, 2);
            camera.lookAt(0, 0, 0);

            const viewRanges = groundLevelEvaluator.evaluateClipPlanes(
                camera,
                projection,
                elevationProvider,
                true
            );

            // Should not have negative near plane
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.near).to.be.gte(1.0); // Should be at least nearMin
        });

        it("handles camera below maximum elevation correctly", function () {
            // Camera lower than the maximum elevation it needs to render
            const lowCameraEvaluator = new TiltViewClipPlanesEvaluator(
                1000, // Need to render 1000m tall structures
                -100, // Down to 100m below sea level
                0.5 // Minimum near plane
            );

            // Camera at 100m altitude (lower than 1000m structures)
            camera.position.set(0, 0, 100);
            camera.lookAt(0, 0, 0);

            const viewRanges = lowCameraEvaluator.evaluateClipPlanes(
                camera,
                projection,
                elevationProvider,
                true
            );

            // Should still produce valid positive near plane
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.near).to.be.gte(0.5);
            expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
        });

        it("manages extreme near/far ratios to prevent precision issues", function () {
            // Test with configuration that might produce extreme ratios
            const extremeRatioEvaluator = new TiltViewClipPlanesEvaluator(
                EarthConstants.MAX_ELEVATION,
                EarthConstants.MIN_ELEVATION,
                0.001, // Very small nearMin
                0.05, // Small margin
                100000 // Very large farMaxRatio
            );

            // High altitude camera
            camera.position.set(0, 0, 50000); // 50km up
            camera.lookAt(0, 0, 0);

            const viewRanges = extremeRatioEvaluator.evaluateClipPlanes(
                camera,
                projection,
                elevationProvider,
                true
            );

            // Check that we still get reasonable values
            expect(viewRanges.near).to.be.greaterThan(0);
            expect(viewRanges.far).to.be.greaterThan(viewRanges.near);

            // Check that ratio is managed to prevent precision issues
            const ratio = viewRanges.far / viewRanges.near;
            expect(ratio).to.be.lte(1e7); // Should not exceed reasonable limits
        });

        it("produces consistent results for spherical projections at different altitudes", function () {
            const sphericalEvaluator = new TiltViewClipPlanesEvaluator(
                EarthConstants.MAX_BUILDING_HEIGHT,
                EarthConstants.MIN_ELEVATION,
                1.0, // Near minimum
                0.1, // Margin
                100 // Far ratio
            );

            // Test LEO (Low Earth Orbit)
            const leoAltitude = 400000; // 400km
            camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + leoAltitude);
            camera.lookAt(0, 0, 0);

            const leoViewRanges = sphericalEvaluator.evaluateClipPlanes(
                camera,
                sphericalProjection,
                elevationProvider,
                true
            );

            expect(leoViewRanges.near).to.be.greaterThan(0);
            expect(leoViewRanges.far).to.be.greaterThan(leoViewRanges.near);

            // Test much higher orbit
            const highAltitude = 10000000; // 10,000km
            camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + highAltitude);
            camera.lookAt(0, 0, 0);

            const highViewRanges = sphericalEvaluator.evaluateClipPlanes(
                camera,
                sphericalProjection,
                elevationProvider,
                true
            );

            expect(highViewRanges.near).to.be.greaterThan(0);
            expect(highViewRanges.far).to.be.greaterThan(highViewRanges.near);

            // Higher altitude should generally have larger view ranges
            expect(highViewRanges.far).to.be.greaterThan(leoViewRanges.far);
        });
    });
});
