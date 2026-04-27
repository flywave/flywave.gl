import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { type GroundModificationPolygon } from "../../ground-modification-manager";
import { type GroundOverlayTexture } from "../../ground-overlay-provider/GroundOverlayTexture";
/**
 * Coordinate conversion utilities class
 */
export declare class CoordinateUtils {
    /**
     * Convert geographic coordinates to tile space coordinates
     */
    static geoToTileSpace(geoCoords: GeoCoordinates, tileGeoBox: GeoBox, width: number, height: number): THREE.Vector2;
    /**
     * Extract coordinates from different geometry types
     */
    static extractCoordinates(geoArea: GeoBox | GeoPolygon | GeoLineString): GeoCoordinates[];
    /**
     * Create bounding box for coordinate arrays
     */
    static createBoundingBoxForCoordinates(overlays: GroundOverlayTexture[] | GroundModificationPolygon[]): GeoBox;
}
