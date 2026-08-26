import * as THREE from 'three';
import { MapView, MapViewEventNames } from '@flywave/flywave-mapview';
import { TerrainController } from './TerrainController';

/**
 * Soft depth occlusion for terrain + 3D structures (design-terrain-draping.md
 * Scheme A, extended to building depth).
 *
 * Each frame, before the main draw (WillRender event), renders the occluder
 * meshes only — terrain meshes (when present) plus extruded-polygon/building
 * tile objects — to a WebGLRenderTarget whose DepthTexture captures their
 * depth. That depth texture is then sampled in circle/symbol/line fragment
 * shaders so content behind hills or buildings fades out smoothly instead of
 * popping.
 *
 * Uses only public MapView APIs: WillRender event + renderer/scene/camera
 * getters + three.js native DepthTexture. No engine source changes required.
 *
 * Reference: mapbox-gl-js Painter.blitDepth() + _prelude_terrain
 * isOccluded(); symbol DEPTH_OCCLUSION against the 3D depth buffer.
 */
export class TerrainDepthOcclusion {
    private m_depthTarget: THREE.WebGLRenderTarget | null = null;
    private m_depthTexture: THREE.Texture | null = null;
    /** Override material writing standard depth into RG (16-bit split). */
    private m_encodeMat: THREE.Material | null = null;
    private m_mapView: MapView;
    private m_terrain: TerrainController | null;
    private m_active = false;
    private m_width = 0;
    private m_height = 0;

    /** Materials that should sample the terrain depth (registered by patcher). */
    private m_consumerMaterials: Set<THREE.Material> = new Set();
    private m_uniformName: string;

    constructor(mapView: MapView, terrain: TerrainController | null, uniformName = 'u_terrainDepth',
                private m_includeExtrusions = false) {
        this.m_mapView = mapView;
        this.m_terrain = terrain;
        this.m_uniformName = uniformName;
    }

    get depthTexture(): THREE.Texture | null {
        return this.m_depthTexture;
    }

    /** Register a material whose shader samples the terrain depth uniform. */
    addConsumer(material: THREE.Material): void {
        this.m_consumerMaterials.add(material);
    }

    start(): void {
        if (this.m_active) return;
        this.m_active = true;
        this.m_mapView.addEventListener(MapViewEventNames.WillRender, this.onWillRender);
        this.m_mapView.addEventListener(MapViewEventNames.Resize, this.onResize);
        this.ensureTarget();
    }

    stop(): void {
        if (!this.m_active) return;
        this.m_active = false;
        this.m_mapView.removeEventListener(MapViewEventNames.WillRender, this.onWillRender);
        this.m_mapView.removeEventListener(MapViewEventNames.Resize, this.onResize);
    }

    dispose(): void {
        this.stop();
        if (this.m_depthTarget) {
            this.m_depthTarget.dispose();
            this.m_depthTarget = null;
        }
        if (this.m_depthTexture) {
            this.m_depthTexture.dispose();
            this.m_depthTexture = null;
        }
        this.m_consumerMaterials.clear();
    }

    private onResize = (): void => {
        // Force re-creation on next WillRender.
        this.m_width = 0;
        this.m_height = 0;
    };

    private ensureTarget(): void {
        const canvas = this.m_mapView.canvas;
        const w = canvas.width;
        const h = canvas.height;
        if (this.m_depthTarget && this.m_width === w && this.m_height === h) return;

        if (this.m_depthTarget) {
            this.m_depthTarget.dispose();
        }
        // Depth-in-color encode target: rendering occluders with an override
        // material that writes gl_FragCoord.z (standard depth) into RG
        // (16-bit split). The DepthTexture attachment route never delivered
        // content to samplers (texture always sampled 1.0 while a raw FBO
        // read saw real depth) — RGBA readback and sampling always work.
        // The target's OWN texture is the color attachment — do not replace
        // it with a bare Texture (breaks the FBO, render silently no-ops).
        this.m_depthTarget = new THREE.WebGLRenderTarget(w, h, {
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.m_depthTexture = this.m_depthTarget.texture;
        this.m_depthTexture.minFilter = THREE.NearestFilter;
        this.m_depthTexture.magFilter = THREE.NearestFilter;
        if (!this.m_encodeMat) {
            const encode = new THREE.MeshBasicMaterial();
            encode.onBeforeCompile = (shader: any) => {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     {
                         float z16 = clamp(gl_FragCoord.z, 0.0, 1.0) * 65535.0;
                         float hi = floor(z16 / 256.0);
                         float lo = z16 - hi * 256.0;
                         gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
                     }`
                );
            };
            this.m_encodeMat = encode;
        }
        this.m_width = w;
        this.m_height = h;

        // Push the new texture to all registered consumer materials.
        for (const mat of this.m_consumerMaterials) {
            this.injectUniform(mat);
        }
    }

    private injectUniform(material: THREE.Material): void {
        const orig = material.onBeforeCompile;
        const tex = this.m_depthTexture;
        const name = this.m_uniformName;
        const w = this.m_width;
        const h = this.m_height;
        material.onBeforeCompile = (shader: any) => {
            if (orig) orig.call(material, shader);
            shader.uniforms[name] = { value: tex };
            shader.uniforms.u_terrainDepthSize = { value: new THREE.Vector2(1 / w, 1 / h) };
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>\nuniform sampler2D ${name};\nuniform vec2 u_terrainDepthSize;`
            );
            // Soft fade: compare this fragment's NDC depth against the terrain
            // depth sampled at the same screen position. The renderer uses a
            // logarithmic depth buffer, so gl_FragCoord.z and the depth texture
            // share the same encoding and compare directly.
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <colorspace_fragment>',
                `#include <colorspace_fragment>
                 {
                     vec2 mbDScreen = gl_FragCoord.xy * u_terrainDepthSize;
                     float mbTerrainZ = texture2D(${name}, mbDScreen).r;
                     float mbMyZ = gl_FragCoord.z;
                     // Fade out when this fragment is behind the terrain.
                     float mbOcclude = smoothstep(-0.002, 0.002, mbMyZ - mbTerrainZ);
                     gl_FragColor.a *= (1.0 - mbOcclude);
                 }`
            );
        };
        material.needsUpdate = true;
    }

    /**
     * Read the depth target back to CPU (WebGL2 DEPTH_COMPONENT readback).
     * Returns a Uint32Array (normalized 0..1) or null. Callers sample
     * [y * width + x]. The buffer is refreshed at most once per frame.
     */
    private m_cpuDepth: Uint32Array | null = null;
    private m_cpuDepthFrame = -1;

    readDepthBuffer(frame?: number): Uint32Array | null {
        if (frame !== undefined && frame === this.m_cpuDepthFrame) return this.m_cpuDepth;
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        if (!renderer || !this.m_depthTarget) return null;
        try {
            const w = this.m_width, h = this.m_height;
            const px = new Uint8Array(w * h * 4);
            renderer.readRenderTargetPixels(this.m_depthTarget, 0, 0, w, h, px);
            // Encode: z16 = hi*256 + lo with hi = px[r], lo = px[g].
            const buf = new Uint32Array(w * h);
            for (let i = 0; i < w * h; i++) {
                buf[i] = px[i * 4] * 256 + px[i * 4 + 1];
            }
            if ((globalThis as any).__mbOccDbg && !(this as any).__mbRbLogged) {
                (this as any).__mbRbLogged = 1;
                let nz = 0;
                for (let i = 0; i < buf.length; i += 31) { if (buf[i] !== 0) nz++; }
                // eslint-disable-next-line no-console
                console.log('[MBRB] read nz=' + nz + ' px0=' + px[0] + ',' + px[1]
                    + ' pxMid=' + px[(w * h / 2 | 0) * 4] + ',' + px[(w * h / 2 | 0) * 4 + 1]);
            }
            this.m_cpuDepth = buf;
            this.m_cpuDepthFrame = frame ?? -2;
            return buf;
        } catch {
            return null;
        }
    }

    get depthSize(): [number, number] {
        return [this.m_width, this.m_height];
    }

    private onWillRender = (): void => {
        if (!this.m_active) return;
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        if (!renderer || !this.m_depthTarget) return;
        this.ensureTarget();

        // Collect occluder meshes from the scene: terrain meshes (live under
        // mapView.scene) plus extruded-polygon/building tile objects. mgl's
        // occlusion depth buffer (blitDepth) covers terrain AND 3D structures,
        // so symbols/lines/circles fade behind buildings too. We temporarily
        // hide every other tile object, render occluder-only depth, then
        // restore visibility.
        const scene = this.m_mapView.scene;
        const camera = this.m_mapView.camera;

        const terrainSet = new Set<THREE.Object3D>(this.m_terrain?.meshes ?? []);
        const isOccluder = (obj: THREE.Object3D): boolean => {
            if (terrainSet.size > 0) {
                let p: THREE.Object3D | null = obj;
                while (p) {
                    if (terrainSet.has(p)) return true;
                    p = p.parent;
                }
            }
            // 3D extrusions/buildings: the same technique the patcher's
            // registerShadowCaster / extrusion patches key off. Only in the
            // building-occlusion mode (no terrain): mgl's terrain-mode symbol
            // occlusion samples terrain depth only, so terrain mode keeps the
            // historical terrain-only pass.
            if (!this.m_includeExtrusions) return false;
            const tech = (obj as any).userData?.technique;
            return tech?.name === 'extruded-polygon';
        };
        const hidden: THREE.Object3D[] = [];
        scene.traverse((obj: THREE.Object3D) => {
            if ((obj as any).isMesh && obj.visible && !isOccluder(obj)) {
                // Walk up: only hide top-level tile objects, not lights/cameras.
                let isTileObject = false;
                let p: THREE.Object3D | null = obj;
                while (p) {
                    if (isOccluder(p)) { isTileObject = false; break; }
                    p = p.parent;
                    if (p === scene) { isTileObject = true; break; }
                }
                if (isTileObject) {
                    obj.visible = false;
                    hidden.push(obj);
                }
            }
        });

        if ((globalThis as any).__mbOccDbg) {
            if ((this as any).__mbDpLogged === undefined || (this as any).__mbDpLogged > 30) {
                (this as any).__mbDpLogged = 0;
            let occluders = 0, total = 0;
            scene.traverse((o: any) => { if (o.isMesh && o.visible) { total++; } });
            scene.traverse((o: any) => {
                if (o.isMesh && o.visible) {
                    let occ = false;
                    const tech = o.userData?.technique;
                    if (tech?.name === 'extruded-polygon') occ = true;
                    if (occ) occluders++;
                }
            });
            // eslint-disable-next-line no-console
                console.log('[MBOcc] depthPass meshes=' + total + ' occluders=' + occluders + ' hidden=' + hidden.length);
            }
            (this as any).__mbDpLogged++;
        }
        this.m_cpuDepth = null; // invalidate CPU copy for this frame
        const prevTarget = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(this.m_depthTarget);
            // Full clear (TerrainDraping precedent): with autoClear=false an
            // uncleared color buffer left the target reading black forever.
            renderer.clear();
            // scene.overrideMaterial silently drew nothing on this engine
            // build — swap materials per occluder mesh instead (guaranteed
            // path), restore after.
            const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
            scene.traverse((o: any) => {
                if (o.isMesh && o.visible && isOccluder(o)) {
                    swapped.push([o, o.material]);
                    o.material = this.m_encodeMat;
                }
            });
            renderer.render(scene, camera);
            for (const [mesh, mat] of swapped) mesh.material = mat;
            if ((globalThis as any).__mbOccDbg && !(this as any).__mbRawLogged) {
                (this as any).__mbRawLogged = 1;
                try {
                    const gl = renderer.getContext() as WebGL2RenderingContext;
                    const buf = new Uint32Array(64);
                    gl.readPixels(512, 512, 4, 4, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, buf);
                    // eslint-disable-next-line no-console
                    console.log('[MBDepth] raw bound read: ' + Array.from(buf.slice(0, 8)).join(',')
                        + ' hex=' + buf[0].toString(16));
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.log('[MBDepth] raw read failed ' + (e as Error).message);
                }
            }
        } catch (err) {
            if ((globalThis as any).__mbOccDbg && !(this as any).__mbPassErr) {
                (this as any).__mbPassErr = 1;
                // eslint-disable-next-line no-console
                console.log('[MBPass] ERROR ' + (err as Error)?.message + ' ' + (err as Error)?.stack?.slice(0, 200));
            }
        } finally {
            // ALWAYS restore the previous render target — an exception between
            // bind and restore used to leave the depth target bound, so the
            // engine's main render silently went into it instead of the canvas.
            // Same-tick probe: read a few pixels NOW — distinguishes "render
            // no-ops" from "main render clobbers the target later".
            if ((globalThis as any).__mbOccDbg && !(this as any).__mbTickLogged) {
                (this as any).__mbTickLogged = 1;
                try {
                    const probe = new Uint8Array(16);
                    renderer.readRenderTargetPixels(this.m_depthTarget, 512, 512, 2, 2, probe);
                    // eslint-disable-next-line no-console
                    console.log('[MBTick] same-tick px=' + Array.from(probe.slice(0, 8)).join(','));
                } catch {}
            }
            renderer.setRenderTarget(prevTarget);
            for (const obj of hidden) obj.visible = true;
        }
    };
}
