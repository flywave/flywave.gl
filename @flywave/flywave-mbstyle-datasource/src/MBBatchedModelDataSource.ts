/**
 * §549: regular flywave DataSource for `type: "batched-model"` sources
 * (mgl `tiled_3d_model_source`, §537 original design).
 *
 * Each tile is a whole GLB whose vertices live in the tile's local quantized
 * grid (8192 units, NW origin) with z in meters (probe: Frauenkirche 101 m;
 * mgl renders tile models with zScaleMatrix = [1,1,pixelsPerMeter]). The
 * engine's TileObjectsRenderer positions tile.objects at
 * `tile.center − cameraPosition`, so the model group is built relative to
 * the tile CENTER: position = (−4096·w, −4096·w, 0), scale = w with
 * w = R / 2^level / 8192 (world units per GLB unit).
 *
 * Draco is decoded on the main thread via decodeGlbTile (§547 — mgl converts
 * GLBs manually too), and the resulting scene is built synchronously. The
 * tile objects ride the engine's own tile pipeline, which is the only
 * reliably rendered channel (§549: external scene-attach is dropped).
 */

import * as THREE from 'three';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';
import { DataSource, DataSourceOptions } from '@flywave/flywave-mapview';
import { Tile } from '@flywave/flywave-mapview';
import { applyMglModelLighting } from './MBModelRenderer';
import { decodeGlbTile, TileMaterialData, TilePrimitiveData } from './MBDracoDecoder';
import { applyMeshFeatures } from './MBMeshFeatures';

export interface MBBatchedModelDataSourceOptions extends DataSourceOptions {
    /** GLB URL template, e.g. "local://models/landmark/mbx/{x}-{y}-{z}.glb". */
    srcTemplate: string;
    /** Raw paint of the model layer (for whole-tile styling fallback). */
    paint?: any;
    /** Datasource providing m_environment for the mgl lighting injection. */
    envProvider?: any;
}

export class MBBatchedModelDataSource extends DataSource {
    private readonly m_srcTemplate: string;
    private m_paint: any;
    private readonly m_envProvider: any;

    constructor(options: MBBatchedModelDataSourceOptions) {
        super({
            name: options.name ?? 'mb-batched-model',
            minDataLevel: options.minDataLevel ?? 0,
            maxDataLevel: options.maxDataLevel ?? 14,
            minDisplayLevel: options.minDisplayLevel ?? 0,
            maxDisplayLevel: options.maxDisplayLevel ?? 20,
            storageLevelOffset: options.storageLevelOffset ?? 0
        });
        this.m_srcTemplate = options.srcTemplate;
        this.m_paint = options.paint ?? {};
        this.m_envProvider = options.envProvider;
        this.cacheable = true;
    }

    /** @override */
    getTilingScheme() {
        return webMercatorTilingScheme;
    }

    /** @override */
    async connect(): Promise<void> {
        /* nothing to connect — tiles are fetched lazily in getTile */
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        tile.forceHasGeometry(true);
        void this.loadTileModel(tileKey, tile);
        return tile;
    }

    private async loadTileModel(tileKey: TileKey, tile: Tile): Promise<void> {
        const url = this.m_srcTemplate
            .replace('{x}', String(tileKey.column))
            .replace('{y}', String(tileKey.row))
            .replace('{z}', String(tileKey.level))
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        const stat: any = ((globalThis as any).__mbBatched ??= { fetch: 0, ok: 0, parsed: 0, err: '' });
        stat.fetch++;
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                stat.err = 'HTTP ' + resp.status;
                return;
            }
            const buf = await resp.arrayBuffer();
            stat.ok++;
            const tileData = await decodeGlbTile(buf);
            stat.decoded = (stat.decoded ?? 0) + 1;

            const model = new THREE.Group();
            model.name = 'MBBatchedModelTile';
            const w = this.computeScale(tileKey.level);
            for (const prims of tileData.nodes) {
                for (const prim of prims) {
                    model.add(this.buildPrimitiveMesh(prim, tileData.materials));
                }
            }
            // Vertices are in the NW-origin 8192 grid; the engine positions
            // the pushed object at tile.center − cameraPosition, so shift the
            // model so the grid is centered on the tile center. z stays meters.
            model.position.set(-4096 * w, -4096 * w, 0);

            const paint = this.m_paint;
            if (tileData.hasMeshFeatures) {
                // §547: per-part styling over MAPBOX_mesh_features.
                applyMeshFeatures(model, paint,
                    this.mapView?.zoomLevel ?? 0, this.m_envProvider);
            } else {
                this.applyLayerPaint(model, paint);
            }

            tile.objects.push(model);
            stat.parsed = (stat.parsed ?? 0) + 1;
            stat.t = Date.now();
            // Notify the MapView that new geometry is ready to render.
            this.requestUpdate();
        } catch (e: any) {
            stat.parseErr = String(e?.stack ?? e).slice(0, 200);
        }
    }

    /** World units per GLB unit: one standard level tile spans R/2^level. */
    private computeScale(level: number): number {
        return 40075016.686 / Math.pow(2, level) / 8192;
    }

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

    /** Update the layer paint (called on style re-configure). */
    setPaint(paint: any): void {
        this.m_paint = paint ?? {};
        this.requestUpdate();
    }

    /**
     * §549: minimal manual registration. `MapView.addDataSource` awaits
     * `getTheme()`, which never resolves in the harness environment.
     */
    static manualRegister(mapView: any, ds: MBBatchedModelDataSource): void {
        (ds as any).attach(mapView);
        const list = (mapView as any).m_tileDataSources;
        if (Array.isArray(list) && !list.includes(ds)) list.push(ds);
        mapView.addEventListener?.('update', () => mapView.update?.());
        try { (mapView as any).m_connectedDataSources?.add?.(ds.name); } catch {}
    }

    /** Whole-tile paint fallback (non-mesh-features tiles). */
    private applyLayerPaint(model: THREE.Group, paint: any): void {
        try {
            applyMglModelLighting(this.m_envProvider, model,
                Number(paint?.['model-emissive-strength'] ?? 0));
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
