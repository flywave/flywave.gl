import * as THREE from 'three';

import { MapView, Tile } from '@flywave/flywave-mapview';
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
        for (const g of ordered) {
            for (const k of g.raw) {
                this.m_v3.set(k.x, k.y, k.z).project(camera);
                if (this.m_v3.z > 1) continue; // behind camera
                const sx = (this.m_v3.x * 0.5 + 0.5) * w;
                const sy = (1 - (this.m_v3.y * 0.5 + 0.5)) * h;
                let radiusCssPx = k.radius;
                if (k.radiusExpr !== undefined) {
                    const r = MBExpressionEngine.evaluate(k.radiusExpr, {
                        zoom: exprZoom,
                        feature: { type: 'Point', properties: k.properties ?? {} },
                    });
                    if (typeof r === 'number' && isFinite(r)) radiusCssPx = r;
                }
                const rPx = Math.max(radiusCssPx * pixelRatio, 1);
                const weight = Math.max(k.weight, 0);
                const ratio = ZERO / (weight * g.intensity * GAUSS_COEF);
                let S = 0;
                if (isFinite(ratio) && ratio < 1) {
                    S = Math.min(Math.sqrt(-2 * Math.log(ratio)) / 3, 32);
                }
                const half = Math.max(S * rPx, 1);
                // Cull with the per-point quad half-size so large kernels
                // straddling the screen edge still contribute.
                if (sx < -half || sx > w + half || sy < -half || sy > h + half) continue;
                g.px.push(sx);
                g.py.push(sy);
                g.half.push(half);
                g.radiusPx.push(rPx);
                g.weight.push(k.weight);
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
                    this.updateKernelGeometry(g.px.length, g.px, g.py, g.half, g.radiusPx, g.weight);
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
                    };
                    groups.set(layerId, g);
                }
                g.raw.push(p);
            }
        }
        return groups;
    }

    private ensureRenderTarget(renderer: THREE.WebGLRenderer, w: number, h: number): void {
        if (this.m_rt && this.m_rtW === w && this.m_rtH === h) return;
        this.m_rt?.dispose();
        this.m_rt = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });
        this.m_rtW = w;
        this.m_rtH = h;
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
        const halfs = new Float32Array(count * 4);
        const radiusPxs = new Float32Array(count * 4);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 2));
        geo.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
        geo.setAttribute('aHalf', new THREE.BufferAttribute(halfs, 1));
        geo.setAttribute('aRadiusPx', new THREE.BufferAttribute(radiusPxs, 1));
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
                attribute float aHalf;
                attribute float aRadiusPx;
                uniform vec2 uViewport;
                varying vec2 vCenter;
                varying float vWeight;
                varying float vRadiusPx;
                void main() {
                    vec2 corner = position.xy;
                    vec2 px = aCenter + corner * aHalf;
                    vec2 ndc = (px / uViewport) * 2.0 - 1.0;
                    ndc.y = -ndc.y;
                    gl_Position = vec4(ndc, 0.0, 1.0);
                    vCenter = aCenter;
                    vWeight = aWeight;
                    vRadiusPx = aRadiusPx;
                }
            `,
            fragmentShader: `
                // mapbox heatmap kernel: val = weight * intensity * GAUSS_COEF
                // * exp(-0.5 * 3^2 * r^2) with r = pixelDist / heatmap-radius.
                // GAUSS_COEF = 1/sqrt(2*PI) (mapbox constants).
                uniform vec2 uViewport;
                uniform float uIntensity;
                varying vec2 vCenter;
                varying float vWeight;
                varying float vRadiusPx;
                void main() {
                    // gl_FragCoord origin is bottom-left; flip y to match the
                    // top-left pixel space the CPU projected the centers into.
                    vec2 fc = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
                    float r = length(fc - vCenter) / max(vRadiusPx, 0.0001);
                    float val = vWeight * uIntensity * 0.398942 * exp(-0.5 * 9.0 * r * r);
                    gl_FragColor = vec4(vec3(val), val);
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
    ): void {
        const geo = this.m_kernelGeo!;
        const positions = geo.getAttribute('position') as THREE.BufferAttribute;
        const centers = geo.getAttribute('aCenter') as THREE.BufferAttribute;
        const weights = geo.getAttribute('aWeight') as THREE.BufferAttribute;
        const aHalf = geo.getAttribute('aHalf') as THREE.BufferAttribute;
        const aRadiusPx = geo.getAttribute('aRadiusPx') as THREE.BufferAttribute;

        const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let i = 0; i < count; i++) {
            for (let c = 0; c < 4; c++) {
                const vi = i * 4 + c;
                positions.setXYZ(vi, corners[c][0], corners[c][1], 0);
                centers.setXY(vi, px[i], py[i]);
                weights.setX(vi, pw[i]);
                aHalf.setX(vi, halfs[i]);
                aRadiusPx.setX(vi, radiusPxs[i]);
            }
        }
        positions.needsUpdate = true;
        centers.needsUpdate = true;
        weights.needsUpdate = true;
        aHalf.needsUpdate = true;
        aRadiusPx.needsUpdate = true;
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
                    float d = texture2D(uDensity, vUv).a;
                    vec4 col = texture2D(uRamp, vec2(d, 0.5));
                    // mapbox: gl_FragColor = color * u_opacity (all channels).
                    gl_FragColor = vec4(col.rgb * uOpacity, col.a * uOpacity);
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
