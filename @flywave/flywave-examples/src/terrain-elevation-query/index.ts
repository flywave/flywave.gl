/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    LoggerManager
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import { applyPanelStyle, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-elevation-query");

/**
 * Free global DEM: the AWS Open Data "Terrain Tiles" terrarium service (no
 * token, CORS enabled).
 *
 * TERRARIUM ENCODING KNOWLEDGE (kept from the camera-collision-test example):
 * height = R * 256 + G + B / 256 - 32768 (meters). The encoding is NOT part
 * of the source description JSON - it must be declared explicitly via the
 * `DEMTerrainSource` constructor option `encoding: "terrarium"`. The decoder
 * defaults to mapbox, so omitting it misreads heights by orders of magnitude.
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

/** Camera pose over the local test area (Shandong hills). */
const LOOK_AT = {
    target: { lat: 36.48619699228674, lng: 118.17270928364879 },
    zoomLevel: 14.5,
    tilt: 55,
    heading: 0
};

/** Click marker appearance. */
const MARKER_RADIUS = 8;
const MARKER_COLOR = 0xff3344;

/**
 * A persistent world-position marker.
 *
 * The scene root is rebuilt every frame, so the sphere lives inside a Group
 * anchored at a fixed geo point (`mapView.mapAnchors`); the child mesh is
 * offset by the difference between the world position and the anchor's world
 * position (see the RTE/geo coordinate rules in the engine docs).
 */
class ElevationMarker {
    private readonly m_mesh: THREE.Mesh;
    private readonly m_anchor: GeoCoordinates;

    constructor(private readonly m_mapView: MapView, anchor: GeoCoordinates) {
        this.m_anchor = anchor;
        this.m_mesh = new THREE.Mesh(
            new THREE.SphereGeometry(MARKER_RADIUS, 16, 16),
            new THREE.MeshBasicMaterial({ color: MARKER_COLOR, depthTest: false })
        );
        this.m_mesh.renderOrder = 9999;
        this.m_mesh.visible = false;

        const group = new THREE.Group();
        (group as unknown as { anchor: GeoCoordinates }).anchor = anchor;
        group.add(this.m_mesh);
        this.m_mapView.mapAnchors.add(group);
    }

    /** Move the marker to a world (geo frame) position and show it. */
    placeAt(worldPos: THREE.Vector3): void {
        const anchorWorld = this.m_mapView.projection.projectPoint(
            this.m_anchor,
            new THREE.Vector3()
        );
        this.m_mesh.position.copy(worldPos).sub(anchorWorld);
        this.m_mesh.visible = true;
    }
}

/**
 * Build the HUD card showing the last query result.
 *
 * @returns The text line elements to update per click.
 */
function buildHud(): { geoLine: HTMLDivElement; gpuLine: HTMLDivElement; cpuLine: HTMLDivElement } {
    const card = document.createElement("div");
    card.style.cssText =
        "position:absolute;left:16px;top:16px;max-width:380px;padding:12px 14px;" +
        "color:#ddd;font:12px/1.6 sans-serif;white-space:pre-line";
    applyPanelStyle(card);
    card.textContent =
        "Terrain elevation query - click the map\n" +
        "Source: AWS terrarium DEM (encoding: terrarium, no token)\n\n";
    const geoLine = document.createElement("div");
    const gpuLine = document.createElement("div");
    const cpuLine = document.createElement("div");
    card.append(geoLine, gpuLine, cpuLine);
    document.body.appendChild(card);
    return { geoLine, gpuLine, cpuLine };
}

/**
 * Handle one canvas click: read the surface position through both paths and
 * compare against the CPU elevation provider.
 *
 * - `getWorldPositionAt` reads the GPU depth buffer (includes terrain) and
 *   falls back to the math surface only when depth reading fails.
 * - `intersectMapObjects` returns pick results for rendered objects; over
 *   bare terrain it often yields nothing, which is exactly why the depth
 *   path is the general-purpose one.
 * - `getElevationProvider().getHeight(geo)` is the CPU point query. (The
 *   provider also offers `sampleHeight(geo, displacementMap)`, but it
 *   requires a displacement map from `getDisplacementMap(tileKey)`, so the
 *   point query is what applications normally use.)
 *
 * @param mapView - The ready map view.
 * @param terrain - The terrain source queried on the CPU.
 * @param marker - The marker to drop at the clicked position.
 * @param hud - HUD lines to update.
 * @param x - Click x in CSS pixels.
 * @param y - Click y in CSS pixels.
 */
function queryAt(
    mapView: MapView,
    terrain: DEMTerrainSource,
    marker: ElevationMarker,
    hud: ReturnType<typeof buildHud>,
    x: number,
    y: number
): void {
    const worldPos = mapView.getWorldPositionAt(x, y);
    if (worldPos === null) {
        hud.geoLine.textContent = "No surface at this pixel (off-globe or above horizon).";
        hud.gpuLine.textContent = "";
        hud.cpuLine.textContent = "";
        return;
    }

    const geo = mapView.projection.unprojectPoint(worldPos);
    marker.placeAt(worldPos);

    // Pick path: rendered-object intersection (may be empty over terrain).
    const picks = mapView.intersectMapObjects(x, y);
    const pickAlt = picks.length > 0 ? (picks[0].point as THREE.Vector3) : undefined;
    const pickGeo = pickAlt !== undefined ? mapView.projection.unprojectPoint(pickAlt) : undefined;

    // CPU path: elevation provider point query at the same coordinates.
    const providerHeight = terrain.getElevationProvider().getHeight(geo);
    const gpuAltitude = geo.altitude ?? Number.NaN;
    const delta = providerHeight !== undefined ? (gpuAltitude - providerHeight).toFixed(2) : "-";

    hud.geoLine.textContent = `lat/lng: ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`;
    hud.gpuLine.textContent =
        `GPU surface altitude: ${gpuAltitude.toFixed(2)} m` +
        (pickGeo !== undefined
            ? ` | pick hit altitude: ${(pickGeo.altitude ?? 0).toFixed(2)} m`
            : "") +
        (picks.length === 0 ? " (no object pick over bare terrain)" : "");
    hud.cpuLine.textContent =
        `Provider getHeight(): ${
            providerHeight !== undefined ? providerHeight.toFixed(2) : "-"
        } m` + ` | GPU - CPU delta: ${delta} m`;
}

/**
 * Example entry point: map -> free terrarium DEM -> click-to-query HUD.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: LOOK_AT,
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: { enabled: true }
        },
        onReady: view => logExampleInfo("terrain-elevation-query", view)
    });
    const mapView = handle.mapView;

    // encoding: "terrarium" is REQUIRED for this service (see comment above).
    const terrain = new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
    await mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    const anchor = new GeoCoordinates(LOOK_AT.target.lat, LOOK_AT.target.lng, 0);
    const marker = new ElevationMarker(mapView, anchor);
    const hud = buildHud();

    mapView.canvas.addEventListener("click", (event: MouseEvent) => {
        queryAt(mapView, terrain, marker, hud, event.layerX, event.layerY);
    });
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-elevation-query example:", String(error));
});
