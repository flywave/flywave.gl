/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import type { MBStyleDataSource } from './MBStyleDataSource';

/**
 * Two-pass `line-blend-mode: additive` renderer (mgl draw_line.ts additive glass
 * mode). Direct THREE.AdditiveBlending cannot reproduce the mapbox composite:
 * mgl renders the lines into an offscreen FBO that accumulates
 *
 *   RGB: sum(C * fa) per line   (fa = line-color alpha)
 *   A:   sum(1) per line        (density)
 *
 * and composites with the curve (line_blend_composite.fragment.glsl):
 *
 *   avg = rgb / density
 *   n   = density / maxDensity  (maxDensity = line-blend-additive-clamp > 0,
 *                                else the accumulated max density)
 *   t   = sqrt(n / (n + 1))
 *   out = avg * t               (alpha = t)
 *
 * The density normalization is what keeps overlaps from hard-clipping: a single
 * full-coverage line with clamp=1 renders at ~50% brightness, not 100%.
 *
 * The additive ribbon meshes are hidden from the main scene by the material
 * patcher (visible=false, registered in {@link additiveRibbons}) and re-drawn
 * here every AfterRender.
 */
export interface AdditiveRibbon {
    mesh: THREE.Mesh;
    technique: any;
}

/** Registry filled by MBMaterialPatchManager.patchTile each time it patches. */
export const additiveRibbons: AdditiveRibbon[] = [];

interface RibbonGroup {
    key: string;
    meshes: THREE.Mesh[];
    color: THREE.Vector4; // sRGB rgb + alpha, from the evaluated line-color
    clamp: number; // 0 = auto (readback max density)
}

const COMP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// mgl line_blend_composite.fragment.glsl additive branch.
const COMP_FRAG = /* glsl */ `
uniform sampler2D uDensity;
uniform float uMaxDensity;
varying vec2 vUv;
void main() {
    vec4 c = texture2D(uDensity, vUv);
    if (c.a <= 0.0) {
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
    private m_scene = new THREE.Scene();
    private m_compScene = new THREE.Scene();
    private m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private m_compMat: THREE.ShaderMaterial | null = null;
    private m_materialCache = new Map<string, THREE.ShaderMaterial>();
    private m_tmpMeshes: THREE.Mesh[] = [];
    private m_autoDensity = 0;
    private m_framesSinceReadback = 0;

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {}

    /** Run both additive passes. Call once per frame from AfterRender. */
    run(): void {
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        const canvas = (this.m_mapView as any).canvas as HTMLCanvasElement | undefined;
        if (!renderer || !canvas || additiveRibbons.length === 0) return;        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;
        const camera = this.frameCamera();
        if (!camera) return;

        // Drop registrations whose mesh left the scene (tile evicted).
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
                // Pass 1: accumulate this group's ribbons into the density FBO.
                renderer.setRenderTarget(this.m_rt);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                // The view-range solver tightens near/far around the visible
                // tiles each frame; ribbon meshes can sit beyond `far` here
                // (they render in the main pass through the tile depth range).
                // Widening far only affects the depth mapping — perspective
                // x/y are far-independent — so screen positions are unchanged.
                const cam = camera as THREE.PerspectiveCamera;
                const savedNear = cam.near;
                const savedFar = cam.far;
                let camStretched = false;
                if (savedFar > 0) {
                    // Stretch around the actual geometry distance.
                    let maxDist = 0;
                    const camPos = cam.position;
                    for (const s of g.meshes) {
                        s.updateMatrixWorld(true);
                        const p = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
                        maxDist = Math.max(maxDist, p.distanceTo(camPos));
                    }
                    if (maxDist * 1.5 > savedFar) {
                        cam.near = Math.max(savedNear * 0.25, 1);
                        cam.far = maxDist * 2 + savedFar;
                        cam.updateProjectionMatrix();
                        camStretched = true;
                    }
                }
                const mat = this.getAccumMaterial(g, g.meshes[0].material as THREE.Material);
                for (const src of g.meshes) {
                    // Reuse the ribbon geometry at its world transform; the
                    // private-scene copy keeps the tile mesh untouched.
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
                if (camStretched) {
                    cam.near = savedNear;
                    cam.far = savedFar;
                    cam.updateProjectionMatrix();
                }

                // maxDensity: explicit clamp or the accumulated max (readback).
                let maxDensity = g.clamp;
                if (maxDensity <= 0) {
                    if (++this.m_framesSinceReadback >= 2 || this.m_autoDensity === 0) {
                        this.m_autoDensity = this.readbackMaxDensity(renderer);
                        this.m_framesSinceReadback = 0;
                    }
                    maxDensity = this.m_autoDensity;
                }
                if (maxDensity <= 0) continue; // mgl: skip until a density is known

                // Pass 2: composite over the scene.
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
        for (const m of this.m_materialCache.values()) m.dispose();
        this.m_materialCache.clear();
        this.m_compMat?.dispose();
        this.m_compMat = null;
        additiveRibbons.length = 0;
    }

    /**
     * The camera the frame was actually rendered with: the relative-to-eye
     * camera (MapRenderingManager), not the world-space `mapView.camera`.
     * World-space geometry clips against the RTE near/far when rendered with
     * the world camera, producing an empty pass.
     */
    private frameCamera(): THREE.PerspectiveCamera | undefined {
        const mv = this.m_mapView as any;
        return (mv.m_pointOfView ?? mv.m_rteCamera ?? mv.camera) as THREE.PerspectiveCamera | undefined;
    }

    private groupRibbons(): RibbonGroup[] {
        const byKey = new Map<string, RibbonGroup>();
        for (const entry of additiveRibbons) {
            const paint = entry.technique?._paint ?? {};
            const colorRaw = paint['line-color'] ?? '#000000';
            const clamp = Number(paint['line-blend-additive-clamp'] ?? 0) || 0;
            const rgba = MBAdditiveLineRenderer.parseColor(String(colorRaw));
            const key = `${colorRaw}|${clamp}`;
            let g = byKey.get(key);
            if (!g) {
                g = {
                    key,
                    meshes: [],
                    color: new THREE.Vector4(rgba[0], rgba[1], rgba[2], rgba[3]),
                    clamp,
                };
                byKey.set(key, g);
            }
            g.meshes.push(entry.mesh);
        }
        return [...byKey.values()];
    }

    private getAccumMaterial(g: RibbonGroup, srcMaterial: THREE.Material): THREE.Material {
        // Ride the original material's vertex path (the engine's materials do
        // camera-relative positioning for the RTE render camera — a plain
        // ShaderMaterial renders world-space geometry off-screen). Clone it and
        // force the fragment output to the mgl accumulation values.
        let mat = this.m_materialCache.get(g.key) as any;
        if (!mat) {
            const clone: any = srcMaterial.clone();
            clone.transparent = true;
            clone.depthTest = false;
            clone.depthWrite = false;
            clone.side = THREE.DoubleSide;
            clone.blending = THREE.CustomBlending;
            clone.blendSrc = THREE.SrcAlphaFactor;
            clone.blendDst = THREE.OneFactor;
            clone.blendSrcAlpha = THREE.OneFactor;
            clone.blendDstAlpha = THREE.OneFactor;
            clone.blendEquation = THREE.AddEquation;
            clone.blendEquationAlpha = THREE.AddEquation;
            const color = g.color;
            clone.onBeforeCompile = (shader: any) => {
                shader.uniforms.uMBAddColor = { value: color };
                const idx = shader.fragmentShader.lastIndexOf('}');
                shader.fragmentShader =
                    'uniform vec4 uMBAddColor;\n' +
                    shader.fragmentShader.slice(0, idx) +
                    '\n    gl_FragColor = vec4(uMBAddColor.rgb * uMBAddColor.a, 1.0);\n' +
                    shader.fragmentShader.slice(idx);
            };
            mat = clone;
            this.m_materialCache.set(g.key, mat);
        }
        return mat;
    }

    private ensureRenderTarget(renderer: THREE.WebGLRenderer, w: number, h: number): void {
        if (this.m_rt && this.m_rtW === w && this.m_rtH === h) return;
        this.m_rt?.dispose();
        // Density can exceed 1 (overlapping lines) — accumulate in half float
        // like mgl's unbounded-alpha additive mode when available.
        const halfFloat =
            renderer.capabilities.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float');
        const type = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.m_rt = new THREE.WebGLRenderTarget(w, h, {
            type,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.m_rtW = w;
        this.m_rtH = h;
        this.m_autoDensity = 0;
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
            // The composite REPLACES covered pixels (mgl draws it with the
            // additive color mode onto the already-dark glass background).
            blending: THREE.NoBlending,
            transparent: false,
        });
        const geo = new THREE.PlaneGeometry(2, 2);
        this.m_compScene.add(new THREE.Mesh(geo, this.m_compMat));
    }

    /** Max of the accumulated alpha channel (auto-density mode). */
    private readbackMaxDensity(renderer: THREE.WebGLRenderer): number {
        if (!this.m_rt) return 0;
        const w = this.m_rt.width;
        const h = this.m_rt.height;
        const isHalf = this.m_rt.texture.type === THREE.HalfFloatType;
        const buf: any = isHalf ? new Uint16Array(w * h * 4) : new Uint8Array(w * h * 4);
        try {
            renderer.readRenderTargetPixels(this.m_rt, 0, 0, w, h, buf);
        } catch {
            return this.m_autoDensity;
        }
        let max = 0;
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
                if (v > max) max = v;
            }
        } else {
            for (let i = 3; i < buf.length; i += 4) {
                if (buf[i] > max) max = buf[i] / 255;
            }
        }
        return isFinite(max) && max > 0 ? max : 0;
    }

    /** Parse #hex/rgb()/rgba()/named into [r,g,b,a] in 0..1 (sRGB). */
    private static parseColor(raw: string): [number, number, number, number] {
        let alpha = 1;
        const m = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (m) {
            if (m[4] !== undefined) alpha = Number(m[4]);
        }
        try {
            const c = new THREE.Color(raw);
            // THREE.Color parses into the linear working space; the composite
            // must output sRGB components (heatmap ramp uses the same convention).
            const out = { r: 0, g: 0, b: 0 };
            c.getRGB(out, THREE.SRGBColorSpace);
            return [out.r, out.g, out.b, Math.min(Math.max(alpha, 0), 1)];
        } catch {
            return [0, 0, 0, 1];
        }
    }
}
