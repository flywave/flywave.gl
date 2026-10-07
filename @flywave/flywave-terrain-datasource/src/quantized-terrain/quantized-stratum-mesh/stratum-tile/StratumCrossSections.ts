/* Copyright (C) 2025 flywave.gl contributors */

import { triangulate, weilerAthertonClip } from "@flywave/flywave-geometry";
import {
    type GeoCoordinates,
    type GeoCoordinatesLike,
    OrientedBox3
} from "@flywave/flywave-geoutils";
import { FlatArray } from "@flywave/flywave-utils";
import { Box3, BufferAttribute, BufferGeometry, Vector2, Vector3 } from "three/webgpu";

import { type CollapseProfile, type StratumProfile } from "./CrossSectionUtils";
import { type StratumLayer } from "./StratumLayer";
import { type StratumTileData } from "./StratumTileData";

interface ProjectionMatrix {
    origin: Vector3;
    xAxis: Vector3;
    yAxis: Vector3;
    normal: Vector3;
}

export class StratumCrossSections {
    constructor(private readonly stratumMeshData: StratumTileData) {}

    public generateCrossSections(
        cutLines: GeoCoordinatesLike[][],
        upDir?: Vector3
    ): Array<{
        stratumProfiles: StratumProfile[];
        collapseProfiles: CollapseProfile[];
        line: GeoCoordinatesLike[];
    }> {
        // Default upDir to (0, 0, 1) when not provided
        const upDirection = upDir || new Vector3(0, 0, 1);

        const localLines = cutLines.map(line =>
            line.map(pt => this.stratumMeshData.projectGeoToLocal(pt, new Vector3()))
        );

        const _collapsePillars = this.stratumMeshData.createCollapsePillars();
        const _stratumLayers = this.stratumMeshData.createStratumLayers();

        // Phase 1: collect all local-coordinate results
        const rawResults = localLines.map((line, lineIndex) => {
            const stratumProfiles: StratumProfile[] = [];
            const collapseProfiles: CollapseProfile[] = [];

            // 1. Process collapse pillar profiles (local coordinates)
            _collapsePillars.forEach(collapse => {
                const result = collapse.generateCrossSections(
                    [
                        new Vector3(line[0].x, line[0].y, line[0].z),
                        new Vector3(line[1].x, line[1].y, line[1].z)
                    ],
                    upDirection.clone()
                );
                if (!result) return;

                const geometry = new BufferGeometry();
                geometry.setAttribute(
                    "position",
                    new BufferAttribute(
                        new Float32Array(result.positions.flatMap(p => [p.x, p.y, p.z])),
                        3
                    )
                );
                geometry.setIndex(new BufferAttribute(new Uint32Array(result.indices.flat()), 1));

                collapseProfiles.push({
                    collapseID: collapse.id,
                    crossSections: [geometry],
                    polys: [result.positions.map(p => new Vector3(p.x, p.y, p.z))],
                    material: collapse.material
                });
            });

            // 2. Process stratum profiles (local coordinates)
            const lineStart = new Vector3(line[0].x, line[0].y, line[0].z);
            const lineEnd = new Vector3(line[1].x, line[1].y, line[1].z);

            _stratumLayers.forEach(layer => {
                const stratumProfile: StratumProfile = {
                    stratumID: layer.id,
                    top: [],
                    base: [],
                    crossSections: [],
                    polys: [],
                    material: layer.material
                };

                layer.voxels.forEach(voxel => {
                    // Generate roof/floor data (local coordinates)
                    const topPoints = this.processTriangles(voxel.getTopTriangles(), [
                        lineStart,
                        lineEnd
                    ]);
                    const basePoints = this.processTriangles(voxel.getBaseTriangles(), [
                        lineStart,
                        lineEnd
                    ]);

                    stratumProfile.top.push(...topPoints);
                    stratumProfile.base.push(...basePoints);

                    // Generate the profile mesh (local coordinates)
                    const { meshes, polys } = this.generateStratumMesh(
                        this.sortPointsAlongLine(topPoints, [lineStart, lineEnd], upDirection),
                        this.sortPointsAlongLine(basePoints, [lineStart, lineEnd], upDirection),
                        new Vector3().subVectors(lineEnd, lineStart).normalize(),
                        collapseProfiles,
                        upDirection
                    );

                    stratumProfile.crossSections.push(...meshes);
                    stratumProfile.polys.push(...polys);
                });

                if (stratumProfile.crossSections.length > 0) {
                    stratumProfiles.push(stratumProfile);
                }
            });

            return {
                line: cutLines[lineIndex],
                stratumProfiles,
                collapseProfiles
            };
        });

        return rawResults;
    }

    private processTriangles(triangles: Float32Array, line: Vector3[]): Vector3[] {
        // Convert triangle data to array of THREE.Vector3 arrays
        const triVectors: Vector3[][] = [];
        for (let i = 0; i < triangles.length; i += 9) {
            const tri = [
                new Vector3(triangles[i], triangles[i + 1], triangles[i + 2]),
                new Vector3(triangles[i + 3], triangles[i + 4], triangles[i + 5]),
                new Vector3(triangles[i + 6], triangles[i + 7], triangles[i + 8])
            ];
            triVectors.push(tri);
        }

        const lineStart = line[0];
        const lineEnd = line[1];
        const result: Vector3[] = [];

        // Check intersection with each triangle
        triVectors.forEach(tri => {
            const intersects = this.lineTriangleIntersection(lineStart, lineEnd, tri);
            if (intersects.length > 0) {
                result.push(...intersects);
            }
        });

        return result;
    }

    private projectPointToSegment(pt: Vector3, a: Vector3, b: Vector3): [Vector3, number] {
        const ab = new Vector3().subVectors(b, a);
        const ap = new Vector3().subVectors(pt, a);
        const abSqrLen = ab.lengthSq();

        // Handle zero-length segment
        if (abSqrLen < 1e-16) return [a.clone(), 0];

        const t = Math.max(0, Math.min(1, ap.dot(ab) / abSqrLen));
        const scaledAB = ab.clone().multiplyScalar(t);
        return [a.clone().add(scaledAB), t];
    }

    private lineTriangleIntersection(
        lineStart: Vector3,
        lineEnd: Vector3,
        triangle: Vector3[]
    ): Vector3[] {
        const epsilon = 1e-6;

        // Calculate triangle edges
        const edge1 = new Vector3().subVectors(triangle[1], triangle[0]);
        const edge2 = new Vector3().subVectors(triangle[2], triangle[0]);

        // Calculate ray direction
        const rayDir = new Vector3().subVectors(lineEnd, lineStart);

        // Calculate determinant
        const h = new Vector3().crossVectors(rayDir, edge2);
        const det = edge1.dot(h);

        // Check if ray is parallel to triangle
        if (Math.abs(det) < epsilon) return [];

        const invDet = 1.0 / det;
        const s = new Vector3().subVectors(lineStart, triangle[0]);

        // Calculate u parameter and test bounds
        const u = invDet * s.dot(h);
        if (u < 0.0 || u > 1.0) return [];

        // Calculate q vector and v parameter
        const q = new Vector3().crossVectors(s, edge1);
        const v = invDet * rayDir.dot(q);
        if (v < 0.0 || u + v > 1.0) return [];

        // Calculate t parameter
        const t = invDet * edge2.dot(q);

        // Check if intersection is within line segment
        if (t > epsilon && t < 1.0 + epsilon) {
            // Return interpolated intersection point
            return [new Vector3().lerpVectors(lineStart, lineEnd, t)];
        }

        return [];
    }

    // Core geological cross-section generation method
    private generateStratumMesh(
        top: Vector3[],
        base: Vector3[],
        lineDir: Vector3,
        collapseProfiles: CollapseProfile[],
        upDir: Vector3 // added upDir parameter
    ): { meshes: BufferGeometry[]; polys: Vector3[][] } {
        const meshes: BufferGeometry[] = [];
        const polys: Vector3[][] = [];

        if (top.length < 2) return { meshes, polys };

        // Split into continuous segments (handle pinch-outs)
        const segments = this.splitContinuousSegments(top, base);

        for (const seg of segments) {
            if (seg.top.length < 2) continue;

            // Build the stratum polygon (roof + reversed floor)
            const polygon = [...seg.top, ...[...seg.base].reverse()];

            // upDir is used when computing the projection matrix
            const matrix = this.calculateProjectionMatrixForSection(polygon, lineDir, upDir);
            if (!matrix) {
                continue;
            }

            // Triangulate
            const subMesh = this.buildTriangulateMesh(polygon);
            if (subMesh) {
                meshes.push(subMesh);
                polys.push(polygon);
            }
        }

        // Cut the profiles with collapse pillars
        const finalMeshes: BufferGeometry[] = [];
        for (let i = 0; i < meshes.length; i++) {
            const polygon = polys[i];

            // Recompute the projection matrix (using upDir)
            const matrix = this.calculateProjectionMatrixForSection(polygon, lineDir, upDir);
            if (!matrix) {
                finalMeshes.push(meshes[i]);
                continue;
            }

            const relevantCollapses = this.queryRelevantCollapses(polygon, collapseProfiles);
            if (relevantCollapses.length === 0) {
                finalMeshes.push(meshes[i]);
                continue;
            }

            // Process each relevant collapse pillar
            for (const collapse of relevantCollapses) {
                for (const collapsePoly of collapse.polys) {
                    try {
                        const newMeshes = this.cutProfiles(polygon, collapsePoly, matrix);
                        finalMeshes.push(...newMeshes);
                    } catch (e) {
                        finalMeshes.push(meshes[i]);
                    }
                }
            }

            // Keep the uncut remainder (if valid)
            const positionAttr = meshes[i].getAttribute("position");
            if (positionAttr && positionAttr.count > 2) {
                finalMeshes.push(meshes[i]);
            }
        }

        return { meshes: finalMeshes, polys };
    }

    // Compute the projection matrix for a profile (uses upDir)
    private calculateProjectionMatrixForSection(
        poly: Vector3[],
        lineDir: Vector3,
        upDir: Vector3
    ): ProjectionMatrix | null {
        if (poly.length < 3) return null;

        // Use upDir as the primary reference direction
        const normal = this.computePolygonNormal(poly);

        // Keep the x axis aligned with the line direction
        const xAxis = lineDir.clone().projectOnPlane(normal).normalize();
        if (xAxis.length() < 0.001) {
            xAxis.set(1, 0, 0).projectOnPlane(normal).normalize();
        }

        // Keep the y axis aligned with the up direction
        let yAxis = upDir.clone().projectOnPlane(normal).normalize();
        if (yAxis.length() < 0.001) {
            yAxis = new Vector3().crossVectors(normal, xAxis).normalize();
        }

        // Orthogonalize
        const correction = yAxis.clone().projectOnVector(xAxis);
        yAxis.sub(correction).normalize();

        return { origin: poly[0], xAxis, yAxis, normal };
    }

    // Point sorting along the line (uses upDir)
    private sortPointsAlongLine(
        points: Vector3[],
        line: Vector3[],
        upDir: Vector3 // added upDir parameter
    ): Vector3[] {
        interface ParamPoint {
            totalDist: number;
            point: Vector3;
        }

        const paramPoints: ParamPoint[] = [];
        const segDists: number[] = [0];

        // Compute segment lengths
        for (let i = 1; i < line.length; i++) {
            segDists.push(segDists[i - 1] + line[i].distanceTo(line[i - 1]));
        }

        // Compute the parameter value for each point
        for (const pt of points) {
            let minDist = Infinity;
            let bestSegmentIndex = 0;
            let bestParam = 0;
            let accumDist = 0;

            // Find the closest segment
            for (let i = 1; i < line.length; i++) {
                const segStart = line[i - 1];
                const segEnd = line[i];
                const [proj, t] = this.projectPointToSegment(pt, segStart, segEnd);

                const d = pt.distanceTo(proj);
                if (d < minDist) {
                    minDist = d;
                    bestSegmentIndex = i - 1;
                    bestParam = t;
                    const segLen = segDists[i] - segDists[i - 1];
                    accumDist = segDists[bestSegmentIndex] + bestParam * segLen;
                }
            }

            // Add a vertical offset (using upDir)
            if (minDist < Infinity) {
                const verticalOffset = pt.clone().sub(line[0]).dot(upDir);
                accumDist += verticalOffset * 0.001; // small weight so it barely affects the primary ordering
                paramPoints.push({ totalDist: accumDist, point: pt });
            }
        }

        // Sort by accumulated distance
        paramPoints.sort((a, b) => a.totalDist - b.totalDist);

        return paramPoints.map(pp => pp.point);
    }

    // Spatial query helper
    private queryRelevantCollapses(
        poly: Vector3[],
        allCollapses: CollapseProfile[]
    ): CollapseProfile[] {
        const polyBounds = this.calculate3DBounds(poly);
        return allCollapses.filter(collapse =>
            collapse.polys.some(cp => this.boundsIntersect(polyBounds, this.calculate3DBounds(cp)))
        );
    }

    // 3D bounding box calculation
    private calculate3DBounds(poly: Vector3[]): Box3 {
        const box = new Box3();
        poly.forEach(v => box.expandByPoint(v));
        return box;
    }

    // Continuous segment splitting - pinch-out detection
    private splitContinuousSegments(
        top: Vector3[],
        base: Vector3[]
    ): Array<{ top: Vector3[]; base: Vector3[] }> {
        const segments: Array<{ top: Vector3[]; base: Vector3[] }> = [];
        const thicknessThreshold = 1e-5;
        let start = 0;
        let prevIsPinch = false;

        for (let i = 1; i < top.length; i++) {
            const thickness = top[i].distanceTo(base[i]);

            // Detect pinch-out or end point
            if (thickness < thicknessThreshold || i === top.length - 1) {
                if (i - start >= 1 && !prevIsPinch) {
                    segments.push({
                        top: top.slice(start, i + 1),
                        base: base.slice(start, i + 1)
                    });
                    start = i;
                    prevIsPinch = true;
                } else {
                    start = i;
                }
                continue;
            }
            prevIsPinch = false;
        }

        return segments;
    }

    // Polygon normal computation
    private computePolygonNormal(poly: Vector3[]): Vector3 {
        const normal = new Vector3();
        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];
            normal.x += (current.y - next.y) * (current.z + next.z);
            normal.y += (current.z - next.z) * (current.x + next.x);
            normal.z += (current.x - next.x) * (current.y + next.y);
        }
        return normal.normalize();
    }

    // Core profile-cutting method
    private cutProfiles(
        stratumPoly: Vector3[],
        collapsePoly: Vector3[],
        matrix: ProjectionMatrix
    ): BufferGeometry[] {
        // Enforce vertex winding order
        const orientedStratum = this.ensureClockwiseOrder(stratumPoly);
        const orientedCollapse = this.ensureCounterClockwiseOrder(collapsePoly);

        // Project 3D to 2D
        const stratum2D = this.projectTo2D(orientedStratum, matrix);
        const collapse2D = this.projectTo2D(orientedCollapse, matrix);

        // Fast empty-intersection rejection
        if (!this.polygonsIntersect(stratum2D, collapse2D)) {
            return [this.buildTriangulateMesh(stratumPoly)];
        }

        // Run the 2D polygon clip
        const clipped = this.weilerAthertonClip(stratum2D, collapse2D);

        // Project back to 3D and build meshes
        return clipped
            .map(poly => this.buildTriangulateMesh(this.projectTo3D(poly, matrix)))
            .filter(Boolean);
    }

    // Polygon winding-order check helpers
    private ensureClockwiseOrder(poly: Vector3[]): Vector3[] {
        const area = this.calculatePolygonArea(poly);
        return area > 0 ? poly.reverse() : poly;
    }

    private ensureCounterClockwiseOrder(poly: Vector3[]): Vector3[] {
        const area = this.calculatePolygonArea(poly);
        return area < 0 ? poly.reverse() : poly;
    }

    // Signed polygon area
    private calculatePolygonArea(poly: Vector3[]): number {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];
            area += (next.x - current.x) * (next.y + current.y);
        }
        return area;
    }

    // Fast intersection test
    private polygonsIntersect(a: Vector2[], b: Vector2[]): boolean {
        const aBounds = this.calculateBounds(a);
        const bBounds = this.calculateBounds(b);

        // Quick AABB rejection
        if (
            aBounds.maxX < bBounds.minX ||
            aBounds.minX > bBounds.maxX ||
            aBounds.maxY < bBounds.minY ||
            aBounds.minY > bBounds.maxY
        ) {
            return false;
        }

        // Exact intersection test (simplified)
        return a.some(p => this.pointInPolygon(p, b)) || b.some(p => this.pointInPolygon(p, a));
    }

    // 3D to 2D projection
    private projectTo2D(poly: Vector3[], matrix: ProjectionMatrix): Vector2[] {
        return poly.map(p => {
            const rel = new Vector3().subVectors(p, matrix.origin);
            return new Vector2(rel.dot(matrix.xAxis), rel.dot(matrix.yAxis));
        });
    }

    // 2D to 3D inverse projection
    private projectTo3D(points: Vector2[], matrix: ProjectionMatrix): Vector3[] {
        return points.map(p => {
            const xComponent = new Vector3().copy(matrix.xAxis).multiplyScalar(p.x);
            const yComponent = new Vector3().copy(matrix.yAxis).multiplyScalar(p.y);
            return new Vector3().copy(matrix.origin).add(xComponent).add(yComponent);
        });
    }

    // 2D bounding box computation
    private calculateBounds(points: Vector2[]): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        return { minX, minY, maxX, maxY };
    }

    // 3D bounding box intersection test
    private boundsIntersect(a: Box3, b: Box3): boolean {
        // 3D AABB intersection test
        return (
            a[0][0] <= b[1][0] &&
            a[1][0] >= b[0][0] && // X axis
            a[0][1] <= b[1][1] &&
            a[1][1] >= b[0][1] && // Y axis
            a[0][2] <= b[1][2] &&
            a[1][2] >= b[0][2]
        ); // Z axis
    }

    // Ray-casting point-in-polygon test
    private pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
        const epsilon = 1e-10;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
            const pi = polygon[i];
            const pj = polygon[j];

            // Handle the point-on-vertex case
            if (Math.abs(pi.x - point.x) < epsilon && Math.abs(pi.y - point.y) < epsilon) {
                return true;
            }

            // Test the segment against the horizontal ray
            const intersect =
                // eslint-disable-next-line no-mixed-operators
                pi.y > point.y !== pj.y > point.y &&
                point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;

            if (intersect) inside = !inside;
        }

        return inside;
    }

    private buildTriangulateMesh(polygon: Vector3[]): BufferGeometry | null {
        if (polygon.length < 3) return null;

        try {
            const { positions, indices } = triangulate(polygon);
            const geometry = new BufferGeometry();

            const vertices = new Float32Array(positions.flatMap(p => [p.x, p.y, p.z]));
            geometry.setAttribute("position", new BufferAttribute(vertices, 3));

            if (indices.length > 0) {
                const indexArray = new Uint32Array(indices.flat());
                geometry.setIndex(new BufferAttribute(indexArray, 1));
            }

            geometry.computeVertexNormals();
            return geometry;
        } catch (e) {
            return null;
        }
    }

    // 2D polygon clipping (Weiler-Atherton)
    private weilerAthertonClip(subjectPolygon: Vector2[], clipPolygon: Vector2[]): Vector2[][] {
        // Convert THREE.Vector2 arrays to FlatArray format (matches the parameter shape)
        const subject = FlatArray.create({
            array: subjectPolygon.map(v => [v.x, v.y]).flat(), // flatten the 2D array
            itemSize: 2 // coordinate count per vertex
        });
        const clip = FlatArray.create({
            array: clipPolygon.map(v => [v.x, v.y]).flat(),
            itemSize: 2
        });
        // Invoke the core algorithm
        const resultPolygons = weilerAthertonClip(subject, clip);

        // Convert the result back to THREE.Vector2 arrays
        return resultPolygons.map(poly => {
            return poly.array.reduce((acc: Vector2[], _, i) => {
                if (i % poly.itemSize === 0) {
                    acc.push(new Vector2(poly.array[i], poly.array[i + 1]));
                }
                return acc;
            }, []);
        });
    }

    public extractGroundFaces(stratumLayers: StratumLayer[]): {
        positions: Float32Array;
        indices: Uint32Array;
        extents: number[];
    } {
        const groundFaces: Array<{ positions: Float32Array; indices: Uint32Array }> = [];

        for (const layer of stratumLayers || []) {
            if (!layer.voxels?.length) continue;
            groundFaces.push(...layer.extractGroundFaces());
        }

        const { positions, indices, minZ, maxZ, minLon, maxLon, minLat, maxLat } =
            this.mergeGeometryData(groundFaces);
        return {
            positions,
            indices,
            extents: [
                minLon, // minLongitude
                minLat, // minLatitude
                minZ, // min ground-face elevation
                maxLon, // maxLongitude
                maxLat, // maxLatitude
                maxZ // max ground-face elevation
            ]
        };
    }

    private mergeGeometryData(datasets: Array<{ positions: Float32Array; indices: Uint32Array }>): {
        positions: Float32Array;
        indices: Uint32Array;
        minZ: number;
        maxZ: number;
        minLon: number;
        maxLon: number;
        minLat: number;
        maxLat: number;
    } {
        let minZ = Infinity;
        let maxZ = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;

        const vertexMap = new Map<number, number>();
        const mergedVertices: number[] = [];
        const mergedIndices: number[] = [];

        datasets.forEach(({ positions, indices }) => {
            indices.forEach(idx => {
                const base = idx * 3;
                const localX = positions[base];
                const localY = positions[base + 1];
                const localZ = positions[base + 2];

                // Convert to world coordinates
                const worldPos = this.stratumMeshData.unprojectLocalToGeo(
                    new Vector3(localX, localY, localZ)
                ) as GeoCoordinates;

                // Update the elevation extremes
                minZ = Math.min(minZ, worldPos.altitude);
                maxZ = Math.max(maxZ, worldPos.altitude);
                minLon = Math.min(minLon, worldPos.longitude);
                maxLon = Math.max(maxLon, worldPos.longitude);
                minLat = Math.min(minLat, worldPos.latitude);
                maxLat = Math.max(maxLat, worldPos.latitude);

                // Hash from the world coordinates
                const hash = this.generatePositionHash(worldPos);

                if (!vertexMap.has(hash)) {
                    vertexMap.set(hash, mergedVertices.length / 3);
                    mergedVertices.push(worldPos.longitude, worldPos.latitude, worldPos.altitude);
                }

                mergedIndices.push(vertexMap.get(hash)!);
            });
        });

        return {
            positions: new Float32Array(mergedVertices),
            indices: new Uint32Array(mergedIndices),
            minZ,
            maxZ,
            minLon,
            maxLon,
            minLat,
            maxLat
        };
    }

    // Efficient position-hash helper
    private generatePositionHash(v: GeoCoordinates): number {
        // Quantize to centimeter-level precision (suitable for geological coordinates)
        const scale = 1000;
        const x = Math.round(v.longitude * scale);
        const y = Math.round(v.latitude * scale);
        const z = Math.round(v.altitude * scale);

        // Prime-based hash mix (2^24 + 2^14 + 2^3) to reduce collisions
        return (x << 24) ^ (y << 14) ^ (z << 3);
    }
}
