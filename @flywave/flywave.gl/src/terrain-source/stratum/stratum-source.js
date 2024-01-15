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
import { TinWorkerBasedDecoder } from "../tin-terrain/work-tile-decoder";
import { ElevationRangeSource } from "../tin-terrain/elevation-range-source";
import StratumElevationProvider from "./elevation-provider";
import StratumDrillSource from "./stratum-drill-source";

class TinStratumTerrainProvider extends TinTerrainProvider {
    requestUpsampleTile() {}
}

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
            elevationRangeSource: new ElevationRangeSource(),
            dataProvider: new TinStratumTerrainProvider({
                ...options,
                requestWaterMask: false
            }),
            elevationProvider: new StratumElevationProvider(),
            decoder: new TinWorkerBasedDecoder(QUANTIZED_MESH_TILE_DECODER_ID, config.DECODER_URL)
        });
        this.csgDecoder = new TinWorkerBasedDecoder(CSG_STRATUM_DECODER, config.DECODER_URL);

        this.dataTerrainProvider = new DataStratumProvider(
            { ...options, requestVertexNormals: true, skirtHeight: 0 },
            this
        );

        this._baseUrl = options.url;

        this._materialProvider = options.materialProvider || new MaterialProvider();

        this._stratumTheme = options.stratumTheme;

        this.displayDrill = options.displayDrill || true;
    }

    get baseUrl() {
        return this._baseUrl;
    }

    _displayDrill = false;
    get displayDrill() {
        return this._displayDrill;
    }

    _displayDrillPromise;
    set displayDrill(enable) {
        this._displayDrill = enable;
        if (!this._stratumDrillSource) return;
        return (this._displayDrillPromise || Promise.resolve()).then(() => {
            if (this.isDetached()) {
                return;
            }
            if (this._displayDrill) {
                if (this._stratumDrillSource.isDetached()) {
                    this._displayDrillPromise = this.mapView
                        .addDataSource(this._stratumDrillSource)
                        .then(() => {
                            delete this._displayDrillPromise;
                            this._stratumDrillSource.updateTheme();
                        });
                }
            } else {
                if (!this._stratumDrillSource.isDetached()) {
                    this._displayDrillPromise = this.mapView
                        .removeDataSource(this._stratumDrillSource)
                        .then(() => {
                            delete this._displayDrillPromise;
                            this._stratumDrillSource.updateTheme();
                        });
                }
            }
        });
    }

    configure() {
        return super.configure().then(() => {
            return this.csgDecoder.configure();
        });
    }

    connect() {
        return super
            .connect()
            .then(() => {
                return this.dataTerrainProvider.connect();
            })
            .then(() => {
                return this.csgDecoder.connect();
            })
            .then(() => {
                this.csgDecoder.configure({});
            })
            .then(() => {
                this._stratumDrillSource = new StratumDrillSource(
                    config.DECODER_URL,
                    this,
                    this._stratumTheme,
                    this.dataTerrainProvider.overallMaxZoom
                );

                this._stratumDrillSource.updateSourceDrill();
                this.displayDrill = this.displayDrill;
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

    updateCsgData() {
        this.dataTerrainProvider.updateCsgData();
    }

    removeCsgData(id) {
        this.dataTerrainProvider.removeCsgData(id);
    }
}

export default StratumSource;
