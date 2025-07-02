import { TileKey } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { defaultValue } from "@flywave/flywave-utils";

import TileAvailability from "./TileAvailability";
import { TinMeshResourceTile } from "./TinTerrainLoader";
import { TinTerrainSource } from "./TinTerrainSource";

interface TinTerrainProviderOptions {
    url: string;
    requestVertexNormals?: boolean;
    requestWaterMask?: boolean;
    requestMetadata?: boolean;
}

export class TinTerrainProvider extends DataProvider {
    public levelLodSize: number = 5;
    public url: string;
    private readonly _requestVertexNormals: boolean;
    private readonly _requestWaterMask: boolean;
    private readonly _requestMetadata: boolean;
    public tinCache: LRUCache<number, TinMeshResourceTile>;
    public dataSource?: TinTerrainSource;
    private _availability?: TileAvailability; // Replace 'any' with proper type if available

    public get availability() {
        return this._availability;
    }

    constructor(options: TinTerrainProviderOptions) {
        super();
        this.url = options.url;
        this._requestVertexNormals = defaultValue(options.requestVertexNormals, false);
        this._requestWaterMask = defaultValue(options.requestWaterMask, false);
        this._requestMetadata = defaultValue(options.requestMetadata, true);

        this.tinCache = new LRUCache<number, TinMeshResourceTile>(5000);
        this.tinCache.evictionCallback = this.evictionCallback;
    }

    ready(): boolean {
        throw new Error("Method not implemented.");
    }

    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        throw new Error("Method not implemented.");
    }

    protected connect(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    protected dispose(): void {
        throw new Error("Method not implemented.");
    }

    bindDataSource(dataSource: TinTerrainSource): void {
        this.dataSource = dataSource;
        this._availability = dataSource.dataTerrainProvider.availability;
    }

    touchData(tileKey: TileKey): void {
        this.loadTileDataAvailability(tileKey);
    }

    unregister(): void {
        // Implementation if needed
    }

    requestTile(tileKey: TileKey): TinMeshResourceTile {
        const cachedTile = this.tinCache.get(tileKey.mortonCode());
        if (cachedTile) {
            return cachedTile;
        }

        if (!this.dataSource) {
            throw new Error("Data source not bound");
        }

        const tile = (this.dataSource as TinTerrainSource).dataTerrainProvider.makeLoaderTile(
            tileKey
        );
        tile.tileLoader.loadAndDecode().then(async () => {
            if (!tile.tileLoader.decodedTile) {
                throw new Error("No decoded tile available");
            }

            await tile.builderQuantized((tile.tileLoader.decodedTile as any).tileTerrain);
            this.dataSource.updateTileOverlayer(tile);

            this.dataSource
                .getElevationRangeSource()
                .updateMinMaxCache(tileKey, tile.minimumHeight, tile.maximumHeight);
        });
        this.tinCache.set(tileKey.mortonCode(), tile);

        return tile;
    }

    requestUpsampleTile(tileKey: TileKey, parentTileKey: TileKey): TinMeshResourceTile {
        if (!this.dataSource) {
            throw new Error("Data source not bound");
        }

        const parentTile = this.tinCache.get(parentTileKey.mortonCode());
        if (!parentTile) {
            throw new Error("Parent tile not found in cache");
        }

        const tile = this.dataSource.dataTerrainProvider.makeLoaderTile(tileKey, parentTile);
        tile.tileLoader.loadAndDecode().then(async () => {
            if (!tile.tileLoader.decodedTile) {
                throw new Error("No decoded tile available");
            }
            await tile.builderQuantized((tile.tileLoader.decodedTile as any).tileTerrain);
            this.dataSource.updateTileOverlayer(tile);
        });
        this.tinCache.set(tileKey.mortonCode(), tile);
        return tile;
    }

    loadRoot(): boolean {
        if (!this.dataSource) {
            return false;
        }

        const k1 = new TileKey(0, 0, 1);
        const k2 = new TileKey(0, 1, 1);
        let ready = true;

        const available1 = this.dataSource.dataTerrainProvider.getTileDataAvailable(k1);
        if (available1) {
            this.requestTile(k1);
            const tile1 = this.tinCache.get(k1.mortonCode());
            ready = ready && !!tile1?.tinData;
        }

        const available2 = this.dataSource.dataTerrainProvider.getTileDataAvailable(k2);
        if (available2) {
            this.requestTile(k2);
            const tile2 = this.tinCache.get(k2.mortonCode());
            ready = ready && !!tile2?.tinData;
        }

        return ready;
    }

    loadTile(tileKey: TileKey): void {
        if (!this.loadRoot()) {
            return;
        }

        let tk = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level);

        while (true) {
            if (this.tinCache.has(tk.mortonCode())) {
                return;
            }

            if (!this.dataSource) {
                return;
            }

            if (this.dataSource.dataTerrainProvider.getTileDataAvailable(tk)) {
                this.requestTile(tk);
                break;
            } else {
                if (tk.level === 0) break;
                const parent = tk.parent();
                if (this.tinCache.has(parent.mortonCode())) {
                    const tile = this.tinCache.get(parent.mortonCode());
                    if (tile?.tinData) {
                        this.requestUpsampleTile(tk, parent);
                    }
                    break;
                }
                tk = parent;
            }
        }
    }

    tileIsAvailable(tileKey: TileKey): boolean {
        const tile = this.tinCache.get(tileKey.mortonCode());
        return !!tile?.tinData;
    }

    getBestAvailableTile(tileKey: TileKey): TinMeshResourceTile | undefined {
        let tk = tileKey;
        while (true) {
            if (this.tileIsAvailable(tk)) {
                return this.tinCache.get(tk.mortonCode());
            }
            if (tk.level === 0) {
                break;
            }
            tk = tk.parent();
        }
        return undefined;
    }

    findAncestorTileWithTerrainData(tileKey: TileKey): TinMeshResourceTile | undefined {
        let tk = tileKey;
        while (true) {
            if (this.tileIsAvailable(tk)) {
                const tinTile = this.tinCache.get(tk.mortonCode());
                if (tinTile && !tinTile.wasCreatedByUpsampling()) {
                    return tinTile;
                }
            }
            if (tk.level === 0) {
                break;
            }
            tk = tk.parent();
        }
        return undefined;
    }

    disposeTile = (tileKey: TileKey): void => {
        this.tinCache.delete(tileKey.mortonCode());
    };

    private readonly evictionCallback = (key: number, value: TinMeshResourceTile): void => {
        if (value.geometry) {
            value.geometry.dispose();
        }
    };

    // Helper method that needs proper typing (implementation not shown in original code)
    private loadTileDataAvailability(tileKey: TileKey): void {
        // Implementation would go here
    }
}
