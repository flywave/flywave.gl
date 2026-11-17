/* Copyright (C) 2025 flywave.gl contributors */

import { sphereProjection } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { expect } from "chai";
import { Vector3 } from "three/webgpu";

import { EllipsoidCameraTransform } from "../src/EllipsoidCameraTransform";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

function isFiniteMatrix(elements: number[]): boolean {
    return elements.every(Number.isFinite);
}

describe("EllipsoidCameraTransform", function () {
    let transform: EllipsoidCameraTransform;

    beforeEach(function () {
        // The pivot/rotation math only reads `cameraToWorld`; a projection stub
        // is enough to exercise it without a renderer or a real MapView.
        transform = new EllipsoidCameraTransform({
            projection: sphereProjection
        } as unknown as MapView);
        transform.cameraToWorld.identity();
    });

    it("ignores a non-finite rotation angle instead of poisoning the camera matrix", function () {
        transform.rotateAroundPivot(0, 0, 0, 0, 0, 1, Number.NaN);

        expect(isFiniteMatrix(Array.from(transform.cameraToWorld.elements))).to.be.true;
    });

    it("ignores a non-finite rotation axis instead of poisoning the camera matrix", function () {
        transform.rotateAroundPivot(0, 0, 0, Number.NaN, Number.NaN, Number.NaN, 0.5);

        expect(isFiniteMatrix(Array.from(transform.cameraToWorld.elements))).to.be.true;
    });

    it("clamps the tilt-limit asin argument when a camera axis drifts above unit length", function () {
        const elements = transform.cameraToWorld.elements;
        // Reproduces the drift measured after repeated rotations: the gravity
        // projection lands at 1 + 1e-15 (> 1, where Math.asin returns NaN),
        // with a negative Y projection so the z branch runs asin(zComponent).
        elements[4] = 0;
        elements[5] = 0;
        elements[6] = -0.5;
        elements[8] = 0;
        elements[9] = 0;
        elements[10] = 1 + 1e-15;
        const before = Array.from(elements);

        transform.applyTiltLimit(new Vector3(), new Vector3(0, 0, 1), Math.PI * 0.01);

        const after = Array.from(transform.cameraToWorld.elements);
        expect(isFiniteMatrix(after)).to.be.true;
        // The argument was clamped to 1 and the correction applied, not skipped.
        expect(after).to.not.deep.equal(before);
    });

    it("keeps rotating by finite angles", function () {
        transform.rotateAroundPivot(0, 0, 0, 0, 0, 1, Math.PI / 2);

        const elements = transform.cameraToWorld.elements;
        expect(isFiniteMatrix(Array.from(elements))).to.be.true;
        expect(elements[0]).to.be.closeTo(0, 1e-12);
        expect(elements[1]).to.be.closeTo(-1, 1e-12);
    });
});
