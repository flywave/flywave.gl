import { TerrainSource } from "../terrain-source";
import {
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection,
    TilingScheme
} from "@flywave/flywave-geoutils";
import { TinTerrainProvider } from "../tin-terrain/tin-terrain-provider";
import { StratumTileFactory } from "./stratum-tile";
import { DataStratumProvider } from "./data-stratum-provider";
import { QUANTIZED_MESH_TILE_DECODER_ID } from "../tin-terrain/constants";
import config from "../../config";
import { DoubleSide } from "three";

class StratumSource extends TerrainSource {
    constructor(options) {
        super({
            concurrentDecoderServiceName: QUANTIZED_MESH_TILE_DECODER_ID,
            name: "stratum_terrain_data_source",
            maxDisplayLevel: 22,
            ...options,
            tilingScheme: new TilingScheme(
                halfQuadTreeSubdivisionScheme,
                normalizedEquirectangularProjection
            ),
            tileFactory: new StratumTileFactory(),
            dataProvider: new TinTerrainProvider({ ...options, requestWaterMask: false }),
            decoderUrl: config.DECODER_URL
        });

        this.dataTerrainProvider = new DataStratumProvider(
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

    getMaterialProviders() {}

    getMaterialById(id) {
        return new THREE.MeshPhongMaterial({side:DoubleSide,color:0xffffff*Math.random()});
    }
}

export default StratumSource;
