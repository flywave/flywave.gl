/* Copyright (C) 2025 flywave.gl contributors */

import { EarthConstants } from "@flywave/flywave-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "../src/ClipPlanesEvaluator";

describe("NearPlaneIssue", function () {
    let evaluator: TiltViewClipPlanesEvaluator;
    let camera: THREE.PerspectiveCamera;
    let sphericalProjection: any;

    beforeEach(function () {
        evaluator = new TiltViewClipPlanesEvaluator();
        camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);

        // Create a mock spherical projection
        sphericalProjection = {
            type: "spherical",
            groundDistance(position: THREE.Vector3) {
                // Distance from Earth center minus Earth radius
                const distance = Math.sqrt(
                    position.x * position.x + position.y * position.y + position.z * position.z
                );
                return distance - EarthConstants.EQUATORIAL_RADIUS;
            }
        };
    });

    it("detects issue with near plane being too large at certain camera angles", function () {
        // Camera at 1000km altitude, looking at an angle that causes large near plane
        const altitude = 1000000; // 1000 km
        camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + altitude);
        camera.lookAt(1000000, 1000000, 0); // Looking at an angle, not directly down

        const viewRanges = evaluator.evaluateClipPlanes(camera, sphericalProjection, undefined, true);

        console.log(`Camera altitude: ${altitude}`);
        console.log(`Calculated near plane: ${viewRanges.near}`);
        console.log(`Calculated far plane: ${viewRanges.far}`);

        // The near plane should not be larger than half the camera altitude
        // If it is, it indicates the issue where zooming in shows distant objects
        expect(viewRanges.near).to.be.lessThan(altitude * 0.5);
    });

    it("verifies fix for large near plane issue", function () {
        // Test with a more extreme case that would definitely cause the issue
        const extremeAltitude = 10000000; // 10,000 km
        camera.position.set(0, 0, EarthConstants.EQUATORIAL_RADIUS + extremeAltitude);
        camera.lookAt(5000000, 5000000, 0); // Looking at a steep angle

        const viewRanges = evaluator.evaluateClipPlanes(camera, sphericalProjection, undefined, true);

        console.log(`Extreme camera altitude: ${extremeAltitude}`);
        console.log(`Calculated near plane: ${viewRanges.near}`);
        console.log(`Calculated far plane: ${viewRanges.far}`);

        // Even in extreme cases, near plane should be reasonable
        expect(viewRanges.near).to.be.lessThan(extremeAltitude * 0.1);
    });
});
