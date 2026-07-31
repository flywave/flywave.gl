/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import { JulianDate, TimeConstants } from "./JulianDate";
import { TWO_PI } from "./Simon1994PlanetaryPositions";

const TT_MINUS_TAI = 32.184;
const J2000_TT_DAYS = 2451545.0;
const GMST_CONSTANTS = {
    C0: 6 * 3600 + 41 * 60 + 50.54841,
    C1: 8640184.812866,
    C2: 0.093104,
    C3: -6.2e-6
};
const RATE_COEF = 1.1772758384668e-19;
const WGS84_WR_PRECESSING = 7.2921158553e-5;
const TWO_PI_OVER_SECONDS_IN_DAY = TWO_PI / TimeConstants.SECONDS_PER_DAY;

const dateInUtcScratch = new JulianDate();

/**
 * Compute the transformation matrix from TEME (True Equator Mean Equinox)
 * to the pseudo-fixed coordinate system.
 * @param date - The Julian date.
 * @param result - Optional result matrix.
 * @returns The transformation matrix.
 */
export function computeTemeToPseudoFixedMatrix(
    date: JulianDate,
    result?: THREE.Matrix3
): THREE.Matrix3 {
    if (!date) {
        throw new Error("date is required.");
    }

    const dateInUtc = JulianDate.addSeconds(
        date,
        -JulianDate.computeTaiMinusUtc(date),
        dateInUtcScratch
    );
    const utcDayNumber = dateInUtc.dayNumber;
    const utcSecondsIntoDay = dateInUtc.secondsOfDay;

    let t: number;
    const diffDays = utcDayNumber - 2451545;
    if (utcSecondsIntoDay >= 43200.0) {
        t = (diffDays + 0.5) / TimeConstants.DAYS_PER_JULIAN_CENTURY;
    } else {
        t = (diffDays - 0.5) / TimeConstants.DAYS_PER_JULIAN_CENTURY;
    }

    const gmst0 =
        GMST_CONSTANTS.C0 +
        t * (GMST_CONSTANTS.C1 + t * (GMST_CONSTANTS.C2 + t * GMST_CONSTANTS.C3));
    const angle = (gmst0 * TWO_PI_OVER_SECONDS_IN_DAY) % TWO_PI;
    const ratio = WGS84_WR_PRECESSING + RATE_COEF * (utcDayNumber - 2451545.5);
    const secondsSinceMidnight =
        (utcSecondsIntoDay + TimeConstants.SECONDS_PER_DAY * 0.5) % TimeConstants.SECONDS_PER_DAY;
    const gha = angle + ratio * secondsSinceMidnight;
    const cosGha = Math.cos(gha);
    const sinGha = Math.sin(gha);

    if (!result) {
        return new THREE.Matrix3().set(cosGha, sinGha, 0.0, -sinGha, cosGha, 0.0, 0.0, 0.0, 1.0);
    }

    return result.set(cosGha, sinGha, 0.0, -sinGha, cosGha, 0.0, 0.0, 0.0, 1.0);
}
