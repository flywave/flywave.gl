import * as THREE from "three";
import { defined, defaultValue } from "../utils";

var fromPointsCurrentPos = new THREE.Vector3();
var fromPointsXMin = new THREE.Vector3();
var fromPointsYMin = new THREE.Vector3();
var fromPointsZMin = new THREE.Vector3();
var fromPointsXMax = new THREE.Vector3();
var fromPointsYMax = new THREE.Vector3();
var fromPointsZMax = new THREE.Vector3();
var fromPointsScratch = new THREE.Vector3();
var fromPointsNaiveCenterScratch = new THREE.Vector3();
var fromPointsRitterCenter = new THREE.Vector3();
var fromPointsMinBoxPt = new THREE.Vector3();
var fromPointsMaxBoxPt = new THREE.Vector3();

export function makeBoundingSphereFromPoints(positions, result) {
    if (!defined(result)) {
        result = new THREE.Sphere();
    }

    if (!defined(positions) || positions.length === 0) {
        result.center = new THREE.Vector3();//.clone(Cartesian3.ZERO, result.center);
        result.radius = 0.0;
        return result;
    }

    var currentPos = fromPointsCurrentPos.copy(positions[0]);

    var xMin = fromPointsXMin.copy(currentPos);
    var yMin = fromPointsYMin.copy(currentPos);
    var zMin = fromPointsZMin.copy(currentPos);

    var xMax = fromPointsXMax.copy(currentPos);
    var yMax = fromPointsYMax.copy(currentPos);
    var zMax = fromPointsZMax.copy(currentPos);

    var numPositions = positions.length;
    var i;
    for (i = 1; i < numPositions; i++) {
        currentPos.copy(positions[i]);

        var x = currentPos.x;
        var y = currentPos.y;
        var z = currentPos.z;

        // Store points containing the the smallest and largest components
        if (x < xMin.x) {
            xMin.copy(currentPos);
        }

        if (x > xMax.x) {
            xMax.copy(currentPos);
        }

        if (y < yMin.y) {
            yMin.copy(currentPos);
        }

        if (y > yMax.y) {
            yMax.copy(currentPos);
        }

        if (z < zMin.z) {
            zMin.copy(currentPos);
        }

        if (z > zMax.z) {
            zMax.clone(currentPos);
        }
    }

    // Compute x-, y-, and z-spans (Squared distances b/n each component's min. and max.).
    var xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();

    var ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();

    var zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

    // Set the diameter endpoints to the largest span.
    var diameter1 = xMin;
    var diameter2 = xMax;
    var maxSpan = xSpan;
    if (ySpan > maxSpan) {
        maxSpan = ySpan;
        diameter1 = yMin;
        diameter2 = yMax;
    }
    if (zSpan > maxSpan) {
        maxSpan = zSpan;
        diameter1 = zMin;
        diameter2 = zMax;
    }

    // Calculate the center of the initial sphere found by Ritter's algorithm
    var ritterCenter = fromPointsRitterCenter;
    ritterCenter.x = (diameter1.x + diameter2.x) * 0.5;
    ritterCenter.y = (diameter1.y + diameter2.y) * 0.5;
    ritterCenter.z = (diameter1.z + diameter2.z) * 0.5;

    // Calculate the radius of the initial sphere found by Ritter's algorithm
    var radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
    var ritterRadius = Math.sqrt(radiusSquared);

    // Find the center of the sphere found using the Naive method.
    var minBoxPt = fromPointsMinBoxPt;
    minBoxPt.x = xMin.x;
    minBoxPt.y = yMin.y;
    minBoxPt.z = zMin.z;

    var maxBoxPt = fromPointsMaxBoxPt;
    maxBoxPt.x = xMax.x;
    maxBoxPt.y = yMax.y;
    maxBoxPt.z = zMax.z;

    var naiveCenter = fromPointsNaiveCenterScratch.addVectors(
        minBoxPt,
        maxBoxPt
    ).multiplyScalar(0.5);

    // Begin 2nd pass to find naive radius and modify the ritter sphere.
    var naiveRadius = 0;
    for (i = 0; i < numPositions; i++) {
        currentPos.copy(positions[i],);

        // Find the furthest point from the naive center to calculate the naive radius.
        var r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();

        if (r > naiveRadius) {
            naiveRadius = r;
        }

        // Make adjustments to the Ritter Sphere to include all points.
        var oldCenterToPointSquared = fromPointsScratch.subVectors(currentPos, ritterCenter).lengthSq();

        if (oldCenterToPointSquared > radiusSquared) {
            var oldCenterToPoint = Math.sqrt(oldCenterToPointSquared);
            // Calculate new radius to include the point that lies outside
            ritterRadius = (ritterRadius + oldCenterToPoint) * 0.5;
            radiusSquared = ritterRadius * ritterRadius;
            // Calculate center of new Ritter sphere
            var oldToNew = oldCenterToPoint - ritterRadius;
            ritterCenter.x =
                (ritterRadius * ritterCenter.x + oldToNew * currentPos.x) /
                oldCenterToPoint;
            ritterCenter.y =
                (ritterRadius * ritterCenter.y + oldToNew * currentPos.y) /
                oldCenterToPoint;
            ritterCenter.z =
                (ritterRadius * ritterCenter.z + oldToNew * currentPos.z) /
                oldCenterToPoint;
        }
    }

    if (ritterRadius < naiveRadius) {
        result.center.copy(ritterCenter);
        result.radius = ritterRadius;
    } else {
        result.center.copy(naiveCenter);
        result.radius = naiveRadius;
    }

    return result;
};

var fromPointsCurrentPos = new THREE.Vector3();
export function fromVertices(positions, center, stride, result) {
    if (!defined(result)) {
        result = new THREE.Sphere();
    }

    if (!defined(positions) || positions.length === 0) {
        // result.center = Cartesian3.clone(Cartesian3.ZERO, result.center);
        result.radius = 0.0;
        return result;
    }

    // center = defaultValue(center, Cartesian3.ZERO);

    stride = defaultValue(stride, 3);

    //>>includeStart('debug', pragmas.debug);
    // Check.typeOf.number.greaterThanOrEquals("stride", stride, 3);
    //>>includeEnd('debug');

    var currentPos = fromPointsCurrentPos;
    currentPos.x = positions[0] + center.x;
    currentPos.y = positions[1] + center.y;
    currentPos.z = positions[2] + center.z;

    var xMin = fromPointsXMin.copy(currentPos);
    var yMin = fromPointsYMin.copy(currentPos);
    var zMin = fromPointsZMin.copy(currentPos);

    var xMax = fromPointsXMax.copy(currentPos);
    var yMax = fromPointsYMax.copy(currentPos);
    var zMax = fromPointsZMax.copy(currentPos);

    var numElements = positions.length;
    var i;
    for (i = 0; i < numElements; i += stride) {
        var x = positions[i] + center.x;
        var y = positions[i + 1] + center.y;
        var z = positions[i + 2] + center.z;

        currentPos.x = x;
        currentPos.y = y;
        currentPos.z = z;

        // Store points containing the the smallest and largest components
        if (x < xMin.x) {
            xMin.copy(currentPos);
        }

        if (x > xMax.x) {
            xMax.copy(currentPos);
        }

        if (y < yMin.y) {
            yMin.copy(currentPos);
        }

        if (y > yMax.y) {
            yMax.copy(currentPos);
        }

        if (z < zMin.z) {
            zMin.copy(currentPos);
        }

        if (z > zMax.z) {
            zMax.copy(currentPos);
        }
    }

    // Compute x-, y-, and z-spans (Squared distances b/n each component's min. and max.).
    var xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
    var ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
    var zSpan = fromPointsScratch.subVectors(zMax, zMin,).lengthSq();

    // Set the diameter endpoints to the largest span.
    var diameter1 = xMin;
    var diameter2 = xMax;
    var maxSpan = xSpan;
    if (ySpan > maxSpan) {
        maxSpan = ySpan;
        diameter1 = yMin;
        diameter2 = yMax;
    }
    if (zSpan > maxSpan) {
        maxSpan = zSpan;
        diameter1 = zMin;
        diameter2 = zMax;
    }

    // Calculate the center of the initial sphere found by Ritter's algorithm
    var ritterCenter = fromPointsRitterCenter;
    ritterCenter.x = (diameter1.x + diameter2.x) * 0.5;
    ritterCenter.y = (diameter1.y + diameter2.y) * 0.5;
    ritterCenter.z = (diameter1.z + diameter2.z) * 0.5;

    // Calculate the radius of the initial sphere found by Ritter's algorithm
    var radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
    var ritterRadius = Math.sqrt(radiusSquared);

    // Find the center of the sphere found using the Naive method.
    var minBoxPt = fromPointsMinBoxPt;
    minBoxPt.x = xMin.x;
    minBoxPt.y = yMin.y;
    minBoxPt.z = zMin.z;

    var maxBoxPt = fromPointsMaxBoxPt;
    maxBoxPt.x = xMax.x;
    maxBoxPt.y = yMax.y;
    maxBoxPt.z = zMax.z;

    var naiveCenter = fromPointsNaiveCenterScratch.addVectors(
        minBoxPt,
        maxBoxPt
    ).multiplyScalar(0.5);

    // Begin 2nd pass to find naive radius and modify the ritter sphere.
    var naiveRadius = 0;
    for (i = 0; i < numElements; i += stride) {
        currentPos.x = positions[i] + center.x;
        currentPos.y = positions[i + 1] + center.y;
        currentPos.z = positions[i + 2] + center.z;

        // Find the furthest point from the naive center to calculate the naive radius.
        var r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
        if (r > naiveRadius) {
            naiveRadius = r;
        }

        // Make adjustments to the Ritter Sphere to include all points.
        var oldCenterToPointSquared = fromPointsScratch.subVectors(currentPos, ritterCenter).lengthSq();
        if (oldCenterToPointSquared > radiusSquared) {
            var oldCenterToPoint = Math.sqrt(oldCenterToPointSquared);
            // Calculate new radius to include the point that lies outside
            ritterRadius = (ritterRadius + oldCenterToPoint) * 0.5;
            radiusSquared = ritterRadius * ritterRadius;
            // Calculate center of new Ritter sphere
            var oldToNew = oldCenterToPoint - ritterRadius;
            ritterCenter.x =
                (ritterRadius * ritterCenter.x + oldToNew * currentPos.x) /
                oldCenterToPoint;
            ritterCenter.y =
                (ritterRadius * ritterCenter.y + oldToNew * currentPos.y) /
                oldCenterToPoint;
            ritterCenter.z =
                (ritterRadius * ritterCenter.z + oldToNew * currentPos.z) /
                oldCenterToPoint;
        }
    }

    if (ritterRadius < naiveRadius) {
        result.center.copy(ritterCenter);
        result.radius = ritterRadius;
    } else {
        result.center.copy(naiveCenter);
        result.radius = naiveRadius;
    }

    return result;
}
