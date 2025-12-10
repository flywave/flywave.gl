/* Copyright (C) 2025 flywave.gl contributors */

import {
    type BufferGeometry,
    type Material,
    type Object3D,
    type TypedArray,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedMesh,
    Matrix4,
    Quaternion,
    Vector3
} from "three";

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTFNode } from "../types/gltf-json-schema";

// ==================== 类型定义 ====================
export interface ExtMeshGpuInstancing {
    attributes: {
        TRANSLATION?: number;
        ROTATION?: number;
        SCALE?: number;
        [customAttribute: string]: number | undefined;
    };
}

type InstanceAttributeName = "TRANSLATION" | "ROTATION" | "SCALE" | string;
type InstanceAttributes = Record<InstanceAttributeName, InstancedBufferAttribute>;

const EXT_NAME = "EXT_mesh_gpu_instancing";

// GLTF 组件类型常量
const COMPONENT_TYPES = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126
} as const;

// 访问器类型常量
const ACCESSOR_TYPES = {
    SCALAR: "SCALAR",
    VEC2: "VEC2",
    VEC3: "VEC3",
    VEC4: "VEC4",
    MAT2: "MAT2",
    MAT3: "MAT3",
    MAT4: "MAT4"
} as const;

// ==================== 扩展注册 ====================
export const name = EXT_NAME;

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);
    await decodeMeshGpuInstancing(scenegraph, options);
}

export function encode(gltfData: { json: GLTF }, options: GLTFLoaderOptions): void {
    const scenegraph = new GLTFScenegraph(gltfData);
    encodeMeshGpuInstancing(scenegraph, options);
}

// ==================== 解码逻辑 ====================
async function decodeMeshGpuInstancing(scenegraph: GLTFScenegraph, options: GLTFLoaderOptions) {
    const promises: Array<Promise<void>> = [];

    for (const node of getNodes(scenegraph)) {
        if (scenegraph.getObjectExtension(node, EXT_NAME)) {
            promises.push(processNode(scenegraph, node, options));
        }
    }

    await Promise.all(promises);
    scenegraph.removeExtension(EXT_NAME);
}

async function processNode(scenegraph: GLTFScenegraph, node: GLTFNode, options: GLTFLoaderOptions) {
    const extension = scenegraph.getObjectExtension<ExtMeshGpuInstancing>(node, EXT_NAME);
    if (!extension?.attributes) return;

    try {
        const attributes = await loadInstanceAttributes(scenegraph, extension.attributes);
        node.userData.instance = attributes;
    } finally {
        scenegraph.removeObjectExtension(node, EXT_NAME);
    }
}

async function loadInstanceAttributes(
    scenegraph: GLTFScenegraph,
    attributeDefs: Record<string, number>
): Promise<InstanceAttributes> {
    const attributes: InstanceAttributes = {};
    const accessorPromises: Array<Promise<void>> = [];

    for (const [name, accessorIndex] of Object.entries(attributeDefs)) {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor) continue;

        const promise = (async () => {
            const bufferView = scenegraph.getBufferView(accessor.bufferView!);
            if (!bufferView) throw new Error(`BufferView not found for accessor ${accessorIndex}`);

            const data = scenegraph.getTypedArrayForBufferView(bufferView);
            const componentCount = getComponentCount(accessor.type);

            attributes[name] = new InstancedBufferAttribute(
                data,
                componentCount,
                !!accessor.normalized
            );
        })();

        accessorPromises.push(promise);
    }

    await Promise.all(accessorPromises);
    return attributes;
}

// ==================== 编码逻辑 ====================
function encodeMeshGpuInstancing(scenegraph: GLTFScenegraph, options: GLTFLoaderOptions) {
    for (const node of getNodes(scenegraph)) {
        if (node.mesh !== undefined && node.extras?.instancedAttributes) {
            const extension = createExtension(scenegraph, node);
            scenegraph.addObjectExtension(node, EXT_NAME, extension);
            scenegraph.addRequiredExtension(EXT_NAME);
        }
    }
}

function createExtension(scenegraph: GLTFScenegraph, node: GLTFNode): ExtMeshGpuInstancing {
    const attributes: Record<string, number> = {};
    const instancedAttributes = node.extras?.instancedAttributes as
        | Record<string, TypedArray>
        | undefined;

    if (!instancedAttributes) {
        throw new Error(
            `Missing instancedAttributes in node.extras for node ${node.name || node.mesh}`
        );
    }

    for (const [name, data] of Object.entries(instancedAttributes)) {
        const componentType = getComponentTypeFromData(data);
        const accessorType = getAccessorType(name);

        const bufferViewIndex = scenegraph.addBufferView(data);
        const accessorIndex = scenegraph.addAccessor(bufferViewIndex, {
            array: data,
            componentType,
            type: accessorType,
            count: data.length / getComponentCount(accessorType)
        });

        attributes[name] = accessorIndex;
    }

    return { attributes };
}

// ==================== 实例化网格创建 ====================
interface InstancedMeshCreationOptions {
    parent?: Object3D;
    applyParentTransform?: boolean;
}

export function createInstancedMesh(
    geometry: BufferGeometry,
    material: Material | Material[],
    attributes: InstanceAttributes,
    options: InstancedMeshCreationOptions = {}
): InstancedMesh {
    const { parent, applyParentTransform = true } = options;
    const instanceCount = validateAttributes(attributes);

    const instancedMesh = new InstancedMesh(geometry, material, instanceCount);

    // 应用父级变换（如果需要）
    if (parent && applyParentTransform) {
        instancedMesh.applyMatrix4(parent.matrixWorld);
    }

    // 设置实例属性
    applyInstanceAttributes(instancedMesh, geometry, attributes);

    return instancedMesh;
}

function applyInstanceAttributes(
    instancedMesh: InstancedMesh,
    geometry: BufferGeometry,
    attributes: InstanceAttributes
): void {
    // 标准TRS属性处理
    if ("TRANSLATION" in attributes || "ROTATION" in attributes || "SCALE" in attributes) {
        updateInstanceMatrices(instancedMesh, attributes);
    }

    // 自定义属性处理
    applyCustomAttributes(geometry, attributes);
}

function updateInstanceMatrices(
    instancedMesh: InstancedMesh,
    attributes: InstanceAttributes
): void {
    const instanceCount = instancedMesh.count;
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    const matrix = new Matrix4();

    const translationAttr = attributes.TRANSLATION;
    const rotationAttr = attributes.ROTATION;
    const scaleAttr = attributes.SCALE;

    for (let i = 0; i < instanceCount; i++) {
        // 读取变换属性
        if (translationAttr) position.fromBufferAttribute(translationAttr, i);
        if (scaleAttr) scale.fromBufferAttribute(scaleAttr, i);

        // 特殊处理旋转属性（可能规范化）
        if (rotationAttr) {
            if (rotationAttr.normalized) {
                const [x, y, z, w] = readNormalizedQuaternion(rotationAttr, i);
                rotation.set(x, y, z, w).normalize();
            } else {
                rotation.fromBufferAttribute(rotationAttr, i);
            }
        } else {
            rotation.identity();
        }

        // 计算并设置矩阵
        matrix.compose(position, rotation, scale);
        instancedMesh.setMatrixAt(i, matrix);
    }

    // 标记更新
    instancedMesh.instanceMatrix.needsUpdate = true;
}

// ==================== 工具函数 ====================
function getNodes(scenegraph: GLTFScenegraph): GLTFNode[] {
    return scenegraph.json.nodes || [];
}

function getComponentCount(type: string): number {
    switch (type) {
        case ACCESSOR_TYPES.VEC2:
            return 2;
        case ACCESSOR_TYPES.VEC3:
            return 3;
        case ACCESSOR_TYPES.VEC4:
        case ACCESSOR_TYPES.MAT2:
            return 4;
        case ACCESSOR_TYPES.MAT3:
            return 9;
        case ACCESSOR_TYPES.MAT4:
            return 16;
        case ACCESSOR_TYPES.SCALAR:
        default:
            return 1;
    }
}

function getComponentTypeFromData(data: TypedArray): number {
    if (data instanceof Float32Array) return COMPONENT_TYPES.FLOAT;
    if (data instanceof Uint32Array) return COMPONENT_TYPES.UNSIGNED_INT;
    if (data instanceof Int16Array) return COMPONENT_TYPES.SHORT;
    if (data instanceof Uint16Array) return COMPONENT_TYPES.UNSIGNED_SHORT;
    if (data instanceof Uint8Array) return COMPONENT_TYPES.UNSIGNED_BYTE;
    if (data instanceof Int8Array) return COMPONENT_TYPES.BYTE;

    return COMPONENT_TYPES.FLOAT; // 默认使用FLOAT
}

function getAccessorType(name: string): string {
    switch (name) {
        case "TRANSLATION":
            return ACCESSOR_TYPES.VEC3;
        case "ROTATION":
            return ACCESSOR_TYPES.VEC4;
        case "SCALE":
            return ACCESSOR_TYPES.VEC3;
        default:
            return ACCESSOR_TYPES.SCALAR;
    }
}

function validateAttributes(attributes: InstanceAttributes): number {
    const counts = Object.values(attributes).map(attr => attr.count);
    if (counts.length === 0) throw new Error("No valid instance attributes found");

    const firstCount = counts[0];
    if (!counts.every(count => count === firstCount)) {
        throw new Error("Instance attribute counts do not match");
    }

    return firstCount;
}

function readNormalizedQuaternion(
    attr: InstancedBufferAttribute,
    index: number
): [number, number, number, number] {
    const offset = index * attr.itemSize;
    const array = attr.array;

    const denormalize = (value: number) => {
        if (array instanceof Int8Array) return Math.max(value / 0x7f, -1);
        if (array instanceof Uint8Array) return value / 0xff;
        if (array instanceof Int16Array) return Math.max(value / 0x7fff, -1);
        if (array instanceof Uint16Array) return value / 0xffff;
        return value;
    };

    return [
        denormalize(array[offset]),
        denormalize(array[offset + 1]),
        denormalize(array[offset + 2]),
        denormalize(array[offset + 3])
    ];
}

function applyCustomAttributes(geometry: BufferGeometry, attributes: InstanceAttributes): void {
    for (const [name, attr] of Object.entries(attributes)) {
        // 跳过标准TRS属性
        if (name === "TRANSLATION" || name === "ROTATION" || name === "SCALE") continue;

        // 设置属性并标记为实例化
        geometry.setAttribute(name, attr);
        attr.setUsage(DynamicDrawUsage);

        // 兼容旧版Three.js
        if (!("isInstancedBufferAttribute" in attr)) {
            (attr as any).isInstancedBufferAttribute = true;
        }
    }
}

// ==================== 矩阵计算工具 ====================
export function calculateInstanceMatrices(
    attributes: InstanceAttributes,
    instanceCount: number
): Matrix4[] {
    const matrices: Matrix4[] = Array(instanceCount);
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3(1, 1, 1);

    const translationAttr = attributes.TRANSLATION;
    const rotationAttr = attributes.ROTATION;
    const scaleAttr = attributes.SCALE;

    for (let i = 0; i < instanceCount; i++) {
        // 读取变换属性
        if (translationAttr) position.fromBufferAttribute(translationAttr, i);
        if (scaleAttr) scale.fromBufferAttribute(scaleAttr, i);

        // 处理旋转
        if (rotationAttr) {
            if (rotationAttr.normalized) {
                const [x, y, z, w] = readNormalizedQuaternion(rotationAttr, i);
                rotation.set(x, y, z, w).normalize();
            } else {
                rotation.fromBufferAttribute(rotationAttr, i);
            }
        } else {
            rotation.identity();
        }

        // 计算矩阵
        const matrix = new Matrix4();
        matrix.compose(position, rotation, scale);
        matrices[i] = matrix;
    }

    return matrices;
}
