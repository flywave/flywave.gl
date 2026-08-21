/**
 * Per-feature GLTF model instantiation channel (mgl `model` layer parity).
 *
 * mgl semantic (style-spec v8 + model_style_layer): a model layer over a
 * vector source places one GLTF instance per feature point. The model asset
 * is resolved through the root-level `style.models` registry
 * (`id → uri`), keyed by the layer's evaluated `model-id` (layout
 * expression, per-feature capable). The transform comes from the paint
 * properties `model-rotation` (degrees [x,y,z]), `model-scale` and
 * `model-translation` (meters), opacity from `model-opacity`.
 *
 * The engine tile pipeline has no 'model' technique consumer, so
 * MBTileDataEmitter records per-feature placements on
 * `DecodedTile.modelInstances` (absolute world coordinates, same space as
 * the heatmap kernels / text geometries) and this renderer instantiates the
 * cached GLTF scenes directly into the mapview scene — mirroring the
 * MBHeatmapRenderer tile-cache pattern (the decodedTile is transient, it is
 * cleared once geometry loading finishes).
 *
 * Color themes are baked CPU-side into the instance materials via the
 * datasource's `applyThemeToModel` (mgl themes models over the whole glTF,
 * `model-color-use-theme: none` opts out) — see MBStyleDataSource.
 */

import * as THREE from 'three';
import { Tile } from '@flywave/flywave-mapview';

interface ModelPlacement {
    x: number;
    y: number;
    z: number;
    technique: number;
    properties: Record<string, any>;
}

type GLTFLoaderType = any;

export class MBModelRenderer {
    /** Root-level `style.models` registry: modelId → resolved GLTF url. */
    private m_registry = new Map<string, string>();

    /** Loaded GLTF scenes by url (shared prototypes for cloning). */
    private m_prototypes = new Map<string, THREE.Object3D | 'loading' | 'failed'>();
    private m_loader: GLTFLoaderType | null = null;

    /** Style layers by id — needed for `applyThemeToModel(model, layer)`. */
    private m_layersById = new Map<string, any>();

    /**
     * Per-tile instantiated model groups. Cached from the transient
     * `decodedTile.modelInstances`; pruned when the tile leaves the visible
     * set (same lifecycle contract as MBHeatmapRenderer.m_tileKernels).
     */
    private m_tileGroups = new Map<Tile, THREE.Group>();
    private m_tilePlacements = new Map<Tile, { placements: ModelPlacement[]; techniques: any[] }>();

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
    ) {}

    /** Set the modelId → url registry (urls already resolved, local:// rewritten). */
    setModelRegistry(registry: Map<string, string>): void {
        this.m_registry = registry;
    }

    /** Keep style layers around for theme bake lookups. */
    setLayers(layers: any[]): void {
        this.m_layersById = new Map(layers.map((l) => [l.id, l]));
    }

    /** Re-apply color themes to every instantiated model (LUT changes). */
    retheme(): void {
        for (const group of this.m_tileGroups.values()) {
            this.rethemeGroup(group);
        }
    }

    private rethemeGroup(group: THREE.Group): void {
        for (const child of group.children) {
            const layerId = child.userData?._mbLayerId as string | undefined;
            const layer = layerId ? this.m_layersById.get(layerId) : undefined;
            if (layer) {
                try {
                    this.m_dataSource.applyThemeToModel(child, layer);
                } catch {}
            }
        }
    }

    /** Per-frame entry point. Early-returns when no tile carries models. */
    run(): void {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if (!scene || this.m_registry.size === 0) return;

        const tiles: Tile[] = this.m_dataSource.getDecodedTiles?.() ?? [];
        for (const tile of tiles) {
            if (this.m_tilePlacements.has(tile)) continue;
            const decoded = (tile as any)?.decodedTile as any;
            const placements = decoded?.modelInstances as ModelPlacement[] | undefined;
            if (placements && placements.length > 0) {
                this.m_tilePlacements.set(tile, {
                    placements: [...placements],
                    techniques: decoded.techniques ?? [],
                });
                // Create the group lazily; clones are appended as prototype
                // GLTFs finish loading (run() retries every frame).
                this.ensureTileGroup(tile, scene);
            }
        }
        const live = new Set(tiles);
        for (const [tile, group] of [...this.m_tileGroups]) {
            if (!live.has(tile)) {
                if (group.parent) group.parent.remove(group);
                this.disposeGroup(group);
                this.m_tileGroups.delete(tile);
                this.m_tilePlacements.delete(tile);
            }
        }

        this.processPending();
    }

    private ensureTileGroup(tile: Tile, scene: THREE.Scene): THREE.Group {
        let group = this.m_tileGroups.get(tile);
        if (!group) {
            group = new THREE.Group();
            group.name = 'MBModelRendererTile';
            this.m_tileGroups.set(tile, group);
            scene.add(group);
        }
        return group;
    }

    private disposeGroup(group: THREE.Group): void {
        // Clones share materials/textures with the cached prototypes, so only
        // their (also cloned) geometries are disposed here.
        group.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry?.dispose?.();
        });
    }

    private async getPrototype(url: string): Promise<THREE.Object3D | null> {
        const cached = this.m_prototypes.get(url);
        if (cached === 'failed') return null;
        if (cached && cached !== 'loading') return cached;
        if (cached === 'loading') {
            // Another run() call is already fetching; retry next frame.
            return null;
        }
        this.m_prototypes.set(url, 'loading');
        try {
            if (!this.m_loader) {
                const mod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
                this.m_loader = new mod.GLTFLoader();
            }
            const gltf = await this.m_loader.loadAsync(url);
            const proto: THREE.Object3D = gltf.scene;
            this.m_prototypes.set(url, proto);
            // Instances cloned from this prototype may already have been
            // requested (and skipped); they appear on the next run() pass.
            return proto;
        } catch {
            this.m_prototypes.set(url, 'failed');
            return null;
        }
    }

    private instantiate(
        tile: Tile,
        placement: ModelPlacement,
        technique: any,
        prototype: THREE.Object3D,
        group: THREE.Group,
    ): void {
        const model = prototype.clone(true);
        model.position.set(placement.x, placement.y, placement.z);

        // Transform convention mirrors MBStyleDataSource.loadModels: rotation
        // [x,y,z] degrees → Euler, scale scalar or [x,y,z], translation in
        // meters (applied after rotation, in world axes).
        const rotation = technique._modelRotation;
        if (Array.isArray(rotation)) {
            model.rotation.set(
                (rotation[0] ?? 0) * Math.PI / 180,
                (rotation[1] ?? 0) * Math.PI / 180,
                (rotation[2] ?? 0) * Math.PI / 180,
            );
        }
        const scale = technique._modelScale;
        if (Array.isArray(scale)) {
            model.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
        } else if (scale !== undefined && scale !== null) {
            model.scale.setScalar(Number(scale) || 1);
        }
        const translation = technique._modelTranslation;
        if (Array.isArray(translation)) {
            model.position.x += translation[0] ?? 0;
            model.position.y += translation[1] ?? 0;
            model.position.z += translation[2] ?? 0;
        }

        // model-opacity: transparent only when actually faded.
        const opacity = Number(technique.opacity ?? 1);
        if (opacity < 1) {
            model.traverse((o) => {
                const mesh = o as THREE.Mesh;
                const mat = mesh.material as any;
                if (mesh.isMesh && mat) {
                    const materials = Array.isArray(mat) ? mat : [mat];
                    for (const m of materials) {
                        m.transparent = true;
                        m.opacity = opacity;
                        m.depthWrite = false;
                    }
                }
            });
        }

        model.userData._mbLayerId = technique._layerId;
        group.add(model);

        // CPU theme bake (idempotent via pristine snapshots; the shared
        // materials make this cheap for repeated clones of one prototype).
        const layer = this.m_layersById.get(technique._layerId);
        if (layer) {
            try {
                this.m_dataSource.applyThemeToModel(model, layer);
            } catch {}
        }
    }

    /**
     * Kick off prototype loads for placements not yet instantiated. Called
     * every frame; clones appear once their prototype resolves.
     */
    private processPending(): void {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if (!scene) return;
        for (const [tile, { placements, techniques }] of this.m_tilePlacements) {
            const group = this.m_tileGroups.get(tile);
            if (!group) continue;
            // Per-placement done flags (a still-loading prototype must not
            // permanently block placements queued after it).
            const done = (group.userData._done as Set<number>) ?? new Set<number>();
            group.userData._done = done;
            for (let i = 0; i < placements.length; i++) {
                if (done.has(i)) continue;
                const placement = placements[i];
                const technique = techniques[placement.technique];
                if (!technique) { done.add(i); continue; }
                const url = this.m_registry.get(String(technique.modelId ?? ''));
                if (!url) { done.add(i); continue; }
                const prototype = this.m_prototypes.get(url);
                if (prototype && prototype !== 'loading' && prototype !== 'failed') {
                    this.instantiate(tile, placement, technique, prototype, group);
                    done.add(i);
                } else if (!prototype) {
                    // Not yet requested — start the async load.
                    void this.getPrototype(url);
                }
            }
        }
    }
}
