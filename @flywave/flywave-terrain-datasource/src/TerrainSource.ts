import {
    quadTreeSubdivisionScheme,
    TileKey,
    TilingScheme,
    webMercatorProjection
} from "@flywave/flywave-geoutils";
import { MapViewEventNames, Tile } from "@flywave/flywave-mapview";
import {
    TileDataSource,
    TileDataSourceOptions as PTileDataSourceOptions
} from "@flywave/flywave-mapview-decoder";
import { Math2D } from "@flywave/flywave-utils";

export interface TerrainSourceOptions extends PTileDataSourceOptions {
    elevationRangeSource?: any;
    elevationProvider?: any;
    [key: string]: any;
}

interface UpdateTileJob {
    job: (tile?: Tile) => void;
    tile?: Tile;
}

export class TerrainSource extends TileDataSource {
    private readonly options: TerrainSourceOptions;
    private readonly elevationRangeSource?: any;
    private readonly elevationProvider?: any;
    private _onCameraChange: boolean = false;
    private taskIsRuning: boolean = false;
    private updateTileJobs: Record<string, UpdateTileJob> = {};
    private readonly terrainWireframe: boolean = false;

    constructor(options: TerrainSourceOptions) {
        super(options.tileFactory, {
            tilingScheme:
                options.tilingScheme ||
                new TilingScheme(quadTreeSubdivisionScheme, webMercatorProjection),
            dataProvider: options.dataProvider,
            enablePicking: false,
            ...options
        });

        this.dataProvider().bindDataSource(this);

        this.options = options;

        this.elevationRangeSource = options.elevationRangeSource;
        this.elevationProvider = options.elevationProvider;
        if (this.elevationRangeSource) this.elevationRangeSource.bindDataSource(this);
        if (this.elevationProvider) this.elevationProvider.bindDataSource(this);
    }

    get baseUrl(): string {
        throw new Error("no implementation");
    }

    async getTheme(): Promise<void> {
        return;
    }

    onCameraChange = (): void => {
        this._onCameraChange = true;
    };

    addMaterialProviders(provider: any): void {
        //this.application.addMaterialProviders(provider);
    }

    removeMaterialProviders(provider: any): void {
        provider.remove();
    }

    connect(): Promise<void> | undefined {
        return Promise.all([this.decoder.connect()]).then(() => {
            this.mapView.addEventListener(
                MapViewEventNames.CameraPositionChanged,
                this.onCameraChange
            );
        });
    }

    ready(): boolean {
        return true;
    }

    updateTileOverlayer = (tile?: Tile): void => {
        const job = (): void => {
            if (this.isDetached()) return;
            let fbbox: Math2D.Box | undefined;
            if (tile) {
                const { latitude: minLat, longitude: minLng } = tile.geoBox.southWest;
                const { latitude: maxLat, longitude: maxLng } = tile.geoBox.northEast;
                fbbox = new Math2D.Box(minLng, minLat, maxLng - minLng, maxLat - minLat);
            }

            this.mapView.clearTileCache(
                this.name,
                tile
                    ? (tile: Tile) => {
                          const { latitude: minLat, longitude: minLng } = tile.geoBox.southWest;
                          const { latitude: maxLat, longitude: maxLng } = tile.geoBox.northEast;
                          const tileBox = new Math2D.Box(
                              minLng,
                              minLat,
                              maxLng - minLng,
                              maxLat - minLat
                          );
                          return fbbox ? tileBox.intersects(fbbox) : false;
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
                            for (const i in this.updateTileJobs) {
                                this.updateTileJobs[i].job(this.updateTileJobs[i].tile);
                            }
                            this.updateTileJobs = {};
                        } catch (error) {}
                    },
                    getPriority: () => {
                        return 100 - (tile?.tileKey.level || 0);
                    },
                    group: "create"
                });
            }
        } else {
            job();
        }
    };

    shouldSubdivide(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        if (zoomLevel === undefined) return false;
        return tileKey.level <= zoomLevel;
    }

    canGetTile(zoomLevel: number | undefined, tileKey: TileKey): boolean {
        if (zoomLevel === undefined) return false;
        return tileKey.level <= zoomLevel;
    }

    getElevationRangeSource(): any {
        return this.elevationRangeSource;
    }

    getElevationProvider(): any {
        return this.elevationProvider;
    }

    get wireframe(): boolean {
        return this.terrainWireframe;
    }
}
