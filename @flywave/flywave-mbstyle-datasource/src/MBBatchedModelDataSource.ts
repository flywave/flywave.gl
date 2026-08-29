/**
 * §549/§537: REGULAR flywave DataSource for `type: "batched-model"` sources
 * (mgl `tiled_3d_model_source`).
 *
 * §549 exhausted every external-attach channel (scene root, WillRender root,
 * patch root, tile.objects riding, delta positioning, red-box probes) — the
 * engine render loop only draws objects owned by its own tile pipeline. So
 * this source is a real [[TileDataSource]]: the engine scheduler requests the
 * tiles, a [[DataProvider]] fetches the GLB bytes, an in-process
 * [[ITileDecoder]] (main-thread Draco, §547) builds the THREE scene, and the
 * model group rides `tile.objects` — the channel `TileObjectRenderer`
 * re-adds to `m_sceneRoot` every frame with its own RTE rebase
 * (`position = tile.center − cameraPosition`).
 *
 * GLB vertex units (§547 probe): x/y in the tile-local quantized 8192 grid
 * (NW origin, y grows SOUTH), z in METERS (mgl renders tile models with
 * zScaleMatrix = [1,1,pixelsPerMeter]). The engine's mercator world frame is
 * y-up (north-positive — see MBStyleDecoder's y-flip note; the adapter world
 * and `Tile.center` both live in mercatorProjection), so the local transform
 * flips y and applies mgl's latitude stretch on z:
 *   x' = (glbX − 4096) · w          (w = R/2^level/8192, east-positive)
 *   y' = (4096 − glbY) · w          (flip: GLB y is south-positive)
 *   z' = glbZ · sec(latCenter)      (1 ground meter = sec(lat) world units)
 *
 * Sparse tilesets: a 404/empty cell returns an EMPTY payload — TileLoader
 * short-circuits to an empty DecodedTile, the tile renders (and caches) as
 * empty instead of refetching forever.
 */

import * as THREE from 'three';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';
import { Tile, MapViewEventNames } from '@flywave/flywave-mapview';
import { DataProvider, TileDataSource, TileDataSourceOptions, TileFactory } from '@flywave/flywave-mapview-decoder';
import { DecodedTile, ITileDecoder, OptionsMap, TileInfo } from '@flywave/flywave-datasource-protocol';
import type { Projection } from '@flywave/flywave-geoutils';
import { applyMglModelLighting, syncMglModelLighting } from './MBModelRenderer';
import { refreshMeshFeatures } from './MBMeshFeatures';
import { decodeGlbTile, parseGlb, TileMaterialData, TileMaterialized, TilePrimitiveData } from './MBDracoDecoder';
import { applyMeshFeatures, applyModelFrontCutoff, applyModelFarCutoff, mglMeasureLightBrightness } from './MBMeshFeatures';
import { MBExpressionEngine } from './MBExpressionEngine';

/** GLB quantized grid extent per axis (mgl tiled 3D models). */
const TILE_GRID = 8192;
const EQUATORIAL_CIRCUMFERENCE = 40075016.685578486;

/** Fetch/decode probe state shared with the §541-§549 census harness. */
type BatchedProbe = { fetch: number; ok: number; decoded: number; parsed: number; err?: string; parseErr?: string };

function batchedStat(): BatchedProbe {
    return ((globalThis as any).__mbBatched ??= { fetch: 0, ok: 0, parsed: 0, err: '' });
}

/** §550 diag gate — karma client arg `mbbatchdbg=1` (cached). */
export function batchedDiagEnabled(): boolean {
    if ((globalThis as any).__mbBatchedDbgFlag === undefined) {
        (globalThis as any).__mbBatchedDbgFlag =
            (globalThis as any).__karma__?.config?.args?.find?.((a: string) =>
                a.startsWith('mbbatchdbg='))?.slice('mbbatchdbg='.length) === '1';
    }
    return (globalThis as any).__mbBatchedDbgFlag === true;
}

/**
 * Fetches whole-GLB tiles from the URL template. `local://` URLs resolve to
 * the render-test integration fixtures like every other provider here.
 */
class GLBTileDataProvider extends DataProvider {
    constructor(private readonly m_srcTemplate: string,
        private readonly m_pending: BatchedPending) {
        super();
    }

    ready(): boolean {
        return true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const stat = batchedStat();
        stat.fetch++;
        const url = this.m_srcTemplate
            .replace('{x}', String(tileKey.column))
            .replace('{y}', String(tileKey.row))
            .replace('{z}', String(tileKey.level))
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        this.m_pending.n++;
        try {
            const resp = await fetch(url, abortSignal ? { signal: abortSignal } : undefined);
            if (!resp.ok) {
                stat.err = 'HTTP ' + resp.status;
                return new ArrayBuffer(0);
            }
            const buf = await resp.arrayBuffer();
            stat.ok++;
            return buf;
        } catch (e: any) {
            if (e?.name === 'AbortError') throw e;
            stat.err = 'FETCH ' + String(e?.message ?? e).slice(0, 120);
            return new ArrayBuffer(0);
        } finally {
            this.m_pending.n--;
        }
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/** Shared pending-load counter (fetch + decode window). */
interface BatchedPending {
    n: number;
}

/**
 * In-process decoder: GLB bytes → THREE objects. THREE objects cannot cross a
 * worker boundary, so this decoder is main-thread only (mgl converts GLBs on
 * the main thread as well, §547). The built groups travel on the DecodedTile
 * as the `mbObjects` expando — in-process decode means no structured-clone
 * boundary strips it.
 */
class MBBatchedModelDecoder implements ITileDecoder {
    private m_paint: any = {};
    private m_envProvider: any;
    private m_zoomProvider: () => number = () => 0;
    private m_filter: any;
    /** mgl painter.minCutoffZoom = the sources' max minzoom (far-cutoff line). */
    private m_minCutoffZoom = 14;
    /** Built tile groups (node-filter runtime updates walk these). */
    private m_builtGroups = new Set<THREE.Object3D>();

    constructor(paint: any, envProvider: any, zoomProvider: () => number,
        private readonly m_pending: BatchedPending) {
        this.m_paint = paint ?? {};
        this.m_envProvider = envProvider;
        this.m_zoomProvider = zoomProvider;
    }

    async connect(): Promise<void> {}

    dispose(): void {}

    async getTileInfo(
        _data: ArrayBufferLike | {},
        _tileKey: TileKey,
        _projection: Projection,
    ): Promise<TileInfo | undefined> {
        return undefined;
    }

    configure(_options?: any, customOptions?: OptionsMap): void {
        const custom = customOptions as any;
        if (custom?.paint !== undefined) this.m_paint = custom.paint;
        if (custom?.envProvider !== undefined) this.m_envProvider = custom.envProvider;
        if (custom?.zoomProvider !== undefined) this.m_zoomProvider = custom.zoomProvider;
        if (custom?.filter !== undefined) {
            this.m_filter = custom.filter;
            this.applyNodeFilter();
        }
        if (custom?.minCutoffZoom !== undefined) this.m_minCutoffZoom = custom.minCutoffZoom;
    }

    /**
     * mgl Tiled3dModelBucket.setFilter/getNodesInfo: the model layer filter
     * evaluates per NODE with feature {type:'Point', id: node.extras.id,
     * properties:{height}}. Built groups keep the node id on every mesh, so
     * a runtime filter update just toggles visibility (no re-decode).
     */
    private nodePassesFilter(nodeId: string | undefined, height: number): boolean {
        if (this.m_filter === undefined || this.m_filter === null || this.m_filter === true) return true;
        if (this.m_filter === false) return false;
        try {
            return !!MBExpressionEngine.evaluate(this.m_filter, {
                zoom: this.m_zoomProvider(),
                feature: { type: 'Point', properties: { height }, id: nodeId },
            } as any);
        } catch {
            return true;
        }
    }

    /** Runtime setFilter: re-evaluate visibility over every built group. */
    private applyNodeFilter(): void {
        for (const group of this.m_builtGroups) {
            group.traverse((o: any) => {
                if (!o.isMesh || o.userData?.__mbNodeId === undefined) return;
                const keep = this.nodePassesFilter(o.userData.__mbNodeId, o.userData.__mbNodeHeight ?? 0);
                o.visible = keep;
            });
        }
    }

    async decodeTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        _projection: Projection,
    ): Promise<DecodedTile | undefined> {
        const dbg = batchedDiagEnabled();
        // Empty payload: sparse-tileset miss (see GLBTileDataProvider) —
        // decode to an empty tile so the engine caches it without geometry.
        if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
            return { techniques: [], geometries: [] };
        }
        const stat = batchedStat();
        this.m_pending.n++;
        try {
            // §550: LOD tiles (mbx-lod) are meshopt+quantization compressed —
            // a whole different container than the Draco mbx tiles. Route
            // them through GLTFLoader (native EXT_meshopt_compression +
            // KHR_mesh_quantization + textures), main thread like mgl.
            let meshopt = false;
            try {
                const { json } = parseGlb(data);
                meshopt = Array.isArray(json?.extensionsUsed)
                    && json.extensionsUsed.includes('EXT_meshopt_compression');
            } catch { /* fall through to the Draco path */ }

            const w = EQUATORIAL_CIRCUMFERENCE / Math.pow(2, tileKey.level) / TILE_GRID;
            const secLat = secLatOf(tileKey);
            const inner = new THREE.Group();
            inner.name = 'MBBatchedModelGrid';
            let hasMeshFeatures = false;
            // model-ambient-occlusion-intensity (style-spec default 1).
            const aoIntensity = this.evalPaintNumber('model-ambient-occlusion-intensity', 1);

            if (meshopt) {
                // Grid-space parsed scene (per-node matrices land the models
                // in the SAME 8192 grid as the Draco tiles, y south-positive,
                // z meters) — mirror at the GROUP level here. The negative
                // determinant flips the winding on top of the already-negative
                // node y-scales, so render these double-sided.
                const scene = await this.parseMeshoptScene(data);
                scene.traverse((o: any) => {
                    const mats = o.isMesh && o.material
                        ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                    for (const m of mats) m.side = THREE.DoubleSide;
                    // Node ids for the layer filter (GLTFLoader assigns glTF
                    // node extras to userData) — nearest ancestor wins.
                    for (let p: any = o; p; p = p.parent) {
                        if (p.userData?.id !== undefined) {
                            o.userData.__mbNodeId = String(p.userData.id);
                            break;
                        }
                    }
                    for (let p: any = o; p; p = p.parent) {
                        if (Array.isArray(p.userData?.anchor) && p.userData.anchor.length >= 2) {
                            o.userData.__mbAnchor = [Number(p.userData.anchor[0]), Number(p.userData.anchor[1])];
                            break;
                        }
                    }
                    if (o.isMesh) {
                        // Filter at DRAW visibility (mgl getNodesInfo) — the
                        // Draco branch does the same per primitive.
                        o.visible = this.nodePassesFilter(
                            o.userData.__mbNodeId, o.userData.__mbNodeHeight ?? 0);
                        // mgl model.fragment.glsl: meshes without a NORMAL
                        // attribute get a derivative-based flat normal
                        // (normalize(cross(fdx,fdy))) — three's flatShading is
                        // the same mechanism; without it the zero normal makes
                        // the lighting collapse to black (§552 -lod regression).
                        if (!o.geometry?.getAttribute?.('normal')) {
                            for (const m of mats) m.flatShading = true;
                        }
                        o.geometry?.computeBoundingBox?.();
                        if (o.geometry?.boundingBox) {
                            o.userData.__mbNodeBox = o.geometry.boundingBox;
                            // mgl getNodeHeight — the filter feature's height.
                            o.userData.__mbNodeHeight = o.geometry.boundingBox.max?.z ?? 0;
                        }
                        const m0: any = Array.isArray(o.material) ? o.material[0] : o.material;
                        o.userData.__mbBaseOpacity = m0?.opacity ?? 1;
                    }
                });
                inner.scale.set(w, -w, secLat);
                inner.position.set(-TILE_GRID / 2 * w, TILE_GRID / 2 * w, 0);
                inner.add(scene);
            } else {
                const tileData = await decodeGlbTile(data);
                stat.decoded = (stat.decoded ?? 0) + 1;
                hasMeshFeatures = tileData.hasMeshFeatures;
                // Draco path: the y mirror is baked into the VERTICES (with
                // the index winding reversed) — see buildPrimitiveMesh — so
                // the group keeps a positive scale.
                inner.position.set(-TILE_GRID / 2 * w, -TILE_GRID / 2 * w, 0);
                inner.scale.set(w, w, secLat);
                // mbx tiles carry occlusion maps (mgl ao = (tex-1)*I + 1 on
                // the lit color) — decode the GLB images for them.
                const occlusionMaps = await this.decodeOcclusionTextures(tileData);
                // mgl zScale = 1/tileToMeter = grid units per ground meter.
                const zScale = TILE_GRID / (EQUATORIAL_CIRCUMFERENCE
                    * Math.cos(tileCenterLatRad(tileKey)) / Math.pow(2, tileKey.level));
                for (let ni = 0; ni < tileData.nodes.length; ni++) {
                    const meshIdx = tileData.meshIndices[ni] ?? ni;
                    const nodeId = tileData.nodeIds[meshIdx];
                    const nodeLights = tileData.nodeLights[meshIdx];
                    const nodeAnchor = tileData.nodeAnchors[meshIdx];
                    const prims = tileData.nodes[ni];
                    // mgl getNodeHeight: max local z of the node's meshes —
                    // the filter feature's `height` property.
                    let nodeHeight = 0;
                    for (const prim of prims) {
                        for (let i = 2; i < prim.positions.length; i += 3) {
                            if (prim.positions[i] > nodeHeight) nodeHeight = prim.positions[i];
                        }
                    }
                    for (const prim of prims) {
                        const mesh = this.buildPrimitiveMesh(prim, tileData.materials,
                            occlusionMaps, aoIntensity);
                        mesh.userData.__mbNodeId = nodeId;
                        mesh.userData.__mbNodeHeight = nodeHeight;
                        mesh.userData.__mbLights = nodeLights;
                        mesh.userData.__mbZScale = zScale;
                        mesh.userData.__mbAnchor = nodeAnchor;
                        // Front-cutoff per-frame math source data: node box in
                        // the (already y-mirrored) geometry frame.
                        if (prim.positions.length >= 3) {
                            const b = new THREE.Box3();
                            const v = new THREE.Vector3();
                            for (let i = 0; i < prim.positions.length; i += 3) {
                                v.set(prim.positions[i], prim.positions[i + 1], prim.positions[i + 2]);
                                b.expandByPoint(v);
                            }
                            mesh.userData.__mbNodeBox = b;
                        }
                        mesh.userData.__mbBaseOpacity = (mesh.material as any)?.opacity ?? 1;
                        // Filter at DRAW visibility (mgl getNodesInfo picks at
                        // draw) — building everything keeps runtime setFilter
                        // widenings possible without a re-decode.
                        mesh.visible = this.nodePassesFilter(nodeId, nodeHeight);
                        inner.add(mesh);
                    }
                }
            }

            if (hasMeshFeatures) {
                // §547: per-part styling over MAPBOX_mesh_features.
                applyMeshFeatures(inner, this.m_paint,
                    this.m_zoomProvider(), this.m_envProvider);
            } else {
                this.applyLayerPaint(inner, this.m_paint);
            }
            // model-scale / model-translation are applied PER NODE with the
            // anchor pivot in the per-frame sync (mgl evaluateTransform +
            // applyTileTransform) — groups keep their base transform.
            inner.userData.__mbScaleBase = [inner.scale.x, inner.scale.y, inner.scale.z];
            inner.userData.__mbPosBase = [inner.position.x, inner.position.y, inner.position.z];
            inner.userData.__mbTransformMeta = { w, secLat, level: tileKey.level };
            inner.userData.tileKey = tileKey;
            // model-ambient-occlusion-intensity: three's aomap_fragment uses
            // exactly mgl's (tex−1)·I + 1 — only the intensity needs wiring.
            // Sub-mesh clones inherit aoMapIntensity, so this also covers the
            // split mesh-features materials.
            inner.traverse((o: any) => {
                if (!o.isMesh || !o.material) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) {
                    if (m?.aoMap) m.aoMapIntensity = aoIntensity;
                }
            });
            if (dbg) {
                // §550 DIAG (karma arg `mbbatchdbg=1`, ≤ a handful of tiles).
                let withColor = 0, withVcol = 0, withFeat = 0, withAo = 0, lights = 0, n = 0;
                const partHistogram: Record<number, number> = {};
                let sample: any;
                inner.traverse((o: any) => {
                    if (!o.isMesh) return;
                    n++;
                    if (o.geometry?.getAttribute?.('color')) withColor++;
                    if (o.material?.vertexColors === true) withVcol++;
                    if (o.geometry?.getAttribute?.('_feature_rgba4444')) withFeat++;
                    if (o.material?.aoMap) withAo++;
                    if (o.material?.__mbIsLights) lights++;
                    const p = o.userData?.__mbPart;
                    if (p !== undefined) partHistogram[p] = (partHistogram[p] ?? 0) + 1;
                    if (!sample && o.material?.vertexColors === true) sample = o;
                });
                // eslint-disable-next-line no-console
                console.log('[MBBatchedTile] z' + tileKey.level +
                    ' meshopt=' + meshopt +
                    ' features=' + hasMeshFeatures +
                    ' meshes=' + n +
                    ' vcol=' + withVcol + '/' + n +
                    ' cattr=' + withColor + '/' + n +
                    ' fattr=' + withFeat +
                    ' ao=' + withAo +
                    ' lights=' + lights +
                    ' parts=' + JSON.stringify(partHistogram) +
                    ' sampleRough=' + (sample?.material?.roughness ?? '?') +
                    ' sampleEmis=' + (sample?.material?.emissiveIntensity ?? '?') +
                    ' emisColor=' + String(sample?.material?.emissive?.getHexString?.() ?? '?'));
            }

            // The engine rewrites the pushed object's position to tile.center
            // every frame (TileObjectRenderer), so the local transform lives
            // on the inner group and the wrapper stays at the origin.
            const outer = new THREE.Group();
            outer.name = 'MBBatchedModelTile';
            outer.renderOrder = 10;
            outer.add(inner);
            outer.userData.tileKey = tileKey;
            // Runtime node-filter updates re-walk every built group.
            this.m_builtGroups.add(outer);

            // World-space height bound for the tile bounding box (z already
            // scaled by secLat inside `inner`).
            let maxZ = 0;
            try {
                const box = new THREE.Box3().setFromObject(inner);
                if (isFinite(box.max.z)) maxZ = box.max.z;
            } catch { /* keep the data-source-level bound */ }

            stat.parsed = (stat.parsed ?? 0) + 1;
            return {
                techniques: [],
                geometries: [],
                maxGeometryHeight: Math.max(maxZ, 1),
                mbObjects: [outer],
            } as DecodedTile;
        } catch (e: any) {
            stat.parseErr = String(e?.stack ?? e).slice(0, 200);
            return { techniques: [], geometries: [] };
        } finally {
            this.m_pending.n--;
        }
    }

    /**
     * §550: meshopt LOD tile → GLTFLoader scene (grid space, unmirrored).
     * The loader handles EXT_meshopt_compression (main-thread WASM, karma
     * safe — unlike DRACOLoader's blob-worker), KHR_mesh_quantization, node
     * matrices and the embedded textures.
     */
    private async parseMeshoptScene(data: ArrayBuffer): Promise<THREE.Object3D> {
        if (!MBBatchedModelDecoder.s_meshoptLoader) {
            MBBatchedModelDecoder.s_meshoptLoader = (async () => {
                const loaderMod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
                const meshoptMod: any =
                    await import('three/examples/jsm/libs/meshopt_decoder.module.js');
                const loader = new loaderMod.GLTFLoader();
                loader.setMeshoptDecoder(meshoptMod.MeshoptDecoder);
                return loader;
            })();
        }
        const loader = await MBBatchedModelDecoder.s_meshoptLoader;
        const gltf = await loader.parseAsync(data, '');
        batchedStat().decoded = ((batchedStat().decoded ?? 0) || 0) + 1;
        return gltf.scene;
    }

    private static s_meshoptLoader: Promise<any> | null = null;

    /** Zoom-level evaluation of a scalar layer paint (default on failure). */
    private evalPaintNumber(key: string, dflt: number): number {
        const v = this.evalPaintRaw(key);
        const n = Number(v);
        return Number.isFinite(n) ? n : dflt;
    }

    /** Zoom-level evaluation of a [x,y,z] vector layer paint. */
    private evalPaintVec(key: string, dflt: [number, number, number]): [number, number, number] {
        const v = this.evalPaintRaw(key);
        const arr = Array.isArray(v) ? v : undefined;
        const out = [...dflt] as [number, number, number];
        if (arr) {
            for (let i = 0; i < 3; i++) {
                const n = Number(arr[i]);
                if (Number.isFinite(n)) out[i] = n;
            }
        }
        return out;
    }

    private evalPaintRaw(key: string): any {
        const raw = this.m_paint?.[key];
        if (raw === undefined || raw === null) return undefined;
        try {
            if (typeof raw !== 'object') return raw;
            return MBExpressionEngine.evaluate(raw, {
                zoom: this.m_zoomProvider(),
                brightness: mglMeasureLightBrightness(this.m_envProvider),
                feature: { type: 'Point', properties: {}, id: 0 },
            } as any);
        } catch {
            return undefined;
        }
    }

    /**
     * Re-apply model-scale/model-translation per NODE from the paint
     * evaluated at the CURRENT zoom (mgl evaluateTransform + applyTileTransform):
     * node = T(anchor*(s-1) + translation_grid) * S(s) * base. The anchor
     * (extras.anchor, grid units) keeps each node pivoting on itself; the
     * translation arrives in ground/z METERS and converts to grid units
     * (x/y: tileGroundMeters span 8192 units, z: GLB z IS meters).
     */
    private applyNodeTransforms(outer: any): void {
        const inner = outer.children[0] as any;
        const meta = inner?.userData?.__mbTransformMeta;
        if (!meta) return;
        const mScale = this.evalPaintVec('model-scale', [1, 1, 1]);
        const mTrans = this.evalPaintVec('model-translation', [0, 0, 0]);
        const identityPaint = mScale[0] === 1 && mScale[1] === 1 && mScale[2] === 1
            && !mTrans[0] && !mTrans[1] && !mTrans[2];
        let metersPerGrid = 0;
        if (!identityPaint) {
            const latRad = tileCenterLatRad(inner.userData.tileKey);
            const groundMeters = EQUATORIAL_CIRCUMFERENCE * Math.cos(latRad)
                / Math.pow(2, meta.level);
            metersPerGrid = groundMeters / TILE_GRID;
        }
        inner.traverse((mesh: any) => {
            if (!mesh.isMesh || mesh.userData.__mbAnchor === undefined) return;
            const anchor = mesh.userData.__mbAnchor;
            // Base local matrix (Draco sub-meshes: pos/quat/scale; meshopt:
            // the loader-baked matrix) — cached on first sync.
            let base = mesh.userData.__mbBaseMatrix;
            if (!base) {
                base = new THREE.Matrix4();
                if (mesh.matrixAutoUpdate) {
                    base.compose(mesh.position, mesh.quaternion, mesh.scale);
                } else {
                    base.copy(mesh.matrix);
                }
                mesh.userData.__mbBaseMatrix = base;
                mesh.userData.__mbWasAutoUpdate = mesh.matrixAutoUpdate;
            }
            if (identityPaint) {
                mesh.matrixAutoUpdate = mesh.userData.__mbWasAutoUpdate;
                mesh.matrix.copy(base);
                mesh.matrixWorldNeedsUpdate = true;
                return;
            }
            const t = new THREE.Vector3(
                anchor[0] * (mScale[0] - 1) + (mTrans[0] ? mTrans[0] / metersPerGrid : 0),
                anchor[1] * (mScale[1] - 1) + (mTrans[1] ? mTrans[1] / metersPerGrid : 0),
                mTrans[2] ?? 0);
            const m = new THREE.Matrix4().makeTranslation(t.x, t.y, t.z)
                .multiply(new THREE.Matrix4().makeScale(mScale[0], mScale[1], mScale[2]))
                .multiply(base);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(m);
            mesh.matrixWorldNeedsUpdate = true;
        });
    }

    /**
     * Per-frame style state sync for every built tile group: live 3D-lighting
     * uniforms (runtime setLights) + zoom-evaluated per-node scale/translation
     * (runtime setZoom) + model-front-cutoff node opacity.
     */
    syncStyleState(): void {
        const zoom = this.m_zoomProvider();
        for (const outer of this.m_builtGroups) {
            this.applyNodeTransforms(outer);
            syncMglModelLighting(outer, this.m_envProvider);
            // Indirect part-styling update (runtime setLights/setZoom over
            // measure-light-dependent part paint) — no-op unless brightness
            // or zoom moved since the last application.
            try {
                refreshMeshFeatures(outer.children[0] as THREE.Object3D,
                    this.m_paint, zoom, this.m_envProvider);
            } catch { /* must never break the frame */ }
        }
        try {
            const mv: any = (this.m_envProvider as any)?.mapView;
            if (mv) {
                applyModelFarCutoff(this.m_builtGroups, mv, this.m_zoomProvider(),
                    this.m_minCutoffZoom,
                    (k: string, d: number) => this.evalPaintNumber(k, d));
                applyModelFrontCutoff(this.m_builtGroups, this.m_paint, mv,
                    (k: string, d: [number, number, number]) => this.evalPaintVec(k, d));
            }
        } catch { /* front-cutoff must never break the frame */ }
    }

    /**
     * GLB images → THREE textures for the occlusion slots. glTF UVs are
     * top-left origin (flipY=false like GLTFLoader) and the data is linear
     * (occlusion is not a color map).
     */
    private async decodeOcclusionTextures(
        tileData: TileMaterialized,
    ): Promise<(THREE.Texture | undefined)[]> {
        return Promise.all(tileData.textures.map(async (t) => {
            if (!t) return undefined;
            try {
                const blob = new Blob([t.bytes], { type: t.mimeType });
                const bitmap = await createImageBitmap(blob);
                const tex = new THREE.Texture(bitmap);
                tex.flipY = false;
                tex.colorSpace = THREE.NoColorSpace;
                tex.needsUpdate = true;
                return tex;
            } catch {
                return undefined;
            }
        }));
    }

    /** Build one decoded primitive into a THREE mesh (glTF material map). */
    private buildPrimitiveMesh(
        prim: TilePrimitiveData, materials: TileMaterialData[],
        occlusionMaps: (THREE.Texture | undefined)[] = [],
        aoIntensity = 1,
    ): THREE.Mesh {
        const geo = new THREE.BufferGeometry();
        // Mirror y around the tile center: local y is north-positive (engine
        // frame) while the GLB grid runs south from the NW origin.
        const src = prim.positions;
        const positions = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 3) {
            positions[i] = src[i];
            positions[i + 1] = TILE_GRID - src[i + 1];
            positions[i + 2] = src[i + 2];
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        if (prim.normals) {
            const nrm = prim.normals;
            const normals = new Float32Array(nrm.length);
            for (let i = 0; i < nrm.length; i += 3) {
                normals[i] = nrm[i];
                normals[i + 1] = -nrm[i + 1];
                normals[i + 2] = nrm[i + 2];
            }
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        }
        if (prim.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(prim.uvs, 2));
        if (prim.features) {
            // Name matches the lowercase attribute GLTFLoader would produce;
            // MBMeshFeatures consumes it for per-part styling.
            geo.setAttribute('_feature_rgba4444', new THREE.BufferAttribute(prim.features, 2));
        }
        // The y mirror flips the triangle winding — reverse it so front faces
        // stay front faces under the (positive) tile scale.
        const indices = new Uint32Array(prim.indices);
        for (let t = 0; t + 2 < indices.length; t += 3) {
            const tmp = indices[t + 1];
            indices[t + 1] = indices[t + 2];
            indices[t + 2] = tmp;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        const m = materials[prim.materialIndex] ?? materials[0];
        const mat = new THREE.MeshStandardMaterial({
            // glTF factors are linear; THREE.Color components are working
            // (linear) space — no further conversion.
            color: new THREE.Color(
                m ? m.baseColorFactor[0] : 1,
                m ? m.baseColorFactor[1] : 1,
                m ? m.baseColorFactor[2] : 1),
            metalness: m ? m.metallicFactor : 1,
            roughness: m ? m.roughnessFactor : 1,
            emissive: new THREE.Color(
                m ? m.emissiveFactor[0] : 0,
                m ? m.emissiveFactor[1] : 0,
                m ? m.emissiveFactor[2] : 0),
            side: m?.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            // mgl falls back to derivative flat normals when the primitive
            // carries no NORMAL attribute (model.fragment.glsl getNormal).
            flatShading: !prim.normals,
        });
        if (m?.baseColorFactor && m.baseColorFactor[3] < 1) {
            mat.transparent = true;
            mat.opacity = m.baseColorFactor[3];
        }
        // Occlusion/AO map — the only texture slot the mbx tiles use. three's
        // aomap_fragment applies exactly mgl's formula
        // ((tex.r − 1) · aoMapIntensity + 1); the mgl lighting patch below
        // re-applies it to the LIT color only.
        if (m && m.occlusionTextureIndex >= 0 && occlusionMaps[m.occlusionTextureIndex]) {
            mat.aoMap = occlusionMaps[m.occlusionTextureIndex];
            mat.aoMapIntensity = aoIntensity;
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        return mesh;
    }

    /** Whole-tile paint styling (non-mesh-features tiles, §539 phase 1). */
    private applyLayerPaint(model: THREE.Group, paint: any): void {
        try {
            // §550: evaluate the layer paint with NO part property (mgl
            // featureless models take every expression's default branch) and
            // feed model-color/mix-intensity as the shader tint — mix happens
            // IN the shader against the (possibly textured) albedo, exactly
            // mgl's mix(albedo, srgb2linear(model-color), mix).
            const evalRaw = (raw: any): any => {
                if (raw === undefined || raw === null) return undefined;
                if (typeof raw !== 'object') return raw;
                try {
                    return MBExpressionEngine.evaluate(raw, {
                        zoom: this.m_zoomProvider(),
                        brightness: mglMeasureLightBrightness(this.m_envProvider),
                        feature: { type: 'Point', properties: {}, id: 0 },
                    } as any);
                } catch {
                    return undefined;
                }
            };
            const num = (raw: any, dflt: number): number => {
                const n = Number(evalRaw(raw));
                return Number.isFinite(n) ? n : dflt;
            };
            let tint: { color: number[]; mix: number } | undefined;
            const colorRaw = paint?.['model-color'];
            if (colorRaw !== undefined) {
                const colorEval = evalRaw(colorRaw);
                const c = new THREE.Color();
                // mgl paint default model-color is #ffffff — an evaluation
                // failure must fall back to WHITE, not three's default black
                // (mix=1 paints would otherwise go fully black).
                c.setStyle('#ffffff', THREE.SRGBColorSpace);
                try {
                    if (typeof colorEval === 'string') c.setStyle(colorEval, THREE.SRGBColorSpace);
                    else if (Array.isArray(colorEval)) c.setRGB(colorEval[0], colorEval[1], colorEval[2], THREE.SRGBColorSpace);
                } catch { /* no tint */ }
                const mix = num(paint?.['model-color-mix-intensity'], 0);
                // Shader-side mix is against the linear albedo — hand over
                // linear components (Color.setStyle already converted when
                // color management is on; force it defensively).
                if (mix > 0) tint = { color: [c.r, c.g, c.b], mix };
            }
            const emissive = num(paint?.['model-emissive-strength'], 0);
            applyMglModelLighting(this.m_envProvider, model, emissive, tint);
            const op = Number(paint?.['model-opacity'] ?? 1);
            if (op < 1) {
                model.traverse((o: any) => {
                    const mesh = o as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    for (const m of mats as any[]) {
                        if (!m) continue;
                        m.transparent = true;
                        m.opacity = op;
                        m.depthWrite = false;
                    }
                });
            }
        } catch {}
    }
}

/** Latitude (radians) of a tile's geographic center. */
function tileCenterLatRad(tileKey: TileKey): number {
    const n = Math.pow(2, tileKey.level);
    const y = (tileKey.row + 0.5) / n;
    return Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
}

/** mgl meters→world-units factor at the tile's latitude. */
function secLatOf(tileKey: TileKey): number {
    return 1 / Math.max(0.2, Math.cos(tileCenterLatRad(tileKey)));
}

/**
 * [[Tile]] that carries the decoder-built model group into `tile.objects`.
 *
 * `useGeometryLoader` is false on the data source (these tiles have no flat
 * geometry/technique content), so the standard `Tile.load()` run leaves the
 * decoded tile unprocessed — this override then moves the `mbObjects` expando
 * into `tile.objects`, which is the array `TileObjectRenderer` renders.
 */
class MBBatchedModelTile extends Tile {
    /** The decodedTile whose mbObjects are currently in this.objects. */
    private m_attachedFor: any = null;

    async load(): Promise<void> {
        await super.load();
        if (this.disposed) return;
        const groups = (this.decodedTile as any)?.mbObjects;
        if (Array.isArray(groups) && groups.length > 0 && this.m_attachedFor !== this.decodedTile) {
            // A re-decode (runtime setPaint → markTilesDirty) produces fresh
            // groups — replace the previously attached ones, keep everything
            // else the engine put in `objects`.
            (this as any).objects = this.objects.filter(
                (o: any) => o?.name !== 'MBBatchedModelTile');
            for (const g of groups) this.objects.push(g);
            this.m_attachedFor = this.decodedTile;
        }
    }
}

export interface MBBatchedModelDataSourceOptions {
    /** DataSource name (must be unique per MapView). */
    name: string;
    /** GLB URL template, e.g. "local://models/landmark/mbx/{x}-{y}-{z}.glb". */
    srcTemplate: string;
    /** Source zoom range (mgl `minzoom`/`maxzoom`). */
    minzoom?: number;
    maxzoom?: number;
    /** Raw paint of the model layer (whole-tile styling fallback). */
    paint?: any;
    /** Model layer `filter` (mgl node feature filter, id/height props). */
    filter?: any;
    /** Datasource providing m_environment for the mgl lighting injection. */
    envProvider?: any;
    /** Live mapbox zoom for paint expression evaluation at decode time. */
    zoomProvider?: () => number;
}

export class MBBatchedModelDataSource extends TileDataSource<MBBatchedModelTile> {
    private readonly m_pending: BatchedPending;
    private readonly m_batchedDecoder: MBBatchedModelDecoder;

    constructor(options: MBBatchedModelDataSourceOptions) {
        const pending: BatchedPending = { n: 0 };
        const decoder = new MBBatchedModelDecoder(
            options.paint, options.envProvider,
            options.zoomProvider ?? (() => 0), pending);
        decoder.configure(undefined, { filter: options.filter,
            minCutoffZoom: options.minzoom ?? 14 } as any);
        const dsOptions: TileDataSourceOptions = {
            name: options.name,
            tilingScheme: webMercatorTilingScheme,
            dataProvider: new GLBTileDataProvider(options.srcTemplate, pending),
            decoder,
            minDataLevel: Math.max(1, options.minzoom ?? 1),
            maxDataLevel: options.maxzoom ?? 14,
            minDisplayLevel: 0,
            maxDisplayLevel: 20,
            storageLevelOffset: 0,
            enablePicking: false,
        };
        super(new TileFactory(MBBatchedModelTile), dsOptions);
        this.m_pending = pending;
        this.m_batchedDecoder = decoder;
        // Meshes are attached by MBBatchedModelTile.load — the flat-geometry
        // creation pass does not apply to GLB content.
        this.useGeometryLoader = false;
        this.cacheable = true;
        this.addGroundPlane = false;
        // Pre-decode frustum/clip bound (§547 probe: landmark z max ≈ 330 m,
        // × sec(48°) ≈ 495 world units).
        this.maxGeometryHeight = Math.max(this.maxGeometryHeight, 500);
    }

    /** Per-frame style sync listener (runtime setLights/setZoom parity). */
    private m_frameSync: (() => void) | null = null;

    /** @override */
    async connect(): Promise<void> {
        await super.connect();
        const mv: any = (this as any).mapView;
        if (mv?.addEventListener && !this.m_frameSync) {
            this.m_frameSync = () => this.m_batchedDecoder.syncStyleState();
            mv.addEventListener(MapViewEventNames.AfterRender, this.m_frameSync);
        }
    }

    /** @override */
    dispose(): void {
        const mv: any = (this as any).mapView;
        if (mv?.removeEventListener && this.m_frameSync) {
            mv.removeEventListener(MapViewEventNames.AfterRender, this.m_frameSync);
            this.m_frameSync = null;
        }
        super.dispose();
    }

    /**
     * Update the layer paint (style re-configure). markTilesDirty forces the
     * cached tiles through a fresh decode so runtime setPaintProperty ops
     * (part styling) re-evaluate with the new paint.
     */
    setPaint(paint: any): void {
        this.m_batchedDecoder.configure(undefined, { paint: paint ?? {} } as any);
        (this as any).mapView?.markTilesDirty?.(this);
        this.requestUpdate();
    }

    /**
     * Update the model layer filter (mgl runtime setFilter → bucket.setFilter).
     * Built meshes keep their node ids, so this toggles visibility in place.
     */
    setFilter(filter: any): void {
        this.m_batchedDecoder.configure(undefined, { filter } as any);
        this.requestUpdate();
    }

    /** True while GLB tiles are fetching or decoding (harness wait window). */
    isLoading(): boolean {
        return this.m_pending.n > 0;
    }
}
