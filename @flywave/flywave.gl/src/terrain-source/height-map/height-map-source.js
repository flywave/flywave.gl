import { HeightMapProvider } from "./height-map-provider";
import { HeightMapMeshTileFactory } from "./height-map-tile";
import { ElevationRangeSource } from "./elevation-range-source";
import { ElevationProvider } from "./elevation-provider";
import { RESTER_DEM_TILE_DECODER_ID } from "../height-map/constants";
import { TerrainSource } from "../terrain-source";
import range from "lodash.range";
import { TileKey } from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { Box2, Vector2, ImageLoader } from "three";

var id = 0;
var downloadManager = TransferManager.instance();
export class HeightMapSource extends TerrainSource {
    levelRange = [];

    scheme = "xyz";

    enableHD = true;

    constructor(options) {
        super({
            ...options,
            concurrentDecoderServiceName: RESTER_DEM_TILE_DECODER_ID,
            maxDisplayLevel: 22,
            name: "dem_terrain_data_source" + id++,
            tileFactory: new HeightMapMeshTileFactory(),
            dataProvider: new HeightMapProvider(),
            elevationRangeSource: new ElevationRangeSource(),
            elevationProvider: new ElevationProvider()
        });
    }

    decodeSourceFile = source => {
        const { tiles, scheme, bounds, minzoom, maxzoom, tileSize } = source;
        this.levelRange = range(minzoom, maxzoom, 1).sort((a, b) => b - a);
        this.tileUriList = tiles;
        this.scheme = scheme;
        this.enableHD = tileSize == 512;
        const [milng, milat, mxlng, mxlat] = bounds;
        this.bounds = new Box2(new Vector2(milng, milat), new Vector2(mxlng, mxlat));
        this.dataProvider().clear();
        if (!this.isDetached()) this.mapView.markTilesDirty(this);
    };

    containsTile(tileKey: TileKey) {
        var geoBox = this.getTilingScheme().getGeoBox(tileKey);
        const { lng: mlng, lat: mlat } = geoBox.southWest;
        const { lng, lat } = geoBox.northEast;
        return this.bounds.intersectsBox(new Box2(new Vector2(mlng, mlat), new Vector2(lng, lat)));
    }

    async connect() {
        await super.connect();
    }

    get baseUrl() {
        return this._source;
    }

    async setSourceTerrain(source) {
        this._source = source;
        if (typeof source == "string")
            return await downloadManager.downloadJson(source).then(this.decodeSourceFile);
        return Promise.resolve(source).then(this.decodeSourceFile);
    }

    emptySource() {
        this.decodeSourceFile({
            minzoom: -2,
            maxzoom: -1,
            bounds: [180, 90, -180, -90]
        });
    }

    fetchDemData = (tileKey: TileKey, abortSignal) => {
        if (!this.containsTile(tileKey)) {
            return Promise.reject({ name: "AbortError" });
        }
        var url = this.tileUriList[tileKey.mortonCode() % this.tileUriList.length];
        if (this.scheme == "xyz") {
            url = url
                .replace("{x}", String(tileKey.column))
                .replace("{y}", `${String(tileKey.row)}`)
                .replace("{z}", String(tileKey.level));
        }

        return downloadManager.downloadArrayBuffer(url, { signal: abortSignal }).catch(e => {
            console.log();
        });
    };

    get size() {
        return this.enableHD ? 512 : 256;
    }
}
