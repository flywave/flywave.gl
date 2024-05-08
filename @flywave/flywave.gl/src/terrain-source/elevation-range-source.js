import { CalculationStatus } from "@flywave/flywave-mapview";

class ElevationRangeSource {
    constructor(mapView) {
        this.mapView = mapView;
    }

    connect = () => Promise.resolve();
    ready = () => true;
    getTilingScheme = dataSources => dataSources[0].getTilingScheme();

    getElevationRange = (tikeKey, dataSources) => {
        if (!dataSources[0].getElevationRangeSource) {
            return {
                minElevation:0,
                maxElevation:0,
                calculationStatus: CalculationStatus.PendingApproximate
            };
        }
        return dataSources[0].getElevationRangeSource().getElevationRange(tikeKey);
    };
}

export { ElevationRangeSource };

class ElevationProvider {
    constructor(mapView) {
        this.mapView = mapView;
    }

    getHeight(coordinates, defaultIfNotLoaded) {
        var elevationProvider = this.mapView.terrainSource.getElevationProvider();
        if (this.mapView.stratumSource) {
            elevationProvider = this.mapView.stratumSource.getElevationProvider();
        }
        var h = elevationProvider.getAtPoint(coordinates, defaultIfNotLoaded);
        return h == defaultIfNotLoaded
            ? this.mapView.terrainSource.getElevationProvider().getHeight(coordinates)
            : h;
    }

    clearCache() {}

    getDisplacementMap() {}
}
export { ElevationProvider };
