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
                calculationStatus: CalculationStatus.PendingApproximate
            };
        }
        return dataSources[0].getElevationRangeSource().getElevationRange(tikeKey);
    };
}

export { ElevationRangeSource };

class ElevationProvider {
    constructor(mapView, elevationProvider) {
        this.mapView = mapView;
        this.elevationProvider = elevationProvider;
    }

    getHeight(coordinates) {
        return this.elevationProvider
            ? this.elevationProvider.getHeight(coordinates)
            : -this.mapView.mapOrbitControl.getEllipsoidMaximumDepth();
    }

    clearCache() {}
}
export { ElevationProvider };
