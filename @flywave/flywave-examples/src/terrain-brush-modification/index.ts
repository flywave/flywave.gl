/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    BrushType,
    ArcGISTileProvider
} from "@flywave/flywave.gl";

const CONFIG = {
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17
};

const getMapCanvas = id => {
    const canvas = document.getElementById(id);
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`
        );
    }
    return canvas;
};

const initializeMapView = canvas => {
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
    canvas.parentElement.appendChild(ui.domElement);

    return map;
};

const createTestBrushOperations = () => {
    const centerLat = 36.398;
    const centerLon = 118.099;

    console.log("Creating test brush operations...");

    return [
        {
            position: new GeoCoordinates(centerLat - 0.0015, centerLon - 0.001),
            settings: {
                type: BrushType.RAISE,
                size: 120,
                strength: 0.4,
                hardness: 0.6
            }
        },
        {
            position: new GeoCoordinates(centerLat + 0.0015, centerLon - 0.001),
            settings: {
                type: BrushType.LOWER,
                size: 120,
                strength: 0.4,
                hardness: 0.6
            }
        },
        {
            position: new GeoCoordinates(centerLat - 0.0015, centerLon + 0.001),
            settings: {
                type: BrushType.SMOOTH,
                size: 100,
                strength: 0.5,
                hardness: 0.7
            }
        },
        {
            position: new GeoCoordinates(centerLat + 0.0015, centerLon + 0.001),
            settings: {
                type: BrushType.FLATTEN,
                size: 90,
                strength: 0.6,
                hardness: 0.8,
                flattenTargetHeight: 120
            }
        },
        {
            position: new GeoCoordinates(centerLat, centerLon),
            settings: {
                type: BrushType.NOISE,
                size: 150,
                strength: 0.3,
                hardness: 0.5,
                noiseScale: 8.0,
                noisePersistence: 0.6
            }
        },
        {
            position: new GeoCoordinates(centerLat + 0.003, centerLon),
            settings: {
                type: BrushType.ERODE,
                size: 130,
                strength: 0.4,
                hardness: 0.7
            }
        }
    ];
};

const addBrushModifications = demTerrain => {
    const brushOperations = createTestBrushOperations();

    console.log("=".repeat(70));
    console.log("ADDING BRUSH MODIFICATIONS");
    console.log("=".repeat(70));
    console.log(`Total operations: ${brushOperations.length}`);
    console.log("");

    brushOperations.forEach((op, index) => {
        console.log(`Operation ${index + 1}:`);
        console.log(`  Type: ${op.settings.type}`);
        console.log(
            `  Position: ${op.position.latitude.toFixed(6)}, ${op.position.longitude.toFixed(6)}`
        );
        console.log(`  Size: ${op.settings.size}m`);
        console.log(`  Strength: ${op.settings.strength}`);
        console.log(`  Hardness: ${op.settings.hardness}`);
        if (op.settings.flattenTargetHeight !== undefined) {
            console.log(`  Target Height: ${op.settings.flattenTargetHeight}m`);
        }
        if (op.settings.noiseScale !== undefined) {
            console.log(`  Noise Scale: ${op.settings.noiseScale}`);
        }
        console.log("");
    });

    const modification = demTerrain
        .getGroundModificationManager()
        .addModification("add", brushOperations);

    console.log("=".repeat(70));
    console.log("MODIFICATION ADDED SUCCESSFULLY");
    console.log("=".repeat(70));
    console.log(`Modification ID: ${modification.id}`);
    console.log(`Bounding Box:`);
    console.log(
        `  South West: ${modification.boundingBox.southWest.latitude.toFixed(
            6
        )}, ${modification.boundingBox.southWest.longitude.toFixed(6)}`
    );
    console.log(
        `  North East: ${modification.boundingBox.northEast.latitude.toFixed(
            6
        )}, ${modification.boundingBox.northEast.longitude.toFixed(6)}`
    );
    console.log("");
    console.log("Expected Effects:");
    console.log("  ✓ GPU-accelerated rendering");
    console.log("  ✓ Parallel brush processing");
    console.log("  ✓ Real-time terrain deformation");
    console.log("=".repeat(70));
    console.log("");

    return modification;
};

const configureDEMTerrainSource = mapView => {
    const demTerrain = new DEMTerrainSource({
        source: CONFIG.DEM_SOURCE_PATH
    });

    const modification = addBrushModifications(demTerrain);

    mapView.setElevationSource(demTerrain);

    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    return { demTerrain, modification };
};

try {
    console.log("");
    console.log("█".repeat(70));
    console.log("█" + " ".repeat(68) + "█");
    console.log("█  TERRAIN BRUSH MODIFICATION TEST - GPU ACCELERATED" + " ".repeat(21) + "█");
    console.log("█" + " ".repeat(68) + "█");
    console.log("█".repeat(70));
    console.log("");

    const canvas = getMapCanvas("mapCanvas");
    const mapView = initializeMapView(canvas);
    const { demTerrain, modification } = configureDEMTerrainSource(mapView);

    console.log("=".repeat(70));
    console.log("TEST CONFIGURATION");
    console.log("=".repeat(70));
    console.log(`Brush Types Tested:`);
    console.log(`  1. RAISE    - Elevates terrain at brush position`);
    console.log(`  2. LOWER    - Lowers terrain at brush position`);
    console.log(`  3. SMOOTH   - Smooths terrain variation in brush area`);
    console.log(`  4. FLATTEN  - Flattens terrain to specified height`);
    console.log(`  5. NOISE    - Adds random noise variation`);
    console.log(`  6. ERODE    - Erodes terrain edges`);
    console.log("");
    console.log("Brush Parameters:");
    console.log(`  Size:    Brush radius in meters`);
    console.log(`  Strength: Intensity of modification (0-1)`);
    console.log(`  Hardness: Edge softness (0-1, 1 = sharp)`);
    console.log("");
    console.log("Performance Characteristics:");
    console.log(`  ✓ WebGL GPU acceleration`);
    console.log(`  ✓ Fragment shader parallel processing`);
    console.log(`  ✓ Single-pass rendering`);
    console.log(`  ✓ No CPU bottleneck`);
    console.log("");
    console.log("Verification Checklist:");
    console.log(`  [ ] Visible terrain deformation`);
    console.log(`  [ ] Correct brush type effects`);
    console.log(`  [ ] Smooth brush boundaries`);
    console.log(`  [ ] No performance degradation`);
    console.log(`  [ ] Proper bounding box calculation`);
    console.log("=".repeat(70));
    console.log("");

    console.log("To verify GPU acceleration:");
    console.log("1. Open browser DevTools (F12)");
    console.log("2. Check Network tab for WebGL context");
    console.log("3. Monitor console for modification logs");
    console.log("4. Observe smooth terrain transitions");
    console.log("5. Test performance with many brushes");
    console.log("");
} catch (error) {
    console.error("".repeat(70));
    console.error("ERROR INITIALIZING TEST:");
    console.error("".repeat(70));
    console.error(error);
    console.error("".repeat(70));
}
