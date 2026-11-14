/* Copyright (C) 2025 flywave.gl contributors */

import {
    ArcGISTileProvider,
    DEMTerrainSource,
    ellipsoidProjection,
    GeoCoordinates,
    TileRenderDataSource,
    type MapAnchor,
    type MapView
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/**
 * Temporary diagnostic page: a local 3D Tiles dataset ("gudao") whose region
 * metadata contains tiles with swapped latitude bounds (`south > north`).
 * Before the fix in `EllipsoidProjection.computeOrientedBoundingBoxFromRectangle`
 * those tiles threw "Rectangle height must be between 0 and π" and the whole
 * container tile was rejected.
 *
 * The page pins a captured camera pose and prints, for the offending i3dm
 * tile, whether the engine created it, computed its OBB and marked it visible.
 * Terrain is disabled by default (`?terrain=1` enables the global AWS DEM).
 */
const TILESET_URL = "http://127.0.0.1:3000/tiles/3d/gudao/master/tileset.json";

/**
 * Camera pose read from the live page on 2026-11-14 after the terrain overlay
 * settled: `40.6110°, 109.7451° 1.26km / Tilt: 59.9°, Hdg: 14.8°`
 * (zoom ≈ 18.43). Those coordinates are the CAMERA position (geoCenter), not
 * the look-at target; the value is now baked in and re-applied once so the
 * diagnostic view is stable.
 *
 * `?cam=lat,lng,altitude,tilt,heading` overrides the pose.
 */
interface CameraPose {
    lat: number;
    lng: number;
    /** Ellipsoid altitude in metres. */
    altitude: number;
    tilt: number;
    heading: number;
}

const DEFAULT_CAMERA: CameraPose = {
    lat: 40.611,
    lng: 109.7451,
    altitude: 1259.05,
    tilt: 59.9,
    heading: 14.8
};

function resolveCameraPose(): CameraPose {
    const raw = new URLSearchParams(window.location.search).get("cam");
    if (raw === null) {
        return DEFAULT_CAMERA;
    }
    const [lat, lng, altitude, tilt, heading] = raw.split(",").map(Number);
    return {
        lat: Number.isFinite(lat) ? lat : DEFAULT_CAMERA.lat,
        lng: Number.isFinite(lng) ? lng : DEFAULT_CAMERA.lng,
        altitude: Number.isFinite(altitude) ? altitude : DEFAULT_CAMERA.altitude,
        tilt: Number.isFinite(tilt) ? tilt : DEFAULT_CAMERA.tilt,
        heading: Number.isFinite(heading) ? heading : DEFAULT_CAMERA.heading
    };
}

const CAMERA = resolveCameraPose();

/** Dataset ground height used to convert the camera pose into a orbit target. */
const GROUND_ALTITUDE = 1038.1;

/** Orbit pose accepted by `MapView`'s `lookAt`/constructor parameters. */
interface OrbitPose {
    target: { lat: number; lng: number; alt: number };
    distance: number;
    tilt: number;
    heading: number;
}

/**
 * Convert a camera-centric pose (position + tilt + heading) into the
 * target/distance pair `MapView` expects: cast a ray from the camera down the
 * view axis until it reaches the dataset ground and use the hit point as the
 * look-at target.
 */
function orbitPoseFromCamera(): OrbitPose {
    const cameraGeo = new GeoCoordinates(CAMERA.lat, CAMERA.lng, CAMERA.altitude);
    const position = ellipsoidProjection.projectPoint(cameraGeo, new THREE.Vector3());
    const up = position.clone().normalize();
    const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), up).normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();

    const heading = THREE.MathUtils.degToRad(CAMERA.heading);
    const tilt = THREE.MathUtils.degToRad(CAMERA.tilt);

    // Horizontal view direction: north at heading 0, clockwise towards east.
    const horizontal = north
        .clone()
        .multiplyScalar(Math.cos(heading))
        .add(east.clone().multiplyScalar(Math.sin(heading)));

    // Tilt 0 looks straight down (nadir), 90 is horizontal.
    const distance = (CAMERA.altitude - GROUND_ALTITUDE) / Math.cos(tilt);
    const viewDirection = horizontal
        .multiplyScalar(Math.sin(tilt))
        .add(up.clone().multiplyScalar(-Math.cos(tilt)));

    const targetGeo = ellipsoidProjection.unprojectPoint(
        position.clone().add(viewDirection.multiplyScalar(distance))
    );

    return {
        target: {
            lat: targetGeo.latitude,
            lng: targetGeo.longitude,
            alt: targetGeo.altitude ?? GROUND_ALTITUDE
        },
        distance,
        tilt: CAMERA.tilt,
        heading: CAMERA.heading
    };
}

/**
 * Region of the tile that used to throw: south (0.708850686885281) lies
 * ~11 m north of north (0.7088489571583371), i.e. an inverted latitude span.
 */
const PROBLEM_REGION = {
    west: 1.9154150800307423,
    south: 0.708850686885281,
    east: 1.9154219417451477,
    north: 0.7088489571583371,
    minHeight: 1038.0808590156114,
    maxHeight: 1043.2673583391731
};

/** Content URI fragment identifying the offending leaf tile. */
const PROBLEM_CONTENT_URI = "i3dm_16383_0.i3dm";

const toDegrees = (value: number): number => (value * 180) / Math.PI;

/** Center of the offending region (latitude bounds averaged as unordered). */
const PROBLEM_CENTER = {
    lat: toDegrees((PROBLEM_REGION.south + PROBLEM_REGION.north) / 2),
    lng: toDegrees((PROBLEM_REGION.west + PROBLEM_REGION.east) / 2)
};

const LOAD_STATE_LABELS = ["UNLOADED", "LOADING", "PARSING", "LOADED", "FAILED"];

interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** Oriented bounding box fields exposed by `OrientedBox3`. */
interface ObbLike {
    position: Vec3Like;
    xAxis: Vec3Like;
    yAxis: Vec3Like;
    zAxis: Vec3Like;
    extents: Vec3Like;
}

/** Structural view of the 3D Tiles tile objects we inspect (internal fields). */
interface TileLike {
    __loadingState?: number;
    __inFrustum?: boolean;
    __used?: boolean;
    __error?: number;
    __distanceFromCamera?: number;
    content?: { uri?: string };
    cached?: {
        scene?: unknown;
        boundingVolume?: {
            region?: { west: number; south: number; east: number; north: number };
            regionObb?: ObbLike;
        };
    };
}

/** Unix-ms timestamp at solar noon over the given longitude. */
function solarNoonTimestamp(longitudeDeg: number): number {
    const now = new Date();
    const utcHour = 12 - longitudeDeg / 15;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dayStart + ((utcHour + 24) % 24) * 3600 * 1000;
}

/**
 * Global, key-free elevation source: AWS Open Data "Terrain Tiles"
 * (Mapzen terrarium encoding, CORS enabled, zoom 0..15). The encoding MUST be
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

function deg(value: number): string {
    return ((value * 180) / Math.PI).toFixed(7);
}

/**
 * Add a gold OBB wireframe plus a vertical beacon at the tile footprint.
 *
 * `MapAnchor` positions persistent objects in the RTE frame (iron rule 2); the
 * OBB axes are ENU-like (x east, y north, z up), so the wireframe child gets a
 * basis rotation while the beacon stays along the OBB z axis.
 */
function addProblemMarker(mapView: MapView, obb: ObbLike): MapAnchor {
    const anchor = new THREE.Group() as MapAnchor;
    anchor.name = "problem-region-obb";
    anchor.anchor = { x: obb.position.x, y: obb.position.y, z: obb.position.z };

    const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(obb.xAxis.x, obb.xAxis.y, obb.xAxis.z),
        new THREE.Vector3(obb.yAxis.x, obb.yAxis.y, obb.yAxis.z),
        new THREE.Vector3(obb.zAxis.x, obb.zAxis.y, obb.zAxis.z)
    );

    const oriented = new THREE.Group();
    oriented.quaternion.setFromRotationMatrix(basis);
    anchor.add(oriented);

    const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(
            new THREE.BoxGeometry(obb.extents.x * 2, obb.extents.y * 2, obb.extents.z * 2)
        ),
        new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true })
    );
    box.renderOrder = 1000;
    oriented.add(box);

    // Beacon: 80 m above the box so the footprint is easy to spot at 1.1 km.
    const beacon = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, obb.extents.z),
            new THREE.Vector3(0, 0, obb.extents.z + 80)
        ]),
        new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false })
    );
    beacon.renderOrder = 1000;
    oriented.add(beacon);

    mapView.mapAnchors.add(anchor);
    return anchor;
}

function createHudPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.style.cssText =
        "position:absolute;left:10px;top:10px;padding:10px 14px;color:#e8eaed;" +
        "font:12px/1.55 monospace;white-space:pre;pointer-events:none;max-width:640px;";
    applyPanelStyle(panel, { zIndex: "1000" });
    document.body.appendChild(panel);
    return panel;
}

/** Refresh the HUD from the live renderer state. */
function updateHud(
    panel: HTMLDivElement,
    mapView: MapView,
    dataSource: TileRenderDataSource,
    marker: { current?: MapAnchor }
): void {
    const renderer = dataSource.tilesRenderer;
    const stats = renderer.stats as unknown as Record<string, number>;

    let total = 0;
    let loaded = 0;
    let inverted = 0;
    let invertedWithObb = 0;
    let invertedVisible = 0;
    let problem: TileLike | undefined;
    let problemDepth: number | undefined;

    renderer.traverse(
        (tile, _parent, tileDepth: number) => {
            const info = tile as unknown as TileLike;
            total++;
            if (info.__loadingState === 3) {
                loaded++;
            }

            const boundingVolume = info.cached?.boundingVolume;
            const region = boundingVolume?.region;
            if (region !== undefined && region.south > region.north) {
                inverted++;
                const extents = boundingVolume?.regionObb?.extents;
                if (
                    extents !== undefined &&
                    Number.isFinite(extents.x) &&
                    Number.isFinite(extents.y) &&
                    Number.isFinite(extents.z)
                ) {
                    invertedWithObb++;
                }
                if ((renderer.visibleTiles as Set<unknown>).has(tile)) {
                    invertedVisible++;
                }
            }

            const uri = info.content?.uri;
            if (uri !== undefined && uri.includes(PROBLEM_CONTENT_URI)) {
                problem = info;
                problemDepth = tileDepth;
            }
        },
        undefined,
        false
    );

    let problemText = "problem tile: not in the loaded tree yet";
    if (problem !== undefined) {
        const state = problem.__loadingState;
        const stateLabel = state !== undefined ? LOAD_STATE_LABELS[state] ?? String(state) : "?";
        const obb = problem.cached?.boundingVolume?.regionObb;
        const visible = (renderer.visibleTiles as Set<unknown>).has(problem);
        const active = (renderer.activeTiles as Set<unknown>).has(problem);
        if (obb !== undefined && marker.current === undefined) {
            marker.current = addProblemMarker(mapView, obb);
            mapView.update();
        }
        const extents = obb?.extents;
        const finite = (value?: number): string =>
            value !== undefined && Number.isFinite(value) ? value.toFixed(0) : "∞";
        problemText =
            `problem tile: depth ${problemDepth ?? "?"} state ${stateLabel} ` +
            `scene ${problem.cached?.scene != null ? "yes" : "no"} ` +
            `inFrustum ${problem.__inFrustum === true ? "YES" : "no"} ` +
            `used ${problem.__used === true ? "YES" : "no"}\n` +
            `  culling: screen error ${finite(problem.__error)} / target ${
                renderer.errorTarget
            }  ` +
            `distance ${finite(problem.__distanceFromCamera)} m  ` +
            `visible ${visible ? "YES" : "no"} active ${active ? "YES" : "no"}\n` +
            `  region(deg): lon ${deg(PROBLEM_REGION.west)}..${deg(PROBLEM_REGION.east)} ` +
            `lat ${deg(PROBLEM_REGION.north)}..${deg(PROBLEM_REGION.south)} (south > north)\n` +
            `  obb extents(m): ${
                extents
                    ? `${extents.x.toFixed(2)} x ${extents.y.toFixed(2)} x ${extents.z.toFixed(2)}`
                    : "not computed"
            }`;
    }

    const geoCenter = mapView.geoCenter;

    panel.textContent =
        `gudao 3D Tiles — inverted-region check\n` +
        `spec camera: ${CAMERA.lat.toFixed(4)}°, ${CAMERA.lng.toFixed(4)}° ` +
        `${(CAMERA.altitude / 1000).toFixed(1)}km  tilt ${CAMERA.tilt}°  hdg ${CAMERA.heading}°\n` +
        `live camera: ${geoCenter.latitude.toFixed(4)}°, ${geoCenter.longitude.toFixed(4)}° ` +
        `${((geoCenter.altitude ?? 0) / 1000).toFixed(2)}km  ` +
        `tilt ${mapView.tilt.toFixed(1)}°  hdg ${mapView.heading.toFixed(1)}°  ` +
        `zoom ${mapView.zoomLevel.toFixed(1)}\n` +
        `tiles: tree ${total}  loaded ${loaded}  ` +
        `inCache ${stats.inCache ?? 0}  downloading ${stats.downloading ?? 0}  ` +
        `parsing ${stats.parsing ?? 0}  failed ${stats.failed ?? 0}\n` +
        `visible ${renderer.visibleTiles.size}  active ${renderer.activeTiles.size}\n` +
        `inverted regions: ${inverted}  with valid OBB: ${invertedWithObb}  ` +
        `visible: ${invertedVisible}\n` +
        problemText +
        `\n(?cam=lat,lng,alt,tilt,hdg | ?problem=1 close-up | ?boxes=1 OBBs | ` +
        `?terrain=1 global DEM)\n`;
}

async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas element #mapCanvas not found");
    }

    const { mapView } = await createExampleMap(canvas, {
        projection: "globe",
        controlsUi: "compact",
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true,
                sunTime: solarNoonTimestamp(CAMERA.lng),
                sunTimeTransitionDuration: 0
            }
        },
        lookAt: orbitPoseFromCamera()
    });
    logExampleInfo("tiles3d-gudao-region-debug", mapView);

    const urlParams = new URLSearchParams(window.location.search);

    // Global free terrain is OPT-IN (?terrain=1). It is off by default: the
    // elevation source re-derives camera distance while DEM tiles stream in, so
    // the diagnostic pose would drift. When enabled, imagery is draped INTO the
    // terrain tiles — an independent imagery layer on top of an elevation
    // source is coplanar with the surface and depth-fights.
    if (urlParams.has("terrain")) {
        const terrain = globalTerrain();
        // The per-frame controls guard would keep nudging the pinned pose.
        terrain.enableCameraCollision = false;
        terrain.addWebTileDataSource(
            new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }),
            { imageryLevelOffset: 1 }
        );
        await mapView.setElevationSource(terrain);
    } else {
        // Ellipsoid-only view: satellite imagery as a regular ground layer.
        void createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));
    }

    // Load the 3D Tiles subject. SSE (errorTarget) is pinned explicitly so the
    // LOD decision in the HUD does not depend on engine defaults.
    const dataSource = new TileRenderDataSource({
        url: TILESET_URL,
        errorTarget: 100,
        debugBoundingVolume: urlParams.has("boxes")
    });
    await mapView.addDataSource(dataSource);

    // Pin the baked camera pose after every data source is installed: terrain
    // and 3D Tiles both touch the look-at state, and the diagnostic comparison
    // must always start from the same view.
    mapView.lookAt(orbitPoseFromCamera());
    mapView.update();

    // `?problem=1` snaps the camera onto the offending tile (250 m orbit) so it
    // is trivially visible even when the pinned pose leaves it just outside the
    // frustum.
    if (urlParams.has("problem")) {
        mapView.lookAt({
            target: {
                latitude: PROBLEM_CENTER.lat,
                longitude: PROBLEM_CENTER.lng,
                altitude: PROBLEM_REGION.minHeight
            },
            distance: 250,
            tilt: CAMERA.tilt,
            heading: CAMERA.heading
        });
    }

    const panel = createHudPanel();
    const marker: { current?: MapAnchor } = {};
    updateHud(panel, mapView, dataSource, marker);
    window.setInterval(() => updateHud(panel, mapView, dataSource, marker), 500);
    mapView.update();
}

void main().catch(error => console.error("tiles3d-gudao-region-debug failed:", error));
