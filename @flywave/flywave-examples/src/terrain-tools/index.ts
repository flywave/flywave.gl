/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    ArcGISTileProvider,
    TerrainTools,
    TerrainControlPointUI,
    ToolMode
} from "@flywave/flywave.gl";

const CONFIG = {
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17
};

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML`
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

const configureDEMTerrainSource = (mapView: MapView): DEMTerrainSource => {
    const demTerrain = new DEMTerrainSource({
        source: CONFIG.DEM_SOURCE_PATH
    });

    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    mapView.setElevationSource(demTerrain);

    return demTerrain;
};

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    const demTerrain = configureDEMTerrainSource(mapView);

    const controlPointUI = new TerrainControlPointUI();

    const terrainTools = new TerrainTools({
        mapView: mapView,
        demTerrainSource: demTerrain,
        showUI: true,
        defaultBrush: {
            type: "raise",
            radius: 80,
            hardness: 0.5,
            heightDelta: 10
        },
        defaultMode: "brush" as ToolMode,
        onOperationAdded: (id, operation) => {
            console.log("✅ 操作添加:", id);
            console.log("   类型:", operation.settings.type);
            console.log("   半径:", operation.settings.radius + "m");
            console.log(
                "   位置:",
                `lat: ${operation.position.latitude.toFixed(6)}, ` +
                    `lon: ${operation.position.longitude.toFixed(6)}`
            );
        },
        onOperationRemoved: id => {
            console.log("❌ 操作移除:", id);
        },
        onControlPointAdded: point => {
            console.log("📍 控制点添加:", point.id);
        },
        onControlPointRemoved: id => {
            console.log("🗑️ 控制点移除:", id);
        },
        onControlPointSelected: point => {
            if (point) {
                console.log("✅ 控制点选中:", point.id);
                controlPointUI.show(point);
            } else {
                console.log("❌ 控制点取消选中");
                controlPointUI.hide();
            }
        }
    });

    terrainTools.enable();

    setTimeout(() => {
        console.log("=".repeat(60));
        console.log("🚀 初始化完成！");
        console.log("=".repeat(60));
        console.log(
            "✅ 地形工具状态:",
            terrainTools.getMode() === "brush" ? "笔刷模式" : "控制点模式"
        );
        console.log("💡 使用说明:");
        console.log("   1. 工具默认已启用，可以直接点击地图操作");
        console.log("   2. 在笔刷模式下，点击地图会直接修改地形");
        console.log("   3. 按 'C' 键切换到控制点模式");
        console.log("   4. 在控制点模式下，点击地图添加控制点");
        console.log("   5. 点击控制点后会在右侧显示配置面板");
        console.log("=".repeat(60));
    }, 1000);

    window.addEventListener("controlPointDelete", () => {
        terrainTools.removeSelectedControlPoint();
    });

    window.addEventListener("keydown", event => {
        if (event.key === "Delete" || event.key === "Backspace") {
            terrainTools.removeSelectedControlPoint();
            controlPointUI.hide();
        } else if (event.key === "c" || event.key === "C") {
            if (terrainTools.getMode() === "brush") {
                terrainTools.setMode("control" as ToolMode);
                console.log("🔧 切换到控制点模式");
            } else {
                terrainTools.setMode("brush" as ToolMode);
                console.log("🖌️ 切换到笔刷模式");
            }
        } else if (event.key === "a" || event.key === "A") {
            terrainTools.applyControlPointsToTerrain();
            console.log("✅ 应用所有控制点到地形");
        }
    });

    console.log("=".repeat(60));
    console.log("Flywave 地形工具已初始化");
    console.log("=".repeat(60));
    console.log("🎨 笔刷预览特性:");
    console.log("   - 鼠标移动时显示圆形预览");
    console.log("   - 圆环大小随笔刷半径变化");
    console.log("   - 不同笔刷类型显示不同颜色");
    console.log("   - 中心点标记精确位置");
    console.log("   - 半透明材质不遮挡视线");
    console.log("");
    console.log("📍 控制点特性 (使用 dat.gui):");
    console.log("   - 点击地图添加地形控制点");
    console.log("   - 点击控制点可选中并配置参数");
    console.log("   - 右侧面板显示参数配置界面");
    console.log("   - 支持实时调整控制点参数");
    console.log("   - 可单独删除每个控制点");
    console.log("   - 可批量应用控制点到地形");
    console.log("");
    console.log("🖌️ 6种笔刷类型:");
    console.log("   1. 抬升 (RAISE)   - 绿色 #00ff00");
    console.log("   2. 降低 (LOWER)   - 红色 #ff0000");
    console.log("   3. 平滑 (SMOOTH)  - 蓝色 #0088ff");
    console.log("   4. 平整 (FLATTEN) - 黄色 #ffff00");
    console.log("   5. 噪声 (NOISE)   - 紫色 #8800ff");
    console.log("   6. 侵蚀 (ERODE)   - 橙色 #ff8800");
    console.log("");
    console.log("📋 操作指南:");
    console.log("   - 点击右侧面板顶部的【启用】按钮进入绘制模式");
    console.log("   - 点击【禁用】按钮退出绘制模式，恢复地图控制");
    console.log("   - 按【C】键在笔刷模式和控制点模式间切换");
    console.log("   - 在控制点模式下，点击地图添加控制点");
    console.log("   - 点击控制点可选中并在右侧配置参数");
    console.log("   - 按【Delete】键删除选中的控制点");
    console.log("   - 按【A】键批量应用所有控制点到地形");
    console.log("   - 使用 dat.gui 面板实时调整控制点参数");
    console.log("   - 使用主工具面板调整笔刷参数");
    console.log("   - 使用导出按钮保存数据");
    console.log("   - 使用清除按钮重置所有修改");
    console.log("=".repeat(60));
} catch (error) {
    console.error("初始化失败:", error);
}
