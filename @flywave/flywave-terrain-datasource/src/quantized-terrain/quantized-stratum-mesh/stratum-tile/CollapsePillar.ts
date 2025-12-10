/* Copyright (C) 2025 flywave.gl contributors */

import { triangulate } from "@flywave/flywave-geometry";
import * as THREE from "three";

import { type CollapsePillarData, type StratumLayerData, LayerType } from "../decoder";
import { BspObject } from "./BspObject";
import { type StratumTileData } from "./StratumTileData";

/**
 * Represents a collapse pillar in a stratum mesh.
 * This class extends BspObject to provide BSP operations for collapse pillars.
 */
export class CollapsePillar extends BspObject {
    /** The lithology of the collapse pillar */
    private readonly _lithology: string;
    /** The top center position of the collapse pillar */
    private readonly _topCenter: THREE.Vector3;
    /** The base center position of the collapse pillar */
    private readonly _baseCenter: THREE.Vector3;
    /** The bounding box of the collapse pillar geometry */
    private _boundingSphere?: THREE.Sphere;
    /** The geometry of the collapse pillar */
    private readonly _geometry?: THREE.BufferGeometry;
    /** The layer data associated with the collapse pillar */
    private readonly _layer?: StratumLayerData;
    /** The material index for the collapse pillar */
    private readonly _material: number;

    /**
     * Creates a new CollapsePillar instance.
     * @param collapse - The collapse pillar data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(
        public collapse: CollapsePillarData,
        layer: StratumLayerData,
        stratumMeshData: StratumTileData
    ) {
        super(stratumMeshData.createVoxelGeometry(layer.voxels[0]));
        this._lithology = collapse.lithology;
        this._topCenter = new THREE.Vector3().fromArray(collapse.topCenter);
        this._baseCenter = new THREE.Vector3().fromArray(collapse.baseCenter);

        this._layer = layer;

        if (layer && layer.voxels[0]) {
            this._geometry = stratumMeshData.createVoxelGeometry(layer.voxels[0]);

            this._material = layer.voxels[0].material;
            this._boundingSphere = this.getBoundingSphere();
            this._geometry.boundingSphere = this._boundingSphere.clone();
        }
    }

    private getBoundingSphere(): THREE.Sphere {
        if (this._boundingSphere) {
            return this._boundingSphere;
        }

        if (!this._geometry) {
            return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
        }

        const positionAttr = this._geometry.getAttribute("position");
        const index = this._geometry.index; // 获取几何体的索引

        if (!positionAttr || !index) {
            return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
        }

        const positions = positionAttr.array;
        const indices = index.array; // 获取索引数组
        const boundingSphere = new THREE.Sphere();

        // 使用索引计算包围盒
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i] * 3; // 索引指向位置数组中的x坐标
            boundingSphere.expandByPoint(
                new THREE.Vector3(positions[idx], positions[idx + 1], positions[idx + 2])
            );
        }

        this._boundingSphere = boundingSphere;
        return boundingSphere;
    }

    /**
     * Gets the layer data associated with the collapse pillar.
     * @returns The layer data
     */
    get layer() {
        return this._layer;
    }

    /**
     * Gets the ID of the collapse pillar.
     * @returns The collapse pillar ID
     */
    get id() {
        return this.collapse.id;
    }

    /**
     * Gets the name of the collapse pillar.
     * @returns The collapse pillar name
     */
    get name() {
        return this.collapse.name;
    }

    /**
     * Gets the lithology of the collapse pillar.
     * @returns The lithology
     */
    get lithology() {
        return this._lithology;
    }

    /**
     * Gets the top center position of the collapse pillar.
     * @returns The top center position
     */
    get topCenter() {
        return this._topCenter;
    }

    /**
     * Gets the base center position of the collapse pillar.
     * @returns The base center position
     */
    get baseCenter() {
        return this._baseCenter;
    }

    /**
     * Gets the top radius of the collapse pillar.
     * @returns The top radius
     */
    get topRadius() {
        return this.collapse.topRadius;
    }

    /**
     * Gets the base radius of the collapse pillar.
     * @returns The base radius
     */
    get baseRadius() {
        return this.collapse.baseRadius;
    }

    /**
     * Gets the height of the collapse pillar.
     * @returns The height
     */
    get height() {
        return this.collapse.height;
    }

    /**
     * Gets the stratum ID associated with the collapse pillar.
     * @returns The stratum ID
     */
    get stratumId() {
        return this.collapse.stratumId;
    }

    /**
     * Gets the material index for the collapse pillar.
     * @returns The material index
     */
    get material(): number {
        return this!._material;
    }

    /**
     * Gets the bounding box of the collapse pillar.
     * @returns The bounding box
     */
    get boundingSphere() {
        return this._boundingSphere;
    }

    /**
     * Generates cross sections of the collapse pillar.
     * @param line - The line defining the cross section plane
     * @param upDir - The up direction vector
     * @returns The cross section positions and indices, or undefined if not enough points
     */
    generateCrossSections(
        line: [THREE.Vector3, THREE.Vector3],
        upDir: THREE.Vector3
    ): { positions: THREE.Vector3[]; indices: number[] } | undefined {
        // Create a vertical plane using the provided up direction
        const plane = this.createVerticalPlane(line, upDir);
        const points = this.calculateIntersection(plane);

        if (points.length < 3) return;

        const sortedPoints = this.sortPolygonPoints(points, plane, upDir);
        return triangulate(sortedPoints);
    }

    /**
     * Creates a vertical plane for cross section generation.
     * @param line - The line defining the plane
     * @param upDir - The up direction vector
     * @returns The created plane
     */
    private createVerticalPlane(
        line: [THREE.Vector3, THREE.Vector3],
        upDir: THREE.Vector3
    ): THREE.Plane {
        const dir = new THREE.Vector3().subVectors(line[1], line[0]);

        // Calculate horizontal direction component (perpendicular to upDir)
        const horizontalDir = new THREE.Vector3().crossVectors(dir, upDir);

        // Handle special case: if horizontal direction component is too small, use default direction
        if (horizontalDir.length() < 1e-10) {
            // Try to construct a default direction perpendicular to upDir
            const temp = new THREE.Vector3(1, 0, 0);
            if (Math.abs(temp.dot(upDir)) > 0.9) temp.set(0, 1, 0);
            horizontalDir.crossVectors(upDir, temp).normalize();
        } else {
            horizontalDir.normalize();
        }

        // Create normal vector (perpendicular to horizontal direction)
        const normal = new THREE.Vector3().crossVectors(upDir, horizontalDir).normalize();
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(normal, line[0]);
        return plane;
    }

    /**
     * Calculates the intersection points between the collapse pillar geometry and a plane.
     * @param plane - The intersecting plane
     * @returns The intersection points
     */
    private calculateIntersection(plane: THREE.Plane): THREE.Vector3[] {
        if (!this._geometry) return [];

        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        const positions = positionAttr.array;
        const indices = indexAttr?.array || [];

        const uniquePoints = new Map<string, THREE.Vector3>();
        const addUniquePoint = (point: THREE.Vector3) => {
            const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
            if (!uniquePoints.has(key)) {
                uniquePoints.set(key, point);
            }
        };

        for (let i = 0; i < indices.length; i += 3) {
            const idx0 = indices[i] * 3;
            const idx1 = indices[i + 1] * 3;
            const idx2 = indices[i + 2] * 3;

            const v0 = new THREE.Vector3(positions[idx0], positions[idx0 + 1], positions[idx0 + 2]);
            const v1 = new THREE.Vector3(positions[idx1], positions[idx1 + 1], positions[idx1 + 2]);
            const v2 = new THREE.Vector3(positions[idx2], positions[idx2 + 1], positions[idx2 + 2]);

            const edges = [
                new THREE.Line3(v0, v1),
                new THREE.Line3(v1, v2),
                new THREE.Line3(v2, v0)
            ];

            edges.forEach(edge => {
                const intersectPoint = new THREE.Vector3();
                const result = plane.intersectLine(edge, intersectPoint);
                if (result !== null) {
                    addUniquePoint(intersectPoint);
                }
            });
        }
        return Array.from(uniquePoints.values());
    }

    /**
     * Sorts polygon points for proper triangulation.
     * @param points - The points to sort
     * @param plane - The reference plane
     * @param upDir - The up direction vector
     * @returns The sorted points
     */
    private sortPolygonPoints(
        points: THREE.Vector3[],
        plane: THREE.Plane,
        upDir: THREE.Vector3
    ): THREE.Vector3[] {
        if (points.length < 3) return points;

        // 1. Calculate centroid
        const centroid = new THREE.Vector3();
        points.forEach(p => centroid.add(p));
        centroid.divideScalar(points.length);

        // 2. Build plane coordinate system
        // X axis: Cross product of plane normal and upDir (horizontal direction)
        const basisX = new THREE.Vector3().crossVectors(plane.normal, upDir).normalize();

        // Handle special case
        if (basisX.length() < 1e-5) {
            // If normal is parallel to upDir, use fallback direction
            const temp = new THREE.Vector3(1, 0, 0);
            if (Math.abs(temp.dot(upDir)) > 0.9) temp.set(0, 1, 0);
            basisX.crossVectors(plane.normal, temp).normalize();
        }

        // Y axis: Use upDir (vertical direction)
        const basisY = upDir.clone().normalize();

        // 3. Project to 2D plane
        const projectTo2D = (v: THREE.Vector3) => {
            const offset = v.clone().sub(centroid);
            return {
                x: offset.dot(basisX),
                y: offset.dot(basisY)
            };
        };

        // 4. Sort by angle
        return points.sort((a, b) => {
            const a2D = projectTo2D(a);
            const b2D = projectTo2D(b);
            const angleA = Math.atan2(a2D.y, a2D.x);
            const angleB = Math.atan2(b2D.y, b2D.x);

            if (Math.abs(angleA - angleB) < 1e-5) {
                return a2D.x * a2D.x + a2D.y * a2D.y - (b2D.x * b2D.x + b2D.y * b2D.y);
            }
            return angleA - angleB;
        });
    }
}
