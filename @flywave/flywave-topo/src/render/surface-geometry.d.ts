import * as THREE from "three";
import { type TextureTransparency } from "../common";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type ColorInfo } from "./color-info";
import { type MaterialInfo } from "./material";
import { type MeshData } from "./mesh-data";
import { MeshGeometry } from "./mesh-geometry";
interface LayerTextureParams {
    textureMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    transparency: TextureTransparency;
}
export declare class SurfaceGeometry extends MeshGeometry {
    readonly mesh: MeshData;
    textureParams?: LayerTextureParams;
    hasTextures: boolean;
    colorInfo?: ColorInfo;
    materialInfo?: MaterialInfo;
    isPlanar: boolean;
    get isTexturedType(): boolean;
    get isGlyph(): boolean;
    get fillFlags(): number;
    get supportsThematicDisplay(): boolean;
    constructor(mesh: MeshData, positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, indices?: Uint32Array | Uint16Array);
    createMesh(): THREE.Mesh;
    static create(mesh: MeshData, params: MeshParams): SurfaceGeometry | undefined;
    private static extractPositions;
    private static extractIndices;
    dispose(): void;
}
export {};
