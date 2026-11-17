/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    CesiumWorldTerrainSource,
    LoggerManager
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-quantized-mesh");

/**
 * Initial camera pose: the Colorado Front Range near Denver, the classic
 * Cesium World Terrain showcase area (same viewpoint as the legacy example).
 */
const LOOK_AT = {
    target: { lat: 39.70916427453653, lng: -105.21065191908919, alt: 2270.6937844809145 },
    tilt: 56.60060867291795,
    heading: -125.79565303507096
};

/** Cesium Ion asset id of the world terrain aggregation. */
const CESIUM_WORLD_TERRAIN_ASSET_ID = 1;

/**
 * Show the bilingual "token missing" card and abort before any map setup.
 *
 * The card explains how to provide the token, mirroring the chain that
 * {@link checkIonToken} consults: the `CESIUM_ION_TOKEN` environment variable
 * (baked in at build time by the examples webpack config) or the
 * `window.CESIUM_ION_TOKEN` runtime global.
 */
function showTokenCard(): void {
    const card = document.createElement("div");
    card.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
        "max-width:460px;padding:20px 24px;color:#eee;font:13px/1.7 sans-serif;" +
        "white-space:pre-line";
    applyPanelStyle(card, { background: "rgba(60, 32, 20, 0.92)" });
    card.textContent =
        "Cesium Ion access token required\n\n" +
        "This example streams Cesium World Terrain (quantized-mesh) from Cesium Ion.\n" +
        "1. Get a token at https://ion.cesium.com/tokens\n" +
        "2. Set process.env.CESIUM_ION_TOKEN before the build, or\n" +
        "   window.CESIUM_ION_TOKEN at runtime, then reload.";
    document.body.appendChild(card);
}

/**
 * Wire Cesium World Terrain as the elevation source and drape satellite
 * imagery on top of it.
 *
 * @param mapView - The ready map view.
 * @param accessToken - Cesium Ion access token (pre-checked by the caller).
 * @returns The connected Cesium World Terrain source.
 */
async function connectTerrain(
    mapView: MapView,
    accessToken: string
): Promise<CesiumWorldTerrainSource> {
    const terrain = new CesiumWorldTerrainSource({
        accessToken,
        assetId: CESIUM_WORLD_TERRAIN_ASSET_ID
    });
    await mapView.setElevationSource(terrain);
    // Satellite imagery provider baked into the terrain source's material
    // pipeline, so every terrain mesh is textured as it streams in.
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
    return terrain;
}

/**
 * Build a minimal info panel describing the streaming terrain (teaching
 * context only; the legacy example's frustum-culling debug GUI belongs to
 * internal tooling and is intentionally not reproduced here).
 *
 * @param terrain - The connected Cesium World Terrain source.
 */
function buildInfoPanel(terrain: CesiumWorldTerrainSource): void {
    const gui = createExampleGui();
    const folder = gui.addFolder("Cesium World Terrain");
    // dat.GUI 0.7 has no controller.disable(); read-only display via listen().
    folder.add({ assetId: terrain.assetId }, "assetId").name("Ion asset id").listen();
    folder
        .add({ format: "quantized-mesh (atmosphere + clouds on)" }, "format")
        .name("Format")
        .listen();
    folder.open();
}

/**
 * Example entry point: token gate -> map -> terrain -> info panel.
 */
async function main(): Promise<void> {
    // Front door: never construct the map without a token - Ion requests
    // would all fail with 401 and the user would only see a blank globe.
    const accessToken = checkIonToken();
    if (accessToken === undefined) {
        showTokenCard();
        return;
    }

    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: LOOK_AT,
        // Pin the sun to late-morning over the US West so longitudes from
        // roughly Japan to the Rocky Mountains stay in daylight while flying
        // around (a real-time sun leaves night-side jumps pitch black).
        themeObject: {
            atmosphere: {
                // Volumetric clouds envelope the camera at terrain altitudes
                // and hide the terrain — keep them off for this example.
                clouds: false,
                enabled: true,
                sunTime: new Date().setUTCHours(19, 30, 0, 0)
            }
        },
        onReady: view => logExampleInfo("terrain-quantized-mesh", view)
    });

    const terrain = await connectTerrain(handle.mapView, accessToken);
    buildInfoPanel(terrain);

    // ---- WebGPU compile/memory probe ----
    // The historical terrain stutter root cause (DEM/3d-tiles sessions) was
    // per-instance material keys → NodeMaterial graph rebuild → new WGSL →
    // pipeline cache MISS. The exact signal is WebGPU's own
    // createShaderModule (one call == one WGSL compile) and
    // createRenderPipeline (one == one pipeline build): patch the native API
    // and count. A static camera must produce ZERO new compiles; bursts only
    // on first-seen level/morph variants.
    const gpuProbe = {
        shaderModules: 0,
        renderPipelines: 0,
        computePipelines: 0,
        bursts: [] as Array<{ t: number; kind: string; delta: number }>,
        marks: [] as Array<Record<string, number>>,
        report() {
            const info = (window as any).__flywave?.mapView?.renderer?.info;
            return {
                shaderModules: this.shaderModules,
                renderPipelines: this.renderPipelines,
                computePipelines: this.computePipelines,
                bursts: this.bursts.slice(-10),
                marks: this.marks.slice(-20),
                gpuMemory: info
                    ? { geometries: info.memory?.geometries, textures: info.memory?.textures }
                    : null,
                drawCalls: info?.render?.drawCalls
            };
        }
    };
    (window as unknown as Record<string, unknown>).__gpuProbe = gpuProbe;
    type GPUDeviceCtor = {
        prototype: {
            createShaderModule: (...args: unknown[]) => unknown;
            createRenderPipeline: (...args: unknown[]) => unknown;
            createComputePipeline: (...args: unknown[]) => unknown;
        };
    };
    // WebGPU typings are not part of this project's `lib`; use a structural
    // type instead of referencing the global `GPUDevice` type.
    const gpuDeviceCtor = (globalThis as unknown as { GPUDevice?: GPUDeviceCtor }).GPUDevice;
    if (gpuDeviceCtor) {
        const patch = (
            proto: GPUDeviceCtor["prototype"],
            key: "createShaderModule" | "createRenderPipeline" | "createComputePipeline",
            counter: "shaderModules" | "renderPipelines" | "computePipelines"
        ) => {
            const original = proto[key];
            proto[key] = function (this: unknown, ...args: unknown[]) {
                gpuProbe[counter]++;
                return original.apply(this, args);
            };
        };
        patch(gpuDeviceCtor.prototype, "createShaderModule", "shaderModules");
        patch(gpuDeviceCtor.prototype, "createRenderPipeline", "renderPipelines");
        patch(gpuDeviceCtor.prototype, "createComputePipeline", "computePipelines");
    }
    let lastGpuSample: { t: number; shaders: number; pipelines: number } | undefined;
    window.setInterval(() => {
        const info = (window as any).__flywave?.mapView?.renderer?.info;
        const mem = (performance as any).memory;
        const mark = {
            t: Date.now(),
            shaders: gpuProbe.shaderModules,
            pipelines: gpuProbe.renderPipelines,
            drawCalls: info?.render?.drawCalls ?? 0,
            geometries: info?.memory?.geometries ?? 0,
            textures: info?.memory?.textures ?? 0,
            heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1
        };
        if (lastGpuSample) {
            const dShaders = mark.shaders - lastGpuSample.shaders;
            const dPipelines = mark.pipelines - lastGpuSample.pipelines;
            if (dShaders > 2 || dPipelines > 2) {
                gpuProbe.bursts.push({ t: mark.t, kind: `shader+${dShaders} pipeline+${dPipelines}`, delta: dShaders + dPipelines });
                logger.warn(
                    `WGSL/pipeline recompile burst: +${dShaders} shaders, +${dPipelines} pipelines in the last second`
                );
            }
        }
        lastGpuSample = { t: mark.t, shaders: mark.shaders, pipelines: mark.pipelines };
        gpuProbe.marks.push(mark);
        if (gpuProbe.marks.length > 600) gpuProbe.marks.shift();
    }, 1000);

    // Volumetric clouds drift continuously, keep the on-demand loop awake.
    handle.mapView.beginAnimation();
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-quantized-mesh example:", String(error));
});
