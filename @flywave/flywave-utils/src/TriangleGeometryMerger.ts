/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

/**
 * Triangle group information interface
 */
interface TriangleGroup {
    start: number;
    count: number;
    materialIndex: number;
}

/**
 * Geometry processing statistics
 */
interface GeometryStats {
    originalVertices: number;
    mergedVertices: number;
    originalTriangles: number;
    mergedTriangles: number;
    compressionRatio: number;
}

/**
 * Triangle-based Geometry merger
 * Merges geometries by reorganizing their triangle faces
 */
export class TriangleGeometryMerger {
    /**
     * Merge multiple Geometries
     * @param geometries - the array of geometries to merge
     * @param useGroups - whether to use groups to preserve the original boundaries
     * @returns the merged geometry
     */
    static merge(
        geometries: THREE.BufferGeometry[],
        useGroups: boolean = false
    ): THREE.BufferGeometry {
        if (geometries.length === 0) return new THREE.BufferGeometry();
        if (geometries.length === 1) return geometries[0].clone();

        return this.mergeByTriangles(geometries, useGroups);
    }

    /**
     * Merge Geometry by triangles (core method)
     */
    private static mergeByTriangles(
        geometries: THREE.BufferGeometry[],
        useGroups: boolean
    ): THREE.BufferGeometry {
        const mergedGeometry = new THREE.BufferGeometry();
        const triangleGroups: TriangleGroup[] = [];

        // Collect all attribute names and types
        const { attributeNames, attributeTypes } = this.collectAllAttributesInfo(geometries);

        // Store the vertex data of all triangles
        const allTriangles: Record<string, number[][]> = {};
        for (const name of attributeNames) {
            allTriangles[name] = [];
        }

        const indices: number[] = [];
        let currentVertexIndex = 0;
        let currentTriangleOffset = 0;

        // Process each geometry
        for (let geoIndex = 0; geoIndex < geometries.length; geoIndex++) {
            const geometry = geometries[geoIndex];
            const groupStart = currentTriangleOffset;

            // Process all triangles of the current geometry
            const triangleCount = this.processGeometryTriangles(
                geometry,
                currentVertexIndex,
                allTriangles,
                attributeNames,
                indices
            );

            // Record the group information
            if (useGroups && triangleCount > 0) {
                triangleGroups.push({
                    start: groupStart * 3,
                    count: triangleCount * 3,
                    materialIndex: geoIndex
                });
            }

            currentVertexIndex += triangleCount * 3; // 3 vertices per triangle
            currentTriangleOffset += triangleCount;
        }

        // Set the merged attributes
        this.setMergedAttributesFromTriangles(
            mergedGeometry,
            allTriangles,
            attributeNames,
            attributeTypes
        );

        // Set the index
        if (indices.length > 0) {
            const indexArray = new Uint32Array(indices);
            mergedGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
        }

        // Set the groups
        if (useGroups) {
            this.setMergedGroups(mergedGeometry, triangleGroups);
        }

        return mergedGeometry;
    }

    /**
     * Collect the attribute names and types from all geometries
     */
    private static collectAllAttributesInfo(geometries: THREE.BufferGeometry[]): {
        attributeNames: string[];
        attributeTypes: Record<string, TypedArrayConstructor>;
    } {
        const names = new Set<string>();
        const types: Record<string, TypedArrayConstructor> = {};

        for (const geometry of geometries) {
            for (const name in geometry.attributes) {
                const attr = geometry.attributes[name];
                if (attr instanceof THREE.BufferAttribute) {
                    names.add(name);
                    // Record the attribute type
                    if (!types[name]) {
                        types[name] = attr.array.constructor as TypedArrayConstructor;
                    }
                }
            }
        }
        return { attributeNames: Array.from(names), attributeTypes: types };
    }

    /**
     * Process all triangles of a single geometry
     */
    private static processGeometryTriangles(
        geometry: THREE.BufferGeometry,
        vertexOffset: number,
        allTriangles: Record<string, number[][]>,
        attributeNames: string[],
        indices: number[]
    ): number {
        const positionAttr = geometry.attributes.position;

        if (!positionAttr) {
            console.warn(`Geometry has no position attribute`);
            return 0;
        }

        let triangleCount = 0;

        if (geometry.index) {
            // Handle an indexed geometry
            const indexArray = geometry.index.array;
            const indexCount = geometry.index.count;

            for (let i = 0; i < indexCount; i += 3) {
                if (i + 2 >= indexCount) break;

                const vertexIndices = [indexArray[i], indexArray[i + 1], indexArray[i + 2]];
                this.processTriangle(geometry, vertexIndices, allTriangles, attributeNames);

                // Append the new indices
                indices.push(
                    vertexOffset + triangleCount * 3,
                    vertexOffset + triangleCount * 3 + 1,
                    vertexOffset + triangleCount * 3 + 2
                );

                triangleCount++;
            }
        } else {
            // Handle a non-indexed geometry
            const vertexCount = positionAttr.count;
            for (let i = 0; i < vertexCount; i += 3) {
                if (i + 2 >= vertexCount) break;

                const vertexIndices = [i, i + 1, i + 2];
                this.processTriangle(geometry, vertexIndices, allTriangles, attributeNames);

                // Append the new indices
                indices.push(
                    vertexOffset + triangleCount * 3,
                    vertexOffset + triangleCount * 3 + 1,
                    vertexOffset + triangleCount * 3 + 2
                );

                triangleCount++;
            }
        }

        return triangleCount;
    }

    /**
     * Process a single triangle
     */
    private static processTriangle(
        geometry: THREE.BufferGeometry,
        vertexIndices: number[],
        allTriangles: Record<string, number[][]>,
        attributeNames: string[]
    ): void {
        for (const name of attributeNames) {
            const attr = geometry.attributes[name] as THREE.BufferAttribute;

            if (attr && attr.array && attr.array.length > 0) {
                const itemSize = attr.itemSize;

                // Process the attribute data of each vertex
                for (let i = 0; i < 3; i++) {
                    const vertexIndex = vertexIndices[i];

                    // Check that the vertex index is valid
                    if (vertexIndex >= attr.count) {
                        console.warn(
                            `Vertex index ${vertexIndex} out of bounds for attribute ${name} (count: ${attr.count})`
                        );
                        // Fill in a default value
                        const defaultData = new Array(itemSize).fill(0);
                        allTriangles[name].push(defaultData);
                        continue;
                    }

                    const start = vertexIndex * itemSize;
                    // Check the array bounds
                    if (start + itemSize > attr.array.length) {
                        console.warn(
                            `Array bounds exceeded for attribute ${name} at index ${vertexIndex}`
                        );
                        const defaultData = new Array(itemSize).fill(0);
                        allTriangles[name].push(defaultData);
                        continue;
                    }

                    const vertexData: number[] = [];
                    for (let j = 0; j < itemSize; j++) {
                        const value = attr.array[start + j];
                        vertexData.push(isNaN(value) ? 0 : value);
                    }

                    allTriangles[name].push(vertexData);
                }
            } else {
                // Fill in default values for missing attributes
                const defaultSize = this.getDefaultItemSize(name);
                for (let i = 0; i < 3; i++) {
                    allTriangles[name].push(new Array(defaultSize).fill(0));
                }
            }
        }
    }

    /**
     * Get the default attribute itemSize
     */
    private static getDefaultItemSize(attributeName: string): number {
        switch (attributeName) {
            case "position":
                return 3;
            case "normal":
                return 3;
            case "uv":
                return 2;
            case "uv2":
                return 2;
            case "color":
                return 3;
            case "tangent":
                return 4;
            default:
                return 3;
        }
    }

    /**
     * Set the merged attributes from the triangle data
     */
    private static setMergedAttributesFromTriangles(
        mergedGeometry: THREE.BufferGeometry,
        allTriangles: Record<string, number[][]>,
        attributeNames: string[],
        attributeTypes: Record<string, TypedArrayConstructor>
    ): void {
        for (const name of attributeNames) {
            if (allTriangles[name].length === 0) continue;

            // Determine the itemSize
            const firstVertex = allTriangles[name][0];
            if (!firstVertex || firstVertex.length === 0) {
                console.warn(`Invalid data for attribute ${name}`);
                continue;
            }

            const itemSize = firstVertex.length;
            const ArrayType = attributeTypes[name] || Float32Array;

            // Flatten all vertex data
            const flatData: number[] = [];
            let validDataCount = 0;

            for (const vertexData of allTriangles[name]) {
                if (!vertexData || vertexData.length !== itemSize) {
                    // Fill in default values for invalid data
                    for (let i = 0; i < itemSize; i++) {
                        flatData.push(0);
                    }
                    continue;
                }

                for (const value of vertexData) {
                    flatData.push(isNaN(value) ? 0 : value);
                    if (!isNaN(value)) validDataCount++;
                }
            }

            if (validDataCount === 0) {
                continue;
            }

            // Create the buffer with the correct array type
            const array = new ArrayType(flatData);
            mergedGeometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
        }
    }

    /**
     * Set the merged groups
     */
    private static setMergedGroups(
        mergedGeometry: THREE.BufferGeometry,
        triangleGroups: TriangleGroup[]
    ): void {
        for (const group of triangleGroups) {
            mergedGeometry.addGroup(group.start, group.count, group.materialIndex);
        }
    }

    /**
     * Debug helper: inspect geometry data
     */
    static debugGeometry(geometry: THREE.BufferGeometry, name: string = "Geometry"): void {
        console.log(`=== ${name} Debug ===`);

        for (const attrName in geometry.attributes) {
            const attr = geometry.attributes[attrName] as THREE.BufferAttribute;
            console.log(
                `Attribute ${attrName}: count=${attr.count}, itemSize=${attr.itemSize}, type=${attr.array.constructor.name}`
            );

            // Check the last few values for NaN
            const array = attr.array;
            const checkCount = Math.min(10, array.length);
            for (let i = Math.max(0, array.length - checkCount); i < array.length; i++) {
                if (isNaN(array[i])) {
                    console.warn(`NaN found in ${attrName} at index ${i}`);
                }
            }
        }

        if (geometry.index) {
            console.log(`Index: count=${geometry.index.count}`);

            const indexArray = geometry.index.array;
            const checkCount = Math.min(10, indexArray.length);
            for (let i = Math.max(0, indexArray.length - checkCount); i < indexArray.length; i++) {
                if (isNaN(indexArray[i])) {
                    console.warn(`NaN found in index at position ${i}`);
                }
            }
        }
    }

    /**
     * Get merge statistics
     */
    static getMergeStats(geometries: THREE.BufferGeometry[]): GeometryStats {
        let originalVertices = 0;
        let originalTriangles = 0;
        let mergedVertices = 0;
        let mergedTriangles = 0;

        for (const geometry of geometries) {
            let vertices = 0;
            let triangles = 0;

            if (geometry.index) {
                triangles = geometry.index.count / 3;
                vertices = geometry.attributes.position.count;
            } else {
                vertices = geometry.attributes.position.count;
                triangles = vertices / 3;
            }

            originalVertices += vertices;
            originalTriangles += triangles;
            mergedTriangles += triangles;
        }

        mergedVertices = mergedTriangles * 3;
        const compressionRatio = originalVertices > 0 ? originalVertices / mergedVertices : 1;

        return {
            originalVertices,
            mergedVertices,
            originalTriangles,
            mergedTriangles,
            compressionRatio
        };
    }
}

// Type of the typed array constructors
type TypedArrayConstructor =
    | Float32ArrayConstructor
    | Uint32ArrayConstructor
    | Uint16ArrayConstructor
    | Int32ArrayConstructor
    | Int16ArrayConstructor
    | Uint8ArrayConstructor
    | Int8ArrayConstructor;

export default TriangleGeometryMerger;
