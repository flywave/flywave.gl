/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import type { MBStyleDataSource } from './MBStyleDataSource';

/**
 * Two-pass `line-blend-mode: additive` renderer, mirroring mgl
 * `draw_line.ts`'s additive glass mode.
 *
 * Direct THREE.AdditiveBlending cannot reproduce the mapbox composite: mgl
 * renders the layer's lines into an offscreen FBO accumulating
 *
 *   RGB: src.rgb·src.a + dst  =  Σ(C·fa·cov)   (C = line color, fa = its alpha)
 *   A:   src.a + dst          =  Σ(cov)        (density; AA coverage × opacity)
 *
 * (ColorMode.additiveAlphaWeightedUnboundedAlpha = [SRC_ALPHA, ONE, ONE, ONE]
 * on a float FBO), then composites per layer with
 * `line_blend_composite.fragment.glsl`:
 *
 *   avg = rgb / density
 *   n   = density / maxDensity
 *   t   = sqrt(n / (n + 1))
 *   out = (avg·t, t)          drawn ADDITIVELY → dst + avg·t²
 *
 * maxDensity is `line-blend-additive-clamp` when > 0, otherwise
 * `max(meanOccupiedDensity × 2, 1)` read back from the accumulation buffer
 * (mgl reduces the FBO to 1×1 asynchronously; a synchronous readPixels of the
 * alpha channel every other frame is equivalent for static scenes). Until a
 * maxDensity is known, compositing is SKIPPED — mgl hides the layer rather
 * than flashing at full brightness.
 *
 * Verified against the render-test references (§12.68): the `additive`
 * fixture's single-line pixels are exactly avg·n/(n+1) = (51,40,0) and the
 * 3-line crossing (76,60,0); the 8-line `additive-auto-density` fixture
 * implies maxDensity ≈ 2.6 = mean(~1.3)·2.
 *
 * The additive ribbon meshes are hidden from the main scene by the material
 * patcher (visible=false, registered in {@link additiveRibbons}); their
 * SolidLine twins are not emitted at all (emitter skipSolidLine). Every
 * AfterRender the registered ribbons are re-drawn into the density FBO with
 * the mapview's relative-to-eye camera — tile objects are re-positioned
 * camera-relative on the CPU each frame (TileObjectsRenderer), so their
 * matrixWorld is valid with the RTE camera until the next frame.
 */
export interface AdditiveRibbon {
    mesh: THREE.Mesh;
    technique: any;
}

/** Registry filled by MBMaterialPatchManager.patchTile each time it patches. */
export const additiveRibbons: AdditiveRibbon[] = [];

interface AdditiveGroup {
    layerId: string;
    renderOrder: number;
    clamp: number; // 0 = auto (mean occupied density × 2, min 1)
    meshes: THREE.Mesh[];
}

const COMP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// mgl line_blend_composite.fragment.glsl additive branch (t = sqrt(n/(n+1))).
// Drawn with additiveAlphaWeighted blending, so the visible contribution is
// avg·t² = avg·n/(n+1) over the background.
const COMP_FRAG = /* glsl */ `
uniform sampler2D uDensity;
uniform float uMaxDensity;
varying vec2 vUv;
void main() {
    vec4 c = texture2D(uDensity, vUv);
    if (c.a <= 0.0) {
        discard;
    }
    float density = c.a;
    vec3 avg = c.rgb / max(density, 0.001);
    float n = density / max(uMaxDensity, 0.001);
    float t = sqrt(n / (n + 1.0));
    gl_FragColor = vec4(avg * t, t);
}
`;

export class MBAdditiveLineRenderer {
    private m_rt: THREE.WebGLRenderTarget | null = null;
    private m_rtW = 0;
    private m_rtH = 0;
    private m_rtHalfFloat = false;
    private m_scene = new THREE.Scene();
    private m_compScene = new THREE.Scene();
    private m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private m_compMat: THREE.ShaderMaterial | null = null;
    private m_tmpMeshes: THREE.Mesh[] = [];
    /** Accumulation material clones cached on their source material. */
    private m_cloneSet = new Set<THREE.Material>();
    /** layerId → cached auto maxDensity (readback result). */
    private m_autoDensity = new Map<string, number>();
    private m_framesSinceReadback = 0;

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {}

    /** Run the additive accumulation + composite passes (AfterRender). */
    run(): void {
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        const canvas = (this.m_mapView as any).canvas as HTMLCanvasElement | undefined;
        if (!renderer || !canvas || additiveRibbons.length === 0) return;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;
        const camera = (this.m_mapView as any).getRteCamera?.() as
            | THREE.PerspectiveCamera
            | undefined;
        if (!camera) return;

        // Drop registrations whose mesh left the scene root (tile evicted;
        // the scene root is rebuilt every frame, so a mesh that did not take
        // part in this frame's render has no parent).
        for (let i = additiveRibbons.length - 1; i >= 0; i--) {
            if (!additiveRibbons[i].mesh.parent) additiveRibbons.splice(i, 1);
        }
        if (additiveRibbons.length === 0) return;

        const groups = this.groupRibbons();
        if (groups.length === 0) return;

        this.ensureRenderTarget(renderer, w, h);
        this.ensureCompositeMesh();

        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        const prevClearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(prevClearColor);

        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);

            for (const g of groups) {
                // Pass 1: accumulate this layer's ribbons into the density FBO.
                renderer.setRenderTarget(this.m_rt);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                // The view-range solver tightens near/far around the visible
                // tiles each frame; ribbons can sit beyond `far` here (they
                // render in the main pass through the tile depth range).
                // Widening near/far only remaps the depth range — perspective
                // x/y are near/far-independent — and the pass keeps depth
                // testing off, so screen positions are unchanged.
                const savedNear = camera.near;
                const savedFar = camera.far;
                camera.near = Math.max(savedNear * 0.01, 1);
                camera.far = Math.max(savedFar * 10, 1e8);
                camera.updateProjectionMatrix();
                for (const src of g.meshes) {
                    const mat = this.getAccumMaterial(src);
                    // Reuse the ribbon geometry at its (camera-relative) world
                    // transform; the private-scene copy keeps the tile mesh
                    // untouched.
                    const mesh = new THREE.Mesh(src.geometry, mat);
                    mesh.matrixAutoUpdate = false;
                    mesh.matrix.copy(src.matrixWorld);
                    // Force scene.updateMatrixWorld to compose matrixWorld from
                    // the copied matrix (fresh meshes default to identity).
                    mesh.matrixWorldNeedsUpdate = true;
                    mesh.frustumCulled = false;
                    this.m_tmpMeshes.push(mesh);
                    this.m_scene.add(mesh);
                }
                renderer.render(this.m_scene, camera);
                for (const m of this.m_tmpMeshes) this.m_scene.remove(m);
                this.m_tmpMeshes.length = 0;
                camera.near = savedNear;
                camera.far = savedFar;
                camera.updateProjectionMatrix();

                // maxDensity: explicit clamp, or the mgl auto estimate
                // max(mean occupied density × 2, 1) from a readback. Until a
                // value is known the layer stays hidden (mgl skips compositing
                // on the first frames rather than flash at full brightness).
                let maxDensity = g.clamp;
                if (maxDensity <= 0) {
                    if (!this.m_rtHalfFloat) {
                        // mgl without float render targets: bounded alpha
                        // (density saturates at 1) and maxDensity pinned to 1.
                        maxDensity = 1;
                    } else {
                        const cached = this.m_autoDensity.get(g.layerId);
                        if (
                            cached === undefined ||
                            ++this.m_framesSinceReadback >= 2
                        ) {
                            const mean = this.readbackMeanDensity(renderer);
                            if (mean > 0) this.m_autoDensity.set(g.layerId, mean);
                            this.m_framesSinceReadback = 0;
                        }
                        maxDensity = this.m_autoDensity.get(g.layerId) ?? 0;
                    }
                }
                if (maxDensity <= 0) continue;

                // Pass 2: composite over the scene (additive, mgl colorMode).
                renderer.setRenderTarget(null);
                if (this.m_compMat) {
                    this.m_compMat.uniforms.uDensity.value = this.m_rt!.texture;
                    this.m_compMat.uniforms.uMaxDensity.value = maxDensity;
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
        for (const m of this.m_cloneSet) m.dispose();
        this.m_cloneSet.clear();
        this.m_compMat?.dispose();
        this.m_compMat = null;
        additiveRibbons.length = 0;
        this.m_autoDensity.clear();
    }

    /** Group the registered ribbons by style layer (mgl: one FBO per layer). */
    private groupRibbons(): AdditiveGroup[] {
        const byLayer = new Map<string, AdditiveGroup>();
        for (const entry of additiveRibbons) {
            const paint = entry.technique?._paint ?? {};
            const layerId = String(entry.technique?._layerId ?? 'unknown');
            let g = byLayer.get(layerId);
            if (!g) {
                g = {
                    layerId,
                    renderOrder: Number(
                        entry.technique?.renderOrder ?? entry.technique?._renderOrder ?? 0,
                    ),
                    clamp: Number(paint['line-blend-additive-clamp'] ?? 0) || 0,
                    meshes: [],
                };
                byLayer.set(layerId, g);
            }
            g.meshes.push(entry.mesh);
        }
        return [...byLayer.values()].sort((a, b) => a.renderOrder - b.renderOrder);
    }

    /**
     * Accumulation material for one ribbon mesh: a clone of the (patched)
     * source material that keeps the engine vertex path — camera-relative
     * positioning for the RTE render camera AND the patcher's ribbon
     * injections (aRibbonEdge varying + uMBRibbonWidth) — but replaces the
     * final fragment output with mgl's accumulation values:
     *
     *   rgb = C·fa (feature-alpha-premultiplied color, sRGB like the ramp
     *               textures — the composite writes raw values to the canvas)
     *   a   = cov  (AA coverage × line-opacity; mgl forces the composite
     *               opacity to 1 for additive)
     */
    private getAccumMaterial(srcMesh: THREE.Mesh): THREE.Material {
        const src = srcMesh.material as any;
        const cached = src?.__mbAddAccumMat as THREE.Material | undefined;
        if (cached) return cached;
        const technique = (srcMesh as any).userData?.technique
            ?? additiveRibbons.find(r => r.mesh === srcMesh)?.technique ?? {};
        const clone: any = src.clone();
        clone.transparent = true;
        clone.depthTest = false;
        clone.depthWrite = false;
        clone.side = THREE.DoubleSide;
        // ColorMode.additiveAlphaWeightedUnboundedAlpha (half-float RT) —
        // rgb += src.rgb·src.a, a += src.a. On the ubyte fallback mgl uses the
        // bounded variant whose alpha saturates at 1
        // ([SRC_ALPHA, ONE, ONE_MINUS_DST_ALPHA, ONE]).
        clone.blending = THREE.CustomBlending;
        clone.blendEquation = THREE.AddEquation;
        clone.blendEquationAlpha = THREE.AddEquation;
        clone.blendSrc = THREE.SrcAlphaFactor;
        clone.blendDst = THREE.OneFactor;
        clone.blendSrcAlpha = this.m_rtHalfFloat
            ? THREE.OneFactor
            : THREE.OneMinusDstAlphaFactor;
        clone.blendDstAlpha = THREE.OneFactor;
        const colorRaw = String(
            technique.color ?? technique._paint?.['line-color'] ?? '#000000',
        );
        const [r, g, b, a] = MBAdditiveLineRenderer.parseColor(colorRaw);
        const covMul = Number(technique.opacity ?? 1);
        const addColor = new THREE.Vector4(r, g, b, a);
        const ribbonAA = Boolean(src.__mbRibbonAA);
        const orig = src.onBeforeCompile;
        clone.onBeforeCompile = (shader: any) => {
            if (orig) orig.call(src, shader);
            shader.uniforms.uMBAddColor = { value: addColor };
            shader.uniforms.uMBAddCov = { value: covMul };
            const idx = shader.fragmentShader.lastIndexOf('}');
            shader.fragmentShader =
                'uniform vec4 uMBAddColor;\nuniform float uMBAddCov;\n' +
                shader.fragmentShader.slice(0, idx) +
                (ribbonAA
                    ? `
    {
        float mbHW = uMBRibbonWidth * 0.5;
        float mbDist = abs(vMBRibbonEdge) * mbHW;
        float mbAA = 1.0 - smoothstep(mbHW - 1.0, mbHW + 1.0, mbDist);
        gl_FragColor = vec4(uMBAddColor.rgb * uMBAddColor.a, mbAA * uMBAddCov);
    }
`
                    : `
    {
        gl_FragColor = vec4(uMBAddColor.rgb * uMBAddColor.a, uMBAddCov);
    }
`) +
                shader.fragmentShader.slice(idx);
        };
        src.__mbAddAccumMat = clone;
        this.m_cloneSet.add(clone);
        return clone;
    }

    private ensureRenderTarget(renderer: THREE.WebGLRenderer, w: number, h: number): void {
        if (this.m_rt && this.m_rtW === w && this.m_rtH === h) return;
        this.m_rt?.dispose();
        // Density exceeds 1 where lines overlap — accumulate in half float
        // like mgl's unbounded-alpha additive mode when available (mgl:
        // hasFloatRenderTarget → RGBA16F), else ubyte with bounded alpha.
        const webgl2 = (renderer.capabilities as any)?.isWebGL2;
        const type = webgl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.m_rt = new THREE.WebGLRenderTarget(w, h, {
            type,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.m_rtHalfFloat = type === THREE.HalfFloatType;
        this.m_rtW = w;
        this.m_rtH = h;
        this.m_autoDensity.clear();
    }

    private ensureCompositeMesh(): void {
        if (this.m_compMat) return;
        this.m_compMat = new THREE.ShaderMaterial({
            vertexShader: COMP_VERT,
            fragmentShader: COMP_FRAG,
            uniforms: {
                uDensity: { value: null },
                uMaxDensity: { value: 1 },
            },
            depthTest: false,
            depthWrite: false,
            // mgl draws the composite with the additive color mode itself
            // ([SRC_ALPHA, ONE, ONE, ONE]): dst.rgb += avg·t·t over the
            // already-rendered background (a replace would lose the t² term —
            // single-line pixels measure exactly avg·n/(n+1), e.g. (51,40,0)).
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendEquationAlpha: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneFactor,
            transparent: true,
        });
        const geo = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geo, this.m_compMat);
        mesh.frustumCulled = false;
        this.m_compScene.add(mesh);
    }

    /**
     * mgl auto maxDensity = max(meanOccupiedDensity × 2, 1) — the mean alpha
     * over pixels actually touched by lines (the GPU reduce pass computes
     * Σdensity / count(occupied), never diluted by empty pixels).
     */
    private readbackMeanDensity(renderer: THREE.WebGLRenderer): number {
        if (!this.m_rt) return 0;
        const w = this.m_rt.width;
        const h = this.m_rt.height;
        const isHalf = this.m_rt.texture.type === THREE.HalfFloatType;
        const buf: any = isHalf ? new Uint16Array(w * h * 4) : new Uint8Array(w * h * 4);
        try {
            renderer.readRenderTargetPixels(this.m_rt, 0, 0, w, h, buf);
        } catch {
            return 0;
        }
        let sum = 0;
        let count = 0;
        if (isHalf) {
            // Decode IEEE 754 half floats (alpha channel only).
            for (let i = 3; i < buf.length; i += 4) {
                const half = buf[i];
                const exp = (half >> 10) & 0x1f;
                const mant = half & 0x3ff;
                let v: number;
                if (exp === 0) v = (mant / 1024) * Math.pow(2, -14);
                else if (exp === 31) v = mant === 0 ? Infinity : NaN;
                else v = (1 + mant / 1024) * Math.pow(2, exp - 15);
                if (half & 0x8000) v = -v;
                if (v > 0) {
                    sum += v;
                    count++;
                }
            }
        } else {
            for (let i = 3; i < buf.length; i += 4) {
                const v = buf[i] / 255;
                if (v > 0) {
                    sum += v;
                    count++;
                }
            }
        }
        if (count === 0) return 0;
        return Math.max((sum / count) * 2, 1);
    }

    /** Parse #hex/rgb()/rgba()/named into [r,g,b,a] in 0..1 (sRGB). */
    private static parseColor(raw: string): [number, number, number, number] {
        let alpha = 1;
        const m = raw.match(
            /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
        );
        if (m) {
            if (m[4] !== undefined) alpha = Number(m[4]);
            return [
                Number(m[1]) / 255,
                Number(m[2]) / 255,
                Number(m[3]) / 255,
                Math.min(Math.max(alpha, 0), 1),
            ];
        }
        try {
            const c = new THREE.Color(raw);
            // THREE.Color parses into the linear working space; the composite
            // works in sRGB like the engine's post-colorspace output (the
            // heatmap ramp textures use the same convention).
            const out = { r: 0, g: 0, b: 0 };
            c.getRGB(out, THREE.SRGBColorSpace);
            return [out.r, out.g, out.b, 1];
        } catch {
            return [0, 0, 0, 1];
        }
    }
}
