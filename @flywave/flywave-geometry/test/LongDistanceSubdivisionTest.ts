/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { expect } from "chai";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

class TestDistanceInterpolationModifier extends TerrainAdaptedSubdivisionModifier {
    private readonly elevationMap: Map<string, number>;

    constructor(interpolationDistance: number, elevationMap: Map<string, number>) {
        super(mercatorProjection, interpolationDistance);
        this.elevationMap = elevationMap;
    }

    protected getElevation(geoPoint: GeoCoordinates): number | undefined {
        const key = `${geoPoint.latitude.toFixed(6)},${geoPoint.longitude.toFixed(6)}`;
        return this.elevationMap.get(key);
    }
}

describe("DistanceInterpolationTest", function () {
    it("performs interpolation for long distances with small elevation differences", function () {
        // Create an elevation map
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // start elevation: 100 meters
        elevationMap.set("0.000000,2.000000", 105); // end elevation: 105 meters (only a 5-meter difference)

        // Set the interpolation distance to 50 kilometers
        const modifier = new TestDistanceInterpolationModifier(50000, elevationMap); // 50 km interpolation interval

        // Create a two-point segment that is far apart but has a small elevation difference
        const startPoint = new GeoCoordinates(0, 0, 100);
        const endPoint = new GeoCoordinates(0, 2, 105); // 2 degrees of latitude apart, about 222 km

        const points = [startPoint, endPoint];

        // Run the interpolation
        const result = modifier.modify(points);

        // Verify that interpolation actually happened (the result should have more than 2 points)
        expect(result.length).to.be.greaterThan(2);

        // Verify that every point uses the altitude obtained from the elevation lookup
        for (const point of result) {
            expect(point.altitude).to.not.be.undefined;
        }

        // Verify the elevations of the start and end points
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(105);
    });
});
