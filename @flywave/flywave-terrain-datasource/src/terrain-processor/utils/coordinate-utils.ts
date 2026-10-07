/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type GeoCoordinates,
    type GeoLineString,
    type GeoPolygon
} from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

export class CoordinateUtils {
    static geoToTileSpace(
        coord: GeoCoordinates,
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): THREE.Vector3 {
        const lonRatio = (coord.longitude - tileGeoBox.west) / tileGeoBox.longitudeSpan;
        const latRatio = (coord.latitude - tileGeoBox.south) / tileGeoBox.latitudeSpan;
        return new THREE.Vector3(lonRatio * width, latRatio * height, 0);
    }

    static extractCoordinates(geoArea: GeoPolygon | GeoLineString): GeoCoordinates[] {
        return geoArea.coordinates as GeoCoordinates[];
    }
}
