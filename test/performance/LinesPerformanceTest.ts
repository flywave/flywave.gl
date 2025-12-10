/* Copyright (C) 2025 flywave.gl contributors */

import { mercatorProjection } from "@flywave/flywave-geoutils";
import { createLineGeometry } from "@flywave/flywave-lines";
import { measureThroughputSync } from "@flywave/flywave-test-utils/lib/ProfileHelper";
import * as THREE from "three";

if (typeof window === "undefined") {
    const perfHooks = require("perf_hooks");

    (global as any).performance = perfHooks.performance;
    (global as any).PerformanceObserver = perfHooks.PerformanceObserver;
    (global as any).PerformanceEntry = perfHooks.PerformanceEntry;
}

describe(`lines`, function () {
    this.timeout(0);
    const center = new THREE.Vector3();

    const tests: Array<{ segments: number; points?: number[] }> = [
        { segments: 2 },
        { segments: 4 },
        { segments: 16 },
        { segments: 64 },
        { segments: 256 }
    ];

    before(function () {
        this.timeout(0);
        tests.forEach(test => {
            const segments = test.segments;
            test.points = [];
            const radius = 100;
            for (let i = 0; i < segments; i++) {
                const angle = (i * 360) / segments;
                test.points.push(
                    Math.cos(THREE.MathUtils.degToRad(angle) * radius),
                    Math.cos(THREE.MathUtils.degToRad(angle) * radius),
                    0
                );
            }
        });
    });

    tests.forEach(test => {
        it(`createLineGeometry segments=${test.segments}`, async function () {
            this.timeout(0);
            await measureThroughputSync(
                `createLineGeometry segments=${test.segments}`,
                1000,
                function () {
                    createLineGeometry(center, test.points!, mercatorProjection);
                }
            );
        });
    });
});
