import {
    TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataSourceOptions, Tile } from "@flywave/flywave-mapview";
import { WebTileDataProvider } from "flywave-webtile-datasource";
import * as THREE from "three";

import { TerrainMeshLambertMaterial } from "./height-map/HeightMapMaterial";
import { TerrainSource } from "./TerrainSource";

export interface MaterialProviderOptions
    extends Omit<DataSourceOptions, "enablePicking" | "styleSetName"> {
    dataProvider: WebTileDataProvider;
    tilingScheme: TilingScheme;
}

export interface TerrainMaterialProvider {
    isWebMercator(): boolean;
    getTileMaterial(tileKey: TileKey, abortSignal: AbortSignal): Promise<THREE.Texture>;
}

export class MaterialTile extends Tile {
    material: THREE.Texture;
    constructor(dataSource: TerrainSource<MaterialTile>, tileKey: TileKey) {
        super(dataSource, tileKey);
    }

    getTerrainMaterial(): TerrainMeshLambertMaterial {
        if (!this.material) {
            throw new Error("Tile material is not loaded");
        }

        return new TerrainMeshLambertMaterial({
            map: this.material,
            wireframe: false,
            depthTest: true,
            fog: true,
            transparent: false
        });
    }
}

class WebTileMaterialAdapter implements TerrainMaterialProvider {
    constructor(
        private readonly webTileProvider: WebTileDataProvider,
        private readonly tilingScheme: TilingScheme
    ) {}

    isWebMercator(): boolean {
        return this.tilingScheme.projection === webMercatorProjection;
    }

    async getTileMaterial(tileKey: TileKey, abortSignal?: AbortSignal): Promise<THREE.Texture> {
        const dummyTile = new Tile(null as any, tileKey); // 创建临时Tile对象
        const result = await this.webTileProvider.getTexture(dummyTile, abortSignal);

        if (!result || !result[0]) {
            // eslint-disable-next-line prettier/prettier
            throw new Error("Failed to load web tile texture");
        }

        const [texture] = result;
        this.configureTexture(texture!);
        return texture!;
    }

    private configureTexture(texture: THREE.Texture) {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }
}

export class MaterialProvider implements TerrainMaterialProvider {
    private readonly providerImpl: TerrainMaterialProvider;
    private readonly levelRange: number[] = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18
    ];

    private readonly sortedLevelRange: number[];
    private readonly tileScheme = webMercatorTilingScheme;
    private _opacity: number = 1;
    private readonly options: MaterialProviderOptions;
    private dataSource?: TerrainSource<MaterialTile>;
    private readonly maxLodLevel: number = 3;

    public tileMaterialCache: LRUCache<number, MaterialTile> = new LRUCache<number, MaterialTile>(
        1000
    );

    constructor(options?: MaterialProviderOptions) {
        if (options) {
            this.providerImpl = new WebTileMaterialAdapter(
                options.dataProvider,
                options.tilingScheme
            );
        } else {
            throw new Error("Invalid provider configuration");
        }

        this.sortedLevelRange = this.getLevelRange().sort((a, b) => b - a);
        this.tileMaterialCache = new LRUCache<number, MaterialTile>(1000);
        this.tileMaterialCache.evictionCallback = this.evictionCallback;
    }

    bindDataSource(dataSource: TerrainSource<MaterialTile>): void {
        this.dataSource = dataSource;
        //if (dataSource) dataSource.application.visibleTileSet.clearTileCache();
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
        return this.providerImpl.isWebMercator();
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

                    const cachedTile = this.tileMaterialCache.get(tileKey.mortonCode());
                    if (!cachedTile || !cachedTile.material) {
                        const tile = new MaterialTile(this.dataSource!, tileKey);

                        this.providerImpl
                            .getTileMaterial(tileKey, new AbortController().signal)
                            .then(material => {
                                tile.material = material;
                                this.dataSource!.updateTileOverlayer(tile);
                                this.tileMaterialCache.set(tileKey.mortonCode(), tile);
                            })
                            .catch(error => {
                                this.tileMaterialCache.delete(tileKey.mortonCode());
                            });
                        break;
                    } else {
                        if (cachedTile.material) {
                            curLevel++;
                            continue;
                        }
                        break;
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

    getTileMaterial(tileKey: TileKey, abortSignal: AbortSignal): Promise<THREE.Texture> {
        return this.providerImpl.getTileMaterial(tileKey, abortSignal);
    }

    evictionCallback = (k: number, tile: MaterialTile): void => {
        const { material } = tile;
        if (material) material.dispose();
    };

    getLevelRange(): number[] {
        return this.levelRange;
    }

    remove(): void {
        if (this.dataSource) {
            const providers = this.dataSource.getMaterialProviders();
            const index = providers.indexOf(this);
            if (index !== -1) {
                providers.splice(index, 1);
            }
            this.dataSource.mapView.markTilesDirty(this.dataSource);
        }
        this.tileMaterialCache.clear();
    }

    set opacity(value: number) {
        if (this._opacity === value || !this.dataSource) return;

        this._opacity = value;

        const cache = this.dataSource.mapView.visibleTileSet.dataSourceTileList.find(
            e => this.dataSource === e.dataSource
        );

        if (!cache) return;

        for (const tile of cache.visibleTiles) {
            for (const obj of tile.objects) {
                if (obj instanceof THREE.Mesh) {
                    obj.material.opacity = value;
                    obj.material.transparent = value !== 1;
                }
            }
        }
    }

    get opacity(): number {
        return this._opacity;
    }
}
