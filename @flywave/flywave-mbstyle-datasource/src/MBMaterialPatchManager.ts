import * as THREE from 'three';
import { MBStyleDataSource } from './MBStyleDataSource';
import { createGuardrailMesh } from './ElevatedStructures';

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

export class MBMaterialPatchManager {
    private m_patchedTiles = new WeakMap<object, MaterialPatchState>();
    /** Ground-radiance signature of the last patched lighting state. */
    private m_lastLightSig = '';
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
            // grow asynchronously: background quad first, decoded points later).
            if (state !== undefined && state.objectCount === tile.objects.length) continue;

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

            this.patchMaterial(material, tech);
            this.applyIconTextFit(obj, tech);
            this.patchIconObject(obj, tech);
            this.generateGuardrails(obj, tech, tile);
        }
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
            shader.uniforms.uMBGroundRad = { value: rad };
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
                     vec3 mbLit = gl_FragColor.rgb * pow(mbK, vec3(1.0 / 2.2));
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
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `uniform sampler2D uMBDrapeDem;\nuniform vec2 uMBDrapeOrigin;\nuniform float uMBDrapeSize;\nvoid main() {`
            );
            // Sample DEM at the vertex's world position and offset Z so the
            // geometry follows the terrain surface.
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `{
                     vec2 mbWP = (modelMatrix * vec4(transformed, 1.0)).xy;
                     vec2 mbDU = (mbWP - uMBDrapeOrigin) / uMBDrapeSize;
                     mbDU = clamp(mbDU, vec2(0.0), vec2(1.0));
                     transformed.z += texture2D(uMBDrapeDem, mbDU).r;
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
            // Pack (originX, originY, size) per tile into a vec3 array uniform.
            const tileData = new Array<number>(N * 3);
            for (let i = 0; i < N; i++) {
                tileData[i * 3 + 0] = tiles[i].originX;
                tileData[i * 3 + 1] = tiles[i].originY;
                tileData[i * 3 + 2] = tiles[i].size;
            }
            shader.uniforms.uMBDrapeTiles = { value: tileData };

            // Build sampler / uniform declarations.
            let decl = `uniform int uMBDrapeTileCount;\nuniform vec3 uMBDrapeTiles[${N}];\n`;
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
                     transformed.z += mbElev;
                 }\n#include <project_vertex>`
            );
        };
        material.needsUpdate = true;
    }

    private patchMaterial(material: THREE.Material, technique: any): void {
        if ((material as any).__mbPatched) return;
        (material as any).__mbPatched = true;

        const techName = technique.name;
        const paint = technique._paint ?? {};
        const layout = technique._layout ?? {};

        // Mapbox 3D `lights` API (lighting-3d-mode): 2D ground layers are lit as
        // `color * u_ground_radiance` (mix toward `color` by emissive-strength).
        // Applied first so per-layer patches below can still wrap the shader.
        if (techName === 'fill' || techName === 'solid-line' || techName === 'circles') {
            this.injectGroundLighting(material, technique, techName);
        }
        switch (techName) {
            case 'fill':
                if (technique._isHillshade) {
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
                    this.patchExtrusionMaterial(material, paint, technique);
                }
                break;
        }
    }

    private patchRasterMaterial(material: THREE.Material, technique: any): void {
        const url = technique._rasterTileUrl as string;
        if (!url) return;

        // Terrain draping: make the raster tile conform to the terrain surface.
        if (!!this.centerDem) this.injectTerrainDrape(material);

        const opacity = technique.opacity ?? 1;
        if ('opacity' in material) {
            (material as any).opacity = opacity;
            (material as any).transparent = opacity < 1;
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
        const colorVal = paint['raster-color'];        // [r,g,b] mix factor
        const hasAdjust =
            brightness[0] !== 0 || brightness[1] !== 1 ||
            contrast !== undefined || saturation !== undefined ||
            hue !== undefined || colorVal !== undefined;

        const resampling = paint['raster-resampling'] ?? paint['raster-filtering'] ?? 'linear';
        const filterType = resampling === 'nearest'
            ? THREE.NearestFilter : THREE.LinearFilter;
        // visibility:'none' → raster should not render.
        if (technique._layout?.visibility === 'none') {
            (material as any).visible = false;
            return;
        }

        const applyAdjust = () => {
            if (!hasAdjust) return;
            if ((material as any).__mbRasterAdj) return;
            (material as any).__mbRasterAdj = true;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBRasBMin = { value: brightness[0] };
                shader.uniforms.uMBRasBMax = { value: brightness[1] };
                shader.uniforms.uMBRasContrast = { value: contrast ?? 0 };
                shader.uniforms.uMBRasSat = { value: saturation ?? 0 };
                shader.uniforms.uMBRasHue = { value: (hue ?? 0) * Math.PI / 180 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform float uMBRasBMin; uniform float uMBRasBMax;
                     uniform float uMBRasContrast; uniform float uMBRasSat; uniform float uMBRasHue;
                     void main() {`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     vec3 mbR = diffuse;
                     mbR = clamp((mbR - uMBRasBMin) / max(uMBRasBMax - uMBRasBMin, 0.001), 0.0, 1.0);
                     mbR = (mbR - 0.5) * (1.0 + uMBRasContrast) + 0.5;
                     float mbL = dot(mbR, vec3(0.299, 0.587, 0.114));
                     mbR = mix(vec3(mbL), mbR, 1.0 + uMBRasSat);
                     float mbCa = cos(uMBRasHue); float mbSa = sin(uMBRasHue);
                     mat3 mbHue = mat3(
                         vec3(mbCa + 0.299*(1.0-mbCa), 0.587*(1.0-mbCa) - 0.327*mbSa, 0.114*(1.0-mbCa) + 0.921*mbSa),
                         vec3(0.299*(1.0-mbCa) - 0.714*mbSa, mbCa + 0.587*(1.0-mbCa), 0.114*(1.0-mbCa) + 0.530*mbSa),
                         vec3(0.299*(1.0-mbCa) + 0.165*mbSa, 0.587*(1.0-mbCa) - 0.330*mbSa, mbCa + 0.114*(1.0-mbCa)));
                     mbR = clamp(mbHue * mbR, 0.0, 1.0);
                     gl_FragColor = vec4(mbR, opacity);`
                );
            };
            material.needsUpdate = true;
        };

        const attach = (texture: THREE.Texture) => {
            texture.minFilter = filterType;
            texture.magFilter = filterType;
            texture.needsUpdate = true;
            (material as any).map = texture;
            (material as any).color = new THREE.Color(0xffffff);
            applyAdjust();
            material.needsUpdate = true;
        };

        const cached = rasterTextureCache.get(url);
        if (cached) {
            attach(cached);
            return;
        }

        rasterTextureLoader.load(url, (texture) => {
            texture.minFilter = filterType;
            texture.magFilter = filterType;
            rasterTextureCache.set(url, texture);
            attach(texture);
            // Async texture arrival must trigger a new frame — the render-test
            // model is a static frame sequence, so without an update the just-
            // attached texture is never drawn.
            try {
                (this.m_dataSource as any).mapView?.update?.();
            } catch {}
        }, undefined, () => {});
    }

    private patchFillMaterial(material: THREE.Material, paint: any, technique?: any): void {
        // Pre-extruded line ribbons: per-color meshes are coplanar; disable
        // depth testing so the drawn (feature) order decides which color wins
        // at crossings (mapbox painter's algorithm for one line layer).
        if (technique?._isLineRibbon) {
            (material as any).depthTest = false;
            (material as any).depthWrite = false;
        }
        const translate = this.resolveTranslate(paint['fill-translate'], paint['fill-translate-anchor']);
        const outlineColor = paint['fill-outline-color'];
        const hasTerrain = !!this.centerDem;
        const hdElevation = technique?._hdElevation;
        const emissiveStrength = Number(paint['fill-emissive-strength'] ?? 0);

        if ((!translate || (translate[0] === 0 && translate[1] === 0)) && !outlineColor && !hasTerrain && hdElevation === undefined && emissiveStrength <= 0) return;

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

            if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
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

            if (outlineColor) {
                shader.uniforms.uMBOutlineColor = { value: new THREE.Color(outlineColor) };
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
        material.needsUpdate = true;
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
                (material as any).outlineColor = new THREE.Color(borderColor);
            }
            modified = true;
        }

        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
        const hasGradient = Array.isArray(gradientStops) && gradientStops.length > 1;
        const hasEmissive = typeof emissiveStrength === 'number' && emissiveStrength > 0;
        const patternTex = patternName ? this.extractPatternTexture(patternName) : undefined;
        // line-occlusion-opacity: fade lines behind terrain (same as circles).
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
                    const tex = MBMaterialPatchManager.buildGradientTexture(gradStops);
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
                    const pscale = 1 / Math.max(1, (patternTex.image?.width ?? 32));
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

        if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
            const tx = translate[0];
            const ty = translate[1];
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
    }

    private patchExtrusionMaterial(material: THREE.Material, paint: any, technique: any): void {
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
        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
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
        const centerDem = (this.m_dataSource as any).m_environment?.terrainController?.centerDem;
        const terrainExag = (this.m_dataSource as any).m_environment?.terrainController ? 1 : 0;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

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
                const terrainSample = centerDem
                    ? `vec2 mbWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
                       vec2 mbDemUv = (mbWorldPos - uMBExtrusionDemOrigin) / uMBExtrusionDemSize;
                       float mbTerrainElev = texture2D(uMBExtrusionDem, vec2(clamp(mbDemUv.x,0.0,1.0), clamp(mbDemUv.y,0.0,1.0))).r * uMBExtrusionExag;`
                    : 'float mbTerrainElev = 0.0;';
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `${terrainSample}
                     float mbH = position.z + mbTerrainElev;
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
                     uniform float uMBLightIntensity; uniform mat3 uMBViewToWorld;
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
                     }`
                );
            }

            // fill-extrusion-line-width: edge outline effect via normal derivatives.
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
            shader.uniforms.uMBRoofColor = { value: new THREE.Color(roofColor) };
            shader.uniforms.uMBFacadeFloors = { value: facadeFloors };
            shader.uniforms.uMBFacadeWidth = { value: facadeWidth };
            shader.uniforms.uMBAO = { value: aoIntensity };
            shader.uniforms.uMBFloodColor = { value: new THREE.Color(floodColor) };
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
                    shader.uniforms.uMBIconColor = { value: new THREE.Color(iconColor) };
                    shader.uniforms.uMBHaloColor = { value: new THREE.Color(haloColor) };
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
        const ramp = MBMaterialPatchManager.buildGradientTexture(colorStops);
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

    /**
     * Build a 256x1 RGBA DataTexture from Mapbox color-expression stops:
     * `[[t, color], ...]`. Used by line-gradient and heatmap color ramps.
     */
    static buildGradientTexture(stops: any): THREE.DataTexture {
        const size = 256;
        const data = new Uint8Array(size * 4);
        const norm = MBMaterialPatchManager.normalizeGradientStops(stops);
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
        // sky-gradient / color ramp stops commonly use them.
        try {
            const named = new (require('three').Color)(c);
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
        // (0 = no pattern/base color, 1 = full pattern).
        const crossFade = technique._patternCrossFade ?? 1;

        // Pattern tile size in world units. The sprite pixel size is mapped to
        // meters at roughly the sprite's pixelRatio; 1px ≈ 1 world unit scaled.
        const tileScale = 1 / Math.max(1, (tex.image?.width ?? 32));
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBPatternTex = { value: tex };
            shader.uniforms.uMBPatternScale = { value: tileScale };
            shader.uniforms.uMBPatternCrossFade = { value: crossFade };
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
                'uniform sampler2D uMBPatternTex;\nuniform float uMBPatternCrossFade;\nvarying vec2 vMBPatternUv;\nvoid main() {'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                 vec4 mbPat = texture2D(uMBPatternTex, vMBPatternUv);
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

