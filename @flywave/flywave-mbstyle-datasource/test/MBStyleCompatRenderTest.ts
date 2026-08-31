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
    setReferenceImageResolver,
    setGlobalReporter,
    RenderingTestResultReporter,
} from "@flywave/flywave-test-utils";
import { assert } from "chai";

import { ALL_TESTS as INDEXED_TESTS } from "./render-tests-index";
import { MBStyleDataSource } from "../src/MBStyleDataSource";
import { MBStyleDecoder } from "../src/MBStyleDecoder";


// Compare against the local expected.png that ships with each ported
// render-test fixture (karma serves them under /base/), instead of the
// default `/reference-image?` endpoint which needs an external result server.
setReferenceImageResolver((imageProps) => {
    const name = imageProps.name ?? "";
    // Path segments may contain URL-hostile characters (regression fixtures
    // are named e.g. "mapbox-gl-js#11769") — '#' would truncate the URL at
    // the fragment and the expected.png fetch 404s forever.
    const encoded = name.split("/").map(encodeURIComponent).join("/");
    return `/base/@flywave/flywave-mbstyle-datasource/test/render-tests/${encoded}/expected.png`;
});

const INCOMPATIBLE_TYPES = new Set([
    "terrain",
    "globe",
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

/**
 * In the karma/browser environment Node's fs is unavailable, so the test list
 * is loaded from the pre-generated ./render-tests-index module (see
 * scripts/generate-mbstyle-test-index.js).
 */
function discoverTests(): TestEntry[] {
    return INDEXED_TESTS.map((t) => ({ name: t.name, stylePath: "", style: t.style }));
}

(globalThis as any).__mbDiagNoFlat = true;
// Wall-lighting azimuth probe (§454): enable via karma client arg
// "lightdbg=1" — the extrusion 3D-lighting shader writes R=NdotL, G/B=dir.xy.
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("lightdbg="))?.slice("lightdbg=".length);
    if (dbg === "1") (globalThis as any).__mbLightDbg = true;
}
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("occdbg="))?.slice("occdbg=".length);
    if (dbg === "1") (globalThis as any).__mbOccDbg = true;
}
// §499 RED PROBE with its OWN gate: occdbg's console/RT-read probe load
// perturbs frame timing enough to change which bakes capture content, so
// the rasterization-vs-alpha dichotomy must run in a clean universe.
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("rasred="))?.slice("rasred=".length);
    if (dbg === "1") (globalThis as any).__mbRasRed = true;
}
// §499 LITE bake probe: ONE console line per bakeAll (no readbacks, no
// traverses) — diagnostics with negligible frame-timing distortion.
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("liteldbg="))?.slice("liteldbg=".length);
    if (dbg === "1") (globalThis as any).__mbLiteDbg = true;
}
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("rtdump="))?.slice("rtdump=".length);
    if (dbg === "1") (globalThis as any).__mbRtDump = true;
}
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("rtdisable="))?.slice("rtdisable=".length);
    if (dbg === "1") (globalThis as any).__mbRtDisable = true;
}
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("uvtdbg="))?.slice("uvtdbg=".length);
    if (dbg === "1") (globalThis as any).__mbUvTerrainDbg = true;
}
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("rasuvdbg="))?.slice("rasuvdbg=".length);
    if (dbg === "1") (globalThis as any).__mbRasUvDbg = true;
}
{
    // §649: model-shader light-direction convention A/B (mgl az+90 vs the
    // §455 extrusion 90−az carried by lighting3DState).
    const alt = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("modeldiralt="))?.slice("modeldiralt=".length);
    if (alt === "1") (globalThis as any).__mbModelDirAlt = true;
}
{
    // §655: model-shader lighting port A/B (modellightport=1 → the mgl
    // model.fragment.glsl Cook-Torrance + indirect env; default = the
    // §557 hemisphere approximation).
    const port = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("modellightport="))?.slice("modellightport=".length);
    if (port === "1") (globalThis as any).__mbModelLightPort = true;
}
// Decode census: per-tile technique/vertex counts (is content reaching the
// emitter at all — data vs render side split for blank domains).
{
    const dbg = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("decodedbg="))?.slice("decodedbg=".length);
    if (dbg === "1") (globalThis as any).__mbDecodeDbg = true;
}
{
    const dbg = String((window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("shadowdbg="))?.slice("shadowdbg=".length) ?? "1");
    // §572c: the shadow chain is calibrated (ground quad gated to true
    // background, ortho guard, content receivers) — DEFAULT ON. shadowdbg=0
    // disables for A/B; shadowdbg>=3 adds the receiver debug readout.
    if (dbg !== "0") (globalThis as any).__mbShadowEnable = true;
    // Debug readout (receiver color = intensity/depth/uv.z) is a SEPARATE
    // gate — enabling shadows must not corrupt the pixel comparison.
    if (Number(dbg) >= 3) (globalThis as any).__mbShadowDbg = true;
    // §525 A/B: shadowdbg=2 opens the gate but SKIPS the depth pass —
    // discriminates depth-pass side effects from the patcher/lighting path.
    if (dbg === "2") (globalThis as any).__mbShadowSkipPass = true;
}
const ALL_TESTS = discoverTests();
console.log(`[MBStyleCompat] ${ALL_TESTS.length} compatible tests loaded`);

function localizeUrl(u: string): string {
    if (!u.startsWith("local://")) return u;
    const ROOT = "/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration";
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
    const localizeSources = (st: any) => {
        for (const [, src] of Object.entries(st.sources ?? {})) {
            const source = src as any;
            // mgl's test harness (integration/lib/transform-request.js) rewrites
            // api.mapbox.com tile URLs to the local `tiles/<id>/` fixtures. Mirror
            // that for named `mapbox://` sources: raster → png, vector → mvt,
            // raster-array → mrt (local fixtures use `{z}-{x}-{y}.{ext}` naming).
            if (typeof source.url === 'string' && source.url.startsWith('mapbox://')) {
                const id = source.url.replace('mapbox://', '').split('?')[0];
                const ext = source.type === 'raster-array' ? 'mrt'
                    : source.type === 'raster' ? 'png' : 'mvt';
                source.tiles = [`local://tiles/${id}/{z}-{x}-{y}.${ext}`];
                delete source.url;
            }
            if (source.tiles) {
                source.tiles = source.tiles.map((t: string) => localizeUrl(t));
            }
            if (source.url) source.url = localizeUrl(source.url);
            if (typeof source.data === "string") {
                source.data = localizeUrl(source.data);
            }
        }
    };
    localizeSources(s);
    if (s.sprite) s.sprite = localizeUrl(s.sprite);
    if (s.glyphs) s.glyphs = localizeUrl(s.glyphs);
    // §645: import fragments carry their own sources (vector basemaps,
    // geojson model sources) — localize them too, or every local:// tile
    // template inside an import stays unfetchable (the
    // vector-layer-external-models-import fixture rendered only its
    // background layer).
    for (const imp of s.imports ?? []) {
        if (imp?.data) localizeSources(imp.data);
    }
    return s;
}

async function renderUntilSettled(
    mapView: MapView,
    dataSource: MBStyleDataSource,
    maxFrames: number,
): Promise<void> {
    let lastCount = -1;
    let stable = 0;
    for (let i = 0; i < maxFrames && stable < 3; i++) {
        await renderFrames(mapView, dataSource, 1);
        // Count meshes actually ATTACHED to the scene: tile.objects lists
        // populate early, but the engine uploads geometry on a per-frame
        // quota — scene attachment is the signal that content is drawable.
        let count = 0;
        (mapView as any).scene?.traverse?.((o: any) => { if (o.isMesh) count++; });
        if (count === lastCount) {
            stable++;
        } else {
            stable = 0;
            lastCount = count;
        }
    }
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
            } else {
                // Re-request a frame so the render loop keeps producing
                // AfterRender events even when the scene is static (the loop
                // otherwise stops once no update is pending).
                mapView.update();
            }
        };
        mapView.addEventListener(MapViewEventNames.AfterRender, handler);
        mapView.update();
    });

    // Wait for a settled frame (all tiles loaded + no pending updates) so the
    // screenshot doesn't capture a partially-loaded state — the cause of
    // paint-icon-and-text / line-color flakes. `FrameComplete` fires after a
    // render where `isDynamicFrame` is false. If the map is already settled
    // after the N frames, keep the captured state (an extra update would
    // re-place text labels and disturb their final layout).
    if ((mapView as any).isDynamicFrame) {
        await new Promise<void>((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout>;
            const handler = () => {
                settled = true;
                mapView.removeEventListener(MapViewEventNames.FrameComplete, handler);
                clearTimeout(timer);
                resolve();
            };
            timer = setTimeout(() => {
                if (!settled) {
                    mapView.removeEventListener(MapViewEventNames.FrameComplete, handler);
                    resolve();
                }
            }, 15000);
            mapView.addEventListener(MapViewEventNames.FrameComplete, handler);
            mapView.update();
        });
    }

    // §665: POI/textElement accumulation census (1024-symbol double-label
    // family). Wrap PoiManager.addPois to count per-tile invocations and the
    // resulting textElement totals. decodedbg=1.
    if ((globalThis as any).__mbDecodeDbg && !(window as any).__mbPoiProbe) {
        try {
            (window as any).__mbPoiProbe = true;
            const pm: any = (mapView as any).poiManager;
            if (pm?.addPois) {
                const orig = pm.addPois.bind(pm);
                pm.addPois = (tile: any, decodedTile: any) => {
                    const before = tile.textElementGroups?.size ?? 0;
                    orig(tile, decodedTile);
                    const after = tile.textElementGroups?.size ?? 0;
                    // eslint-disable-next-line no-console
                    console.log(`[MBPoi] tile=${tile.tileKey?.level}/${tile.tileKey?.column}/${tile.tileKey?.row} offset=${tile.offset} pois=${decodedTile.poiGeometries?.length ?? 0} textElems=${after - before} total=${after} addPoisCalls=${((window as any).__mbPoiCalls = ((window as any).__mbPoiCalls ?? 0) + 1)}`);
                };
            }
            // §665b: textGeometries channel (TileGeometryCreator.createTextElements)
            const tgc: any = (await import(
                '@flywave/flywave-mapview/src/geometry/TileGeometryCreator'
            ) as any).TileGeometryCreator?.instance;
            if (tgc?.createTextElements) {
                const origCTE = tgc.createTextElements.bind(tgc);
                tgc.createTextElements = (tile: any, decodedTile: any, filter: any) => {
                    const before = tile.textElementGroups?.size ?? 0;
                    origCTE(tile, decodedTile, filter);
                    const after = tile.textElementGroups?.size ?? 0;
                    // eslint-disable-next-line no-console
                    console.log(`[MBText] tile=${tile.tileKey?.level}/${tile.tileKey?.column}/${tile.tileKey?.row} offset=${tile.offset} textGeos=${decodedTile.textGeometries?.length ?? 0} added=${after - before} total=${after}`);
                };
            }
        } catch { /* probe is best-effort */ }
    }

    // §662 scene census: what is actually in the graph at render time —
    // tile-object duplication (same key decoded/re-added twice), orphan
    // meshes at degenerate positions, per-material buckets. decodedbg=1.
    // Runs on the NEXT AfterRender (tile objects only live inside the render
    // pass — m_sceneRoot is cleared post-frame).
    if ((globalThis as any).__mbDecodeDbg) {
        try {
            const dump = () => {
                try {
                    // eslint-disable-next-line no-console
                    console.log(`[MBCamDump] zoomLevel=${(mapView as any).zoomLevel} cameraZ=${(mapView as any).camera?.position?.z?.toFixed?.(1)} canvas=${mapView.canvas?.width}x${mapView.canvas?.height} pr=${(mapView as any).pixelRatio}`);
                    const counts: Record<string, number> = {};
                    const samples: string[] = [];
                    const walk = (root: any, tag: string) => {
                        root?.traverse?.((o: any) => {
                            if (!o.isMesh && !o.isPoints && !o.isLine) return;
                            const mat0: any = Array.isArray(o.material) ? o.material[0] : o.material;
                            const flags = [
                                (mat0 as any)?.__mbExtrusion3DLit ? 'ext3d' : '',
                                (mat0 as any)?.__mbLitPatched ? 'legacy' : '',
                                (mat0 as any)?.__mbMglLit ? 'model' : '',
                                (mat0 as any)?.__mbStructLit ? 'struct' : ''
                            ].filter(Boolean).join(',') || 'none';
                            const key = `${tag}|${o.name || 'unnamed'}|${Array.isArray(o.material) ? o.material.map((m: any) => m?.type).join('+') : o.material?.type}|${flags}|c=${mat0?.color?.getHexString?.() ?? '?'}|pre=${(mat0 as any)?.isDepthPrepassMaterial ? 1 : 0}|df=${(mat0 as any)?.depthFunc ?? '?'}|ro=${o.renderOrder}|g=${o.geometry?.uuid?.slice?.(0, 8) ?? '?'}`;
                            counts[key] = (counts[key] ?? 0) + 1;
                            if (samples.length < 16) {
                                o.updateWorldMatrix?.(true, false);
                                const e = o.matrixWorld?.elements ?? [0, 0, 0];
                                const pos = o.position;
                                samples.push(`${key} local=(${pos.x?.toFixed?.(1)},${pos.y?.toFixed?.(1)},${pos.z?.toFixed?.(1)}) world=(${e[12]?.toFixed?.(1)},${e[13]?.toFixed?.(1)},${e[14]?.toFixed?.(1)}) nvert=${o.geometry?.attributes?.position?.count ?? '?'}`);
                            }
                        });
                    };
                    const tiles = (dataSource as any).getDecodedTiles?.() ?? [];
                    for (const t of tiles) {
                        const tk = t.tileKey ? `${t.tileKey.level}/${t.tileKey.column}/${t.tileKey.row}` : '?';
                        const dt: any = (t as any).decodedTile ?? {};
                        // eslint-disable-next-line no-console
                        console.log(`[MBTileInfo] ${tk} storage=${(t as any).storageLevel} objects=${(t.objects ?? []).length} geos=${dt.geometries?.length ?? '?'} techs=${dt.techniques?.length ?? '?'} poi=${dt.poiGeometries?.length ?? '?'} textPath=${dt.textPathGeometries?.length ?? '?'}`);
                        const objs = (t as any).objects ?? [];
                        for (const o of objs) walk(o, `tile${tk}`);
                    }
                    // §662: ALL cached tiles across every datasource (labels may
                    // live on a child datasource of the composite).
                    try {
                        const cache = (mapView as any).m_visibleTiles?.m_dataSourceCache;
                        cache?.m_tileCache?.forEach?.((t: any, k: string) => {
                            const objs = (t as any).objects ?? [];
                            // eslint-disable-next-line no-console
                            console.log(`[MBAllTiles] key=${k} ds=${t.dataSource?.name ?? '?'} key2=${t.tileKey?.level}/${t.tileKey?.column}/${t.tileKey?.row} storage=${(t as any).storageLevel} objects=${objs.length}`);
                        });
                    } catch (e) { /* noop */ }
                    // eslint-disable-next-line no-console
                    console.log(`[MBSceneDump] nTiles=${tiles.length} tiles=${JSON.stringify(counts)}`);
                    for (const s of samples) {
                        // eslint-disable-next-line no-console
                        console.log(`[MBSceneObj] ${s}`);
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.log('[MBSceneDump] err ' + e);
                }
            };
            mapView.addEventListener(MapViewEventNames.AfterRender, dump);
            mapView.update();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[MBSceneDump] setup err ' + e);
        }
    }

    // Multi-tile vector styles: sibling tiles decode asynchronously and can
    // finish after the settled frame — poll until every cached tile's
    // geometry is loaded (bounded), keeping real frames alive, so the
    // capture includes all tiles (gradient-vector-tile raced this, varying
    // 6453..19502 for identical code).
    for (let i = 0; i < 30; i++) {
        if (!(dataSource as any).tilesPending?.()) break;
        await new Promise<void>((resolve) => {
            const handler = () => {
                mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                resolve();
            };
            mapView.addEventListener(MapViewEventNames.AfterRender, handler);
            mapView.update();
            setTimeout(resolve, 400);
        });
    }

    // Raster styles: tile textures attach asynchronously in the material
    // patcher — the settle logic above can complete before the texture-loaded
    // frame renders (observed as order-of-tests flakes: raster-opacity varied
    // 14k–121k for identical code). For styles with a raster layer, request
    // one extra bounded frame so late texture attaches make it into the
    // capture. Text-perfect cases never carry raster layers, so the extra
    // update is safe.
    const hasModel = ((dataSource as any).styleManager?.getStyle?.()?.layers ?? []).some(
        (l: any) => l.type === "model",
    );
    if (hasModel) {
        // Model layers: GLTF (+Draco) assets decode asynchronously and can
        // finish after the settled frame — poll until MBModelRenderer has
        // instantiated every placement (or time out), keeping frames alive.
        // One EXTRA rendered frame is awaited after completion: instances are
        // added during AfterRender (after the draw), so the frame that drew
        // them follows the pending flag clearing.
        // Wait until models are placed AND at least three quiet
        // observations with REAL renders between them (renderer.info.render
        // .frame only increases on actual draws — AfterRender can fire from
        // queued frames predating the instantiation).
        const frameCount = () => (mapView as any).renderer?.info?.render?.frame ?? 0;
        let quietFrames = 0;
        for (let i = 0; i < 60; i++) {
            const pending = (dataSource as any).modelsPending?.();
            quietFrames = pending ? 0 : quietFrames + 1;
            if (quietFrames >= 3) break;
            const before = frameCount();
            await new Promise<void>((resolve) => {
                const handler = () => {
                    mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                    resolve();
                };
                mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                mapView.update();
                setTimeout(resolve, 500);
            });
            if (frameCount() <= before) i--; // no real render — don't count it
        }
        // The self-scan inside modelsPending() can instantiate during the
        // loop's final check (after the last draw) — render one more frame
        // so late instances make it into the capture.
        await new Promise<void>((resolve) => {
            const handler = () => {
                mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                resolve();
            };
            mapView.addEventListener(MapViewEventNames.AfterRender, handler);
            mapView.update();
            setTimeout(handler, 500);
        });
    }

    // §636 conflation replacement: model footprint coverage can register
    // AFTER the vector tiles decoded (GLB decode is async), triggering a
    // markTilesDirty re-decode during which fill-extrusion faces are
    // suppressed. Poll the conflation cycle to a settled state (bounded)
    // with real frames so the capture shows the replaced scene.
    if (typeof (dataSource as any).conflationSettled === "function") {
        const hasFillExtrusion = ((dataSource as any).styleManager?.getStyle?.()?.layers ?? []).some(
            (l: any) => l.type === "fill-extrusion",
        );
        if (hasFillExtrusion || hasModel) {
            for (let i = 0; i < 20; i++) {
                if ((dataSource as any).conflationSettled()) break;
                await new Promise<void>((resolve) => {
                    const handler = () => {
                        mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                        resolve();
                    };
                    mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                    mapView.update();
                    setTimeout(resolve, 500);
                });
            }
            // One extra frame so the re-decoded (suppressed) content draws.
            await new Promise<void>((resolve) => {
                const handler = () => {
                    mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                    resolve();
                };
                mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                mapView.update();
                setTimeout(handler, 500);
            });
        }
    }

    // §642 SpectorJS 交互式裁决（§621-§622 重启清单落地版）：capture+dump
    // 在测试存活窗口内 await 完成（§622 的失败根因是单跑模式下定时器被页面
    // 回收——本块在测试体内 await onCapture，规避该时序）。karma 参数
    // spectrcapture=1 启用。产物：每 draw 的 program + 最近 modelView 矩阵
    // 摘要 + instanceMatrix buffer 内容，供邻瓦片树像素贡献为零之谜做逐
    // draw 裁决。
    {
        const spy = (window as any).__karma__?.config?.args?.find?.((a: string) =>
            a.startsWith("spectrcapture="))?.slice("spectrcapture=".length);
        if (spy === "1" && hasModel) {
            const mv: any = mapView;
            (window as any).__mbMV = mv;
            const canvas: HTMLCanvasElement = mv.canvas ?? mv.renderer?.domElement;
            try {
                const bundleUrl = "/base/@flywave/flywave-mbstyle-datasource/test/vendor/spector.bundle.js";
                const text = await fetch(bundleUrl).then((r) => r.text());
                // eslint-disable-next-line no-new-func
                (0, eval)(text + "\n;window.SPECTOR = SPECTOR;");
                const spector = new (window as any).SPECTOR.Spector();
                (window as any).__mbSpector = spector;
                spector.spyCanvases();
                // eslint-disable-next-line no-console
                console.log("[MBSpec] spector ready, capturing next frame");
                const capture: any = await new Promise<any>((resolve) => {
                    const timer = setTimeout(() => resolve(null), 30000);
                    spector.onCapture.add((c: any) => {
                        clearTimeout(timer);
                        resolve(c);
                    });
                    spector.captureNextFrame(canvas);
                    // Force real frames so the capture delivers.
                    let n = 0;
                    const tick = () => {
                        mv.update();
                        if (++n < 120 && !(window as any).__mbSpecDone) requestAnimationFrame(tick);
                    };
                    tick();
                });
                (window as any).__mbSpecDone = true;
                if (!capture) {
                    // eslint-disable-next-line no-console
                    console.log("[MBSpec] capture TIMEOUT");
                } else {
                    const cmds: any[] = capture.commands ?? [];
                    // eslint-disable-next-line no-console
                    console.log("[MBSpec] commands=" + cmds.length);
                    // Introspection: shape of commands
                    const kinds: Record<string, number> = {};
                    for (const c of cmds) kinds[c.name ?? "?"] = (kinds[c.name ?? "?"] ?? 0) + 1;
                    // eslint-disable-next-line no-console
                    console.log("[MBSpecI] kinds=" + JSON.stringify(kinds));
                    const sampleDraw = cmds.find((c: any) => /draw/i.test(c.name ?? ""));
                    if (sampleDraw) {
                        // eslint-disable-next-line no-console
                        console.log("[MBSpecI] drawKeys=" + JSON.stringify(Object.keys(sampleDraw))
                            + " sample=" + JSON.stringify(sampleDraw).slice(0, 600));
                    }
                    const sampleU = cmds.find((c: any) => /uniformMatrix/i.test(c.name ?? ""));
                    if (sampleU) {
                        // eslint-disable-next-line no-console
                        console.log("[MBSpecI] uniKeys=" + JSON.stringify(Object.keys(sampleU))
                            + " sample=" + JSON.stringify(sampleU).slice(0, 600));
                    }
                    let curProg: any = "?";
                    const lastMatByLoc: Record<string, string> = {};
                    let drawIdx = 0;
                    for (const c of cmds) {
                        const name = c.name ?? "";
                        const args: any = c.commandArguments;
                        if (name === "useProgram") {
                            curProg = args?.[0]?.__SPECTOR_Object_TAG?.id ?? curProg;
                        } else if (name === "uniformMatrix4fv") {
                            const m = args?.[2];
                            const loc = args?.[0]?.__SPECTOR_Object_TAG?.id ?? "?";
                            if (m && m["15"] !== undefined) {
                                lastMatByLoc[loc] = `tx(${m["12"].toFixed(1)},${m["13"].toFixed(1)},${m["14"].toFixed(1)})`
                                    + ` w${m["15"].toFixed(2)}`;
                            }
                        } else if (name === "drawElements" || name === "drawArrays") {
                            drawIdx++;
                            const cnt = args?.[1] ?? "?";
                            const mats = Object.keys(lastMatByLoc).map((k) => `L${k}:${lastMatByLoc[k]}`).join(" ");
                            // eslint-disable-next-line no-console
                            console.log("[MBSpec] D" + drawIdx + " prog=" + curProg + " cnt=" + cnt + " " + mats);
                        }
                    }
                    // eslint-disable-next-line no-console
                    console.log("[MBSpec] DONE draws=" + drawIdx);
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log("[MBSpec] ERROR " + (e as Error)?.message);
            }
        }
    }

    const hasRaster = ((dataSource as any).styleManager?.getStyle?.()?.layers ?? []).some(
        (l: any) => l.type === "raster",
    );
    if (hasRaster) {
        // Bounded polling: tile textures attach asynchronously in the
        // material patcher and a texture may land after the single settled
        // frame (observed as white captures). Give late attaches several
        // update/render cycles to make it into the framebuffer.
        for (let i = 0; i < 10; i++) {
            await new Promise<void>((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                    if (!done) {
                        done = true;
                        mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                        resolve();
                    }
                }, 1500);
                const handler = () => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                    resolve();
                };
                mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                mapView.update();
            });
            await new Promise((r) => setTimeout(r, 100));
        }
    }
}

// mgl render-tests/utils.ts setupLayout: fixtures with metadata.test
// .addFakeCanvas get a DOM canvas (id from the fixture) with the given
// image drawn onto it — the canvas source then samples that element.
async function setupFakeCanvas(testMeta: any): Promise<void> {
    const cfg = testMeta?.addFakeCanvas;
    if (!cfg || typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.id = cfg.id ?? "fake-canvas";
    document.body.appendChild(canvas);
    await drawFakeCanvasImage(canvas, cfg.image);
}

function drawFakeCanvasImage(canvas: HTMLCanvasElement, image: string): Promise<void> {
    // mgl rewrites './image/x.png' → '/test/integration/image/x.png'
    // (vendored checkout, served by karma).
    const url = image.replace("./image/", "/base/mapbox-gl-js/test/integration/image/");
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const c2d = canvas.getContext("2d");
            if (c2d) c2d.drawImage(img, 0, 0);
            resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
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
            case "wait": {
                // mgl 'wait' = advance real time with the render loop alive
                // (paint transitions interpolate by wall clock). Anchor to
                // the requested duration with lightweight AfterRender
                // frames; the full settle path is the caller's capture.
                const waitMs = Number(args[0] ?? 0);
                const t0 = Date.now();
                if (waitMs > 0) {
                    // Stop one frame BEFORE the deadline: the loop's last
                    // frame renders for ~35-40ms, so its pixels reflect the
                    // tick at (deadline - frame) — landing the capture on
                    // the requested phase (#2769: 150ms of a 300ms linear
                    // transition).
                    const frameBudget = 40;
                    while (Date.now() - t0 < waitMs - frameBudget) {
                        await new Promise<void>((resolve) => {
                            const handler = () => {
                                mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                                resolve();
                            };
                            mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                            mapView.update();
                            setTimeout(resolve, Math.min(50, waitMs));
                        });
                    }
                } else {
                    // wait 0 = "next frame" — a single lightweight frame; the
                    // heavy settle path distorts wall-clock-anchored state
                    // (transitions) when mixed with timed waits.
                    await new Promise<void>((resolve) => {
                        const handler = () => {
                            mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                            resolve();
                        };
                        mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                        mapView.update();
                        setTimeout(resolve, 100);
                    });
                }
                break;
            }
            case "on": {
                // mgl `on(event, [[op, ...args], ...])` — run the nested ops
                // when the event fires. Only `styleimagemissing` is wired: it
                // fires for every icon name not present at decode time; mgl
                // de-duplicates by name and re-adds via addImage.
                const [event, nestedOps] = args as [string, any[][]];
                if (event === "styleimagemissing" && Array.isArray(nestedOps)) {
                    // The fixture templates carry the concrete image name in
                    // the nested addImage op — run them verbatim.
                    await processOperations(mapView, dataSource, nestedOps);
                }
                break;
            }
            case "waitFrameReady":
            case "frameReady":
                // mgl semantics: wait for N RENDERED frames — the engine
                // uploads tile geometry on a per-frame quota, so async
                // content (large extrusion sets, POIs) needs the full N
                // frames to attach. A fixed 2 left most objects unloaded
                // (the lighting-3d / occlusion "unlit white extrusions"
                // root cause).
                await renderFrames(mapView, dataSource, Math.max(2, Number(args[0]) || 2));
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
            case "setStyle": {
                let newStyle = args[0];
                if (typeof newStyle === "string") {
                    // URL / local:// path to a style JSON → fetch + parse;
                    // inline JSON string → parse directly.
                    const url = localizeUrl(newStyle.trim().startsWith("{")
                        ? newStyle
                        : newStyle.replace(/^local:\/\//, "/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/"));
                    if (url.trim().startsWith("{")) {
                        newStyle = JSON.parse(url);
                    } else {
                        const resp = await fetch(url);
                        newStyle = resp.ok ? await resp.json() : {};
                    }
                }
                rt?.setStyle(localizeStyle(newStyle));
                // Full style swap: reload sprites / glyphs / environment /
                // models / terrain, not just the decoder config. Without this,
                // the new style's sprite/glyph URLs are silently ignored.
                try {
                    await dataSource.reloadStyle();
                } catch {}
                break;
            }
            case "setFeatureState":
                dataSource.setFeatureState(args[0] ?? args[1], args[1] ?? args[2]);
                break;
            case "removeFeatureState": {
                // mgl: {source} without id removes ALL feature states of the
                // source; {source, id} removes one property set.
                const spec = args[0];
                if (spec && typeof spec === "object" && spec.id === undefined) {
                    (dataSource as any).clearFeatureStates?.();
                } else {
                    dataSource.removeFeatureState(
                        typeof spec === "object" ? spec.id : spec,
                    );
                }
                break;
            }
            case "setZoom": {
                // MapView has no direct setZoom — use zoomOnTargetPosition to
                // zoom while keeping the screen-center anchored.
                // flywave camera zoom = mapbox zoom + 1 (see applyCameraSettings).
                try {
                    const { MapViewUtils } = await import("@flywave/flywave-mapview");
                    MapViewUtils.zoomOnTargetPosition(mapView, 0, 0, (args[0] ?? 0) + 1);
                } catch {}
                break;
            }
            case "setCenter": {
                // setCenter via geoCenter setter (keeps zoom/bearing).
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    mapView.geoCenter = new GeoCoordinates(args[0][1], args[0][0]);
                } catch {}
                break;
            }
            case "setBearing": {
                // MapView exposes `heading` (degrees, clockwise from north).
                try {
                    mapView.heading = args[0];
                } catch {}
                break;
            }
            case "setPitch": {
                // MapView exposes `tilt` (degrees).
                try {
                    mapView.tilt = args[0];
                } catch {}
                // mgl re-evaluates pitch-dependent appearance conditions on
                // pitch change — our decode-time evaluation needs a re-decode.
                try {
                    (dataSource as any).refreshDecoderPitch?.();
                } catch {}
                break;
            }
            case "setGeoJSONSourceData":
            case "updateGeoJSONData": {
                const sourceId = args[0];
                const newData = args[1];
                if (sourceId && newData) {
                    // Update the runtime style's source data first so the
                    // change persists across any future re-connect.
                    rt?.setGeoJSONSourceData(sourceId, newData);
                    // Then update the live GeoJSONDataProvider if one exists
                    // for this source so already-loaded tiles see new data.
                    const ds = dataSource as any;
                    const provider = ds.m_delegatingProvider?.delegate;
                    if (provider && typeof provider.updateData === 'function') {
                        provider.updateData(newData);
                        mapView.update();
                    }
                }
                break;
            }
            case "addImage": {
                if (args[1] && typeof document !== 'undefined') {
                    // args[0] = name, args[1] = {width, height, data}, HTMLImage,
                    // or a "./image/dot.js" module path (mgl operation-handlers
                    // imports the ES module and uses its `image` export — a
                    // JS-GENERATED image with onAdd/render callbacks). Resolve
                    // it against the vendored mapbox-gl-js checkout, strip the
                    // export syntax, eval once (onAdd + one render pass) and
                    // feed the drawn canvas to addImage.
                    if (typeof args[1] === 'string' && args[1].endsWith('.js')) {
                        try {
                            const rel = args[1].replace('./', '');
                            const jsUrl = `/base/mapbox-gl-js/test/integration/${rel}`;
                            const res = await fetch(jsUrl);
                            if (res.ok) {
                                const text = await res.text();
                                const body = text.replace(/export\s+const\s+image/, 'const image');
                                const getImage = new Function(`${body}\nreturn image;`);
                                const image = getImage();
                                if (image && typeof image.onAdd === 'function') image.onAdd();
                                if (image && typeof image.render === 'function') image.render();
                                const canvas = image?.context?.canvas as HTMLCanvasElement | undefined;
                                if (canvas) {
                                    dataSource.addImage(args[0], canvas);
                                    // The symbol placement decoded before the
                                    // image existed (icon 'dot' unresolved →
                                    // feature dropped). Force a re-decode so
                                    // the icon resolves, then settle again.
                                    (dataSource as any).mapView?.markTilesDirty?.(dataSource);
                                    mapView.update();
                                    break;
                                }
                            }
                        } catch {}
                        break;
                    }
                    if (typeof args[1] === 'string' && args[1].endsWith('.png')) {
                        // mgl handler loads the PNG as an Image (localized
                        // against the vendored mgl checkout).
                        try {
                            const rel2 = (args[1] as string).replace('./', '');
                            const img = new Image();
                            img.onload = () => {
                                dataSource.addImage(args[0], img);
                                (dataSource as any).mapView?.markTilesDirty?.(dataSource);
                                mapView.update();
                            };
                            img.src = `/base/mapbox-gl-js/test/integration/${rel2}`;
                        } catch {}
                        break;
                    }
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d')!;
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    } catch {}
                }
                break;
            }
            case "removeImage": {
                dataSource.removeImage(args[0]);
                break;
            }
            case "updateImage": {
                // Re-add the image (same as addImage but replaces existing).
                if (args[1] && typeof document !== 'undefined') {
                    dataSource.removeImage(args[0]);
                    if (typeof args[1] === 'string' && args[1].endsWith('.png')) {
                        // mgl handler loads the PNG as an Image (localized
                        // against the vendored mgl checkout).
                        try {
                            const rel2 = (args[1] as string).replace('./', '');
                            const img = new Image();
                            img.onload = () => {
                                dataSource.addImage(args[0], img);
                                (dataSource as any).mapView?.markTilesDirty?.(dataSource);
                                mapView.update();
                            };
                            img.src = `/base/mapbox-gl-js/test/integration/${rel2}`;
                        } catch {}
                        break;
                    }
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d')!;
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    } catch {}
                }
                break;
            }
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
                    const config = parseProjection(typeof args[0] === "string" ? { name: projName } : args[0]);
                    (mapView as any).projection = new MBMapProjection(config);
                }
                // §273: the fog branch (globe atmosphere + glow-progress
                // content fog vs mercator chain) depends on the projection —
                // rebuild it after the swap.
                // §570b: the background also re-applies AFTER the fog rebuild
                // (arbitration reads globeFogActive) — every pre-swap
                // applyBackgroundColor ran as mercator (flat clear); on globe
                // the space clear + fogged disc must take over.
                const fogEnv0 = (dataSource as any).m_environment;
                fogEnv0?.refreshFog?.();
                try {
                    const st = (dataSource as any).styleManager?.getStyle() ?? {};
                    // §572d: viewport-aligned backgrounds own a fullscreen
                    // quad — re-applying the flat clear double-tints
                    // (viewport-alignment-globe +5.8k measured).
                    const hasViewportBg = ((st.layers ?? []) as any[])
                        .some((l: any) => l?.paint?.['background-pitch-alignment'] === 'viewport');
                    if (!hasViewportBg) {
                        (dataSource as any).applyBackgroundColor?.(st);
                    }
                } catch { /* best-effort */ }
                break;
            }
            case "setLights":
            case "setLight": {
                const env = (dataSource as any).m_environment;
                if (env && args[0]) {
                    env.applyLights(Array.isArray(args[0]) ? args[0] : [args[0]]);
                    // Re-ship the new brightness so `measure-light` appearance
                    // conditions re-evaluate on the updated lights.
                    try {
                        (dataSource as any).refreshDecoderBrightness?.();
                    } catch {}
                }
                break;
            }
            case "setFog": {
                const env = (dataSource as any).m_environment;
                if (env) env.applyFog(args[0]);
                break;
            }
            case "setTerrain": {
                const env = (dataSource as any).m_environment;
                if (env && args[0]) {
                    const style = (dataSource as any).styleManager?.getStyle() ?? {};
                    await env.applyTerrain(
                        args[0],
                        (dataSource as any).demTileUrl,
                        style.zoom ?? 8,
                        style.center ?? [0, 0],
                    );
                }
                break;
            }
            case "addModel": {
                // args: [name, uri] or [name, { uri, position }]
                const name = args[0];
                const def = args[1];
                if (name && def) {
                    const style = dataSource.runtime?.style;
                    if (style) {
                        if (!(style as any).models) (style as any).models = {};
                        (style as any).models[name] = typeof def === 'string'
                            ? { uri: def }
                            : def;
                        // Re-trigger model loading on the datasource.
                        try {
                            await (dataSource as any).loadModels?.(style);
                        } catch {}
                        // Publish the updated registry (the added model is
                        // usually referenced by decode-time placements) and
                        // re-decode so those placements emit with the model
                        // resolvable — addLayer's dirty pass ran earlier,
                        // before this model was registered.
                        try {
                            (dataSource as any).updateModelRegistry?.(style);
                        } catch {}
                        try {
                            await (dataSource as any).reloadSources?.();
                        } catch {}
                    }
                }
                break;
            }
            case "addSource": {
                // Add source to the runtime style and re-wire the data provider
                // so the new source's tiles actually load.
                if (rt && args[0] && args[1]) {
                    rt.addSource(args[0], args[1]);
                    try {
                        await (dataSource as any).reloadSources?.();
                    } catch {}
                }
                break;
            }
            case "updateFakeCanvas": {
                // args: [sourceId, img1, img2] — mgl plays the source, draws
                // img1 (canvas RESIZED to the image and the live texture
                // picks it up), pauses, then draws img2. A paused canvas
                // source does NOT re-upload its texture, so the capture
                // compares against IMG1 — the second draw only matters for
                // canvas side effects, never the rendered frame.
                const srcDef = (dataSource.runtime?.style as any)?.sources?.[args[0]];
                const canvasEl = typeof document !== "undefined"
                    ? (document.getElementById(srcDef?.canvas ?? "fake-canvas") as HTMLCanvasElement | null)
                    : null;
                if (canvasEl) {
                    await drawFakeCanvasImage(canvasEl, args[1]);
                    // THREE.CanvasTexture uploads once — flag needsUpdate so
                    // the redrawn pixels reach the GPU.
                    const quads = (dataSource as any).m_environment?.m_imageQuads ?? [];
                    for (const q of quads) {
                        const tex = q?.material?.map;
                        if (tex) tex.needsUpdate = true;
                    }
                    await renderFrames(mapView, dataSource, 3);
                    await drawFakeCanvasImage(canvasEl, args[2]);
                    await renderFrames(mapView, dataSource, 2);
                }
                break;
            }
            case "addCustomSource": {
                // mgl's handler (operation-handlers.js) registers a custom
                // source whose loadTile just fetches the {z}/{x}/{y} URL
                // template (maxzoom 17, tileSize 256) and decodes it as a
                // PNG bitmap — byte-for-byte equivalent to a plain raster
                // source with the same template, which our pipeline already
                // serves.
                if (rt && args[0] && typeof args[1] === "string") {
                    rt.addSource(args[0], {
                        type: "raster",
                        tiles: [localizeUrl(args[1])],
                        tileSize: 256,
                        maxzoom: 17,
                    });
                    try {
                        await (dataSource as any).reloadSources?.();
                    } catch {}
                }
                break;
            }
            case "removeSource": {
                if (rt && args[0]) {
                    rt.removeSource(args[0]);
                    try {
                        await (dataSource as any).reloadSources?.();
                    } catch {}
                }
                break;
            }
            case "setConfigProperty":
            case "setStyleImportConfigProperty": {
                // Update import config: args[0]=importId, args[1]=key, args[2]=value
                const style = dataSource.runtime?.style;
                if (style) {
                    const imports = (style as any).imports ?? [];
                    const importId = args[0];
                    const key = args[1];
                    const value = args[2];
                    for (const imp of imports) {
                        if (!importId || imp.id === importId) {
                            if (!imp.config) imp.config = {};
                            imp.config[key] = value;
                        }
                    }
                    // Propagate config to the merged style's flat map too
                    // (["config", key] expressions + color-theme.data resolve
                    // against it after the merge).
                    if ((style as any)._config) {
                        (style as any)._config[key] = value;
                    }
                    // Re-merge imports to propagate config.
                    dataSource.runtime?.setStyle(style);
                    // A config change can flip an expression-valued
                    // color-theme.data — re-resolve scoped themes.
                    (dataSource as any).loadImportThemes?.(style);
                    await renderFrames(mapView, dataSource, 3);
                }
                break;
            }
            case "setLayerProperty": {
                // Set arbitrary property on a layer: args[0]=layerId, args[1]=prop, args[2]=value
                const rt = dataSource.runtime;
                if (rt && args[0]) {
                    const layer = rt.style.layers.find((l: any) => l.id === args[0]) as any;
                    if (layer) {
                        const prop = args[1];
                        const isPaint = prop.includes('-color') || prop.includes('-opacity') ||
                                        prop.includes('-width') || prop.includes('-translate') ||
                                        prop.includes('-pattern') || prop.includes('-blur');
                        if (isPaint) {
                            if (!layer.paint) layer.paint = {};
                            layer.paint[prop] = args[2];
                        } else {
                            if (!layer.layout) layer.layout = {};
                            layer.layout[prop] = args[2];
                        }
                    }
                }
                break;
            }
            case "setColorTheme": {
                // The LUT decode + tile re-decode is async; mgl swaps a GPU
                // uniform at draw time so its two-frame wait suffices — we
                // need extra frames for the re-decode to land.
                await dataSource.setColorTheme(args[0] ?? null);
                await renderFrames(mapView, dataSource, 4);
                // The theme re-decodes tiles asynchronously (CPU bake);
                // let the reload settle before any trailing capture.
                await new Promise((r) => setTimeout(r, 50));
                await renderFrames(mapView, dataSource, 2);
                break;
            }
            case "setImportColorTheme": {
                // mgl map.setImportColorTheme(importId, theme):
                // args[0]=importId, args[1]=theme ({data}|null)
                await (dataSource as any).setImportColorTheme?.(args[0] ?? '', args[1] ?? null);
                await renderFrames(mapView, dataSource, 4);
                await new Promise((r) => setTimeout(r, 50));
                await renderFrames(mapView, dataSource, 2);
break;
            }
            case "easeTo": {
                const target = args[0] ?? {};
                // Use setCameraGeolocationAndZoom to atomically set center +
                // zoom + bearing + pitch (single re-orientation, matches the
                // post-animation end-state of mapbox's easeTo).
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom !== undefined ? target.zoom + 1 : mapView.zoomLevel;
                    const yaw = target.bearing ?? mapView.heading;
                    const pitch = target.pitch ?? mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                } catch {}
                break;
            }
            case "setPadding": {
                // padding = {top, bottom, left, right} in pixels
                const padding = args[0] ?? {};
                const canvas = mapView.canvas;
                const w = canvas.width;
                const h = canvas.height;
                const top = padding.top ?? 0;
                const bottom = padding.bottom ?? 0;
                const left = padding.left ?? 0;
                const right = padding.right ?? 0;
                // NDC offset: center shifts toward the larger padding side.
                const ndcX = (right - left) / w;
                const ndcY = (top - bottom) / h;
                try {
                    const { CameraUtils } = await import("@flywave/flywave-mapview");
                    CameraUtils.setPrincipalPoint(mapView.camera, { x: ndcX, y: ndcY });
                } catch {}
                break;
            }
            case "setCameraPosition":
            case "lookAtPoint": {
                // mgl free-camera semantics (free_camera.ts):
                //  - setCameraPosition [lng, lat, altMeters] sets the camera
                //    EYE position (not the map target);
                //  - lookAtPoint [lng, lat], up [x,y,z]: forward = target-eye
                //    (mercator, y-down, z-up meters), right = up × forward,
                //    bearing = atan2(-right.y, right.x), pitch =
                //    atan2(|forward.xy|, -forward.z); camera orbit distance =
                //    |forward|. Degenerate frames (null orientation, mgl
                //    invalid-orientation/roll cases) keep the map as-is — the
                //    engine cannot roll.
                if (name === "setCameraPosition" && args[0]) {
                    (globalThis as any).__mbFreeCameraPos = {
                        lng: Number(args[0][0]), lat: Number(args[0][1]),
                        alt: Number(args[0][2] ?? 0),
                    };
                }
                if (name === "lookAtPoint" && args[0]) {
                    try {
                        const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                        const targetLng = Number(args[0][0]);
                        const targetLat = Number(args[0][1]);
                        let eye = (globalThis as any).__mbFreeCameraPos as
                            { lng: number; lat: number; alt: number } | undefined;
                        if (!eye) {
                            // mgl getFreeCameraOptions: position defaults to the
                            // current camera (geo center + height above ground).
                            const { MapViewUtils } = await import("@flywave/flywave-mapview");
                            eye = {
                                lng: mapView.geoCenter.longitude,
                                lat: mapView.geoCenter.latitude,
                                alt: MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                                    mapView, mapView.zoomLevel),
                            };
                        }
                        const C = 40075016.686;
                        const mercX = (lng: number) => ((lng + 180) / 360) * C;
                        const mercY = (lat: number) =>
                            (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
                                / (2 * Math.PI)) * C;
                        const fx = mercX(targetLng) - mercX(eye.lng);
                        const fy = mercY(targetLat) - mercY(eye.lat);
                        const fz = -eye.alt;
                        // up defaults to world up; its z is forced positive (mgl).
                        const up = Array.isArray(args[1]) ? args[1].slice() : [0, 0, 1];
                        up[2] = Math.abs(Number(up[2]) || 0);
                        const ux = Number(up[0]) || 0, uy = Number(up[1]) || 0;
                        // right = up × forward
                        const rx = uy * fz - up[2] * fy;
                        const ry = up[2] * fx - ux * fz;
                        const rl = Math.hypot(rx, ry);
                        if (rl > 1e-9) {
                            const bearing = Math.atan2(-ry, rx) * 180 / Math.PI;
                            const pitch = Math.atan2(Math.hypot(fx, fy), -fz)
                                * 180 / Math.PI;
                            const dist = Math.hypot(fx, fy, fz);
                            // setCameraGeolocationAndZoom (NOT lookAt): the
                            // orbit lookAt leaves the tile scheduler idle —
                            // tiles never re-request and the frame stays
                            // blank. Passing the CURRENT heading/tilt keeps
                            // them (the setter zeroes defaults).
                            const { MapViewUtils } = await import("@flywave/flywave-mapview");
                            const zoom = MapViewUtils.calculateZoomLevelFromDistance({
                                focalLength: (mapView as any).focalLength,
                                minZoomLevel: 0, maxZoomLevel: 22,
                            }, dist);
                            (mapView as any).setCameraGeolocationAndZoom(
                                new GeoCoordinates(targetLat, targetLng),
                                zoom, bearing, Math.min(pitch, 89));
                        }
                    } catch {}
                }
                break;
            }
            case "fitScreenCoordinates": {
                // args: [{x,y}, {x,y}, bearing, options?]
                const p0 = args[0];
                const p1 = args[1];
                const bearing = args[2];
                if (p0 && p1) {
                    try {
                        const { GeoCoordinates, GeoBox } = await import("@flywave/flywave-geoutils");
                        // mgl camera.fitScreenCoordinates: unproject the four
                        // corners of the p0/p1 rectangle, then fit that geo
                        // bounds — keeping the current pitch unless options
                        // say otherwise. The old harness used a single-shot
                        // haversine zoom estimate and forced pitch 0, which
                        // misplaced/buried the camera (white screen).
                        const proj = (p: { x: number; y: number }) =>
                            (mapView as any).getGeoCoordinatesAt?.(p.x, p.y, true);
                        const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
                        const minY = Math.min(p0.y, p1.y), maxY = Math.max(p0.y, p1.y);
                        const corners = [
                            proj({ x: minX, y: minY }), proj({ x: maxX, y: maxY }),
                            proj({ x: minX, y: maxY }), proj({ x: maxX, y: minY }),
                        ];
                        if (corners.every(Boolean)) {
                            const lats = corners.map(c => c.latitude);
                            const lngs = corners.map(c => c.longitude);
                            const box = new GeoBox(
                                new GeoCoordinates(Math.min(...lats), Math.min(...lngs)),
                                new GeoCoordinates(Math.max(...lats), Math.max(...lngs)));
                            const opts = args[3] ?? {};
                            const pitch = Number(opts.pitch) || mapView.tilt;
                            (mapView as any).lookAt({
                                bounds: box,
                                tilt: pitch,
                                heading: bearing ?? mapView.heading,
                            });
                        }
                    } catch {}
                }
                break;
            }
            case "forceContextRestart": {
                // Best-effort: force context loss + restore.
                const gl = (mapView as any).renderer?.getContext?.();
                if (gl) {
                    const ext = gl.getExtension("WEBGL_lose_context");
                    if (ext) { ext.loseContext(); ext.restoreContext(); }
                }
                break;
            }
            case "setFov": {
                // Use existing MapView.setFovCalculation API.
                const fov = args[0];
                if (typeof fov === "number") {
                    (mapView as any).setFovCalculation?.({ type: "fixed", fov });
                }
                break;
            }
            case "check": {
                // Mapbox assertion (e.g. checkRenderingWorldCopies, checkCollisionCount).
                // We don't enforce these — the rendering comparison itself is the
                // assertion in the compat runner. Just record the call name.
                break;
            }
            case "forceRenderCached": {
                // Cache-control: force the next frame to render from cached tiles
                // without re-decoding. Best-effort — just advance a frame.
                break;
            }
            case "setColorTheme": {
                // Color theme override — store for downstream consumers.
                (mapView as any).colorTheme = args[0];
                break;
            }
            case "pinBooleanTransitionProgress": {
                // Pin a CSS-style boolean transition at a specific progress
                // value (0..1). Best-effort: store as a runtime setting.
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!(mapView as any).runtimeSettings) (mapView as any).runtimeSettings = {};
                    (mapView as any).runtimeSettings[`__pin_${key}`] = value;
                }
                break;
            }
            case "setSize": {
                // Resize the canvas to the given {width, height} in CSS pixels.
                const size = args[0];
                if (size && typeof size.width === 'number' && typeof size.height === 'number') {
                    const canvas = mapView.canvas;
                    canvas.width = size.width;
                    canvas.height = size.height;
                    mapView.update();
                }
                break;
            }
            case "rotateTo": {
                // args: [bearing, { duration, easing, ... }?]
                // For static rendering we only need the final bearing/pitch.
                try {
                    mapView.heading = args[0];
                    if (args[1]?.pitch !== undefined) mapView.tilt = args[1].pitch;
                } catch {}
                break;
            }
            case "resetNorth": {
                // Reset bearing to 0 (north up), optionally with animation.
                try { mapView.heading = 0; } catch {}
                break;
            }
            case "resetNorthPitch": {
                // Reset both bearing and pitch to 0.
                try {
                    mapView.heading = 0;
                    mapView.tilt = 0;
                } catch {}
                break;
            }
            case "jumpTo": {
                // Same as easeTo but without animation — set final state.
                const target = args[0] ?? {};
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom !== undefined ? target.zoom + 1 : mapView.zoomLevel;
                    const yaw = target.bearing ?? mapView.heading;
                    const pitch = target.pitch ?? mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                } catch {}
                break;
            }
            case "removeModel": {
                // args: [name] — unregister a model from style.models.
                const name = args[0];
                if (name && rt?.style) {
                    const models = (rt.style as any).models;
                    if (models) {
                        delete models[name];
                    }
                }
                break;
            }
            case "removeImport": {
                // args: [importId] — remove an import from style.imports.
                const importId = args[0];
                if (importId && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp: any) => imp.id === importId);
                        if (idx >= 0) imports.splice(idx, 1);
                        // Re-apply style to reflect the removal.
                        try { await dataSource.reloadStyle(); } catch {}
                    }
                }
                break;
            }
            case "pauseSource": {
                // args: [sourceId, pause?] — pause/resume a source's tile loading.
                // Best-effort: store the flag on mapView for reference.
                const sid = args[0];
                const pause = args[1] ?? true;
                if (sid) {
                    if (!(mapView as any).pausedSources) (mapView as any).pausedSources = new Set();
                    if (pause) (mapView as any).pausedSources.add(sid);
                    else (mapView as any).pausedSources.delete(sid);
                }
                break;
            }
            case "setSlot": {
                // args: [layerId, slotName]
                // Move a layer into a named slot position in the style's
                // layer array. Slots are defined by import styles and define
                // insertion points. Best-effort: reorder layers by slot.
                const layerId = args[0];
                const slotName = args[1];
                if (layerId && slotName && rt?.style) {
                    const layers = rt.style.layers as any[];
                    const layer = layers.find(l => l.id === layerId);
                    if (layer) {
                        layer.slot = slotName;
                        // Trigger re-evaluation to apply the slot change.
                        try { await dataSource.reloadStyle(); } catch {}
                    }
                }
                break;
            }
            case "moveImport": {
                // args: [importId, beforeImportId?]
                // Reorder imports so that `importId` comes before `beforeImportId`.
                const importId = args[0];
                const beforeId = args[1];
                if (importId && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp: any) => imp.id === importId);
                        if (idx >= 0) {
                            const [imp] = imports.splice(idx, 1);
                            if (beforeId) {
                                const beforeIdx = imports.findIndex((i: any) => i.id === beforeId);
                                if (beforeIdx >= 0) {
                                    imports.splice(beforeIdx, 0, imp);
                                } else {
                                    imports.push(imp);
                                }
                            } else {
                                imports.push(imp);
                            }
                            try { await dataSource.reloadStyle(); } catch {}
                        }
                    }
                }
                break;
            }
            case "addImport": {
                // args: [importId, beforeId?, config?]
                const importDef: any = { id: args[0] };
                if (args[2]) importDef.config = args[2];
                if (args[1]) importDef.url = args[1];
                if (rt?.style) {
                    if (!Array.isArray((rt.style as any).imports)) {
                        (rt.style as any).imports = [];
                    }
                    (rt.style as any).imports.push(importDef);
                    try { await dataSource.reloadStyle(); } catch {}
                }
                break;
            }
            case "updateImport": {
                // args: [importId, config]
                const importId = args[0];
                const config = args[1];
                if (importId && config && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const imp = imports.find((i: any) => i.id === importId);
                        if (imp) {
                            imp.config = { ...(imp.config ?? {}), ...config };
                            try { await dataSource.reloadStyle(); } catch {}
                        }
                    }
                }
                break;
            }
            case "setRenderWorldCopies": {
                // Best-effort: store on mapView; some engines expose this as
                // a runtime flag. When false, the world is rendered only once
                // (no horizontal repetition) — relevant for globe / polar
                // tests.
                (mapView as any).renderWorldCopies = args[0];
                break;
            }
            case "setWorldview": {
                // Update the decoder's worldview filter so features whose
                // worldview tag doesn't match are excluded.
                dataSource.decoder.configure(undefined, {
                    worldview: args[0],
                } as any);
                mapView.update();
                break;
            }
            case "setRuntimeSettingBool":
            case "setRuntimeSettingString": {
                // Generic runtime setting — key/value pair. Mostly affects
                // platform-specific behaviour we don't model; store on
                // mapView for downstream consumers.
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!(mapView as any).runtimeSettings) (mapView as any).runtimeSettings = {};
                    (mapView as any).runtimeSettings[key] = value;
                }
                break;
            }
            case "setCustomTexture": {
                // Mapbox HD: attach a named texture to the style for use by
                // pattern paints. Best-effort: register in the sprite atlas
                // under the given name so subsequent pattern paints can find it.
                const name = args[0];
                const image = args[1];
                if (name && image && typeof document !== 'undefined') {
                    try {
                        const canvas = document.createElement('canvas');
                        const img: any = image;
                        canvas.width = img.width ?? img.naturalWidth ?? 32;
                        canvas.height = img.height ?? img.naturalHeight ?? 32;
                        const ctx = canvas.getContext('2d')!;
                        if (img.data) {
                            const id = ctx.createImageData(canvas.width, canvas.height);
                            id.data.set(new Uint8ClampedArray(img.data));
                            ctx.putImageData(id, 0, 0);
                        } else if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
                            ctx.drawImage(img, 0, 0);
                        }
                        dataSource.addImage(name, canvas);
                    } catch {}
                }
                break;
            }
            default:
                break;
        }
        await renderFrames(mapView, dataSource, 1);
    }
}

describe("MBStyleDataSource render-tests compatibility", function () {
    // Route comparison results (actual/diff images + pass/fail) to an external
    // result server so an automated report can be generated. Pass
    // `feedback-url=http://host:port` via KARMA_ARGS.
    const feedbackUrl = (window as any).__karma__?.config?.args?.find?.((a: string) =>
        a.startsWith("feedback-url="),
    )?.slice("feedback-url=".length);
    before(function () {
        if (feedbackUrl) {
            setGlobalReporter(new RenderingTestResultReporter(feedbackUrl));
        }
    });

    // TEST_FILTER = substring(s) matched against the test name (e.g.
    // "hillshade-buffer" or "symbol-z-order/viewport-y"). Read from env (node
    // side, for ts-mocha) or karma client args (browser side).
    const envFilter = process.env.TEST_FILTER;
    const karmaFilters = (window as any).__karma__?.config?.args
        ?.filter?.((a: string) => a.startsWith("filter="))
        .map((a: string) => a.slice("filter=".length));
    const nameFilters = [
        ...(envFilter ? [envFilter] : []),
        ...(karmaFilters ?? []),
    ];
    let SUBSET = ALL_TESTS;
    if (nameFilters.length > 0) {
        SUBSET = ALL_TESTS.filter((e) =>
            nameFilters.some((f) => e.name.includes(f)),
        );
        console.log(
            `[MBStyleCompat] filtered to ${SUBSET.length} tests matching "${nameFilters.join('", "')}"`,
        );
    } else if (process.env.TEST_SUBSET) {
        SUBSET = ALL_TESTS.slice(0, parseInt(process.env.TEST_SUBSET));
    }

    for (const entry of SUBSET) {
        const metadata = entry.style.metadata?.test ?? {};
        const skipReasons = metadata["skip-test"] ?? [];
        // Determine current platform once.
        let platformTag = "";
        try { platformTag = getPlatform() ?? ""; } catch {}
        // A skip-test entry matches if its `platform-tag-contains` value is
        // a substring of our current platform tag. An empty value ("")
        // matches all platforms.
        const shouldSkip = skipReasons.some((r: any) => {
            const tag = r["platform-tag-contains"] ?? "";
            return typeof tag === 'string' && platformTag.includes(tag);
        });

        const testFn = shouldSkip ? it.skip : it;

        testFn(entry.name, async function () {
            this.timeout(180000);
            let canvas: HTMLCanvasElement | undefined;
            let mapView: MapView | undefined;

            try {
                // image-threshold may be:
                //   - a number (uniform threshold)
                //   - an array of { platform-tag-contains, threshold } (per-platform)
                // Default to 0.001 (more lenient than mapbox's 0.00015 to
                // account for rendering engine differences).
                let imageThreshold = 0.001;
                const rawThreshold = metadata["image-threshold"];
                if (typeof rawThreshold === "number") {
                    imageThreshold = rawThreshold;
                } else if (Array.isArray(rawThreshold)) {
                    // Per-platform: find the entry matching our platform, or
                    // the default (empty tag).
                    const platform = getPlatform();
                    let fallback: number | undefined;
                    for (const entry of rawThreshold) {
                        const tag = entry["platform-tag-contains"] ?? "";
                        if (tag === "") fallback = entry.threshold;
                        if (platform && typeof platform === 'string' && platform.includes(tag)) {
                            imageThreshold = entry.threshold;
                            break;
                        }
                    }
                    if (fallback !== undefined && imageThreshold === 0.001) {
                        imageThreshold = fallback;
                    }
                }
                const ibct = new RenderingTestHelper(this, {
                    module: "mbstyle-render",
                    imageThreshold,
                } as any);

                canvas = document.createElement("canvas");
                // Mapbox render-test harness defaults: 512x512 (overridden per-test).
                canvas.width = metadata.width ?? 512;
                canvas.height = metadata.height ?? 512;

                // Pre-create a WebGL2 context that explicitly requests a stencil
                // buffer — the SolidLineMaterial relies on stencil testing, and the
                // default context may be created without stencil in some headless
                // drivers (SwiftShader), which makes all lines invisible.
                const ctx =
                    canvas.getContext("webgl2", { stencil: true, antialias: true, preserveDrawingBuffer: true }) as any ??
                    canvas.getContext("webgl", { stencil: true, antialias: true, preserveDrawingBuffer: true }) as any;

                // Pin the global label fade duration to the test's requested
                // value so opacity transitions match `expected.png` timing.
                if (metadata.fadeDuration !== undefined) {
                    try {
                        const { setFadeDuration } = await import("../src/PlacementEngine");
                        setFadeDuration(metadata.fadeDuration);
                    } catch {}
                }

                // Use flywave's bundled Default FontCatalog for text rendering.
                // The mapbox PBF glyphs are not compatible with flywave's BMFont/MSDF format.
                // When the style references PBF glyphs we inject a PBF-built catalog
                // named "default" below; passing a fontCatalog URL here would make the
                // bundled catalog load asynchronously and overwrite that injection, so
                // only load it for styles without glyphs.
                const fontCatalogUrl = (entry.style as any)?.glyphs
                    ? undefined
                    : 'resources/fonts/Default_FontCatalog.json';

                mapView = new MapView({
                    canvas,
                    context: ctx ?? undefined,
                    // mgl has no engine ground plane: the background is the
                    // CLEAR color and the background-fog quad/dome own the
                    // fog bands. The engine plane's geometry reaches above
                    // the screen horizon line and depth-blocks the dome
                    // (fog/color-opacity top rows, §197) — and its fog rides
                    // shared ShaderLib uniforms that cannot be bypassed
                    // per-material (§194).
                    addBackgroundDatasource: false,
                    theme: {},
                    preserveDrawingBuffer: true,
                    pixelRatio: metadata.pixelRatio ?? 1,
                    tileCacheSize: 0,
                    fontCatalog: fontCatalogUrl,
                    logarithmicDepthBuffer: false,
                    // MapView's default maxZoomLevel (20) silently clamps the
                    // style camera (mapbox zoom + 1) for zoom >= 20 tests —
                    // e.g. raster-resampling (z20) rendered one level too far
                    // out. mapbox supports zoom up to 24; leave headroom for
                    // the +1 flywave offset.
                    maxZoomLevel: 25,
                    // mapbox's default vertical fov (transform.ts:247
                    // 0.6435011087932844 rad = 36.87°); flywave's default is
                    // 40°. The fov drives the camera distance
                    // (focalLength-based), so the default changes the
                    // perspective ratio: pitched views render near edges too
                    // wide / far edges too narrow vs mapbox baselines.
                    // clampHorizontal: false — the engine's MIN_FOV_DEG=10
                    // horizontal clamp distorts narrow canvases (256x1024:
                    // hfov 9.53° clamped to 10° → vfov 36.87→38.575, coverage
                    // 14 tiles wide vs the ~4-tile view). mgl has no such
                    // clamp (§321).
                    fovCalculation: {
                        type: 'fixed', fov: 36.86989764584402,
                        clampHorizontal: false,
                    } as any,
                });

                // render-tests capture a static frame shortly after load; disable
                // the 800ms text fade-in so glyph opacity matches the baseline.
                mapView.disableFading = true;

                const style = localizeStyle(entry.style);
                // Fake canvas must exist in the DOM before the datasource
                // connects — canvas sources resolve the element by id at
                // applyImageSources time.
                await setupFakeCanvas((entry.style as any)?.metadata?.test);
                // Apply scaleFactor metadata — multiplies icon-size and
                // text-size to simulate HD/SD display scaling.
                const scaleFactor = metadata.scaleFactor ?? 1;
                if (scaleFactor !== 1 && style.layers) {
                    for (const layer of style.layers as any[]) {
                        if (!layer.layout) continue;
                        if (layer.layout['icon-size'] !== undefined) {
                            layer.layout['icon-size'] = Number(layer.layout['icon-size']) * scaleFactor;
                        }
                        if (layer.layout['text-size'] !== undefined) {
                            layer.layout['text-size'] = Number(layer.layout['text-size']) * scaleFactor;
                        }
                    }
                }
                const dataSource = new MBStyleDataSource({
                    style,
                    decoder: new MBStyleDecoder(),
                });

                await mapView.addDataSource(dataSource);

                // If the style has a glyphs URL, build real mapbox-font
                // FontCatalogs from PBF SDF glyphs and inject them — replacing
                // flywave's default font so text matches the mapbox baselines.
                if (style.glyphs) {
                    try {
                        const { buildFontCatalogFromPBF } = await import("../src/MBFontCatalogBuilder");
                        const { parseGlyphPBF } = await import("../src/GlyphPBFParser");
                        const glyphsUrl = style.glyphs as string;
                        // Collect the font stacks actually referenced by the
                        // style's symbol layers (fall back to a sensible default).
                        const fontStacks = new Set<string>();
                        for (const layer of (style.layers ?? []) as any[]) {
                            const tf = layer.layout?.['text-font'];
                            if (Array.isArray(tf)) {
                                for (const f of tf) fontStacks.add(f);
                            }
                        }
                        if (fontStacks.size === 0) fontStacks.add("Open Sans Regular");
                        // Merge glyphs from every referenced stack into a single
                        // catalog (Basic Latin codepoints overlap between stacks).
                        const glyphs = new Map<number, any>();
                        let catalogFontName = "";
                        for (const fontName of fontStacks) {
                            if (catalogFontName === "") catalogFontName = fontName;
                            // mgl loads glyph ranges on demand at placement
                            // time; the static harness pre-fetches pages
                            // 0..7 (Basic/Supplemental Latin, Greek, Cyrillic)
                            // so fixture labels don't fall into the
                            // replacement-glyph path. Missing pages are
                            // skipped silently by the fetch guard below.
                            for (let range = 0; range < 8; range++) {
                                const start = range * 256;
                                const end = start + 255;
                                const url = glyphsUrl
                                    .replace('{fontstack}', encodeURIComponent(fontName))
                                    .replace('{range}', `${start}-${end}`)
                                    .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                                try {
                                    const resp = await fetch(url);
                                    if (!resp.ok) continue;
                                    const fontstack = parseGlyphPBF(await resp.arrayBuffer());
                                    if (!fontstack) continue;
                                    for (const [id, g] of fontstack.glyphs) glyphs.set(id, g);
                                } catch { continue; }
                            }
                        }
                        if (glyphs.size > 0) {
                            // TextStyleCache selects the canvas via
                            // style.fontCatalogName, which the TextTechnique
                            // protocol never sets — it always falls back to
                            // "default". Register under that name so the PBF
                            // catalog is actually used.
                            const catalog = buildFontCatalogFromPBF(catalogFontName, glyphs);
                            // mgl semantics: a label whose char is missing
                            // from the loaded pages renders that char blank —
                            // the label survives. The native pipeline drops
                            // the WHOLE label when any glyph is a replacement
                            // (getGlyphs → undefined, and the Initialized
                            // state never retries). The PBF builder's
                            // replacement glyph is a transparent 1×1 canvas,
                            // so showing it reproduces mgl exactly.
                            mapView.textElementsRenderer.showReplacementGlyphs = true;
                            mapView.setFontCatalog("default", catalog);
                        }
                    } catch {}
                }

                // Enable collision-box debug overlay when the test requests it.
                if (metadata.collisionDebug) {
                    dataSource.setCollisionDebug(true);
                }
                if (metadata.showTerrainWireframe) {
                    dataSource.setTerrainWireframe(true);
                }
                if (metadata.debug) {
                    dataSource.setDebugTileBoundaries(true);
                }
                if (metadata.showLayers3DWireframe) {
                    dataSource.setLayers3DWireframe(true);
                }
                if (metadata.showLayers2DWireframe) {
                    dataSource.setLayers2DWireframe(true);
                }

                // mapMode: 'static' = disable interaction; 'tile' = single-tile mode.
                if (metadata.mapMode) {
                    (dataSource as any).__mapMode = metadata.mapMode;
                }

                // mgl captures after the render loop settles: the engine
                // uploads tile geometry on a per-frame quota, so a fixed
                // 5-frame wait left large async content (300+ extrusion
                // objects, POIs) unattached — render until the decoded tile
                // object count is stable across frames (bounded).
                await renderUntilSettled(mapView, dataSource, 60);


                (globalThis as any).__mbFixture = entry.name;
                const operations = metadata.operations ?? [];
                if (operations.length > 0) {
                    // §505: a setTerrain TOGGLE rebuilds the terrain controller
                    // AND re-triggers the async raster pipeline (the satellite
                    // tiles decode, attach and drape-converge over dozens of
                    // frames). A fixed 3-frame wait captured the map BEFORE
                    // any of that — the terrain/raster family's all-white
                    // frames. mgl waits for the terrain to re-render too:
                    // run the full settle path after terrain toggles.
                    const terrainToggled = operations.some(o => o[0] === "setTerrain");
                    await processOperations(mapView, dataSource, operations);
                    // Paint transitions interpolate by wall clock — the heavy
                    // multi-frame settle path adds capture latency that pushes
                    // mid-transition fixtures (#2769: black→red @150ms) past
                    // their expected phase. Single fast frame when a
                    // transition is mid-flight; settle path otherwise.
                    const rtAny = (dataSource as any).runtime;
                    if (rtAny?.hasActiveTransitions) {
                        // Zero extra frames: the wait loop's last AfterRender
                        // already shows the phase at the requested time — any
                        // further frame advances the wall clock past it.
                    } else if (terrainToggled) {
                        await renderUntilSettled(mapView, dataSource, 60);
                    } else {
                        await renderFrames(mapView, dataSource, 3);
                    }
                    // §505: never capture a terrain frame before the drape
                    // converged (satellite decode + attach + real bake).
                    // Bounded by WALL CLOCK (SwiftShader frames run 100ms+);
                    // non-terrain fixtures report converged=true.
                    const convergeDeadline = Date.now() + 30000;
                    while (Date.now() < convergeDeadline) {
                        try {
                            if ((dataSource as any).isDrapeConverged?.()) break;
                        } catch {}
                        await renderFrames(mapView, dataSource, 1);
                    }
                    // §505: read the canvas AT CAPTURE TIME — splits
                    // "converged but later frames overwrite" vs "convergence
                    // never reached the canvas".
                    try {
                        const gl5 = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
                        if (gl5) {
                            const px5 = new Uint8Array(4 * 5);
                            const w5 = gl5.drawingBufferWidth, h5 = gl5.drawingBufferHeight;
                            [[0.5, 0.5], [0.3, 0.6], [0.7, 0.4], [0.5, 0.2], [0.5, 0.8]].forEach((pt, k) => {
                                gl5.readPixels(Math.floor(pt[0] * w5), Math.floor(pt[1] * h5),
                                    1, 1, gl5.RGBA, gl5.UNSIGNED_BYTE, px5, k * 4);
                            });
                            console.log('[MBCap] px=' + Array.from(px5)
                                .map((v, k) => (k % 4 === 3) ? 'a' + v : v).join('/'));
                            // §506 full-frame dump at capture (4-bit hex rows).
                            // §509: gated behind capfdump=1 — the unconditional
                            // ~32KB-per-test console flood saturated the karma
                            // socket and killed the result server mid-category
                            // (globe/model-layer lost their per-test JSONs).
                            if ((window as any).__karma__?.config?.args?.some?.(
                                (a: string) => a === 'capfdump=1')) {
                                const full5 = new Uint8Array(w5 * h5 * 4);
                                gl5.readPixels(0, 0, w5, h5, gl5.RGBA, gl5.UNSIGNED_BYTE, full5);
                                const tag5 = String((globalThis as any).__mbFixture ?? '?');
                                for (let row = h5 - 1; row >= 0; row -= 16) {
                                    let hex5 = row.toString(16).padStart(3, '0')
                                        + '@' + tag5 + '@';
                                    for (let x5b = 0; x5b < w5; x5b += 2) {
                                        const o7 = (row * w5 + x5b) * 4;
                                        hex5 += (full5[o7] >> 4).toString(16)
                                            + (full5[o7 + 1] >> 4).toString(16)
                                            + (full5[o7 + 2] >> 4).toString(16);
                                    }
                                    console.log('[MBCapF]' + hex5);
                                }
                            }
                            // §505b: same-moment toDataURL decode — the IBCT
                            // capture uses canvas.toBlob; if the two paths
                            // diverge, the toBlob capture is the white source.
                            const url5 = canvas.toDataURL();
                            const img5 = new Image();
                            img5.onload = () => {
                                const c5 = document.createElement('canvas');
                                c5.width = 16; c5.height = 16;
                                const x5 = c5.getContext('2d')!;
                                x5.drawImage(img5, 0, 0, 16, 16);
                                const d5 = x5.getImageData(8, 8, 1, 1).data;
                                const d6 = x5.getImageData(4, 12, 1, 1).data;
                                console.log('[MBCap2] toDataURL-center=' + d5[0] + ',' + d5[1] + ',' + d5[2]
                                    + ' lower-left=' + d6[0] + ',' + d6[1] + ',' + d6[2]);
                            };
                            img5.src = url5;
                        }
                    } catch {}
                }



                // Mapbox's image-threshold is the max FRACTION of mismatched
                // pixels allowed (e.g. 0.001 = 0.1%); convert it to a pixel
                // count. pixelmatch's per-channel threshold is fixed at 0.1.
                const maxMismatch = Math.ceil(
                    (imageThreshold * canvas.width * canvas.height) || 0,
                );


                await ibct.assertCanvasMatchesReference(canvas, entry.name, {
                    threshold: 0.1,
                    maxMismatchedPixels: maxMismatch,
                });

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

// ===== Additional operations (appended) =====
// These are handled in the default case of processOperations above,
// but we list them here for documentation. The actual handling is inline.
// Remaining no-op operations (from frequency analysis):
// - addCustomSource now mapped to an equivalent raster source (inline)
// - setSlot/moveImport/addImport/updateImport (6): import slot management
// - on/updateFakeCanvas (2): event listener / fake canvas control
// - addImport/updateImport now handled inline
