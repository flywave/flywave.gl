import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import { type GroundModificationPolygon } from "../../ground-modification-manager";
import { type GeometryResult } from "../core/types";
/**
 * Geometry creation utilities class
 */
export declare class GeometryUtils {
    /**
     * Create BufferGeometry for polygon areas
     */
    static createPolygonGeometry(geoArea: GeoCoordinates[], tileGeoBox: GeoBox, width: number, height: number): GeometryResult;
    /**
     * Create BufferGeometry for GeoBox areas
     */
    static createBoxGeometry(geoBox: GeoBox, tileGeoBox: GeoBox, width: number, height: number): GeometryResult;
    /**
     * Create geometries for different geographic area types
     */
    static createGeometryForGeoArea(geoArea: GeoBox | GeoPolygon | GeoLineString | GeoCoordinates[], tileGeoBox: GeoBox, width: number, height: number): GeometryResult;
    /**
     * Create geometries with precise height attributes
     */
    static createGeoAreaShape(groundModificationPolygon: GroundModificationPolygon): GeoCoordinates[];
}
