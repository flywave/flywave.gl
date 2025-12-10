/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FrustumGeoArea,
    type FrustumTester,
    FrustumGeoAreaTester,
    FrustumIntersection,
    GeoBox,
    GeoCoordinates,
    GeoLineString,
    GeoPolygon
} from "@flywave/flywave-geoutils";
import { TriangleGeometryMerger } from "@flywave/flywave-utils";
import { BufferAttribute, BufferGeometry, Sphere, Triangle, Vector3 } from "three";
import { Brush } from "three-bvh-csg";

import { type GroundModificationPolygon } from "../../../ground-modification-manager";
import { FaceTypes } from "../decoder";
import { type BspObject } from "./BspObject";
import { type StratumTileData } from "./StratumTileData";
import { type StratumVoxel } from "./StratumVoxel";

/**
 * Class for clipping stratum mesh data based on a given geographic box.
 */
export class StratumMeshCliper {
    /**
     * Constructor for StratumMeshCliper.
     * @param stratumMeshData - The stratum mesh data to be clipped.
     */
    constructor(private readonly stratumMeshData: StratumTileData) {}

    /**
     * Processes additional geometries from fault profiles, boreholes, and section lines.
     * @returns An array of buffer geometries.
     */
    public processAdditionalGeometries(): BufferGeometry[] {
        const additionalGeometries: BufferGeometry[] = [];

        // Process fault profiles
        const faultProfiles = this.stratumMeshData.createFaultProfiles();
        faultProfiles.forEach(faultProfile => {
            faultProfile.geometry.forEach(geometry => {
                if (geometry) {
                    additionalGeometries.push(geometry);
                }
            });
        });

        // Process boreholes
        const boreholes = this.stratumMeshData.createBoreholes();
        boreholes.forEach(borehole => {
            borehole.geometries.forEach(geometry => {
                if (geometry) {
                    additionalGeometries.push(geometry);
                }
            });
        });

        // Process section lines
        const sectionLines = this.stratumMeshData.createSectionLines();
        sectionLines.forEach(sectionLine => {
            sectionLine.geometries.forEach(geometry => {
                if (geometry) {
                    additionalGeometries.push(geometry);
                }
            });
        });

        return additionalGeometries;
    }

    private makeFrustumGeoAreaFromGroundModificationPolygon(
        groundModificationPolygon: GroundModificationPolygon
    ): FrustumGeoArea {
        const { geoArea, depthOrHeight } = groundModificationPolygon;
        const maxHeight = this.stratumMeshData.maxHeight;

        if (geoArea instanceof GeoBox) {
            return {
                geoArea,
                topAltitude: maxHeight,
                bottomAltitude: depthOrHeight
            };
        }

        if (geoArea instanceof GeoPolygon) {
            return {
                geoArea: geoArea.coordinates.map(coord => coord as GeoCoordinates),
                topAltitude: maxHeight,
                bottomAltitude: depthOrHeight
            };
        }

        if (geoArea instanceof GeoLineString) {
            return {
                geoArea: geoArea.coordinates.map(coord => coord as GeoCoordinates),
                topAltitude: maxHeight,
                bottomAltitude: depthOrHeight
            };
        }

        return {
            geoArea,
            topAltitude: maxHeight,
            bottomAltitude: depthOrHeight
        };
    }

    protected makeFrustumGeoAreaToBspNode(frustumGeoAreas: FrustumGeoArea[]): Brush {
        const positions: number[] = [];
        const indices: number[] = [];
        const uvs: number[] = [];
        let vertexCount = 0;

        // Process each FrustumGeoArea
        for (const frustumGeoArea of frustumGeoAreas) {
            const { topAltitude, bottomAltitude, geoArea } = frustumGeoArea;

            // Create coordinates array
            const coordinates = Array.isArray(geoArea)
                ? geoArea
                : this.createCoordinatesFromGeoBox(geoArea);

            // Ensure coordinates are in counter-clockwise order for correct winding
            const orderedCoordinates = this.ensureCounterClockwiseOrder(coordinates);

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

            for (const coord of orderedCoordinates) {
                // Project points to world coordinates
                const worldPointTop = this.stratumMeshData.projection.projectPoint(
                    new GeoCoordinates(coord.latitude, coord.longitude, topAltitude),
                    new Vector3()
                );
                const worldPointBottom = this.stratumMeshData.projection.projectPoint(
                    new GeoCoordinates(coord.latitude, coord.longitude, bottomAltitude),
                    new Vector3()
                );

                // Translate to local coordinates
                worldPointTop.sub(this.stratumMeshData.center);
                worldPointBottom.sub(this.stratumMeshData.center);

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
        geometry.computeVertexNormals();

        // Create and return Brush
        return new Brush(geometry);
    }

    /**
     * Ensures coordinates are in counter-clockwise order for correct winding
     */
    private ensureCounterClockwiseOrder(coordinates: GeoCoordinates[]): GeoCoordinates[] {
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
    private createCoordinatesFromGeoBox(geoBox: GeoBox): GeoCoordinates[] {
        const { southWest, northEast } = geoBox;

        return [
            new GeoCoordinates(southWest.latitude, southWest.longitude),
            new GeoCoordinates(northEast.latitude, southWest.longitude),
            new GeoCoordinates(northEast.latitude, northEast.longitude),
            new GeoCoordinates(southWest.latitude, northEast.longitude),
            new GeoCoordinates(southWest.latitude, southWest.longitude) // Close the polygon
        ];
    }

    /**
     * Clips the tile mesh based on a given geographic box.
     * @param geoBox - The geographic box to clip the mesh to.
     * @param isClip - Whether to perform clipping.
     * @returns The clipped stratum tile data.
     */
    public clipTileMesh(
        groundModificationPolygons?: GroundModificationPolygon[],
        isClip: boolean = false
    ): BufferGeometry {
        // Pre-calculate clipBox and bspClipBox to avoid repeated calculations
        const frustumGeoAreas = groundModificationPolygons.map(
            polygon =>
                new FrustumGeoAreaTester(
                    this.makeFrustumGeoAreaFromGroundModificationPolygon(polygon),
                    this.stratumMeshData.center,
                    this.stratumMeshData.projection
                )
        );

        let bspClipBox: Brush | undefined;
        if (isClip) {
            bspClipBox = this.makeFrustumGeoAreaToBspNode(
                groundModificationPolygons.map(polygon =>
                    this.makeFrustumGeoAreaFromGroundModificationPolygon(polygon)
                )
            );
        }

        // Create an array to store all BspObjects that need processing
        const outsideBspObjects: BspObject[] = [];
        const insideBspObjects: StratumVoxel[] = [];

        const expandedFrustumTester = frustumGeoAreas.map(frustumGeoArea => frustumGeoArea.clone());
        // Process StratumLayers
        this.stratumMeshData.createStratumLayers(voxel => {
            const sphere = voxel.boundingSphere.clone();

            let intersection: FrustumIntersection = FrustumIntersection.OUTSIDE;
            for (let i = 0; i < frustumGeoAreas.length; i++) {
                const frustumTester = frustumGeoAreas[i];
                intersection = frustumTester.sphereIntersects(sphere);
                if (intersection !== FrustumIntersection.OUTSIDE) {
                    if (intersection == FrustumIntersection.INTERSECTS) {
                        expandedFrustumTester[i].expandToCoverSphere(sphere);
                    }
                    break;
                }
            }
            if (intersection == FrustumIntersection.OUTSIDE) {
                outsideBspObjects.push(voxel);
            } else insideBspObjects.push(voxel);
            return false;
        });

        // Process CollapsePillars
        this.stratumMeshData.createCollapsePillars(layer => {
            const sphere = layer.boundingSphere.clone();

            if (
                !frustumGeoAreas.some(
                    frustumGeoArea =>
                        frustumGeoArea.sphereIntersects(sphere) !== FrustumIntersection.OUTSIDE
                )
            ) {
                outsideBspObjects.push(layer);
                return true;
            }
            return false;
        });
        // Process all BspObjects
        const processedBspDatas: BufferGeometry[] = [];
        outsideBspObjects.forEach(bspData => {
            processedBspDatas.push(bspData.geometry);
        });

        if (isClip) {
            if (!this.isGeometryClosed(bspClipBox.geometry)) {
                throw new Error("Geometry is not closed");
            }
            const clipAttributes = ["position", "uv", "normal", "faceType", "materialId"];
            insideBspObjects.forEach(bspData => {
                this.addFaceTypeAndMaterialIdAttributes(bspClipBox.geometry, bspData.material);

                if (!this.isGeometryClosed(bspData.geometry)) {
                    throw new Error("Geometry is not closed");
                }
                processedBspDatas.push(bspData.clipGeometry(bspClipBox, clipAttributes));
            });
        }
        // Extract the logic for processing geometries to a separate method
        const additionalGeometries = this.processAdditionalGeometries();

        // Use mergeGeometries to merge all geometries
        const geometriesToMerge = [
            ...(processedBspDatas
                .map(geometry => geometry)
                .filter(geometry => geometry !== undefined) as BufferGeometry[]),
            ...additionalGeometries
        ];

        let mergedGeometry: BufferGeometry | undefined;
        if (geometriesToMerge.length > 0) {
            mergedGeometry = TriangleGeometryMerger.merge(geometriesToMerge);
        }

        this.markBoundaryVerticesByTriangleIntersection(
            mergedGeometry,
            expandedFrustumTester
            // isClip ? undefined : frustumGeoAreas
        );
        return mergedGeometry;
    }

    private isGeometryClosed(geometry: BufferGeometry) {
        // 确保有索引
        if (!geometry.index) {
            console.warn("Geometry has no index, creating temporary index");
            geometry = geometry.toNonIndexed();
        }

        const index = geometry.index;

        // 创建边到面数的映射
        const edgeCount = new Map();

        // 遍历所有三角形
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);

            // 三角形的三条边（按顺序排序以避免方向问题）
            const edges = [
                [Math.min(a, b), Math.max(a, b)],
                [Math.min(b, c), Math.max(b, c)],
                [Math.min(c, a), Math.max(c, a)]
            ];

            // 统计每条边被多少个三角形使用
            for (const [v1, v2] of edges) {
                const edgeKey = `${v1}-${v2}`;
                edgeCount.set(edgeKey, (edgeCount.get(edgeKey) || 0) + 1);
            }
        }

        // 检查是否有边只被一个三角形使用（边界边）
        let boundaryEdges = 0;
        for (const count of edgeCount.values()) {
            if (count === 1) {
                boundaryEdges++;
            } else if (count > 2) {
                console.warn("Found edge shared by more than 2 triangles:", count);
            }
        }

        console.log(`Total edges: ${edgeCount.size}`);
        console.log(`Boundary edges: ${boundaryEdges}`);

        // 完全闭合的几何体应该没有边界边
        return boundaryEdges === 0;
    }

    /**
     * Marks vertices in a BufferGeometry as BoundarySideFace type if their triangle
     * intersects with any of the given geographical frustum areas. Modifies the original geometry.
     * Uses triangle-level intersection testing for more accurate boundary detection.
     * @param geometry - The BufferGeometry to process
     * @param frustumTesters - Array of frustum area testers to check intersection
     * @throws {Error} If geometry doesn't have required attributes
     */
    public markBoundaryVerticesByTriangleIntersection(
        geometry: BufferGeometry,
        frustumTesters?: FrustumTester[],
        filterFrustumTesters?: FrustumTester[]
    ): void {
        // 验证必需的属性
        const positionAttr = geometry.getAttribute("position");
        const faceTypeAttr = geometry.getAttribute("faceType");
        const index = geometry.getIndex();

        if (!positionAttr) {
            throw new Error("Geometry must have position attribute");
        }

        if (!faceTypeAttr) {
            throw new Error("Geometry must have faceType attribute");
        }

        if (!index) {
            throw new Error("Geometry must have index attribute");
        }

        if (!frustumTesters || frustumTesters.length === 0) {
            console.warn("No frustum testers provided, skipping boundary marking");
            return;
        }

        // 创建临时变量用于三角形检查
        const triangle = new Triangle();
        const vertexA = new Vector3();
        const vertexB = new Vector3();
        const vertexC = new Vector3();

        // 遍历所有三角形
        for (let i = 0; i < index.count; i += 3) {
            const idxA = index.getX(i);
            const idxB = index.getX(i + 1);
            const idxC = index.getX(i + 2);

            // 获取三角形的三个顶点坐标
            vertexA.set(positionAttr.getX(idxA), positionAttr.getY(idxA), positionAttr.getZ(idxA));
            vertexB.set(positionAttr.getX(idxB), positionAttr.getY(idxB), positionAttr.getZ(idxB));
            vertexC.set(positionAttr.getX(idxC), positionAttr.getY(idxC), positionAttr.getZ(idxC));

            // 设置三角形
            triangle.set(vertexA, vertexB, vertexC);

            let isTriangleIntersecting = false;

            let faceType: number = FaceTypes.SideFace;
            // 检查三角形是否与任何截锥体相交
            if (frustumTesters)
                for (const frustumTester of frustumTesters) {
                    const intersection = frustumTester.triangleIntersects(triangle);

                    if (intersection !== FrustumIntersection.OUTSIDE) {
                        isTriangleIntersecting = true;
                        faceType = FaceTypes.BoundarySideFace;
                        break; // 只要与一个截锥体相交就足够
                    }
                }

            if (filterFrustumTesters) {
                for (const frustumTester of filterFrustumTesters) {
                    const intersection = frustumTester.triangleIntersects(triangle);

                    if (intersection !== FrustumIntersection.OUTSIDE) {
                        isTriangleIntersecting = true;
                        faceType = FaceTypes.SideFace;
                        break; // 只要与一个截锥体相交就足够
                    }
                }
            }

            // 如果三角形相交，标记所有三个顶点
            if (isTriangleIntersecting) {
                [idxA, idxB, idxC].forEach(vertexIndex => {
                    const faceTypeArray = faceTypeAttr.array as Float32Array | Uint32Array;
                    if (
                        !(
                            faceType === FaceTypes.BoundarySideFace &&
                            faceTypeArray[vertexIndex] === FaceTypes.TopGroundFace
                        )
                    )
                        faceTypeArray[vertexIndex] = faceType;
                });
            }
        }
    }

    /**
     * Adds faceType and materialId attributes to the given geometry.
     * @param geometry - The geometry to modify.
     * @param materialId - The material ID to assign.
     * @returns The modified geometry.
     */
    public addFaceTypeAndMaterialIdAttributes(
        geometry: BufferGeometry,
        materialId: number
    ): BufferGeometry {
        const positionAttr = geometry.getAttribute("position");
        if (!positionAttr) {
            throw new Error("Geometry must have position attribute");
        }

        const vertexCount = positionAttr.count;

        // Create faceType attribute
        const faceTypeArray = new Uint8Array(vertexCount);
        faceTypeArray.fill(FaceTypes.BoundarySideFace);
        geometry.setAttribute("faceType", new BufferAttribute(faceTypeArray, 1));

        // Create materialId attribute
        const materialIdArray = new Uint8Array(vertexCount);
        materialIdArray.fill(materialId);
        geometry.setAttribute("materialId", new BufferAttribute(materialIdArray, 1));

        return geometry;
    }
}
