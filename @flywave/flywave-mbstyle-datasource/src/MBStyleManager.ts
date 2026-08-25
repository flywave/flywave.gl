import {
    StyleSpecification,
    SourceSpecification,
    VectorSourceSpec,
    RasterSourceSpec,
} from './MBStyleSpec';

/**
 * Resolved source configuration with tile URL information.
 */
export interface ResolvedSource {
    sourceId: string;
    type: 'vector' | 'raster' | 'raster-dem' | 'geojson';
    tileUrls: string[];
    minzoom: number;
    maxzoom: number;
    attribution?: string;
}

/**
 * Loaded sprite data.
 */
export interface SpriteData {
    json: Record<string, SpriteIconInfo>;
    image: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
}

export interface SpriteIconInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    sdf?: boolean;
}

export class MBStyleManager {
    private m_style: StyleSpecification | undefined;
    private m_resolvedSources: Map<string, ResolvedSource> = new Map();
    private m_spriteData: SpriteData | undefined;
    private m_accessToken: string | undefined;

    async loadStyle(style: StyleSpecification | string, accessToken?: string): Promise<void> {
        this.m_accessToken = accessToken;
        if (typeof style === 'string') {
            const response = await fetch(style);
            this.m_style = await response.json();
        } else {
            this.m_style = { ...style };
        }
        // Fetch any URL-based imports first so mergeImports() can include
        // their sources/layers/lights/etc. alongside inline imports.
        await this.fetchUrlImports();
        this.mergeImports();
        this.applySlotOrdering();
        await this.resolveSources();
    }

    /**
     * For each entry in `style.imports` that uses URL form (no inline `data`),
     * fetch the referenced style JSON and attach it as `imp.data` so the
     * subsequent synchronous `mergeImports()` call can fold it in. URL-form
     * imports are how Mapbox HD styles reference base maps
     * (e.g. `mapbox://styles/mapbox/streets-v12`).
     *
     * `mapbox://` URLs are rewritten to the public styles API and have the
     * access token appended; any other URL is fetched verbatim. Failures are
     * silent — the import is skipped, mirroring Mapbox's tolerance for
     * missing base styles.
     */
    private async fetchUrlImports(): Promise<void> {
        if (!this.m_style) return;
        const imports = (this.m_style as any).imports;
        if (!Array.isArray(imports) || imports.length === 0) return;

        await Promise.all(imports.map(async (imp: any) => {
            if (imp.data) return; // inline — already merged
            const url = imp.url;
            if (!url || typeof url !== 'string') return;
            try {
                const fetchUrl = this.resolveImportUrl(url);
                const resp = await fetch(fetchUrl);
                if (!resp.ok) return;
                const json = await resp.json();
                // Wrap the imported style as the `data` slot that mergeImports
                // expects (a partial StyleSpecification).
                imp.data = json;
            } catch {
                // network / parse failure — silently skip
            }
        }));
    }

    /**
     * Resolve an import URL: rewrite `mapbox://styles/...` to the public CDN
     * and append the access token if known. Other URLs are returned unchanged.
     */
    private resolveImportUrl(url: string): string {
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

    /**
     * Merge inline style imports (mapbox HD `imports` array). Each import may
     * carry inline `data` (a sub-style) and `config` values. Sources, layers,
     * lights, sprite and glyphs from imports are merged into the base style.
     */
    private mergeImports(): void {
        if (!this.m_style) return;
        const imports = (this.m_style as any).imports;
        if (!Array.isArray(imports) || imports.length === 0) return;

        const mergedLayers: any[] = [...(this.m_style.layers ?? [])];
        const mergedSources: Record<string, any> = { ...(this.m_style.sources as any) };
        const configMap: Record<string, any> = {};
        const importThemes: Record<string, any> = {};

        for (const imp of imports) {
            const data = imp.data;
            if (!data) continue;
            // mgl: the import spec's "color-theme" overrides the imported
            // stylesheet's own root-level theme (style.ts:872, 1119-1121).
            importThemes[imp.id] = imp['color-theme'] ?? data['color-theme'] ?? null;
            // Collect config values for ["config", key] expressions.
            if (imp.config) {
                for (const [k, v] of Object.entries(imp.config)) {
                    configMap[k] = v;
                }
            }
            // Merge sources.
            if (data.sources) {
                for (const [sid, spec] of Object.entries(data.sources)) {
                    if (!mergedSources[sid]) mergedSources[sid] = spec;
                }
            }
            // Append layers. Tag each with its import id so downstream
            // consumers (color-theme LUT scoping) can resolve per-scope
            // themes the way mgl scopes a fragment Style per import.
            if (data.layers) {
                for (const l of data.layers) {
                    (l as any)._importScope = imp.id;
                    mergedLayers.push(l);
                }
            }
            // Use imported lights/sprite/glyphs if base lacks them.
            if (data.lights && !(this.m_style as any).lights) {
                (this.m_style as any).lights = data.lights;
                (this.m_style as any)._lightsImportScope = imp.id;
            }
            if (data.sprite && !this.m_style.sprite) {
                this.m_style.sprite = data.sprite;
            }
            if (data.glyphs && !this.m_style.glyphs) {
                this.m_style.glyphs = data.glyphs;
            }
            if (data.fog && !(this.m_style as any).fog) {
                (this.m_style as any).fog = data.fog;
                (this.m_style as any)._fogImportScope = imp.id;
            }
            if (data.sky && !(this.m_style as any).sky) {
                (this.m_style as any).sky = data.sky;
            }
            if (data.terrain && !(this.m_style as any).terrain) {
                (this.m_style as any).terrain = data.terrain;
            }
        }

        this.m_style.layers = mergedLayers;
        this.m_style.sources = mergedSources;
        // Store config for expression evaluation.
        (this.m_style as any)._config = configMap;
        // Per-import color themes (null = no theme for that import).
        (this.m_style as any)._importThemes = importThemes;
    }

    /**
     * Resolve `slot` layers (mgl style.ts mergeLayers, ~line 1442): layers of
     * type 'slot' mark named positions; layers carrying a `slot` property that
     * names an already-registered slot are moved to that position (relative
     * order kept), and the slot layers themselves are dropped from the final
     * order. Duplicate slot names: the first occurrence wins, later ones are
     * skipped entirely (mgl `if (slots[slotName]) continue`).
     *
     * Additionally, when any layer is 3D, mgl reorders with a stable priority
     * sort: occlusion-opacity symbol layers before the last 3D layer are
     * placed tight after it (priority 2), other pre-3D layers keep priority 0,
     * the last 3D layer gets 1, and everything after stays last (4).
     */
    private applySlotOrdering(): void {
        if (!this.m_style) return;
        const layers = (this.m_style.layers ?? []) as any[];
        if (!layers.some(l => l.type === 'slot' || l.slot)) return;

        const slots: Record<string, any[]> = {};
        const mergedOrder: any[] = [];
        for (const layer of layers) {
            if (layer.type === 'slot') {
                if (slots[layer.id]) continue;
                slots[layer.id] = [];
            }
            if (layer.slot && slots[layer.slot]) {
                slots[layer.slot].push(layer);
                continue;
            }
            mergedOrder.push(layer);
        }
        const ordered: any[] = [];
        const sort = (list: any[]) => {
            for (const layer of list) {
                if (layer.type === 'slot') {
                    if (slots[layer.id]) sort(slots[layer.id]);
                } else {
                    ordered.push(layer);
                }
            }
        };
        sort(mergedOrder);

        // 3D / occlusion priority reorder (mgl style.ts ~1505). is3D mirrors
        // the per-type StyleLayer.is3D overrides; raw spec values approximate
        // the evaluated property reads (defaults match the style-spec).
        const hasTerrain = !!(this.m_style as any).terrain;
        const is3D = (layer: any): boolean => {
            const paint = layer.paint ?? {};
            const layout = layer.layout ?? {};
            switch (layer.type) {
                case 'fill-extrusion':
                case 'clip':
                case 'custom':
                    return layer.type !== 'custom' || layer.renderingMode === '3d';
                case 'background':
                    return paint['background-pitch-alignment'] === 'viewport';
                case 'circle':
                    // mgl: with terrain enabled circles are never 3D.
                    if (hasTerrain) return false;
                    return layout['circle-elevation-reference'] !== 'none';
                case 'fill': {
                    // mgl fill: z-offset non-zero (constantOr(1) for data
                    // driven), or elevation-reference active without terrain.
                    const zOffset = paint['fill-z-offset'];
                    if (zOffset !== undefined && zOffset !== 0) return true;
                    return !hasTerrain && layout['fill-elevation-reference'] !== 'none';
                }
                case 'raster': {
                    const elev = paint['raster-elevation'];
                    return typeof elev === 'number' && elev > 0;
                }
                default:
                    return false;
            }
        };
        const last3DIdx = ordered.reduce((acc, l, i) => (is3D(l) ? i : acc), -1);
        if (last3DIdx >= 0) {
            const priority = ordered.map((layer, i) => {
                if (i === last3DIdx) return 1;
                if (i < last3DIdx) {
                    const paint = layer.paint ?? {};
                    const hasOcclusion =
                        'icon-occlusion-opacity' in paint || 'text-occlusion-opacity' in paint;
                    return hasOcclusion ? 2 : 0;
                }
                return 4;
            });
            ordered
                .map((layer, i) => ({ layer, i }))
                .sort((a, b) => priority[a.i] - priority[b.i])
                .forEach(({ layer }, j) => { ordered[j] = layer; });
        }

        this.m_style.layers = ordered;
    }

    /**
     * Re-resolve sources from the current style (after runtime addSource /
     * removeSource / setStyle). Async because TileJSON `url:` sources fetch.
     */
    async reloadSources(): Promise<void> {
        await this.resolveSources();
    }

    private async resolveSources(): Promise<void> {
        if (!this.m_style) return;
        this.m_resolvedSources.clear();

        for (const [sourceId, spec] of Object.entries(this.m_style.sources)) {
            const tileUrls: string[] = [...(spec as any).tiles ?? []];
            const url = (spec as any).url ?? '';
            const scheme = (spec as any).scheme ?? 'xyz';

            if (url && tileUrls.length === 0) {
                const tileUrl = this.resolveTileUrl(url);
                if (tileUrl) {
                    tileUrls.push(tileUrl);
                } else {
                    // Not a {z}/{x}/{y} template nor mapbox:// — treat as a
                    // TileJSON document: fetch it and use its `tiles` + `bounds`.
                    try {
                        const fetchUrl = url.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                        const resp = await fetch(fetchUrl);
                        if (resp.ok) {
                            const tilejson = await resp.json();
                            for (const t of tilejson.tiles ?? []) tileUrls.push(t);
                            if (!Array.isArray((spec as any).bounds) && Array.isArray(tilejson.bounds)) {
                                (spec as any).bounds = tilejson.bounds;
                            }
                            if ((spec as any).minzoom === undefined) (spec as any).minzoom = tilejson.minzoom ?? 0;
                            if ((spec as any).maxzoom === undefined) (spec as any).maxzoom = tilejson.maxzoom ?? 22;
                        }
                    } catch {}
                }
            }

            // TMS scheme: flip y coordinate in tile URL template.
            // flywave uses XYZ (y from top); TMS uses y from bottom: yTms = 2^z - 1 - yXyz.
            // We can't modify flywave's internal y filling, so we note the scheme
            // for the datasource to handle via a custom provider wrapper.
            const resolved: ResolvedSource = {
                sourceId,
                type: spec.type as any,
                tileUrls,
                minzoom: (spec as any).minzoom ?? 0,
                maxzoom: (spec as any).maxzoom ?? 22,
                attribution: (spec as any).attribution,
            };
            (resolved as any).scheme = scheme;
            // Preserve source bounds (TileJSON `bounds` property) so the
            // datasource can filter out tiles outside the valid area.
            const bounds = (spec as any).bounds;
            if (Array.isArray(bounds) && bounds.length === 4) {
                (resolved as any).bounds = bounds;
            }
            this.m_resolvedSources.set(sourceId, resolved);
        }
    }

    private resolveTileUrl(url: string): string | undefined {
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

    async loadSprite(spriteUrl: string): Promise<SpriteData | undefined> {
        // mgl picks a @2x sprite variant for devicePixelRatio >= 2 (sprite
        // ratio is clamped to 2). Try the high-res variant first, falling
        // back to the base URL for every stage below.
        const spriteRatio = (typeof window !== 'undefined'
            ? Math.min(2, window.devicePixelRatio || 1) : 1);
        let base = spriteUrl;
        if (spriteRatio >= 2 && !/@[0-9]x(\.json|\.png)?$/.test(spriteUrl)) {
            const hi = spriteUrl.replace(/(\.json)?$/, m => `@2x${m}`);
            try {
                const probe = await fetch(hi.endsWith('.json') ? hi : `${hi}.json`);
                if (probe.ok) {
                    // Both .json/.png (or .pbf) variants exist — use @2x.
                    base = hi;
                }
            } catch {}
        }
        spriteUrl = base;
        // Try icon_set (.pbf) format first; fall back to legacy (.json + .png).
        const pbfUrl = spriteUrl.endsWith('.json')
            ? spriteUrl.replace('.json', '.pbf')
            : `${spriteUrl}.pbf`;
        try {
            const pbfResp = await fetch(pbfUrl);
            if (pbfResp.ok) {
                const data = await pbfResp.arrayBuffer();
                const { decodeIconSet, renderIconToCanvas } = await import('./IconSetPBFDecoder');
                const icons = decodeIconSet(data);
                if (icons.length > 0) {
                    return this.buildSpriteFromIconSet(icons, spriteUrl);
                }
            }
        } catch {}
        // Fallback: legacy raster sprite (.json + .png).
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

            const json = await jsonResp.json() as Record<string, SpriteIconInfo>;
            const blob = await imgResp.blob();

            let image: HTMLImageElement;
            image = new Image();
            image.src = URL.createObjectURL(blob);
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = reject;
            });

            this.m_spriteData = { json, image };
            return this.m_spriteData;
        } catch (e) {
            console.warn('Failed to load sprite:', spriteUrl, e);
            return undefined;
        }
    }

    /**
     * Build a rasterized sprite atlas from decoded icon_set icons.
     * Each icon is rasterized to a canvas, then packed into a single atlas.
     *
     * The atlas is returned as a canvas (not an HTMLImageElement) so consumers
     * can draw from it synchronously — a `toDataURL()`-backed Image decodes
     * asynchronously and would produce blank sub-images when cut immediately.
     *
     * When the legacy `.json`/`.png` pair exists next to the icon_set, icons
     * missing from the pbf are merged in from the png (some fixtures ship an
     * incomplete icon_set, e.g. no `dot.sdf` / road shields).
     */
    private async buildSpriteFromIconSet(icons: any[], spriteUrl?: string): Promise<SpriteData> {
        const { renderIconToCanvas } = require('./IconSetPBFDecoder');
        const json: Record<string, SpriteIconInfo> = {};
        const dpr = 1; // pixelRatio; could be window.devicePixelRatio

        // Render each icon to a canvas.
        const canvases: Map<string, HTMLCanvasElement> = new Map();
        for (const icon of icons) {
            try {
                const canvas = renderIconToCanvas(icon, dpr);
                canvases.set(icon.name, canvas);
            } catch {}
        }

        // Merge legacy sprite icons missing from the icon_set.
        if (spriteUrl) {
            try {
                const jsonUrl = spriteUrl.endsWith('.json')
                    ? spriteUrl
                    : `${spriteUrl}.json`;
                const jsonResp = await fetch(jsonUrl);
                if (jsonResp.ok) {
                    const legacyJson = await jsonResp.json() as Record<string, SpriteIconInfo>;
                    const missing = Object.entries(legacyJson).filter(([name]) => !canvases.has(name));
                    if (missing.length > 0) {
                        const imgUrl = jsonUrl.replace(/\.json$/, '.png');
                        const imgResp = await fetch(imgUrl);
                        if (imgResp.ok) {
                            const blob = await imgResp.blob();
                            const legacyImage = new Image();
                            await new Promise<void>((resolve, reject) => {
                                legacyImage.onload = () => resolve();
                                legacyImage.onerror = reject;
                                legacyImage.src = URL.createObjectURL(blob);
                            });
                            for (const [name, info] of missing) {
                                const canvas = document.createElement('canvas');
                                canvas.width = info.width;
                                canvas.height = info.height;
                                canvas.getContext('2d')!.drawImage(
                                    legacyImage,
                                    info.x, info.y, info.width, info.height,
                                    0, 0, info.width, info.height,
                                );
                                canvases.set(name, canvas);
                                // Record pixelRatio/sdf so the pack loop below
                                // can carry them into the merged json.
                                (canvas as any).__spriteInfo = info;
                            }
                        }
                    }
                }
            } catch {}
        }

        // Pack into a shelf atlas capped well below the GL max texture size
        // (16384 on most implementations). A single-row layout previously
        // produced e.g. a 49562px-wide canvas for the `standard` icon set —
        // beyond MAX_TEXTURE_SIZE the upload silently fails and every sprite
        // sampled from the atlas renders black.
        const MAX_ATLAS_DIM = 8192;
        const pad = 2;
        // First pass: shelf rows.
        const placements: { name: string; canvas: HTMLCanvasElement; x: number; y: number }[] = [];
        let xCursor = 0;
        let yCursor = 0;
        let rowH = 0;
        let atlasW = 0;
        let atlasH = 0;
        for (const [name, canvas] of canvases) {
            const w = Math.min(canvas.width, MAX_ATLAS_DIM);
            const h = Math.min(canvas.height, MAX_ATLAS_DIM);
            if (xCursor + w + pad > MAX_ATLAS_DIM && xCursor > 0) {
                // wrap to a new shelf row
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
        const ctx = atlasCanvas.getContext('2d')!;
        for (const p of placements) {
            ctx.drawImage(p.canvas, p.x, p.y);
            const legacyInfo = (p.canvas as any).__spriteInfo as SpriteIconInfo | undefined;
            json[p.name] = {
                x: p.x, y: p.y,
                width: p.canvas.width, height: p.canvas.height,
                pixelRatio: legacyInfo?.pixelRatio ?? dpr,
                ...(legacyInfo?.sdf ? { sdf: true } : {}),
            };
        }

        this.m_spriteData = { json, image: atlasCanvas };
        return this.m_spriteData;
    }

    getStyle(): StyleSpecification | undefined {
        return this.m_style;
    }

    getResolvedSources(): Map<string, ResolvedSource> {
        return this.m_resolvedSources;
    }

    getResolvedSource(sourceId: string): ResolvedSource | undefined {
        return this.m_resolvedSources.get(sourceId);
    }

    getLayers() {
        return this.m_style?.layers ?? [];
    }

    getSpriteData(): SpriteData | undefined {
        return this.m_spriteData;
    }
}
