/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Shadow performance stress test.
 *
 * The page is a measurement bench, not a pretty scene: it wires the heaviest
 * realistic setup a globe scene can carry and then lets you toggle the single
 * variable that matters — shadow casting — while the HUD reports the frame
 * rate, frame time percentiles, draw calls and triangle counts.
 *
 * The load, from bottom to top:
 * 1. GLOBAL terrain: AWS `elevation-tiles-prod` terrarium DEM (zoom 0..15) for
 *    the whole planet, draped with Esri World Imagery at `imageryLevelOffset: 1`
 *    (2x2 child mosaic per terrain tile, 4x texels at the same mesh count).
 * 2. A procedural city: an `InstancedMesh` of up to 4096 boxes (one draw call
 *    per pass) that all cast and receive shadows.
 * 3. Real glTF models: up to 800 clones of `f4/models/LibOut_CherryTree.glb`
 *    (separate draw calls, the worst case for per-object overhead) that also
 *    cast and receive shadows.
 *
 * The engine's shadow path is the atmosphere sun light (CascadedShadowMapsNode,
 * 4 x 2048^2 cascades). The switch is `Theme.enableShadows` — MapViewThemeManager
 * re-syncs `mapView.shadowsEnabled` from it once the theme resolves, so a
 * `MapViewOptions.enableShadows` value alone is transient. Nothing in this
 * example touches the cascade setup, so the numbers reflect the shipping
 * defaults.
 *
 * Measurement notes:
 * - `mapView.shadowsEnabled = x` clears the tile cache (tile objects bake their
 *   cast/receive flags), so each A/B leg waits for the tile pipeline to settle
 *   before sampling; the settling wait is visible in the HUD.
 * - Frames are sampled from `MapViewEventNames.Render` (one event per rendered
 *   frame) while `beginAnimation()` keeps the on-demand loop spinning.
 * - The A/B benchmark runs 6 s shadows ON, then 6 s shadows OFF, at the same
 *   camera pose and model load, and prints/renders the comparison.
 *
 * URL flags:
 *   ?shadows=0              — start with shadows disabled
 *   ?buildings=1800         — initial instance count (0..4096)
 *   ?trees=200              — initial glTF clone count (0..800)
 *   ?cascades=2             — sun-shadow cascades (2..4, constructor-time)
 *   ?mapsize=1024           — shadow map size per cascade (1024/2048)
 *   ?filter=pcf             — shadow filter ("pcf" or the default "pcf-soft")
 *   ?shadowdist=3000        — max shadow distance in metres (0 = automatic)
 *   ?dist=1200              — pin the camera distance for reproducible A/B runs
 *   ?orbit=1                — orbit the camera around the target while measuring
 *   ?benchmark=1            — auto-run the A/B benchmark after the load settles
 *   ?renderer=webgl         — force the WebGL2 backend (handled by the factory)
 */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    LoggerManager
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";
import { ShadowDiagnostics } from "./shadow-diagnostics";
import { ShadowLab } from "./shadow-lab";
import {
    DEFAULT_BUILDINGS,
    DEFAULT_TREES,
    MAX_BUILDINGS,
    MAX_TREES,
    SITE,
    StressField
} from "./shadow-stress-field";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/fx-shadow-stress");

/** Ground-level camera pose used for the measurement. */
const VIEW = { zoomLevel: 17.3, tilt: 55, heading: 24 };
/**
 * Unix-ms timestamp at local solar noon for the given longitude. The
 * atmosphere derives the sun direction from the timestamp; anchoring to solar
 * noon keeps the scene in daylight regardless of the machine clock/timezone.
 */
function solarNoonTimestamp(longitudeDeg: number): number {
    const now = new Date();
    const utcHour = 12 - longitudeDeg / 15;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dayStart + ((utcHour + 24) % 24) * 3600 * 1000;
}

/** Timestamp of the given solar hour (local solar time) at the site. */
function solarHourTimestamp(hour: number): number {
    return solarNoonTimestamp(SITE.lng) + (hour - 12) * 3600 * 1000;
}

/**
 * The global DEM: AWS Open Data "Terrain Tiles" terrarium service. No token,
 * CORS enabled, covers the whole planet at zoom 0..15. The encoding MUST be
 * declared explicitly — the decoder defaults to mapbox and would misread
 * terrarium heights by orders of magnitude.
 */
function createGlobalTerrain(): DEMTerrainSource {
    return new DEMTerrainSource({
        source: {
            type: "raster-dem",
            minzoom: 0,
            maxzoom: 15,
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            bounds: [-180, -85.0511, 180, 85.0511],
            scheme: "xyz",
            tileSize: 256,
            attribution: "Terrain: AWS Open Data Terrain Tiles / Mapzen"
        },
        encoding: "terrarium"
    });
}

/** Shadow budget values carried in the URL (constructor-time options). */
interface IShadowConfig {
    cascades: number;
    mapSize: number;
    filter: "pcf" | "pcf-soft";
    maxDistance: number;
}

/** Re-open the page with the given constructor-time shadow budget. */
function reloadWithShadowConfig(config: IShadowConfig): void {
    const params = new URLSearchParams(window.location.search);
    params.set("cascades", String(config.cascades));
    params.set("mapsize", String(config.mapSize));
    params.set("filter", config.filter);
    params.set("shadowdist", String(config.maxDistance));
    window.location.search = params.toString();
}

/** Wire the dat.GUI panel: load size, shadows switch, sun hour, benchmark button. */
function setupGui(
    mapView: MapView,
    lab: ShadowLab,
    initialShadow: IShadowConfig,
    onRunDiagnostics: () => void
): void {
    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const loadFolder = gui.addFolder("Stress load");
    const buildingsController = loadFolder
        .add(lab.state, "buildings", [0, 500, 1000, 1800, 2500, 3200, MAX_BUILDINGS])
        .name("buildings")
        .onFinishChange(value => {
            lab.rebuild(Number(value), lab.state.trees);
        });
    const treesController = loadFolder
        .add(lab.state, "trees", [0, 100, 200, 400, 600, MAX_TREES])
        .name("glTF clones")
        .onFinishChange(value => {
            lab.rebuild(lab.state.buildings, Number(value));
        });
    loadFolder.open();
    lab.registerCountRefresh(() => {
        buildingsController.updateDisplay();
        treesController.updateDisplay();
    });

    const shadowFolder = gui.addFolder("Shadows");
    shadowFolder
        .add(lab.state, "shadows")
        .name("cast shadows")
        .onChange(value => {
            lab.setShadows(Boolean(value));
        });
    shadowFolder
        .add(
            {
                benchmark: (): void => {
                    void lab.runBenchmark();
                }
            },
            "benchmark"
        )
        .name("run A/B benchmark (6s each)");
    shadowFolder.add({ diagnostics: onRunDiagnostics }, "diagnostics").name("run diagnostics");
    shadowFolder.open();

    // Shadow budget. Cascades and map size are baked into the CSM node on the
    // first shadow pass (see MapViewOptions.shadowCascades/shadowMapSize), so
    // changing them re-opens the page with the new URL; the filter and the max
    // distance apply live.
    const shadowConfig: IShadowConfig = { ...initialShadow };
    const applyLiveShadowOptions = (): void => {
        mapView.patchTheme({
            atmosphere: {
                sunShadowFilter: shadowConfig.filter,
                sunShadowMaxDistance: shadowConfig.maxDistance
            }
        });
        mapView.update();
    };
    const configFolder = gui.addFolder("Shadow config");
    configFolder
        .add(shadowConfig, "cascades", { "2": 2, "3": 3, "4": 4 })
        .name("cascades (reload)")
        .onFinishChange(() => {
            reloadWithShadowConfig(shadowConfig);
        });
    configFolder
        .add(shadowConfig, "mapSize", { "1024": 1024, "2048": 2048 })
        .name("map size (reload)")
        .onFinishChange(() => {
            reloadWithShadowConfig(shadowConfig);
        });
    configFolder
        .add(shadowConfig, "filter", ["pcf-soft", "pcf"])
        .name("filter")
        .onFinishChange(applyLiveShadowOptions);
    configFolder
        .add(shadowConfig, "maxDistance", {
            auto: 0,
            "3000 m": 3000,
            "5000 m": 5000,
            "10000 m": 10000,
            "20000 m": 20000
        })
        .name("max distance")
        .onFinishChange(applyLiveShadowOptions);
    configFolder.open();

    const sunFolder = gui.addFolder("Sun");
    sunFolder
        .add({ hour: 15 }, "hour", [9, 11, 13, 15, 17])
        .name("solar hour")
        .onChange(value => {
            mapView.patchTheme({
                atmosphere: {
                    sunTime: solarHourTimestamp(Number(value)),
                    sunTimeTransitionDuration: 0
                }
            });
            mapView.update();
        });

    // A moving camera exercises culling, tile updates and per-frame CSM
    // fitting — a frozen scene under-reports the shadow cost.
    const cameraFolder = gui.addFolder("Camera");
    const orbitState = { orbit: lab.orbitEnabled, speed: lab.orbitSpeedDeg };
    cameraFolder
        .add(orbitState, "orbit")
        .name("orbit camera")
        .onChange(value => {
            lab.setOrbit(Boolean(value));
        });
    cameraFolder
        .add(orbitState, "speed", 2, 40, 1)
        .name("orbit speed °/s")
        .onChange(value => {
            lab.setOrbitSpeed(Number(value));
        });
}

/** One-line footnote about the renderer and the A/B toggle behavior. */
function addFootnotes(): void {
    const note = document.createElement("div");
    note.textContent =
        "Global DEM (AWS terrarium 0–15) + Esri World Imagery draped at imageryLevelOffset 1 — " +
        "toggling shadows clears the tile cache (tile objects bake cast/receive flags). " +
        "Add ?renderer=webgl to force the WebGL2 backend.";
    Object.assign(note.style, {
        position: "absolute",
        right: "12px",
        bottom: "12px",
        maxWidth: "46vw",
        padding: "6px 10px",
        color: "#e8eaed",
        font: "12px/1.4 sans-serif"
    } as CSSStyleDeclaration);
    applyPanelStyle(note);
    document.body.appendChild(note);
}
/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const urlParams = new URLSearchParams(window.location.search);
    const initialBuildings = Number(urlParams.get("buildings") ?? DEFAULT_BUILDINGS);
    const initialTrees = Number(urlParams.get("trees") ?? DEFAULT_TREES);
    const enableShadows = urlParams.get("shadows") !== "0";

    // Shadow budget: cascades/map size must be constructor-time options, filter
    // and max distance can also be theme-patched live by the GUI.
    const initialShadow: IShadowConfig = {
        cascades: Math.min(4, Math.max(2, Number(urlParams.get("cascades") ?? 4))),
        mapSize: Number(urlParams.get("mapsize") ?? 2048) === 1024 ? 1024 : 2048,
        filter: urlParams.get("filter") === "pcf" ? "pcf" : "pcf-soft",
        maxDistance: Math.max(0, Number(urlParams.get("shadowdist") ?? 0))
    };

    const { mapView } = await createExampleMap(canvas, {
        enableShadows,
        shadowCascades: initialShadow.cascades,
        shadowMapSize: initialShadow.mapSize,
        shadowFilter: initialShadow.filter,
        shadowMaxDistance: initialShadow.maxDistance,
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            // Theme.enableShadows is the authoritative switch: MapViewThemeManager
            // re-syncs `mapView.shadowsEnabled` from it once the theme resolves.
            enableShadows,
            atmosphere: {
                enabled: true,
                // Mid-afternoon solar time: long enough shadows to be obvious,
                // high enough to stay out of the horizon-scattering regime.
                sunTime: solarHourTimestamp(15),
                sunTimeTransitionDuration: 0
            }
        },
        controlsUi: "compact",
        lookAt: {
            target: { lat: SITE.lat, lng: SITE.lng },
            zoomLevel: VIEW.zoomLevel,
            tilt: VIEW.tilt,
            heading: VIEW.heading
        }
    });
    logExampleInfo("fx-shadow-stress", mapView);

    // Global terrain + draped satellite imagery (one imagery level finer than
    // the mesh). Imagery must go through the terrain source: a standalone
    // raster layer would be coplanar with the draped surface and depth-fight.
    const terrain = createGlobalTerrain();
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }), {
        imageryLevelOffset: 1
    });
    await mapView.setElevationSource(terrain);

    // Re-apply the pose: the constructor's lookAt ran before the elevation
    // source existed, which changes the terrain-relative camera distance.
    // `?dist=<m>` pins an exact camera distance (terrain-independent), which is
    // what makes FPS/draw-call numbers comparable across page reloads.
    const fixedDistance = Number(urlParams.get("dist"));
    if (Number.isFinite(fixedDistance) && fixedDistance > 0) {
        mapView.lookAt({
            target: new GeoCoordinates(SITE.lat, SITE.lng),
            distance: fixedDistance,
            tilt: VIEW.tilt,
            heading: VIEW.heading
        });
    } else {
        mapView.lookAt({
            target: new GeoCoordinates(SITE.lat, SITE.lng),
            zoomLevel: VIEW.zoomLevel,
            tilt: VIEW.tilt,
            heading: VIEW.heading
        });
    }
    mapView.update();

    // Create the HUD, controls and benchmark panel BEFORE the terrain wait so
    // the frame rate is observable during the load as well.
    const field = new StressField(mapView);
    const lab = new ShadowLab(mapView, field);
    lab.state.buildings = Number.isFinite(initialBuildings)
        ? Math.min(initialBuildings, MAX_BUILDINGS)
        : DEFAULT_BUILDINGS;
    lab.state.trees = Number.isFinite(initialTrees)
        ? Math.min(initialTrees, MAX_TREES)
        : DEFAULT_TREES;
    lab.state.shadows = mapView.shadowsEnabled;
    if (urlParams.get("orbit") === "1") {
        lab.setOrbit(true);
    }
    const diagnostics = new ShadowDiagnostics(mapView, field, lab);
    setupGui(mapView, lab, initialShadow, () => {
        void diagnostics.run();
    });
    addFootnotes();
    lab.start();

    await field.prepare();
    lab.rebuild(lab.state.buildings, lab.state.trees);

    // Console/config handle for automation runs (benchmarks, screenshots).
    (window as unknown as { __shadowStress: unknown }).__shadowStress = {
        mapView,
        lab,
        field,
        rebuild: (buildings: number, trees: number) => {
            lab.rebuild(buildings, trees);
        },
        setShadows: (enabled: boolean) => {
            lab.setShadows(enabled);
        },
        runBenchmark: () => lab.runBenchmark(),
        lastRuns: () => lab.lastRuns,
        setOrbit: (enabled: boolean) => {
            lab.setOrbit(enabled);
        },
        orbitEnabled: () => lab.orbitEnabled,
        setShadowConfig: (
            cascades: number,
            mapSize: number,
            filter: "pcf" | "pcf-soft",
            maxDistance: number
        ) => {
            // Cascades/map size are baked into the CSM node at first shadow pass:
            // re-open the page with the new budget. Filter/distance apply live.
            if (cascades !== mapView.shadowCascades || mapSize !== mapView.shadowMapSize) {
                reloadWithShadowConfig({ cascades, mapSize, filter, maxDistance });
                return;
            }
            mapView.patchTheme({
                atmosphere: {
                    sunShadowFilter: filter,
                    sunShadowMaxDistance: maxDistance
                }
            });
            mapView.update();
        },
        diagnostics: () => diagnostics.run(),
        lastDiagnostics: () => diagnostics.lastReport
    };

    if (urlParams.get("benchmark") === "1") {
        void lab.runBenchmark();
    }
}

main().catch(error => {
    logger.error("example failed:", error);
});
