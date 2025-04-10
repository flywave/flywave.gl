/*
 * Copyright © 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { webMercatorProjection } from "@flywave/flywave-geoutils";
import { webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { TileKey } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import * as THREE from "three";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { TerrainMeshLambertMaterial } from "./height-map/height-map-material";

var imageLoader = new THREE.TextureLoader();
var downloadImageManager = new TransferManager(url => {
    return { data: imageLoader.loadAsync(url), status: 200 };
});

export class TileMaterialLoader extends TileLoader {
    constructor(dataSource, tile, dataProvider, decoder) {
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
            .then(material => {
                if (abortSignal.aborted) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }

                this.tile.material = material;

                onDone(TileLoaderState.Ready);
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }
}

export class MaterialProvider {
    levelRange = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    maxLodLevel = 3;

    _opacity = 1;

    fetchMaterial() {
        throw "Not Impl";
    }

    getLevelRange() {
        throw this.levelRange;
    }

    constructor(options) {
        this.sortedLevelRange = this.getLevelRange().sort((a, b) => b - a);
        this.tileScheme = webMercatorTilingScheme;
        this.tileMaterialCache.evictionCallback = this.evictionCallback;
        this.options = options || {};
    }

    get baseUrl() {
        return this.options.url;
    }

    bindDataSource(dataSource) {
        this.dataSource = dataSource;
        if (dataSource) dataSource.application.visibleTileSet.clearTileCache();
    }

    tileMaterialCache = new LRUCache(1000);

    clipGeobox(geobox) {
        var geoboxCopy = geobox.clone();
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

    connect() {
        return Promise.resolve();
    }

    ready() {
        return true;
    }

    isWebMercator() {
        return this.tileScheme.projection === webMercatorProjection;
    }

    loadNeareastRectangleLevel(geoBox, level) {
        var tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        tileKeys.forEach(this.loadNeareastTile);
    }

    loadNeareastTile = tileKey => {
        var maxLodLevel = this.maxLodLevel;
        var level = Math.ceil(tileKey.level / maxLodLevel);
        var tileLevel = tileKey.level;
        var curLevel = 0;

        var loadTileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);
        while (curLevel <= maxLodLevel) {
            var nextLevel = THREE.MathUtils.clamp(
                curLevel * level,
                this.sortedLevelRange[this.sortedLevelRange.length - 1],
                tileLevel
            );

            var offet = tileKey.level - nextLevel;
            loadTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offet,
                tileKey.column >> offet,
                nextLevel
            );

            {
                var levels = this.sortedLevelRange;
                var nearLevel = loadTileKey.level;
                for (var e = 0; e < levels.length; e++) {
                    nearLevel = levels[e];
                    if (loadTileKey.level >= levels[e]) {
                        break;
                    }
                }

                if (nearLevel) {
                    var offet = loadTileKey.level - nearLevel;
                    let tileKey = TileKey.fromRowColumnLevel(
                        loadTileKey.row >> offet,
                        loadTileKey.column >> offet,
                        nearLevel
                    );

                    if (!this.tileMaterialCache.has(tileKey.mortonCode())) {
                        var tile = new Tile(this.dataSource, tileKey);
                        tile.geoBox = this.tileScheme.getGeoBox(tileKey);
                        tile.updateBoundingBox();
                        tile.tileLoader = new TileMaterialLoader(
                            this.dataSource,
                            tile,
                            this,
                            this.dataSource.decoder
                        );
                        tile.tileLoader.load();
                        tile.tileLoader.donePromise.then(() => {
                            this.dataSource.updateTileOverlayer({
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

    getNeareastRectangleByLevel(geoBox, level) {
        var tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        return tileKeys.map(this.getNeareastMaterialTile).filter(e => e);
    }

    getNeareastMaterialTile = tileKey => {
        var levels = this.sortedLevelRange.slice();
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        var level;
        while ((level = levels.shift())) {
            if (tileKey.level < level) {
                continue;
            }
            var offset = tileKey.level - level;
            var offTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offset,
                tileKey.column >> offset,
                level
            );
            if (this.tileMaterialCache.has(offTileKey.mortonCode())) {
                var tile = this.tileMaterialCache.get(offTileKey.mortonCode());
                if (!tile.material) {
                    continue;
                }
                return tile;
            }
        }
        return false;
    };

    getTileTextureUrl(tileKey) {
        const level = tileKey.level;
        const column = tileKey.column;
        const row = tileKey.row;
        const quadKey = tileKey.toQuadKey();
        var mortonCode = tileKey.mortonCode();
        return this.options.url
            .replace("{x}", column)
            .replace("{y}", row)
            .replace("{z}", level)
            .replace("{quadKey}", quadKey)
            .replace("{server}", mortonCode % 4);
    }

    fetchTileMaterial(tileKey, abortSignal, tileLoader) {
        var url = this.getTileTextureUrl(tileKey);

        return new Promise((resolve, reject) => {
            this.dataSource.mapView.taskQueue.add({
                execute: async () => {
                    if (abortSignal.aborted) {
                        return;
                    }
                    let { data: texture } = await downloadImageManager.download(url);
                    if (texture) {
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.generateMipmaps = false;
                        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

                        this.dataSource.mapView.taskQueue.add({
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
        }).then(texture => {
            return texture;
        });
    }

    evictionCallback = (k, tile) => {
        const { material, tileLoader } = tile;
        tileLoader.cancel();
        tileLoader.canceled = true;
        if (material) material.dispose();
    };

    getMaterialByTile(tile) {
        return new TerrainMeshLambertMaterial({
            map: tile.material,
            wireframe: false,
            depthTest: true,
            fog: true,
            transparent: false
        });
    }

    getLevelRange() {
        return this.levelRange;
    }

    remove() {
        if (this.dataSource) {
            var index = this.dataSource.getMaterialProviders().indexOf(this);
            if (index != -1) {
                this.dataSource.getMaterialProviders().splice(index, 1);
            }
            this.dataSource.mapView.markTilesDirty(this.dataSource);
        }
        this.tileMaterialCache.clear();
    }

    set opacity(v) {
        if (this._opacity == v) {
            return v;
        }
        this._opacity = v;
        var cache = this.dataSource.mapView.visibleTileSet.dataSourceTileList.find(
            e => this.dataSource === e.dataSource
        );
        if (!cache) return;
        cache.visibleTiles.forEach(tile => {
            tile.objects.forEach(m => {
                m.material.opacity = v;
                m.material.transparent = v != 1;
            });
        });
    }

    get opacity() {
        return this._opacity;
    }
}
