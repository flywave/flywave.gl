import { ElevationProvider } from "../tin-terrain/elevation-provider";

class StratumElevationProvider extends ElevationProvider {
    getBestAvailableTile(tk) {
        var tile = this.dataSource.dataProvider().getBestAvailableTile(tk);
        if (tile && tile.isEmptyStratum(this.tinData)) return false;
        return tile;
    }
}

export default StratumElevationProvider;
