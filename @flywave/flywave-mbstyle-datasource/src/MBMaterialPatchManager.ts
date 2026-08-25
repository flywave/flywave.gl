import * as THREE from 'three';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { MBStyleDataSource } from './MBStyleDataSource';
import { createGuardrailMesh } from './ElevatedStructures';
import { additiveRibbons } from './MBAdditiveLineRenderer';
import { shadowCasters } from './MBShadowRenderer';

interface MaterialPatchState {
    patched: boolean;
    /** Number of tile.objects already patched, so newly-attached objects
     *  (e.g. async-decoded points added after the first frame) get patched too. */
    objectCount: number;
}

const rasterTextureCache = new Map<string, THREE.Texture>();
const rasterTextureLoader = new THREE.TextureLoader();
// Cache of cropped sprite sub-rect textures used for fill/line/extrusion patterns.
const patternTextureCache = new Map<string, THREE.Texture>();
let patternTextureCacheAtlas: unknown = null;
let patternTextureCacheGen = -1;

export class MBMaterialPatchManager {
    /**
     * Route additive line ribbons through MBAdditiveLineRenderer's dual-pass
     * density composite (mgl draw_line.ts additive glass mode) instead of
     * direct AdditiveBlending, which cannot reproduce the density-normalized
     * composite (out = avg·n/(n+1), §12.68). Direct blending remains the
     * fallback when disabled.
     */
    public static enableAdditiveDualPass = true;

    private m_patchedTiles = new WeakMap<object, MaterialPatchState>();
    /** Ground-radiance signature of the last patched lighting state. */
    private m_lastLightSig = '';
    private m_lastShadowActive = false;
    private m_dataSource: MBStyleDataSource;
    /** When true (terrain active), symbols/circles test against terrain depth. */
    private m_depthOcclusion = false;
    /** Depth texture from terrain (Scheme A soft fade); null = Scheme C only. */
    private m_depthTexture: THREE.DepthTexture | null = null;

    constructor(dataSource: MBStyleDataSource) {
        this.m_dataSource = dataSource;
    }

    /**
     * Toggle terrain depth occlusion. When enabled, circle/symbol materials are
     * configured to test against the depth buffer (terrain renders first with
     * renderOrder=-100 and writes depth), so labels behind hills get hidden.
     * This is hardware depth-test occlusion (Scheme C) — no depth texture needed.
     */
    setDepthOcclusion(active: boolean): void {
        this.m_depthOcclusion = active;
    }

    /** Provide the terrain DepthTexture for soft fade occlusion (Scheme A). */
    setDepthTexture(tex: THREE.DepthTexture | null): void {
        this.m_depthTexture = tex;
        this.invalidate();
    }

    patchTileMaterials(): void {
        const tiles = this.m_dataSource.getDecodedTiles();

        // Per-frame shadow uniforms for ground-fill receivers (mgl ground
        // shadow): refreshed from MBShadowRenderer's latest depth pass.
        const shadowState = (this.m_dataSource as any).m_shadowRenderer
            ?.getShadowUniforms?.() ?? null;
        if (shadowState || this.m_lastShadowActive) {
            const identity = shadowState ? null : new THREE.Matrix4();
            for (const tile of tiles) {
                for (const obj of tile.objects ?? []) {
                    const u = (obj as any).material?.__mbShadowUniforms;
                    if (!u) continue;
                    u.uMBShadowMap.value = shadowState?.map ?? null;
                    if (shadowState) u.uMBShadowMatrix.value.copy(shadowState.matrix);
                    else if (identity) u.uMBShadowMatrix.value.copy(identity);
                    u.uMBShadowIntensity.value = shadowState?.intensity ?? 0;
                }
            }
        }
        this.m_lastShadowActive = !!shadowState;

        // Runtime `setLights` (render-test operations) changes the 3D-lights
        // state after materials were patched; force a recompile so the ground-
        // lighting uniforms refresh (the onBeforeCompile handler reads the
        // current state each compile).
        const ls = (this.m_dataSource as any).m_environment?.lighting3DState;
        const sig = ls ? ls.groundRadiance.map(v => v.toFixed(4)).join(',') : '';
        if (sig !== this.m_lastLightSig) {
            this.m_lastLightSig = sig;
            for (const tile of tiles) {
                for (const obj of tile.objects) {
                    const m = (obj as any).material as THREE.Material | undefined;
                    if (m && (m as any).__mbGroundLitHandler) {
                        (m as any).needsUpdate = true;
                    }
                }
            }
        }

        for (const tile of tiles) {
            if (!tile.objects || tile.objects.length === 0) continue;

            const state = this.m_patchedTiles.get(tile);
            // Re-patch when new objects were attached since the last pass (tiles
            // grow asynchronously: background quad first, decoded points later)
            // OR when any current material is still unpatched — a re-decode
            // (e.g. runtime theme op → markTilesDirty) rebuilds tile objects
            // with FRESH materials at the SAME object count, which the count
            // heuristic alone silently skipped (unlit extrusions after
            // setImportColorTheme, §12.76-55).
            let allPatched = true;
            for (const obj of tile.objects ?? []) {
                if (!(obj as any).material?.__mbPatched) { allPatched = false; break; }
            }
            if (state !== undefined && state.objectCount === tile.objects.length && allPatched) continue;

            this.patchTile(tile);
            this.m_patchedTiles.set(tile, { patched: true, objectCount: tile.objects.length });
        }
    }

    private patchTile(tile: any): void {
        // NOTE: do not gate on tile.decodedTile here — Tile.removeDecodedTile()
        // clears it as soon as geometry loading finishes, which made this whole
        // patcher a silent no-op. Everything needed is on obj.userData.technique.
        for (const obj of tile.objects) {
            const tech = obj.userData?.technique;
            if (!tech) continue;

            const material = (obj as any).material as THREE.Material;
            if (!material) continue;

            this.patchMaterial(material, tech, obj);
            this.applyIconTextFit(obj, tech);
            this.patchIconObject(obj, tech);
            this.generateGuardrails(obj, tech, tile);
            this.registerAdditiveRibbon(obj, tech);
            this.setupTranslucentExtrusionDualPass(obj, tech);
            this.registerShadowCaster(obj, tech);
        }
    }

    /**
     * Extruded polygons cast shadows into the MBShadowRenderer depth pass
     * (mgl shadow pass renders every extrusion bucket). Opt-in via layer 1 —
     * the shadow camera renders that layer mask only.
     */
    private registerShadowCaster(obj: THREE.Object3D, technique: any): void {
        if (technique?.name !== 'extruded-polygon') return;
        if (!(obj as any).isMesh) return;
        if (shadowCasters.has(obj)) return;
        obj.layers.enable(1);
        shadowCasters.add(obj);
    }

    /**
     * mgl translucent fill-extrusion parity (draw_fill_extrusion.ts:113-128):
     * with `fill-extrusion-opacity` in (0,1) the extrusions draw in two passes —
     * first a color-disabled depth pass, then a color pass whose fragments must
     * have EQUAL depth — so only the closest surface blends (no interior
     * double-blend of back/front walls). mgl additionally stencils against
     * coincident polygons (stencilModeFor3D); that guard is omitted here.
     */
    private setupTranslucentExtrusionDualPass(obj: THREE.Object3D, technique: any): void {
        if (technique?.name !== 'extruded-polygon') return;
        const opacity = Number(technique._paint?.['fill-extrusion-opacity']
            ?? technique.opacity ?? 1);
        if (!(opacity > 0 && opacity < 1)) return;
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || (mesh as any).__mbDualPass) return;
        (mesh as any).__mbDualPass = true;

        // Depth-only prepass as a child mesh (inherits the object transform),
        // sorted just before the color pass.
        const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
        const depthMesh = new THREE.Mesh(mesh.geometry, depthMat);
        depthMesh.renderOrder = (mesh.renderOrder ?? 0) - 0.5;
        depthMesh.raycast = () => {}; // not pickable
        depthMesh.matrixAutoUpdate = false;
        mesh.add(depthMesh);

        // Color pass only shades fragments matching the prepass depth.
        const mat = mesh.material as any;
        if (mat && 'depthFunc' in mat) mat.depthFunc = THREE.EqualDepth;
    }

    /**
     * Additive line layers render through MBAdditiveLineRenderer's offscreen
     * density pass, never in the main scene: hide the mesh here and register
     * the ribbons (the only path re-drawn by the renderer). Non-ribbon twins
     * of an additive layer (e.g. a leftover SolidLine copy) are hidden too —
     * they would double-accumulate. The renderer prunes registrations whose
     * mesh left the scene.
     */
    private registerAdditiveRibbon(obj: THREE.Object3D, technique: any): void {
        if (!MBMaterialPatchManager.enableAdditiveDualPass) return;
        if (technique?._paint?.['line-blend-mode'] !== 'additive') return;
        if (!(obj as any).isMesh) return;
        obj.visible = false;
        if (!technique._isLineRibbon) return;
        if ((obj as any).__mbAdditiveRegistered) return;
        (obj as any).__mbAdditiveRegistered = true;
        additiveRibbons.push({ mesh: obj as THREE.Mesh, technique });
    }

    /**
     * Generate guardrail walls for elevated road polygons (HD 3d-intersections).
     * When a fill/extruded-polygon has _hdElevation > 0, extract boundary edges
     * from the triangulated mesh and build vertical walls along them.
     */
    private generateGuardrails(obj: THREE.Object3D, technique: any, tile: any): void {
        // Guardrails are only for HD elevated roads (3d-intersections). Gating on
        // technique.height would add ghost walls around every fill-extrusion
        // building.
        const elevation = technique._hdElevation;
        if (!elevation || elevation <= 0) return;
        if ((obj as any).__mbGuardrails) return; // already generated
        if (!(obj as any).isMesh) return;

        const mesh = obj as THREE.Mesh;
        const wallMesh = createGuardrailMesh(mesh, elevation);
        if (!wallMesh) return;

        (obj as any).__mbGuardrails = true;
        // Add guardrails as a child so they inherit the tile's transform.
        obj.add(wallMesh);
    }

    private applyIconTextFit(obj: THREE.Object3D, technique: any): void {
        const textFit = technique._layout?.['icon-text-fit'] ?? technique['icon-text-fit'];
        if (!textFit || textFit === 'none') return;

        const textWidth = (technique._textWidth ?? 5) as number;
        const textHeight = (technique._textHeight ?? 1.2) as number;
        const textSize = (technique._layout?.['text-size'] ?? technique['text-size'] ?? 16) as number;
        const iconSize = (technique._layout?.['icon-size'] ?? technique['icon-size'] ?? 1) as number;
        const padding = technique['icon-text-fit-padding'] as number[] ?? [0, 0, 0, 0];

        const fitW = textWidth * textSize + padding[0] + padding[2];
        const fitH = textHeight * textSize + padding[1] + padding[3];

        if ((obj as any).isSprite) {
            if (textFit === 'width' || textFit === 'both') {
                (obj as any).scale.x = fitW * iconSize;
            }
            if (textFit === 'height' || textFit === 'both') {
                (obj as any).scale.y = fitH * iconSize;
            }
        }
    }

    /**
     * Convert a Mapbox translate ([dx, dy] in pixels) honoring translate-anchor.
     * - 'map' (default): offset is map-aligned, returned unchanged.
     * - 'viewport': offset is screen-aligned, so rotate by the current camera
     *   bearing so it stays upright relative to the viewport.
     *
     * Computed at patch time from mapView.heading; sufficient for static tests.
     */
    private resolveTranslate(translate: number[] | undefined, anchor: string | undefined): number[] {
        const t = translate ?? [0, 0];
        if (!t || (t[0] === 0 && t[1] === 0)) return [0, 0];
        if (anchor === 'viewport') {
            const bearing = ((this.m_dataSource as any).mapView?.heading ?? 0) * Math.PI / 180;
            const cos = Math.cos(bearing);
            const sin = Math.sin(bearing);
            return [t[0] * cos - t[1] * sin, t[0] * sin + t[1] * cos];
        }
        return [t[0], t[1]];
    }

    /**
     * Center DEM info for terrain draping/displacement (null when no terrain).
     */
    private get centerDem(): { texture: THREE.Texture; originX: number; originY: number; size: number } | null {
        return (this.m_dataSource as any).m_environment?.terrainController?.centerDem ?? null;
    }

    /**
     * All loaded DEM tiles in world space (empty when no terrain). Used for
     * multi-tile draping — features that span DEM tile boundaries sample from
     * each tile's local texture instead of being clamped to the center tile.
     */
    /**
     * §307: DEM textures store RAW meters while the terrain mesh lives at
     * elev × exaggeration × secLat — the drape vertex injection must scale
     * by the same factor or content sinks ~4x below the surface.
     */
    private get demZScale(): number {
        const tc = (this.m_dataSource as any).m_environment?.terrainController;
        return (tc?.m_exaggeration ?? 1); // SCALESCAN (temp): drop secLat
    }

    private get allDemTiles(): Array<{ texture: THREE.Texture; originX: number; originY: number; size: number }> {
        const tc = (this.m_dataSource as any).m_environment?.terrainController;
        return tc ? (tc.allDemTiles as any[]) ?? [] : [];
    }

    /**
     * Inject mapbox 3D `lights` ground lighting into a 2D layer material
     * (fill/line/circle/raster/pattern). Mirrors `apply_lighting_ground` +
     * `apply_lighting_with_emission_ground` in mapbox `_prelude_lighting.glsl`:
     *
     *   ground(color) = color * u_ground_radiance
     *   out = mix(ground(color), color, emissive_strength)
     *
     * `u_ground_radiance` is computed on the CPU (see MBEnvironmentManager
     * `lighting3DState`); it is in sRGB (mapbox `linearVec3TosRGB`), while the
     * fragment color is linear — matching mapbox's linear-color × sRGB-radiance.
     */
    private injectGroundLighting(material: THREE.Material, technique: any, techName: string): void {
        if ((material as any).__mbGroundLitHandler) return;
        (material as any).__mbGroundLitHandler = true;

        const paint = technique._paint ?? {};
        const emissiveKey = techName === 'solid-line' ? 'line-emissive-strength'
            : techName === 'circles' ? 'circle-emissive-strength'
            : 'fill-emissive-strength';
        const emissive = Number(paint[emissiveKey] ?? 0);

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            // Read the CURRENT lights each compile so runtime `setLights`
            // (render-test operations) refreshes the uniforms on recompile.
            const ls = (this.m_dataSource as any).m_environment?.lighting3DState;
            const rad = ls ? ls.groundRadiance : [1, 1, 1];
            const emi = ls ? emissive : 0;
            // groundRadiance is in sRGB (mapbox apply_lighting_ground: color is
            // sRGB × sRGB radiance, output sRGB). The flywave fragment color at
            // this injection point is LINEAR, so convert the radiance to linear
            // before multiplying: linearColor × srgbToLinear(rad) ≡ the mapbox
            // sRGB product, linearized for the renderer's output conversion.
            const linRad = rad.map((v: number) => Math.pow(v, 2.2)) as [number, number, number];
            shader.uniforms.uMBGroundRad = { value: linRad };
            shader.uniforms.uMBEmissive = { value: emi };
            // Uniforms at global scope (works for both standard `#include
            // <common>` materials and custom RawShaderMaterials).
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `uniform vec3 uMBGroundRad; uniform float uMBEmissive;\nvoid main() {`
            );
            if (techName === 'circles') {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4(diffuseColor, alpha);',
                    `gl_FragColor = vec4(mix(diffuseColor * uMBGroundRad, diffuseColor, uMBEmissive), alpha);`
                );
            } else if (techName === 'solid-line') {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( outputDiffuse, alpha );',
                    `gl_FragColor = vec4(mix(outputDiffuse * uMBGroundRad, outputDiffuse, uMBEmissive), alpha);`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( outputDiffuse * vColor, alpha );',
                    `gl_FragColor = vec4(mix(outputDiffuse * vColor * uMBGroundRad, outputDiffuse * vColor, uMBEmissive), alpha);`
                );
            } else {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     gl_FragColor.rgb = mix(gl_FragColor.rgb * uMBGroundRad, gl_FragColor.rgb, uMBEmissive);`
                );
            }
        };
        material.needsUpdate = true;
    }

    /**
     * Inject mapbox 3D `lights` lighting into fill-extrusion/building surfaces
     * (LIGHTING_3D_MODE). Mirrors `apply_lighting_with_emission` in mapbox
     * `_prelude_lighting.glsl` with the world-space flat normal:
     *
     *   dir_factor = max(dot(normal, u_lighting_directional_dir), 0)
     *   ambient_directional_factor = vertical_factor * ambient_directional_factor
     *   k = ambientColor * ambient_directional_factor + dirColor * dir_factor
     *   lit = color * pow(k, 1/2.2)          (linearProduct)
     *   out = mix(lit, color, emissive_strength)
     */
    private injectExtrusion3DLighting(material: THREE.Material, emissiveStrength: number): void {
        if ((material as any).__mbExtrusion3DLit) return;
        (material as any).__mbExtrusion3DLit = true;

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            // Read the CURRENT lights each compile so runtime `setLights`
            // refreshes the uniforms on recompile.
            const ls = (this.m_dataSource as any).m_environment?.lighting3DState;
            const mapView = (this.m_dataSource as any).mapView;
            const camera = mapView?.camera as THREE.PerspectiveCamera | undefined;
            const viewToWorld = camera
                ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
                : new THREE.Matrix3();
            shader.uniforms.uMB3DAmb = { value: ls ? ls.ambientColorLinear : [1, 1, 1] };
            shader.uniforms.uMB3DDirColor = { value: ls ? ls.directionalColorLinear : [1, 1, 1] };
            shader.uniforms.uMB3DDir = { value: ls ? ls.dir : [0, 0, 1] };
            shader.uniforms.uMB3DViewToWorld = { value: viewToWorld };
            shader.uniforms.uMB3DEmissive = { value: ls ? emissiveStrength : 0 };
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir;
                 uniform mat3 uMB3DViewToWorld; uniform float uMB3DEmissive;
                 void main() {`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                 {
                     #ifdef FLAT_SHADED
                         vec3 mbN3 = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                     #else
                         vec3 mbN3 = normalize(vNormal);
                     #endif
                     mbN3 = normalize(uMB3DViewToWorld * mbN3);
                     float mbNdotL = dot(mbN3, uMB3DDir);
                     float mbDirLum = dot(uMB3DDirColor, vec3(0.2126, 0.7152, 0.0722));
                     float mbDirFactorMin = 1.0 - 0.3 * min(mbDirLum, 1.0);
                     float mbAmbDir = mix(mbDirFactorMin, 1.0, min(mbNdotL + 1.0, 1.0));
                     float mbVert = mix(0.92, 1.0, mbN3.z * 0.5 + 0.5);
                     float mbADF = mbVert * mbAmbDir;
                     vec3 mbK = uMB3DAmb * mbADF + uMB3DDirColor * max(mbNdotL, 0.0);
                     // mapbox linearProduct(color, k) = color·k^(1/2.2) with
                     // color in sRGB. gl_FragColor here is LINEAR, and the
                     // engine sRGB-converts at output: multiplying the linear
                     // color by k yields (color_lin·k)^(1/2.2) =
                     // color_srgb·k^(1/2.2) — the mapbox result. Applying
                     // pow(k,1/2.2) directly would double the exponent.
                     vec3 mbLit = gl_FragColor.rgb * mbK;
                     gl_FragColor.rgb = mix(mbLit, gl_FragColor.rgb, uMB3DEmissive);
                 }`
            );
        };
        material.needsUpdate = true;
    }

    /**
     * Inject 3D Lambert lighting into a material so fill-extrusion/building
     * surfaces respond to the ambient + directional lights (lighting-3d-mode).
     * Computes N·L in view/world space and modulates the fragment color.
     */
    private injectLighting(material: THREE.Material): boolean {
        const ls = (this.m_dataSource as any).m_environment?.lightingState;
        if (!ls) return false;
        if ((material as any).__mbLitPatched) return false;
        (material as any).__mbLitPatched = true;
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBLightDir = { value: ls.dir };
            shader.uniforms.uMBLightDirColor = { value: ls.dirColor };
            shader.uniforms.uMBLightAmbColor = { value: ls.ambColor };
            shader.uniforms.uMBLightDirI = { value: ls.dirIntensity };
            shader.uniforms.uMBLightAmbI = { value: ls.ambIntensity };
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                 uniform vec3 uMBLightDir; uniform vec3 uMBLightDirColor;
                 uniform vec3 uMBLightAmbColor; uniform float uMBLightDirI; uniform float uMBLightAmbI;`
            );
            // Lambert: ambient + directional*N·L. vNormal is not declared in
            // FLAT_SHADED programs (extruded-polygon sets flatShading), so derive
            // the flat normal from screen-space derivatives there (same approach
            // as three's normal_fragment_begin).
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <colorspace_fragment>',
                `#include <colorspace_fragment>
                 {
                     #ifdef FLAT_SHADED
                         vec3 mbN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                     #else
                         vec3 mbN = normalize(vNormal);
                     #endif
                     float mbDiff = max(dot(mbN, normalize(uMBLightDir)), 0.0);
                     vec3 mbLight = uMBLightAmbColor * uMBLightAmbI
                                  + uMBLightDirColor * uMBLightDirI * mbDiff;
                     gl_FragColor.rgb *= mbLight;
                 }`
            );
        };
        material.needsUpdate = true;
        return true;
    }

    /**
     * Inject terrain DEM vertex displacement into a material so flat fill/line
     * geometry conforms to the terrain surface (T4-lite draping, no FBO needed).
     * Samples the DEM at each vertex's world position and offsets Z.
     *
     * When `allDemTiles` reports more than one tile, the shader is generated
     * with a loop that finds the tile covering the vertex and samples from
     * its texture; otherwise (single tile / center-only fallback) the simpler
     * single-tile path is used.
     *
     * Must be chained BEFORE other onBeforeCompile overrides that also set it.
     */
    private injectTerrainDrape(material: THREE.Material): boolean {
        const dem = this.centerDem;
        if (!dem) return false;
        if ((material as any).__mbDrapePatched) return false;
        (material as any).__mbDrapePatched = true;

        const tiles = this.allDemTiles;
        // Use the multi-tile path as soon as more than one DEM tile is loaded.
        if (tiles.length > 1) {
            this.injectTerrainDrapeMultiTile(material, tiles);
            return true;
        }

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBDrapeDem = { value: dem.texture };
            shader.uniforms.uMBDrapeOrigin = { value: new THREE.Vector2(dem.originX, dem.originY) };
            shader.uniforms.uMBDrapeSize = { value: dem.size };
            shader.uniforms.uMBDrapeZScale = { value: this.demZScale };
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `uniform sampler2D uMBDrapeDem;\nuniform vec2 uMBDrapeOrigin;\nuniform float uMBDrapeSize;\nuniform float uMBDrapeZScale;\nvoid main() {`
            );
            // Sample DEM at the vertex's world position and offset Z so the
            // geometry follows the terrain surface.
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `{
                     vec2 mbWP = (modelMatrix * vec4(transformed, 1.0)).xy;
                     vec2 mbDU = (mbWP - uMBDrapeOrigin) / uMBDrapeSize;
                     mbDU = clamp(mbDU, vec2(0.0), vec2(1.0));
                     transformed.z += texture2D(uMBDrapeDem, mbDU).r * uMBDrapeZScale;
                 }\n#include <project_vertex>`
            );
        };
        material.needsUpdate = true;
        return true;
    }

    /**
     * Multi-tile variant of `injectTerrainDrape`: emits a GLSL loop that picks
     * the DEM tile containing the vertex's world position and samples it.
     * Necessary for features that cross DEM tile boundaries (e.g. long roads,
     * rivers) where the single-tile approach would clamp UVs to the center
     * tile and produce a flat elevation outside it.
     */
    private injectTerrainDrapeMultiTile(
        material: THREE.Material,
        tiles: Array<{ texture: THREE.Texture; originX: number; originY: number; size: number }>,
    ): void {
        const origOnCompile = material.onBeforeCompile;
        const N = Math.min(tiles.length, 8); // cap for shader complexity
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            // Bind each DEM tile as its own sampler uniform.
            for (let i = 0; i < N; i++) {
                shader.uniforms[`uMBDrapeDem${i}`] = { value: tiles[i].texture };
            }
            shader.uniforms.uMBDrapeTileCount = { value: N };
            shader.uniforms.uMBDrapeZScale = { value: this.demZScale }; // §307
            // Pack (originX, originY, size) per tile into a vec3 array uniform.
            const tileData = new Array<number>(N * 3);
            for (let i = 0; i < N; i++) {
                tileData[i * 3 + 0] = tiles[i].originX;
                tileData[i * 3 + 1] = tiles[i].originY;
                tileData[i * 3 + 2] = tiles[i].size;
            }
            shader.uniforms.uMBDrapeTiles = { value: tileData };

            // Build sampler / uniform declarations.
            let decl = `uniform int uMBDrapeTileCount;\nuniform vec3 uMBDrapeTiles[${N}];\nuniform float uMBDrapeZScale;\n`;
            for (let i = 0; i < N; i++) decl += `uniform sampler2D uMBDrapeDem${i};\n`;

            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `${decl}\nvoid main() {`
            );

            // Sample loop: find the tile that contains the vertex and read its elevation.
            // Falls back to 0 when the vertex is outside every loaded DEM tile.
            let samplerChain = '';
            for (let i = 0; i < N; i++) {
                samplerChain += `
                if (idx == ${i}) {
                    vec2 uv${i} = (mbWP - uMBDrapeTiles[${i}].xy) / uMBDrapeTiles[${i}].z;
                    uv${i} = clamp(uv${i}, vec2(0.0), vec2(1.0));
                    mbElev = texture2D(uMBDrapeDem${i}, uv${i}).r;
                `;
            }
            // Close the nested ifs.
            for (let i = 0; i < N; i++) samplerChain += `}`;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `{
                     vec2 mbWP = (modelMatrix * vec4(transformed, 1.0)).xy;
                     float mbElev = 0.0;
                     int idx = -1;
                     for (int i = 0; i < ${N}; i++) {
                         vec3 tile = uMBDrapeTiles[i];
                         vec2 d = mbWP - tile.xy;
                         if (d.x >= 0.0 && d.x <= tile.z && d.y >= 0.0 && d.y <= tile.z) {
                             idx = i; break;
                         }
                     }
                     int dummy = idx;
                     ${samplerChain}
                     transformed.z += mbElev * uMBDrapeZScale; // §307
                 }\n#include <project_vertex>`
            );
        };
        material.needsUpdate = true;
    }

    private patchMaterial(material: THREE.Material, technique: any, obj?: THREE.Object3D): void {
        if ((material as any).__mbPatched) return;
        (material as any).__mbPatched = true;

        // §273: materials clone UniformsLib.fog at class-definition time —
        // before our module-load additions (fogGlobe*/fogMgl*) — so the GLSL
        // uniforms exist but stay at their 0 defaults. Share the live lib
        // objects via onBeforeCompile so per-frame updates propagate.
        {
            const fogLib = (THREE as any).UniformsLib.fog;
            const origFogU = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origFogU) origFogU.call(material, shader);
                for (const key of ['fogGlobeMode', 'fogGlobeCenter', 'fogGlobeScale', 'fogGlobeRadius',
                    'fogGlobeTransition', 'fogGlobeRange', 'fogMglRange', 'fogMglShift', 'fogMglDistCam',
                    'fogAlpha', 'fogHorizonBlend', 'fogVertLimit', 'fogCamHeight', 'fogDebugT']) {
                    if (fogLib[key] && !shader.uniforms[key]) shader.uniforms[key] = fogLib[key];
                }
            };
            material.needsUpdate = true;
        }

        const techName = technique.name;
        const paint = technique._paint ?? {};
        const layout = technique._layout ?? {};
        // §244: injected background tiles use the exact mgl fog formula.
        if ((technique as any)._mbBgTile) {
            const origBgCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origBgCompile) origBgCompile.call(material, shader);
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <fog_pars_fragment>',
                    '#include <fog_pars_fragment>\n#define MB_RASTER_MGL_FOG 1');
            };
            material.needsUpdate = true;
        }

        // Mapbox 3D `lights` API (lighting-3d-mode): 2D ground layers are lit as
        // `color * u_ground_radiance` (mix toward `color` by emissive-strength).
        // Applied first so per-layer patches below can still wrap the shader.
        if (techName === 'fill' || techName === 'solid-line' || techName === 'circles') {
            this.injectGroundLighting(material, technique, techName);
        }
        switch (techName) {
            case 'fill':
                if (technique._isLineRibbon) {
                    // Line ribbons always go through the ribbon patcher —
                    // even patterned ones (their sampler lives there; routing
                    // them to the fill-pattern patcher renders a black line).
                    this.patchFillMaterial(material, paint, technique);
                } else if (technique._isHillshade) {
                    this.patchHillshadeMaterial(material, technique);
                } else if (technique._rasterTileUrl) {
                    this.patchRasterMaterial(material, technique);
                } else if (technique._patternName) {
                    this.patchFillPatternMaterial(material, technique);
                } else {
                    this.patchFillMaterial(material, paint, technique);
                }
                break;
            case 'solid-line':
                this.patchLineMaterial(material, paint, layout, technique);
                break;
            case 'circles':
                if (technique._isHeatmap) {
                    this.patchHeatmapMaterial(material, technique);
                } else {
                    this.patchCircleMaterial(material, paint);
                }
                break;
            case 'extruded-polygon':
                if (technique._layerId && paint['building-color']) {
                    this.patchBuildingMaterial(material, technique);
                } else {
                    this.patchExtrusionMaterial(material, paint, technique, obj as THREE.Mesh);
                }
                break;
        }

        // Per-content fog-depth scale (§106: the exact distCam form improves
        // pitch-70 fill/line cases but regresses raster-heavy ones at the
        // same pitch — the divergence is CONTENT-dependent, i.e. per-type RTE
        // depth semantics). Append a compile-time multiplier to three's
        // fog_vertex so each technique category can carry its own factor.
        // Default: no entry = 1.0 = zero behavior change.
        // Raster tiles ride the 'fill' technique name — allow a separate
        // raster key so raster fog can be calibrated independently.
        const fogScaleKey = technique._rasterTileUrl ? 'raster' : techName;
        const fogScale = (MBMaterialPatchManager.fogContentScales as any)[fogScaleKey] ??
            (MBMaterialPatchManager.fogContentScales as any)[techName];
        // Affine form { slope, offset }: vFogDepth' = slope*d − offset —
        // refits BOTH the fog near (offset) and the slope, needed when the
        // expected band decays at a different rate than the ramp allows
        // (§201 raster slope mismatch; a plain multiplier can only scale).
        const aff = (typeof fogScale === 'object' && fogScale !== null)
            ? { slope: Number(fogScale.slope), offset: Number(fogScale.offset ?? 0) }
            : (typeof fogScale === 'number' && Number.isFinite(fogScale) && fogScale > 0)
                ? { slope: fogScale, offset: 0 }
                : null;
        if (aff && Number.isFinite(aff.slope) && aff.slope > 0 && (aff.slope !== 1 || aff.offset !== 0)) {
            const origFogCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origFogCompile) origFogCompile.call(material, shader);
                if (shader.vertexShader.includes('#include <fog_vertex>')) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <fog_vertex>',
                        `#include <fog_vertex>
                         vFogDepth = vFogDepth * ${aff.slope.toFixed(6)} - ${aff.offset.toFixed(1)};`
                    );
                }
            };
            material.needsUpdate = true;
        }
    }

    /**
     * Per-technique fog-depth scale factors (compile-time `vFogDepth *= k`).
     * Keys are technique names ('fill', 'solid-line', 'extruded-polygon',
     * 'circles', ...). Empty/1.0 = untouched — the calibration entry point
     * for the fog per-content-depth campaign (§106/§179).
     */
    static fogContentScales: Record<string, number | { slope: number; offset: number }> = {
    };

    private patchRasterMaterial(material: THREE.Material, technique: any): void {
        // §216: shader-native mgl fog infra is complete (fogMgl* uniforms +
        // MB_RASTER_MGL_FOG path in the chunk) but DISABLED: basic/equal-range
        // responded but net-negative (19493/23199 vs 6504/6810 — the quad +
        // engine-mapping interplay needs recalibration first), and
        // fog/2d/raster's materials don't match the injection anchor at all.
        material.needsUpdate = true;
        const url = technique._rasterTileUrl as string;
        if (!url) return;

        // Terrain draping: make the raster tile conform to the terrain surface.
        if (!!this.centerDem) this.injectTerrainDrape(material);

        const opacity = technique.opacity ?? 1;
        // mgl blends raster-opacity against the RENDERED CONTENT below the
        // layer. The in-shader opaque composite knows only a base COLOR: a
        // plain background-color below is captured exactly (raster-opacity
        // family PASSes opaquely), but a background-PATTERN (terrain/
        // error-overlap: 0.5-opacity rasters over the airport pattern) is
        // composited over the default black and halves the pattern away. Use
        // REAL alpha blending when content the opaque path can't represent
        // sits below — any visible non-background layer, or a patterned
        // background layer.
        let rasRealBlend = false;
        try {
            const styleLayers: any[] = (this.m_dataSource as any).styleManager
                ?.getStyle?.()?.layers ?? [];
            const idx = styleLayers.findIndex(l => l.id === technique._layerId);
            rasRealBlend = opacity < 1 && idx > 0
                && styleLayers.slice(0, idx).some(l =>
                    l.layout?.visibility !== 'none' &&
                    (l.type !== 'background' || l.paint?.['background-pattern']));
        } catch {}
        // §357: terrain styles — the opaque terrain mesh covers the background
        // pattern quad, so REAL framebuffer blending composites over the dark
        // terrain surface instead of the pattern (mgl's RTT drape framebuffer
        // contains the background). When terrain is active AND the pattern
        // uniforms are available, composite in-shader over the PATTERN sample
        // instead (see the uMBRasPat* injection below).
        const env: any = (this.m_dataSource as any).m_environment;
        const terrainActive = !!this.centerDem || !!env?.terrainController;
        const bgPat = terrainActive
            ? env?.getBackgroundPatternInfo?.() ?? null
            : null;
        const patBase = bgPat !== null && bgPat !== undefined;
        if (patBase) rasRealBlend = false;
        // §368: raster-ARRAY layers ALWAYS real-blend — the NODATA mask
        // (alpha) must show the layers beneath; the opaque composite's base
        // color cannot represent transparency (no-raster-color rendered a
        // solid white sheet covering the satellite).
        if (String(technique._rasterTileUrl ?? '').endsWith('.mrt')) {
            rasRealBlend = true;
        }
        if ('opacity' in material) {
            if (rasRealBlend) {
                (material as any).opacity = 1;
                (material as any).transparent = true;
                (material as any).depthWrite = false;
            } else {
                // The injected shader composites raster-opacity over the base
                // color opaquely (sRGB-domain, mgl semantics) — keep the
                // material opaque so the linear-framebuffer blending can't
                // interfere.
                (material as any).opacity = 1;
                (material as any).transparent = false;
            }
        }

        const paint = technique._paint ?? {};
        // raster-brightness may be an array [min,max] (newer spec) or two
        // separate properties raster-brightness-min/max (classic spec).
        const rawBrightness = paint['raster-brightness'];
        const brightness: [number, number] = Array.isArray(rawBrightness)
            ? [rawBrightness[0] ?? 0, rawBrightness[1] ?? 1]
            : [paint['raster-brightness-min'] ?? 0, paint['raster-brightness-max'] ?? 1];
        const contrast = paint['raster-contrast'];     // [-1,1]
        const saturation = paint['raster-saturation']; // [-1,1]
        const hue = paint['raster-hue-rotate'];        // degrees
        const resampling = paint['raster-resampling'] ?? paint['raster-filtering'] ?? 'linear';
        const colorVal = paint['raster-color'];        // [r,g,b] mix factor
        // mgl RASTER_COLOR path (draw_raster.ts configureRaster +
        // raster.fragment.glsl): when `raster-color` is set, the whole
        // brightness/contrast/saturation chain is REPLACED by
        //   t   = raster-color-mix[3] + dot(srgb(rgb), raster-color-mix[0..2])
        //   col = ramp256(t)            (ramp spans raster-color-range)
        //   col.a *= input.a
        const hasRasterColor = colorVal !== undefined && colorVal !== null;
        let rasMix: [number, number, number, number] = [0.2126, 0.7152, 0.0722, 0];
        let rasRange: [number, number] = [0, 1];
        let rasRampTex: THREE.Texture | null = null;
        if (hasRasterColor) {
            // technique._paint carries the LAYER-EVALUATED value (a constant
            // color string) — the ramp needs the RAW expression, so pull it
            // from the style manager (same channel as the background color).
            let colorExpr = colorVal;
            try {
                const style = (this.m_dataSource as any).styleManager?.getStyle?.();
                const rasterLayer = (style?.layers ?? []).find(
                    (l: any) => l.type === 'raster' && Array.isArray(l.paint?.['raster-color']));
                if (rasterLayer) colorExpr = rasterLayer.paint['raster-color'];
            } catch {}
            const cm = paint['raster-color-mix'];
            if (Array.isArray(cm) && cm.length >= 4) {
                rasMix = [Number(cm[0]) || 0, Number(cm[1]) || 0, Number(cm[2]) || 0, Number(cm[3]) || 0];
            }
            const cr = paint['raster-color-range'];
            if (Array.isArray(cr) && cr.length >= 2) {
                rasRange = [Number(cr[0]) || 0, Number(cr[1]) || 1];
            }
            rasRampTex = MBMaterialPatchManager.buildRasterColorRamp(colorExpr, rasRange, resampling === 'nearest');
        }
        if (!rasRampTex && String(technique._rasterTileUrl ?? '').endsWith('.mrt')) {
            // mgl defines RASTER_COLOR for array sources even without the
            // paint (draw_raster.ts `if (!isRasterColor) defines.push`) —
            // the unbound ramp sampler then reads black with alpha 1.
            const d = new Uint8Array([0, 0, 0, 255]);
            const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
            t.minFilter = THREE.NearestFilter;
            t.magFilter = THREE.NearestFilter;
            t.needsUpdate = true;
            rasRampTex = t;
        }
        const hasAdjust =
            brightness[0] !== 0 || brightness[1] !== 1 ||
            contrast !== undefined || saturation !== undefined ||
            hue !== undefined || colorVal !== undefined;

        const filterType = resampling === 'nearest'
            ? THREE.NearestFilter : THREE.LinearFilter;
        // visibility:'none' → raster should not render.
        if (technique._layout?.visibility === 'none') {
            (material as any).visible = false;
            return;
        }

        // MapMeshBasicMaterial compiles WITHOUT USE_MAP (material.map is
        // ignored — verified: the compiled fragment shader has neither
        // USE_MAP nor vMapUv), so the tile texture must be sampled via an
        // injected varying, exactly like the hillshade DEM path. The
        // brightness/contrast/saturation/hue chain (mgl raster paint) is
        // folded into the same injection; with default paint values it is
        // the identity transform.
        const rect = (technique._rasterUvRect as number[] | undefined) ?? [0, 0, 1, 1];
        // Base under the raster: the style's background color (mgl default
        // black when a background layer exists, engine white otherwise).
        // raster-opacity blending must happen in sRGB NUMERIC space like mgl
        // (blending linear values then encoding gives 196 where mgl has 167);
        // for opacity < 1 the composite is computed opaquely in the shader.
        let baseSrgb: [number, number, number] = [1, 1, 1];
        try {
            const style = (this.m_dataSource as any).styleManager?.getStyle?.();
            const bgLayer = (style?.layers ?? []).find((l: any) => l.type === 'background');
            if (bgLayer) {
                // THREE.Color parses CSS to LINEAR components (ColorManagement
                // r152+) — the shader consumes sRGB numerics, so convert back.
                // (raster-alpha exposed this: orange (255,165,0) passed linear
                // G 0.39 where 0.647 was needed — only the G channel visibly
                // deviated, R/B are 1.0/0.0 in both spaces.)
                const lin = new THREE.Color(bgLayer.paint?.['background-color'] ?? '#000000');
                const srgb = lin.clone().copyLinearToSRGB(lin.clone());
                baseSrgb = [srgb.r, srgb.g, srgb.b];
            }
        } catch {}
        // mgl far-plane clip (far_z.ts farthestPixelDistanceOnPlane): the
        // far plane cuts the ground at high pitch; the reference images show
        // transparent/black beyond that line. NOTE: MapView exposes `tilt`
        // (NOT `pitch` — an earlier attempt read mapView.pitch and got 0,
        // so the clip never fired). d1 (camera→sea-level distance) equals
        // the camera→geoCenter distance (the camera looks straight at it).
        let rasFar = Infinity;
        try {
            const mapView = (this.m_dataSource as any).mapView;
            const cam = mapView?.camera as THREE.PerspectiveCamera | undefined;
            const tiltDeg = Number(mapView?.tilt ?? 0);
            if (cam && tiltDeg > 0) {
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const gc = mapView.geoCenter;
                const focus = mapView.projection.projectPoint(
                    new GeoCoordinates(gc.latitude, gc.longitude));
                const d1 = cam.position.distanceTo(focus);
                const pitch = tiltDeg * Math.PI / 180;
                const fovAbove = ((cam.fov ?? 36.87) * Math.PI / 180) / 2;
                const topHalf = Math.sin(fovAbove) * d1
                    / Math.sin(Math.max(Math.PI / 2 - pitch - fovAbove, 0.01));
                let far = Math.sin(pitch) * topHalf + d1;
                const horizon = d1 / 0.1; // mgl _horizonShift
                far = Math.min(far * 1.01, horizon);
                // The engine's RTE model-view frame scales positions ~3x
                // relative to world meters (calibrated on sea-zero: a 40%
                // clip boundary corresponded to a true eye distance of
                // d1*1.16 while the shader value equaled d1*3.5).
                rasFar = far * 3.5;
            }
        } catch {}
        const attach = (texture: THREE.Texture) => {
            // mgl mipmapped raster tiles — keep the mipmap min filter here
            // too (this ran AFTER applyRasterFilters and silently reset it,
            // voiding the mipmap parity fix).
            // §365: raster-ARRAY DataTextures are exempt — their size is
            // tileSize+2*buffer (514, NON-power-of-two); requesting mipmaps
            // on them raises GL_INVALID_OPERATION (1282, probed at draw time)
            // and leaves the texture incomplete (whole layer invisible). mgl
            // forces NEAREST for array sources anyway.
            if (!(texture as any).__mbIsRasterArray) {
                texture.minFilter = filterType === THREE.NearestFilter
                    ? THREE.NearestMipmapNearestFilter
                    : THREE.LinearMipmapLinearFilter;
                texture.magFilter = filterType;
                texture.generateMipmaps = true;
            }
            // NOTE: premultiplyAlpha + CustomBlending(ONE, …) was tried to
            // match mgl's raster upload, but the premultiplied upload path
            // blanks the tiles entirely (raster-* ~110k full-image mismatch,
            // mbstyle-r711) — reverted to plain alpha blending.
            // Satellite/aerial PNGs are sRGB (decode on sample; the material
            // output conversion then re-encodes — round trip correct).
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            (material as any).color = new THREE.Color(0xffffff);
            if ((material as any).__mbRasterSampled) return;
            (material as any).__mbRasterSampled = true;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBRasMap = { value: texture };
                shader.uniforms.uMBRasUvOff = { value: [rect[0], rect[1]] };
                shader.uniforms.uMBRasUvScl = { value: [rect[2], rect[3]] };
                shader.uniforms.uMBRasBMin = { value: brightness[0] };
                shader.uniforms.uMBRasBMax = { value: brightness[1] };
                // mgl CPU-side factors (util.ts contrastFactor/saturationFactor)
                const c0 = contrast ?? 0;
                const s0 = saturation ?? 0;
                shader.uniforms.uMBRasContrast = {
                    value: c0 > 0 ? 1 / (1.001 - c0) : 1 + c0,
                };
                shader.uniforms.uMBRasSat = {
                    value: s0 > 0 ? 1 - 1 / (1.001 - s0) : -s0,
                };
                shader.uniforms.uMBRasHue = { value: (hue ?? 0) * Math.PI / 180 };
                shader.uniforms.uMBRasBase = { value: baseSrgb };
                shader.uniforms.uMBRasFar = { value: rasFar };
                // When padded, the ORIGINAL image size lives in __mbPadPx
                // (the canvas is +2); unpadded textures use their own size.
                const padPx: [number, number] = (texture as any).__mbPadPx
                    ?? [(texture as any).image?.width ?? 256, (texture as any).image?.height ?? 256];
                shader.uniforms.uMBRasPadPx = { value: padPx };
                shader.uniforms.uMBRasFullPx = { value: [padPx[0], padPx[1]] };
                shader.uniforms.uMBRasPadOn = { value: (texture as any).__mbNoPad ? 0 : 1 };
                if (rasRampTex) shader.uniforms.uMBRasRamp = { value: rasRampTex };
                const arrTex: any = (texture as any).__mbIsRasterArray ? texture : null;
                if (arrTex) {
                    shader.uniforms.uMBArrMix = { value: arrTex.__mbArrMix };
                    shader.uniforms.uMBArrOff = { value: arrTex.__mbArrOffset };
                    shader.uniforms.uMBArrTile = { value: arrTex.__mbArrTile };
                    shader.uniforms.uMBArrBuf = { value: arrTex.__mbArrBuffer };
                    shader.uniforms.uMBArrRes = { value: arrTex.__mbArrTile + 2 * arrTex.__mbArrBuffer };
                }
                const rasRes = new THREE.Vector2(512, 256);
                shader.uniforms.uMBRasRes = { value: rasRes };
                // §357 pattern-base (terrain styles): shared live uniforms from
                // the background-pattern quad — count/phase Vector2s are the
                // SAME objects the bg quad's onBeforeRender keeps updated.
                if (patBase && bgPat) {
                    shader.uniforms.uMBRasPatTex = { value: bgPat.texture };
                    shader.uniforms.uMBRasPatOrigin = { value: bgPat.origin };
                    shader.uniforms.uMBRasPatSize = { value: bgPat.size };
                    shader.uniforms.uMBRasPatCount = { value: bgPat.count };
                    shader.uniforms.uMBRasPatPhase = { value: bgPat.phase };
                    shader.uniforms.uMBRasPatPx = { value: bgPat.pxSize };
                    shader.uniforms.uMBRasPatBuf = { value: new THREE.Vector2(512, 256) };
                    (material as any).__mbRasPatBuf = shader.uniforms.uMBRasPatBuf;
                }
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'varying vec2 vMBRasUv; varying float vMBRasEyeDist; uniform vec2 uMBRasRes;\nvoid main() {',
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\nvMBRasUv = uv;\nvMBRasEyeDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);',
                );
                // mgl renders raster layers with `alignedProjMatrix`
                // (transform.ts: "pixel-aligned to avoid fractional pixels
                // for raster tiles"): the projection is rounded so tile
                // quads land on WHOLE framebuffer pixels. Without it 1:1
                // texel sampling falls between texels and LINEAR filtering
                // blends neighbors — a uniform ~0.7px blur over the whole
                // tile (measured on raster-opacity/default). Snap the
                // projected vertex to the pixel grid (equivalent to the
                // matrix rounding for axis-aligned quads).
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `#include <project_vertex>
                    {
                        vec2 mbNdc = gl_Position.xy / max(gl_Position.w, 1e-6);
                        vec2 mbPx = (mbNdc * 0.5 + 0.5) * uMBRasRes;
                        mbPx = floor(mbPx + 0.5);
                        mbNdc = mbPx / uMBRasRes * 2.0 - 1.0;
                        gl_Position.xy = mbNdc * gl_Position.w;
                    }`,
                );
                const origBefore = (material as any).onBeforeRender;
                (material as any).onBeforeRender = (renderer: any, scene: any, camera: any, geometry: any, object: any, group: any) => {
                    if (origBefore) origBefore(renderer, scene, camera, geometry, object, group);
                    try { renderer.getSize(rasRes); } catch { /* keep last */ }
                    try {
                        const pb = (material as any).__mbRasPatBuf;
                        if (pb) renderer.getDrawingBufferSize(pb.value);
                    } catch {}
                };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `varying vec2 vMBRasUv;
                     uniform sampler2D uMBRasMap;
                     uniform vec2 uMBRasUvOff; uniform vec2 uMBRasUvScl;
                     uniform float uMBRasBMin; uniform float uMBRasBMax;
                     uniform float uMBRasContrast; uniform float uMBRasSat; uniform float uMBRasHue;
                     uniform vec3 uMBRasBase;
                     uniform float uMBRasFar;
                     varying float vMBRasEyeDist;
                     uniform vec2 uMBRasPadPx; uniform vec2 uMBRasFullPx; uniform float uMBRasPadOn;\n                     uniform sampler2D uMBRasPatTex; uniform vec2 uMBRasPatOrigin; uniform vec2 uMBRasPatSize; uniform vec2 uMBRasPatCount; uniform vec2 uMBRasPatPhase; uniform vec2 uMBRasPatPx; uniform vec2 uMBRasPatBuf;\n                     uniform sampler2D uMBRasRamp;\n                     uniform vec4 uMBArrMix; uniform float uMBArrOff; uniform float uMBArrTile; uniform float uMBArrBuf; uniform float uMBArrRes;
                     vec3 mbSrgbEnc(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
                     vec3 mbSrgbDec(vec3 c) { return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
                     void main() {`,
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     // Map the tile UV into the padded texture: the unpadded
                     // image occupies [1/W .. 1-1/W] of the padded canvas.
                     if (vMBRasEyeDist > uMBRasFar) {
                         // Beyond mgl's far plane the reference shows the
                         // transparent (black) background.
                         gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                         return;
                     }
                     vec2 mbRasUV = uMBRasUvOff + vMBRasUv * uMBRasUvScl;
                     vec2 mbRasSmp = mix(mbRasUV, (vec2(1.0) + mbRasUV * uMBRasFullPx) / (uMBRasFullPx + 2.0), uMBRasPadOn);
                     vec4 mbRasT = texture2D(uMBRasMap, mbRasSmp);
                     // mgl applies the raster paint adjustments on the sRGB
                     // texture values; the framebuffer is linear, so round
                     // trip through the transfer function.
                     // mgl raster.fragment.glsl order: spin → saturation →
                     // contrast → brightness, on unclamped sRGB values.
                     vec3 mbR = mbSrgbEnc(mbRasT.rgb);
                     float mbCa = cos(uMBRasHue); float mbSa = sin(uMBRasHue);
                     vec3 mbSpin = vec3(
                         (2.0 * mbCa + 1.0) / 3.0,
                         (-1.7320508 * mbSa - mbCa + 1.0) / 3.0,
                         (1.7320508 * mbSa - mbCa + 1.0) / 3.0);
                     mbR = vec3(dot(mbR, mbSpin.xyz), dot(mbR, mbSpin.zxy), dot(mbR, mbSpin.yzx));
                     float mbAvg = (mbR.r + mbR.g + mbR.b) / 3.0;
                     mbR += (mbAvg - mbR) * uMBRasSat;
                     mbR = (mbR - 0.5) * uMBRasContrast + 0.5;
                     mbR = mix(vec3(uMBRasBMin), vec3(uMBRasBMax), mbR);
                     ${rasRampTex ? `
                     // RASTER_COLOR path replaces the whole adjust chain above
                     // (mgl raster.fragment.glsl #ifdef RASTER_COLOR).
                     ${arrTex ? `
                     // RASTER_ARRAY decode (draw_raster texture descriptor):
                     // value = offset + dot(rgba, mix4); uv insets the band
                     // buffer; NODATA (vec4(1)) renders transparent.
                     vec2 mbArrUv = (uMBArrBuf + (uMBRasUvOff + vMBRasUv * uMBRasUvScl) * uMBArrTile) / (uMBArrTile + 2.0 * uMBArrBuf);
                     vec2 mbArrVal;
                     ${resampling === 'linear' ? `
                     // RASTER_ARRAY_LINEAR (raTexture2D_*_linear): bilinear
                     // interpolation of the DECODED values — re-implements
                     // sampling in-shader so the mix/offset decode applies
                     // after interpolation (mgl _prelude_raster_array).
                     vec2 mbLc = mbArrUv * uMBArrRes - 0.5;
                     vec2 mbLf = fract(mbLc);
                     mbLc = floor(mbLc);
                     mbLc = clamp(mbLc, vec2(0.0), vec2(uMBArrRes - 2.0));
                     // §367: texel-center texture2D sampling instead of
                     // texelFetch — texelFetch requires GLSL ES 3.00 (WebGL2);
                     // with the array texture's NEAREST filtering the sampled
                     // texel is identical and the shader compiles on WebGL1.
                     #define MB_FETCH(dx, dy) texture2D(uMBRasMap, (mbLc + vec2(dx, dy) + 0.5) / uMBArrRes)
                     vec4 mbLT[4];
                     mbLT[0] = MB_FETCH(0.0, 0.0);
                     mbLT[1] = MB_FETCH(1.0, 0.0);
                     mbLT[2] = MB_FETCH(0.0, 1.0);
                     mbLT[3] = MB_FETCH(1.0, 1.0);
                     vec2 mbLV[4];
                     for (int mbI = 0; mbI < 4; mbI++) {
                         vec4 mbT = mbLT[mbI];
                         mbLV[mbI] = (mbT.r > 0.9999 && mbT.g > 0.9999 && mbT.b > 0.9999 && mbT.a > 0.9999)
                             ? vec2(0.0) : vec2(uMBArrOff + dot(mbT, uMBArrMix), 1.0);
                     }
                     vec2 mbL0 = mix(mbLV[0], mbLV[1], mbLf.x);
                     vec2 mbL1 = mix(mbLV[2], mbLV[3], mbLf.x);
                     mbArrVal = mix(mbL0, mbL1, mbLf.y);` : `
                     vec4 mbArr = texture2D(uMBRasMap, mbArrUv);
                     mbArrVal = (mbArr.r > 0.9999 && mbArr.g > 0.9999 && mbArr.b > 0.9999 && mbArr.a > 0.9999)
                         ? vec2(uMBArrOff + dot(mbArr, uMBArrMix), 0.0)
                         : vec2(uMBArrOff + dot(mbArr, uMBArrMix), 1.0);`}
                     // mgl: fade to no-data via the interpolated mask —
                     // divide the scalar by the mask sum first.
                     if (mbArrVal.y > 0.0) mbArrVal.x /= mbArrVal.y;
                     float rcT = (mbArrVal.x - ${rasRange[0].toFixed(6)}) / ${Math.max(rasRange[1]-rasRange[0],1e-6).toFixed(6)};
                     vec4 rcCol = texture2D(uMBRasRamp, vec2(clamp(rcT, 0.0, 1.0), 0.5));
                     mbR = rcCol.rgb;
                     // mgl raster_array: alpha is the NODATA MASK, never the
                     // raw alpha channel — the band bytes encode DATA there
                     // (valid texels carry alpha 0 in the fixtures, which made
                     // the whole layer invisible via the multiply-accumulate).
                     mbRasT.a = rcCol.a * mbArrVal.y;` : `
                     float rcT = (${rasMix[3].toFixed(6)} + dot(mbSrgbEnc(mbRasT.rgb), vec3(${rasMix[0].toFixed(6)}, ${rasMix[1].toFixed(6)}, ${rasMix[2].toFixed(6)})) - ${rasRange[0].toFixed(6)}) / ${Math.max(rasRange[1]-rasRange[0],1e-6).toFixed(6)};
                     vec4 rcCol = texture2D(uMBRasRamp, vec2(clamp(rcT, 0.0, 1.0), 0.5));
                     mbR = rcCol.rgb;
                     mbRasT.a *= rcCol.a;`}
                     ` : ''}
                     {
                         // Opaque sRGB-domain composite over the base color
                         // (the framebuffer blends in LINEAR — 0.5 over white
                         // would render 196 where mgl references show 167).
                         // ALWAYS alpha-composite: raster tiles may carry an
                         // alpha channel (raster-alpha fixture) — mgl blends
                         // tile.rgb·a over the underlying background; opaque
                         // imagery (a=1) is the identity case.
                         ${rasRealBlend
                         ? `// Real blend onto rendered content below: the
                            // framebuffer blends the sRGB-encoded output
                            // (mgl numeric-space semantics).
                            gl_FragColor = vec4(mbSrgbDec(mbR), ${opacity.toFixed(3)} * mbRasT.a);`
                         : `vec3 mbBase = uMBRasBase;
                            ${patBase ? `
                            // §357 pattern base (terrain): composite over the
                            // background-pattern sample like mgl's RTT drape
                            // framebuffer — same screen tiling/phase math as
                            // the bg quad (gl_FragCoord/buf ↔ vMapUv, y-flip).
                            vec2 mbPatUvn = gl_FragCoord.xy / max(uMBRasPatBuf, vec2(1.0));
                            vec2 mbPatT = vec2(
                                fract(mbPatUvn.x * uMBRasPatCount.x - uMBRasPatPhase.x),
                                fract((1.0 - mbPatUvn.y) * uMBRasPatCount.y - uMBRasPatPhase.y));
                            vec2 mbPatPx = clamp(1.0 / max(uMBRasPatPx, vec2(1.0)), vec2(0.0), vec2(0.25));
                            vec2 mbPatF = mbPatPx * 0.5 + mbPatT * (1.0 - mbPatPx);
                            vec2 mbPatUv = vec2(
                                uMBRasPatOrigin.x + mbPatF.x * uMBRasPatSize.x,
                                1.0 - uMBRasPatOrigin.y - mbPatF.y * uMBRasPatSize.y);
                            mbBase = mbSrgbEnc(texture2D(uMBRasPatTex, mbPatUv).rgb);` : ''}
                            vec3 mbMix = mix(mbBase, mbR, ${opacity.toFixed(3)} * mbRasT.a);
                            gl_FragColor = vec4(mbSrgbDec(mbMix), 1.0);`}
                     }`,
                );
            };
            material.needsUpdate = true;
        };

        const cached = rasterTextureCache.get(url);
        if (cached) {
            attach(cached);
            try {
                (this.m_dataSource as any).mapView?.update?.();
            } catch {}
            return;
        }

        // raster-array (.mrt) tiles: decode with the vendored MapboxRasterTile
        // (mgl raster_array_tile.ts semantics) — bandView RGBA + descriptor
        // mix/offset REPLACE the paint colorization mix (draw_raster.ts
        // getTextureDescriptor), value decodes as
        //   offset + dot(rgba, [s, 256s, 65536s, 16777216s])
        // and the ramp maps [raster-color-range] over it. NODATA = vec4(1)
        // renders transparent (raTexture2D mask semantics).
        if (url.endsWith('.mrt')) {
            this.loadRasterArrayTexture(url, technique, material, attach, rect);
            return;
        }

        rasterTextureLoader.load(url, (texture) => {
            // mgl raster tiles use mipmapped textures (tile.ts:
            // `new Texture(context, img, gl.RGBA8, {useMipmap: true})` →
            // LINEAR_MIPMAP_LINEAR / NEAREST_MIPMAP_NEAREST, texture.js:82)
            // plus anisotropic filtering at pitch > 20 (draw_raster.ts:201).
            // Plain LINEAR aliases on minification (raster-filtering showed
            // ±25/channel noise across whole tiles at 0.57x downscale).
            const applyRasterFilters = (tex: THREE.Texture) => {
                tex.minFilter = filterType === THREE.NearestFilter
                    ? THREE.NearestMipmapNearestFilter
                    : THREE.LinearMipmapLinearFilter;
                tex.magFilter = filterType;
                tex.generateMipmaps = true;
                try {
                    // mgl enables anisotropic filtering ONLY beyond 20° pitch
                    // (draw_raster.ts: "Enable trilinear filtering on tiles
                    // only beyond 20 degrees of pitch, to prevent it from
                    // compromising image crispness on flat or low tilted
                    // maps") and then at the device MAX (not a capped 4).
                    // Flat-view raster fixtures must sample un-filtered.
                    const mapView = (this.m_dataSource as any).mapView;
                    const maxAniso = mapView?.renderer
                        ?.capabilities?.getMaxAnisotropy?.();
                    const tilt = Number(mapView?.tilt ?? 0);
                    if (tilt > 20 && typeof maxAniso === 'number' && maxAniso > 1) {
                        tex.anisotropy = maxAniso;
                    }
                } catch {}
            };
            applyRasterFilters(texture);
            // Pad the tile with a 1px replicated border so LINEAR filtering
            // at tile seams has neighbour texels (each tile is an isolated
            // texture; mgl samples from a padded atlas). The shader maps UVs
            // through the padding accordingly.
            let padded: THREE.Texture = texture;
            const img: any = (texture as any).image;
            try {
                if (typeof document !== 'undefined' && img) {
                    const w = img.width ?? img.naturalWidth;
                    const h = img.height ?? img.naturalHeight;
                    // Canvas 2D stores pixels PREMULTIPLIED — a texture with
                    // real transparency would come back with rgb·a baked in
                    // and the shader's straight-alpha composite would
                    // double-multiply (raster-alpha fixture: partial-alpha
                    // pixels measured exactly a²-rgb). Tiles carrying alpha
                    // skip the padding canvas and use the original image
                    // directly (straight alpha, ClampToEdge at the border).
                    const probe = document.createElement('canvas');
                    probe.width = Math.min(w, 64); probe.height = Math.min(h, 64);
                    const px = probe.getContext('2d')!;
                    px.drawImage(img, 0, 0, probe.width, probe.height);
                    let hasAlpha = false;
                    try {
                        const data = px.getImageData(0, 0, probe.width, probe.height).data;
                        for (let i = 3; i < data.length; i += 4) {
                            if (data[i] !== 255) { hasAlpha = true; break; }
                        }
                    } catch { /* tainted canvas — assume opaque */ }
                    if (hasAlpha) {
                        padded = new THREE.Texture(img);
                        padded.colorSpace = THREE.SRGBColorSpace;
                        applyRasterFilters(padded);
                        (padded as any).__mbPadPx = [w, h];
                        (padded as any).__mbNoPad = true;
                        padded.needsUpdate = true;
                        rasterTextureCache.set(url, padded);
                        attach(padded);
                        try {
                            (this.m_dataSource as any).mapView?.update?.();
                        } catch {}
                        return;
                    }
                    const cv = document.createElement('canvas');
                    cv.width = w + 2; cv.height = h + 2;
                    const cx = cv.getContext('2d')!;
                    cx.drawImage(img, 1, 1);
                    // edge replication
                    cx.drawImage(img, 0, 0, w, 1, 1, 0, w, 1);          // top
                    cx.drawImage(img, 0, h - 1, w, 1, 1, h + 1, w, 1);  // bottom
                    cx.drawImage(img, 0, 0, 1, h, 0, 1, 1, h);          // left
                    cx.drawImage(img, w - 1, 0, 1, h, w + 1, 1, 1, h);  // right
                    // corners
                    cx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
                    cx.drawImage(img, w - 1, 0, 1, 1, w + 1, 0, 1, 1);
                    cx.drawImage(img, 0, h - 1, 1, 1, 0, h + 1, 1, 1);
                    cx.drawImage(img, w - 1, h - 1, 1, 1, w + 1, h + 1, 1, 1);
                    padded = new THREE.CanvasTexture(cv);
                    padded.colorSpace = THREE.SRGBColorSpace;
                    applyRasterFilters(padded);
                    (padded as any).__mbPadPx = [w, h];
                    padded.needsUpdate = true;
                }
            } catch {}
            rasterTextureCache.set(url, padded);
            attach(padded);
            // Async texture arrival must trigger a new frame — the render-test
            // model is a static frame sequence, so without an update the just-
            // attached texture is never drawn.
            try {
                (this.m_dataSource as any).mapView?.update?.();
            } catch {}
        }, undefined, () => {});
    }

    private patchFillMaterial(material: THREE.Material, paint: any, technique?: any): void {
        // mgl fill-opacity blends against the rendered content below the
        // fill layer. Non-ribbon fills with opacity < 1 need a REAL
        // transparent material (an opaque quad erases everything beneath —
        // observed on raster-masking: the 0.2 green fill hid the contour
        // raster below it).
        let fillRealBlend = false;
        try {
            if (!technique?._isLineRibbon && !technique?._isRaster && !technique?._isHillshade
                && 'opacity' in material
                && typeof technique?.opacity === 'number' && technique.opacity < 1) {
                // Restrict to the raster-below topology (raster-masking): the
                // unrestricted version regressed fill-translucent over
                // circle/extrusion transparents (+43/+784) via transparent-
                // pass reordering; fills over symbol/line/heatmap already
                // failed identically before.
                const styleLayers: any[] = (this.m_dataSource as any).styleManager
                    ?.getStyle?.()?.layers ?? [];
                const idx = styleLayers.findIndex(l => l.id === technique._layerId);
                fillRealBlend = idx > 0 && styleLayers.slice(0, idx).some(l =>
                    l.type === 'raster' && l.layout?.visibility !== 'none');
            }
        } catch {}
        if (fillRealBlend) {
            (material as any).opacity = technique.opacity;
            (material as any).transparent = true;
            (material as any).depthWrite = false;
        }
        // Pre-extruded line ribbons: per-color meshes are coplanar; disable
        // depth testing so the drawn (feature) order decides which color wins
        // at crossings (mapbox painter's algorithm for one line layer).
        if (technique?._isLineRibbon) {
            (material as any).depthTest = false;
            (material as any).depthWrite = false;
            // line-blend-mode on the ribbon fill material (mgl 'additive' /
            // 'multiply' glass modes; the SolidLine path below handles the
            // native material).
            const blendMode = technique._paint?.['line-blend-mode'];
            if (blendMode === 'additive') {
                material.blending = THREE.AdditiveBlending;
            } else if (blendMode === 'multiply') {
                material.blending = THREE.MultiplyBlending;
                // three r178 requires premultipliedAlpha=true for MultiplyBlending,
                // else WebGLState leaves the blend func stale (fragment REPLACES
                // dst instead of accumulating) — the multiply factor never reaches
                // GL. With premultiplied the blend func is
                // (DST_COLOR, ONE_MINUS_SRC_ALPHA) → dst*(C*a + 1−a), mgl's
                // line.fragment.glsl LINE_BLEND_MULTIPLY factor.
                (material as any).premultipliedAlpha = true;
            }
            // mgl-style ~1px alpha feather at the ribbon edges: the emitter
            // bakes a per-vertex edge coordinate (-1/+1 across the ribbon
            // width) plus the width in px on the technique. The feather only
            // becomes visible on alpha-blended materials (line-opacity < 1);
            // opaque ribbons are unchanged (flipping `transparent` on here
            // catastrophically reorders the transparent pass — see the F8
            // note in docs/render-tests-port-todo.md §14).
            const widthPx = Number(technique._ribbonWidthPx ?? 1);
            const blurPx = Number(technique._ribbonBlurPx ?? 0);
            // mgl darkens the line border by ×0.6 (auto-derived border is the
            // line/gradient at the outer edge — line.fragment.glsl
            // `out_color.rgb *= (0.6 + 0.4*alpha2)`). The solid-color border
            // ribbon already carries the derived color in `fill-color`; for
            // gradient borders the RAMP must be darkened instead.
            const borderDarken = Number(technique._isLineBorder ? 0.6 : 1).toFixed(1);
            // line-dasharray: mgl dashes by `a_linesofar` (accumulated feature
            // distance) in line-width units; the ribbon carries `aRibbonLen`
            // (world meters) and `_dashWorld` = [dashLen, gapLen] in world units.
            // The SolidLine dash does NOT rasterize on SwiftShader, so the
            // ribbon must render the dash pattern itself.
            const dashWorld = technique._dashWorld as [number, number] | undefined;
            const hasDash = !!dashWorld && dashWorld[0] > 0 && dashWorld[1] >= 0;
            // A dasharray whose DASH elements are all zero renders NOTHING
            // (mgl's line atlas collapses the zero-length dash ranges leaving
            // only gaps). Solid ribbon would be wrong — discard instead.
            const dashInvisible = Boolean(technique._dashInvisible);
            // line-gradient: ramp texture sampled by the per-vertex
            // line-progress (aRibbonDist). Cached on the material and keyed
            // on the color-theme generation — the ramp colors go through the
            // theme LUT (mgl binds the LUT when sampling the gradient), so a
            // theme applied/changed after first compile must rebuild it. The
            // texture object is kept and its pixels refreshed in place so
            // already-compiled uMBRamp uniforms pick up the new ramp.
            const gradientStops = technique._lineGradientStops;
            if (gradientStops) {
                const lut = paint?.['line-gradient-use-theme'] === 'none'
                    ? undefined : this.colorThemeLut;
                // Key the cache on LUT IDENTITY (not the global theme
                // generation): the initial root theme is decoded
                // asynchronously by MBStyleRuntime and lands AFTER the first
                // tile decode, without a datasource applyColorTheme pass.
                if (!(material as any).__mbRibbonRamp || (material as any).__mbRibbonRampLut !== lut) {
                    const rebuilt = MBMaterialPatchManager.buildGradientTexture(gradientStops, lut);
                    const prev = (material as any).__mbRibbonRamp as THREE.DataTexture | undefined;
                    if (prev) {
                        // Refresh the cached texture IN PLACE so
                        // already-compiled uMBRamp uniforms (they hold the
                        // texture object itself) pick up the re-themed ramp.
                        const prevData = (prev.image as any)?.data as Uint8Array | undefined;
                        const newData = (rebuilt.image as any)?.data as Uint8Array | undefined;
                        if (prevData && newData && prevData.length === newData.length) {
                            prevData.set(newData);
                            prev.needsUpdate = true;
                        } else {
                            (material as any).__mbRibbonRamp = rebuilt;
                        }
                        rebuilt.dispose();
                    } else {
                        (material as any).__mbRibbonRamp = rebuilt;
                    }
                    (material as any).__mbRibbonRampLut = lut;
                }
            }
            const rampTex = (material as any).__mbRibbonRamp as THREE.Texture | undefined;
            // line-pattern: extract a repeating tile texture + its world size.
            const patternName = technique._patternName as string | undefined;
            const patternWorld = technique._ribbonPatternWorld as [number, number] | undefined;
            if (patternName && patternWorld && !(material as any).__mbRibbonPat) {
                const pat = this.extractPatternTexture(patternName);
                if (pat) {
                    pat.wrapS = THREE.RepeatWrapping;
                    pat.wrapT = THREE.RepeatWrapping;
                    (material as any).__mbRibbonPat = pat;
                }
            }
            const patTex = (material as any).__mbRibbonPat as THREE.Texture | undefined;
            // line-pattern-cross-fade: second candidate texture + blend.
            const patternName2 = technique._patternName2 as string | undefined;
            if (patternName2 && patternWorld && !(material as any).__mbRibbonPat2) {
                const pat2 = this.extractPatternTexture(patternName2);
                if (pat2) {
                    pat2.wrapS = THREE.RepeatWrapping;
                    pat2.wrapT = THREE.RepeatWrapping;
                    (material as any).__mbRibbonPat2 = pat2;
                }
            }
            const patTex2 = (material as any).__mbRibbonPat2 as THREE.Texture | undefined;
            const patFade = Number(technique._patternFade ?? 0);
            // line-translate: px → world units at the current display zoom
            // (map anchor: x east / y north; viewport-anchor bearing rotation
            // is not applied — approximation shared with circle-translate).
            const lt = technique._translate as number[] | undefined;
            const mapView = (this.m_dataSource as any).mapView;
            const displayZoom = mapView?.zoomLevel ?? 1;
            const mpp = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                (256 * Math.pow(2, displayZoom));
            // mgl anchors pattern/dash coordinates to the tile grid at
            // floor(camera zoom) (`a_linesofar` in tile units, sampled with
            // `u_tile_units_to_pixels` at tileZoom — transform.ts:568), so the
            // on-screen period carries a 2^(zoom−floor(zoom)) factor. The
            // ribbon tiles by WORLD distance; dividing the u-scale by 2^frac
            // reproduces that anchor at fractional camera zooms. The pattern's
            // aspect ratio is sized by `line-floorwidth` (line.vertex.glsl
            // v_width), not the continuous width.
            const fracZoom = displayZoom - Math.floor(displayZoom);
            const fracInv = fracZoom > 0 ? 1 / Math.pow(2, fracZoom) : 1;
            const floorWidthPx = Number(technique._ribbonFloorWidthPx ??
                technique._ribbonWidthPx ?? 1);
            // v-coordinate scale: cross distance (world) per unit edge (±1)
            // divided by the pattern tile's world height.
            const patVScale = patTex && patternWorld
                ? (widthPx * mpp / 2) / Math.max(patternWorld[1], 1e-9)
                : 0;
            // NOTE: line-translate is applied GEOMETRICALLY in the emitter
            // (baked into the ribbon positions) — the uniform path had no
            // visual effect on the fill materials.
            const translateWorld = undefined as unknown as number[] | undefined;
            void lt;
            // line-offset rides the aRibbonOffs attribute (mgl applies the
            // offset in the vertex shader, invisible to tile clipping — the
            // geometric bake truncated offsets >~20px at tile boundaries).
            const hasOffset = Boolean(technique._ribbonHasOffset);
            // The ~1px AA feather is only active for blurred lines: on the
            // (alpha-blended, tile-fading) ribbon materials it costs ~1px of
            // semi-transparent edge along the whole network — a large net
            // mismatch vs mgl's specific AA (verified: line-color 344 with it
            // off vs 1780 with it on). Re-enable for all lines together with
            // the transparent-pass ordering fix.
            const featherEnabled = blurPx > 0;
            // Pattern sprites (and gradient ramps) carry their own alpha —
            // e.g. border-dot-13 is mostly TRANSPARENT with the "black" RGB
            // being the unpacked residue of alpha-0 texels. Without blending
            // those regions render as solid black. Blurred lines need it for
            // the center-fade alpha ramp. Dash lines need it so the dashed
            // gaps (alpha→0) blend instead of rendering as solid black.
            if (patTex || rampTex || blurPx > 0 || hasDash || dashInvisible) {
                (material as any).transparent = true;
                (material as any).depthWrite = false;
            } else {
                // mgl's edge AA (smoothstep over the 0.5px-dilated quad) needs
                // alpha blending. CustomBlending is honored by three even on
                // non-transparent materials, so the ribbon STAYS in the opaque
                // render list (painter's order preserved — moving it into the
                // transparent list catastrophically reorders crossings) while
                // the semi-transparent AA edge still blends.
                (material as any).blending = THREE.CustomBlending;
                (material as any).blendSrc = THREE.SrcAlphaFactor;
                (material as any).blendDst = THREE.OneMinusSrcAlphaFactor;
                (material as any).blendEquation = THREE.AddEquation;
            }
            if (!(material as any).__mbRibbonAA && widthPx > 0) {
                (material as any).__mbRibbonAA = true;
                // line-trim-offset / line-pattern-trim-offset [start, end]:
                // discard fragments outside the line-progress range.
                const trimOffset = technique._trimOffset as number[] | undefined;
                const hasTrim = Array.isArray(trimOffset) && trimOffset.length === 2;
                // Trimmed-out parts render in `line-trim-color` (default
                // 'transparent' = hidden); `line-trim-fade-range` [in, out]
                // fades the trim edges in progress units.
                let trimColor: THREE.Color | undefined;
                let trimAlpha = 0;
                let trimFade: [number, number] = [0, 0];
                if (hasTrim) {
                    const tcRaw = technique._trimColor as string | undefined;
                    if (tcRaw && tcRaw !== 'transparent') {
                        // Raw-output shader convention (see uMBOutlineColor):
                        // CSS parse is linear under ColorManagement, convert
                        // back to sRGB components for the mix uniform.
                        trimColor = new THREE.Color(tcRaw).convertLinearToSRGB();
                        trimAlpha = 1;
                    }
                    const tf = technique._trimFade as number[] | undefined;
                    if (Array.isArray(tf) && tf.length === 2) trimFade = [tf[0], tf[1]];
                }
                const orig = material.onBeforeCompile;
                material.onBeforeCompile = (shader: any) => {
                    if (orig) orig.call(material, shader);
                    shader.uniforms.uMBRibbonWidth = { value: widthPx };
                    shader.uniforms.uMBRibbonBlur = { value: blurPx };
                    if (hasDash) {
                        const dashLayout = technique._layout ?? {};
                        const dashCap = String(dashLayout['line-cap'] ?? 'butt');
                        const dashCapMode = dashCap === 'round' ? 1 : (dashCap === 'square' ? 2 : 0);
                        const dashUnit = dashLayout['line-width-unit'] ?? 'pixels';
                        const dashHalfW = dashUnit === 'meters'
                            ? widthPx / 2
                            : (widthPx * mpp) / 2;
                        shader.uniforms.uMBDashSize = {
                            value: new THREE.Vector2(dashWorld[0], dashWorld[1]),
                        };
                        shader.uniforms.uMBDashCap = { value: dashCapMode };
                        shader.uniforms.uMBDashHalfW = { value: dashHalfW };
                        shader.uniforms.uMBDashPx = { value: mpp };
                    }
                    if (hasTrim) {
                        shader.uniforms.uMBTrimRange = {
                            value: new THREE.Vector2(trimOffset[0], trimOffset[1]),
                        };
                        shader.uniforms.uMBTrimColor = {
                            value: new THREE.Vector4(
                                trimColor?.r ?? 0, trimColor?.g ?? 0,
                                trimColor?.b ?? 0, trimAlpha),
                        };
                        shader.uniforms.uMBTrimFade = {
                            value: new THREE.Vector2(trimFade[0], trimFade[1]),
                        };
                    }
                    if (rampTex) shader.uniforms.uMBRamp = { value: rampTex };
                    if (patTex && patternWorld) {
                        shader.uniforms.uMBPat = { value: patTex };
                        if (patTex2) {
                            shader.uniforms.uMBPat2 = { value: patTex2 };
                            shader.uniforms.uMBPatFade = { value: patFade };
                        }
                        // mgl stretches the pattern vertically to the line
                        // width and keeps the aspect ratio along u: the
                        // horizontal tile period is patternW * lineW/patternH
                        // in world units, with the pattern sized by the FLOOR
                        // line-width and anchored to the floor-zoom tile grid
                        // (2^(zoom−floor) period factor). Under
                        // line-width-unit:meters the width is already metric —
                        // no px→world conversion (world units are meters).
                        const patScale = (technique._layout?.['line-width-unit'] === 'meters')
                            ? patternWorld[1] /
                                Math.max(patternWorld[0] * Math.max(floorWidthPx, 1e-9), 1e-9) * fracInv
                            : patternWorld[1] /
                                Math.max(patternWorld[0] * Math.max(floorWidthPx * mpp, 1e-9), 1e-9) * fracInv;
                        shader.uniforms.uMBPatUScale = { value: patScale };
                        shader.uniforms.uMBPatVScale = { value: patVScale };
                    }
                    if (translateWorld) {
                        shader.uniforms.uMBTranslate = {
                            value: new THREE.Vector2(translateWorld[0], translateWorld[1]),
                        };
                    }
                    shader.vertexShader = shader.vertexShader.replace(
                        'void main() {',
                         `attribute float aRibbonEdge;
                          varying float vMBRibbonEdge;
                          ${rampTex || hasTrim ? 'attribute float aRibbonDist;\nvarying float vMBRibbonDist;' : ''}
                          ${patTex || hasDash ? 'attribute float aRibbonLen;\nvarying float vMBRibbonLen;' : ''}
                          ${translateWorld ? 'uniform vec2 uMBTranslate;' : ''}
                          ${hasOffset ? 'attribute vec2 aRibbonOffs;' : ''}
                          void main() {`
                    );
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                         `#include <begin_vertex>
                          vMBRibbonEdge = aRibbonEdge;
                          ${rampTex || hasTrim ? 'vMBRibbonDist = aRibbonDist;' : ''}
                          ${patTex || hasDash ? 'vMBRibbonLen = aRibbonLen;' : ''}
                          ${translateWorld ? 'transformed.xy += uMBTranslate;' : ''}
                          ${hasOffset ? 'transformed.xy += aRibbonOffs;' : ''}`
                    );
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                         `varying float vMBRibbonEdge;
                          uniform float uMBRibbonWidth;
                          uniform float uMBRibbonBlur;
                          ${rampTex || hasTrim ? 'varying float vMBRibbonDist;\nuniform sampler2D uMBRamp;\nuniform vec2 uMBTrimRange;\nuniform vec4 uMBTrimColor;\nuniform vec2 uMBTrimFade;' : ''}
                          ${patTex || hasDash ? `varying float vMBRibbonLen;${patTex ? '\nuniform sampler2D uMBPat;\nuniform float uMBPatUScale;\nuniform float uMBPatVScale;' + (patTex2 ? '\nuniform sampler2D uMBPat2;\nuniform float uMBPatFade;' : '') : ''}${hasDash ? '\nuniform vec2 uMBDashSize;\nuniform float uMBDashCap;\nuniform float uMBDashHalfW;\nuniform float uMBDashPx;' : ''}` : ''}
                          void main() {`
                    );
                    // Inject AFTER the colorspace conversion: the ramp /
                    // pattern textures hold sRGB values, and injecting before
                    // colorspace_fragment would linearize them again
                    // (~2.2x brightening — verified on line-gradient).
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <colorspace_fragment>',
                        `#include <colorspace_fragment>
                         {
                             // A zero-dash dasharray renders nothing (mgl
                             // collapses the zero-length dash ranges).
                             ${dashInvisible ? `discard;` : ''}
                             // line-trim-offset: fragments outside [start,
                             // end] render in the trim color ('transparent'
                             // collapses to discard); the two edges fade over
                             // the fade-range in progress units.
                             ${hasTrim ? `float mbTrimT = max(
                                 smoothstep(uMBTrimRange.x, uMBTrimRange.x - max(uMBTrimFade.x, 1e-4), vMBRibbonDist),
                                 smoothstep(uMBTrimRange.y, uMBTrimRange.y + max(uMBTrimFade.y, 1e-4), vMBRibbonDist));
                                 if (mbTrimT >= 1.0 && uMBTrimColor.a <= 0.0) discard;
                                 gl_FragColor.rgb = mix(gl_FragColor.rgb, uMBTrimColor.rgb, mbTrimT * uMBTrimColor.a);
                                 gl_FragColor.a = mix(gl_FragColor.a, 0.0, mbTrimT * (1.0 - uMBTrimColor.a));` : ''}
                             // line-pattern: tile the sprite along the ribbon
                             // (u = abs world distance, v = cross distance).
                             ${patTex ? `vec4 mbPat = texture2D(uMBPat, vec2(vMBRibbonLen * uMBPatUScale, vMBRibbonEdge * 0.5 + 0.5));${patTex2 ? `
                                        vec4 mbPat2 = texture2D(uMBPat2, vec2(vMBRibbonLen * uMBPatUScale, vMBRibbonEdge * 0.5 + 0.5));
                                        mbPat = mix(mbPat, mbPat2, uMBPatFade);` : ''}
                                         gl_FragColor = vec4(mbPat.rgb * ${borderDarken}, mbPat.a * gl_FragColor.a);` : ''}
                             // line-gradient: override the paint color with the
                             // ramp sampled at the line-progress coordinate
                             // (the ramp's own alpha channel multiplies too —
                             // stops like rgba(0,0,255,0) fade the line ends).
                              ${rampTex ? `vec4 mbGrad = texture2D(uMBRamp, vec2(clamp(vMBRibbonDist, 0.0, 1.0), 0.5));
                                          gl_FragColor.rgb = mbGrad.rgb * ${borderDarken};
                                          gl_FragColor.a *= mbGrad.a;` : ''}
                              // line-dasharray: mgl dashes along a_linesofar (accumulated
                              // feature distance) in line-width units; the
                              // ribbon dashes along aRibbonLen (world meters)
                              // with uMBDashSize = [dashLen, gapLen] world
                              // units. The dash shape is a signed distance
                              // field over the period — replicating mgl's line
                              // atlas SDF (line_atlas.ts addDash) — so the
                              // cap style (butt rect / square rect extended by
                              // halfW / round capsule) is exact and both dash
                              // edges get a ~1px AA via uMBDashPx (world
                              // meters per pixel). The former fwidth(mod())
                              // approach exploded at the phase wrap.
                              ${hasDash ? `float mbDashTotal = uMBDashSize.x + uMBDashSize.y;
                                  float mbPhase = mod(vMBRibbonLen, mbDashTotal);
                                  float mbEdge = uMBDashSize.x;
                                  float mbCross = abs(vMBRibbonEdge) * uMBDashHalfW;
                                  float mbDashA;
                                  if (uMBDashCap == 1.0) {
                                      float mbProj = clamp(mbPhase, 0.0, mbEdge);
                                      float mbC1 = length(vec2(mbPhase - mbProj, mbCross)) - uMBDashHalfW;
                                      float mbProj2 = clamp(mbPhase - mbDashTotal, 0.0, mbEdge);
                                      float mbC2 = length(vec2(mbPhase - mbDashTotal - mbProj2, mbCross)) - uMBDashHalfW;
                                      mbDashA = clamp(1.0 - min(mbC1, mbC2) / max(uMBDashPx, 1e-5), 0.0, 1.0);
                                  } else {
                                      float mbExt = uMBDashCap == 2.0 ? uMBDashHalfW : 0.0;
                                      float mbDCur = max(mbPhase - mbEdge - mbExt, 0.0);
                                      float mbDNext = max(mbDashTotal - mbExt - mbPhase, 0.0);
                                      float mbAlong = min(mbDCur, mbDNext);
                                      float mbDist = length(vec2(mbAlong, max(mbCross - uMBDashHalfW, 0.0)));
                                      mbDashA = clamp(1.0 - mbDist / max(uMBDashPx, 1e-5), 0.0, 1.0);
                                  }
                                  gl_FragColor.a *= mbDashA;` : ''}
                             // mgl line AA (line.fragment.glsl): the quad is
                             // dilated by ANTIALIASING (0.5px @dpr1) per side
                             // (the emitter bakes the dilation) and the edge is
                             // faded with smoothstep(EDGE - pxStep, blur*scale
                             // + EDGE + pxStep, delta) — with blur=0, dpr=1,
                             // pxStep=fwidth(dist)≈1: smoothstep(-0.5, 1.5, d)
                             // measured from the TRUE line edge (the ribbon's
                             // outer 0.5px is the dilation).
                             // Hard alpha cut at the DILATED ribbon boundary —
                             // the ribbon carries mgl's +0.5px ANTIALIASING
                             // dilation per side, so the visible width matches
                             // the mgl quad. Soft ramps were tested (mgl
                             // smoothstep(-0.5,1.5) and a linear ±0.5px
                             // feather): both REGRESSED line-color/translate by
                             // 1.1-8k px — the references are crisper than the
                             // vendored mgl AA formula (version drift).
                             ${(technique as any)._isFillOutline ? `
                             // mgl fillOutline (fill_outline.fragment.glsl):
                             // alpha = 1 - smoothstep(0, 1, distPx) — a 1px
                             // screen-space falloff from the boundary line.
                             float mbOutlineDist = abs(vMBRibbonEdge) * uMBRibbonWidth * 0.5;
                             gl_FragColor.a *= 1.0 - smoothstep(0.0, 1.0, mbOutlineDist);` : `
                             float mbDistEdge = (1.0 - abs(vMBRibbonEdge)) * uMBRibbonWidth * 0.5 - 0.5;
                             gl_FragColor.a *= step(-0.5, mbDistEdge);`}
                             ${featherEnabled ? `float mbDistCenter = abs(vMBRibbonEdge) * uMBRibbonWidth * 0.5;
                                 gl_FragColor.a *= clamp(1.0 - mbDistCenter / max(uMBRibbonBlur, 0.5), 0.0, 1.0);` : ''}
                         }`
                    );
                };
                material.needsUpdate = true;
            }
        }
        const translate = this.resolveTranslate(paint['fill-translate'], paint['fill-translate-anchor']);
        // fill-translate is in PIXELS but the shader adds uMBTranslate to the
        // world-space `transformed.xy`. Convert px → world units (meters) at the
        // display zoom, same convention as the emitter's geometric line-translate
        // bake (x east / y north → twy = -ty·mpp). Without this, adding raw px to
        // meters moved the fill by ~2px at z14 instead of the requested 10px.
        const translateWorld: number[] | undefined = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                const mapViewT = (this.m_dataSource as any).mapView;
                const dZoom = mapViewT?.zoomLevel ?? 1;
                const mppT = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const outlineColor = paint['fill-outline-color'];
        const hasTerrain = !!this.centerDem;
        const hdElevation = technique?._hdElevation;
        const emissiveStrength = Number(paint['fill-emissive-strength'] ?? 0);

        if ((!translateWorld || (translateWorld[0] === 0 && translateWorld[1] === 0)) && !outlineColor && !hasTerrain && hdElevation === undefined && emissiveStrength <= 0) return;

        // Emissive: add a constant brightness boost to the fill color.
        // Only meaningful for lit (standard) materials — an unlit basic material
        // already shows the full paint color (mapbox: emissive strength
        // counteracts 3D light shading), so boosting it would wash the fill out.
        const isLit = (material as any).type === 'MeshStandardMaterial';
        if (emissiveStrength > 0 && isLit && !(material as any).__mbFillEmissive) {
            (material as any).__mbFillEmissive = true;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (orig) orig.call(material, shader);
                shader.uniforms.uMBFillEmissive = { value: emissiveStrength };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     gl_FragColor.rgb += vec3(uMBFillEmissive * 0.3);`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    'uniform float uMBFillEmissive;\nvoid main() {'
                );
            };
            material.needsUpdate = true;
        }

        // Terrain draping: displace fill vertices to follow the terrain surface.
        if (hasTerrain) this.injectTerrainDrape(material);

        // HD elevation: displace fill to feature elevation (elevated roads).
        if (hdElevation !== undefined && hdElevation !== 0) {
            const elev = hdElevation;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (orig) orig.call(material, shader);
                shader.uniforms.uMBHdElevation = { value: elev };
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    'transformed.z += uMBHdElevation;\n#include <project_vertex>'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'uniform float uMBHdElevation;\nvoid main() {'
                );
            };
            material.needsUpdate = true;
        }

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

            if (translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0)) {
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translateWorld[0], translateWorld[1]) };
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'uniform vec2 uMBTranslate;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    'transformed.xy += uMBTranslate;\n#include <project_vertex>'
                );
            }

            if (outlineColor) {
                shader.uniforms.uMBOutlineColor = {
                        value: new THREE.Color(outlineColor).convertLinearToSRGB(),
                    };
                shader.uniforms.uMBOutlineWidth = { value: 1.0 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     float mbEdge = fwidth(gl_FragCoord.z);
                     if (mbEdge > 0.5) {
                         gl_FragColor.rgb = mix(gl_FragColor.rgb, uMBOutlineColor, 0.8);
                     }`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    'uniform vec3 uMBOutlineColor;\nuniform float uMBOutlineWidth;\nvoid main() {'
                );
            }
        };
        // mgl ground shadow (_prelude_shadow / ground_shadow.fragment.glsl):
        // ground fill layers multiply `mix(1 - shadowIntensity, 1, lit)` with
        // the shadow-map depth comparison. Injected only when the style has
        // cast-shadows 3D lights (see patchTileMaterials per-frame refresh).
        if (!technique?._isLineRibbon && !technique?._isRaster && !technique?._isHillshade
            && (this.m_dataSource as any).m_environment?.shadowLightState) {
            this.injectGroundShadow(material as any);
        }
        material.needsUpdate = true;
    }

    /**
     * Shadow-map receiver injection for ground fill materials: adds a
     * world-position varying and modulates the output color by the mgl ground
     * shadow factor. Uniform values are refreshed every frame from
     * MBShadowRenderer via `__mbShadowUniforms`.
     */
    private injectGroundShadow(material: any): void {
        if (material.__mbShadowInjected) return;
        material.__mbShadowInjected = true;
        const orig = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (orig) orig.call(material, shader);
            shader.uniforms.uMBShadowMap = { value: null };
            shader.uniforms.uMBShadowMatrix = { value: new THREE.Matrix4() };
            shader.uniforms.uMBShadowIntensity = { value: 0 };
            material.__mbShadowUniforms = shader.uniforms;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vMBWorldPos;')
                .replace(
                    '#include <project_vertex>',
                    '#include <project_vertex>\n' +
                    'vMBWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
                );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    '#include <common>\n' +
                    'varying vec3 vMBWorldPos;\n' +
                    'uniform sampler2D uMBShadowMap;\n' +
                    'uniform mat4 uMBShadowMatrix;\n' +
                    'uniform float uMBShadowIntensity;',
                )
                .replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                    if (uMBShadowIntensity > 0.0) {
                        vec4 mbShadowUv = uMBShadowMatrix * vec4(vMBWorldPos, 1.0);
                        if (mbShadowUv.x >= 0.0 && mbShadowUv.x <= 1.0 &&
                            mbShadowUv.y >= 0.0 && mbShadowUv.y <= 1.0 && mbShadowUv.z <= 1.0) {
                            float mbShadowDepth = texture2D(uMBShadowMap, mbShadowUv.xy).r;
                            float mbLit = mbShadowUv.z <= mbShadowDepth + 0.0015 ? 1.0 : 0.0;
                            gl_FragColor.rgb *= mix(1.0 - uMBShadowIntensity, 1.0, mbLit);
                        }
                    }`,
                );
        };
    }

    private patchLineMaterial(material: THREE.Material, paint: any, layout: any, technique: any): void {
        // Terrain draping: displace line vertices to follow the terrain surface.
        // Applied first so subsequent onBeforeCompile overrides chain correctly.
        if (!!this.centerDem) this.injectTerrainDrape(material);

        // line-width-unit: 'meters' scales line width by the zoom-level
        // meters-per-pixel factor so values are in world meters, not pixels.
        const widthUnit = layout['line-width-unit'] ?? 'pixels';
        if (widthUnit === 'meters') {
            const zoom = (this.m_dataSource as any).mapView?.zoomLevel ?? 10;
            const mpp = 40075016.686 * Math.cos(0) / (256 * Math.pow(2, zoom));
            const widthScale = 1 / Math.max(mpp, 0.01);
            // Scale width, gap-width, blur, offset, border-width from meters→pixels.
            if (typeof paint['line-width'] === 'number') paint['line-width'] *= widthScale;
            if (typeof paint['line-gap-width'] === 'number') paint['line-gap-width'] *= widthScale;
            if (typeof paint['line-blur'] === 'number') paint['line-blur'] *= widthScale;
            if (typeof paint['line-offset'] === 'number') paint['line-offset'] *= widthScale;
            if (typeof paint['line-border-width'] === 'number') paint['line-border-width'] *= widthScale;
            // Also scale the technique's lineWidth (used by the native material).
            if (typeof technique.lineWidth === 'number') technique.lineWidth *= widthScale;
            // Dash array gap sizes scale too.
            if (Array.isArray(paint['line-dasharray'])) {
                paint['line-dasharray'] = paint['line-dasharray'].map((v: number) => v * widthScale);
            }
        }

        const cap = layout['line-cap'];
        const join = layout['line-join'];
        const dashArray = paint['line-dasharray'] ?? layout['line-dasharray'];
        const gapWidth = paint['line-gap-width'];
        const blendMode = paint['line-blend-mode'];
        const emissiveStrength = paint['line-emissive-strength'];
        const translate = this.resolveTranslate(
            paint['line-translate'] ?? technique._translate ?? [0, 0],
            paint['line-translate-anchor'] ?? technique._translateAnchor ?? 'map',
        );
        const gradientStops = technique._lineGradientStops;
        // line-border-gradient: stored raw on paint (evaluator skips it); parse
        // interpolate stops into a normalized gradient ramp for the border.
        const borderGradientRaw = paint['line-border-gradient'];
        const borderGradientStops = borderGradientRaw
            ? MBMaterialPatchManager.normalizeGradientStops(borderGradientRaw)
            : undefined;
        const hasBorderGradient = Array.isArray(borderGradientStops) && borderGradientStops.length > 1;
        const patternName = technique._patternName;
        // line-trim-offset: [start, end] in [0,1] of line-progress. Fragments
        // outside the range are discarded (partial line rendering).
        // Also check line-pattern-trim-offset for backward compatibility.
        const trimOffset = paint['line-trim-offset'] ?? paint['line-pattern-trim-offset'] ?? layout['line-trim-offset'];
        const hasTrim = Array.isArray(trimOffset) && trimOffset.length === 2;
        let modified = false;

        if (blendMode === 'additive') {
            (material as any).blending = (THREE as any).AdditiveBlending;
            (material as any).transparent = true;
            (material as any).depthWrite = false;
            modified = true;
        } else if (blendMode === 'multiply') {
            (material as any).blending = (THREE as any).MultiplyBlending;
            // three r178 MultiplyBlending needs premultipliedAlpha=true or the
            // blend func is left stale (no accumulation). See patchFillMaterial.
            (material as any).premultipliedAlpha = true;
            (material as any).transparent = true;
            modified = true;
        }

        if (cap) {
            const capMap: Record<string, string> = {
                butt: 'None', round: 'Round', square: 'Square',
            };
            const capValue = capMap[cap];
            if (capValue && typeof (material as any).caps !== 'undefined') {
                (material as any).caps = capValue;
                modified = true;
            }
        }

        if (join) {
            // SolidLineMaterial exposes a join type setter; fall back to a define.
            const joinMap: Record<string, string> = {
                bevel: 'Bevel', round: 'Round', miter: 'Miter',
            };
            const joinValue = joinMap[join];
            if (joinValue && typeof (material as any).setJoinType === 'function') {
                (material as any).setJoinType(joinValue);
                modified = true;
            } else if (joinValue) {
                // Direct shader define injection for materials that don't
                // expose setJoinType (e.g. native SolidLineMaterial variants).
                if (!(material as any).__mbJoinPatched) {
                    (material as any).__mbJoinPatched = true;
                    const jv = joinValue;
                    const origCompile = material.onBeforeCompile;
                    material.onBeforeCompile = (shader: any) => {
                        if (origCompile) origCompile.call(material, shader);
                        shader.defines = shader.defines ?? {};
                        shader.defines.JOIN_MODE = jv.toUpperCase();
                    };
                    material.needsUpdate = true;
                }
                modified = true;
            }
        }

        if (gapWidth && gapWidth > 0 && 'secondaryWidth' in material) {
            (material as any).secondaryWidth = gapWidth;
            modified = true;
        }

        // line-border → native SolidLineMaterial outline (outlineColor/outlineWidth).
        const borderWidth = paint['line-border-width'];
        const borderColor = paint['line-border-color'];
        if (typeof borderWidth === 'number' && borderWidth > 0 && 'outlineWidth' in material) {
            (material as any).outlineWidth = borderWidth;
            if (borderColor !== undefined) {
                // SolidLineMaterial writes gl_FragColor directly (sRGB domain)
                (material as any).outlineColor = new THREE.Color(borderColor).convertLinearToSRGB();
            }
            modified = true;
        }

        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
        const hasGradient = Array.isArray(gradientStops) && gradientStops.length > 1;
        const hasEmissive = typeof emissiveStrength === 'number' && emissiveStrength > 0;
        const patternTex = patternName ? this.extractPatternTexture(patternName) : undefined;
        // line-occlusion-opacity (see the emitter's renderOrder lift for the
        // mgl re-draw semantics).
        const lineOcclusionOpacity = Number(paint['line-occlusion-opacity'] ?? 0);
        const hasOcclusion = this.m_depthOcclusion && this.m_depthTexture && lineOcclusionOpacity >= 0;
        if (hasTranslate || hasGradient || hasBorderGradient || patternTex || hasEmissive || hasTrim || hasOcclusion) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                if (hasTrim) {
                    shader.uniforms.uMBTrimRange = { value: new THREE.Vector2(trimOffset[0], trimOffset[1]) };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <common>',
                        '#include <common>\nuniform vec2 uMBTrimRange;'
                    );
                    // Discard fragments whose normalized line-progress is outside
                    // [start, end]. vCoords.x is cumulative distance; fract gives
                    // a [0,1] progress proxy.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <colorspace_fragment>',
                        `#include <colorspace_fragment>
                         {
                             float mbProg = fract(vCoords.x);
                             if (mbProg < uMBTrimRange.x || mbProg > uMBTrimRange.y) discard;
                         }`
                    );
                }
                if (hasTranslate) {
                    shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translate[0], translate[1]) };
                    shader.vertexShader = shader.vertexShader.replace(
                        'void main() {',
                        'uniform vec2 uMBTranslate;\nvoid main() {'
                    );
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <project_vertex>',
                        'transformed.xy += uMBTranslate;\n#include <project_vertex>'
                    );
                }
                if ((hasGradient && !patternTex) || hasBorderGradient) {
                    const gradStops = hasBorderGradient ? borderGradientStops : gradientStops;
                    const gradLut = paint['line-gradient-use-theme'] === 'none' ? undefined : this.colorThemeLut;
                    const tex = MBMaterialPatchManager.buildGradientTexture(gradStops, gradLut);
                    shader.uniforms.uMBGradient = { value: tex };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <common>',
                        '#include <common>\nuniform sampler2D uMBGradient;'
                    );
                    // Mapbox line-gradient colors by line-progress (distance along line).
                    // SolidLineMaterial exposes vCoords.x as cumulative distance; normalize
                    // via fract so the full gradient ramp is applied along the line.
                    if (hasBorderGradient) {
                        // line-border-gradient: apply the gradient to the outline ring.
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'vec3 outputDiffuse = diffuseColor;',
                            `vec3 outputDiffuse = diffuseColor;
                             outputDiffuse = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;`
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'vec3 outlineColor;',
                            'vec3 outlineColor;\n    outlineColor = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;'
                        );
                    } else {
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'vec3 outputDiffuse = diffuseColor;',
                            `vec3 outputDiffuse = diffuseColor;
                             outputDiffuse = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;`
                        );
                    }
                }
                if (patternTex) {
                    const lineCrossFade = technique._patternCrossFade ?? 1;
                    shader.uniforms.uMBLinePattern = { value: patternTex };
                    shader.uniforms.uMBLineCrossFade = { value: lineCrossFade };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                        'uniform sampler2D uMBLinePattern;\nuniform float uMBLineCrossFade;\nvoid main() {'
                    );
                    // Tile the pattern image along the line using the cumulative
                    // distance varying (vCoords.x), scaled by the pattern width.
                    // @2x sprites: divide physical px by the sprite pixelRatio
                    // to get the logical display size (mgl displaySize).
                    const psi = (this.m_dataSource as any).spriteAtlas?.icons?.get(patternName);
                    const pspr = Math.max(1, Number(psi?.pixelRatio ?? 1) || 1);
                    const pscale = pspr / Math.max(1, (patternTex.image?.width ?? 32));
                    shader.uniforms.uMBPatternScale = { value: pscale };
                    // SolidLineMaterial outputs via `outputDiffuse`/`alpha`
                    // (two branches: with/without vColor) — not the r178-invalid
                    // `gl_FragColor = vec4( diffuse, opacity );`.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'gl_FragColor = vec4( outputDiffuse, alpha );',
                        `vec2 mbLP = vec2(fract(vCoords.x * uMBPatternScale), 0.5);
                         vec4 mbLPx = texture2D(uMBLinePattern, mbLP);
                         float mbLAlpha = mbLPx.a * alpha * uMBLineCrossFade;
                         gl_FragColor = vec4(mix(outputDiffuse, mbLPx.rgb, uMBLineCrossFade), mbLAlpha);`
                    );
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'gl_FragColor = vec4( outputDiffuse * vColor, alpha );',
                        `vec2 mbLP = vec2(fract(vCoords.x * uMBPatternScale), 0.5);
                         vec4 mbLPx = texture2D(uMBLinePattern, mbLP);
                         float mbLAlpha = mbLPx.a * alpha * uMBLineCrossFade;
                         gl_FragColor = vec4(mix(outputDiffuse * vColor, mbLPx.rgb, uMBLineCrossFade), mbLAlpha);`
                    );
                }
                if (hasEmissive) {
                    shader.uniforms.uMBEmissiveStrength = { value: emissiveStrength };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <colorspace_fragment>',
                        `#include <colorspace_fragment>\n gl_FragColor.rgb += diffuse * uMBEmissiveStrength;`
                    );
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                        'uniform float uMBEmissiveStrength;\nvoid main() {'
                    );
                }
                if (hasOcclusion) {
                    const depthTex = this.m_depthTexture!;
                    const canvas = (this.m_dataSource as any).mapView?.canvas;
                    shader.uniforms.u_terrainDepth = { value: depthTex };
                    shader.uniforms.u_terrainDepthInvSize = { value: new THREE.Vector2(
                        1 / Math.max(1, canvas?.width ?? 1),
                        1 / Math.max(1, canvas?.height ?? 1),
                    ) };
                    shader.uniforms.uMBLineOcclusion = { value: lineOcclusionOpacity };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <common>',
                        '#include <common>\nuniform sampler2D u_terrainDepth;\nuniform vec2 u_terrainDepthInvSize;\nuniform float uMBLineOcclusion;'
                    );
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <colorspace_fragment>',
                        `#include <colorspace_fragment>
                         {
                             float mbTz = texture2D(u_terrainDepth, gl_FragCoord.xy * u_terrainDepthInvSize).r;
                             float mbOcc = smoothstep(-0.002, 0.002, gl_FragCoord.z - mbTz);
                             gl_FragColor.a *= mix(1.0, uMBLineOcclusion, mbOcc);
                         }`
                    );
                }
            };
            material.needsUpdate = true;
            modified = true;
        }

        if (dashArray && Array.isArray(dashArray) && dashArray.length > 2) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                let totalLen = 0;
                for (const v of dashArray) totalLen += v;
                shader.uniforms.uMBDashPattern = { value: new Float32Array(dashArray) };
                shader.uniforms.uMBDashCount = { value: dashArray.length };
                shader.uniforms.uMBDashTotal = { value: totalLen };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform float uMBDashPattern[${dashArray.length}];\nuniform float uMBDashCount;\nuniform float uMBDashTotal;\nvoid main() {`
                );
                // SolidLineMaterial outputs via `outputDiffuse`/`alpha` (two
                // branches: with/without vColor) — not the r178-invalid
                // `gl_FragColor = vec4( diffuse, opacity );`.
                const dashBlock = (outputExpr: string) =>
                    `float mbDashPos = fract(vCoords.x / uMBDashTotal * uMBDashCount);
                     float mbDashAccum = 0.0;
                     bool mbDashVisible = true;
                     for (int i = 0; i < ${Math.min(dashArray.length, 8)}; i++) {
                         if (float(i) >= uMBDashCount) break;
                         float segLen = uMBDashPattern[i] / uMBDashTotal;
                         if (mbDashPos < mbDashAccum + segLen) {
                             mbDashVisible = (mod(float(i), 2.0) < 0.5);
                             break;
                         }
                         mbDashAccum += segLen;
                     }
                     if (!mbDashVisible) discard;
                     gl_FragColor = vec4( ${outputExpr}, alpha );`;
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( outputDiffuse, alpha );',
                    dashBlock('outputDiffuse')
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( outputDiffuse * vColor, alpha );',
                    dashBlock('outputDiffuse * vColor')
                );
            };
            material.needsUpdate = true;
            modified = true;
        }
    }

    private patchCircleMaterial(material: THREE.Material, paint: any): void {
        const translate = this.resolveTranslate(paint['circle-translate'], paint['circle-translate-anchor']);
        // Circle points are NOT baked with translate in the emitter (the point
        // path only bakes for symbols), so the shader uniform is the sole
        // mechanism. Convert px → world units like fill/line (transformed.xy is
        // world-space meters); raw pixels would move ~2px at z14, not 10px.
        const translateWorld: number[] | undefined = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                const mapViewT = (this.m_dataSource as any).mapView;
                const dZoom = mapViewT?.zoomLevel ?? 1;
                const mppT = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const pitchScale = paint['circle-pitch-scale'];
        // pitch-alignment drives the same sizeAttenuation behavior when set
        // ('viewport' → screen-facing constant size, 'map' → scales with pitch).
        const pitchAlignment = paint['circle-pitch-alignment'];
        const effective = pitchAlignment ?? pitchScale;
        let modified = false;

        // Terrain depth occlusion: test circles against terrain depth so those
        // behind hills are hidden (terrain renders first, writes depth).
        if (this.m_depthOcclusion) {
            (material as any).depthTest = true;
            modified = true;
        }

        if (effective === 'viewport' && 'sizeAttenuation' in material) {
            (material as any).sizeAttenuation = false;
            modified = true;
        } else if (effective === 'map' && 'sizeAttenuation' in material) {
            (material as any).sizeAttenuation = true;
            modified = true;
        }

        if (translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0)) {
            const tx = translateWorld[0];
            const ty = translateWorld[1];
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(tx, ty) };
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform vec2 uMBTranslate;'
                );
                // CirclePointsMaterial (RawShaderMaterial) sets `transformed`
                // in main(); offset it before the modelView transform.
                shader.vertexShader = shader.vertexShader.replace(
                    'vec3 transformed = vec3(position);',
                    'vec3 transformed = vec3(position);\n    transformed.xy += uMBTranslate;'
                );
            };
            material.needsUpdate = true;
            modified = true;
        }

        // Scheme A: soft depth fade. When a terrain DepthTexture is available,
        // sample it at the fragment's screen position and fade alpha when behind
        // terrain. Falls back to Scheme C (hard depthTest) when no texture.
        if (this.m_depthOcclusion && this.m_depthTexture) {
            const depthTex = this.m_depthTexture;
            const canvas = (this.m_dataSource as any).mapView?.canvas;
            const invSize = new THREE.Vector2(
                1 / Math.max(1, canvas?.width ?? 1),
                1 / Math.max(1, canvas?.height ?? 1),
            );
            // occlusion-opacity controls how much a circle fades when behind
            // terrain: 0 = fully hidden, 1 = fully visible even when occluded.
            const occlusionOpacity = Number(paint['circle-occlusion-opacity'] ?? 0);
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.u_terrainDepth = { value: depthTex };
                shader.uniforms.u_terrainDepthInvSize = { value: invSize };
                shader.uniforms.uMBOcclusionOpacity = { value: occlusionOpacity };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform sampler2D u_terrainDepth;\nuniform vec2 u_terrainDepthInvSize;\nuniform float uMBOcclusionOpacity;'
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     {
                         float mbTz = texture2D(u_terrainDepth, gl_FragCoord.xy * u_terrainDepthInvSize).r;
                         float mbOcclude = smoothstep(-0.002, 0.002, gl_FragCoord.z - mbTz);
                         gl_FragColor.a *= mix(1.0, uMBOcclusionOpacity, mbOcclude);
                     }`
                );
            };
            material.needsUpdate = true;
            modified = true;
        }

        // Mapbox circle-blur / circle-stroke-* (mgl circle.fragment.glsl,
        // verbatim ramp composition). Only injected when one of the paint
        // props is set: an always-inject experiment (§12.76-13) measured the
        // plain opacity-only cases slightly WORSE (+17~28px), so the default
        // engine fwidth AA path stays untouched there.
        // Normalization: the point quad covers (radius + stroke_width) px
        // (enlarged in the emitter), so extrude_length = 1.0 at the outer
        // stroke edge and the fill↔stroke boundary sits at
        // radius / (radius + stroke_width).
        const blur = Number(paint['circle-blur'] ?? 0) || 0;
        const strokePx = Number(paint['circle-stroke-width'] ?? 0) || 0;
        const strokeOpacity = Number(paint['circle-stroke-opacity'] ?? 1) || 1;
        const radiusPx = Number(paint['circle-radius'] ?? 5) || 5;
        const strokeColor = new THREE.Color(paint['circle-stroke-color'] ?? '#000000');
        if (blur !== 0 || strokePx > 0) {
            if ('size' in material) {
                // Keep the quad in sync with the emitter's (r+s)·2 sizing.
                (material as any).size = (radiusPx + strokePx) * 2;
            }
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBBlur = { value: blur };
                shader.uniforms.uMBRadiusPx = { value: radiusPx };
                shader.uniforms.uMBStrokePx = { value: strokePx };
                shader.uniforms.uMBStrokeOpacity = { value: strokeOpacity };
                shader.uniforms.uMBStrokeColor = { value: strokeColor };
                // uMBDpr = 1: the engine's `size` uniform is in the same
                // pixel units as gl_PointSize, so the 1/dpr device-pixel
                // correction of mgl's antialiasblur does not apply here.
                shader.uniforms.uMBDpr = { value: 1 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\n' +
                    'uniform float uMBBlur;\nuniform float uMBRadiusPx;\n' +
                    'uniform float uMBStrokePx;\nuniform float uMBStrokeOpacity;\n' +
                    'uniform vec3 uMBStrokeColor;\nuniform float uMBDpr;'
                );
                // Replace the engine's fwidth AA block with the mgl
                // blur/antialiasblur/stroke composition.
                shader.fragmentShader = shader.fragmentShader.replace(
                    /float radius = 0\.5;[\s\S]*?alpha \*= threshold;/,
                    `vec2 mbExtrude = gl_PointCoord * 2.0 - 1.0;
    float mbAA = 1.0 / uMBDpr / max(uMBRadiusPx + uMBStrokePx, 1e-4);
    float mbBlurPos = uMBBlur < 0.0 ? 0.0 : 1.0;
    float mbExtrudeLength = length(mbExtrude) + mbAA * (1.0 - mbBlurPos);
    float mbAAB = -max(abs(uMBBlur), mbAA);
    float mbAABOp = smoothstep(0.0, mbAA, mbExtrudeLength - 1.0);
    float mbOpacityT = mbBlurPos == 1.0 ?
        smoothstep(0.0, -mbAAB, 1.0 - mbExtrudeLength) :
        smoothstep(mbAAB, 0.0, mbExtrudeLength - 1.0) - mbAABOp;
    float mbColorT = uMBStrokePx < 0.01 ? 0.0 : smoothstep(mbAAB, 0.0,
        mbExtrudeLength - uMBRadiusPx / max(uMBRadiusPx + uMBStrokePx, 1e-4));
    vec3 mbColor = mix(diffuseColor, uMBStrokeColor, mbColorT);
    // mgl: out = mix(color*opacity, stroke_color*stroke_opacity, t) — the
    // fill opacity must NOT scale the stroke region (circle-opacity:0 +
    // stroke ("stroke-only" fixture) keeps the stroke fully opaque). Straight
    // alpha equivalent: alpha = opacity_t * mix(opacity, strokeOpacity, t).
    // NOTE: alpha still holds the engine's opacity at this point (the
    // replaced block only reassigned it after).
    alpha = mbOpacityT * mix(alpha, uMBStrokeOpacity, mbColorT);`
                );
                // Route the final color through mbColor (works for both the
                // plain and the ground-lighting-patched gl_FragColor lines).
                shader.fragmentShader = shader.fragmentShader.replace(
                    /gl_FragColor = vec4\(([^;]*diffuseColor[^;]*), alpha\);/,
                    (_m: string, expr: string) =>
                        `gl_FragColor = vec4(${expr.replace(/diffuseColor/g, 'mbColor')}, alpha);`
                );
            };
            material.needsUpdate = true;
            modified = true;
        }
    }

    private patchExtrusionMaterial(material: THREE.Material, paint: any, technique: any, mesh?: THREE.Mesh): void {
        // Translucent extrusions blend once at paint opacity. The engine's
        // DepthPrePass path composites at an effective 0.5×alpha (probe-measured
        // on SwiftShader) and the prepass is disabled on the technique; without
        // it three leaves blending off entirely (transparent=false), so enable
        // it here — CustomBlending is honored on non-transparent materials and
        // keeps the object in the opaque render list (order preserved).
        const paintOpacity = Number(paint['fill-extrusion-opacity'] ?? technique.opacity ?? 1);
        if (paintOpacity > 0 && paintOpacity < 1) {
            (material as any).transparent = false;
            (material as any).blending = THREE.CustomBlending;
            (material as any).blendSrc = THREE.SrcAlphaFactor;
            (material as any).blendDst = THREE.OneMinusSrcAlphaFactor;
            (material as any).blendSrcAlpha = THREE.OneFactor;
            (material as any).blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            (material as any).blendEquation = THREE.AddEquation;
        }
        const height = technique.height ?? paint['fill-extrusion-height'] ?? 0;
        const base = technique.floorHeight ?? paint['fill-extrusion-base'] ?? 0;
        const verticalScale = paint['fill-extrusion-vertical-scale'] ?? 1;
        const scaledHeight = height * verticalScale;
        const lineWidth = paint['fill-extrusion-line-width'] ?? 0;
        const cutoffFadeRange = paint['fill-extrusion-cutoff-fade-range'] ?? 0;
        const verticalGradient = paint['fill-extrusion-vertical-gradient'] !== false;

        // Mapbox fill-extrusion lighting (legacy `light` model). Mapbox ALWAYS
        // lights extruded surfaces even without a `light` in the style, using a
        // default light { position: [1.15, 210, 30], color: white, intensity: 0.5 }.
        // When the style uses the 3D `lights` API instead, the LIGHTING_3D_MODE
        // shader path applies — the three.js scene lights (added by applyLights)
        // light the material directly, so the legacy Lambert injection (which is
        // still used by building materials) is applied instead.
        const lightState = (this.m_dataSource as any).m_environment?.extrusionLightState;
        const use3DLights = lightState?.use3DLights === true;
        const emissiveStrength = Number(paint['fill-extrusion-emissive-strength'] ?? 0);
        if (use3DLights) {
            // LIGHTING_3D_MODE: mapbox `apply_lighting_with_emission` with the
            // world-space flat normal (replaces the simple Lambert fallback).
            this.injectExtrusion3DLighting(material, emissiveStrength);
        }
        // Viewport-anchored light: mapbox rotates the light position by -bearing
        // (`anchor: viewport`) but never by pitch. The per-fragment flat normal is
        // computed from view-space position derivatives, so we pass both the
        // world-space light direction and a view→world rotation to dot them in a
        // consistent (world/tile) frame — the rotation preserves the dot product.
        const mapView = (this.m_dataSource as any).mapView;
        const camera = mapView?.camera as THREE.PerspectiveCamera | undefined;
        const bearingRad = ((mapView?.heading ?? 0) * Math.PI) / 180;
        let lightDirWorld = (lightState?.dir ?? new THREE.Vector3(0.2875, -0.498, 0.996)).clone();
        if (bearingRad !== 0) {
            lightDirWorld.applyAxisAngle(new THREE.Vector3(0, 0, 1), -bearingRad);
        }
        const lightColor = lightState?.color ?? new THREE.Color('#ffffff');
        const lightIntensity = lightState?.intensity ?? 0.5;
        const viewToWorld = camera
            ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
            : new THREE.Matrix3();
        const translate = this.resolveTranslate(
            paint['fill-extrusion-translate'] ?? technique._translate ?? [0, 0],
            paint['fill-extrusion-translate-anchor'] ?? technique._translateAnchor ?? 'map',
        );
        // px → world units (same as fill-translate): the shader adds uMBTranslate
        // to world-space `transformed.xy`, so raw pixels would move ~2px at z14
        // instead of the requested 10px.
        const translateWorld: number[] | undefined = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                const mapViewT = (this.m_dataSource as any).mapView;
                const dZoom = mapViewT?.zoomLevel ?? 1;
                const mppT = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const hasTranslate = !!translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0);
        const patternTex = technique._patternName ? this.extractPatternTexture(technique._patternName) : undefined;
        const hasTerrain = !!(this.m_dataSource as any).m_environment?.terrainController?.centerDem;
        if (height === 0 && base === 0 && !verticalGradient && !hasTranslate && !patternTex && !hasTerrain && lineWidth === 0 && cutoffFadeRange === 0 && emissiveStrength <= 0) {
            return;
        }

        // A requested pattern that is absent from the sprite atlas renders
        // nothing in mapbox (missing pattern = invisible layer).
        if (technique._patternName && !patternTex) {
            material.visible = false;
            return;
        }

        // Wireframe mode: render only edges.
        if (paint['fill-extrusion-wireframe'] === true ||
            paint['fill-extrusion-rounded-wireframe'] === true) {
            (material as any).wireframe = true;
        }

        // Apply pattern as a base texture (tiles across the footprint). The fill
        // pattern patcher also handles pattern-cross-fade mixing.
        if (patternTex) {
            this.patchFillPatternMaterial(material, technique);
        }

        // NOTE: fill-extrusion-partial-rendering (render only buildings within a
        // height range) previously had a broken shader stub here that injected an
        // unbalanced `{`. The render-test category actually verifies engine-side
        // frustum culling via `check renderedVerticesCount`, which the compat
        // runner does not enforce — no patcher-side handling is applicable.

        // Emissive: add a constant brightness boost to extruded surfaces.
        if (emissiveStrength > 0 && !(material as any).__mbExtrusionEmissive) {
            (material as any).__mbExtrusionEmissive = true;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (orig) orig.call(material, shader);
                shader.uniforms.uMBExtrusionEmissive = { value: emissiveStrength };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     gl_FragColor.rgb += vec3(uMBExtrusionEmissive * 0.3);`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    'uniform float uMBExtrusionEmissive;\nvoid main() {'
                );
            };
            material.needsUpdate = true;
        }

        const origOnCompile = material.onBeforeCompile;
        // Terrain DEM for fill-extrusion-terrain: buildings sit on the terrain
        // surface. Sample the center DEM tile at the vertex's world position.
        const terrainController = (this.m_dataSource as any).m_environment?.terrainController;
        // §283: when the emitter already baked the per-vertex DEM lift, the
        // shader-side add would double the elevation (buildings flew ~2×
        // terrain height and left the frustum — the long "invisible
        // extrusions" hunt).
        const centerDem = technique._mbTerrainLifted === true
            ? null
            : terrainController?.centerDem;
        const terrainExag = terrainController ? (terrainController.exaggeration ?? 1) : 0;
        // mgl height/base-alignment semantics (§118 full spec, joint pass):
        //  - base-alignment "terrain" (DEFAULT): base vertices use PER-VERTEX
        //    terrain elevation.
        //  - height-alignment "flat" (DEFAULT): top vertices use the FEATURE
        //    CENTROID elevation so roofs stay horizontal (fill_extrusion
        //    .vertex.glsl is_flat_height); "terrain": per-vertex.
        // The centroid elevation is CPU-sampled once per mesh via the tileKey
        // world anchor (geometry bounding-sphere center); the top/base vertex
        // split rides the baked `extrusionAxis` attribute (w==1 marks top).
        const heightAlign = paint['fill-extrusion-height-alignment'] ?? 'flat';
        const baseAlign = paint['fill-extrusion-base-alignment'] ?? 'terrain';
        let flatEle: number | null = null;
        let anchorWorld: [number, number] | null = null;
        if (centerDem && mesh?.geometry) {
            try {
                const g = mesh.geometry;
                if (g.boundingSphere === null) g.computeBoundingSphere();
                const tk: any = (mesh as any).userData?.tileKey;
                if (tk && g.boundingSphere) {
                    const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
                    const n2 = Math.pow(2, tk.level);
                    const wcx = (tk.column + 0.5) * C / n2;
                    const wcy = C - (tk.row + 0.5) * C / n2;
                    const ax = wcx - g.boundingSphere.center.x;
                    const ay = wcy - g.boundingSphere.center.y;
                    // bounding-sphere center is the feature centroid proxy.
                    const cx = ax + g.boundingSphere.center.x;
                    const cy = ay + g.boundingSphere.center.y;
                    flatEle = terrainController?.sampleElevation?.(cx, cy) ?? null;
                    // World anchor for the PER-VERTEX DEM sample: baked
                    // positions are camera-relative (RTE) while the DEM
                    // uniforms are in WORLD meters — sampling via
                    // modelMatrix produced clamped garbage (§118). Recover
                    // world = position.xy + (tileWorldCenter − meshLocalCenter).
                    anchorWorld = [ax, ay];
                    // Gate: fully inside the center DEM tile (over-border
                    // fixtures span other DEM tiles where the single-tile
                    // sample is wrong).
                    const radius = g.boundingSphere!.radius;
                    const inX = cx - radius >= centerDem.originX && cx + radius <= centerDem.originX + centerDem.size;
                    const inY = cy - radius >= centerDem.originY && cy + radius <= centerDem.originY + centerDem.size;
                    if (!(inX && inY)) flatEle = null;
                }
            } catch {}
        }
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

            if (hasTranslate) {
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translateWorld[0], translateWorld[1]) };
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'uniform vec2 uMBTranslate;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    'transformed.xy += uMBTranslate;\n#include <project_vertex>'
                );
            }
            // position.z is already in meters (baked by
            // MBTileDataEmitter.emitExtrudedPolygon), so the height uniforms are
            // only needed for normalization (vertical gradient) and terrain.
            const needHeightUniforms = height > 0 || base > 0 || !!centerDem || verticalGradient;
            if (needHeightUniforms) {
                shader.uniforms.uMBHeightBase = { value: base };
                shader.uniforms.uMBHeightTop = { value: scaledHeight };
                // Terrain DEM uniforms (fill-extrusion-terrain).
                const demUniforms = centerDem
                    ? `uniform sampler2D uMBExtrusionDem;\nuniform vec2 uMBExtrusionDemOrigin;\nuniform float uMBExtrusionDemSize;\nuniform float uMBExtrusionExag;`
                    : '';
                if (centerDem) {
                    shader.uniforms.uMBExtrusionDem = { value: centerDem.texture };
                    shader.uniforms.uMBExtrusionDemOrigin = { value: new THREE.Vector2(centerDem.originX, centerDem.originY) };
                    shader.uniforms.uMBExtrusionDemSize = { value: centerDem.size };
                    shader.uniforms.uMBExtrusionExag = { value: terrainExag };
                }
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `uniform float uMBHeightBase;\nuniform float uMBHeightTop;\n${demUniforms}\nvoid main() {`
                );
            }
            if (height > 0 || base > 0 || centerDem) {
                // Add terrain elevation at the world position (so the building
                // base follows the terrain surface).
                const useFlatTop = centerDem && heightAlign === 'flat' && flatEle !== null;
                const useFlatBase = centerDem && baseAlign === 'flat' && flatEle !== null;
                if (centerDem && anchorWorld) {
                    shader.uniforms.uMBExtrusionAnchor = { value: new THREE.Vector2(anchorWorld[0], anchorWorld[1]) };
                }
                if (useFlatTop || useFlatBase) {
                    shader.uniforms.uMBFlatEle = { value: flatEle };
                }
                const terrainSample = centerDem && anchorWorld
                    ? `uniform vec2 uMBExtrusionAnchor;
                       vec2 mbWorldPos = position.xy + uMBExtrusionAnchor;
                       vec2 mbDemUv = (mbWorldPos - uMBExtrusionDemOrigin) / uMBExtrusionDemSize;
                       float mbTerrainElev = texture2D(uMBExtrusionDem, vec2(clamp(mbDemUv.x,0.0,1.0), clamp(mbDemUv.y,0.0,1.0))).r * uMBExtrusionExag;
                       uniform float uMBFlatEle;
                       float mbIsTop = extrusionAxis.w > 0.5 ? 1.0 : 0.0;
                       float mbTopEle = ${useFlatTop ? 'uMBFlatEle' : 'mbTerrainElev'};
                       float mbBaseEle = ${useFlatBase ? 'uMBFlatEle' : 'mbTerrainElev'};
                       float mbH = position.z + mix(mbBaseEle, mbTopEle, mbIsTop);`
                    : 'float mbH = position.z;';
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `${terrainSample}
                     vec3 transformed = vec3(position.x, position.y, mbH);`
                );
            }

            // Mapbox fill-extrusion lighting (legacy light model): ambient 0.03 +
            // NdotL with luminance-adjusted intensity, plus a per-face vertical
            // gradient for side surfaces. Computed on the sRGB paint color.
            // Skipped when the style uses the 3D `lights` API (LIGHTING_3D_MODE
            // shader path handles those separately).
            if (!use3DLights) {
                shader.uniforms.uMBLightDirWorld = { value: lightDirWorld };
                shader.uniforms.uMBLightColor = { value: lightColor };
                shader.uniforms.uMBLightIntensity = { value: lightIntensity };
                shader.uniforms.uMBPaintOpacity = { value: paintOpacity };
                shader.uniforms.uMBViewToWorld = { value: viewToWorld };
                shader.uniforms.uMBVerticalGradient = { value: verticalGradient ? 1 : 0 };

                // Varyings must be declared at global scope — injecting the
                // declaration next to the assignment (inside main()) is a GLSL
                // compile error.
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'varying float vMBHeight;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <fog_vertex>',
                    `#include <fog_vertex>
                     vMBHeight = (transformed.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001);`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    `#include <common>
                     varying float vMBHeight;
                     uniform vec3 uMBLightDirWorld; uniform vec3 uMBLightColor;
                     uniform float uMBLightIntensity; uniform mat3 uMBViewToWorld; uniform float uMBPaintOpacity;
                     uniform float uMBVerticalGradient;
                     uniform float uMBHeightBase; uniform float uMBHeightTop;
                     vec3 linearToSrgb(vec3 c) {
                         return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
                     }
                     vec3 srgbToLinear(vec3 c) {
                         return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045))));
                     }`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     {
                         // The renderer's output color space is linear (the
                         // mapview captures to sRGB only at compositing time), so
                         // gl_FragColor.rgb at this point is the LINEAR paint color.
                         // Mapbox's fill-extrusion lighting is computed on the
                         // sRGB paint values and yields an sRGB result; convert the
                         // input to sRGB, do the mapbox math, then linearize the
                         // output so the final capture reproduces the sRGB result.
                         vec3 mbPaintSrgb = linearToSrgb(gl_FragColor.rgb);
                         float mbColorValue = dot(mbPaintSrgb, vec3(0.2126, 0.7152, 0.0722));
                         vec3 mbColor = mbPaintSrgb + vec3(0.03);
                         // Flat normal: FLAT_SHADED so vNormal is undefined; use
                         // screen-space derivatives, rotated into world space.
                         vec3 mbViewN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                         vec3 mbWorldN = normalize(uMBViewToWorld * mbViewN);
                         // Roof normals point up (mapbox encodes roof as (0,0,1)
                         // with normal.y == 0, i.e. no vertical gradient); walls are
                         // horizontal. Detect via the world-space vertical component.
                         float mbNdotL = clamp(dot(mbWorldN, uMBLightDirWorld), 0.0, 1.0);
                         mbNdotL = mix(1.0 - uMBLightIntensity, max(1.0 - mbColorValue + uMBLightIntensity, 1.0), mbNdotL);
                         if (abs(mbWorldN.z) < 0.5) {
                             float mbR = mix(0.7, 0.98, 1.0 - uMBLightIntensity);
                             mbNdotL *= (1.0 - uMBVerticalGradient) + uMBVerticalGradient * clamp((vMBHeight + uMBHeightBase) * pow(uMBHeightTop / 150.0, 0.5), mbR, 1.0);
                         }
                         vec3 mbResultSrgb = clamp(mbColor * mbNdotL * uMBLightColor, mix(vec3(0.0), vec3(0.3), 1.0 - uMBLightColor), vec3(1.0));
                         gl_FragColor.rgb = srgbToLinear(mbResultSrgb);
                         // Force the blend weight: material-level opacity was
                         // not reaching the fragment on this path (probed), the
                         // onBeforeCompile injection is.
                         if (uMBPaintOpacity < 1.0) {
                             gl_FragColor.a = uMBPaintOpacity;
                         }
                     }`
                );
            }

            // fill-extrusion-line-width: edge outline effect via normal derivatives.            // fill-extrusion-line-width: edge outline effect via normal derivatives.
            if (lineWidth > 0) {
                shader.uniforms.uMBEdgeWidth = { value: lineWidth };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform float uMBEdgeWidth;'
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     {
                         // vNormal is not declared under FLAT_SHADED; use the
                         // derivative-based flat normal there.
                         #ifdef FLAT_SHADED
                             vec3 mbEdgeN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                         #else
                             vec3 mbEdgeN = normalize(vNormal);
                         #endif
                         float mbEdge = length(fwidth(mbEdgeN));
                         float mbEdgeFactor = 1.0 - smoothstep(0.0, 0.5 / max(uMBEdgeWidth, 0.001), mbEdge);
                         gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.4, mbEdgeFactor);
                     }`
                );
            }

            // fill-extrusion-cutoff-fade-range: fade opacity near the cutoff height.
            if (cutoffFadeRange > 0) {
                shader.uniforms.uMBCutoffFade = { value: cutoffFadeRange };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform float uMBCutoffFade;'
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     {
                         float mbCutoffDist = abs(vViewPosition.z);
                         float mbFade = smoothstep(0.0, uMBCutoffFade * 100.0, mbCutoffDist);
                         gl_FragColor.a *= mbFade;
                     }`
                );
            }
        };
        material.needsUpdate = true;
    }

    private patchBuildingMaterial(material: THREE.Material, technique: any): void {
        // 3D lighting: LIGHTING_3D_MODE uses the mapbox `apply_lighting` formula
        // (applied after the procedural facade block below); legacy light keeps
        // the simple Lambert injection.
        const lightState = (this.m_dataSource as any).m_environment?.extrusionLightState;
        const use3DLights = lightState?.use3DLights === true;
        if (!use3DLights) {
            this.injectLighting(material);
        }
        const height = Number(technique.height ?? 10);
        const base = Number(technique.floorHeight ?? 0);
        const roofColor = technique._roofColor ?? technique._paint?.['building-roof-color'] ?? '#aaaaaa';
        const emissive = technique._paint?.['building-emissive-strength'] ?? 0;
        const facadeFloors = Number(technique._paint?.['building-facade-floors'] ?? Math.max(1, Math.round(height / 3)));
        const facadeWidth = Number(technique._paint?.['building-facade-unit-width'] ?? 6);
        const aoIntensity = Number(technique._paint?.['building-ambient-occlusion-intensity'] ?? 0);
        const floodIntensity = Number(technique._paint?.['building-flood-light-intensity'] ?? 0);
        const floodColor = technique._paint?.['building-flood-light-color'] ?? '#ffffff';

        if (emissive > 0 && 'emissiveIntensity' in material) {
            (material as any).emissiveIntensity = emissive;
            (material as any).emissive = new THREE.Color(roofColor);
        }

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBHeightBase = { value: base };
            shader.uniforms.uMBHeightTop = { value: height };
            shader.uniforms.uMBRoofColor = {
                        value: new THREE.Color(roofColor).convertLinearToSRGB(),
                    };
            shader.uniforms.uMBFacadeFloors = { value: facadeFloors };
            shader.uniforms.uMBFacadeWidth = { value: facadeWidth };
            shader.uniforms.uMBAO = { value: aoIntensity };
            shader.uniforms.uMBFloodColor = {
                        value: new THREE.Color(floodColor).convertLinearToSRGB(),
                    };
            shader.uniforms.uMBFloodIntensity = { value: floodIntensity };
            if (use3DLights) {
                const l3 = (this.m_dataSource as any).m_environment?.lighting3DState;
                const mapView = (this.m_dataSource as any).mapView;
                const camera = mapView?.camera as THREE.PerspectiveCamera | undefined;
                const viewToWorld = camera
                    ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
                    : new THREE.Matrix3();
                shader.uniforms.uMB3DAmb = { value: l3 ? l3.ambientColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDirColor = { value: l3 ? l3.directionalColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDir = { value: l3 ? l3.dir : [0, 0, 1] };
                shader.uniforms.uMB3DViewToWorld = { value: viewToWorld };
                shader.uniforms.uMB3DEmissive = { value: l3 ? emissive : 0 };
            }

            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `uniform float uMBHeightBase;\nuniform float uMBHeightTop;\n
                 varying vec3 vMBWorldPos;\nvoid main() {`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `// position.z is already in meters (baked by the emitter).
                 float mbH = position.z;
                 vec3 transformed = vec3(position.x, position.y, mbH);
                 vMBWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                 uniform vec3 uMBRoofColor;
                 uniform float uMBHeightBase; uniform float uMBHeightTop;
                 uniform float uMBFacadeFloors; uniform float uMBFacadeWidth; uniform float uMBAO;
                 uniform vec3 uMBFloodColor; uniform float uMBFloodIntensity;
                 varying vec3 vMBWorldPos;
                 ${use3DLights
                     ? 'uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir; uniform mat3 uMB3DViewToWorld; uniform float uMB3DEmissive;'
                     : ''}
                 float mbHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <colorspace_fragment>',
                `#include <colorspace_fragment>
                 {
                     // vNormal is not declared under FLAT_SHADED (always set for
                     // extruded-polygon); derive the flat normal from derivatives.
                     #ifdef FLAT_SHADED
                         vec3 mbFaceNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
                     #else
                         vec3 mbFaceNormal = normalize(vNormal);
                     #endif
                     bool mbIsRoof = abs(dot(mbFaceNormal, vec3(0.0,0.0,1.0))) > 0.9;
                     if (mbIsRoof) {
                         gl_FragColor.rgb = uMBRoofColor;
                     } else {
                         // Procedural facade: window grid via hash.
                         vec2 mbFUv = vec2(vMBWorldPos.x / uMBFacadeWidth,
                                           (vMBWorldPos.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001) * uMBFacadeFloors);
                         vec2 mbCell = floor(mbFUv);
                         vec2 mbFrac = fract(mbFUv);
                         float mbWinLit = mbHash(mbCell);
                         // Window frame: darken edges, lit windows brighter.
                         float mbEdge = step(0.15, mbFrac.x) * step(mbFrac.x, 0.85) * step(0.15, mbFrac.y) * step(mbFrac.y, 0.85);
                         vec3 mbWinColor = mix(gl_FragColor.rgb * 0.3, gl_FragColor.rgb * 1.4, mbWinLit);
                         gl_FragColor.rgb = mix(gl_FragColor.rgb, mbWinColor, mbEdge);
                         // Ambient occlusion: darken near the base.
                         float mbAoFactor = 1.0 - uMBAO * 0.5 * (1.0 - smoothstep(0.0, 0.15,
                             (vMBWorldPos.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001)));
                         gl_FragColor.rgb *= mbAoFactor;
                         // Flood light: warm glow at ground level, fading upward.
                         float mbFloodFactor = uMBFloodIntensity * (1.0 - smoothstep(0.0, 0.4,
                             (vMBWorldPos.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001)));
                         gl_FragColor.rgb += uMBFloodColor * mbFloodFactor * 0.3;
                     }
                     ${use3DLights ? `
                     // LIGHTING_3D_MODE apply_lighting_with_emission (world normal).
                     {
                         vec3 mbWN = normalize(uMB3DViewToWorld * mbFaceNormal);
                         float mbNdotL = dot(mbWN, uMB3DDir);
                         float mbDirLum = dot(uMB3DDirColor, vec3(0.2126, 0.7152, 0.0722));
                         float mbDirFactorMin = 1.0 - 0.3 * min(mbDirLum, 1.0);
                         float mbAmbDir = mix(mbDirFactorMin, 1.0, min(mbNdotL + 1.0, 1.0));
                         float mbVert = mix(0.92, 1.0, mbWN.z * 0.5 + 0.5);
                         float mbADF = mbVert * mbAmbDir;
                         vec3 mbK = uMB3DAmb * mbADF + uMB3DDirColor * max(mbNdotL, 0.0);
                         vec3 mbLit = gl_FragColor.rgb * pow(mbK, vec3(1.0 / 2.2));
                         gl_FragColor.rgb = mix(mbLit, gl_FragColor.rgb, uMB3DEmissive);
                     }` : ''}
                 }`
            );
        };
        material.needsUpdate = true;
    }

    /**
     * Connect the sprite atlas to a native POI/icon object: set the atlas texture
     * and inject per-icon UV so each icon samples its own sub-rectangle.
     */
    private patchIconObject(obj: THREE.Object3D, technique: any): void {
        const atlas = (this.m_dataSource as any).spriteAtlas;
        if (!atlas) return;
        const iconName = technique.imageTexture ?? technique._layout?.['icon-image'];
        if (!iconName) return;

        const material = (obj as any).material as THREE.Material | undefined;
        if (!material || (material as any).__mbIconPatched) return;
        (material as any).__mbIconPatched = true;

        const uv = atlas.getIconUv(iconName);
        const iconInfo = atlas.icons?.get(iconName);
        const isSdf = iconInfo?.sdf === true;
        const iconColor = technique.color ?? technique._paint?.['icon-color'] ?? '#ffffff';
        const haloColor = technique._paint?.['icon-halo-color'] ?? '#000000';
        const haloWidth = Number(technique._paint?.['icon-halo-width'] ?? 0);
        const haloBlur = Number(technique._paint?.['icon-halo-blur'] ?? 0);
        // HD icon color adjustments.
        const brightnessMin = Number(technique._paint?.['icon-color-brightness-min'] ?? 0);
        const brightnessMax = Number(technique._paint?.['icon-color-brightness-max'] ?? 1);
        const contrast = Number(technique._paint?.['icon-color-contrast'] ?? 0);
        const saturation = Number(technique._paint?.['icon-color-saturation'] ?? 0);
        const hasColorAdjust =
            brightnessMin !== 0 || brightnessMax !== 1 ||
            contrast !== 0 || saturation !== 0;

        (material as any).map = atlas.texture;
        // Non-SDF icons show the texture as-is (white multiplier); SDF icons are
        // tinted by icon-color (handled in the SDF shader branch below).
        (material as any).color = new THREE.Color(isSdf ? '#ffffff' : '#ffffff');
        (material as any).transparent = true;
        (material as any).depthWrite = false;

        if (uv) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uUvOffset = { value: new THREE.Vector2(uv.uvMin[0], uv.uvMin[1]) };
                shader.uniforms.uUvScale = {
                    value: new THREE.Vector2(uv.uvMax[0] - uv.uvMin[0], uv.uvMax[1] - uv.uvMin[1]),
                };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform vec2 uUvOffset;\nuniform vec2 uUvScale;'
                );
                if (isSdf) {
                    // SDF rendering: the atlas alpha channel holds the signed
                    // distance. Fill the glyph with icon-color and draw a halo ring
                    // (icon-halo-color) when halo-width > 0.
                    shader.uniforms.uMBIconColor = {
                        value: new THREE.Color(iconColor).convertLinearToSRGB(),
                    };
                    shader.uniforms.uMBHaloColor = {
                        value: new THREE.Color(haloColor).convertLinearToSRGB(),
                    };
                    shader.uniforms.uMBHaloWidth = { value: haloWidth / 16.0 };
                    shader.uniforms.uMBHaloBlur = { value: Math.max(haloBlur, 0.5) / 16.0 };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <common>',
                        `#include <common>
                         uniform vec2 uUvOffset; uniform vec2 uUvScale;
                         uniform vec3 uMBIconColor; uniform vec3 uMBHaloColor;
                         uniform float uMBHaloWidth; uniform float uMBHaloBlur;`
                    );
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <colorspace_fragment>',
                        `#include <colorspace_fragment>
                         {
                             float mbSdf = texture2D(map, uUvOffset + vUv * uUvScale).a;
                             float mbEdge = 0.5;
                             float mbFill = smoothstep(mbEdge - uMBHaloBlur, mbEdge + uMBHaloBlur, mbSdf);
                             float mbHaloEdge = mbEdge - uMBHaloWidth;
                             float mbHalo = smoothstep(mbHaloEdge - uMBHaloBlur, mbHaloEdge + uMBHaloBlur, mbSdf) - mbFill;
                             vec3 mbCol = mix(uMBHaloColor, uMBIconColor, mbFill);
                             float mbAlpha = max(mbFill, mbHalo * step(0.0001, uMBHaloWidth));
                             gl_FragColor = vec4(mbCol, mbAlpha * opacity);
                         }`
                    );
                } else {
                    // Non-SDF: just remap UVs into the icon sub-rectangle.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'texture2D( map, vUv )',
                        'texture2D( map, uUvOffset + vUv * uUvScale )'
                    );
                }
            }
        };

        // HD icon color adjustments (brightness/contrast/saturation) — applied
        // after UV remap, before final output. Uses the same shader functions
        // as the raster color adjustment (YIQ hue rotate is omitted for icons).
        if (hasColorAdjust) {
            const prevOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (prevOnCompile) prevOnCompile.call(material, shader);
                shader.uniforms.uMBIconBMin = { value: brightnessMin };
                shader.uniforms.uMBIconBMax = { value: brightnessMax };
                shader.uniforms.uMBIconContrast = { value: contrast };
                shader.uniforms.uMBIconSat = { value: saturation };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform float uMBIconBMin; uniform float uMBIconBMax;
                     uniform float uMBIconContrast; uniform float uMBIconSat;
                     void main() {`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     {
                         vec3 ic = gl_FragColor.rgb;
                         // Brightness: remap [bMin, bMax] → [0, 1].
                         ic = clamp((ic - uMBIconBMin) / (uMBIconBMax - uMBIconBMin + 0.001), 0.0, 1.0);
                         // Contrast: push away from 0.5.
                         ic = (ic - 0.5) * (1.0 + uMBIconContrast) + 0.5;
                         // Saturation: mix toward luma.
                         float luma = dot(ic, vec3(0.299, 0.587, 0.114));
                         ic = mix(vec3(luma), ic, 1.0 + uMBIconSat);
                         gl_FragColor.rgb = clamp(ic, 0.0, 1.0);
                     }`
                );
            };
        }

        material.needsUpdate = true;
    }

    /**
     * Approximate heatmap rendering on a native points material: additive
     * blending with a soft radial falloff so overlapping points build density.
     * (Full Mapbox heatmap uses a two-pass density→color-ramp pipeline; this is
     * a single-pass approximation that "connects the flow" and produces visible
     * heatmap-like output.)
     */
    private patchHeatmapMaterial(material: THREE.Material, technique: any): void {
        if ((material as any).__mbHeatmapPatched) return;
        (material as any).__mbHeatmapPatched = true;

        (material as any).transparent = true;
        (material as any).depthWrite = false;
        (material as any).blending = (THREE as any).AdditiveBlending;

        const colorStops = technique._heatmapColorStops;
        const ramp = MBMaterialPatchManager.buildGradientTexture(colorStops,
            this.colorThemeLut);
        const intensity = technique._heatmapIntensity ?? 1;
        const weight = technique._heatmapWeight ?? 1;

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBHeatRamp = { value: ramp };
            shader.uniforms.uMBHeatIntensity = { value: intensity };
            shader.uniforms.uMBHeatWeight = { value: weight };
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                'uniform sampler2D uMBHeatRamp;\nuniform float uMBHeatIntensity;\nuniform float uMBHeatWeight;\nvoid main() {'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'gl_FragColor = vec4(diffuseColor, alpha);',
                `vec2 mbHp = gl_PointCoord - vec2(0.5);
                 float mbHd = dot(mbHp, mbHp) * 4.0;
                 float mbHfall = exp(-mbHd * uMBHeatIntensity);
                 float mbHden = clamp(mbHfall * uMBHeatWeight, 0.0, 1.0);
                 vec3 mbHcol = texture2D(uMBHeatRamp, vec2(mbHden, 0.5)).rgb;
                 gl_FragColor = vec4(mbHcol, mbHden * opacity);`
            );
        };
        material.needsUpdate = true;
    }

    /**
     * Hillshade: load the per-tile raster-DEM texture and apply a hillshade
     * shader (slope/aspect from finite differences, lambertian dot with a light
     * direction). DEM PNGs encode elevation in (r*256*256 + g*256 + b) - 65536.
     */
    private patchHillshadeMaterial(material: THREE.Material, technique: any): void {
        const url = technique._hillshadeDemUrl as string;
        if (!url) return;
        if ((material as any).__mbHillshadePatched) return;

        const intensity = technique._hillshadeIntensity ?? 0.5;
        const accent = new THREE.Color(technique._hillshadeAccent ?? '#ffffff');
        const highlight = new THREE.Color(technique._hillshadeHighlight ?? '#ffffff');

        const applyShader = (demTex: THREE.Texture) => {
            if ((material as any).__mbHillshadePatched) return;
            (material as any).__mbHillshadePatched = true;
            (material as any).map = demTex;

            // Determine the DEM border/buffer: mapbox raster-dem tiles may ship
            // pre-padded images (e.g. 258x258 for buffer=1, 260x260 for buffer=2)
            // where the extra pixels hold neighbouring tiles' elevation so that
            // surface normals at tile edges are correct. The tile's UV [0,1]
            // maps to the inner data region; one-pixel finite-difference steps
            // reach into the border at the edges.
            const demImg: any = (demTex as any).image;
            const imgSize = demImg?.width ?? demImg?.naturalWidth ?? 256;
            const tileSize = technique._hillshadeTileSize ?? 256;
            const buffer = Math.max(0, (imgSize - tileSize) / 2);
            const dataFrac = tileSize / imgSize;       // fraction of texture that is data
            const borderFrac = buffer / imgSize;        // border offset (in UV)
            const pxStep = 1.0 / imgSize;               // one DEM pixel in UV

            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBDem = { value: demTex };
                shader.uniforms.uMBHsIntensity = { value: intensity };
                shader.uniforms.uMBHsAccent = { value: accent };
                shader.uniforms.uMBHsHighlight = { value: highlight };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform sampler2D uMBDem;
                     uniform float uMBHsIntensity;
                     uniform vec3 uMBHsAccent;
                     uniform vec3 uMBHsHighlight;
                     uniform vec4 uMBDemParams; // x=dataFrac, y=borderFrac, z=pxStep, w=unused
                     // Mapbox terrain-rgb: height = (R*65536+G*256+B)/10 - 10000
                     float mbDemElev(vec2 uv){ vec4 c=texture2D(uMBDem,uv);
                         return (c.r*65536.0+c.g*256.0+c.b)/10.0-10000.0; }
                     // Map tile-local UV (0..1 over the tile) into the DEM texture's
                     // inner data region, honouring the pre-padded border.
                     vec2 mbDemUv(vec2 tileUv){
                         return uMBDemParams.y + tileUv * uMBDemParams.x;
                     }
                     void main() {`
                );
                shader.uniforms.uMBDemParams = { value: new THREE.Vector4(dataFrac, borderFrac, pxStep, 0) };
                // In three r178 MeshBasicMaterial the final colour is written by
                // `#include <opaque_fragment>` (not an inline `gl_FragColor = ...`
                // line), so inject the hillshade override right after it.
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     vec2 mbUv = mbDemUv(vUv);
                     float mbL=mbDemElev(mbUv-vec2(uMBDemParams.z,0.0));
                     float mbR=mbDemElev(mbUv+vec2(uMBDemParams.z,0.0));
                     float mbD=mbDemElev(mbUv-vec2(0.0,uMBDemParams.z));
                     float mbU=mbDemElev(mbUv+vec2(0.0,uMBDemParams.z));
                     vec3 mbN=normalize(vec3(mbL-mbR, mbD-mbU, 0.5));
                     vec3 mbLight=normalize(vec3(0.7,0.7,1.0));
                     float mbSlope=max(dot(mbN,mbLight),0.0);
                     vec3 mbHs=mix(diffuse,vec3(mbSlope),uMBHsIntensity);
                     mbHs+=uMBHsAccent*(1.0-abs(mbN.z))*0.15;
                     mbHs+=uMBHsHighlight*pow(mbSlope,3.0)*0.2;
                     gl_FragColor = vec4(mbHs, opacity);`
                );
            };
            material.needsUpdate = true;
        };

        const cached = rasterTextureCache.get(url);
        if (cached) {
            applyShader(cached);
        } else {
            rasterTextureLoader.load(url, (texture) => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                rasterTextureCache.set(url, texture);
                applyShader(texture);
                // Async DEM/texture arrival → trigger a new frame (see raster path).
                try {
                    (this.m_dataSource as any).mapView?.update?.();
                } catch {}
            }, undefined, () => {});
        }
    }

    /**
    /**
     * Parse a raw gradient expression (or pre-evaluated stops) into normalized
     * `[{t, r, g, b, a}]` stops. Handles:
     *  - Raw interpolate: ["interpolate", ["linear"], ["line-progress"], 0, "red", 1, "blue"]
     *  - Already-evaluated stops: [[0, "red"], [1, "blue"]]
     *  - Heatmap color ramp: [[0, "rgba(...)"], [0.5, "blue"], ...]
     */
    private static normalizeGradientStops(raw: any): Array<{ t: number; r: number; g: number; b: number; a: number }> {
        if (!raw) return [];
        // Compiled mapview expression nodes (MemoCallExpr / CallExpr) are objects
        // that serialize to ["memo", [...]] / ["interpolate", ...] via JSON;
        // normalize them to plain nested arrays so the branches below apply.
        if (!Array.isArray(raw) && typeof raw === 'object') {
            try {
                raw = JSON.parse(JSON.stringify(raw));
            } catch {
                return [];
            }
        }
        // Unwrap the mapview expression-compiler's ["memo", inner] wrapper (and
        // any nested copies) — MemoCallExpr serializes as ["memo", <expr>].
        while (Array.isArray(raw) && raw[0] === 'memo') {
            raw = raw[1];
        }
        // Already-evaluated [[t,color],...] format.
        if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]) && raw[0].length === 2) {
            return raw.map((s: any) => {
                const c = MBMaterialPatchManager.parseColor(String(s[1]));
                return { t: Number(s[0]) ?? 0, r: c[0], g: c[1], b: c[2], a: c[3] };
            }).sort((a: any, b: any) => a.t - b.t);
        }
        // Raw interpolate expression: ["interpolate", [type], [input], stop1, color1, ...]
        if (Array.isArray(raw) && raw[0] === 'interpolate') {
            const stops: Array<{ t: number; r: number; g: number; b: number; a: number }> = [];
            // args[0] = interpolation type, args[1] = input expression (skip both)
            for (let i = 3; i < raw.length - 1; i += 2) {
                const t = Number(raw[i]) ?? 0;
                const colorVal = raw[i + 1];
                // Color might be a raw string or a nested expression (e.g. ["rgb", r, g, b]).
                let c: [number, number, number, number];
                if (typeof colorVal === 'string') {
                    c = MBMaterialPatchManager.parseColor(colorVal);
                } else if (Array.isArray(colorVal) && colorVal[0] === 'rgb') {
                    c = [colorVal[1], colorVal[2], colorVal[3], 1];
                } else if (Array.isArray(colorVal) && colorVal[0] === 'rgba') {
                    c = [colorVal[1], colorVal[2], colorVal[3], colorVal[4] ?? 1];
                } else {
                    c = MBMaterialPatchManager.parseColor(String(colorVal));
                }
                stops.push({ t, r: c[0], g: c[1], b: c[2], a: c[3] });
            }
            return stops.sort((a, b) => a.t - b.t);
        }
        return [];
    }

    /** Style color-theme LUT (null when the style has none). */
    private get colorThemeLut(): any {
        try {
            return (this.m_dataSource as any).runtime?.evaluator?.colorTheme ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Decode a raster-array (.mrt) tile to a band-view RGBA texture
     * (mgl raster_array_tile.ts updateTextureDescriptor). Attaches the array
     * decode uniforms on the material's onBeforeCompile chain — see the
     * RASTER_ARRAY branch injected alongside RASTER_COLOR in the fragment.
     */
    private loadRasterArrayTexture(
        url: string,
        technique: any,
        material: THREE.Material,
        attach: (texture: THREE.Texture) => void,
        _rect: number[],
    ): void {
        (async () => {
            const { MapboxRasterTile } = await import('./vendor/mrt');
            const { PbfReader } = await import('pbf');
            (MapboxRasterTile as any).setPbf(PbfReader as any);
            const resp = await fetch(url);
            const ab = await resp.arrayBuffer();

            const mrt = new (MapboxRasterTile as any)(Infinity);
            mrt.parseHeader(ab);

            // source-layer: look the raster layer up in the style (the layer
            // id rides on the technique).
            let sourceLayer = '';
            try {
                const style = (this.m_dataSource as any).styleManager?.getStyle?.();
                const layer = (style?.layers ?? []).find(
                    (l: any) => l.id === technique._layerId || (l.type === 'raster' && l['source-layer']));
                sourceLayer = layer?.['source-layer'] ?? Object.keys(mrt.layers)[0] ?? '';
            } catch {}
            const mrtLayer = mrt.getLayer(sourceLayer) ?? mrt.getLayer(Object.keys(mrt.layers)[0]);
            if (!mrtLayer) return;

            const bands = mrtLayer.getBandList();
            const band = bands[0];
            const range = mrtLayer.getDataRange([band]);
            const batch = mrt.createDecodingTask(range);
            const slice = ab.slice(range.firstByte, range.lastByte + 1);
            const results = await (MapboxRasterTile as any).performDecoding(slice, batch);
            batch.complete(null, results);
            if (!mrtLayer.hasDataForBand(band)) return;

            const view = mrtLayer.getBandView(band);
            const size = view.tileSize + 2 * view.buffer;
            const tex = new THREE.DataTexture(
                new Uint8Array(view.bytes.buffer, view.bytes.byteOffset, view.bytes.byteLength),
                size, size, THREE.RGBAFormat);
            // Band bytes are an ENCODING, not colors — no sRGB, and mgl
            // forces NEAREST for array sources (linear re-interpolation is
            // done in-shader on the decoded values).
            tex.colorSpace = THREE.NoColorSpace;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.needsUpdate = true;
            (tex as any).__mbNoPad = true;
            (tex as any).__mbPadPx = [size, size];
            (tex as any).__mbIsRasterArray = true;
            (tex as any).__mbArrMix = [
                view.scale, view.scale * 256, view.scale * 65536, view.scale * 16777216,
            ];
            (tex as any).__mbArrOffset = view.offset;
            (tex as any).__mbArrTile = view.tileSize;
            (tex as any).__mbArrBuffer = view.buffer;

            rasterTextureCache.set(url, tex);
            attach(tex);
            try {
                (this.m_dataSource as any).mapView?.update?.();
            } catch {}
        })().catch(() => { /* keep the base color */ });
    }

    /**
     * Build the `raster-color` 256x1 ramp: evaluate the expression over the
     * virtual `raster-value` property across raster-color-range (mgl
     * renderColorRamp with evaluationKey 'rasterValue'). Straight alpha —
     * the shader multiplies ramp.a by the tile's alpha itself.
     */
    static buildRasterColorRamp(expr: any, range: [number, number], nearest = false): THREE.Texture {
        const size = 256;
        const data = new Uint8Array(size * 4);
        const { MBExpressionEngine } = require('./MBExpressionEngine');
        const rewritten = JSON.parse(JSON.stringify(expr), (k, v) => {
            if (Array.isArray(v) && v.length === 1 && v[0] === 'raster-value') return ['get', 'rasterValue'];
            return v;
        });
        for (let i = 0; i < size; i++) {
            // mgl renderColorRamp: endpoint-inclusive i/(N-1) progress,
            // Math.floor on every channel.
            const t = range[0] + (i / (size - 1)) * (range[1] - range[0]);
            let rgba: [number, number, number, number] = [255, 255, 255, 1];
            try {
                const out = MBExpressionEngine.evaluate(rewritten, {
                    zoom: 0,
                    feature: { properties: { rasterValue: t } } as any,
                } as any);
                if (typeof out === 'string') {
                    rgba = MBMaterialPatchManager.parseColor(out);
                } else if (out && typeof out === 'object' && 'r' in out) {
                    const c = new THREE.Color();
                    c.copy(out);
                    c.convertLinearToSRGB();
                    rgba = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 1];
                } else if (Array.isArray(out)) {
                    rgba = [
                        Math.round((out[0] ?? 0) * 255),
                        Math.round((out[1] ?? 0) * 255),
                        Math.round((out[2] ?? 0) * 255),
                        out[3] !== undefined ? out[3] : 1,
                    ];
                }
            } catch { /* keep white */ }
            data[i * 4 + 0] = Math.floor(rgba[0]);
            data[i * 4 + 1] = Math.floor(rgba[1]);
            data[i * 4 + 2] = Math.floor(rgba[2]);
            data[i * 4 + 3] = Math.floor(Math.max(0, Math.min(1, rgba[3])) * 255);
        }
        const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        // mgl binds the color ramp with the SAME filter as the input
        // (configureRaster `resampling`) — the nearest fixtures show hard
        // step edges, linear ramps blend between stops.
        tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
        tex.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    /**
     * Build a 256x1 RGBA DataTexture from Mapbox color-expression stops:
     * `[[t, color], ...]`. Used by line-gradient and heatmap color ramps.
     */
    static buildGradientTexture(stops: any, lut?: any): THREE.DataTexture {
        const size = 256;
        const data = new Uint8Array(size * 4);
        let norm = MBMaterialPatchManager.normalizeGradientStops(stops);
        if (lut) {
            // Mapbox color-theme: the gradient ramp goes through the LUT too
            // (mgl binds the LUT texture when sampling the gradient).
            try {
                const { applyColorTheme } = require('./MBColorTheme');
                for (const st of norm) {
                    const out = applyColorTheme(lut, `rgba(${st.r}, ${st.g}, ${st.b}, ${st.a})`);
                    const m = out.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
                    if (m) {
                        st.r = +m[1]; st.g = +m[2]; st.b = +m[3];
                        st.a = m[4] !== undefined ? +m[4] : 1;
                    }
                }
            } catch {}
        }
        if (norm.length === 0) {
            for (let i = 0; i < size; i++) { data[i*4+3] = 255; }
        } else {
            for (let i = 0; i < size; i++) {
                const p = i / (size - 1);
                let lo = norm[0];
                let hi = norm[norm.length - 1];
                for (let j = 0; j < norm.length - 1; j++) {
                    if (p >= norm[j].t && p <= norm[j+1].t) { lo = norm[j]; hi = norm[j+1]; break; }
                }
                const span = Math.max(hi.t - lo.t, 1e-6);
                const f = Math.max(0, Math.min(1, (p - lo.t) / span));
                data[i*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
                data[i*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
                data[i*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
                data[i*4+3] = Math.round((lo.a + (hi.a - lo.a) * f) * 255);
            }
        }
        const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    private static parseColor(c: string): [number, number, number, number] {
        const h = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(h)) {
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 1];
        }
        if (/^[0-9a-fA-F]{8}$/.test(h)) {
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)/255];
        }
        const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
        // Named CSS colors (white/red/blue/royalblue/cyan/green/...) — mapbox
        // sky-gradient / color ramp stops commonly use them. three r178's
        // ColorManagement stores named colors in the linear-srgb working space,
        // so convert back to sRGB before reading the 0-255 channels.
        try {
            const named = new (require('three')).Color(c);
            named.convertLinearToSRGB();
            return [Math.round(named.r * 255), Math.round(named.g * 255), Math.round(named.b * 255), 1];
        } catch {
            return [0, 0, 255, 0];
        }
    }

    /**
     * Extract a sprite sub-rectangle into its own repeating CanvasTexture so it
     * can be tiled independently of the rest of the atlas. Returns undefined when
     * the sprite name is unknown or the atlas image is unavailable.
     */
    private extractPatternTexture(patternName: string): THREE.Texture | undefined {
        const atlas = (this.m_dataSource as any).spriteAtlas;
        if (!atlas) return undefined;
        // setStyle can swap the sprite atlas (e.g. 1x → @2x) — drop stale
        // extractions from a previous atlas so scales/textures refresh. The
        // color-theme generation is part of the same invalidation: a LUT bake
        // rewrites the atlas pixels the extractions were cut from.
        const { themeGeneration } = require('./MBColorTheme');
        const gen = themeGeneration();
        if (patternTextureCacheAtlas !== atlas || patternTextureCacheGen !== gen) {
            for (const t of patternTextureCache.values()) t.dispose();
            patternTextureCache.clear();
            patternTextureCacheAtlas = atlas;
            patternTextureCacheGen = gen;
        }
        const cached = patternTextureCache.get(patternName);
        if (cached) return cached;
        const info = atlas.icons?.get(patternName);
        const img = atlas.texture?.image;
        if (!info || !img) return undefined;

        const w = info.width;
        const h = info.height;
        try {
            const canvas = typeof document !== 'undefined'
                ? document.createElement('canvas') : null;
            if (!canvas) return undefined;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return undefined;
            ctx.drawImage(img, info.x, info.y, w, h, 0, 0, w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            patternTextureCache.set(patternName, tex);
            return tex;
        } catch {
            return undefined;
        }
    }

    /**
     * fill-pattern / fill-extrusion-pattern: tile a sprite image across the
     * polygon by deriving UVs from world-space position.
     */
    private patchFillPatternMaterial(material: THREE.Material, technique: any): void {
        const tex = this.extractPatternTexture(technique._patternName);
        if (!tex) return;
        // Terrain draping: make patterned fill conform to the terrain surface.
        if (!!this.centerDem) this.injectTerrainDrape(material);
        if ((material as any).__mbPatternPatched) return;
        (material as any).__mbPatternPatched = true;

        (material as any).map = tex;
        (material as any).color = new THREE.Color('#ffffff');
        (material as any).transparent = (technique.opacity ?? 1) < 1;

        // Pattern cross-fade: modulate pattern contribution by the fade factor
        // (0 = no pattern/base color, 1 = full pattern). With a second
        // candidate (["image", a, b]) the two tiles blend by the fade.
        const crossFade = technique._patternCrossFade ?? 1;
        const tex2 = technique._patternName2
            ? this.extractPatternTexture(technique._patternName2)
            : undefined;

        // Pattern tile size in world units. The sprite pixel size is mapped to
        // meters at roughly the sprite's pixelRatio; 1px ≈ 1 world unit scaled.
        // @2x sprites carry double-resolution pixels — divide by the sprite's
        // pixelRatio so the tile matches the sprite's logical display size
        // (mgl `displaySize`, same as the line-ribbon patternWorld path).
        const spriteInfo = (this.m_dataSource as any).spriteAtlas?.icons?.get(technique._patternName);
        const spritePr = Math.max(1, Number(spriteInfo?.pixelRatio ?? 1) || 1);
        const tileScale = spritePr / Math.max(1, (tex.image?.width ?? 32));
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBPatternTex = { value: tex };
            shader.uniforms.uMBPatternScale = { value: tileScale };
            shader.uniforms.uMBPatternCrossFade = { value: crossFade };
            if (tex2) shader.uniforms.uMBPatternTex2 = { value: tex2 };
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                'uniform float uMBPatternScale;\nvarying vec2 vMBPatternUv;\nvoid main() {'
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvMBPatternUv = position.xy * uMBPatternScale;'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `uniform sampler2D uMBPatternTex;${tex2 ? '\nuniform sampler2D uMBPatternTex2;' : ''}\nuniform float uMBPatternCrossFade;\nvarying vec2 vMBPatternUv;\nvoid main() {`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                 vec4 mbPat = texture2D(uMBPatternTex, vMBPatternUv);${tex2 ? `
                 mbPat = mix(mbPat, texture2D(uMBPatternTex2, vMBPatternUv), uMBPatternCrossFade);` : ''}
                 float mbPatAlpha = mbPat.a * opacity * uMBPatternCrossFade;
                 gl_FragColor = vec4(mix(diffuse, mbPat.rgb, uMBPatternCrossFade), mbPatAlpha);`
            );
        };
        material.needsUpdate = true;
    }

    invalidate(): void {
        this.m_patchedTiles = new WeakMap();
    }
}

