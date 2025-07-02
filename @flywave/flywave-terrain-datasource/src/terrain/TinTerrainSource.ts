import {
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection,
    TileKey,
    TilingScheme
} from "@flywave/flywave-geoutils";

import { TerrainSource } from "../TerrainSource";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { TerrainDataProvider } from "./TerrainDataProvider";
import { TerrainTile, TerrainTileFactory } from "./TerrainTile";
import { QUANTIZED_MESH_TILE_DECODER_ID } from "./TileDecoder";
import { TinTerrainProvider } from "./TinTerrainProvider";
import { TinWorkerBasedDecoder } from "./WorkTileDecoder";

interface TinTerrainSourceOptions {
    url: string;
    scriptUrl?: string;
    requestWaterMask?: boolean;
    requestVertexNormals?: boolean;
    requestMetadata?: boolean;
    maxDisplayLevel?: number;
    [key: string]: any; // For additional options
}

export class TinTerrainSource extends TerrainSource<TerrainTile> {
    private readonly _baseUrl: string;
    public dataTerrainProvider: TerrainDataProvider;

    constructor(options: TinTerrainSourceOptions) {
        super({
            concurrentDecoderServiceName: QUANTIZED_MESH_TILE_DECODER_ID,
            name: "terrain_data_source",
            maxDisplayLevel: 22,
            requestWaterMask: options.requestWaterMask,
            ...options,
            tilingScheme: new TilingScheme(
                halfQuadTreeSubdivisionScheme,
                normalizedEquirectangularProjection
            ),
            tileFactory: TerrainTileFactory,
            dataProvider: new TinTerrainProvider(options),
            elevationRangeSource: new ElevationRangeSource(),
            elevationProvider: new ElevationProvider(),
            decoder: new TinWorkerBasedDecoder(QUANTIZED_MESH_TILE_DECODER_ID, options.scriptUrl)
        });

        this.dataTerrainProvider = new TerrainDataProvider(
            {
                ...options,
                requestVertexNormals: true
            },
            this
        );
        this._baseUrl = options.url;
    }

    get baseUrl(): string {
        return this._baseUrl;
    }

    async connect(): Promise<void> | undefined {
        await super.connect();
        return await this.dataTerrainProvider.connect();
    }

    ready(): boolean {
        return !!this.dataTerrainProvider.ready();
    }

    shouldSubdivide(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        if (zoomLevel === undefined) return false;
        if (!this.dataProvider) return false;

        const dataProvider = this.dataProvider() as TinTerrainProvider;
        const shouldSubdivide = !(
            this.dataTerrainProvider.getTileDataAvailable(tileKey) &&
            !dataProvider.tileIsAvailable(tileKey)
        );
        return shouldSubdivide && tileKey.level <= zoomLevel;
    }

    canGetTile(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        if (zoomLevel === undefined) return false;
        return tileKey.level <= zoomLevel;
    }
}
