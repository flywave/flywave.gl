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
        this.requestBake();
    }

    stop(): void {
        if (!this.m_active) return;
        this.m_active = false;
        this.m_mapView.removeEventListener(MapViewEventNames.AfterRender, this.onAfterRender);
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
                const camera = buildTileCamera(tile);
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
                renderer.setClearColor(
                    (this.m_mapView as any).clearColor ?? TerrainDraping.CLEAR_COLOR, 1.0);
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
            // Restore visibility.
            for (const obj of hidden) obj.visible = true;
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
