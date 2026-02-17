/* Copyright (C) 2025 flywave.gl contributors */

// @ts-ignore
import {
    MapView,
    GeoCoordinates,
    GeoBox,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    ArcGISTileProvider,
    ellipsoidProjection,
    DataSource,
    ElevationRangeSource,
    MapViewOptions,
    TileKeyEntry,
    TileKey
} from "@flywave/flywave.gl";

import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";
import { CESIUM_ION_TOKEN } from "../token-config.js";



class MockMapView extends MapView {
    get isDynamicFrame() {
        return true;
    }

    constructor(options: MapViewOptions) {
        super(options);

        let getVisibleTileKeysForDataSources =
            this.visibleTileSet["getVisibleTileKeysForDataSources"];
        this.visibleTileSet["getVisibleTileKeysForDataSources"] = function (
            zoomLevel: number,
            dataSources: DataSource[],
            elevationRangeSource: ElevationRangeSource | undefined
        ) {
            // let { tileKeys, allBoundingBoxesFinal } = getVisibleTileKeysForDataSources.call(
            //     this,
            //     zoomLevel,
            //     dataSources,
            //     elevationRangeSource
            // );column 

            if (!dataSources[1])
                return {
                    tileKeys: [],
                    allBoundingBoxesFinal: true
                };
            return {
                tileKeys: [
                    {
                        dataSource: dataSources[1],
                        visibleTileKeys: [
                            new TileKeyEntry(TileKey.fromRowColumnLevel(92039, 217068, 17).parent().parent().parent().parent(), 1, 0), 
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(2, 2, 2), 1, 0),
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(2, 1, 2), 1, 0)
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(3, 1, 2), 1, 0)
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(0, 2, 1), 1, 0)
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(0, 3, 1), 1, 0)
                            // new TileKeyEntry(TileKey.fromRowColumnLevel(0, 0, 0), 1, 0)
                        ]
                    }
                ],
                allBoundingBoxesFinal: true
            };
        };
    }
}

class HeightmapPainterExample {
    private map?: MapView;
    private controls: MapControls;

    private cesiumTerrain?: CesiumWorldTerrainSource;
    private painter: HeightmapPainter | null = null;
    private painterContainer: HTMLDivElement | null = null;
    private mapContainer: HTMLDivElement | null = null;

    constructor() {
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
            height: 100vh;
            background: #000;
        `;

        this.mapContainer = document.createElement("div");
        this.mapContainer.style.cssText = `
            width: 100%;
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
            logarithmicDepthBuffer: false,
            canvas: canvas,
            theme: {
                extends: "resources/tilezen_base.json"
            }
        });

        const controls = new MapControls(map);
        const ui = new MapControlsUI(controls, { zoomLevel: "input" });
        this.mapContainer.appendChild(ui.domElement);
        this.controls = controls;

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
        // 创建 HeightmapPainter，传入 mapView 和 container
        // Painter 会自动把自己添加到 mapContainer 中
        this.painter = new HeightmapPainter({
            mapView: this.map,
            terrainSource: this.cesiumTerrain,
            mapControls: this.controls,
            container: this.mapContainer
        });

        this.painter.on("ready", () => {
            console.log("✨ Heightmap painter ready");
            console.log("📍 请先在配置面板设置绘制区域和输出尺寸");
        });

        // 监听导出事件，直接应用到地形
        this.painter.on("export", (data: any) => {
            this.handleExport(data);
        });

        // 监听高度变化，可以实现实时预览
        this.painter.on("heightmapChange", (heightData: Float32Array) => {
            // console.log("Height data changed:", heightData.length);
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
            "heightmap-painter",
            { type: "image", image: data.imageData },
            geoBox
        );

        console.log("Successfully applied heightmap to terrain:", modifierId);
    }
}

new HeightmapPainterExample();
