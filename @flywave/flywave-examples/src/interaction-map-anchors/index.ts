/* Copyright (C) 2025 flywave.gl contributors */

import {
    GeoCoordinates,
    type MapAnchor,
    type MapView
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    InfoWindow,
    logExampleInfo
} from "../common";

/**
 * MapAnchor fundamentals: persistent objects on the map.
 *
 * Iron rule (flywave-dev rule 2): NEVER add persistent objects to the scene
 * root. `MapView.render()` clears `m_sceneRoot.children` on EVERY frame and
 * re-parents the visible tile objects; worse, the scene is rendered by the
 * relative-to-eye (RTE) camera sitting at the origin, so an object placed at a
 * raw geo world position would float an earth-radius away. `MapAnchor`
 * solves both: `mapView.mapAnchors.add(object)` registers the object and
 * `MapAnchors.update()` re-positions it every frame as
 * `projectPoint(anchor) - cameraPosition` before re-parenting it.
 *
 * Anchors also carry flags: `anchor` (GeoCoordinates or world Vector3),
 * `pickable` (default true), and `overlay` — overlay anchors are re-parented
 * into the overlay root of `mapView.overlayScene` and rendered in a SECOND
 * pass after labels/text, so they draw on top of everything.
 */

/** Demo site: inside the local `resources/dem_terrain` coverage (Shandong). */
const SITE = { lat: 36.4862, lng: 118.1727 };

/** Bookkeeping for one placed marker. */
interface MarkerInfo {
    root: MapAnchor;
    name: string;
    geo: GeoCoordinates;
    overlay: boolean;
    createdAt: string;
}

const markers: MarkerInfo[] = [];
let markerSeq = 0;
/** When true, the next placed marker uses the overlay pass. */
let nextMarkerIsOverlay = false;

/** Build a cone marker group anchored at `geo` and register it. */
function createMarker(mapView: MapView, geo: GeoCoordinates, overlay: boolean): MarkerInfo {
    const cone = new THREE.Mesh(
        new THREE.ConeGeometry(8, 24, 16),
        new THREE.MeshStandardNodeMaterial({
            color: overlay ? 0x33ccff : 0xff5533,
            roughness: 0.5,
            metalness: 0.1
        })
    );
    cone.position.y = 12; // base on the surface, apex pointing up

    const root: MapAnchor = new THREE.Group();
    root.name = `Marker-${++markerSeq}`;
    root.add(cone);
    root.anchor = geo; // re-projected every frame by MapAnchors.update()
    root.pickable = true; // default, made explicit for teaching
    if (overlay) {
        // Rendered via mapView.overlayScene in a second pass, above labels.
        root.overlay = true;
    }
    mapView.mapAnchors.add(root);

    const info: MarkerInfo = {
        root,
        name: root.name,
        geo,
        overlay,
        createdAt: new Date().toLocaleTimeString()
    };
    markers.push(info);
    return info;
}

/** Remove one marker: unregister the anchor and dispose its GPU resources. */
function removeMarker(mapView: MapView, info: MarkerInfo): void {
    mapView.mapAnchors.remove(info.root);
    info.root.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
            return;
        }
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) {
            material.forEach(entry => entry.dispose());
        } else {
            material.dispose();
        }
    });
    markers.splice(markers.indexOf(info), 1);
}

/** True when `object` (or one of its parents) is the given marker root. */
function isMarkerChild(root: THREE.Object3D, object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current !== null) {
        if (current === root) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/** Marker inventory HUD: demonstrates traversing `mapAnchors.children`. */
function createHud(): HTMLDivElement {
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
        minWidth: "220px"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

/** Refresh the HUD from the live `mapAnchors` container. */
function updateHud(hud: HTMLElement, mapView: MapView): void {
    const names = mapView.mapAnchors.children.map(anchor => anchor.name ?? "(unnamed)");
    hud.innerHTML =
        "<b>mapAnchors</b><br>" +
        `count: ${names.length}<br>` +
        (names.length > 0 ? names.join("<br>") : "click the map to place a marker") +
        "<br><i>blue = overlay pass marker</i>";
}

/** Map anchors demo: place, pick, inspect, remove and traverse markers. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng }, zoomLevel: 14.5, tilt: 45 }
    });

    // Offline-friendly scene: local DEM terrain with satellite imagery
    // draped INTO the terrain tiles (an independent imagery layer would be
    // coplanar with the draped surface and depth-fight).
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    const infoWindow = new InfoWindow(mapView);
    const hud = createHud();

    canvas.addEventListener("click", e => {
        // 1) Picking first: markers registered with pickable:true respond to
        // intersectMapObjects like any other map object.
        const results = mapView.intersectMapObjects(e.layerX, e.layerY);
        if (results.length > 0) {
            const intersection = results[0].intersection;
            const info =
                intersection !== undefined
                    ? markers.find(candidate => isMarkerChild(candidate.root, intersection.object))
                    : undefined;
            if (info !== undefined) {
                infoWindow.show(
                    info.geo,
                    `<b>${info.name}</b><br>` +
                        `overlay pass: ${info.overlay ? "yes" : "no"}<br>` +
                        `placed at: ${info.createdAt}<br>` +
                        `lat/lng: ${info.geo.latitude.toFixed(5)}, ${info.geo.longitude.toFixed(5)}`
                );
                return;
            }
        }

        // 2) No marker hit: place a new one at the surface point under the
        // cursor (GPU depth / math-surface fallback handled internally).
        const worldPos = mapView.getWorldPositionAt(e.layerX, e.layerY);
        if (worldPos === null) {
            infoWindow.hide();
            return;
        }
        const geo = mapView.projection.unprojectPoint(worldPos);
        const info = createMarker(mapView, geo, nextMarkerIsOverlay);
        infoWindow.show(
            geo,
            `<b>${info.name}</b> placed<br>overlay pass: ${info.overlay ? "yes" : "no"}`
        );
        updateHud(hud, mapView);
        mapView.update();
    });

    const gui = createExampleGui();
    const markerFolder = gui.addFolder("Markers");
    markerFolder.add({ overlay: nextMarkerIsOverlay }, "overlay").name("next marker: overlay").onChange(
        (value: boolean) => {
            nextMarkerIsOverlay = value;
        }
    );
    markerFolder
        .add(
            {
                removeLast: () => {
                    const last = markers[markers.length - 1];
                    if (last !== undefined) {
                        infoWindow.hide();
                        removeMarker(mapView, last);
                        updateHud(hud, mapView);
                        mapView.update();
                    }
                }
            },
            "removeLast"
        )
        .name("Remove last");
    markerFolder
        .add(
            {
                clearAll: () => {
                    infoWindow.hide();
                    // Bulk removal: MapAnchors.clear() is faster than
                    // repeated remove() calls; dispose markers separately.
                    while (markers.length > 0) {
                        removeMarker(mapView, markers[markers.length - 1]);
                    }
                    updateHud(hud, mapView);
                    mapView.update();
                }
            },
            "clearAll"
        )
        .name("Clear all");
    markerFolder.open();

    updateHud(hud, mapView);
    mapView.update();
    logExampleInfo("interaction-map-anchors", mapView);
}

main().catch(err => console.error("interaction-map-anchors failed:", err));
