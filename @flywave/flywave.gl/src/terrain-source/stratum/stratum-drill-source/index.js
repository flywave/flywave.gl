import { FeaturesDataSource } from "../../../feature-datasource";
import { StratumDrillTileFactory } from "./tile";
import defaultStyles from "./default-style";

class StratumDrillSource extends FeaturesDataSource {
    maxGeometryHeight = 2000;

    minGeometryHeight = -800;

    constructor(decodeUrl, stratumSource, theme) {
        super({
            // tileFactory: new StratumDrillTileFactory(),
            concurrentDecoderScriptUrl: decodeUrl,
            styleSetName: "stratum-drill",
            gatherFeatureAttributes: true
        });
        this._stratumSource = stratumSource;
        this.theme = theme;

        this.addFeature({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [112.8145795436628, 36.272557145701626, 2000]
            },
            properties: {
                name: "Dinagat Islands"
            }
        });
    }

    updateTheme() {
        this.setTheme({ ...defaultStyles, ...this.theme });
    }

    async updateSourceDrill() {
        this._stratumSource.dataTerrainProvider;
    }
}

export default StratumDrillSource;
