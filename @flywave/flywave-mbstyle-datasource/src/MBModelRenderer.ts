/**
 * Per-feature GLTF model instantiation channel (mgl `model` layer parity).
 *
 * mgl semantic (style-spec v8 + model_style_layer): a model layer over a
 * vector source places one GLTF instance per feature point. The model asset
 * is resolved through the root-level `style.models` registry
 * (`id → uri`), keyed by the layer's evaluated `model-id` (layout
 * expression, per-feature capable). The transform comes from the paint
 * properties `model-rotation` (degrees [x,y,z]), `model-scale` and
 * `model-translation` (meters), opacity from `model-opacity`.
 *
 * The engine tile pipeline has no 'model' technique consumer, so
 * MBTileDataEmitter records per-feature placements on
 * `DecodedTile.modelInstances` (absolute world coordinates, same space as
 * the heatmap kernels / text geometries) and this renderer instantiates the
 * cached GLTF scenes directly into the mapview scene — mirroring the
 * MBHeatmapRenderer tile-cache pattern (the decodedTile is transient, it is
 * cleared once geometry loading finishes).
 *
 * Color themes are baked CPU-side into the instance materials via the
 * datasource's `applyThemeToModel` (mgl themes models over the whole glTF,
 * `model-color-use-theme: none` opts out) — see MBStyleDataSource.
 */

import * as THREE from 'three';
import { Tile } from '@flywave/flywave-mapview';
import { shadowCasters } from './MBShadowRenderer';

interface ModelPlacement {
    x: number;
    y: number;
    z: number;
    technique: any;
    properties: Record<string, any>;
}

type GLTFLoaderType = any;

/**
 * §520: mgl shades model materials with LIGHTING_3D_MODE apply_lighting
 * (model.fragment.glsl getDiffuseShadedColor → _prelude_lighting): the
 * three-lit result is REPLACED by
 *
 *   dir_factor = saturate(dot(N, u_lighting_directional_dir))  (no shadow
 *   map on our side; the shadowed variant needs the depth prepass)
 *   k = u_lighting_ambient_color * vertical*ambientDirFactor(N)
 *       + u_lighting_directional_color * dir_factor
 *   out = albedo_linear * k   (= mapbox linearProduct through the output
 *   sRGB conversion), mixed back toward raw albedo by emissive strength.
 *
 * Without style lights the material stays untouched (mgl !LIGHTING_3D_MODE
 * renders raw albedo). Exports for both instantiation paths (per-feature
 * MBModelRenderer and the source-registry loadModels in MBStyleDataSource).
 */
/** mgl `model-height-based-emissive-strength-multiplier` paint value. */
export interface MBHeightBasedEmission {
    /** Ramp start/finish heights, in the mesh's local z units (meters). */
    start: number;
    finish: number;
    /** Multiplier value at start/finish (each clamped 0..1 in mgl). */
    startValue: number;
    finishValue: number;
    /** Interpolation power exponent (mgl: pow factor = 10^clamp(exp,-1,1)). */
    exponent: number;
}

/**
 * Encode the height ramp into the vertex-shader constants mgl packs into the
 * a_pbr attributes (tiled_3d_model_bucket computePartPbrTable):
 *   t = z*b0 + b1, multiplier = startQ + rangeQ * pow(clamp(t,0,1), power)
 * The /256 quantization replicates mgl's byte packing (a3 unpack). When the
 * ramp degenerates (start===finish) mgl falls back to the constant 0xffff
 * branch — multiplier 255/256, no z dependence.
 */
export function mbHeightRampUniforms(
    ramp: MBHeightBasedEmission | undefined,
    zMin: number,
    zMax: number,
): { b0: number; b1: number; power: number; start: number; range: number } {
    const zRange = zMax - zMin;
    if (ramp && ramp.start !== ramp.finish && zRange > 0) {
        const denom = zRange * (ramp.finish - ramp.start);
        const startQ = Math.floor(Math.min(Math.max(ramp.startValue, 0), 1) * 255) / 256;
        const finishQ = Math.floor(Math.min(Math.max(ramp.finishValue, 0), 1) * 255) / 256;
        return {
            b0: 1 / denom,
            b1: -(zMin + zRange * ramp.start) / denom,
            power: Math.pow(10, Math.min(Math.max(ramp.exponent, -1), 1)),
            start: startQ,
            range: finishQ - startQ,
        };
    }
    // mgl a3=0xffff / b0=0 / b1=1 / b2=1 constant branch.
    return { b0: 0, b1: 1, power: 1, start: 255 / 256, range: 0 };
}

/** §649: the model-shader light direction. §691 A/B verdict (quantization
 * 101万→4633 −99.5% with PBR branch): models use mgl-EXACT un-mirrored
 * sphericalDirectionToCartesian (az+90 convention); the model geometry's
 * normals are NOT y-mirrored relative to mgl (GLB y-flip + tile placement
 * convention make them mgl-raw). The y-mirrored `ls.dir` (§683) is for
 * EXTRUSION walls (different normal frame), not models. The `modeldiralt=1`
 * karma arg retains the old y-mirrored form for per-fixture calibration. */
export function modelLightDir(dataSource: any): [number, number, number] {
    const ls = dataSource?.m_environment?.lighting3DState;
    if (!ls) return [0, 0, 1];
    // mgl-raw (un-mirrored) is the default for models — §691 A/B measured
    // −97.5% on quantization/high-zoom vs the y-mirrored ls.dir.
    const dirProp = dataSource?.m_environment?.m_3DDirectional?.direction;
    const az = ((dirProp?.[0] ?? 210) + 90) * Math.PI / 180;
    const pl = (dirProp?.[1] ?? 30) * Math.PI / 180;
    if ((globalThis as any).__mbModelDirAlt) {
        return ls.dir;  // old y-mirrored §683 convention (reverted via arg)
    }
    return [
        Math.cos(az) * Math.sin(pl),
        Math.sin(az) * Math.sin(pl),
        Math.cos(pl),
    ];
}

/**
 * Refresh the captured 3D-lighting uniforms of every mgl-lit material under
 * `model` from the CURRENT lighting3DState (mgl re-uploads u_lighting_*
 * every draw; a runtime render-test `setLights` op must take effect without
 * a material recompile).
 */
export function syncMglModelLighting(model: THREE.Object3D, dataSource: any): void {
    const ls = dataSource?.m_environment?.lighting3DState;
    if (!ls) return;
    const dir = modelLightDir(dataSource);
    model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats as any[]) {
            const u = mat?.userData?.__mbLightU;
            if (!u) continue;
            u.amb.value = ls.ambientColorLinear;
            u.dirColor.value = ls.directionalColorLinear;
            u.dir.value = dir;
        }
    });
}

// §562: per-frame shadow-uniform refresh targets (MBModelRenderer.run /
// MBStyleDataSource AfterRender) — mgl re-uploads shadow uniforms every draw.
const mbShadowLitUniforms = new Set<any>();

export function syncModelShadowUniforms(shadowState: {
    map: any; matrix: any; intensity: number;
} | null): void {
    for (const u of mbShadowLitUniforms) {
        u.map.value = shadowState?.map ?? null;
        if (shadowState) u.matrix.value.copy(shadowState.matrix);
        u.intensity.value = shadowState?.intensity ?? 0;
    }
}

/**
 * §727: GPU color-theme LUT for the model tail (mgl APPLY_LUT_ON_GPU,
 * draw_model.ts:172-178 — pushed for every model draw when the style has a
 * `color-theme`). mgl samples a sampler3D; here the SAME N×N² image the CPU
 * path (MBColorTheme.applyColorTheme, index = r + g·N² + b·N) uses is kept
 * as a 2D DataTexture and the trilinear is done with 8 nearest taps —
 * bit-equivalent to the CPU lookup, no GLSL3/sampler3D requirement.
 * Inert (uMBLutOn=0) for styles without a theme.
 */
function mbLutGpuTexture(lut: any): THREE.DataTexture | null {
    if (!lut?.data || !lut?.n) return null;
    if (lut.__mbGpuTex) return lut.__mbGpuTex;
    const N: number = lut.n;
    const bytes = new Uint8Array(lut.data.buffer ?? lut.data,
        lut.data.byteOffset ?? 0, lut.data.byteLength ?? lut.data.length);
    const tex = new THREE.DataTexture(bytes, N * N, N, THREE.RGBAFormat);
    // Nearest: the 8-tap trilinear below interpolates manually — hardware
    // linear would bleed across the g-slice boundary (x = r + g·N).
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    lut.__mbGpuTex = tex;
    return tex;
}

export function applyMglModelLighting(
    dataSource: any,
    model: THREE.Object3D,
    emissiveStrength: number,
    tint?: { color: number[]; mix: number },
    heightRamp?: { b0: number; b1: number; power: number; start: number; range: number },
    // mgl u_emissive_strength (the final unlit mix factor): 0 for
    // mesh-features tiles (draw_model.ts: hasMapboxFeatures ? 0 : rmea.z),
    // defaults to emissiveStrength for classic model layers.
    unlitMix?: number,
    // §706: mgl picks the shading model PER TILE (draw_model.ts:1459):
    // Cook-Torrance PBR only for MAPBOX_mesh_features tiles; everything
    // else (classic GLBs — conflation/landmark dupes/z-offset tiles) is
    // DIFFUSE_SHADED (the hemisphere-style apply_lighting formula).
    // globalThis.__mbModelLightPort (modellightport=0/1) overrides for A/B.
    pbrEligible?: boolean,
    // §734: mgl drawMesh:241/255 — model-color-use-theme:'none' passes NULL
    // as the layer LUT, so the whole layer (textures included) is unthemed.
    lutOff?: boolean,
    // §739: model-receive-shadows (default true) — false layers never sample
    // the shadow map (mgl draw_model:557-560 shadowRenderer.enabled=false).
    receiveShadows?: boolean,
): void {
    const ls = dataSource?.m_environment?.lighting3DState;
    model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // §521: model-color tint is PER FEATURE — clone the (shared prototype)
        // materials so each instance can carry its own uniforms.
        if (tint && tint.mix > 0) {
            mats = mats.map((m: any) => m?.clone?.() ?? m);
            mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
        }
        for (const mat of mats as any[]) {
            if (!mat || mat.__mbMglLit) continue;
            // §655: patch unconditionally — the ported model.fragment.glsl
            // handles both the 3D-lights and the legacy-light paths (styles
            // without lights rendered native black: no scene lights).
            mat.__mbMglLit = true;
            if ((globalThis as any).__mbDecodeDbg
                && ((globalThis as any).__mbLitCnt = ((globalThis as any).__mbLitCnt ?? 0) + 1) <= 6) {
                // eslint-disable-next-line no-console
                console.log(`[MBLight] patch mat=${mat.name ?? '?'} type=${mat.type} metal=${mat.metalness} has3D=${ls ? 1 : 0}`);
            }
            const origOnCompile = mat.onBeforeCompile;
            mat.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(mat, shader);
                const hr = heightRamp ?? { b0: 0, b1: 1, power: 1, start: 1, range: 0 };
                const ls2 = dataSource?.m_environment?.lighting3DState;
                shader.uniforms.uMB3DAmb = { value: ls2 ? ls2.ambientColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDirColor = { value: ls2 ? ls2.directionalColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDir = { value: modelLightDir(dataSource) };
                shader.uniforms.uMB3DEmissive = { value: emissiveStrength ?? 0 };
                // §744: unlit-clamp A/B gate (`modelclamp=1`) — §724.4 removed
                // mgl-unlawful clamp(0,1) on the unlit mix; the emission
                // -strength family regression candidates this restore as a
                // single-variable A/B.
                const unlitRaw = unlitMix ?? emissiveStrength ?? 0;
                shader.uniforms.uMB3DUnlit = {
                    value: (globalThis as any).__mbModelUnlitClamp
                        ? Math.min(1, Math.max(0, unlitRaw))
                        : unlitRaw,
                };
                // §655: per-material PBR factors (model.fragment.glsl
                // u_metallicFactor / u_roughnessFactor).
                shader.uniforms.uMB3DMetal = { value: mat.metalness ?? 0 };
                shader.uniforms.uMB3DRough = { value: mat.roughness ?? 0.5 };
                // §706: mgl shading-model rule — PBR only for mesh-features
                // parts (pbrEligible, set by the MBMeshFeatures call sites);
                // classic GLBs stay DIFFUSE_SHADED (§705: forcing PBR on
                // conflation GLBs regressed +26%). modellightport=0/1
                // overrides the rule for A/B diagnosis.
                const portForced = (globalThis as any).__mbModelLightPort;
                shader.uniforms.uMBPortMode = {
                    value: portForced !== undefined
                        ? (portForced ? 1 : 0)
                        : (pbrEligible ? 1 : 0),
                };
                // §724: hemisphere-branch gamma A/B gate (modellightgamma=1
                // → mgl linearProduct exponent in the DIFFUSE_SHADED branch).
                shader.uniforms.uMBModelGamma = {
                    value: (globalThis as any).__mbModelLightGamma ? 1 : 0,
                };
                // §727: color-theme GPU LUT (mgl APPLY_LUT_ON_GPU). §734:
                // use-theme:'none' excludes the whole layer (drawMesh:255).
                const mbLut = (dataSource as any)?.m_colorThemeLut ?? null;
                shader.uniforms.uMBLut = { value: lutOff ? null : mbLutGpuTexture(mbLut) };
                shader.uniforms.uMBLutN = { value: lutOff ? 0 : (mbLut?.n ?? 0) };
                shader.uniforms.uMBLutOn = { value: mbLut && !lutOff ? 1 : 0 };
                // §661: legacy light defaults — mgl model_program.ts reads the
                // root style light (spec defaults: position [1.15, 210, 30]
                // spherical, intensity 0.5, white, anchor viewport), converts
                // spherical→cartesian and uploads lightPos = [-x, -y, z]. The
                // environment's modelLegacyLight carries that vector in our
                // render frame (y mirrored, §643).
                {
                    const mll = (dataSource?.m_environment as any)?.modelLegacyLight;
                    shader.uniforms.uMB3DLegacyPos = {
                        value: mll
                            ? mll.dir.clone()
                            : new THREE.Vector3(-0.2875, -0.4980, 0.9959).normalize(),
                    };
                    shader.uniforms.uMB3DLegacyColor = {
                        value: mll?.color ?? [1, 1, 1],
                    };
                    shader.uniforms.uMB3DLegacyInt = {
                        value: mll?.intensity ?? 0.5,
                    };
                }
                shader.uniforms.uMBHas3DLights = {
                    value: ls2 ? 1 : 0,
                };
                shader.uniforms.uMB3DTint = { value: tint?.color ?? [0, 0, 0] };
                shader.uniforms.uMB3DTintA = { value: tint?.mix ?? 0 };
                shader.uniforms.uMBHbs = { value: [hr.b0, hr.b1, hr.power, hr.start] };
                shader.uniforms.uMBHbsRange = { value: hr.range };
                // §562: model self/ground-shadow reception (mgl
                // shadowed_light_factor_normal replaces NdotL in the direct
                // term). Intensity 0 keeps non-shadow styles untouched.
                // §739: model-receive-shadows:false layers (draw_model:557-560
                // shadowRenderer.enabled=false) must NOT register the refresh
                // handle — uMBShIntensity stays 0 and the tail never samples.
                shader.uniforms.uMBShMap = { value: null as any };
                shader.uniforms.uMBShMatrix = { value: new THREE.Matrix4() };
                shader.uniforms.uMBShIntensity = { value: 0 };
                if (receiveShadows !== false) {
                    mbShadowLitUniforms.add(mat.userData.__mbShU = {
                        map: shader.uniforms.uMBShMap,
                        matrix: shader.uniforms.uMBShMatrix,
                        intensity: shader.uniforms.uMBShIntensity,
                    });
                }
                // Runtime `setLights`: keep the uniform OBJECTS so a per-frame
                // sync can refresh their values without a recompile (mirrors
                // mgl re-uploading u_lighting_* every draw).
                mat.userData.__mbLightU = {
                    amb: shader.uniforms.uMB3DAmb,
                    dirColor: shader.uniforms.uMB3DDirColor,
                    dir: shader.uniforms.uMB3DDir,
                    // Indirect part-styling update: per-part emissive strength
                    // and the height-based emission ramp are measure-light /
                    // paint dependent — refreshed in place by
                    // MBMeshFeatures.refreshMeshFeatures.
                    emis: shader.uniforms.uMB3DEmissive,
                    unlit: shader.uniforms.uMB3DUnlit,
                    hbs: shader.uniforms.uMBHbs,
                    hbsRange: shader.uniforms.uMBHbsRange,
                };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir;
                     uniform float uMB3DEmissive;
                     uniform float uMB3DUnlit;
                     uniform vec3 uMB3DTint; uniform float uMB3DTintA;
                     uniform vec4 uMBHbs; uniform float uMBHbsRange;
                     uniform sampler2D uMBShMap;
                     uniform mat4 uMBShMatrix;
                     uniform float uMBShIntensity;
                     uniform float uMB3DMetal; uniform float uMB3DRough;
                     uniform vec3 uMB3DLegacyPos; uniform vec3 uMB3DLegacyColor; uniform float uMB3DLegacyInt;
                     uniform float uMBHas3DLights;
                     uniform float uMBPortMode;
                     uniform float uMBModelGamma;
                     uniform sampler2D uMBLut;
                     uniform float uMBLutN;
                     uniform float uMBLutOn;
                     vec3 mbLutTap(float rI, float gI, float bI) {
                         float n2 = uMBLutN * uMBLutN;
                         return texture2D(uMBLut,
                             vec2((rI + gI * uMBLutN + 0.5) / n2, (bI + 0.5) / uMBLutN)).rgb;
                     }
                     vec3 mbApplyLut(vec3 c) {
                         // 8-tap trilinear over the N×N² image (CPU parity:
                         // MBColorTheme index = r + g·N² + b·N → texel
                         // (r + g·N, b)). mgl APPLY_LUT_ON_GPU.
                         float N = uMBLutN;
                         vec3 t = clamp(c, 0.0, 1.0) * (N - 1.0);
                         float r0 = floor(t.x), g0 = floor(t.y), b0 = floor(t.z);
                         float r1 = min(r0 + 1.0, N - 1.0);
                         float g1 = min(g0 + 1.0, N - 1.0);
                         float b1 = min(b0 + 1.0, N - 1.0);
                         float rw = t.x - r0, gw = t.y - g0, bw = t.z - b0;
                         vec3 c00 = mix(mbLutTap(r0, g0, b0), mbLutTap(r1, g0, b0), rw);
                         vec3 c01 = mix(mbLutTap(r0, g0, b1), mbLutTap(r1, g0, b1), rw);
                         vec3 c10 = mix(mbLutTap(r0, g1, b0), mbLutTap(r1, g1, b0), rw);
                         vec3 c11 = mix(mbLutTap(r0, g1, b1), mbLutTap(r1, g1, b1), rw);
                         return mix(mix(c00, c01, bw), mix(c10, c11, bw), gw);
                     }
                     varying float vMbLocalZ;
                     varying vec3 vMbWorldPos;
                     float mbRoughTex = 1.0;
                     float mbMetalTex = 0.0;
                     vec3 mbAlbedo = vec3(1.0);
                     vec3 mbEmissive = vec3(0.0);
                     // mgl model.fragment.glsl EnvBRDFApprox (Unreal 4).
                     vec3 EnvBRDFApproxMb(vec3 specularColor, float roughness, float NdotV) {
                         vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
                         vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
                         vec4 r = roughness * c0 + c1;
                         float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
                         vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
                         return specularColor * AB.x + AB.y;
                     }
                     void main() {`
                );
                // a_pbr height ramp: mgl evaluates the ramp against the mesh
                // LOCAL z (a_pos_3f.z, grid meters) — pass it through a
                // varying from the un-transformed attribute.
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `varying float vMbLocalZ;
                     varying vec3 vMbWorldPos;
                     void main() {
                         vMbLocalZ = position.z;`
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    '#include <project_vertex>\n' +
                    'vMbWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
                );
                // Capture the glTF albedo AFTER the base-color texture —
                // that is the `albedo` mgl's getBaseColor feeds apply_lighting.
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>
                     mbAlbedo = diffuseColor.rgb;
                     // mgl getBaseColor: mix(albedo, sRGBToLinear(v_color_mix), mix)
                     mbAlbedo = mix(mbAlbedo, uMB3DTint, uMB3DTintA);`
                );
                // §550: batched-model tiles carry the albedo as VERTEX COLOR
                // (the MAPBOX_mesh_features 4444 bake), which three multiplies
                // in at color_fragment — AFTER the capture above. Re-capture
                // there so the lit/emissive paths both see the baked color.
                // Gated on USE_COLOR so vertex-color-less materials (the
                // model-layer GLTFs, calibrated without it) are untouched.
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `#include <color_fragment>
                     #ifdef USE_COLOR
                         mbAlbedo = diffuseColor.rgb;
                     #endif`
                );
                // §647: capture the glTF emissive (emissiveFactor →
                // material.emissive, e.g. the puck's blue body) — the tail
                // below overwrites gl_FragColor and used to discard it,
                // rendering emissive-only materials pitch black under the
                // fixture's deliberately near-black lights.
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <emissivemap_fragment>',
                    `#include <emissivemap_fragment>
                     mbEmissive = totalEmissiveRadiance;`
                );
                // §725 mgl frag:294-298: the metallicRoughness TEXTURE
                // multiplies the factor uniforms — three's
                // roughness/metalness fragments already compute factor×texel
                // into roughnessFactor/metalnessFactor; capture them for the
                // tail (factor-only uniforms would ignore the textures).
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <roughnessmap_fragment>',
                    `#include <roughnessmap_fragment>
                     mbRoughTex = roughnessFactor;`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <metalnessmap_fragment>',
                    `#include <metalnessmap_fragment>
                     mbMetalTex = metalnessFactor;`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     {
                         // §655: faithful port of 3d-style/shaders/model.fragment.glsl
                         // (Cook-Torrance PBR + env 0.65 indirect + emissive +
                         // unlit mix). Replaces the hemisphere approximation.
                         // three's normal_fragment_begin/maps produce the
                         // final view-space normal — flat-shading derivative
                         // or normal-map perturbation (mgl frag:212-271
                         // getNormal equivalent); normalize(vNormal) would
                         // ignore the normal map.
                         vec3 mbN0 = normalize(normal);
                         // mgl transformed_normal: xy flipped (fill-extrusion
                         // normal convention).
                         vec3 mbN = vec3(-mbN0.xy, mbN0.z);
                         vec3 mbV = normalize(vViewPosition);
                         float mbNdotV = clamp(abs(dot(mbN0, mbV)), 0.001, 1.0);
                         // §725: texture-multiplied factors (captured above).
                         float mbR = clamp(mbRoughTex, 0.04, 1.0);
                         float mbAR = mbR * mbR;
                         // §727 mgl APPLY_LUT_ON_GPU sites: getBaseColor:204
                         // LUTs the (texture×factor, post color_mix-mix)
                         // albedo; emissive:524-529 LUTs it sRGB-wrapped,
                         // renormalized by the factor length so a LUT without
                         // pure black doesn't brighten zero-emission models.
                         if (uMBLutOn > 0.5) {
                             mbAlbedo = mbApplyLut(mbAlbedo);
                             if (mbEmissive.r + mbEmissive.g + mbEmissive.b > 0.0) {
                                 float mbEfLen = max(length(mbEmissive), 0.001);
                                 vec3 eSrgb = pow(mbEmissive / mbEfLen, vec3(1.0 / 2.2));
                                 mbEmissive = pow(mbApplyLut(eSrgb), vec3(2.2)) * mbEfLen;
                             }
                         }
                         vec3 mbDiffC = mbAlbedo * (vec3(1.0) - vec3(0.04)) * (1.0 - mbMetalTex);
                         vec3 mbSpecC = mix(vec3(0.04), mbAlbedo, mbMetalTex);
                         // §733: uMB3DDir is WORLD-space — mbV/mbN are VIEW-
                         // space, so the shared F/V/D terms need the light in
                         // view too (the legacy branch recomputes its own with
                         // mbLLeg; the hemisphere branch never uses these).
                         vec3 mbL = normalize((viewMatrix * vec4(uMB3DDir, 0.0)).xyz);
                         vec3 mbH = normalize(mbV + mbL);
                         float mbNdotL = clamp(dot(mbN0, mbL), 0.0, 1.0);
                         float mbNdotH = clamp(dot(mbN0, mbH), 0.0, 1.0);
                         float mbVdotH = clamp(dot(mbV, mbH), 0.0, 1.0);
                         // F_SchlickFast
                         vec3 mbF = mbSpecC + (vec3(1.0) - mbSpecC) * pow(1.0 - mbVdotH, 5.0);
                         // V_GGXFast
                         float mbGXV = mbNdotL * (mbNdotV * (1.0 - mbAR) + mbAR);
                         float mbGXL = mbNdotV * (mbNdotL * (1.0 - mbAR) + mbAR);
                         float mbVis = 0.5 / (mbGXV + mbGXL);
                         // D_GGX
                         float mbA4 = mbAR * mbAR;
                         float mbDen = (mbNdotH * mbA4 - mbNdotH) * mbNdotH + 1.0;
                         float mbD = mbA4 / (3.14159265 * mbDen * mbDen);
                         vec3 mbSpecTerm = mbF * mbVis * mbD;
                         vec3 mbCol;
                         if (uMBPortMode < 0.5 && uMBHas3DLights > 0.5) {
                             // §557 hemisphere approximation (the calibrated
                             // default for 3D-lit styles; shadows replace the
                             // direct NdotL). Styles WITHOUT a lights block
                             // must fall through to the legacy branch — the
                             // hemisphere uniforms default to [1,1,1] there
                             // and washed every unlit style out to albedo×2
                             // (environment-test white rows, light-green
                             // trees); mgl lights those with the legacy
                             // u_lightpos path.
                             vec3 mbDirView = normalize((viewMatrix * vec4(uMB3DDir, 0.0)).xyz);
                             vec3 mbUpView = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
                             float mbNdotL = clamp(dot(mbN0, mbDirView), 0.0, 1.0);
                             if (uMBShIntensity > 0.0) {
                                 vec4 mbShUv = uMBShMatrix * vec4(vMbWorldPos, 1.0);
                                 if (mbShUv.x >= 0.0 && mbShUv.x <= 1.0 &&
                                     mbShUv.y >= 0.0 && mbShUv.y <= 1.0 && mbShUv.z <= 1.0) {
                                     vec4 mbShPk = texture2D(uMBShMap, mbShUv.xy);
                                     float mbShDepth = mbShPk.r + mbShPk.g / 255.0;
                                     mbNdotL *= mbShUv.z <= mbShDepth + 0.002 ? 1.0 : 0.0;
                                 }
                             }
                             float mbDirLum = dot(uMB3DDirColor, vec3(0.2126, 0.7152, 0.0722));
                             float mbAmbDir = mix(1.0 - 0.3 * min(mbDirLum, 1.0), 1.0, min(dot(mbN0, mbDirView) + 1.0, 1.0));
                             float mbVert = mix(0.92, 1.0, dot(mbN0, mbUpView) * 0.5 + 0.5);
                             vec3 mbK = uMB3DAmb * (mbVert * mbAmbDir) + uMB3DDirColor * mbNdotL;
                             // mgl apply_lighting ends in linearProduct: the
                             // sRGB albedo multiplies pow(K, 1/2.2) (_prelude_lighting.glsl:37).
                             // The flat multiply is the §557-era calibration;
                             // modellightgamma=1 A/Bs the exact mgl exponent.
                             vec3 mbLit = uMBModelGamma > 0.5
                                 ? mbAlbedo * pow(mbK, vec3(1.0 / 2.2))
                                 : mbAlbedo * mbK;
                             float mbAo = 1.0;
                             #ifdef USE_AOMAP
                                 mbAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
                                 mbLit *= mbAo;
                             #endif
                             float mbRes = uMB3DEmissive * (uMBHbs.w + uMBHbsRange * pow(clamp(vMbLocalZ * uMBHbs.x + uMBHbs.y, 0.0, 1.0), uMBHbs.z));
                             vec3 mbColor = mix(mbLit, mbAlbedo, min(mbRes, 1.0));
                             vec3 mbUnlit = mbAlbedo * mbAo;
                             gl_FragColor.rgb = mix(mbColor, mbUnlit, uMB3DUnlit) + mbEmissive;
                         } else if (uMBHas3DLights > 0.5) {
                             // §655 port: LIGHTING_3D_MODE — diffuseLambertian
                             // without PI; env_light = u_lighting_ambient_color
                             // × calculate_ambient_directional_factor(normal).
                             // §733: uMB3DDir is WORLD-space (modelLightDir);
                             // mbN is VIEW-space — the raw dot zeroes the whole
                             // direct term for most cameras (duplicate family
                             // rendered at pure-ambient brightness). Convert to
                             // view space like the §557/§661 branches do.
                             vec3 mbDirView = normalize((viewMatrix * vec4(uMB3DDir, 0.0)).xyz);
                             vec3 mbDiffTerm = (1.0 - mbF) * mbDiffC;
                             float mbLF = clamp(dot(mbN, mbDirView), 0.0, 1.0);
                             if (uMBShIntensity > 0.0) {
                                 vec4 mbShUv = uMBShMatrix * vec4(vMbWorldPos, 1.0);
                                 if (mbShUv.x >= 0.0 && mbShUv.x <= 1.0 &&
                                     mbShUv.y >= 0.0 && mbShUv.y <= 1.0 && mbShUv.z <= 1.0) {
                                     vec4 mbShPk = texture2D(uMBShMap, mbShUv.xy);
                                     float mbShDepth = mbShPk.r + mbShPk.g / 255.0;
                                     mbLF *= mbShUv.z <= mbShDepth + 0.002 ? 1.0 : 0.0;
                                 }
                             }
                             vec3 mbDirect = (mbSpecTerm + mbDiffTerm) * mbLF * uMB3DDirColor;
                             float mbNdotLDir = dot(mbN, mbDirView);
                             float mbDirLum = dot(uMB3DDirColor, vec3(0.2126, 0.7152, 0.0722));
                             float mbDirMin = 1.0 - 0.3 * min(mbDirLum, 1.0);
                             float mbADF = mix(mbDirMin, 1.0, min(mbNdotLDir + 1.0, 1.0))
                                 * mix(0.92, 1.0, mbN0.z * 0.5 + 0.5);
                             vec3 mbEnvLight = uMB3DAmb * mbADF;
                             vec3 mbIndirect = EnvBRDFApproxMb(mbSpecC, mbR, mbNdotV) * mbEnvLight
                                 + mbDiffC * mbEnvLight;
                             mbCol = clamp(mbDirect, 0.0, 1.0) + mbIndirect;
                             float mbAo = 1.0;
                             #ifdef USE_AOMAP
                                 mbAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
                                 mbCol *= mbAo;
                             #endif
                             mbCol += mbEmissive;
                             vec3 mbTinted = mix(mbAlbedo, uMB3DTint, uMB3DTintA);
                             vec3 mbUnlit = mbTinted * mbAo + mbEmissive;
                             gl_FragColor.rgb = mix(mbCol, mbUnlit, uMB3DUnlit);
                        } else {
                            // §661: legacy light path — u_lightpos drives the
                            // DIRECT term (view-transformed, mgl anchor
                            // viewport); the shared mbSpecTerm above uses the
                            // 3D-lights dir so recompute F/V/D here.
                            vec3 mbLLeg = normalize((viewMatrix * vec4(uMB3DLegacyPos, 0.0)).xyz);
                            vec3 mbHLeg = normalize(mbV + mbLLeg);
                            float mbNL = clamp(dot(mbN0, mbLLeg), 0.0, 1.0);
                            float mbNH = clamp(dot(mbN0, mbHLeg), 0.0, 1.0);
                            float mbVH = clamp(dot(mbV, mbHLeg), 0.0, 1.0);
                            vec3 mbFLeg = mbSpecC + (vec3(1.0) - mbSpecC) * pow(1.0 - mbVH, 5.0);
                            float mbGXVL = mbNL * (mbNdotV * (1.0 - mbAR) + mbAR);
                            float mbGXLL = mbNdotV * (mbNL * (1.0 - mbAR) + mbAR);
                            float mbVisL = 0.5 / (mbGXVL + mbGXLL);
                            float mbDenL = (mbNH * mbA4 - mbNH) * mbNH + 1.0;
                            float mbDLeg = mbA4 / (3.14159265 * mbDenL * mbDenL);
                            vec3 mbSpecLeg = mbFLeg * mbVisL * mbDLeg;
                            vec3 mbDiffLeg = (1.0 - mbFLeg) * mbDiffC / 3.14159265;
                            vec3 mbDirect = (mbSpecLeg + mbDiffLeg) * mbNL * uMB3DLegacyColor;
                            vec3 mbEnvLight = vec3(0.65);
                            vec3 mbIndSpec = EnvBRDFApproxMb(mbSpecC, mbR, mbNdotV);
                            vec3 mbIndirect = mbIndSpec * mbEnvLight + mbDiffC * mbEnvLight;
                            mbCol = clamp(mbDirect, 0.0, 1.0) + mbIndirect;
                            float mbLum = dot(mbDiffLeg, vec3(0.2126, 0.7152, 0.0722));
                            mbCol *= mix(1.0 - uMB3DLegacyInt, max(1.0 - mbLum + uMB3DLegacyInt, 1.0), mbNL);
                             float mbAo = 1.0;
                             #ifdef USE_AOMAP
                                 mbAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
                                 mbCol *= mbAo;
                             #endif
                             mbCol += mbEmissive;
                             vec3 mbTinted = mix(mbAlbedo, uMB3DTint, uMB3DTintA);
                             vec3 mbUnlit = mbTinted * mbAo + mbEmissive;
                             gl_FragColor.rgb = mix(mbCol, mbUnlit, uMB3DUnlit);
                         }
                     }`
                );
            };
            mat.needsUpdate = true;
        }
    });
}

async function getSharedGLTFLoader(): Promise<GLTFLoaderType> {
    const mod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new mod.GLTFLoader();
    try {
        const dracoMod: any = await import('three/examples/jsm/loaders/DRACOLoader.js');
        const draco = new dracoMod.DRACOLoader();
        draco.setDecoderPath('/base/node_modules/three/examples/jsm/libs/draco/gltf/');
        loader.setDRACOLoader(draco);
    } catch {}
    return loader;
}

/** §647: glTF PBR materials with metallic ≈ 1 (the glTF default when
 * metallicFactor is omitted!) have ZERO diffuse reflection — with no
 * environment map three renders them pitch black (low-poly-car,
 * BoomBoxNoUV: the black-car / blank-model family). mgl's model PBR keeps
 * the base-color texture visible via its procedural environment; clamp
 * metalness so the base color shows. */
/** §647: model material fixups — meshes without UVs fall back to
 * baseColorFactor (three would clamp-sample the texture at texel (0,0)).
 * §654: the envMap variant of the mgl indirect term (flat cube/equirect
 * environment) is NON-VIABLE in the SwiftShader headless renderer — the
 * PMREM generation silently breaks the material (models vanish); the mgl
 * indirect term must be computed in-shader via EnvBRDFApprox (pure math,
 * see model.fragment.glsl) — next-session port blueprint in §654. */
export function fixupModelMaterials(root: THREE.Object3D): void {
    root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // §647: meshes without UVs must not sample the base-color texture —
        // three clamps to texel (0,0) and paints the whole mesh in one
        // arbitrary texel color (model-no-texcooords-textures: the boombox
        // rendered gray-on-gray instead of its white baseColorFactor; mgl
        // falls back to the factor when TEXCOORD_0 is absent).
        const hasUV = !!(mesh.geometry?.attributes?.uv);
        for (let mi = 0; mi < (mats as any[]).length; mi++) {
            const mat: any = (mats as any[])[mi];
            if (!mat) continue;
            // mgl gates EVERY texture sample on HAS_ATTRIBUTE_a_uv_2f
            // (model.fragment.glsl:179 baseColor, :212 normal, :294
            // metallicRoughness, :507 occlusion, :519 emissive) — without
            // TEXCOORD_0 the factor-only path renders. three would clamp
            // every map to texel (0,0), so strip them all. GLTFLoader shares
            // materials across primitives: strip on a CLONE so meshes with
            // UVs keep their textures (mgl gates per primitive).
            const anyMap = mat.map || mat.roughnessMap || mat.metalnessMap
                || mat.aoMap || mat.normalMap || mat.emissiveMap;
            if (!hasUV && anyMap) {
                const stripped: any = mat.clone();
                stripped.map = null;
                stripped.roughnessMap = null;
                stripped.metalnessMap = null;
                stripped.aoMap = null;
                if (stripped.normalScale) stripped.normalScale.set(1, 1);
                stripped.normalMap = null;
                stripped.emissiveMap = null;
                stripped.needsUpdate = true;
                // NOTE: __mbMglLit deliberately NOT copied — the clone loses
                // the onBeforeCompile closure, so applyMglModelLighting must
                // re-patch it (it runs after fixup in instantiate()).
                stripped.__mbMetalFixed = mat.__mbMetalFixed;
                if (Array.isArray(mesh.material)) {
                    const arr = (mesh.material as any[]).slice();
                    arr[mi] = stripped;
                    mesh.material = arr;
                } else {
                    mesh.material = stripped;
                }
                continue;
            }
            if (mat.__mbMetalFixed) continue;
            mat.__mbMetalFixed = true;
            // §647: metallic ≈ 1 materials (the glTF DEFAULT when
            // metallicFactor is omitted) have zero diffuse — without an
            // environment map three renders them pitch black. Clamp so the
            // base color shows (mgl keeps metallic but lights metals via its
            // indirect env term — §654 notes the in-shader EnvBRDF port as
            // the full-parity follow-up; the envMap route is non-viable in
            // the SwiftShader headless renderer).
            if (typeof mat.metalness === 'number' && mat.metalness > 0.5 && !mat.envMap) {
                mat.metalness = 0;
            }
        }
    });
}

/** §645: model URIs that are absolute URLs (per-feature model-uri
 * properties in mgl external-model fixtures) point at fixture-generation-era
 * hosts (dead dev-server ports, GitHub raw) — the corpus ships every
 * referenced model in the local models dir, so rewrite to the basename.
 * The local scheme gets the standard integration-root rewrite. */
export function rewriteModelUrl(url: string): string {
    if (!url) return url;
    if (url.startsWith('local://')) {
        return url.replace(/^local:\/\//,
            '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
    }
    if (/^https?:\/\//i.test(url)) {
        const base = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/models/';
        return base + url.split('/').pop();
    }
    return url;
}

export class MBModelRenderer {
    /** Root-level `style.models` registry: modelId → resolved GLTF url. */
    private m_registry = new Map<string, string>();

    /** Loaded GLTF scenes by url (shared prototypes for cloning). */
    private m_prototypes = new Map<string, THREE.Object3D | 'loading' | 'failed'>();
    private m_loader: GLTFLoaderType | null = null;
    private m_extraFrames = 0;
    private m_sawPlacements = false;
    private m_expectPlacements = false;

    /** Style layers by id — needed for `applyThemeToModel(model, layer)`. */
    private m_layersById = new Map<string, any>();

    /**
     * Per-tile instantiated model groups. Cached from the transient
     * `decodedTile.modelInstances`; pruned when the tile leaves the visible
     * set (same lifecycle contract as MBHeatmapRenderer.m_tileKernels).
     */
    private m_tileGroups = new Map<Tile, THREE.Group>();
    private m_tilePlacements = new Map<Tile, { placements: ModelPlacement[]; sourceArr?: readonly unknown[] }>();

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
    ) {}

    /** Set the modelId → url registry (urls already resolved, local:// rewritten). */
    setModelRegistry(registry: Map<string, string>): void {
        this.m_registry = registry;
    }

    /** Keep style layers around for theme bake lookups. */
    setLayers(layers: any[]): void {
        this.m_layersById = new Map(layers.map((l) => [l.id, l]));
    }

    /** Re-apply color themes to every instantiated model (LUT changes). */
    retheme(): void {
        for (const group of this.m_tileGroups.values()) {
            this.rethemeGroup(group);
        }
    }

    private rethemeGroup(group: THREE.Group): void {
        for (const child of group.children) {
            const layerId = child.userData?._mbLayerId as string | undefined;
            const layer = layerId ? this.m_layersById.get(layerId) : undefined;
            if (layer) {
                try {
                    this.m_dataSource.applyThemeToModel(child, layer);
                } catch {}
            }
        }
    }

    /** True once any decoded-tile model placement has been observed. */
    sawPlacements(): boolean {
        return this.m_sawPlacements;
    }

    /**
     * True when the style has model layers over vector sources (per-feature
     * placements expected). Model-source styles instantiate via loadModels
     * and never produce placements — waiting for them would hang the poll.
     */
    get expectPlacements(): boolean {
        return this.m_expectPlacements;
    }

    setExpectPlacements(v: boolean): void {
        this.m_expectPlacements = v;
    }

    /** True while any recorded placement has no instance yet. */
    isLoading(): boolean {
        for (const { placements } of this.m_tilePlacements.values()) {
            for (const p of placements) if (!(p as any).__placed) return true;
        }
        // Loads that have not produced a placement pass yet also count.
        return false;
    }

    /** Per-frame entry point. Early-returns when no tile carries models. */
    run(): void {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if ((globalThis as any).__mbDecodeDbg && !(this as any).__ranDbg) {
            (this as any).__ranDbg = true;
            let tilesWithModels = 0, modelCount = 0, cleared = 0;
            for (const tile of this.m_dataSource.getDecodedTiles?.() ?? []) {
                const d = (tile as any)?.decodedTile as any;
                const n = d?.modelInstances?.length ?? (tile as any).modelInstances?.length ?? 0;
                if (n > 0) { tilesWithModels++; modelCount += n; }
                if (!d) cleared++;
            }
            // eslint-disable-next-line no-console
            console.log(`[MBModelRun] registry=${this.m_registry.size} scene=${!!scene} tiles=${(this.m_dataSource.getDecodedTiles?.() ?? []).length} withModels=${tilesWithModels} models=${modelCount} noDecoded=${cleared}`);
        }
        if (!scene || this.m_registry.size === 0) return;

        // §518: the engine renders RELATIVE-TO-EYE — tile meshes' matrices
        // are pre-translated by −eye each frame (census probe: tile mesh world
        // coords are small, eye-centered). Groups added directly to the scene
        // keep ABSOLUTE placements (magnitudes ~1e7) while the three camera
        // sits at the eye → the instances land 10⁷ units off-screen. Keep the
        // per-tile group at −eye so its absolute-positioned children render
        // camera-relative like everything else.
        try {
            const geoCenter = (this.m_mapView as any).geoCenter;
            const projection = (this.m_mapView as any).projection;
            if (geoCenter && projection) {
                const eye = projection.projectPoint(geoCenter, { x: 0, y: 0, z: 0 });
                for (const group of this.m_tileGroups.values()) {
                    group.position.set(-eye.x, -eye.y, -eye.z);
                }
            }
        } catch {}

        const tiles: Tile[] = this.m_dataSource.getDecodedTiles?.() ?? [];
        for (const tile of tiles) {
            const cachedPl = this.m_tilePlacements.get(tile);
            if (cachedPl) {
                const dNow: any = (tile as any)?.decodedTile;
                const nowArr = dNow?.modelInstances
                    ?? (tile as any).modelInstances;
                // mgl tile re-decode replaces the tile's content wholesale.
                // markTilesDirty re-decodes the SAME Tile object, so a fresh
                // placements array (new object identity) is the only reliable
                // signal that the emitter re-ran (addLayer/moveLayer/…):
                // stale instances must be dropped, else removed models linger
                // and changed models double up behind the fresh clones.
                if (nowArr && nowArr !== (cachedPl as any).sourceArr) {
                    const group = this.m_tileGroups.get(tile);
                    if (group) {
                        for (const c of [...group.children]) {
                            group.remove(c);
                            this.disposeGroup(c as THREE.Group);
                        }
                        group.userData._done = new Set();
                    }
                    cachedPl.placements = [...nowArr];
                    (cachedPl as any).sourceArr = nowArr;
                } else if (!nowArr || cachedPl.placements.length >= nowArr.length) {
                    // Transient decode window (no array), or the SAME array
                    // grew in place — processPending places only unflagged
                    // indexes, so keep the incremental-append semantics.
                    continue;
                } else {
                    cachedPl.placements = [...nowArr];
                    (cachedPl as any).sourceArr = nowArr;
                }
            } else if (this.m_tilePlacements.has(tile)) {
                continue;
            }
            const decoded = (tile as any)?.decodedTile as any;
            // `modelInstances` survives decodedTile clearing (Tile.removeDecodedTile
            // stashes it on the tile) — the transient window alone is racy.
            const placements = decoded?.modelInstances
                ?? (tile as any).modelInstances as ModelPlacement[] | undefined;
            if (placements && placements.length > 0) {
                this.m_sawPlacements = true;
                this.m_tilePlacements.set(tile, {
                    placements: [...placements],
                    sourceArr: placements,
                });
                // Create the group lazily; clones are appended as prototype
                // GLTFs finish loading (run() retries every frame).
                this.ensureTileGroup(tile, scene);
            }
        }
        const live = new Set(tiles);
        for (const [tile, group] of [...this.m_tileGroups]) {
            // Prune on tile disposal, not mere absence from one frame's
            // decoded-tile list — the cache enumeration is transient during
            // tile replacement and would drop live model instances.
            if (!live.has(tile) && tile.disposed) {
                if (group.parent) group.parent.remove(group);
                this.disposeGroup(group);
                this.m_tileGroups.delete(tile);
                this.m_tilePlacements.delete(tile);
            }
        }

        // `pending` keeps the loop alive across async loads; `placed` requests
        // one more frame after the last instantiation.
        let pending = false;
        for (const { placements } of this.m_tilePlacements.values()) {
            for (let i = 0; i < placements.length; i++) {
                if (!(placements[i] as any).__placed) { pending = true; break; }
            }
            if (pending) break;
        }
        const placed = this.processPending();
        if (pending || placed > 0) { this.m_extraFrames = 3; }
        if (this.m_extraFrames > 0) { this.m_extraFrames--; this.m_mapView.update?.(); }
    }

    private ensureTileGroup(tile: Tile, scene: THREE.Scene): THREE.Group {
        let group = this.m_tileGroups.get(tile);
        if (!group) {
            group = new THREE.Group();
            group.name = 'MBModelRendererTile';
            this.m_tileGroups.set(tile, group);
            scene.add(group);
        }
        return group;
    }

    private disposeGroup(group: THREE.Group): void {
        // Clones share materials/textures with the cached prototypes, so only
        // their (also cloned) geometries are disposed here.
        group.traverse((o) => {
            shadowCasters.delete(o);
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry?.dispose?.();
        });
    }

    private async getPrototype(url: string): Promise<THREE.Object3D | null> {
        const cached = this.m_prototypes.get(url);
        if (cached === 'failed') return null;
        if (cached && cached !== 'loading') return cached;
        if (cached === 'loading') {
            // Another run() call is already fetching; retry next frame.
            return null;
        }
        this.m_prototypes.set(url, 'loading');
        try {
            const gltf = await (await getSharedGLTFLoader()).loadAsync(url);
            const proto: THREE.Object3D = gltf.scene;
            this.m_prototypes.set(url, proto);
            // Instances cloned from this prototype may already have been
            // requested (and skipped); they appear on the next run() pass.
            return proto;
        } catch (err) {
            this.m_prototypes.set(url, 'failed');
            return null;
        }
    }

    private instantiate(
        tile: Tile,
        placement: ModelPlacement,
        technique: any,
        prototype: THREE.Object3D,
        group: THREE.Group,
    ): void {
        const model = prototype.clone(true);
        fixupModelMaterials(model);
        model.position.set(placement.x, placement.y, placement.z);

        // §519: mgl model_util.rotationScaleYZFlipMatrix — the model local
        // matrix is Rz(rot[2])·Rx(rot[0])·Ry(rot[1])·S(scale)·F, where F
        // swaps the Y and Z axes (glTF is Y-up right-handed, the map frame
        // is Z-up). three's default Euler composition is neither of those —
        // build the matrix explicitly. Without F the model lies on its side.
        const sanitizeVec = (v: any): number[] | undefined => {
            if (!Array.isArray(v)) return undefined;
            const out = [Number(v[0] ?? 0), Number(v[1] ?? 0), Number(v[2] ?? 0)];
            return out.every(Number.isFinite) ? out : undefined;
        };
        const rotation = sanitizeVec((placement as any).rotation) ??
            sanitizeVec(technique._modelRotation) ?? [0, 0, 0];
        const scale = sanitizeVec((placement as any).scale) ??
            sanitizeVec(technique._modelScale) ?? [1, 1, 1];
        const D2R = Math.PI / 180;
        const m = new THREE.Matrix4()
            // §653: the render world frame mirrors mgl's pixel frame in y
            // (fly y = −mgl y; cf. the §643 translation-y negate) — the
            // euler angles flip sign accordingly, else models yaw/roll the
            // mirrored way (multiple-meshes: body/window panels swapped).
            .multiply(new THREE.Matrix4().makeRotationZ(-rotation[2] * D2R))
            .multiply(new THREE.Matrix4().makeRotationX(-rotation[0] * D2R))
            .multiply(new THREE.Matrix4().makeRotationY(-rotation[1] * D2R))
            .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]))
            // glTF Y-up → our Z-up: mgl's swap (x,z,y) is the left-handed
            // MIRROR half of the frame conversion; conjugated by the
            // render-frame y mirror (§643/§653, diag(1,−1,1)) it becomes the
            // proper rotation Rx(+90°) = (x,−z,y) — the mirror version
            // rendered y-asymmetric models (arrow) upside down.
            .multiply(new THREE.Matrix4().set(
                1, 0, 0, 0,
                0, 0, -1, 0,
                0, 1, 0, 0,
                0, 0, 0, 1));
        // mgl calculateModelMatrix:271-285: model-elevation-reference defaults
        // to 'ground' (style-spec) — with terrain the instance sits ON the
        // DEM (matrix[14] += elevate) and followTerrainSlope rotates the
        // model onto the terrain plane (Rterrain between the map scale and
        // the model rotation). Terrain off → no lift (state.elevation null).
        const elevRef = (placement as any).elevationReference
            ?? (technique as any)._modelElevationReference ?? 'ground';
        if (elevRef !== 'sea') {
            const env: any = this.m_dataSource;
            const sample = env?.sampleTerrainElevation?.bind(env);
            if (sample) {
                const base = sample(placement.x, placement.y);
                if (base !== null && base !== undefined && isFinite(base)) {
                    // Slope: sample the terrain gradient at ±r around the
                    // anchor (r ≈ the instance footprint span) and rotate the
                    // model's up onto the terrain normal.
                    const rs = [Number(scale[0]) || 1, Number(scale[1]) || 1, Number(scale[2]) || 1];
                    const r = Math.max(1, rs[0], rs[1], rs[2]);
                    const ex = sample(placement.x + r, placement.y);
                    const ey = sample(placement.x, placement.y + r);
                    if (ex !== null && ex !== undefined && ey !== null && ey !== undefined
                        && isFinite(ex) && isFinite(ey)) {
                        const nx = (base - ex) / r;
                        const ny = (base - ey) / r;
                        const nl = Math.hypot(nx, ny, 1);
                        const qTerrain = new THREE.Quaternion().setFromUnitVectors(
                            new THREE.Vector3(0, 0, 1),
                            new THREE.Vector3(nx / nl, ny / nl, 1 / nl));
                        m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(qTerrain));
                    }
                    model.position.z += base;
                }
            }
        }
        // §652(恢复): mercator ground-stretch — the world frame's x/y are
        // EQUATORIAL meters (tile2world), so one GROUND meter at latitude φ
        // spans 1/cos(φ) world units. mgl calculateModelMatrix:211 uses
        // scaleXY = modelPixelsPerMeter = 1/mpp(position.lat) — lat-scaled —
        // so its models keep true size relative to the mercator-stretched
        // ground; ours rendered cos(lat)× small relative to fills/streets
        // (§605 tree-area 1:2.55 residual). mgl scaleZ stays 1 (z = meters in
        // both frames) — x/y only, outside the rotation (T·S(ppm)·R·S·F).
        // NOTE: score impact is masked by the part-color domain (§633
        // 蓝色墙) — geometric parity first, color calibration next.
        const lat = Math.atan(Math.sinh(Math.PI * (2 * (placement.y / 40075017) - 1)));
        const k = 1 / Math.max(1e-6, Math.cos(lat));
        m.premultiply(new THREE.Matrix4().makeScale(k, k, 1));
        const translation = sanitizeVec((placement as any).translation) ??
            sanitizeVec(technique._modelTranslation);
        if (translation) {
            model.position.x += translation[0] ?? 0;
            model.position.y += translation[1] ?? 0;
            model.position.z += translation[2] ?? 0;
        }
        m.setPosition(model.position);
        model.matrixAutoUpdate = false;
        model.matrix.copy(m);

        // model-opacity: transparent only when actually faded.
        const opacity = Number((placement as any).opacity ?? technique.opacity ?? 1);
        if (opacity < 1) {
            model.traverse((o) => {
                const mesh = o as THREE.Mesh;
                const mat = mesh.material as any;
                if (mesh.isMesh && mat) {
                    const materials = Array.isArray(mat) ? mat : [mat];
                    for (const m of materials) {
                        m.transparent = true;
                        m.opacity = opacity;
                        m.depthWrite = false;
                    }
                }
            });
        }

        // Engine cameras carry world-scale translations in Float32 matrices;
        // CPU frustum culling at 1e7-magnitude coordinates is meters-off and
        // randomly culls valid instances. Placements come from visible tiles,
        // so GPU clipping is sufficient.
        model.frustumCulled = false;
        model.traverse((o) => { o.frustumCulled = false; });
        // §518 draw AFTER the tile's fill/line band: the mapview paints plain
        // fills with depthTest=false in style order, and the §512-promoted HD
        // road band occupies ro 2..9.8 — clones at ro 0 rasterize FIRST and
        // are overdrawn to zero visible pixels (mgl draw_model renders the
        // model pass after the road/fill passes).
        model.traverse((o) => { o.renderOrder = 10; });
        model.renderOrder = 10;
        model.userData._mbLayerId = technique._layerId;
        group.add(model);

        // mgl shadow pass: models with model-cast-shadows (default true) are
        // shadow casters; layer 1 is the shadow-camera mask.
        const castShadows = technique._paint?.['model-cast-shadows'] !== false;
        if (castShadows) {
            // §522: the shadow depth pass renders layer 1 ONLY — enable it on
            // every descendant (three tests per-renderable layers, not the
            // root's).
            model.traverse((o) => { o.layers.enable(1); });
            shadowCasters.add(model);
        }

        // CPU theme bake (idempotent via pristine snapshots; the shared
        // materials make this cheap for repeated clones of one prototype).
        const layer = this.m_layersById.get(technique._layerId);
        if (layer && !true) {
            try {
                this.m_dataSource.applyThemeToModel(model, layer);
            } catch {}
        }

        // §520: mgl apply_lighting on the glTF materials (per-feature
        // model-emissive-strength rides the placement, default 0).
        // §521: per-feature model-color×mix tint (clones the materials).
        // §536: model-roughness (mgl default 1) overrides the glTF's own
        // roughnessFactor — requires material clones (per-feature value).
        try {
            const pl: any = placement;
            const tint = pl.color && pl.colorMix > 0
                ? { color: pl.color, mix: pl.colorMix }
                : undefined;
            applyMglModelLighting(this.m_dataSource, model, pl.emissive ?? 0, tint,
                undefined, undefined, undefined,
                // §753: mgl draw_model ignoreLut only nulls the LAYER lut
                // (model-color theming); the style-wide theme still LUTs the
                // albedo — pixel proof: trees-use-theme expected has ZERO
                // green (raw COLOR_0) pixels while ours kept them when this
                // inherited 'none'.
                false,
                (technique as any)._paint?.['model-receive-shadows'] !== false);
            if (Number.isFinite(pl.roughness)) {
                model.traverse((o) => {
                    const mesh = o as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    const apply = (m: any) => { if (m) m.roughness = Math.min(Math.max(pl.roughness, 0), 1); };
                    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
                    else apply(mesh.material);
                });
            }
        } catch {}
    }

    /**
     * Kick off prototype loads for placements not yet instantiated. Called
     * every frame; clones appear once their prototype resolves.
     */
    private processPending(): number {
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        if (!scene) return;
        let placedCount = 0;
        for (const [tile, { placements }] of this.m_tilePlacements) {
            const group = this.m_tileGroups.get(tile);
            if (!group) continue;
            // Per-placement done flags (a still-loading prototype must not
            // permanently block placements queued after it).
            const done = (group.userData._done as Set<number>) ?? new Set<number>();
            group.userData._done = done;
            for (let i = 0; i < placements.length; i++) {
                if (done.has(i)) continue;
                const placement = placements[i];
                const technique = placement.technique;
                if (!technique) { done.add(i); (placement as any).__placed = true; continue; }
                // §518: model-id is data-driven — the per-feature evaluated
                // value rides the placement; technique.modelId is the fallback.
                const modelId = (placement as any).modelId ?? technique.modelId ?? '';
                // §645: a registry miss falls back to treating the modelId
                // itself as a URL (per-feature `model-uri` fixtures) — legacy
                // hosts are rewritten to the local corpus.
                const url = this.m_registry.get(String(modelId))
                    ?? (/^[a-z]+:\/\//i.test(String(modelId)) ? rewriteModelUrl(String(modelId)) : undefined);
                if (!url) { done.add(i); (placement as any).__placed = true; continue; }
                const prototype = this.m_prototypes.get(url);
                if (prototype && prototype !== 'loading' && prototype !== 'failed') {
                    this.instantiate(tile, placement, technique, prototype, group);
                    done.add(i);
                    placedCount++;
                    (placement as any).__placed = true;
                } else if (!prototype) {
                    // Not yet requested — start the async load.
                    void this.getPrototype(url);
                } else if (prototype === 'failed') {
                    done.add(i);
                    (placement as any).__placed = true;
                }
            }
        }
        return placedCount;
    }
}
