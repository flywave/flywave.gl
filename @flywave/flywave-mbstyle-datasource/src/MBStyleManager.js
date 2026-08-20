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
exports.MBStyleManager = void 0;
class MBStyleManager {
    constructor() {
        this.m_resolvedSources = new Map();
    }
    async loadStyle(style, accessToken) {
        this.m_accessToken = accessToken;
        if (typeof style === 'string') {
            const response = await fetch(style);
            this.m_style = await response.json();
        }
        else {
            this.m_style = Object.assign({}, style);
        }
        await this.fetchUrlImports();
        this.mergeImports();
        await this.resolveSources();
    }
    async fetchUrlImports() {
        if (!this.m_style)
            return;
        const imports = this.m_style.imports;
        if (!Array.isArray(imports) || imports.length === 0)
            return;
        await Promise.all(imports.map(async (imp) => {
            if (imp.data)
                return;
            const url = imp.url;
            if (!url || typeof url !== 'string')
                return;
            try {
                const fetchUrl = this.resolveImportUrl(url);
                const resp = await fetch(fetchUrl);
                if (!resp.ok)
                    return;
                const json = await resp.json();
                imp.data = json;
            }
            catch (_a) {
            }
        }));
    }
    resolveImportUrl(url) {
        if (url.startsWith('mapbox://styles/')) {
            const id = url.replace('mapbox://styles/', '');
            const base = `https://api.mapbox.com/styles/v1/${id}`;
            return this.m_accessToken ? `${base}?access_token=${this.m_accessToken}` : base;
        }
        if (url.startsWith('mapbox://')) {
            const id = url.replace('mapbox://', '');
            const base = `https://api.mapbox.com/${id}`;
            return this.m_accessToken ? `${base}?access_token=${this.m_accessToken}` : base;
        }
        if (url.startsWith('local://')) {
            return url.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        }
        return url;
    }
    mergeImports() {
        var _a, _b, _c;
        if (!this.m_style)
            return;
        const imports = this.m_style.imports;
        if (!Array.isArray(imports) || imports.length === 0)
            return;
        const mergedLayers = [...((_a = this.m_style.layers) !== null && _a !== void 0 ? _a : [])];
        const mergedSources = Object.assign({}, this.m_style.sources);
        const configMap = {};
        const importThemes = {};
        for (const imp of imports) {
            const data = imp.data;
            if (!data)
                continue;
            importThemes[imp.id] = (_c = (_b = imp['color-theme']) !== null && _b !== void 0 ? _b : data['color-theme']) !== null && _c !== void 0 ? _c : null;
            if (imp.config) {
                for (const [k, v] of Object.entries(imp.config)) {
                    configMap[k] = v;
                }
            }
            if (data.sources) {
                for (const [sid, spec] of Object.entries(data.sources)) {
                    if (!mergedSources[sid])
                        mergedSources[sid] = spec;
                }
            }
            if (data.layers) {
                for (const l of data.layers) {
                    l._importScope = imp.id;
                    mergedLayers.push(l);
                }
            }
            if (data.lights && !this.m_style.lights) {
                this.m_style.lights = data.lights;
                this.m_style._lightsImportScope = imp.id;
            }
            if (data.sprite && !this.m_style.sprite) {
                this.m_style.sprite = data.sprite;
            }
            if (data.glyphs && !this.m_style.glyphs) {
                this.m_style.glyphs = data.glyphs;
            }
            if (data.fog && !this.m_style.fog) {
                this.m_style.fog = data.fog;
                this.m_style._fogImportScope = imp.id;
            }
            if (data.sky && !this.m_style.sky) {
                this.m_style.sky = data.sky;
            }
            if (data.terrain && !this.m_style.terrain) {
                this.m_style.terrain = data.terrain;
            }
        }
        this.m_style.layers = mergedLayers;
        this.m_style.sources = mergedSources;
        this.m_style._config = configMap;
        this.m_style._importThemes = importThemes;
    }
    async reloadSources() {
        await this.resolveSources();
    }
    async resolveSources() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (!this.m_style)
            return;
        this.m_resolvedSources.clear();
        for (const [sourceId, spec] of Object.entries(this.m_style.sources)) {
            const tileUrls = [...(_a = spec.tiles) !== null && _a !== void 0 ? _a : []];
            const url = (_b = spec.url) !== null && _b !== void 0 ? _b : '';
            const scheme = (_c = spec.scheme) !== null && _c !== void 0 ? _c : 'xyz';
            if (url && tileUrls.length === 0) {
                const tileUrl = this.resolveTileUrl(url);
                if (tileUrl) {
                    tileUrls.push(tileUrl);
                }
                else {
                    try {
                        const fetchUrl = url.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                        const resp = await fetch(fetchUrl);
                        if (resp.ok) {
                            const tilejson = await resp.json();
                            for (const t of (_d = tilejson.tiles) !== null && _d !== void 0 ? _d : [])
                                tileUrls.push(t);
                            if (!Array.isArray(spec.bounds) && Array.isArray(tilejson.bounds)) {
                                spec.bounds = tilejson.bounds;
                            }
                            if (spec.minzoom === undefined)
                                spec.minzoom = (_e = tilejson.minzoom) !== null && _e !== void 0 ? _e : 0;
                            if (spec.maxzoom === undefined)
                                spec.maxzoom = (_f = tilejson.maxzoom) !== null && _f !== void 0 ? _f : 22;
                        }
                    }
                    catch (_j) { }
                }
            }
            const resolved = {
                sourceId,
                type: spec.type,
                tileUrls,
                minzoom: (_g = spec.minzoom) !== null && _g !== void 0 ? _g : 0,
                maxzoom: (_h = spec.maxzoom) !== null && _h !== void 0 ? _h : 22,
                attribution: spec.attribution,
            };
            resolved.scheme = scheme;
            const bounds = spec.bounds;
            if (Array.isArray(bounds) && bounds.length === 4) {
                resolved.bounds = bounds;
            }
            this.m_resolvedSources.set(sourceId, resolved);
        }
    }
    resolveTileUrl(url) {
        if (url.startsWith('mapbox://')) {
            const id = url.replace('mapbox://', '');
            const tokenQuery = this.m_accessToken
                ? `?access_token=${this.m_accessToken}`
                : '';
            return `https://api.mapbox.com/v4/${id}/{z}/{x}/{y}.mvt${tokenQuery}`;
        }
        if (url.includes('{z}') || url.includes('{x}') || url.includes('{y}')) {
            return url;
        }
        return undefined;
    }
    async loadSprite(spriteUrl) {
        const spriteRatio = (typeof window !== 'undefined'
            ? Math.min(2, window.devicePixelRatio || 1) : 1);
        let base = spriteUrl;
        if (spriteRatio >= 2 && !/@[0-9]x(\.json|\.png)?$/.test(spriteUrl)) {
            const hi = spriteUrl.replace(/(\.json)?$/, m => `@2x${m}`);
            try {
                const probe = await fetch(hi.endsWith('.json') ? hi : `${hi}.json`);
                if (probe.ok) {
                    base = hi;
                }
            }
            catch (_a) { }
        }
        spriteUrl = base;
        const pbfUrl = spriteUrl.endsWith('.json')
            ? spriteUrl.replace('.json', '.pbf')
            : `${spriteUrl}.pbf`;
        try {
            const pbfResp = await fetch(pbfUrl);
            if (pbfResp.ok) {
                const data = await pbfResp.arrayBuffer();
                const { decodeIconSet, renderIconToCanvas } = await Promise.resolve().then(() => __importStar(require('./IconSetPBFDecoder')));
                const icons = decodeIconSet(data);
                if (icons.length > 0) {
                    return this.buildSpriteFromIconSet(icons, spriteUrl);
                }
            }
        }
        catch (_b) { }
        try {
            const [jsonUrl, imgExt] = spriteUrl.endsWith('.json')
                ? [spriteUrl, 'png']
                : [`${spriteUrl}.json`, 'png'];
            const imgUrl = spriteUrl.endsWith('.png')
                ? spriteUrl
                : spriteUrl.endsWith('.json')
                    ? spriteUrl.replace('.json', `.${imgExt}`)
                    : `${spriteUrl}.${imgExt}`;
            const [jsonResp, imgResp] = await Promise.all([
                fetch(jsonUrl),
                fetch(imgUrl),
            ]);
            const json = await jsonResp.json();
            const blob = await imgResp.blob();
            let image;
            image = new Image();
            image.src = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = reject;
            });
            this.m_spriteData = { json, image };
            return this.m_spriteData;
        }
        catch (e) {
            console.warn('Failed to load sprite:', spriteUrl, e);
            return undefined;
        }
    }
    async buildSpriteFromIconSet(icons, spriteUrl) {
        var _a;
        const { renderIconToCanvas } = require('./IconSetPBFDecoder');
        const json = {};
        const dpr = 1;
        const canvases = new Map();
        for (const icon of icons) {
            try {
                const canvas = renderIconToCanvas(icon, dpr);
                canvases.set(icon.name, canvas);
            }
            catch (_b) { }
        }
        if (spriteUrl) {
            try {
                const jsonUrl = spriteUrl.endsWith('.json')
                    ? spriteUrl
                    : `${spriteUrl}.json`;
                const jsonResp = await fetch(jsonUrl);
                if (jsonResp.ok) {
                    const legacyJson = await jsonResp.json();
                    const missing = Object.entries(legacyJson).filter(([name]) => !canvases.has(name));
                    if (missing.length > 0) {
                        const imgUrl = jsonUrl.replace(/\.json$/, '.png');
                        const imgResp = await fetch(imgUrl);
                        if (imgResp.ok) {
                            const blob = await imgResp.blob();
                            const legacyImage = new Image();
                            await new Promise((resolve, reject) => {
                                legacyImage.onload = () => resolve();
                                legacyImage.onerror = reject;
                                legacyImage.src = URL.createObjectURL(blob);
                            });
                            for (const [name, info] of missing) {
                                const canvas = document.createElement('canvas');
                                canvas.width = info.width;
                                canvas.height = info.height;
                                canvas.getContext('2d').drawImage(legacyImage, info.x, info.y, info.width, info.height, 0, 0, info.width, info.height);
                                canvases.set(name, canvas);
                                canvas.__spriteInfo = info;
                            }
                        }
                    }
                }
            }
            catch (_c) { }
        }
        const MAX_ATLAS_DIM = 8192;
        const pad = 2;
        const placements = [];
        let xCursor = 0;
        let yCursor = 0;
        let rowH = 0;
        let atlasW = 0;
        let atlasH = 0;
        for (const [name, canvas] of canvases) {
            const w = Math.min(canvas.width, MAX_ATLAS_DIM);
            const h = Math.min(canvas.height, MAX_ATLAS_DIM);
            if (xCursor + w + pad > MAX_ATLAS_DIM && xCursor > 0) {
                yCursor += rowH + pad;
                xCursor = 0;
                rowH = 0;
            }
            placements.push({ name, canvas, x: xCursor, y: yCursor });
            xCursor += w + pad;
            rowH = Math.max(rowH, h);
            atlasW = Math.max(atlasW, xCursor);
            atlasH = Math.max(atlasH, yCursor + rowH);
        }
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = Math.max(1, Math.min(atlasW, MAX_ATLAS_DIM));
        atlasCanvas.height = Math.max(1, Math.min(atlasH, MAX_ATLAS_DIM));
        const ctx = atlasCanvas.getContext('2d');
        for (const p of placements) {
            ctx.drawImage(p.canvas, p.x, p.y);
            const legacyInfo = p.canvas.__spriteInfo;
            json[p.name] = Object.assign({ x: p.x, y: p.y, width: p.canvas.width, height: p.canvas.height, pixelRatio: (_a = legacyInfo === null || legacyInfo === void 0 ? void 0 : legacyInfo.pixelRatio) !== null && _a !== void 0 ? _a : dpr }, ((legacyInfo === null || legacyInfo === void 0 ? void 0 : legacyInfo.sdf) ? { sdf: true } : {}));
        }
        this.m_spriteData = { json, image: atlasCanvas };
        return this.m_spriteData;
    }
    getStyle() {
        return this.m_style;
    }
    getResolvedSources() {
        return this.m_resolvedSources;
    }
    getResolvedSource(sourceId) {
        return this.m_resolvedSources.get(sourceId);
    }
    getLayers() {
        var _a, _b;
        return (_b = (_a = this.m_style) === null || _a === void 0 ? void 0 : _a.layers) !== null && _b !== void 0 ? _b : [];
    }
    getSpriteData() {
        return this.m_spriteData;
    }
}
exports.MBStyleManager = MBStyleManager;
//# sourceMappingURL=MBStyleManager.js.map