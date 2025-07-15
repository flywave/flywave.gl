import * as THREE from "three";

import { Material } from "../decoder";
import { TextureCacheLoader } from "./Texture";

export interface ColorRGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

export function rgbaToHex(color: ColorRGBA): string {
    const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export class MaterialGroup {
    private readonly materials?: Material[];
    private readonly textureCache: TextureCacheLoader;
    private readonly texturePath: string;

    constructor(materials?: Material[], textureCache?: TextureCacheLoader, texturePath?: string) {
        this.materials = materials;
        this.textureCache = textureCache || new TextureCacheLoader();
        this.texturePath = texturePath;
    }

    // 获取所有纹理映射
    getAllAtlasMappings(): Array<{
        uvTransform: THREE.Vector4;
        color?: THREE.Color;
    }> {
        const mappings: Array<{
            uvTransform: THREE.Vector4;
            color?: THREE.Color;
        }> = [];
        this.materials.forEach((material, index) => {
            mappings[index] = {
                uvTransform: new THREE.Vector4().fromArray(this.getTextureRect(index)),
                color: new THREE.Color(material.color.r, material.color.g, material.color.b)
            };
        });
        return mappings;
    }

    // 获取地层颜色
    getColor(materialId: number): ColorRGBA | undefined {
        if (materialId >= this.materials.length) {
            return undefined;
        }
        return this.materials[materialId].color;
    }

    // 获取纹理（异步）
    getTextureRect(materialId: number): [number, number, number, number] {
        if (materialId >= this.materials.length) {
            return undefined;
        }
        return this.materials[materialId].texture;
    }

    async getTexture(): Promise<THREE.Texture | undefined> {
        if (!this.texturePath) return undefined;

        try {
            return await this.textureCache.getTexture(this.texturePath, this.texturePath);
        } catch (e) {
            return undefined;
        }
    }
}
