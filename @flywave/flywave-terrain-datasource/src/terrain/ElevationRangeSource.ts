import { TileKey } from "@flywave/flywave-geoutils";
import { CalculationStatus } from "@flywave/flywave-mapview";

import { TinTerrainProvider } from "./TinTerrainProvider";
import { TinTerrainSource } from "./TinTerrainSource";

interface MinMaxResult {
    min: number;
    max: number;
}

class ElevationRangeSource {
    private dataSource: TinTerrainSource;
    private readonly minMaxCache = new Map<number, [number, number]>();

    bindDataSource(dataSource: TinTerrainSource): void {
        this.dataSource = dataSource;
    }

    connect = (): Promise<void> => Promise.resolve();
    ready = (): boolean => true;
    getTilingScheme = (): any => this.dataSource.getTilingScheme();

    updateMinMaxCache(tileKey: TileKey, _minimumHeight: number, _maximumHeight: number): void {
        tileKey = TileKey.fromRowColumnLevel(tileKey.row, tileKey.column, tileKey.level + 1);
        while (tileKey) {
            const code = tileKey.mortonCode();
            let [minimumHeight, maximumHeight] = this.minMaxCache.get(code) || [
                _minimumHeight,
                _maximumHeight
            ];
            minimumHeight = Math.min(minimumHeight, _minimumHeight);
            maximumHeight = Math.max(maximumHeight, _maximumHeight);
            this.minMaxCache.set(code, [minimumHeight, maximumHeight]);
            tileKey = tileKey.parent();
            if (tileKey.level === 0) {
                break;
            }
        }
    }

    getMinMaxForTile(tileID: TileKey): MinMaxResult | null {
        if (this.minMaxCache.has(tileID.mortonCode())) {
            const [minimumHeight, maximumHeight] = this.minMaxCache.get(tileID.mortonCode())!;
            return { min: minimumHeight, max: maximumHeight };
        }
        const dataProvider = this.dataSource.dataProvider() as TinTerrainProvider;
        const tinTile = dataProvider.getBestAvailableTile(tileID);
        if (!tinTile || !tinTile.tinData) {
            return null;
        }
        return { min: tinTile.minimumHeight, max: tinTile.maximumHeight };
    }

    getElevationRange = (
        tikeKey: TileKey
    ): {
        minElevation: number;
        maxElevation: number;
        calculationStatus: CalculationStatus;
    } => {
        const range = this.getMinMaxForTile(tikeKey);
        if (!range) {
            return {
                minElevation: 0,
                maxElevation: 0,
                calculationStatus: CalculationStatus.PendingApproximate
            };
        }
        return {
            minElevation: range.min,
            maxElevation: range.max,
            calculationStatus: CalculationStatus.FinalPrecise
        };
    };
}

export { ElevationRangeSource };
