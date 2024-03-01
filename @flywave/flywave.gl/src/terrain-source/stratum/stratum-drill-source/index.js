import { FeaturesDataSource } from "../../../feature-datasource";
import { StratumDrillTileFactory } from "./tile";
import defaultStyles from "./default-style";

class StratumDrillSource extends FeaturesDataSource {
    maxGeometryHeight = 2000;

    minGeometryHeight = -800;

    constructor(decodeUrl, stratumSource, theme, maxDataLevel) {
        super({
            tileFactory: new StratumDrillTileFactory(),
            concurrentDecoderScriptUrl: decodeUrl,
            styleSetName: "stratum-drill",
            name: "stratum-drill",
            gatherFeatureAttributes: true,
            maxDataLevel
        });
        this._stratumSource = stratumSource;
        this.theme = theme;
    }

    _radius = 10;

    get radius() {
        return this._radius;
    }

    set radius(t) {
        this._radius = t;

        if (this.m_isAttached) {
            // var { visibleTiles } = this.mapView.visibleTileSet.dataSourceTileList.find(
            //     ({ dataSource }) => dataSource == this
            // );

            // visibleTiles.forEach();

            this.mapView.clearTileCache(this.name);
        }
    }

    get stratumSource() {
        return this._stratumSource;
    }

    updateTheme() {
        // this.setTheme({ ...defaultStyles, ...this.theme });
    }

    async updateSourceDrill() {
        const { stratum_data } = this._stratumSource.dataTerrainProvider;
        var id = 0;
        stratum_data.forEach(({ features, properties }, index) => {
            const { name: layerName, id: layerId } = properties || {};
            features.forEach(feature => {
                if (!feature.properties) {
                    feature.properties = {};
                }
                feature.properties.layerName = layerName;
                feature.properties.layerId = layerId;
                // if (index == 0) {
                //     feature.properties.thickness =
                //         feature.geometry.coordinates[2] -
                //         stratum_data[1].features[index].geometry.coordinates[2];
                // }
                feature.properties.layer = index;
                feature.id = id++;

                const [a, b, c] = feature.geometry.coordinates;
                const { thickness } = feature.properties;

                if (id == 1) {
                    this.addFeature({
                        geometry: { type: "Point", coordinates: [a, b, c + thickness] },
                        type: "Feature",
                        properties: {
                            name: feature.properties.name
                        }
                    });
                }

                feature.geometry.coordinates = [a, b, c + thickness / 2];
                feature.properties.name = layerName;

                this.addFeature(feature);
            });
        });
    }
}

export default StratumDrillSource;
