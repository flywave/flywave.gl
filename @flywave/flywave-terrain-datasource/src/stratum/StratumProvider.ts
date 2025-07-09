import { TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { defined, formatUrl } from "@flywave/flywave-utils";

import TileAvailability from "../terrain/TileAvailability";
import { DecodeResult } from "./decoder";
import decode from "./decoder/Stratum";

export type StratumData = DecodeResult & {
    tileKey: TileKey;
    timestamp: number;
};

function getAvailabilityTile(
    layer: StratumLayer,
    x: number,
    y: number,
    level: number
): { level: number; x: number; y: number } | undefined {
    if (level === 0) {
        return;
    }

    const availabilityLevels = layer.availabilityLevels;
    const parentLevel =
        level % availabilityLevels === 0
            ? level - availabilityLevels
            : ((level / availabilityLevels) | 0) * availabilityLevels;
    const divisor = 1 << (level - parentLevel);
    const parentX = (x / divisor) | 0;
    const parentY = (y / divisor) | 0;

    return {
        level: parentLevel,
        x: parentX,
        y: parentY
    };
}

function checkLayer(
    provider: StratumProvider,
    x: number,
    y: number,
    level: number,
    layer: StratumLayer,
    topLayer: boolean
): { result: boolean; promise?: Promise<any> } {
    if (!defined(layer.availabilityLevels)) {
        // It's definitely not in this layer
        return {
            result: false
        };
    }

    let cacheKey: string;
    const deleteFromCache = function () {
        delete layer.availabilityPromiseCache[cacheKey];
    };
    const availabilityTilesLoaded = layer.availabilityTilesLoaded;
    const availability = layer.availability;

    let tile = getAvailabilityTile(layer, x, y, level);
    while (defined(tile)) {
        if (
            availability.isTileAvailable(tile.level, tile.x, tile.y) &&
            !availabilityTilesLoaded.isTileAvailable(tile.level, tile.x, tile.y)
        ) {
            let requestPromise: Promise<any> | undefined;
            if (!topLayer) {
                cacheKey = `${tile.level}-${tile.x}-${tile.y}`;
                requestPromise = layer.availabilityPromiseCache[cacheKey];
                if (!defined(requestPromise)) {
                    requestPromise = provider.loadStratumLBuffer(tile, layer);
                    if (defined(requestPromise)) {
                        layer.availabilityPromiseCache[cacheKey] = requestPromise;
                        requestPromise.then(deleteFromCache);
                    }
                }
            }

            // The availability tile is available, but not loaded, so there
            //  is still a chance that it may become available at some point
            return {
                result: true,
                promise: requestPromise
            };
        }

        tile = getAvailabilityTile(layer, tile.x, tile.y, tile.level);
    }

    return {
        result: false
    };
}

export class StratumLayer {
    // 地层基础属性
    stratumName: string;
    lithology: string;
    thickness: number;

    // 三维可视化属性
    elevationRange: [number, number];
    colorScheme: string;
    opacity: number;
    availability: TileAvailability;

    // 数据源配置
    resource: any;
    version: string;
    tileUrlTemplates: string[];
    availabilityLevels: number = 0;

    // 数据格式标记
    isHeightmap: boolean;

    // 缓存管理
    availabilityPromiseCache: Record<string, Promise<any>> = {};
    availabilityTilesLoaded: TileAvailability;

    constructor(layer: {
        // 地层专属属性
        stratumName: string;
        lithology: string;
        thickness: number;
        elevationRange: [number, number];
        colorScheme?: string;

        // 继承自通用图层属性
        resource?: any;
        version: string;
        isHeightmap: boolean;
        tileUrlTemplates: string[];
        availabilityLevels?: number;
        availabilityTilesLoaded: TileAvailability;
    }) {
        // 地层属性初始化
        this.stratumName = layer.stratumName;
        this.lithology = layer.lithology;
        this.thickness = layer.thickness;
        this.elevationRange = layer.elevationRange;
        this.colorScheme = layer.colorScheme || "geological";

        // 通用属性初始化
        this.resource = layer.resource;
        this.version = layer.version;
        this.isHeightmap = layer.isHeightmap;
        this.tileUrlTemplates = layer.tileUrlTemplates;
        this.availabilityLevels = layer.availabilityLevels || 0;
        this.availabilityTilesLoaded = layer.availabilityTilesLoaded;
    }
}

export class StratumProvider extends DataProvider {
    // 新增核心属性
    private _ready: boolean = false;
    private _layers: StratumLayer[] = [];
    private readonly requestQueue = new Map<string, Promise<DecodeResult>>();
    private readonly priorityQueue: TileKey[] = [];
    url: string;
    request: {
        headers: Record<string, string>;
        queryString: string;
    };

    private readonly _availability: TileAvailability;
    private readonly _tilingScheme: TilingScheme;

    public get availability() {
        return this._availability;
    }

    public get tilingScheme() {
        return this._tilingScheme;
    }

    // 完善构造函数
    constructor(options: { url: string; headers?: Record<string, string>; queryString?: string }) {
        super();
        this.url = options.url;
        this.request = {
            headers: { ...options.headers, accept: "application/json" },
            queryString: options.queryString || ""
        };
    }

    // 基础方法实现
    ready(): boolean {
        return this._ready;
    }

    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        throw new Error("Method not implemented.");
    }

    protected dispose(): void {
        throw new Error("Method not implemented.");
    }

    async connect(): Promise<void> {
        // eslint-disable-next-line no-useless-catch
        try {
            const metadata = await TransferManager.instance().downloadJson(
                `${this.url}/layer.json${this.request.queryString}`,
                this.request.headers
            );
            this.parseMetadata(metadata);
            this._ready = true;
        } catch (error) {
            throw error;
        }
    }

    private parseMetadata(metadata: any) {
        // 解析地层数据特有的元数据
        if (metadata.stratumProperties) {
            // 示例：处理地层属性字段
            this._layers = metadata.layers.map((layer: any) => new StratumLayer(layer));
        }
    }

    // 新增瓦片请求核心逻辑
    public async requestTileGeometry(tileKey: TileKey): Promise<DecodeResult> {
        const cacheKey = `${tileKey.level}-${tileKey.row}-${tileKey.column}`;

        // 优先级处理
        if (!this.priorityQueue.some(t => t.equals(tileKey))) {
            this.priorityQueue.unshift(tileKey);
        }

        // 请求去重
        if (!this.requestQueue.has(cacheKey)) {
            const promise = this.loadTileData(tileKey).finally(() =>
                this.requestQueue.delete(cacheKey)
            );
            this.requestQueue.set(cacheKey, promise);
        }

        return await this.requestQueue.get(cacheKey)!;
    }

    // 新增数据加载逻辑
    private async loadTileData(tileKey: TileKey): Promise<DecodeResult> {
        const MAX_RETRY = 3;
        let retryCount = 0;

        while (retryCount < MAX_RETRY) {
            try {
                const buffer = await this.fetchTileData(tileKey);
                return this.processTileData(buffer, tileKey);
            } catch (error) {
                if (++retryCount >= MAX_RETRY) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }
        throw new Error(`Tile load failed after ${MAX_RETRY} attempts`);
    }

    // 完善数据获取
    private async fetchTileData(tileKey: TileKey): Promise<ArrayBuffer> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            return TransferManager.instance().downloadArrayBuffer(this.buildTileUrl(tileKey), {
                signal: controller.signal,
                headers: this.request.headers
            });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private processTileData(buffer: ArrayBuffer, tileKey: TileKey): StratumData {
        // 校验数据有效性
        if (!buffer || buffer.byteLength < 128) {
            throw new Error(`Invalid tile data for ${tileKey.toString()}`);
        }

        try {
            // 调用解码器处理原始数据
            const decodedData = decode(buffer);

            // 添加地层元数据
            return {
                ...decodedData,
                tileKey,
                timestamp: Date.now()
            };
        } catch (e) {
            // 记录解码错误日志
            throw new Error(`Tile decoding failed: ${e.message}`);
        }
    }

    // 新增 URL 构建方法
    private buildTileUrl(tileKey: TileKey): string {
        return formatUrl(this.url + "/tiles/{z}/{x}/{y}.stratum", {
            z: tileKey.level,
            x: tileKey.row,
            y: tileKey.column,
            version: ""
        });
    }

    hasStratumData(tileKey: TileKey): boolean {
        if (this._layers.length === 0) return false;

        const { level, column: x, row: y } = tileKey;
        return this._layers.some(
            layer => layer.availability?.isTileAvailable(level, x, y) ?? false
        );
    }

    // 精确到具体瓦片的可用性检查
    tileIsAvailable(tileKey: TileKey): boolean {
        const { level, column: x, row: y } = tileKey;
        return this._layers.some(
            layer => layer.availability?.isTileAvailable(level, x, y) ?? false
        );
    }

    getStratumDataAvailable(tileKey: TileKey): boolean | undefined {
        const { column: x, row: y, level } = tileKey;
        const adjustedLevel = level - 1;
        if (adjustedLevel < 0) return false;
        if (!defined(this._availability)) {
            return undefined;
        }

        if (adjustedLevel < this._availability.minimumLevel) {
            return false;
        }

        if (adjustedLevel > this._availability.maximumLevel) {
            return false;
        }

        if (this._availability.isTileAvailable(adjustedLevel, x, y)) {
            // If the tile is listed as available, then we are done
            return true;
        }

        const layers = this._layers;
        const count = layers.length;
        for (let i = 0; i < count; ++i) {
            const layerResult = checkLayer(this, x, y, adjustedLevel, layers[i], i === 0);
            if (layerResult.result) {
                // There is a layer that may or may not have the tile
                return undefined;
            }
        }

        return false;
    }

    public loadStratumLBuffer(
        tile: { level: number; x: number; y: number },
        layer: StratumLayer
    ): Promise<any> {
        // Implementation would go here
        return Promise.resolve();
    }
}
