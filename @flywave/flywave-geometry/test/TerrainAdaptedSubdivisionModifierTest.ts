/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { expect } from "chai";
import sinon from "sinon";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

class TestTerrainAdaptedSubdivisionModifier extends TerrainAdaptedSubdivisionModifier {
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

describe("TerrainAdaptedSubdivisionModifier", function () {
    it("updates elevation of all output points using elevation query", function () {
        // Create a simple elevation map
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 150); // start elevation: 150 meters (differs from the input 100 meters)
        elevationMap.set("0.000000,1.000000", 180); // end elevation: 180 meters (differs from the input 200 meters)

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap); // Use a larger interpolation distance to avoid subdivision

        // Create a two-point segment (the initial altitudes will be overwritten by the elevation query results)
        const points = [
            new GeoCoordinates(0, 0, 100), // initial altitude: 100 meters
            new GeoCoordinates(0, 1, 200) // initial altitude: 200 meters
        ];

        // Run subdivision
        const result = modifier.modify(points);

        // Verify that every point uses the altitude obtained from the elevation lookup
        expect(result[0].altitude).to.equal(150); // should be 150 meters, not the initial 100 meters
        expect(result[result.length - 1].altitude).to.equal(180); // should be 180 meters, not the initial 200 meters
    });

    it("performs interpolation based on distance", function () {
        // Create a simple elevation map
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // start elevation: 100 meters
        elevationMap.set("0.000000,1.000000", 200); // end elevation: 200 meters

        // Use a smaller interpolation distance to ensure subdivision happens
        const modifier = new TestTerrainAdaptedSubdivisionModifier(50000, elevationMap); // 50 km interpolation interval

        // Create a two-point segment about 111 kilometers apart
        const points = [new GeoCoordinates(0, 0, 100), new GeoCoordinates(0, 1, 200)];

        // Run subdivision
        const result = modifier.modify(points);

        // Verify that interpolation actually happened (the result should have more than 2 points)
        expect(result.length).to.be.greaterThan(2);

        // Verify that every point uses the altitude obtained from the elevation lookup
        for (const point of result) {
            expect(point.altitude).to.not.be.undefined;
        }

        // Verify the elevations of the start and end points
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(200);
    });

    it("handles points without initial elevation", function () {
        // Create a simple elevation map
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // start elevation: 100 meters
        elevationMap.set("0.000000,1.000000", 200); // end elevation: 200 meters

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap);

        // Create two points without an initial elevation
        const points = [
            new GeoCoordinates(0, 0), // no elevation
            new GeoCoordinates(0, 1) // no elevation
        ];

        // Run subdivision
        const result = modifier.modify(points);

        // Verify that every point uses the altitude obtained from the elevation lookup
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(200);
    });

    it("calls progress callback", function () {
        // Create a simple elevation map
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100);
        elevationMap.set("0.000000,1.000000", 200);

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap);

        // Create a two-point segment
        const points = [new GeoCoordinates(0, 0, 100), new GeoCoordinates(0, 1, 200)];

        // Create a spy for the progress callback
        const progressCallback = sinon.spy();

        // Run subdivision
        modifier.modify(points, progressCallback);

        // Verify that the progress callback was called
        expect(progressCallback.called).to.be.true;
    });
});
