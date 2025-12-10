/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import * as turf from "@turf/turf";
import earcut from "earcut";
import * as THREE from "three";

import { type GroundModificationPolygon } from "../../ground-modification-manager";
import { type GeometryResult } from "../core/types";
import { CoordinateUtils } from "./coordinate-utils";

/**
 * Geometry creation utilities class
 */
export class GeometryUtils {
    /**
     * Create BufferGeometry for polygon areas
     */
    static createPolygonGeometry(
        geoArea: GeoCoordinates[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): GeometryResult {
        // First convert all coordinates to tile space to ensure consistent coordinate system
        const tileSpacePoints = geoArea.map(coord => {
            const tileSpace = CoordinateUtils.geoToTileSpace(coord, tileGeoBox, width, height);
            return new THREE.Vector2(tileSpace.x, tileSpace.y);
        });

        // Calculate bounding box using tile space coordinates
        const box = new THREE.Box2();
        tileSpacePoints.forEach(point => {
            box.expandByPoint(point);
        });

        // Get minimum and maximum coordinates of the bounding box
        const min = box.min;
        const max = box.max;

        // Use bounding box center as position reference point
        const center = box.getCenter(new THREE.Vector2());
        const position = new THREE.Vector2(center.x, center.y);

        // Calculate local coordinates relative to the center point
        const points = tileSpacePoints.map(point => {
            return new THREE.Vector3(point.x - position.x, point.y - position.y, 0);
        });

        try {
            points.pop();
            const indices = earcut(points.map(pos => [pos.x, pos.y]).flat());

            const geometry = new THREE.BufferGeometry();

            // Set positions
            const positionArray = new Float32Array(points.flatMap(pos => [pos.x, pos.y, pos.z]));
            geometry.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));

            // Calculate UV coordinates using bounding box to ensure calculation in consistent coordinate system
            const uvArray = new Float32Array(
                points
                    .map(pos => {
                        // Convert local coordinates to normalized coordinates within the bounding box
                        const u = (pos.x + position.x - min.x) / (max.x - min.x);
                        const v = (pos.y + position.y - min.y) / (max.y - min.y);
                        return [u, v];
                    })
                    .flat()
            );
            geometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));

            // Set indices
            const indexArray = new Uint32Array(indices.flat());
            geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));

            return { geometry, position: new THREE.Vector3(position.x, position.y, 0) };
        } catch (error) {
            console.error("Failed to create polygon geometry:", error);
            // Return an empty geometry as fallback
            const geometry = new THREE.BufferGeometry();
            return { geometry, position: new THREE.Vector3(0, 0, 0) };
        }
    }

    /**
     * Create BufferGeometry for GeoBox areas
     */
    static createBoxGeometry(
        geoBox: GeoBox,
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): GeometryResult {
        const corners = [
            new GeoCoordinates(geoBox.southWest.latitude, geoBox.southWest.longitude),
            new GeoCoordinates(geoBox.southWest.latitude, geoBox.northEast.longitude),
            new GeoCoordinates(geoBox.northEast.latitude, geoBox.northEast.longitude),
            new GeoCoordinates(geoBox.northEast.latitude, geoBox.southWest.longitude)
        ];

        const position = CoordinateUtils.geoToTileSpace(geoBox.center, tileGeoBox, width, height);
        const points = corners.map(coord => {
            const tileSpace = CoordinateUtils.geoToTileSpace(coord, tileGeoBox, width, height).sub(
                position
            );
            return new THREE.Vector3(tileSpace.x, tileSpace.y, 0);
        });

        const geometry = new THREE.BufferGeometry();

        // Set positions
        const positionArray = new Float32Array(points.flatMap(p => [p.x, p.y, 0]));
        geometry.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));

        // Set UVs (normalized)
        const uvArray = new Float32Array(
            points.flatMap(p => [(p.x + position.x) / width, (p.y + position.y) / height])
        );
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));

        // Set indices (two triangles forming a quadrilateral)
        geometry.setIndex([0, 1, 2, 0, 2, 3]);

        return { geometry, position: new THREE.Vector3(position.x, position.y, 0) };
    }

    /**
     * Create geometries for different geographic area types
     */
    static createGeometryForGeoArea(
        geoArea: GeoBox | GeoPolygon | GeoLineString | GeoCoordinates[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): GeometryResult {
        if (geoArea instanceof GeoBox) {
            return this.createBoxGeometry(geoArea, tileGeoBox, width, height);
        } else if (geoArea instanceof GeoPolygon) {
            const coords = CoordinateUtils.extractCoordinates(geoArea);
            return this.createPolygonGeometry(coords, tileGeoBox, width, height);
        } else if (geoArea instanceof GeoLineString) {
            const polygon = geoArea.toPolygon();
            return this.createPolygonGeometry(
                CoordinateUtils.extractCoordinates(polygon),
                tileGeoBox,
                width,
                height
            );
        } else if (Array.isArray(geoArea)) {
            // Backward compatibility: handle traditional coordinate arrays
            return this.createPolygonGeometry(geoArea, tileGeoBox, width, height);
        } else {
            throw new Error("Unsupported geoArea type");
        }
    }

    /**
     * Create geometries with precise height attributes
     */
    static createGeoAreaShape(
        groundModificationPolygon: GroundModificationPolygon
    ): GeoCoordinates[] {
        const geoArea = groundModificationPolygon.geoArea;
        // For geometry types, need to recreate geometry to preserve height information
        let coordinates: GeoCoordinates[];

        if (geoArea instanceof GeoPolygon) {
            coordinates = geoArea.coordinates.map(
                coord => new GeoCoordinates(coord.latitude, coord.longitude, coord.altitude)
            );
        } else if (geoArea instanceof GeoLineString) {
            const polygon = geoArea.toPolygon();
            coordinates =
                polygon?.coordinates.map(
                    coord => new GeoCoordinates(coord.latitude, coord.longitude, coord.altitude)
                ) || [];
        } else if (geoArea instanceof GeoBox) {
            coordinates = [
                new GeoCoordinates(
                    geoArea.southWest.latitude,
                    geoArea.southWest.longitude,
                    geoArea.southWest.altitude
                ),
                new GeoCoordinates(
                    geoArea.southWest.latitude,
                    geoArea.northEast.longitude,
                    geoArea.southWest.altitude
                ),
                new GeoCoordinates(
                    geoArea.northEast.latitude,
                    geoArea.northEast.longitude,
                    geoArea.northEast.altitude
                ),
                new GeoCoordinates(
                    geoArea.northEast.latitude,
                    geoArea.southWest.longitude,
                    geoArea.northEast.altitude
                )
            ];
        } else {
            coordinates = geoArea as GeoCoordinates[];
        }

        return coordinates;
    }
}