// 模板：示例入口。权威参照：getting-started-basic-config/index.ts
import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    sphereProjection
} from "@flywave/flywave.gl";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    return new MapView({
        projection: sphereProjection, // TODO: 按场景选 sphere / webMercator
        target: new GeoCoordinates(36.4393, 118.188), // TODO: 初始位置 (lat, lon)
        zoomLevel: 19, // TODO
        tilt: 45, // TODO
        heading: 0, // TODO
        canvas,
        theme: {
            // TODO: 主题。可内联（见 references/theming.md）或
            // extends: "resources/tilezen_base_globe.json"
            atmosphere: { enabled: true }
        }
    });
};

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);

    // TODO: 配置数据源
    // mapView.addDataSource(...);            // 普通层
    // mapView.setElevationSource(...);       // 地形层

    (window as unknown as { __mapView: typeof mapView }).__mapView = mapView;
} catch (error) {
    console.error("Example initialization failed:", error);
}
