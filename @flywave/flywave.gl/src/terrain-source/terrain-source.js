import {
    quadTreeSubdivisionScheme,
    webMercatorProjection,
    TilingScheme
} from "@flywave/flywave-geoutils";
import { Math2D } from "@flywave/flywave-utils";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TileDataSource } from "@flywave/flywave-mapview-decoder";
import config from "../config";
import { Matrix4 } from "three";

// let tempMaterix = new Matrix4();
export class TerrainSource extends TileDataSource {
    constructor(options) {
        super(options.tileFactory, {
            tilingScheme:
                options.tilingScheme ||
                new TilingScheme(quadTreeSubdivisionScheme, webMercatorProjection),
            dataProvider: options.dataProvider,
            enablePicking: false,
            useWorker: true,
            concurrentDecoderScriptUrl: config.DECODER_URL,
            ...options
        });

        this.dataProvider().bindDataSource(this);

        this.options = options;

        this.elevationRangeSource = options.elevationRangeSource;
        this.elevationProvider = options.elevationProvider;
        if (this.elevationRangeSource) this.elevationRangeSource.bindDataSource(this);
        if (this.elevationProvider) this.elevationProvider.bindDataSource(this);
    }

    get baseUrl() {
        throw "no imple";
    }

    async getTheme() {
        return;
    }

    onCameraChange = () => {
        this._onCameraChange = true;
    };

    // afterRender = () => {
    //     if(this.isDetached())return;
    //     this._onCameraChange = false;
    //     tempMaterix.identity();
    //     tempMaterix.setPosition(this.mapView.camera.position);
    //     tempMaterix.invert();
    // };
  
    addMaterialProviders(provider) {
        this.application.addMaterialProviders(provider);
    }

    removeMaterialProviders(provider) {
        provider.remove();
    }

    getMaterialProviders() {
        return this.application.materialProviders;
    }

    connect() {
        return Promise.all([this.decoder.connect()]).then(() => {
            this.mapView.addEventListener(
                MapViewEventNames.CameraPositionChanged,
                this.onCameraChange
            );
            // this.mapView.addEventListener(MapViewEventNames.Render, this.afterRender);
        });
    }

    ready() {
        return true;
    }

    taskIsRuning = false;

    updateTileJobs = {};

    updateTileOverlayer = tile => {
        var job = () => {
            if (this.isDetached()) return;
            if (tile) {
                const { latitude: minLat, longitude: minLng } = tile.geoBox.southWest;
                const { latitude: maxLat, longitude: maxLng } = tile.geoBox.northEast;
                var fbbox = new Math2D.Box(minLng, minLat, maxLng - minLng, maxLat - minLat);
            }
            this.mapView.clearTileCache(
                this.name,
                tile
                    ? tile => {
                          const { latitude: minLat, longitude: minLng } = tile.geoBox.southWest;
                          const { latitude: maxLat, longitude: maxLng } = tile.geoBox.northEast;
                          return new Math2D.Box(
                              minLng,
                              minLat,
                              maxLng - minLng,
                              maxLat - minLat
                          ).intersects(fbbox);
                      }
                    : undefined
            );
        };
        if (this._onCameraChange && tile && tile.tileKey.level > 10) {
            this.updateTileJobs[tile.tileKey.mortonCode()] = { job, tile };

            if (!this.taskIsRuning) {
                if (this.isDetached()) return;
                this.taskIsRuning = true;
                this.mapView.taskQueue.add({
                    execute: () => {
                        try {
                            this.taskIsRuning = false;
                            for (var i in this.updateTileJobs) {
                                this.updateTileJobs[i].job(this.updateTileJobs[i].tile);
                            }
                            this.updateTileJobs = {};
                            return;
                        } catch {
                            reject();
                        }
                    },
                    getPriority: () => {
                        return 100-tile.tileKey.level;
                    },
                    group: "create"
                });
            }
        } else {
            job();
        }
    };

    shouldSubdivide(zoomLevel, tileKey) {
        if (zoomLevel == undefined) return false;
        return tileKey.level <= zoomLevel;
    }

    canGetTile(zoomLevel, tileKey) {
        if (zoomLevel == undefined) return false;
        return tileKey.level <= zoomLevel;
    }

    getElevationRangeSource() {
        return this.elevationRangeSource;
    }

    getElevationProvider() {
        return this.elevationProvider;
    }

    get wireframe() {
        return this.terrainWireframe;
    }
}
