/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, GeoCoordinates } from "@flywave/flywave-geoutils";
import { Vector3 } from "three/webgpu";

/**
 * Simple distance-based interpolation subdivider
 *
 * This class implements a simple interpolation algorithm based on a fixed
 * distance interval. It no longer accounts for elevation differences; the
 * interpolation density is controlled solely by the tuning parameters.
 */
export abstract class TerrainAdaptedSubdivisionModifier {
    private readonly elevationCache: Map<string, number>;

    /**
     * Constructor
     *
     * @param projection The projection object
     * @param interpolationDistance Interpolation distance (meters); controls how many meters between interpolated points
     * @param cacheSize Elevation cache size, defaults to 500 points (to reduce memory usage)
     */
    constructor(
        readonly projection: Projection,
        readonly interpolationDistance: number = 100, // Interpolate every 100 meters by default
        readonly cacheSize: number = 500 // Reduce cache size to save memory
    ) {
        this.elevationCache = new Map();
    }

    /**
     * Subdivide a GeoCoordinates line by distance interpolation
     *
     * @param geoPoints Array of geographic coordinate points (a line)
     * @param progressCallback Optional progress callback
     * @returns The subdivided array of geographic coordinate points
     */
    modify(
        geoPoints: GeoCoordinates[],
        progressCallback?: (progress: number) => void
    ): GeoCoordinates[] {
        if (geoPoints.length < 2) {
            return [...geoPoints];
        }

        // Clear the cache
        this.elevationCache.clear();

        const result: GeoCoordinates[] = [];

        // Process each segment while preserving the order of the original points
        for (let i = 0; i < geoPoints.length - 1; i++) {
            const startGeo = geoPoints[i];
            const endGeo = geoPoints[i + 1];

            // Subdivide this segment using the interpolation method
            const segmentPoints = this.interpolateSegment(startGeo, endGeo);

            // Add the subdivided points to the result
            if (i === 0) {
                // Add all points for the first segment
                result.push(...segmentPoints);
            } else {
                // Skip the first point of subsequent segments (it duplicates the last point of the previous segment)
                result.push(...segmentPoints.slice(1));
            }

            // Report progress
            if (progressCallback) {
                progressCallback((i + 1) / (geoPoints.length - 1));
            }
        }

        return result;
    }

    /**
     * Subdivide a GeoCoordinates line by distance interpolation and return an
     * index mapping back to the original points
     *
     * @param geoPoints Array of geographic coordinate points (a line)
     * @param progressCallback Optional progress callback
     * @returns The subdivided array of geographic coordinate points and the original-point index mapping
     */
    modifyWithIndexMapping(
        geoPoints: GeoCoordinates[],
        progressCallback?: (progress: number) => void
    ): { points: GeoCoordinates[]; originalIndices: number[] } {
        if (geoPoints.length < 2) {
            return { points: [...geoPoints], originalIndices: geoPoints.map((_, i) => i) };
        }

        // Clear the cache
        this.elevationCache.clear();

        const result: GeoCoordinates[] = [];
        const originalIndices: number[] = [];
        const totalSegments = geoPoints.length - 1;

        // Process each segment
        for (let i = 0; i < totalSegments; i++) {
            const startGeo = geoPoints[i];
            const endGeo = geoPoints[i + 1];

            // Subdivide this segment using the interpolation method
            const segmentPoints = this.interpolateSegment(startGeo, endGeo);

            // Add the subdivided points to the result
            if (i === 0) {
                // Add all points for the first segment
                result.push(...segmentPoints);
                // Add the original index for the first point
                originalIndices.push(i);
                // Add -1 for intermediate inserted points to mark them as newly inserted
                for (let j = 1; j < segmentPoints.length; j++) {
                    originalIndices.push(-1);
                }
            } else {
                // Skip the first point of subsequent segments (it duplicates the last point of the previous segment)
                result.push(...segmentPoints.slice(1));
                // Add -1 for intermediate inserted points to mark them as newly inserted
                for (let j = 1; j < segmentPoints.length; j++) {
                    originalIndices.push(-1);
                }
            }

            // Report progress
            if (progressCallback) {
                progressCallback((i + 1) / totalSegments);
            }
        }

        // Add the index for the last original point
        originalIndices[originalIndices.length - 1] = geoPoints.length - 1;
        return { points: result, originalIndices };
    }

    /**
     * Interpolate a single segment
     */
    private interpolateSegment(startGeo: GeoCoordinates, endGeo: GeoCoordinates): GeoCoordinates[] {
        // Get the elevations of the endpoints (using the cache)
        const startElevation = this.getElevationWithCache(startGeo) || 0;
        const endElevation = this.getElevationWithCache(endGeo) || 0;

        // Compute the horizontal distance between the two points (meters)
        const horizontalDistance = this.calculateHorizontalDistance(startGeo, endGeo);

        // If the distance is within the interpolation distance, return the endpoints directly
        if (horizontalDistance <= this.interpolationDistance) {
            const startWithElevation = new GeoCoordinates(
                startGeo.latitude,
                startGeo.longitude,
                startElevation
            );
            const endWithElevation = new GeoCoordinates(
                endGeo.latitude,
                endGeo.longitude,
                endElevation
            );
            return [startWithElevation, endWithElevation];
        }

        // Compute the number of points to insert
        const numSegments = Math.ceil(horizontalDistance / this.interpolationDistance);
        const result: GeoCoordinates[] = [];

        // Add the starting point
        result.push(new GeoCoordinates(startGeo.latitude, startGeo.longitude, startElevation));

        // Insert the intermediate points
        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const interpolatedGeo = this.interpolateGeoCoordinates(startGeo, endGeo, t);
            const interpolatedElevation = startElevation + (endElevation - startElevation) * t;
            result.push(
                new GeoCoordinates(
                    interpolatedGeo.latitude,
                    interpolatedGeo.longitude,
                    interpolatedElevation
                )
            );
        }

        // Add the ending point
        result.push(new GeoCoordinates(endGeo.latitude, endGeo.longitude, endElevation));

        return result;
    }

    /**
     * Cached elevation lookup
     */
    private getElevationWithCache(geoPoint: GeoCoordinates): number | undefined {
        const key = `${geoPoint.latitude.toFixed(6)},${geoPoint.longitude.toFixed(6)}`;

        // Check the cache
        if (this.elevationCache.has(key)) {
            return this.elevationCache.get(key);
        }

        // Call the abstract method to obtain the elevation
        const elevation = this.getElevation(geoPoint);

        // Update the cache (if it is full, evict the oldest entry)
        if (this.elevationCache.size >= this.cacheSize) {
            const firstKey = this.elevationCache.keys().next().value;
            if (firstKey) {
                this.elevationCache.delete(firstKey);
            }
        }

        // Store the result in the cache
        if (elevation !== undefined) {
            this.elevationCache.set(key, elevation);
        }

        return elevation;
    }

    /**
     * Interpolate between two geographic coordinates
     * @param start The starting geographic coordinate
     * @param end The ending geographic coordinate
     * @param t Interpolation factor (0-1)
     * @returns The interpolated geographic coordinate
     */
    private interpolateGeoCoordinates(
        start: GeoCoordinates,
        end: GeoCoordinates,
        t: number
    ): GeoCoordinates {
        // Simple linear interpolation
        const lat = start.latitude + (end.latitude - start.latitude) * t;
        const lon = start.longitude + (end.longitude - start.longitude) * t;
        return new GeoCoordinates(lat, lon);
    }

    /**
     * Compute the horizontal distance between two geographic coordinate points (meters)
     * @param start The starting geographic coordinate
     * @param end The ending geographic coordinate
     * @returns The horizontal distance (meters)
     */
    protected calculateHorizontalDistance(start: GeoCoordinates, end: GeoCoordinates): number {
        // Convert geographic coordinates to world coordinates
        const startWorld = this.projection.projectPoint(start);
        const endWorld = this.projection.projectPoint(end);

        // Compute the horizontal distance (ignoring the Z axis)
        const dx = endWorld.x - startWorld.x;
        const dy = endWorld.y - startWorld.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Clear the elevation cache
     */
    clearCache(): void {
        this.elevationCache.clear();
    }

    /**
     * Get the current cache size
     */
    getCacheSize(): number {
        return this.elevationCache.size;
    }

    /**
     * Abstract method; subclasses must implement the elevation lookup logic
     * @param geoPoint The geographic coordinate
     * @returns The altitude in meters
     */
    protected abstract getElevation(geoPoint: GeoCoordinates): number | undefined;
}
