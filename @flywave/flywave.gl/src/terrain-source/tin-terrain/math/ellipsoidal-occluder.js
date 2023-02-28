import * as THREE from "three";

var scratchEllipsoidShrunkRadii = new THREE.Vector3();

function getPossiblyShrunkEllipsoid(ellipsoid, minimumHeight, result) {
    if (
        defined(minimumHeight) &&
        minimumHeight < 0.0 &&
        ellipsoid.minimumRadius > -minimumHeight
    ) {
        var ellipsoidShrunkRadii = scratchEllipsoidShrunkRadii.set(
            ellipsoid.radii.x + minimumHeight,
            ellipsoid.radii.y + minimumHeight,
            ellipsoid.radii.z + minimumHeight
        );
        ellipsoid = Ellipsoid.fromCartesian3(ellipsoidShrunkRadii, result);
    }
    return ellipsoid;
}

var scaledSpaceScratch = new Cartesian3();
var directionScratch = new Cartesian3();

function computeMagnitude(ellipsoid, position, scaledSpaceDirectionToPoint) {
    var scaledSpacePosition = ellipsoid.transformPositionToScaledSpace(
        position,
        scaledSpaceScratch
    );
    var magnitudeSquared = Cartesian3.magnitudeSquared(scaledSpacePosition);
    var magnitude = Math.sqrt(magnitudeSquared);
    var direction = Cartesian3.divideByScalar(
        scaledSpacePosition,
        magnitude,
        directionScratch
    );

    // For the purpose of this computation, points below the ellipsoid are consider to be on it instead.
    magnitudeSquared = Math.max(1.0, magnitudeSquared);
    magnitude = Math.max(1.0, magnitude);

    var cosAlpha = Cartesian3.dot(direction, scaledSpaceDirectionToPoint);
    var sinAlpha = Cartesian3.magnitude(
        Cartesian3.cross(direction, scaledSpaceDirectionToPoint, direction)
    );
    var cosBeta = 1.0 / magnitude;
    var sinBeta = Math.sqrt(magnitudeSquared - 1.0) * cosBeta;

    return 1.0 / (cosAlpha * cosBeta - sinAlpha * sinBeta);
}

function computeHorizonCullingPointFromPositions(
    ellipsoid,
    directionToPoint,
    positions,
    result
) {
    //>>includeStart('debug', pragmas.debug);
    Check.typeOf.object("directionToPoint", directionToPoint);
    Check.defined("positions", positions);
    //>>includeEnd('debug');

    if (!defined(result)) {
        result = new Cartesian3();
    }

    var scaledSpaceDirectionToPoint = computeScaledSpaceDirectionToPoint(
        ellipsoid,
        directionToPoint
    );
    var resultMagnitude = 0.0;

    for (var i = 0, len = positions.length; i < len; ++i) {
        var position = positions[i];
        var candidateMagnitude = computeMagnitude(
            ellipsoid,
            position,
            scaledSpaceDirectionToPoint
        );
        if (candidateMagnitude < 0.0) {
            // all points should face the same direction, but this one doesn't, so return undefined
            return undefined;
        }
        resultMagnitude = Math.max(resultMagnitude, candidateMagnitude);
    }

    return magnitudeToPoint(scaledSpaceDirectionToPoint, resultMagnitude, result);
}

function magnitudeToPoint(
    scaledSpaceDirectionToPoint,
    resultMagnitude,
    result
) {
    // The horizon culling point is undefined if there were no positions from which to compute it,
    // the directionToPoint is pointing opposite all of the positions,  or if we computed NaN or infinity.
    if (
        resultMagnitude <= 0.0 ||
        resultMagnitude === 1.0 / 0.0 ||
        resultMagnitude !== resultMagnitude
    ) {
        return undefined;
    }

    return Cartesian3.multiplyByScalar(
        scaledSpaceDirectionToPoint,
        resultMagnitude,
        result
    );
}

function computeScaledSpaceDirectionToPoint(ellipsoid, directionToPoint) {
    if (Cartesian3.equals(directionToPoint, Cartesian3.ZERO)) {
        return directionToPoint;
    }

    ellipsoid.transformPositionToScaledSpace(
        directionToPoint,
        directionToPointScratch
    );
    return Cartesian3.normalize(directionToPointScratch, directionToPointScratch);
}

export function computeHorizonCullingPointPossiblyUnderEllipsoid(
    ellipsoid,
    directionToPoint,
    positions,
    minimumHeight,
    result
) {
    var possiblyShrunkEllipsoid = getPossiblyShrunkEllipsoid(
        ellipsoid,
        minimumHeight,
        scratchEllipsoidShrunk
    );
    return computeHorizonCullingPointFromPositions(
        possiblyShrunkEllipsoid,
        directionToPoint,
        positions,
        result
    );
};