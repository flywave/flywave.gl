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
    /** §504: bounded retry counter for placeholder→real drape convergence. */
    private m_contentRetries = 0;
    /** §505: whether the LAST bake pass produced real imagery. */
    private m_lastBakeAnyReal = false;
    /** §505: once a real snapshot is on the terrain, stop rebaking — the
     * placeholder→real lottery otherwise oscillates forever (attach fires
     * on every engine material rebuild) and the capture lands on a white
     * frame. Reset by real scene changes (terrain mesh count change). */
    private m_drapeFrozen = false;
    /** §505: immutable per-tile drape snapshots (DataTexture copies). */
    private m_snapshots = new Map<number, THREE.DataTexture>();
    /** §504: dedicated layer for raster meshes under terrain (unused repo-wide). */
    static readonly RASTER_LAYER = 2;
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

    /** §502: a raster texture finished attaching — rebake for MAX frames so
     * the drape converges to post-attach content. */
    onRasterAttached(): void {
        if (this.m_drapeFrozen) return;
        this.m_extraBakeFrames = TerrainDraping.MAX_EXTRA_BAKES;
        this.m_needsBake = true;
    }

    start(): void {
        if (this.m_active) return;
        this.m_active = true;
        if ((globalThis as any).__mbLiteDbg) {
            // eslint-disable-next-line no-console
            console.log('[MBLiteEntry] draping started');
        }
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
        for (const [, snap] of this.m_snapshots) {
            snap.dispose();
        }
        this.m_snapshots.clear();
    }

    get isActive(): boolean { return this.m_active; }

    /** §505: true once a bake pass captured real imagery and it has been
     * snapshotted onto the terrain — the render-test harness polls this
     * before capturing, so the frame never races the tile decode. */
    get drapeConverged(): boolean {
        return this.m_lastBakeAnyReal && this.m_snapshots.size > 0;
    }
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
        // §504: LAYER-based raster exclusion. Raster meshes live on layer 2
        // (unused repo-wide); the main layer-0 camera never draws them and
        // the bake camera opts in — with NO per-frame visibility toggling.
        // The old show/hide gate interleaved with the engine's per-frame
        // scene rebuild and flip-flopped the canvas (the §503 flicker:
        // calls 9↔18, px white/satellite/river lottery). Idempotent, and
        // it re-tags meshes created by later tile rebuilds (setTerrain).
        const scene = this.m_mapView.scene;
        scene.traverse((o: any) => {
            if ((o.isMesh || o.isPoints) && o.userData?.technique?._isRaster
                && o.layers.mask !== 2) {
                o.layers.set(2);
            }
        });
        // §505d frozen-state monitor: per-mesh drape/NDC + canvas pixel in
        // ONE line — which mesh holds the snapshot, is it on-screen, and
        // what does the canvas actually show.
        const frN = ((globalThis as any).__mbMonProbe ?? 0) + 1;
        (globalThis as any).__mbMonProbe = frN;
        if ((globalThis as any).__mbLiteDbg && frN % 150 === 0) {
            try {
                const mv: any = this.m_mapView;
                const rte = (typeof mv.getRteCamera === 'function')
                    ? mv.getRteCamera() : mv.m_rteCamera;
                const meshes = this.m_terrain.meshes;
                const V = new THREE.Vector3();
                const parts: string[] = [];
                meshes.forEach((mid: any, mi: number) => {
                    V.copy(mid.position).project(rte);
                    const dt = mid.material?.m_drapeTexture ?? null;
                    parts.push('#' + mi + 'N' + V.x.toFixed(1) + ',' + V.y.toFixed(1)
                        + 'D' + (dt ? (dt.isDataTexture ? 'S' : 'R') : '0'));
                });
                const gl2 = mv.renderer.getContext();
                const px = new Uint8Array(4);
                gl2.readPixels(Math.floor(gl2.drawingBufferWidth / 2),
                    Math.floor(gl2.drawingBufferHeight / 2), 1, 1,
                    gl2.RGBA, gl2.UNSIGNED_BYTE, px);
                // eslint-disable-next-line no-console
                console.log('[MBMon] frN=' + frN + ' frozen=' + this.m_drapeFrozen
                    + ' snaps=' + this.m_snapshots.size
                    + ' px=' + px[0] + ',' + px[1] + ',' + px[2]
                    + ' | ' + parts.join(' '));
            } catch {}
        }
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
            // Real scene change (setTerrain toggle) — allow re-convergence.
            this.m_drapeFrozen = false;
            this.m_contentRetries = 0;
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

        if ((globalThis as any).__mbOccDbg) {
            (globalThis as any).__mbBakeCount = ((globalThis as any).__mbBakeCount ?? 0) + 1;
            if ((globalThis as any).__mbBakeCount % 10 === 1) {
                // eslint-disable-next-line no-console
                console.log('[MBBake] runs=' + (globalThis as any).__mbBakeCount);
            }
        }
        if ((globalThis as any).__mbLiteDbg && ((globalThis as any).__mbEntryCount ?? 0) < 6) {
            (globalThis as any).__mbEntryCount = ((globalThis as any).__mbEntryCount ?? 0) + 1;
            // eslint-disable-next-line no-console
            console.log('[MBLiteEntry] afterRender needsBake=' + this.m_needsBake
                + ' meshCount=' + meshCount + ' extra=' + this.m_extraBakeFrames
                + ' children=' + childCount + '/' + this.m_lastSceneChildren);
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
        // §505: converged & frozen — the snapshots ARE the drape; further
        // bakes only re-roll the placeholder lottery.
        if (this.m_drapeFrozen) return;
        // §501 A/B kill switch (rtdisable=1): render terrain undraped.
        if ((globalThis as any).__mbRtDisable) return;
        // DRAPE_ALIGNMENT_CALIBRATION: dormant — see the gate at the
        // setDrapeTexture call below. Skip the bake entirely (its mid-frame
        // RT renders perturb engine GL state and regress fog/terrain).
        if (!TerrainDraping.DRAPE_ENABLED) return;

        const scene = this.m_mapView.scene;
        const terrainMeshes = new Set<THREE.Object3D>(this.m_terrain.meshes);
        if (terrainMeshes.size === 0) return;

        // §504: layer-based exclusion — raster meshes are on layer 2 and
        // always visible=true; the bake camera simply opts into layer 2.
        // No cross-frame visibility state exists anymore.
        {
            const seen = new Set<THREE.Material>();
            scene.traverse((o: any) => {
                if ((o.isMesh || o.isPoints) && o.userData?.technique?._isRaster) {
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of mats) {
                        if (!m || seen.has(m)) continue;
                        seen.add(m);
                        if (!(m as any).__mbRasBake) {
                            (m as any).__mbRasBake = true;
                            m.needsUpdate = true;
                        }
                        this.m_rasterHidden.push(m);
                    }
                }
            });
        }

        const tiles = this.m_terrain.allDemTiles;
        const meshes = this.m_terrain.meshes;

        // Single pass: hide terrain meshes + environment objects together.
        const hidden: THREE.Object3D[] = [];
        let hasDrapableContent = false;
        let liteFillCount = 0;
        scene.traverse((obj: THREE.Object3D) => {
            if (!obj.visible) return;
            if ((obj as any).isMesh && (obj as any).userData?.technique?._isRaster) liteFillCount++;
            if (terrainMeshes.has(obj)) {
                obj.visible = false;
                hidden.push(obj);
            } else if ((obj as any).isMesh
                // §505: the hillshade path builds ADDITIONAL TerrainControllers
                // (applyTerrain per DEM tile) whose MapTerrainMaterial meshes
                // are NOT in this.m_terrain.meshes — they drew the DEM-rgb-as-
                // color into the bake (the blue/black contamination). Hide
                // every terrain-material mesh regardless of controller.
                && typeof (obj as any).material?.setDemTexture === 'function') {
                obj.visible = false;
                hidden.push(obj);
            } else if (this.isEnvironmentObject(obj)) {
                obj.visible = false;
                hidden.push(obj);
            } else if ((obj as any).isMesh
                && (((obj as any).material?.isMeshStandardMaterial)
                    || ((obj as any).material?.isShaderMaterial
                        // mgl drapes vector LINES onto the terrain surface;
                        // engine line materials derive from RawShaderMaterial,
                        // so let the line family through and exclude only the
                        // non-drapable screen-space/environment shader objects
                        // (POI/text quads project as garbage under the ortho
                        // bake camera).
                        && obj.userData?.technique?.name !== 'solid-line'
                        && !obj.userData?.technique?._isLineRibbon))) {
                obj.visible = false;
                hidden.push(obj);
            } else if ((obj as any).isMesh && (obj.renderOrder ?? 0) <= -1000) {
                // Ground/background plane (mbstyle emitter emits background
                // with renderOrder −Infinity; engine BackgroundDataSource uses
                // MIN_SAFE_INTEGER; terrain is −100 and already hidden above).
                // In a depth-less painter-order RT these full-viewport quads
                // painted last over every other content — the §482 "9/9 bake
                // uniform black" writer. mgl's drape pass carries no separate
                // ground quad either: void areas keep the terrain color via
                // the alpha-0 mix.
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
        // §504: the self-heal above RE-SHOWED the raster materials — every
        // early return from here on MUST re-hide them, or they leak visible
        // into the next main render frame (the bake/main visibility interleave).
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

        // §499 REVERSAL of the §488 route-1 union widening: the "double
        // offset" was a misdiagnosis — fills from NEIGHBORING tiles legitimately
        // sit 1-2 tiles away, and unioning their bounds widened every tile's
        // bake window to ~2×2 tiles, destroying the per-tile vMapUv↔tile-world
        // 1:1 mapping (satellite squeezed into a corner of each drape, the
        // white-void + misalignment signature). mgl drapes with the STRICT
        // tile window; fills overlapping this tile land inside it naturally.
        // scene.updateMatrixWorld(true) removed with the measurement.

        const prevTarget = renderer.getRenderTarget();
        const prevClearColor = renderer.getClearColor(new THREE.Color());
        const prevClearAlpha = renderer.getClearAlpha();

        if ((globalThis as any).__mbOccDbg
            && ((globalThis as any).__mbScene2Count ?? 0) < 6) {
            (globalThis as any).__mbScene2Count = ((globalThis as any).__mbScene2Count ?? 0) + 1;
            let rasN = 0; let visN = 0;
            const parts: string[] = [];
            scene.traverse((o: any) => {
                if (!o.isMesh) return;
                if (o.visible) visN++;
                if (!o.userData?.technique?._isRaster) return;
                rasN++;
                if (parts.length < 6) {
                    o.geometry.computeBoundingBox?.();
                    const bb = o.geometry.boundingBox;
                    parts.push('p=' + (o.position.x ?? 0).toFixed(0) + ',' + (o.position.y ?? 0).toFixed(0)
                        + ' loc=' + (bb ? bb.min.x.toFixed(0) + '..' + bb.max.x.toFixed(0) + ',' + bb.min.y.toFixed(0) + '..' + bb.max.y.toFixed(0) : '?')
                        + ' matVis=' + (Array.isArray(o.material) ? o.material.map(m => m.visible).join('/') : o.material?.visible)
                        + ' ro=' + o.renderOrder);
                }
            });
            // eslint-disable-next-line no-console
            console.log('[MBScene2] visibles=' + visN + ' rasterMeshes=' + rasN
                + ' hiddenList=' + this.m_rasterHidden.length + ' | ' + parts.join(' || '));
        }

        // §499 LITE probe: per-tile one-liner (no readbacks). The heavy
        // occdbg probes distort bake timing; this one stays cheap enough
        // to keep the clean-universe behavior.
        if ((globalThis as any).__mbLiteDbg) {
            // eslint-disable-next-line no-console
            console.log('[MBLiteEntry] bakeAll entered');
        }
        const liteUniform: boolean[] = [];
        const liteFills: number[] = [];
        const liteAlpha: string[] = [];
        const tileReal: boolean[] = [];
        let anyReal = false;
        let passHadWhite = false;
        const bakeSeq = ++(globalThis as any).__mbBakeSeqCounter || 1;
        (globalThis as any).__mbBakeSeqCounter = bakeSeq;
        const tileOKey = (tiles[0]?.originX?.toFixed(0) ?? '?') + '_' + (tiles[0]?.originY?.toFixed(0) ?? '?');


        try {
            for (let i = 0; i < meshes.length && i < tiles.length; i++) {
                const mesh = meshes[i];
                const tile = tiles[i];
                if (!mesh || !tile) continue;

                // Create or reuse the render target for this tile.
                let rt = this.m_renderTargets.get(i);
                if (!rt || !(rt as any).__mbDepthV2) {
                    // §497: enable the depth buffer. A depth-less RT turned
                    // every draw into painter's-order with opaque/transparent
                    // bucket z-ties at ground level resolving unpredictably;
                    // mgl's drape FBO is depth-tested too.
                    if (rt) rt.dispose();
                    rt = new THREE.WebGLRenderTarget(this.m_bakeSize, this.m_bakeSize, {
                        depthBuffer: true,
                        stencilBuffer: false,
                    });
                    (rt as any).__mbDepthV2 = true;
                    rt.texture.minFilter = THREE.LinearFilter;
                    rt.texture.magFilter = THREE.LinearFilter;
                    this.m_renderTargets.set(i, rt);
                }

                // Build orthographic top-down camera covering this tile.
                const camera = buildTileCamera(tile, (this.m_mapView as any).camera?.position);
                if (!camera) continue;
                camera.layers.enable(TerrainDraping.RASTER_LAYER);

                if ((globalThis as any).__mbOccDbg && !(globalThis as any).__mbFillProj) {
                    (globalThis as any).__mbFillProj = 1;
                    const V3 = THREE.Vector3;
                    let n = 0;
                    this.m_mapView.scene.traverse((o: any) => {
                        if (n >= 3 || !o.isMesh || !o.visible || !o.userData?.technique?._isRaster) return;
                        o.geometry.computeBoundingSphere?.();
                        const bs = o.geometry.boundingSphere;
                        if (!bs) return;
                        const c = new V3().copy(bs.center).applyMatrix4(o.matrixWorld);
                        c.project(camera);
                        const mv: any = this.m_mapView;
                        const camW = mv.camera.position;
                        // VERTEX-LEVEL projection (bounding sphere center is
                        // polluted by tile-local geometry offsets): project
                        // the first 4 actual vertices through matrixWorld.
                        const pos = o.geometry?.attributes?.position;
                        if (pos) {
                            const V = new V3();
                            for (let vi = 0; vi < 4 && vi < pos.count; vi++) {
                                V.fromBufferAttribute(pos, vi).applyMatrix4(o.matrixWorld).project(camera);
                                // eslint-disable-next-line no-console
                                console.log('[MBVtx] fill#' + n + ' v' + vi + ' NDC=' + V.x.toFixed(2) + ',' + V.y.toFixed(2) + ',' + V.z.toFixed(3));
                            }
                        }
                        const absX = (o.position.x ?? 0) + camW.x;
                        const absY = (o.position.y ?? 0) + camW.y;
                        // eslint-disable-next-line no-console
                        console.log('[MBFillProj] fill#' + (n++) + ' NDC=' + c.x.toFixed(2) + ',' + c.y.toFixed(2) + ',' + c.z.toFixed(3)
                            + ' posRel=' + (o.position.x ?? 0).toFixed(0) + ',' + (o.position.y ?? 0).toFixed(0)
                            + ' abs=' + absX.toFixed(0) + ',' + absY.toFixed(0)
                            + ' camAbs=' + camW.x.toFixed(0) + ',' + camW.y.toFixed(0)
                            + ' tileO=' + tile.originX.toFixed(0) + ',' + tile.originY.toFixed(0)
                            + ' z12tile=' + Math.floor(absX / 9784) + ',' + Math.floor((40075017 - absY) / 9784)
                            + ' camTile=' + Math.floor(camW.x / 9784) + ',' + Math.floor((40075017 - camW.y) / 9784));
                    });
                }

                // Render: bake the non-terrain layers into the FBO.
                // Clear to white opaque so empty areas (no layers) preserve
                // the terrain color. The shader uses alpha-blend (mix), so
                // alpha=1 on clear = "no drape content" = keep terrain color.
                renderer.setRenderTarget(rt);
                // §501: the engine's progressive compositor leaves a SCISSOR
                // rect + scissorTest enabled on the shared renderer; our
                // offscreen pass inherited it and every draw was clipped to
                // a thin stale band (the RT-dump "rows 38-43 black strip") —
                // vanishing entirely once that geometry left the rect.
                // Scissor state is re-set by the engine on its own passes.
                renderer.setScissorTest(false);
                // mgl renders the background INTO the terrain drape pass, so
                // void areas show the (color-theme-aware) map background. Use
                // the live clear color instead of white; alpha=1 keeps the
                // "no drape content" blending semantics.
                // Clear with alpha 0: the terrain shader blends
                // mix(base, drape.rgb, drape.a) — empty areas MUST carry
                // alpha 0 to keep the terrain's own color (alpha 1 blanked
                // the whole tile to the clear color, the §472 black-field).
                renderer.setClearColor(0x000000, 0);
                renderer.clear(true, true, false);
                const __mbCalls0 = renderer.info.render.calls;
                renderer.render(scene, camera);
                if ((globalThis as any).__mbOccDbg && ((globalThis as any).__mbBakeCount % 20) === 3) {
                    // eslint-disable-next-line no-console
                    console.log('[MBDC] bake draw-calls delta=' + (renderer.info.render.calls - __mbCalls0)
                        + ' triangles=' + renderer.info.render.triangles);
                }
                // Feed the baked texture to the terrain material — but ONLY
                // when the bake actually rasterized content. The ortho bake
                // is currently blocked at the renderer level (a plain mesh
                // with every GL test disabled still produces zero fragments;
                // see §12.76-58) and an empty FBO would flatten the terrain
                // to the clear color and REGRESS the fog/terrain fixtures.
                // This gate self-disables until that is solved.
                const S = this.m_bakeSize;
                // §497 content detection: corner+center point sampling conflated
                // "content between the probe points" with "uniform black" (§489
                // already noted the ambiguity). Scan 9 full rows and count
                // distinct quantized colors among non-transparent pixels.
                const rowBuf = new Uint8Array(S * 4);
                const seenColors = new Set<number>();
                // Brightness stats over the same scan — the tone-calibration
                // probe (§499): is the baked satellite DARK (bake-side issue)
                // or pale (output-side issue) vs the ~177 expected mean?
                let statN = 0, statSum = 0, statMin = 255, statMax = 0;
                uniformity: for (let ry = 0; ry < 9; ry++) {
                    const py = Math.min(S - 1, Math.floor((ry + 0.5) * S / 9));
                    renderer.readRenderTargetPixels(rt, 0, py, S, 1, rowBuf);
                    for (let x = 0; x < S; x += 3) {
                        const o = x * 4;
                        if (rowBuf[o + 3] === 0) continue; // clear pixel — no content
                        const lum = (rowBuf[o] + rowBuf[o + 1] + rowBuf[o + 2]) / 3;
                        statN++; statSum += lum;
                        if (lum < statMin) statMin = lum;
                        if (lum > statMax) statMax = lum;
                        const key = ((rowBuf[o] >> 3) << 10)
                            | ((rowBuf[o + 1] >> 3) << 5)
                            | (rowBuf[o + 2] >> 3);
                        if (!seenColors.has(key)) {
                            seenColors.add(key);
                            if (seenColors.size >= 12) break uniformity;
                        }
                    }
                }
                const uniform = seenColors.size < 2;
                // §504 placeholder rejection: the pre-attach window bakes the
                // placeholder quads as SOLID NEAR-WHITE with dense coverage —
                // never apply that (the white drape freeze). statN counts
                // non-transparent pixels among 9 scanned rows (max 3·S).
                const meanL = statN ? statSum / statN : 255;
                // Dense = >half of the 9×S/3 scanned pixels (the C448/m255
                // placeholder bake slipped the old absolute threshold).
                const whitePlaceholder = !uniform && meanL > 245
                    && statN > (3 * S) / 2;
                if (whitePlaceholder) passHadWhite = true;
                const realContent = !uniform && !whitePlaceholder;
                tileReal.push(realContent);
                if (realContent) anyReal = true;
                if ((globalThis as any).__mbRtDump && !uniform
                    && ((globalThis as any).__mbRtDumpCount ?? 0) < 6) {
                    (globalThis as any).__mbRtDumpCount = ((globalThis as any).__mbRtDumpCount ?? 0) + 1;
                    // §501 full-RT dump: nearest-sample the 512² RT down to
                    // 64² and ship it over the karma console in chunked
                    // base64 (MBCollDUMP precedent). Reconstruction script
                    // reassembles rows into a PNG offline.
                    try {
                        const full = new Uint8Array(S * S * 4);
                        renderer.readRenderTargetPixels(rt, 0, 0, S, S, full);
                        const D = 64;
                        const small = new Uint8Array(D * D * 4);
                        for (let dy = 0; dy < D; dy++) {
                            const sy = Math.min(S - 1, Math.floor((dy + 0.5) * S / D));
                            for (let dx = 0; dx < D; dx++) {
                                const sx = Math.min(S - 1, Math.floor((dx + 0.5) * S / D));
                                const so = (sy * S + sx) * 4;
                                const dt = (dy * D + dx) * 4;
                                small[dt] = full[so];
                                small[dt + 1] = full[so + 1];
                                small[dt + 2] = full[so + 2];
                                small[dt + 3] = full[so + 3];
                            }
                        }
                        // PPM-style payload: one byte per channel, rows
                        // top-down (flip: GL y is bottom-up).
                        const rows: string[] = [];
                        for (let dy = D - 1; dy >= 0; dy--) {
                            let hex = '';
                            for (let dx = 0; dx < D; dx++) {
                                const t = (dy * D + dx) * 4;
                                hex += (small[t] >> 4).toString(16) + (small[t + 1] >> 4).toString(16)
                                    + (small[t + 2] >> 4).toString(16) + (small[t + 3] >> 6).toString(16);
                            }
                            rows.push(dy.toString(16).padStart(2, '0') + hex);
                        }
                        // 2 rows per chunk keeps every line < 1KB.
                        for (let c = 0; c < rows.length; c += 2) {
                            // eslint-disable-next-line no-console
                            console.log('[MBRTD]' + tileOKey + '|' + i + '|' + bakeSeq
                                + '|' + rows[c] + (rows[c + 1] ?? ''));
                        }
                    } catch {}
                }
                liteUniform.push(uniform);
                liteFills.push(liteFillCount);
                if ((globalThis as any).__mbLiteDbg) {
                    // One-row alpha/RGB histogram: opaque-black rows = the
                    // far-cutoff branch fired; transparent = never covered;
                    // colored = real content. Plus: CPU-read the first fill's
                    // texture SOURCE canvas center-row mean — what the GPU
                    // texture was uploaded from.
                    const lr = new Uint8Array(S * 4);
                    renderer.readRenderTargetPixels(rt, 0, S >> 1, S, 1, lr);
                    let opBlack = 0, transp = 0, colored = 0, colSum = 0;
                    for (let q = 0; q < S; q++) {
                        const o4 = q * 4;
                        if (lr[o4 + 3] === 0) transp++;
                        else if (lr[o4] + lr[o4 + 1] + lr[o4 + 2] === 0) opBlack++;
                        else { colored++; colSum += (lr[o4] + lr[o4 + 1] + lr[o4 + 2]) / 3; }
                    }
                    liteAlpha.push('B' + opBlack + '/T' + transp + '/C' + colored
                        + (colored ? '/m' + (colSum / colored).toFixed(0) : ''));
                    if (i === 0 && liteAlpha.length === 1) {
                        scene.traverse((o: any) => {
                            if (!o.isMesh || !o.userData?.technique?._isRaster) return;
                            const tex: any = (Array.isArray(o.material) ? o.material[0] : o.material)?.__mbRasMapTex;
                            try {
                                const imgC: any = tex?.image;
                                const cw = imgC?.width ?? 0, ch = imgC?.height ?? 0;
                                const ctx2 = imgC?.getContext?.('2d');
                                let m = -1;
                                if (ctx2 && cw > 0) {
                                    const d = ctx2.getImageData(cw >> 1, ch >> 1, 1, 1).data;
                                    m = (d[0] + d[1] + d[2]) / 3;
                                }
                                // eslint-disable-next-line no-console
                                console.log('[MBTex] ' + (tex?.__mbPadPx ? 'padded' : (tex?.__mbNoPad ? 'nopad' : 'raw'))
                                    + ' ' + cw + 'x' + ch + ' centerPx=' + (m >= 0 ? m.toFixed(0) : 'n/a')
                                    + ' uuid=' + tex?.uuid);
                            } catch { /* tainted */ }
                        });
                    }
                }
                if ((globalThis as any).__mbOccDbg && !uniform
                    && ((globalThis as any).__mbDrapContentful ?? 0) < 6) {
                    (globalThis as any).__mbDrapContentful =
                        ((globalThis as any).__mbDrapContentful ?? 0) + 1;
                    // Where do the few non-transparent pixels sit? First 8 (x,y).
                    const spots: string[] = [];
                    outer2: for (let ry2 = 0; ry2 < 9; ry2++) {
                        const py2 = Math.min(S - 1, Math.floor((ry2 + 0.5) * S / 9));
                        renderer.readRenderTargetPixels(rt, 0, py2, S, 1, rowBuf);
                        for (let x2 = 0; x2 < S; x2 += 3) {
                            const o2 = x2 * 4;
                            if (rowBuf[o2 + 3] !== 0) {
                                spots.push(x2 + ',' + py2 + ':a' + rowBuf[o2 + 3]);
                                if (spots.length >= 8) break outer2;
                            }
                        }
                    }
                    // Project the two in-window fills' bbox corners through the
                    // BAKE camera (CPU, matrixWorld) — separates object-transform
                    // collapse from vertex-shader collapse.
                    const V3p = THREE.Vector3;
                    const corners: string[] = [];
                    let cn = 0;
                    scene.updateMatrixWorld(true);
                    scene.traverse((o: any) => {
                        if (cn >= 2 || !o.isMesh || !o.visible || !o.userData?.technique?._isRaster) return;
                        cn++;
                        o.geometry.computeBoundingBox?.();
                        const bb = o.geometry.boundingBox;
                        if (!bb) return;
                        const pts: string[] = [];
                        for (const cx of [bb.min.x, bb.max.x]) {
                            for (const cy of [bb.min.y, bb.max.y]) {
                                const v = new V3p(cx, cy, 0).applyMatrix4(o.matrixWorld).project(camera);
                                pts.push('(' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ')');
                            }
                        }
                        corners.push('#' + (cn - 1) + ' q=' + pts.join(''));
                    });
                    // eslint-disable-next-line no-console
                    console.log('[MBDrapC] contentful bake tileO=' + (tile?.originX?.toFixed(0) ?? '?')
                        + ',' + (tile?.originY?.toFixed(0) ?? '?')
                        + ' px=' + statN + ' mean=' + (statN ? (statSum / statN).toFixed(1) : '?')
                        + ' min=' + statMin + ' max=' + statMax
                        + ' colors=' + seenColors.size
                        + ' camWin=[' + camera.left.toFixed(0) + '..' + camera.right.toFixed(0)
                        + ',' + camera.bottom.toFixed(0) + '..' + camera.top.toFixed(0) + ']'
                        + ' spots=' + spots.join(' ')
                        + ' | ' + corners.join(' | '));
                }
                const mat = mesh.material as any;
                // Content gate: only enable the drape when the bake actually
                // produced non-uniform content (auto-disables on empty bakes).
                if (realContent && mat && typeof mat.setDrapeTexture === 'function') {
                    // §505 IMMUTABLE SNAPSHOT: hand the terrain a COPY of the
                    // bake (DataTexture), never the live RT. The RT is re-
                    // rendered by every later bake pass (placeholder-white
                    // lottery included) and, being a live reference, every
                    // white pass painted straight through to the screen.
                    // The DataTexture keeps the RT's exact memory layout
                    // (row0 first, flipY=false), so the proven-good sampling
                    // is preserved byte-for-byte.
                    try {
                        const full = new Uint8Array(S * S * 4);
                        renderer.readRenderTargetPixels(rt, 0, 0, S, S, full);
                        const prevSnap = this.m_snapshots.get(i);
                        if (prevSnap) prevSnap.dispose();
                        const snap = new THREE.DataTexture(full, S, S);
                        snap.needsUpdate = true;
                        this.m_snapshots.set(i, snap);
                        mat.setDrapeTexture(snap);
                        // Freeze only when the WHOLE pass was real — a white
                        // placeholder anywhere means later passes may still
                        // converge other tiles.
                        if (!passHadWhite) this.m_drapeFrozen = true;
                    } catch {
                        mat.setDrapeTexture(rt.texture);
                    }
                    if (!mat.defines) mat.defines = {};
                    if (!mat.defines.USE_DRAPE) {
                        mat.defines.USE_DRAPE = '';
                        mat.needsUpdate = true;
                    }
                }
            }
            // §504 convergence: while raster fills exist but NO tile produced
            // real content, keep retrying (the attach-triggered frames and
            // tile churn will eventually produce real imagery) — bounded so
            // a truly empty scene freezes instead of looping forever.
            this.m_lastBakeAnyReal = anyReal;
            // §505: retry WITHOUT a count cap while raster meshes exist —
            // the satellite textures attach asynchronously and can take
            // hundreds of frames; a 30-frame cap froze the drape white
            // before the first real bake. The rasterHidden.length>0 guard
            // already prevents looping on truly empty scenes, and the
            // fixture lifetime bounds the retry in all cases.
            if (!this.m_drapeFrozen && this.m_rasterHidden.length > 0
                && (!anyReal || passHadWhite)) {
                this.m_contentRetries++;
                this.requestBake();
            } else if (anyReal && !passHadWhite) {
                this.m_contentRetries = 0;
            }
        } finally {
            if ((globalThis as any).__mbLiteDbg) {
                // eslint-disable-next-line no-console
                console.log('[MBLite] fills=' + liteFillCount
                    + ' camZoom=' + this.m_mapView.zoomLevel.toFixed(2)
                    + ' uniform=' + liteUniform.map(u => (u ? 1 : 0)).join('')
                    + ' perTileFills=' + liteFills.slice(0, 9).join(',')
                    + ' midRow=' + liteAlpha.slice(0, 9).join(' '));
            }
            renderer.setRenderTarget(prevTarget);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            // Restore visibility and positions; re-hide the rasters for the
            // next main render frame.
            for (const obj of hidden) obj.visible = true;
            for (const [mesh, pos] of shifted) mesh.position.copy(pos);
            // §504: raster materials stay visible=true permanently — their
            // meshes live on layer 2, invisible to the main camera without
            // any state flips (the §503 flicker source is gone).
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
