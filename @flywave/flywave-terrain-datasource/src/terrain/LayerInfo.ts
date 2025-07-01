import { TileKey } from "@flywave/flywave-geoutils";

interface LayerData {
    maxzoom: number;
    minzoom: number;
    tiles: string[];
    version: string;
    available?: Array<{
        level: number;
        ranges: Array<{
            startX: number;
            startY: number;
            endX: number;
            endY: number;
        }>;
    }>;
}

export class LayerInfo {
    private readonly layerData: LayerData;

    constructor(layerData: LayerData) {
        this.layerData = layerData;
    }

    getMaxZoom(): number {
        return this.layerData.maxzoom;
    }

    getMinZoom(): number {
        return this.layerData.minzoom === 0 ? 1 : this.layerData.minzoom;
    }

    getTileUrl(tileKey: TileKey): string {
        const { tiles, version } = this.layerData;
        const { column, row, level } = tileKey;
        const quadKey = tileKey.toQuadKey();
        const server = parseInt(quadKey[quadKey.length - 1], 10) % tiles.length;

        return tiles[server]
            .replace("{x}", column.toString())
            .replace("{y}", row.toString())
            .replace("{z}", (level - 1).toString())
            .replace("{version}", version);
    }

    isExitTile(tileKey: TileKey): boolean {
        const { available } = this.layerData;
        let { column, row, level } = tileKey;

        if (level === 0) return false;
        level = level - 1;

        if (!available) {
            return false;
        }

        const levelData = available.find(item => item.level === level);
        if (!levelData) {
            return false;
        }

        return levelData.ranges.some(range => {
            const { startX, startY, endX, endY } = range;
            return column >= startX && column <= endX && row >= startY && row <= endY;
        });
    }

    findNearTile(tileKey: TileKey, callback?: (tileKey: TileKey) => boolean): TileKey | false {
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
            if (tileKey.level === 0) {
                return false;
            }
            tileKey = tileKey.parent();
        } while (tileKey.level >= this.getMinZoom());

        return false;
    }
}
