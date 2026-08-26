import * as THREE from 'three';
import { MapView, MapViewEventNames } from '@flywave/flywave-mapview';
import { TerrainController } from './TerrainController';
import { buildTileCamera, isEnvironmentObject } from './TerrainDrapingUtils';

/**
 * FBO-based texture draping for terrain.
 *
 * For each loaded terrain tile, bakes all non-terrain scene objects (fill,
 * line, raster, circle layers) into a `WebGLRenderTarget` texture using an
 * orthographic top-down camera. The resulting texture is then fed to the
 * tile's `MapTerrainMaterial` via `setDrapeTexture()`, where the shader
 * alpha-blends it into the terrain surface color (`vMapUv`-sampled, so UV 0..1
 * maps 1:1 onto the tile's world bounds).
 *
 * Bakes happen lazily: after terrain tiles are (re)built, a `needsBake` flag
 * is set; the next `AfterRender` frame performs the bake. This avoids
 * per-frame overhead — only zoom changes or new tile loads trigger a re-bake.
 *
 * Reference: mapbox-gl-js Painter draping + flywave's own
 * `VectorMaterialProvider.renderFrameBuffer()` (per-tile orthographic bake)
 * and `TerrainDepthOcclusion` (scene visibility toggling pattern).
 */
export class TerrainDraping {
    private m_mapView: MapView;
    private m_terrain: TerrainController;
    /** Render targets per terrain mesh index. */
    private m_renderTargets: Map<number, THREE.WebGLRenderTarget> = new Map();
    /** Flag: bake on next frame. */
    private m_needsBake = false;
    private m_active = false;
    /** Bake resolution per tile. */
    private m_bakeSize: number;
    /** Tracks whether the last frame was morphing — re-bake when it stops. */
    private m_wasMorphing = false;
    /**
     * After a terrain rebuild, raster textures load asynchronously. We
     * re-bake for a few extra frames so the drape picks up freshly-loaded
     * textures. The counter decrements each successful bake.
     */
    private m_extraBakeFrames = 0;
    /** White opaque clear color for FBO (alpha=1 so empty areas preserve terrain color). */
    private static readonly CLEAR_COLOR = new THREE.Color(1, 1, 1);
    /** Master switch for the drape bake. */
    static readonly DRAPE_ENABLED = true;
    /** Max consecutive re-bake frames after rebuild (gives async textures time to load). */
    private static readonly MAX_EXTRA_BAKES = 5;

    constructor(mapView: MapView, terrain: TerrainController, bakeSize = 512) {
        this.m_mapView = mapView;
        this.m_terrain = terrain;
        this.m_bakeSize = bakeSize;
    }

    /** Mark that a re-bake is needed (call after terrain tiles change). */
    requestBake(): void {
        this.m_needsBake = true;
    }

    start(): void {
        if (this.m_active) return;
        this.m_active = true;
        this.m_mapView.addEventListener(MapViewEventNames.AfterRender, this.onAfterRender);
        this.m_mapView.addEventListener(MapViewEventNames.WillRender, this.onWillRender);
        this.requestBake();
    }

    stop(): void {
        if (!this.m_active) return;
        this.m_active = false;
        this.m_mapView.removeEventListener(MapViewEventNames.AfterRender, this.onAfterRender);
        this.m_mapView.removeEventListener(MapViewEventNames.WillRender, this.onWillRender);
        // Disable USE_DRAPE on all terrain materials so the terrain renders
        // without the drape overlay after stopping.
        for (const mesh of this.m_terrain.meshes) {
            const mat = mesh.material as any;
            if (mat?.defines?.USE_DRAPE) {
                delete mat.defines.USE_DRAPE;
                mat.needsUpdate = true;
            }
        }
    }

    dispose(): void {
        this.stop();
        for (const [, rt] of this.m_renderTargets) {
            rt.dispose();
        }
        this.m_renderTargets.clear();
    }

    get isActive(): boolean { return this.m_active; }
    get bakeSize(): number { return this.m_bakeSize; }

    /**
     * mgl semantics: with terrain active the raster imagery is DRAPED onto
     * the DEM surface, not drawn as flat tiles on top. Hide the raster tile
     * objects from the main render; the AfterRender bake re-shows them and
     * bakes their pixels into the terrain's drape texture.
     */
    /**
     * Material-level raster gate (§480): setting object.visible=false made
     * the tile engine treat the tiles as failed and re-decode them in a
     * loop (36s/test). Instead flip the MATERIAL's visible flag — the
     * object stays "rendered" for the engine's bookkeeping but the material
     * renders nothing. The bake flips it back for its own render.
     */
    private m_rasterHidden: THREE.Material[] = [];

    private onWillRender = (): void => {
        for (const m of this.m_rasterHidden) m.visible = true; // idempotent
        this.m_rasterHidden.length = 0;
        const scene = this.m_mapView.scene;
        scene.traverse((o: any) => {
            if ((o.isMesh || o.isPoints) && o.userData?.technique?._isRaster) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) {
                    if (m && m.visible) {
                        m.visible = false;
                        this.m_rasterHidden.push(m);
                    }
                }
            }
        });
    };

    private onAfterRender = (): void => {
        if (!this.m_active) return;

        // Disable draping in globe (sphere) mode — orthographic top-down
        // camera doesn't work on spherical tiles. Vertex draping handles
        // globe mode.
        const proj = (this.m_mapView as any).projection;
        if (proj?.type === 1 /* ProjectionType.Spherical */) return;

        // Tile content (fills/roads/extrusions) loads ASYNCHRONOUSLY, long
        // after the terrain meshes were built — the first bake runs on an
        // empty scene and its FBO stays uniform (clear color only) forever.
        // Re-bake whenever the scene root's camera-relative object set
        // changes (new/removed tile objects).
        const sceneRoot = (this.m_mapView as any).m_sceneRoot as THREE.Object3D | undefined;
        const childCount = sceneRoot?.children.length ?? -1;
        if (childCount !== this.m_lastSceneChildren) {
            this.m_lastSceneChildren = childCount;
            this.m_needsBake = true;
            this.m_extraBakeFrames = Math.max(this.m_extraBakeFrames, 2);
        }

        // Detect terrain rebuild (mesh count change → old FBOs are stale).
        const meshCount = this.m_terrain.meshes.length;
        if (meshCount !== this.m_lastMeshCount) {
            // Dispose old render targets that exceed the new mesh count.
            for (const [idx, rt] of this.m_renderTargets) {
                if (idx >= meshCount) {
                    rt.dispose();
                    this.m_renderTargets.delete(idx);
                }
            }
            this.m_lastMeshCount = meshCount;
            this.m_needsBake = true;
            // Give async raster textures a few frames to load.
            this.m_extraBakeFrames = TerrainDraping.MAX_EXTRA_BAKES;
        }

        // Re-bake when morphing just completed (DEM textures changed).
        const morphing = this.m_terrain.isMorphing;
        if (this.m_wasMorphing && !morphing) {
            this.m_needsBake = true;
            this.m_extraBakeFrames = TerrainDraping.MAX_EXTRA_BAKES;
        }
        this.m_wasMorphing = morphing;

        // Consume extra-bake frames (for async raster textures).
        if (this.m_extraBakeFrames > 0) {
            this.m_extraBakeFrames--;
            this.m_needsBake = true;
        }

        if (!this.m_needsBake) return;
        // Skip bake while morphing — the DEM is mid-transition; bake after.
        if (morphing) return;

        this.m_needsBake = false;
        try {
            this.bakeAll();
        } catch {
            this.m_needsBake = true;
        }
    };

    private m_lastMeshCount = 0;
    private m_lastSceneChildren = -1;

    /**
     * Bake drape textures for all terrain tiles.
     *
     * For each tile:
     *   1. Build an OrthographicCamera covering the tile's world bounds
     *      (top-down view of the XZ plane).
     *   2. Create or reuse a WebGLRenderTarget.
     *   3. Temporarily hide terrain meshes, render the main scene (containing
     *      fill/line/raster/circle layers) to the FBO using the ortho camera.
     *   4. Restore terrain visibility.
     *   5. Feed the FBO texture to the terrain material via setDrapeTexture()
     *      and enable the USE_DRAPE define.
     */
    private bakeAll(): void {
        const renderer = this.m_mapView.renderer;
        if (!renderer) return;
        // Master switch. The bake pipeline is verified end-to-end (§12.76-60:
        // plain mesh + tile camera + no-depth RT + big-scene-first order all
        // rasterize; the historical "renderer blocker" was the broken −Y
        // camera fixed in §12.76-58). The content gate below auto-disables
        // drape when the FBO comes out uniform (empty bake).
        if (!TerrainDraping.DRAPE_ENABLED) return;
        // DRAPE_ALIGNMENT_CALIBRATION: dormant — see the gate at the
        // setDrapeTexture call below. Skip the bake entirely (its mid-frame
        // RT renders perturb engine GL state and regress fog/terrain).
        if (!TerrainDraping.DRAPE_ENABLED) return;

        const scene = this.m_mapView.scene;
        const terrainMeshes = new Set<THREE.Object3D>(this.m_terrain.meshes);
        if (terrainMeshes.size === 0) return;

        // Re-show the rasters hidden for the main render — the bake IS the
        // raster's rendering path under terrain (material-level gate).
        for (const m of this.m_rasterHidden) m.visible = true;

        const tiles = this.m_terrain.allDemTiles;
        const meshes = this.m_terrain.meshes;

        // Single pass: hide terrain meshes + environment objects together.
        const hidden: THREE.Object3D[] = [];
        let hasDrapableContent = false;
        scene.traverse((obj: THREE.Object3D) => {
            if (!obj.visible) return;
            if (terrainMeshes.has(obj)) {
                obj.visible = false;
                hidden.push(obj);
            } else if (this.isEnvironmentObject(obj)) {
                obj.visible = false;
                hidden.push(obj);
            } else if ((obj as any).isMesh
                && ((obj as any).material?.isMeshStandardMaterial
                    // Screen-space POI/text quads project as garbage under
                    // the top-down ortho bake camera — exclude.
                    || (obj as any).material?.isShaderMaterial)) {
                obj.visible = false;
                hidden.push(obj);
            } else if ((obj as any).isMesh || (obj as any).isSprite || (obj as any).isPoints) {
                // Found a visible non-terrain renderable object — there's
                // content worth draping.
                hasDrapableContent = true;
            }
        });

        // If the scene has no drapable content (only terrain + environment),
        // skip the bake entirely. The terrain will render with its own color.
        if (!hasDrapableContent) {
            for (const obj of hidden) obj.visible = true;
            return;
        }

        // The bake camera bounds are camera-RELATIVE (tile − camPos), but the
        // raster quads sit at ABSOLUTE world coords — shift them into the
        // relative frame for the bake, restore after.
        const camAbs = this.m_mapView.camera.position;
        const shifted: Array<[THREE.Mesh, THREE.Vector3]> = [];
        scene.traverse((o: any) => {
            if (o.isMesh && o.visible && !terrainMeshes.has(o) && Math.abs(o.position.x) > 1e5) {
                shifted.push([o, o.position.clone()]);
                o.position.set(
                    o.position.x - camAbs.x,
                    o.position.y - camAbs.y,
                    o.position.z - camAbs.z);
            }
        });

        const prevTarget = renderer.getRenderTarget();
        const prevClearColor = renderer.getClearColor(new THREE.Color());
        const prevClearAlpha = renderer.getClearAlpha();

        try {
            for (let i = 0; i < meshes.length && i < tiles.length; i++) {
                const mesh = meshes[i];
                const tile = tiles[i];
                if (!mesh || !tile) continue;

                // Create or reuse the render target for this tile.
                let rt = this.m_renderTargets.get(i);
                if (!rt) {
                    rt = new THREE.WebGLRenderTarget(this.m_bakeSize, this.m_bakeSize, {
                        depthBuffer: false,
                        stencilBuffer: false,
                    });
                    rt.texture.minFilter = THREE.LinearFilter;
                    rt.texture.magFilter = THREE.LinearFilter;
                    this.m_renderTargets.set(i, rt);
                }

                // Build orthographic top-down camera covering this tile.
                const camera = buildTileCamera(tile, (this.m_mapView as any).camera?.position);
                if (!camera) continue;

                // Render: bake the non-terrain layers into the FBO.
                // Clear to white opaque so empty areas (no layers) preserve
                // the terrain color. The shader uses alpha-blend (mix), so
                // alpha=1 on clear = "no drape content" = keep terrain color.
                renderer.setRenderTarget(rt);
                // mgl renders the background INTO the terrain drape pass, so
                // void areas show the (color-theme-aware) map background. Use
                // the live clear color instead of white; alpha=1 keeps the
                // "no drape content" blending semantics.
                // Clear with alpha 0: the terrain shader blends
                // mix(base, drape.rgb, drape.a) — empty areas MUST carry
                // alpha 0 to keep the terrain's own color (alpha 1 blanked
                // the whole tile to the clear color, the §472 black-field).
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                renderer.render(scene, camera);
                // Feed the baked texture to the terrain material — but ONLY
                // when the bake actually rasterized content. The ortho bake
                // is currently blocked at the renderer level (a plain mesh
                // with every GL test disabled still produces zero fragments;
                // see §12.76-58) and an empty FBO would flatten the terrain
                // to the clear color and REGRESS the fog/terrain fixtures.
                // This gate self-disables until that is solved.
                const S = this.m_bakeSize;
                const sample = new Uint8Array(4 * 5);
                renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, sample);
                renderer.readRenderTargetPixels(rt, S - 1, 0, 1, 1, sample, 4);
                renderer.readRenderTargetPixels(rt, 0, S - 1, 1, 1, sample, 8);
                renderer.readRenderTargetPixels(rt, S - 1, S - 1, 1, 1, sample, 12);
                renderer.readRenderTargetPixels(rt, S >> 1, S >> 1, 1, 1, sample, 16);
                let uniform = true;
                for (let k = 4; k < 20; k++) {
                    if (sample[k] !== sample[k % 4]) { uniform = false; break; }
                }
                if ((globalThis as any).__mbOccDbg && !(globalThis as any).__mbDrapLogged) {
                    (globalThis as any).__mbDrapLogged = 1;
                    let vis = 0; const kinds: Record<string, number> = {};
                    this.m_mapView.scene.traverse((o: any) => {
                        if (o.visible && (o.isMesh || o.isSprite || o.isPoints)) {
                            vis++;
                            const t = o.userData?.technique?.name ?? o.material?.type ?? '?';
                            kinds[t] = (kinds[t] ?? 0) + 1;
                        }
                    });
                    // Sample a coarse grid of the bake to characterize content.
                    const S = this.m_bakeSize;
                    const grid = new Uint8Array(4 * 25);
                    for (let gy = 0; gy < 5; gy++) {
                        for (let gx = 0; gx < 5; gx++) {
                            renderer.readRenderTargetPixels(rt,
                                Math.floor((gx + 0.5) * S / 5), Math.floor((gy + 0.5) * S / 5), 1, 1,
                                grid, gy * 5 * 4 + gx * 4);
                        }
                    }
                    const cells: string[] = [];
                    for (let k = 0; k < 25; k++) {
                        cells.push(grid[k * 4] + ',' + grid[k * 4 + 1] + ',' + grid[k * 4 + 2]);
                    }
                    let quadPos = '';
                    let terrainPos = '';
                    this.m_mapView.scene.traverse((o: any) => {
                        if (o.isMesh && o.material?.isMeshBasicMaterial && o.userData?.technique === undefined && !quadPos) {
                            quadPos = o.position.x.toFixed(0) + ',' + o.position.y.toFixed(0);
                        }
                    });
                    if (meshes[0]) {
                        const m0: any = meshes[0];
                        terrainPos = m0.position.x.toFixed(0) + ',' + m0.position.y.toFixed(0)
                            + ' vis=' + m0.visible + ' culled=' + m0.frustumCulled
                            + ' parent=' + (m0.parent?.type ?? 'none')
                            + ' inScene=' + this.m_mapView.scene.children.includes(m0.parent ?? m0)
                            + ' renderOrder=' + m0.renderOrder
                            + ' scale=' + m0.scale.x.toFixed(4);
                    }
                    const mv: any = this.m_mapView;
                    if (meshes[0]) {
                        const V3 = (require('three')).Vector3;
                        const rte = (typeof mv.getRteCamera === 'function')
                            ? mv.getRteCamera() : mv.m_rteCamera;
                        const center = meshes[Math.floor(meshes.length / 2)] ?? meshes[0];
                        const proj = (tag: string, cam: any) => {
                            if (!cam) { console.log('[MBProj] cam=' + tag + ' MISSING'); return; }
                            const v = new V3().copy(center.position);
                            v.project(cam);
                            // eslint-disable-next-line no-console
                            console.log('[MBProj] cam=' + tag + ' centerTilePos='
                                + center.position.x.toFixed(0) + ',' + center.position.y.toFixed(0)
                                + ' NDC=' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(3)
                                + ' nearFar=' + cam.near + ',' + cam.far);
                        };
                        proj('main', mv.camera);
                        proj('rte', rte);
                    }
                    // eslint-disable-next-line no-console
                    console.log('[MBScene] scene===m_scene:' + (mv.scene === mv.m_scene)
                        + ' root===' + (mv.scene === (mv as any).m_sceneRoot)
                        + ' sceneChildren=' + (mv.scene?.children?.length ?? -1)
                        + ' mSceneChildren=' + (mv.m_scene?.children?.length ?? -1));
                    const sceneRoot = (this.m_mapView as any).m_sceneRoot;
                    const rootPos = sceneRoot ? sceneRoot.position.x.toFixed(0) + ',' + sceneRoot.position.y.toFixed(0) : '?';
                    const camPos2 = this.m_mapView.camera.position.x.toFixed(0) + ',' + this.m_mapView.camera.position.y.toFixed(0);
                    // eslint-disable-next-line no-console
                    console.log('[MBDrap] bake uniform=' + uniform + ' grid=' + cells.slice(0, 3).join(' | ')
                        + ' | visibles=' + vis + ' kinds=' + JSON.stringify(kinds)
                        + ' quad=' + quadPos + ' terrain=' + terrainPos + ' root=' + rootPos + ' cam=' + camPos2
                        + ' tileO=' + tile?.originX?.toFixed(0) + ',' + tile?.originY?.toFixed(0) + ' size=' + tile?.size?.toFixed(0));
                }
                const mat = mesh.material as any;
                // Content gate: only enable the drape when the bake actually
                // produced non-uniform content (auto-disables on empty bakes).
                if (!uniform && mat && typeof mat.setDrapeTexture === 'function') {
                    mat.setDrapeTexture(rt.texture);
                    if (!mat.defines) mat.defines = {};
                    if (!mat.defines.USE_DRAPE) {
                        mat.defines.USE_DRAPE = '';
                        mat.needsUpdate = true;
                    }
                }
            }
        } finally {
            renderer.setRenderTarget(prevTarget);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            // Restore visibility and positions; re-hide the rasters for the
            // next main render frame.
            for (const obj of hidden) obj.visible = true;
            for (const [mesh, pos] of shifted) mesh.position.copy(pos);
            for (const m of this.m_rasterHidden) m.visible = false;
        }
    }

    /**
     * Heuristic: detect environment/overlay objects that should NOT appear
     * in the drape texture. Delegates to the shared utility.
     */
    private isEnvironmentObject(obj: THREE.Object3D): boolean {
        return isEnvironmentObject(obj);
    }
}
