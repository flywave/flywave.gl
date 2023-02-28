/*
 * Copyright © 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@flywave/flywave-geoutils";
import { HeightMapDemTileLoader } from "./height-map-tile";
import { Tile } from "@flywave/flywave-mapview";
import { arrayBufferToImageBitmap, arrayBufferToImage, prevPowerOfTwo } from "../../util/util";
import offscreenCanvasSupported from '../../util/offscreen_canvas_supported.js';
import DEMData from "./dem/dem_data";
import { LRUCache } from "@flywave/flywave-lrucache";

export class HeightMapProvider {
  
    maxLodLevel = 3;

    getMaxZoom() {
        return this.dataSource.levelRange[0]||0;
    }

    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }

    connect() {
        return Promise.resolve()
    }

    ready() {
        return true
    }

    unregister() {

    }

    constructor() { 
        this.tileDemCache.evictionCallback = this.evictionCallback;
    }

    evictionCallback(key, dtmTile) {
        dtmTile.dispose();
        if (dtmTile.dem)
            dtmTile.dem.dispose();
    }

    tileDemCache = new LRUCache(2000);

    clear=()=>{
        this.tileDemCache.clear();
    }

    touchData(tileKey, targetLevel) {
        // var nearLevel = ~~(tileKey.level * (this.lodLevel / targetLevel)) * ~~((targetLevel / this.lodLevel))
        // var offet = (tileKey.level - nearLevel)
        // var lodTileKey = TileKey.fromRowColumnLevel(tileKey.row >> offet, tileKey.column >> offet, nearLevel);
        this.loadNeareastTile(tileKey)
    }


    loadNeareastTile(tileKey) {
        var maxLodLevel = this.maxLodLevel;
        var level = Math.ceil(tileKey.level / maxLodLevel);
        var tileLevel = tileKey.level;
        var curLevel = 0;

        var loadTileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);
        while (curLevel <= maxLodLevel) {
            var nextLevel = THREE.MathUtils.clamp(curLevel * level, this.dataSource.levelRange[this.dataSource.levelRange.length - 1], tileLevel);

            var offet = (tileKey.level - nextLevel);
            loadTileKey = TileKey.fromRowColumnLevel(tileKey.row >> offet, tileKey.column >> offet, nextLevel);

            {
                var levels = this.dataSource.levelRange;
                var nearLevel = loadTileKey.level;
                for (var e = 0; e < levels.length; e++) {
                    nearLevel = levels[e];
                    if (loadTileKey.level >= levels[e]) {
                        break
                    }
                }

                if (nearLevel) {
                    var offet = (loadTileKey.level - nearLevel);
                    let tileKey = TileKey.fromRowColumnLevel(loadTileKey.row >> offet, loadTileKey.column >> offet, nearLevel);

                    if (!this.tileDemCache.has(tileKey.mortonCode())) {
                        var tile = new Tile(this.dataSource, tileKey);
                        tile.tileLoader = new HeightMapDemTileLoader(this.dataSource, tileKey, this, this.dataSource.decoder);
                        tile.tileLoader.load();
                        tile.tileLoader.donePromise.then(() => {
                            var dem = tile.tileLoader.decodedTile.dem;
                            tile.dem = new DEMData(dem.uid, dem, dem.encoding, dem.borderReady, false);
                            Object.assign(tile.dem, dem);

                            tile.dem._buildQuadTree();
                            tile.dem._buildTexture(this.dataSource.size);
                            tile.dem._buildDisplacementMapTexture(this.dataSource.size);
                            this._backfillDEM(tile);
                            this.dataSource.updateTileOverlayer(tile);
                        }).catch((err) => {
                            tile.error = err;
                            this.dataSource.updateTileOverlayer(tile);
                        });

                        this.tileDemCache.set(tileKey.mortonCode(), tile);
                        break;
                    } else {
                        const tile = this.tileDemCache.get(tileKey.mortonCode());
                        if (tile.dem||tile.error) {
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
    }


    _getNeighboringTiles(tileID: TileKey) {
        const dim = Math.pow(2, tileID.level);

        const px = (tileID.column - 1 + dim) % dim;
        const nx = (tileID.column + 1 + dim) % dim;

        const neighboringTiles = {};
        // add adjacent tiles TileKey.fromRowColumnLevel(tileKey.row >> offet, tileKey.column >> offet, nearLevel)
        neighboringTiles[TileKey.fromRowColumnLevel(tileID.row, px, tileID.level).mortonCode()] = { backfilled: false };
        neighboringTiles[TileKey.fromRowColumnLevel(tileID.row, nx, tileID.level).mortonCode()] = { backfilled: false };

        // Add upper neighboringTiles
        if (tileID.row > 0) {
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row - 1, px, tileID.level,).mortonCode()] = { backfilled: false };
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row - 1, tileID.column, tileID.level,).mortonCode()] = { backfilled: false };
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row - 1, nx, tileID.level).mortonCode()] = { backfilled: false };
        }
        // Add lower neighboringTiles
        if (tileID.row + 1 < dim) {
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row + 1, px, tileID.level).mortonCode()] = { backfilled: false };
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row + 1, tileID.column, tileID.level).mortonCode()] = { backfilled: false };
            neighboringTiles[TileKey.fromRowColumnLevel(tileID.row + 1, nx, tileID.level).mortonCode()] = { backfilled: false };
        }

        return neighboringTiles;
    }

    _backfillDEM(tile: Tile) {
        tile.neighboringTiles && Object.keys(tile.neighboringTiles).forEach(tileKey => {
            const borderTile = this.tileDemCache.get(parseInt(tileKey));
            if (borderTile) {
                fillBorder(tile, borderTile);
                fillBorder(borderTile, tile);
            }
        });

        function fillBorder(tile, borderTile) {
            if (!tile.dem || tile.dem.borderReady) return;
            tile.needsHillshadePrepare = true;
            tile.needsDEMTextureUpload = true;
            let dx = borderTile.tileKey.column - tile.tileKey.column;
            const dy = borderTile.tileKey.row - tile.tileKey.row;
            const dim = Math.pow(2, tile.tileKey.level);
            const borderId = borderTile.tileKey.mortonCode();
            if (dx === 0 && dy === 0) return;

            if (Math.abs(dy) > 1) {
                return;
            }
            if (Math.abs(dx) > 1) {
                // Adjust the delta coordinate for world wraparound.
                if (Math.abs(dx + dim) === 1) {
                    dx += dim;
                } else if (Math.abs(dx - dim) === 1) {
                    dx -= dim;
                }
            }
            if (!borderTile.dem || !tile.dem) return;
            tile.dem.backfillBorder(borderTile.dem, dx, dy);
            if (tile.neighboringTiles && tile.neighboringTiles[borderId])
                tile.neighboringTiles[borderId].backfilled = true;
        }
    }

    computeHeightMapPos(tileKey, demTileKey) {
        tileKey = TileKey.fromRowColumnLevel((1 << tileKey.level) - 1 - tileKey.row, tileKey.column, tileKey.level)
        var ah = 1, P, M;
        var H = tileKey.level, ae = tileKey.row, J = tileKey.column;
        for (; H > demTileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1
        }
        P = 1 / ah;

        return new THREE.Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P)
    }

    getNeareastDemTileTexture(tileKey) {
        var levels = this.dataSource.levelRange.slice();
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        var level;
        while (level = levels.shift()) {
            if (tileKey.level < level) {
                continue;
            }
            var offset = tileKey.level - level;
            var offTileKey = TileKey.fromRowColumnLevel(tileKey.row >> offset, tileKey.column >> offset, level)
            if (this.tileDemCache.has(offTileKey.mortonCode())) {
                var tile = this.tileDemCache.get(offTileKey.mortonCode())
            
                if (!tile.dem) {
                    continue;
                }
                return {
                    tile,
                    uHeightMapPos: this.computeHeightMapPos(tileKey, tile.tileKey),
                    uHeighMapTexture: tile.dem.getPixels()
                };
            }
        }
        return false;
    }

    computeDisplacementMapPos(tileKey, demTileKey) {
        tileKey = TileKey.fromRowColumnLevel((1 << tileKey.level) - 1 - tileKey.row, tileKey.column, tileKey.level)
        var ah = 1, P, M;
        var H = tileKey.level, ae = tileKey.row, J = tileKey.column;
        for (; H > demTileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1
        }
        P = 1 / ah;

        return new THREE.Vector3(P, (tileKey.column - J * ah) * P, (tileKey.row - ae * ah) * P)
    }

    getNeareastDisplacementMap(tileKey) {
        var levels = this.dataSource.levelRange.slice();
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        var level;
        while (level = levels.shift()) {
            if (tileKey.level < level) {
                continue;
            }
            var offset = tileKey.level - level;
            var offTileKey = TileKey.fromRowColumnLevel(tileKey.row >> offset, tileKey.column >> offset, level)
            if (this.tileDemCache.has(offTileKey.mortonCode())) {
                var tile = this.tileDemCache.get(offTileKey.mortonCode())
                if (!tile.dem) {
                    continue;
                }

                var map = tile.dem.displacementMapTexture;//.clone();
                var transfrom = this.computeDisplacementMapPos(tileKey, tile.tileKey);
                return {
                    tile,
                    displacementMap: map,
                    uvMatrix: new THREE.Matrix3().setUvTransform(transfrom.y, transfrom.z, transfrom.x, transfrom.x, 0, 0, 0)
                };
            }
        }
        return false;
    }

    getNeareastDemTile(tileKey) {
        if(!tileKey)return false;
        var levels = this.dataSource.levelRange.slice();
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        var level;
        while (level = levels.shift()) {
            if (tileKey.level < level) {
                continue;
            }
            var offset = tileKey.level - level;
            var offTileKey = TileKey.fromRowColumnLevel(tileKey.row >> offset, tileKey.column >> offset, level)
            if (this.tileDemCache.has(offTileKey.mortonCode())) {
                var tile = this.tileDemCache.get(offTileKey.mortonCode())
                if (!tile.dem) {
                    continue;
                }
                return tile;
            }
        }
        return false;
    }


    fetchTileDem(tileKey, abortSignal) {
        return this.dataSource.fetchDemData(tileKey, abortSignal).then((buffer) => {
            return new Promise((reslove => {
                if (window.createImageBitmap) {
                    arrayBufferToImageBitmap(buffer, (err, imgBitmap) => reslove(imgBitmap));
                } else {
                    arrayBufferToImage(buffer, (err, img) => reslove(img));
                }
            }))
        }).then(img => {
            if (!img) {
                return;
            }
            const transfer = window.ImageBitmap && img instanceof window.ImageBitmap && offscreenCanvasSupported();
            // DEMData uses 1px padding. Handle cases with image buffer of 1 and 2 pxs, the rest assume default buffer 0
            // in order to keep the previous implementation working (no validation against tileSize).
            const buffer = (img.width - prevPowerOfTwo(img.width)) / 2;
            // padding is used in getImageData. As DEMData has 1px padding, if DEM tile buffer is 2px, discard outermost pixels.
            const padding = 1 - buffer;
            const borderReady = padding < 1;
            var tile = this.tileDemCache.get(tileKey.mortonCode())

            if (tile && !borderReady && !tile.neighboringTiles) {
                tile.neighboringTiles = this._getNeighboringTiles(tile.tileKey);
            }
            const rawImageData = transfer ? img : browser.getImageData(img, padding);
            return {
                coord: tileKey,
                rawImageData,
                encoding: this.encoding,
                padding,
                height: img.height,
                width: img.width
            };
        });
    }
}