import defaultValue from "./default-value";
import DeveloperError from "./developer-error";
import defined from "./defined";

export var EPSILON14 = 0.00000000000001;

export var TWO_PI = 2.0 * Math.PI;

export var RADIANS_PER_DEGREE = Math.PI / 180.0;

export var RADIANS_PER_ARCSECOND = RADIANS_PER_DEGREE / 3600.0;

export var EPSILON10 = 0.0000000001;

export var EPSILON8 = 0.00000001;

export var PI = Math.PI;
/**
 * Produces an angle in the range -Pi <= angle <= Pi which is equivalent to the provided angle.
 *
 * @param {Number} angle in radians
 * @returns {Number} The angle in the range [<code>-CesiumMath.PI</code>, <code>CesiumMath.PI</code>].
 */
export function negativePiToPi(angle) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(angle)) {
        throw new DeveloperError("angle is required.");
    }
    //>>includeEnd('debug');
    if (angle >= -PI && angle <= PI) {
        // Early exit if the input is already inside the range. This avoids
        // unnecessary math which could introduce floating point error.
        return angle;
    }
    return zeroToTwoPi(angle + PI) - PI;
};

/**
 * Produces an angle in the range 0 <= angle <= 2Pi which is equivalent to the provided angle.
 *
 * @param {Number} angle in radians
 * @returns {Number} The angle in the range [0, <code>CesiumMath.TWO_PI</code>].
 */
export function zeroToTwoPi(angle) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(angle)) {
        throw new DeveloperError("angle is required.");
    }
    //>>includeEnd('debug');
    if (angle >= 0 && angle <= TWO_PI) {
        // Early exit if the input is already inside the range. This avoids
        // unnecessary math which could introduce floating point error.
        return angle;
    }
    var m = mod(angle, TWO_PI);
    if (
        Math.abs(m) < EPSILON14 &&
        Math.abs(angle) > EPSILON14
    ) {
        return TWO_PI;
    }
    return m;
};

/**
 * The modulo operation that also works for negative dividends.
 *
 * @param {Number} m The dividend.
 * @param {Number} n The divisor.
 * @returns {Number} The remainder.
 */
export function mod(m, n) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(m)) {
        throw new DeveloperError("m is required.");
    }
    if (!defined(n)) {
        throw new DeveloperError("n is required.");
    }
    if (n === 0.0) {
        throw new DeveloperError("divisor cannot be 0.");
    }
    //>>includeEnd('debug');
    if (sign(m) === sign(n) && Math.abs(m) < Math.abs(n)) {
        // Early exit if the input does not need to be modded. This avoids
        // unnecessary math which could introduce floating point error.
        return m;
    }

    return ((m % n) + n) % n;
};


var sign = defaultValue(Math.sign, function sign(value) {
    value = +value; // coerce to number
    if (value === 0 || value !== value) {
        // zero or NaN
        return value;
    }
    return value > 0 ? 1 : -1;
});

export { sign };

