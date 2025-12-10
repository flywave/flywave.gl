/* Copyright (C) 2025 flywave.gl contributors */

import { EarthConstants, ProjectionType } from "@flywave/flywave-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "../src/ClipPlanesEvaluator";

describe("NearPlaneFix", function () {
    let evaluator: TiltViewClipPlanesEvaluator;
    let camera: THREE.PerspectiveCamera;
    let sphericalProjection: any;
    let planarProjection: any;

    beforeEach(function () {
        evaluator = new TiltViewClipPlanesEvaluator();
        camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);

        // Create a mock spherical projection
        sphericalProjection = {
            type: ProjectionType.Spherical,
            groundDistance(position: THREE.Vector3) {
                // Distance from Earth center minus Earth radius
                const distance = Math.sqrt(
                    position.x * position.x + position.y * position.y + position.z * position.z
                );
                return distance - EarthConstants.EQUATORIAL_RADIUS;
            }
        };

        // Create a mock planar projection
        planarProjection = {
            type: ProjectionType.Planar,
            groundDistance(position: THREE.Vector3) {
                // For planar projection, ground distance is simply the z-coordinate
                return position.z;
            }
        };
    });

    it("fixes issue with near plane being too large at certain camera angles - spherical projection", function () {
        // Camera at 1000km altitude, looking at an angle that would cause large near plane
        const altitude = 1000000; // 1000 km
        camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + altitude);
        camera.lookAt(1000000, 1000000, 0); // Looking at an angle, not directly down

        const viewRanges = evaluator.evaluateClipPlanes(camera, sphericalProjection,undefined,true);

        console.log(`Camera altitude: ${altitude}`);
        console.log(`Calculated near plane: ${viewRanges.near}`);
        console.log(`Calculated far plane: ${viewRanges.far}`);

        // The near plane should not be larger than half the camera altitude
        // This verifies our fix for the issue where zooming in shows distant objects
        expect(viewRanges.near).to.be.lessThan(altitude * 0.5);
        expect(viewRanges.near).to.be.greaterThan(0);
        expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
    });

    it("fixes issue with near plane being too large at extreme camera angles - spherical projection", function () {
        // Test with a more extreme case that would definitely cause the issue
        const extremeAltitude = 10000000; // 10,000 km
        camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + extremeAltitude);
        camera.lookAt(5000000, 5000000, 0); // Looking at a steep angle

        const viewRanges = evaluator.evaluateClipPlanes(camera, sphericalProjection,undefined,true);

        console.log(`Extreme camera altitude: ${extremeAltitude}`);
        console.log(`Calculated near plane: ${viewRanges.near}`);
        console.log(`Calculated far plane: ${viewRanges.far}`);

        // Even in extreme cases, near plane should be reasonable
        expect(viewRanges.near).to.be.lessThan(extremeAltitude * 0.5);
        expect(viewRanges.near).to.be.greaterThan(0);
        expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
    });

    it("fixes issue with near plane being too large at certain camera angles - planar projection", function () {
        // Camera at 1000m altitude, looking at an angle that would cause large near plane
        const altitude = 1000; // 1000 m
        camera.position.set(0, 0, altitude);
        camera.lookAt(500, 500, 0); // Looking at an angle, not directly down

        const viewRanges = evaluator.evaluateClipPlanes(camera, planarProjection,undefined,true);

        console.log(`Camera altitude (planar): ${altitude}`);
        console.log(`Calculated near plane: ${viewRanges.near}`);
        console.log(`Calculated far plane: ${viewRanges.far}`);

        // The near plane should not be larger than half the camera altitude
        expect(viewRanges.near).to.be.lessThan(altitude * 0.5);
        expect(viewRanges.near).to.be.greaterThan(0);
        expect(viewRanges.far).to.be.greaterThan(viewRanges.near);
    });

    it("maintains reasonable near/far ratios to prevent depth buffer precision issues", function () {
        // Test with configuration that might produce extreme ratios
        const extremeEvaluator = new TiltViewClipPlanesEvaluator(
            EarthConstants.MAX_ELEVATION,
            EarthConstants.MIN_ELEVATION,
            0.001, // Very small nearMin
            0.05, // Small margin
            100000 // Very large farMaxRatio
        );

        // High altitude camera
        const altitude = 50000; // 50km up
        camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + altitude);
        camera.lookAt(10000, 10000, 0);

        const viewRanges = extremeEvaluator.evaluateClipPlanes(camera, sphericalProjection,undefined,true);

        console.log(`Extreme configuration test:`);
        console.log(`  near: ${viewRanges.near}`);
        console.log(`  far: ${viewRanges.far}`);

        // Check that we still get reasonable values
        expect(viewRanges.near).to.be.greaterThan(0);
        expect(viewRanges.far).to.be.greaterThan(viewRanges.near);

        // Check that ratio is managed to prevent precision issues
        const ratio = viewRanges.far / viewRanges.near;
        expect(ratio).to.be.lte(1e7); // Should not exceed reasonable limits

        // Even with extreme configuration, near plane should not exceed 50% of camera altitude
        expect(viewRanges.near).to.be.lessThan(altitude * 0.5);
    });
});
