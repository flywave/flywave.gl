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
import { getModelFootprintBoxCount, registerModelFootprintRing } from './MBModelFootprints';
import { applyMeshFeatures, applyModelFrontCutoff, applyModelFarCutoff, mglMeasureLightBrightness } from './MBMeshFeatures';
import { MBExpressionEngine } from './MBExpressionEngine';
import { shadowCasters } from './MBShadowRenderer';

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
                a.startsWith('mbbatchdbg='))?.slice('mbbatchdbg='.length) === '1'
            || (globalThis as any).__mbBatchedDbgForce === true;
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
            // LOD tiles (mbx_bvh, newer tiler) encode baked AO in the feature
            // vertex-color alpha — mgl isLodMesh multiplies it into rgb.
            let isLodTile = false;
            // Meshopt tiles can carry MAPBOX_mesh_features too (mbx-lod) —
            // the per-part styling path must not be Draco-only.
            let mbxFeatures = false;
            try {
                const { json } = parseGlb(data);
                meshopt = Array.isArray(json?.extensionsUsed)
                    && json.extensionsUsed.includes('EXT_meshopt_compression');
                isLodTile = Array.isArray(json?.extensionsUsed)
                    && json.extensionsUsed.includes('mbx_bvh');
                // mgl worker source: extensionsUsed OR asset.extras flag
                // (the meshopt tiler only sets the extras form).
                mbxFeatures = (Array.isArray(json?.extensionsUsed)
                    && json.extensionsUsed.includes('MAPBOX_mesh_features'))
                    || json?.asset?.extras?.MAPBOX_mesh_features === true;
            } catch { /* fall through to the Draco path */ }

            const w = EQUATORIAL_CIRCUMFERENCE / Math.pow(2, tileKey.level) / TILE_GRID;
            const secLat = secLatOf(tileKey);
            const inner = new THREE.Group();
            inner.name = 'MBBatchedModelGrid';
            let hasMeshFeatures = false;
            // model-ambient-occlusion-intensity (style-spec default 1).
            const aoIntensity = this.evalPaintNumber('model-ambient-occlusion-intensity', 1);

            if (meshopt) {
                hasMeshFeatures = mbxFeatures;
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
                    // mgl convertFootprints: nodes carrying
                    // mapbox:footprint:id/version are footprint-only and are
                    // REMOVED after their geometry is parsed into node.footprint
                    // — they must never render.
                    for (let p: any = o; p; p = p.parent) {
                        if (p.userData?.['mapbox:footprint:id'] !== undefined
                            || p.userData?.['mapbox:footprint:version'] !== undefined) {
                            o.userData.__mbFootprint = true;
                            o.visible = false;
                            const fpid = p.userData?.['mapbox:footprint:id'];
                            if (fpid !== undefined) o.userData.__mbFootprintId = String(fpid);
                            break;
                        }
                    }
                    if (o.isMesh) {
                        // V2 tile: featureColor in the LOW 16 bits, part id
                        // in bits 16..19 (mgl updateNodeFeatureVertices swaps
                        // the V1 halves under EXT_meshopt_compression). The
                        // meshopt tiler names the attribute _FEATURE_ID_RGBA4444
                        // (Draco tiles: _FEATURE_RGBA4444) — normalize it so
                        // MBMeshFeatures finds one canonical name.
                        const geo: THREE.BufferGeometry | undefined = o.geometry;
                        if (geo?.getAttribute) {
                            if (!geo.getAttribute('_feature_rgba4444')
                                && geo.getAttribute('_feature_id_rgba4444')) {
                                geo.setAttribute('_feature_rgba4444',
                                    geo.getAttribute('_feature_id_rgba4444'));
                            }
                            if (geo.getAttribute('_feature_rgba4444')) {
                                geo.userData.__mbFeatV2 = true;
                                if (isLodTile) geo.userData.__mbFeatLod = true;
                            }
                        }
                        // Filter at DRAW visibility (mgl getNodesInfo) — the
                        // Draco branch does the same per primitive. Footprint
                        // nodes stay hidden (mgl removes them entirely).
                        o.visible = !o.userData.__mbFootprint && this.nodePassesFilter(
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
                        // §634 conflation: footprint-only nodes are removed by
                        // mgl (convertFootprints) — never render them.
                        if (tileData.nodeFootprints?.[meshIdx] !== undefined) {
                            mesh.userData.__mbFootprint = true;
                            // mgl convertFootprints: the footprint matches its
                            // feature node by id — the elevation source.
                            mesh.userData.__mbFootprintId =
                                tileData.nodeFootprints[meshIdx];
                            mesh.visible = false;
                            inner.add(mesh);
                            continue;
                        }
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
            // mgl elevationUpdate gates DEM flattening on HasMapboxMeshFeatures.
            inner.userData.__mbHasFeatures = hasMeshFeatures;
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
            // §560: batched-model buildings are shadow CASTERS (mgl
            // shadow_renderer renders every model node into the depth map).
            // Layer 1 per descendant (three tests per-renderable layers);
            // door-light beams (mgl isLight meshes) never cast.
            outer.traverse((o: any) => {
                const m = o.isMesh && o.material
                    ? (Array.isArray(o.material) ? o.material[0] : o.material) : null;
                if (!(m as any)?.__mbIsLights) o.layers.enable(1);
            });
            shadowCasters.add(outer);

            // World-space height bound for the tile bounding box (z already
            // scaled by secLat inside `inner`).
            let maxZ = 0;
            try {
                const box = new THREE.Box3().setFromObject(inner);
                if (isFinite(box.max.z)) maxZ = box.max.z;
            } catch { /* keep the data-source-level bound */ }

            // mgl convertFootprints: footprint-only nodes are parsed into the
            // MATCHING feature node (by id) as its terrain footprint, then
            // removed. Capture each footprint ring (subsampled, mesh-local —
            // matrixWorld at frame time carries the tile + node transforms)
            // and attach it to every drawn mesh of the matching node.
            try {
                const fpRings = new Map<string, Float32Array>();
                inner.traverse((o: any) => {
                    if (!o.isMesh || o.userData?.__mbFootprint !== true) return;
                    const id = o.userData?.__mbFootprintId;
                    if (id === undefined) return;
                    const pos = o.geometry?.getAttribute?.('position');
                    if (!pos || pos.count < 3) return;
                    const step = Math.max(1, Math.floor(pos.count / 32));
                    const pts: number[] = [];
                    for (let i = 0; i < pos.count; i += step) {
                        pts.push(pos.getX(i), pos.getY(i));
                    }
                    fpRings.set(String(id), new Float32Array(pts));
                });
                if (fpRings.size > 0) {
                    inner.traverse((o: any) => {
                        if (!o.isMesh || o.userData?.__mbFootprint === true) return;
                        const nodeId = o.userData?.__mbNodeId;
                        if (nodeId === undefined) return;
                        const ring = fpRings.get(String(nodeId));
                        if (ring) o.userData.__mbFootprintLocal = ring;
                    });
                }
            } catch { /* footprint capture is best-effort */ }

            // §634 conflation replacement: register every footprint node's
            // world bbox so fill-extrusion features under the model can be
            // suppressed at decode time (mgl model-layer conflation).
            try {
                inner.updateMatrixWorld(true);
                const n = Math.pow(2, tileKey.level);
                const latRad = tileCenterLatRad(tileKey);
                const cLat = latRad * 180 / Math.PI;
                const cLng = (tileKey.column + 0.5) / n * 360 - 180;
                const cosLat = Math.max(0.01, Math.cos(latRad));
                const metersPerDegLng = 111320 * cosLat;
                const metersPerDegLat = 110574;
                const beforeBoxes = getModelFootprintBoxCount();
                const v = new THREE.Vector3();
                inner.traverse((o: any) => {
                    if (!o.isMesh || o.userData?.__mbFootprint !== true) return;
                    const pos = o.geometry?.getAttribute?.('position');
                    if (!pos || pos.count < 3) return;
                    // Node world transform → tile-center meters (x east, y
                    // north) → lng/lat ring. matrixWorld carries the meshopt/
                    // draco y-mirror conventions, so no local sign handling.
                    const ring: number[][] = [];
                    for (let i = 0; i < pos.count; i++) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                        ring.push([
                            cLng + v.x / metersPerDegLng,
                            cLat + v.y / metersPerDegLat,
                        ]);
                    }
                    registerModelFootprintRing(ring);
                });
                // Models arrived after the vector tiles decoded: force a
                // re-decode so the extrusion suppression takes effect. Only on
                // genuinely NEW coverage — re-registers must not loop.
                if (getModelFootprintBoxCount() > beforeBoxes) {
                    (this.m_envProvider as any)?.notifyConflationCoverageAdded?.();
                }
            } catch { /* conflation is best-effort */ }

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
    /**
     * mgl bucket.elevationUpdate + drawBatchedModels placement: a node with
     * a footprint sits at the MINIMUM terrain elevation over its footprint
     * ring (node.elevation = min dem.getElevationAt(vert)), lifted in the
     * translation-z slot before model-scale. The ring is mesh-local; the
     * current matrixWorld (RTE frame) + the world camera position resolve it
     * to the absolute world xy the terrain sampler expects. Terrain off →
     * zero lift (mgl gates on painter.terrain && exaggeration > 0). Runs
     * every frame: sampling is deterministic, so a static scene is stable.
     */
    private applyNodeElevation(outer: any): void {
        // mgl elevationUpdate order: updateDEM (flatten) FIRST, then the
        // per-node min sampling — nodes read the already-flattened DEM.
        try {
            this.applyDemFlattening(outer);
        } catch { /* flattening must never break the frame */ }
        const env = (this.m_envProvider as any)?.m_environment;
        const cam = env?.m_mapView?.camera;
        const active = !!(env?.sampleTerrainElevation && cam && (env as any).__mbTerrainActive);
        const camX = active ? cam.position.x : 0;
        const camY = active ? cam.position.y : 0;
        const v = new THREE.Vector3();
        outer.traverse((mesh: any) => {
            if (!mesh.isMesh) return;
            const ring = mesh.userData.__mbFootprintLocal as Float32Array | undefined;
            if (!ring || ring.length < 6) return;
            let liftLocal = 0;
            if (active) {
                const inner = outer.children[0] as any;
                const secLat = Math.abs(inner?.scale?.z) || 1;
                let minElev = Infinity;
                for (let i = 0; i < ring.length; i += 2) {
                    v.set(ring[i], ring[i + 1], 0).applyMatrix4(mesh.matrixWorld);
                    const e = env.sampleTerrainElevation(v.x + camX, v.y + camY);
                    if (e !== null && isFinite(e) && e < minElev) minElev = e;
                }
                // world-units lift → mesh-local z (inner scales z by secLat).
                if (isFinite(minElev)) liftLocal = minElev / secLat;
            }
            mesh.userData.__mbElevLift = liftLocal;
        });
    }

    /**
     * mgl bucket.updateDEM (tiled_3d_model_bucket.ts:416-575): flatten the
     * DEM under each footprint — region A (pixels the footprint covers) is
     * set to the average height over those pixels; region B (demAtt padding,
     * clamped [2,5]) propagates the delta outward with distance attenuation
     * and wave prevention. Only for MAPBOX_mesh_features tiles; footprints
     * crossing the DEM tile border are skipped (mgl distanceToBorder < 0).
     * Applied once per (footprint, DEM texture): the guard lives on the
     * texture so a terrain rebuild (fresh texture) re-flattens.
     */
    private applyDemFlattening(outer: any): void {
        const env = (this.m_envProvider as any)?.m_environment;
        const tc = env?.m_terrainController;
        const cam = env?.m_mapView?.camera;
        if (!tc || !cam || !(env as any).__mbTerrainActive) return;
        const inner = outer.children[0] as any;
        if (inner?.userData?.__mbHasFeatures !== true) return;
        const tiles: Array<{ texture: any; originX: number; originY: number; size: number }> =
            tc.allDemTiles ?? [];
        if (tiles.length === 0) return;
        const camX = cam.position.x;
        const camY = cam.position.y;
        const v = new THREE.Vector3();
        // Scratch buffers sized per DEM texture resolution (shared across
        // footprints — mgl uses module-level lookup/passLookup arrays with
        // the same region-reset discipline).
        let pass: Uint8Array | null = null;
        let lookup: Float64Array | null = null;
        let demRes = 0;

        outer.traverse((mesh: any) => {
            if (!mesh.isMesh) return;
            const ring = mesh.userData.__mbFootprintLocal as Float32Array | undefined;
            if (!ring || ring.length < 6) return;
            const wx: number[] = [];
            const wy: number[] = [];
            for (let i = 0; i < ring.length; i += 2) {
                v.set(ring[i], ring[i + 1], 0).applyMatrix4(mesh.matrixWorld);
                wx.push(v.x + camX);
                wy.push(v.y + camY);
            }
            let minWX = Infinity, maxWX = -Infinity, minWY = Infinity, maxWY = -Infinity;
            for (let i = 0; i < wx.length; i++) {
                if (wx[i] < minWX) minWX = wx[i];
                if (wx[i] > maxWX) maxWX = wx[i];
                if (wy[i] < minWY) minWY = wy[i];
                if (wy[i] > maxWY) maxWY = wy[i];
            }
            for (const tile of tiles) {
                if (maxWX < tile.originX || minWX > tile.originX + tile.size
                    || maxWY < tile.originY || minWY > tile.originY + tile.size) continue;
                const tex = tile.texture;
                const data = tex?.image?.data as Float32Array | undefined;
                if (!data) continue;
                const n = Math.floor(Math.sqrt(data.length));
                if (n <= 2) continue;
                const done: Set<string> = (tex.userData ??= {}).__mbFlatKeys ??= new Set();
                const key = String(mesh.userData.__mbNodeId ?? mesh.uuid);
                if (done.has(key)) continue;
                done.add(key);
                if (!pass || demRes !== n) {
                    demRes = n;
                    pass = new Uint8Array(n * n);
                    lookup = new Float64Array(n * n);
                }
                const get = (x: number, y: number) => data[y * n + x];
                const set = (x: number, y: number, val: number) => {
                    const idx = y * n + x;
                    const delta = val - data[idx];
                    data[idx] = val;
                    return delta;
                };
                const pxOf = (w: number, origin: number) =>
                    Math.floor((w - origin) / tile.size * n);
                const minDemX = pxOf(minWX, tile.originX);
                const maxDemX = pxOf(maxWX, tile.originX);
                // DEM rows run north→south in data order — sampleElevation
                // reads row n−1−v (v = south-positive world fraction). The
                // write path must use the SAME flip or the terrain is
                // flattened at the mirrored location.
                const minDemY = (n - 1) - pxOf(maxWY, tile.originY); // north edge
                const maxDemY = (n - 1) - pxOf(minWY, tile.originY); // south edge
                const worldYofRow = (y: number) =>
                    tile.originY + ((n - 1 - y) + 0.5) / n * tile.size;
                const distanceToBorder = Math.min(n - maxDemY, minDemX, minDemY, n - maxDemX);
                if (distanceToBorder < 0) continue; // mgl: skip tile-border crossings
                const demAtt = Math.min(5, Math.max(2, distanceToBorder));
                const minx0 = Math.max(0, minDemX - demAtt);
                const miny0 = Math.max(0, minDemY - demAtt);
                const maxx0 = Math.min(maxDemX + demAtt, n - 1);
                const maxy0 = Math.min(maxDemY + demAtt, n - 1);
                for (let y = miny0; y <= maxy0; ++y) {
                    for (let x = minx0; x <= maxx0; ++x) pass![y * n + x] = 255;
                }
                // Region A: DEM pixels whose center is inside the footprint.
                let heightAcc = 0;
                let count = 0;
                const polyTest = (pxW: number, pyW: number) => {
                    let inside = false;
                    for (let i = 0, j = wx.length - 1; i < wx.length; j = i++) {
                        const xi = wx[i], yi = wy[i], xj = wx[j], yj = wy[j];
                        if (((yi > pyW) !== (yj > pyW))
                            && (pxW < (xj - xi) * (pyW - yi) / (yj - yi) + xi)) inside = !inside;
                    }
                    return inside;
                };
                for (let y = Math.max(0, minDemY); y <= Math.min(n - 1, maxDemY); ++y) {
                    for (let x = Math.max(0, minDemX); x <= Math.min(n - 1, maxDemX); ++x) {
                        const idx = y * n + x;
                        if (pass![idx] !== 255) continue;
                        if (!polyTest(tile.originX + (x + 0.5) / n * tile.size,
                            worldYofRow(y))) continue;
                        pass![idx] = 0;
                        heightAcc += get(x, y);
                        count++;
                    }
                }
                if (!count) continue;
                const avgHeight = heightAcc / count;
                let minx = Math.max(1, minDemX - demAtt);
                let miny = Math.max(1, minDemY - demAtt);
                let maxx = Math.min(maxDemX + demAtt, n - 2);
                let maxy = Math.min(maxDemY + demAtt, n - 2);
                for (let y = miny; y <= maxy; ++y) {
                    for (let x = minx; x <= maxx; ++x) {
                        if (pass![y * n + x] === 0) {
                            lookup![y * n + x] = set(x, y, avgHeight);
                        }
                    }
                }
                // Region B: attenuated outward propagation (wave-prevented).
                for (let p = 1; p < demAtt; ++p) {
                    minx = Math.max(1, minDemX - p);
                    miny = Math.max(1, minDemY - p);
                    maxx = Math.min(maxDemX + p, n - 2);
                    maxy = Math.min(maxDemY + p, n - 2);
                    for (let y = miny; y <= maxy; ++y) {
                        for (let x = minx; x <= maxx; ++x) {
                            const idxThis = y * n + x;
                            if (pass![idxThis] !== 255) continue;
                            let maxDiff = 0;
                            let maxDiffAbs = 0;
                            let xoffset = -1;
                            let yoffset = -1;
                            for (let j = -1; j <= 1; ++j) {
                                for (let i = -1; i <= 1; ++i) {
                                    const idx = (y + j) * n + (x + i);
                                    if (pass![idx] >= p) continue;
                                    const diff = lookup![idx];
                                    const diffAbs = Math.abs(diff);
                                    if (diffAbs > maxDiffAbs) {
                                        maxDiff = diff;
                                        maxDiffAbs = diffAbs;
                                        xoffset = i;
                                        yoffset = j;
                                    }
                                }
                            }
                            if (maxDiffAbs > 0.1) {
                                const diagonalAttenuation = Math.abs(xoffset * yoffset) * 0.5;
                                const attenuation = 1 - (p + diagonalAttenuation) / demAtt;
                                const prev = get(x, y);
                                let next = prev + maxDiff * attenuation;
                                const parent = get(x + xoffset, y + yoffset);
                                const child = get(x - xoffset, y - yoffset);
                                if ((next - parent) * (next - child) > 0) {
                                    next = (parent + child) / 2;
                                }
                                lookup![idxThis] = set(x, y, next);
                                pass![idxThis] = p;
                            }
                        }
                    }
                }
                tex.needsUpdate = true; // mgl needsDEMTextureUpload
            }
        });
    }

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
            if (!mesh.isMesh) return;
            // mgl draw_model:1308: anchorX = node.anchor ? node.anchor[0] : 0
            // — anchor defaults to (0,0) and the transform applies to EVERY
            // node (anchorless nodes still take model-translation).
            const anchor: [number, number] = mesh.userData.__mbAnchor ?? [0, 0];
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
                const lift0 = mesh.userData.__mbElevLift ?? 0;
                if (!lift0) {
                    mesh.matrixAutoUpdate = mesh.userData.__mbWasAutoUpdate;
                    mesh.matrix.copy(base);
                } else {
                    // With a lift the matrix must stick: autoUpdate would
                    // recompose from position/quaternion/scale and drop it.
                    mesh.matrixAutoUpdate = false;
                    mesh.matrix.copy(base);
                    // Parent-frame z: adds after the base translation.
                    mesh.matrix.elements[14] += lift0;
                }
                mesh.matrixWorldNeedsUpdate = true;
                return;
            }
            const lift = mesh.userData.__mbElevLift ?? 0;
            const t = new THREE.Vector3(
                anchor[0] * (mScale[0] - 1) + (mTrans[0] ? mTrans[0] / metersPerGrid : 0),
                anchor[1] * (mScale[1] - 1) + (mTrans[1] ? mTrans[1] / metersPerGrid : 0),
                (mTrans[2] ?? 0) + lift);
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
            // mgl prepareBatched order: elevationUpdate BEFORE
            // evaluateTransform — the lift feeds the node translation.
            this.applyNodeElevation(outer);
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
        this.pixPickProbe();
    }

    /**
     * §711: screen-space surface identification (mbbatchdbg=1 + karma arg
     * `pix=x,y`) — raycast the pixel into every built tile group and dump
     * the hit chain (node id / material baseColor / vertex part histogram)
     * so an expected-crop pixel can be attributed to a mesh + color source.
     */
    private m_pixProbed = false;
    private pixPickProbe(): void {
        if (this.m_pixProbed || !batchedDiagEnabled()) return;
        const mv: any = (this.m_envProvider as any)?.mapView;
        const pixArg = (window as any).__karma__?.config?.args
            ?.find?.((a: string) => a.startsWith('pix='))?.slice(4);
        if (!mv || pixArg === undefined) return;
        this.m_pixProbed = true;
        const dump = (payload: Record<string, unknown>): void => {
            const fb = (window as any).__karma__?.config?.args
                ?.find?.((a: string) => a.startsWith('feedback-url='))
                ?.slice('feedback-url='.length);
            if (fb) {
                fetch(`${fb}/mb-probe-dump`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                }).catch(() => {});
            }
        };
        try {
            const cam: any = mv.camera;
            const ray = new THREE.Raycaster();
            // §712 grid mode (`pix=grid`): sample every 64px, classify each
            // pixel as batched-model hit (with node id) vs miss (procedural
            // extrusion / ground) — the surface-ownership map for the
            // z-offset family.
            if (pixArg === 'grid') {
                const W = mv.canvas?.clientWidth || 512;
                const H = mv.canvas?.clientHeight || 512;
                for (const g of this.m_builtGroups) g.updateMatrixWorld(true);
                const cells: Record<string, unknown>[] = [];
                for (let py = 32; py < H; py += 64) {
                    for (let px = 32; px < W; px += 64) {
                        ray.setFromCamera(new THREE.Vector2(
                            (px / W) * 2 - 1, -((py / H) * 2 - 1)), cam);
                        const hits = ray.intersectObjects([...this.m_builtGroups], true);
                        const hit: any = hits[0];
                        cells.push({
                            px, py,
                            model: !!hit,
                            nodeId: hit ? (hit.object.userData?.__mbNodeId ?? null) : null,
                            dist: hit ? +hit.distance.toFixed(1) : null,
                        });
                    }
                }
                dump({ probe: 'pixpick', mode: 'grid', W, H, cells,
                    groups: this.m_builtGroups.size });
                return;
            }
            const [pxs, pys] = pixArg.split(',').map(s => parseInt(s, 10));
            ray.setFromCamera(new THREE.Vector2(
                (pxs / (mv.canvas?.clientWidth || 512)) * 2 - 1,
                -((pys / (mv.canvas?.clientHeight || 512)) * 2 - 1)), cam);
            for (const g of this.m_builtGroups) g.updateMatrixWorld(true);
            const hits = ray.intersectObjects([...this.m_builtGroups], true);
            const hitInfo = hits.slice(0, 5).map(hit => {
                const m = hit.object as any;
                const mat = Array.isArray(m.material) ? m.material[0] : m.material;
                const hist: Record<string, number> = {};
                const feat = m.geometry?.getAttribute?.('_feature_rgba4444');
                if (feat) {
                    const u16 = feat.array as Uint16Array;
                    const cnt = Math.min(feat.count, 20000);
                    for (let i = 0; i < cnt; i++) {
                        const u32 = (u16[i * 2] | (u16[i * 2 + 1] << 16)) >>> 0;
                        const part = u32 & 0xf;
                        hist['p' + part] = (hist['p' + part] ?? 0) + 1;
                    }
                }
                return {
                    dist: +hit.distance.toFixed(2),
                    nodeId: m.userData?.__mbNodeId ?? null,
                    part: m.userData?.__mbPart,
                    baseColor: mat?.color ? mat.color.toArray().map(v => +v.toFixed(3)) : null,
                    opacity: mat?.opacity,
                    vertexColors: !!mat?.vertexColors,
                    hist,
                };
            });
            dump({ probe: 'pixpick', pix: [pxs, pys], hits: hitInfo,
                groups: this.m_builtGroups.size });
        } catch (e) {
            dump({ probe: 'pixpick', pixErr: String((e as Error)?.stack ?? e) });
        }
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
            geo.userData.__mbFeatV2 = prim.meshoptV2 === true;
            geo.userData.__mbFeatLod = prim.featureAoAlpha === true;
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
            const aoTex = occlusionMaps[m.occlusionTextureIndex];
            const xf = m.occlusionTransform;
            if (xf) {
                // mgl OCCLUSION_TEXTURE_TRANSFORM: uv·scale+offset — three's
                // aoMapTransform (repeat/offset) composes the same; the clone
                // keeps per-material transforms off the shared tile texture.
                const t2 = aoTex.clone();
                t2.repeat.set(xf[0], xf[1]);
                t2.offset.set(xf[2], xf[3]);
                t2.needsUpdate = true;
                mat.aoMap = t2;
            } else {
                mat.aoMap = aoTex;
            }
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
            applyMglModelLighting(this.m_envProvider, model, emissive, tint,
                undefined, undefined, undefined,
                paint?.["model-color-use-theme"] === "none");
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
            // mgl mapbox zooms reach 22 (= flywave zoom 23); a display cap of
            // 20 silently disabled the source for zoom-20.6+ fixtures
            // (indirect-doors-no-shadows: tiles were never scheduled).
            maxDisplayLevel: 26,
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
