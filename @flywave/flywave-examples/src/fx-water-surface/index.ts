/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Water surface with a `waterReflection` switch.
 *
 * ## What came from the reference artifact
 *
 * This example rebuilds the *interface contract* of f4map's `waterReflection`
 * display option, recovered from the shipped front-end bundle
 * (`public.js`, sha256 `fc260e2d…`, analysed as REA JavaScript Application
 * Evidence `ev_4addbc86…`):
 *
 * - the option is on by default (`waterReflection: !0`);
 * - it is offered only when the render engine reports stencil support
 *   (`s.canUseStencil() || delete n.waterReflection`), i.e. the reference
 *   reflections are stencil-based planar mirrors;
 * - it is persisted in the `_graphicOptions` cookie and pushed into the map
 *   through `map.set({ waterReflection }, …)`.
 *
 * The bundle contains **no** water shading code: the renderer is a separately
 * loaded object (`f4.map._renderer.getRenderEngine()`), so the algorithm itself
 * remains unknown. This example therefore reproduces the observable contract —
 * an animated water surface with a user-facing reflection toggle — and uses the
 * repository's TSL `WaterMaterial` (normal-map driven surface normals, fresnel
 * weighted reflection) instead of claiming a decompiled f4map shader.
 *
 * Debug switch: `?reflection=off` starts with the reflection term disabled.
 */

import { type Feature, type MapView } from "@flywave/flywave.gl";
import { Vector3 } from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    createWaterMaterial,
    demoImagery,
    logExampleInfo,
    PolygonMesh,
    type WaterMaterial
} from "../common";

/**
 * The largest water body in `resources/water_geojson.json`: a ~8.7 km² flooded
 * quarry basin (props `depth: 30`) near 34.7805 N, 117.0705 E. It dominates the
 * data set (10.4 km² total), so the camera frames it rather than the city.
 */
const LOOK_AT = {
    target: { lat: 34.7805, lng: 117.0705 },
    zoomLevel: 13.4,
    tilt: 55,
    heading: 22
};

/**
 * Data files live in `flywave-examples/resources`, which the webpack config
 * copies to the *site root* (`additionalAssets` entry with `to: ""`), not under
 * `resources/` — that path is taken by the `flywave-map-theme` package.
 */
const WATER_GEOJSON_URL = "water_geojson.json";
const WATER_NORMALS_URL = "waternormals.jpg";

/**
 * Lake surface altitude in meters. The basemap draws the lake as a flat fill at
 * the ground plane, so the animated surface is lifted a little to stop the two
 * from fighting for the same depth buffer values.
 */
const WATER_ALTITUDE = 2;

const START_REFLECTION = new URLSearchParams(location.search).get("reflection") !== "off";

/** Debug switch: `?controls=off` drops the orbit controls for a fixed pose. */
const CONTROLS_OFF = new URLSearchParams(location.search).get("controls") === "off";

/** Water polygons are loaded from a plain GeoJSON array of features. */
type WaterGeoJson = Feature[] | { type: "FeatureCollection"; features: Feature[] };

async function loadWaterFeatures(url: string): Promise<Feature[]> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load water polygons from ${url}: HTTP ${response.status}`);
    }
    const data = (await response.json()) as WaterGeoJson;
    return Array.isArray(data) ? data : data.features;
}

/**
 * Build the water surface: one {@link PolygonMesh} per lake polygon, all sharing
 * a single {@link WaterMaterial} so the reflection switch is a single uniform
 * write instead of a per-mesh material rebuild.
 */
async function buildWaterSurface(
    mapView: MapView
): Promise<{ material: WaterMaterial; meshes: PolygonMesh[] }> {
    const features = await loadWaterFeatures(WATER_GEOJSON_URL);
    if (features.length === 0) {
        throw new Error("Water GeoJSON contains no features");
    }

    const material = createWaterMaterial({
        normalsUrl: WATER_NORMALS_URL,
        alpha: 0.88,
        waterColor: 0x215f6b,
        skyColor: 0x9fc6dd,
        sunColor: 0xfff1d0,
        sunDirection: new Vector3(0.35, -0.45, 0.82),
        // ~4 m ripple wavelength at 24 UV/m divided by the 103 m base tile.
        textureScale: 24,
        distortionScale: 26,
        reflectionStrength: START_REFLECTION ? 1 : 0
    });

    const meshes = features.map(feature => {
        // The polygon is built flat in a tangent frame derived from the
        // projection, and lifted to the lake surface altitude.
        const mesh = new PolygonMesh(feature, mapView.projection, material, WATER_ALTITUDE);
        mapView.mapAnchors.add(mesh);
        return mesh;
    });

    // The shading frame is taken from each mesh's own model matrix, so every
    // polygon is lit correctly regardless of projection and position.

    return { material, meshes };
}

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement | null;
if (canvas === null) {
    throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
}

try {
    const { mapView, controls } = await createExampleMap(canvas, {
        // Flat (mercator) scene: the water surface is a ground-aligned polygon
        // layer, and the raster theme below is the one wired for imagery
        // overlays — a globe theme ignores independently added web tiles.
        projection: "mercator",
        theme: "resources/tilezen_base.json",
        lookAt: LOOK_AT,
        // Default engine ceilings keep the camera ~20 m above ground; lower both
        // so the water surface can actually be inspected from up close.
        maxZoomLevel: 22,
        minCameraHeight: 3,
        controls: !CONTROLS_OFF,
        controlsUi: CONTROLS_OFF ? "none" : "compact",
        addBackgroundDatasource: true
    });

    // Basemap imagery: the theme alone draws no tiles, so the lake has to come
    // from a WebTileDataSource. Esri World Imagery keeps the water body visible
    // underneath the animated surface; the helper degrades to a debug grid when
    // the provider is unreachable instead of leaving a blank globe.
    const imagery = await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));
    logExampleInfo(`fx-water-surface/imagery=${imagery.name}`, mapView);

    const { material } = await buildWaterSurface(mapView);

    const state = { waterReflection: START_REFLECTION, speed: 1 };
    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Water (f4map: waterReflection)");
    folder
        .add(state, "waterReflection")
        .name("reflection")
        .onChange((enabled: boolean) => {
            material.reflectionStrength = enabled ? 1 : 0;
            // The engine renders on demand: without this the toggle would not
            // change a single pixel until the camera moves.
            mapView.update();
        });
    folder
        .add(state, "speed", 0, 3, 0.05)
        .name("speed")
        .onChange((value: number) => {
            material.speed = value;
            mapView.update();
        });

    // Water animation is driven by the TSL `time` node, which advances on every
    // rendered frame — keep frames coming instead of waiting for camera input.
    mapView.beginAnimation();

    (window as unknown as { __mapView: MapView }).__mapView = mapView;
    (window as unknown as { __waterMaterial: WaterMaterial }).__waterMaterial = material;
    (window as unknown as { __controls: unknown }).__controls = controls;
    logExampleInfo("fx-water-surface", mapView);
} catch (error) {
    console.error("Water surface example failed to start:", error);
}
