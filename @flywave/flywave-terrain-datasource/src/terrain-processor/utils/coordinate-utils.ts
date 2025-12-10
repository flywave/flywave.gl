/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import { type GroundModificationPolygon } from "../../ground-modification-manager";
import { type GroundOverlayTexture } from "../../ground-overlay-provider/GroundOverlayTexture";

/**
 * Coordinate conversion utilities class
 */
export class CoordinateUtils {
    /**
     * Convert geographic coordinates to tile space coordinates
     */
    static geoToTileSpace(
        geoCoords: GeoCoordinates,
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): THREE.Vector2 {
        const lonRatio =
            (geoCoords.longitude - tileGeoBox.southWest.longitude) /
            (tileGeoBox.northEast.longitude - tileGeoBox.southWest.longitude);
        const latRatio =
            (geoCoords.latitude - tileGeoBox.southWest.latitude) /
            (tileGeoBox.northEast.latitude - tileGeoBox.southWest.latitude);

        return new THREE.Vector2(lonRatio * width, latRatio * height);
    }

    /**
     * Extract coordinates from different geometry types
     */
    static extractCoordinates(geoArea: GeoBox | GeoPolygon | GeoLineString): GeoCoordinates[] {
        if (geoArea instanceof GeoBox) {
            return [
                new GeoCoordinates(geoArea.southWest.latitude, geoArea.southWest.longitude),
                new GeoCoordinates(geoArea.southWest.latitude, geoArea.northEast.longitude),
                new GeoCoordinates(geoArea.northEast.latitude, geoArea.northEast.longitude),
                new GeoCoordinates(geoArea.northEast.latitude, geoArea.southWest.longitude),
                new GeoCoordinates(geoArea.southWest.latitude, geoArea.southWest.longitude) // Close polygon
            ];
        } else if (geoArea instanceof GeoPolygon) {
            return geoArea.coordinates.map(
                coord => new GeoCoordinates(coord.latitude, coord.longitude, coord.altitude)
            );
        } else if (geoArea instanceof GeoLineString) {
            // For line strings, return original coordinate points
            return geoArea.coordinates.map(
                coord => new GeoCoordinates(coord.latitude, coord.longitude, coord.altitude)
            );
        } else {
            // Backward compatibility: handle traditional coordinate arrays
            return geoArea as GeoCoordinates[];
        }
    }

    /**
     * Create bounding box for coordinate arrays
     */
    static createBoundingBoxForCoordinates(
        overlays: GroundOverlayTexture[] | GroundModificationPolygon[]
    ): GeoBox {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;

        // Iterate through all overlays to calculate bounding box
        for (const overlay of overlays) {
            const coordinates = this.extractCoordinates(overlay.geoArea);

            for (const coord of coordinates) {
                minLat = Math.min(minLat, coord.latitude);
                maxLat = Math.max(maxLat, coord.latitude);
                minLon = Math.min(minLon, coord.longitude);
                maxLon = Math.max(maxLon, coord.longitude);
            }
        }

        // If no valid coordinates are found, return a default GeoBox
        if (
            minLat === Infinity ||
            maxLat === -Infinity ||
            minLon === Infinity ||
            maxLon === -Infinity
        ) {
            return new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0));
        }

        // Create and return a GeoBox containing all coordinates
        return new GeoBox(new GeoCoordinates(minLat, minLon), new GeoCoordinates(maxLat, maxLon));
    }
}