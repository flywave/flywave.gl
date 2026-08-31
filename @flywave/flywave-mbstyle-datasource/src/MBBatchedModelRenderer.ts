/**
 * §540/§547/§549: batched-model source support (mgl `tiled_3d_model_source`).
 *
 * A `type: "batched-model"` source's tiles are whole GLB files whose vertex
 * positions live in the tile's LOCAL QUANTIZED GRID (extent ≈ 8192 units per
 * axis) while z is METERS (probe: Frauenkirche z max 101.15 ≈ its 99 m
 * tower; mgl renders tile models with zScaleMatrix = [1,1,pixelsPerMeter]).
 * For each registered source this renderer fetches the tile covering GLB for
 * the live camera tile (round(zoom) clamped to the source maxzoom), decodes
 * Draco on the page main thread (§547 — DRACOLoader's Blob-URL worker never
 * spawns in the karma page; GLTFLoader's async image pipeline additionally
 * hangs there intermittently, so the scene is built directly — mgl converts
 * GLBs manually through convertModel for the same reason), and rides the
 * ENGINE's render path: the model group is pushed into a RENDERED tile's
 * `objects` array (§549 — TileObjectsRenderer re-adds tile.objects to
 * m_sceneRoot each frame with its own RTE rebase; scene-attached meshes are
 * dropped by the engine's scene filtering at high pitch, §197 red probe
 * 0 px at 70, re-confirmed with a minimal red-box test).
 *
 * Model-layer paint styling: MAPBOX_mesh_features tiles get mgl's per-part
 * table (MBMeshFeatures); plain tiles get the layer's whole-tile paint.
 */

import * as THREE from 'three';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';
import { applyMglModelLighting } from './MBModelRenderer';
import { decodeGlbTile, TileMaterialData, TilePrimitiveData } from './MBDracoDecoder';
import { applyMeshFeatures } from './MBMeshFeatures';

interface BatchedSource {
    sourceId: string;
    tiles: string[];
    maxzoom: number;
    layer: any;
}

interface TileEntry {
    key: string;
    source: BatchedSource;
    /** Model group in GLB-local coordinates (scaled). */
    model: THREE.Group | null;
    /** GLB tile coordinates (standard north-up web-mercator). */
    x: number; y: number; z: number;
    __parsed: boolean;
}

export class MBBatchedModelRenderer {
    private m_entries: TileEntry[] = [];
    private m_inflight = new Set<string>();
    private m_eye = new THREE.Vector3();
    private m_carrier: any = null;
    private m_carrierGroup: THREE.Group | null = null;

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
        private m_sources: BatchedSource[],
    ) {}

    /** Per-frame entry point (AfterRender). */
    run(): void {
        (globalThis as any).__mbBatchedRun = ((globalThis as any).__mbBatchedRun ?? 0) + 1;
        if (this.m_sources.length === 0) return;

        this.updateEye();
        this.requestTiles();
        const st: any = (globalThis as any).__mbBatched;
        if (st) {
            st.rendered = this.m_entries.filter(e => e.__parsed && e.model).length;
            const cam = (this.m_mapView as any)?.camera;
            if (cam) { st.camNear = cam.near; st.camFar = cam.far; }
        }
    }

    /**
     * §549: called from the datasource's WillRender listener — AFTER the
     * engine's per-frame `m_sceneRoot.children.length = 0` and tile loop,
     * BEFORE the main render. Models are added straight to m_sceneRoot with
     * their RTE position (absolute anchor − camera position), so the main
     * render draws them this very frame. (tile.objects riding was tried and
     * the tile loop still skipped the group — the engine's per-frame root
     * rebuild only re-adds objects its own pipeline owns.)
     */
    attachForRender(mapView: any, scene: any): void {
        const stat0: any = (globalThis as any).__mbBatched;
        if (stat0) stat0.attach = (stat0.attach ?? 0) + 1;
        if (this.m_sources.length === 0) return;
        const root = mapView?.m_sceneRoot;
        if (!root || !scene) return;
        this.updateEye();
        const st: any = (globalThis as any).__mbBatched;
        if (!this.m_carrierGroup) {
            this.m_carrierGroup = new THREE.Group();
            this.m_carrierGroup.name = 'MBBatchedCarrier';
            this.m_carrierGroup.renderOrder = 10;
        }
        const keep = this.m_entries.filter(e => e.__parsed && e.model);
        // §549: carrier = a tile the ENGINE itself renders (its center is in
        // the engine frame near the camera by construction). Position each
        // model by the STANDARD-frame offset between its GLB tile center and
        // the carrier tile center — a frame-independent delta (both ends in
        // the same standard mercator frame cancel the absolute-frame question).
        // §549: carrier = the first tile the ENGINE itself renders this frame.
        const list = mapView?.m_visibleTiles?.dataSourceTileList;
        let carrier: any = null;
        for (const l of list ?? []) {
            if (l.renderedTiles?.values) {
                for (const t of l.renderedTiles.values()) { carrier = t; break; }
            }
            if (carrier) break;
        }
        if (!carrier) return;
        const R = 40075016.686;
        const ck: any = carrier.tileKey;
        const cDim = Math.pow(2, ck?.level ?? 0);
        const ccx = ((ck?.column ?? 0) + 0.5) / cDim * R;
        const ccy = ((ck?.row ?? 0) + 0.5) / cDim * R;
        for (const e of keep) {
            if (e.model.parent !== this.m_carrierGroup) {
                this.m_carrierGroup.add(e.model);
            }
            const gn = Math.pow(2, e.z);
            const gx = ((e.x + 0.5) / gn) * R;
            const gy = ((e.y + 0.5) / gn) * R;
            e.model.position.set(gx - ccx, gy - ccy, 0);
        }
        // §549 CRITICAL: the engine clears the root via
        // `m_sceneRoot.children.length = 0`, which does NOT reset
        // child.parent — a `parent !== root` guard would skip the re-add
        // forever. Force the link every frame.
        if (this.m_carrierGroup.parent !== root) {
            this.m_carrierGroup.parent = null;
        }


        // §549: force the carrier (and probe box) into the engine root.
        if (this.m_carrierGroup.parent !== root) {
            this.m_carrierGroup.parent = null;
        }
        root.add(this.m_carrierGroup);
        if (st) {
            st.rendered = keep.length;
            st.inRoot = root.children.indexOf(this.m_carrierGroup) >= 0 ? 1 : 0;
            const eng = root.children[0];
            if (eng) {
                st.engCtor = eng.constructor.name;
                st.ourCtor = this.m_carrierGroup.constructor.name;
                // §549 decisive: cross-instance instanceof (false ⇒ dual THREE).
                st.engIsOurObj3D = eng instanceof THREE.Object3D ? 1 : 0;
            }
        }
    }

    private updateEye(): void {
        try {
            // §549: the engine's rebase subtracts THIS.m_CAMERA.position (the
            // actual camera, pitched back from the map target) — geoCenter is
            // the TARGET point and diverges from it by the pitch offset.
            const camPos = (this.m_mapView as any)?.camera?.position;
            if (camPos) {
                this.m_eye.copy(camPos);
                return;
            }
            const gc = this.m_mapView.geoCenter;
            const pr = this.m_mapView.projection;
            if (gc && pr) {
                const eye = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                this.m_eye.set(eye.x, eye.y, eye.z);
            }
        } catch {}
    }

    /** Fetch/track the covering GLB tiles for the current camera tile. */
    private requestTiles(): void {
        const mapView = this.m_mapView;
        const zoom = mapView.zoomLevel ?? 0;
        const cam = mapView.geoCenter;
        if (!cam) return;

        for (const src of this.m_sources) {
            const z = Math.min(Math.round(zoom), src.maxzoom);
            const n = Math.pow(2, z);
            // Standard web-mercator tile coords (NORTH-up y, per the GLB
            // file naming) — NOT the engine projection's south-positive y.
            const tx = Math.floor(((cam.longitude + 180) / 360) * n);
            const mercN = Math.log(Math.tan(Math.PI * 0.25 + (cam.latitude * Math.PI / 180) * 0.5));
            const ty = Math.max(0, Math.min(n - 1,
                Math.floor(((1 - mercN / Math.PI) / 2) * n)));
            // center tile + 8 neighbors (pitch-70 views span multiple tiles).
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                const x = tx + dx, y = ty + dy;
                if (x < 0 || y < 0 || x >= n || y >= n) continue;
                this.requestTile(src, z, x, y, `${z}-${x}-${y}-${src.sourceId}`);
            }
        }
    }

    private requestTile(src: BatchedSource, z: number, x: number, y: number, key: string): void {
        if (this.m_entries.some(e => e.key === key)) return;
        if (this.m_inflight.has(key)) return;
        const template = src.tiles[0];
        if (!template) return;
        const url = template
            .replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        this.m_inflight.add(key);
        // track the pending tile so isLoading() covers the decode window.
        const entry: TileEntry = { key, source: src, model: null, x, y, z, __parsed: false };
        this.m_entries.push(entry);
        const stat: any = ((globalThis as any).__mbBatched ??= { fetch: 0, ok: 0, parsed: 0, err: '' });
        stat.fetch++;
        void fetch(url)
            .then(r => {
                this.m_inflight.delete(key);
                if (!r.ok) { stat.err = 'HTTP ' + r.status; throw new Error(String(r.status)); }
                return r.arrayBuffer();
            })
            .then(async buf => {
                stat.ok++;
                // §547/§549: decode Draco on the page main thread and build
                // the THREE scene directly (see header).
                try {
                    const tile = await decodeGlbTile(buf);
                    stat.decoded = (stat.decoded ?? 0) + 1;
                    const model = new THREE.Group();
                    model.name = 'MBBatchedModelTile';
                    for (const prims of tile.nodes) {
                        for (const prim of prims) {
                            model.add(this.buildPrimitiveMesh(prim, tile.materials));
                        }
                    }
                    model.scale.set(this.computeScale(z), this.computeScale(z), 1);
                    // §656: the mercator ground-stretch (x/y × 1/cos(lat),
                    // mgl modelPixelsPerMeter semantics) was tested here —
                    // MIXED results (z-offset-v2 −82k but station/highlights
                    // +66~68k): the mesh_features tile placement must follow
                    // the TILESET's own transform matrix semantics, not a
                    // blanket formula — see §656 notes. Reverted pending the
                    // tiled_3d_model_bucket transform port.
                    entry.model = model;
                    entry.x = x; entry.y = y; entry.z = z;
                    const paint = (src as any).paint ?? {};
                    if (tile.hasMeshFeatures) {
                        // §547: per-part styling over MAPBOX_mesh_features
                        // (mgl PartNames table + 4444 vertex-color bake).
                        applyMeshFeatures(model, paint,
                            this.m_mapView?.zoomLevel ?? 0, this.m_dataSource);
                    } else {
                        // whole-tile single style (§539 phase 1): the model
                        // layer's evaluated paint (mix/emissive/roughness/opacity).
                        this.applyLayerPaint(model, paint);
                    }
                    stat.parsed++;
                } catch (e: any) {
                    stat.parseErr = String(e?.stack ?? e).slice(0, 200);
                } finally {
                    entry.__parsed = true;
                }
            })
            .catch((e: any) => {
                stat.err = 'FETCH ' + String(e).slice(0, 120) + ' ' + url.slice(-60);
                entry.__parsed = true;
            });
    }

    /** Build one decoded primitive into a THREE mesh (glTF material map). */
    private buildPrimitiveMesh(
        prim: TilePrimitiveData, materials: TileMaterialData[],
    ): THREE.Mesh {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(prim.positions, 3));
        if (prim.normals) geo.setAttribute('normal', new THREE.BufferAttribute(prim.normals, 3));
        if (prim.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(prim.uvs, 2));
        if (prim.features) {
            // Name matches the lowercase attribute GLTFLoader would produce;
            // MBMeshFeatures consumes it for per-part styling.
            geo.setAttribute('_feature_rgba4444', new THREE.BufferAttribute(prim.features, 2));
            geo.userData.__mbFeatV2 = prim.meshoptV2 === true;
            geo.userData.__mbFeatLod = prim.featureAoAlpha === true;
        }
        geo.setIndex(new THREE.BufferAttribute(prim.indices, 1));

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
        });
        if (m?.baseColorFactor && m.baseColorFactor[3] < 1) {
            mat.transparent = true;
            mat.opacity = m.baseColorFactor[3];
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        return mesh;
    }

    /**
     * Tile anchor in absolute engine world units (from the ENGINE's own
     * tiling scheme — hand-rolled normalized unproject landed in a different
     * frame) plus the world-units-per-GLB-unit scale for the x/y grid.
     */
    /** World-units per GLB-unit: one standard-z tile spans R/2^z world units. */
    private computeScale(z: number): number {
        return 40075016.686 / Math.pow(2, z) / 8192;
    }

    /** Called by the datasource once sources are known. */
    setSources(sources: BatchedSource[]): void {
        this.m_sources = sources;
    }

    /** §542: true while GLB tiles are fetching or decoding. */
    isLoading(): boolean {
        return this.m_inflight.size > 0 ||
            this.m_entries.some(e => !e.__parsed);
    }

    get sources(): BatchedSource[] {
        return this.m_sources;
    }

    /** Apply layer paint styling to a tile model (whole-tile, §539 phase 1). */
    applyLayerPaint(model: THREE.Group, paint: any): void {
        try {
            applyMglModelLighting(this.m_dataSource, model,
                Number(paint?.['model-emissive-strength'] ?? 0));
            const mixI = Number(paint?.['model-color-mix-intensity'] ?? 0);
            const color = paint?.['model-color'];
            if (mixI > 0 && color) {
                model.traverse((o: any) => {
                    const mesh = o as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    const cloned = mats.map((m: any) => {
                        const c = m?.clone?.() ?? m;
                        if (c?.color && typeof color === 'string') {
                            c.color.setStyle(color, THREE.SRGBColorSpace);
                        }
                        return c;
                    });
                    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
                });
            }
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
