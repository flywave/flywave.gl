/* Copyright (C) 2025 flywave.gl contributors */

import * as turf from "@turf/turf";

import { GeoCoordinates } from "../coordinates/GeoCoordinates";

export interface BufferOptions {
    units?: turf.Units;
    innerFactor?: number;
    steps?: number;
}

/**
 * 3D buffer generator for line features with height information
 * Generates extruded buffer geometries around 3D lines
 */
export class HeightAwareBufferGenerator {
    /**
     * Converts GeoCoordinates array to turf LineString feature
     * @param coordinates - Array of geographic coordinates
     * @returns Turf LineString feature in [longitude, latitude] format
     */
    private createTurfLineString(coordinates: GeoCoordinates[]): turf.Feature<turf.LineString> {
        const lineCoords = coordinates.map(coord => [coord.longitude, coord.latitude]);
        return turf.lineString(lineCoords);
    }

    /**
     * Finds the closest point on a line segment to a given point using Turf.js
     * @param point - Target point as GeoCoordinates
     * @param line - Line segment as array of GeoCoordinates
     * @returns Object containing closest point, segment index, and interpolation parameter
     */
    private findClosestPointOnLine(
        point: GeoCoordinates,
        line: GeoCoordinates[]
    ): { closestPoint: GeoCoordinates; segmentIndex: number; t: number } {
        const turfPoint = turf.point([point.longitude, point.latitude]);
        const turfLineCoords = line.map(coord => [coord.longitude, coord.latitude]);
        const turfLine = turf.lineString(turfLineCoords);
        const length = turf.length(turfLine, { units: "meters" });

        const nearestPoint = turf.nearestPointOnLine(turfLine, turfPoint, { units: "meters" });

        const closestPoint = new GeoCoordinates(
            nearestPoint.geometry.coordinates[1],
            nearestPoint.geometry.coordinates[0]
        );

        const segmentIndex = nearestPoint.properties.index;
        const t = nearestPoint.properties.location / length;

        return { closestPoint, segmentIndex, t };
    }

    /**
     * 创建覆盖末端半圆形的裁切矩形
     */
    private createClipRectangle(
        endPoint: number[],
        prevPoint: number[],
        bufferDistance: number,
        units: turf.Units = "meters"
    ): turf.Feature<turf.Polygon> {
        const lineBearing = turf.bearing(turf.point(prevPoint), turf.point(endPoint));

        const rectLength = bufferDistance * 2.5;
        const rectWidth = bufferDistance * 3;

        const centerPoint = turf.destination(turf.point(endPoint), rectLength / 2, lineBearing, {
            units
        });

        const halfLength = rectLength / 2;
        const halfWidth = rectWidth / 2;

        const p1 = turf.destination(
            turf.point(centerPoint.geometry.coordinates),
            halfLength,
            lineBearing,
            { units }
        );
        const p1Right = turf.destination(
            turf.point(p1.geometry.coordinates),
            halfWidth,
            (lineBearing + 90) % 360,
            { units }
        );

        const p2 = turf.destination(
            turf.point(p1.geometry.coordinates),
            halfWidth,
            (lineBearing - 90 + 360) % 360,
            { units }
        );

        const p3 = turf.destination(
            turf.point(centerPoint.geometry.coordinates),
            halfLength,
            (lineBearing + 180) % 360,
            { units }
        );
        const p3Left = turf.destination(
            turf.point(p3.geometry.coordinates),
            halfWidth,
            (lineBearing - 90 + 360) % 360,
            { units }
        );

        const p4 = turf.destination(
            turf.point(p3.geometry.coordinates),
            halfWidth,
            (lineBearing + 90) % 360,
            { units }
        );

        const rectCoords = [
            p1Right.geometry.coordinates,
            p2.geometry.coordinates,
            p3Left.geometry.coordinates,
            p4.geometry.coordinates,
            p1Right.geometry.coordinates
        ];

        return turf.polygon([rectCoords]);
    }

    /**
     * 创建带裁切末端的缓冲区
     */
    private createClippedBuffer(
        line: turf.Feature<turf.LineString>,
        bufferDistance: number,
        options: BufferOptions = {}
    ): turf.Feature<turf.Polygon> {
        const { units = "meters", steps = 8 } = options;

        const originalBuffer = turf.buffer(line, bufferDistance, { units, steps });
        const coords = line.geometry.coordinates;

        if (coords.length < 2) {
            return originalBuffer;
        }

        const startClipRect = this.createClipRectangle(coords[0], coords[1], bufferDistance, units);
        const endClipRect = this.createClipRectangle(
            coords[coords.length - 1],
            coords[coords.length - 2],
            bufferDistance,
            units
        );

        let result = turf.difference(originalBuffer, startClipRect);
        if (result) {
            result = turf.difference(result, endClipRect);
        }

        return (result as turf.Feature<turf.Polygon>) || originalBuffer;
    }

    /**
     * Main function: Generates 3D buffer around a line with height information
     * @param lineCoordinates - Input line coordinates with altitude
     * @param bufferRadius - Buffer radius in specified units
     * @param options - Buffer generation options (units, steps)
     * @returns Object containing 3D polygon coordinates and optional mesh geometry
     */
    public generate3DBuffer(
        lineCoordinates: GeoCoordinates[],
        bufferRadius: number,
        options?: BufferOptions
    ): GeoCoordinates[] {
        const turfLine = this.createTurfLineString(lineCoordinates);

        const buffered = this.createClippedBuffer(
            turfLine,
            bufferRadius * (options?.innerFactor || 1),
            {
                units: options?.units || "meters",
                steps: options?.steps || 8
            }
        );

        if (!buffered) {
            throw new Error("Failed to create buffer");
        }

        const bufferPolygon = buffered.geometry.coordinates[0];
        const bufferPointsLngLat = bufferPolygon.map(
            coord => [coord[0], coord[1]] as [number, number]
        );

        const bufferPoints3D: GeoCoordinates[] = [];

        for (let i = 0; i < bufferPointsLngLat.length; i++) {
            const pointLngLat = bufferPointsLngLat[i];
            const bufferPoint = new GeoCoordinates(pointLngLat[1], pointLngLat[0]);
            const { segmentIndex } = this.findClosestPointOnLine(bufferPoint, lineCoordinates);

            let height: number;
            if (segmentIndex >= 0 && segmentIndex < lineCoordinates.length - 1) {
                height = lineCoordinates[segmentIndex].altitude || 0;
            } else if (segmentIndex < 0) {
                height = lineCoordinates[0].altitude || 0;
            } else {
                height = lineCoordinates[lineCoordinates.length - 1].altitude || 0;
            }

            const point3D = new GeoCoordinates(pointLngLat[1], pointLngLat[0], height);

            bufferPoints3D.push(point3D);
        }

        return bufferPoints3D;
    }

    /**
     * Alternative method: Generates buffer without clipping (original behavior)
     * @param lineCoordinates - Input line coordinates with altitude
     * @param bufferRadius - Buffer radius in specified units
     * @param options - Buffer generation options
     * @returns 3D polygon coordinates without end clipping
     */
    public generate3DBufferWithoutClipping(
        lineCoordinates: GeoCoordinates[],
        bufferRadius: number,
        options?: BufferOptions
    ): GeoCoordinates[] {
        const turfLine = this.createTurfLineString(lineCoordinates);
        const buffered = turf.buffer(turfLine, bufferRadius * (options?.innerFactor || 1), {
            units: options?.units || "meters",
            steps: options?.steps || 8
        });

        const bufferPolygon = buffered.geometry.coordinates[0];
        const bufferPointsLngLat = bufferPolygon.map(
            coord => [coord[0], coord[1]] as [number, number]
        );

        const bufferPoints3D: GeoCoordinates[] = [];

        for (let i = 0; i < bufferPointsLngLat.length; i++) {
            const pointLngLat = bufferPointsLngLat[i];
            const bufferPoint = new GeoCoordinates(pointLngLat[1], pointLngLat[0]);
            const { segmentIndex } = this.findClosestPointOnLine(bufferPoint, lineCoordinates);

            let height: number;
            if (segmentIndex >= 0 && segmentIndex < lineCoordinates.length - 1) {
                height = lineCoordinates[segmentIndex].altitude || 0;
            } else if (segmentIndex < 0) {
                height = lineCoordinates[0].altitude || 0;
            } else {
                height = lineCoordinates[lineCoordinates.length - 1].altitude || 0;
            }

            const point3D = new GeoCoordinates(pointLngLat[1], pointLngLat[0], height);

            bufferPoints3D.push(point3D);
        }

        return bufferPoints3D;
    }
}
