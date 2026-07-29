/**
 * Mapbox GL JS render-tests compatibility runner.
 *
 * Discovers compatible style.json files from test/render-tests/,
 * renders them using MBStyleDataSource, and compares with expected.png.
 *
 * Handles: metadata.test.operations, image-threshold, nested directories,
 * local:// resource rewriting.
 */
import {
    MapView,
    MapViewEventNames,
} from "@flywave/flywave-mapview";
import {
    getPlatform,
    RenderingTestHelper,
    TestOptions,
} from "@flywave/flywave-test-utils";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

import { MBStyleDataSource } from "../src/MBStyleDataSource";

const INCOMPATIBLE_TYPES = new Set([
    "terrain",
    "globe",
    "model",
    "model-layer",
    "video",
    "custom-layer",
    "raster-particle",
    "raster-array",
    "skybox",
]);

interface TestEntry {
    name: string;
    stylePath: string;
    style: any;
}

function discoverTests(): TestEntry[] {
    const root = path.join(__dirname, "..", "render-tests");
    const results: TestEntry[] = [];

    function scanDir(dir: string, prefix: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const stylePath = path.join(dir, "style.json");
        if (fs.existsSync(stylePath)) {
            try {
                const style = JSON.parse(fs.readFileSync(stylePath, "utf8"));
                const layers = style.layers ?? [];
                const skip = layers.some(
                    (l: any) => INCOMPATIBLE_TYPES.has(l.type),
                );
                if (!skip) {
                    results.push({ name: prefix, stylePath, style });
                }
            } catch {}
            return;
        }
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            scanDir(path.join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name);
        }
    }

    const topDirs = fs.readdirSync(root, { withFileTypes: true });
    for (const td of topDirs) {
        if (!td.isDirectory()) continue;
        scanDir(path.join(root, td.name), td.name);
    }
    return results;
}

const ALL_TESTS = discoverTests();
console.log(`[MBStyleCompat] ${ALL_TESTS.length} compatible tests loaded`);

function localizeUrl(u: string): string {
    if (!u.startsWith("local://")) return u;
    const ROOT = "/base/mapbox-gl-js/test/integration";
    return u
        .replace(/^local:\/\/data\//, `${ROOT}/data/`)
        .replace(/^local:\/\/tiles\//, `${ROOT}/tiles/`)
        .replace(/^local:\/\/sprites\//, `${ROOT}/sprites/`)
        .replace(/^local:\/\/glyphs\//, `${ROOT}/glyphs/`)
        .replace(/^local:\/\/image\//, `${ROOT}/image/`)
        .replace(/^local:\/\/models\//, `${ROOT}/models/`)
        .replace(/^local:\/\/mapbox-gl-styles\//, `${ROOT}/styles/`)
        .replace(/^local:\/\//, `${ROOT}/`);
}

function localizeStyle(style: any): any {
    const s = JSON.parse(JSON.stringify(style));
    for (const [, src] of Object.entries(s.sources ?? {})) {
        const source = src as any;
        if (source.tiles) {
            source.tiles = source.tiles.map((t: string) => localizeUrl(t));
        }
        if (source.url) source.url = localizeUrl(source.url);
        if (typeof source.data === "string") {
            source.data = localizeUrl(source.data);
        }
    }
    if (s.sprite) s.sprite = localizeUrl(s.sprite);
    if (s.glyphs) s.glyphs = localizeUrl(s.glyphs);
    return s;
}

async function renderFrames(
    mapView: MapView,
    dataSource: MBStyleDataSource,
    n: number,
): Promise<void> {
    await new Promise<void>((resolve) => {
        let frames = 0;
        const handler = () => {
            frames++;
            if (frames >= n) {
                mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                resolve();
            }
        };
        mapView.addEventListener(MapViewEventNames.AfterRender, handler);
        mapView.update();
    });
}

async function processOperations(
    mapView: MapView,
    dataSource: MBStyleDataSource,
    operations: any[],
): Promise<void> {
    const rt = dataSource.runtime;
    for (const op of operations) {
        const [name, ...args] = op;
        switch (name) {
            case "wait":
                await renderFrames(mapView, dataSource, args[0] ? 3 : 2);
                break;
            case "waitFrameReady":
            case "frameReady":
                await renderFrames(mapView, dataSource, 2);
                break;
            case "sleep":
                await new Promise((r) => setTimeout(r, args[0] ?? 0));
                break;
            case "setPaintProperty":
                rt?.setPaintProperty(args[0], args[1], args[2]);
                break;
            case "setLayoutProperty":
                rt?.setLayoutProperty(args[0], args[1], args[2]);
                break;
            case "addLayer":
                rt?.addLayer(args[0], args[1]);
                break;
            case "removeLayer":
                rt?.removeLayer(args[0]);
                break;
            case "moveLayer":
                rt?.moveLayer(args[0], args[1]);
                break;
            case "setFilter":
                rt?.setFilter(args[0], args[1]);
                break;
            case "setLayerZoomRange":
                rt?.setLayerZoomRange(args[0], args[1], args[2]);
                break;
            case "setStyle":
                rt?.setStyle(typeof args[0] === "string"
                    ? localizeStyle(JSON.parse(args[0]))
                    : localizeStyle(args[0]));
                break;
            case "setFeatureState":
                dataSource.setFeatureState(args[0] ?? args[1], args[1] ?? args[2]);
                break;
            case "removeFeatureState":
                dataSource.removeFeatureState(args[0]);
                break;
            case "setZoom":
                (mapView as any).setZoom?.(args[0]);
                break;
            case "setCenter":
                (mapView as any).setCenter?.(args[0]);
                break;
            case "setBearing":
                (mapView as any).setBearing?.(args[0]);
                break;
            case "setPitch":
                (mapView as any).setPitch?.(args[0]);
                break;
            case "setGeoJSONSourceData": {
                const sourceId = args[0];
                const newData = args[1];
                if (sourceId && newData) {
                    const ds = dataSource as any;
                    const provider = ds.m_delegatingProvider?.delegate;
                    if (provider && provider.m_geoJsonData !== undefined) {
                        provider.m_geoJsonData = typeof newData === 'string' ? newData : JSON.stringify(newData);
                        mapView.update();
                    }
                }
                break;
            }
            case "addImage":
            case "removeImage":
            case "updateImage":
                break;
            case "setProjection": {
                const projName = typeof args[0] === "string" ? args[0] : args[0]?.name;
                if (projName === "globe") {
                    const { sphereProjection } = await import("@flywave/flywave-geoutils");
                    (mapView as any).projection = sphereProjection;
                } else if (projName === "mercator") {
                    const { mercatorProjection } = await import("@flywave/flywave-geoutils");
                    (mapView as any).projection = mercatorProjection;
                } else if (projName && projName !== "globe") {
                    const { MBMapProjection } = await import("../src/MBMapProjection");
                    const { parseProjection } = await import("../src/MBProjection");
                    const config = parseProjection(typeof args[0] === "string" ? { name: args[0] } : args[0]);
                    (mapView as any).projection = new MBMapProjection(config);
                }
                break;
            }
            case "setLights":
            case "setLight": {
                const env = (dataSource as any).m_environment;
                if (env && args[0]) {
                    env.applyLights(Array.isArray(args[0]) ? args[0] : [args[0]]);
                }
                break;
            }
            case "setFog": {
                const env = (dataSource as any).m_environment;
                if (env) env.applyFog(args[0]);
                break;
            }
            case "setTerrain": {
                break;
            }
            case "addModel": {
                break;
            }
            case "addSource":
                break;
            case "easeTo": {
                const target = args[0] ?? {};
                if (target.zoom !== undefined) (mapView as any).setZoom?.(target.zoom);
                if (target.center) (mapView as any).setCenter?.(target.center);
                if (target.bearing !== undefined) (mapView as any).setBearing?.(target.bearing);
                if (target.pitch !== undefined) (mapView as any).setPitch?.(target.pitch);
                break;
            }
            case "setPadding":
                break;
            case "setCameraPosition":
            case "lookAtPoint":
            case "fitScreenCoordinates":
                break;
            case "forceContextRestart":
                break;
            default:
                break;
        }
        await renderFrames(mapView, dataSource, 1);
    }
}

describe("MBStyleDataSource render-tests compatibility", function () {
    const SUBSET = process.env.TEST_SUBSET
        ? ALL_TESTS.slice(0, parseInt(process.env.TEST_SUBSET))
        : ALL_TESTS;

    for (const entry of SUBSET) {
        const metadata = entry.style.metadata?.test ?? {};
        const skipReasons = metadata["skip-test"] ?? [];
        const shouldSkip = skipReasons.some(
            (r: any) => r["platform-tag-contains"] === "",
        );

        const testFn = shouldSkip ? it.skip : it;

        testFn(entry.name, async function () {
            this.timeout(60000);
            let canvas: HTMLCanvasElement | undefined;
            let mapView: MapView | undefined;

            try {
                const imageThreshold =
                    typeof metadata["image-threshold"] === "number"
                        ? metadata["image-threshold"]
                        : 0.001;
                const ibct = new RenderingTestHelper(this, {
                    module: "mbstyle-render",
                    imageThreshold,
                } as any);

                canvas = document.createElement("canvas");
                canvas.width = metadata.width ?? 128;
                canvas.height = metadata.height ?? 128;

                mapView = new MapView({
                    canvas,
                    theme: {},
                    preserveDrawingBuffer: true,
                    pixelRatio: metadata.pixelRatio ?? 1,
                    tileCacheSize: 0,
                });

                const style = localizeStyle(entry.style);
                const dataSource = new MBStyleDataSource({ style });

                await mapView.addDataSource(dataSource);

                await renderFrames(mapView, dataSource, 5);

                const operations = metadata.operations ?? [];
                if (operations.length > 0) {
                    await processOperations(mapView, dataSource, operations);
                    await renderFrames(mapView, dataSource, 3);
                }

                await ibct.assertCanvasMatchesReference(canvas, entry.name);

                mapView.dispose();
            } finally {
                if (mapView) {
                    try { mapView.dispose(); } catch {}
                }
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                    canvas = undefined!;
                }
            }
        });
    }
});
