/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Forest from OSM polygons, ported from f4map's detail generator.
 *
 * ## What came from the reference artifact
 *
 * f4map builds its vegetation by scattering tree instances over OSM polygons
 * tagged `landuse=forest|orchard` or `natural=wood|tree|tree_row`. The whole
 * pipeline was recovered from the shipped engine bundle `api.js` (sha256
 * `c20f8d0a…`, REA JavaScript Application Evidence `ev_4897ee30…`) and lives in
 * `../common/forest-layer.ts`; this file is the wiring.
 *
 * The behaviours reproduced here, with their reference symbols:
 *
 * - **Jittered scanline scatter** (`sampleShape`, module 638): forest polygons
 *   get x spacing 10–20 m and y spacing 5–10 m; orchards get a regular 10 × 10 m
 *   grid; `natural=tree_row` becomes a fixed-spacing walk along the ring.
 * - **Reproducible placement** (`Random`, module 636): the LCG is seeded from
 *   the feature's world position, so a given OSM way always grows the same
 *   trees.
 * - **Tag-driven species** (`realTreeType`, module 692): `leaf_type`, `wood`,
 *   `type`, `crown_type` and *Prunus* species decide between deciduous,
 *   coniferous, palm and the three cherries; a flowering cherry only blooms in
 *   its latitude's season.
 * - **Latitude fallback** (`randomTreeType`): untagged polygons bias toward
 *   conifers above 45° and palms below 44°.
 * - **Mercator-corrected heights** (`getScaleFromLatitude`, module 805): both
 *   the sampled spacing and the tree scale are multiplied by `cosh(π·y/R)`, so
 *   a 10 m tree stays 10 m on the ground however far from the equator it sits.
 * - **Billboard LOD** (`updateItemWithLodVisibility`, module 690): a chunk
 *   switches to its cross-billboard when the camera is more than 500 units from
 *   the near point of its bounding sphere.
 *
 * ## Assets
 *
 * The tree models are f4map's own `.bis` meshes, decoded at runtime by the
 * recovered `ModelDecoder` format; the diffuse textures and the shared LOD
 * atlas are the originals, fetched from the reference CDN.
 *
 * Debug switches: `?lod=off` pins every chunk to the full model, `?trees=off`
 * skips the forest entirely.
 */

import { type MapView, MapViewEventNames } from "@flywave/flywave.gl";
import { Vector3 } from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    ForestLayer,
    logExampleInfo
} from "../common";

/**
 * The forest polygons come from Overpass (`landuse=forest|orchard`,
 * `natural=wood|tree_row`) over the hills east of Xuzhou, the same area the
 * water example uses, so both demos share a setting.
 */
const LOOK_AT = {
    target: { lat: 34.8884, lng: 117.2742 },
    zoomLevel: 14.6,
    tilt: 55,
    heading: 20
};

/**
 * Data files live in `flywave-examples/resources`, which the webpack config
 * copies to the *site root* (`additionalAssets` entry with `to: ""`).
 */
const FOREST_GEOJSON_URL = "f4/forest_geojson.json";
const F4_MODELS_BASE_URL = "f4/models/";
const F4_TEXTURES_BASE_URL = "f4/textures/";

/** Debug switch: `?controls=off` drops the orbit controls for a fixed pose. */
const CONTROLS_OFF = new URLSearchParams(location.search).get("controls") === "off";

/** Debug switch: `?lod=off` keeps every chunk on the full model. */
const LOD_OFF = new URLSearchParams(location.search).get("lod") === "off";

/** Debug switch: `?trees=off` builds no forest at all. */
const TREES_OFF = new URLSearchParams(location.search).get("trees") === "off";

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement | null;
if (canvas === null) {
    throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
}

/**
 * Keeps the layer's LOD in sync with the camera.
 *
 * The reference listens for `cameraChanged` and re-evaluates every chunk's
 * bounding sphere; here the same rule runs off `CameraPositionChanged`, plus a
 * first pass so the opening pose is already resolved.
 */
function wireLod(mapView: MapView, forest: ForestLayer): void {
    const cameraPosition = new Vector3();
    const viewDirection = new Vector3();

    const update = (): void => {
        cameraPosition.copy(mapView.camera.position);
        // `getWorldDirection` writes -Z of the camera into `viewDirection`.
        mapView.camera.getWorldDirection(viewDirection);
        forest.updateLod(cameraPosition, viewDirection);
    };

    mapView.addEventListener(MapViewEventNames.CameraPositionChanged, update);
    update();
}

try {
    const { mapView, controls } = await createExampleMap(canvas, {
        // The scatter runs in world coordinates, and the tree models are
        // authored Z-up — a flat (mercator) scene keeps both assumptions true.
        projection: "mercator",
        theme: "resources/tilezen_base.json",
        lookAt: LOOK_AT,
        controls: !CONTROLS_OFF,
        controlsUi: CONTROLS_OFF ? "none" : "compact",
        addBackgroundDatasource: true
    });

    // The theme alone draws no tiles, so the hillside needs a raster layer.
    // Esri World Imagery keeps the terrain readable under the canopy; the
    // helper degrades to a debug grid when the provider is unreachable.
    const imagery = await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));
    logExampleInfo(`fx-forest/imagery=${imagery.name}`, mapView);

    let forest: ForestLayer | null = null;
    if (!TREES_OFF) {
        forest = await ForestLayer.create(mapView, {
            geojsonUrl: FOREST_GEOJSON_URL,
            modelsBaseUrl: F4_MODELS_BASE_URL,
            texturesBaseUrl: F4_TEXTURES_BASE_URL,
            // The reference clamps to 100 because it bakes copies into one
            // skinned geometry; InstancedMesh has no such ceiling.
            maxCountPerMesh: 4000,
            lodDistance: 500
        });
        // The scene root is rebuilt every frame, so a persistent layer has to
        // live under `mapAnchors`.
        mapView.mapAnchors.add(forest);
        if (!LOD_OFF) {
            wireLod(mapView, forest);
        }
    }

    const state = {
        lod: !LOD_OFF,
        spacingScale: 1
    };
    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Forest (f4map: _generateForest)");

    if (forest !== null) {
        folder
            .add(state, "lod")
            .name("billboard LOD")
            .onChange((enabled: boolean) => {
                if (!enabled) {
                    // Pin every chunk to the full model.
                    for (const chunk of forest!.chunks) {
                        chunk.near.visible = true;
                        if (chunk.far) {
                            chunk.far.visible = false;
                        }
                    }
                } else {
                    wireLod(mapView, forest!);
                }
                mapView.update();
            });
    }

    logExampleInfo(
        forest === null ? "fx-forest (no trees)" : `fx-forest/trees=${forest.instanceCount}`,
        mapView
    );

    (window as unknown as { __mapView: MapView }).__mapView = mapView;
    (window as unknown as { __forest: ForestLayer | null }).__forest = forest;
    (window as unknown as { __controls: unknown }).__controls = controls;
} catch (error) {
    console.error("Forest example failed to start:", error);
}
