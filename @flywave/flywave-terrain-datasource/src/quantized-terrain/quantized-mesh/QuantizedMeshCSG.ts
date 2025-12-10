/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type Projection,
    ConvertWebMercatorY,
    GeoCoordinates
} from "@flywave/flywave-geoutils";
import { BufferAttribute, BufferGeometry, MathUtils, Vector3 } from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

interface QuantizedAreaCliper {
    geoArea: GeoBox | GeoCoordinates[];
    topAltitude: number;
    bottomAltitude: number;
}

function clipTerrainMesh(
    quantizedAreaCliper: QuantizedAreaCliper[],
    geometry: BufferGeometry,
    projection: Projection,
    center: Vector3
): BufferGeometry {
    const brushVolume = makeFrustumGeoAreaToBspNode(quantizedAreaCliper, projection, center);
    const evaluator = new Evaluator();
    const targetBrush = new Brush(geometry);

    evaluator.attributes = ["position", "uv", "normal", "webMercatorY"];

    const subtraction = evaluator.evaluate(targetBrush, brushVolume, SUBTRACTION);

    return subtraction.geometry;
}

function makeFrustumGeoAreaToBspNode(
    quantizedAreaCliper: QuantizedAreaCliper[],
    projection: Projection,
    center: Vector3
): Brush {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const webMercatorY: number[] = [];

    let vertexCount = 0;

    // Process each FrustumGeoArea
    for (const frustumGeoArea of quantizedAreaCliper) {
        const { topAltitude, bottomAltitude, geoArea } = frustumGeoArea;

        // Create coordinates array
        const coordinates = Array.isArray(geoArea) ? geoArea : createCoordinatesFromGeoBox(geoArea);

        // Ensure coordinates are in counter-clockwise order for correct winding
        const orderedCoordinates = ensureCounterClockwiseOrder(coordinates);

        // Create top and bottom points
        const topPoints: Vector3[] = [];
        const bottomPoints: Vector3[] = [];

        // Calculate min/max for UV mapping
        let minLon = Number.MAX_VALUE;
        let maxLon = Number.MIN_VALUE;
        let minLat = Number.MAX_VALUE;
        let maxLat = Number.MIN_VALUE;

        for (const coord of orderedCoordinates) {
            minLon = Math.min(minLon, coord.longitude);
            maxLon = Math.max(maxLon, coord.longitude);
            minLat = Math.min(minLat, coord.latitude);
            maxLat = Math.max(maxLat, coord.latitude);
        }

        const convertWebMercatorY = new ConvertWebMercatorY(
            MathUtils.degToRad(minLat),
            MathUtils.degToRad(maxLat)
        );

        for (const coord of orderedCoordinates) {
            // Project points to world coordinates
            const worldPointTop = projection.projectPoint(
                new GeoCoordinates(coord.latitude, coord.longitude, topAltitude),
                new Vector3()
            );
            const worldPointBottom = projection.projectPoint(
                new GeoCoordinates(coord.latitude, coord.longitude, bottomAltitude),
                new Vector3()
            );

            // Translate to local coordinates
            worldPointTop.sub(center);
            worldPointBottom.sub(center);

            topPoints.push(worldPointTop);
            bottomPoints.push(worldPointBottom);

            // Calculate UV coordinates for top points
            const uTop = (coord.longitude - minLon) / (maxLon - minLon);
            const vTop = (coord.latitude - minLat) / (maxLat - minLat);
            uvs.push(uTop, vTop);

            // Calculate UV coordinates for bottom points
            const uBottom = (coord.longitude - minLon) / (maxLon - minLon);
            const vBottom = (coord.latitude - minLat) / (maxLat - minLat);
            uvs.push(uBottom, vBottom);

            webMercatorY.push(convertWebMercatorY.convert(coord.latitudeInRadians));
            webMercatorY.push(convertWebMercatorY.convert(coord.latitudeInRadians));
        }

        // Add top points to positions
        for (const point of topPoints) {
            positions.push(point.x, point.y, point.z);
        }

        // Add bottom points to positions
        for (const point of bottomPoints) {
            positions.push(point.x, point.y, point.z);
        }

        // Create top polygon indices
        for (let i = 1; i < topPoints.length - 1; i++) {
            indices.push(vertexCount, vertexCount + i, vertexCount + i + 1);
        }

        // Create bottom polygon indices (reverse order for correct normal)
        const bottomVertexCount = vertexCount + topPoints.length;
        for (let i = 1; i < bottomPoints.length - 1; i++) {
            indices.push(bottomVertexCount, bottomVertexCount + i + 1, bottomVertexCount + i);
        }

        // Create side polygons indices
        const totalPoints = topPoints.length;
        for (let i = 0; i < totalPoints; i++) {
            const nextIndex = (i + 1) % totalPoints;
            const topLeft = vertexCount + i;
            const topRight = vertexCount + nextIndex;
            const bottomLeft = bottomVertexCount + i;
            const bottomRight = bottomVertexCount + nextIndex;

            // First triangle
            indices.push(topLeft, bottomLeft, topRight);
            // Second triangle
            indices.push(topRight, bottomLeft, bottomRight);
        }

        vertexCount += topPoints.length + bottomPoints.length;
    }

    // Create BufferGeometry
    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute(
        "webMercatorY",
        new BufferAttribute(new Float32Array(webMercatorY), 1, false)
    );
    geometry.computeVertexNormals();

    // Create and return Brush
    return new Brush(geometry);
}

/**
 * Ensures coordinates are in counter-clockwise order for correct winding
 */
function ensureCounterClockwiseOrder(coordinates: GeoCoordinates[]): GeoCoordinates[] {
    if (coordinates.length < 3) return coordinates;

    // Calculate polygon area to determine winding order
    let area = 0;
    for (let i = 0; i < coordinates.length; i++) {
        const j = (i + 1) % coordinates.length;
        area += coordinates[i].longitude * coordinates[j].latitude;
        area -= coordinates[j].longitude * coordinates[i].latitude;
    }

    // If area is positive, it's clockwise, so reverse
    if (area <= 0) {
        return [...coordinates].reverse();
    }

    return coordinates;
}

// Helper function to create coordinates from GeoBox
function createCoordinatesFromGeoBox(geoBox: GeoBox): GeoCoordinates[] {
    const { southWest, northEast } = geoBox;

    return [
        new GeoCoordinates(southWest.latitude, southWest.longitude),
        new GeoCoordinates(northEast.latitude, southWest.longitude),
        new GeoCoordinates(northEast.latitude, northEast.longitude),
        new GeoCoordinates(southWest.latitude, northEast.longitude),
        new GeoCoordinates(southWest.latitude, southWest.longitude) // Close the polygon
    ];
}

// 导出函数供外部使用
export { clipTerrainMesh, type QuantizedAreaCliper };
