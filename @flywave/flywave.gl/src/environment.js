import { MapViewEnvironment } from "@flywave/flywave-mapview";
import { SunLight } from "./objects/sun-light";
import { MaterialProvider } from "./terrain-source/material-provider";

class Environment extends MapViewEnvironment {
    createLight(lightDescription) {
        let light = super.createLight(lightDescription);
        if (light) return light;

        switch (lightDescription.type) {
            case "sun-light": {
                return SunLight(this.m_mapView).fromOptions(lightDescription);
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
            return;
        }

        if (type == "hightmap") {
            this.m_mapView.setHeightMapSource(url);
        }
        if (type == "tin") {
            this.m_mapView.setTinTerrainSource({ url, requestWaterMask: true });
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
            map.addMaterialProviders(new MaterialProvider({ url: layer.url }));
        });
    }

    updateMapViewAtmosphere({ enable }) {
        this.m_mapView.atmosphere.enabled = enable;
    }
}

export { Environment };
