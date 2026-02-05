/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import * as turf from "@turf/turf";
import earcut from "earcut";
import * as THREE from "three";

import { type GeometryResult } from "../core/types";
import { CoordinateUtils } from "./coordinate-utils";

export class GeometryUtils {
    static createPolygonGeometry(
        geoArea: GeoCoordinates[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): GeometryResult {
        const tileSpacePoints = geoArea.map(coord => {
            const tileSpace = CoordinateUtils.geoToTileSpace(coord, tileGeoBox, width, height);
            return new THREE.Vector2(tileSpace.x, tileSpace.y);
        });

        const box = new THREE.Box2();
        tileSpacePoints.forEach(point => {
            box.expandByPoint(point);
        });

        const min = box.min;
        const max = box.max;

        const center = box.getCenter(new THREE.Vector2());
        const position = new THREE.Vector2(center.x, center.y);

        const points = tileSpacePoints.map(point => {
            return new THREE.Vector3(point.x - position.x, point.y - position.y, 0);
        });

        try {
            points.pop();
            const indices = earcut(points.map(pos => [pos.x, pos.y]).flat());

            const geometry = new THREE.BufferGeometry();

            const positionArray = new Float32Array(points.flatMap(pos => [pos.x, pos.y, pos.z]));
            geometry.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));

            const uvArray = new Float32Array(
                points
                    .map(pos => {
                        const u = (pos.x + position.x - min.x) / (max.x - min.x);
                        const v = (pos.y + position.y - min.y) / (max.y - min.y);
                        return [u, v];
                    })
                    .flat()
            );
            geometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));

            const indexArray = new Uint32Array(indices.flat());
            geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));

            return { geometry, position: new THREE.Vector3(position.x, position.y, 0) };
        } catch (error) {
            console.error("Failed to create polygon geometry:", error);
            const geometry = new THREE.BufferGeometry();
            return { geometry, position: new THREE.Vector3(0, 0, 0) };
        }
    }

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

        const positionArray = new Float32Array(points.flatMap(p => [p.x, p.y, 0]));
        geometry.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));

        const uvArray = new Float32Array(
            points.flatMap(p => [(p.x + position.x) / width, (p.y + position.y) / height])
        );
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));

        geometry.setIndex([0, 1, 2, 0, 2, 3]);

        return { geometry, position: new THREE.Vector3(position.x, position.y, 0) };
    }

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
            return this.createPolygonGeometry(geoArea, tileGeoBox, width, height);
        } else {
            throw new Error("Unsupported geoArea type");
        }
    }
}
