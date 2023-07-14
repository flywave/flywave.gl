import { MapViewEnvironment } from "@flywave/flywave-mapview";
import { SunLight } from "./objects/sun-light";
import { MaterialProvider } from "./terrain-source/material-provider";
import { VectorTileDataSource, GeoJsonDataProvider } from "@flywave/flywave-vectortile-datasource";

class Environment extends MapViewEnvironment {
    createLight(lightDescription) {
        let light = super.createLight(lightDescription);
        if (light) return light;

        switch (lightDescription.type) {
            case "sun-light": {
                return new SunLight(this.m_mapView).fromOptions(lightDescription);
            }
        }
    }

    update3DTileSources(fW3DTiles = []) {
        const fw3DTileList = Array.from(this.m_mapView.get3DTileSourceList());

        var needsRemove3DTiles = [];
        var needAdd3DTiles = [];

        fw3DTileList.forEach(baseUrl => {
            if (!fW3DTiles.find(srvUrl => baseUrl == srvUrl)) {
                needsRemove3DTiles.push(baseUrl);
            }
        });

        fW3DTiles.forEach(srvUrl => {
            if (!fw3DTileList.find(baseUrl => baseUrl == srvUrl)) {
                needAdd3DTiles.push(srvUrl);
            }
        });

        needsRemove3DTiles.forEach(baseUrl => this.m_mapView.remove3DTileSource(baseUrl));
        needAdd3DTiles.forEach(srvUrl => {
            this.m_mapView.add3DTileSource(srvUrl);
        });
    }

    updateTerrainDatasource(terrinOptions = { layers: [] }) {
        const { url, type, layers } = terrinOptions;
        if (!url) {
            this.m_mapView.clearElevationSource();
        } else {
            if (type == "hightmap") {
                if (this.m_mapView.heightMapSource.baseUrl != url)
                    this.m_mapView.setHeightMapSource(url);
            }
            if (type == "tin") {
                if (this.m_mapView.terrainSource.baseUrl != url)
                    this.m_mapView.setTinTerrainSource({ url, requestWaterMask: true });
            }
        }

        const materialProviders = this.m_mapView.getMaterialProviders();

        var needsRemoveProviders = [];
        var needAddProivders = [];

        materialProviders.forEach(imagery => {
            if (!layers.find(bg => imagery.baseUrl == bg.url)) {
                needsRemoveProviders.push(imagery);
            }
        });

        layers.forEach(layer => {
            if (!materialProviders.find(imagery => imagery.baseUrl == layer.url)) {
                needAddProivders.push(layer);
            }
        });

        needsRemoveProviders.forEach(provider => provider.remove());
        needAddProivders.forEach(layer => {
            this.m_mapView.addMaterialProviders(new MaterialProvider({ url: layer.url }));
        });
    }

    updateVectorDataSource(vectorSourceSettings = []) {
        const vectorDataSourceList = this.m_mapView.dataSources.filter(
            datasource => datasource instanceof VectorTileDataSource
        );

        var needsRemoveVectorDatasource = [];
        var needAddVectorDatasources = [];

        vectorDataSourceList.forEach(datasource => {
            if (!vectorSourceSettings.find(srv => datasource.name == srv.name)) {
                needsRemoveVectorDatasource.push(datasource);
            }
        });

        vectorSourceSettings.forEach(setting => {
            if (!vectorDataSourceList.find(datasource => datasource.name == setting.name)) {
                needAddVectorDatasources.push(setting);
            }
        });

        needsRemoveVectorDatasource.forEach(datasource => this.m_mapView.removeDataSource(datasource));
        needAddVectorDatasources.forEach(setting => {
            var config = {
                name: setting.name,
                styleSetName: setting.styleSetName,
                maxDataLevel: setting.maxDataLevel,
                addGroundPlane: setting.addGroundPlane
            };
            if (setting.geoJson) {
                config.dataProvider = new GeoJsonDataProvider(
                    setting.name,
                    typeof setting.geoJson == "string" ? new URL(setting.geoJson) : setting.geoJson
                );
            } else {
                config = {
                    ...config,
                    baseUrl: setting.baseUrl,
                    apiFormat: setting.apiFormat,
                    authenticationCode: setting.authenticationCode,
                    authenticationMethod: setting.authenticationMethod
                };
            }

            this.m_mapView.addDataSource(new VectorTileDataSource(config));
        });
    }

    updateMapViewAtmosphere({ enabled }) {
        this.m_mapView.atmosphere.enabled = enabled;
    }
}

export { Environment };
