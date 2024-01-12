import { MapViewThemeManager } from "@flywave/flywave-mapview";
import { Environment } from "./environment";

class ThemeManager extends MapViewThemeManager {
    async updateTheme(theme) {
        await super.updateTheme(theme);
        this.updateExtendsTheme(theme);
    }

    updateExtendsTheme(theme) {
        const environment = this.m_mapView.sceneEnvironment;

        if (environment instanceof Environment) {
            if (theme.fw3dtiles) environment.update3DTileSources(theme.fw3dtiles || []);

            if (theme.atmosphere) environment.updateMapViewAtmosphere(theme.atmosphere || {});

            if (theme.terrain) environment.updateTerrainDatasource(theme.terrain || {});

            // if (theme.dataSources) environment.updateVectorDataSource(theme.dataSources || []);
        }
    }
}

export { ThemeManager };
