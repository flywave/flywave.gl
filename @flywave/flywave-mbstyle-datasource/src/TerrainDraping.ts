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

        if ((globalThis as any).__mbOccDbg) {
            (globalThis as any).__mbBakeCount = ((globalThis as any).__mbBakeCount ?? 0) + 1;
            if ((globalThis as any).__mbBakeCount % 10 === 1) {
                // eslint-disable-next-line no-console
                console.log('[MBBake] runs=' + (globalThis as any).__mbBakeCount);
            }
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

        // Self-healing re-show (§497): rebuild the hidden-material set by a
        // FRESH traversal instead of trusting the cross-frame m_rasterHidden
        // list. The scene graph is rebuilt every frame (MapView clears
        // m_sceneRoot and TileObjectsRenderer re-adds tile objects with
        // per-technique materials), so an async-loaded tile can carry fresh
        // material instances the last WillRender snapshot never saw — those
        // stayed visible in the main render yet missing here. The bake IS
        // the raster's rendering path under terrain; also widen the far
        // cutoff (the bake ortho camera sits 6000 above the surface).
        {
            const seen = new Set<THREE.Material>();
            this.m_rasterHidden.length = 0;
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
            for (const m of this.m_rasterHidden) m.visible = true;
        }

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
            for (const m of this.m_rasterHidden) {
                m.visible = false;
                // §492: the __mbRasBake flag stays set permanently — the
                // widened far cutoff (×1e6) is harmless for the main render
                // (camera distances are far below) and resetting it in the
                // same frame coalesced the two needsUpdate flips into a
                // no-op, so the bake program never compiled.
            }
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
