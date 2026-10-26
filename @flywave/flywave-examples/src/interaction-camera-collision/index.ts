/* Copyright (C) 2025 flywave.gl contributors */

import {
    DEMTerrainSource,
    GeoCoordinates,
    MapViewEventNames,
    type MapView
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

/**
 * Free global DEM: AWS Open Data terrarium terrain tiles (no token, server
 * CORS enabled). `encoding: "terrarium"` knowledge: height = R * 256 + G + B /
 * 256 - 32768 (meters). Note the encoding is NOT read from the source
 * descriptor — it must be declared on the `DEMTerrainSource` constructor
 * option; a terrarium tile set without it is decoded as mapbox RGB (heights
 * wrong by orders of magnitude).
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

/** Demo site: the Taishan massif — steep relief makes collisions visible. */
const SITE = { lat: 36.4862, lng: 118.1727, alt: 800 };

/** Camera is considered "clamped" when closer than this to the terrain. */
const CLAMP_THRESHOLD_M = 12;

/** HUD state, updated from the per-frame camera stats and hover raycast. */
interface CollisionStats {
    enabled: boolean;
    zoomLevel: number;
    aboveGround: string;
    clamped: string;
    maxTiltAngle: number;
    rayStatus: string;
    rayDistance: string;
    rayAltitude: string;
}

/**
 * A persistent sphere marker: the group is anchored at a fixed geo position
 * (MapAnchor — the scene root is rebuilt every frame), the child sphere is
 * offset by `hit - anchorWorld` to mark arbitrary world points.
 */
class HitMarker {
    private readonly m_group = new THREE.Group();
    private readonly m_mesh: THREE.Mesh;
    private readonly m_anchor: GeoCoordinates;

    constructor(
        private readonly mapView: MapView,
        anchor: GeoCoordinates,
        color: number
    ) {
        this.m_anchor = anchor;
        this.m_mesh = new THREE.Mesh(
            new THREE.SphereGeometry(6, 16, 16),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })
        );
        this.m_mesh.renderOrder = 9999;
        this.m_mesh.visible = false;
        this.m_group.add(this.m_mesh);
        this.m_group.anchor = anchor;
        mapView.mapAnchors.add(this.m_group);
    }

    /** Move the marker to a geo-frame world point. */
    placeAt(worldPos: THREE.Vector3): void {
        const anchorWorld = this.mapView.projection.projectPoint(
            this.m_anchor,
            new THREE.Vector3()
        );
        this.m_mesh.position.copy(worldPos).sub(anchorWorld);
        this.m_mesh.visible = true;
    }

    hide(): void {
        this.m_mesh.visible = false;
    }
}

/** Demo page: terrain camera collision with live raycast inspection. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView, controls } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng, alt: SITE.alt }, zoomLevel: 14.5, tilt: 55 }
    });

    // Terrarium encoding is declared on the constructor (see note above).
    const terrain = new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    const stats: CollisionStats = {
        enabled: terrain.enableCameraCollision === true,
        zoomLevel: mapView.zoomLevel,
        aboveGround: "-",
        clamped: "no",
        maxTiltAngle: controls !== undefined ? controls.maxTiltAngle : 0,
        rayStatus: "-",
        rayDistance: "-",
        rayAltitude: "-"
    };

    const rayMarker = new HitMarker(
        mapView,
        new GeoCoordinates(SITE.lat, SITE.lng, SITE.alt),
        0xff3344
    );

    // --- HUD -----------------------------------------------------------------
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "12px",
        top: "12px",
        padding: "10px 14px",
        font: "12px/1.7 sans-serif",
        color: "#e8eaed",
        whiteSpace: "pre-line",
        pointerEvents: "none",
        minWidth: "240px"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);

    function updateHud(): void {
        const clampActive = stats.clamped === "yes";
        const belowTerrain = stats.aboveGround.startsWith("-");
        hud.innerHTML =
            `<b>Camera collision</b><br>` +
            `enableCameraCollision: ${stats.enabled ? "on" : "off"}<br>` +
            `zoomLevel: ${stats.zoomLevel.toFixed(2)} (terrain raycast needs >= 13)<br>` +
            `camera above ground: ${stats.aboveGround} m<br>` +
            (clampActive
                ? `<b>collision active — zoom clamped at terrain</b>`
                : belowTerrain && !stats.enabled
                    ? `<b>camera below terrain — collision is off</b>`
                    : `raycast: ${stats.rayStatus}<br>` +
                      `ray hit distance: ${stats.rayDistance} m<br>` +
                      `ray hit altitude: ${stats.rayAltitude} m`);
    }

    // --- GUI -----------------------------------------------------------------
    const gui: GUI = createExampleGui();
    const collisionFolder = gui.addFolder("Camera collision");
    collisionFolder
        .add(stats, "enabled")
        .name("enableCameraCollision")
        .onChange((value: boolean) => {
            // The switch lives on the data source: MapControls gathers every
            // data source with `enableCameraCollision && raycast` per query.
            terrain.enableCameraCollision = value;
            updateHud();
        });
    collisionFolder.add(stats, "zoomLevel").name("zoomLevel").listen();
    collisionFolder.add(stats, "aboveGround").name("above ground (m)").listen();
    collisionFolder.add(stats, "clamped").name("clamped").listen();
    collisionFolder.open();

    const controlsFolder = gui.addFolder("MapControls limits");
    controlsFolder
        .add(stats, "maxTiltAngle", 1, 85, 0.5)
        .name("maxTiltAngle (deg)")
        .onChange((value: number) => {
            if (controls !== undefined) {
                controls.maxTiltAngle = value;
            }
        });
    controlsFolder.open();

    const helpFolder = gui.addFolder("How to test");
    const help = {
        step1: "1. wait for mountain imagery to load",
        step2: "2. put the cursor on a slope and zoom in: the camera decelerates onto the terrain",
        step3: "3. the red sphere marks where the terrain raycast hits under the cursor",
        step4: "4. toggle enableCameraCollision off and zoom: the camera dives through the mountain",
        step5: "5. below zoom 13 the DEM grid is too coarse — the source opts out of collision"
    };
    for (const step of Object.values(help)) {
        helpFolder.add({ text: step }, "text").name(step);
    }
    helpFolder.open();

    // --- per-frame camera stats + collision hint ----------------------------
    function updateCameraStats(): void {
        stats.zoomLevel = mapView.zoomLevel;
        const cameraGeo = mapView.projection.unprojectPoint(mapView.camera.position);
        const terrainHeight = mapView.elevationProvider?.getHeight(cameraGeo) ?? 0;
        const above = (cameraGeo.altitude ?? 0) - terrainHeight;
        stats.aboveGround = above.toFixed(1);
        stats.clamped =
            stats.enabled && mapView.zoomLevel >= 13 && above < CLAMP_THRESHOLD_M ? "yes" : "no";
        updateHud();
    }
    mapView.addEventListener(MapViewEventNames.Render, () => updateCameraStats());

    // --- hover raycast through the terrain source ---------------------------
    let pendingEvent: MouseEvent | null = null;
    let rafScheduled = false;
    canvas.addEventListener("mousemove", (e: MouseEvent) => {
        pendingEvent = e;
        if (rafScheduled) {
            return;
        }
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            if (pendingEvent === null) {
                return;
            }
            const event = pendingEvent;
            pendingEvent = null;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(
                mapView.getNormalizedScreenCoordinates(event.layerX, event.layerY),
                mapView.camera
            );
            const intersections: THREE.Intersection[] = [];
            terrain.raycast(raycaster, intersections);
            if (intersections.length === 0) {
                stats.rayStatus = "miss (sea / zoom<13 / tiles warming up)";
                stats.rayDistance = "-";
                stats.rayAltitude = "-";
                rayMarker.hide();
                updateHud();
                return;
            }
            // Contract: the data source emits a RENDER-space hit point; the
            // consumer translates it back to the geo frame by adding the
            // camera position (same path as MapControls' zoom hit point).
            const worldPos = intersections[0].point.clone().add(mapView.camera.position);
            const geo = mapView.projection.unprojectPoint(worldPos);
            stats.rayStatus = "hit";
            stats.rayDistance = intersections[0].distance.toFixed(1);
            stats.rayAltitude = (geo.altitude ?? 0).toFixed(1);
            rayMarker.placeAt(worldPos);
            updateHud();
        });
    });

    updateCameraStats();
    updateHud();
    // On-demand rendering: request the first repaint after setup.
    mapView.update();
    logExampleInfo("interaction-camera-collision", mapView);
}

main().catch(err => console.error("interaction-camera-collision failed:", err));
