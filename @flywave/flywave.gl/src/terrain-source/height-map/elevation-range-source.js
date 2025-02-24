import { TileKey } from "@flywave/flywave-geoutils";

import { CalculationStatus } from "@flywave/flywave-mapview";
import { webMercatorTilingScheme } from "@flywave/flywave-geoutils";

class ElevationRangeSource {
    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }

    connect = () => Promise.resolve();
    ready = () => true;
    getTilingScheme = () => this.dataSource.getTilingScheme();

    getMinMaxForTile(tileID: TileKey): ?{ min: number, max: number } {
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
        let index = 0; // Start from DEM tree root.
        for (let i = 0; i < tileID.level - demTileID.level; i++) {
            if (tree.leaves[index]) break;
            xOffset *= 2;
            yOffset *= 2;
            const childOffset = 2 * Math.floor(yOffset) + Math.floor(xOffset);
            index = tree.childOffsets[index] + childOffset;
            xOffset = xOffset % 1;
            yOffset = yOffset % 1;
        }

        let digAlt = 0;
        if (this.dataSource.overlayerHeightMapTexture) {
            digAlt =
                this.dataSource.overlayerHeightMapTexture.getTileBoxDigAltitude(
                    webMercatorTilingScheme.getGeoBox(tileID)
                ) || 0;
        }

        return { min: tree.minimums[index] - digAlt, max: tree.maximums[index] };
    }

    getElevationRange = tikeKey => {
        const range = this.getMinMaxForTile(tikeKey);
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
    };
}

export { ElevationRangeSource };
