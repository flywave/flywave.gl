import { TinTerrainProvider } from "./tin-terrain-provider";
import { TinTileFactory } from "./terrain-tile";
import { ElevationRangeSource } from "./elevation-range-source";
import { ElevationProvider } from "./elevation-provider";

import { TerrainSource } from "../terrain-source";
import {
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection,
    TilingScheme
} from "@flywave/flywave-geoutils";
import { DataTerrainProvider } from "./data-terrain-provider";
import { QUANTIZED_MESH_TILE_DECODER_ID } from "../tin-terrain/constants";
import { TinWorkerBasedDecoder } from "./work-tile-decoder";
import config from "../../config";

export class TinTerrainSource extends TerrainSource {
    hasWaterMask = false;

    hasVertexNormals = false;

    constructor(options) {
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
            tileFactory: new TinTileFactory(),
            dataProvider: new TinTerrainProvider(options),
            elevationRangeSource: new ElevationRangeSource(),
            elevationProvider: new ElevationProvider(),
            decoder: new TinWorkerBasedDecoder(QUANTIZED_MESH_TILE_DECODER_ID, config.DECODER_URL)
        });

        this.dataTerrainProvider = new DataTerrainProvider(
            { ...options, requestVertexNormals: true },
            this
        );

        this._baseUrl = options.url;
    }

    get baseUrl() {
        return this._baseUrl;
    }

    connect() {
        return super.connect().then(() => {
            return this.dataTerrainProvider.connect();
        });
    }

    ready() {
        return !!this.dataTerrainProvider._ready;
    }

    shouldSubdivide(zoomLevel, tileKey) {
        if (zoomLevel == undefined) return false;
        if (!this.dataProvider) return false;
        let shouldSubdivide = !(
            this.dataTerrainProvider.getTileDataAvailable(tileKey) &&
            !this.dataProvider().tileIsAvailable(tileKey)
        );
        return shouldSubdivide && tileKey.level <= zoomLevel;
    }

    canGetTile(zoomLevel, tileKey) {
        if (zoomLevel == undefined) return false;
        return tileKey.level <= zoomLevel;
    }
}
