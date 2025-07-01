import { DecodedTile } from "@flywave/flywave-datasource-protocol";
import { TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { TileDataSource } from "@flywave/flywave-mapview-decoder";
import { Material } from "three";

import { QuantizedMeshDecoderOptions } from "./quantized-mesh/Decoder";
import { TerrainDataProvider } from "./TerrainDataProvider";
import { TerrainTile, TerrainTileFactory } from "./TerrainTile";

export interface TerrainDataSourceOptions {
    concurrentDecoderScriptUrl: string;
    tilingScheme: TilingScheme;
    fetchTile: (tileKey: TileKey) => Promise<ArrayBuffer>;
    getTileMaterial?: (tile: TerrainTile, decodedTile: DecodedTile) => Promise<Material>;
    decoderOptions?: QuantizedMeshDecoderOptions;
    getCustomObjects?: (terrainTile: TerrainTile) => Promise<any> | void;
    getDisplayZoomLevel?: (level: number) => number;
}

export class TerrainDataSource extends TileDataSource {
    private readonly options: TerrainDataSourceOptions;

    constructor(options: TerrainDataSourceOptions) {
        if (options.tilingScheme === undefined) {
            throw new Error('No "tilingScheme" option provided.');
        }

        if (options.concurrentDecoderScriptUrl === undefined) {
            throw new Error(
                'No "concurrentDecoderScriptUrl" option provided. ' +
                    "It should be URL of a decoder worker used to decode tiles."
            );
        }

        const tileFactory = new TerrainTileFactory(options);

        super(tileFactory, {
            name: "terrain",
            tilingScheme: options.tilingScheme,
            dataProvider: new TerrainDataProvider(options.fetchTile),
            concurrentDecoderServiceName: "quantized-mesh-tile-decoder",
            concurrentDecoderScriptUrl: options.concurrentDecoderScriptUrl
        });

        this.options = options;

        if (options.decoderOptions !== undefined) {
            this.decoder.connect().then(() => {
                this.decoder.configure(options.decoderOptions);
            });
        }
    }

    connect(): Promise<void> {
        return this.decoder.connect();
    }

    ready(): boolean {
        return true;
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    getDisplayZoomLevel(level: number): number {
        if (this.options.getDisplayZoomLevel !== undefined) {
            return this.options.getDisplayZoomLevel(level);
        }

        return level;
    }
}
