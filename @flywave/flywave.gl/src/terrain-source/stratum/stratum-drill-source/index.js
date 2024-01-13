import { FeaturesDataSource } from "../../../feature-datasource";
import { StratumDrillTileFactory } from "./tile";
import defaultStyles from "./default-style";

class StratumDrillSource extends FeaturesDataSource {
    maxGeometryHeight = 2000;

    minGeometryHeight = -800;

    constructor(decodeUrl, stratumSource, theme) {
        super({
            tileFactory: new StratumDrillTileFactory(),
            concurrentDecoderScriptUrl: decodeUrl,
            styleSetName: "stratum-drill",
            gatherFeatureAttributes: true
        });
        this._stratumSource = stratumSource;
        this.theme = theme;
    }

    get stratumSource() {
        return this._stratumSource;
    }

    updateTheme() {
        this.setTheme({ ...defaultStyles, ...this.theme });
    }

    async updateSourceDrill() {
        const { stratum_data } = this._stratumSource.dataTerrainProvider;
        var id = 0;
        stratum_data.forEach(({ features }, index) => {
            features.forEach(feature => {
                if (!feature.properties) {
                    feature.properties = {};
                }
                feature.properties.layer = index;
                feature.id = id++;
                this.addFeature(feature);
            });
        });
    }
}

export default StratumDrillSource;
