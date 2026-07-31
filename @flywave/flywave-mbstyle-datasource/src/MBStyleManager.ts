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
        this.mergeImports();
        this.resolveSources();
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

            if (url && tileUrls.length === 0) {
                const tileUrl = this.resolveTileUrl(url);
                if (tileUrl) tileUrls.push(tileUrl);
            }

            const resolved: ResolvedSource = {
                sourceId,
                type: spec.type as any,
                tileUrls,
                minzoom: (spec as any).minzoom ?? 0,
                maxzoom: (spec as any).maxzoom ?? 22,
                attribution: (spec as any).attribution,
            };
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
