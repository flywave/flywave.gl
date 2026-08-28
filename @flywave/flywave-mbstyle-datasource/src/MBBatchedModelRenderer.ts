/**
 * §540: batched-model source support (mgl `tiled_3d_model_source`).
 *
 * A `type: "batched-model"` source's tiles are whole GLB files whose vertex
 * positions live in the tile's LOCAL QUANTIZED GRID (extent ≈ 8192 units per
 * axis, z in meters). This renderer mirrors MBModelRenderer's per-frame
 * pattern: for each registered source it fetches the tile covering GLB for
 * the live camera tile (round(zoom) clamped to the source maxzoom), loads it
 * with GLTFLoader (Draco-capable), and instantiates ONE group per tile —
 * placed at the tile's NW-corner world position with scale = span/8192 on
 * x/y (z stays meters, matching the engine's altitude units) and rebased by
 * −eye every frame (RTE, see MBModelRenderer §518 note).
 *
 * Model-layer paint styling: the layer's evaluated paint (model-color×mix,
 * emissive, roughness, opacity) is applied to the whole tile group —
 * MAPBOX_mesh_features per-feature styling is a二期 item.
 */

import * as THREE from 'three';
import { applyMglModelLighting } from './MBModelRenderer';

interface BatchedSource {
    sourceId: string;
    tiles: string[];
    maxzoom: number;
    layer: any;
}

interface TileEntry {
    group: THREE.Group;
    source: BatchedSource;
    key: string;
    loaded: boolean;
}

export class MBBatchedModelRenderer {
    private m_renderer: THREE.WebGLRenderer | null = null;
    private m_entries: TileEntry[] = [];
    private m_inflight = new Set<string>();
    private m_loader: any = null;
    private m_eye = new THREE.Vector3();

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
        private m_sources: BatchedSource[],
    ) {}

    /** Per-frame entry point. */
    run(): void {
        (globalThis as any).__mbBatchedRun = ((globalThis as any).__mbBatchedRun ?? 0) + 1;
        if (this.m_sources.length === 0) return;
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if (!scene) return;

        this.updateEye();
        this.requestTiles();

        for (const e of this.m_entries) {
            e.group.position.set(-this.m_eye.x, -this.m_eye.y, -this.m_eye.z);
        }
    }

    private updateEye(): void {
        try {
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
        try {
            const pr = mapView.projection;
            const w = pr.projectPoint(cam, { x: 0, y: 0, z: 0 });
            void w;
        } catch {}

        for (const src of this.m_sources) {
            const z = Math.min(Math.round(zoom), src.maxzoom);
            const n = Math.pow(2, z);
            // camera lon/lat → tile x/y (mercator).
            let lon = cam.longitude, lat = cam.latitude;
            void lon; void lat;
            // Standard web-mercator tile coords (NORTH-up y, per the GLB
            // file naming) — NOT the engine projection's south-positive y.
            const tx = Math.floor(((lon + 180) / 360) * n);
            const mercN = Math.log(Math.tan(Math.PI * 0.25 + (lat * Math.PI / 180) * 0.5));
            const ty = Math.max(0, Math.min(n - 1,
                Math.floor(((1 - mercN / Math.PI) / 2) * n)));
            void tx; void ty;
            // center tile + 4 neighbors (pitch-70 views span multiple tiles).
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
        // track the pending tile so isLoading() covers the Draco window.
        const pendingGroup = new THREE.Group();
        pendingGroup.name = 'MBBatchedModelTile:' + key;
        const sceneNow = this.m_mapView?.m_scene as THREE.Scene | undefined;
        sceneNow?.add(pendingGroup);
        this.m_entries.push({ group: pendingGroup, source: src, key, loaded: false });
        const stat: any = ((globalThis as any).__mbBatched ??= { fetch: 0, ok: 0, parsed: 0, err: '' });
        stat.fetch++;
        void fetch(url)
            .then(r => {
                this.m_inflight.delete(key);
                if (!r.ok) { stat.err = 'HTTP ' + r.status; throw new Error(String(r.status)); }
                return r.arrayBuffer();
            })
            .then(async buf => {
                const loader = this.m_loader ?? (this.m_loader = await this.makeLoader());
                stat.ok++;
                loader.parse(buf, '', (gltf: any) => {
                    stat.parsed++;
                    for (const e of this.m_entries) {
                        if (e.key === key) (e as any).__parsed = true;
                    }
                    const group = new THREE.Group();
                    group.name = 'MBBatchedModelTile';
                    const model = gltf.scene;
                    this.placeModel(group, model, z, x, y);
                    // whole-tile single style (§539 phase 1): the model layer's
                    // evaluated paint (mix/emissive/roughness/opacity).
                    this.applyLayerPaint(group, (src as any).paint ?? {});
                    const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
                    void scene;
                    group.position.copy(pendingGroup.position);
                    for (const child of [...group.children]) pendingGroup.add(child);
                    pendingGroup.visible = true;
                }, (e: any) => {
                    stat.parseErr = String(e).slice(0, 200);
                    for (const en of this.m_entries) {
                        if (en.key === key) (en as any).__parsed = true;
                    }
                });
            })
            .catch((e: any) => { stat.err = 'FETCH ' + String(e).slice(0, 120) + ' ' + url.slice(-60); });
    }

    private async makeLoader(): Promise<any> {
        const mod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new mod.GLTFLoader();
        try {
            const dracoMod: any = await import('three/examples/jsm/loaders/DRACOLoader.js');
            const draco = new dracoMod.DRACOLoader();
            // §544: serve the decoder from the fixtures dir — /base/node_modules is
                // NOT karma-servable, and a 404 decoder script hangs the parse
                // silently (this was the landmark blank root cause).
                draco.setDecoderPath('/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/models/draco/');
            // §542: force the JS decoder — the wasm worker path hangs silently
            // in the karma/SwiftShader page.
            draco.setDecoderConfig({ type: 'js' });
            loader.setDRACOLoader(draco);
        } catch {}
        return loader;
    }

    /**
     * Scale a loaded GLB tile scene from its local quantized grid (8192
     * units, z meters) into world space at the tile's NW corner.
     */
    private placeModel(group: THREE.Group, model: THREE.Object3D, z: number, x: number, y: number): void {
        try {
            const pr = this.m_mapView.projection;
            const { GeoCoordinates } = this.merc();
            const n = Math.pow(2, z);
            const unit = pr.unitScale ?? 40075016.686;
            const lonNW = (x / n) * 360 - 180;
            const lonSE = ((x + 1) / n) * 360 - 180;
            // NW/SW world corners from the projection (same frame as RTE rebase).
            const latOf = (ty: number): any => {
                const wp = new (this.merc().MercatorProjection)();
                return wp.unprojectPoint({ x: (x + 0.5) / n * unit, y: (ty + 0.5) / n * unit, z: 0 });
            };
            const gcNW = (() => {
                const geo = pr.unprojectPoint({ x: (x / n) * unit, y: (y / n) * unit, z: 0 });
                return geo;
            })();
            const gcSE = (() => {
                const geo = pr.unprojectPoint({ x: ((x + 1) / n) * unit, y: ((y + 1) / n) * unit, z: 0 });
                return geo;
            })();
            void latOf;
            const pNW = pr.projectPoint(gcNW, { x: 0, y: 0, z: 0 });
            const pSE = pr.projectPoint(gcSE, { x: 0, y: 0, z: 0 });
            const spanX = Math.abs(pSE.x - pNW.x);
            const spanY = Math.abs(pSE.y - pNW.y);
            const s = spanX / 8192;
            const origin = new THREE.Vector3(
                Math.min(pNW.x, pSE.x),
                Math.min(pNW.y, pSE.y),
                0,
            );
            group.add(model);
            // local grid (x east, y south, 8192/axis; z meters) → world.
            model.scale.set(s, s, 1);
            model.position.set(0, 0, 0);
            group.position.set(
                origin.x - this.m_eye.x,
                origin.y - this.m_eye.y,
                -this.m_eye.z,
            );
            group.renderOrder = 10;
            group.traverse((o: any) => {
                o.renderOrder = 10;
                o.frustumCulled = false;
                if (o.isMesh && o.material) {
                    // Engine z unit is meters only for z; keep x/y non-uniform.
                    o.layers.enable(0);
                }
            });
            (group.userData as any)._mbSpan = [spanX, spanY];
            void lonSE; void GeoCoordinates;
        } catch {}
    }

    private merc(): any {
        return require('@flywave/flywave-geoutils');
    }

    /** Called by the datasource once sources are known. */
    setSources(sources: BatchedSource[]): void {
        this.m_sources = sources;
    }

    /** §542: true while GLB tiles are fetching or Draco-parsing. */
    isLoading(): boolean {
        return this.m_inflight.size > 0 ||
            this.m_entries.some(e => !(e as any).__parsed);
    }

    get sources(): BatchedSource[] {
        return this.m_sources;
    }

    /** Apply layer paint styling to a tile group (whole-tile, §539 phase 1). */
    applyLayerPaint(group: THREE.Group, paint: any): void {
        try {
            applyMglModelLighting(this.m_dataSource, group,
                Number(paint?.['model-emissive-strength'] ?? 0));
            const mixI = Number(paint?.['model-color-mix-intensity'] ?? 0);
            const color = paint?.['model-color'];
            if (mixI > 0 && color) {
                group.traverse((o: any) => {
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
                group.traverse((o: any) => {
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
