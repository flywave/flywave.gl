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
import { shadowCasters } from './MBShadowRenderer';

interface ModelPlacement {
    x: number;
    y: number;
    z: number;
    technique: any;
    properties: Record<string, any>;
}

type GLTFLoaderType = any;

/**
 * §520: mgl shades model materials with LIGHTING_3D_MODE apply_lighting
 * (model.fragment.glsl getDiffuseShadedColor → _prelude_lighting): the
 * three-lit result is REPLACED by
 *
 *   dir_factor = saturate(dot(N, u_lighting_directional_dir))  (no shadow
 *   map on our side; the shadowed variant needs the depth prepass)
 *   k = u_lighting_ambient_color * vertical*ambientDirFactor(N)
 *       + u_lighting_directional_color * dir_factor
 *   out = albedo_linear * k   (= mapbox linearProduct through the output
 *   sRGB conversion), mixed back toward raw albedo by emissive strength.
 *
 * Without style lights the material stays untouched (mgl !LIGHTING_3D_MODE
 * renders raw albedo). Exports for both instantiation paths (per-feature
 * MBModelRenderer and the source-registry loadModels in MBStyleDataSource).
 */
export function applyMglModelLighting(dataSource: any, model: THREE.Object3D, emissiveStrength: number): void {
    const ls = dataSource?.m_environment?.lighting3DState;
    model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats as any[]) {
            if (!mat || mat.__mbMglLit) continue;
            if (!ls) { mat.__mbMglLit = true; continue; }
            mat.__mbMglLit = true;
            const origOnCompile = mat.onBeforeCompile;
            mat.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(mat, shader);
                const ls2 = dataSource?.m_environment?.lighting3DState;
                shader.uniforms.uMB3DAmb = { value: ls2 ? ls2.ambientColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDirColor = { value: ls2 ? ls2.directionalColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDir = { value: ls2 ? ls2.dir : [0, 0, 1] };
                shader.uniforms.uMB3DEmissive = { value: emissiveStrength ?? 0 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir;
                     uniform float uMB3DEmissive;
                     vec3 mbAlbedo = vec3(1.0);
                     void main() {`
                );
                // Capture the glTF albedo AFTER the base-color texture —
                // that is the `albedo` mgl's getBaseColor feeds apply_lighting.
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>
                     mbAlbedo = diffuseColor.rgb;`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     {
                         #ifdef FLAT_SHADED
                             vec3 mbN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                         #else
                             vec3 mbN = normalize(vNormal);
                         #endif
                         vec3 mbDirView = normalize((viewMatrix * vec4(uMB3DDir, 0.0)).xyz);
                         vec3 mbUpView = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
                         float mbNdotL = clamp(dot(mbN, mbDirView), 0.0, 1.0);
                         float mbDirLum = dot(uMB3DDirColor, vec3(0.2126, 0.7152, 0.0722));
                         float mbAmbDir = mix(1.0 - 0.3 * min(mbDirLum, 1.0), 1.0, min(dot(mbN, mbDirView) + 1.0, 1.0));
                         float mbVert = mix(0.92, 1.0, dot(mbN, mbUpView) * 0.5 + 0.5);
                         vec3 mbK = uMB3DAmb * (mbVert * mbAmbDir) + uMB3DDirColor * mbNdotL;
                         vec3 mbLit = mbAlbedo * mbK;
                         gl_FragColor.rgb = mix(mbLit, mbAlbedo, uMB3DEmissive);
                     }`
                );
            };
            mat.needsUpdate = true;
        }
    });
}

async function getSharedGLTFLoader(): Promise<GLTFLoaderType> {
    const mod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new mod.GLTFLoader();
    try {
        const dracoMod: any = await import('three/examples/jsm/loaders/DRACOLoader.js');
        const draco = new dracoMod.DRACOLoader();
        draco.setDecoderPath('/base/node_modules/three/examples/jsm/libs/draco/gltf/');
        loader.setDRACOLoader(draco);
    } catch {}
    return loader;
}

export class MBModelRenderer {
    /** Root-level `style.models` registry: modelId → resolved GLTF url. */
    private m_registry = new Map<string, string>();

    /** Loaded GLTF scenes by url (shared prototypes for cloning). */
    private m_prototypes = new Map<string, THREE.Object3D | 'loading' | 'failed'>();
    private m_loader: GLTFLoaderType | null = null;
    private m_extraFrames = 0;
    private m_sawPlacements = false;
    private m_expectPlacements = false;

    /** Style layers by id — needed for `applyThemeToModel(model, layer)`. */
    private m_layersById = new Map<string, any>();

    /**
     * Per-tile instantiated model groups. Cached from the transient
     * `decodedTile.modelInstances`; pruned when the tile leaves the visible
     * set (same lifecycle contract as MBHeatmapRenderer.m_tileKernels).
     */
    private m_tileGroups = new Map<Tile, THREE.Group>();
    private m_tilePlacements = new Map<Tile, { placements: ModelPlacement[] }>();

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

    /** True once any decoded-tile model placement has been observed. */
    sawPlacements(): boolean {
        return this.m_sawPlacements;
    }

    /**
     * True when the style has model layers over vector sources (per-feature
     * placements expected). Model-source styles instantiate via loadModels
     * and never produce placements — waiting for them would hang the poll.
     */
    get expectPlacements(): boolean {
        return this.m_expectPlacements;
    }

    setExpectPlacements(v: boolean): void {
        this.m_expectPlacements = v;
    }

    /** True while any recorded placement has no instance yet. */
    isLoading(): boolean {
        for (const { placements } of this.m_tilePlacements.values()) {
            for (const p of placements) if (!(p as any).__placed) return true;
        }
        // Loads that have not produced a placement pass yet also count.
        return false;
    }

    /** Per-frame entry point. Early-returns when no tile carries models. */
    run(): void {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if ((globalThis as any).__mbDecodeDbg && !(this as any).__ranDbg) {
            (this as any).__ranDbg = true;
            let tilesWithModels = 0, modelCount = 0, cleared = 0;
            for (const tile of this.m_dataSource.getDecodedTiles?.() ?? []) {
                const d = (tile as any)?.decodedTile as any;
                const n = d?.modelInstances?.length ?? (tile as any).modelInstances?.length ?? 0;
                if (n > 0) { tilesWithModels++; modelCount += n; }
                if (!d) cleared++;
            }
            // eslint-disable-next-line no-console
            console.log(`[MBModelRun] registry=${this.m_registry.size} scene=${!!scene} tiles=${(this.m_dataSource.getDecodedTiles?.() ?? []).length} withModels=${tilesWithModels} models=${modelCount} noDecoded=${cleared}`);
        }
        if (!scene || this.m_registry.size === 0) return;

        // §518: the engine renders RELATIVE-TO-EYE — tile meshes' matrices
        // are pre-translated by −eye each frame (census probe: tile mesh world
        // coords are small, eye-centered). Groups added directly to the scene
        // keep ABSOLUTE placements (magnitudes ~1e7) while the three camera
        // sits at the eye → the instances land 10⁷ units off-screen. Keep the
        // per-tile group at −eye so its absolute-positioned children render
        // camera-relative like everything else.
        try {
            const geoCenter = (this.m_mapView as any).geoCenter;
            const projection = (this.m_mapView as any).projection;
            if (geoCenter && projection) {
                const eye = projection.projectPoint(geoCenter, { x: 0, y: 0, z: 0 });
                for (const group of this.m_tileGroups.values()) {
                    group.position.set(-eye.x, -eye.y, -eye.z);
                }
            }
        } catch {}

        const tiles: Tile[] = this.m_dataSource.getDecodedTiles?.() ?? [];
        for (const tile of tiles) {
            if (this.m_tilePlacements.has(tile)) continue;
            const decoded = (tile as any)?.decodedTile as any;
            // `modelInstances` survives decodedTile clearing (Tile.removeDecodedTile
            // stashes it on the tile) — the transient window alone is racy.
            const placements = decoded?.modelInstances
                ?? (tile as any).modelInstances as ModelPlacement[] | undefined;
            if (placements && placements.length > 0) {
                this.m_sawPlacements = true;
                this.m_tilePlacements.set(tile, {
                    placements: [...placements],
                });
                // Create the group lazily; clones are appended as prototype
                // GLTFs finish loading (run() retries every frame).
                this.ensureTileGroup(tile, scene);
            }
        }
        const live = new Set(tiles);
        for (const [tile, group] of [...this.m_tileGroups]) {
            // Prune on tile disposal, not mere absence from one frame's
            // decoded-tile list — the cache enumeration is transient during
            // tile replacement and would drop live model instances.
            if (!live.has(tile) && tile.disposed) {
                if (group.parent) group.parent.remove(group);
                this.disposeGroup(group);
                this.m_tileGroups.delete(tile);
                this.m_tilePlacements.delete(tile);
            }
        }

        const placed = this.processPending();

        // Async GLTF/Draco loads finish after the tiles settle; keep the
        // render loop alive (isDynamicFrame) until every placement has its
        // instance, so the harness's settled-frame capture includes them.
        let pending = false;
        for (const { placements } of this.m_tilePlacements.values()) {
            for (let i = 0; i < placements.length; i++) {
                if (!(placements[i] as any).__placed) { pending = true; break; }
            }
            if (pending) break;
        }
        // `pending` keeps the loop alive across async loads; `placed` requests
        // one more frame after the last instantiation (objects added during
        // AfterRender are otherwise never rendered).
        if (pending || placed > 0) { this.m_extraFrames = 3; }
        if (this.m_extraFrames > 0) { this.m_extraFrames--; this.m_mapView.update?.(); }
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
            shadowCasters.delete(o);
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
            const gltf = await (await getSharedGLTFLoader()).loadAsync(url);
            const proto: THREE.Object3D = gltf.scene;
            this.m_prototypes.set(url, proto);
            // Instances cloned from this prototype may already have been
            // requested (and skipped); they appear on the next run() pass.
            return proto;
        } catch (err) {
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

        // §519: mgl model_util.rotationScaleYZFlipMatrix — the model local
        // matrix is Rz(rot[2])·Rx(rot[0])·Ry(rot[1])·S(scale)·F, where F
        // swaps the Y and Z axes (glTF is Y-up right-handed, the map frame
        // is Z-up). three's default Euler composition is neither of those —
        // build the matrix explicitly. Without F the model lies on its side.
        const sanitizeVec = (v: any): number[] | undefined => {
            if (!Array.isArray(v)) return undefined;
            const out = [Number(v[0] ?? 0), Number(v[1] ?? 0), Number(v[2] ?? 0)];
            return out.every(Number.isFinite) ? out : undefined;
        };
        const rotation = sanitizeVec((placement as any).rotation) ??
            sanitizeVec(technique._modelRotation) ?? [0, 0, 0];
        const scale = sanitizeVec((placement as any).scale) ??
            sanitizeVec(technique._modelScale) ?? [1, 1, 1];
        const D2R = Math.PI / 180;
        const m = new THREE.Matrix4()
            .multiply(new THREE.Matrix4().makeRotationZ(rotation[2] * D2R))
            .multiply(new THREE.Matrix4().makeRotationX(rotation[0] * D2R))
            .multiply(new THREE.Matrix4().makeRotationY(rotation[1] * D2R))
            .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]))
            .multiply(new THREE.Matrix4().set(
                1, 0, 0, 0,
                0, 0, 1, 0,
                0, 1, 0, 0,
                0, 0, 0, 1));
        const translation = sanitizeVec((placement as any).translation) ??
            sanitizeVec(technique._modelTranslation);
        if (translation) {
            model.position.x += translation[0] ?? 0;
            model.position.y += translation[1] ?? 0;
            model.position.z += translation[2] ?? 0;
        }
        m.setPosition(model.position);
        model.matrixAutoUpdate = false;
        model.matrix.copy(m);

        // model-opacity: transparent only when actually faded.
        const opacity = Number((placement as any).opacity ?? technique.opacity ?? 1);
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

        // Engine cameras carry world-scale translations in Float32 matrices;
        // CPU frustum culling at 1e7-magnitude coordinates is meters-off and
        // randomly culls valid instances. Placements come from visible tiles,
        // so GPU clipping is sufficient.
        model.frustumCulled = false;
        model.traverse((o) => { o.frustumCulled = false; });
        // §518 draw AFTER the tile's fill/line band: the mapview paints plain
        // fills with depthTest=false in style order, and the §512-promoted HD
        // road band occupies ro 2..9.8 — clones at ro 0 rasterize FIRST and
        // are overdrawn to zero visible pixels (mgl draw_model renders the
        // model pass after the road/fill passes).
        model.traverse((o) => { o.renderOrder = 10; });
        model.renderOrder = 10;
        model.userData._mbLayerId = technique._layerId;
        group.add(model);

        // mgl shadow pass: models with model-cast-shadows (default true) are
        // shadow casters; layer 1 is the shadow-camera mask.
        const castShadows = technique._paint?.['model-cast-shadows'] !== false;
        if (castShadows) {
            model.layers.enable(1);
            shadowCasters.add(model);
        }

        // CPU theme bake (idempotent via pristine snapshots; the shared
        // materials make this cheap for repeated clones of one prototype).
        const layer = this.m_layersById.get(technique._layerId);
        if (layer && !true) {
            try {
                this.m_dataSource.applyThemeToModel(model, layer);
            } catch {}
        }

        // §520: mgl apply_lighting on the glTF materials (per-feature
        // model-emissive-strength rides the placement, default 0).
        try {
            applyMglModelLighting(this.m_dataSource, model, (placement as any).emissive ?? 0);
        } catch {}
    }

    /**
     * Kick off prototype loads for placements not yet instantiated. Called
     * every frame; clones appear once their prototype resolves.
     */
    private processPending(): number {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if (!scene) return;
        let placedCount = 0;
        for (const [tile, { placements }] of this.m_tilePlacements) {
            const group = this.m_tileGroups.get(tile);
            if (!group) continue;
            // Per-placement done flags (a still-loading prototype must not
            // permanently block placements queued after it).
            const done = (group.userData._done as Set<number>) ?? new Set<number>();
            group.userData._done = done;
            for (let i = 0; i < placements.length; i++) {
                if (done.has(i)) continue;
                const placement = placements[i];
                const technique = placement.technique;
                if (!technique) { done.add(i); (placement as any).__placed = true; continue; }
                // §518: model-id is data-driven — the per-feature evaluated
                // value rides the placement; technique.modelId is the fallback.
                const modelId = (placement as any).modelId ?? technique.modelId ?? '';
                const url = this.m_registry.get(String(modelId));
                if (!url) { done.add(i); (placement as any).__placed = true; continue; }
                const prototype = this.m_prototypes.get(url);
                if (prototype && prototype !== 'loading' && prototype !== 'failed') {
                    this.instantiate(tile, placement, technique, prototype, group);
                    done.add(i);
                    placedCount++;
                    (placement as any).__placed = true;
                } else if (!prototype) {
                    // Not yet requested — start the async load.
                    void this.getPrototype(url);
                } else if (prototype === 'failed') {
                    done.add(i);
                    (placement as any).__placed = true;
                }
            }
        }
        return placedCount;
    }
}
