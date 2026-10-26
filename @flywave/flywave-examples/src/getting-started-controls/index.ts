/* Copyright (C) 2025 flywave.gl contributors */

import { MapThumbnailGenerator, MapView } from "@flywave/flywave.gl";
import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";
import type { GUI } from "dat.gui";

/**
 * Capture the current map canvas as a PNG download, mirroring what the
 * built-in screenshot button does: temporarily resize the view to the target
 * resolution, render synchronously, then restore the original size.
 */
function downloadScreenshot(mapView: MapView, width: number, height: number): void {
    const canvas = mapView.canvas;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    mapView.resize(width, height);
    mapView.renderSync();
    const dataUrl = canvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `flywave-screenshot-${width}x${height}.png`;
    link.click();

    mapView.resize(originalWidth, originalHeight);
    mapView.renderSync();
}

/**
 * Small legend describing what the full controls overlay provides.
 */
function addLegend(): void {
    const legend = document.createElement("div");
    legend.textContent =
        "MapControlsUI (full): zoom input + screenshot button (top right).\n" +
        "Drag to pan, right-drag to rotate, wheel to zoom, double-click to zoom in.";
    legend.style.cssText =
        "position:absolute;left:12px;bottom:12px;padding:8px 12px;" +
        "font:12px/1.5 sans-serif;color:#e8eaed;white-space:pre;";
    applyPanelStyle(legend);
    document.body.appendChild(legend);
}

/**
 * MapControls showcase: the full controls overlay (zoom input, screenshot
 * button), a dat.GUI for the interaction switches exposed by MapControls
 * (zoom/tilt enable, max tilt, smooth pan, pivot indicator, heading/tilt/zoom
 * actions) and the MapThumbnailGenerator panel.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    // controlsUi: "full" enables the zoom-level input, the screenshot button
    // and the geo-center display. Use "compact" or "none" to trim it down.
    const handle = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "full",
        lookAt: { target: { lat: 36.6512, lng: 117.12 }, zoomLevel: 13, tilt: 40 }
    });
    const { mapView, controls } = handle;
    if (controls === undefined) {
        throw new Error("MapControls are required for this example");
    }
    logExampleInfo("getting-started-controls", mapView);

    // DEM terrain (local tiles + ArcGIS elevation) and imagery with a
    // debug-grid fallback give the controls something to interact with.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);
    mapView.update();

    // Thumbnail generator: its panel offers several preset sizes and a
    // custom size input, then downloads the rendered PNG.
    const thumbnailGenerator = new MapThumbnailGenerator(mapView);

    const gui: GUI = createExampleGui();

    // Interaction switches, straight off the MapControls option surface.
    const interaction = {
        enabled: controls.enabled,
        zoomEnabled: controls.zoomEnabled,
        tiltEnabled: controls.tiltEnabled,
        maxTiltAngle: Math.round(controls.maxTiltAngle),
        smoothPan: controls.smoothPan,
        pivotIndicator: controls.pivotIndicator?.enabled ?? false
    };

    const interactionFolder = gui.addFolder("Interaction");
    interactionFolder
        .add(interaction, "enabled")
        .name("Controls enabled")
        .onChange(value => (controls.enabled = value));
    interactionFolder
        .add(interaction, "zoomEnabled")
        .name("Zoom (wheel/dbl-click)")
        .onChange(value => (controls.zoomEnabled = value));
    interactionFolder
        .add(interaction, "tiltEnabled")
        .name("Tilt gesture")
        .onChange(value => (controls.tiltEnabled = value));
    interactionFolder
        .add(interaction, "maxTiltAngle", 0, 89, 1)
        .name("Max tilt (deg)")
        .onChange(value => (controls.maxTiltAngle = value));
    interactionFolder
        .add(interaction, "smoothPan")
        .name("Smooth pan")
        .onChange(value => (controls.smoothPan = value));
    interactionFolder
        .add(interaction, "pivotIndicator")
        .name("Pivot indicator")
        .onChange(value => {
            if (controls.pivotIndicator !== undefined) {
                controls.pivotIndicator.enabled = value;
            }
        });

    // Direct camera actions provided by MapControls.
    const actions = { heading: mapView.heading, tilt: mapView.tilt, nudgeZoom: () => {} };
    const actionsFolder = gui.addFolder("Camera actions");
    actionsFolder
        .add(actions, "heading", 0, 360, 1)
        .name("Set heading")
        .onChange(value => controls.setHeading(value));
    actionsFolder
        .add(actions, "tilt", 0, 89, 1)
        .name("Set tilt")
        .onChange(value => controls.setTilt(value));
    actions.nudgeZoom = () => controls.animateZoom(1);
    actionsFolder.add(actions, "nudgeZoom").name("Animated zoom nudge");

    // Capture: one-click via the built-in button, programmatic download and
    // the thumbnail generator panel.
    const captureFolder = gui.addFolder("Screenshot & thumbnails");
    const capture = {
        screenshot: () => downloadScreenshot(mapView, 512, 512),
        thumbnailPanel: () => thumbnailGenerator.toggle()
    };
    captureFolder.add(capture, "screenshot").name("Download screenshot 512px");
    captureFolder.add(capture, "thumbnailPanel").name("Toggle thumbnail panel");

    addLegend();
}

main().catch(err => console.error("getting-started-controls failed:", err));
