"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBEnvironmentManager = void 0;
const THREE = __importStar(require("three"));
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const MapTerrainMaterial_1 = require("./materials/MapTerrainMaterial");
const TerrainController_1 = require("./TerrainController");
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
#endif
`;
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
	vFogDepth = -mvPosition.z;
	vFogHeight = mvPosition.z + cameraPosition.z;
#endif
`;
if (!('fogAlpha' in THREE.UniformsLib.fog)) {
    THREE.UniformsLib.fog.fogAlpha = { value: 1 };
    THREE.UniformsLib.fog.fogHorizonBlend = { value: 0.05 };
    THREE.UniformsLib.fog.fogCamHeight = { value: 1000 };
    THREE.UniformsLib.fog.fogVertLimit = { value: new THREE.Vector2(0, 0) };
    for (const lib of Object.values(THREE.ShaderLib)) {
        const u = lib.uniforms;
        if (u && typeof u === 'object' && !('fogAlpha' in u)) {
            u.fogAlpha = { value: 1 };
            u.fogHorizonBlend = { value: 0.05 };
            u.fogCamHeight = { value: 1000 };
            u.fogVertLimit = { value: new THREE.Vector2(0, 0) };
        }
    }
}
class MBEnvironmentManager {
    get hasLighting() { return this.m_directionalLight !== null; }
    get use3DLights() { return this.m_use3DLights; }
    get brightness() {
        if (!this.m_ambientColor && !this.m_directionalColor)
            return 0;
        const relativeLuminance = (color) => {
            const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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
    get lightingState() {
        var _a, _b, _c, _d, _e, _f;
        if (!this.m_directionalLight)
            return null;
        const dir = this.m_directionalLight.position.clone().normalize();
        return {
            dir,
            dirColor: ((_a = this.m_directionalLight.color) !== null && _a !== void 0 ? _a : new THREE.Color('#fff')).clone(),
            ambColor: ((_c = (_b = this.m_ambientLight) === null || _b === void 0 ? void 0 : _b.color) !== null && _c !== void 0 ? _c : new THREE.Color('#fff')).clone(),
            dirIntensity: (_d = this.m_directionalLight.intensity) !== null && _d !== void 0 ? _d : 0.5,
            ambIntensity: (_f = (_e = this.m_ambientLight) === null || _e === void 0 ? void 0 : _e.intensity) !== null && _f !== void 0 ? _f : 0.5,
        };
    }
    get lighting3DState() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!this.m_use3DLights)
            return null;
        const ambColor = (_b = (_a = this.m_3DAmbient) === null || _a === void 0 ? void 0 : _a.color) !== null && _b !== void 0 ? _b : [1, 1, 1];
        const ambIntensity = (_d = (_c = this.m_3DAmbient) === null || _c === void 0 ? void 0 : _c.intensity) !== null && _d !== void 0 ? _d : 0.5;
        const dirColor = (_f = (_e = this.m_3DDirectional) === null || _e === void 0 ? void 0 : _e.color) !== null && _f !== void 0 ? _f : [1, 1, 1];
        const dirIntensity = (_h = (_g = this.m_3DDirectional) === null || _g === void 0 ? void 0 : _g.intensity) !== null && _h !== void 0 ? _h : 0.5;
        const direction = (_k = (_j = this.m_3DDirectional) === null || _j === void 0 ? void 0 : _j.direction) !== null && _k !== void 0 ? _k : [210, 30];
        const a = (direction[0] + 90) * Math.PI / 180;
        const p = direction[1] * Math.PI / 180;
        const dirVec = [
            Math.cos(a) * Math.sin(p),
            Math.sin(a) * Math.sin(p),
            Math.cos(p),
        ];
        const sRGBToLinearAndScale = (v, s) => [Math.pow(v[0], 2.2) * s, Math.pow(v[1], 2.2) * s, Math.pow(v[2], 2.2) * s];
        const linearVec3TosRGB = (v) => [Math.pow(v[0], 1 / 2.2), Math.pow(v[1], 1 / 2.2), Math.pow(v[2], 1 / 2.2)];
        const ambientLinear = sRGBToLinearAndScale(ambColor, ambIntensity);
        const dirLinear = sRGBToLinearAndScale(dirColor, dirIntensity);
        const NdotL = dirVec[2];
        const dirLuminance = dirLinear[0] * 0.2126 + dirLinear[1] * 0.7152 + dirLinear[2] * 0.0722;
        const directionalFactorMin = 1 - 0.3 * Math.min(dirLuminance, 1);
        const ambientDirectionalFactor = directionalFactorMin + (1 - directionalFactorMin) * Math.min(NdotL + 1, 1);
        const radiance = [
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
    get extrusionLightState() {
        var _a, _b;
        const degToRad = THREE.MathUtils.degToRad;
        const r = 1.15, azimuthal = 210, polar = 30;
        const a = degToRad(azimuthal + 90), p = degToRad(polar);
        const dir = new THREE.Vector3(r * Math.cos(a) * Math.sin(p), r * Math.sin(a) * Math.sin(p), r * Math.cos(p));
        if (this.m_directionalLight) {
            const c = ((_a = this.m_directionalLight.color) !== null && _a !== void 0 ? _a : new THREE.Color('#fff')).clone();
            return {
                dir: this.m_directionalLight.position.clone(),
                color: c,
                intensity: (_b = this.m_directionalLight.intensity) !== null && _b !== void 0 ? _b : 0.5,
                use3DLights: this.m_use3DLights,
            };
        }
        return { dir, color: new THREE.Color('#ffffff'), intensity: 0.5, use3DLights: this.m_use3DLights };
    }
    get terrainController() { return this.m_terrainController; }
    constructor(m_mapView) {
        var _a;
        this.m_mapView = m_mapView;
        this.m_ambientLight = null;
        this.m_directionalLight = null;
        this.m_hemisphereLight = null;
        this.m_fog = null;
        this.m_skyMesh = null;
        this.m_stars = null;
        this.m_scene = null;
        this.m_use3DLights = false;
        this.m_ambientColor = null;
        this.m_ambientIntensity = 0;
        this.m_directionalColor = null;
        this.m_directionalIntensity = 0;
        this.m_directionalPolar = 0;
        this.m_3DAmbient = null;
        this.m_3DDirectional = null;
        this.m_terrainMesh = null;
        this.m_terrainController = null;
        this.m_backgroundQuad = null;
        this.m_rasterQuad = null;
        this.m_imageQuads = [];
        this.m_colorThemeLut = null;
        this.m_lightsColorThemeLut = null;
        this.m_fogState = null;
        this.m_scene = (_a = m_mapView.m_scene) !== null && _a !== void 0 ? _a : null;
    }
    setColorTheme(lut) {
        this.m_colorThemeLut = lut;
    }
    setLightsColorTheme(lut) {
        this.m_lightsColorThemeLut = lut;
    }
    themeLightColor(v) {
        if (!this.m_lightsColorThemeLut || v === undefined || v === null)
            return v;
        try {
            const { applyColorTheme } = require('./MBColorTheme');
            if (typeof v === 'string')
                return applyColorTheme(this.m_lightsColorThemeLut, v);
            if (Array.isArray(v) && v.length >= 3
                && v.every((c) => typeof c === 'number' && c >= 0 && c <= 1)) {
                const out = applyColorTheme(this.m_lightsColorThemeLut, `rgb(${Math.round(v[0] * 255)}, ${Math.round(v[1] * 255)}, ${Math.round(v[2] * 255)})`);
                const m = out.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
                if (m)
                    return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
            }
        }
        catch (_a) { }
        return v;
    }
    applyLights(lights, legacyLight) {
        var _a, _b, _c, _d, _e;
        if (!this.m_scene)
            return;
        this.clearLights();
        this.m_use3DLights = Array.isArray(lights) && lights.length > 0;
        const renderer = this.m_mapView.renderer;
        if (renderer) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        if (!lights || lights.length === 0) {
            if (legacyLight) {
                const legacyColor = new THREE.Color(this.themeLightColor((_a = legacyLight.color) !== null && _a !== void 0 ? _a : '#ffffff'));
                const legacyIntensity = (_b = legacyLight.intensity) !== null && _b !== void 0 ? _b : 0.5;
                this.m_ambientColor = legacyColor;
                this.m_ambientIntensity = legacyIntensity;
                this.m_ambientLight = new THREE.AmbientLight(legacyColor, legacyIntensity);
                this.m_scene.add(this.m_ambientLight);
                if (legacyLight.position) {
                    const pos = legacyLight.position;
                    this.m_directionalColor = legacyColor;
                    this.m_directionalIntensity = legacyIntensity;
                    this.m_directionalPolar = 0;
                    this.m_directionalLight = new THREE.DirectionalLight(legacyColor, legacyIntensity);
                    this.m_directionalLight.position.set(pos[0], pos[1], pos[2]);
                    this.m_scene.add(this.m_directionalLight);
                }
            }
            else {
                this.m_ambientLight = new THREE.AmbientLight(new THREE.Color('#ffffff'), Math.PI);
                this.m_scene.add(this.m_ambientLight);
            }
            return;
        }
        for (const light of lights) {
            const p = (_c = light.properties) !== null && _c !== void 0 ? _c : light;
            const color = MBEnvironmentManager.parseMBColor(this.themeLightColor((_d = p.color) !== null && _d !== void 0 ? _d : '#ffffff'));
            const intensity = (_e = p.intensity) !== null && _e !== void 0 ? _e : 0.5;
            if (light.type === 'ambient') {
                this.m_3DAmbient = { color, intensity };
                this.m_ambientColor = new THREE.Color(color[0], color[1], color[2]);
                this.m_ambientIntensity = intensity;
                if (!this.m_ambientLight) {
                    this.m_ambientLight = new THREE.AmbientLight(0xffffff, Math.PI);
                    this.m_scene.add(this.m_ambientLight);
                }
            }
            else if (light.type === 'directional') {
                const rawDir = Array.isArray(p.direction) && p.direction[0] === 'literal'
                    ? p.direction[1]
                    : p.direction;
                const direction = Array.isArray(rawDir) && rawDir.length >= 2
                    ? [rawDir[0], rawDir[1]]
                    : [210, 30];
                this.m_3DDirectional = { color, intensity, direction };
                this.m_directionalColor = new THREE.Color(color[0], color[1], color[2]);
                this.m_directionalIntensity = intensity;
                this.m_directionalPolar = direction[1];
                this.m_directionalLight = new THREE.DirectionalLight(new THREE.Color(color[0], color[1], color[2]), intensity);
                const dirVec = this.directionalVec(direction);
                this.m_directionalLight.position.set(dirVec[0], dirVec[1], dirVec[2]);
                if (p['cast-shadow']) {
                    this.m_directionalLight.castShadow = true;
                    this.m_directionalLight.shadow.mapSize.width = 2048;
                    this.m_directionalLight.shadow.mapSize.height = 2048;
                    this.m_directionalLight.shadow.camera.near = 0.1;
                    this.m_directionalLight.shadow.camera.far = 1000;
                }
            }
        }
    }
    directionalVec(direction) {
        const a = (direction[0] + 90) * Math.PI / 180;
        const p = direction[1] * Math.PI / 180;
        return [
            Math.cos(a) * Math.sin(p),
            Math.sin(a) * Math.sin(p),
            Math.cos(p),
        ];
    }
    static parseMBColor(c) {
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
        if (m)
            return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
        try {
            const t = new THREE.Color(s);
            return [t.r, t.g, t.b];
        }
        catch (_a) {
            return [1, 1, 1];
        }
    }
    applyFog(fog, styleZoom = 0) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!this.m_scene)
            return;
        const isGlobe = ((_a = this.m_mapView.projection) === null || _a === void 0 ? void 0 : _a.type) === 1;
        if (isGlobe) {
            return;
        }
        if (this.m_fog) {
            this.m_scene.fog = null;
            this.m_fog = null;
        }
        this.m_fogState = null;
        if (!fog)
            return;
        const evalZoom = (value, fallback) => {
            if (value === undefined)
                return fallback;
            try {
                const { MBExpressionEngine } = require('./MBExpressionEngine');
                const out = MBExpressionEngine.evaluate(value, { zoom: styleZoom, feature: undefined });
                return out !== null && out !== void 0 ? out : fallback;
            }
            catch (_a) {
                return value;
            }
        };
        const rawRange = evalZoom(fog.range, [0.5, 10]);
        const cam = (_b = this.m_mapView) === null || _b === void 0 ? void 0 : _b.camera;
        let nearM = rawRange[0] * 1000;
        let farM = rawRange[1] * 1000;
        if (cam) {
            const fovRad = ((_c = cam.fov) !== null && _c !== void 0 ? _c : 36.87) * Math.PI / 180;
            const shift = 0.5 / Math.tan(fovRad / 2);
            const pitchDeg = Math.min(Math.max((_d = this.m_mapView.pitch) !== null && _d !== void 0 ? _d : 60, 0.1), 89.9);
            const distCam = Math.max(cam.position.z, 1) /
                Math.sin((90 - pitchDeg) * Math.PI / 180);
            const kFog = 3.7;
            nearM = distCam * kFog * (rawRange[0] + shift) / shift;
            farM = distCam * kFog * (rawRange[1] + shift) / shift;
        }
        const evalThemed = (value, fallback, useThemeKey) => {
            const v = evalZoom(value, fallback);
            if (typeof v !== 'string')
                return v;
            if (fog[useThemeKey] === 'none')
                return v;
            if (this.m_colorThemeLut) {
                try {
                    const { applyColorTheme } = require('./MBColorTheme');
                    return applyColorTheme(this.m_colorThemeLut, v);
                }
                catch (_a) { }
            }
            return v;
        };
        const rawColor = evalThemed(fog.color, '#ffffff', 'color-use-theme');
        const color = new THREE.Color(rawColor);
        const colorAlpha = typeof rawColor === 'string' && /^#[\da-fA-F]{8}$/.test(rawColor)
            ? parseInt(rawColor.slice(7, 9), 16) / 255
            : 1;
        let pitchFactor = 1;
        if (cam) {
            const dir = cam.getWorldDirection(new THREE.Vector3());
            const pitchDeg = Math.acos(Math.min(1, Math.max(-1, -dir.z))) * 180 / Math.PI;
            const s = Math.min(Math.max((pitchDeg - 60) / (65 - 60), 0), 1);
            pitchFactor = s * s * (3 - 2 * s);
        }
        const alpha = pitchFactor * colorAlpha;
        this.m_fog = new THREE.Fog(color.getHex(), nearM, farM);
        THREE.UniformsLib.fog.fogAlpha.value = alpha;
        this.m_scene.fog = this.m_fog;
        const rawHorizonBlend = evalZoom(fog['horizon-blend'], ['interpolate', ['linear'], ['zoom'], 4, 0.2, 7, 0.1]);
        const rawSpaceColor = fog['space-color'] !== undefined
            ? evalThemed(fog['space-color'], '#010b19', 'space-color-use-theme')
            : ['interpolate', ['linear'], ['zoom'], 4, '#010b19', 7, '#367ab9'];
        const rawHighColor = evalThemed(fog['high-color'], '#245cdf', 'high-color-use-theme');
        this.m_fogState = {
            color: color.clone(),
            alpha,
            colorAlpha,
            horizonBlend: Number(evalZoom(rawHorizonBlend, 0.2)) * 0.2495 + 0.0005,
            highColor: new THREE.Color(rawHighColor),
            spaceColor: new THREE.Color(evalZoom(rawSpaceColor, '#010b19')),
        };
        THREE.UniformsLib.fog.fogHorizonBlend.value = this.m_fogState.horizonBlend;
        const vRange = evalZoom(fog['vertical-range'], [0, 0]);
        THREE.UniformsLib.fog.fogVertLimit.value.set(Math.min((_e = vRange[0]) !== null && _e !== void 0 ? _e : 0, (_f = vRange[1]) !== null && _f !== void 0 ? _f : 0), (_g = vRange[1]) !== null && _g !== void 0 ? _g : 0);
        const camPos = (_j = (_h = this.m_mapView) === null || _h === void 0 ? void 0 : _h.camera) === null || _j === void 0 ? void 0 : _j.position;
        THREE.UniformsLib.fog.fogCamHeight.value = camPos ? Math.max(camPos.z, 1) : 1000;
        this.createFogAtmosphereDome();
        if (fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }
    createFogAtmosphereDome() {
        if (!this.m_scene || !this.m_fogState)
            return;
        const fog = this.m_fogState;
        if (!this.m_skyMesh) {
            const geom = new THREE.SphereGeometry(1000, 32, 16);
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
                    varying vec3 vWorldPosition;
                    void main() {
                        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
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
                    varying vec3 vWorldPosition;
                    void main() {
                        vec3 dir = normalize(vWorldPosition);
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
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
            this.m_skyMesh = new THREE.Mesh(geom, material);
            this.m_skyMesh.frustumCulled = false;
            this.m_skyMesh.renderOrder = 1000;
            this.m_skyMesh.userData.__mbFogAtmosphereDome = true;
            this.m_skyMesh.onBeforeRender = () => {
                var _a, _b, _c, _d, _e;
                const cam = (_a = this.m_mapView) === null || _a === void 0 ? void 0 : _a.camera;
                if (!cam)
                    return;
                const canvasEl = this.m_mapView.canvas;
                const height = (_c = (_b = canvasEl === null || canvasEl === void 0 ? void 0 : canvasEl.clientHeight) !== null && _b !== void 0 ? _b : canvasEl === null || canvasEl === void 0 ? void 0 : canvasEl.height) !== null && _c !== void 0 ? _c : 256;
                const fovRad = ((_d = cam.fov) !== null && _d !== void 0 ? _d : 36.87) * Math.PI / 180;
                const pitchDeg = Math.max((_e = this.m_mapView.pitch) !== null && _e !== void 0 ? _e : 60, 0.1);
                const pitch = pitchDeg * Math.PI / 180;
                const focal = (height / 2) / Math.tan(fovRad / 2);
                const viewElev = Math.PI / 2 - pitch;
                const h = (height / 2) / Math.tan(fovRad / 2) / Math.tan(pitch);
                const yH = height / 2 - h * 0.9;
                material.uniforms.uHorizonRefElev.value =
                    viewElev + Math.atan((height / 2 - yH) / focal);
            };
            this.m_scene.add(this.m_skyMesh);
        }
        else {
            const material = this.m_skyMesh.material;
            if (material.uniforms) {
                material.uniforms.uFogColor.value.copy(fog.color);
                material.uniforms.uFogAlpha.value = fog.colorAlpha;
                material.uniforms.uHighColor.value.copy(fog.highColor);
                material.uniforms.uSpaceColor.value.copy(fog.spaceColor);
                material.uniforms.uFadeout.value = fog.horizonBlend;
            }
        }
    }
    applySky(sky, fog) {
        var _a, _b;
        if (!this.m_scene)
            return;
        if (this.m_skyMesh && !this.m_skyMesh.userData.__mbFogAtmosphereDome) {
            this.m_scene.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }
        if (this.m_stars) {
            this.m_scene.remove(this.m_stars);
            this.m_stars = null;
        }
        const isGlobe = ((_a = this.m_mapView.projection) === null || _a === void 0 ? void 0 : _a.type) === 1;
        if (isGlobe) {
            return;
        }
        if (!sky)
            return;
        if (this.m_skyMesh && this.m_skyMesh.userData.__mbFogAtmosphereDome) {
            this.m_scene.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }
        const skyType = (_b = sky['sky-type']) !== null && _b !== void 0 ? _b : 'gradient';
        if (skyType === 'gradient') {
            this.createGradientSky(sky);
        }
        else {
            this.createAtmosphereSky(sky);
        }
        if (fog && fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }
    createGradientSky(sky) {
        var _a, _b, _c, _d, _e;
        const geom = new THREE.SphereGeometry(500, 32, 16);
        const opacity = (_a = sky['sky-opacity']) !== null && _a !== void 0 ? _a : 1;
        let rampTexture = null;
        let solidColor = new THREE.Color('#88bbee');
        try {
            const { MBMaterialPatchManager } = require('./MBMaterialPatchManager');
            const grad = sky['sky-gradient'];
            if (Array.isArray(grad) && grad[0] === 'interpolate') {
                rampTexture = MBMaterialPatchManager.buildGradientTexture(grad);
            }
            else if (grad === 'interpolate' || grad === undefined) {
                rampTexture = MBMaterialPatchManager.buildGradientTexture([
                    'interpolate', ['linear'], ['sky-radial-progress'],
                    0.8, '#87ceeb', 1, 'white',
                ]);
            }
            else if (typeof grad === 'string') {
                solidColor = new THREE.Color(grad);
            }
        }
        catch (_f) { }
        const centerRaw = (_b = sky['sky-gradient-center']) !== null && _b !== void 0 ? _b : [0, 0];
        const azimuth = ((_c = centerRaw[0]) !== null && _c !== void 0 ? _c : 0) * Math.PI / 180;
        const elevation = ((_d = centerRaw[1]) !== null && _d !== void 0 ? _d : 0) * Math.PI / 180;
        const horiz = Math.sin(elevation);
        const centerDir = new THREE.Vector3(horiz * Math.cos(azimuth), horiz * Math.sin(azimuth), Math.cos(elevation)).normalize();
        const radius = ((_e = sky['sky-gradient-radius']) !== null && _e !== void 0 ? _e : 90) * Math.PI / 180;
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
            },
            vertexShader: `
                varying vec3 vViewPosition;
                void main() {
                    // Camera-space direction: the skybox cube is oriented to the
                    // camera (mapbox skyboxMatrix), so v_uv is the VIEW direction.
                    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = viewPos.xyz;
                    gl_Position = projectionMatrix * viewPos;
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                uniform sampler2D uRamp;
                uniform vec3 uCenterDir;
                uniform float uRadius;
                uniform vec3 uSolidColor;
                uniform float uHasRamp;
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
                    gl_FragColor = vec4(col, uOpacity);
                }
            `,
        });
        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_skyMesh.frustumCulled = false;
        this.m_skyMesh.onBeforeRender = (renderer, _scene, camera) => {
            const m = this.m_skyMesh.material;
            const viewMatrix = camera.matrixWorldInverse;
            const c = centerDir.clone().transformDirection(viewMatrix).normalize();
            m.uniforms.uCenterDir.value.copy(c);
        };
        this.m_scene.add(this.m_skyMesh);
    }
    createAtmosphereSky(sky) {
        var _a, _b, _c, _d, _e;
        const sunPos = (_a = sky['sky-atmosphere-sun']) !== null && _a !== void 0 ? _a : [0, 90];
        const azimuth = degToRad(sunPos[0]);
        const elevation = degToRad(sunPos[1]);
        const sunColor = new THREE.Color((_b = sky['sky-atmosphere-color']) !== null && _b !== void 0 ? _b : '#ffffff');
        const haloColor = new THREE.Color((_c = sky['sky-atmosphere-halo-color']) !== null && _c !== void 0 ? _c : '#88aacc');
        const sunIntensity = (_d = sky['sky-atmosphere-sun-intensity']) !== null && _d !== void 0 ? _d : 1.0;
        const opacity = (_e = sky['sky-opacity']) !== null && _e !== void 0 ? _e : 0.8;
        const sunDir = new THREE.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
        const geom = new THREE.SphereGeometry(500, 32, 16);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: opacity < 1,
            depthWrite: false,
            uniforms: {
                uSunDir: { value: sunDir },
                uSunColor: { value: sunColor },
                uHaloColor: { value: haloColor },
                uSunIntensity: { value: sunIntensity },
                uOpacity: { value: opacity },
            },
            vertexShader: `
                varying vec3 vWorldDir;
                void main() {
                    vWorldDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                uniform vec3 uHaloColor;
                uniform float uSunIntensity;
                uniform float uOpacity;
                varying vec3 vWorldDir;
                void main() {
                    float d = dot(normalize(vWorldDir), normalize(uSunDir));
                    float sunGlow = pow(max(d, 0.0), 32.0);
                    float haloGlow = pow(max(d, 0.0), 4.0) * 0.3;
                    float horizon = max(vWorldDir.y * 0.5 + 0.5, 0.0);
                    vec3 sky = mix(vec3(0.4, 0.6, 0.9), vec3(0.7, 0.8, 1.0), horizon);
                    sky += uSunColor * sunGlow * uSunIntensity;
                    sky += uHaloColor * haloGlow;
                    gl_FragColor = vec4(sky, uOpacity);
                }
            `,
        });
        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_scene.add(this.m_skyMesh);
    }
    createStars(intensity) {
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
        this.m_scene.add(this.m_stars);
    }
    async applyBackgroundPattern(patternName, spriteAtlas, bgColor, bgOpacity, pitchAlignment = 'map') {
        var _a, _b;
        if (!this.m_scene)
            return;
        if (this.m_backgroundQuad) {
            this.m_scene.remove(this.m_backgroundQuad);
            this.m_backgroundQuad.geometry.dispose();
            this.m_backgroundQuad.material.dispose();
            this.m_backgroundQuad = null;
        }
        if (!patternName || !spriteAtlas)
            return;
        const uv = spriteAtlas.getIconUv(patternName);
        const tex = spriteAtlas.texture.clone();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
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
        const iconInfo = spriteAtlas.icons.get(patternName);
        const disp = (axis) => {
            var _a;
            if (!iconInfo)
                return 0;
            const pr = Number((_a = iconInfo.pixelRatio) !== null && _a !== void 0 ? _a : 1) || 1;
            return (axis === 0 ? iconInfo.width : iconInfo.height) / pr;
        };
        const tileCount = { value: new THREE.Vector2(8, 8) };
        const tilePhase = { value: new THREE.Vector2(0, 0) };
        const updatePhase = (renderer) => {
            try {
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const worldOrigin = new GeoCoordinates(85.05112878, -180);
                const p = this.m_mapView.getScreenPosition(worldOrigin);
                if (!p)
                    return;
                const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
                const css = renderer.getSize(new THREE.Vector2());
                const screenPr = css.x > 0 ? buf.x / css.x : 1;
                const tw = disp(0) * screenPr;
                const th = disp(1) * screenPr;
                if (tw > 0)
                    tilePhase.value.x = ((p.x * screenPr) / tw) % 1;
                if (th > 0)
                    tilePhase.value.y = ((p.y * screenPr) / th) % 1;
            }
            catch (_a) {
            }
        };
        const updateRepeat = (renderer) => {
            const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
            const css = renderer.getSize(new THREE.Vector2());
            const screenPr = css.x > 0 ? buf.x / css.x : 1;
            if (disp(0) > 0 && disp(1) > 0 && buf.x > 0 && buf.y > 0) {
                tileCount.value.set(buf.x / (disp(0) * screenPr), buf.y / (disp(1) * screenPr));
            }
            updatePhase(renderer);
        };
        const renderer0 = this.m_mapView.renderer;
        if (renderer0)
            updateRepeat(renderer0);
        tex.needsUpdate = true;
        const material = new THREE.MeshBasicMaterial({
            map: tex,
            color: new THREE.Color('#ffffff'),
            transparent: bgOpacity < 1,
            opacity: bgOpacity,
            depthWrite: false,
            depthTest: false,
        });
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uMBPatOrigin = { value: new THREE.Vector2(u0, v0) };
            shader.uniforms.uMBPatSize = { value: new THREE.Vector2(w, h) };
            shader.uniforms.uMBPatCount = tileCount;
            shader.uniforms.uMBPatPhase = tilePhase;
            shader.uniforms.uMBPatPxSize = {
                value: new THREE.Vector2(iconInfo ? iconInfo.width : 1, iconInfo ? iconInfo.height : 1),
            };
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform vec2 uMBPatOrigin; uniform vec2 uMBPatSize; uniform vec2 uMBPatCount; uniform vec2 uMBPatPhase; uniform vec2 uMBPatPxSize;
                 void main() {`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
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
                #endif`);
        };
        const geom = new THREE.PlaneGeometry(2, 2);
        this.m_backgroundQuad = new THREE.Mesh(geom, material);
        this.m_backgroundQuad.frustumCulled = false;
        this.m_backgroundQuad.renderOrder = -10000;
        this.m_backgroundQuad.onBeforeRender = (renderer, _scene, camera) => {
            updateRepeat(renderer);
            camera.updateMatrixWorld();
            const corners = [
                new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0),
                new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0),
            ].map(c => c.unproject(camera));
            const center = new THREE.Vector3();
            for (const c of corners)
                center.add(c);
            center.multiplyScalar(0.25);
            const right = corners[2].clone().add(corners[1]).multiplyScalar(0.5)
                .sub(corners[3].clone().add(corners[0]).multiplyScalar(0.5));
            const up = corners[3].clone().add(corners[2]).multiplyScalar(0.5)
                .sub(corners[0].clone().add(corners[1]).multiplyScalar(0.5));
            const normal = right.clone().cross(up).normalize();
            const m = new THREE.Matrix4().makeBasis(right.clone().normalize(), up.clone().normalize(), normal);
            this.m_backgroundQuad.position.copy(center);
            this.m_backgroundQuad.quaternion.setFromRotationMatrix(m);
            this.m_backgroundQuad.scale.set(right.length() / 2, up.length() / 2, 1);
        };
        this.m_scene.add(this.m_backgroundQuad);
        (_b = (_a = this.m_mapView).update) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    async applyTerrain(terrain, demTileUrl, zoom = 8, center = [0, 0], demMaxZoom = 22, demTileSize = 256) {
        var _a, _b;
        if (!this.m_scene)
            return;
        if (this.m_terrainMesh) {
            this.m_scene.remove(this.m_terrainMesh);
            this.m_terrainMesh.geometry.dispose();
            this.m_terrainMesh.material.dispose();
            this.m_terrainMesh = null;
        }
        if (this.m_terrainController) {
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        }
        if (!terrain || !demTileUrl)
            return;
        const tileSizeOffset = demTileSize > 256 ? 1 : 0;
        const terrainZoom = Math.max(0, Math.min(Math.floor(zoom), demMaxZoom) - tileSizeOffset);
        try {
            this.m_terrainController = new TerrainController_1.TerrainController(this.m_scene);
            await this.m_terrainController.build(demTileUrl, terrainZoom, center, (_a = terrain.exaggeration) !== null && _a !== void 0 ? _a : 1.0, 1);
            if (this.m_terrainController.meshCount > 0)
                return;
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        }
        catch (_c) { }
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
            const material = new MapTerrainMaterial_1.MapTerrainMaterial();
            material.setDemTexture(demTexture);
            material.setExaggeration((_b = terrain.exaggeration) !== null && _b !== void 0 ? _b : 1.0);
            const geom = (0, MapTerrainMaterial_1.createTerrainGrid)(flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE, flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE, 128);
            this.m_terrainMesh = new THREE.Mesh(geom, material);
            this.m_terrainMesh.position.set(0, 0, 0);
            this.m_scene.add(this.m_terrainMesh);
        }
        catch (_d) { }
    }
    clearLights() {
        var _a, _b, _c, _d;
        if (this.m_ambientLight) {
            (_a = this.m_scene) === null || _a === void 0 ? void 0 : _a.remove(this.m_ambientLight);
            this.m_ambientLight = null;
        }
        if (this.m_directionalLight) {
            (_b = this.m_scene) === null || _b === void 0 ? void 0 : _b.remove(this.m_directionalLight);
            (_c = this.m_scene) === null || _c === void 0 ? void 0 : _c.remove(this.m_directionalLight.target);
            this.m_directionalLight = null;
        }
        if (this.m_hemisphereLight) {
            (_d = this.m_scene) === null || _d === void 0 ? void 0 : _d.remove(this.m_hemisphereLight);
            this.m_hemisphereLight = null;
        }
        this.m_ambientColor = null;
        this.m_ambientIntensity = 0;
        this.m_directionalColor = null;
        this.m_directionalIntensity = 0;
        this.m_directionalPolar = 0;
        this.m_3DAmbient = null;
        this.m_3DDirectional = null;
    }
    async applyRasterSource(rasterTileUrl, zoom = 0, center = [0, 0], paint = {}, layer) {
        var _a, _b;
        if (!this.m_scene)
            return;
        if (this.m_rasterQuad) {
            this.m_scene.remove(this.m_rasterQuad);
            this.m_rasterQuad.geometry.dispose();
            this.m_rasterQuad.material.dispose();
            this.m_rasterQuad = null;
        }
        if ((layer === null || layer === void 0 ? void 0 : layer.visibility) === 'none')
            return;
        if ((layer === null || layer === void 0 ? void 0 : layer.minzoom) !== undefined && zoom < layer.minzoom)
            return;
        if ((layer === null || layer === void 0 ? void 0 : layer.maxzoom) !== undefined && zoom >= layer.maxzoom)
            return;
        if (!rasterTileUrl)
            return;
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
            const C = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
            const tileSize = C / n;
            const worldX = xTile * tileSize;
            const worldY = yTile * tileSize;
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: ((_a = paint['raster-opacity']) !== null && _a !== void 0 ? _a : 1) < 1,
                opacity: (_b = paint['raster-opacity']) !== null && _b !== void 0 ? _b : 1,
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
        }
        catch (_c) { }
    }
    async applyImageSources(style) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5;
        if (!this.m_scene)
            return;
        for (const mesh of this.m_imageQuads) {
            (_b = (_a = this.m_mapView.mapAnchors) === null || _a === void 0 ? void 0 : _a.remove) === null || _b === void 0 ? void 0 : _b.call(_a, mesh);
            this.m_scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.m_imageQuads = [];
        const sources = (_c = style.sources) !== null && _c !== void 0 ? _c : {};
        for (const [sourceId, src] of Object.entries(sources)) {
            const source = src;
            if (source.type !== 'image' && source.type !== 'canvas')
                continue;
            if (!source.coordinates || source.coordinates.length < 4)
                continue;
            const rasterLayersForSource = [];
            for (const l of (_d = style.layers) !== null && _d !== void 0 ? _d : []) {
                const layer = l;
                if (layer.type === 'raster' && layer.source === sourceId
                    && ((_e = layer.layout) === null || _e === void 0 ? void 0 : _e.visibility) !== 'none') {
                    rasterLayersForSource.push(layer);
                }
            }
            if (rasterLayersForSource.length === 0)
                continue;
            let texture;
            try {
                if (source.type === 'canvas') {
                    const canvasId = source.canvas;
                    const canvasEl = typeof document !== 'undefined'
                        ? document.getElementById(canvasId)
                        : null;
                    if (!canvasEl)
                        continue;
                    texture = new THREE.CanvasTexture(canvasEl);
                }
                else {
                    const imgUrl = ((_f = source.url) !== null && _f !== void 0 ? _f : '').replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    if (!imgUrl)
                        continue;
                    const loader = new THREE.TextureLoader();
                    texture = await loader.loadAsync(imgUrl);
                    texture.colorSpace = THREE.SRGBColorSpace;
                }
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                const firstPaint = (_h = (_g = rasterLayersForSource[0]) === null || _g === void 0 ? void 0 : _g.paint) !== null && _h !== void 0 ? _h : {};
                const resampling = (_j = firstPaint['raster-resampling']) !== null && _j !== void 0 ? _j : 'linear';
                if (resampling === 'nearest') {
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                }
                const coords = source.coordinates;
                const proj = this.m_mapView.projection;
                if (!proj)
                    continue;
                const wgs = coords.map((c) => {
                    const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                    return proj.projectPoint(new GeoCoordinates(c[1], c[0]));
                });
                const w = (i) => new THREE.Vector3(wgs[i].x, wgs[i].y, 0);
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
                let homography = null;
                try {
                    const A = [];
                    const b = [];
                    const quadUv = [[0, 1], [1, 1], [1, 0], [0, 0]];
                    for (let i = 0; i < 4; i++) {
                        const wx = [tl, tr, br, bl][i].x - anchor.x;
                        const wy = [tl, tr, br, bl][i].y - anchor.y;
                        const [u, v] = quadUv[i];
                        A.push([wx, wy, 1, 0, 0, 0, -u * wx, -u * wy]);
                        b.push(u);
                        A.push([0, 0, 0, wx, wy, 1, -v * wx, -v * wy]);
                        b.push(v);
                    }
                    const n = 8;
                    for (let col = 0; col < n; col++) {
                        let piv = col;
                        for (let r = col + 1; r < n; r++) {
                            if (Math.abs(A[r][col]) > Math.abs(A[piv][col]))
                                piv = r;
                        }
                        [A[col], A[piv]] = [A[piv], A[col]];
                        [b[col], b[piv]] = [b[piv], b[col]];
                        const d = A[col][col] || 1e-12;
                        for (let r = 0; r < n; r++) {
                            if (r === col)
                                continue;
                            const f = A[r][col] / d;
                            for (let c = col; c < n; c++)
                                A[r][c] -= f * A[col][c];
                            b[r] -= f * b[col];
                        }
                    }
                    homography = [];
                    for (let i = 0; i < n; i++)
                        homography.push(b[i] / (A[i][i] || 1e-12));
                    homography.push(1);
                    const check = (i) => {
                        const wx = [tl, tr, br, bl][i].x - anchor.x;
                        const wy = [tl, tr, br, bl][i].y - anchor.y;
                        const w = homography[6] * wx + homography[7] * wy + 1;
                        const u = (homography[0] * wx + homography[1] * wy + homography[2]) / w;
                        const v = (homography[3] * wx + homography[4] * wy + homography[5]) / w;
                        return Math.abs(u - quadUv[i][0]) < 1e-6 && Math.abs(v - quadUv[i][1]) < 1e-6;
                    };
                    if (!(check(0) && check(1) && check(2) && check(3)))
                        homography = null;
                }
                catch (_6) {
                    homography = null;
                }
                for (const rasterLayer of rasterLayersForSource) {
                    const layerPaint = (_k = rasterLayer.paint) !== null && _k !== void 0 ? _k : {};
                    const layerIdx = ((_l = style.layers) !== null && _l !== void 0 ? _l : []).indexOf(rasterLayer);
                    const rasterOpacity = Number((_m = layerPaint['raster-opacity']) !== null && _m !== void 0 ? _m : 1);
                    const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                        transparent: false,
                    });
                    if (homography) {
                        const homForShader = homography;
                        const origHCompile = material.onBeforeCompile;
                        material.onBeforeCompile = (shader) => {
                            if (origHCompile)
                                origHCompile.call(material, shader);
                            shader.uniforms.uMBImgH = {
                                value: new THREE.Matrix3(homForShader[0], homForShader[1], homForShader[2], homForShader[3], homForShader[4], homForShader[5], homForShader[6], homForShader[7], homForShader[8]),
                            };
                            shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform mat3 uMBImgH;\nvarying vec3 vMBImgUvw;\nvoid main() {');
                            shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMBImgUvw = uMBImgH * vec3(position.xy, 1.0);');
                            shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'varying vec3 vMBImgUvw;\nvoid main() {');
                            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
                                vec4 sampledDiffuseColor = texture2D( map, vMBImgUvw.xy / vMBImgUvw.z );
                                diffuseColor *= sampledDiffuseColor;
                            #endif`);
                            shader.fragmentShader = shader.fragmentShader.replace('vec4 imgT = texture2D(map, vMapUv);', 'vec4 imgT = texture2D(map, vMBImgUvw.xy / vMBImgUvw.z);');
                        };
                        material.needsUpdate = true;
                    }
                    const rawBrightness = layerPaint['raster-brightness'];
                    const bMin = Array.isArray(rawBrightness) ? ((_o = rawBrightness[0]) !== null && _o !== void 0 ? _o : 0)
                        : ((_p = layerPaint['raster-brightness-min']) !== null && _p !== void 0 ? _p : 0);
                    const bMax = Array.isArray(rawBrightness) ? ((_q = rawBrightness[1]) !== null && _q !== void 0 ? _q : 1)
                        : ((_r = layerPaint['raster-brightness-max']) !== null && _r !== void 0 ? _r : 1);
                    const c0 = Number((_s = layerPaint['raster-contrast']) !== null && _s !== void 0 ? _s : 0);
                    const s0 = Number((_t = layerPaint['raster-saturation']) !== null && _t !== void 0 ? _t : 0);
                    const hueDeg = Number((_u = layerPaint['raster-hue-rotate']) !== null && _u !== void 0 ? _u : 0);
                    const opacityVal = Number.isFinite(rasterOpacity) ? rasterOpacity : 1;
                    const hasPaint = bMin !== 0 || bMax !== 1 || c0 !== 0 || s0 !== 0 || hueDeg !== 0 ||
                        opacityVal < 1;
                    if (hasPaint) {
                        const conFactor = c0 > 0 ? 1 / (1.001 - c0) : 1 + c0;
                        const satFactor = s0 > 0 ? 1 - 1 / (1.001 - s0) : -s0;
                        const hueRad = hueDeg * Math.PI / 180;
                        let baseSrgb = [1, 1, 1];
                        try {
                            const bgLayer = ((_v = style === null || style === void 0 ? void 0 : style.layers) !== null && _v !== void 0 ? _v : []).find((l) => l.type === 'background');
                            if (bgLayer) {
                                const bc = new THREE.Color((_x = (_w = bgLayer.paint) === null || _w === void 0 ? void 0 : _w['background-color']) !== null && _x !== void 0 ? _x : '#000000');
                                const bcSrgb = bc.clone().copyLinearToSRGB(bc.clone());
                                baseSrgb = [bcSrgb.r, bcSrgb.g, bcSrgb.b];
                            }
                        }
                        catch (_7) { }
                        const origCompile = material.onBeforeCompile;
                        material.onBeforeCompile = (shader) => {
                            if (origCompile)
                                origCompile.call(material, shader);
                            shader.uniforms.uMBImgBMin = { value: bMin };
                            shader.uniforms.uMBImgBMax = { value: bMax };
                            shader.uniforms.uMBImgContrast = { value: conFactor };
                            shader.uniforms.uMBImgSat = { value: satFactor };
                            shader.uniforms.uMBImgHue = { value: hueRad };
                            shader.uniforms.uMBImgOpacity = { value: opacityVal };
                            shader.uniforms.uMBImgBase = { value: baseSrgb };
                            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform float uMBImgBMin; uniform float uMBImgBMax;
                             uniform float uMBImgContrast; uniform float uMBImgSat; uniform float uMBImgHue;
                             uniform float uMBImgOpacity; uniform vec3 uMBImgBase;
                             vec3 mbImgSrgbEnc(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
                             vec3 mbImgSrgbDec(vec3 c) { return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
                             void main() {`);
                            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
                             {
                                 // gl_FragColor is linear here (sRGB texture
                                 // decoded on sample); colorspace_fragment
                                 // encodes after us.
                                 vec4 imgT = texture2D(map, vMapUv);
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
                             }`);
                        };
                    }
                    const mesh = new THREE.Mesh(geom, material);
                    mesh.renderOrder = -90 + layerIdx * 0.01;
                    mesh.frustumCulled = false;
                    mesh.anchor = {
                        x: anchor.x, y: anchor.y,
                        z: Number((_y = layerPaint['raster-elevation']) !== null && _y !== void 0 ? _y : 0),
                    };
                    (_0 = (_z = this.m_mapView.mapAnchors) === null || _z === void 0 ? void 0 : _z.add) === null || _0 === void 0 ? void 0 : _0.call(_z, mesh);
                    this.m_imageQuads.push(mesh);
                    const Cw = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
                    const elevZ = Number((_1 = layerPaint['raster-elevation']) !== null && _1 !== void 0 ? _1 : 0);
                    for (const dx of [-Cw, Cw]) {
                        const m2 = new THREE.Mesh(geom, material);
                        m2.renderOrder = -90 + layerIdx * 0.01;
                        m2.frustumCulled = false;
                        m2.anchor = { x: anchor.x + dx, y: anchor.y, z: elevZ };
                        (_3 = (_2 = this.m_mapView.mapAnchors) === null || _2 === void 0 ? void 0 : _2.add) === null || _3 === void 0 ? void 0 : _3.call(_2, m2);
                        this.m_imageQuads.push(m2);
                    }
                }
                try {
                    (_5 = (_4 = this.m_mapView).update) === null || _5 === void 0 ? void 0 : _5.call(_4);
                }
                catch (_8) { }
            }
            catch (_9) { }
        }
    }
    dispose() {
        var _a, _b, _c, _d, _e, _f;
        this.clearLights();
        if (this.m_skyMesh) {
            (_a = this.m_scene) === null || _a === void 0 ? void 0 : _a.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }
        if (this.m_stars) {
            (_b = this.m_scene) === null || _b === void 0 ? void 0 : _b.remove(this.m_stars);
            this.m_stars = null;
        }
        if (this.m_terrainMesh) {
            (_c = this.m_scene) === null || _c === void 0 ? void 0 : _c.remove(this.m_terrainMesh);
            this.m_terrainMesh = null;
        }
        if (this.m_terrainController) {
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        }
        if (this.m_backgroundQuad) {
            (_d = this.m_scene) === null || _d === void 0 ? void 0 : _d.remove(this.m_backgroundQuad);
            this.m_backgroundQuad = null;
        }
        if (this.m_rasterQuad) {
            (_e = this.m_scene) === null || _e === void 0 ? void 0 : _e.remove(this.m_rasterQuad);
            this.m_rasterQuad = null;
        }
        for (const m of this.m_imageQuads) {
            (_f = this.m_scene) === null || _f === void 0 ? void 0 : _f.remove(m);
        }
        this.m_imageQuads = [];
        if (this.m_fog) {
            this.m_scene.fog = null;
            this.m_fog = null;
        }
    }
}
exports.MBEnvironmentManager = MBEnvironmentManager;
function degToRad(d) {
    return (d * Math.PI) / 180;
}
//# sourceMappingURL=MBEnvironmentManager.js.map