/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

/**
 * 三角形分组信息接口
 */
interface TriangleGroup {
    start: number;
    count: number;
    materialIndex: number;
}

/**
 * 几何体处理统计信息
 */
interface GeometryStats {
    originalVertices: number;
    mergedVertices: number;
    originalTriangles: number;
    mergedTriangles: number;
    compressionRatio: number;
}

/**
 * 基于三角形的Geometry合并器
 * 通过整理三角形面片来合并几何体
 */
export class TriangleGeometryMerger {
    /**
     * 合并多个Geometry
     * @param geometries - 要合并的geometry数组
     * @param useGroups - 是否使用groups保持原始边界
     * @returns 合并后的geometry
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
     * 通过三角形合并Geometry（核心方法）
     */
    private static mergeByTriangles(
        geometries: THREE.BufferGeometry[],
        useGroups: boolean
    ): THREE.BufferGeometry {
        const mergedGeometry = new THREE.BufferGeometry();
        const triangleGroups: TriangleGroup[] = [];

        // 收集所有属性名称和类型
        const { attributeNames, attributeTypes } = this.collectAllAttributesInfo(geometries);

        // 存储所有三角形的顶点数据
        const allTriangles: Record<string, number[][]> = {};
        for (const name of attributeNames) {
            allTriangles[name] = [];
        }

        const indices: number[] = [];
        let currentVertexIndex = 0;
        let currentTriangleOffset = 0;

        // 处理每个geometry
        for (let geoIndex = 0; geoIndex < geometries.length; geoIndex++) {
            const geometry = geometries[geoIndex];
            const groupStart = currentTriangleOffset;

            // 处理当前几何体的所有三角形
            const triangleCount = this.processGeometryTriangles(
                geometry,
                currentVertexIndex,
                allTriangles,
                attributeNames,
                indices
            );

            // 记录分组信息
            if (useGroups && triangleCount > 0) {
                triangleGroups.push({
                    start: groupStart * 3,
                    count: triangleCount * 3,
                    materialIndex: geoIndex
                });
            }

            currentVertexIndex += triangleCount * 3; // 每个三角形3个顶点
            currentTriangleOffset += triangleCount;
        }

        // 设置合并后的属性
        this.setMergedAttributesFromTriangles(
            mergedGeometry,
            allTriangles,
            attributeNames,
            attributeTypes
        );

        // 设置索引
        if (indices.length > 0) {
            const indexArray = new Uint32Array(indices);
            mergedGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
        }

        // 设置分组
        if (useGroups) {
            this.setMergedGroups(mergedGeometry, triangleGroups);
        }

        return mergedGeometry;
    }

    /**
     * 收集所有geometry中的attribute名称和类型
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
                    // 记录属性类型
                    if (!types[name]) {
                        types[name] = attr.array.constructor as TypedArrayConstructor;
                    }
                }
            }
        }
        return { attributeNames: Array.from(names), attributeTypes: types };
    }

    /**
     * 处理单个geometry的所有三角形
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
            // 处理索引几何体
            const indexArray = geometry.index.array;
            const indexCount = geometry.index.count;

            for (let i = 0; i < indexCount; i += 3) {
                if (i + 2 >= indexCount) break;

                const vertexIndices = [indexArray[i], indexArray[i + 1], indexArray[i + 2]];
                this.processTriangle(geometry, vertexIndices, allTriangles, attributeNames);

                // 添加新的索引
                indices.push(
                    vertexOffset + triangleCount * 3,
                    vertexOffset + triangleCount * 3 + 1,
                    vertexOffset + triangleCount * 3 + 2
                );

                triangleCount++;
            }
        } else {
            // 处理非索引几何体
            const vertexCount = positionAttr.count;
            for (let i = 0; i < vertexCount; i += 3) {
                if (i + 2 >= vertexCount) break;

                const vertexIndices = [i, i + 1, i + 2];
                this.processTriangle(geometry, vertexIndices, allTriangles, attributeNames);

                // 添加新的索引
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
     * 处理单个三角形
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

                // 处理每个顶点的属性数据
                for (let i = 0; i < 3; i++) {
                    const vertexIndex = vertexIndices[i];

                    // 检查顶点索引是否有效
                    if (vertexIndex >= attr.count) {
                        console.warn(
                            `Vertex index ${vertexIndex} out of bounds for attribute ${name} (count: ${attr.count})`
                        );
                        // 填充默认值
                        const defaultData = new Array(itemSize).fill(0);
                        allTriangles[name].push(defaultData);
                        continue;
                    }

                    const start = vertexIndex * itemSize;
                    // 检查数组边界
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
                // 为缺失的属性填充默认值
                const defaultSize = this.getDefaultItemSize(name);
                for (let i = 0; i < 3; i++) {
                    allTriangles[name].push(new Array(defaultSize).fill(0));
                }
            }
        }
    }

    /**
     * 获取默认的属性itemSize
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
     * 从三角形数据设置合并后的属性
     */
    private static setMergedAttributesFromTriangles(
        mergedGeometry: THREE.BufferGeometry,
        allTriangles: Record<string, number[][]>,
        attributeNames: string[],
        attributeTypes: Record<string, TypedArrayConstructor>
    ): void {
        for (const name of attributeNames) {
            if (allTriangles[name].length === 0) continue;

            // 确定itemSize
            const firstVertex = allTriangles[name][0];
            if (!firstVertex || firstVertex.length === 0) {
                console.warn(`Invalid data for attribute ${name}`);
                continue;
            }

            const itemSize = firstVertex.length;
            const ArrayType = attributeTypes[name] || Float32Array;

            // 展平所有顶点数据
            const flatData: number[] = [];
            let validDataCount = 0;

            for (const vertexData of allTriangles[name]) {
                if (!vertexData || vertexData.length !== itemSize) {
                    // 填充无效数据的默认值
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

            // 使用正确的数组类型创建缓冲区
            const array = new ArrayType(flatData);
            mergedGeometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
        }
    }

    /**
     * 设置合并后的分组
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
     * 调试方法：检查几何体数据
     */
    static debugGeometry(geometry: THREE.BufferGeometry, name: string = "Geometry"): void {
        console.log(`=== ${name} Debug ===`);

        for (const attrName in geometry.attributes) {
            const attr = geometry.attributes[attrName] as THREE.BufferAttribute;
            console.log(
                `Attribute ${attrName}: count=${attr.count}, itemSize=${attr.itemSize}, type=${attr.array.constructor.name}`
            );

            // 检查最后几个值是否有NaN
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
     * 获取合并统计信息
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

// 定义类型数组构造函数的类型
type TypedArrayConstructor =
    | Float32ArrayConstructor
    | Uint32ArrayConstructor
    | Uint16ArrayConstructor
    | Int32ArrayConstructor
    | Int16ArrayConstructor
    | Uint8ArrayConstructor
    | Int8ArrayConstructor;

export default TriangleGeometryMerger;
