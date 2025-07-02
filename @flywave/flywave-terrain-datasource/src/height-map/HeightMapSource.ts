import { TileKey } from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import range from "lodash.range";
import { Box2, Vector2 } from "three";

import { TerrainSource } from "../TerrainSource";
import { RESTER_DEM_TILE_DECODER_ID } from "./Constants";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { HeightMapProvider } from "./HeightMapProvider";
import { HeightMapMeshTile, HeightMapMeshTileFactory } from "./HeightMapTile";
import { OverlayerHeightMap } from "./OverlayerHeightMap";

interface SourceDescription {
    tiles: string[];
    scheme: string;
    bounds: [number, number, number, number];
    minzoom: number;
    maxzoom: number;
    tileSize: number;
}

let id = 0;
const downloadManager = TransferManager.instance();

export class HeightMapSource extends TerrainSource<HeightMapMeshTile> {
    public levelRange: number[] = [];
    public scheme: string = "xyz";
    public enableHD: boolean = true;
    public overlayerHeightMapTexture: OverlayerHeightMap;
    public bounds: Box2 = new Box2(new Vector2(180, 90), new Vector2(-180, -90));
    private _source: string | SourceDescription | null = null;
    private tileUriList: string[] = [];

    constructor(options: any) {
        super({
            ...options,
            concurrentDecoderServiceName: RESTER_DEM_TILE_DECODER_ID,
            maxDisplayLevel: 22,
            name: `dem_terrain_data_source${id++}`,
            tileFactory: HeightMapMeshTileFactory, // Add required constructor reference
            dataProvider: new HeightMapProvider(),
            elevationRangeSource: new ElevationRangeSource(),
            elevationProvider: new ElevationProvider()
        });

        this.overlayerHeightMapTexture = new OverlayerHeightMap(this);
    }

    decodeSourceFile = (source: SourceDescription): void => {
        const { tiles, scheme, bounds, minzoom, maxzoom, tileSize } = source;
        this.levelRange = range(minzoom, maxzoom, 1).sort((a, b) => b - a);
        this.tileUriList = tiles;
        this.scheme = scheme;
        this.enableHD = tileSize === 512;
        const [minLng, minLat, maxLng, maxLat] = bounds;
        this.bounds = new Box2(new Vector2(minLng, minLat), new Vector2(maxLng, maxLat));
        this.dataProvider().clear();
        if (!this.isDetached()) {
            this.mapView?.markTilesDirty(this);
        }
    };

    containsTile(tileKey: TileKey): boolean {
        const geoBox = this.getTilingScheme().getGeoBox(tileKey);
        const { lng: minLng, lat: minLat } = geoBox.southWest;
        const { lng: maxLng, lat: maxLat } = geoBox.northEast;
        return this.bounds.intersectsBox(
            new Box2(new Vector2(minLng, minLat), new Vector2(maxLng, maxLat))
        );
    }

    async connect(): Promise<void> {
        await super.connect();
    }

    get baseUrl(): string | null {
        return typeof this._source === "string" ? this._source : null;
    }

    async setSourceTerrain(source: string | SourceDescription): Promise<void> {
        this._source = source;
        if (typeof source === "string") {
            const jsonSource = await downloadManager.downloadJson(source);
            return this.decodeSourceFile(jsonSource as SourceDescription);
        }
        return this.decodeSourceFile(source);
    }

    emptySource(): void {
        this.decodeSourceFile({
            minzoom: -2,
            maxzoom: -1,
            bounds: [180, 90, -180, -90],
            tiles: [],
            scheme: "xyz",
            tileSize: 256
        });
    }

    fetchDemData = (tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBuffer> => {
        if (!this.containsTile(tileKey)) {
            return Promise.reject({ name: "AbortError" });
        }

        let url = this.tileUriList[tileKey.mortonCode() % this.tileUriList.length];
        if (this.scheme === "xyz") {
            url = url
                .replace("{x}", String(tileKey.column))
                .replace("{y}", String(tileKey.row))
                .replace("{z}", String(tileKey.level));
        }

        return downloadManager.downloadArrayBuffer(url, { signal: abortSignal }).catch(e => {
            throw e;
        });
    };

    get size(): number {
        return this.enableHD ? 512 : 256;
    }

    // Type-safe access to dataProvider with proper casting
    dataProvider(): HeightMapProvider {
        return super.dataProvider() as HeightMapProvider;
    }
}
