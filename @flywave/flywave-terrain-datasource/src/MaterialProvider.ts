import { ITileDecoder } from "@flywave/flywave-datasource-protocol";
import { TileKey, webMercatorProjection, webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataSource, Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { DataProvider, TileLoader } from "@flywave/flywave-mapview-decoder";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import * as THREE from "three";

interface MaterialProviderOptions {
    url: string;
    [key: string]: any;
}

const imageLoader = new THREE.TextureLoader();
const downloadImageManager = new TransferManager<
    string,
    { data: Promise<THREE.Texture>; status: number }
>(url => {
    return { data: imageLoader.loadAsync(url), status: 200 };
});

export class TileMaterialLoader extends TileLoader {
    private tile: Tile;

    constructor(
        dataSource: DataSource,
        tile: Tile,
        dataProvider: DataProvider,
        decoder: ITileDecoder
    ) {
        super(dataSource, tile.tileKey, dataProvider, decoder);
        this.tile = tile;
    }

    loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataProvider
            .fetchTileMaterial(this.tileKey, abortSignal, this)
            .then((material: THREE.Texture) => {
                if (abortSignal.aborted) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }

                this.tile.material = material;
                onDone(TileLoaderState.Ready);
            })
            .catch((error: Error) => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }
}

export class MaterialProvider {
    private readonly levelRange: number[] = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18
    ];

    private readonly sortedLevelRange: number[];
    private readonly tileScheme = webMercatorTilingScheme;
    private readonly _opacity: number = 1;
    private readonly options: MaterialProviderOptions;
    private dataSource?: DataSource;
    private readonly maxLodLevel: number = 3;

    public tileMaterialCache: LRUCache<number, Tile> = new LRUCache<number, Tile>(1000);

    constructor(options?: MaterialProviderOptions) {
        this.options = options || { url: "" };
        this.sortedLevelRange = this.getLevelRange().sort((a, b) => b - a);
        this.tileMaterialCache.evictionCallback = this.evictionCallback;
    }

    get baseUrl(): string {
        return this.options.url;
    }

    bindDataSource(dataSource: DataSource): void {
        this.dataSource = dataSource;
        if (dataSource) dataSource.application.visibleTileSet.clearTileCache();
    }

    clipGeobox(geobox: any): any {
        // Replace 'any' with proper GeoBox type if available
        const geoboxCopy = geobox.clone();
        const MAXIMUM_LATITUDE_ANGLE = (1.48442222974 * 180) / Math.PI;
        geoboxCopy.southWest.latitude = THREE.MathUtils.clamp(
            geoboxCopy.southWest.latitude,
            -MAXIMUM_LATITUDE_ANGLE,
            MAXIMUM_LATITUDE_ANGLE
        );
        geoboxCopy.northEast.latitude = THREE.MathUtils.clamp(
            geoboxCopy.northEast.latitude,
            -MAXIMUM_LATITUDE_ANGLE,
            MAXIMUM_LATITUDE_ANGLE
        );
        return geoboxCopy;
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    ready(): boolean {
        return true;
    }

    isWebMercator(): boolean {
        return this.tileScheme.projection === webMercatorProjection;
    }

    loadNeareastRectangleLevel(geoBox: any, level: number): void {
        // Replace 'any' with proper GeoBox type
        const tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        tileKeys.forEach(this.loadNeareastTile);
    }

    loadNeareastTile = (tileKey: TileKey): void => {
        const maxLodLevel = this.maxLodLevel;
        const level = Math.ceil(tileKey.level / maxLodLevel);
        const tileLevel = tileKey.level;
        let curLevel = 0;

        let loadTileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);
        while (curLevel <= maxLodLevel) {
            const nextLevel = THREE.MathUtils.clamp(
                curLevel * level,
                this.sortedLevelRange[this.sortedLevelRange.length - 1],
                tileLevel
            );

            const offet = tileKey.level - nextLevel;
            loadTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offet,
                tileKey.column >> offet,
                nextLevel
            );

            {
                const levels = this.sortedLevelRange;
                let nearLevel = loadTileKey.level;
                for (let e = 0; e < levels.length; e++) {
                    nearLevel = levels[e];
                    if (loadTileKey.level >= levels[e]) {
                        break;
                    }
                }

                if (nearLevel) {
                    const offet = loadTileKey.level - nearLevel;
                    const tileKey = TileKey.fromRowColumnLevel(
                        loadTileKey.row >> offet,
                        loadTileKey.column >> offet,
                        nearLevel
                    );

                    if (!this.tileMaterialCache.has(tileKey.mortonCode())) {
                        const tile = new Tile(this.dataSource!, tileKey);
                        tile.geoBox = this.tileScheme.getGeoBox(tileKey);
                        tile.updateBoundingBox();
                        tile.tileLoader = new TileMaterialLoader(
                            this.dataSource!,
                            tile,
                            this,
                            this.dataSource!.decoder
                        );
                        tile.tileLoader.load();
                        tile.tileLoader.donePromise.then(() => {
                            this.dataSource!.updateTileOverlayer({
                                geoBox: this.tileScheme.getGeoBox(tileKey),
                                tileKey
                            });
                        });

                        this.tileMaterialCache.set(tileKey.mortonCode(), tile);
                        break;
                    } else {
                        const tile = this.tileMaterialCache.get(tileKey.mortonCode());
                        if (tile.material) {
                            curLevel++;
                            continue;
                        } else {
                            break;
                        }
                    }
                }
            }
            curLevel++;
        }
    };

    getNeareastRectangleByLevel(geoBox: any, level: number): Tile[] {
        // Replace 'any' with proper GeoBox type
        const tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        return tileKeys.map(this.getNeareastMaterialTile).filter(e => e) as Tile[];
    }

    getNeareastMaterialTile = (tileKey: TileKey): Tile | false => {
        const levels = this.sortedLevelRange.slice();
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        let level: number | undefined;
        while ((level = levels.shift())) {
            if (tileKey.level < level) {
                continue;
            }
            const offset = tileKey.level - level;
            const offTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offset,
                tileKey.column >> offset,
                level
            );
            if (this.tileMaterialCache.has(offTileKey.mortonCode())) {
                const tile = this.tileMaterialCache.get(offTileKey.mortonCode());
                if (!tile.material) {
                    continue;
                }
                return tile;
            }
        }
        return false;
    };

    getTileTextureUrl(tileKey: TileKey): string {
        const level = tileKey.level;
        const column = tileKey.column;
        const row = tileKey.row;
        const quadKey = tileKey.toQuadKey();
        const mortonCode = tileKey.mortonCode();
        return this.options.url
            .replace("{x}", column.toString())
            .replace("{y}", row.toString())
            .replace("{z}", level.toString())
            .replace("{quadKey}", quadKey)
            .replace("{server}", (mortonCode % 4).toString());
    }

    fetchTileMaterial(
        tileKey: TileKey,
        abortSignal: AbortSignal,
        tileLoader: TileMaterialLoader
    ): Promise<THREE.Texture> {
        const url = this.getTileTextureUrl(tileKey);

        return new Promise((resolve, reject) => {
            this.dataSource!.mapView.taskQueue.add({
                execute: async () => {
                    if (abortSignal.aborted) {
                        return;
                    }
                    const { data: texture } = await downloadImageManager.download(url);
                    if (texture) {
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.generateMipmaps = false;
                        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

                        this.dataSource!.mapView.taskQueue.add({
                            execute: async () => {
                                texture.needsUpdate = true;
                                resolve(texture);
                            },
                            getPriority: () => {
                                return 100 - tileKey.level;
                            },
                            group: "create"
                        });
                    }
                },
                getPriority: () => {
                    return 100 - tileKey.level;
                },
                group: "fetch"
            });
        });
    }

    evictionCallback = (k: number, tile: Tile): void => {
        const { material, tileLoader } = tile;
        tileLoader.cancel();
        tileLoader.canceled = true;
        if (material) material.dispose();
    };

    getMaterialByTile(tile: Tile): TerrainMeshLambertMaterial {
        return new TerrainMeshLambertMaterial({
            map: tile.material,
            wireframe: false,
            depthTest: true,
            fog: true,
            transparent: false
        });
    }

    getLevelRange(): number[] {
        return this.levelRange;
    }

    remove(): void {
        if (this.dataSource) {
            const index = this.dataSource.getMaterialProviders().indexOf(this);
            if (index !== -1) {
                this.dataSource.getMaterialProviders().splice(index, 1);
            }
            this.dataSource.mapView.markTilesDirty(this.dataSource);
        }
        this.tileMaterialCache.clear();
    }

    set opacity(v: number) {
        if (this._opacity === v) {
            return;
        }
        this._opacity = v;
        if (!this.dataSource) return;

        const cache = this.dataSource.mapView.visibleTileSet.dataSourceTileList.find(
            e => this.dataSource === e.dataSource
        );
        if (!cache) return;

        cache.visibleTiles.forEach(tile => {
            tile.objects.forEach(m => {
                m.material.opacity = v;
                m.material.transparent = v !== 1;
            });
        });
    }

    get opacity(): number {
        return this._opacity;
    }
}
