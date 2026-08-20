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
exports.MBMaterialPatchManager = void 0;
const THREE = __importStar(require("three"));
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const ElevatedStructures_1 = require("./ElevatedStructures");
const MBAdditiveLineRenderer_1 = require("./MBAdditiveLineRenderer");
const rasterTextureCache = new Map();
const rasterTextureLoader = new THREE.TextureLoader();
const patternTextureCache = new Map();
let patternTextureCacheAtlas = null;
let patternTextureCacheGen = -1;
class MBMaterialPatchManager {
    constructor(dataSource) {
        this.m_patchedTiles = new WeakMap();
        this.m_lastLightSig = '';
        this.m_depthOcclusion = false;
        this.m_depthTexture = null;
        this.m_dataSource = dataSource;
    }
    setDepthOcclusion(active) {
        this.m_depthOcclusion = active;
    }
    setDepthTexture(tex) {
        this.m_depthTexture = tex;
        this.invalidate();
    }
    patchTileMaterials() {
        var _a;
        const tiles = this.m_dataSource.getDecodedTiles();
        const ls = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.lighting3DState;
        const sig = ls ? ls.groundRadiance.map(v => v.toFixed(4)).join(',') : '';
        if (sig !== this.m_lastLightSig) {
            this.m_lastLightSig = sig;
            for (const tile of tiles) {
                for (const obj of tile.objects) {
                    const m = obj.material;
                    if (m && m.__mbGroundLitHandler) {
                        m.needsUpdate = true;
                    }
                }
            }
        }
        for (const tile of tiles) {
            if (!tile.objects || tile.objects.length === 0)
                continue;
            const state = this.m_patchedTiles.get(tile);
            if (state !== undefined && state.objectCount === tile.objects.length)
                continue;
            this.patchTile(tile);
            this.m_patchedTiles.set(tile, { patched: true, objectCount: tile.objects.length });
        }
    }
    patchTile(tile) {
        var _a;
        for (const obj of tile.objects) {
            const tech = (_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique;
            if (!tech)
                continue;
            const material = obj.material;
            if (!material)
                continue;
            this.patchMaterial(material, tech);
            this.applyIconTextFit(obj, tech);
            this.patchIconObject(obj, tech);
            this.generateGuardrails(obj, tech, tile);
            this.registerAdditiveRibbon(obj, tech);
        }
    }
    registerAdditiveRibbon(obj, technique) {
        var _a;
        if (!MBMaterialPatchManager.enableAdditiveDualPass)
            return;
        if (((_a = technique === null || technique === void 0 ? void 0 : technique._paint) === null || _a === void 0 ? void 0 : _a['line-blend-mode']) !== 'additive')
            return;
        if (!obj.isMesh)
            return;
        obj.visible = false;
        if (!technique._isLineRibbon)
            return;
        if (obj.__mbAdditiveRegistered)
            return;
        obj.__mbAdditiveRegistered = true;
        MBAdditiveLineRenderer_1.additiveRibbons.push({ mesh: obj, technique });
    }
    generateGuardrails(obj, technique, tile) {
        const elevation = technique._hdElevation;
        if (!elevation || elevation <= 0)
            return;
        if (obj.__mbGuardrails)
            return;
        if (!obj.isMesh)
            return;
        const mesh = obj;
        const wallMesh = (0, ElevatedStructures_1.createGuardrailMesh)(mesh, elevation);
        if (!wallMesh)
            return;
        obj.__mbGuardrails = true;
        obj.add(wallMesh);
    }
    applyIconTextFit(obj, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const textFit = (_b = (_a = technique._layout) === null || _a === void 0 ? void 0 : _a['icon-text-fit']) !== null && _b !== void 0 ? _b : technique['icon-text-fit'];
        if (!textFit || textFit === 'none')
            return;
        const textWidth = ((_c = technique._textWidth) !== null && _c !== void 0 ? _c : 5);
        const textHeight = ((_d = technique._textHeight) !== null && _d !== void 0 ? _d : 1.2);
        const textSize = ((_g = (_f = (_e = technique._layout) === null || _e === void 0 ? void 0 : _e['text-size']) !== null && _f !== void 0 ? _f : technique['text-size']) !== null && _g !== void 0 ? _g : 16);
        const iconSize = ((_k = (_j = (_h = technique._layout) === null || _h === void 0 ? void 0 : _h['icon-size']) !== null && _j !== void 0 ? _j : technique['icon-size']) !== null && _k !== void 0 ? _k : 1);
        const padding = (_l = technique['icon-text-fit-padding']) !== null && _l !== void 0 ? _l : [0, 0, 0, 0];
        const fitW = textWidth * textSize + padding[0] + padding[2];
        const fitH = textHeight * textSize + padding[1] + padding[3];
        if (obj.isSprite) {
            if (textFit === 'width' || textFit === 'both') {
                obj.scale.x = fitW * iconSize;
            }
            if (textFit === 'height' || textFit === 'both') {
                obj.scale.y = fitH * iconSize;
            }
        }
    }
    resolveTranslate(translate, anchor) {
        var _a, _b;
        const t = translate !== null && translate !== void 0 ? translate : [0, 0];
        if (!t || (t[0] === 0 && t[1] === 0))
            return [0, 0];
        if (anchor === 'viewport') {
            const bearing = ((_b = (_a = this.m_dataSource.mapView) === null || _a === void 0 ? void 0 : _a.heading) !== null && _b !== void 0 ? _b : 0) * Math.PI / 180;
            const cos = Math.cos(bearing);
            const sin = Math.sin(bearing);
            return [t[0] * cos - t[1] * sin, t[0] * sin + t[1] * cos];
        }
        return [t[0], t[1]];
    }
    get centerDem() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.terrainController) === null || _b === void 0 ? void 0 : _b.centerDem) !== null && _c !== void 0 ? _c : null;
    }
    get allDemTiles() {
        var _a, _b;
        const tc = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.terrainController;
        return tc ? (_b = tc.allDemTiles) !== null && _b !== void 0 ? _b : [] : [];
    }
    injectGroundLighting(material, technique, techName) {
        var _a, _b;
        if (material.__mbGroundLitHandler)
            return;
        material.__mbGroundLitHandler = true;
        const paint = (_a = technique._paint) !== null && _a !== void 0 ? _a : {};
        const emissiveKey = techName === 'solid-line' ? 'line-emissive-strength'
            : techName === 'circles' ? 'circle-emissive-strength'
                : 'fill-emissive-strength';
        const emissive = Number((_b = paint[emissiveKey]) !== null && _b !== void 0 ? _b : 0);
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            var _a;
            if (origOnCompile)
                origOnCompile.call(material, shader);
            const ls = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.lighting3DState;
            const rad = ls ? ls.groundRadiance : [1, 1, 1];
            const emi = ls ? emissive : 0;
            const linRad = rad.map((v) => Math.pow(v, 2.2));
            shader.uniforms.uMBGroundRad = { value: linRad };
            shader.uniforms.uMBEmissive = { value: emi };
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform vec3 uMBGroundRad; uniform float uMBEmissive;\nvoid main() {`);
            if (techName === 'circles') {
                shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4(diffuseColor, alpha);', `gl_FragColor = vec4(mix(diffuseColor * uMBGroundRad, diffuseColor, uMBEmissive), alpha);`);
            }
            else if (techName === 'solid-line') {
                shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse, alpha );', `gl_FragColor = vec4(mix(outputDiffuse * uMBGroundRad, outputDiffuse, uMBEmissive), alpha);`);
                shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse * vColor, alpha );', `gl_FragColor = vec4(mix(outputDiffuse * vColor * uMBGroundRad, outputDiffuse * vColor, uMBEmissive), alpha);`);
            }
            else {
                shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
                     gl_FragColor.rgb = mix(gl_FragColor.rgb * uMBGroundRad, gl_FragColor.rgb, uMBEmissive);`);
            }
        };
        material.needsUpdate = true;
    }
    injectExtrusion3DLighting(material, emissiveStrength) {
        if (material.__mbExtrusion3DLit)
            return;
        material.__mbExtrusion3DLit = true;
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            var _a;
            if (origOnCompile)
                origOnCompile.call(material, shader);
            const ls = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.lighting3DState;
            const mapView = this.m_dataSource.mapView;
            const camera = mapView === null || mapView === void 0 ? void 0 : mapView.camera;
            const viewToWorld = camera
                ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
                : new THREE.Matrix3();
            shader.uniforms.uMB3DAmb = { value: ls ? ls.ambientColorLinear : [1, 1, 1] };
            shader.uniforms.uMB3DDirColor = { value: ls ? ls.directionalColorLinear : [1, 1, 1] };
            shader.uniforms.uMB3DDir = { value: ls ? ls.dir : [0, 0, 1] };
            shader.uniforms.uMB3DViewToWorld = { value: viewToWorld };
            shader.uniforms.uMB3DEmissive = { value: ls ? emissiveStrength : 0 };
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir;
                 uniform mat3 uMB3DViewToWorld; uniform float uMB3DEmissive;
                 void main() {`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
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
                 }`);
        };
        material.needsUpdate = true;
    }
    injectLighting(material) {
        var _a;
        const ls = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.lightingState;
        if (!ls)
            return false;
        if (material.__mbLitPatched)
            return false;
        material.__mbLitPatched = true;
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            shader.uniforms.uMBLightDir = { value: ls.dir };
            shader.uniforms.uMBLightDirColor = { value: ls.dirColor };
            shader.uniforms.uMBLightAmbColor = { value: ls.ambColor };
            shader.uniforms.uMBLightDirI = { value: ls.dirIntensity };
            shader.uniforms.uMBLightAmbI = { value: ls.ambIntensity };
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
                 uniform vec3 uMBLightDir; uniform vec3 uMBLightDirColor;
                 uniform vec3 uMBLightAmbColor; uniform float uMBLightDirI; uniform float uMBLightAmbI;`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                 }`);
        };
        material.needsUpdate = true;
        return true;
    }
    injectTerrainDrape(material) {
        const dem = this.centerDem;
        if (!dem)
            return false;
        if (material.__mbDrapePatched)
            return false;
        material.__mbDrapePatched = true;
        const tiles = this.allDemTiles;
        if (tiles.length > 1) {
            this.injectTerrainDrapeMultiTile(material, tiles);
            return true;
        }
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            shader.uniforms.uMBDrapeDem = { value: dem.texture };
            shader.uniforms.uMBDrapeOrigin = { value: new THREE.Vector2(dem.originX, dem.originY) };
            shader.uniforms.uMBDrapeSize = { value: dem.size };
            shader.vertexShader = shader.vertexShader.replace('void main() {', `uniform sampler2D uMBDrapeDem;\nuniform vec2 uMBDrapeOrigin;\nuniform float uMBDrapeSize;\nvoid main() {`);
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `{
                     vec2 mbWP = (modelMatrix * vec4(transformed, 1.0)).xy;
                     vec2 mbDU = (mbWP - uMBDrapeOrigin) / uMBDrapeSize;
                     mbDU = clamp(mbDU, vec2(0.0), vec2(1.0));
                     transformed.z += texture2D(uMBDrapeDem, mbDU).r;
                 }\n#include <project_vertex>`);
        };
        material.needsUpdate = true;
        return true;
    }
    injectTerrainDrapeMultiTile(material, tiles) {
        const origOnCompile = material.onBeforeCompile;
        const N = Math.min(tiles.length, 8);
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            for (let i = 0; i < N; i++) {
                shader.uniforms[`uMBDrapeDem${i}`] = { value: tiles[i].texture };
            }
            shader.uniforms.uMBDrapeTileCount = { value: N };
            const tileData = new Array(N * 3);
            for (let i = 0; i < N; i++) {
                tileData[i * 3 + 0] = tiles[i].originX;
                tileData[i * 3 + 1] = tiles[i].originY;
                tileData[i * 3 + 2] = tiles[i].size;
            }
            shader.uniforms.uMBDrapeTiles = { value: tileData };
            let decl = `uniform int uMBDrapeTileCount;\nuniform vec3 uMBDrapeTiles[${N}];\n`;
            for (let i = 0; i < N; i++)
                decl += `uniform sampler2D uMBDrapeDem${i};\n`;
            shader.vertexShader = shader.vertexShader.replace('void main() {', `${decl}\nvoid main() {`);
            let samplerChain = '';
            for (let i = 0; i < N; i++) {
                samplerChain += `
                if (idx == ${i}) {
                    vec2 uv${i} = (mbWP - uMBDrapeTiles[${i}].xy) / uMBDrapeTiles[${i}].z;
                    uv${i} = clamp(uv${i}, vec2(0.0), vec2(1.0));
                    mbElev = texture2D(uMBDrapeDem${i}, uv${i}).r;
                `;
            }
            for (let i = 0; i < N; i++)
                samplerChain += `}`;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `{
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
                 }\n#include <project_vertex>`);
        };
        material.needsUpdate = true;
    }
    patchMaterial(material, technique) {
        var _a, _b;
        if (material.__mbPatched)
            return;
        material.__mbPatched = true;
        const techName = technique.name;
        const paint = (_a = technique._paint) !== null && _a !== void 0 ? _a : {};
        const layout = (_b = technique._layout) !== null && _b !== void 0 ? _b : {};
        if (techName === 'fill' || techName === 'solid-line' || techName === 'circles') {
            this.injectGroundLighting(material, technique, techName);
        }
        switch (techName) {
            case 'fill':
                if (technique._isLineRibbon) {
                    this.patchFillMaterial(material, paint, technique);
                }
                else if (technique._isHillshade) {
                    this.patchHillshadeMaterial(material, technique);
                }
                else if (technique._rasterTileUrl) {
                    this.patchRasterMaterial(material, technique);
                }
                else if (technique._patternName) {
                    this.patchFillPatternMaterial(material, technique);
                }
                else {
                    this.patchFillMaterial(material, paint, technique);
                }
                break;
            case 'solid-line':
                this.patchLineMaterial(material, paint, layout, technique);
                break;
            case 'circles':
                if (technique._isHeatmap) {
                    this.patchHeatmapMaterial(material, technique);
                }
                else {
                    this.patchCircleMaterial(material, paint);
                }
                break;
            case 'extruded-polygon':
                if (technique._layerId && paint['building-color']) {
                    this.patchBuildingMaterial(material, technique);
                }
                else {
                    this.patchExtrusionMaterial(material, paint, technique);
                }
                break;
        }
    }
    patchRasterMaterial(material, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
        const url = technique._rasterTileUrl;
        if (!url)
            return;
        if (!!this.centerDem)
            this.injectTerrainDrape(material);
        const opacity = (_a = technique.opacity) !== null && _a !== void 0 ? _a : 1;
        if ('opacity' in material) {
            material.opacity = 1;
            material.transparent = false;
        }
        const paint = (_b = technique._paint) !== null && _b !== void 0 ? _b : {};
        const rawBrightness = paint['raster-brightness'];
        const brightness = Array.isArray(rawBrightness)
            ? [(_c = rawBrightness[0]) !== null && _c !== void 0 ? _c : 0, (_d = rawBrightness[1]) !== null && _d !== void 0 ? _d : 1]
            : [(_e = paint['raster-brightness-min']) !== null && _e !== void 0 ? _e : 0, (_f = paint['raster-brightness-max']) !== null && _f !== void 0 ? _f : 1];
        const contrast = paint['raster-contrast'];
        const saturation = paint['raster-saturation'];
        const hue = paint['raster-hue-rotate'];
        const resampling = (_h = (_g = paint['raster-resampling']) !== null && _g !== void 0 ? _g : paint['raster-filtering']) !== null && _h !== void 0 ? _h : 'linear';
        const colorVal = paint['raster-color'];
        const hasRasterColor = colorVal !== undefined && colorVal !== null;
        let rasMix = [0.2126, 0.7152, 0.0722, 0];
        let rasRange = [0, 1];
        let rasRampTex = null;
        if (hasRasterColor) {
            let colorExpr = colorVal;
            try {
                const style = (_k = (_j = this.m_dataSource.styleManager) === null || _j === void 0 ? void 0 : _j.getStyle) === null || _k === void 0 ? void 0 : _k.call(_j);
                const rasterLayer = ((_l = style === null || style === void 0 ? void 0 : style.layers) !== null && _l !== void 0 ? _l : []).find((l) => { var _a; return l.type === 'raster' && Array.isArray((_a = l.paint) === null || _a === void 0 ? void 0 : _a['raster-color']); });
                if (rasterLayer)
                    colorExpr = rasterLayer.paint['raster-color'];
            }
            catch (_y) { }
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
        if (!rasRampTex && String((_o = technique._rasterTileUrl) !== null && _o !== void 0 ? _o : '').endsWith('.mrt')) {
            const d = new Uint8Array([0, 0, 0, 255]);
            const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
            t.minFilter = THREE.NearestFilter;
            t.magFilter = THREE.NearestFilter;
            t.needsUpdate = true;
            rasRampTex = t;
        }
        const hasAdjust = brightness[0] !== 0 || brightness[1] !== 1 ||
            contrast !== undefined || saturation !== undefined ||
            hue !== undefined || colorVal !== undefined;
        const filterType = resampling === 'nearest'
            ? THREE.NearestFilter : THREE.LinearFilter;
        if (((_p = technique._layout) === null || _p === void 0 ? void 0 : _p.visibility) === 'none') {
            material.visible = false;
            return;
        }
        const rect = (_q = technique._rasterUvRect) !== null && _q !== void 0 ? _q : [0, 0, 1, 1];
        let baseSrgb = [1, 1, 1];
        try {
            const style = (_s = (_r = this.m_dataSource.styleManager) === null || _r === void 0 ? void 0 : _r.getStyle) === null || _s === void 0 ? void 0 : _s.call(_r);
            const bgLayer = ((_t = style === null || style === void 0 ? void 0 : style.layers) !== null && _t !== void 0 ? _t : []).find((l) => l.type === 'background');
            if (bgLayer) {
                const lin = new THREE.Color((_v = (_u = bgLayer.paint) === null || _u === void 0 ? void 0 : _u['background-color']) !== null && _v !== void 0 ? _v : '#000000');
                const srgb = lin.clone().copyLinearToSRGB(lin.clone());
                baseSrgb = [srgb.r, srgb.g, srgb.b];
            }
        }
        catch (_z) { }
        let rasFar = Infinity;
        try {
            const mapView = this.m_dataSource.mapView;
            const cam = mapView === null || mapView === void 0 ? void 0 : mapView.camera;
            const tiltDeg = Number((_w = mapView === null || mapView === void 0 ? void 0 : mapView.tilt) !== null && _w !== void 0 ? _w : 0);
            if (cam && tiltDeg > 0) {
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const gc = mapView.geoCenter;
                const focus = mapView.projection.projectPoint(new GeoCoordinates(gc.latitude, gc.longitude));
                const d1 = cam.position.distanceTo(focus);
                const pitch = tiltDeg * Math.PI / 180;
                const fovAbove = (((_x = cam.fov) !== null && _x !== void 0 ? _x : 36.87) * Math.PI / 180) / 2;
                const topHalf = Math.sin(fovAbove) * d1
                    / Math.sin(Math.max(Math.PI / 2 - pitch - fovAbove, 0.01));
                let far = Math.sin(pitch) * topHalf + d1;
                const horizon = d1 / 0.1;
                far = Math.min(far * 1.01, horizon);
                rasFar = far * 3.5;
            }
        }
        catch (_0) { }
        const attach = (texture) => {
            texture.minFilter = filterType;
            texture.magFilter = filterType;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            material.color = new THREE.Color(0xffffff);
            if (material.__mbRasterSampled)
                return;
            material.__mbRasterSampled = true;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                var _a, _b, _c, _d, _e;
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.uMBRasMap = { value: texture };
                shader.uniforms.uMBRasUvOff = { value: [rect[0], rect[1]] };
                shader.uniforms.uMBRasUvScl = { value: [rect[2], rect[3]] };
                shader.uniforms.uMBRasBMin = { value: brightness[0] };
                shader.uniforms.uMBRasBMax = { value: brightness[1] };
                const c0 = contrast !== null && contrast !== void 0 ? contrast : 0;
                const s0 = saturation !== null && saturation !== void 0 ? saturation : 0;
                shader.uniforms.uMBRasContrast = {
                    value: c0 > 0 ? 1 / (1.001 - c0) : 1 + c0,
                };
                shader.uniforms.uMBRasSat = {
                    value: s0 > 0 ? 1 - 1 / (1.001 - s0) : -s0,
                };
                shader.uniforms.uMBRasHue = { value: (hue !== null && hue !== void 0 ? hue : 0) * Math.PI / 180 };
                shader.uniforms.uMBRasBase = { value: baseSrgb };
                shader.uniforms.uMBRasFar = { value: rasFar };
                const padPx = (_a = texture.__mbPadPx) !== null && _a !== void 0 ? _a : [(_c = (_b = texture.image) === null || _b === void 0 ? void 0 : _b.width) !== null && _c !== void 0 ? _c : 256, (_e = (_d = texture.image) === null || _d === void 0 ? void 0 : _d.height) !== null && _e !== void 0 ? _e : 256];
                shader.uniforms.uMBRasPadPx = { value: padPx };
                shader.uniforms.uMBRasFullPx = { value: [padPx[0], padPx[1]] };
                shader.uniforms.uMBRasPadOn = { value: texture.__mbNoPad ? 0 : 1 };
                if (rasRampTex)
                    shader.uniforms.uMBRasRamp = { value: rasRampTex };
                const arrTex = texture.__mbIsRasterArray ? texture : null;
                if (arrTex) {
                    shader.uniforms.uMBArrMix = { value: arrTex.__mbArrMix };
                    shader.uniforms.uMBArrOff = { value: arrTex.__mbArrOffset };
                    shader.uniforms.uMBArrTile = { value: arrTex.__mbArrTile };
                    shader.uniforms.uMBArrBuf = { value: arrTex.__mbArrBuffer };
                    shader.uniforms.uMBArrRes = { value: arrTex.__mbArrTile + 2 * arrTex.__mbArrBuffer };
                }
                const rasRes = new THREE.Vector2(512, 256);
                shader.uniforms.uMBRasRes = { value: rasRes };
                shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec2 vMBRasUv; varying float vMBRasEyeDist; uniform vec2 uMBRasRes;\nvoid main() {');
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMBRasUv = uv;\nvMBRasEyeDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);');
                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
                    {
                        vec2 mbNdc = gl_Position.xy / max(gl_Position.w, 1e-6);
                        vec2 mbPx = (mbNdc * 0.5 + 0.5) * uMBRasRes;
                        mbPx = floor(mbPx + 0.5);
                        mbNdc = mbPx / uMBRasRes * 2.0 - 1.0;
                        gl_Position.xy = mbNdc * gl_Position.w;
                    }`);
                const origBefore = material.onBeforeRender;
                material.onBeforeRender = (renderer, scene, camera, geometry, object, group) => {
                    if (origBefore)
                        origBefore(renderer, scene, camera, geometry, object, group);
                    try {
                        renderer.getSize(rasRes);
                    }
                    catch (_a) { }
                };
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', `varying vec2 vMBRasUv;
                     uniform sampler2D uMBRasMap;
                     uniform vec2 uMBRasUvOff; uniform vec2 uMBRasUvScl;
                     uniform float uMBRasBMin; uniform float uMBRasBMax;
                     uniform float uMBRasContrast; uniform float uMBRasSat; uniform float uMBRasHue;
                     uniform vec3 uMBRasBase;
                     uniform float uMBRasFar;
                     varying float vMBRasEyeDist;
                     uniform vec2 uMBRasPadPx; uniform vec2 uMBRasFullPx; uniform float uMBRasPadOn;\n                     uniform sampler2D uMBRasRamp;\n                     uniform vec4 uMBArrMix; uniform float uMBArrOff; uniform float uMBArrTile; uniform float uMBArrBuf; uniform float uMBArrRes;
                     vec3 mbSrgbEnc(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
                     vec3 mbSrgbDec(vec3 c) { return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
                     void main() {`);
                shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
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
                     ivec2 mbLi = ivec2(mbLc);
                     vec4 mbLT[4];
                     mbLT[0] = texelFetch(uMBRasMap, mbLi);
                     mbLT[1] = texelFetch(uMBRasMap, mbLi + ivec2(1, 0));
                     mbLT[2] = texelFetch(uMBRasMap, mbLi + ivec2(0, 1));
                     mbLT[3] = texelFetch(uMBRasMap, mbLi + ivec2(1, 1));
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
                     float rcT = (mbArrVal.x - ${rasRange[0].toFixed(6)}) / ${Math.max(rasRange[1] - rasRange[0], 1e-6).toFixed(6)};
                     vec4 rcCol = texture2D(uMBRasRamp, vec2(clamp(rcT, 0.0, 1.0), 0.5));
                     mbR = rcCol.rgb;
                     mbRasT.a *= rcCol.a * mbArrVal.y;` : `
                     float rcT = (${rasMix[3].toFixed(6)} + dot(mbSrgbEnc(mbRasT.rgb), vec3(${rasMix[0].toFixed(6)}, ${rasMix[1].toFixed(6)}, ${rasMix[2].toFixed(6)})) - ${rasRange[0].toFixed(6)}) / ${Math.max(rasRange[1] - rasRange[0], 1e-6).toFixed(6)};
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
                         vec3 mbMix = mix(uMBRasBase, mbR, ${opacity.toFixed(3)} * mbRasT.a);
                         gl_FragColor = vec4(mbSrgbDec(mbMix), 1.0);
                     }`);
            };
            material.needsUpdate = true;
        };
        const cached = rasterTextureCache.get(url);
        if (cached) {
            attach(cached);
            return;
        }
        if (url.endsWith('.mrt')) {
            this.loadRasterArrayTexture(url, technique, material, attach, rect);
            return;
        }
        rasterTextureLoader.load(url, (texture) => {
            var _a, _b, _c, _d, _e, _f;
            texture.minFilter = filterType;
            texture.magFilter = filterType;
            let padded = texture;
            const img = texture.image;
            try {
                if (typeof document !== 'undefined' && img) {
                    const w = (_a = img.width) !== null && _a !== void 0 ? _a : img.naturalWidth;
                    const h = (_b = img.height) !== null && _b !== void 0 ? _b : img.naturalHeight;
                    const probe = document.createElement('canvas');
                    probe.width = Math.min(w, 64);
                    probe.height = Math.min(h, 64);
                    const px = probe.getContext('2d');
                    px.drawImage(img, 0, 0, probe.width, probe.height);
                    let hasAlpha = false;
                    try {
                        const data = px.getImageData(0, 0, probe.width, probe.height).data;
                        for (let i = 3; i < data.length; i += 4) {
                            if (data[i] !== 255) {
                                hasAlpha = true;
                                break;
                            }
                        }
                    }
                    catch (_g) { }
                    if (hasAlpha) {
                        padded = new THREE.Texture(img);
                        padded.colorSpace = THREE.SRGBColorSpace;
                        padded.minFilter = filterType;
                        padded.magFilter = filterType;
                        padded.__mbPadPx = [w, h];
                        padded.__mbNoPad = true;
                        padded.needsUpdate = true;
                        rasterTextureCache.set(url, padded);
                        attach(padded);
                        try {
                            (_d = (_c = this.m_dataSource.mapView) === null || _c === void 0 ? void 0 : _c.update) === null || _d === void 0 ? void 0 : _d.call(_c);
                        }
                        catch (_h) { }
                        return;
                    }
                    const cv = document.createElement('canvas');
                    cv.width = w + 2;
                    cv.height = h + 2;
                    const cx = cv.getContext('2d');
                    cx.drawImage(img, 1, 1);
                    cx.drawImage(img, 0, 0, w, 1, 1, 0, w, 1);
                    cx.drawImage(img, 0, h - 1, w, 1, 1, h + 1, w, 1);
                    cx.drawImage(img, 0, 0, 1, h, 0, 1, 1, h);
                    cx.drawImage(img, w - 1, 0, 1, h, w + 1, 1, 1, h);
                    cx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
                    cx.drawImage(img, w - 1, 0, 1, 1, w + 1, 0, 1, 1);
                    cx.drawImage(img, 0, h - 1, 1, 1, 0, h + 1, 1, 1);
                    cx.drawImage(img, w - 1, h - 1, 1, 1, w + 1, h + 1, 1, 1);
                    padded = new THREE.CanvasTexture(cv);
                    padded.colorSpace = THREE.SRGBColorSpace;
                    padded.minFilter = filterType;
                    padded.magFilter = filterType;
                    padded.__mbPadPx = [w, h];
                    padded.needsUpdate = true;
                }
            }
            catch (_j) { }
            rasterTextureCache.set(url, padded);
            attach(padded);
            try {
                (_f = (_e = this.m_dataSource.mapView) === null || _e === void 0 ? void 0 : _e.update) === null || _f === void 0 ? void 0 : _f.call(_e);
            }
            catch (_k) { }
        }, undefined, () => { });
    }
    patchFillMaterial(material, paint, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (technique === null || technique === void 0 ? void 0 : technique._isLineRibbon) {
            material.depthTest = false;
            material.depthWrite = false;
            const blendMode = (_a = technique._paint) === null || _a === void 0 ? void 0 : _a['line-blend-mode'];
            if (blendMode === 'additive') {
                material.blending = THREE.AdditiveBlending;
            }
            else if (blendMode === 'multiply') {
                material.blending = THREE.MultiplyBlending;
                material.premultipliedAlpha = true;
            }
            const widthPx = Number((_b = technique._ribbonWidthPx) !== null && _b !== void 0 ? _b : 1);
            const blurPx = Number((_c = technique._ribbonBlurPx) !== null && _c !== void 0 ? _c : 0);
            const borderDarken = Number(technique._isLineBorder ? 0.6 : 1);
            const dashWorld = technique._dashWorld;
            const hasDash = !!dashWorld && dashWorld[0] > 0 && dashWorld[1] >= 0;
            const dashInvisible = Boolean(technique._dashInvisible);
            const gradientStops = technique._lineGradientStops;
            if (gradientStops && !material.__mbRibbonRamp) {
                material.__mbRibbonRamp =
                    MBMaterialPatchManager.buildGradientTexture(gradientStops);
            }
            const rampTex = material.__mbRibbonRamp;
            const patternName = technique._patternName;
            const patternWorld = technique._ribbonPatternWorld;
            if (patternName && patternWorld && !material.__mbRibbonPat) {
                const pat = this.extractPatternTexture(patternName);
                if (pat) {
                    pat.wrapS = THREE.RepeatWrapping;
                    pat.wrapT = THREE.RepeatWrapping;
                    material.__mbRibbonPat = pat;
                }
            }
            const patTex = material.__mbRibbonPat;
            const patternName2 = technique._patternName2;
            if (patternName2 && patternWorld && !material.__mbRibbonPat2) {
                const pat2 = this.extractPatternTexture(patternName2);
                if (pat2) {
                    pat2.wrapS = THREE.RepeatWrapping;
                    pat2.wrapT = THREE.RepeatWrapping;
                    material.__mbRibbonPat2 = pat2;
                }
            }
            const patTex2 = material.__mbRibbonPat2;
            const patFade = Number((_d = technique._patternFade) !== null && _d !== void 0 ? _d : 0);
            const lt = technique._translate;
            const mapView = this.m_dataSource.mapView;
            const displayZoom = (_e = mapView === null || mapView === void 0 ? void 0 : mapView.zoomLevel) !== null && _e !== void 0 ? _e : 1;
            const mpp = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                (256 * Math.pow(2, displayZoom));
            const fracZoom = displayZoom - Math.floor(displayZoom);
            const fracInv = fracZoom > 0 ? 1 / Math.pow(2, fracZoom) : 1;
            const floorWidthPx = Number((_g = (_f = technique._ribbonFloorWidthPx) !== null && _f !== void 0 ? _f : technique._ribbonWidthPx) !== null && _g !== void 0 ? _g : 1);
            const patVScale = patTex && patternWorld
                ? (widthPx * mpp / 2) / Math.max(patternWorld[1], 1e-9)
                : 0;
            const translateWorld = undefined;
            void lt;
            const hasOffset = Boolean(technique._ribbonHasOffset);
            const featherEnabled = blurPx > 0;
            if (patTex || rampTex || blurPx > 0 || hasDash || dashInvisible) {
                material.transparent = true;
                material.depthWrite = false;
            }
            else {
                material.blending = THREE.CustomBlending;
                material.blendSrc = THREE.SrcAlphaFactor;
                material.blendDst = THREE.OneMinusSrcAlphaFactor;
                material.blendEquation = THREE.AddEquation;
            }
            if (!material.__mbRibbonAA && widthPx > 0) {
                material.__mbRibbonAA = true;
                const trimOffset = technique._trimOffset;
                const hasTrim = Array.isArray(trimOffset) && trimOffset.length === 2;
                let trimColor;
                let trimAlpha = 0;
                let trimFade = [0, 0];
                if (hasTrim) {
                    const tcRaw = technique._trimColor;
                    if (tcRaw && tcRaw !== 'transparent') {
                        trimColor = new THREE.Color(tcRaw);
                        trimAlpha = 1;
                    }
                    const tf = technique._trimFade;
                    if (Array.isArray(tf) && tf.length === 2)
                        trimFade = [tf[0], tf[1]];
                }
                const orig = material.onBeforeCompile;
                material.onBeforeCompile = (shader) => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    if (orig)
                        orig.call(material, shader);
                    shader.uniforms.uMBRibbonWidth = { value: widthPx };
                    shader.uniforms.uMBRibbonBlur = { value: blurPx };
                    if (hasDash) {
                        const dashLayout = (_a = technique._layout) !== null && _a !== void 0 ? _a : {};
                        const dashCap = String((_b = dashLayout['line-cap']) !== null && _b !== void 0 ? _b : 'butt');
                        const dashCapMode = dashCap === 'round' ? 1 : (dashCap === 'square' ? 2 : 0);
                        const dashUnit = (_c = dashLayout['line-width-unit']) !== null && _c !== void 0 ? _c : 'pixels';
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
                            value: new THREE.Vector4((_d = trimColor === null || trimColor === void 0 ? void 0 : trimColor.r) !== null && _d !== void 0 ? _d : 0, (_e = trimColor === null || trimColor === void 0 ? void 0 : trimColor.g) !== null && _e !== void 0 ? _e : 0, (_f = trimColor === null || trimColor === void 0 ? void 0 : trimColor.b) !== null && _f !== void 0 ? _f : 0, trimAlpha),
                        };
                        shader.uniforms.uMBTrimFade = {
                            value: new THREE.Vector2(trimFade[0], trimFade[1]),
                        };
                    }
                    if (rampTex)
                        shader.uniforms.uMBRamp = { value: rampTex };
                    if (patTex && patternWorld) {
                        shader.uniforms.uMBPat = { value: patTex };
                        if (patTex2) {
                            shader.uniforms.uMBPat2 = { value: patTex2 };
                            shader.uniforms.uMBPatFade = { value: patFade };
                        }
                        const patScale = (((_g = technique._layout) === null || _g === void 0 ? void 0 : _g['line-width-unit']) === 'meters')
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
                    shader.vertexShader = shader.vertexShader.replace('void main() {', `attribute float aRibbonEdge;
                          varying float vMBRibbonEdge;
                          ${rampTex || hasTrim ? 'attribute float aRibbonDist;\nvarying float vMBRibbonDist;' : ''}
                          ${patTex || hasDash ? 'attribute float aRibbonLen;\nvarying float vMBRibbonLen;' : ''}
                          ${translateWorld ? 'uniform vec2 uMBTranslate;' : ''}
                          ${hasOffset ? 'attribute vec2 aRibbonOffs;' : ''}
                          void main() {`);
                    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                          vMBRibbonEdge = aRibbonEdge;
                          ${rampTex || hasTrim ? 'vMBRibbonDist = aRibbonDist;' : ''}
                          ${patTex || hasDash ? 'vMBRibbonLen = aRibbonLen;' : ''}
                          ${translateWorld ? 'transformed.xy += uMBTranslate;' : ''}
                          ${hasOffset ? 'transformed.xy += aRibbonOffs;' : ''}`);
                    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `varying float vMBRibbonEdge;
                          uniform float uMBRibbonWidth;
                          uniform float uMBRibbonBlur;
                          ${rampTex || hasTrim ? 'varying float vMBRibbonDist;\nuniform sampler2D uMBRamp;\nuniform vec2 uMBTrimRange;\nuniform vec4 uMBTrimColor;\nuniform vec2 uMBTrimFade;' : ''}
                          ${patTex || hasDash ? `varying float vMBRibbonLen;${patTex ? '\nuniform sampler2D uMBPat;\nuniform float uMBPatUScale;\nuniform float uMBPatVScale;' + (patTex2 ? '\nuniform sampler2D uMBPat2;\nuniform float uMBPatFade;' : '') : ''}${hasDash ? '\nuniform vec2 uMBDashSize;\nuniform float uMBDashCap;\nuniform float uMBDashHalfW;\nuniform float uMBDashPx;' : ''}` : ''}
                          void main() {`);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                             ${technique._isFillOutline ? `
                             // mgl fillOutline (fill_outline.fragment.glsl):
                             // alpha = 1 - smoothstep(0, 1, distPx) — a 1px
                             // screen-space falloff from the boundary line.
                             float mbOutlineDist = abs(vMBRibbonEdge) * uMBRibbonWidth * 0.5;
                             gl_FragColor.a *= 1.0 - smoothstep(0.0, 1.0, mbOutlineDist);` : `
                             float mbDistEdge = (1.0 - abs(vMBRibbonEdge)) * uMBRibbonWidth * 0.5 - 0.5;
                             gl_FragColor.a *= step(-0.5, mbDistEdge);`}
                             ${featherEnabled ? `float mbDistCenter = abs(vMBRibbonEdge) * uMBRibbonWidth * 0.5;
                                 gl_FragColor.a *= clamp(1.0 - mbDistCenter / max(uMBRibbonBlur, 0.5), 0.0, 1.0);` : ''}
                         }`);
                };
                material.needsUpdate = true;
            }
        }
        const translate = this.resolveTranslate(paint['fill-translate'], paint['fill-translate-anchor']);
        const translateWorld = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                var _a;
                const mapViewT = this.m_dataSource.mapView;
                const dZoom = (_a = mapViewT === null || mapViewT === void 0 ? void 0 : mapViewT.zoomLevel) !== null && _a !== void 0 ? _a : 1;
                const mppT = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const outlineColor = paint['fill-outline-color'];
        const hasTerrain = !!this.centerDem;
        const hdElevation = technique === null || technique === void 0 ? void 0 : technique._hdElevation;
        const emissiveStrength = Number((_h = paint['fill-emissive-strength']) !== null && _h !== void 0 ? _h : 0);
        if ((!translateWorld || (translateWorld[0] === 0 && translateWorld[1] === 0)) && !outlineColor && !hasTerrain && hdElevation === undefined && emissiveStrength <= 0)
            return;
        const isLit = material.type === 'MeshStandardMaterial';
        if (emissiveStrength > 0 && isLit && !material.__mbFillEmissive) {
            material.__mbFillEmissive = true;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (orig)
                    orig.call(material, shader);
                shader.uniforms.uMBFillEmissive = { value: emissiveStrength };
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                     gl_FragColor.rgb += vec3(uMBFillEmissive * 0.3);`);
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uMBFillEmissive;\nvoid main() {');
            };
            material.needsUpdate = true;
        }
        if (hasTerrain)
            this.injectTerrainDrape(material);
        if (hdElevation !== undefined && hdElevation !== 0) {
            const elev = hdElevation;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (orig)
                    orig.call(material, shader);
                shader.uniforms.uMBHdElevation = { value: elev };
                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed.z += uMBHdElevation;\n#include <project_vertex>');
                shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float uMBHdElevation;\nvoid main() {');
            };
            material.needsUpdate = true;
        }
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            if (translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0)) {
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translateWorld[0], translateWorld[1]) };
                shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform vec2 uMBTranslate;\nvoid main() {');
                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed.xy += uMBTranslate;\n#include <project_vertex>');
            }
            if (outlineColor) {
                shader.uniforms.uMBOutlineColor = {
                    value: new THREE.Color(outlineColor).convertLinearToSRGB(),
                };
                shader.uniforms.uMBOutlineWidth = { value: 1.0 };
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                     float mbEdge = fwidth(gl_FragCoord.z);
                     if (mbEdge > 0.5) {
                         gl_FragColor.rgb = mix(gl_FragColor.rgb, uMBOutlineColor, 0.8);
                     }`);
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 uMBOutlineColor;\nuniform float uMBOutlineWidth;\nvoid main() {');
            }
        };
        material.needsUpdate = true;
    }
    patchLineMaterial(material, paint, layout, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (!!this.centerDem)
            this.injectTerrainDrape(material);
        const widthUnit = (_a = layout['line-width-unit']) !== null && _a !== void 0 ? _a : 'pixels';
        if (widthUnit === 'meters') {
            const zoom = (_c = (_b = this.m_dataSource.mapView) === null || _b === void 0 ? void 0 : _b.zoomLevel) !== null && _c !== void 0 ? _c : 10;
            const mpp = 40075016.686 * Math.cos(0) / (256 * Math.pow(2, zoom));
            const widthScale = 1 / Math.max(mpp, 0.01);
            if (typeof paint['line-width'] === 'number')
                paint['line-width'] *= widthScale;
            if (typeof paint['line-gap-width'] === 'number')
                paint['line-gap-width'] *= widthScale;
            if (typeof paint['line-blur'] === 'number')
                paint['line-blur'] *= widthScale;
            if (typeof paint['line-offset'] === 'number')
                paint['line-offset'] *= widthScale;
            if (typeof paint['line-border-width'] === 'number')
                paint['line-border-width'] *= widthScale;
            if (typeof technique.lineWidth === 'number')
                technique.lineWidth *= widthScale;
            if (Array.isArray(paint['line-dasharray'])) {
                paint['line-dasharray'] = paint['line-dasharray'].map((v) => v * widthScale);
            }
        }
        const cap = layout['line-cap'];
        const join = layout['line-join'];
        const dashArray = (_d = paint['line-dasharray']) !== null && _d !== void 0 ? _d : layout['line-dasharray'];
        const gapWidth = paint['line-gap-width'];
        const blendMode = paint['line-blend-mode'];
        const emissiveStrength = paint['line-emissive-strength'];
        const translate = this.resolveTranslate((_f = (_e = paint['line-translate']) !== null && _e !== void 0 ? _e : technique._translate) !== null && _f !== void 0 ? _f : [0, 0], (_h = (_g = paint['line-translate-anchor']) !== null && _g !== void 0 ? _g : technique._translateAnchor) !== null && _h !== void 0 ? _h : 'map');
        const gradientStops = technique._lineGradientStops;
        const borderGradientRaw = paint['line-border-gradient'];
        const borderGradientStops = borderGradientRaw
            ? MBMaterialPatchManager.normalizeGradientStops(borderGradientRaw)
            : undefined;
        const hasBorderGradient = Array.isArray(borderGradientStops) && borderGradientStops.length > 1;
        const patternName = technique._patternName;
        const trimOffset = (_k = (_j = paint['line-trim-offset']) !== null && _j !== void 0 ? _j : paint['line-pattern-trim-offset']) !== null && _k !== void 0 ? _k : layout['line-trim-offset'];
        const hasTrim = Array.isArray(trimOffset) && trimOffset.length === 2;
        let modified = false;
        if (blendMode === 'additive') {
            material.blending = THREE.AdditiveBlending;
            material.transparent = true;
            material.depthWrite = false;
            modified = true;
        }
        else if (blendMode === 'multiply') {
            material.blending = THREE.MultiplyBlending;
            material.premultipliedAlpha = true;
            material.transparent = true;
            modified = true;
        }
        if (cap) {
            const capMap = {
                butt: 'None', round: 'Round', square: 'Square',
            };
            const capValue = capMap[cap];
            if (capValue && typeof material.caps !== 'undefined') {
                material.caps = capValue;
                modified = true;
            }
        }
        if (join) {
            const joinMap = {
                bevel: 'Bevel', round: 'Round', miter: 'Miter',
            };
            const joinValue = joinMap[join];
            if (joinValue && typeof material.setJoinType === 'function') {
                material.setJoinType(joinValue);
                modified = true;
            }
            else if (joinValue) {
                if (!material.__mbJoinPatched) {
                    material.__mbJoinPatched = true;
                    const jv = joinValue;
                    const origCompile = material.onBeforeCompile;
                    material.onBeforeCompile = (shader) => {
                        var _a;
                        if (origCompile)
                            origCompile.call(material, shader);
                        shader.defines = (_a = shader.defines) !== null && _a !== void 0 ? _a : {};
                        shader.defines.JOIN_MODE = jv.toUpperCase();
                    };
                    material.needsUpdate = true;
                }
                modified = true;
            }
        }
        if (gapWidth && gapWidth > 0 && 'secondaryWidth' in material) {
            material.secondaryWidth = gapWidth;
            modified = true;
        }
        const borderWidth = paint['line-border-width'];
        const borderColor = paint['line-border-color'];
        if (typeof borderWidth === 'number' && borderWidth > 0 && 'outlineWidth' in material) {
            material.outlineWidth = borderWidth;
            if (borderColor !== undefined) {
                material.outlineColor = new THREE.Color(borderColor).convertLinearToSRGB();
            }
            modified = true;
        }
        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
        const hasGradient = Array.isArray(gradientStops) && gradientStops.length > 1;
        const hasEmissive = typeof emissiveStrength === 'number' && emissiveStrength > 0;
        const patternTex = patternName ? this.extractPatternTexture(patternName) : undefined;
        const lineOcclusionOpacity = Number((_l = paint['line-occlusion-opacity']) !== null && _l !== void 0 ? _l : 0);
        const hasOcclusion = this.m_depthOcclusion && this.m_depthTexture && lineOcclusionOpacity >= 0;
        if (hasTranslate || hasGradient || hasBorderGradient || patternTex || hasEmissive || hasTrim || hasOcclusion) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                if (hasTrim) {
                    shader.uniforms.uMBTrimRange = { value: new THREE.Vector2(trimOffset[0], trimOffset[1]) };
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uMBTrimRange;');
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                         {
                             float mbProg = fract(vCoords.x);
                             if (mbProg < uMBTrimRange.x || mbProg > uMBTrimRange.y) discard;
                         }`);
                }
                if (hasTranslate) {
                    shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translate[0], translate[1]) };
                    shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform vec2 uMBTranslate;\nvoid main() {');
                    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed.xy += uMBTranslate;\n#include <project_vertex>');
                }
                if ((hasGradient && !patternTex) || hasBorderGradient) {
                    const gradStops = hasBorderGradient ? borderGradientStops : gradientStops;
                    const tex = MBMaterialPatchManager.buildGradientTexture(gradStops, paint['line-gradient-use-theme'] === 'none' ? undefined : this.colorThemeLut);
                    shader.uniforms.uMBGradient = { value: tex };
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMBGradient;');
                    if (hasBorderGradient) {
                        shader.fragmentShader = shader.fragmentShader.replace('vec3 outputDiffuse = diffuseColor;', `vec3 outputDiffuse = diffuseColor;
                             outputDiffuse = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;`);
                        shader.fragmentShader = shader.fragmentShader.replace('vec3 outlineColor;', 'vec3 outlineColor;\n    outlineColor = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;');
                    }
                    else {
                        shader.fragmentShader = shader.fragmentShader.replace('vec3 outputDiffuse = diffuseColor;', `vec3 outputDiffuse = diffuseColor;
                             outputDiffuse = texture2D(uMBGradient, vec2(fract(vCoords.x), 0.5)).rgb;`);
                    }
                }
                if (patternTex) {
                    const lineCrossFade = (_a = technique._patternCrossFade) !== null && _a !== void 0 ? _a : 1;
                    shader.uniforms.uMBLinePattern = { value: patternTex };
                    shader.uniforms.uMBLineCrossFade = { value: lineCrossFade };
                    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform sampler2D uMBLinePattern;\nuniform float uMBLineCrossFade;\nvoid main() {');
                    const psi = (_c = (_b = this.m_dataSource.spriteAtlas) === null || _b === void 0 ? void 0 : _b.icons) === null || _c === void 0 ? void 0 : _c.get(patternName);
                    const pspr = Math.max(1, Number((_d = psi === null || psi === void 0 ? void 0 : psi.pixelRatio) !== null && _d !== void 0 ? _d : 1) || 1);
                    const pscale = pspr / Math.max(1, ((_f = (_e = patternTex.image) === null || _e === void 0 ? void 0 : _e.width) !== null && _f !== void 0 ? _f : 32));
                    shader.uniforms.uMBPatternScale = { value: pscale };
                    shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse, alpha );', `vec2 mbLP = vec2(fract(vCoords.x * uMBPatternScale), 0.5);
                         vec4 mbLPx = texture2D(uMBLinePattern, mbLP);
                         float mbLAlpha = mbLPx.a * alpha * uMBLineCrossFade;
                         gl_FragColor = vec4(mix(outputDiffuse, mbLPx.rgb, uMBLineCrossFade), mbLAlpha);`);
                    shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse * vColor, alpha );', `vec2 mbLP = vec2(fract(vCoords.x * uMBPatternScale), 0.5);
                         vec4 mbLPx = texture2D(uMBLinePattern, mbLP);
                         float mbLAlpha = mbLPx.a * alpha * uMBLineCrossFade;
                         gl_FragColor = vec4(mix(outputDiffuse * vColor, mbLPx.rgb, uMBLineCrossFade), mbLAlpha);`);
                }
                if (hasEmissive) {
                    shader.uniforms.uMBEmissiveStrength = { value: emissiveStrength };
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n gl_FragColor.rgb += diffuse * uMBEmissiveStrength;`);
                    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uMBEmissiveStrength;\nvoid main() {');
                }
                if (hasOcclusion) {
                    const depthTex = this.m_depthTexture;
                    const canvas = (_g = this.m_dataSource.mapView) === null || _g === void 0 ? void 0 : _g.canvas;
                    shader.uniforms.u_terrainDepth = { value: depthTex };
                    shader.uniforms.u_terrainDepthInvSize = { value: new THREE.Vector2(1 / Math.max(1, (_h = canvas === null || canvas === void 0 ? void 0 : canvas.width) !== null && _h !== void 0 ? _h : 1), 1 / Math.max(1, (_j = canvas === null || canvas === void 0 ? void 0 : canvas.height) !== null && _j !== void 0 ? _j : 1)) };
                    shader.uniforms.uMBLineOcclusion = { value: lineOcclusionOpacity };
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D u_terrainDepth;\nuniform vec2 u_terrainDepthInvSize;\nuniform float uMBLineOcclusion;');
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                         {
                             float mbTz = texture2D(u_terrainDepth, gl_FragCoord.xy * u_terrainDepthInvSize).r;
                             float mbOcc = smoothstep(-0.002, 0.002, gl_FragCoord.z - mbTz);
                             gl_FragColor.a *= mix(1.0, uMBLineOcclusion, mbOcc);
                         }`);
                }
            };
            material.needsUpdate = true;
            modified = true;
        }
        if (dashArray && Array.isArray(dashArray) && dashArray.length > 2) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                let totalLen = 0;
                for (const v of dashArray)
                    totalLen += v;
                shader.uniforms.uMBDashPattern = { value: new Float32Array(dashArray) };
                shader.uniforms.uMBDashCount = { value: dashArray.length };
                shader.uniforms.uMBDashTotal = { value: totalLen };
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform float uMBDashPattern[${dashArray.length}];\nuniform float uMBDashCount;\nuniform float uMBDashTotal;\nvoid main() {`);
                const dashBlock = (outputExpr) => `float mbDashPos = fract(vCoords.x / uMBDashTotal * uMBDashCount);
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
                shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse, alpha );', dashBlock('outputDiffuse'));
                shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outputDiffuse * vColor, alpha );', dashBlock('outputDiffuse * vColor'));
            };
            material.needsUpdate = true;
            modified = true;
        }
    }
    patchCircleMaterial(material, paint) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const translate = this.resolveTranslate(paint['circle-translate'], paint['circle-translate-anchor']);
        const translateWorld = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                var _a;
                const mapViewT = this.m_dataSource.mapView;
                const dZoom = (_a = mapViewT === null || mapViewT === void 0 ? void 0 : mapViewT.zoomLevel) !== null && _a !== void 0 ? _a : 1;
                const mppT = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const pitchScale = paint['circle-pitch-scale'];
        const pitchAlignment = paint['circle-pitch-alignment'];
        const effective = pitchAlignment !== null && pitchAlignment !== void 0 ? pitchAlignment : pitchScale;
        let modified = false;
        if (this.m_depthOcclusion) {
            material.depthTest = true;
            modified = true;
        }
        if (effective === 'viewport' && 'sizeAttenuation' in material) {
            material.sizeAttenuation = false;
            modified = true;
        }
        else if (effective === 'map' && 'sizeAttenuation' in material) {
            material.sizeAttenuation = true;
            modified = true;
        }
        if (translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0)) {
            const tx = translateWorld[0];
            const ty = translateWorld[1];
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(tx, ty) };
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uMBTranslate;');
                shader.vertexShader = shader.vertexShader.replace('vec3 transformed = vec3(position);', 'vec3 transformed = vec3(position);\n    transformed.xy += uMBTranslate;');
            };
            material.needsUpdate = true;
            modified = true;
        }
        if (this.m_depthOcclusion && this.m_depthTexture) {
            const depthTex = this.m_depthTexture;
            const canvas = (_a = this.m_dataSource.mapView) === null || _a === void 0 ? void 0 : _a.canvas;
            const invSize = new THREE.Vector2(1 / Math.max(1, (_b = canvas === null || canvas === void 0 ? void 0 : canvas.width) !== null && _b !== void 0 ? _b : 1), 1 / Math.max(1, (_c = canvas === null || canvas === void 0 ? void 0 : canvas.height) !== null && _c !== void 0 ? _c : 1));
            const occlusionOpacity = Number((_d = paint['circle-occlusion-opacity']) !== null && _d !== void 0 ? _d : 0);
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.u_terrainDepth = { value: depthTex };
                shader.uniforms.u_terrainDepthInvSize = { value: invSize };
                shader.uniforms.uMBOcclusionOpacity = { value: occlusionOpacity };
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D u_terrainDepth;\nuniform vec2 u_terrainDepthInvSize;\nuniform float uMBOcclusionOpacity;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                     {
                         float mbTz = texture2D(u_terrainDepth, gl_FragCoord.xy * u_terrainDepthInvSize).r;
                         float mbOcclude = smoothstep(-0.002, 0.002, gl_FragCoord.z - mbTz);
                         gl_FragColor.a *= mix(1.0, uMBOcclusionOpacity, mbOcclude);
                     }`);
            };
            material.needsUpdate = true;
            modified = true;
        }
        const blur = Number((_e = paint['circle-blur']) !== null && _e !== void 0 ? _e : 0) || 0;
        const strokePx = Number((_f = paint['circle-stroke-width']) !== null && _f !== void 0 ? _f : 0) || 0;
        const strokeOpacity = Number((_g = paint['circle-stroke-opacity']) !== null && _g !== void 0 ? _g : 1) || 1;
        const radiusPx = Number((_h = paint['circle-radius']) !== null && _h !== void 0 ? _h : 5) || 5;
        const strokeColor = new THREE.Color((_j = paint['circle-stroke-color']) !== null && _j !== void 0 ? _j : '#000000');
        if (blur !== 0 || strokePx > 0) {
            if ('size' in material) {
                material.size = (radiusPx + strokePx) * 2;
            }
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.uMBBlur = { value: blur };
                shader.uniforms.uMBRadiusPx = { value: radiusPx };
                shader.uniforms.uMBStrokePx = { value: strokePx };
                shader.uniforms.uMBStrokeOpacity = { value: strokeOpacity };
                shader.uniforms.uMBStrokeColor = { value: strokeColor };
                shader.uniforms.uMBDpr = { value: 1 };
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' +
                    'uniform float uMBBlur;\nuniform float uMBRadiusPx;\n' +
                    'uniform float uMBStrokePx;\nuniform float uMBStrokeOpacity;\n' +
                    'uniform vec3 uMBStrokeColor;\nuniform float uMBDpr;');
                shader.fragmentShader = shader.fragmentShader.replace(/float radius = 0\.5;[\s\S]*?alpha \*= threshold;/, `vec2 mbExtrude = gl_PointCoord * 2.0 - 1.0;
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
    alpha = mbOpacityT * mix(alpha, uMBStrokeOpacity, mbColorT);`);
                shader.fragmentShader = shader.fragmentShader.replace(/gl_FragColor = vec4\(([^;]*diffuseColor[^;]*), alpha\);/, (_m, expr) => `gl_FragColor = vec4(${expr.replace(/diffuseColor/g, 'mbColor')}, alpha);`);
            };
            material.needsUpdate = true;
            modified = true;
        }
    }
    patchExtrusionMaterial(material, paint, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
        const paintOpacity = Number((_b = (_a = paint['fill-extrusion-opacity']) !== null && _a !== void 0 ? _a : technique.opacity) !== null && _b !== void 0 ? _b : 1);
        if (paintOpacity > 0 && paintOpacity < 1) {
            material.transparent = false;
            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.SrcAlphaFactor;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendSrcAlpha = THREE.OneFactor;
            material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            material.blendEquation = THREE.AddEquation;
        }
        const height = (_d = (_c = technique.height) !== null && _c !== void 0 ? _c : paint['fill-extrusion-height']) !== null && _d !== void 0 ? _d : 0;
        const base = (_f = (_e = technique.floorHeight) !== null && _e !== void 0 ? _e : paint['fill-extrusion-base']) !== null && _f !== void 0 ? _f : 0;
        const verticalScale = (_g = paint['fill-extrusion-vertical-scale']) !== null && _g !== void 0 ? _g : 1;
        const scaledHeight = height * verticalScale;
        const lineWidth = (_h = paint['fill-extrusion-line-width']) !== null && _h !== void 0 ? _h : 0;
        const cutoffFadeRange = (_j = paint['fill-extrusion-cutoff-fade-range']) !== null && _j !== void 0 ? _j : 0;
        const verticalGradient = paint['fill-extrusion-vertical-gradient'] !== false;
        const lightState = (_k = this.m_dataSource.m_environment) === null || _k === void 0 ? void 0 : _k.extrusionLightState;
        const use3DLights = (lightState === null || lightState === void 0 ? void 0 : lightState.use3DLights) === true;
        const emissiveStrength = Number((_l = paint['fill-extrusion-emissive-strength']) !== null && _l !== void 0 ? _l : 0);
        if (use3DLights) {
            this.injectExtrusion3DLighting(material, emissiveStrength);
        }
        const mapView = this.m_dataSource.mapView;
        const camera = mapView === null || mapView === void 0 ? void 0 : mapView.camera;
        const bearingRad = (((_o = mapView === null || mapView === void 0 ? void 0 : mapView.heading) !== null && _o !== void 0 ? _o : 0) * Math.PI) / 180;
        let lightDirWorld = ((_p = lightState === null || lightState === void 0 ? void 0 : lightState.dir) !== null && _p !== void 0 ? _p : new THREE.Vector3(0.2875, -0.498, 0.996)).clone();
        if (bearingRad !== 0) {
            lightDirWorld.applyAxisAngle(new THREE.Vector3(0, 0, 1), -bearingRad);
        }
        const lightColor = (_q = lightState === null || lightState === void 0 ? void 0 : lightState.color) !== null && _q !== void 0 ? _q : new THREE.Color('#ffffff');
        const lightIntensity = (_r = lightState === null || lightState === void 0 ? void 0 : lightState.intensity) !== null && _r !== void 0 ? _r : 0.5;
        const viewToWorld = camera
            ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
            : new THREE.Matrix3();
        const translate = this.resolveTranslate((_t = (_s = paint['fill-extrusion-translate']) !== null && _s !== void 0 ? _s : technique._translate) !== null && _t !== void 0 ? _t : [0, 0], (_v = (_u = paint['fill-extrusion-translate-anchor']) !== null && _u !== void 0 ? _u : technique._translateAnchor) !== null && _v !== void 0 ? _v : 'map');
        const translateWorld = translate && (translate[0] !== 0 || translate[1] !== 0)
            ? (() => {
                var _a;
                const mapViewT = this.m_dataSource.mapView;
                const dZoom = (_a = mapViewT === null || mapViewT === void 0 ? void 0 : mapViewT.zoomLevel) !== null && _a !== void 0 ? _a : 1;
                const mppT = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, dZoom));
                return [translate[0] * mppT, -translate[1] * mppT];
            })()
            : undefined;
        const hasTranslate = !!translateWorld && (translateWorld[0] !== 0 || translateWorld[1] !== 0);
        const patternTex = technique._patternName ? this.extractPatternTexture(technique._patternName) : undefined;
        const hasTerrain = !!((_x = (_w = this.m_dataSource.m_environment) === null || _w === void 0 ? void 0 : _w.terrainController) === null || _x === void 0 ? void 0 : _x.centerDem);
        if (height === 0 && base === 0 && !verticalGradient && !hasTranslate && !patternTex && !hasTerrain && lineWidth === 0 && cutoffFadeRange === 0 && emissiveStrength <= 0) {
            return;
        }
        if (technique._patternName && !patternTex) {
            material.visible = false;
            return;
        }
        if (paint['fill-extrusion-wireframe'] === true ||
            paint['fill-extrusion-rounded-wireframe'] === true) {
            material.wireframe = true;
        }
        if (patternTex) {
            this.patchFillPatternMaterial(material, technique);
        }
        if (emissiveStrength > 0 && !material.__mbExtrusionEmissive) {
            material.__mbExtrusionEmissive = true;
            const orig = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (orig)
                    orig.call(material, shader);
                shader.uniforms.uMBExtrusionEmissive = { value: emissiveStrength };
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                     gl_FragColor.rgb += vec3(uMBExtrusionEmissive * 0.3);`);
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uMBExtrusionEmissive;\nvoid main() {');
            };
            material.needsUpdate = true;
        }
        const origOnCompile = material.onBeforeCompile;
        const centerDem = (_z = (_y = this.m_dataSource.m_environment) === null || _y === void 0 ? void 0 : _y.terrainController) === null || _z === void 0 ? void 0 : _z.centerDem;
        const terrainExag = ((_0 = this.m_dataSource.m_environment) === null || _0 === void 0 ? void 0 : _0.terrainController) ? 1 : 0;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            if (hasTranslate) {
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translateWorld[0], translateWorld[1]) };
                shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform vec2 uMBTranslate;\nvoid main() {');
                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed.xy += uMBTranslate;\n#include <project_vertex>');
            }
            const needHeightUniforms = height > 0 || base > 0 || !!centerDem || verticalGradient;
            if (needHeightUniforms) {
                shader.uniforms.uMBHeightBase = { value: base };
                shader.uniforms.uMBHeightTop = { value: scaledHeight };
                const demUniforms = centerDem
                    ? `uniform sampler2D uMBExtrusionDem;\nuniform vec2 uMBExtrusionDemOrigin;\nuniform float uMBExtrusionDemSize;\nuniform float uMBExtrusionExag;`
                    : '';
                if (centerDem) {
                    shader.uniforms.uMBExtrusionDem = { value: centerDem.texture };
                    shader.uniforms.uMBExtrusionDemOrigin = { value: new THREE.Vector2(centerDem.originX, centerDem.originY) };
                    shader.uniforms.uMBExtrusionDemSize = { value: centerDem.size };
                    shader.uniforms.uMBExtrusionExag = { value: terrainExag };
                }
                shader.vertexShader = shader.vertexShader.replace('void main() {', `uniform float uMBHeightBase;\nuniform float uMBHeightTop;\n${demUniforms}\nvoid main() {`);
            }
            if (height > 0 || base > 0 || centerDem) {
                const terrainSample = centerDem
                    ? `vec2 mbWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
                       vec2 mbDemUv = (mbWorldPos - uMBExtrusionDemOrigin) / uMBExtrusionDemSize;
                       float mbTerrainElev = texture2D(uMBExtrusionDem, vec2(clamp(mbDemUv.x,0.0,1.0), clamp(mbDemUv.y,0.0,1.0))).r * uMBExtrusionExag;`
                    : 'float mbTerrainElev = 0.0;';
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `${terrainSample}
                     float mbH = position.z + mbTerrainElev;
                     vec3 transformed = vec3(position.x, position.y, mbH);`);
            }
            if (!use3DLights) {
                shader.uniforms.uMBLightDirWorld = { value: lightDirWorld };
                shader.uniforms.uMBLightColor = { value: lightColor };
                shader.uniforms.uMBLightIntensity = { value: lightIntensity };
                shader.uniforms.uMBPaintOpacity = { value: paintOpacity };
                shader.uniforms.uMBViewToWorld = { value: viewToWorld };
                shader.uniforms.uMBVerticalGradient = { value: verticalGradient ? 1 : 0 };
                shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying float vMBHeight;\nvoid main() {');
                shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
                     vMBHeight = (transformed.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001);`);
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
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
                     }`);
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                     }`);
            }
            if (lineWidth > 0) {
                shader.uniforms.uMBEdgeWidth = { value: lineWidth };
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMBEdgeWidth;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                     }`);
            }
            if (cutoffFadeRange > 0) {
                shader.uniforms.uMBCutoffFade = { value: cutoffFadeRange };
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMBCutoffFade;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                     {
                         float mbCutoffDist = abs(vViewPosition.z);
                         float mbFade = smoothstep(0.0, uMBCutoffFade * 100.0, mbCutoffDist);
                         gl_FragColor.a *= mbFade;
                     }`);
            }
        };
        material.needsUpdate = true;
    }
    patchBuildingMaterial(material, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _o, _p, _q, _r, _s, _t, _u;
        const lightState = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.extrusionLightState;
        const use3DLights = (lightState === null || lightState === void 0 ? void 0 : lightState.use3DLights) === true;
        if (!use3DLights) {
            this.injectLighting(material);
        }
        const height = Number((_b = technique.height) !== null && _b !== void 0 ? _b : 10);
        const base = Number((_c = technique.floorHeight) !== null && _c !== void 0 ? _c : 0);
        const roofColor = (_f = (_d = technique._roofColor) !== null && _d !== void 0 ? _d : (_e = technique._paint) === null || _e === void 0 ? void 0 : _e['building-roof-color']) !== null && _f !== void 0 ? _f : '#aaaaaa';
        const emissive = (_h = (_g = technique._paint) === null || _g === void 0 ? void 0 : _g['building-emissive-strength']) !== null && _h !== void 0 ? _h : 0;
        const facadeFloors = Number((_k = (_j = technique._paint) === null || _j === void 0 ? void 0 : _j['building-facade-floors']) !== null && _k !== void 0 ? _k : Math.max(1, Math.round(height / 3)));
        const facadeWidth = Number((_o = (_l = technique._paint) === null || _l === void 0 ? void 0 : _l['building-facade-unit-width']) !== null && _o !== void 0 ? _o : 6);
        const aoIntensity = Number((_q = (_p = technique._paint) === null || _p === void 0 ? void 0 : _p['building-ambient-occlusion-intensity']) !== null && _q !== void 0 ? _q : 0);
        const floodIntensity = Number((_s = (_r = technique._paint) === null || _r === void 0 ? void 0 : _r['building-flood-light-intensity']) !== null && _s !== void 0 ? _s : 0);
        const floodColor = (_u = (_t = technique._paint) === null || _t === void 0 ? void 0 : _t['building-flood-light-color']) !== null && _u !== void 0 ? _u : '#ffffff';
        if (emissive > 0 && 'emissiveIntensity' in material) {
            material.emissiveIntensity = emissive;
            material.emissive = new THREE.Color(roofColor);
        }
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            var _a;
            if (origOnCompile)
                origOnCompile.call(material, shader);
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
                const l3 = (_a = this.m_dataSource.m_environment) === null || _a === void 0 ? void 0 : _a.lighting3DState;
                const mapView = this.m_dataSource.mapView;
                const camera = mapView === null || mapView === void 0 ? void 0 : mapView.camera;
                const viewToWorld = camera
                    ? new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
                    : new THREE.Matrix3();
                shader.uniforms.uMB3DAmb = { value: l3 ? l3.ambientColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDirColor = { value: l3 ? l3.directionalColorLinear : [1, 1, 1] };
                shader.uniforms.uMB3DDir = { value: l3 ? l3.dir : [0, 0, 1] };
                shader.uniforms.uMB3DViewToWorld = { value: viewToWorld };
                shader.uniforms.uMB3DEmissive = { value: l3 ? emissive : 0 };
            }
            shader.vertexShader = shader.vertexShader.replace('void main() {', `uniform float uMBHeightBase;\nuniform float uMBHeightTop;\n
                 varying vec3 vMBWorldPos;\nvoid main() {`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `// position.z is already in meters (baked by the emitter).
                 float mbH = position.z;
                 vec3 transformed = vec3(position.x, position.y, mbH);
                 vMBWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
                 uniform vec3 uMBRoofColor;
                 uniform float uMBHeightBase; uniform float uMBHeightTop;
                 uniform float uMBFacadeFloors; uniform float uMBFacadeWidth; uniform float uMBAO;
                 uniform vec3 uMBFloodColor; uniform float uMBFloodIntensity;
                 varying vec3 vMBWorldPos;
                 ${use3DLights
                ? 'uniform vec3 uMB3DAmb; uniform vec3 uMB3DDirColor; uniform vec3 uMB3DDir; uniform mat3 uMB3DViewToWorld; uniform float uMB3DEmissive;'
                : ''}
                 float mbHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                 }`);
        };
        material.needsUpdate = true;
    }
    patchIconObject(obj, technique) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        const atlas = this.m_dataSource.spriteAtlas;
        if (!atlas)
            return;
        const iconName = (_a = technique.imageTexture) !== null && _a !== void 0 ? _a : (_b = technique._layout) === null || _b === void 0 ? void 0 : _b['icon-image'];
        if (!iconName)
            return;
        const material = obj.material;
        if (!material || material.__mbIconPatched)
            return;
        material.__mbIconPatched = true;
        const uv = atlas.getIconUv(iconName);
        const iconInfo = (_c = atlas.icons) === null || _c === void 0 ? void 0 : _c.get(iconName);
        const isSdf = (iconInfo === null || iconInfo === void 0 ? void 0 : iconInfo.sdf) === true;
        const iconColor = (_f = (_d = technique.color) !== null && _d !== void 0 ? _d : (_e = technique._paint) === null || _e === void 0 ? void 0 : _e['icon-color']) !== null && _f !== void 0 ? _f : '#ffffff';
        const haloColor = (_h = (_g = technique._paint) === null || _g === void 0 ? void 0 : _g['icon-halo-color']) !== null && _h !== void 0 ? _h : '#000000';
        const haloWidth = Number((_k = (_j = technique._paint) === null || _j === void 0 ? void 0 : _j['icon-halo-width']) !== null && _k !== void 0 ? _k : 0);
        const haloBlur = Number((_o = (_l = technique._paint) === null || _l === void 0 ? void 0 : _l['icon-halo-blur']) !== null && _o !== void 0 ? _o : 0);
        const brightnessMin = Number((_q = (_p = technique._paint) === null || _p === void 0 ? void 0 : _p['icon-color-brightness-min']) !== null && _q !== void 0 ? _q : 0);
        const brightnessMax = Number((_s = (_r = technique._paint) === null || _r === void 0 ? void 0 : _r['icon-color-brightness-max']) !== null && _s !== void 0 ? _s : 1);
        const contrast = Number((_u = (_t = technique._paint) === null || _t === void 0 ? void 0 : _t['icon-color-contrast']) !== null && _u !== void 0 ? _u : 0);
        const saturation = Number((_w = (_v = technique._paint) === null || _v === void 0 ? void 0 : _v['icon-color-saturation']) !== null && _w !== void 0 ? _w : 0);
        const hasColorAdjust = brightnessMin !== 0 || brightnessMax !== 1 ||
            contrast !== 0 || saturation !== 0;
        material.map = atlas.texture;
        material.color = new THREE.Color(isSdf ? '#ffffff' : '#ffffff');
        material.transparent = true;
        material.depthWrite = false;
        if (uv) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.uUvOffset = { value: new THREE.Vector2(uv.uvMin[0], uv.uvMin[1]) };
                shader.uniforms.uUvScale = {
                    value: new THREE.Vector2(uv.uvMax[0] - uv.uvMin[0], uv.uvMax[1] - uv.uvMin[1]),
                };
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uUvOffset;\nuniform vec2 uUvScale;');
                if (isSdf) {
                    shader.uniforms.uMBIconColor = {
                        value: new THREE.Color(iconColor).convertLinearToSRGB(),
                    };
                    shader.uniforms.uMBHaloColor = {
                        value: new THREE.Color(haloColor).convertLinearToSRGB(),
                    };
                    shader.uniforms.uMBHaloWidth = { value: haloWidth / 16.0 };
                    shader.uniforms.uMBHaloBlur = { value: Math.max(haloBlur, 0.5) / 16.0 };
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
                         uniform vec2 uUvOffset; uniform vec2 uUvScale;
                         uniform vec3 uMBIconColor; uniform vec3 uMBHaloColor;
                         uniform float uMBHaloWidth; uniform float uMBHaloBlur;`);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                         {
                             float mbSdf = texture2D(map, uUvOffset + vUv * uUvScale).a;
                             float mbEdge = 0.5;
                             float mbFill = smoothstep(mbEdge - uMBHaloBlur, mbEdge + uMBHaloBlur, mbSdf);
                             float mbHaloEdge = mbEdge - uMBHaloWidth;
                             float mbHalo = smoothstep(mbHaloEdge - uMBHaloBlur, mbHaloEdge + uMBHaloBlur, mbSdf) - mbFill;
                             vec3 mbCol = mix(uMBHaloColor, uMBIconColor, mbFill);
                             float mbAlpha = max(mbFill, mbHalo * step(0.0001, uMBHaloWidth));
                             gl_FragColor = vec4(mbCol, mbAlpha * opacity);
                         }`);
                }
                else {
                    shader.fragmentShader = shader.fragmentShader.replace('texture2D( map, vUv )', 'texture2D( map, uUvOffset + vUv * uUvScale )');
                }
            };
        }
        ;
        if (hasColorAdjust) {
            const prevOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (prevOnCompile)
                    prevOnCompile.call(material, shader);
                shader.uniforms.uMBIconBMin = { value: brightnessMin };
                shader.uniforms.uMBIconBMax = { value: brightnessMax };
                shader.uniforms.uMBIconContrast = { value: contrast };
                shader.uniforms.uMBIconSat = { value: saturation };
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform float uMBIconBMin; uniform float uMBIconBMax;
                     uniform float uMBIconContrast; uniform float uMBIconSat;
                     void main() {`);
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
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
                     }`);
            };
        }
        material.needsUpdate = true;
    }
    patchHeatmapMaterial(material, technique) {
        var _a, _b;
        if (material.__mbHeatmapPatched)
            return;
        material.__mbHeatmapPatched = true;
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        const colorStops = technique._heatmapColorStops;
        const ramp = MBMaterialPatchManager.buildGradientTexture(colorStops, this.colorThemeLut);
        const intensity = (_a = technique._heatmapIntensity) !== null && _a !== void 0 ? _a : 1;
        const weight = (_b = technique._heatmapWeight) !== null && _b !== void 0 ? _b : 1;
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            shader.uniforms.uMBHeatRamp = { value: ramp };
            shader.uniforms.uMBHeatIntensity = { value: intensity };
            shader.uniforms.uMBHeatWeight = { value: weight };
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform sampler2D uMBHeatRamp;\nuniform float uMBHeatIntensity;\nuniform float uMBHeatWeight;\nvoid main() {');
            shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4(diffuseColor, alpha);', `vec2 mbHp = gl_PointCoord - vec2(0.5);
                 float mbHd = dot(mbHp, mbHp) * 4.0;
                 float mbHfall = exp(-mbHd * uMBHeatIntensity);
                 float mbHden = clamp(mbHfall * uMBHeatWeight, 0.0, 1.0);
                 vec3 mbHcol = texture2D(uMBHeatRamp, vec2(mbHden, 0.5)).rgb;
                 gl_FragColor = vec4(mbHcol, mbHden * opacity);`);
        };
        material.needsUpdate = true;
    }
    patchHillshadeMaterial(material, technique) {
        var _a, _b, _c;
        const url = technique._hillshadeDemUrl;
        if (!url)
            return;
        if (material.__mbHillshadePatched)
            return;
        const intensity = (_a = technique._hillshadeIntensity) !== null && _a !== void 0 ? _a : 0.5;
        const accent = new THREE.Color((_b = technique._hillshadeAccent) !== null && _b !== void 0 ? _b : '#ffffff');
        const highlight = new THREE.Color((_c = technique._hillshadeHighlight) !== null && _c !== void 0 ? _c : '#ffffff');
        const applyShader = (demTex) => {
            var _a, _b, _c;
            if (material.__mbHillshadePatched)
                return;
            material.__mbHillshadePatched = true;
            material.map = demTex;
            const demImg = demTex.image;
            const imgSize = (_b = (_a = demImg === null || demImg === void 0 ? void 0 : demImg.width) !== null && _a !== void 0 ? _a : demImg === null || demImg === void 0 ? void 0 : demImg.naturalWidth) !== null && _b !== void 0 ? _b : 256;
            const tileSize = (_c = technique._hillshadeTileSize) !== null && _c !== void 0 ? _c : 256;
            const buffer = Math.max(0, (imgSize - tileSize) / 2);
            const dataFrac = tileSize / imgSize;
            const borderFrac = buffer / imgSize;
            const pxStep = 1.0 / imgSize;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (origOnCompile)
                    origOnCompile.call(material, shader);
                shader.uniforms.uMBDem = { value: demTex };
                shader.uniforms.uMBHsIntensity = { value: intensity };
                shader.uniforms.uMBHsAccent = { value: accent };
                shader.uniforms.uMBHsHighlight = { value: highlight };
                shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform sampler2D uMBDem;
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
                     void main() {`);
                shader.uniforms.uMBDemParams = { value: new THREE.Vector4(dataFrac, borderFrac, pxStep, 0) };
                shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
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
                     gl_FragColor = vec4(mbHs, opacity);`);
            };
            material.needsUpdate = true;
        };
        const cached = rasterTextureCache.get(url);
        if (cached) {
            applyShader(cached);
        }
        else {
            rasterTextureLoader.load(url, (texture) => {
                var _a, _b;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                rasterTextureCache.set(url, texture);
                applyShader(texture);
                try {
                    (_b = (_a = this.m_dataSource.mapView) === null || _a === void 0 ? void 0 : _a.update) === null || _b === void 0 ? void 0 : _b.call(_a);
                }
                catch (_c) { }
            }, undefined, () => { });
        }
    }
    static normalizeGradientStops(raw) {
        var _a, _b;
        if (!raw)
            return [];
        if (!Array.isArray(raw) && typeof raw === 'object') {
            try {
                raw = JSON.parse(JSON.stringify(raw));
            }
            catch (_c) {
                return [];
            }
        }
        while (Array.isArray(raw) && raw[0] === 'memo') {
            raw = raw[1];
        }
        if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]) && raw[0].length === 2) {
            return raw.map((s) => {
                var _a;
                const c = MBMaterialPatchManager.parseColor(String(s[1]));
                return { t: (_a = Number(s[0])) !== null && _a !== void 0 ? _a : 0, r: c[0], g: c[1], b: c[2], a: c[3] };
            }).sort((a, b) => a.t - b.t);
        }
        if (Array.isArray(raw) && raw[0] === 'interpolate') {
            const stops = [];
            for (let i = 3; i < raw.length - 1; i += 2) {
                const t = (_a = Number(raw[i])) !== null && _a !== void 0 ? _a : 0;
                const colorVal = raw[i + 1];
                let c;
                if (typeof colorVal === 'string') {
                    c = MBMaterialPatchManager.parseColor(colorVal);
                }
                else if (Array.isArray(colorVal) && colorVal[0] === 'rgb') {
                    c = [colorVal[1], colorVal[2], colorVal[3], 1];
                }
                else if (Array.isArray(colorVal) && colorVal[0] === 'rgba') {
                    c = [colorVal[1], colorVal[2], colorVal[3], (_b = colorVal[4]) !== null && _b !== void 0 ? _b : 1];
                }
                else {
                    c = MBMaterialPatchManager.parseColor(String(colorVal));
                }
                stops.push({ t, r: c[0], g: c[1], b: c[2], a: c[3] });
            }
            return stops.sort((a, b) => a.t - b.t);
        }
        return [];
    }
    get colorThemeLut() {
        var _a, _b, _c;
        try {
            return (_c = (_b = (_a = this.m_dataSource.runtime) === null || _a === void 0 ? void 0 : _a.evaluator) === null || _b === void 0 ? void 0 : _b.colorTheme) !== null && _c !== void 0 ? _c : null;
        }
        catch (_d) {
            return null;
        }
    }
    loadRasterArrayTexture(url, technique, material, attach, _rect) {
        (async () => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const { MapboxRasterTile } = await Promise.resolve().then(() => __importStar(require('./vendor/mrt')));
            const { PbfReader } = await Promise.resolve().then(() => __importStar(require('pbf')));
            MapboxRasterTile.setPbf(PbfReader);
            const resp = await fetch(url);
            const ab = await resp.arrayBuffer();
            const mrt = new MapboxRasterTile(Infinity);
            mrt.parseHeader(ab);
            let sourceLayer = '';
            try {
                const style = (_b = (_a = this.m_dataSource.styleManager) === null || _a === void 0 ? void 0 : _a.getStyle) === null || _b === void 0 ? void 0 : _b.call(_a);
                const layer = ((_c = style === null || style === void 0 ? void 0 : style.layers) !== null && _c !== void 0 ? _c : []).find((l) => l.id === technique._layerId || (l.type === 'raster' && l['source-layer']));
                sourceLayer = (_e = (_d = layer === null || layer === void 0 ? void 0 : layer['source-layer']) !== null && _d !== void 0 ? _d : Object.keys(mrt.layers)[0]) !== null && _e !== void 0 ? _e : '';
            }
            catch (_j) { }
            const mrtLayer = (_f = mrt.getLayer(sourceLayer)) !== null && _f !== void 0 ? _f : mrt.getLayer(Object.keys(mrt.layers)[0]);
            if (!mrtLayer)
                return;
            const bands = mrtLayer.getBandList();
            const band = bands[0];
            const range = mrtLayer.getDataRange([band]);
            const batch = mrt.createDecodingTask(range);
            const slice = ab.slice(range.firstByte, range.lastByte + 1);
            const results = await MapboxRasterTile.performDecoding(slice, batch);
            batch.complete(null, results);
            if (!mrtLayer.hasDataForBand(band))
                return;
            const view = mrtLayer.getBandView(band);
            const size = view.tileSize + 2 * view.buffer;
            const tex = new THREE.DataTexture(new Uint8Array(view.bytes.buffer, view.bytes.byteOffset, view.bytes.byteLength), size, size, THREE.RGBAFormat);
            tex.colorSpace = THREE.NoColorSpace;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.needsUpdate = true;
            tex.__mbNoPad = true;
            tex.__mbPadPx = [size, size];
            tex.__mbIsRasterArray = true;
            tex.__mbArrMix = [
                view.scale, view.scale * 256, view.scale * 65536, view.scale * 16777216,
            ];
            tex.__mbArrOffset = view.offset;
            tex.__mbArrTile = view.tileSize;
            tex.__mbArrBuffer = view.buffer;
            rasterTextureCache.set(url, tex);
            attach(tex);
            try {
                (_h = (_g = this.m_dataSource.mapView) === null || _g === void 0 ? void 0 : _g.update) === null || _h === void 0 ? void 0 : _h.call(_g);
            }
            catch (_k) { }
        })().catch(() => { });
    }
    static buildRasterColorRamp(expr, range, nearest = false) {
        var _a, _b, _c;
        const size = 256;
        const data = new Uint8Array(size * 4);
        const { MBExpressionEngine } = require('./MBExpressionEngine');
        const rewritten = JSON.parse(JSON.stringify(expr), (k, v) => {
            if (Array.isArray(v) && v.length === 1 && v[0] === 'raster-value')
                return ['get', 'rasterValue'];
            return v;
        });
        for (let i = 0; i < size; i++) {
            const t = range[0] + (i / (size - 1)) * (range[1] - range[0]);
            let rgba = [255, 255, 255, 1];
            try {
                const out = MBExpressionEngine.evaluate(rewritten, {
                    zoom: 0,
                    feature: { properties: { rasterValue: t } },
                });
                if (typeof out === 'string') {
                    rgba = MBMaterialPatchManager.parseColor(out);
                }
                else if (out && typeof out === 'object' && 'r' in out) {
                    const c = new THREE.Color();
                    c.copy(out);
                    c.convertLinearToSRGB();
                    rgba = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 1];
                }
                else if (Array.isArray(out)) {
                    rgba = [
                        Math.round(((_a = out[0]) !== null && _a !== void 0 ? _a : 0) * 255),
                        Math.round(((_b = out[1]) !== null && _b !== void 0 ? _b : 0) * 255),
                        Math.round(((_c = out[2]) !== null && _c !== void 0 ? _c : 0) * 255),
                        out[3] !== undefined ? out[3] : 1,
                    ];
                }
            }
            catch (_d) { }
            data[i * 4 + 0] = Math.floor(rgba[0]);
            data[i * 4 + 1] = Math.floor(rgba[1]);
            data[i * 4 + 2] = Math.floor(rgba[2]);
            data[i * 4 + 3] = Math.floor(Math.max(0, Math.min(1, rgba[3])) * 255);
        }
        const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
        tex.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }
    static buildGradientTexture(stops, lut) {
        const size = 256;
        const data = new Uint8Array(size * 4);
        let norm = MBMaterialPatchManager.normalizeGradientStops(stops);
        if (lut) {
            try {
                const { applyColorTheme } = require('./MBColorTheme');
                for (const st of norm) {
                    const out = applyColorTheme(lut, `rgba(${st.r}, ${st.g}, ${st.b}, ${st.a})`);
                    const m = out.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
                    if (m) {
                        st.r = +m[1];
                        st.g = +m[2];
                        st.b = +m[3];
                        st.a = m[4] !== undefined ? +m[4] : 1;
                    }
                }
            }
            catch (_a) { }
        }
        if (norm.length === 0) {
            for (let i = 0; i < size; i++) {
                data[i * 4 + 3] = 255;
            }
        }
        else {
            for (let i = 0; i < size; i++) {
                const p = i / (size - 1);
                let lo = norm[0];
                let hi = norm[norm.length - 1];
                for (let j = 0; j < norm.length - 1; j++) {
                    if (p >= norm[j].t && p <= norm[j + 1].t) {
                        lo = norm[j];
                        hi = norm[j + 1];
                        break;
                    }
                }
                const span = Math.max(hi.t - lo.t, 1e-6);
                const f = Math.max(0, Math.min(1, (p - lo.t) / span));
                data[i * 4 + 0] = Math.round(lo.r + (hi.r - lo.r) * f);
                data[i * 4 + 1] = Math.round(lo.g + (hi.g - lo.g) * f);
                data[i * 4 + 2] = Math.round(lo.b + (hi.b - lo.b) * f);
                data[i * 4 + 3] = Math.round((lo.a + (hi.a - lo.a) * f) * 255);
            }
        }
        const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }
    static parseColor(c) {
        const h = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(h)) {
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
        }
        if (/^[0-9a-fA-F]{8}$/.test(h)) {
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
        }
        const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (m)
            return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
        try {
            const named = new (require('three')).Color(c);
            named.convertLinearToSRGB();
            return [Math.round(named.r * 255), Math.round(named.g * 255), Math.round(named.b * 255), 1];
        }
        catch (_a) {
            return [0, 0, 255, 0];
        }
    }
    extractPatternTexture(patternName) {
        var _a, _b;
        const atlas = this.m_dataSource.spriteAtlas;
        if (!atlas)
            return undefined;
        const { themeGeneration } = require('./MBColorTheme');
        const gen = themeGeneration();
        if (patternTextureCacheAtlas !== atlas || patternTextureCacheGen !== gen) {
            for (const t of patternTextureCache.values())
                t.dispose();
            patternTextureCache.clear();
            patternTextureCacheAtlas = atlas;
            patternTextureCacheGen = gen;
        }
        const cached = patternTextureCache.get(patternName);
        if (cached)
            return cached;
        const info = (_a = atlas.icons) === null || _a === void 0 ? void 0 : _a.get(patternName);
        const img = (_b = atlas.texture) === null || _b === void 0 ? void 0 : _b.image;
        if (!info || !img)
            return undefined;
        const w = info.width;
        const h = info.height;
        try {
            const canvas = typeof document !== 'undefined'
                ? document.createElement('canvas') : null;
            if (!canvas)
                return undefined;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return undefined;
            ctx.drawImage(img, info.x, info.y, w, h, 0, 0, w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            patternTextureCache.set(patternName, tex);
            return tex;
        }
        catch (_c) {
            return undefined;
        }
    }
    patchFillPatternMaterial(material, technique) {
        var _a, _b, _c, _d, _e, _f, _g;
        const tex = this.extractPatternTexture(technique._patternName);
        if (!tex)
            return;
        if (!!this.centerDem)
            this.injectTerrainDrape(material);
        if (material.__mbPatternPatched)
            return;
        material.__mbPatternPatched = true;
        material.map = tex;
        material.color = new THREE.Color('#ffffff');
        material.transparent = ((_a = technique.opacity) !== null && _a !== void 0 ? _a : 1) < 1;
        const crossFade = (_b = technique._patternCrossFade) !== null && _b !== void 0 ? _b : 1;
        const tex2 = technique._patternName2
            ? this.extractPatternTexture(technique._patternName2)
            : undefined;
        const spriteInfo = (_d = (_c = this.m_dataSource.spriteAtlas) === null || _c === void 0 ? void 0 : _c.icons) === null || _d === void 0 ? void 0 : _d.get(technique._patternName);
        const spritePr = Math.max(1, Number((_e = spriteInfo === null || spriteInfo === void 0 ? void 0 : spriteInfo.pixelRatio) !== null && _e !== void 0 ? _e : 1) || 1);
        const tileScale = spritePr / Math.max(1, ((_g = (_f = tex.image) === null || _f === void 0 ? void 0 : _f.width) !== null && _g !== void 0 ? _g : 32));
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (origOnCompile)
                origOnCompile.call(material, shader);
            shader.uniforms.uMBPatternTex = { value: tex };
            shader.uniforms.uMBPatternScale = { value: tileScale };
            shader.uniforms.uMBPatternCrossFade = { value: crossFade };
            if (tex2)
                shader.uniforms.uMBPatternTex2 = { value: tex2 };
            shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float uMBPatternScale;\nvarying vec2 vMBPatternUv;\nvoid main() {');
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMBPatternUv = position.xy * uMBPatternScale;');
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform sampler2D uMBPatternTex;${tex2 ? '\nuniform sampler2D uMBPatternTex2;' : ''}\nuniform float uMBPatternCrossFade;\nvarying vec2 vMBPatternUv;\nvoid main() {`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
                 vec4 mbPat = texture2D(uMBPatternTex, vMBPatternUv);${tex2 ? `
                 mbPat = mix(mbPat, texture2D(uMBPatternTex2, vMBPatternUv), uMBPatternCrossFade);` : ''}
                 float mbPatAlpha = mbPat.a * opacity * uMBPatternCrossFade;
                 gl_FragColor = vec4(mix(diffuse, mbPat.rgb, uMBPatternCrossFade), mbPatAlpha);`);
        };
        material.needsUpdate = true;
    }
    invalidate() {
        this.m_patchedTiles = new WeakMap();
    }
}
exports.MBMaterialPatchManager = MBMaterialPatchManager;
MBMaterialPatchManager.enableAdditiveDualPass = true;
//# sourceMappingURL=MBMaterialPatchManager.js.map