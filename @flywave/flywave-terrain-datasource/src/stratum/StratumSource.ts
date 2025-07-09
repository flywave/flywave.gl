import {
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection,
    TileKey,
    TilingScheme
} from "@flywave/flywave-geoutils";

import { TerrainSource } from "../TerrainSource";
import { StratumProvider } from "./StratumProvider";
import { STRATUM_TILE_DECODER_ID } from "./TileDecoder";
import { StratumWorkerBasedDecoder } from "./WorkTileDecoder";

interface StratumSourceOptions {
    url: string;
    scriptUrl?: string;
    maxDisplayLevel?: number;
    [key: string]: any;
}

export class StratumSource extends TerrainSource<StratumTile> {
    private readonly _baseUrl: string;
    public dataStratumProvider: StratumProvider;

    constructor(options: StratumSourceOptions) {
        super({
            concurrentDecoderServiceName: STRATUM_TILE_DECODER_ID,
            name: "stratum_data_source",
            maxDisplayLevel: 18,
            requestVertexNormals: true,
            ...options,
            tilingScheme: new TilingScheme(
                halfQuadTreeSubdivisionScheme,
                normalizedEquirectangularProjection
            ),
            tileFactory: StratumTile,
            dataProvider: new StratumProvider(options),
            decoder: new StratumWorkerBasedDecoder(STRATUM_TILE_DECODER_ID, options.scriptUrl)
        });
        this._baseUrl = options.url;
    }

    get baseUrl(): string {
        return this._baseUrl;
    }

    async connect(): Promise<void> {
        await super.connect();
        return await this.dataStratumProvider.connect();
    }

    ready(): boolean {
        return !!this.dataStratumProvider?.ready();
    }

    shouldSubdivide(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        if (!zoomLevel || !this.dataProvider) return false;

        const provider = this.dataProvider() as StratumProvider;
        const dataAvailable = this.dataStratumProvider.getStratumDataAvailable(tileKey);

        return !dataAvailable && tileKey.level <= zoomLevel && provider.tileIsAvailable(tileKey);
    }

    canGetTile(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        return (
            !!zoomLevel &&
            tileKey.level <= zoomLevel &&
            this.dataStratumProvider.hasStratumData(tileKey)
        );
    }
}
