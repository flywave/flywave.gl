import { TileKey } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import {
    arrayBufferToImage,
    arrayBufferToImageBitmap,
    browser,
    Math2D,
    offscreenCanvasSupported,
    prevPowerOfTwo
} from "@flywave/flywave-utils";
import * as THREE from "three";

import { TerrainSource } from "../TerrainSource";
import { DEMEncoding } from "./dem/DemData";
import { DecodeTileResult } from "./dem/TileDecoder";
import { HeightMapSource } from "./HeightMapSource";
import { HeightMapDemTileLoader, HeightMapMeshTile } from "./HeightMapTile";

export interface NeighboringTile {
    backfilled: boolean;
}

export interface HeightMapTextureResult {
    tile: HeightMapMeshTile;
    uHeightMapPos: THREE.Vector3;
    uHeighMapTexture: any; // Replace with actual texture type
}

export interface DisplacementMapResult {
    tile: HeightMapMeshTile;
    displacementMap: any; // Replace with actual displacement map type
    uvMatrix: THREE.Matrix3;
}

export class HeightMapProvider extends DataProvider {
    private static readonly DEFAULT_MAX_LOD_LEVEL = 3;
    private static readonly DEFAULT_CACHE_SIZE = 1500;
    private static readonly AABB_SKIRT_PADDING = 100;

    public maxLodLevel: number = HeightMapProvider.DEFAULT_MAX_LOD_LEVEL;
    private dataSource: HeightMapSource | null = null;
    private readonly encoding: DEMEncoding;
    private readonly tileDemCache: LRUCache<number, HeightMapMeshTile>;
    private _disposed = false;

    constructor(options: { encoding?: DEMEncoding; cacheSize?: number } = {}) {
        super();
        this.tileDemCache = new LRUCache(options.cacheSize || HeightMapProvider.DEFAULT_CACHE_SIZE);
        this.tileDemCache.evictionCallback = this.evictionCallback.bind(this);
        this.encoding = options.encoding || "mapbox";
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike> {
        const tile = this.tileDemCache.get(tileKey.mortonCode());
        if (tile?.dem) {
            return tile.dem.pixels.buffer;
        }

        // 当缓存不存在时主动加载
        return await this.dataSource?.fetchDemData(tileKey, abortSignal);
    }

    protected dispose(): void {
        if (this._disposed) return;
        this.tileDemCache.clear();
        this.dataSource = null;
        this._disposed = true;
    }

    private _checkDisposed(): void {
        if (this._disposed) {
            throw new Error("HeightMapProvider has been disposed");
        }
    }

    getMaxZoom(): number {
        return this.dataSource?.levelRange[0] || 0;
    }

    bindDataSource(dataSource: TerrainSource): void {
        this._checkDisposed();
        this.dataSource = dataSource as HeightMapSource;
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    ready(): boolean {
        return !!this.dataSource && this.dataSource.ready();
    }

    unregister(client: Object): void {
        super.unregister(client);
    }

    private evictionCallback(key: number, dtmTile: HeightMapMeshTile): void {
        dtmTile.tileLoader?.cancel();
        if (dtmTile.dem) dtmTile.dem.dispose();
        dtmTile.dispose();
    }

    clear(): void {
        this.tileDemCache.clear();
    }

    clearTree(clearGeoBox: {
        southWest: { longitude: number; latitude: number };
        northEast: { longitude: number; latitude: number };
    }): void {
        if (!this.dataSource) return;

        const { southWest, northEast } = clearGeoBox;
        const clearBox = new Math2D.Box(
            southWest.longitude,
            southWest.latitude,
            northEast.longitude - southWest.longitude,
            northEast.latitude - southWest.latitude
        );

        this.tileDemCache.forEach(tile => {
            const { dem, geoBox } = tile;
            const tileBox = new Math2D.Box(
                geoBox.southWest.longitude,
                geoBox.southWest.latitude,
                geoBox.northEast.longitude - geoBox.southWest.longitude,
                geoBox.northEast.latitude - geoBox.southWest.latitude
            );
            if (clearBox.intersects(tileBox)) {
                dem ? dem.clearTree() : (tile.markClearTree = true);
            }
        });
    }

    isNeedsUpdateDemTree(geoBox: {
        southWest: { toGeoPoint(): number[] };
        northEast: { toGeoPoint(): number[] };
    }): boolean {
        if (!this.dataSource || !this.dataSource.overlayerHeightMapTexture.box) {
            return false;
        }

        const { box } = this.dataSource.overlayerHeightMapTexture;
        const fbbox = new THREE.Box2();
        fbbox.expandByPoint(new THREE.Vector2().fromArray(geoBox.southWest.toGeoPoint()));
        fbbox.expandByPoint(new THREE.Vector2().fromArray(geoBox.northEast.toGeoPoint()));

        return box.intersectsBox(fbbox);
    }

    touchData(tileKey: TileKey, targetLevel?: number): void {
        this.loadNeareastTile(tileKey);
    }

    loadNeareastTile(tileKey: TileKey): void {
        if (!this.dataSource) return;

        const maxLodLevel = this.maxLodLevel;
        const level = Math.ceil(tileKey.level / maxLodLevel);
        const tileLevel = tileKey.level;
        let curLevel = 0;

        let loadTileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);

        while (curLevel <= maxLodLevel) {
            const nextLevel = THREE.MathUtils.clamp(
                curLevel * level,
                this.dataSource.levelRange[this.dataSource.levelRange.length - 1],
                tileLevel
            );

            const offet = tileKey.level - nextLevel;
            loadTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offet,
                tileKey.column >> offet,
                nextLevel
            );

            const levels = this.dataSource.levelRange;
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

                if (!this.tileDemCache.has(tileKey.mortonCode())) {
                    const tile = new HeightMapMeshTile(this.dataSource as HeightMapSource, tileKey);
                    const tileLoader = new HeightMapDemTileLoader(
                        this.dataSource,
                        tileKey,
                        this,
                        this.dataSource.decoder
                    );
                    tile.tileLoader = tileLoader;

                    tileLoader
                        .loadAndDecode()
                        .then(() => {
                            const dem = (tile.tileLoader.decodedTile as DecodeTileResult).dem;
                            tile.dem = dem;

                            if (this.isNeedsUpdateDemTree(tile.geoBox)) {
                                tile.dem.clearTree();
                            }
                            tile.dem.setOverlayerHeight(
                                tile.geoBox,
                                this.dataSource.overlayerHeightMapTexture
                            );

                            tile.dem._buildTexture(this.dataSource.size);
                            tile.dem._buildDisplacementMapTexture(this.dataSource.size);
                            this.dataSource.updateTileOverlayer(tile);
                        })
                        .catch(err => {
                            tile.error = err;
                            this.dataSource.updateTileOverlayer(tile);
                        });

                    this.tileDemCache.set(tileKey.mortonCode(), tile);
                    break;
                } else {
                    const tile = this.tileDemCache.get(tileKey.mortonCode());
                    if (tile.dem || tile.error) {
                        curLevel++;
                        continue;
                    } else {
                        break;
                    }
                }
            }
            curLevel++;
        }
    }

    private _getNeighboringTiles(tileID: TileKey): Record<number, NeighboringTile> {
        const dim = Math.pow(2, tileID.level);
        const px = (tileID.column - 1 + dim) % dim;
        const nx = (tileID.column + 1 + dim) % dim;

        const neighboringTiles: Record<number, NeighboringTile> = {};

        neighboringTiles[TileKey.fromRowColumnLevel(tileID.row, px, tileID.level).mortonCode()] = {
            backfilled: false
        };
        neighboringTiles[TileKey.fromRowColumnLevel(tileID.row, nx, tileID.level).mortonCode()] = {
            backfilled: false
        };

        if (tileID.row > 0) {
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, px, tileID.level).mortonCode()
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, tileID.column, tileID.level).mortonCode()
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, nx, tileID.level).mortonCode()
            ] = { backfilled: false };
        }

        if (tileID.row + 1 < dim) {
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, px, tileID.level).mortonCode()
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, tileID.column, tileID.level).mortonCode()
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, nx, tileID.level).mortonCode()
            ] = { backfilled: false };
        }

        return neighboringTiles;
    }

    private _backfillDEM(tile: HeightMapMeshTile): void {
        if (!tile.neighboringTiles) return;

        Object.keys(tile.neighboringTiles).forEach(tileKey => {
            const borderTile = this.tileDemCache.get(parseInt(tileKey));
            if (borderTile) {
                this.fillBorder(tile, borderTile);
                this.fillBorder(borderTile, tile);
            }
        });
    }

    private fillBorder(tile: HeightMapMeshTile, borderTile: HeightMapMeshTile): void {
        if (!tile.dem || tile.dem.borderReady) return;

        let dx = borderTile.tileKey.column - tile.tileKey.column;
        const dy = borderTile.tileKey.row - tile.tileKey.row;
        const dim = Math.pow(2, tile.tileKey.level);
        const borderId = borderTile.tileKey.mortonCode();

        if (dx === 0 && dy === 0) return;
        if (Math.abs(dy) > 1) return;

        if (Math.abs(dx) > 1) {
            if (Math.abs(dx + dim) === 1) {
                dx += dim;
            } else if (Math.abs(dx - dim) === 1) {
                dx -= dim;
            }
        }

        if (!borderTile.dem || !tile.dem) return;
        tile.dem.backfillBorder(borderTile.dem, dx, dy);
        tile.needsHillshadePrepare = true;
        tile.needsDEMTextureUpload = true;

        if (tile.neighboringTiles && tile.neighboringTiles[borderId]) {
            tile.neighboringTiles[borderId].backfilled = true;
        }
    }

    computeHeightMapPos(tileKey: TileKey, demTileKey: TileKey): THREE.Vector3 {
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        let ah = 1;
        let H = tileKey.level;
        let ae = tileKey.row;
        let J = tileKey.column;

        for (; H > demTileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }
        const P = 1 / ah;

        return new THREE.Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
    }

    getNeareastDemTile(tileKey: TileKey): HeightMapMeshTile | null {
        this._checkDisposed();
        if (!tileKey || !this.dataSource) return null;
        return this._findTileInCache(tileKey);
    }

    private _findTileInCache(tileKey: TileKey): HeightMapMeshTile | null {
        if (!this.dataSource) return null;

        const levels = [...this.dataSource.levelRange];
        if (tileKey.level < levels[levels.length - 1]) {
            return null;
        }

        for (const level of levels) {
            if (tileKey.level < level) continue;

            const offset = tileKey.level - level;
            const cacheKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offset,
                tileKey.column >> offset,
                level
            ).mortonCode();

            const tile = this.tileDemCache.get(cacheKey);
            if (tile?.dem) {
                return tile;
            }
        }
        return null;
    }

    getNeareastDemTileTexture(tileKey: TileKey): HeightMapTextureResult | false {
        if (!this.dataSource) return false;

        const levels = [...this.dataSource.levelRange];
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        let level;
        while ((level = levels.shift())) {
            if (tileKey.level < level) continue;

            const offset = tileKey.level - level;
            const offTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offset,
                tileKey.column >> offset,
                level
            );

            if (this.tileDemCache.has(offTileKey.mortonCode())) {
                const tile = this.tileDemCache.get(offTileKey.mortonCode());
                if (!tile.dem) continue;

                return {
                    tile,
                    uHeightMapPos: this.computeHeightMapPos(tileKey, tile.tileKey),
                    uHeighMapTexture: tile.dem.getPixels()
                };
            }
        }
        return false;
    }

    computeDisplacementMapPos(tileKey: TileKey, demTileKey: TileKey): THREE.Vector3 {
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        let ah = 1;
        let H = tileKey.level;
        let ae = tileKey.row;
        let J = tileKey.column;

        for (; H > demTileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }
        const P = 1 / ah;

        return new THREE.Vector3(P, (tileKey.column - J * ah) * P, (tileKey.row - ae * ah) * P);
    }

    getNeareastDisplacementMap(tileKey: TileKey): DisplacementMapResult | false {
        if (!this.dataSource) return false;

        const levels = [...this.dataSource.levelRange];
        if (tileKey.level < levels[levels.length - 1]) {
            return false;
        }

        let level;
        while ((level = levels.shift())) {
            if (tileKey.level < level) continue;

            const offset = tileKey.level - level;
            const offTileKey = TileKey.fromRowColumnLevel(
                tileKey.row >> offset,
                tileKey.column >> offset,
                level
            );

            if (this.tileDemCache.has(offTileKey.mortonCode())) {
                const tile = this.tileDemCache.get(offTileKey.mortonCode());
                if (!tile.dem) continue;

                const map = tile.dem.displacementMapTexture;
                const transfrom = this.computeDisplacementMapPos(tileKey, tile.tileKey);

                return {
                    tile,
                    displacementMap: map,
                    uvMatrix: new THREE.Matrix3().setUvTransform(
                        transfrom.y,
                        transfrom.z,
                        transfrom.x,
                        transfrom.x,
                        0,
                        0,
                        0
                    )
                };
            }
        }
        return false;
    }

    async fetchTileDem(tileKey: TileKey, abortSignal?: AbortSignal): Promise<any> {
        if (!this.dataSource) throw new Error("DataSource not bound");

        const dbuffer = await this.dataSource.fetchDemData(tileKey, abortSignal);

        const img: HTMLImageElement | ImageBitmap = await new Promise(resolve => {
            if (window.createImageBitmap) {
                arrayBufferToImageBitmap(dbuffer, (err, imgBitmap) => resolve(imgBitmap));
            } else {
                arrayBufferToImage(dbuffer, (err, img) => resolve(img));
            }
        });

        if (!img) return;

        const transfer =
            window.ImageBitmap && img instanceof ImageBitmap && offscreenCanvasSupported();
        const buffer = (img.width - prevPowerOfTwo(img.width)) / 2;
        const padding = 1 - buffer;
        const borderReady = padding < 1;
        const tile = this.tileDemCache.get(tileKey.mortonCode());

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
    }
}
