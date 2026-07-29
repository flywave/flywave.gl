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
}

interface PaintPropertyDef {
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
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'map',
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
        'line-width-unit': 'pixels',
    },
    symbol: {
        'icon-opacity': 1,
        'icon-color': '#000000',
        'icon-halo-color': 'rgba(0,0,0,0)',
        'icon-halo-width': 0,
        'icon-halo-blur': 0,
        'text-opacity': 1,
        'text-color': '#000000',
        'text-halo-color': 'rgba(0,0,0,0)',
        'text-halo-width': 0,
        'text-halo-blur': 0,
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
        'heatmap-color': [
            [0, 'rgba(0,0,255,0)'],
            [0.5, 'rgb(0,0,255)'],
            [1, 'rgb(255,0,0)'],
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
    },
    model: {
        'model-opacity': 1,
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
    return Array.isArray(v) && typeof v[0] === 'string';
}

export class MBLayerEvaluator {
    private m_layersBySource: Map<string, Map<string, PreprocessedLayer[]>> = new Map();
    private m_allLayers: PreprocessedLayer[] = [];

    constructor(style: StyleSpecification) {
        this.prepare(style);
    }

    private prepare(style: StyleSpecification) {
        this.m_allLayers = [];
        this.m_layersBySource.clear();

        style.layers.forEach((layer, index) => {
            const type = layer.type as LayerType;
            if (type === 'background' || type === 'sky' as any) {
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

        return result;
    }

    private prepareLayout(type: string, layout: any): Record<string, any> {
        const defaults = LAYOUT_DEFAULTS[type] ?? {};
        const result: Record<string, any> = {};
        for (const [key, defVal] of Object.entries(defaults)) {
            const raw = layout?.[key];
            result[key] = raw !== undefined ? raw : defVal;
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
        featureState?: Record<string, any>
    ): EvaluatedLayer[] {
        const bySL = this.m_layersBySource.get(sourceId);
        if (!bySL) return [];

        // Match by source-layer. For GeoJSON sources, the adapter passes "geojson"
        // but Mapbox style layers may not set source-layer. Fall back to empty string.
        let candidates = bySL.get(sourceLayer) ?? [];
        if (candidates.length === 0) {
            candidates = bySL.get('') ?? [];
        }
        const results: EvaluatedLayer[] = [];

        const ctx: MBExpressionContext = { zoom, feature, featureState };

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
                if (def.type === 'expression') {
                    paint[key] = MBExpressionEngine.evaluate(def.value, ctx);
                } else {
                    paint[key] = def.value;
                }
            }

            const layout: EvaluatedLayout = {};
            for (const [key, raw] of Object.entries(pl.layoutDefs)) {
                if (isExpr(raw) && ctx) {
                    layout[key] = MBExpressionEngine.evaluate(raw, ctx);
                } else {
                    layout[key] = raw;
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
}
