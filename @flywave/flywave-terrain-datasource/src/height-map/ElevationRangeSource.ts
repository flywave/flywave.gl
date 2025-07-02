import { TileKey, webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { CalculationStatus } from "@flywave/flywave-mapview";

import DEMData from "./dem/DemData";
import { HeightMapSource } from "./HeightMapSource";

interface MinMaxResult {
    min: number;
    max: number;
}

interface ElevationRangeResult {
    minElevation: number;
    maxElevation: number;
    calculationStatus: CalculationStatus;
}

class ElevationRangeSource {
    private dataSource: HeightMapSource | null = null;

    bindDataSource(dataSource: HeightMapSource): void {
        this.dataSource = dataSource;
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    ready(): boolean {
        return true;
    }

    getTilingScheme(): typeof webMercatorTilingScheme | undefined {
        return this.dataSource?.getTilingScheme();
    }

    getMinMaxForTile(tileID: TileKey): MinMaxResult | null {
        if (!this.dataSource) {
            return null;
        }

        const demTile = this.dataSource.dataProvider().getNeareastDemTile(tileID);
        if (!(demTile && demTile.dem)) {
            return null;
        }

        const dem: DEMData = demTile.dem;
        const tree = dem.tree;
        const demTileID = demTile.tileKey;
        const scale = 1 << (tileID.level - demTileID.level);
        let xOffset = tileID.column / scale - demTileID.column;
        let yOffset = tileID.row / scale - demTileID.row;
        let index = 0; // Start from DEM tree root

        for (let i = 0; i < tileID.level - demTileID.level; i++) {
            if (tree.leaves[index]) break;
            xOffset *= 2;
            yOffset *= 2;
            const childOffset = 2 * Math.floor(yOffset) + Math.floor(xOffset);
            index = tree.childOffsets[index] + childOffset;
            xOffset = xOffset % 1;
            yOffset = yOffset % 1;
        }

        return {
            min: tree.minimums[index],
            max: tree.maximums[index]
        };
    }

    getElevationRange(tileKey: TileKey): ElevationRangeResult {
        const range = this.getMinMaxForTile(tileKey);
        if (!range) {
            return {
                minElevation: 0,
                maxElevation: 0,
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
    }
}

export { ElevationRangeSource };
