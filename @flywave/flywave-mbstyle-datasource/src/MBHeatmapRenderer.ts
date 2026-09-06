import * as THREE from 'three';

import { MapView, Tile } from '@flywave/flywave-mapview';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { MBExpressionEngine } from './MBExpressionEngine';
import { MBMaterialPatchManager } from './MBMaterialPatchManager';
import { MBStyleDataSource } from './MBStyleDataSource';

/** A raw heatmap kernel emitted by the decoder for one point feature. */
interface HeatmapKernel {
    x: number; y: number; z: number;
    weight: number;
    radius: number;       // CSS px at the decode/reference zoom
    technique: number;    // index into DecodedTile.techniques
    radiusExpr?: any;
    properties?: Record<string, any>;
}

/** Per-layer accumulator: kernels + resolved render config. */
interface HeatmapLayerGroup {
    layerId: string;
    renderOrder: number;
    intensity: number;
    opacity: number;
    rampKey: string;
    ramp: THREE.Texture;
    raw: HeatmapKernel[];
    // Projected (drawing-buffer pixel space) per-point arrays.
    px: number[];
    bx: number[];
    by: number[];
    s: number[];
    py: number[];
    half: number[];
    radiusPx: number[];
    weight: number[];
}

/**
 * Two-pass heatmap renderer (mapbox-style density → color-ramp pipeline).
 *
 * Mapbox-style heatmap layers need density accumulation (overlapping kernels)
 * followed by a color-ramp lookup, which a single forward pass cannot express.
 * This renderer collects the per-feature kernels that MBTileDataEmitter tagged
 * on each `DecodedTile.heatmapPoints` and draws them in AfterRender:
 *
 *   Pass 1 — offscreen: every point becomes a screen-space quad whose fragment
 *   shader writes `weight * intensity * GAUSS_COEF * exp(-0.5*9*r^2)` (mapbox
 *   kernel, `r = pixelDist / heatmap-radius`) with additive blending,
 *   accumulating overlapping kernels into an offscreen WebGLRenderTarget
 *   (alpha channel carries the accumulated density).
 *
 *   Pass 2 — composite: a fullscreen quad samples the density texture and maps
 *   it through the layer's `heatmap-color` ramp, blending over the already
 *   rendered scene with the layer's `heatmap-opacity`.
 *
 * Heatmap LAYERS are isolated: each style heatmap layer gets its own pass-1
 * accumulation + pass-2 composite, drawn in style-layer order, so a layer's
 * points are never tinted by another layer's ramp/intensity.
 *
 * Positions arrive in absolute world coordinates (same space the native
 * TextElementsRenderer uses), so kernels are projected through the mapview
 * camera on the CPU every frame — this keeps the kernels pixel-accurate under
 * zoom, rotation and tilt without any per-mesh world transforms.
 */
export class MBHeatmapRenderer {
    private m_rt: THREE.WebGLRenderTarget | null = null;
    private m_rtW = 0;
    private m_rtH = 0;

    /**
     * Density accumulation buffer resolution relative to the drawing buffer.
     * mapbox draws heatmap kernels into a 0.25x offscreen FBO (0.5x on globe)
     * and composites it back with bilinear filtering (draw_heatmap.ts:37-40);
     * the point-sampled accumulation + upsample shapes the visible density
     * field, so matching it is required for pixel alignment.
     */
    private readonly m_rtScale = 0.25;
    private m_rtHalfFloat = false;

    private m_scene: THREE.Scene;
    private m_camera: THREE.Camera;
    private m_kernelGeo: THREE.BufferGeometry | null = null;
    private m_kernelMat: THREE.ShaderMaterial | null = null;
    private m_kernelMesh: THREE.Mesh | null = null;

    private m_compScene: THREE.Scene;
    private m_compMat: THREE.ShaderMaterial | null = null;
    private m_compMesh: THREE.Mesh | null = null;

    private m_rampCache = new Map<string, THREE.Texture>();
    private m_kernelAllocated = 0;

    /**
     * Persistent per-tile kernel cache. The mapview clears a tile's
     * `decodedTile` as soon as geometry loading finishes
     * (Tile.attachGeometryLoadedCallback → removeDecodedTile), so reading
     * `tile.decodedTile.heatmapPoints` per-frame only works during the brief
     * loading window. Cache the kernels + techniques here (world-space points
     * don't need the decoded tile afterwards) and prune tiles that leave the
     * visible set.
     */
    private m_tileKernels = new Map<Tile, { kernels: HeatmapKernel[]; techniques: any[] }>();

    private m_v3 = new THREE.Vector3();

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {
        this.m_scene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.m_compScene = new THREE.Scene();
    }

    /**
     * Run both heatmap passes. Call once per frame from AfterRender.
     */
    run(): void {
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        const canvas = (this.m_mapView as any).canvas as HTMLCanvasElement | undefined;
        if (!renderer || !canvas) return;

        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;

        const camera = this.m_mapView.camera as THREE.Camera | undefined;
        if (!camera) return;

        // 1) Group kernels by heatmap layer across all decoded tiles, resolving
        //    each kernel's per-tile technique index to the layer's render config.
        //    The decoded tile is transient (cleared after geometry loads), so
        //    cache kernels per-tile here and keep them until the tile leaves.
        const tiles = this.m_dataSource.getDecodedTiles();
        for (const tile of tiles) {
            if (this.m_tileKernels.has(tile)) continue;
            const decoded = (tile as any)?.decodedTile as any;
            const pts = decoded?.heatmapPoints as HeatmapKernel[] | undefined;
            if (pts && pts.length > 0) {
                this.m_tileKernels.set(tile, {
                    kernels: [...pts],
                    techniques: decoded.techniques ?? [],
                });
            }
        }
        const live = new Set(tiles);
        for (const [tile] of [...this.m_tileKernels]) {
            if (!live.has(tile)) this.m_tileKernels.delete(tile);
        }
        const kernels = [...this.m_tileKernels.values()];
        const groups = MBHeatmapRenderer.buildGroups(
            kernels,
            (stops: any) => {
                const key = JSON.stringify(stops ?? null);
                let tex = this.m_rampCache.get(key);
                if (!tex) {
                    tex = MBMaterialPatchManager.buildGradientTexture(stops);
                    this.m_rampCache.set(key, tex);
                }
                return { texture: tex, key };
            },
        );
        if (groups.size === 0) return;

        // 2) Prune ramp textures no longer referenced by any current layer.
        const referenced = new Set<string>();
        for (const g of groups.values()) referenced.add(g.rampKey);
        for (const [key, tex] of [...this.m_rampCache]) {
            if (!referenced.has(key)) {
                tex.dispose();
                this.m_rampCache.delete(key);
            }
        }

        // 3) Project kernels to drawing-buffer pixels, per layer, in style order.
        const ordered = [...groups.values()].sort((a, b) => a.renderOrder - b.renderOrder);
        const pixelRatio = (this.m_mapView as any).pixelRatio ?? 1;
        // flywave camera zoom is mapbox zoom + 1 (see applyCameraSettings), so
        // zoom expressions re-evaluate at `zoomLevel - 1` — the same convention
        // the decoder uses when it evaluates paint at decode time.
        const exprZoom = (this.m_mapView as any).zoomLevel - 1;
        // mapbox heatmap kernel: height = weight * intensity * GAUSS_COEF, shape
        // exp(-0.5 * 3^2 * r^2) with r = pixelDist / heatmap-radius. The quad is
        // sized via S so the kernel falls to ZERO exactly at its edge (no
        // visible cutoff). mgl heatmap.vertex uses ZERO = 1/255/16 (an
        // empirically chosen 16x below the ubyte quantization floor to
        // minimize artifacts on overlapping kernels).
        const GAUSS_COEF = 0.398942; // 1 / sqrt(2*PI)
        const ZERO = 1 / 255 / 16;
        let maxCount = 0;
        // World repeat distance in world x-units (a full 360° of longitude maps
        // to one equatorial circumference). Kernels near the antimeridian must
        // be drawn at wrapped world copies, like mgl's renderWorldCopies.
        const worldRepeatX = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        for (const g of ordered) {
            for (const k of g.raw) {
                let radiusCssPx = k.radius;
                if (k.radiusExpr !== undefined) {
                    const r = MBExpressionEngine.evaluate(k.radiusExpr, {
                        zoom: exprZoom,
                        feature: { type: 'Point', properties: k.properties ?? {} },
                    });
                    if (typeof r === 'number' && isFinite(r)) radiusCssPx = r;
                }
                // §859: during the globe→mercator transition the blended tile
                // is displayed at the mercator tile scale 2^(zoom−covering) —
                // mgl's globe branch (globePixelsToTileUnits ×
                // _pixelsPerMercatorPixel) carries the same factor. Kernels
                // sized at full CSS px rendered ~1.8× too large and merged
                // into one blob (heatmap/near-transition). Phase-0 fixtures
                // keep the empirically tuned full-px sizing.
                const blendPhase =
                    Number((globalThis as any).__mbMercTransitionPhase ?? 0);
                const tileScale = blendPhase > 0
                    ? Math.pow(2, (this.m_mapView as any).zoomLevel - 1
                        - Math.round((this.m_mapView as any).zoomLevel - 1))
                    : 1;
                const rPx = Math.max(radiusCssPx * pixelRatio * tileScale, 1);
                const weight = Math.max(k.weight, 0);
                const ratio = ZERO / (weight * g.intensity * GAUSS_COEF);
                let S = 0;
                if (isFinite(ratio) && ratio < 1) {
                    S = Math.min(Math.sqrt(-2 * Math.log(ratio)) / 3, 32);
                }
                const half = Math.max(S * rPx, 1);
                // Ground-projection basis (mgl extrudes the kernel in tile
                // space): the full-corner world offset along the map-plane
                // axes, projected to screen, gives the conjugate diameters of
                // the pitch ellipse. Zero pitch degenerates to (half,0)/(0,half).
                const emitKernel = (sx: number, sy: number, bx: number[], by: number[]) => {
                    // Cull with the per-point quad half-size so large kernels
                    // straddling the screen edge still contribute.
                    if (sx < -half || sx > w + half || sy < -half || sy > h + half) return;
                    // Pass density-buffer-space values (mapbox accumulates into a
                    // 0.25x offscreen buffer, see m_rtScale).
                    const s = this.m_rtScale;
                    g.px.push(sx * s);
                    g.py.push(sy * s);
                    g.half.push(half * s);
                    g.radiusPx.push(rPx * s);
                    g.weight.push(k.weight);
                    g.bx.push(bx[0], bx[1]);
                    g.by.push(by[0], by[1]);
                    g.s.push(S);
                };
                const projectToPx = (x: number, y: number, z: number): [number, number] | null => {
                    this.m_v3.set(x, y, z).project(camera);
                    if (this.m_v3.z > 1) return null; // behind camera
                    const sx = (this.m_v3.x * 0.5 + 0.5) * w;
                    const sy = (1 - (this.m_v3.y * 0.5 + 0.5)) * h;
                    return [sx, sy];
                };
                const base = projectToPx(k.x, k.y, k.z);
                if (!base) continue;
                // Derive the ground→screen scale from the camera itself: a
                // small world-space probe offset projected at the kernel gives
                // the local pixels-per-meter Jacobian. The analytic
                // metersPerPixel formula was off 2x (flywave zoomLevel is
                // mapbox zoom + 1) and collapsed every kernel. The ground
                // radius is chosen with the geometric-mean scale so the mean
                // screen radius is exactly `half` px — zero pitch degenerates
                // precisely to the old (half,0)/(0,half) basis.
                const camDist = Math.hypot(
                    camera.position.x - k.x, camera.position.y - k.y, camera.position.z - k.z);
                const eps = Math.max(camDist * 0.02, 1e-6);
                const sc = this.m_rtScale;
                // §861: on the globe, probe along the LOCAL GROUND directions
                // (east/north at the kernel's ECEF position), not the world
                // x/y axes. Globe world axes are tilted relative to the ground
                // plane (at lat 20 the +x axis carries a sin(20°)=0.34
                // up-component) and at grazing pitch the up projection
                // dominates — the measured Jacobian went near-circular,
                // killing the pitch foreshortening (blobs rendered round
                // instead of squashed). On the mercator plane the world axes
                // ARE the ground directions — keep the original probes there.
                const isSpherical =
                    Number((this.m_mapView as any).projection?.type) === 1;
                // Ground-frame probes only matter when the view is oblique
                // enough for the axis tilt to contaminate the Jacobian
                // (pitch>45° or the globe→mercator transition) — pitch-0
                // fixtures keep the empirically tuned world-axis probes.
                const mvTilt = Number((this.m_mapView as any).tilt ?? 0);
                const useGroundFrame = isSpherical &&
                    (blendPhase > 0 || mvTilt > Math.PI / 4);
                let east = [1, 0, 0];
                let north = [0, 1, 0];
                if (useGroundFrame) {
                    const rho = Math.hypot(k.x, k.y) || 1;
                    east = [-k.y / rho, k.x / rho, 0];
                    const exLen = Math.hypot(k.x, k.y, k.z) || 1;
                    // north = p̂ × east (unit, tangent, points to the north)
                    const px_ = k.x / exLen, py_ = k.y / exLen, pz_ = k.z / exLen;
                    north = [
                        -pz_ * east[1],
                        pz_ * east[0],
                        px_ * east[1] - py_ * east[0],
                    ];
                }
                const basisAt = (cx: number, cy: number, cbase: [number, number]): {
                    bx: number[]; by: number[];
                } => {
                    const axPt = projectToPx(cx + east[0] * eps, cy + east[1] * eps, k.z + east[2] * eps);
                    const ayPt = projectToPx(cx + north[0] * eps, cy + north[1] * eps, k.z + north[2] * eps);
                    if (!axPt || !ayPt) return { bx: [half * sc, 0], by: [0, half * sc] };
                    const exv = [axPt[0] - cbase[0], axPt[1] - cbase[1]];
                    const eyv = [ayPt[0] - cbase[0], ayPt[1] - cbase[1]];
                    const lx = Math.hypot(exv[0], exv[1]) / eps;
                    const ly = Math.hypot(eyv[0], eyv[1]) / eps;
                    if (!isFinite(lx) || !isFinite(ly) || lx <= 0 || ly <= 0) {
                        return { bx: [half * sc, 0], by: [0, half * sc] };
                    }
                    // ground radius whose mean projected radius is `half` px
                    const f = half / (Math.sqrt(lx * ly) * eps);
                    return {
                        bx: [exv[0] * f * sc, exv[1] * f * sc],
                        by: [eyv[0] * f * sc, eyv[1] * f * sc],
                    };
                };
                const { bx: bxAbs, by: byAbs } = basisAt(k.x, k.y, base);
                emitKernel(base[0], base[1], bxAbs, byAbs);
                // Wrapped world copies (± one world along x) — mgl renders the
                // offscreen pass over all MultiTileIDs, including the
                // antimeridian replicates.
                // Wrapped copies compute their OWN basis — the screen
                // Jacobian differs at the replicated position (heatmap/
                // antimeridian shows cyan-vs-lime density differences).
                const west = projectToPx(k.x - worldRepeatX, k.y, k.z);
                if (west) {
                    const b = basisAt(k.x - worldRepeatX, k.y, west);
                    emitKernel(west[0], west[1], b.bx, b.by);
                }
                const eastRep = projectToPx(k.x + worldRepeatX, k.y, k.z);
                if (eastRep) {
                    const b = basisAt(k.x + worldRepeatX, k.y, eastRep);
                    emitKernel(eastRep[0], eastRep[1], b.bx, b.by);
                }
            }
            if (g.px.length > maxCount) maxCount = g.px.length;
        }
        if (maxCount === 0) return;

        this.ensureRenderTarget(renderer, w, h);
        this.ensureKernelGeometry(maxCount);
        this.ensureCompositeMesh();

        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        const prevClearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(prevClearColor);

        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);

            for (const g of ordered) {
                if (g.px.length === 0) continue;

                // Pass 1: accumulate this layer's kernels into the density buffer.
                renderer.setRenderTarget(this.m_rt);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                if (this.m_kernelMat) {
                    this.m_kernelMat.uniforms.uIntensity.value = g.intensity;
                }
                if (this.m_kernelGeo && this.m_kernelMat && this.m_kernelMesh) {
                    this.updateKernelGeometry(g.px.length, g.px, g.py, g.half, g.radiusPx, g.weight, g.bx, g.by, g.s);
                    const mesh = this.m_kernelMesh;
                    this.m_scene.add(mesh);
                    renderer.render(this.m_scene, this.m_camera);
                    this.m_scene.remove(mesh);
                }

                // Pass 2: composite this layer's ramp over the scene.
                renderer.setRenderTarget(null);
                if (this.m_compMat && this.m_compMesh) {
                    this.m_compMat.uniforms.uDensity.value = this.m_rt!.texture;
                    this.m_compMat.uniforms.uRamp.value = g.ramp;
                    this.m_compMat.uniforms.uOpacity.value = g.opacity;
                    renderer.render(this.m_compScene, this.m_camera);
                }
            }
        } finally {
            renderer.setRenderTarget(prevRT);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            renderer.autoClear = prevAutoClear;
        }
    }

    dispose(): void {
        this.m_rt?.dispose();
        this.m_rt = null;
        this.m_kernelGeo?.dispose();
        this.m_kernelGeo = null;
        this.m_kernelMat?.dispose();
        this.m_kernelMat = null;
        this.m_kernelMesh = null;
        this.m_compMat?.dispose();
        this.m_compMat = null;
        this.m_compMesh?.geometry.dispose();
        this.m_compMesh = null;
        for (const tex of this.m_rampCache.values()) tex.dispose();
        this.m_rampCache.clear();
        this.m_tileKernels.clear();
    }

    /**
     * Group heatmap kernels from decoded tiles by style heatmap layer, resolving
     * each kernel's per-tile technique index into the layer's render config
     * (ramp, intensity, opacity, style order). Pure — `getRamp` supplies the
     * cached ramp texture so callers control texture lifecycle.
     */
    static buildGroups(
        tileKernels: Array<{ kernels: HeatmapKernel[]; techniques: any[] }>,
        getRamp: (stops: any) => { texture: THREE.Texture; key: string },
    ): Map<string, HeatmapLayerGroup> {
        const groups = new Map<string, HeatmapLayerGroup>();
        for (const entry of tileKernels) {
            const techs = entry.techniques as any[] | undefined;
            const pts = entry.kernels as HeatmapKernel[] | undefined;
            if (!pts || pts.length === 0 || !techs) continue;
            for (const p of pts) {
                const tech = techs[p.technique];
                if (!tech?._isHeatmap) continue;
                const layerId = tech._layerId ?? `tile-${p.technique}`;
                let g = groups.get(layerId);
                if (!g) {
                    const { texture, key } = getRamp(tech._heatmapColorStops);
                    g = {
                        layerId,
                        renderOrder: Number(tech.renderOrder ?? tech._renderOrder ?? 0),
                        intensity: Number(tech._heatmapIntensity ?? 1),
                        opacity: Number(tech.opacity ?? 1),
                        rampKey: key,
                        ramp: texture,
                        raw: [],
                        px: [], py: [], half: [], radiusPx: [], weight: [],
                        bx: [], by: [], s: [],
                    };
                    groups.set(layerId, g);
                }
                // The engine loads several tile levels for the same area —
                // one geojson/vector point feature is collected once per
                // TILE, stacking identical kernels and multiplying the
                // density (observed 3x on heatmap-radius/antimeridian: a
                // single point rendered at peak red instead of mgl's
                // GAUSS_COEF-scaled ~0.4 green). mgl loads one tile per
                // area, so collapse exact same-position duplicates (the same
                // feature re-collected from a sibling tile); wrapped world
                // copies are emitted later per kernel and are unaffected.
                if (!g.raw.some(q => q.x === p.x && q.y === p.y && q.z === p.z)) {
                    g.raw.push(p);
                }
            }
        }
        return groups;
    }

    private ensureRenderTarget(renderer: THREE.WebGLRenderer, w: number, h: number): void {
        const rtW = Math.max(Math.ceil(w * this.m_rtScale), 1);
        const rtH = Math.max(Math.ceil(h * this.m_rtScale), 1);
        if (this.m_rt && this.m_rtW === rtW && this.m_rtH === rtH) return;
        this.m_rt?.dispose();
        // mapbox uses RGBA16F when available (Framebuffer.createWithTexture),
        // falling back to RGBA8. WebGL2 natively supports rendering to and
        // linearly filtering RGBA16F; otherwise fall back to ubyte.
        const webgl2 = (renderer.capabilities as any)?.isWebGL2;
        const type = webgl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.m_rt = new THREE.WebGLRenderTarget(rtW, rtH, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type,
        });
        this.m_rtHalfFloat = type === THREE.HalfFloatType;
        this.m_rtW = rtW;
        this.m_rtH = rtH;
    }

    private ensureKernelGeometry(count: number): void {
        if (this.m_kernelGeo && this.m_kernelMat && this.m_kernelMesh && count <= this.m_kernelAllocated) return;

        this.m_kernelGeo?.dispose();
        this.m_kernelMat?.dispose();
        this.m_kernelAllocated = count;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3 * 4);
        const centers = new Float32Array(count * 2 * 4);
        const weights = new Float32Array(count * 4);
        // Ground-projected kernels (mgl heatmap.vertex extrudes in TILE
        // space, so at pitch the circle becomes a screen ellipse): the quad
        // corner parameter (±1) maps through per-kernel screen basis
        // vectors (full corner offsets in density-buffer px), and the
        // fragment distance stays isotropic in the PARAMETER space.
        const basisX = new Float32Array(count * 2 * 4);
        const basisY = new Float32Array(count * 2 * 4);
        const scales = new Float32Array(count * 4);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 2));
        geo.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
        geo.setAttribute('aBasisX', new THREE.BufferAttribute(basisX, 2));
        geo.setAttribute('aBasisY', new THREE.BufferAttribute(basisY, 2));
        geo.setAttribute('aS', new THREE.BufferAttribute(scales, 1));
        const indices = new Uint32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const b = i * 4;
            const base = i * 6;
            indices[base + 0] = b;
            indices[base + 1] = b + 1;
            indices[base + 2] = b + 2;
            indices[base + 3] = b + 2;
            indices[base + 4] = b + 1;
            indices[base + 5] = b + 3;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            side: THREE.DoubleSide,
            uniforms: {
                uViewport: { value: new THREE.Vector2(this.m_rtW, this.m_rtH) },
                uIntensity: { value: 1 },
            },
            vertexShader: `
                attribute vec2 aCenter;
                attribute float aWeight;
                attribute vec2 aBasisX;
                attribute vec2 aBasisY;
                attribute float aS;
                uniform vec2 uViewport;
                varying vec2 vParam;
                varying float vWeight;
                void main() {
                    vec2 corner = position.xy;
                    vec2 px = aCenter + corner.x * aBasisX + corner.y * aBasisY;
                    vec2 ndc = (px / uViewport) * 2.0 - 1.0;
                    ndc.y = -ndc.y;
                    gl_Position = vec4(ndc, 0.0, 1.0);
                    // Parameter space is isotropic in GROUND units: the
                    // projected ellipse comes from the basis, the Gaussian
                    // radial falloff stays circular in (u, v).
                    vParam = corner * aS;
                    vWeight = aWeight;
                }
            `,
            fragmentShader: `
                // mapbox heatmap kernel: val = weight * intensity * GAUSS_COEF
                // * exp(-0.5 * 3^2 * r^2), r in heatmap-radius units.
                // GAUSS_COEF = 1/sqrt(2*PI) (mapbox constants).
                uniform float uIntensity;
                varying vec2 vParam;
                varying float vWeight;
                void main() {
                    float r = length(vParam);
                    float val = vWeight * uIntensity * 0.398942 * exp(-0.5 * 9.0 * r * r);
                    // mapbox heatmap pass 1: density in the RED channel, alpha
                    // constant 1 (the composite pass reads the .r channel).
                    gl_FragColor = vec4(val, 1.0, 1.0, 1.0);
                }
            `,
        });

        this.m_kernelGeo = geo;
        this.m_kernelMat = mat;
        this.m_kernelMesh = new THREE.Mesh(geo, mat);
        this.m_kernelMesh.frustumCulled = false;
    }

    private updateKernelGeometry(
        count: number,
        px: number[], py: number[],
        halfs: number[], radiusPxs: number[], pw: number[],
        bxs: number[], bys: number[], ss: number[],
    ): void {
        const geo = this.m_kernelGeo!;
        const positions = geo.getAttribute('position') as THREE.BufferAttribute;
        const centers = geo.getAttribute('aCenter') as THREE.BufferAttribute;
        const weights = geo.getAttribute('aWeight') as THREE.BufferAttribute;
        const aBasisX = geo.getAttribute('aBasisX') as THREE.BufferAttribute;
        const aBasisY = geo.getAttribute('aBasisY') as THREE.BufferAttribute;
        const aS = geo.getAttribute('aS') as THREE.BufferAttribute;

        const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let i = 0; i < count; i++) {
            for (let c = 0; c < 4; c++) {
                const vi = i * 4 + c;
                positions.setXYZ(vi, corners[c][0], corners[c][1], 0);
                centers.setXY(vi, px[i], py[i]);
                weights.setX(vi, pw[i]);
                aBasisX.setXY(vi, bxs[i * 2], bxs[i * 2 + 1]);
                aBasisY.setXY(vi, bys[i * 2], bys[i * 2 + 1]);
                aS.setX(vi, ss[i]);
            }
        }
        positions.needsUpdate = true;
        centers.needsUpdate = true;
        weights.needsUpdate = true;
        aBasisX.needsUpdate = true;
        aBasisY.needsUpdate = true;
        aS.needsUpdate = true;
        geo.setDrawRange(0, count * 6);

        if (this.m_kernelMat) {
            (this.m_kernelMat.uniforms.uViewport.value as THREE.Vector2).set(this.m_rtW, this.m_rtH);
        }
    }

    /**
     * Build the composite fullscreen quad the first time it is needed.
     */
    private ensureCompositeMesh(): void {
        if (this.m_compMesh && this.m_compMat) return;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        this.m_compMat = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            // mapbox composites the density ramp with premultiplied blending
            // ([ONE, ONE_MINUS_SRC_ALPHA], painter.colorModeForRenderPass):
            // gl_FragColor = color * u_opacity is already premultiplied, so the
            // output must NOT be re-premultiplied by its alpha in the blend.
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            uniforms: {
                uDensity: { value: null },
                uRamp: { value: null },
                uOpacity: { value: 1 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = position.xy * 0.5 + 0.5;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uDensity;
                uniform sampler2D uRamp;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    // mapbox heatmap composite reads the RED density channel.
                    float d = texture2D(uDensity, vUv).r;
                    vec4 col = texture2D(uRamp, vec2(d, 0.5));
                    // §859: the ramp texture is STRAIGHT-alpha (the default
                    // ramp starts at rgba(33,102,172,0)) while the blend is
                    // premultiplied (ONE, ONE_MINUS_SRC_ALPHA) — without
                    // premultiplying here, zero-density areas ADDED their full
                    // ramp rgb (blue wash over the whole frame,
                    // heatmap/near-transition).
                    gl_FragColor = vec4(col.rgb * col.a * uOpacity, col.a * uOpacity);
                }
            `,
        });

        const mesh = new THREE.Mesh(geo, this.m_compMat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 100000;
        this.m_compMesh = mesh;
        this.m_compScene.add(mesh);
    }
}
