export interface ImpostorConfig {
    frameSize: number;
    isFullSphere: boolean;
    resolution: number;
    dilationDistance: number;
}

export const DEFAULT_IMPOSTOR_CONFIG: ImpostorConfig = {
    frameSize: 16,
    isFullSphere: true,
    resolution: 1024,
    dilationDistance: 32
};

export interface ImpostorData {
    version: number;
    frames: [number, number];
    isFullSphere: boolean;
    scale: number;
    aabbMax: number;
    positionOffset: [number, number, number];
    aabb: {
        min: [number, number, number];
        max: [number, number, number];
    };
    textures: {
        albedo: string;
        normal: string;
        depth: string;
        orm: string;
    };
}

export interface BakedTextures {
    albedo: Uint8ClampedArray;
    normal: Uint8ClampedArray;
    depth: Uint8ClampedArray;
    orm: Uint8ClampedArray;
    width: number;
    height: number;
}
