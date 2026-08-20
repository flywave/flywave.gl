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
exports.MBStyleSymbolPlacement = void 0;
const THREE = __importStar(require("three"));
const PlacementEngine_1 = require("./PlacementEngine");
const LineAnchor_1 = require("./LineAnchor");
const CrossTileSymbolIndex_1 = require("./CrossTileSymbolIndex");
class MBStyleSymbolPlacement {
    constructor(m_mapView, m_dataSource) {
        this.m_mapView = m_mapView;
        this.m_dataSource = m_dataSource;
        this.m_placementEngine = new PlacementEngine_1.PlacementEngine();
        this.m_crossTileIndex = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        this.m_lastZoom = -1;
        this.m_collisionDebug = false;
        this.m_debugOverlay = null;
    }
    setCollisionDebug(enabled) {
        this.m_collisionDebug = enabled;
    }
    run() {
        var _a, _b;
        const zoom = this.m_mapView.zoomLevel;
        const camera = this.m_mapView.camera;
        const canvas = this.m_mapView.canvas;
        const w = canvas.width;
        const h = canvas.height;
        const bearing = (_a = this.m_mapView.heading) !== null && _a !== void 0 ? _a : 0;
        const symbols = this.collectSymbols(camera, w, h);
        if (symbols.length === 0)
            return;
        try {
            const scene = this.m_mapView.m_scene;
            const fog = scene === null || scene === void 0 ? void 0 : scene.fog;
            const fogAlpha = (_b = THREE.UniformsLib.fog.fogAlpha) === null || _b === void 0 ? void 0 : _b.value;
            if (fog && typeof fogAlpha === 'number' && fogAlpha > 0 && fog.far > fog.near) {
                const camPos = camera.position;
                const fwd = camera.getWorldDirection(new THREE.Vector3());
                const tmp = new THREE.Vector3();
                for (const sym of symbols) {
                    if (!sym.object)
                        continue;
                    sym.object.getWorldPosition(tmp);
                    const depth = -tmp.sub(camPos).dot(fwd);
                    const t = (depth - fog.near) / (fog.far - fog.near);
                    if (t <= 0)
                        continue;
                    const falloff = 1 - Math.min(1, Math.exp(-6 * t));
                    const opacity = Math.min(1, 1.00747 * falloff * falloff * falloff) * fogAlpha;
                    if (opacity > 0.9) {
                        sym.opacity = 0;
                        sym.object.visible = false;
                    }
                }
            }
        }
        catch (_c) { }
        this.assignCrossTileIDs(symbols, zoom);
        this.applyZOrder(symbols);
        this.applyOffsets(symbols, bearing, camera, w, h);
        this.applyRotationAlignment(symbols, bearing);
        if (zoom !== this.m_lastZoom) {
            this.m_lastZoom = zoom;
            const results = this.m_placementEngine.place(symbols, Date.now(), zoom);
            for (const sym of symbols) {
                const key = sym.crossTileID
                    ? `cid:${sym.crossTileID}`
                    : `${sym.layerId}:${sym.featureId}`;
                const result = results.get(key);
                if (result && sym.object) {
                    sym.object.visible = result.opacity > 0.01;
                    if (result.opacity < 1) {
                        sym.object.traverse((child) => {
                            if (child.material) {
                                const mat = child.material;
                                if (Array.isArray(mat)) {
                                    for (const m of mat) {
                                        m.opacity = result.opacity;
                                        m.transparent = true;
                                    }
                                }
                                else {
                                    mat.opacity = result.opacity;
                                    mat.transparent = true;
                                }
                            }
                        });
                    }
                }
            }
        }
        if (this.m_collisionDebug) {
            this.drawCollisionDebug(symbols, camera, w, h);
        }
        else if (this.m_debugOverlay) {
            this.m_debugOverlay.visible = false;
        }
    }
    drawCollisionDebug(symbols, camera, canvasW, canvasH) {
        const scene = this.m_mapView.m_scene;
        if (!scene)
            return;
        if (!this.m_debugOverlay) {
            const geom = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                depthTest: false,
                depthWrite: false,
            });
            this.m_debugOverlay = new THREE.LineSegments(geom, mat);
            this.m_debugOverlay.frustumCulled = false;
            this.m_debugOverlay.renderOrder = 9999;
            scene.add(this.m_debugOverlay);
        }
        this.m_debugOverlay.visible = true;
        const positions = [];
        const colors = [];
        const ndc = new THREE.Vector3();
        const unproj = new THREE.Vector3();
        const addBox = (cx, cy, w, h, placed) => {
            const halfW = w / 2;
            const halfH = h / 2;
            const corners = [
                [cx - halfW, cy - halfH], [cx + halfW, cy - halfH],
                [cx + halfW, cy - halfH], [cx + halfW, cy + halfH],
                [cx + halfW, cy + halfH], [cx - halfW, cy + halfH],
                [cx - halfW, cy + halfH], [cx - halfW, cy - halfH],
            ];
            const r = placed ? 0.0 : 1.0;
            const g = placed ? 0.0 : 0.5;
            const b = placed ? 1.0 : 0.0;
            for (const [px, py] of corners) {
                ndc.set((px / canvasW) * 2 - 1, -(py / canvasH) * 2 + 1, 0.5);
                ndc.unproject(camera);
                positions.push(ndc.x, ndc.y, ndc.z);
                colors.push(r, g, b);
            }
        };
        for (const sym of symbols) {
            const placed = sym.object ? sym.object.visible !== false : true;
            if (sym.iconBox)
                addBox(sym.screenX, sym.screenY, sym.iconBox.w, sym.iconBox.h, placed);
            if (sym.textBox)
                addBox(sym.screenX, sym.screenY, sym.textBox.w, sym.textBox.h, placed);
        }
        const geo = this.m_debugOverlay.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.attributes.position.needsUpdate = true;
    }
    applyRotationAlignment(symbols, bearing) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        for (const sym of symbols) {
            if (!sym.object)
                continue;
            const obj = sym.object;
            const tech = (_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique;
            if (!tech)
                continue;
            const layout = (_b = tech._layout) !== null && _b !== void 0 ? _b : {};
            const isText = tech.name === 'text';
            const isIcon = tech.name === 'labeled-icon';
            if (isIcon) {
                const alignment = (_c = layout['icon-rotation-alignment']) !== null && _c !== void 0 ? _c : 'auto';
                const placement = (_d = layout['symbol-placement']) !== null && _d !== void 0 ? _d : 'point';
                const isMapAligned = alignment === 'map' || (alignment === 'auto' && placement === 'line');
                if (isMapAligned && obj.isSprite) {
                    const bearingRad = -bearing * Math.PI / 180;
                    const mat = obj.material;
                    if (mat) {
                        mat.rotation = ((_f = (_e = tech._paint) === null || _e === void 0 ? void 0 : _e['icon-rotate']) !== null && _f !== void 0 ? _f : 0) * Math.PI / 180 + bearingRad;
                    }
                }
            }
            if (isText) {
                const alignment = (_g = layout['text-rotation-alignment']) !== null && _g !== void 0 ? _g : 'auto';
                const placement = (_h = layout['symbol-placement']) !== null && _h !== void 0 ? _h : 'point';
                const isMapAligned = alignment === 'map' || (alignment === 'auto' && placement === 'line');
                if (isMapAligned) {
                    const bearingRad = -bearing * Math.PI / 180;
                    const textRotate = ((_j = layout['text-rotate']) !== null && _j !== void 0 ? _j : 0) * Math.PI / 180;
                    obj.rotation.z = textRotate + bearingRad;
                }
                else {
                    const textRotate = ((_k = layout['text-rotate']) !== null && _k !== void 0 ? _k : 0) * Math.PI / 180;
                    obj.rotation.z = textRotate;
                }
            }
            if (isText && layout['text-keep-upright'] !== false) {
                const placement = (_l = layout['symbol-placement']) !== null && _l !== void 0 ? _l : 'point';
                if (placement === 'line') {
                    const currentRot = obj.rotation.z;
                    const normalized = ((currentRot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                    if (normalized > Math.PI / 2 && normalized < 3 * Math.PI / 2) {
                        obj.rotation.z += Math.PI;
                    }
                }
            }
            if (isIcon && layout['icon-keep-upright'] === true) {
                const placement = (_m = layout['symbol-placement']) !== null && _m !== void 0 ? _m : 'point';
                if (placement === 'line' && obj.isSprite) {
                    const mat = obj.material;
                    if (mat) {
                        const normalized = ((mat.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                        if (normalized > Math.PI / 2 && normalized < 3 * Math.PI / 2) {
                            mat.rotation += Math.PI;
                        }
                    }
                }
            }
            const pitchAlign = isText
                ? ((_o = layout['text-pitch-alignment']) !== null && _o !== void 0 ? _o : 'auto')
                : ((_p = layout['icon-pitch-alignment']) !== null && _p !== void 0 ? _p : 'auto');
            if (pitchAlign === 'map') {
                const tilt = (_q = this.m_mapView.tilt) !== null && _q !== void 0 ? _q : 0;
                obj.rotation.x = -tilt * Math.PI / 180;
            }
        }
    }
    collectSymbols(camera, canvasW, canvasH) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10;
        const symbols = [];
        const worldPosition = new THREE.Vector3();
        const tiles = this.m_dataSource.getDecodedTiles();
        if (tiles.length === 0)
            return symbols;
        for (const tile of tiles) {
            if (!tile.objects)
                continue;
            for (const obj of tile.objects) {
                if (!((_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique))
                    continue;
                const tech = obj.userData.technique;
                if (tech.name !== 'text' && tech.name !== 'labeled-icon')
                    continue;
                obj.getWorldPosition(worldPosition);
                const layout = (_b = tech._layout) !== null && _b !== void 0 ? _b : {};
                const placement = (_c = layout['symbol-placement']) !== null && _c !== void 0 ? _c : 'point';
                const linePathData = (_g = (_f = (_e = (_d = obj.userData) === null || _d === void 0 ? void 0 : _d.feature) === null || _e === void 0 ? void 0 : _e.objInfos) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g._linePath;
                if ((placement === 'line' || placement === 'line-center') && linePathData && linePathData.length >= 2) {
                    const screenPts = linePathData.map((pt) => {
                        var _a;
                        const wp = new THREE.Vector3(pt[0], pt[1], 0);
                        (_a = obj.parent) === null || _a === void 0 ? void 0 : _a.localToWorld(wp);
                        const sp = wp.clone().project(camera);
                        return new THREE.Vector2((sp.x * 0.5 + 0.5) * canvasW, (-sp.y * 0.5 + 0.5) * canvasH);
                    });
                    const spacing = (_h = layout['symbol-spacing']) !== null && _h !== void 0 ? _h : 250;
                    const maxAngle = ((_j = layout['text-max-angle']) !== null && _j !== void 0 ? _j : 45) * Math.PI / 180;
                    const anchors = (0, LineAnchor_1.getLineAnchors)(screenPts, spacing, maxAngle);
                    for (const anchor of anchors) {
                        const feature = obj.userData.feature;
                        const featureId = (_o = (_m = (_l = (_k = feature === null || feature === void 0 ? void 0 : feature.objInfos) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.$id) !== null && _m !== void 0 ? _m : obj.id) !== null && _o !== void 0 ? _o : '';
                        const textSize = (_p = layout['text-size']) !== null && _p !== void 0 ? _p : 16;
                        const iconSize = (_q = layout['icon-size']) !== null && _q !== void 0 ? _q : 1;
                        let iconBox;
                        let textBox;
                        if (tech.name === 'labeled-icon')
                            iconBox = { w: 32 * iconSize, h: 32 * iconSize };
                        if (tech.name === 'text' || layout['text-field']) {
                            textBox = {
                                w: ((_r = tech._textWidth) !== null && _r !== void 0 ? _r : textSize * 5) * textSize,
                                h: ((_s = tech._textHeight) !== null && _s !== void 0 ? _s : textSize * 1.2) * textSize,
                            };
                        }
                        symbols.push({
                            id: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}:${featureId}:${anchor.segmentIndex}`,
                            layerId: (_t = tech._layerId) !== null && _t !== void 0 ? _t : '',
                            featureId,
                            screenX: anchor.x,
                            screenY: anchor.y,
                            iconBox,
                            textBox,
                            allowOverlap: layout['icon-allow-overlap'] === true || layout['text-allow-overlap'] === true,
                            ignorePlacement: layout['icon-ignore-placement'] === true || layout['text-ignore-placement'] === true,
                            priority: typeof layout['symbol-sort-key'] === 'number'
                                ? -layout['symbol-sort-key']
                                : ((_u = tech._renderOrder) !== null && _u !== void 0 ? _u : 0),
                            opacity: 1,
                            object: obj,
                            variableAnchors: layout['text-variable-anchor'],
                            textRadialOffset: (_v = layout['text-radial-offset']) !== null && _v !== void 0 ? _v : 0,
                            text: (_x = (_w = tech.text) !== null && _w !== void 0 ? _w : tech.imageTexture) !== null && _x !== void 0 ? _x : '',
                            tileKey: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}`,
                        });
                    }
                    continue;
                }
                const screen = worldPosition.clone().project(camera);
                const sx = (screen.x * 0.5 + 0.5) * canvasW;
                const sy = (-screen.y * 0.5 + 0.5) * canvasH;
                const feature = obj.userData.feature;
                const featureId = (_1 = (_0 = (_z = (_y = feature === null || feature === void 0 ? void 0 : feature.objInfos) === null || _y === void 0 ? void 0 : _y[0]) === null || _z === void 0 ? void 0 : _z.$id) !== null && _0 !== void 0 ? _0 : obj.id) !== null && _1 !== void 0 ? _1 : '';
                const textSize = (_2 = layout['text-size']) !== null && _2 !== void 0 ? _2 : 16;
                const iconSize = (_3 = layout['icon-size']) !== null && _3 !== void 0 ? _3 : 1;
                let iconBox;
                let textBox;
                if (tech.name === 'labeled-icon') {
                    iconBox = { w: 32 * iconSize, h: 32 * iconSize };
                }
                if (tech.name === 'text' || layout['text-field']) {
                    const textWidth = (_4 = tech._textWidth) !== null && _4 !== void 0 ? _4 : textSize * 5;
                    const textHeight = (_5 = tech._textHeight) !== null && _5 !== void 0 ? _5 : textSize * 1.2;
                    textBox = { w: textWidth * textSize, h: textHeight * textSize };
                }
                symbols.push({
                    id: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}:${featureId}`,
                    layerId: (_6 = tech._layerId) !== null && _6 !== void 0 ? _6 : '',
                    featureId,
                    screenX: sx,
                    screenY: sy,
                    iconBox,
                    textBox,
                    allowOverlap: layout['icon-allow-overlap'] === true || layout['text-allow-overlap'] === true,
                    ignorePlacement: layout['icon-ignore-placement'] === true || layout['text-ignore-placement'] === true,
                    priority: typeof layout['symbol-sort-key'] === 'number'
                        ? -layout['symbol-sort-key']
                        : ((_7 = tech._renderOrder) !== null && _7 !== void 0 ? _7 : 0),
                    opacity: 1,
                    object: obj,
                    variableAnchors: layout['text-variable-anchor'],
                    textRadialOffset: (_8 = layout['text-radial-offset']) !== null && _8 !== void 0 ? _8 : 0,
                    text: (_10 = (_9 = tech.text) !== null && _9 !== void 0 ? _9 : tech.imageTexture) !== null && _10 !== void 0 ? _10 : '',
                    tileKey: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}`,
                    iconOptional: layout['icon-optional'] === true,
                });
            }
        }
        return symbols;
    }
    assignCrossTileIDs(symbols, zoom) {
        if (symbols.length === 0)
            return;
        const byLayer = new Map();
        for (const sym of symbols) {
            if (!sym.text)
                continue;
            const arr = byLayer.get(sym.layerId);
            if (arr)
                arr.push(sym);
            else
                byLayer.set(sym.layerId, [sym]);
        }
        for (const [layerId, syms] of byLayer) {
            const idMap = this.m_crossTileIndex.assignIDs(layerId, syms.map(s => {
                var _a;
                return ({
                    localId: s.id,
                    text: s.text,
                    screenX: s.screenX,
                    screenY: s.screenY,
                    tileKey: (_a = s.tileKey) !== null && _a !== void 0 ? _a : '',
                    zoom,
                });
            }));
            for (const s of syms) {
                const cid = idMap.get(s.id);
                if (cid)
                    s.crossTileID = cid;
            }
        }
    }
    applyZOrder(symbols) {
        var _a, _b, _c;
        for (const sym of symbols) {
            if (!sym.object)
                continue;
            const tech = (_a = sym.object.userData) === null || _a === void 0 ? void 0 : _a.technique;
            const zOrder = (_c = (_b = tech === null || tech === void 0 ? void 0 : tech._layout) === null || _b === void 0 ? void 0 : _b['symbol-z-order']) !== null && _c !== void 0 ? _c : 'auto';
            const overlap = sym.allowOverlap;
            switch (zOrder) {
                case 'viewport-y':
                    sym.priority = -sym.screenY;
                    if (sym.object)
                        sym.object.renderOrder = 1000 + sym.screenY * 0.01;
                    break;
                case 'auto':
                    if (overlap) {
                        sym.priority = -sym.screenY;
                        if (sym.object)
                            sym.object.renderOrder = 1000 + sym.screenY * 0.01;
                    }
                    break;
                case 'source':
                default:
                    break;
            }
        }
    }
    applyOffsets(symbols, bearing, camera, canvasW, canvasH) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18;
        const bearingRad = -bearing * Math.PI / 180;
        const cosB = Math.cos(bearingRad);
        const sinB = Math.sin(bearingRad);
        const worldPos = new THREE.Vector3();
        const screen = new THREE.Vector3();
        const unproj = new THREE.Vector3();
        for (const sym of symbols) {
            const obj = sym.object;
            if (!obj)
                continue;
            const tech = (_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique;
            if (!tech)
                continue;
            let dxPx = 0;
            let dyPx = 0;
            let anchor = 'map';
            if (tech.name === 'text') {
                const layout = (_b = tech._layout) !== null && _b !== void 0 ? _b : {};
                const textOffset = (_c = tech._textOffset) !== null && _c !== void 0 ? _c : layout['text-offset'];
                const textSize = (_e = (_d = layout['text-size']) !== null && _d !== void 0 ? _d : tech.size) !== null && _e !== void 0 ? _e : 16;
                if (Array.isArray(textOffset)) {
                    dxPx += Number((_f = textOffset[0]) !== null && _f !== void 0 ? _f : 0) * textSize;
                    dyPx += Number((_g = textOffset[1]) !== null && _g !== void 0 ? _g : 0) * textSize;
                }
                const translate = (_h = tech._textTranslate) !== null && _h !== void 0 ? _h : (_j = tech._paint) === null || _j === void 0 ? void 0 : _j['text-translate'];
                if (Array.isArray(translate)) {
                    dxPx += Number((_k = translate[0]) !== null && _k !== void 0 ? _k : 0);
                    dyPx += Number((_l = translate[1]) !== null && _l !== void 0 ? _l : 0);
                    anchor = (_p = (_m = tech._textTranslateAnchor) !== null && _m !== void 0 ? _m : (_o = tech._paint) === null || _o === void 0 ? void 0 : _o['text-translate-anchor']) !== null && _p !== void 0 ? _p : 'map';
                }
            }
            else if (tech.name === 'labeled-icon') {
                const layout = (_q = tech._layout) !== null && _q !== void 0 ? _q : {};
                const iconOffset = (_r = tech._iconOffset) !== null && _r !== void 0 ? _r : layout['icon-offset'];
                if (Array.isArray(iconOffset)) {
                    dxPx += Number((_s = iconOffset[0]) !== null && _s !== void 0 ? _s : 0);
                    dyPx += Number((_t = iconOffset[1]) !== null && _t !== void 0 ? _t : 0);
                }
                if (!layout['text-field']) {
                    const iconAnchor = (_u = layout['icon-anchor']) !== null && _u !== void 0 ? _u : 'center';
                    const atlas = this.m_dataSource.spriteAtlas;
                    const iconName = (_v = tech.imageTexture) !== null && _v !== void 0 ? _v : layout['icon-image'];
                    const iconInfo = (_w = atlas === null || atlas === void 0 ? void 0 : atlas.icons) === null || _w === void 0 ? void 0 : _w.get(iconName);
                    if (iconInfo && iconAnchor !== 'center') {
                        const iconScale = (_x = layout['icon-size']) !== null && _x !== void 0 ? _x : 1;
                        const halfW = ((_y = iconInfo.width) !== null && _y !== void 0 ? _y : 0) * iconScale * 0.5;
                        const halfH = ((_z = iconInfo.height) !== null && _z !== void 0 ? _z : 0) * iconScale * 0.5;
                        const ax = iconAnchor.includes('left') ? +halfW
                            : iconAnchor.includes('right') ? -halfW : 0;
                        const ay = iconAnchor.includes('top') ? -halfH
                            : iconAnchor.includes('bottom') ? +halfH : 0;
                        dxPx += ax;
                        dyPx += ay;
                    }
                }
                const translate = (_0 = tech._iconTranslate) !== null && _0 !== void 0 ? _0 : (_1 = tech._paint) === null || _1 === void 0 ? void 0 : _1['icon-translate'];
                if (Array.isArray(translate)) {
                    dxPx += Number((_2 = translate[0]) !== null && _2 !== void 0 ? _2 : 0);
                    dyPx += Number((_3 = translate[1]) !== null && _3 !== void 0 ? _3 : 0);
                    anchor = (_6 = (_4 = tech._iconTranslateAnchor) !== null && _4 !== void 0 ? _4 : (_5 = tech._paint) === null || _5 === void 0 ? void 0 : _5['icon-translate-anchor']) !== null && _6 !== void 0 ? _6 : 'map';
                }
            }
            if (dxPx === 0 && dyPx === 0) {
                const zOffset = Number((_10 = (_8 = (_7 = tech._paint) === null || _7 === void 0 ? void 0 : _7['symbol-z-offset']) !== null && _8 !== void 0 ? _8 : (_9 = tech._layout) === null || _9 === void 0 ? void 0 : _9['symbol-z-offset']) !== null && _10 !== void 0 ? _10 : 0);
                const zElevate = (_14 = (_12 = (_11 = tech._paint) === null || _11 === void 0 ? void 0 : _11['symbol-z-elevate']) !== null && _12 !== void 0 ? _12 : (_13 = tech._layout) === null || _13 === void 0 ? void 0 : _13['symbol-z-elevate']) !== null && _14 !== void 0 ? _14 : false;
                if (zOffset === 0 && !zElevate)
                    continue;
                obj.getWorldPosition(worldPos);
                const parent = obj.parent;
                if (parent) {
                    const target = worldPos.clone();
                    target.z += zOffset;
                    parent.worldToLocal(target);
                    obj.position.copy(target);
                }
                else {
                    obj.position.z += zOffset;
                }
                continue;
            }
            let ox = dxPx;
            let oy = dyPx;
            if (anchor === 'map') {
                const rx = ox * cosB - oy * sinB;
                const ry = ox * sinB + oy * cosB;
                ox = rx;
                oy = ry;
            }
            obj.getWorldPosition(worldPos);
            screen.copy(worldPos).project(camera);
            const ndx = (ox / canvasW) * 2;
            const ndy = (oy / canvasH) * 2;
            unproj.set(screen.x + ndx, screen.y + ndy, screen.z).unproject(camera);
            const parent = obj.parent;
            if (parent) {
                const delta = unproj.sub(worldPos);
                parent.worldToLocal(delta.add(obj.getWorldPosition(new THREE.Vector3())));
                obj.position.copy(delta);
            }
            else {
                obj.position.copy(obj.position).add(unproj.sub(worldPos));
            }
            const zOffset = Number((_18 = (_16 = (_15 = tech._paint) === null || _15 === void 0 ? void 0 : _15['symbol-z-offset']) !== null && _16 !== void 0 ? _16 : (_17 = tech._layout) === null || _17 === void 0 ? void 0 : _17['symbol-z-offset']) !== null && _18 !== void 0 ? _18 : 0);
            if (zOffset !== 0) {
                obj.position.z += zOffset;
            }
        }
    }
    invalidate() {
        this.m_lastZoom = -1;
    }
}
exports.MBStyleSymbolPlacement = MBStyleSymbolPlacement;
//# sourceMappingURL=MBStyleSymbolPlacement.js.map