/* Copyright (C) 2025 flywave.gl contributors */

// Usage example for the simple interpolation algorithm

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

// Create a simple implementation
class SimpleInterpolationModifier extends TerrainAdaptedSubdivisionModifier {
    constructor(interpolationDistance: number) {
        super(mercatorProjection, interpolationDistance);
    }

    // Simple elevation lookup implementation (in a real application this would
    // fetch elevations from a terrain data source)
    protected getElevation(geoPoint: GeoCoordinates): number | undefined {
        // Implement the logic for reading elevations from a real terrain data source here.
        // To keep the example simple, we return a fixed value.
        return 100;
    }
}

// Usage example
function example() {
    // Create the interpolator with one interpolation every 50 meters
    const interpolator = new SimpleInterpolationModifier(50);

    // Create a two-point segment
    const points = [
        new GeoCoordinates(0, 0, 100), // start point
        new GeoCoordinates(0, 0.001, 100) // end point (about 111 meters away)
    ];

    console.log("原始点数:", points.length);

    // Run the interpolation
    const result = interpolator.modify(points);

    console.log("插值后点数:", result.length);
    console.log("插值点坐标:");
    result.forEach((point, index) => {
        console.log(`  ${index}: (${point.latitude}, ${point.longitude}, ${point.altitude})`);
    });
}

// Run the example
example();
