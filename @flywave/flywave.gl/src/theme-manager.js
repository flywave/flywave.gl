import { MapViewThemeManager } from "@flywave/flywave-mapview";
import { Environment } from "./environment";

class ThemeManager extends MapViewThemeManager {
    async updateTheme(theme) {
        await super.updateTheme(theme);

        const environment = this.m_mapView.sceneEnvironment;

        if (environment instanceof Environment) {
            environment.update3DTileSources(theme.fw3dtiles || []);
            environment.updateMapViewAtmosphere(theme.atmosphere || {});
            environment.updateTerrainDatasource(theme.terrain || {});
        }
    }
}

export { ThemeManager };
