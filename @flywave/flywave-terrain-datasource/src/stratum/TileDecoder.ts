import {
    DecodedTile,
    DecoderOptions,
    ITileDecoder,
    OptionsMap,
    RequestController,
    TileInfo
} from "@flywave/flywave-datasource-protocol";
import { Projection, TileKey } from "@flywave/flywave-geoutils";

import { offScreenCanvasManagerRender } from "../terrain/RenderHeightmap";
import { StratumTile } from "./tile/StratumTile";

export const STRATUM_TILE_DECODER_ID = "stratum-tile-decoder";

export class StratumTileDecoder implements ITileDecoder {
    private _offScreenCanvasId?: string;
    private _resolve!: () => void;
    private _reject!: (reason?: any) => void;
    private readonly configurePromise: Promise<void>;

    constructor() {
        this.configurePromise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    dispose() {
        // 清理资源
    }

    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        const offScreenCanvas = customOptions?.get("offScreenCanvas") as
            | OffscreenCanvas
            | undefined;
        const offScreenCanvasId = customOptions?.get("offScreenCanvasId") as string | undefined;

        if (offScreenCanvas) {
            offScreenCanvasManagerRender.addOffScreenCanvas(offScreenCanvasId!, offScreenCanvas);
            this._offScreenCanvasId = offScreenCanvasId;
            this._resolve();
        }
    }

    async decodeTile(
        data: any,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile | undefined> {
        await this.configurePromise;

        // 创建地层瓦片实例
        const stratumTile = new StratumTile(tileKey, data);

        // 构建DecodedTile结构
        const decodedTile = {
            techniques: [],
            geometries: [],
            transferable: [],
            stratumTile
        } as DecodedTile;

        return decodedTile;
    }
}
