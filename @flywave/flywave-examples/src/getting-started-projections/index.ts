/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Projection,
    ellipsoidProjection,
    equirectangularProjection,
    GeoCoordinates,
    mercatorProjection
} from "@flywave/flywave.gl";
import {
    type ExampleMapHandle,
    applyPanelStyle,
    attachTerrainImagery,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";
import { GUI } from "dat.gui";
import { BoxGeometry, Mesh, MeshStandardNodeMaterial } from "three/webgpu";

/**
 * Projection presets offered by the GUI, mapped onto the engine projection
 * singletons (the same objects the `projection` option of
 * {@link createExampleMap} accepts).
 */
const PROJECTIONS: Record<string, Projection> = {
    "Globe (ellipsoid)": ellipsoidProjection,
    "Mercator (flat)": mercatorProjection,
    "Equirectangular (flat)": equirectangularProjection
};

/**
 * Theme with the atmosphere demo kept from the former `basic-config`
 * example: physical atmosphere on, clouds off, sun fixed at 18:00 local
 * time so the low light direction shows terrain relief in every projection.
 */
const themeObject = {
    extends: "resources/tilezen_base_globe.json",
    atmosphere: {
        enabled: true,
        clouds: false,
        sunTime: new Date().setHours(18)
    }
};

/**
 * Persistent reference box added through `mapAnchors`. Anchors live outside
 * the per-frame rebuilt scene graph; the box makes scale and curvature
 * differences between the projections obvious while switching.
 */
function addReferenceBox(handle: ExampleMapHandle, position: GeoCoordinates): void {
    const box = new Mesh(
        new BoxGeometry(120, 120, 320),
        new MeshStandardNodeMaterial({ color: 0xff6b6b })
    );
    box.castShadow = true;
    box.receiveShadow = true;
    box.anchor = position;
    handle.mapView.mapAnchors.add(box);
}

/**
 * Create the status panel that reports the active projection.
 */
function createStatusPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.style.cssText =
        "position:absolute;left:12px;bottom:12px;padding:8px 12px;" +
        "font:12px/1.5 monospace;color:#e8eaed;white-space:pre;";
    applyPanelStyle(panel);
    document.body.appendChild(panel);
    return panel;
}

/**
 * Run the projections example (merges the former `basic-config` and
 * `planar-map` examples).
 *
 * `MapView.projection` has a first-class runtime setter: it clears the tile
 * cache, re-derives the world bounds and keeps tilt/heading, so the three
 * projections are switched in place - no view re-initialization is needed.
 * World units differ between projections (globe radius vs. flat plane), so
 * the example re-applies its stored zoom level after every switch.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const handle = await createExampleMap(canvas, {
        themeObject,
        projection: "globe",
        enableShadows: true,
        controlsUi: "compact",
        lookAt: { target: { lat: 36.4393, lng: 118.188 }, zoomLevel: 12, tilt: 45 }
    });
    const { mapView } = handle;
    logExampleInfo("getting-started-projections", mapView);

    // Same ground data in every projection: local DEM terrain plus imagery
    // with a debug-grid fallback for offline runs.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    // Camera framing kept stable across projection switches.
    const target = new GeoCoordinates(36.4393, 118.188, 420);
    const zoomLevel = 12;
    addReferenceBox(handle, target);

    const statusPanel = createStatusPanel();
    let current = "Globe (ellipsoid)";

    const applyProjection = (name: string): void => {
        const projection = PROJECTIONS[name];
        if (projection === undefined) {
            return;
        }
        // Runtime switch: the setter rebuilds the tile set for the new
        // projection; re-assert the camera framing because the zoom-level
        // derivation changes between globe and planar projections.
        mapView.projection = projection;
        mapView.lookAt({ target, zoomLevel, tilt: 45 });
        mapView.update();
        current = name;
        statusPanel.textContent =
            `projection: ${name}\n` +
            `ProjectionType: ${mapView.projection.type === 1 ? "Spherical" : "Planar"}`;
    };

    const gui = new GUI({ width: 300 });
    gui.add({ projection: current }, "projection", Object.keys(PROJECTIONS))
        .name("Projection")
        .onChange(applyProjection);

    applyProjection(current);
}

main().catch(err => console.error("getting-started-projections failed:", err));
