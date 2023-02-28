
import { TileKey } from "@flywave/flywave-geoutils";

export class LayerInfo {
    constructor(layerData) {
        this.layerData = layerData;
    }

    getMaxZoom() {
        return this.layerData.maxzoom;
    }

    getMinZoom() {
        return this.layerData.minzoom == 0 ? 1 : this.layerData.minzoom;
    }

    getTileUrl(tileKey: TileKey) {
        const { tiles, version } = this.layerData;
        const { column, row, level } = tileKey;
        const quadKey = tileKey.toQuadKey();
        const server = parseInt(quadKey[quadKey.length - 1], tiles.length) + 1;

        return tiles[server || 0].replace("{x}", column).replace("{y}", row).replace("{z}", level-1).replace("{version}", version);
    }

    isExitTile(tileKey: TileKey) {
        const { available } = this.layerData;
        var { column, row, level } = tileKey;
        if(level==0)return false;
        level = level-1;;
        if (!available[level]) {
            return false;
        }

        const tileExtents = available[level];

        return tileExtents.some((item) => {
            const { startX, startY, endX, endY } = item;
            return (column >= startX && column <= endX) && (row >= startY && row <= endY);
        });
    }

    findNearTile(tileKey: TileKey, callback) {
        do {

            if (this.isExitTile(tileKey)) {
                if (callback) {
                    if (callback(tileKey)) {
                        return tileKey;
                    }
                    return false;
                } else {
                    return tileKey;
                }
            }
            if (tileKey.level == 0) {
                return false;
            }
            tileKey = tileKey.parent();

        } while (tileKey.level >= this.getMinZoom())

    }
}