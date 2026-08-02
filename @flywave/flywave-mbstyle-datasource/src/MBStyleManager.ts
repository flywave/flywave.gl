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
    image: HTMLImageElement | ImageBitmap;
}

export interface SpriteIconInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
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
        this.resolveSources();
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

        for (const imp of imports) {
            const data = imp.data;
            if (!data) continue;
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
            // Append layers.
            if (data.layers) {
                mergedLayers.push(...data.layers);
            }
            // Use imported lights/sprite/glyphs if base lacks them.
            if (data.lights && !(this.m_style as any).lights) {
                (this.m_style as any).lights = data.lights;
            }
            if (data.sprite && !this.m_style.sprite) {
                this.m_style.sprite = data.sprite;
            }
            if (data.glyphs && !this.m_style.glyphs) {
                this.m_style.glyphs = data.glyphs;
            }
            if (data.fog && !(this.m_style as any).fog) {
                (this.m_style as any).fog = data.fog;
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
    }

    private resolveSources(): void {
        if (!this.m_style) return;
        this.m_resolvedSources.clear();

        for (const [sourceId, spec] of Object.entries(this.m_style.sources)) {
            const tileUrls = (spec as any).tiles ?? [];
            const url = (spec as any).url ?? '';
            const scheme = (spec as any).scheme ?? 'xyz';

            if (url && tileUrls.length === 0) {
                const tileUrl = this.resolveTileUrl(url);
                if (tileUrl) tileUrls.push(tileUrl);
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
                    return this.buildSpriteFromIconSet(icons);
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
     */
    private buildSpriteFromIconSet(icons: any[]): SpriteData {
        const { renderIconToCanvas } = require('./IconSetPBFDecoder');
        const json: Record<string, SpriteIconInfo> = {};
        const dpr = 1; // pixelRatio; could be window.devicePixelRatio

        // Render each icon to a canvas.
        const canvases: Map<string, HTMLCanvasElement> = new Map();
        let totalW = 0, maxH = 0;
        for (const icon of icons) {
            try {
                const canvas = renderIconToCanvas(icon, dpr);
                canvases.set(icon.name, canvas);
                totalW += canvas.width + 2; // 2px padding
                maxH = Math.max(maxH, canvas.height);
            } catch {}
        }

        // Pack into a single row atlas (sufficient for test sprites).
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = Math.max(1, totalW);
        atlasCanvas.height = Math.max(1, maxH);
        const ctx = atlasCanvas.getContext('2d')!;
        let xCursor = 0;
        for (const [name, canvas] of canvases) {
            ctx.drawImage(canvas, xCursor, 0);
            json[name] = {
                x: xCursor, y: 0,
                width: canvas.width, height: canvas.height,
                pixelRatio: dpr,
            };
            xCursor += canvas.width + 2;
        }

        const image = new Image();
        image.src = atlasCanvas.toDataURL();
        this.m_spriteData = { json, image };
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
