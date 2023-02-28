import {
    TileKey,
} from "@flywave/flywave-geoutils";

import { CalculationStatus } from "@flywave/flywave-mapview";

class ElevationRangeSource {
    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }

    connect = () => Promise.resolve();
    ready = () => true;
    getTilingScheme = () => this.dataSource.getTilingScheme();

    getMinMaxForTile(tileID: TileKey): ?{ min: number, max: number } { 
        const tinTile = this.dataSource.dataProvider().getBestAvailableTile(tileID)
        if (!tinTile || !tinTile.tinData) {
            return null;
        }
        return { min: tinTile.minimumHeight, max: tinTile.maximumHeight };
    }

    getElevationRange = (tikeKey) => {
        const range = this.getMinMaxForTile(tikeKey);
        if (!range) {
            return {
                calculationStatus: CalculationStatus.PendingApproximate
            }
        } else {
            const { min: minElevation, max: maxElevation } = range;
            return {
                minElevation,
                maxElevation,
                calculationStatus: CalculationStatus.FinalPrecise
            }
        }
    }
}

export { ElevationRangeSource };