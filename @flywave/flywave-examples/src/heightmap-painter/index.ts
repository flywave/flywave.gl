/* Copyright (C) 2025 flywave.gl contributors */

// @ts-ignore
import {
    MapView,
    GeoCoordinates,
    GeoBox,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    HeightMapBlendMode,
    ArcGISTileProvider,
    ellipsoidProjection
} from "@flywave/flywave.gl";

// @ts-ignore
import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";
// @ts-ignore
import { CESIUM_ION_TOKEN } from "../token-config.js";

class HeightmapPainterExample {
    private map: MapView;
    private cesiumTerrain: CesiumWorldTerrainSource;
    private painter: HeightmapPainter | null = null;
    private painterContainer: HTMLDivElement | null = null;
    private mapContainer: HTMLDivElement | null = null;

    constructor() {
        this.map = null as any;
        this.cesiumTerrain = null as any;
        this.painterContainer = null;
        this.mapContainer = null;
        this.initialize();
    }

    async initialize() {
        this.setupLayout();
        this.map = await this.initializeMapView();
        this.cesiumTerrain = await this.configureDEMTerrainSource();
        await this.initializePainter();
        this.map.beginAnimation();
    }

    setupLayout() {
        document.body.style.cssText = `
            margin: 0;
            padding: 0;
            overflow: hidden;
            display: flex;
            height: 100vh;
            background: #000;
        `;

        this.painterContainer = document.createElement("div");
        this.painterContainer.style.cssText = `
            width: 50%;
            height: 100%;
            background: #1a1a1a;
            position: relative;
            border-right: 2px solid #333;
        `;
        document.body.appendChild(this.painterContainer);

        this.mapContainer = document.createElement("div");
        this.mapContainer.style.cssText = `
            flex: 1;
            height: 100%;
            position: relative;
        `;
        document.body.appendChild(this.mapContainer);
    }

    async initializeMapView(): Promise<MapView> {
        const canvas = document.createElement("canvas");
        canvas.id = "mapCanvas";
        canvas.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
        `;
        this.mapContainer.appendChild(canvas);

        const map = new MapView({
            target: new GeoCoordinates(36.4, 118.1, 1000),
            zoomLevel: 17,
            projection: ellipsoidProjection,
            canvas: canvas,
            theme: {
                extends: "resources/tilezen_base.json"
            }
        });

        const controls = new MapControls(map);
        const ui = new MapControlsUI(controls, { zoomLevel: "input" });
        this.mapContainer.appendChild(ui.domElement);

        return map;
    }

    async configureDEMTerrainSource(): Promise<CesiumWorldTerrainSource> {
        const cesiumTerrain = new CesiumWorldTerrainSource({
            accessToken: CESIUM_ION_TOKEN,
            assetId: 1
        });

        this.map.setElevationSource(cesiumTerrain);

        cesiumTerrain.addWebTileDataSource(
            new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
        );

        return cesiumTerrain;
    }

    async initializePainter() {
        this.painter = new HeightmapPainter({
            width: 1024,
            height: 1024,
            initialCenter: [36.4, 118.1] as [number, number],
            initialZoom: 13,
            basemap: "satellite"
        });

        const element = this.painter.getElement();
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.position = "absolute";
        element.style.top = "0";
        element.style.left = "0";
        this.painterContainer.appendChild(element);

        this.painter.on("ready", () => {
            console.log("Heightmap painter ready");
            console.log("左侧：高度图编辑器 | 右侧：3D地形");
            console.log("在左侧绘制，导出后会自动应用到右侧3D地形");
        });

        this.painter.on("export", (data: any) => {
            this.handleExport(data);
        });
    }

    handleExport(data: any) {
        console.log("Applying heightmap to 3D terrain:", data);

        const manager = this.cesiumTerrain.getGroundModificationManager();

        const geoBox = new GeoBox(
            new GeoCoordinates(data.geoBox.minLat, data.geoBox.minLon),
            new GeoCoordinates(data.geoBox.maxLat, data.geoBox.maxLon)
        );

        const modifierId = manager.addModifier(
            { type: "image", image: data.imageData },
            geoBox,
            HeightMapBlendMode.ADD,
            1.0,
            { min: 0, max: 500 }
        );

        console.log("Successfully applied heightmap to terrain:", modifierId);
    }
}

new HeightmapPainterExample();
