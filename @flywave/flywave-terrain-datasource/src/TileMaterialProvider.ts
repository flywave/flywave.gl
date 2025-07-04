import { DecodedTile } from "@flywave/flywave-datasource-protocol";
import { TileKey } from "@flywave/flywave-geoutils";
import { Tile } from "@flywave/flywave-mapview";
import type { Blending, Material } from "three";

export interface CachePolicy {
    maxAge: number; // 缓存最大存活时间（毫秒）
    priority?: number; // 缓存优先级（0-1）
}

// 新增缓存管理器接口
export interface TileCacheManager {
    has(key: TileKey): boolean;
    get(key: TileKey):
        | {
              material: Material;
              timestamp: number;
              policy: MaterialOptions["cachePolicy"];
          }
        | undefined;
    set(key: TileKey, value: Material, policy?: MaterialOptions["cachePolicy"]): void;
    delete(key: TileKey): void;
    clear(): void;
}

export interface MaterialOptions {
    /**
     * 纹理混合模式配置
     * @example 'multiply'
     */
    blendModes?: Blending;

    /**
     * Opacity of the rendered images.
     * @defaultValue 1.0
     */
    opacity?: number;

    /**
     * Force Material to use transparency from texture if available
     * @defaultValue false
     */
    transparent?: boolean;

    /**
     * 缓存策略配置
     * @defaultValue { maxAge: 300000 } // 默认5分钟缓存
     */
    cachePolicy?: CachePolicy;
}

export interface TileMaterialProvider {
    /**
     * 异步加载地形瓦片材质（新增缓存上下文参数）
     * @param cacheContext 提供缓存管理器的引用
     */
    getTexture(
        mapTile: Tile,
        decodedTile: DecodedTile,
        options: MaterialOptions,
        abortSignal?: AbortSignal,
        cacheContext?: {
            cacheManager: TileCacheManager; // 缓存管理器接口
            cacheKey: string; // 唯一缓存标识
        }
    ): Promise<Material | undefined>;

    /**
     * 可选 - 预加载纹理等资源
     * @param tile 预加载的目标瓦片
     */
    preload?(tile: TileKey): Promise<void>;

    // 新增缓存管理方法
    /**
     * 按条件清除缓存
     * @param filter 缓存过滤条件
     * (tileKey: TileKey, timestamp: number) => boolean
     */
    clearCache?(filter?: (tileKey: TileKey, timestamp: number) => boolean): void;

    /**
     * 更新缓存策略
     * @param newPolicy 新缓存策略配置
     */
    updateCachePolicy?(newPolicy: CachePolicy): void;

    /**
     * 可选 - 释放材质相关资源
     * @param material 需要释放的材质
     */
    dispose?(material: Material): void;
}
