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
    private m_depthTexture: THREE.DepthTexture | null = null;
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

    get depthTexture(): THREE.DepthTexture | null {
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
        this.m_depthTexture = new THREE.DepthTexture(w, h);
        this.m_depthTexture.type = THREE.UnsignedIntType;
        this.m_depthTexture.minFilter = THREE.NearestFilter;
        this.m_depthTexture.magFilter = THREE.NearestFilter;
        this.m_depthTarget = new THREE.WebGLRenderTarget(w, h, {
            depthTexture: this.m_depthTexture,
            depthBuffer: true,
            stencilBuffer: false,
        });
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
        const prevTarget = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(this.m_depthTarget);
            renderer.clearDepth();
            renderer.render(scene, camera);
        } catch {
            // Rendering the depth pass failed — skip this frame (hard occlusion
            // via depthTest still applies from Scheme C).
        } finally {
            // ALWAYS restore the previous render target — an exception between
            // bind and restore used to leave the depth target bound, so the
            // engine's main render silently went into it instead of the canvas.
            renderer.setRenderTarget(prevTarget);
            for (const obj of hidden) obj.visible = true;
        }
    };
}
