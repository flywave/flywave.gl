import * as THREE from "three";
export declare class TextureCacheLoader {
    private readonly baseUrl;
    private readonly defaultSize;
    private readonly _cache;
    private readonly _loader;
    constructor(baseUrl?: string, defaultSize?: number);
    hasTexture(key: string): boolean;
    getTexture(key: string, texturePath?: string): Promise<THREE.Texture | undefined>;
    setTexture(key: string, texture: THREE.Texture): void;
    clearCache(): void;
    get size(): number;
}
