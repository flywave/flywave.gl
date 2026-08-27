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
exports.MBRenderLayer = exports.MapSDFIconMaterial = exports.MBSDFTextMaterial = exports.MapBuildingMaterial = exports.MapRasterMaterial = exports.MapHillshadeMaterial = exports.MapHeatmapMaterial = exports.SpriteAtlas = exports.MapIconMaterial = exports.MapExtrusionMaterial = exports.MapCircleMaterial = exports.MapLineMaterial = exports.MapFillMaterial = void 0;
exports.createMBMaterial = createMBMaterial;
exports.updateMBMaterial = updateMBMaterial;
const THREE = __importStar(require("three"));
const MapFillMaterial_1 = require("./MapFillMaterial");
Object.defineProperty(exports, "MapFillMaterial", { enumerable: true, get: function () { return MapFillMaterial_1.MapFillMaterial; } });
const MapLineMaterial_1 = require("./MapLineMaterial");
Object.defineProperty(exports, "MapLineMaterial", { enumerable: true, get: function () { return MapLineMaterial_1.MapLineMaterial; } });
const MapCircleMaterial_1 = require("./MapCircleMaterial");
Object.defineProperty(exports, "MapCircleMaterial", { enumerable: true, get: function () { return MapCircleMaterial_1.MapCircleMaterial; } });
const MapExtrusionMaterial_1 = require("./MapExtrusionMaterial");
Object.defineProperty(exports, "MapExtrusionMaterial", { enumerable: true, get: function () { return MapExtrusionMaterial_1.MapExtrusionMaterial; } });
const MapIconMaterial_1 = require("./MapIconMaterial");
const MapHeatmapMaterial_1 = require("./MapHeatmapMaterial");
const MapHillshadeMaterial_1 = require("./MapHillshadeMaterial");
const MapRasterMaterial_1 = require("./MapRasterMaterial");
const MapBuildingMaterial_1 = require("./MapBuildingMaterial");
const MBSDFTextMaterial_1 = require("./MBSDFTextMaterial");
const MapSDFIconMaterial_1 = require("./MapSDFIconMaterial");
var MapIconMaterial_2 = require("./MapIconMaterial");
Object.defineProperty(exports, "MapIconMaterial", { enumerable: true, get: function () { return MapIconMaterial_2.MapIconMaterial; } });
Object.defineProperty(exports, "SpriteAtlas", { enumerable: true, get: function () { return MapIconMaterial_2.SpriteAtlas; } });
var MapHeatmapMaterial_2 = require("./MapHeatmapMaterial");
Object.defineProperty(exports, "MapHeatmapMaterial", { enumerable: true, get: function () { return MapHeatmapMaterial_2.MapHeatmapMaterial; } });
var MapHillshadeMaterial_2 = require("./MapHillshadeMaterial");
Object.defineProperty(exports, "MapHillshadeMaterial", { enumerable: true, get: function () { return MapHillshadeMaterial_2.MapHillshadeMaterial; } });
var MapRasterMaterial_2 = require("./MapRasterMaterial");
Object.defineProperty(exports, "MapRasterMaterial", { enumerable: true, get: function () { return MapRasterMaterial_2.MapRasterMaterial; } });
var MapBuildingMaterial_2 = require("./MapBuildingMaterial");
Object.defineProperty(exports, "MapBuildingMaterial", { enumerable: true, get: function () { return MapBuildingMaterial_2.MapBuildingMaterial; } });
var MBSDFTextMaterial_2 = require("./MBSDFTextMaterial");
Object.defineProperty(exports, "MBSDFTextMaterial", { enumerable: true, get: function () { return MBSDFTextMaterial_2.MBSDFTextMaterial; } });
var MapSDFIconMaterial_2 = require("./MapSDFIconMaterial");
Object.defineProperty(exports, "MapSDFIconMaterial", { enumerable: true, get: function () { return MapSDFIconMaterial_2.MapSDFIconMaterial; } });
var MBRenderLayer_1 = require("./MBRenderLayer");
Object.defineProperty(exports, "MBRenderLayer", { enumerable: true, get: function () { return MBRenderLayer_1.MBRenderLayer; } });
const FALLBACK = new THREE.MeshBasicMaterial({ color: '#ff00ff' });
function createMBMaterial(layerType, paint, options) {
    var _a, _b, _c;
    const capabilities = options === null || options === void 0 ? void 0 : options.capabilities;
    const atlas = options === null || options === void 0 ? void 0 : options.spriteAtlas;
    switch (layerType) {
        case 'background': {
            const fillPaint = {
                'fill-color': (_a = paint['background-color']) !== null && _a !== void 0 ? _a : '#000000',
                'fill-opacity': (_b = paint['background-opacity']) !== null && _b !== void 0 ? _b : 1,
            };
            if (paint['background-pattern'])
                fillPaint['fill-pattern'] = paint['background-pattern'];
            const mat = new MapFillMaterial_1.MapFillMaterial(fillPaint);
            if (paint['background-pattern'] && atlas) {
                applyPatternTexture(mat, paint['background-pattern'], atlas);
            }
            return mat;
        }
        case 'fill': {
            const mat = new MapFillMaterial_1.MapFillMaterial(paint);
            if (paint['fill-pattern'] && atlas) {
                applyPatternTexture(mat, paint['fill-pattern'], atlas);
            }
            return mat;
        }
        case 'line': {
            const mat = new MapLineMaterial_1.MapLineMaterial(paint, capabilities);
            if (paint['line-pattern'] && atlas) {
                applyLinePatternTexture(mat, paint['line-pattern'], atlas);
            }
            return mat;
        }
        case 'circle':
            return new MapCircleMaterial_1.MapCircleMaterial(paint);
        case 'symbol': {
            if (paint['text-field'] || paint['text-field']) {
                return new MBSDFTextMaterial_1.MBSDFTextMaterial(paint);
            }
            const hasHalo = paint['icon-halo-width'] !== undefined && paint['icon-halo-width'] > 0;
            if (hasHalo) {
                const mat = new MapSDFIconMaterial_1.MapSDFIconMaterial(paint);
                if (atlas)
                    mat.setSpriteAtlas(atlas, (_c = paint['icon-image']) !== null && _c !== void 0 ? _c : '');
                return mat;
            }
            const mat = new MapIconMaterial_1.MapIconMaterial(paint);
            if (atlas)
                mat.setSpriteAtlas(atlas);
            return mat;
        }
        case 'fill-extrusion': {
            const mat = new MapExtrusionMaterial_1.MapExtrusionMaterial(paint);
            if (paint['fill-extrusion-pattern'] && atlas) {
                applyExtrusionPatternTexture(mat, paint['fill-extrusion-pattern'], atlas);
            }
            return mat;
        }
        case 'heatmap':
            return new MapHeatmapMaterial_1.MapHeatmapMaterial(paint);
        case 'hillshade':
            return new MapHillshadeMaterial_1.MapHillshadeMaterial(paint);
        case 'raster':
            return new MapRasterMaterial_1.MapRasterMaterial(paint);
        case 'building':
            return new MapBuildingMaterial_1.MapBuildingMaterial(paint);
        default:
            return FALLBACK;
    }
}
function applyPatternTexture(mat, patternName, atlas) {
    var _a, _b;
    if (!(atlas === null || atlas === void 0 ? void 0 : atlas.icons))
        return;
    const info = (_b = (_a = atlas.icons).get) === null || _b === void 0 ? void 0 : _b.call(_a, patternName);
    if (info) {
        mat.setPatternTexture(atlas.texture, [info.width, info.height]);
    }
}
function applyExtrusionPatternTexture(mat, patternName, atlas) {
    var _a, _b;
    if (!(atlas === null || atlas === void 0 ? void 0 : atlas.icons))
        return;
    const info = (_b = (_a = atlas.icons).get) === null || _b === void 0 ? void 0 : _b.call(_a, patternName);
    if (info && atlas.texture) {
        mat.setPatternTexture(atlas.texture);
    }
}
function applyLinePatternTexture(mat, patternName, atlas) {
    var _a, _b, _c, _d, _e, _f;
    if (!(atlas === null || atlas === void 0 ? void 0 : atlas.icons) || !atlas.texture)
        return;
    const info = (_b = (_a = atlas.icons).get) === null || _b === void 0 ? void 0 : _b.call(_a, patternName);
    if (!info) {
        mat.setPatternTexture(atlas.texture);
        return;
    }
    const texW = (_d = (_c = atlas.texture.image) === null || _c === void 0 ? void 0 : _c.width) !== null && _d !== void 0 ? _d : 1;
    const texH = (_f = (_e = atlas.texture.image) === null || _e === void 0 ? void 0 : _e.height) !== null && _f !== void 0 ? _f : 1;
    const uvOffset = [info.x / texW, info.y / texH];
    const uvScale = [info.width / texW, info.height / texH];
    const repeat = 1.0 / (info.width * 2);
    mat.setPatternTexture(atlas.texture, uvOffset, uvScale, repeat);
}
function updateMBMaterial(material, layerType, paint) {
    var _a, _b, _c, _d;
    switch (layerType) {
        case 'background': {
            const fillPaint = {
                'fill-color': (_a = paint['background-color']) !== null && _a !== void 0 ? _a : '#000000',
                'fill-opacity': (_b = paint['background-opacity']) !== null && _b !== void 0 ? _b : 1,
            };
            if (paint['background-pattern'])
                fillPaint['fill-pattern'] = paint['background-pattern'];
            material.setPaint(fillPaint);
            break;
        }
        case 'fill':
            material.setPaint(paint);
            break;
        case 'line':
            material.setPaint(paint);
            break;
        case 'circle':
            material.setPaint(paint);
            break;
        case 'symbol':
            if (material instanceof MapIconMaterial_1.MapIconMaterial) {
                material.setPaint(paint);
            }
            else if (material instanceof MapSDFIconMaterial_1.MapSDFIconMaterial) {
                material.m_params = Object.assign(Object.assign({}, material.m_params), paint);
                (_d = (_c = material).applyParams) === null || _d === void 0 ? void 0 : _d.call(_c);
            }
            break;
        case 'fill-extrusion':
            material.setPaint(paint);
            break;
        case 'heatmap':
            material.setPaint(paint);
            break;
        case 'hillshade':
            material.setPaint(paint);
            break;
        case 'raster':
            material.setPaint(paint);
            break;
        case 'building':
            material.setPaint(paint);
            break;
    }
}
//# sourceMappingURL=index.js.map