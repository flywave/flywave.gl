import {
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    mercatorProjection
} from "@flywave/flywave.gl";
import { NodeBuilder } from "three/webgpu";

import { shouldForceWebGL } from "../common-webgl-debug";

// TODO(debug): temporary shader build/compile counters, remove after debug.
// graphBuilds = NodeBuilder.build() calls (node graph recompute, one per
// NodeBuilderState cache miss); compiles = backend.createProgram calls (WGSL
// stage compiled to a GPU module); pipelines = backend.createRenderPipeline.
const fwStats: any = ((window as any).__fwStats = {
    graphBuilds: 0,
    compiles: 0,
    pipelines: 0,
    byMaterial: {}
});
{
    const proto: any = (NodeBuilder as any).prototype;
    const origBuild = proto.build;
    proto.build = function (...args: unknown[]) {
        fwStats.graphBuilds++;
        const key =
            (this.material && this.material.constructor && this.material.constructor.name) ||
            "unknown";
        fwStats.byMaterial[key] = (fwStats.byMaterial[key] || 0) + 1;
        return origBuild.apply(this, args);
    };
}

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
    // Set initial map position and viewpoint (eastern China region)
    const initialLocation = new GeoCoordinates(36, 118);

    return new MapView({
        forceWebGL: shouldForceWebGL(),
        projection: mercatorProjection, // Use Mercator projection
        target: initialLocation, // Initial target position
        zoomLevel: 6, // Initial zoom level
        tilt: 45, // Initial tilt angle
        heading: 1.5413763202653008, // Initial heading angle
        canvas, // Specify render canvas
        theme: {
            extends: "resources/tilezen_base.json" // Base theme configuration
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
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json" // DEM terrain data source path
    });

    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
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

    // 4. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);

    // TODO(debug): temporary handle for runtime inspection, remove after debug
    (window as any).__mapView = mapView;

    // TODO(debug): count GPU-side compiles/pipeline creations, remove after debug
    const backend: any = (mapView as any).renderer.backend;
    const origCreateProgram = backend.createProgram.bind(backend);
    backend.createProgram = (...args: unknown[]) => {
        fwStats.compiles++;
        return origCreateProgram(...args);
    };
    const origCreateRenderPipeline = backend.createRenderPipeline.bind(backend);
    backend.createRenderPipeline = (...args: unknown[]) => {
        fwStats.pipelines++;
        return origCreateRenderPipeline(...args);
    };

    console.log("Planar map getting started example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing planar map getting started example:", error);
}
