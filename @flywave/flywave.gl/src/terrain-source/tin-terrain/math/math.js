import {  defined, defaultValue } from "../utils";

import DeveloperError from "../../../util/developer-error";

var sign = defaultValue(Math.sign, function sign(value) {
    value = +value; // coerce to number
    if (value === 0 || value !== value) {
        // zero or NaN
        return value;
    }
    return value > 0 ? 1 : -1;
});
export { sign };

export function equalsEpsilon(
    left,
    right,
    relativeEpsilon,
    absoluteEpsilon
) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(left)) {
        throw new DeveloperError("left is required.");
    }
    if (!defined(right)) {
        throw new DeveloperError("right is required.");
    }
    //>>includeEnd('debug');

    relativeEpsilon = defaultValue(relativeEpsilon, 0.0);
    absoluteEpsilon = defaultValue(absoluteEpsilon, relativeEpsilon);
    var absDiff = Math.abs(left - right);
    return (
        absDiff <= absoluteEpsilon ||
        absDiff <= relativeEpsilon * Math.max(Math.abs(left), Math.abs(right))
    );
};

export function vector3equalsEpsilon(
    left,
    right,
    relativeEpsilon,
    absoluteEpsilon
) {
    return (
        left === right ||
        (defined(left) &&
            defined(right) &&
            equalsEpsilon(
                left.x,
                right.x,
                relativeEpsilon,
                absoluteEpsilon
            ) &&
            equalsEpsilon(
                left.y,
                right.y,
                relativeEpsilon,
                absoluteEpsilon
            ) &&
            equalsEpsilon(
                left.z,
                right.z,
                relativeEpsilon,
                absoluteEpsilon
            ))
    );
};