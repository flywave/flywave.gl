import { type BufferGeometry, type Material, type Object3D, InstancedBufferAttribute, InstancedMesh, Matrix4 } from "three";
import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTF } from "../types/gltf-json-schema";
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
export declare const name = "EXT_mesh_gpu_instancing";
export declare function decode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): Promise<void>;
export declare function encode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): void;
interface InstancedMeshCreationOptions {
    parent?: Object3D;
    applyParentTransform?: boolean;
}
export declare function createInstancedMesh(geometry: BufferGeometry, material: Material | Material[], attributes: InstanceAttributes, options?: InstancedMeshCreationOptions): InstancedMesh;
export declare function calculateInstanceMatrices(attributes: InstanceAttributes, instanceCount: number): Matrix4[];
export {};
