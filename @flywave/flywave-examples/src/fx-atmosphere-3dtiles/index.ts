/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Atmosphere × 3D Tiles (sunset).
 *
 * A reproduction of the upstream three-geospatial storybook story
 * `atmosphere/3D Tiles Renderer Integration → Shadows`, using the same
 * atmosphere/shadow/exposure recipe but a Cesium-ion-hosted 3D Tiles asset
 * our loader can read:
 *
 * - Cesium ion asset 75343 (NYC DoITT building massing) over lower Manhattan.
 * - Local solar time 17.7 h on day-of-year 260 (late afternoon, low sun).
 * - 3 cascaded sun-shadow maps of 1024² over a 50 km range.
 * - AgX "punchy" tone mapping (upstream's other 3D Tiles stories use
 *   exposure 10; its Shadows story uses 35 because Google Photorealistic
 *   textures are much darker than the untextured NYC massing here).
 * - Aerial perspective fed by the CSM shadow length (god rays), which is the
 *   effect the upstream story is named after.
 *
 * Google Photorealistic 3D Tiles (Cesium ion asset 2275207) would match the
 * upstream story exactly, but its tile URLs require Google's API key on every
 * child request (the endpoint returns a keyed root URL, and child URIs only
 * carry a session token). The loader does not forward that key yet, so those
 * requests return 403. Use a self-hosted/standard 3D Tiles endpoint instead.
 *
 * The data source needs a Cesium ion token (see the other `tiles3d-*`
 * examples). For local/self-hosted tilesets, bypass ion entirely with
 * `?url=<absolute tileset.json URL>`.
 *
 * Camera overrides (metres / degrees): `?lat=&lng=&alt=&distance=&tilt=&heading=`.
 * `?ion=<assetId>` switches the Cesium ion asset.
 */

import {
    type Theme,
    ArcGISTileProvider,
    CesiumIonDataSource,
    DEMTerrainSource,
    TileRenderDataSource,
    type MapView
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

/** Cesium ion asset 75343 = NYC DoITT building massing (lower Manhattan). */
const DEFAULT_ION_ASSET_ID = 75343;

/** Dataset anchor: lower Manhattan, shifted north to frame One WTC. */
const STORY_TARGET = { lat: 40.708, lng: -74.013, alt: 10 };

/**
 * Cinematic pose: ~1.8 km east of lower Manhattan at ~380 m, tilted 78°,
 * looking west into the 17:42 sun so the skyline is backlit.
 */
const STORY_CAMERA = { distance: 1800, tilt: 78, heading: 274 };

/** Upstream story local date: day-of-year 260 of 2026 (Sep 17), 17.7 h. */
const STORY_YEAR = 2026;
const STORY_DAY_OF_YEAR = 260;
const STORY_TIME_OF_DAY = 17.7;

/** AgX exposure: upstream's other 3D Tiles stories use 10 (see header note). */
const STORY_EXPOSURE = 10;

/**
 * Free global DEM (AWS Open Data terrarium tiles) with ArcGIS imagery, so the
 * untextured building massing sits on a real ground/water surface instead of
 * the atmosphere's below-horizon sky.
 */
const FREE_TERRARIUM_DEM = {
    type: "raster-dem" as const,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    scheme: "xyz" as const,
    bounds: [-180, -85.0511, 180, 85.0511] as [number, number, number, number],
    minzoom: 0,
    maxzoom: 15,
    tileSize: 256,
    attribution: "Terrain: AWS Open Data Terrain Tiles / Mapzen"
};

interface StoryPose {
    target: { lat: number; lng: number; alt: number };
    distance: number;
    tilt: number;
    heading: number;
}

/** Read a finite numeric query parameter, or fall back. */
function numberParam(name: string, fallback: number): number {
    const raw = new URLSearchParams(window.location.search).get(name);
    if (raw == null) {
        return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

/**
 * Upstream `localDateControls.ts` convention: the story's time-of-day is local
 * solar time at the target longitude, so the absolute epoch must subtract
 * `longitude / 15` hours from UTC on that day.
 */
function getLocalEpoch(longitude: number, timeOfDay: number): number {
    const epoch = Date.UTC(STORY_YEAR, 0, 1, 0, 0, 0, 0);
    return epoch + ((STORY_DAY_OF_YEAR - 1) * 24 + timeOfDay - longitude / 15) * 3_600_000;
}

function resolvePose(): StoryPose {
    return {
        target: {
            lat: numberParam("lat", STORY_TARGET.lat),
            lng: numberParam("lng", STORY_TARGET.lng),
            alt: numberParam("alt", STORY_TARGET.alt)
        },
        distance: numberParam("distance", STORY_CAMERA.distance),
        tilt: numberParam("tilt", STORY_CAMERA.tilt),
        heading: numberParam("heading", STORY_CAMERA.heading)
    };
}

/**
 * Inline theme: the upstream story's atmosphere configuration, including the
 * ground-band switch (`showGround: false` — the tileset is the ground) and
 * clouds off (the "Shadows" story has none).
 */
function buildTheme(longitude: number): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // Authoritative shadow switch: `MapViewThemeManager` overwrites
        // `MapViewOptions.enableShadows` from the theme, so passing
        // `enableShadows: true` to `createExampleMap` alone leaves the whole
        // CSM / god-ray chain disabled.
        enableShadows: true,
        atmosphere: {
            enabled: true,
            sunTime: getLocalEpoch(longitude, STORY_TIME_OF_DAY),
            sunTimeTransitionDuration: 0,
            showGround: false,
            clouds: false,
            higherOrderScatteringTexture: true,
            raymarchScattering: true,
            accurateShadowScattering: true
        },
        toneMappingMode: "agx-punchy",
        toneMappingExposure: STORY_EXPOSURE
    };
}

/**
 * Cesium ion 3D Tiles source (default: NYC DoITT massing). `?url=` bypasses
 * ion for local/self-hosted tilesets.
 */
function createDataSource(): TileRenderDataSource | CesiumIonDataSource | undefined {
    const tilesetUrl = new URLSearchParams(window.location.search).get("url");
    if (tilesetUrl != null && tilesetUrl.length > 0) {
        return new TileRenderDataSource({
            url: tilesetUrl,
            castShadow: true,
            receiveShadow: true
        });
    }

    const token =
        new URLSearchParams(window.location.search).get("ionToken") ??
        window.sessionStorage.getItem("CESIUM_ION_TOKEN") ??
        checkIonToken();
    if (token === undefined) {
        return undefined;
    }

    return new CesiumIonDataSource({
        accessToken: token,
        assetId: numberParam("ion", DEFAULT_ION_ASSET_ID),
        castShadow: true,
        receiveShadow: true
    });
}

/** Guidance card shown when neither a token nor `?url=` is available. */
function showTokenHint(): void {
    const card = document.createElement("div");
    card.innerHTML = [
        "<b>需要 Cesium ion token 或一个 tileset URL。</b>",
        "这个示例默认加载 Cesium ion 75343（曼哈顿建筑体块）：",
        "<ol>",
        "<li>控制台执行 " +
            '<code>sessionStorage.setItem("CESIUM_ION_TOKEN", "&lt;token&gt;")</code> 后刷新；</li>',
        "<li>或用 <code>?url=http://…/tileset.json</code> 指定任意 3D Tiles；</li>",
        "<li>或直接传 <code>?ionToken=&lt;token&gt;</code>（仅本地调试）。</li>",
        "</ol>",
        "免费 token: https://ion.cesium.com/tokens"
    ].join("\n");
    card.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);" +
        "max-width:560px;padding:20px 24px;font:13px/1.6 sans-serif;color:#e8eaed;" +
        "text-align:left;";
    applyPanelStyle(card, { zIndex: "200" });
    document.body.appendChild(card);
}

/** Live controls for the two upstream story knobs: sun time and exposure. */
function setupGui(mapView: MapView, longitude: number): void {
    const state = {
        hour: STORY_TIME_OF_DAY,
        exposure: STORY_EXPOSURE
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const story = gui.addFolder("Upstream story settings");
    story
        .add(state, "hour", 0, 24, 0.05)
        .name("local solar time (h)")
        .onChange((hour: number) => {
            mapView.patchTheme({
                atmosphere: {
                    sunTime: getLocalEpoch(longitude, hour),
                    sunTimeTransitionDuration: 0
                }
            });
            mapView.update();
        });
    story
        .add(state, "exposure", 0.5, 100, 0.5)
        .name("AgX exposure")
        .onChange((exposure: number) => {
            mapView.patchTheme({ toneMappingExposure: exposure });
            mapView.update();
        });
    story.open();
}

/**
 * Match the upstream story's lighting setup: it has no sky environment map and
 * no night ambient fill — the AtmosphereLight supplies direct + indirect
 * irradiance. Our globe defaults add both, which floods the scene with uniform
 * light, hides the sun's directional contrast and weakens the CSM
 * shadow-length god rays.
 */
function applyStoryLighting(mapView: MapView): void {
    const scene = mapView.scene as typeof mapView.scene & {
        environmentNode?: unknown;
        environment?: unknown;
    };
    scene.environmentNode = null;
    scene.environment = null;
    scene.traverse(object => {
        if ((object as { isHemisphereLight?: boolean }).isHemisphereLight === true) {
            object.visible = false;
        }
    });
    mapView.update();
}

async function main(): Promise<void> {
    const dataSource = createDataSource();
    if (dataSource === undefined) {
        showTokenHint();
        return;
    }

    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const pose = resolvePose();
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(pose.target.lng),
        lookAt: {
            target: pose.target,
            distance: pose.distance,
            tilt: pose.tilt,
            heading: pose.heading
        },
        enableShadows: true,
        // Match the engine's tuned shadow bench (`fx-shadow-stress`): 4
        // cascades × 2048², PCF-soft. Its auto range settles at ~8 km for the
        // bench camera; our wider city scene resolves to ~14 km, so cap it at
        // the same texel density instead of copying upstream's 3×1024²/50 km.
        shadowCascades: 4,
        shadowMapSize: 2048,
        shadowFilter: "pcf-soft",
        shadowMaxDistance: 8000
    });
    logExampleInfo("fx-atmosphere-3dtiles", mapView);
    applyStoryLighting(mapView);

    // Ground/water under the building massing (the 3D Tiles asset only
    // contains buildings). Terrain casts sun shadows so ridges occlude the
    // sun; the CSM shadow length turns those occlusions into light shafts.
    const terrain = new DEMTerrainSource({
        source: FREE_TERRARIUM_DEM,
        encoding: "terrarium",
        castShadow: true
    });
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
    await mapView.setElevationSource(terrain);

    await mapView.addDataSource(dataSource);
    mapView.update();

    // patchTheme throws before the theme finished loading.
    await mapView.getTheme();
    setupGui(mapView, pose.target.lng);
}

void main().catch(error => console.error("fx-atmosphere-3dtiles failed:", error));
