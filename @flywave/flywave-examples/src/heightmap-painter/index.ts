/* Copyright (C) 2025 flywave.gl contributors */

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
import { HeightmapPainter, BrushType } from "@flywave/flywave-heightmap-painter";
import { CESIUM_ION_TOKEN } from "../token-config";

const CONFIG = {
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17,
    PAINTER_WIDTH: 1024,
    PAINTER_HEIGHT: 1024,
    INITIAL_CENTER: [36.4, 118.1] as [number, number],
    INITIAL_ZOOM: 13,
    BASEMAP: "satellite" as const,
    PAINT_AREA_GEOBOX: {
        minLon: 118.09,
        minLat: 36.39,
        maxLon: 118.11,
        maxLat: 36.41
    }
};

const getMapCanvas = (id: string): HTMLCanvasElement => {
    const canvas = document.getElementById(id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`
        );
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const map = new MapView({
        target: CONFIG.INITIAL_COORDINATES,
        zoomLevel: CONFIG.ZOOM_LEVEL,
        projection: ellipsoidProjection,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base.json"
        }
    });

    const controls = new MapControls(map);
    const ui = new MapControlsUI(controls, { zoomLevel: "input" });
    canvas.parentElement!.appendChild(ui.domElement);

    return map;
};

const configureDEMTerrainSource = async (mapView: MapView): Promise<CesiumWorldTerrainSource> => {
    const cesiumTerrain = new CesiumWorldTerrainSource({
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1
    });

    mapView.setElevationSource(cesiumTerrain);

    cesiumTerrain.addWebTileDataSource(
        new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
    );

    return cesiumTerrain;
};

const initializeHeightmapPainter = (): HeightmapPainter => {
    const painter = new HeightmapPainter({
        width: CONFIG.PAINTER_WIDTH,
        height: CONFIG.PAINTER_HEIGHT,
        initialCenter: CONFIG.INITIAL_CENTER,
        initialZoom: CONFIG.INITIAL_ZOOM,
        basemap: CONFIG.BASEMAP
        // 不传入 paintAreaGeoBox，让用户在配置面板设置
    });

    const element = painter.getElement();
    element.style.position = "absolute";
    element.style.top = "50%";
    element.style.left = "50%";
    element.style.transform = "translate(-50%, -50%)";
    element.style.zIndex = "1000";

    document.body.appendChild(element);

    painter.on("ready", () => {
        console.log("Heightmap painter is ready");
        console.log("\n使用说明：");
        console.log("1. 在配置面板设置输出尺寸（宽 x 高）");
        console.log("2. 在地图上导航到目标位置");
        console.log("3. 点击'开始绘制'按钮");
        console.log("4. 在红色框内绘制高程图");
        console.log("5. 点击'导出'按钮导出结果");
        console.log("");
    });

    painter.on("heightmapChange", data => {
        console.log(`Heightmap changed, size: ${data.length}`);
    });

    painter.on("export", data => {
        console.log("\n导出数据:");
        console.log("  GeoBox:", data.geoBox);
        console.log("  尺寸:", `${data.width}x${data.height}`);
        console.log("  图像数据:", data.imageData);
        console.log("");
    });

    return painter;
};

const applyHeightmapToTerrain = (
    cesiumTerrain: CesiumWorldTerrainSource,
    exportData: ReturnType<HeightmapPainter["exportHeightmap"]>
): string | null => {
    if (!exportData) {
        console.error("No heightmap data to apply");
        return null;
    }

    const manager = cesiumTerrain.getGroundModificationManager();

    const geoBox = new GeoBox(
        new GeoCoordinates(exportData.geoBox.minLat, exportData.geoBox.minLon),
        new GeoCoordinates(exportData.geoBox.maxLat, exportData.geoBox.maxLon)
    );

    const modifierId = manager.addModifier(
        { type: "image", image: exportData.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 500 }
    );

    console.log("Applied heightmap to terrain:", modifierId);
    console.log(`  GeoBox:`, exportData.geoBox);

    return modifierId;
};

const setupPainterControls = (
    painter: HeightmapPainter,
    cesiumTerrain: CesiumWorldTerrainSource
): void => {
    let currentModifierId: string | null = null;

    const applyButton = document.createElement("button");
    applyButton.textContent = "Apply to Terrain";
    applyButton.style.position = "absolute";
    applyButton.style.top = "10px";
    applyButton.style.left = "10px";
    applyButton.style.zIndex = "1001";
    applyButton.style.padding = "10px 20px";
    applyButton.style.backgroundColor = "#4CAF50";
    applyButton.style.color = "white";
    applyButton.style.border = "none";
    applyButton.style.borderRadius = "4px";
    applyButton.style.cursor = "pointer";
    applyButton.style.fontSize = "14px";
    applyButton.style.fontWeight = "bold";

    applyButton.onclick = () => {
        const data = painter.exportHeightmap();
        if (currentModifierId) {
            const manager = cesiumTerrain.getGroundModificationManager();
            manager.removeModifier(currentModifierId);
        }

        currentModifierId = applyHeightmapToTerrain(cesiumTerrain, data);

        if (currentModifierId) {
            applyButton.textContent = "Apply Again";
            applyButton.style.backgroundColor = "#2196F3";
        }
    };

    document.body.appendChild(applyButton);

    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear Painter";
    clearButton.style.position = "absolute";
    clearButton.style.top = "50px";
    clearButton.style.left = "10px";
    clearButton.style.zIndex = "1001";
    clearButton.style.padding = "10px 20px";
    clearButton.style.backgroundColor = "#f44336";
    clearButton.style.color = "white";
    clearButton.style.border = "none";
    clearButton.style.borderRadius = "4px";
    clearButton.style.cursor = "pointer";
    clearButton.style.fontSize = "14px";

    clearButton.onclick = () => {
        painter.clearCanvas();
    };

    document.body.appendChild(clearButton);

    const brushTypeSelect = document.createElement("select");
    brushTypeSelect.id = "brush-type-select";
    brushTypeSelect.style.position = "absolute";
    brushTypeSelect.style.top = "90px";
    brushTypeSelect.style.left = "10px";
    brushTypeSelect.style.zIndex = "1001";
    brushTypeSelect.style.padding = "8px";
    brushTypeSelect.style.borderRadius = "4px";
    brushTypeSelect.style.fontSize = "14px";

    const brushTypes = [
        { value: BrushType.RAISE, label: "Raise" },
        { value: BrushType.LOWER, label: "Lower" },
        { value: BrushType.SMOOTH, label: "Smooth" },
        { value: BrushType.FLATTEN, label: "Flatten" },
        { value: BrushType.NOISE, label: "Noise" }
    ];

    brushTypes.forEach(type => {
        const option = document.createElement("option");
        option.value = type.value;
        option.textContent = type.label;
        brushTypeSelect.appendChild(option);
    });

    brushTypeSelect.onchange = e => {
        const target = e.target as HTMLSelectElement;
        painter.updateBrushSettings({ type: target.value as BrushType });
    };

    document.body.appendChild(brushTypeSelect);

    const brushSizeLabel = document.createElement("label");
    brushSizeLabel.textContent = "Brush Size:";
    brushSizeLabel.style.position = "absolute";
    brushSizeLabel.style.top = "125px";
    brushSizeLabel.style.left = "10px";
    brushSizeLabel.style.zIndex = "1001";
    brushSizeLabel.style.color = "white";
    brushSizeLabel.style.fontSize = "14px";
    brushSizeLabel.style.fontWeight = "bold";
    brushSizeLabel.style.textShadow = "1px 1px 2px black";
    document.body.appendChild(brushSizeLabel);

    const brushSizeInput = document.createElement("input");
    brushSizeInput.type = "range";
    brushSizeInput.min = "5";
    brushSizeInput.max = "200";
    brushSizeInput.value = "50";
    brushSizeInput.style.position = "absolute";
    brushSizeInput.style.top = "145px";
    brushSizeInput.style.left = "10px";
    brushSizeInput.style.zIndex = "1001";
    brushSizeInput.style.width = "150px";

    brushSizeInput.oninput = e => {
        const target = e.target as HTMLInputElement;
        painter.updateBrushSettings({ size: parseInt(target.value) });
    };

    document.body.appendChild(brushSizeInput);
};

(async () => {
    try {
        const canvas = getMapCanvas("mapCanvas");
        const mapView = initializeMapView(canvas);
        const cesiumTerrain = await configureDEMTerrainSource(mapView);
        const painter = initializeHeightmapPainter();

        setupPainterControls(painter, cesiumTerrain);

        mapView.beginAnimation();

        console.log("\nHeightmap Painter Example");
        console.log("=========================");
        console.log("Features:");
        console.log("  • Interactive heightmap painting tool");
        console.log("  • Real-time application to 3D terrain");
        console.log("  • Multiple brush types (Raise, Lower, Smooth, Flatten, Noise)");
        console.log("  • Adjustable brush size and strength");
        console.log("  • Live preview on 2D map");
        console.log("\nControls:");
        console.log("  • Use the painter in the top-right corner");
        console.log("  • Click 'Apply to Terrain' to apply changes to 3D map");
        console.log("  • Select brush type and adjust size using controls");
        console.log("  • Click 'Clear Painter' to reset the heightmap");
        console.log("\n");
    } catch (error) {
        console.error("Error initializing heightmap painter example:");
        console.error(error);
    }
})();
