/* Copyright (C) 2025 flywave.gl contributors */

import {
    GeoCoordinates,
    PickObjectType,
    type MapView,
    type PickResult
} from "@flywave/flywave.gl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
 * CPU vs GPU picking lab (merged teaching core of the former gpu-depth-picking
 * and gpu-pick-test examples).
 *
 * Engine contract (flywave-dev iron rules 1 and 7, verified against
 * `@flywave/flywave-mapview/src/PickHandler.ts` and `IntersectParams.ts`):
 *
 * - GPU picking reads the pick buffer of the PREVIOUS rendered frame. After a
 *   camera move the buffer is stale: point/distance stay self-consistent, but
 *   the LAZY detail fields (`intersection`, `userData`, `featureId`,
 *   `technique`) resolve through a deferred raycast against the frozen pick
 *   ray and may come back `undefined` (e.g. the picked object was unloaded
 *   meanwhile). Reading any of them runs that raycast exactly once.
 * - `useGpuPick: "auto"` (default): O(1) GPU depth read first, automatic CPU
 *   raycast on miss. `useGpuPick: true`: GPU only — a miss returns `[]` and
 *   NEVER falls back to CPU. `useGpuPick: false`: CPU raycast with full face
 *   details (UV, face normal).
 * - The engine uses a REVERSED depth buffer: the clear value is 0 and
 *   geometry approaches 1, so any manual "is there geometry" compare on a
 *   depth readback must test `depth > 0` (an inverted test fails silently).
 * - Persistent objects must live on `mapView.mapAnchors`: the scene root is
 *   cleared and rebuilt every rendered frame.
 */

/** Demo site: inside the local `resources/dem_terrain` coverage (Shandong). */
const SITE = { lat: 36.4862, lng: 118.1727, alt: 500 };

/** Light emissive tint applied to the hovered model. */
const HIGHLIGHT_EMISSIVE = 0x24425c;

/** Materials that expose an `emissive` color (node materials and glTF PBR). */
type EmissiveMaterial = THREE.MeshStandardMaterial | THREE.MeshStandardNodeMaterial;

/** A demo model registered on `mapView.mapAnchors`. */
interface ModelEntry {
    root: THREE.Group;
    name: string;
}

/** Counters and last-values surfaced in the stats HUD. */
interface PickStats {
    mode: "auto" | "gpu" | "cpu";
    gpuEnabled: boolean;
    hits: number;
    misses: number;
    /** GPU-only misses where a CPU retry would have hit (why "auto" exists). */
    cpuRecoveries: number;
    /** Deferred detail raycasts triggered by reading lazy PickResult fields. */
    lazyReads: number;
    lastMs: string;
    hovered: string;
}

/** Materials changed by the current highlight, with their original colors. */
let highlightChanges: Array<{ material: EmissiveMaterial; original: THREE.Color }> = [];
let highlightedRoot: THREE.Group | null = null;

/** Run one `intersectMapObjects` query with the given strategy, timed. */
function pickOnce(
    mapView: MapView,
    x: number,
    y: number,
    mode: PickStats["mode"]
): { results: PickResult[]; ms: number } {
    const start = performance.now();
    // IntersectParams.useGpuPick accepts `boolean | "auto"`; map the GUI
    // tri-state onto it ("gpu" forces the GPU path, "cpu" the raycast path).
    const useGpuPick = mode === "gpu" ? true : mode === "cpu" ? false : "auto";
    const results = mapView.intersectMapObjects(x, y, { useGpuPick });
    return { results, ms: performance.now() - start };
}

/** Walk up the parents of a picked object to find the registered model root. */
function findModelEntry(models: ModelEntry[], object: THREE.Object3D): ModelEntry | undefined {
    let current: THREE.Object3D | null = object;
    while (current !== null) {
        const entry = models.find(candidate => candidate.root === current);
        if (entry !== undefined) {
            return entry;
        }
        current = current.parent;
    }
    return undefined;
}

/** Restore the previous highlight and (optionally) tint the given model. */
function setHighlight(mapView: MapView, entry: ModelEntry | undefined): void {
    for (const change of highlightChanges) {
        change.material.emissive.copy(change.original);
    }
    highlightChanges = [];
    highlightedRoot = null;
    if (entry !== undefined) {
        entry.root.traverse(node => {
            const mesh = node as THREE.Mesh;
            if (!mesh.isMesh) {
                return;
            }
            const material = mesh.material as EmissiveMaterial;
            if (material?.emissive !== undefined) {
                highlightChanges.push({ material, original: material.emissive.clone() });
                material.emissive.setHex(HIGHLIGHT_EMISSIVE);
            }
        });
        highlightedRoot = entry.root;
    }
    // Visual state changed: the render loop is on-demand, request a repaint.
    mapView.update();
}

/** Place a procedural box on the terrain, anchored at {@link SITE}. */
function addBoxModel(mapView: MapView, models: ModelEntry[], index: number): void {
    const height = 40 + Math.random() * 80;
    const geometry = new THREE.BoxGeometry(24 + Math.random() * 20, height, 24 + Math.random() * 20);
    const material = new THREE.MeshStandardNodeMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
        roughness: 0.6,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((Math.random() - 0.5) * 140, height / 2, (Math.random() - 0.5) * 140);

    const root = new THREE.Group();
    root.name = `Building-${index}`;
    root.add(mesh);
    // Anchoring: the group's `anchor` pins it to a geo position; MapAnchors
    // repositions it every frame (world position minus camera position).
    root.anchor = new GeoCoordinates(SITE.lat, SITE.lng, SITE.alt);
    mapView.mapAnchors.add(root);
    models.push({ root, name: root.name });
}

/** Load the shared `Xbot.glb` sample model as a pickable map anchor. */
function addGltfModel(mapView: MapView, models: ModelEntry[]): void {
    new GLTFLoader().load(
        "Xbot.glb",
        gltf => {
            const model = gltf.scene;
            model.scale.setScalar(30);
            model.position.set(60, 0, 40);
            const root = new THREE.Group();
            root.name = "GLTF-Xbot";
            root.add(model);
            root.anchor = new GeoCoordinates(SITE.lat, SITE.lng, SITE.alt);
            mapView.mapAnchors.add(root);
            models.push({ root, name: root.name });
            mapView.update();
        },
        undefined,
        err => console.error("interaction-picking: glTF load failed:", err)
    );
}

/** Build the stats HUD panel (plain light-on-dark panel, no terminal look). */
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
        minWidth: "230px"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

/** Render the current {@link PickStats} into the HUD panel. */
function updateHud(hud: HTMLElement, stats: PickStats): void {
    const rows: Array<[string, string]> = [
        ["useGpuPick", stats.mode],
        ["enableGpuPicking", String(stats.gpuEnabled)],
        ["hits", String(stats.hits)],
        ["misses", String(stats.misses)],
        ["cpu recoveries", String(stats.cpuRecoveries)],
        ["lazy detail reads", String(stats.lazyReads)],
        ["last pick", `${stats.lastMs} ms`],
        ["hovered", stats.hovered]
    ];
    hud.innerHTML =
        `<b>Pick stats</b><br>` +
        rows.map(([key, value]) => `${key}: ${value}`).join("<br>") +
        `<br><i>click for point / distance / feature</i>`;
}

/** Wire hover highlight + click info window, both driven by `pickOnce`. */
function setupPicking(
    mapView: MapView,
    canvas: HTMLCanvasElement,
    models: ModelEntry[],
    stats: PickStats,
    hud: HTMLElement,
    infoWindow: InfoWindow
): void {
    let lastHoverAt = 0;

    canvas.addEventListener("mousemove", e => {
        // Throttle: GPU cost is O(1), but lazy detail reads raycast.
        const now = performance.now();
        if (now - lastHoverAt < 40) {
            return;
        }
        lastHoverAt = now;

        const { results, ms } = pickOnce(mapView, e.layerX, e.layerY, stats.mode);
        stats.lastMs = ms.toFixed(2);
        if (results.length === 0) {
            stats.misses++;
            stats.hovered = "-";
            setHighlight(mapView, undefined);
            updateHud(hud, stats);
            return;
        }
        stats.hits++;
        // Lazy contract in action: reading `.intersection` triggers the one
        // deferred raycast; it may be undefined after a camera move.
        stats.lazyReads++;
        const intersection = results[0].intersection;
        const entry =
            intersection !== undefined ? findModelEntry(models, intersection.object) : undefined;
        stats.hovered = entry?.name ?? "-";
        setHighlight(mapView, entry);
        updateHud(hud, stats);
    });

    canvas.addEventListener("click", e => {
        const { results } = pickOnce(mapView, e.layerX, e.layerY, stats.mode);
        if (results.length === 0) {
            stats.misses++;
            // With `useGpuPick: true` a miss never falls back to CPU. Probe
            // the CPU path once to show what "auto" would have recovered.
            if (stats.mode === "gpu" && mapView.intersectMapObjects(e.layerX, e.layerY, { useGpuPick: false }).length > 0) {
                stats.cpuRecoveries++;
            }
            infoWindow.hide();
            updateHud(hud, stats);
            return;
        }
        stats.hits++;
        stats.lazyReads++;

        const result = results[0];
        // PickResult.point is a geo-frame world point for 3D hits (both paths
        // translate render-space hits back, see iron rule 1).
        const geo = mapView.projection.unprojectPoint(result.point as THREE.Vector3);
        const featureId = result.featureId; // lazy: may be undefined, see above
        const typeName = PickObjectType[result.type] ?? String(result.type);
        infoWindow.show(
            geo,
            `<b>${typeName}</b><br>` +
                `distance: ${result.distance.toFixed(1)} m<br>` +
                `source: ${result.dataSourceName ?? "-"}<br>` +
                `featureId: ${featureId ?? "-"}<br>` +
                `lat/lng: ${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`
        );

        const intersection = result.intersection;
        setHighlight(
            mapView,
            intersection !== undefined ? findModelEntry(models, intersection.object) : undefined
        );
        updateHud(hud, stats);
    });
}

/** Picking lab: CPU/GPU strategies, hover highlight and click inspection. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng, alt: SITE.alt }, tilt: 52, zoomLevel: 15.2 }
    });

    // Local DEM terrain, draped with Esri imagery; the standalone imagery
    // layer degrades to a debug grid when the tile server is unreachable.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    const models: ModelEntry[] = [];
    for (let i = 1; i <= 3; i++) {
        addBoxModel(mapView, models, i);
    }
    addGltfModel(mapView, models);

    const stats: PickStats = {
        mode: "auto",
        gpuEnabled: true,
        hits: 0,
        misses: 0,
        cpuRecoveries: 0,
        lazyReads: 0,
        lastMs: "-",
        hovered: "-"
    };

    const gui = createExampleGui();
    const pickFolder = gui.addFolder("Picking strategy");
    pickFolder
        .add(stats, "mode", { auto: "auto", "GPU only": "gpu", "CPU only": "cpu" })
        .name("useGpuPick");
    pickFolder
        .add(stats, "gpuEnabled")
        .name("enableGpuPicking")
        .onChange((value: boolean) => {
            // Runtime master switch: forwards to the view render manager.
            mapView.mapRenderingManager.gpuPicking = value;
            mapView.update();
        });
    pickFolder.open();

    const modelsFolder = gui.addFolder("Demo models");
    const handlers = {
        addBox: () => {
            addBoxModel(mapView, models, models.length + 1);
            mapView.update();
        },
        addGltf: () => addGltfModel(mapView, models),
        clear: () => {
            for (const model of models) {
                mapView.mapAnchors.remove(model.root);
            }
            models.length = 0;
            setHighlight(mapView, undefined);
        }
    };
    modelsFolder.add(handlers, "addBox").name("Add box");
    modelsFolder.add(handlers, "addGltf").name("Add glTF");
    modelsFolder.add(handlers, "clear").name("Clear all");
    modelsFolder.open();

    const hud = createHud();
    const infoWindow = new InfoWindow(mapView);
    setupPicking(mapView, canvas, models, stats, hud, infoWindow);
    updateHud(hud, stats);

    mapView.update();
    logExampleInfo("interaction-picking", mapView);
}

main().catch(err => console.error("interaction-picking failed:", err));
