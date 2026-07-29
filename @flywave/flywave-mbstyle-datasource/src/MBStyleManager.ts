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
        this.resolveSources();
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
