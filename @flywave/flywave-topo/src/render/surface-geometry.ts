/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { type TextureTransparency, FillFlags } from "../common";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type ColorInfo } from "./color-info";
import { type MaterialInfo } from "./material";
import { type MeshData } from "./mesh-data";
import { MeshGeometry } from "./mesh-geometry";

// 类型定义
interface LayerTextureParams {
    textureMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    transparency: TextureTransparency;
}

export class SurfaceGeometry extends MeshGeometry {
    public readonly mesh: MeshData;
    public textureParams?: LayerTextureParams;
    public hasTextures: boolean = false;
    public colorInfo?: ColorInfo;
    public materialInfo?: MaterialInfo;
    public isPlanar: boolean = false;

    public get isTexturedType(): boolean {
        return this.hasTextures && this.textureParams?.textureMap !== undefined;
    }

    public get isGlyph(): boolean {
        return this.mesh?.isGlyph ?? false;
    }

    public get fillFlags(): number {
        return this.mesh?.fillFlags ?? FillFlags.None;
    }

    public get supportsThematicDisplay(): boolean {
        return !this.isGlyph;
    }

    constructor(
        mesh: MeshData,
        positions: Float32Array,
        normals?: Float32Array,
        uvs?: Float32Array,
        indices?: Uint32Array | Uint16Array
    ) {
        // 调用父类构造函数初始化基础几何数据
        super({
            positions,
            normals,
            uvs,
            indices,
            isPlanar: mesh.isPlanar
        });

        this.mesh = mesh;
    }

    public createMesh(): THREE.Mesh {
        // 创建基础材质（使用默认渲染通道和目标）
        const material = this.createMaterialForPass("opaque", undefined);

        // 创建并返回 THREE.Mesh 实例
        return new THREE.Mesh(this, material);
    }

    static create(mesh: MeshData, params: MeshParams): SurfaceGeometry | undefined {
        try {
            // 从params提取数据
            const positions = this.extractPositions(params);
            const indices = this.extractIndices(params);

            if (!positions || positions.length === 0) return undefined;

            return new SurfaceGeometry(mesh, positions, undefined, undefined, indices);
        } catch (e) {
            return undefined;
        }
    }

    // 数据提取方法
    private static extractPositions(params: MeshParams): Float32Array {
        if (!params.vertices?.data) throw new Error("Missing vertex data");
        return new Float32Array(params.vertices.data);
    }

    private static extractIndices(params: MeshParams): Uint16Array | Uint32Array | undefined {
        if (!params.surface.indices?.data) return undefined;

        const indexData = params.surface.indices.data;
        return indexData.length < 65535 ? new Uint16Array(indexData) : new Uint32Array(indexData);
    }

    // 资源清理
    public dispose(): void {
        super.dispose();

        // 清理纹理资源
        if (this.textureParams?.textureMap) {
            this.textureParams.textureMap.dispose();
        }
        if (this.textureParams?.normalMap) {
            this.textureParams.normalMap.dispose();
        }
    }
}
