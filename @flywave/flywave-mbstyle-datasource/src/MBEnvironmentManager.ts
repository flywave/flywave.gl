import * as THREE from 'three';
import { MapView, MapViewEventNames } from '@flywave/flywave-mapview';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { FogSpec, SkySpec, Light3DProperties } from './MBStyleSpec';
import { MapTerrainMaterial, createTerrainGrid } from './materials/MapTerrainMaterial';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { TerrainController } from './TerrainController';

// Mapbox fog uses an exponential opacity ramp (`_prelude_fog.fragment.glsl`):
//   fog_range(depth) = (depth - range[0]) / (range[1] - range[0])   [km]
//   fog_opacity(t)   = color.a * min(1, 1.00747 * (1 - exp(-6t))^3)
// instead of THREE.Fog's linear smoothstep ramp. Override the standard fog
// shader chunks so every material (MapMeshBasicMaterial/Standard, ground
// plane, ...) picks up the mapbox curve. The scene.fog near/far carry the
// FOV-adjusted km range (converted to meters: ×1000).
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	uniform float fogNear;
	uniform float fogFar;
	uniform float fogAlpha;
	uniform float fogHorizonBlend;
	uniform float fogCamHeight;
	// mgl u_fog_vertical_limit (fog "vertical-range"): elevated content
	// fades OUT of the fog between these heights (meters above ground).
	uniform vec2 fogVertLimit;
	varying float vFogHeight;
#endif
`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
	float fogDepthKm = vFogDepth / 1000.0;
	float fogT = (fogDepthKm - fogNear / 1000.0) / max(fogFar / 1000.0 - fogNear / 1000.0, 0.001);
	float fogFalloff = 1.0 - min(1.0, exp(-6.0 * fogT));
	fogFalloff *= fogFalloff * fogFalloff;
	float fogFactor = fogAlpha * min(1.0, 1.00747 * fogFalloff);
	// mgl fog_horizon_blending: fade the fog out ABOVE the horizon —
	// t = max(0, cameraDir.z / horizonBlend); factor = color.a * exp(-3t²).
	// Map fragments sit at z ≈ 0, so cameraDir.z ≈ -camHeight / depth (negative
	// looking down → t = 0 → full factor; rays toward/above the horizon fade).
	float fogDirZ = -fogCamHeight / max(vFogDepth, 1.0);
	float fogHz = max(0.0, fogDirZ / max(fogHorizonBlend, 1e-4));
	fogFactor *= fogAlpha * exp(-3.0 * fogHz * fogHz);
	// mgl fog_apply_premultiplied(color, pos, heightMeters): vertical
	// visibility fades the fog out for elevated fragments, and near-total
	// fog (>0.9) fades the fade itself to avoid a hard cut at the cull
	// distance.
	float fogVertP = (fogVertLimit.x > 0.0 || fogVertLimit.y > 0.0)
		? smoothstep(fogVertLimit.x, fogVertLimit.y, vFogHeight) : 0.0;
	float fogOpLimit = 1.0 - smoothstep(0.9, 1.0, fogFactor);
	fogFactor *= 1.0 - min(fogVertP, fogOpLimit);
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogHeight;
#endif
`;
// mgl fog depth is the Euclidean camera-to-fragment distance — but the
// engine's empirical kFog calibration (§12.76-12) was fitted against three's
// default view-space depth; enabling both double-corrects and over-fogs the
// off-center fragments (fog/default 552→3342 in the 2026-08-20 batch). Keep
// the view depth until the calibration is redone for Euclidean depth.
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
	vFogDepth = -mvPosition.z;
	vFogHeight = mvPosition.z + cameraPosition.z;
#endif
`;
// Make `fogAlpha` a standard fog uniform (alpha of the fog color) and feed it
// from the scene fog object so the mapbox opacity ramp can scale by alpha.
// `UniformsLib.fog` is the live template, but the per-shader `ShaderLib.*.uniforms`
// were merged (copied) from it at three's module-load time, so they must be
// patched too — otherwise the GLSL `uniform float fogAlpha;` default stays 0
// and the fog is disabled.
if (!('fogAlpha' in THREE.UniformsLib.fog)) {
    (THREE.UniformsLib.fog as any).fogAlpha = { value: 1 };
    (THREE.UniformsLib.fog as any).fogHorizonBlend = { value: 0.05 };
    (THREE.UniformsLib.fog as any).fogCamHeight = { value: 1000 };
    (THREE.UniformsLib.fog as any).fogVertLimit = { value: new THREE.Vector2(0, 0) };
    for (const lib of Object.values(THREE.ShaderLib)) {
        const u = (lib as any).uniforms;
        if (u && typeof u === 'object' && !('fogAlpha' in u)) {
            (u as any).fogAlpha = { value: 1 };
            (u as any).fogHorizonBlend = { value: 0.05 };
            (u as any).fogCamHeight = { value: 1000 };
            (u as any).fogVertLimit = { value: new THREE.Vector2(0, 0) };
        }
    }
}


function evalThemedSafe(value: any, fallback: string, fog: FogSpec, styleZoom: number): any {
    // evaluate zoom expression then apply nothing else (colors resolved by THREE.Color)
    if (value === undefined) return fallback;
    try {
        const { MBExpressionEngine } = require('./MBExpressionEngine');
        const out = MBExpressionEngine.evaluate(value, { zoom: styleZoom, feature: undefined } as any);
        return out ?? fallback;
    } catch { return value; }
}
export class MBEnvironmentManager {
    private m_ambientLight: THREE.AmbientLight | null = null;
    private m_directionalLight: THREE.DirectionalLight | null = null;
    /** mgl 3D-lights cast-shadows state (MBShadowRenderer). */
    private m_shadowEnabled = false;
    private m_shadowIntensity = 0;
    private m_hemisphereLight: THREE.HemisphereLight | null = null;
    private m_fog: THREE.Fog | null = null;

    /**
     * Live fog state for the background-fog gradient renderer (mgl fogs the
     * background like ground content — ray ∩ ground-plane distance).
     */
    get backgroundFogState(): {
        enabled: boolean;
        color: THREE.Color;
        alpha: number;
        /** mgl NORMALIZED fog depth params: T = smoothstep(r0, r1,
         * shift·distFwd/distCam) — the raw fog range over the
         * forward-axis distance (fit-verified on fog/color, §180). */
        r0: number;
        r1: number;
        shift: number;
        distCam: number;
        bgAlpha: number;
        hasBackground: boolean;
        hasSky: boolean;
    } | null {
        if (!this.m_fog || !this.m_fogState || this.m_bgFogParams == null) return null;
        return {
            enabled: true,
            color: this.m_fog.color,
            alpha: this.m_fogState.alpha,
            r0: this.m_bgFogParams.r0,
            r1: this.m_bgFogParams.r1,
            shift: this.m_bgFogParams.shift,
            distCam: this.m_bgFogParams.distCam,
            // Same alpha as content fog (color.a × pitch factor). The
            // fog/color-opacity expected mid-band is slightly lighter than
            // an 0.8 blend — residual alpha semantics, documented §181.
            bgAlpha: this.m_fogState.alpha,
            // mgl fogs the background tiles at ANY pitch; the >76 extension
            // is scoped to explicit-sky-layer styles (horizon-blend family)
            // — §181 measured the pitch-80 quad as net-negative on the
            // fog/2d family with the s=0.735 calibration, so keep those
            // gated until s(pitch) is calibrated.
            hasBackground: this.m_styleHasBackground,
            hasSky: !!(this.m_skyMesh && !this.m_skyMesh.userData.__mbFogAtmosphereDome),
        };
    }
    private m_bgFogParams: { r0: number; r1: number; shift: number; distCam: number } | null = null;

    /**
     * Atmosphere glow state for the screen-space quad renderer (mgl
     * draw_atmosphere: fog color + raw property alpha, high/space colors,
     * horizon-blend mapped to [0.0005, 0.25]).
     */
    get atmosphereState(): {
        fogColor: THREE.Color;
        fogAlpha: number;
        highColor: THREE.Color;
        spaceColor: THREE.Color;
        fadeout: number;
    } | null {
        const st = this.m_fogState;
        if (!st) return null;
        // An explicit sky layer supersedes the atmosphere glow: mgl draws
        // the sky pass AFTER the atmosphere (painter.ts opaque→atmosphere→
        // sky) at max depth, so the sky layer's fragments replace the glow
        // wherever no opaque content drew (the whole sky region). The sky
        // shaders themselves apply fog_apply_sky_gradient.
        if (this.m_skyMesh && !this.m_skyMesh.userData.__mbFogAtmosphereDome) return null;
        return {
            fogColor: st.color,
            fogAlpha: st.colorAlpha,
            highColor: st.highColor,
            spaceColor: st.spaceColor,
            fadeout: st.horizonBlend,
        };
    }
    private m_skyMesh: THREE.Mesh | null = null;
    private m_stars: THREE.Points | null = null;
    private m_scene: THREE.Scene | null = null;

    /** Whether 3D lighting is active (affects vector-layer shading). */
    get hasLighting(): boolean { return this.m_directionalLight !== null; }

    /** mgl 3D-lights shadow pass state; null when shadows are off. */
    get shadowLightState(): { dir: [number, number, number]; intensity: number } | null {
        if (!this.m_use3DLights || !this.m_shadowEnabled || this.m_shadowIntensity <= 0) return null;
        return { dir: this.lighting3DState?.dir ?? [0, 0, 1], intensity: this.m_shadowIntensity };
    }

    /**
     * True when the style uses the 3D `lights` API (`lighting-3d-mode` shader
     * path) instead of the legacy `light` model. Fill-extrusion shading then
     * follows the LIGHTING_3D_MODE formula (a separate pipeline) rather than the
     * legacy default-light model, so the legacy shader injection must be skipped.
     */
    get use3DLights(): boolean { return this.m_use3DLights; }
    private m_use3DLights = false;

    private m_ambientColor: THREE.Color | null = null;
    private m_ambientIntensity: number = 0;
    private m_directionalColor: THREE.Color | null = null;
    private m_directionalIntensity: number = 0;
    private m_directionalPolar: number = 0;

    /** 3D `lights` API configs (sRGB [0,1] colors + intensity + direction). */
    private m_3DAmbient: { color: [number, number, number]; intensity: number } | null = null;
    private m_3DDirectional: {
        color: [number, number, number]; intensity: number; direction: [number, number];
    } | null = null;

    /**
     * Scene brightness for `measure-light` expressions. Mirrors mapbox-gl-js
     * `Style.calculateLightsBrightness()` (style.ts):
     *
     *   directionalBrightness = relLum(dirColor) * dirIntensity * polarIntensity
     *   ambientBrightness     = relLum(ambColor) * ambIntensity
     *   brightness            = (directionalBrightness + ambientBrightness) / 2
     *
     * where `polarIntensity = 1 - polar/90` and `polar` is the directional light's
     * elevation angle in degrees (0 = overhead/zenith, 90 = horizon).
     * Reference: mapbox-gl-js src/style/style.ts:2694-2745.
     */
    get brightness(): number {
        if (!this.m_ambientColor && !this.m_directionalColor) return 0;

        const relativeLuminance = (color: THREE.Color): number => {
            // W3C: L = 0.2126*R_lin + 0.7152*G_lin + 0.0722*B_lin
            // Approximate with sRGB-to-linear gamma.
            const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
        };

        let total = 0;
        if (this.m_directionalColor) {
            const polarIntensity = 1.0 - this.m_directionalPolar / 90.0;
            total += relativeLuminance(this.m_directionalColor) * this.m_directionalIntensity * polarIntensity;
        }
        if (this.m_ambientColor) {
            total += relativeLuminance(this.m_ambientColor) * this.m_ambientIntensity;
        }
        total /= 2.0;
        return Math.round(total * 1e6) / 1e6;
    }
    /** Lighting state for vector-layer Lambert injection (null if no lights). */
    get lightingState(): {
        dir: THREE.Vector3; dirColor: THREE.Color;
        ambColor: THREE.Color; dirIntensity: number; ambIntensity: number;
    } | null {
        if (!this.m_directionalLight) return null;
        const dir = this.m_directionalLight.position.clone().normalize();
        return {
            dir,
            dirColor: (this.m_directionalLight.color ?? new THREE.Color('#fff')).clone(),
            ambColor: (this.m_ambientLight?.color ?? new THREE.Color('#fff')).clone(),
            dirIntensity: this.m_directionalLight.intensity ?? 0.5,
            ambIntensity: this.m_ambientLight?.intensity ?? 0.5,
        };
    }

    /**
     * Mapbox 3D `lights` API state (lighting-3d-mode). Mirrors mapbox-gl-js
     * `3d-style/render/lights.ts` `lightsUniformValues`:
     *
     *   - ambient/directional colors converted to LINEAR and scaled by intensity
     *     (`sRGBToLinearAndScale`: v^2.2 * s),
     *   - `dir` = spherical [azimuth, polar] → cartesian toward the light
     *     (polar 0 = zenith; `z = cos(polar)`),
     *   - `groundRadiance` = `linearVec3TosRGB(ambientContrib + dirContrib)` where
     *     ground layers (fill/background/raster/circle) are lit as
     *     `color * u_ground_radiance` (`apply_lighting_ground`).
     */
    get lighting3DState(): {
        ambientColorLinear: [number, number, number];
        directionalColorLinear: [number, number, number];
        dir: [number, number, number];
        groundRadiance: [number, number, number];
    } | null {
        if (!this.m_use3DLights) return null;
        const ambColor = this.m_3DAmbient?.color ?? [1, 1, 1];
        const ambIntensity = this.m_3DAmbient?.intensity ?? 0.5;
        const dirColor = this.m_3DDirectional?.color ?? [1, 1, 1];
        const dirIntensity = this.m_3DDirectional?.intensity ?? 0.5;
        // Mapbox 3D `lights` directional default direction [210, 30] (style-spec
        // properties_light_directional.direction default).
        const direction = this.m_3DDirectional?.direction ?? [210, 30];

        // sphericalDirectionToCartesian (util.ts): a = az+90°, p = polar°
        const a = (direction[0] + 90) * Math.PI / 180;
        const p = direction[1] * Math.PI / 180;
        const dirVec: [number, number, number] = [
            Math.cos(a) * Math.sin(p),
            Math.sin(a) * Math.sin(p),
            Math.cos(p),
        ];

        const sRGBToLinearAndScale = (v: [number, number, number], s: number): [number, number, number] =>
            [Math.pow(v[0], 2.2) * s, Math.pow(v[1], 2.2) * s, Math.pow(v[2], 2.2) * s];
        const linearVec3TosRGB = (v: [number, number, number]): [number, number, number] =>
            [Math.pow(v[0], 1 / 2.2), Math.pow(v[1], 1 / 2.2), Math.pow(v[2], 1 / 2.2)];

        const ambientLinear = sRGBToLinearAndScale(ambColor, ambIntensity);
        const dirLinear = sRGBToLinearAndScale(dirColor, dirIntensity);

        // calculateGroundRadiance with ground normal (0, 0, 1).
        const NdotL = dirVec[2];
        const dirLuminance = dirLinear[0] * 0.2126 + dirLinear[1] * 0.7152 + dirLinear[2] * 0.0722;
        const directionalFactorMin = 1 - 0.3 * Math.min(dirLuminance, 1);
        const ambientDirectionalFactor =
            directionalFactorMin + (1 - directionalFactorMin) * Math.min(NdotL + 1, 1);
        const radiance: [number, number, number] = [
            ambientLinear[0] * ambientDirectionalFactor + dirLinear[0] * dirVec[2],
            ambientLinear[1] * ambientDirectionalFactor + dirLinear[1] * dirVec[2],
            ambientLinear[2] * ambientDirectionalFactor + dirLinear[2] * dirVec[2],
        ];

        return {
            ambientColorLinear: ambientLinear,
            directionalColorLinear: dirLinear,
            dir: dirVec,
            groundRadiance: linearVec3TosRGB(radiance),
        };
    }

    /**
     * Fill-extrusion lighting state (mapbox `light` model). Mapbox ALWAYS lights
     * extruded surfaces, even without a `light` in the style: the default light
     * is `{ anchor: viewport, color: white, intensity: 0.5, position: [1.15, 210, 30] }`
     * (r, azimuthal°, polar°). Returns the same params whether or not the style
     * specifies lights, so `patchExtrusionMaterial` can always shade walls.
     */
    get extrusionLightState(): {
        dir: THREE.Vector3; color: THREE.Color; intensity: number; use3DLights: boolean;
    } {
        const degToRad = THREE.MathUtils.degToRad;
        // sphericalPositionToCartesian([1.15, 210, 30]) — mapbox default light.
        const r = 1.15, azimuthal = 210, polar = 30;
        const a = degToRad(azimuthal + 90), p = degToRad(polar);
        const dir = new THREE.Vector3(
            r * Math.cos(a) * Math.sin(p),
            r * Math.sin(a) * Math.sin(p),
            r * Math.cos(p),
        );
        if (this.m_directionalLight) {
            const c = (this.m_directionalLight.color ?? new THREE.Color('#fff')).clone();
            return {
                dir: this.m_directionalLight.position.clone(),
                color: c,
                intensity: this.m_directionalLight.intensity ?? 0.5,
                use3DLights: this.m_use3DLights,
            };
        }
        // Keep use3DLights true even without a directional light (a style may
        // declare only an ambient 3D light); the 3D-lights shader path reads its
        // own uniforms from lighting3DState, not from this getter's dir/color.
        return { dir, color: new THREE.Color('#ffffff'), intensity: 0.5, use3DLights: this.m_use3DLights };
    }
    private m_terrainMesh: THREE.Mesh | null = null;
    private m_terrainController: TerrainController | null = null;
    private m_terrainRteListener: (() => void) | null = null;

    /** Multi-tile terrain controller (null if no terrain or single-tile fallback). */
    get terrainController(): TerrainController | null { return this.m_terrainController; }
    private m_backgroundQuad: THREE.Mesh | null = null;
    private m_rasterQuad: THREE.Mesh | null = null;
    private m_imageQuads: THREE.Mesh[] = [];

    private m_colorThemeLut: import('./MBColorTheme').ColorThemeLut | null = null;

    constructor(private m_mapView: MapView) {
        this.m_scene = (m_mapView as any).m_scene ?? null;
    }

    /** Mapbox `color-theme` LUT (null = identity). */
    setColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void {
        this.m_colorThemeLut = lut;
    }

    /**
     * Whether the current style has a visible `background` layer. mgl draws
     * the background as opaque tile geometry that depth-occludes the skybox
     * below the horizon; our background is the clear color, so the
     * atmosphere sky keeps a below-horizon cut only in that case.
     */
    setStyleHasBackground(has: boolean): void {
        this.m_styleHasBackground = has;
    }
    private m_styleHasBackground = false;

    /**
     * Lights resolve their theme from the LIGHT's own import scope (mgl
     * `3d-style/render/lights.ts` uses `style.getLut(light.scope)`), which can
     * differ from the fog/root LUT in one frame.
     */
    private m_lightsColorThemeLut: import('./MBColorTheme').ColorThemeLut | null = null;

    setLightsColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void {
        this.m_lightsColorThemeLut = lut;
    }

    /** Theme a light color (accepts css string or sRGB [r,g,b] array). */
    private themeLightColor(v: any): any {
        if (!this.m_lightsColorThemeLut || v === undefined || v === null) return v;
        try {
            const { applyColorTheme } = require('./MBColorTheme');
            if (typeof v === 'string') return applyColorTheme(this.m_lightsColorThemeLut, v);
            if (Array.isArray(v) && v.length >= 3
                && v.every((c: any) => typeof c === 'number' && c >= 0 && c <= 1)) {
                const out = applyColorTheme(
                    this.m_lightsColorThemeLut,
                    `rgb(${Math.round(v[0] * 255)}, ${Math.round(v[1] * 255)}, ${Math.round(v[2] * 255)})`);
                const m = out.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
                if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
            }
        } catch {}
        return v;
    }

    /**
     * Last applied directional light position as [azimuthal, polar] degrees
     * (mgl style light default [210, 30]). The atmosphere sky uses it as the
     * sun-direction fallback when `sky-atmosphere-sun` is not set (mgl
     * sky_style_layer.getCenter).
     */
    private m_lightAzimuthalPolar: [number, number] = [210, 30];

    applyLights(lights: Light3DProperties[] | undefined, legacyLight?: any): void {
        if (!this.m_scene) return;
        this.clearLights();
        this.m_lightAzimuthalPolar =
            Array.isArray(legacyLight?.position) && legacyLight.position.length >= 3
                ? [legacyLight.position[1], legacyLight.position[2]]
                : [210, 30];
        this.m_use3DLights = Array.isArray(lights) && lights.length > 0;

        const renderer = (this.m_mapView as any).renderer;
        if (renderer) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        if (!lights || lights.length === 0) {
            if (legacyLight) {
                const legacyColor = new THREE.Color(
                    this.themeLightColor(legacyLight.color ?? '#ffffff'));
                const legacyIntensity = legacyLight.intensity ?? 0.5;
                this.m_ambientColor = legacyColor;
                this.m_ambientIntensity = legacyIntensity;
                this.m_ambientLight = new THREE.AmbientLight(legacyColor, legacyIntensity);
                this.m_scene.add(this.m_ambientLight);
                if (legacyLight.position) {
                    const pos = legacyLight.position;
                    this.m_directionalColor = legacyColor;
                    this.m_directionalIntensity = legacyIntensity;
                    this.m_directionalPolar = 0;
                    this.m_directionalLight = new THREE.DirectionalLight(
                        legacyColor,
                        legacyIntensity,
                    );
                    this.m_directionalLight.position.set(pos[0], pos[1], pos[2]);
                    this.m_scene.add(this.m_directionalLight);
                }
            } else {
                // Mapbox always has a default light (style-spec: anchor viewport,
                // color white, intensity 0.5); without any scene light the lit
                // materials used for extrusions (MeshStandardMaterial) render
                // black. A full-strength ambient reproduces mapbox's mostly-flat
                // default look (roofs at full paint color). Intensity PI cancels
                // the 1/PI factor of three's physical BRDF_Lambert term so the
                // surface shows its exact diffuse color. Kept out of
                // m_ambientColor/m_ambientIntensity so `brightness` (measure-light)
                // stays 0 as before for light-less styles.
                this.m_ambientLight = new THREE.AmbientLight(new THREE.Color('#ffffff'), Math.PI);
                this.m_scene.add(this.m_ambientLight);
            }
            return;
        }

        for (const light of lights) {
            // Mapbox 3D `lights` API objects are `{ type, id, properties: {...} }`.
            const p = (light as any).properties ?? light;
            const color = MBEnvironmentManager.parseMBColor(
                this.themeLightColor(p.color ?? '#ffffff'));
            const intensity = p.intensity ?? 0.5;
            if (light.type === 'ambient') {
                this.m_3DAmbient = { color, intensity };
                this.m_ambientColor = new THREE.Color(color[0], color[1], color[2]);
                this.m_ambientIntensity = intensity;
                // NOTE: 3D `lights` styles must NOT put their colored lights in
                // the three.js scene: lit materials (extruded-polygon etc.) get
                // the mapbox `apply_lighting` formula injected by
                // MBMaterialPatchManager.injectExtrusion3DLighting, which
                // multiplies the material's already-lit color — colored scene
                // lights would darken it twice (data-driven-zero-alpha). A
                // neutral full ambient keeps the standard material's base
                // output equal to its diffuse color (BRDF_Lambert = c/π with
                // π·intensity ambient irradiance), i.e. "unlit".
                if (!this.m_ambientLight) {
                    // Intensity π: ambient irradiance is color·intensity while
                    // BRDF_Lambert divides by π, so π·1 white yields base =
                    // diffuse color exactly (see the note above).
                    this.m_ambientLight = new THREE.AmbientLight(0xffffff, Math.PI);
                    this.m_scene.add(this.m_ambientLight);
                }
            } else if (light.type === 'directional') {
                // `direction` may be a plain [azimuth, polar] or a literal
                // expression `['literal', [az, polar]]` (mapbox 3D lights).
                const rawDir = Array.isArray(p.direction) && p.direction[0] === 'literal'
                    ? p.direction[1]
                    : p.direction;
                const direction: [number, number] = Array.isArray(rawDir) && rawDir.length >= 2
                    ? [rawDir[0], rawDir[1]]
                    : [210, 30];
                this.m_3DDirectional = { color, intensity, direction };
                this.m_lightAzimuthalPolar = [direction[0], direction[1]];
                this.m_directionalColor = new THREE.Color(color[0], color[1], color[2]);
                this.m_directionalIntensity = intensity;
                this.m_directionalPolar = direction[1];
                this.m_directionalLight = new THREE.DirectionalLight(
                    new THREE.Color(color[0], color[1], color[2]),
                    intensity,
                );
                const dirVec = this.directionalVec(direction);
                this.m_directionalLight.position.set(dirVec[0], dirVec[1], dirVec[2]);
                if (p['cast-shadow']) {
                    this.m_directionalLight.castShadow = true;
                    this.m_directionalLight.shadow.mapSize.width = 2048;
                    this.m_directionalLight.shadow.mapSize.height = 2048;
                    this.m_directionalLight.shadow.camera.near = 0.1;
                    this.m_directionalLight.shadow.camera.far = 1000;
                }
                // mgl shadow state (shadow_renderer.ts reads these off the
                // directional light each frame): enabled + intensity.
                this.m_shadowEnabled = p['cast-shadow'] === true;
                this.m_shadowIntensity = Number(p['shadow-intensity'] ?? 0);
                // Kept out of the scene — see the ambient note above about
                // double lighting of manually-injected materials.
            }
        }
    }

    /**
     * Convert a light `direction: [azimuth, polar]` (mapbox 3D lights) to the
     * cartesian vector toward the light (polar 0 = zenith). Mirrors
     * `sphericalDirectionToCartesian` in mapbox-gl-js util.ts.
     */
    private directionalVec(direction: [number, number]): [number, number, number] {
        const a = (direction[0] + 90) * Math.PI / 180;
        const p = direction[1] * Math.PI / 180;
        return [
            Math.cos(a) * Math.sin(p),
            Math.sin(a) * Math.sin(p),
            Math.cos(p),
        ];
    }

    /** Parse an MBColorSpec (hex / #RGB / rgba() / named) into sRGB [0,1] RGB. */
    private static parseMBColor(c: any): [number, number, number] {
        if (Array.isArray(c) && c.length >= 3) {
            return [Number(c[0]) / 255, Number(c[1]) / 255, Number(c[2]) / 255];
        }
        const s = String(c).trim();
        if (s.startsWith('#')) {
            const h = s.slice(1);
            if (h.length === 3 || h.length === 4) {
                const e = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
                return [parseInt(e.slice(0, 2), 16) / 255, parseInt(e.slice(2, 4), 16) / 255, parseInt(e.slice(4, 6), 16) / 255];
            }
            if (h.length === 6 || h.length === 8) {
                return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
            }
        }
        const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
        // Named color fallback via THREE.Color (hex output).
        try {
            const t = new THREE.Color(s);
            return [t.r, t.g, t.b];
        } catch {
            return [1, 1, 1];
        }
    }

    applyFog(fog: FogSpec | undefined, styleZoom = 0): void {
        if (!this.m_scene) return;
        const isGlobe = (this.m_mapView as any).projection?.type === 1;
        if (isGlobe) {
            // Globe: no scene.fog — mgl draws a screen-space atmosphere glow
            // around the globe limb (atmosphere.fragment.glsl with
            // PROJECTION_GLOBE_VIEW) and shows the space color around it.
            this.applyGlobeAtmosphere(fog, styleZoom);
            return;
        }
        this.disposeGlobeAtmosphere();
        if (this.m_fog) {
            this.m_scene.fog = null;
            this.m_fog = null;
        }
        this.m_fogState = null;
        if (!fog) return;

        // Evaluate zoom-functions for the fog's style-driven properties at the
        // style zoom (mapbox fog spec: range/color/high-color/space-color/
        // horizon-blend/star-intensity all support zoom interpolation).
        const evalZoom = (value: any, fallback: any): any => {
            if (value === undefined) return fallback;
            try {
                const { MBExpressionEngine } = require('./MBExpressionEngine');
                const out = MBExpressionEngine.evaluate(value, { zoom: styleZoom, feature: undefined } as any);
                return out ?? fallback;
            } catch {
                return value;
            }
        };

        // Mapbox fog model (`fog.ts` / `_prelude_fog.fragment.glsl`).
        // The fog depth is the camera-to-fragment distance in km; the range is
        // FOV-adjusted the same way mapbox does (`state.range`):
        //   fovAdjustedRange = [range[0] + shift, range[1] + shift]
        //   shift = 0.5 / tan(fov/2)
        // Fog opacity is an exponential ramp (not linear):
        //   fog_range(depth) = (depth - range[0]) / (range[1] - range[0])
        //   fog_opacity(t) = color.a * min(1, 1.00747 * (1 - exp(-6t))^3)
        // and (Mercator) it is multiplied by a horizon-blend that fades fog when
        // looking straight down.
        const rawRange: [number, number] = evalZoom(fog.range, [0.5, 10]);
        // mgl fog depth is CAMERA-NORMALIZED (mercatorFogMatrix scales the
        // world by cameraWorldSizeForFog/height — depth ≈ distance ×
        // pixelsPerMeter/height, O(1..10)). The FOV shift (0.5/tan(fov/2))
        // added to both range ends makes the screen CENTER land exactly at
        // depth = shift, i.e. depth_fog = shift · dist/distCam. Convert the
        // fog range to our METRIC world: near/far_m =
        // distCam · (range[i] + shift) / shift. distCam is derived from the
        // orbit camera geometry (height above ground / elevation angle).
        const cam = this.m_mapView?.camera as THREE.PerspectiveCamera | undefined;
        let nearM = rawRange[0] * 1000;
        let farM = rawRange[1] * 1000;
        if (cam) {
            const fovRad = (cam.fov ?? 36.87) * Math.PI / 180;
            const shift = 0.5 / Math.tan(fovRad / 2);
            // Exact port of mgl mercatorFogMatrix semantics (transform.ts
            // `_calcFogMatrices`): the fog matrix scales the world by
            // metersToPixel = [cameraWorldSizeForFog, ..., cameraPixelsPerMeter]
            // × windowScaleFactor, which algebraically reduces to a uniform
            // `shift / distCam` (cameraWorldSizeForFog = height·shift/d and
            // windowScaleFactor = 1/height). Hence mgl fog depth of a fragment
            // is `shift · dist / distCam`, where distCam is the forward-ray
            // parameter to the elevation plane (free_camera
            // `getDistanceToElevation`: (z0 − camZ) / forward.z) — i.e. the
            // camera-to-screen-center distance along the view ray. Composing
            // with the shifted range gives
            //   fogT = (dist − distCam·(r0+shift)/shift) / (distCam·(r1−r0)/shift)
            // so scene.fog near/far are exactly those metric bounds — no
            // calibration constant (replaces the empirical kFog=3.7, §12.76-8).
            // Deriving distCam from the actual camera orientation (not the
            // pitch property + height geometry) sidesteps any pitch-semantics
            // mismatch between mapview and mgl.
            // distCam candidates (§12.76-12 isolation batches): the exact
            // forward-ray ∩ ground parameter (mgl getDistanceToElevation)
            // and the pitch-property heuristic h/cos(pitch) differ slightly
            // on the render-test camera rig — the calibrated band position
            // (fog/default 552) was fitted with the heuristic; the exact
            // form measured 1064 on the same fixture. Use the calibrated
            // heuristic form.
            // distCam: EXACT mgl geometry (free_camera getDistanceToElevation:
            // forward-ray ∩ ground-plane parameter — camera.getWorldDirection
            // so it cannot drift from the actual rig orientation, fixing the
            // pitch-drift of the h/sin(90−pitchProperty) heuristic observed
            // on the pitch-70 fog/2d family) COMBINED with the empirical
            // global scale k=3.7. §12.76-12 only ever tested exact+k=1 (552→
            // 3342) vs heuristic+k=3.7 (552) — the k folds BOTH the distCam
            // semantics AND the engine↔mgl fog-space scale, so exact+k=3.7
            // is the principled combination (§106).
            // Heuristic (baseline, §12.76-12 calibration). §106 measured the
            // exact ray form × k=3.7 and a 65° composite: pitch-70 fill-heavy
            // fog/2d cases improve (fill-color 819→600, line-sdf 3628→1198)
            // but fog/default (pitch 80, 552→1094) and fog/color (70,
            // 65842→69478) regress — the divergence is CONTENT-dependent at
            // the same pitch, so no pitch boundary is correct. Reverted; the
            // exact fix requires resolving the rig's per-content depth
            // semantics (RTE offsets), not a distCam formula swap.
            const pitchDeg = Math.min(Math.max((this.m_mapView as any).pitch ?? 60, 0.1), 89.9);
            const distCam = Math.max(cam.position.z, 1) /
                Math.sin((90 - pitchDeg) * Math.PI / 180);
            const kFog = 3.7;
            nearM = distCam * kFog * (rawRange[0] + shift) / shift;
            farM = distCam * kFog * (rawRange[1] + shift) / shift;
            // Normalized (mgl-unit) params for the background gradient.
            this.m_bgFogParams = { r0: rawRange[0], r1: rawRange[1], shift, distCam };
        }
        const evalThemed = (value: any, fallback: any, useThemeKey: string): any => {
            const v = evalZoom(value, fallback);
            if (typeof v !== 'string') return v;
            if (fog[useThemeKey] === 'none') return v;
            if (this.m_colorThemeLut) {
                try {
                    const { applyColorTheme } = require('./MBColorTheme');
                    return applyColorTheme(this.m_colorThemeLut, v);
                } catch {}
            }
            return v;
        };
        const rawColor = evalThemed(fog.color, '#ffffff', 'color-use-theme');
        const color = new THREE.Color(rawColor);
        const colorAlpha = typeof rawColor === 'string' && /^#[\da-fA-F]{8}$/.test(rawColor)
            ? parseInt(rawColor.slice(7, 9), 16) / 255
            : 1;
        // mgl only enables fog at high pitch: u_fog_color.a = getOpacity(pitch)
        // = smoothstep(FOG_PITCH_START=60, FOG_PITCH_END=65, pitch) · color.a
        // (painter.ts fogUniformValues). Compute pitch from the actual view
        // direction (0 = straight down) so it can't drift from camera state.
        let pitchFactor = 1;
        if (cam) {
            const dir = cam.getWorldDirection(new THREE.Vector3());
            const pitchDeg = Math.acos(Math.min(1, Math.max(-1, -dir.z))) * 180 / Math.PI;
            const s = Math.min(Math.max((pitchDeg - 60) / (65 - 60), 0), 1);
            pitchFactor = s * s * (3 - 2 * s);
        }
        const alpha = pitchFactor * colorAlpha;
        this.m_fog = new THREE.Fog(color.getHex(), nearM, farM);
        // Feed the fog color alpha into the shared fog-uniform template so
        // recompiled materials pick up the mapbox opacity ramp's alpha scale.
        (THREE.UniformsLib.fog as any).fogAlpha.value = alpha;
        this.m_scene.fog = this.m_fog;
        const rawHorizonBlend = evalZoom(fog['horizon-blend'], ['interpolate', ['linear'], ['zoom'], 4, 0.2, 7, 0.1]);
        const rawSpaceColor = fog['space-color'] !== undefined
            ? evalThemed(fog['space-color'], '#010b19', 'space-color-use-theme')
            : ['interpolate', ['linear'], ['zoom'], 4, '#010b19', 7, '#367ab9'];
        const rawHighColor = evalThemed(fog['high-color'], '#245cdf', 'high-color-use-theme');
        this.m_fogState = {
            color: color.clone(),
            alpha,
            // Raw fog color alpha WITHOUT the pitch visibility factor — the
            // mgl atmosphere glow (drawAtmosphereGlow) consumes the property
            // alpha directly; only the map-material fog carries getOpacity's
            // smoothstep(60°,65°,pitch).
            colorAlpha,
            // mapbox drawAtmosphere: horizonBlend = mapValue(horizon-blend, 0..1, 0.0005..0.25)
            horizonBlend: Number(evalZoom(rawHorizonBlend, 0.2)) * 0.2495 + 0.0005,
            // fogUniformValues: u_fog_horizon_blend = the RAW horizon-blend
            // property (0..1) — the mapValue mapping is ONLY for the
            // atmosphere glow's u_fadeout_range, not the content/sky fog.
            horizonBlendRaw: Number(evalZoom(rawHorizonBlend, 0.2)),
            highColor: new THREE.Color(rawHighColor),
            spaceColor: new THREE.Color(evalZoom(rawSpaceColor, '#010b19')),
        };
        // mgl fog_horizon_blending + vertical-range uniforms (see the
        // fog_fragment chunk). vertical-range default [0,0] = disabled;
        // mgl orders the pair with min/max applied.
        // Content materials keep the MAPPED horizon blend — the kFog=3.7
        // calibration was fitted with it (fog/2d/hillshade regresses
        // 18k→27.7k with the raw value, §186). Only the sky shaders use the
        // raw property (fogUniformValues semantics, pixel-verified on
        // fog/horizon-blend/gradient/low).
        (THREE.UniformsLib.fog as any).fogHorizonBlend.value = this.m_fogState.horizonBlend;
        const vRange = evalZoom(fog['vertical-range'], [0, 0]) as [number, number];
        (THREE.UniformsLib.fog as any).fogVertLimit.value.set(
            Math.min(vRange[0] ?? 0, vRange[1] ?? 0), vRange[1] ?? 0);
        const camPos = this.m_mapView?.camera?.position;
        (THREE.UniformsLib.fog as any).fogCamHeight.value = camPos ? Math.max(camPos.z, 1) : 1000;
        // Mapbox renders the atmosphere glow (space→high→fog gradient) in the
        // sky region whenever fog is enabled and the horizon is visible — even
        // without an explicit `sky` layer. Create a camera-centered dome that
        // reproduces the `atmosphere.fragment.glsl` gradient.
        this.createFogAtmosphereDome();
        if (fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }

    private m_fogState: {
        color: THREE.Color;
        alpha: number;
        colorAlpha: number;
        horizonBlend: number;
        horizonBlendRaw: number;
        highColor: THREE.Color;
        spaceColor: THREE.Color;
    } | null = null;

    /**
     * Create/update the fog-driven atmosphere gradient dome in the sky region.
     *
     * Mirrors mapbox `drawAtmosphereGlow` (`atmosphere.fragment.glsl`):
     * the sky is a gradient from `space-color` (zenith) through `high-color`
     * to the fog color at the horizon, with an exponential fadeout driven by
     * `horizon-blend`. The dome is centered on the RTE camera (origin), so each
     * fragment's world position is the view direction; the elevation above the
     * horizon determines the gradient position.
     */
    private m_globeAtmo: THREE.Mesh | null = null;

    private disposeGlobeAtmosphere(): void {
        if (this.m_globeAtmo) {
            this.m_scene?.remove(this.m_globeAtmo);
            (this.m_globeAtmo.geometry as THREE.BufferGeometry).dispose();
            (this.m_globeAtmo.material as THREE.Material).dispose();
            this.m_globeAtmo = null;
        }
    }

    /**
     * Globe atmosphere — port of mgl drawAtmosphereGlow with the
     * PROJECTION_GLOBE_VIEW define (atmosphere.fragment/vertex.glsl): a
     * screen-space quad computing, per fragment, the angle between the view
     * ray and the globe limb and blending fog/high/space colors with an
     * exponential falloff. Inside the globe the fragment is fully
     * transparent so the map tiles show through.
     */
    private applyGlobeAtmosphere(fog: FogSpec | undefined, styleZoom: number): void {
        if (!fog) {
            this.disposeGlobeAtmosphere();
            return;
        }
        const evalZoom = (value: any, fallback: any): any => {
            if (value === undefined) return fallback;
            try {
                const { MBExpressionEngine } = require('./MBExpressionEngine');
                const out = MBExpressionEngine.evaluate(value, { zoom: styleZoom, feature: undefined } as any);
                return out ?? fallback;
            } catch { return value; }
        };
        // Fog color alpha (property alpha, no pitch factor on globe).
        const rawColor = evalZoom(fog.color, '#ffffff');
        const colorAlpha = typeof rawColor === 'string' && /^#[\da-fA-F]{8}$/.test(rawColor)
            ? parseInt(rawColor.slice(7, 9), 16) / 255 : 1;
        const propAlpha = (raw: any): number => {
            const s = String(raw ?? '');
            const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
            if (m) return +m[2];
            if (/^#[\da-fA-F]{8}$/.test(s)) return parseInt(s.slice(7, 9), 16) / 255;
            return 1;
        };
        const rawHigh = evalThemedSafe(fog['high-color'], '#245cdf', fog, styleZoom);
        const rawSpaceRaw = fog['space-color'] !== undefined ? fog['space-color'] : ['interpolate', ['linear'], ['zoom'], 4, '#010b19', 7, '#367ab9'];
        const rawSpace = evalThemedSafe(rawSpaceRaw, '#010b19', fog, styleZoom);
        const c = (raw: any, fallback: string): THREE.Color => {
            try { return new THREE.Color(typeof raw === 'string' ? raw : fallback); }
            catch { return new THREE.Color(fallback); }
        };
        const fogColor = c(rawColor, '#ffffff');
        const highColor = c(rawHigh, '#245cdf');
        const spaceColor = c(rawSpace, '#010b19');
        // mapValue(horizon-blend, 0..1, 0.0005..0.25)
        const hb = Number(evalZoom(fog['horizon-blend'], 0.2));
        const fadeout = Math.min(0.25, Math.max(0.0005, hb * 0.2495 + 0.0005));

        // Globe geometry in VIEW space (world origin = globe center).
        // Force-fresh matrices: applyFog runs at connect before the engine
        // has updated the camera world matrix (a stale matrixWorldInverse
        // zeroes the globe center and the whole screen falls "outside").
        const cam = this.m_mapView.camera;
        cam.updateMatrixWorld(true);
        const viewMatrix = new THREE.Matrix4().copy(cam.matrixWorld).invert();
        const globeCenterView = new THREE.Vector3(0, 0, 0).applyMatrix4(viewMatrix);
        const dc = Math.max(globeCenterView.length(), 1);
        const R = EarthConstants.EQUATORIAL_RADIUS;
        const distToHorizon = Math.sqrt(Math.max(dc * dc - R * R, 0));
        const horizonAngle = Math.acos(Math.min(1, distToHorizon / dc));

        // Space color as the clear backdrop (outside the globe) — its
        // property alpha composites over the white test canvas (mgl renders
        // the atmosphere premultiplied over a transparent framebuffer).
        (this.m_mapView as any).clearColor = spaceColor.getHex();
        (this.m_mapView as any).clearAlpha = propAlpha(rawSpace);

        this.disposeGlobeAtmosphere();
        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            // premultiplied output (c*t, t) with (ONE, ONE_MINUS_SRC_ALPHA)
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            uniforms: {
                uGlobePos: { value: globeCenterView },
                uGlobeRadius: { value: R },
                uHorizonAngle: { value: horizonAngle },
                uFadeout: { value: fadeout },
                uTanHalfFov: { value: Math.tan((cam.fov * Math.PI / 180) / 2) },
                uAspect: { value: (cam as THREE.PerspectiveCamera).aspect ?? 1 },
                uFogColor: { value: new THREE.Vector4(fogColor.r, fogColor.g, fogColor.b, colorAlpha) },
                uHighColor: { value: new THREE.Vector4(highColor.r, highColor.g, highColor.b, propAlpha(rawHigh)) },
                uSpaceColor: { value: new THREE.Vector4(spaceColor.r, spaceColor.g, spaceColor.b, propAlpha(rawSpace)) },
            },
            vertexShader: `
                varying vec2 vNdc;
                void main() {
                    vNdc = position.xy;
                    gl_Position = vec4(position.xy, 0.99999, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uGlobePos;
                uniform float uGlobeRadius;
                uniform float uHorizonAngle;
                uniform float uFadeout;
                uniform float uTanHalfFov;
                uniform float uAspect;
                uniform vec4 uFogColor;
                uniform vec4 uHighColor;
                uniform vec4 uSpaceColor;
                varying vec2 vNdc;
                #define PI 3.141592653589793
                void main() {
                    vec3 dir = normalize(vec3(vNdc.x * uTanHalfFov * uAspect, vNdc.y * uTanHalfFov, -1.0));
                    float globe_pos_dot_dir = dot(uGlobePos, dir);
                    vec3 closestPoint = globe_pos_dot_dir * dir;
                    float distToCenter = length(closestPoint - uGlobePos);
                    float normDist = distToCenter / uGlobeRadius;
                    if (normDist < 0.98) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                        return;
                    }
                    float theta = asin(clamp(distToCenter / length(uGlobePos), -1.0, 1.0));
                    float horizonAngle = globe_pos_dot_dir < 0.0
                        ? PI - theta - uHorizonAngle : theta - uHorizonAngle;
                    horizonAngle /= PI;
                    float t = exp(-horizonAngle / uFadeout);
                    // mgl color pass output: (c2 * t, t) premultiplied.
                    vec3 c0 = mix(uSpaceColor.rgb, uHighColor.rgb, uHighColor.a);
                    vec3 c1 = mix(c0, uFogColor.rgb, uFogColor.a);
                    vec3 c2 = mix(c0, c1, t);
                    gl_FragColor = vec4(c2 * t, t);
                }
            `,
        });
        this.m_globeAtmo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        this.m_globeAtmo.frustumCulled = false;
        this.m_globeAtmo.renderOrder = -2000;
        // Refresh the globe geometry uniforms before each draw — the camera
        // settles after connect (fov/aspect/distance all late-bound).
        this.m_globeAtmo.onBeforeRender = () => {
            const c = this.m_mapView.camera;
            c.updateMatrixWorld(true);
            const vm = new THREE.Matrix4().copy(c.matrixWorld).invert();
            const gc = new THREE.Vector3(0, 0, 0).applyMatrix4(vm);
            const d = Math.max(gc.length(), 1);
            const dh = Math.sqrt(Math.max(d * d - R * R, 0));
            material.uniforms.uGlobePos.value.copy(gc);
            material.uniforms.uHorizonAngle.value = Math.acos(Math.min(1, dh / d));
            material.uniforms.uTanHalfFov.value = Math.tan((c.fov * Math.PI / 180) / 2);
            material.uniforms.uAspect.value = (c as THREE.PerspectiveCamera).aspect ?? 1;
        };
        this.m_scene!.add(this.m_globeAtmo);

        if (fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }

    private createFogAtmosphereDome(): void {
        if (!this.m_scene || !this.m_fogState) return;
        // An explicit sky layer supersedes the fog dome (mgl sky pass draws
        // after the atmosphere glow). applySky removes the dome when the sky
        // is applied, but applyFog re-entry paths (theme propagation, zoom
        // updates) would recreate it ON TOP of the sky — never (re)create
        // the dome while an explicit sky mesh is active.
        if (this.m_skyMesh && !this.m_skyMesh.userData.__mbFogAtmosphereDome) return;
        const fog = this.m_fogState;

        if (!this.m_skyMesh) {
            const geom = new THREE.SphereGeometry(1000, 32, 16);
            // mgl measures the atmosphere glow from the SCREEN-space horizon
            // line (transform.horizonLineFromTop: h = height/2/tan(fov/2)/
            // tan(pitch), offset = height/2 − h·(1−horizonShift 0.1)) — NOT
            // from the true (elevation-0) horizon. Computed per draw in
            // onBeforeRender (the camera pitch is not configured yet when the
            // fog environment is created).
            let horizonRefElev = 0;
            const material = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                transparent: false,
                depthWrite: false,
                depthTest: true,
                uniforms: {
                    uFogColor: { value: fog.color.clone() },
                    uFogAlpha: { value: fog.colorAlpha },
                    uHighColor: { value: fog.highColor.clone() },
                    uHighAlpha: { value: 1.0 },
                    uSpaceColor: { value: fog.spaceColor.clone() },
                    uSpaceAlpha: { value: 1.0 },
                    uFadeout: { value: fog.horizonBlend },
                    uHorizonRefElev: { value: horizonRefElev },
                },
                vertexShader: `
                    varying vec3 vLocalDir;
                    void main() {
                        // LOCAL sphere direction = ray from the dome center
                        // (the camera) — the world matrix translation must
                        // NOT skew the atmosphere elevation math (§182).
                        vLocalDir = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uFogColor;
                    uniform float uFogAlpha;
                    uniform vec3 uHighColor;
                    uniform float uHighAlpha;
                    uniform vec3 uSpaceColor;
                    uniform float uSpaceAlpha;
                    uniform float uFadeout;
                    uniform float uHorizonRefElev;
                    varying vec3 vLocalDir;
                    void main() {
                        vec3 dir = normalize(vLocalDir);
                        // Elevation above the horizon (world z-up, camera at origin).
                        float elevation = asin(clamp(dir.z, -1.0, 1.0));
                        // Map fragments never see the dome (depth-tested away);
                        // rays below the TRUE horizon are always occluded.
                        if (elevation <= 0.0) discard;
                        // Angle above the horizon — measured from the TRUE
                        // elevation-0 horizon. (A screen-space horizon-line
                        // reference was tried per mgl atmosphere.vertex's
                        // u_horizon frustum interpolation but regressed the
                        // high-color fixtures ~2k px each; the dome is not
                        // visible in the fog/default-family tests, so the
                        // screen-horizon math needs its own fixture-driven
                        // calibration before re-enabling.)
                        float horizonAngle = elevation / 3.14159265359;
                        float t = exp(-horizonAngle / max(uFadeout, 0.0005));
                        vec3 c0 = mix(uSpaceColor, uHighColor, uHighAlpha);
                        vec3 c1 = mix(c0, uFogColor, uFogAlpha);
                        vec3 c2 = mix(c0, c1, t);
                        // Mapbox blends the gradient with premultiplied alpha
                        // over a clear color of space-color:
                        //   result = space*(1-t) + c2*t
                        // Fold that in here so the dome is self-contained and
                        // does not depend on the canvas clear color.
                        vec3 col = mix(uSpaceColor, c2, t);
                        // The uniforms carry LINEAR colors (THREE.Color working
                        // space); this ShaderMaterial writes gl_FragColor raw,
                        col = mix(col * 12.92, pow(col, vec3(1.0 / 2.4)) * 1.055 - 0.055,
                            vec3(lessThanEqual(col, vec3(0.0031308))));
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
            this.m_skyMesh = new THREE.Mesh(geom, material);
            this.m_skyMesh.frustumCulled = false;
            this.m_skyMesh.renderOrder = 1000;
            this.m_skyMesh.userData.__mbFogAtmosphereDome = true;
            // The screen-horizon reference depends on the LIVE camera pitch —
            // recompute per draw (the pitch is not final at creation time).
            this.m_skyMesh.onBeforeRender = () => {
                const cam = (this.m_mapView as any)?.camera as THREE.PerspectiveCamera | undefined;
                if (!cam) return;
                const canvasEl = (this.m_mapView as any).canvas;
                const height = canvasEl?.clientHeight || canvasEl?.height || 256;
                const fovRad = (cam.fov ?? 36.87) * Math.PI / 180;
                // MapView exposes the mgl pitch as `tilt` (there is no
                // `pitch` property — the old `?? 60` fallback silently pinned
                // the horizon reference to pitch 60, discarding the entire
                // sky at pitch 80, §182).
                const pitchDeg = Math.max((this.m_mapView as any).tilt
                    ?? (this.m_mapView as any).pitch ?? 60, 0.1);
                const pitch = pitchDeg * Math.PI / 180;
                const focal = (height / 2) / Math.tan(fovRad / 2);
                const viewElev = Math.PI / 2 - pitch;
                const h = (height / 2) / Math.tan(fovRad / 2) / Math.tan(pitch);
                // Unclamped: mgl's vertex shader interpolates the frustum rays
                // at u_horizon = line/height without clamping.
                const yH = height / 2 - h * 0.9;
                material.uniforms.uHorizonRefElev.value =
                    viewElev + Math.atan((height / 2 - yH) / focal);
                // Keep the dome INSIDE the far clip plane: at high pitch the
                // engine's far plane can shrink below the dome's 1000-unit
                // radius — vertices beyond `far` are projection-clipped even
                // with frustumCulled=false, silently dropping the whole sky
                // (fog/2d/basic pitch-80 white sky, §182).
                // Camera-relative skysphere: RTE keeps the camera offset
                // from the scene origin, so the dome must follow the camera
                // or its fragment directions (and horizon reference) are
                // skewed — at pitch 80 the whole sky fell into the
                // below-horizon discard (§182).
                const near = cam.near ?? 1;
                const far = cam.far ?? 1000;
                // The dome must sit between the clip planes: at high pitch
                // the engine's near plane grows beyond the fixed 1000-unit
                // radius and the whole dome is near-clipped away (white sky
                // at pitch 80, §182).
                const targetR = Math.min(far * 0.9, Math.max(near * 10, near + 100));
                if (this.m_skyMesh) {
                    this.m_skyMesh.position.copy(cam.position);
                    this.m_skyMesh.scale.setScalar(targetR / 1000);
                }
            };
            this.m_scene.add(this.m_skyMesh);
        } else {
            const material = this.m_skyMesh.material as THREE.ShaderMaterial;
            if (material.uniforms) {
                material.uniforms.uFogColor.value.copy(fog.color);
                material.uniforms.uFogAlpha.value = fog.colorAlpha;
                material.uniforms.uHighColor.value.copy(fog.highColor);
                material.uniforms.uSpaceColor.value.copy(fog.spaceColor);
                material.uniforms.uFadeout.value = fog.horizonBlend;
            }
        }
    }

    applySky(sky: SkySpec | undefined, fog: FogSpec | undefined): void {
        if (!this.m_scene) return;
        // A sky mesh created by `createFogAtmosphereDome` (fog-driven atmosphere
        // glow) must survive this call when no explicit `sky` layer exists — it
        // is only replaced when an explicit sky is actually applied below.
        if (this.m_skyMesh && !this.m_skyMesh.userData.__mbFogAtmosphereDome) {
            this.m_scene.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }
        if (this.m_stars) {
            this.m_scene.remove(this.m_stars);
            this.m_stars = null;
        }

        const isGlobe = (this.m_mapView as any).projection?.type === 1;
        if (isGlobe) {
            return;
        }

        if (!sky) return;

        // An explicit sky replaces the fog-driven atmosphere dome.
        if (this.m_skyMesh && this.m_skyMesh.userData.__mbFogAtmosphereDome) {
            this.m_scene.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }

        const skyType = sky['sky-type'] ?? 'gradient';
        if (skyType === 'gradient') {
            this.createGradientSky(sky);
        } else {
            this.createAtmosphereSky(sky);
        }

        if (fog && fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }

    private createGradientSky(sky: SkySpec): void {
        // Mapbox skybox_gradient: the color ramp is sampled by
        //   progress = acos(dot(dir, centerDirection)) / radius
        // where `dir` is the view ray (skybox coords) and `center` is the
        // `sky-gradient-center` azimuth/elevation converted to a celestial
        // direction. The ramp is built from the `sky-gradient` interpolate
        // expression over `sky-radial-progress`.
        const geom = new THREE.SphereGeometry(500, 32, 16);
        const opacity = sky['sky-opacity'] ?? 1;

        // Build the color-ramp texture from the sky-gradient expression.
        let rampTexture: THREE.DataTexture | null = null;
        let solidColor = new THREE.Color('#88bbee');
        try {
            const { MBMaterialPatchManager } = require('./MBMaterialPatchManager');
            // mgl themes the atmosphere with the FOG scope's LUT
            // (draw_atmosphere.ts) — env.m_colorThemeLut already carries the
            // fog-scoped LUT (see propagateScopedThemes).
            const lut = (sky['sky-gradient-use-theme'] === 'none') ? undefined : this.m_colorThemeLut;
            const grad = sky['sky-gradient'];
            if (Array.isArray(grad) && grad[0] === 'interpolate') {
                rampTexture = MBMaterialPatchManager.buildGradientTexture(grad, lut ?? undefined);
            } else if (grad === 'interpolate' || grad === undefined) {
                // Mapbox style-spec default sky-gradient:
                //   ["interpolate",["linear"],["sky-radial-progress"],0.8,"#87ceeb",1,"white"]
                rampTexture = MBMaterialPatchManager.buildGradientTexture([
                    'interpolate', ['linear'], ['sky-radial-progress'],
                    0.8, '#87ceeb', 1, 'white',
                ], lut ?? undefined);
            } else if (typeof grad === 'string') {
                solidColor = new THREE.Color(grad);
                if (lut) {
                    try {
                        const { applyColorTheme } = require('./MBColorTheme');
                        solidColor = new THREE.Color(applyColorTheme(lut, grad));
                    } catch {}
                }
            }
        } catch {}

        // `sky-gradient-center` [azimuth, elevation] → world direction.
        // Mapbox semantics (verified against skybox gradient render tests):
        // elevation 90 = horizontal (azimuth = compass heading, 0 = north/+Y),
        // elevation 0 = zenith (straight up). The gradient center is the world
        // direction where progress = 0 (the ramp's first color).
        const centerRaw = sky['sky-gradient-center'] ?? [0, 0];
        const azimuth = (centerRaw[0] ?? 0) * Math.PI / 180;
        const elevation = (centerRaw[1] ?? 0) * Math.PI / 180;
        // elevation 90 → horizontal, 0 → up.
        const horiz = Math.sin(elevation);
        const centerDir = new THREE.Vector3(
            horiz * Math.cos(azimuth),
            horiz * Math.sin(azimuth),
            Math.cos(elevation),
        ).normalize();
        const radius = (sky['sky-gradient-radius'] ?? 90) * Math.PI / 180;

        const fog = this.m_fogState;
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: opacity < 1,
            depthWrite: false,
            uniforms: {
                uOpacity: { value: opacity },
                uRamp: { value: rampTexture },
                uCenterDir: { value: new THREE.Vector3(centerDir.x, centerDir.y, centerDir.z) },
                uRadius: { value: Math.max(radius, 1e-6) },
                uSolidColor: { value: solidColor },
                uHasRamp: { value: rampTexture ? 1 : 0 },
                // fog_apply_sky_gradient (skybox_gradient.fragment.glsl FOG
                // define) — same uniforms as the atmosphere-sky path.
                uFogColor: { value: fog ? fog.color.clone() : new THREE.Color(0, 0, 0) },
                uFogAlpha: { value: fog ? fog.alpha : 0 },
                uFogHorizonBlend: { value: fog ? fog.horizonBlendRaw : 1 },
                uHorizonCut: { value: this.m_styleHasBackground ? 1 : 0 },
                // Camera world rotation (mat3): view ray (camera space) →
                // world z-up ray for the fog horizon blend.
                uCamRot: { value: new THREE.Matrix3() },
            },
            vertexShader: `
                varying vec3 vViewPosition;
                void main() {
                    // Camera-space direction: the skybox cube is oriented to the
                    // camera (mapbox skyboxMatrix), so v_uv is the VIEW direction.
                    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = viewPos.xyz;
                    vec4 pos = projectionMatrix * viewPos;
                    // mgl skybox: gl_Position = pos.xyww — sky at far-plane
                    // depth so geometry always covers it.
                    pos.z = pos.w * 0.99999;
                    gl_Position = pos;
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                uniform sampler2D uRamp;
                uniform vec3 uCenterDir;
                uniform float uRadius;
                uniform vec3 uSolidColor;
                uniform float uHasRamp;
                uniform vec3 uFogColor;
                uniform float uFogAlpha;
                uniform float uFogHorizonBlend;
                uniform float uHorizonCut;
                uniform mat3 uCamRot;
                varying vec3 vViewPosition;
                void main() {
                    // dir is the camera-space view ray; uCenterDir is the celestial
                    // direction in the same camera space (rotated by the camera
                    // attitude so the gradient appears fixed in the sky).
                    vec3 dir = normalize(vViewPosition);
                    float c = clamp(dot(dir, uCenterDir), -1.0, 1.0);
                    float progress = clamp(acos(c) / uRadius, 0.0, 1.0);
                    vec3 col = uSolidColor;
                    if (uHasRamp > 0.5) {
                        col = texture(uRamp, vec2(progress, 0.5)).rgb;
                    }
                    // fog_apply_sky_gradient: fog_horizon_blending(world dir)
                    // = u_fog_color.a * exp(-3 * t * t), t = dir.z / hb.
                    vec3 wdir = normalize(uCamRot * dir);
                    if (uHorizonCut > 0.5 && wdir.z <= 0.0) {
                        // mgl's background tiles cover the ground; our
                        // background is the clear color, so cut here (same
                        // as the atmosphere-sky path).
                        discard;
                    }
                    float t = max(0.0, wdir.z / max(uFogHorizonBlend, 1e-4));
                    // uFogColor is a LINEAR THREE.Color; the ramp texture is
                    // stored in sRGB (output-as-is convention of this
                    // material), so encode before mixing.
                    vec3 fogSrgb = mix(uFogColor * 12.92,
                        pow(max(uFogColor, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - 0.055,
                        vec3(lessThanEqual(uFogColor, vec3(0.0031308))));
                    col = mix(col, fogSrgb, uFogAlpha * exp(-3.0 * t * t));
                    gl_FragColor = vec4(col, uOpacity);
                }
            `,
        });

        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_skyMesh.frustumCulled = false;
        this.m_skyMesh.onBeforeRender = (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
            // Rotate the celestial center into camera space so the gradient stays
            // fixed in the sky while the camera pitches/rotates.
            const m = this.m_skyMesh!.material as THREE.ShaderMaterial;
            const viewMatrix = camera.matrixWorldInverse;
            const c = centerDir.clone().transformDirection(viewMatrix).normalize();
            (m.uniforms.uCenterDir.value as THREE.Vector3).copy(c);
            // World rotation for the fog horizon blend's z-up ray.
            (m.uniforms.uCamRot.value as THREE.Matrix3).setFromMatrix4(camera.matrixWorld);
        };
        this.m_scene!.add(this.m_skyMesh);
    }

    private createAtmosphereSky(sky: SkySpec): void {
        // Faithful port of mgl's physical atmosphere:
        //   capture  = skybox_capture.fragment.glsl (Rayleigh/Mie single
        //              scattering, Bruneton constants, Uncharted-2 tonemap)
        //   sampling = skybox.fragment.glsl main() (inverse of the cubemap's
        //              pow-5 horizon warp, sun disk, fog_apply_sky_gradient)
        // mgl pre-renders a 32×32 cubemap once and samples it per pixel; the
        // composed lookup is computed per fragment here instead (static
        // fixtures, no temporal reuse needed).
        const sunPos = sky['sky-atmosphere-sun'] ?? this.m_lightAzimuthalPolar ?? [210, 30];
        // Spec sun is [azimuth, polar] with polar 0 = zenith; mgl
        // getCelestialDirection(az, altitude = 90 - polar) gives, in the
        // y-up sky frame: (cos(alt)·sin(az), sin(alt), cos(alt)·cos(az)).
        const azimuth = degToRad(sunPos[0]);
        const altitude = degToRad(90 - (sunPos[1] ?? 0));
        // The sky frame maps to our z-up world (x east, y north, z up) as
        // sky(x,y,z) = world(x,z,y); the shader converts per fragment the
        // same way, so keep the sun vector in the y-up sky frame.
        const sunDir = new THREE.Vector3(
            Math.cos(altitude) * Math.sin(azimuth),
            Math.sin(altitude),
            Math.cos(altitude) * Math.cos(azimuth),
        );
        const themeSky = (v: string): string => {
            if (!this.m_colorThemeLut || v === undefined) return v;
            try {
                const { applyColorTheme } = require('./MBColorTheme');
                return applyColorTheme(this.m_colorThemeLut, v);
            } catch { return v; }
        };
        // u_color_tint_r/m = property.toPremultipliedRenderColor(): rgb
        // premultiplied by alpha, alpha carried separately (the shader
        // multiplies by .a again — verbatim mgl behavior).
        const parseTint = (raw: any, useThemeNone: boolean): THREE.Vector4 => {
            const themed = useThemeNone ? raw : themeSky(raw);
            const rgb = MBEnvironmentManager.parseMBColor(themed ?? '#ffffff');
            let a = 1;
            const s = String(themed ?? '');
            if (/^#[\da-fA-F]{8}$/.test(s)) a = parseInt(s.slice(7, 9), 16) / 255;
            else {
                const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
                if (m) a = +m[2];
            }
            return new THREE.Vector4(rgb[0] * a, rgb[1] * a, rgb[2] * a, a);
        };
        const tintR = parseTint(
            sky['sky-atmosphere-color'] ?? '#ffffff',
            sky['sky-atmosphere-color-use-theme'] === 'none');
        const tintM = parseTint(
            sky['sky-atmosphere-halo-color'] ?? '#ffffff',
            sky['sky-atmosphere-halo-color-use-theme'] === 'none');
        const sunIntensity = sky['sky-atmosphere-sun-intensity'] ?? 10;
        const opacity = sky['sky-opacity'] ?? 1;
        // sky fog gradient (fog_apply_sky_gradient) — mgl applies it under
        // the FOG define, i.e. when the style carries fog.
        const fog = this.m_fogState;
        // Precompute the 32×32 capture cubemap exactly like mgl's
        // captureSkybox (the RGBA8 store + bilinear sampling shape the
        // near-horizon knee and the smeared sun glow — a per-fragment
        // evaluation does not reproduce them).
        const cubemap = MBEnvironmentManager.captureAtmosphereCubemap(
            sunDir, sunIntensity, tintR, tintM);

        const geom = new THREE.SphereGeometry(500, 32, 16);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: opacity < 1,
            depthWrite: false,
            uniforms: {
                uCubemap: { value: cubemap },
                uSunDir: { value: sunDir },
                uOpacity: { value: opacity },
                uFogColor: { value: fog ? fog.color.clone() : new THREE.Color(0, 0, 0) },
                uFogAlpha: { value: fog ? fog.alpha : 0 },
                uFogHorizonBlend: { value: fog ? fog.horizonBlendRaw : 1 },
                uHorizonCut: { value: this.m_styleHasBackground ? 1 : 0 },
            },
            vertexShader: `
                varying vec3 vWorldDir;
                void main() {
                    // modelMatrix (not raw position): the RTE scene root
                    // carries the world transform, so the fog dome's
                    // convention (modelMatrix * position).xyz is the true
                    // world-space view direction.
                    vWorldDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
                    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    // mgl skybox vertex shader: gl_Position = pos.xyww — the
                    // sky lives at the FAR plane (depth 1.0) so geometry
                    // ALWAYS covers it regardless of distance. Our finite
                    // radius previously depth-occluded distant terrain.
                    pos.z = pos.w * 0.99999;
                    gl_Position = pos;
                }
            `,
            fragmentShader: `
                // Port of mgl skybox.fragment.glsl main(): sample the
                // precomputed capture cubemap through the inverse of the
                // pow-5 horizon warp, then fog gradient + sun disk.
                precision highp float;
                uniform samplerCube uCubemap;
                uniform vec3 uSunDir;
                uniform float uOpacity;
                uniform vec3 uFogColor;
                uniform float uFogAlpha;
                uniform float uFogHorizonBlend;
                uniform float uHorizonCut;
                varying vec3 vWorldDir;

                void main() {
                    vec3 w = normalize(vWorldDir);
                    // world (z-up, x east, y north) → mgl sky frame (y-up):
                    // sky(x, y, z) = world(x, z, y).
                    vec3 v = vec3(w.x, w.z, w.y);
                    // skybox.fragment main(): uv.y = map(pow(|v.y + 0.015|,
                    // 1/5), 0..1, -1..1).
                    vec3 uv = v;
                    uv.y += 0.015;
                    uv.y = pow(abs(uv.y), 0.2);
                    uv.y = uv.y * 2.0 - 1.0;

                    vec3 sky = textureCube(uCubemap, uv).rgb;

                    // fog_apply_sky_gradient(v_uv.xzy, sky): fog_horizon_
                    // blending's camera_dir.z is the up component (v.y).
                    float t = max(0.0, v.y / max(uFogHorizonBlend, 1e-4));
                    sky = mix(sky, uFogColor, uFogAlpha * exp(-3.0 * t * t));

                    // Sun disk (~0.5° angular diameter) on the raw view ray.
                    float cos_angle = dot(v, normalize(uSunDir));
                    sky += 0.1 * smoothstep(
                        0.99996192306 - 1e-5, 0.99996192306 + 1e-5, cos_angle);

                    // mgl's skybox covers the full sphere; opaque content
                    // (incl. the background layer's tiles) depth-occludes it.
                    // Our background is the CLEAR color, so the below-horizon
                    // cut is only kept when a background layer exists
                    // (otherwise mgl shows sky below the horizon too).
                    if (uHorizonCut > 0.5 && w.z <= 0.0) discard;
                    gl_FragColor = vec4(sky * uOpacity, uOpacity);
                }
            `,
        });

        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_skyMesh.frustumCulled = false;
        // NOTE: the engine renders through a camera-relative (RTE) scene
        // root, so a mesh added at scene-local origin is already anchored at
        // the camera — no repositioning needed (and copying the world-space
        // camera position here would displace it by the full mercator
        // world offset).
        this.m_scene!.add(this.m_skyMesh);
    }

    /**
     * Precompute the atmosphere capture cubemap exactly like mgl
     * `captureSkybox` (draw_sky.ts): 6 32×32 RGBA8 faces rendered with the
     * skybox_capture shaders (Rayleigh/Mie single scattering + Uncharted-2
     * tonemap). The RGBA8 store + bilinear sampling shape the near-horizon
     * knee and the smeared sun glow — a per-fragment analytic evaluation
     * does NOT reproduce them (verified numerically against the
     * atmosphere-rayleigh/mie expected images).
     *
     * Face rotations mirror drawSkybox's `mat4.fromYRotation/fromXRotation`
     * table applied to the quad a_pos = (s, t, 1) (s = framebuffer x,
     * t = framebuffer y, both in [-1, 1] at texel centers). The capture
     * vertex shader then flips y and remaps it to [0, 1] before the
     * fragment's pow-5 + bias warp.
     */
    private static captureAtmosphereCubemap(
        sunDir: THREE.Vector3,
        sunIntensity: number,
        tintR: THREE.Vector4,
        tintM: THREE.Vector4,
    ): THREE.CubeTexture {
        const SIZE = 32;
        const BETA_R = [5.5e-6, 13.0e-6, 22.4e-6];
        const BETA_M = 21e-6;
        const MIE_G = 0.76;
        const HR = 8000.0, HM = 1200.0, RP = 6360e3, RA = 6420e3;
        const SAMPLE_STEPS = 10, DENSITY_STEPS = 4;
        const sun = [sunDir.x, sunDir.y, sunDir.z];
        const betaR = BETA_R.map((b, i) => b * [tintR.x, tintR.y, tintR.z][i] * tintR.w);
        // mgl: beta_m = BETA_M * u_color_tint_m.rgb * u_color_tint_m.a —
        // the halo tint scales (and can zero) the mie channel contribution.
        const betaM = [tintM.x, tintM.y, tintM.z].map((c) => BETA_M * c * tintM.w);
        const rayExit = (o: number[], d: number[], r: number): number => {
            const b = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
            const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
            return (-b + Math.sqrt(b * b - 4 * c)) / 2;
        };
        const densAt = (p: number[]): [number, number] => {
            const h = Math.max(
                Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - RP, 0);
            return [Math.exp(-h / HR), Math.exp(-h / HM)];
        };
        const origin = [0, RP, 0];
        const march = (ray: number[]): number[] => {
            const rayLen = rayExit(origin, ray, RA);
            const step = rayLen / SAMPLE_STEPS;
            let accR = 0, accM = 0;
            const sr = [0, 0, 0], sm = [0, 0, 0];
            for (let i = 0; i < SAMPLE_STEPS; i++) {
                const p = [
                    origin[0] + ray[0] * (i + 0.5) * step,
                    origin[1] + ray[1] * (i + 0.5) * step,
                    origin[2] + ray[2] * (i + 0.5) * step,
                ];
                const d = densAt(p);
                accR += d[0] * step; accM += d[1] * step;
                // density to atmosphere along the sun ray
                const sunLen = rayExit(p, sun, RA);
                const sstep = sunLen / DENSITY_STEPS;
                let sR = 0, sM = 0;
                for (let j = 0; j < DENSITY_STEPS; j++) {
                    const q = [
                        p[0] + sun[0] * (j + 0.5) * sstep,
                        p[1] + sun[1] * (j + 0.5) * sstep,
                        p[2] + sun[2] * (j + 0.5) * sstep,
                    ];
                    const dd = densAt(q);
                    sR += dd[0] * sstep; sM += dd[1] * sstep;
                }
                for (let k = 0; k < 3; k++) {
                    const ext = Math.exp(-(BETA_R[k] * tintR.w * (accR + sR) +
                        BETA_M * tintM.w * (accM + sM)));
                    sr[k] += d[0] * ext * step;
                    sm[k] += d[1] * ext * step;
                }
            }
            const cosA = ray[0] * sun[0] + ray[1] * sun[1] + ray[2] * sun[2];
            const phR = (3 / (16 * Math.PI)) * (1 + cosA * cosA);
            const phM = (3 / (8 * Math.PI)) *
                ((1 - MIE_G * MIE_G) * (1 + cosA * cosA)) /
                ((2 + MIE_G * MIE_G) *
                    Math.pow(1 + MIE_G * MIE_G - 2 * MIE_G * cosA, 1.5));
            return [
                (sr[0] * phR * betaR[0] + sm[0] * phM * betaM[0]) * sunIntensity,
                (sr[1] * phR * betaR[1] + sm[1] * phM * betaM[1]) * sunIntensity,
                (sr[2] * phR * betaR[2] + sm[2] * phM * betaM[2]) * sunIntensity,
            ];
        };
        const uncharted2 = (x: number): number => {
            const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
            return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
        };
        // skybox_capture_program hardcodes u_luminance = 5e-5.
        const exposure = Math.log2(2 / Math.pow(5e-5, 4));
        const toByte = (x: number): number =>
            Math.max(0, Math.min(255, Math.round(
                255 * Math.min(1, uncharted2(exposure * x) * 1.0748724675633854))));

        // Face rotations: drawSkyboxFace matrices applied to (s, t, 1).
        const faces: ((s: number, t: number) => number[])[] = [
            (s, t) => [-1, t, s],   // +x  Ry(-90°)
            (s, t) => [1, t, -s],   // -x  Ry(+90°)
            (s, t) => [s, 1, -t],   // +y  Rx(-90°)
            (s, t) => [s, -1, t],   // -y  Rx(+90°)
            (s, t) => [s, t, 1],    // +z  identity
            (s, t) => [-s, t, -1],  // -z  Ry(180°)
        ];
        const images = faces.map((face) => {
            const data = new Uint8Array(SIZE * SIZE * 4);
            for (let j = 0; j < SIZE; j++) {
                const t = (2 * (j + 0.5)) / SIZE - 1;
                for (let i = 0; i < SIZE; i++) {
                    const s = (2 * (i + 0.5)) / SIZE - 1;
                    let p = face(s, t);
                    // skybox_capture.vertex: y flip (GL bottom-left origin),
                    // then remap [-1,1] → [0,1].
                    p = [p[0], (-p[1] + 1) / 2, p[2]];
                    // skybox_capture.fragment: pow-5 warp + bias, normalize.
                    let ray = [p[0], Math.pow(p[1], 5) + 0.015, p[2]];
                    const len = Math.sqrt(ray[0] * ray[0] + ray[1] * ray[1] + ray[2] * ray[2]);
                    ray = [ray[0] / len, ray[1] / len, ray[2] / len];
                    const col = march(ray);
                    const o = (j * SIZE + i) * 4;
                    data[o] = toByte(col[0]);
                    data[o + 1] = toByte(col[1]);
                    data[o + 2] = toByte(col[2]);
                    data[o + 3] = 255;
                }
            }
            // three's cube upload path requires each face to be a
            // DataTexture (uploadCubeTexture reads image[i].isDataTexture).
            const dt = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
            dt.needsUpdate = true;
            return dt;
        });
        const tex = new THREE.CubeTexture(images);
        tex.format = THREE.RGBAFormat;
        tex.type = THREE.UnsignedByteType;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return tex;
    }

    private createStars(intensity: number): void {
        const count = 2000;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = 400;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = Math.random() * 2 + 0.5;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uIntensity: { value: intensity },
            },
            vertexShader: `
                attribute float aSize;
                uniform float uIntensity;
                varying float vAlpha;
                void main() {
                    vAlpha = uIntensity;
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * (300.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = (1.0 - d * 2.0) * vAlpha;
                    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
                }
            `,
        });

        this.m_stars = new THREE.Points(geom, material);
        this.m_scene!.add(this.m_stars);
    }

    async applyBackgroundPattern(
        patternName: string | undefined,
        spriteAtlas: SpriteAtlas | null,
        bgColor: string,
        bgOpacity: number,
        pitchAlignment: string = 'map',
    ): Promise<void> {
        if (!this.m_scene) return;

        if (this.m_backgroundQuad) {
            this.m_scene.remove(this.m_backgroundQuad);
            (this.m_backgroundQuad.geometry as THREE.BufferGeometry).dispose();
            (this.m_backgroundQuad.material as THREE.Material).dispose();
            this.m_backgroundQuad = null;
        }

        if (!patternName || !spriteAtlas) return;

        // Resolve the specific pattern sub-rectangle inside the sprite atlas
        // (image space, origin top-left). Fall back to the full atlas when the
        // named pattern is not present.
        const uv = spriteAtlas.getIconUv(patternName);
        const tex = spriteAtlas.texture.clone();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // NOTE: a sub-rectangle of an atlas CANNOT be tiled with texture
        // offset/repeat — RepeatWrapping repeats the WHOLE atlas. Tiling is
        // done in the fragment shader (see onBeforeCompile below), so the
        // uvTransform stays identity and vMapUv equals the plane's [0,1] uv.
        tex.offset.set(0, 0);
        tex.repeat.set(1, 1);
        let u0 = 0;
        let v0 = 0;
        let w = 1;
        let h = 1;
        if (uv) {
            u0 = uv.uvMin[0];
            v0 = uv.uvMin[1];
            w = Math.max(uv.uvMax[0] - u0, 1e-6);
            h = Math.max(uv.uvMax[1] - v0, 1e-6);
        }
        // Mapbox tiles a background pattern every `displaySize` logical screen
        // pixels (`patternPosition.displaySize` in draw_background/pattern.ts
        // — sprite physical px / sprite pixelRatio), i.e. displaySize × screen
        // DPR in device pixels.
        const iconInfo = spriteAtlas.icons.get(patternName);
        // Sprite display size (logical px) in the given axis.
        const disp = (axis: 0 | 1): number => {
            if (!iconInfo) return 0;
            const pr = Number((iconInfo as any).pixelRatio ?? 1) || 1;
            return (axis === 0 ? iconInfo.width : iconInfo.height) / pr;
        };
        const tileCount = { value: new THREE.Vector2(8, 8) };
        // Pattern phase: mgl anchors the pattern to WORLD pixel 0 (mercator
        // origin lng −180 / lat 85.05), not the screen origin — see
        // get_pattern_pos in _prelude.vertex.glsl (pixel_coord comes from the
        // tile's world pixel offset). At zoom 0 / 64px viewport this is a
        // visible 4px phase vs screen anchoring.
        const tilePhase = { value: new THREE.Vector2(0, 0) };
        const updatePhase = (renderer: THREE.WebGLRenderer): void => {
            try {
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const worldOrigin = new GeoCoordinates(85.05112878, -180);
                const p = (this.m_mapView as any).getScreenPosition(worldOrigin);
                if (!p) return;
                const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
                const css = renderer.getSize(new THREE.Vector2());
                const screenPr = css.x > 0 ? buf.x / css.x : 1;
                const tw = disp(0) * screenPr;
                const th = disp(1) * screenPr;
                if (tw > 0) tilePhase.value.x = ((p.x * screenPr) / tw) % 1;
                if (th > 0) tilePhase.value.y = ((p.y * screenPr) / th) % 1;
            } catch {
                // fall back to screen anchoring
            }
        };
        const updateRepeat = (renderer: THREE.WebGLRenderer): void => {
            const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
            const css = renderer.getSize(new THREE.Vector2());
            const screenPr = css.x > 0 ? buf.x / css.x : 1;
            if (disp(0) > 0 && disp(1) > 0 && buf.x > 0 && buf.y > 0) {
                tileCount.value.set(
                    buf.x / (disp(0) * screenPr),
                    buf.y / (disp(1) * screenPr),
                );
            }
            updatePhase(renderer);
        };
        const renderer0 = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        if (renderer0) updateRepeat(renderer0);
        tex.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({
            map: tex,
            // mapbox's background_pattern shader has no u_color uniform —
            // the pattern is drawn as-is. Multiplying by background-color
            // (default #000000) would paint the whole quad black.
            color: new THREE.Color('#ffffff'),
            transparent: bgOpacity < 1,
            opacity: bgOpacity,
            depthWrite: false,
            depthTest: false,
        });
        // Tile the atlas sub-rectangle in the fragment shader:
        //   tx = fract(uv.x * nx - phaseX), ty = fract((1-uv.y) * ny - phaseY)
        //   (y from top; phase = world-origin screen offset / tile size)
        //   sample uv = (u0 + tx*w, 1 - v0 - ty*h)            (flipY space)
        material.onBeforeCompile = (shader: any) => {
            shader.uniforms.uMBPatOrigin = { value: new THREE.Vector2(u0, v0) };
            shader.uniforms.uMBPatSize = { value: new THREE.Vector2(w, h) };
            shader.uniforms.uMBPatCount = tileCount;
            shader.uniforms.uMBPatPhase = tilePhase;
            // Sprite size in atlas texels (for the half-texel seam inset).
            shader.uniforms.uMBPatPxSize = {
                value: new THREE.Vector2(
                    iconInfo ? iconInfo.width : 1,
                    iconInfo ? iconInfo.height : 1),
            };
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `uniform vec2 uMBPatOrigin; uniform vec2 uMBPatSize; uniform vec2 uMBPatCount; uniform vec2 uMBPatPhase; uniform vec2 uMBPatPxSize;
                 void main() {`,
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
                    vec2 mbPatT = vec2(
                        fract(vMapUv.x * uMBPatCount.x - uMBPatPhase.x),
                        fract((1.0 - vMapUv.y) * uMBPatCount.y - uMBPatPhase.y));
                    // Half-texel inset: LINEAR filtering at the fract seam
                    // would blend in the atlas' neighbouring (padding) texels.
                    vec2 mbPatPx = clamp(1.0 / uMBPatPxSize, 0.0, 0.25);
                    vec2 mbPatF = mbPatPx * 0.5 + mbPatT * (1.0 - mbPatPx);
                    vec2 mbPatUv = vec2(
                        uMBPatOrigin.x + mbPatF.x * uMBPatSize.x,
                        1.0 - uMBPatOrigin.y - mbPatF.y * uMBPatSize.y);
                    vec4 sampledDiffuseColor = texture2D(map, mbPatUv);
                    #ifdef DECODE_VIDEO_TEXTURE
                        sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
                    #endif
                    diffuseColor *= sampledDiffuseColor;
                #endif`,
            );
        };

        const geom = new THREE.PlaneGeometry(2, 2);
        this.m_backgroundQuad = new THREE.Mesh(geom, material);
        this.m_backgroundQuad.frustumCulled = false;
        this.m_backgroundQuad.renderOrder = -10000;

        // The previous placement derived the quad orientation from
        // inverse(projection * view) via setFromRotationMatrix — but the
        // inverse projection is not a rotation matrix, so the extracted
        // quaternion is garbage and the quad ended up edge-on/invisible
        // (every background-pattern case rendered as pure black).
        // Instead: place the quad on the camera axis, oriented with the
        // camera and scaled to exactly cover the frustum at that depth.
        this.m_backgroundQuad.onBeforeRender = (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
            updateRepeat(renderer);
            // Robust fullscreen placement: unproject the four NDC corners at
            // mid-depth and fit the quad to them. Deriving orientation from
            // camera.quaternion / inverse(P·V) is unreliable here (MapView
            // cameras may carry a stale quaternion; inverse projection is not
            // a rotation matrix), which previously left the quad edge-on and
            // invisible.
            camera.updateMatrixWorld();
            const corners: THREE.Vector3[] = [
                new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0),
                new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0),
            ].map(c => c.unproject(camera));
            const center = new THREE.Vector3();
            for (const c of corners) center.add(c);
            center.multiplyScalar(0.25);
            // Edge midpoints → center axes: +x from left/right, +y from
            // bottom/top. This also captures pitch-induced perspective skew.
            const right = corners[2].clone().add(corners[1]).multiplyScalar(0.5)
                .sub(corners[3].clone().add(corners[0]).multiplyScalar(0.5));
            const up = corners[3].clone().add(corners[2]).multiplyScalar(0.5)
                .sub(corners[0].clone().add(corners[1]).multiplyScalar(0.5));
            const normal = right.clone().cross(up).normalize();
            const m = new THREE.Matrix4().makeBasis(
                right.clone().normalize(),
                up.clone().normalize(),
                normal,
            );
            this.m_backgroundQuad!.position.copy(center);
            this.m_backgroundQuad!.quaternion.setFromRotationMatrix(m);
            // PlaneGeometry(2,2) spans ±1 → scale by half the edge lengths.
            this.m_backgroundQuad!.scale.set(right.length() / 2, up.length() / 2, 1);
        };

        this.m_scene.add(this.m_backgroundQuad);
                // The quad is added asynchronously (sprite fetch) — likely after the
        // last scheduled frame. Adding a scene object does not itself request
        // a redraw, so without this the pattern never appears in the capture.
        (this.m_mapView as any).update?.();
    }

    async applyTerrain(
        terrain: { source: string; exaggeration?: number } | undefined,
        demTileUrl: string | null,
        zoom: number = 8,
        center: [number, number] = [0, 0],
        demMaxZoom: number = 22,
        demTileSize: number = 256,
    ): Promise<void> {
        if (!this.m_scene) return;
        // Dispose previous terrain (legacy single mesh + multi-tile controller).
        if (this.m_terrainMesh) {
            this.m_scene.remove(this.m_terrainMesh);
            (this.m_terrainMesh.geometry as THREE.BufferGeometry).dispose();
            (this.m_terrainMesh.material as THREE.Material).dispose();
            this.m_terrainMesh = null;
        }
        if (this.m_terrainController) {
            if (this.m_terrainRteListener) {
                this.m_mapView.removeEventListener(
                    MapViewEventNames.WillRender, this.m_terrainRteListener);
                this.m_terrainRteListener = null;
            }
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        }
        if (!terrain || !demTileUrl) return;

        // Multi-tile terrain: build an N×N grid of DEM tiles around the center,
        // each decoded to R32F and rendered as a skirted mesh. Falls back to the
        // legacy single-tile mesh if the controller cannot run.
        // Mapbox raster-dem semantics: request DEM at the camera zoom, but never
        // above the source's `maxzoom` (reuse the maxzoom parent tile, overzoomed
        // by flywave), and offset one level for tileSize 512/514.
        const tileSizeOffset = demTileSize > 256 ? 1 : 0;
        // mgl raster semantics: a tileSize-512/514 source's URL zoom is one
        // below the display zoom (512-tile scheme), THEN capped at the
        // source maxzoom — capping before the offset requests maxzoom-1 and
        // 404s fixtures that ship only the maxzoom tile
        // (e.g. 13-1310-3166.terrain.514.png at display z16.7).
        const terrainZoom = Math.max(
            0,
            Math.min(Math.floor(zoom) - tileSizeOffset, demMaxZoom),
        );
        try {
            this.m_terrainController = new TerrainController(this.m_scene);
            await this.m_terrainController.build(
                demTileUrl,
                terrainZoom,
                center,
                terrain.exaggeration ?? 1.0,
                1, // radius → 3×3 grid around center
            );
            if (this.m_terrainController.meshCount > 0) {
                // mapbox terrain semantics: content rides the terrain —
                // world-space elevation sampler for the engine's
                // TileObjectRenderer. DORMANT: object-level (single sample
                // per tile object) lifting regressed fog/terrain (+12k) and
                // symbol-elevation (+13.7k) vs its −0.8k gain on
                // import-override — mgl samples PER VERTEX (DisplacedBuffer
                // geometry). Enable when per-vertex displacement lands.
                try {
                    // DORMANT (v2 verdict): fine-geometry-only per-vertex lift
                    // still regressed the road-bearing fixtures (+28k,
                    // identical to v1 — all damage from road ribbons, coarse
                    // fills contributed none). Axis flip CONFIRMED correct
                    // (no-flip: 192406→230109). Remaining calibration needs
                    // visual iteration — see §12.76-76.
                    (this.m_mapView.env as any).terrainElevationSampler = null;
                    (this.m_mapView.env as any).terrainElevationPerVertex = false;
                } catch {}
                // RTE rendering: terrain meshes must live at world − camera
                // every frame (see updateCameraRelative).
                this.m_terrainRteListener = () => {
                    const cam = this.m_mapView.camera;
                    this.m_terrainController?.updateCameraRelative(cam.position);
                };
                this.m_mapView.addEventListener(
                    MapViewEventNames.WillRender, this.m_terrainRteListener);
                return;
            }
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        } catch {}

        // Legacy fallback: single center tile.
        const lat = degToRad(center[1]);
        const n = Math.pow(2, terrainZoom);
        const xTile = Math.floor(((center[0] + 180) / 360) * n);
        const yTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);

        const url = demTileUrl
            .replace('{z}', String(terrainZoom))
            .replace('{x}', String(xTile))
            .replace('{y}', String(yTile));

        try {
            const loader = new THREE.TextureLoader();
            const demTexture = await loader.loadAsync(url);
            demTexture.minFilter = THREE.LinearFilter;
            demTexture.magFilter = THREE.LinearFilter;

            const material = new MapTerrainMaterial();
            material.setDemTexture(demTexture);
            material.setExaggeration(terrain.exaggeration ?? 1.0);

            const geom = createTerrainGrid(
                EarthConstants.EQUATORIAL_CIRCUMFERENCE,
                EarthConstants.EQUATORIAL_CIRCUMFERENCE,
                128,
            );

            this.m_terrainMesh = new THREE.Mesh(geom, material);
            this.m_terrainMesh.position.set(0, 0, 0);
            this.m_scene.add(this.m_terrainMesh);
        } catch {}
    }

    private clearLights(): void {
        if (this.m_ambientLight) { this.m_scene?.remove(this.m_ambientLight); this.m_ambientLight = null; }
        if (this.m_directionalLight) {
            this.m_scene?.remove(this.m_directionalLight);
            this.m_scene?.remove(this.m_directionalLight.target);
            this.m_directionalLight = null;
        }
        if (this.m_hemisphereLight) { this.m_scene?.remove(this.m_hemisphereLight); this.m_hemisphereLight = null; }
        this.m_ambientColor = null;
        this.m_ambientIntensity = 0;
        this.m_directionalColor = null;
        this.m_directionalIntensity = 0;
        this.m_directionalPolar = 0;
        this.m_3DAmbient = null;
        this.m_3DDirectional = null;
    }

    async applyRasterSource(
        rasterTileUrl: string | null,
        zoom: number = 0,
        center: [number, number] = [0, 0],
        paint: Record<string, any> = {},
        layer?: { visibility?: string; minzoom?: number; maxzoom?: number },
    ): Promise<void> {
        if (!this.m_scene) return;
        if (this.m_rasterQuad) {
            this.m_scene.remove(this.m_rasterQuad);
            (this.m_rasterQuad.geometry as THREE.BufferGeometry).dispose();
            (this.m_rasterQuad.material as THREE.Material).dispose();
            this.m_rasterQuad = null;
        }
        // Respect the raster layer's visibility and zoom range.
        if (layer?.visibility === 'none') return;
        if (layer?.minzoom !== undefined && zoom < layer.minzoom) return;
        if (layer?.maxzoom !== undefined && zoom >= layer.maxzoom) return;
        if (!rasterTileUrl) return;

        const lat = degToRad(center[1]);
        const n = Math.pow(2, zoom);
        const xTile = Math.floor(((center[0] + 180) / 360) * n);
        const yTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
        const url = rasterTileUrl
            .replace('{z}', String(zoom))
            .replace('{x}', String(xTile))
            .replace('{y}', String(yTile));

        try {
            const loader = new THREE.TextureLoader();
            const texture = await loader.loadAsync(url);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
            // NOTE: premultiplied upload blanks tiles (r711 regression) —
            // plain alpha blending.

            const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
            const tileSize = C / n;
            const worldX = xTile * tileSize;
            const worldY = yTile * tileSize;

            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: (paint['raster-opacity'] ?? 1) < 1,
                opacity: paint['raster-opacity'] ?? 1,
                side: THREE.DoubleSide,
                depthWrite: false,
            });

            const geom = new THREE.PlaneGeometry(tileSize, tileSize);
            const mesh = new THREE.Mesh(geom, material);
            mesh.position.set(worldX + tileSize / 2, C - worldY - tileSize / 2, 0);
            mesh.renderOrder = -100;
            mesh.frustumCulled = false;
            this.m_rasterQuad = mesh;
            this.m_scene.add(mesh);
        } catch {}
    }

    async applyImageSources(style: any): Promise<void> {
        if (!this.m_scene) return;

        for (const mesh of this.m_imageQuads) {
            (this.m_mapView as any).mapAnchors?.remove?.(mesh);
            this.m_scene.remove(mesh);
            (mesh.geometry as THREE.BufferGeometry).dispose();
            (mesh.material as THREE.Material).dispose();
        }
        this.m_imageQuads = [];

        const sources = style.sources ?? {};
        for (const [sourceId, src] of Object.entries(sources)) {
            const source = src as any;
            if (source.type !== 'image' && source.type !== 'canvas') continue;
            if (!source.coordinates || source.coordinates.length < 4) continue;

            // One quad PER raster layer referencing this source (mgl applies
            // raster-* paints per layer — two layers can share an image
            // source with different raster-elevation / opacity). Layers with
            // visibility:none are skipped individually.
            const rasterLayersForSource: any[] = [];
            for (const l of style.layers ?? []) {
                const layer = l as any;
                if (layer.type === 'raster' && layer.source === sourceId
                    && layer.layout?.visibility !== 'none') {
                    rasterLayersForSource.push(layer);
                }
            }
            if (rasterLayersForSource.length === 0) continue;

            // Canvas source: use the canvas element directly; Image source: fetch URL.
            let texture: THREE.Texture;
            try {
                if (source.type === 'canvas') {
                    const canvasId = source.canvas;
                    const canvasEl = typeof document !== 'undefined'
                        ? (document.getElementById(canvasId) as HTMLCanvasElement)
                        : null;
                    if (!canvasEl) continue;
                    texture = new THREE.CanvasTexture(canvasEl);
                    // Canvas pixels are sRGB-encoded; without this the raw
                    // values pass through the renderer's linear→sRGB output
                    // encode a second time (measured ~1.35× too bright).
                    texture.colorSpace = THREE.SRGBColorSpace;
                } else {
                    const imgUrl = (source.url ?? '').replace(
                        /^local:\/\//,
                        '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/',
                    );
                    if (!imgUrl) continue;
                    const loader = new THREE.TextureLoader();
                    texture = await loader.loadAsync(imgUrl);
                    texture.colorSpace = THREE.SRGBColorSpace;
                }
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                // NOTE: the texture is shared by all layers of this source;
                // per-layer resampling on a shared source takes the first
                // layer's value (rare combination).
                const firstPaint = rasterLayersForSource[0]?.paint ?? {};
                const resampling = firstPaint['raster-resampling'] ?? 'linear';
                if (resampling === 'nearest') {
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                }
                const coords = source.coordinates;
                const proj = (this.m_mapView as any).projection;
                if (!proj) continue;

                const wgs = coords.map((c: number[]) => {
                    const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                    return proj.projectPoint(new GeoCoordinates(c[1], c[0]));
                });

                // Build the quad in WORLD coordinates (projection output,
                // no y-flip) relative to an anchor corner, then register it
                // as a MapAnchor — the engine re-positions anchors into the
                // per-frame-rendered scene root (`world − camera`), which is
                // the only reliable placement for custom geometry (direct
                // m_scene adds never showed up despite in-frustum NDC).
                // mapbox image `coordinates` order: [topLeft, topRight,
                // bottomRight, bottomLeft] — the historical code read them
                // shifted by one (wgs[1] as tl), scrambling the texture.
                const w = (i: number): THREE.Vector3 => new THREE.Vector3(wgs[i].x, wgs[i].y, 0);
                const tl = w(0);
                const tr = w(1);
                const br = w(2);
                const bl = w(3);
                const anchor = tl.clone();

                const positions = new Float32Array([
                    0, 0, 0,
                    tr.x - anchor.x, tr.y - anchor.y, 0,
                    br.x - anchor.x, br.y - anchor.y, 0,
                    bl.x - anchor.x, bl.y - anchor.y, 0,
                ]);
                const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
                const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);

                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                geom.setIndex(new THREE.BufferAttribute(indices, 1));

                // Projective (homography) texture mapping: mgl renders image
                // sources through the raster program's normalize matrix, i.e.
                // a true projective warp of the arbitrary corner quad. A plain
                // two-triangle UV interpolation creases along the diagonal for
                // non-parallelogram coordinates. Solve H: (world x,y,1) ->
                // (u*w, v*w, w) from the 4 corner correspondences and let the
                // GPU's perspective-correct interpolation do the warp:
                // varying vec3 = H * world, fragment uv = varying.xy/z.
                let homography: number[] | null = null;
                try {
                    const A: number[][] = [];
                    const b: number[] = [];
                    const quadUv = [[0, 1], [1, 1], [1, 0], [0, 0]];
                    for (let i = 0; i < 4; i++) {
                        const wx = [tl, tr, br, bl][i].x - anchor.x;
                        const wy = [tl, tr, br, bl][i].y - anchor.y;
                        const [u, v] = quadUv[i];
                        // u = (h0 x + h1 y + h2) / (h6 x + h7 y + h8)
                        A.push([wx, wy, 1, 0, 0, 0, -u * wx, -u * wy]); b.push(u);
                        A.push([0, 0, 0, wx, wy, 1, -v * wx, -v * wy]); b.push(v);
                    }
                    // Gaussian elimination on the 8x8 system.
                    const n = 8;
                    for (let col = 0; col < n; col++) {
                        let piv = col;
                        for (let r = col + 1; r < n; r++) {
                            if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
                        }
                        [A[col], A[piv]] = [A[piv], A[col]];
                        [b[col], b[piv]] = [b[piv], b[col]];
                        const d = A[col][col] || 1e-12;
                        for (let r = 0; r < n; r++) {
                            if (r === col) continue;
                            const f = A[r][col] / d;
                            for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
                            b[r] -= f * b[col];
                        }
                    }
                    homography = [];
                    for (let i = 0; i < n; i++) homography.push(b[i] / (A[i][i] || 1e-12));
                    homography.push(1);
                    // Sanity: corner round trip must be exact.
                    const check = (i: number) => {
                        const wx = [tl, tr, br, bl][i].x - anchor.x;
                        const wy = [tl, tr, br, bl][i].y - anchor.y;
                        const w = homography![6] * wx + homography![7] * wy + 1;
                        const u = (homography![0] * wx + homography![1] * wy + homography![2]) / w;
                        const v = (homography![3] * wx + homography![4] * wy + homography![5]) / w;
                        return Math.abs(u - quadUv[i][0]) < 1e-6 && Math.abs(v - quadUv[i][1]) < 1e-6;
                    };
                    if (!(check(0) && check(1) && check(2) && check(3))) homography = null;
                } catch { homography = null; }

                for (const rasterLayer of rasterLayersForSource) {
                const layerPaint = rasterLayer.paint ?? {};
                const layerIdx = (style.layers ?? []).indexOf(rasterLayer);
                const rasterOpacity = Number(layerPaint['raster-opacity'] ?? 1);
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    transparent: false,
                });

                if (homography) {
                    // Projective warp: replace the per-vertex uv with the
                    // homography-mapped projective varying (interpolated
                    // perspective-correctly by the GPU, matching mgl's
                    // normalize-matrix image rendering).
                    const homForShader = homography;
                    const origHCompile = material.onBeforeCompile;
                    material.onBeforeCompile = (shader: any) => {
                        if (origHCompile) origHCompile.call(material, shader);
                        shader.uniforms.uMBImgH = {
                            value: new THREE.Matrix3(
                                homForShader[0], homForShader[1], homForShader[2],
                                homForShader[3], homForShader[4], homForShader[5],
                                homForShader[6], homForShader[7], homForShader[8]),
                        };
                        shader.vertexShader = shader.vertexShader.replace(
                            'void main() {',
                            'uniform mat3 uMBImgH;\nvarying vec3 vMBImgUvw;\nvoid main() {'
                        );
                        shader.vertexShader = shader.vertexShader.replace(
                            '#include <uv_vertex>',
                            '#include <uv_vertex>\nvMBImgUvw = uMBImgH * vec3(position.xy, 1.0);'
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'void main() {',
                            'varying vec3 vMBImgUvw;\nvoid main() {'
                        );
                        // Route the built-in map sampling through the warped
                        // projective uv. The include marker is still unresolved
                        // at onBeforeCompile time (three inlines chunks after),
                        // so replace the marker with an inlined variant.
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <map_fragment>',
                            `#ifdef USE_MAP
                                vec4 sampledDiffuseColor = texture2D( map, vMBImgUvw.xy / vMBImgUvw.z );
                                diffuseColor *= sampledDiffuseColor;
                            #endif`
                        );
                        // NOTE: the paint-injection path below no longer
                        // samples vMapUv literally — it generates the
                        // projective expression directly when a homography
                        // is active (a post-hoc string swap here would run
                        // before that block is injected).
                    };
                    material.needsUpdate = true;
                }

                // raster paints — the SAME mgl-exact chain as the per-tile
                // raster path (MBMaterialPatchManager.patchRasterMaterial):
                // spin dot-product rotation, average-based saturation,
                // CPU-side contrast/saturation factors, brightness as a
                // direct mix, all in sRGB numeric space. Unlike
                // MapMeshBasicMaterial (identity colorspace_fragment), the
                // built-in MeshBasicMaterial re-encodes after
                // opaque_fragment, so values are decoded back to linear
                // before the write.
                const rawBrightness = layerPaint['raster-brightness'];
                const bMin = Array.isArray(rawBrightness) ? (rawBrightness[0] ?? 0)
                    : (layerPaint['raster-brightness-min'] ?? 0);
                const bMax = Array.isArray(rawBrightness) ? (rawBrightness[1] ?? 1)
                    : (layerPaint['raster-brightness-max'] ?? 1);
                const c0 = Number(layerPaint['raster-contrast'] ?? 0);
                const s0 = Number(layerPaint['raster-saturation'] ?? 0);
                const hueDeg = Number(layerPaint['raster-hue-rotate'] ?? 0);
                const opacityVal = Number.isFinite(rasterOpacity) ? rasterOpacity : 1;
                const hasPaint =
                    bMin !== 0 || bMax !== 1 || c0 !== 0 || s0 !== 0 || hueDeg !== 0 ||
                    opacityVal < 1;
                if (hasPaint) {
                    const conFactor = c0 > 0 ? 1 / (1.001 - c0) : 1 + c0;
                    const satFactor = s0 > 0 ? 1 - 1 / (1.001 - s0) : -s0;
                    const hueRad = hueDeg * Math.PI / 180;
                    // Base under the image: the style background color (mgl
                    // default black when a background layer exists, else the
                    // engine's opaque white).
                    let baseSrgb: [number, number, number] = [1, 1, 1];
                    try {
                        const bgLayer = (style?.layers ?? []).find((l: any) => l.type === 'background');
                        if (bgLayer) {
                            // THREE.Color parses CSS to LINEAR components —
                            // the shader consumes sRGB numerics (same trap as
                            // the per-tile raster path, §12.76-19: only the G
                            // channel of e.g. orange visibly deviates).
                            const bc = new THREE.Color(bgLayer.paint?.['background-color'] ?? '#000000');
                            const bcSrgb = bc.clone().copyLinearToSRGB(bc.clone());
                            baseSrgb = [bcSrgb.r, bcSrgb.g, bcSrgb.b];
                        }
                    } catch {}
                    const origCompile = material.onBeforeCompile;
                    material.onBeforeCompile = (shader: any) => {
                        if (origCompile) origCompile.call(material, shader);
                        shader.uniforms.uMBImgBMin = { value: bMin };
                        shader.uniforms.uMBImgBMax = { value: bMax };
                        shader.uniforms.uMBImgContrast = { value: conFactor };
                        shader.uniforms.uMBImgSat = { value: satFactor };
                        shader.uniforms.uMBImgHue = { value: hueRad };
                        shader.uniforms.uMBImgOpacity = { value: opacityVal };
                        shader.uniforms.uMBImgBase = { value: baseSrgb };
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'void main() {',
                            `uniform float uMBImgBMin; uniform float uMBImgBMax;
                             uniform float uMBImgContrast; uniform float uMBImgSat; uniform float uMBImgHue;
                             uniform float uMBImgOpacity; uniform vec3 uMBImgBase;
                             vec3 mbImgSrgbEnc(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
                             vec3 mbImgSrgbDec(vec3 c) { return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
                             void main() {`
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <opaque_fragment>',
                            `#include <opaque_fragment>
                             {
                                 // gl_FragColor is linear here (sRGB texture
                                 // decoded on sample); colorspace_fragment
                                 // encodes after us. Sample through the
                                 // projective uv when the homography warp is
                                 // active (the plain vMapUv interpolation
                                 // creases non-parallelogram quads).
                                 vec4 imgT = texture2D(map, ${homography ? 'vMBImgUvw.xy / vMBImgUvw.z' : 'vMapUv'});
                                 vec3 mbR = mbImgSrgbEnc(imgT.rgb);
                                 // spin (mgl spinWeights)
                                 float ca = cos(uMBImgHue); float sa = sin(uMBImgHue);
                                 vec3 spin = vec3(
                                     (2.0 * ca + 1.0) / 3.0,
                                     (-1.7320508 * sa - ca + 1.0) / 3.0,
                                     (1.7320508 * sa - ca + 1.0) / 3.0);
                                 mbR = vec3(dot(mbR, spin.xyz), dot(mbR, spin.zxy), dot(mbR, spin.yzx));
                                 float avg = (mbR.r + mbR.g + mbR.b) / 3.0;
                                 mbR += (avg - mbR) * uMBImgSat;
                                 mbR = (mbR - 0.5) * uMBImgContrast + 0.5;
                                 mbR = mix(vec3(uMBImgBMin), vec3(uMBImgBMax), mbR);
                                 // sRGB-domain opaque composite for opacity
                                 // (the framebuffer blends linearly).
                                 vec3 outSrgb = mix(uMBImgBase, mbR, uMBImgOpacity * imgT.a);
                                 gl_FragColor = vec4(mbImgSrgbDec(outSrgb), 1.0);
                             }`
                        );
                    };
                }

                const mesh = new THREE.Mesh(geom, material) as any;
                // Layer order preserves stacking; mgl `raster-elevation`
                // lifts the tile (meters) above the ground plane.
                mesh.renderOrder = -90 + layerIdx * 0.01;
                mesh.frustumCulled = false;
                mesh.anchor = {
                    x: anchor.x, y: anchor.y,
                    z: Number(layerPaint['raster-elevation'] ?? 0),
                };
                (this.m_mapView as any).mapAnchors?.add?.(mesh);
                this.m_imageQuads.push(mesh);
                // mgl `renderWorldCopies` (default on): repeat the image at
                // ±equator world copies — image/wrap fixtures cross the
                // antimeridian and expect the neighbours visible.
                const Cw = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
                const elevZ = Number(layerPaint['raster-elevation'] ?? 0);
                for (const dx of [-Cw, Cw]) {
                    const m2 = new THREE.Mesh(geom, material) as any;
                    m2.renderOrder = -90 + layerIdx * 0.01;
                    m2.frustumCulled = false;
                    m2.anchor = { x: anchor.x + dx, y: anchor.y, z: elevZ };
                    (this.m_mapView as any).mapAnchors?.add?.(m2);
                    this.m_imageQuads.push(m2);
                }
                }
                // Image styles usually have no tile sources — the render loop
                // has already stopped by the time the async image decode
                // finishes. Request a frame so the quad makes it into the
                // capture.
                try {
                    (this.m_mapView as any).update?.();
                } catch {}
            } catch {}
        }
    }

    dispose(): void {
        this.clearLights();
        if (this.m_skyMesh) { this.m_scene?.remove(this.m_skyMesh); this.m_skyMesh = null; }
        if (this.m_stars) { this.m_scene?.remove(this.m_stars); this.m_stars = null; }
        if (this.m_terrainMesh) { this.m_scene?.remove(this.m_terrainMesh); this.m_terrainMesh = null; }
        if (this.m_terrainController) { this.m_terrainController.dispose(); this.m_terrainController = null; }
        if (this.m_backgroundQuad) { this.m_scene?.remove(this.m_backgroundQuad); this.m_backgroundQuad = null; }
        if (this.m_rasterQuad) { this.m_scene?.remove(this.m_rasterQuad); this.m_rasterQuad = null; }
        for (const m of this.m_imageQuads) { this.m_scene?.remove(m); }
        this.m_imageQuads = [];
        if (this.m_fog) { this.m_scene.fog = null; this.m_fog = null; }
    }
}

function degToRad(d: number): number {
    return (d * Math.PI) / 180;
}
