import { shouldForceWebGL } from "../common-webgl-debug";
import {
    MapView,
    GeoCoordinates,
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapControlsUI,
    sphereProjection
} from "@flywave/flywave.gl";
import { BoxGeometry, MeshStandardNodeMaterial, Mesh, Group } from "three/webgpu";
import { NodeBuilder } from "three/webgpu";

// TODO(debug): temporary shader build/compile counters, remove after debug.
// graphBuilds = NodeBuilder.build() calls (node graph recompute, one per
// NodeBuilderState cache miss); compiles = backend.createProgram calls (WGSL
// stage compiled to a GPU module); pipelines = backend.createRenderPipeline.
const fwStats: any = ((window as any).__fwStats = {
    graphBuilds: 0,
    compiles: 0,
    pipelines: 0,
    byMaterial: {}
});
{
    const proto: any = (NodeBuilder as any).prototype;
    const origBuild = proto.build;
    proto.build = function (...args: unknown[]) {
        fwStats.graphBuilds++;
        const key =
            (this.material && this.material.constructor && this.material.constructor.name) ||
            "unknown";
        fwStats.byMaterial[key] = (fwStats.byMaterial[key] || 0) + 1;
        return origBuild.apply(this, args);
    };
}

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            "Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML"
        );
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Set initial map position and viewpoint (eastern China region)
    const initialLocation = new GeoCoordinates(36.4393, 118.188);

    return new MapView({
        forceWebGL: shouldForceWebGL(),
        projection: sphereProjection, // Use spherical projection
        target: initialLocation, // Initial target position
        zoomLevel: 19, // Initial zoom level
        tilt: 45, // Initial tilt angle
        heading: 1.5413763202653008, // Initial heading angle
        canvas: canvas, // Specify render canvas
        theme: {
            // extends: "resources/tilezen_base_globe.json", // Bas÷e theme configuration
            atmosphere: {
                enabled: true,
                clouds: false,
                sunTime: new Date().setHours(18),
                sunCastShadow: true
            }
        }
    });
};

/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls, {
        screenshotButton: {
            width: 512, // Screenshot width
            height: 512 // Screenshot height
        }
    });
    canvas.parentElement!.appendChild(ui.domElement);
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json" // DEM terrain data source path
    });

    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );
};

// ==================== Main execution flow ====================

// TODO(debug): intermittent-imagery probe — rolling evidence buffers, remove
// after debug. Watches, per drawn tile: which texture the shared imagery node
// carried at node-update time vs. which texture the render object's binding
// actually held at binding-update time. A mismatch is the smoking gun for
// update/binding ordering or bind-group cache bugs. Also traps JS errors,
// WebGPU uncaptured (validation) errors, and render-loop freezes.
{
    const w = window as any;
    w.__probe = {
        errors: [] as string[],
        nodeUpdates: [] as string[],
        mismatches: [] as string[],
        freezes: [] as string[],
        lastFrame: -1,
        checked: 0,
        imageryNode: null as any
    };
    const P = w.__probe;
    const cap = (arr: string[], line: string) => {
        arr.push(line);
        if (arr.length > 80) arr.splice(0, arr.length - 80);
    };
    window.addEventListener("error", e =>
        cap(P.errors, "ERR: " + (e.message || e.type) + " @" + (e.lineno || ""))
    );
    window.addEventListener("unhandledrejection", e =>
        cap(P.errors, "REJ: " + String((e as PromiseRejectionEvent).reason).slice(0, 160))
    );
    const arm = () => {
        const mv = w.__mapView;
        if (!mv || !mv.renderer || !mv.renderer._bindings) {
            setTimeout(arm, 300);
            return;
        }
        const r = mv.renderer;
        const dev = r.backend && r.backend.device;
        if (dev && dev.addEventListener) {
            dev.addEventListener("uncapturederror", (e: any) =>
                cap(
                    P.errors,
                    "GPU: " + ((e.error && e.error.message) || String(e.error)).slice(0, 160)
                )
            );
        }
        const bindings = r._bindings;
        const origUFR = bindings.updateForRender.bind(bindings);
        // per-render-object last seen bound texture, for persistent-poison detection
        const roLast: Map<number, { bound: string; frames: number }> = new Map();
        bindings.updateForRender = (renderObject: any) => {
            const out = origUFR(renderObject);
            try {
                const obj = renderObject.object;
                if (
                    obj &&
                    obj.isMesh &&
                    obj.material &&
                    obj.material.constructor.name === "DEMTileBaseMaterial"
                ) {
                    let node = P.imageryNode;
                    if (!node) {
                        for (const bg of renderObject.getBindings()) {
                            for (const b of bg.bindings) {
                                if (
                                    b.isSampledTexture &&
                                    b.textureNode &&
                                    b.textureNode.isTextureNode &&
                                    !b.textureNode.referenceNode &&
                                    b.textureNode.updateType === "object"
                                ) {
                                    node = b.textureNode;
                                    P.imageryNode = node;
                                }
                            }
                        }
                    }
                    // AFTER updateForRender: the binding must carry this tile's
                    // own texture whenever the tile has imagery.
                    if (node && obj.hasImagery === 1 && obj.layerTexture) {
                        P.checked++;
                        const expect = obj.layerTexture.uuid.slice(0, 8);
                        let bound = "unknown";
                        for (const bg of renderObject.getBindings()) {
                            for (const b of bg.bindings) {
                                if (b.isSampledTexture && b.textureNode === node) {
                                    bound = b.texture
                                        ? b.texture.image && b.texture.image.width === 1
                                            ? "DUMMY"
                                            : b.texture.uuid.slice(0, 8)
                                        : "none";
                                }
                            }
                        }
                        if (bound !== expect) {
                            const last = roLast.get(renderObject.id);
                            const framesWrong = last && last.bound === bound ? last.frames + 1 : 1;
                            roLast.set(renderObject.id, { bound, frames: framesWrong });
                            if (framesWrong >= 2) {
                                const tileKey = obj.userData && obj.userData.tileKey;
                                const keyStr =
                                    tileKey && typeof tileKey === "object"
                                        ? JSON.stringify(tileKey).slice(0, 60)
                                        : String(tileKey);
                                cap(
                                    P.mismatches,
                                    `PERSIST frame:${r.info.frame} ro:${renderObject.id} tile:${keyStr} ` +
                                        `expect:${expect} bound:${bound} wrongFrames:${framesWrong}`
                                );
                            }
                        } else {
                            roLast.delete(renderObject.id);
                        }
                    }
                }
            } catch (e) {
                cap(P.errors, "PROBE: " + String((e as Error).message).slice(0, 120));
            }
            return out;
        };
        // freeze detector: page visible but frame counter stuck > 3s
        setInterval(() => {
            const f = r.info.frame;
            if (document.visibilityState === "visible" && P.lastFrame === f && f >= 0) {
                cap(P.freezes, "stuck at frame " + f + " @ " + new Date().toISOString());
            }
            P.lastFrame = f;
        }, 3000);
        P.armed = true;
    };
    arm();
}

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();

    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    (window as unknown as { __mapView: typeof mapView }).__mapView = mapView;

    // TODO(debug): count GPU-side compiles/pipeline creations, remove after debug
    const backend: any = (mapView as any).renderer.backend;
    const origCreateProgram = backend.createProgram.bind(backend);
    backend.createProgram = (...args: unknown[]) => {
        fwStats.compiles++;
        return origCreateProgram(...args);
    };
    const origCreateRenderPipeline = backend.createRenderPipeline.bind(backend);
    backend.createRenderPipeline = (...args: unknown[]) => {
        fwStats.pipelines++;
        return origCreateRenderPipeline(...args);
    };

    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);

    // 4. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);

    console.log("Basic configuration getting started example initialized successfully");

    // Add a test box near the camera
    const boxGroup = new Group();
    const box = new Mesh(
        new BoxGeometry(5, 5, 5),
        new MeshStandardNodeMaterial({ color: 0xff6b6b })
    );
    box.castShadow = true;
    box.receiveShadow = true;
    boxGroup.add(box);
    const boxCoords = new GeoCoordinates(36.4393, 118.188, 420);
    // @ts-ignore
    boxGroup.anchor = boxCoords;
    mapView.mapAnchors.add(boxGroup);
} catch (error) {
    console.error(
        "Error occurred while initializing basic configuration getting started example:",
        error
    );
}
