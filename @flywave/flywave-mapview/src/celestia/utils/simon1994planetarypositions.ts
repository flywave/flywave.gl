/* Copyright (C) 2025 flywave.gl contributors */

// julian-date.ts
import * as THREE from "three";

import { JulianDate, TimeConstants, TimeStandard } from "./JulianDate";

// Math constants and utilities
export const EPSILON14 = 0.00000000000001;
export const TWO_PI = 2.0 * Math.PI;
export const RADIANS_PER_DEGREE = Math.PI / 180.0;
export const RADIANS_PER_ARCSECOND = RADIANS_PER_DEGREE / 3600.0;
export const EPSILON10 = 0.0000000001;
export const EPSILON8 = 0.00000001;
export const PI = Math.PI;

export function negativePiToPi(angle: number): number {
    if (angle >= -PI && angle <= PI) {
        return angle;
    }
    return zeroToTwoPi(angle + PI) - PI;
}

export function zeroToTwoPi(angle: number): number {
    if (angle >= 0 && angle <= TWO_PI) {
        return angle;
    }
    const m = mod(angle, TWO_PI);
    if (Math.abs(m) < EPSILON14 && Math.abs(angle) > EPSILON14) {
        return TWO_PI;
    }
    return m;
}

export function mod(m: number, n: number): number {
    if (n === 0.0) {
        throw new Error("divisor cannot be 0.");
    }
    if (sign(m) === sign(n) && Math.abs(m) < Math.abs(n)) {
        return m;
    }
    return ((m % n) + n) % n;
}

export function sign(value: number): number {
    value = +value; // coerce to number
    if (value === 0 || isNaN(value)) {
        return value;
    }
    return value > 0 ? 1 : -1;
}

// Rest of the JulianDate class implementation remains the same...
// [Previous JulianDate implementation here...]

// Planetary positions implementation
const MetersPerKilometer = 1000.0;
const MetersPerAstronomicalUnit = 1.4959787e11; // IAU 1976 value

const perifocalToEquatorial = new THREE.Matrix3();

function elementsToCartesian(
    semimajorAxis: number,
    eccentricity: number,
    inclination: number,
    longitudeOfPerigee: number,
    longitudeOfNode: number,
    meanLongitude: number,
    result?: THREE.Vector3
): THREE.Vector3 {
    if (inclination < 0.0) {
        inclination = -inclination;
        longitudeOfNode += PI;
    }

    if (inclination < 0 || inclination > PI) {
        throw new Error(
            "The inclination is out of range. Inclination must be greater than or equal to zero and less than or equal to Pi radians."
        );
    }

    const radiusOfPeriapsis = semimajorAxis * (1.0 - eccentricity);
    const argumentOfPeriapsis = longitudeOfPerigee - longitudeOfNode;
    const rightAscensionOfAscendingNode = longitudeOfNode;
    const trueAnomaly = meanAnomalyToTrueAnomaly(meanLongitude - longitudeOfPerigee, eccentricity);

    if (
        eccentricity >= 1.0 &&
        Math.abs(negativePiToPi(trueAnomaly)) >= Math.acos(-1.0 / eccentricity)
    ) {
        throw new Error(
            "The true anomaly of the hyperbolic orbit lies outside of the bounds of the hyperbola."
        );
    }

    perifocalToCartesianMatrix(
        argumentOfPeriapsis,
        inclination,
        rightAscensionOfAscendingNode,
        perifocalToEquatorial
    );

    const semilatus = radiusOfPeriapsis * (1.0 + eccentricity);
    const costheta = Math.cos(trueAnomaly);
    const sintheta = Math.sin(trueAnomaly);
    const denom = 1.0 + eccentricity * costheta;

    if (denom <= EPSILON10) {
        throw new Error("elements cannot be converted to cartesian");
    }

    const radius = semilatus / denom;
    const vector = result || new THREE.Vector3();
    vector.set(radius * costheta, radius * sintheta, 0.0);
    return vector.applyMatrix3(perifocalToEquatorial);
}

function meanAnomalyToTrueAnomaly(meanAnomaly: number, eccentricity: number): number {
    if (eccentricity < 0.0 || eccentricity >= 1.0) {
        throw new Error("eccentricity out of range.");
    }

    const eccentricAnomaly = meanAnomalyToEccentricAnomaly(meanAnomaly, eccentricity);
    return eccentricAnomalyToTrueAnomaly(eccentricAnomaly, eccentricity);
}

const maxIterationCount = 50;
const keplerEqConvergence = EPSILON8;

function meanAnomalyToEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
    if (eccentricity < 0.0 || eccentricity >= 1.0) {
        throw new Error("eccentricity out of range.");
    }

    const revs = Math.floor(meanAnomaly / TWO_PI);
    meanAnomaly -= revs * TWO_PI;

    let iterationValue =
        meanAnomaly +
        (eccentricity * Math.sin(meanAnomaly)) /
            (1.0 - Math.sin(meanAnomaly + eccentricity) + Math.sin(meanAnomaly));

    let eccentricAnomaly = Number.MAX_VALUE;

    let count;
    for (
        count = 0;
        count < maxIterationCount &&
        Math.abs(eccentricAnomaly - iterationValue) > keplerEqConvergence;
        ++count
    ) {
        eccentricAnomaly = iterationValue;
        const NRfunction =
            eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly;
        const dNRfunction = 1 - eccentricity * Math.cos(eccentricAnomaly);
        iterationValue = eccentricAnomaly - NRfunction / dNRfunction;
    }

    if (count >= maxIterationCount) {
        throw new Error("Kepler equation did not converge");
    }

    return iterationValue + revs * TWO_PI;
}

function eccentricAnomalyToTrueAnomaly(eccentricAnomaly: number, eccentricity: number): number {
    if (eccentricity < 0.0 || eccentricity >= 1.0) {
        throw new Error("eccentricity out of range.");
    }

    const revs = Math.floor(eccentricAnomaly / TWO_PI);
    eccentricAnomaly -= revs * TWO_PI;

    const trueAnomalyX = Math.cos(eccentricAnomaly) - eccentricity;
    const trueAnomalyY = Math.sin(eccentricAnomaly) * Math.sqrt(1 - eccentricity * eccentricity);

    let trueAnomaly = Math.atan2(trueAnomalyY, trueAnomalyX);
    trueAnomaly = zeroToTwoPi(trueAnomaly);
    if (eccentricAnomaly < 0) {
        trueAnomaly -= TWO_PI;
    }
    trueAnomaly += revs * TWO_PI;

    return trueAnomaly;
}

function perifocalToCartesianMatrix(
    argumentOfPeriapsis: number,
    inclination: number,
    rightAscension: number,
    result: THREE.Matrix3
): THREE.Matrix3 {
    if (inclination < 0 || inclination > PI) {
        throw new Error("inclination out of range");
    }

    const cosap = Math.cos(argumentOfPeriapsis);
    const sinap = Math.sin(argumentOfPeriapsis);
    const cosi = Math.cos(inclination);
    const sini = Math.sin(inclination);
    const cosraan = Math.cos(rightAscension);
    const sinraan = Math.sin(rightAscension);

    const elements = result.elements;
    elements[0] = cosraan * cosap - sinraan * sinap * cosi;
    elements[1] = sinraan * cosap + cosraan * sinap * cosi;
    elements[2] = sinap * sini;
    elements[3] = -cosraan * sinap - sinraan * cosap * cosi;
    elements[4] = -sinraan * sinap + cosraan * cosap * cosi;
    elements[5] = cosap * sini;
    elements[6] = sinraan * sini;
    elements[7] = -cosraan * sini;
    elements[8] = cosi;

    return result;
}

// From section 5.8
const semiMajorAxis0 = 1.0000010178 * MetersPerAstronomicalUnit;
const meanLongitude0 = 100.46645683 * RADIANS_PER_DEGREE;
const meanLongitude1 = 1295977422.83429 * RADIANS_PER_ARCSECOND;

// From table 6
const p1u = 16002;
const p2u = 21863;
const p3u = 32004;
const p4u = 10931;
const p5u = 14529;
const p6u = 16368;
const p7u = 15318;
const p8u = 32794;

const Ca1 = 64 * 1e-7 * MetersPerAstronomicalUnit;
const Ca2 = -152 * 1e-7 * MetersPerAstronomicalUnit;
const Ca3 = 62 * 1e-7 * MetersPerAstronomicalUnit;
const Ca4 = -8 * 1e-7 * MetersPerAstronomicalUnit;
const Ca5 = 32 * 1e-7 * MetersPerAstronomicalUnit;
const Ca6 = -41 * 1e-7 * MetersPerAstronomicalUnit;
const Ca7 = 19 * 1e-7 * MetersPerAstronomicalUnit;
const Ca8 = -11 * 1e-7 * MetersPerAstronomicalUnit;

const Sa1 = -150 * 1e-7 * MetersPerAstronomicalUnit;
const Sa2 = -46 * 1e-7 * MetersPerAstronomicalUnit;
const Sa3 = 68 * 1e-7 * MetersPerAstronomicalUnit;
const Sa4 = 54 * 1e-7 * MetersPerAstronomicalUnit;
const Sa5 = 14 * 1e-7 * MetersPerAstronomicalUnit;
const Sa6 = 24 * 1e-7 * MetersPerAstronomicalUnit;
const Sa7 = -28 * 1e-7 * MetersPerAstronomicalUnit;
const Sa8 = 22 * 1e-7 * MetersPerAstronomicalUnit;

const q1u = 10;
const q2u = 16002;
const q3u = 21863;
const q4u = 10931;
const q5u = 1473;
const q6u = 32004;
const q7u = 4387;
const q8u = 73;

const Cl1 = -325 * 1e-7;
const Cl2 = -322 * 1e-7;
const Cl3 = -79 * 1e-7;
const Cl4 = 232 * 1e-7;
const Cl5 = -52 * 1e-7;
const Cl6 = 97 * 1e-7;
const Cl7 = 55 * 1e-7;
const Cl8 = -41 * 1e-7;

const Sl1 = -105 * 1e-7;
const Sl2 = -137 * 1e-7;
const Sl3 = 258 * 1e-7;
const Sl4 = 35 * 1e-7;
const Sl5 = -116 * 1e-7;
const Sl6 = -88 * 1e-7;
const Sl7 = -112 * 1e-7;
const Sl8 = -80 * 1e-7;

const scratchDate = new JulianDate(0, 0.0, TimeStandard.TAI);

function computeTdbMinusTtSpice(daysSinceJ2000InTerrestrialTime: number): number {
    const g = 6.239996 + 0.0172019696544 * daysSinceJ2000InTerrestrialTime;
    return 1.657e-3 * Math.sin(g + 1.671e-2 * Math.sin(g));
}

const TdtMinusTai = 32.184;
const J2000d = 2451545;

function taiToTdb(date: JulianDate, result: JulianDate): JulianDate {
    result = JulianDate.addSeconds(date, TdtMinusTai, result);
    const days = JulianDate.totalDays(result) - J2000d;
    return JulianDate.addSeconds(result, computeTdbMinusTtSpice(days), result);
}

function computeSimonEarthMoonBarycenter(date: JulianDate, result?: THREE.Vector3): THREE.Vector3 {
    taiToTdb(date, scratchDate);
    const x =
        scratchDate.dayNumber -
        epoch.dayNumber +
        (scratchDate.secondsOfDay - epoch.secondsOfDay) / TimeConstants.SECONDS_PER_DAY;
    const t = x / (TimeConstants.DAYS_PER_JULIAN_CENTURY * 10.0);

    const u = 0.3595362 * t;
    const semimajorAxis =
        semiMajorAxis0 +
        Ca1 * Math.cos(p1u * u) +
        Sa1 * Math.sin(p1u * u) +
        Ca2 * Math.cos(p2u * u) +
        Sa2 * Math.sin(p2u * u) +
        Ca3 * Math.cos(p3u * u) +
        Sa3 * Math.sin(p3u * u) +
        Ca4 * Math.cos(p4u * u) +
        Sa4 * Math.sin(p4u * u) +
        Ca5 * Math.cos(p5u * u) +
        Sa5 * Math.sin(p5u * u) +
        Ca6 * Math.cos(p6u * u) +
        Sa6 * Math.sin(p6u * u) +
        Ca7 * Math.cos(p7u * u) +
        Sa7 * Math.sin(p7u * u) +
        Ca8 * Math.cos(p8u * u) +
        Sa8 * Math.sin(p8u * u);
    const meanLongitude =
        meanLongitude0 +
        meanLongitude1 * t +
        Cl1 * Math.cos(q1u * u) +
        Sl1 * Math.sin(q1u * u) +
        Cl2 * Math.cos(q2u * u) +
        Sl2 * Math.sin(q2u * u) +
        Cl3 * Math.cos(q3u * u) +
        Sl3 * Math.sin(q3u * u) +
        Cl4 * Math.cos(q4u * u) +
        Sl4 * Math.sin(q4u * u) +
        Cl5 * Math.cos(q5u * u) +
        Sl5 * Math.sin(q5u * u) +
        Cl6 * Math.cos(q6u * u) +
        Sl6 * Math.sin(q6u * u) +
        Cl7 * Math.cos(q7u * u) +
        Sl7 * Math.sin(q7u * u) +
        Cl8 * Math.cos(q8u * u) +
        Sl8 * Math.sin(q8u * u);

    const eccentricity = 0.0167086342 - 0.0004203654 * t;
    const longitudeOfPerigee =
        102.93734808 * RADIANS_PER_DEGREE + 11612.3529 * RADIANS_PER_ARCSECOND * t;
    const inclination = 469.97289 * RADIANS_PER_ARCSECOND * t;
    const longitudeOfNode =
        174.87317577 * RADIANS_PER_DEGREE - 8679.27034 * RADIANS_PER_ARCSECOND * t;

    return elementsToCartesian(
        semimajorAxis,
        eccentricity,
        inclination,
        longitudeOfPerigee,
        longitudeOfNode,
        meanLongitude,
        result
    );
}

const moonEarthMassRatio = 0.012300034; // From 1992 mu value in Table 2
const factor = (moonEarthMassRatio / (moonEarthMassRatio + 1.0)) * -1;

function computeSimonEarth(date: JulianDate, result?: THREE.Vector3): THREE.Vector3 {
    const moonPosition = computeSimonMoon(date, result);
    return moonPosition.multiplyScalar(factor);
}

const axesTransformation = new THREE.Matrix3().set(
    1.0000000000000002,
    5.619723173785822e-16,
    4.690511510146299e-19,
    -5.154129427414611e-16,
    0.9174820620691819,
    -0.39777715593191376,
    -2.23970096136568e-16,
    0.39777715593191376,
    0.9174820620691819
);

const epoch = new JulianDate(2451545, 0, TimeStandard.TAI); // Actually TDB (not TAI)

export class Simon1994PlanetaryPositions {
    static computeSunPositionInEarthInertialFrame(
        julianDate?: JulianDate,
        result?: THREE.Vector3
    ): THREE.Vector3 {
        if (!julianDate) {
            julianDate = JulianDate.now();
        }

        if (!result) {
            result = new THREE.Vector3();
        }

        // First forward transformation
        const barycenter = computeSimonEarthMoonBarycenter(julianDate, new THREE.Vector3());
        result.copy(barycenter).negate();

        // Second forward transformation
        const earthPosition = computeSimonEarth(julianDate, new THREE.Vector3());
        result.sub(earthPosition);
        result.applyMatrix3(axesTransformation);

        return result;
    }

    static computeMoonPositionInEarthInertialFrame(
        julianDate?: JulianDate,
        result?: THREE.Vector3
    ): THREE.Vector3 {
        if (!julianDate) {
            julianDate = JulianDate.now();
        }

        result = computeSimonMoon(julianDate, result);
        result.applyMatrix3(axesTransformation);
        return result;
    }
}

function computeSimonMoon(date: JulianDate, result?: THREE.Vector3): THREE.Vector3 {
    taiToTdb(date, scratchDate);
    const x =
        scratchDate.dayNumber -
        epoch.dayNumber +
        (scratchDate.secondsOfDay - epoch.secondsOfDay) / TimeConstants.SECONDS_PER_DAY;
    const t = x / TimeConstants.DAYS_PER_JULIAN_CENTURY;
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;

    // Terms from section 3.4 (b.1)
    let semimajorAxis = 383397.7725 + 0.004 * t;
    let eccentricity = 0.055545526 - 0.000000016 * t;
    const inclinationConstant = 5.15668983 * RADIANS_PER_DEGREE;
    let inclinationSecPart = -0.00008 * t + 0.02966 * t2 - 0.000042 * t3 - 0.00000013 * t4;
    const longitudeOfPerigeeConstant = 83.35324312 * RADIANS_PER_DEGREE;
    let longitudeOfPerigeeSecPart =
        14643420.2669 * t - 38.2702 * t2 - 0.045047 * t3 + 0.00021301 * t4;
    const longitudeOfNodeConstant = 125.04455501 * RADIANS_PER_DEGREE;
    let longitudeOfNodeSecPart = -6967919.3631 * t + 6.3602 * t2 + 0.007625 * t3 - 0.00003586 * t4;
    const meanLongitudeConstant = 218.31664563 * RADIANS_PER_DEGREE;
    let meanLongitudeSecPart = 1732559343.4847 * t - 6.391 * t2 + 0.006588 * t3 - 0.00003169 * t4;

    // Delaunay arguments from section 3.5 b
    const D =
        297.85019547 * RADIANS_PER_DEGREE +
        RADIANS_PER_ARCSECOND *
            (1602961601.209 * t - 6.3706 * t2 + 0.006593 * t3 - 0.00003169 * t4);
    const F =
        93.27209062 * RADIANS_PER_DEGREE +
        RADIANS_PER_ARCSECOND *
            (1739527262.8478 * t - 12.7512 * t2 - 0.001037 * t3 + 0.00000417 * t4);
    const l =
        134.96340251 * RADIANS_PER_DEGREE +
        RADIANS_PER_ARCSECOND *
            (1717915923.2178 * t + 31.8792 * t2 + 0.051635 * t3 - 0.0002447 * t4);
    const lprime =
        357.52910918 * RADIANS_PER_DEGREE +
        RADIANS_PER_ARCSECOND *
            (129596581.0481 * t - 0.5532 * t2 + 0.000136 * t3 - 0.00001149 * t4);
    const psi =
        310.17137918 * RADIANS_PER_DEGREE -
        RADIANS_PER_ARCSECOND * (6967051.436 * t + 6.2068 * t2 + 0.007618 * t3 - 0.00003219 * t4);

    // Add terms from Table 4
    const twoD = 2.0 * D;
    const fourD = 4.0 * D;
    const sixD = 6.0 * D;
    const twol = 2.0 * l;
    const threel = 3.0 * l;
    const fourl = 4.0 * l;
    const twoF = 2.0 * F;

    semimajorAxis +=
        3400.4 * Math.cos(twoD) -
        635.6 * Math.cos(twoD - l) -
        235.6 * Math.cos(l) +
        218.1 * Math.cos(twoD - lprime) +
        181.0 * Math.cos(twoD + l);

    eccentricity +=
        0.014216 * Math.cos(twoD - l) +
        0.008551 * Math.cos(twoD - twol) -
        0.001383 * Math.cos(l) +
        0.001356 * Math.cos(twoD + l) -
        0.001147 * Math.cos(fourD - threel) -
        0.000914 * Math.cos(fourD - twol) +
        0.000869 * Math.cos(twoD - lprime - l) -
        0.000627 * Math.cos(twoD) -
        0.000394 * Math.cos(fourD - fourl) +
        0.000282 * Math.cos(twoD - lprime - twol) -
        0.000279 * Math.cos(D - l) -
        0.000236 * Math.cos(twol) +
        0.000231 * Math.cos(fourD) +
        0.000229 * Math.cos(sixD - fourl) -
        0.000201 * Math.cos(twol - twoF);

    inclinationSecPart +=
        486.26 * Math.cos(twoD - twoF) -
        40.13 * Math.cos(twoD) +
        37.51 * Math.cos(twoF) +
        25.73 * Math.cos(twol - twoF) +
        19.97 * Math.cos(twoD - lprime - twoF);

    longitudeOfPerigeeSecPart +=
        -55609 * Math.sin(twoD - l) -
        34711 * Math.sin(twoD - twol) -
        9792 * Math.sin(l) +
        9385 * Math.sin(fourD - threel) +
        7505 * Math.sin(fourD - twol) +
        5318 * Math.sin(twoD + l) +
        3484 * Math.sin(fourD - fourl) -
        3417 * Math.sin(twoD - lprime - l) -
        2530 * Math.sin(sixD - fourl) -
        2376 * Math.sin(twoD) -
        2075 * Math.sin(twoD - threel) -
        1883 * Math.sin(twol) -
        1736 * Math.sin(sixD - 5.0 * l) +
        1626 * Math.sin(lprime) -
        1370 * Math.sin(sixD - threel);

    longitudeOfNodeSecPart +=
        -5392 * Math.sin(twoD - twoF) -
        540 * Math.sin(lprime) -
        441 * Math.sin(twoD) +
        423 * Math.sin(twoF) -
        288 * Math.sin(twol - twoF);

    meanLongitudeSecPart +=
        -3332.9 * Math.sin(twoD) +
        1197.4 * Math.sin(twoD - l) -
        662.5 * Math.sin(lprime) +
        396.3 * Math.sin(l) -
        218.0 * Math.sin(twoD - lprime);

    // Add terms from Table 5
    const twoPsi = 2.0 * psi;
    const threePsi = 3.0 * psi;

    inclinationSecPart +=
        46.997 * Math.cos(psi) * t -
        0.614 * Math.cos(twoD - twoF + psi) * t +
        0.614 * Math.cos(twoD - twoF - psi) * t -
        0.0297 * Math.cos(twoPsi) * t2 -
        0.0335 * Math.cos(psi) * t2 +
        0.0012 * Math.cos(twoD - twoF + twoPsi) * t2 -
        0.00016 * Math.cos(psi) * t3 +
        0.00004 * Math.cos(threePsi) * t3 +
        0.00004 * Math.cos(twoPsi) * t3;

    const perigeeAndMean =
        2.116 * Math.sin(psi) * t -
        0.111 * Math.sin(twoD - twoF - psi) * t -
        0.0015 * Math.sin(psi) * t2;

    longitudeOfPerigeeSecPart += perigeeAndMean;
    meanLongitudeSecPart += perigeeAndMean;

    longitudeOfNodeSecPart +=
        -520.77 * Math.sin(psi) * t +
        13.66 * Math.sin(twoD - twoF + psi) * t +
        1.12 * Math.sin(twoD - psi) * t -
        1.06 * Math.sin(twoF - psi) * t +
        0.66 * Math.sin(twoPsi) * t2 +
        0.371 * Math.sin(psi) * t2 -
        0.035 * Math.sin(twoD - twoF + twoPsi) * t2 -
        0.015 * Math.sin(twoD - twoF + psi) * t2 +
        0.0014 * Math.sin(psi) * t3 -
        0.0011 * Math.sin(threePsi) * t3 -
        0.0009 * Math.sin(twoPsi) * t3;

    // Add constants and convert units
    semimajorAxis *= MetersPerKilometer;
    const inclination = inclinationConstant + inclinationSecPart * RADIANS_PER_ARCSECOND;
    const longitudeOfPerigee =
        longitudeOfPerigeeConstant + longitudeOfPerigeeSecPart * RADIANS_PER_ARCSECOND;
    const meanLongitude = meanLongitudeConstant + meanLongitudeSecPart * RADIANS_PER_ARCSECOND;
    const longitudeOfNode =
        longitudeOfNodeConstant + longitudeOfNodeSecPart * RADIANS_PER_ARCSECOND;

    return elementsToCartesian(
        semimajorAxis,
        eccentricity,
        inclination,
        longitudeOfPerigee,
        longitudeOfNode,
        meanLongitude,
        result
    );
}
