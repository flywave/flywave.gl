/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Multi-source composition example (v2): stack four data source kinds on one
 * view and toggle them live.
 *
 * Layer stack (bottom to top) and why it works:
 * 1. **Terrain + imagery** — `DEMTerrainSource` replaces the flat ground and
 *    carries Esri imagery as its own tile textures (via {@link
 *    attachTerrainImagery}). IRON RULE: with an elevation source active,
 *    imagery must never be an independent `DataSource` — the flat tile layer
 *    is coplanar with the draped surface and depth-fights badly. DEM tiles
 *    only publish inside the local coverage (`resources/dem_terrain`, Zibo).
 * 2. **Features* — an in-memory `FeaturesDataSource` with labeled points.
 * 4. **3D Tiles** — `TileRenderDataSource` with a Gaussian splatting tileset.
 *    Its geographic extent lives in Philadelphia, far from the DEM coverage:
 *    each data source has its own coverage, so the GUI offers a fly-to for
 *    the layers that are not visible from the initial camera. Rendering order
 *    within a tile follows each source's geometry; `dataSource.dataSourceOrder`
 *    (a `DataSource` field) can override it globally when needed.
 *
 * Visibility toggles use the `DataSource.enabled` field — the engine has no
 * per-source `visible` flag; `enabled = false` removes the source's tiles
 * from the scene on the next `mapView.update()` (on-demand rendering).
 */

import { type GUI } from "dat.gui";

import {
    type MapView,
    type Theme,
    CopyrightElementHandler,
    FeaturesDataSource,
    GeoCoordinates,
    MapViewPointFeature,
    ModularMapViewMonitor,
    TileRenderDataSource
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Scene center: inside the local DEM coverage (Zibo, Shandong). */
const CENTER = new GeoCoordinates(36.47, 118.17);

/** The camera height used when framing the terrain area. */
const TERRAIN_ZOOM = 13;

/**
 * Locally hosted Gaussian splatting tileset, resolved through the MapView
 * uriResolver relative to the deployed `resources/` folder.
 */
const SPLAT_TILESET_URL = "3dtile/gaussianSplatting/tileset.json";

/** Theme: tilezen base plus the style set used by the features layer. */
function createMultiSourceTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        definitions: {
            defaultTextStyle: {
                color: "#000000",
                backgroundOpacity: 0,
                fontSize: 28,
                fontName: "Noto Sans",
                fontStyle: "Bold"
            }
        },
        styles: {
            "multi-features": [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "labeled-icon",
                    attr: {
                        text: ["get", "name"],
                        color: "#000000",
                        backgroundOpacity: 0,
                        imageTexture: "circle-stroked-11",
                        iconScale: 1.0,
                        size: 24,
                        vAlignment: "Center",
                        hAlignment: "Left"
                    }
                }
            ]
        }
    };
}

/** Seeded POI points around the scene center for the features layer. */
function makePoiFeatures(count: number): MapViewPointFeature[] {
    const features: MapViewPointFeature[] = [];
    for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random spread keeps every reload identical.
        const lng = CENTER.lng + Math.sin(i * 12.9898) * 0.01;
        const lat = CENTER.lat + Math.cos(i * 78.233) * 0.006;
        features.push(new MapViewPointFeature([lng, lat], { name: `POI ${i + 1}/${count}` }));
    }
    return features;
}

/** The toggled layers, kept in one place so the GUI can reach them. */
interface ILayerStack {
    terrain: ReturnType<typeof demoTerrain>;
    features: FeaturesDataSource;
    tiles3d: TileRenderDataSource;
}

/** Wire the GUI: per-layer visibility, cache control and fly-to buttons. */
function setupGui(mapView: MapView, layers: ILayerStack): GUI {
    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);

    const layerFolder = gui.addFolder("Layers");
    const toggles = {
        terrain: true,
        features: true,
        "3d tiles": true
    };
    // `DataSource.enabled` is the real visibility knob (no `visible` field);
    // the change only reaches the screen after the on-demand `update()`.
    const bindToggle = (name: keyof typeof toggles, source: { enabled: boolean }): void => {
        layerFolder.add(toggles, name).onChange(value => {
            source.enabled = value;
            mapView.update();
        });
    };
    bindToggle("terrain", layers.terrain);
    bindToggle("features", layers.features);
    bindToggle("3d tiles", layers.tiles3d);

    const actionsFolder = gui.addFolder("Actions");
    actionsFolder
        .add(
            {
                // Drop every cached tile; sources refetch on the next frames.
                clearCache: () => {
                    mapView.clearTileCache();
                    mapView.update();
                }
            },
            "clearCache"
        )
        .name("Clear tile cache");

    actionsFolder
        .add(
            {
                flyTerrain: () => {
                    mapView.lookAt({
                        target: new GeoCoordinates(CENTER.lat, CENTER.lng),
                        zoomLevel: TERRAIN_ZOOM
                    });
                }
            },
            "flyTerrain"
        )
        .name("Fly to terrain area");
    actionsFolder
        .add(
            {
                flySplat: () => {
                    // The tileset root is parsed asynchronously; once known,
                    // `lookAt({ bounds })` frames its geographic extent.
                    void layers.tiles3d.getGeoExtent().then(extent => {
                        if (extent !== undefined) {
                            mapView.lookAt({ bounds: extent });
                        }
                    });
                }
            },
            "flySplat"
        )
        .name("Fly to 3D Tiles");
    layerFolder.open();
    actionsFolder.open();
    return gui;
}

/** Example entry: four stacked data sources plus toggles and inspector. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: createMultiSourceTheme(),
        lookAt: { target: { lat: CENTER.lat, lng: CENTER.lng }, zoomLevel: TERRAIN_ZOOM }
    });
    logExampleInfo("data-multi-source", mapView);
    CopyrightElementHandler.install("copyrightNotice", mapView);

    // 1. Terrain elevation first, so later layers drape onto the DEM surface.
    const terrain = demoTerrain();
    await mapView.setElevationSource(terrain);

    // 2. Imagery is draped INTO the terrain tiles — see the iron rule in the
    // header: an independent imagery layer here would depth-fight.
    attachTerrainImagery(terrain);

    // 3. In-memory features: styleSetName binds to the theme style set above.
    const features = new FeaturesDataSource({
        styleSetName: "multi-features",
        maxDataLevel: 20
    });
    await mapView.addDataSource(features);
    features.add(...makePoiFeatures(24));

    // 4. The 3D Tiles source (its extent is in Philadelphia, see header).
    const tiles3d = new TileRenderDataSource({ url: SPLAT_TILESET_URL });
    await mapView.addDataSource(tiles3d);
    mapView.update();

    const gui = setupGui(mapView, { terrain, features, tiles3d });

    // The aggregate package exports `ModularMapViewMonitor` (verified via
    // flywave.gl/src/index.ts). Passing the example GUI hosts the inspector
    // folders in the same panel; the monitor closes the panel on startup.
    new ModularMapViewMonitor(mapView, gui);
}

void main();
