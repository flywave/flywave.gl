/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix3, Matrix4, Vector3 } from "three/webgpu";

import type { CelestialDirections } from "@flywave/flywave-atmosphere";

import { computeTemeToPseudoFixedMatrix } from "./CoordinateTransforms";
import { JulianDate } from "./JulianDate";
import { Simon1994PlanetaryPositions } from "./Simon1994PlanetaryPositions";

const scratchMatrix3 = new Matrix3();
const scratchMatrix4 = new Matrix4();
const scratchVector = new Vector3();

export class EarthCelestialDirections implements CelestialDirections {
    getECIToECEFRotationMatrix(date: Date, result: Matrix4): Matrix4 {
        const t = JulianDate.fromDate(date);
        const rotation = computeTemeToPseudoFixedMatrix(t, scratchMatrix3);
        return result.setFromMatrix3(rotation);
    }

    getSunDirectionECI(date: Date, result: Vector3): Vector3 {
        const t = JulianDate.fromDate(date);
        Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(t, result);
        return result.normalize();
    }

    getMoonDirectionECI(date: Date, result: Vector3): Vector3 {
        const t = JulianDate.fromDate(date);
        Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(t, result);
        return result.normalize();
    }

    getMoonFixedToECIRotationMatrix(date: Date, result: Matrix4): Matrix4 {
        return result.identity();
    }
}
