import { TinTerrainProvider } from "./tin-terrain-provider";
import { TinTileFactory } from "./terrain-tile";
import { ElevationRangeSource } from "./elevation-range-source";
import { ElevationProvider } from "./elevation-provider";

import { TerrainSource } from "../terrain-source";
import {
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection,
    TilingScheme,
} from '@flywave/flywave-geoutils'
import { DataTerrainProvider } from "./data-terrain-provider";
import { QUANTIZED_MESH_TILE_DECODER_ID } from "../tin-terrain/constants";

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
            tilingScheme: new TilingScheme(halfQuadTreeSubdivisionScheme, normalizedEquirectangularProjection),
            tileFactory: new TinTileFactory(),
            dataProvider: new TinTerrainProvider(options),
            elevationRangeSource: new ElevationRangeSource(),
            elevationProvider: new ElevationProvider()
        });

        this.dataTerrainProvider = new DataTerrainProvider({ ...options, requestVertexNormals: true }, this);

        this._baseUrl = options.url;
    }

    connect() {
        return super.connect().then(() => {
            return this.dataTerrainProvider.connect();
        });
    }

    ready() {
        return !!this.dataTerrainProvider._ready;
    }
}