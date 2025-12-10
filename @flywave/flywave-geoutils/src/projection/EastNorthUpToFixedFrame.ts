/* Copyright (C) 2025 flywave.gl contributors */

import { defined } from "@flywave/flywave-utils";
import * as THREE from "three";

import { MathUtils } from "../math/MathUtils";

/**
 * Axis type for local frame coordinate system.
 */
type Axis = "up" | "down" | "south" | "north" | "west" | "east";

/**
 * Mapping between axes for vector cross products.
 */
type VectorProductMap = {
    [key in Axis]: {
        [key in Axis]?: Axis;
    };
};

const vectorProductLocalFrame: VectorProductMap = {
    up: {
        south: "east",
        north: "west",
        west: "south",
        east: "north"
    },
    down: {
        south: "west",
        north: "east",
        west: "north",
        east: "south"
    },
    south: {
        up: "west",
        down: "east",
        west: "down",
        east: "up"
    },
    north: {
        up: "east",
        down: "west",
        west: "up",
        east: "down"
    },
    west: {
        up: "north",
        down: "south",
        north: "down",
        south: "up"
    },
    east: {
        up: "south",
        down: "north",
        north: "up",
        south: "down"
    }
};

interface ScratchCartesianVectors {
    east: THREE.Vector3;
    north: THREE.Vector3;
    up: THREE.Vector3;
    west: THREE.Vector3;
    south: THREE.Vector3;
    down: THREE.Vector3;
}

const scratchCalculateCartesian: ScratchCartesianVectors = {
    east: new THREE.Vector3(),
    north: new THREE.Vector3(),
    up: new THREE.Vector3(),
    west: new THREE.Vector3(),
    south: new THREE.Vector3(),
    down: new THREE.Vector3()
};

const scratchFirstCartesian = new THREE.Vector3();
const scratchSecondCartesian = new THREE.Vector3();
const scratchThirdCartesian = new THREE.Vector3();

const EPSILON14 = 0.00000000000001;

type DegeneratePositionMap = {
    [key in Axis]: [number, number, number];
};

const degeneratePositionLocalFrame: DegeneratePositionMap = {
    north: [-1, 0, 0],
    east: [0, 1, 0],
    up: [0, 0, 1],
    south: [1, 0, 0],
    west: [0, -1, 0],
    down: [0, 0, -1]
};

type LocalFrameToFixedFrame = (
    origin: THREE.Vector3,
    projection?: any,
    result?: THREE.Matrix4
) => THREE.Matrix4;
const localFrameToFixedFrameCache: Record<string, LocalFrameToFixedFrame> = {};

function createLocalFrameToFixedFrame(
    firstAxis: Axis,
    secondAxis: Axis
): (origin: THREE.Vector3, projection?: any, result?: THREE.Matrix4) => THREE.Matrix4 {
    if (!vectorProductLocalFrame[firstAxis] || !vectorProductLocalFrame[firstAxis][secondAxis]) {
        throw new Error("firstAxis and secondAxis must be east, north, up, west, south or down.");
    }
    const thirdAxis = vectorProductLocalFrame[firstAxis][secondAxis] as Axis;

    const hashAxis = firstAxis + secondAxis;
    if (defined(localFrameToFixedFrameCache[hashAxis])) {
        return localFrameToFixedFrameCache[hashAxis];
    }

    const resultFunction: LocalFrameToFixedFrame = (origin, projection, result) => {
        if (!defined(origin)) {
            throw new Error("origin is required.");
        }

        result = result || new THREE.Matrix4();

        if (MathUtils.vector3equalsEpsilon(origin, new THREE.Vector3(), EPSILON14)) {
            // If x, y, and z are zero, use the degenerate local frame
            scratchFirstCartesian.fromArray(degeneratePositionLocalFrame[firstAxis]);
            scratchSecondCartesian.fromArray(degeneratePositionLocalFrame[secondAxis]);
            scratchThirdCartesian.fromArray(degeneratePositionLocalFrame[thirdAxis]);
        } else if (
            MathUtils.equalsEpsilon(origin.x, 0.0, EPSILON14) &&
            MathUtils.equalsEpsilon(origin.y, 0.0, EPSILON14)
        ) {
            // If x and y are zero, assume origin is at a pole
            const sign = MathUtils.sign(origin.z);

            scratchFirstCartesian.fromArray(degeneratePositionLocalFrame[firstAxis]);
            if (firstAxis !== "east" && firstAxis !== "west") {
                scratchFirstCartesian.multiplyScalar(sign);
            }

            scratchSecondCartesian.fromArray(degeneratePositionLocalFrame[secondAxis]);
            if (secondAxis !== "east" && secondAxis !== "west") {
                scratchSecondCartesian.multiplyScalar(sign);
            }

            scratchThirdCartesian.fromArray(degeneratePositionLocalFrame[thirdAxis]);
            if (thirdAxis !== "east" && thirdAxis !== "west") {
                scratchThirdCartesian.multiplyScalar(sign);
            }
        } else {
            // Normal case - calculate the local frame
            scratchCalculateCartesian.up.copy(origin.clone().normalize());

            const east = scratchCalculateCartesian.east;
            east.set(-origin.y, origin.x, 0.0).normalize();
            scratchCalculateCartesian.north.crossVectors(scratchCalculateCartesian.up, east);

            scratchCalculateCartesian.down.copy(scratchCalculateCartesian.up).multiplyScalar(-1);
            scratchCalculateCartesian.west.copy(east).multiplyScalar(-1);
            scratchCalculateCartesian.south
                .copy(scratchCalculateCartesian.north)
                .multiplyScalar(-1);

            scratchFirstCartesian.copy(scratchCalculateCartesian[firstAxis]);
            scratchSecondCartesian.copy(scratchCalculateCartesian[secondAxis]);
            scratchThirdCartesian.copy(scratchCalculateCartesian[thirdAxis]);
        }

        // Set the matrix values
        result.set(
            scratchFirstCartesian.x,
            scratchFirstCartesian.y,
            scratchFirstCartesian.z,
            0,
            scratchSecondCartesian.x,
            scratchSecondCartesian.y,
            scratchSecondCartesian.z,
            0,
            scratchThirdCartesian.x,
            scratchThirdCartesian.y,
            scratchThirdCartesian.z,
            0,
            origin.x,
            origin.y,
            origin.z,
            1
        );

        return result;
    };

    localFrameToFixedFrameCache[hashAxis] = resultFunction;
    return resultFunction;
}

export const eastNorthUpToFixedFrame = createLocalFrameToFixedFrame("east", "north");
