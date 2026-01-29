/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, EarthConstants } from "@flywave/flywave-geoutils";
import * as THREE from "three";

export class GeoDistanceUtils {
    private static readonly R = EarthConstants.EQUATORIAL_RADIUS;

    private static degToRad(deg: number): number {
        return deg * (Math.PI / 180);
    }

    private static radToDeg(rad: number): number {
        return rad * (180 / Math.PI);
    }

    static getMetersPerDegreeLongitude(latitude: number): number {
        const rad = this.degToRad(latitude);
        return (Math.PI / 180) * this.R * Math.cos(rad);
    }

    static getMetersPerDegreeLatitude(latitude: number): number {
        const rad = this.degToRad(latitude);
        return (Math.PI / 180) * this.R;
    }

    static metersToLongitudeDegrees(meters: number, latitude: number): number {
        const metersPerDeg = this.getMetersPerDegreeLongitude(latitude);
        return this.radToDeg(meters / this.R) / Math.cos(this.degToRad(latitude));
    }

    static metersToLatitudeDegrees(meters: number): number {
        return this.radToDeg(meters / this.R);
    }

    static getPixelsPerMeter(
        geoBox: GeoBox,
        width: number,
        height: number
    ): {
        x: number;
        y: number;
        centerX: number;
        centerY: number;
    } {
        const centerLat = (geoBox.southWest.latitude + geoBox.northEast.latitude) / 2;
        const centerLon = (geoBox.southWest.longitude + geoBox.northEast.longitude) / 2;

        const metersPerLonDeg = this.getMetersPerDegreeLongitude(centerLat);
        const metersPerLatDeg = this.getMetersPerDegreeLatitude(centerLat);

        const lonExtent = geoBox.northEast.longitude - geoBox.southWest.longitude;
        const latExtent = geoBox.northEast.latitude - geoBox.southWest.latitude;

        const boxWidthMeters = lonExtent * metersPerLonDeg;
        const boxHeightMeters = latExtent * metersPerLatDeg;

        const pixelsPerMeterX = boxWidthMeters > 0 ? width / boxWidthMeters : 0;
        const pixelsPerMeterY = boxHeightMeters > 0 ? height / boxHeightMeters : 0;

        return {
            x: pixelsPerMeterX,
            y: pixelsPerMeterY,
            centerX: centerLat,
            centerY: centerLon
        };
    }

    static metersToPixels(
        meters: number,
        geoBox: GeoBox,
        width: number,
        height: number
    ): { xPixels: number; yPixels: number } {
        const { x: pixelsPerMeterX, y: pixelsPerMeterY } = this.getPixelsPerMeter(
            geoBox,
            width,
            height
        );

        return {
            xPixels: meters * pixelsPerMeterX,
            yPixels: meters * pixelsPerMeterY
        };
    }
}
