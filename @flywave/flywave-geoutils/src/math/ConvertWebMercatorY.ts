/* Copyright (C) 2025 flywave.gl contributors */

import { MercatorConstants } from "../projection/MercatorProjection";

function geodeticLatitudeToMercatorAngle(latitude: number) {
    // Clamp the latitude coordinate to the valid Mercator bounds.
    if (latitude > MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = MercatorConstants.MAXIMUM_LATITUDE;
    } else if (latitude < -MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = -MercatorConstants.MAXIMUM_LATITUDE;
    }
    const sinLatitude = Math.sin(latitude);
    return 0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
}

export class ConvertWebMercatorY {
    private readonly southMercatorY: number;
    private readonly oneOverMercatorHeight: number;
    constructor(private readonly minLat: number, private readonly maxLat: number) {
        this.southMercatorY = geodeticLatitudeToMercatorAngle(minLat);
        this.oneOverMercatorHeight =
            1.0 / (geodeticLatitudeToMercatorAngle(maxLat) - this.southMercatorY);
    }

    convert(latitudeInRadians: number) {
        return (
            (geodeticLatitudeToMercatorAngle(latitudeInRadians) - this.southMercatorY) *
            this.oneOverMercatorHeight
        );
    }
}
