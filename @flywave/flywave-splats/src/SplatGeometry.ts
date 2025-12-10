/* Copyright (C) 2025 flywave.gl contributors */

import {
    BufferAttribute,
    BufferGeometry,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry
} from "three";

export class SplatGeometry {
    static build(maxSplatCount = 1, useQuad = true) {
        const baseGeometry = new BufferGeometry();

        // Use an intanced quad or triangle. Triangle might be a bit faster because of less shader invocation but I didn't see any difference.
        // Keeping both and use triangle for now.
        // for quad, use following lines

        if (useQuad) {
            baseGeometry.setIndex([0, 1, 2, 0, 2, 3]);

            // Vertices for the instanced quad
            const positionsArray = new Float32Array(4 * 3);
            const positions = new BufferAttribute(positionsArray, 3);
            baseGeometry.setAttribute("position", positions);
            positions.setXYZ(0, -2.0, -2.0, 0.0);
            positions.setXYZ(1, -2.0, 2.0, 0.0);
            positions.setXYZ(2, 2.0, 2.0, 0.0);
            positions.setXYZ(3, 2.0, -2.0, 0.0);
            positions.needsUpdate = true;
        } else {
            baseGeometry.setIndex([0, 1, 2]);

            // Vertices for the instanced triangle
            const positionsArray = new Float32Array(3 * 3);
            const positions = new BufferAttribute(positionsArray, 3);
            baseGeometry.setAttribute("position", positions);
            positions.setXYZ(0, -3.0, -2.0, 0.0);
            positions.setXYZ(1, 3.0, -2.0, 0.0);
            positions.setXYZ(2, 0.0, 4.0, 0.0);
            positions.needsUpdate = true;
        }

        //@ts-ignore
        const geometry = new InstancedBufferGeometry().copy(baseGeometry);

        // Splat index buffer
        const splatIndexArray = new Float32Array(maxSplatCount);
        const splatIndexes = new InstancedBufferAttribute(splatIndexArray, 1, false);
        splatIndexes.setUsage(DynamicDrawUsage);
        geometry.setAttribute("splatIndex", splatIndexes);

        geometry.instanceCount = 0;

        return geometry;
    }
}
