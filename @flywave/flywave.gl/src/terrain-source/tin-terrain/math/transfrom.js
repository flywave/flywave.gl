import { defined } from "../utils";

import DeveloperError from "../../../util/developer-error";
import Matrix4 from "./matrix4";
import * as UtilyMath from "./math";
import * as THREE from "three";

var vectorProductLocalFrame = {
    up: {
        south: "east",
        north: "west",
        west: "south",
        east: "north",
    },
    down: {
        south: "west",
        north: "east",
        west: "north",
        east: "south",
    },
    south: {
        up: "west",
        down: "east",
        west: "down",
        east: "up",
    },
    north: {
        up: "east",
        down: "west",
        west: "up",
        east: "down",
    },
    west: {
        up: "north",
        down: "south",
        north: "down",
        south: "up",
    },
    east: {
        up: "south",
        down: "north",
        north: "up",
        south: "down",
    },
};

var scratchCalculateCartesian = {
    east: new THREE.Vector3(),
    north: new THREE.Vector3(),
    up: new THREE.Vector3(),
    west: new THREE.Vector3(),
    south: new THREE.Vector3(),
    down: new THREE.Vector3(),
};

var scratchFirstCartesian = new THREE.Vector3();
var scratchSecondCartesian = new THREE.Vector3();
var scratchThirdCartesian = new THREE.Vector3();

var EPSILON14 = 0.00000000000001;

var degeneratePositionLocalFrame = {
    north: [-1, 0, 0],
    east: [0, 1, 0],
    up: [0, 0, 1],
    south: [1, 0, 0],
    west: [0, -1, 0],
    down: [0, 0, -1],
  };
var localFrameToFixedFrameCache={};
function localFrameToFixedFrameGenerator(firstAxis, secondAxis) {
    if (
        !vectorProductLocalFrame.hasOwnProperty(firstAxis) ||
        !vectorProductLocalFrame[firstAxis].hasOwnProperty(secondAxis)
    ) {
        throw new DeveloperError(
            "firstAxis and secondAxis must be east, north, up, west, south or down."
        );
    }
    var thirdAxis = vectorProductLocalFrame[firstAxis][secondAxis];

    /**
     * Computes a 4x4 transformation matrix from a reference frame
     * centered at the provided origin to the provided ellipsoid's fixed reference feastNorthUpToFixedFramerame.
     * @callback Transforms.LocalFrameToFixedFrame
     * @param {Cartesian3} origin The center point of the local reference frame.
     * @param {Ellipsoid} [ellipsoid=Ellipsoid.WGS84] The ellipsoid whose fixed frame is used in the transformation.
     * @param {Matrix4} [result] The object onto which to store the result.
     * @returns {Matrix4} The modified result parameter or a new Matrix4 instance if none was provided.
     */
    var resultat;
    var hashAxis = firstAxis + secondAxis;
    if (defined(localFrameToFixedFrameCache[hashAxis])) {
        resultat = localFrameToFixedFrameCache[hashAxis];
    } else {
        resultat = function (origin, projection, result) {
            //>>includeStart('debug', pragmas.debug);
            if (!defined(origin)) {
                throw new DeveloperError("origin is required.");
            }
            //>>includeEnd('debug');
            if (!defined(result)) {
                result = new Matrix4();
            }
            if (
                UtilyMath.vector3equalsEpsilon(origin, new THREE.Vector3(), EPSILON14)
            ) {
                // If x, y, and z are zero, use the degenerate local frame, which is a special case
                scratchFirstCartesian.fromArray(degeneratePositionLocalFrame[firstAxis], 0)

                scratchSecondCartesian.fromArray(degeneratePositionLocalFrame[secondAxis], 0)

                scratchThirdCartesian.fromArray(degeneratePositionLocalFrame[thirdAxis], 0);
            } else if (
                UtilyMath.equalsEpsilon(origin.x, 0.0, EPSILON14) &&
                UtilyMath.equalsEpsilon(origin.y, 0.0, EPSILON14)
            ) {
                // If x and y are zero, assume origin is at a pole, which is a special case.
                var sign = UtilyMath.sign(origin.z);

                scratchFirstCartesian.fromArray(degeneratePositionLocalFrame[firstAxis], 0);

                if (firstAxis !== "east" && firstAxis !== "west") {
                    scratchFirstCartesian.multiplyScalar(sign);
                }


                scratchSecondCartesian.fromArray(degeneratePositionLocalFrame[secondAxis], 0);

                if (secondAxis !== "east" && secondAxis !== "west") {
                    scratchSecondCartesian.multiplyScalar(sign);
                }


                scratchThirdCartesian.fromArray(degeneratePositionLocalFrame[thirdAxis], 0);
                if (thirdAxis !== "east" && thirdAxis !== "west") {
                    scratchThirdCartesian.multiplyScalar(sign);
                }
            } else {
                // ellipsoid = defaultValue(ellipsoid, Ellipsoid.WGS84);
                scratchCalculateCartesian.up.copy(origin.clone().normalize());
                // ellipsoid.geodeticSurfaceNormal(origin, scratchCalculateCartesian.up);

                var up = scratchCalculateCartesian.up;
                var east = scratchCalculateCartesian.east;
                east.x = -origin.y;
                east.y = origin.x;
                east.z = 0.0;
                scratchCalculateCartesian.east.normalize();
                scratchCalculateCartesian.north.crossVectors(up, east);

                scratchCalculateCartesian.down.copy(scratchCalculateCartesian.up).multiplyScalar(-1);

                scratchCalculateCartesian.west.copy(scratchCalculateCartesian.east).multiplyScalar(-1);

                scratchCalculateCartesian.south.copy(scratchCalculateCartesian.north).multiplyScalar(-1);

                scratchFirstCartesian = scratchCalculateCartesian[firstAxis];
                scratchSecondCartesian = scratchCalculateCartesian[secondAxis];
                scratchThirdCartesian = scratchCalculateCartesian[thirdAxis];
            }
            result[0] = scratchFirstCartesian.x;
            result[1] = scratchFirstCartesian.y;
            result[2] = scratchFirstCartesian.z;
            result[3] = 0.0;
            result[4] = scratchSecondCartesian.x;
            result[5] = scratchSecondCartesian.y;
            result[6] = scratchSecondCartesian.z;
            result[7] = 0.0;
            result[8] = scratchThirdCartesian.x;
            result[9] = scratchThirdCartesian.y;
            result[10] = scratchThirdCartesian.z;
            result[11] = 0.0;
            result[12] = origin.x;
            result[13] = origin.y;
            result[14] = origin.z;
            result[15] = 1.0;
            return result;
        };
        localFrameToFixedFrameCache[hashAxis] = resultat;
    }
    return resultat;
};

var eastNorthUpToFixedFrame = localFrameToFixedFrameGenerator(
    "east",
    "north"
);

export { eastNorthUpToFixedFrame };