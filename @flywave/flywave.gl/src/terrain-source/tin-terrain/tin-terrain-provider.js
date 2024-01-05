/*
 * Copyright © 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { defaultValue } from "./utils";

export class TinTerrainProvider {
    levelLodSize = 5;

    constructor(options) {
        this.url = options.url;

        this._requestVertexNormals = defaultValue(options.requestVertexNormals, false);

        this._requestWaterMask = defaultValue(options.requestWaterMask, false);

        this._requestMetadata = defaultValue(options.requestMetadata, true);

        this.tinCache = new LRUCache(5000);

        this.tinCache.evictionCallback = this.evictionCallback;
    }

    bindDataSource(dataSource) {
        this.dataSource = dataSource;
        this._availability = dataSource._availability;
    }

    touchData(tileKey) {
        this.loadTileDataAvailability(tileKey);
    }

    unregister() {}

    requestTile(tileKey) {
        if (this.tinCache.has(tileKey.mortonCode())) return this.tinCache.get(tileKey.mortonCode());

        var tile = this.dataSource.dataTerrainProvider.makeLoaderTile(tileKey);
        tile.tileLoader.load();
        tile.tileLoader.donePromise.then(() => {
            tile.builderQuantized(tile.tileLoader.decodedTile);
            this.dataSource.updateTileOverlayer(tile);

            this.dataSource
                .getElevationRangeSource()
                .updateMinMaxCache(tileKey, tile.minimumHeight, tile.maximumHeight);
        });
        this.tinCache.set(tileKey.mortonCode(), tile);

        return tile;
    }

    requestUpsampleTile(tileKey, parentTileKey) {
        var tile = this.dataSource.dataTerrainProvider.makeLoaderTile(
            tileKey,
            this.tinCache.get(parentTileKey.mortonCode())
        );
        tile.tileLoader.load();
        tile.tileLoader.donePromise.then(() => {
            tile.builderQuantized(tile.tileLoader.decodedTile);
            this.dataSource.updateTileOverlayer(tile);
        });
        this.tinCache.set(tileKey.mortonCode(), tile);
        return tile;
    }

    loadRoot() {
        var k1 = new TileKey(0, 0, 1);
        var k2 = new TileKey(0, 1, 1);
        var available = this.dataSource.dataTerrainProvider.getTileDataAvailable(k1);
        var ready = true;
        if (available) {
            this.requestTile(k1);
            ready &&= this.tinCache.get(k1.mortonCode()).tinData;
        }

        available = this.dataSource.dataTerrainProvider.getTileDataAvailable(k2);

        if (available) {
            this.requestTile(k2);
            ready &&= !!this.tinCache.get(k2.mortonCode()).tinData;
        }
        return ready;
    }

    loadTile(tileKey) {
        if (!this.loadRoot()) {
            return;
        }

        var tk = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);

        while (true) {
            if (this.tinCache.has(tk.mortonCode())) {
                return;
            }
            if (this.dataSource.dataTerrainProvider.getTileDataAvailable(tk)) {
                this.requestTile(tk);
                break;
            } else {
                if (tk.level == 0) break;
                var parent = tk.parent();
                if (this.tinCache.has(parent.mortonCode())) {
                    var tile = this.tinCache.get(parent.mortonCode());
                    if (tile.tinData) {
                        this.requestUpsampleTile(tk, parent);
                    }
                    break;
                }
                tk = parent;
            }
        }
    }

    // loadLodTile(tile) {
    //   if (!this.loadRoot()) {
    //     return
    //   }
    //   var lodCount = Math.min(Math.ceil(tile.level / this.levelLodSize), 3);
    //   var lodSize = Math.ceil(tile.level / lodCount);

    //   for (var count = 0; count <= lodCount; count++) {
    //     for (var level = (count + 1) * lodSize; level >= (count) * lodSize; level--) {
    //       var tk = TileKey.fromRowColumnLevel(tile.row, tile.column, tile.level);
    //       tk = tk.changedLevelTo(level);
    //       if (this.tinCache.has(tk.mortonCode())) {
    //         break;
    //       } else {
    //         var available = this.dataSource.dataTerrainProvider.getTileDataAvailable(tk);
    //         if (available) {
    //           this.requestTile(tk);
    //           return;
    //         }
    //       }
    //     }
    //   }
    // }

    tileIsAvailable(tileKey: TileKey) {
        return (
            this.tinCache.has(tileKey.mortonCode()) &&
            this.tinCache.get(tileKey.mortonCode()).tinData
        );
    }

    getBestAvailableTile(tile: TileKey) {
        var tk = tile;
        while (true) {
            if (this.tileIsAvailable(tk)) {
                var tinTile = this.tinCache.get(tk.mortonCode());
                return tinTile;
            }
            if (tk.level == 0) {
                break;
            }

            tk = tk.parent();
        }
    }

    findAncestorTileWithTerrainData(tile: TileKey) {
        var tk = tile;
        while (true) {
            if (this.tileIsAvailable(tk)) {
                var tinTile = this.tinCache.get(tk.mortonCode());
                if (!tinTile.wasCreatedByUpsampling()) return tinTile;
            }
            if (tk.level == 0) {
                break;
            }

            tk = tk.parent();
        }
    }

    disposeTile = tileKey => {
        this.tinCache.delete(tileKey.mortonCode());
    };

    evictionCallback = (k, tile) => {
        const { geometry } = tile;
        if (geometry) {
            geometry.dispose();
        }
    };
}
