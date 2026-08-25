import { MBExpressionEngine, MBExpressionContext, MBStyleFeature, MBValue } from './MBExpressionEngine';
import { MBFilterCompiler, CompiledFilter } from './MBFilterCompiler';
import {
    LayerSpecification,
    LayerType,
    StyleSpecification,
    GEOMETRY_TYPE_MAP,
    ExpressionSpecification
} from './MBStyleSpec';

export interface EvaluatedPaint {
    [key: string]: any;
}

export interface EvaluatedLayout {
    [key: string]: any;
}

export interface EvaluatedLayer {
    id: string;
    type: LayerType;
    source: string;
    sourceLayer: string;
    paint: EvaluatedPaint;
    layout: EvaluatedLayout;
    renderOrder: number;
    /**
     * Raw (pre-evaluation) paint property defs — `{ type, value, default }`
     * where `value` is the original style value (constant, expression, or
     * legacy function). Consumers that need to re-evaluate a property at a
     * different context (e.g. per-frame zoom interpolation for heatmap-radius)
     * read the raw value from here.
     */
    paintDefs?: Record<string, PaintPropertyDef>;
}

interface PreprocessedLayer {
    id: string;
    type: LayerType;
    source: string;
    sourceLayer: string;
    minzoom: number | undefined;
    maxzoom: number | undefined;
    filter: CompiledFilter;
    paintDefs: Record<string, PaintPropertyDef>;
    layoutDefs: Record<string, any>;
    renderOrder: number;
    visibility: 'visible' | 'none';
    appearances: Array<{ name: string; condition: any; properties: Record<string, any> }> | undefined;
    /** Import id this layer came from (color-theme scope), if any. */
    importScope: string | undefined;
}

export interface PaintPropertyDef {
    type: 'constant' | 'expression' | 'transitionable';
    value: any;
    default: any;
}

export const PAINT_DEFAULTS: Record<string, Record<string, any>> = {
    fill: {
        'fill-antialias': true,
        'fill-opacity': 1,
        'fill-color': '#000000',
        'fill-outline-color': undefined,
        'fill-pattern': undefined,
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'map',
        // HD fill properties.
        'fill-z-offset': 0,
        'fill-elevation-reference': undefined,
        'fill-emissive-strength': 0,
        'fill-pattern-cross-fade': 0,
        'fill-construct-bridge-guard-rail': false,
    },
    line: {
        'line-opacity': 1,
        'line-color': '#000000',
        'line-width': 1,
        'line-gap-width': 0,
        'line-offset': 0,
        'line-blur': 0,
        'line-dasharray': undefined,
        'line-translate': [0, 0],
        'line-translate-anchor': 'map',
        'line-blend-mode': 'default',
        'line-blend-additive-clamp': 0,
        'line-width-unit': 'pixels',
        // HD / extended line properties — processed so the patcher can consume them.
        'line-trim-offset': [0, 1],
        'line-border-width': 0,
        'line-border-color': '#000000',
        'line-border-gradient': undefined,
        'line-emissive-strength': 0,
        'line-pattern-cross-fade': 0,
        'line-pitch': 0,
        'line-cutout-opacity': 0,
        'line-cutout-fade-width': 0,
        'line-cutout-shadow-opacity': 0,
        'line-occlusion-opacity': 0,
    },
    symbol: {
        'icon-opacity': 1,
        'icon-color': '#000000',
        'icon-halo-color': 'rgba(0,0,0,0)',
        'icon-halo-width': 0,
        'icon-halo-blur': 0,
        'icon-translate': [0, 0],
        'icon-translate-anchor': 'map',
        'text-opacity': 1,
        'text-color': '#000000',
        'text-halo-color': 'rgba(0,0,0,0)',
        'text-halo-width': 0,
        'text-halo-blur': 0,
        'text-translate': [0, 0],
        'text-translate-anchor': 'map',
        // HD symbol properties.
        'icon-emissive-strength': 0,
        'text-emissive-strength': 0,
        'icon-occlusion-opacity': 0,
        'text-occlusion-opacity': 0,
        'icon-color-brightness-min': 0,
        'icon-color-brightness-max': 1,
        'icon-color-contrast': 0,
        'icon-color-saturation': 0,
        'icon-image-cross-fade': 0,
        'icon-size-scale-range': [0, Infinity],
        'symbol-z-offset': 0,
        'symbol-z-elevate': false,
    },
    circle: {
        'circle-radius': 5,
        'circle-color': '#000000',
        'circle-blur': 0,
        'circle-opacity': 1,
        'circle-stroke-width': 0,
        'circle-stroke-color': '#000000',
        'circle-stroke-opacity': 1,
        'circle-translate': [0, 0],
        'circle-translate-anchor': 'map',
    },
    'fill-extrusion': {
        'fill-extrusion-opacity': 1,
        'fill-extrusion-color': '#000000',
        'fill-extrusion-height': 0,
        'fill-extrusion-base': 0,
        'fill-extrusion-vertical-gradient': true,
        // HD / extended properties — evaluated so the patcher can consume them.
        'fill-extrusion-vertical-scale': 1,
        'fill-extrusion-translate': [0, 0],
        'fill-extrusion-translate-anchor': 'map',
        'fill-extrusion-cutoff-fade-range': 0,
        'fill-extrusion-edge-radius': 0,
        'fill-extrusion-line-width': 0,
        'fill-extrusion-ambient-occlusion-intensity': 0,
        'fill-extrusion-ambient-occlusion-ground-radius': 0,
        'fill-extrusion-ambient-occlusion-ground-attenuation': 0,
        'fill-extrusion-ambient-occlusion-wall-radius': 0,
        'fill-extrusion-front-cutoff': 0,
        'fill-extrusion-base-alignment': 'terrain',
        'fill-extrusion-pattern-cross-fade': 0,
        'fill-extrusion-emissive-strength': 0,
        'fill-extrusion-flood-light-color': '#ffffff',
        'fill-extrusion-flood-light-intensity': 0,
        'fill-extrusion-flood-light-ground-radius': 0,
        'fill-extrusion-flood-light-wall-radius': 0,
    },
    background: {
        'background-color': '#000000',
        'background-opacity': 1,
    },
    heatmap: {
        'heatmap-radius': 30,
        'heatmap-opacity': 1,
        'heatmap-intensity': 1,
        'heatmap-weight': 1,
        // Default ramp matches mapbox style-spec v8 (v8.json paint_heatmap).
        'heatmap-color': [
            [0, 'rgba(0,0,255,0)'],
            [0.1, 'royalblue'],
            [0.3, 'cyan'],
            [0.5, 'lime'],
            [0.7, 'yellow'],
            [1, 'red'],
        ],
    },
    hillshade: {
        'hillshade-illumination-direction': 335,
        'hillshade-illumination-anchor': 'viewport',
        'hillshade-exaggeration': 0.5,
        'hillshade-highlight-color': '#FFFFFF',
        'hillshade-shadow-color': '#000000',
        'hillshade-accent-color': '#000000',
    },
    raster: {
        'raster-opacity': 1,
        'raster-hue-rotate': 0,
        'raster-brightness-min': 0,
        'raster-brightness-max': 1,
        'raster-saturation': 0,
        'raster-contrast': 0,
        'raster-resampling': 'linear',
        'raster-fade-duration': 300,
    },
    building: {
        'building-color': '#cccccc',
        'building-height': 10,
        'building-base': 0,
        'building-roof-color': '#aaaaaa',
        'building-roof-shape': 'flat',
        'building-facade-floors': 3,
        'building-facade-unit-width': 6,
        'building-emissive-strength': 0,
        // HD building paint properties.
        'building-ambient-occlusion-intensity': 0,
        'building-ambient-occlusion-ground-radius': 0,
        'building-ambient-occlusion-ground-attenuation': 0,
        'building-ambient-occlusion-wall-radius': 0,
        'building-flood-light-color': '#ffffff',
        'building-flood-light-intensity': 0,
        'building-window-color': undefined,
        'building-door-color': undefined,
    },
    model: {
        // Defaults from style-spec v8.json paint_model.
        'model-opacity': 1,
        'model-rotation': [0, 0, 0],
        'model-scale': [1, 1, 1],
        'model-translation': [0, 0, 0],
        'model-color': '#ffffff',
        'model-color-mix-intensity': 0,
        'model-type': 'common-3d',
        'model-cast-shadows': true,
        'model-receive-shadows': true,
        'model-ambient-occlusion-intensity': 1,
        'model-emissive-strength': 0,
        'model-roughness': 1,
        'model-cutoff-fade-range': 0,
        'model-elevation-reference': 'ground',
    },
};

export const LAYOUT_DEFAULTS: Record<string, Record<string, any>> = {
    fill: {
        visibility: 'visible',
    },
    line: {
        'line-cap': 'butt',
        'line-join': 'miter',
        'line-miter-limit': 2,
        'line-round-limit': 1.05,
        visibility: 'visible',
    },
    symbol: {
        'symbol-placement': 'point',
        'symbol-spacing': 250,
        'symbol-avoid-edges': false,
        'symbol-z-order': 'auto',
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-optional': false,
        'icon-rotation-alignment': 'auto',
        'icon-size': 1,
        'icon-text-fit': 'none',
        'icon-image': undefined,
        'icon-rotate': 0,
        'icon-padding': 2,
        'icon-keep-upright': false,
        'icon-offset': [0, 0],
        'icon-anchor': 'center',
        'icon-pitch-alignment': 'auto',
        'text-pitch-alignment': 'auto',
        'text-rotation-alignment': 'auto',
        'text-field': undefined,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 16,
        'text-max-width': 10,
        'text-line-height': 1.2,
        'text-letter-spacing': 0,
        'text-justify': 'center',
        'text-radial-offset': 0,
        'text-anchor': 'center',
        'text-max-angle': 45,
        'text-rotate': 0,
        'text-padding': 2,
        'text-keep-upright': true,
        'text-transform': 'none',
        'text-offset': [0, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': false,
        'text-writing-mode': ['horizontal'],
        visibility: 'visible',
    },
    circle: {
        visibility: 'visible',
    },
    'fill-extrusion': {
        visibility: 'visible',
    },
    heatmap: {
        visibility: 'visible',
    },
    hillshade: {
        visibility: 'visible',
    },
    building: {
        visibility: 'visible',
    },
    model: {
        visibility: 'visible',
    },
};

function isExpr(v: any): v is ExpressionSpecification {
    if (Array.isArray(v) && typeof v[0] === 'string') return true;
    // Legacy "function" form `{ base?, type?, stops: [...] }` — must go
    // through the expression engine so paint/layout get concrete values.
    if (
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Array.isArray((v as any).stops)
    ) {
        return true;
    }
    // Legacy `{ type: "identity", property: "x" }` function — the value is the
    // feature property; must be evaluated per feature (MBExpressionEngine handles
    // the identity form in `evaluate`).
    return (
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        (v as any).type === 'identity' &&
        typeof (v as any).property === 'string'
    );
}

import { applyColorTheme, ColorThemeLut } from './MBColorTheme';

export class MBLayerEvaluator {
    private m_layersBySource: Map<string, Map<string, PreprocessedLayer[]>> = new Map();

    /** Reserved source key for the per-tile background fill (§236). */
    static readonly BACKGROUND_SOURCE = '__mb_background__';
    private m_allLayers: PreprocessedLayer[] = [];

    private m_config: Record<string, any> = {};

    /** Mapbox `color-theme` LUT (null = no theme, colors pass through). */
    private m_lut: ColorThemeLut | null = null;

    /**
     * Per-import-scope LUTs (mgl `getLut(scope)`): layers merged from a style
     * import resolve their theme from the import's own color-theme, not the
     * root's. Absent scope key falls back to the root LUT.
     */
    private m_scopedLuts: Map<string, ColorThemeLut | null> = new Map();

    constructor(style: StyleSpecification) {
        this.m_config = (style as any)._config ?? {};
        this.prepare(style);
    }

    setColorTheme(lut: ColorThemeLut | null): void {
        this.m_lut = lut;
    }

    setColorThemeScope(scope: string, lut: ColorThemeLut | null): void {
        this.m_scopedLuts.set(scope, lut);
    }

    get scopedColorThemes(): Map<string, ColorThemeLut | null> {
        return new Map(this.m_scopedLuts);
    }

    /** Resolve the LUT for a layer (import scope if tagged, else root). */
    private lutFor(pl: PreprocessedLayer): ColorThemeLut | null {
        const scope = pl.importScope;
        if (scope !== undefined && this.m_scopedLuts.has(scope)) {
            return this.m_scopedLuts.get(scope) ?? null;
        }
        return this.m_lut;
    }

    get colorTheme(): ColorThemeLut | null {
        return this.m_lut;
    }

    private prepare(style: StyleSpecification) {
        this.m_allLayers = [];
        this.m_layersBySource.clear();

        style.layers.forEach((layer, index) => {
            const type = layer.type as LayerType;
            if (type === 'sky' as any) {
                return;
            }
            if (type === 'background') {
                // §236: register the background layer as a synthetic FILL
                // layer under a reserved source key — the decoder injects a
                // full-tile rectangle feature per decoded tile (mgl
                // draw_background paints per tile). The fill pipeline then
                // carries the tile fog chunk naturally.
                const pl: PreprocessedLayer = {
                    id: layer.id,
                    type: 'fill',
                    source: MBLayerEvaluator.BACKGROUND_SOURCE,
                    sourceLayer: '',
                    minzoom: undefined,
                    maxzoom: undefined,
                    filter: MBFilterCompiler.compile(undefined),
                    paintDefs: this.preparePaint('fill', {
                        'fill-color': (layer as any).paint?.['background-color'] ?? '#000000',
                        'fill-opacity': (layer as any).paint?.['background-opacity'] ?? 1,
                    }),
                    layoutDefs: this.prepareLayout('fill', {}),
                    renderOrder: index,
                    visibility: ((layer as any).layout?.visibility ?? 'visible') === 'none' ? 'none' : 'visible',
                    appearances: undefined,
                    importScope: (layer as any)._importScope,
                };
                this.m_allLayers.push(pl);
                if (!this.m_layersBySource.has(MBLayerEvaluator.BACKGROUND_SOURCE)) {
                    this.m_layersBySource.set(MBLayerEvaluator.BACKGROUND_SOURCE, new Map());
                }
                const bg = this.m_layersBySource.get(MBLayerEvaluator.BACKGROUND_SOURCE)!;
                if (!bg.has('')) bg.set('', []);
                bg.get('')!.push(pl);
                return;
            }

            const source = (layer as any).source as string;
            const sourceLayer = (layer as any)['source-layer'] as string || '';

            const visible = this.evalLayoutProp(layer, 'visibility', type, undefined);
            const visibility = visible === 'none' ? 'none' : 'visible';

            const pl: PreprocessedLayer = {
                id: layer.id,
                type,
                source,
                sourceLayer,
                minzoom: (layer as any).minzoom,
                maxzoom: (layer as any).maxzoom,
                filter: MBFilterCompiler.compile((layer as any).filter),
                paintDefs: this.preparePaint(type, (layer as any).paint),
                layoutDefs: this.prepareLayout(type, (layer as any).layout),
                renderOrder: index,
                visibility,
                appearances: (layer as any).appearances,
                importScope: (layer as any)._importScope,
            };

            this.m_allLayers.push(pl);

            if (!this.m_layersBySource.has(source)) {
                this.m_layersBySource.set(source, new Map());
            }
            const bySL = this.m_layersBySource.get(source)!;
            if (!bySL.has(sourceLayer)) {
                bySL.set(sourceLayer, []);
            }
            bySL.get(sourceLayer)!.push(pl);
        });
    }

    private preparePaint(type: string, paint: any): Record<string, PaintPropertyDef> {
        const defaults = PAINT_DEFAULTS[type] ?? {};
        const result: Record<string, PaintPropertyDef> = {};

        // Process known properties (those in PAINT_DEFAULTS).
        for (const [key, defVal] of Object.entries(defaults)) {
            const raw = paint?.[key];
            if (raw === undefined) {
                result[key] = { type: 'constant', value: defVal, default: defVal };
            } else if (isExpr(raw)) {
                result[key] = { type: 'expression', value: raw, default: defVal };
            } else {
                result[key] = { type: 'constant', value: raw, default: defVal };
            }
        }

        // Pass through any extra paint keys not in defaults (HD / experimental
        // properties like fill-extrusion-front-cutoff, symbol-elevation-reference,
        // raster-color-mix, etc.). These are stored as raw values so the patcher
        // can read them from technique._paint.
        if (paint && typeof paint === 'object') {
            for (const key of Object.keys(paint)) {
                if (!(key in result)) {
                    const raw = paint[key];
                    if (isExpr(raw)) {
                        result[key] = { type: 'expression', value: raw, default: undefined };
                    } else {
                        result[key] = { type: 'constant', value: raw, default: undefined };
                    }
                }
            }
        }

        return result;
    }

    private prepareLayout(type: string, layout: any): Record<string, any> {
        const defaults = LAYOUT_DEFAULTS[type] ?? {};
        const result: Record<string, any> = {};
        for (const [key, defVal] of Object.entries(defaults)) {
            const raw = layout?.[key];
            result[key] = raw !== undefined ? raw : defVal;
        }
        // Pass through extra layout keys not in defaults (HD properties like
        // symbol-elevation-reference, model-id, model-type, etc.).
        if (layout && typeof layout === 'object') {
            for (const key of Object.keys(layout)) {
                if (!(key in result)) {
                    result[key] = layout[key];
                }
            }
        }
        return result;
    }

    private evalLayoutProp(layer: LayerSpecification, prop: string, type: string, ctx?: MBExpressionContext): any {
        const defaults = LAYOUT_DEFAULTS[type] ?? {};
        const raw = (layer as any).layout?.[prop];
        if (raw === undefined) return defaults[prop];
        if (isExpr(raw) && ctx) {
            return MBExpressionEngine.evaluate(raw, ctx);
        }
        return raw;
    }

    evaluate(
        sourceId: string,
        sourceLayer: string,
        feature: MBStyleFeature,
        zoom: number,
        geometryType: string,
        featureState?: Record<string, any>,
        pitch?: number,
        brightness?: number,
        worldview?: string,
        center?: [number, number],
    ): EvaluatedLayer[] {
        const bySL = this.m_layersBySource.get(sourceId);
        if (!bySL) return [];

        // Match by source-layer. For GeoJSON sources, the adapter passes "geojson"
        // but Mapbox style layers may not set source-layer. Fall back to empty string.
        let candidates = bySL.get(sourceLayer) ?? [];
        if (candidates.length === 0) {
            candidates = bySL.get('') ?? [];
        }
        // §368: provider-synthesized features (raster/raster-array quads)
        // carry NO source-layer — the tile source serves the whole source and
        // the layer selects its band at texture level
        // (loadRasterArrayTexture reads the style layer's own source-layer).
        // Match every layer of this source for such features.
        if (candidates.length === 0 && (sourceLayer === '' || sourceLayer === 'geojson')) {
            for (const cands of bySL.values()) candidates = candidates.concat(cands);
        }







        const results: EvaluatedLayer[] = [];

        const ctx: MBExpressionContext = { zoom, pitch, feature, featureState, _config: this.m_config, brightness, worldview, center } as any;

        for (const pl of candidates) {
            if (pl.visibility === 'none') continue;

            const allowedTypes = GEOMETRY_TYPE_MAP[pl.type] ?? [];
            if (allowedTypes.length > 0 && !allowedTypes.includes(geometryType)) continue;

            if (pl.minzoom !== undefined && zoom < pl.minzoom) continue;
            if (pl.maxzoom !== undefined && zoom >= pl.maxzoom) continue;

            ctx.feature = feature;
            if (!pl.filter(ctx)) continue;

            const paint: EvaluatedPaint = {};
            for (const [key, def] of Object.entries(pl.paintDefs)) {
                // Gradient/ramp expressions use shader-varying inputs (line-progress,
                // heatmap-density) not available in JS. Store raw for patcher.
                if (key === 'line-gradient' || key === 'line-border-gradient' || key === 'heatmap-color') {
                    paint[key] = def.value;
                } else if (def.type === 'expression') {
                    paint[key] = MBExpressionEngine.evaluate(def.value, ctx);
                } else {
                    paint[key] = def.value;
                }
                // Mapbox color-theme LUT: transform color paints unless the
                // property's `-use-theme` is 'none' (mgl applies the LUT to
                // every evaluated color by default).
                const layerLut = this.lutFor(pl);
                if (layerLut && typeof paint[key] === 'string' && /-color$/.test(key)
                    && paint[`${key}-use-theme`] !== 'none'
                    && pl.paintDefs[`${key}-use-theme`]?.value !== 'none') {
                    paint[key] = applyColorTheme(layerLut, paint[key] as string);
                }
            }

            const layout: EvaluatedLayout = {};
            for (const [key, raw] of Object.entries(pl.layoutDefs)) {
                if (isExpr(raw) && ctx) {
                    layout[key] = MBExpressionEngine.evaluate(raw, ctx);
                    if (key === 'text-field') {
                        // mgl format sections carry font-scale → per-line
                        // maxScale in shaping (shaping.ts getMaxScale). Stash
                        // the per-char scales for the emitter's shapeText
                        // call (§396 mechanism producer).
                        const fmt = MBExpressionEngine.evaluateFormatWithScales(raw, ctx);
                        if (fmt?.scales) (layout as any)['text-field-section-scales'] = fmt.scales;
                    }
                } else {
                    layout[key] = raw;
                }
                // ["image", a, b]: mgl resolves a primary AND a secondary
                // icon variant (image.ts parse); the pair is blended by the
                // icon-image-cross-fade paint. Stash the second candidate as
                // a side channel — the plain evaluation keeps only the first.
                if (key === 'icon-image') {
                    const secondary = MBLayerEvaluator.imageSecondaryCandidate(raw);
                    if (secondary) (layout as any)['icon-image-secondary'] = secondary;
                }
            }

            // Apply appearances: conditional property overrides. Each appearance
            // whose condition evaluates truthy merges its properties over the
            // base paint/layout (last matching appearance wins).
            if (pl.appearances) {
                for (const app of pl.appearances) {
                    try {
                        const cond = MBExpressionEngine.evaluate(app.condition, ctx);
                        if (cond) {
                            for (const [key, val] of Object.entries(app.properties)) {
                                const ev = isExpr(val)
                                    ? MBExpressionEngine.evaluate(val, ctx)
                                    : val;
                                const paintDefaults = PAINT_DEFAULTS[pl.type];
                                if (paintDefaults && key in paintDefaults) {
                                    paint[key] = ev;
                                } else {
                                    layout[key] = ev;
                                }
                                if (key === 'icon-image') {
                                    const secondary = MBLayerEvaluator.imageSecondaryCandidate(val);
                                    // An appearance overrides the base icon
                                    // entirely — replace (or clear) the base
                                    // secondary candidate.
                                    if (secondary) (layout as any)['icon-image-secondary'] = secondary;
                                    else delete (layout as any)['icon-image-secondary'];
                                }
                            }
                        }
                    } catch {}
                }
            }

            results.push({
                id: pl.id,
                type: pl.type,
                source: sourceId,
                sourceLayer,
                paint,
                layout,
                renderOrder: pl.renderOrder,
                paintDefs: pl.paintDefs,
            });
        }

        results.sort((a, b) => a.renderOrder - b.renderOrder);
        return results;
    }

    getLayersForSource(sourceId: string): PreprocessedLayer[] {
        return this.m_allLayers.filter(l => l.source === sourceId);
    }

    getSourceLayers(): Map<string, string[]> {
        const result = new Map<string, string[]>();
        for (const [source, bySL] of this.m_layersBySource) {
            result.set(source, Array.from(bySL.keys()));
        }
        return result;
    }

    /**
     * Second candidate of an `["image", a, b]` expression (mgl
     * image.ts keeps primary + secondary variants; the pair is blended by
     * the cross-fade paints). Returns undefined for single-image values.
     */
    private static imageSecondaryCandidate(raw: unknown): string | undefined {
        let expr: any = raw;
        while (Array.isArray(expr) && expr[0] === 'memo') expr = expr[1];
        if (Array.isArray(expr) && expr[0] === 'image' && typeof expr[2] === 'string') {
            return expr[2];
        }
        return undefined;
    }
}
