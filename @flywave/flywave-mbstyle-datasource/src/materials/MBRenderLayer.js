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
exports.MBRenderLayer = void 0;
const THREE = __importStar(require("three"));
const TextShaping_1 = require("../TextShaping");
const index_1 = require("./index");
const MapFillMaterial_1 = require("./MapFillMaterial");
const MapIconMaterial_1 = require("./MapIconMaterial");
const MBSDFTextMaterial_1 = require("./MBSDFTextMaterial");
class MBRenderLayer {
    constructor() {
        this.m_materialCache = new Map();
        this.m_spriteAtlas = null;
        this.m_demTileUrl = null;
    }
    setSpriteAtlas(atlas) {
        this.m_spriteAtlas = atlas;
        this.clearCache();
    }
    setDemTileUrl(url) {
        this.m_demTileUrl = url;
    }
    buildObjects(tile, decodedTile) {
        const result = [];
        for (const geometry of decodedTile.geometries) {
            if (!geometry.vertexAttributes)
                continue;
            const objects = this.buildFromGeometry(tile, geometry, decodedTile.techniques);
            result.push(...objects);
        }
        return result;
    }
    buildFromGeometry(tile, geometry, techniques) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const result = [];
        const bufferGeometry = new THREE.BufferGeometry();
        if (geometry.interleavedVertexAttributes) {
            for (const interleaved of geometry.interleavedVertexAttributes) {
                const array = this.bufferToTypedArray(interleaved);
                if (!array)
                    continue;
                const buffer = new THREE.InterleavedBuffer(array, interleaved.stride);
                for (const attr of interleaved.attributes) {
                    const attrib = new THREE.InterleavedBufferAttribute(buffer, attr.itemSize, attr.offset);
                    bufferGeometry.setAttribute(attr.name, attrib);
                }
            }
        }
        for (const attr of (_a = geometry.vertexAttributes) !== null && _a !== void 0 ? _a : []) {
            if (!attr.buffer)
                continue;
            const array = this.bufferToTypedArray(attr);
            if (!array)
                continue;
            bufferGeometry.setAttribute(attr.name, new THREE.BufferAttribute(array, attr.itemCount));
        }
        if ((_b = geometry.index) === null || _b === void 0 ? void 0 : _b.buffer) {
            const idxArray = this.bufferToTypedArray(geometry.index);
            if (idxArray) {
                bufferGeometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
            }
        }
        const renderOrders = [];
        for (const group of geometry.groups) {
            const technique = techniques[group.technique];
            if (!technique)
                continue;
            const layerId = (_c = technique._layerId) !== null && _c !== void 0 ? _c : technique.name;
            const paint = (_d = technique._paint) !== null && _d !== void 0 ? _d : {};
            const layerType = technique.name;
            const renderOrder = (_e = technique._renderOrder) !== null && _e !== void 0 ? _e : 0;
            const matKey = this.getMaterialKey(technique, paint);
            let material = this.m_materialCache.get(matKey);
            if (!material) {
                material = (0, index_1.createMBMaterial)(layerType, paint, {
                    spriteAtlas: this.m_spriteAtlas,
                });
                this.m_materialCache.set(matKey, material);
                if (layerType === 'hillshade') {
                    this.loadDemTexture(material, tile);
                }
            }
            else {
                (0, index_1.updateMBMaterial)(material, layerType, paint);
            }
            const subGeometry = bufferGeometry.clone();
            subGeometry.addGroup(group.start, group.count, 0);
            const geomType = geometry.type;
            let object;
            if (geomType === 'SolidLine') {
                object = new THREE.Mesh(subGeometry, material);
            }
            else if (layerType === 'symbol') {
                if (material instanceof MapIconMaterial_1.MapIconMaterial) {
                    const sprite = new THREE.Sprite(material);
                    const textFit = paint['icon-text-fit'];
                    if (textFit && textFit !== 'none') {
                        const textSize = (_f = paint['text-size']) !== null && _f !== void 0 ? _f : 16;
                        const textWidth = (_g = technique._textWidth) !== null && _g !== void 0 ? _g : 5;
                        const textHeight = (_h = technique._textHeight) !== null && _h !== void 0 ? _h : 1.2;
                        const padding = (_j = paint['icon-text-fit-padding']) !== null && _j !== void 0 ? _j : [0, 0, 0, 0];
                        const fitW = textWidth * textSize + padding[0] + padding[2];
                        const fitH = textHeight * textSize + padding[1] + padding[3];
                        if (textFit === 'width' || textFit === 'both') {
                            sprite.scale.x = fitW;
                        }
                        if (textFit === 'height' || textFit === 'both') {
                            sprite.scale.y = fitH;
                        }
                    }
                    const offset = paint['icon-offset'];
                    const translate = paint['icon-translate'];
                    const posX = ((_k = offset === null || offset === void 0 ? void 0 : offset[0]) !== null && _k !== void 0 ? _k : 0) + ((_l = translate === null || translate === void 0 ? void 0 : translate[0]) !== null && _l !== void 0 ? _l : 0);
                    const posY = ((_m = offset === null || offset === void 0 ? void 0 : offset[1]) !== null && _m !== void 0 ? _m : 0) + ((_o = translate === null || translate === void 0 ? void 0 : translate[1]) !== null && _o !== void 0 ? _o : 0);
                    if (posX || posY) {
                        sprite.position.set(posX, posY, 0);
                    }
                    const anchor = paint['icon-anchor'];
                    if (anchor && anchor !== 'center') {
                        this.applyAnchor(sprite, anchor);
                    }
                    const iconSize = (_p = paint['icon-size']) !== null && _p !== void 0 ? _p : 1;
                    if (iconSize !== 1 && !textFit) {
                        const iw = material.iconWidth || 32;
                        const ih = material.iconHeight || 32;
                        sprite.scale.set(iconSize * iw, iconSize * ih, 1);
                    }
                    else if (!textFit) {
                        const iw = material.iconWidth || 32;
                        const ih = material.iconHeight || 32;
                        if (sprite.scale.x === 1 && sprite.scale.y === 1) {
                            sprite.scale.set(iw, ih, 1);
                        }
                    }
                    object = sprite;
                }
                else if (material instanceof MBSDFTextMaterial_1.MBSDFTextMaterial) {
                    const text = paint['text-field'] || '';
                    const size = paint['text-size'] || 16;
                    const mesh = this.buildTextMesh(text, size, paint, material);
                    object = mesh;
                }
                else {
                    object = new THREE.Points(subGeometry, material);
                }
            }
            else
                switch (layerType) {
                    case 'line':
                        object = new THREE.LineSegments(subGeometry, material);
                        break;
                    case 'circle':
                    case 'heatmap':
                        object = new THREE.Points(subGeometry, material);
                        break;
                    case 'fill-extrusion':
                    case 'raster':
                        object = new THREE.Mesh(subGeometry, material);
                        break;
                    case 'fill':
                    case 'background':
                    default: {
                        const mesh = new THREE.Mesh(subGeometry, material);
                        if (material instanceof MapFillMaterial_1.MapFillMaterial && material.hasOutline) {
                            const edges = new THREE.EdgesGeometry(subGeometry);
                            const outlineMat = new THREE.LineBasicMaterial({
                                color: material.outlineColor,
                                depthTest: true,
                            });
                            const outline = new THREE.LineSegments(edges, outlineMat);
                            outline.renderOrder = renderOrder + 0.001;
                            mesh.add(outline);
                        }
                        object = mesh;
                        break;
                    }
                }
            object.renderOrder = renderOrder;
            object.userData.technique = technique;
            object.userData.layerId = layerId;
            object.frustumCulled = false;
            result.push({
                object,
                layerId,
                renderOrder,
                technique,
            });
        }
        return result;
    }
    clearCache() {
        for (const mat of this.m_materialCache.values()) {
            mat.dispose();
        }
        this.m_materialCache.clear();
    }
    loadDemTexture(material, tile) {
        if (!this.m_demTileUrl)
            return;
        const mat = material;
        if (typeof mat.setDemTexture !== 'function')
            return;
        const tk = tile.tileKey;
        if (!tk)
            return;
        const z = tk.level;
        const x = tk.column;
        const y = tk.row;
        const url = this.m_demTileUrl
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));
        const loader = new THREE.TextureLoader();
        loader.load(url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            mat.setDemTexture(texture);
        }, undefined, () => { });
    }
    applyAnchor(sprite, anchor) {
        var _a;
        const map = {
            'center': [0, 0], 'left': [-0.5, 0], 'right': [0.5, 0],
            'top': [0, 0.5], 'bottom': [0, -0.5],
            'top-left': [-0.5, 0.5], 'top-right': [0.5, 0.5],
            'bottom-left': [-0.5, -0.5], 'bottom-right': [0.5, -0.5],
        };
        const offset = (_a = map[anchor]) !== null && _a !== void 0 ? _a : [0, 0];
        sprite.center.set(0.5 + offset[0], 0.5 + offset[1]);
    }
    buildTextMesh(text, size, paint, material) {
        var _a;
        const shaped = paint._shaped;
        const letterSpacing = (_a = paint['text-letter-spacing']) !== null && _a !== void 0 ? _a : 0;
        let quads;
        if (shaped) {
            const fontSize = size;
            const allQuads = (0, TextShaping_1.generateTextQuads)(shaped, fontSize, letterSpacing);
            quads = allQuads.map(q => ({ x: q.x, y: q.y, w: q.width, h: q.height }));
        }
        else {
            const charWidth = size * 0.6;
            const textLen = text.length;
            quads = [];
            for (let i = 0; i < textLen; i++) {
                quads.push({
                    x: i * charWidth - textLen * charWidth / 2,
                    y: -size * 0.6,
                    w: charWidth,
                    h: size * 1.2,
                });
            }
        }
        if (quads.length === 0) {
            const geom = new THREE.PlaneGeometry(size * 0.1, size * 0.1);
            return new THREE.Mesh(geom, material);
        }
        const positions = new Float32Array(quads.length * 12);
        const uvs = new Float32Array(quads.length * 12);
        const indices = new Uint16Array(quads.length * 6);
        for (let i = 0; i < quads.length; i++) {
            const q = quads[i];
            const x0 = q.x, y0 = q.y;
            const x1 = q.x + q.w, y1 = q.y + q.h;
            positions[i * 12 + 0] = x0;
            positions[i * 12 + 1] = y0;
            positions[i * 12 + 2] = x1;
            positions[i * 12 + 3] = y0;
            positions[i * 12 + 4] = x1;
            positions[i * 12 + 5] = y1;
            positions[i * 12 + 6] = x0;
            positions[i * 12 + 7] = y0;
            positions[i * 12 + 8] = x1;
            positions[i * 12 + 9] = y1;
            positions[i * 12 + 10] = x0;
            positions[i * 12 + 11] = y1;
            const tx = i / Math.max(quads.length, 1);
            const tw = 1 / Math.max(quads.length, 1);
            uvs[i * 12 + 0] = tx;
            uvs[i * 12 + 1] = 0;
            uvs[i * 12 + 2] = tx + tw;
            uvs[i * 12 + 3] = 0;
            uvs[i * 12 + 4] = tx + tw;
            uvs[i * 12 + 5] = 1;
            uvs[i * 12 + 6] = tx;
            uvs[i * 12 + 7] = 0;
            uvs[i * 12 + 8] = tx + tw;
            uvs[i * 12 + 9] = 1;
            uvs[i * 12 + 10] = tx;
            uvs[i * 12 + 11] = 1;
            const vi = i * 6;
            indices[vi + 0] = i * 4 + 0;
            indices[vi + 1] = i * 4 + 1;
            indices[vi + 2] = i * 4 + 2;
            indices[vi + 3] = i * 4 + 3;
            indices[vi + 4] = i * 4 + 4;
            indices[vi + 5] = i * 4 + 5;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
        const mesh = new THREE.Mesh(geom, material);
        const offset = paint['text-offset'];
        if (offset && (offset[0] || offset[1])) {
            const emScale = size;
            mesh.position.set(offset[0] * emScale, offset[1] * emScale, 0);
        }
        const radialOffset = paint['text-radial-offset'];
        if (radialOffset && radialOffset !== 0) {
            mesh.position.x += radialOffset * size;
        }
        return mesh;
    }
    getMaterialKey(technique, paint) {
        return `${technique.name}:${JSON.stringify(paint)}`;
    }
    bufferToTypedArray(attr) {
        var _a;
        if (!attr || !attr.buffer)
            return null;
        let array;
        const buffer = attr.buffer;
        const byteOffset = (_a = attr.byteOffset) !== null && _a !== void 0 ? _a : 0;
        switch (attr.type) {
            case 'float':
            case 'float32':
                array = new Float32Array(buffer, byteOffset);
                break;
            case 'uint32':
                array = new Uint32Array(buffer, byteOffset);
                break;
            default:
                if (buffer instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) {
                    array = new Float32Array(buffer, byteOffset);
                }
                else {
                    return null;
                }
        }
        return array;
    }
}
exports.MBRenderLayer = MBRenderLayer;
//# sourceMappingURL=MBRenderLayer.js.map