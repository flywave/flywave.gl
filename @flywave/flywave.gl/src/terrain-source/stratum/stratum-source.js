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
import { CSG_STRATUM_DECODER } from "./constants";
import config from "../../config";
import { DoubleSide, FrontSide } from "three";
import { StratumCSGDecoder } from "./stratum-csg-decoder";

class MaterialProvider {
    getMaterial(gropuId) {
        return new THREE.MeshPhongMaterial({ side: DoubleSide, color: 0xffffff * Math.random() });
    }
}

export { MaterialProvider };

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
            dataProvider: new TinTerrainProvider({
                ...options,
                requestWaterMask: false
            }),
            decoderUrl: config.DECODER_URL
        });
        this.csgDecoder = new StratumCSGDecoder(CSG_STRATUM_DECODER, config.DECODER_URL);

        this.dataTerrainProvider = new DataStratumProvider(
            { ...options, requestVertexNormals: true, skirtHeight: 0 },
            this
        );

        this._baseUrl = options.url;

        this._materialProvider = options.materialProvider || new MaterialProvider();
    }

    get baseUrl() {
        return this._baseUrl;
    }

    connect() {
        return super
            .connect()
            .then(() => {
                return this.dataTerrainProvider.connect();
            })
            .then(() => {
                return this.csgDecoder.connect();
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
        return shouldSubdivide && tileKey.level < this.dataTerrainProvider.overallMaxZoom + 1;
    }

    canGetTile(zoomLevel, tileKey) {
        if (zoomLevel == undefined) return false;
        return tileKey.level <= this.dataTerrainProvider.overallMaxZoom + 1;
    }

    getMaterialProviders() {}

    getMaterialById(gropuId) {
        return this._materialProvider.getMaterial(gropuId);
    }

    addCsgData(csgdata) {
        this.dataTerrainProvider.addCsgData(csgdata);
    }

    removeCsgData(id) {
        this.dataTerrainProvider.removeCsgData(id);
    }
}

export default StratumSource;
