import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    ArcGISTileProvider,
    FrustumCullingModule
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            "Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML"
        );
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Set initial map position and view (Colorado, near Denver)
    const initialLocation = new GeoCoordinates(
        39.70916427453653,
        -105.21065191908919,
        2270.6937844809145
    );

    return new MapView({
        projection: ellipsoidProjection, // Use ellipsoid projection
        target: initialLocation, // Initial target position
        enablePolarDataSource: false, // Disable polar data source
        heading: -125.79565303507096, // Initial heading angle
        tilt: 56.60060867291795, // Initial tilt angle
        // zoomLevel: 18,                  // Initial zoom level
        canvas: canvas, // Specify render canvas
        theme: {
            // extends: "resources/tilezen_base_globe.json", // Base theme configuration
            atmosphere: {
                enabled: true // Enable atmospheric effect
            }
        }
    });
};

/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);

    // Expose control object to global scope for debugging
    (window as any).controls = controls;
};

/**
 * Configure elevation data source
 * @param mapView Map view instance
 * @returns Configured elevation data source
 */
const configureElevationSource = (mapView: MapView): CesiumWorldTerrainSource => {
    // Create Cesium world terrain data source using Cesium Ion service
    const cesiumIonDataSource = new CesiumWorldTerrainSource({
        // Note: In production environments, this token should be managed using environment variables or configuration files
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1 // Use default terrain dataset
    });

    // Set as map elevation data source
    mapView.setElevationSource(cesiumIonDataSource);

    // Add ArcGIS tile data provider to enhance map coverage
    cesiumIonDataSource.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );

    return cesiumIonDataSource;
};

/**
 * Initialize debug tools
 * @param mapView Map view instance
 * @param dataSource Elevation data source
 */
const initializeDebugTools = (mapView: MapView, dataSource: CesiumWorldTerrainSource): void => {
    // Create debug GUI interface
    const gui = new GUI();

    // Initialize frustum culling debug module
    new FrustumCullingModule(
        mapView,
        gui,
        dataSource.getElevationProvider(),
        dataSource.getElevationRangeSource()
    );
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();

    // 2. Initialize map view
    const mapView = initializeMapView(canvas);

    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);

    // 4. Configure elevation data source
    const elevationDataSource = configureElevationSource(mapView);

    // 5. Initialize debug tools
    initializeDebugTools(mapView, elevationDataSource);

    // Expose map view to global scope for debugging
    (window as any).mapView = mapView;

    // 6. Start map animation rendering
    mapView.beginAnimation();

    // ==================== Tile Resource Monitor ====================

    const initialTarget = new GeoCoordinates(
        39.70916427453653,
        -105.21065191908919,
        2270.6937844809145
    );

    const DEFAULT_VIEW = {
        target: initialTarget,
        heading: -125.79565303507096,
        tilt: 56.60060867291795
    };

    const REMOTE_VIEW = {
        target: new GeoCoordinates(35.0, -110.0, 2000),
        heading: 0,
        tilt: 50
    };
    function dumpStats(label: string): void {
        const renderer = (mapView as any).m_renderer;
        const info = renderer?.info;

        let lruTiles = 0;
        let lruBytes = 0;
        let lruUsed = 0;
        let lruLoaded = 0;
        let lruMinSize = 0;
        let lruMaxSize = 0;
        let resMgrCount = 0;
        let resMgrBytes = 0;

        const elevSource = (mapView as any).m_elevationSource;
        if (elevSource?.m_tileCache) {
            const cache = elevSource.m_tileCache;
            lruTiles = cache.itemList?.length ?? 0;
            lruBytes = cache.cachedBytes ?? 0;
            lruUsed = cache.usedSet?.size ?? 0;
            lruLoaded = cache.loadedSet?.size ?? 0;
            lruMinSize = cache.minSize ?? 0;
            lruMaxSize = cache.maxSize ?? 0;
            cache._tileMap?.forEach((tile: any) => {
                resMgrCount++;
                resMgrBytes += tile.resourceManager?.getBytesUsed?.() ?? 0;
            });
        }

        const memMapSize =
            info?.memoryMap instanceof Map
                ? info.memoryMap.size
                : Object.keys(info?.memoryMap || {}).length;

        console.log(
            `[${label}] LRU: tiles=${lruTiles}/${lruMaxSize} used=${lruUsed} loaded=${lruLoaded} ` +
                `bytes=${(lruBytes / 1048576).toFixed(1)}MB resMgrTiles=${resMgrCount} ` +
                `GPU: geometries=${info?.memory?.geometries ?? "?"} textures=${
                    info?.memory?.textures ?? "?"
                } ` +
                `memoryMap=${memMapSize}`
        );
    }

    function moveTo(view: typeof DEFAULT_VIEW): void {
        mapView.lookAt({
            target: view.target,
            heading: view.heading,
            tilt: view.tilt
        });
    }

    const monitorDiv = document.createElement("div");
    monitorDiv.style.cssText =
        "position:fixed;bottom:10px;right:10px;z-index:9999;display:flex;gap:8px;font-family:monospace;";
    document.body.appendChild(monitorDiv);

    function createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText =
            "padding:8px 16px;font-size:14px;cursor:pointer;border:2px solid #4ec9b0;border-radius:6px;background:#1e1e1e;color:#4ec9b0;font-weight:bold;";
        btn.addEventListener("click", onClick);
        monitorDiv.appendChild(btn);
        return btn;
    }

    let moved = false;
    createButton("Move Away", () => {
        console.log("%c=== Move to remote location ===", "color:#ff9800;font-weight:bold");
        dumpStats("before move");
        moveTo(REMOTE_VIEW);
        moved = true;
        setTimeout(() => {
            dumpStats("after move (5s)");
            setTimeout(() => dumpStats("after move (10s)"), 5000);
        }, 5000);
    });

    createButton("Return", () => {
        console.log("%c=== Return to default location ===", "color:#4caf50;font-weight:bold");
        dumpStats("before return");
        moveTo(DEFAULT_VIEW);
        setTimeout(() => {
            dumpStats("after return (5s)");
            setTimeout(() => dumpStats("after return (10s)"), 5000);
        }, 5000);
    });

    createButton("Snapshot", () => {
        dumpStats("manual");
    });

    // Auto snapshot every 5 seconds
    setInterval(() => dumpStats("auto"), 5000);

    console.log(
        "%c[Tile Monitor] Buttons added: Move Away / Return / Snapshot",
        "color:#4ec9b0;font-weight:bold"
    );
    console.log("%c[Tile Monitor] Auto snapshot every 5s", "color:#4ec9b0");

    console.log("Quantized mesh terrain example initialized successfully");
} catch (error) {
    console.error("Error initializing quantized mesh terrain example:", error);
}
