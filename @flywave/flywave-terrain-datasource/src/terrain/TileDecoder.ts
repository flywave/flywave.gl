import {
    DecodedTile,
    DecoderOptions,
    ITileDecoder,
    OptionsMap,
    RequestController,
    TileInfo
} from "@flywave/flywave-datasource-protocol";
import { Projection, TileKey } from "@flywave/flywave-geoutils";

import { createVerticesFromQuantizedTerrainMesh } from "./decoder/QuantizedTerrainMesh";
import { upsampleQuantizedTerrainMesh } from "./decoder/UpsampleTerrainMesh";
import { offScreenCanvasManagerRender } from "./RenderHeightmap";

export const QUANTIZED_MESH_TILE_DECODER_ID = "quantized-mesh-tile-decoder";

export class QuantizedMeshTileDecoder implements ITileDecoder {
    private _offScreenCanvasId?: string;
    private _resolve!: () => void;
    private _reject!: (reason?: any) => void;
    private readonly configurePromise: Promise<void>;

    constructor() {
        // 初始化配置Promise
        this.configurePromise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    dispose() {
        // no impl
    }

    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        // 配置离线画布（从customOptions读取）
        const offScreenCanvas = customOptions?.get("offScreenCanvas") as
            | OffscreenCanvas
            | undefined;
        const offScreenCanvasId = customOptions?.get("offScreenCanvasId") as string | undefined;

        if (offScreenCanvas) {
            offScreenCanvasManagerRender.addOffScreenCanvas(offScreenCanvasId!, offScreenCanvas);
            this._offScreenCanvasId = offScreenCanvasId;
            this._resolve(); // 配置完成解析Promise
        }
    }

    async decodeTile(
        data: any,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile | undefined> {
        await this.configurePromise;

        data.offScreenCanvasId = this._offScreenCanvasId;
        var transferableObjects = [];
        var tileTerrain = data.upsample
            ? upsampleQuantizedTerrainMesh(data, transferableObjects, projection, tileKey)
            : createVerticesFromQuantizedTerrainMesh(
                  data,
                  transferableObjects,
                  projection,
                  tileKey
              );

        const verityTile = {
            techniques: [],
            geometries: [],
            tileTerrain
        } as DecodedTile;

        return verityTile;
    }
}
