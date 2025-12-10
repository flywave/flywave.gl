/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

export class TextureCacheLoader {
    private readonly _cache = new Map<string, THREE.Texture>();
    private readonly _loader = new THREE.TextureLoader();

    constructor(
        private readonly baseUrl: string = "",
        private readonly defaultSize: number = 512
    ) {}

    hasTexture(key: string) {
        return this._cache.has(key);
    }

    async getTexture(key: string, texturePath?: string): Promise<THREE.Texture | undefined> {
        if (this._cache.has(key)) {
            return this._cache.get(key);
        }

        if (!texturePath) return undefined;

        try {
            const response = await fetch(`${this.baseUrl}/${texturePath}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const texture = await new Promise<THREE.Texture>((resolve, reject) => {
                this._loader.load(objectUrl, resolve, undefined, () => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error(`Texture load failed: ${texturePath}`));
                });
            });

            texture.flipY = false;
            texture.needsUpdate = true;

            this._cache.set(key, texture);
            return texture;
        } catch (error) {
            return undefined;
        }
    }

    setTexture(key: string, texture: THREE.Texture) {
        this._cache.set(key, texture);
    }

    clearCache() {
        this._cache.forEach(texture => {
            texture.dispose();
        });
        this._cache.clear();
    }

    get size() {
        return this._cache.size;
    }
}
