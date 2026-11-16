/* Copyright (C) 2025 flywave.gl contributors */

import { Vector3 } from "three/webgpu";
import { expect } from "chai";

import { octDecodeInRange } from "../../src/loader/parsers/Parse3DTileInstancedModel";

const RANGE = 65535;

/** Encodes a unit vector into the 2x16-bit oct-encoding used by i3dm. */
function encodeOct32P(vector: Vector3): [number, number] {
    const sum = Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z);
    let x = vector.x / sum;
    let y = vector.y / sum;

    if (vector.z < 0) {
        const oldX = x;
        x = (1 - Math.abs(y)) * (oldX >= 0 ? 1 : -1);
        y = (1 - Math.abs(oldX)) * (y >= 0 ? 1 : -1);
    }

    return [Math.round((x * 0.5 + 0.5) * RANGE), Math.round((y * 0.5 + 0.5) * RANGE)];
}

function expectDirection(actual: Vector3, expected: Vector3, epsilon = 0.002): void {
    expect(actual.distanceTo(expected)).to.be.lessThan(epsilon);
}

describe("i3dm OCT32P 方向解码", function () {
    const cases: Array<[string, Vector3]> = [
        ["+Z", new Vector3(0, 0, 1)],
        ["-Z", new Vector3(0, 0, -1)],
        ["+X", new Vector3(1, 0, 0)],
        ["-Y", new Vector3(0, -1, 0)],
        ["diagonal", new Vector3(1, 1, 1).normalize()],
        ["negative diagonal", new Vector3(-1, 0.4, -0.6).normalize()]
    ];

    for (const [name, direction] of cases) {
        it(`round-trips ${name}`, function () {
            const [x, y] = encodeOct32P(direction);
            const decoded = octDecodeInRange(x, y, RANGE, new Vector3());
            expect(decoded.length()).to.be.closeTo(1, 1e-6);
            expectDirection(decoded, direction);
        });
    }
});
