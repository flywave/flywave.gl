import * as THREE from "three";
import EarthOrientationParameters from "./earth-orientation-parameters";
import Iau2006XysData from "./Iau2006XysData"
import DeveloperError from "./developer-error";
import defined from "./defined";
import JulianDate from "./julian-date";
import EarthOrientationParametersSample from "./earth-orientation-parameters-sample";
import Iau2006XysSample from "./Iau2006XysSample";
import TimeConstants from "./time-constants";
import { TWO_PI } from "./math";

export function computeIcrfToFixedMatrix(date, result) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(date)) {
        throw new DeveloperError("date is required.");
    }
    //>>includeEnd('debug');
    if (!defined(result)) {
        result = new THREE.Matrix3();
    }

    var fixedToIcrfMtx = computeFixedToIcrfMatrix(date, result);
    if (!defined(fixedToIcrfMtx)) {
        return undefined;
    }

    return fixedToIcrfMtx.transpose();
};

var xysScratch = new Iau2006XysSample(0.0, 0.0, 0.0);
var eopScratch = new EarthOrientationParametersSample(
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    0.0
  );
var rotation1Scratch = new THREE.Matrix3();
var rotation2Scratch = new THREE.Matrix3();

var ttMinusTai = 32.184;
var j2000ttDays = 2451545.0;
var iau2006XysData = new Iau2006XysData();
export function computeFixedToIcrfMatrix(date, result) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(date)) {
        throw new DeveloperError("date is required.");
    }
    //>>includeEnd('debug');

    if (!defined(result)) {
        result = new THREE.Matrix3();
    }

    // Compute pole wander
    var eop = EarthOrientationParameters.NONE.compute(date, eopScratch);
    if (!defined(eop)) {
        return undefined;
    }

    // There is no external conversion to Terrestrial Time (TT).
    // So use International Atomic Time (TAI) and convert using offsets.
    // Here we are assuming that dayTT and secondTT are positive
    var dayTT = date.dayNumber;
    // It's possible here that secondTT could roll over 86400
    // This does not seem to affect the precision (unit tests check for this)
    var secondTT = date.secondsOfDay + ttMinusTai;

    var xys = iau2006XysData.computeXysRadians(
        dayTT,
        secondTT,
        xysScratch
    );
    if (!defined(xys)) {
        return undefined;
    }

    var x = xys.x + eop.xPoleOffset;
    var y = xys.y + eop.yPoleOffset;

    // Compute XYS rotation
    var a = 1.0 / (1.0 + Math.sqrt(1.0 - x * x - y * y));

    var rotation1 = rotation1Scratch.elements;
    rotation1[0] = 1.0 - a * x * x;
    rotation1[3] = -a * x * y;
    rotation1[6] = x;
    rotation1[1] = -a * x * y;
    rotation1[4] = 1 - a * y * y;
    rotation1[7] = y;
    rotation1[2] = -x;
    rotation1[5] = -y;
    rotation1[8] = 1 - a * (x * x + y * y);

    var rotation2 = rotation2Scratch.setFromMatrix4(new THREE.Matrix4().makeRotationZ(-xys.s));
    var matrixQ = rotation1Scratch.multiplyMatrices(rotation1, rotation2);

    // Similar to TT conversions above
    // It's possible here that secondTT could roll over 86400
    // This does not seem to affect the precision (unit tests check for this)
    var dateUt1day = date.dayNumber;
    var dateUt1sec =
        date.secondsOfDay - JulianDate.computeTaiMinusUtc(date) + eop.ut1MinusUtc;

    // Compute Earth rotation angle
    // The IERS standard for era is
    //    era = 0.7790572732640 + 1.00273781191135448 * Tu
    // where
    //    Tu = JulianDateInUt1 - 2451545.0
    // However, you get much more precision if you make the following simplification
    //    era = a + (1 + b) * (JulianDayNumber + FractionOfDay - 2451545)
    //    era = a + (JulianDayNumber - 2451545) + FractionOfDay + b (JulianDayNumber - 2451545 + FractionOfDay)
    //    era = a + FractionOfDay + b (JulianDayNumber - 2451545 + FractionOfDay)
    // since (JulianDayNumber - 2451545) represents an integer number of revolutions which will be discarded anyway.
    var daysSinceJ2000 = dateUt1day - 2451545;
    var fractionOfDay = dateUt1sec / TimeConstants.SECONDS_PER_DAY;
    var era =
        0.779057273264 +
        fractionOfDay +
        0.00273781191135448 * (daysSinceJ2000 + fractionOfDay);
    era = (era % 1.0) * TWO_PI;

    var earthRotation = rotation2Scratch.setFromMatrix4(new THREE.Matrix4().makeRotationZ(era));

    // pseudoFixed to ICRF
    var pfToIcrf = rotation1Scratch.multiplyMatrices(matrixQ, earthRotation);

    // Compute pole wander matrix
    var cosxp = Math.cos(eop.xPoleWander);
    var cosyp = Math.cos(eop.yPoleWander);
    var sinxp = Math.sin(eop.xPoleWander);
    var sinyp = Math.sin(eop.yPoleWander);

    var ttt = dayTT - j2000ttDays + secondTT / TimeConstants.SECONDS_PER_DAY;
    ttt /= 36525.0;

    // approximate sp value in rad
    var sp = (-47.0e-6 * ttt * RADIANS_PER_DEGREE) / 3600.0;
    var cossp = Math.cos(sp);
    var sinsp = Math.sin(sp);

    var fToPfMtx = rotation2Scratch;
    fToPfMtx[0] = cosxp * cossp;
    fToPfMtx[1] = cosxp * sinsp;
    fToPfMtx[2] = sinxp;
    fToPfMtx[3] = -cosyp * sinsp + sinyp * sinxp * cossp;
    fToPfMtx[4] = cosyp * cossp + sinyp * sinxp * sinsp;
    fToPfMtx[5] = -sinyp * cosxp;
    fToPfMtx[6] = -sinyp * sinsp - cosyp * sinxp * cossp;
    fToPfMtx[7] = sinyp * cossp - cosyp * sinxp * sinsp;
    fToPfMtx[8] = cosyp * cosxp;

    return result.multiplyMatrices(pfToIcrf, fToPfMtx);
};
var dateInUtc = new JulianDate();

var gmstConstant0 = 6 * 3600 + 41 * 60 + 50.54841;
var gmstConstant1 = 8640184.812866;
var gmstConstant2 = 0.093104;
var gmstConstant3 = -6.2e-6;
var rateCoef = 1.1772758384668e-19;
var wgs84WRPrecessing = 7.2921158553e-5;
var twoPiOverSecondsInDay = TWO_PI / 86400.0;
var dateInUtc = new JulianDate();

export function computeTemeToPseudoFixedMatrix(date, result) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(date)) {
        throw new DeveloperError("date is required.");
    }
    //>>includeEnd('debug');

    // GMST is actually computed using UT1.  We're using UTC as an approximation of UT1.
    // We do not want to use the function like convertTaiToUtc in JulianDate because
    // we explicitly do not want to fail when inside the leap second.

    dateInUtc = JulianDate.addSeconds(
        date,
        -JulianDate.computeTaiMinusUtc(date),
        dateInUtc
    );
    var utcDayNumber = dateInUtc.dayNumber;
    var utcSecondsIntoDay = dateInUtc.secondsOfDay;

    var t;
    var diffDays = utcDayNumber - 2451545;
    if (utcSecondsIntoDay >= 43200.0) {
        t = (diffDays + 0.5) / TimeConstants.DAYS_PER_JULIAN_CENTURY;
    } else {
        t = (diffDays - 0.5) / TimeConstants.DAYS_PER_JULIAN_CENTURY;
    }

    var gmst0 =
        gmstConstant0 +
        t * (gmstConstant1 + t * (gmstConstant2 + t * gmstConstant3));
    var angle = (gmst0 * twoPiOverSecondsInDay) % TWO_PI;
    var ratio = wgs84WRPrecessing + rateCoef * (utcDayNumber - 2451545.5);
    var secondsSinceMidnight =
        (utcSecondsIntoDay + TimeConstants.SECONDS_PER_DAY * 0.5) %
        TimeConstants.SECONDS_PER_DAY;
    var gha = angle + ratio * secondsSinceMidnight;
    var cosGha = Math.cos(gha);
    var sinGha = Math.sin(gha);

    if (!defined(result)) {
        return new THREE.Matrix3().set(
            cosGha,
            sinGha,
            0.0,
            -sinGha,
            cosGha,
            0.0,
            0.0,
            0.0,
            1.0
        );
    }
    result[0] = cosGha;
    result[1] = -sinGha;
    result[2] = 0.0;
    result[3] = sinGha;
    result[4] = cosGha;
    result[5] = 0.0;
    result[6] = 0.0;
    result[7] = 0.0;
    result[8] = 1.0;
    return result;
}