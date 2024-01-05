import { TileKey } from "@flywave/flywave-geoutils";

import { CalculationStatus } from "@flywave/flywave-mapview";

class ElevationRangeSource {
    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }

    connect = () => Promise.resolve();
    ready = () => true;
    getTilingScheme = () => this.dataSource.getTilingScheme();

    minMaxCache = new Map();

    updateMinMaxCache(tileKey, _minimumHeight, _maximumHeight) {
        tileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level + 1);
        while (tileKey) {
            let code = tileKey.mortonCode();
            let [minimumHeight, maximumHeight] = this.minMaxCache.get(code) || [
                _minimumHeight,
                _maximumHeight
            ];
            minimumHeight = Math.min(minimumHeight, _minimumHeight);
            maximumHeight = Math.max(maximumHeight, _maximumHeight);
            this.minMaxCache.set(tileKey.mortonCode(), [minimumHeight, maximumHeight]);
            tileKey = tileKey.parent();
            if (tileKey.level == 0) {
                break;
            }
        }
    }

    getMinMaxForTile(tileID: TileKey): ?{ min: number, max: number } {
        if (this.minMaxCache.has(tileID.mortonCode())) {
            let [minimumHeight, maximumHeight] = this.minMaxCache.get(tileID.mortonCode());
            return { min: minimumHeight, max: maximumHeight };
        }
        const tinTile = this.dataSource.dataProvider().getBestAvailableTile(tileID);
        if (!tinTile || !tinTile.tinData) {
            return null;
        }
        return { min: tinTile.minimumHeight, max: tinTile.maximumHeight };
    }

    getElevationRange = tikeKey => {
        const range = this.getMinMaxForTile(tikeKey);
        if (!range) {
            return {
                calculationStatus: CalculationStatus.PendingApproximate
            };
        } else {
            const { min: minElevation, max: maxElevation } = range;
            return {
                minElevation,
                maxElevation,
                calculationStatus: CalculationStatus.FinalPrecise
            };
        }
    };
}

export { ElevationRangeSource };
