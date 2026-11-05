/* Copyright (C) 2025 flywave.gl contributors */

import { ArcGISTileProvider, DEMTerrainSource, GeoCoordinates } from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleMap, demoTerrain, logExampleInfo } from "../common";

/**
 * Add a one-line footnote explaining the WebGPU -> WebGL fallback: appending
 * `?renderer=webgl` to the page URL forces the WebGL2 backend of the same
 * WebGPURenderer (useful on machines without WebGPU).
 */
function addRendererFootnote(): void {
    const note = document.createElement("div");
    note.textContent =
        "Renders with WebGPU by default; add ?renderer=webgl to the URL to force the WebGL2 fallback.";
    Object.assign(note.style, {
        position: "absolute",
        left: "12px",
        bottom: "12px",
        padding: "6px 10px",
        font: "12px/1.4 sans-serif",
        color: "#e8eaed"
    } as CSSStyleDeclaration);
    applyPanelStyle(note);
    document.body.appendChild(note);
}

/**
 * Global DEM: the AWS Open Data "Terrain Tiles" terrarium service (no token,
 * CORS enabled, covers the whole planet at zoom 0..15). The encoding MUST be
 * declared explicitly — the decoder defaults to mapbox and would misread
 * terrarium heights by orders of magnitude.
 */
function globalTerrain(): DEMTerrainSource {
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

/**
 * Unix-ms timestamp at solar noon over the given longitude. The atmosphere
 * derives the sun direction from the timestamp, so this keeps the hemisphere
 * facing the default camera in daylight regardless of the machine clock.
 */
function solarNoonTimestamp(longitudeDeg: number): number {
    const now = new Date();
    const utcHour = 12 - longitudeDeg / 15;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dayStart + ((utcHour + 24) % 24) * 3600 * 1000;
}

/** Default view: whole globe, centered on Asia. */
const GLOBE_TARGET = { lat: 25, lng: 110 };
const GLOBE_ZOOM = 2.3;

/**
 * Global terrain map: the whole planet as a 3D DEM surface.
 *
 * Demonstrates the canonical setup shared by every example:
 * 1. {@link createExampleMap} wires MapView + MapControls + the UI overlay,
 * 2. attach a GLOBAL elevation source (AWS terrarium, zoom 0..15),
 * 3. drape imagery into the terrain tiles with `imageryLevelOffset: 1` — every
 *    terrain tile renders a 2x2 mosaic of its four child imagery tiles (4x
 *    the texels at the same mesh count).
 *
 * URL flags:
 *   ?mapterhorn   — public terrarium DEM from tiles.mapterhorn.com
 *   ?localdem     — local demo DEM bundled with the examples
 *   ?emptyterrain — empty draping carrier (no DEM data)
 *   ?flyto=lat,lng,distance,tilt,heading — debug camera override
 *   ?init=lat,lng,distance,tilt,heading — initial-camera override: placement
 *     is ellipsoid-based, so a near-surface distance over high terrain starts
 *     the camera UNDERGROUND (MapControls' per-frame guard must recover it).
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const urlParams = new URLSearchParams(window.location.search);

    // Initial-camera debug override (consumed at construction, before any
    // animation: this is what "the default position starts underground" means).
    const initParts = urlParams.get("init")?.split(",").map(Number) ?? [];
    const initLookAt = Number.isFinite(initParts[0])
        ? {
              target: { lat: initParts[0], lng: initParts[1] },
              distance: initParts[2],
              tilt: initParts[3] ?? 0,
              heading: initParts[4] ?? 0
          }
        : undefined;

    // Step 1: map + controls from the shared factory.
    const { mapView } = await createExampleMap(canvas, {
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true,
                // Keep the Asia-facing hemisphere in daylight.
                sunTime: solarNoonTimestamp(GLOBE_TARGET.lng),
                sunTimeTransitionDuration: 0
            }
        },
        controlsUi: "compact",
        lookAt: initLookAt ?? { target: GLOBE_TARGET, zoomLevel: GLOBE_ZOOM, tilt: 0 }
    });

    // Step 2: global DEM (debug sources opt-in via URL flags).
    const terrain = urlParams.has("mapterhorn")
        ? new DEMTerrainSource({
              source: {
                  minzoom: 0,
                  maxzoom: 14,
                  tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
                  bounds: [-180, -85.0511, 180, 85.0511],
                  scheme: "xyz",
                  tileSize: 512,
                  type: "raster-dem"
              },
              encoding: "terrarium"
          })
        : urlParams.has("emptyterrain")
        ? new DEMTerrainSource({
              source: {
                  minzoom: 0,
                  maxzoom: 15,
                  tiles: [],
                  bounds: [-180, -90, 180, 90],
                  scheme: "xyz",
                  tileSize: 256,
                  type: "raster-dem"
              }
          })
        : urlParams.has("localdem")
        ? demoTerrain()
        : globalTerrain();

    // Step 3: drape Esri World Imagery INTO the terrain tiles, one imagery
    // level finer than the mesh. Never add imagery as an independent
    // DataSource on top of an elevation source: the flat layer is coplanar
    // with the draped surface and depth-fights.
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }), {
        imageryLevelOffset: 1
    });
    await mapView.setElevationSource(terrain);

    // Pin the global pose explicitly. The constructor lookAt runs before the
    // elevation source exists, and the camera distance is recomputed once the
    // terrain under the target resolves (the zoom drifts a couple of levels);
    // re-applying it here keeps the default view on the whole globe.
    // The ?init= debug override re-applies AFTER the elevation source instead:
    // its whole point is a construction-like placement (possibly underground
    // over high terrain) with DEM data already available.
    if (initLookAt === undefined) {
        mapView.lookAt({
            target: new GeoCoordinates(GLOBE_TARGET.lat, GLOBE_TARGET.lng),
            zoomLevel: GLOBE_ZOOM,
            tilt: 0,
            heading: 0
        });
    } else {
        mapView.lookAt(initLookAt);
    }

    // Rendering is on-demand: request a repaint after changing visual state.
    mapView.update();

    // Optional camera flight for engine debugging. The default view stays the
    // whole globe; `?flyto=lat,lng,distance,tilt,heading` overrides it.
    const [pLat, pLng, pDist, pTilt, pHdg] = urlParams.get("flyto")?.split(",").map(Number) ?? [];
    if (Number.isFinite(pLat)) {
        void mapView.flyTo({
            target: { latitude: pLat, longitude: pLng },
            distance: pDist,
            tilt: pTilt,
            heading: pHdg,
            duration: 2
        });
    }

    addRendererFootnote();
    logExampleInfo("getting-started-hello-map", mapView);
}

main().catch(err => console.error("getting-started-hello-map failed:", err));
