/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates, GeoPolygon, mercatorProjection } from "@flywave/flywave-geoutils";
import * as turf from "@turf/turf";
import { makeCCW, quickDecomp } from "poly-decomp-es";
import { ELEMENT, tesselate, WINDING } from "tess2-ts";
import * as THREE from "three";
import earcut from "earcut";

// Define Point and Polygon types to match definitions in PolygonDecomposer
type Point = [number, number];
// Define point type with original coordinates
type PointWithGeo = [number, number, GeoCoordinates];

export function triangulate(
    polygon: THREE.Vector3[],
    holes?: THREE.Vector3[][]
): {
    positions: THREE.Vector3[];
    indices: number[];
    originalVertexIndices: number[];
} {
    const contours = [polygon.map(p => p.toArray()).flat()];
    if (holes) {
        contours.push(...holes.map(h => h.map(p => p.toArray())).flat());
    }
    const result = tesselate({
        contours,
        windingRule: WINDING.NONZERO,
        elementType: ELEMENT.POLYGONS,
        polySize: 3,
        vertexSize: 3
    });

    const vertexs: THREE.Vector3[] = [];

    for (let i = 0; i < result.vertexCount; i++) {
        vertexs.push(new THREE.Vector3().fromArray(result.vertices, i * 3));
    }

    return {
        positions: vertexs,
        indices: result.elements,
        originalVertexIndices: result.vertexIndices
    };
}

/**
 * Use earcut algorithm to triangulate a THREE.Vector3 polygon
 * @param polygon The polygon vertices to triangulate
 * @param holes Holes vertices array (optional)
 * @returns Object containing vertices and indices
 */
export function triangulateWithEarcut(
    polygon: THREE.Vector3[],
    holes?: THREE.Vector3[][]
): {
    positions: THREE.Vector3[];
    indices: number[];
    originalVertexIndices: number[];
} {
    // Handle empty array case
    if (polygon.length < 3) {
        return {
            positions: [],
            indices: [],
            originalVertexIndices: []
        };
    }

    // Convert THREE.Vector3 array to format required by earcut (flatten array)
    const vertices: number[] = [];
    const holeIndices: number[] = [];

    // Add outer contour vertices
    for (const vertex of polygon) {
        vertices.push(vertex.x, vertex.y);
    }

    // If there are holes, add hole vertices and record indices
    if (holes) {
        let currentIndex = polygon.length;
        for (const hole of holes) {
            holeIndices.push(currentIndex);
            for (const vertex of hole) {
                vertices.push(vertex.x, vertex.y);
            }
            currentIndex += hole.length;
        }
    }

    // Use earcut for triangulation
    const indices = earcut(vertices, holeIndices, 2);

    // Return result, maintaining the same interface as the original triangulate function
    return {
        positions: [...polygon, ...(holes ? holes.flat() : [])],
        indices: indices,
        originalVertexIndices: Array.from({ length: polygon.length + (holes ? holes.flat().length : 0) }, (_, i) => i)
    };
}

/**
 * Use turf.tin algorithm to triangulate a GeoCoordinates polygon
 * @param geoPolygon GeoCoordinates polygon
 * @returns Object containing vertices and indices
 */
export function triangulateGeoCoordinatesPolygons(geoPolygon: GeoCoordinates[]): {
    positions: GeoCoordinates[];
    indices: number[];
} {
    // Handle empty array case
    if (geoPolygon.length === 0) {
        return {
            positions: [],
            indices: []
        };
    }

    // 1. Use Mercator projection to convert GeoPolygon to local coordinates
    const geoCenter = geoPolygon[0];
    const center = mercatorProjection.projectPoint(geoCenter);

    // Calculate bounding box
    const projectedPoints: PointWithGeo[] = [];

    for (const coord of geoPolygon) {
        const worldPoint = mercatorProjection.projectPoint(coord);
        const x = worldPoint.x - center.x;
        const y = worldPoint.y - center.y;
        projectedPoints.push([x, y, coord]);
    }

    makeCCW(projectedPoints as unknown as Point[]);

    const decomposedPolygons: Point[][] = quickDecomp(projectedPoints as unknown as Point[]);

    // 4. Use turf.tin to triangulate each decomposed convex polygon
    const allPositions: GeoCoordinates[] = [];
    const allIndices: number[] = [];

    // Create vertex mapping for each decomposed polygon to avoid duplicate vertices
    const vertexMap = new Map<string, number>();

    for (const polygon of decomposedPolygons) {
        // Construct point feature collection required by turf.js
        // According to your prompt, the points in polygon already contain the third value as original coordinates
        const pointsFeatures: Array<turf.Feature<turf.Point>> = [];

        for (const point of polygon) {
            // The third value is the original GeoCoordinates
            const originalCoord = (point as unknown as [number, number, GeoCoordinates])[2];
            pointsFeatures.push(
                turf.point([originalCoord.longitude, originalCoord.latitude], {
                    z: originalCoord.altitude
                })
            );
        }

        // Only triangulate when there are enough points (at least 3 points)
        if (pointsFeatures.length >= 3) {
            // Use turf.tin to triangulate a single convex polygon
            try {
                const tinResult = turf.tin(turf.featureCollection(pointsFeatures), "z");

                // Process each triangle in tinResult
                for (const feature of tinResult.features) {
                    const { a, b, c } = feature.properties;
                    const coords = feature.geometry.coordinates[0]; // Get the outer ring coordinates of the polygon
                    const height = [a, b, c, a];
                    // Add vertices (deduplication)
                    for (let i = 0; i < coords.length - 1; i++) {
                        // coords is a closed ring, the last point is the same as the first point
                        const coord = coords[i];
                        const key = `${coord[0]},${coord[1]},${height[i] || 0}`;

                        if (!vertexMap.has(key)) {
                            // Create new GeoCoordinates
                            const geoCoord = new GeoCoordinates(coord[1], coord[0], height[i] || 0);
                            vertexMap.set(key, allPositions.length);
                            allPositions.push(geoCoord);
                        }

                        // Add index
                        allIndices.push(vertexMap.get(key)!);
                    }
                }
            } catch (error) {
                // If tin fails, skip this polygon
                console.warn("TIN triangulation failed for a polygon:", error);
            }
        }
    }

    return {
        positions: allPositions,
        indices: allIndices
    };
}
