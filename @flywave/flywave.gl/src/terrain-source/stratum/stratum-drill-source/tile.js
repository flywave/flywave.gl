import FeaturesDataSource from "@flywave/flywave-features-datasource";
import { TileFactory } from "@flywave/flywave-mapview-decoder";
import { Tile } from "@flywave/flywave-mapview";

class StratumDrillTile extends Tile {
    constructor(dataSource, tileKey) {
        super(dataSource, tileKey);
    }
}

export class StratumDrillTileFactory extends TileFactory {
    create(dataSource, tileKey) {
        return new StratumDrillTile(dataSource, tileKey);
    }
}
