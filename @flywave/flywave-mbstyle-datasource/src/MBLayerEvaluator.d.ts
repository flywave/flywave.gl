import { MBStyleFeature } from './MBExpressionEngine';
import { CompiledFilter } from './MBFilterCompiler';
import { LayerType, StyleSpecification } from './MBStyleSpec';
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
    appearances: Array<{
        name: string;
        condition: any;
        properties: Record<string, any>;
    }> | undefined;
    importScope: string | undefined;
}
export interface PaintPropertyDef {
    type: 'constant' | 'expression' | 'transitionable';
    value: any;
    default: any;
}
export declare const PAINT_DEFAULTS: Record<string, Record<string, any>>;
export declare const LAYOUT_DEFAULTS: Record<string, Record<string, any>>;
import { ColorThemeLut } from './MBColorTheme';
export declare class MBLayerEvaluator {
    private m_layersBySource;
    private m_allLayers;
    private m_config;
    private m_lut;
    private m_scopedLuts;
    constructor(style: StyleSpecification);
    setColorTheme(lut: ColorThemeLut | null): void;
    setColorThemeScope(scope: string, lut: ColorThemeLut | null): void;
    get scopedColorThemes(): Map<string, ColorThemeLut | null>;
    private lutFor;
    get colorTheme(): ColorThemeLut | null;
    private prepare;
    private preparePaint;
    private prepareLayout;
    private evalLayoutProp;
    evaluate(sourceId: string, sourceLayer: string, feature: MBStyleFeature, zoom: number, geometryType: string, featureState?: Record<string, any>, pitch?: number, brightness?: number, worldview?: string, center?: [number, number]): EvaluatedLayer[];
    getLayersForSource(sourceId: string): PreprocessedLayer[];
    getSourceLayers(): Map<string, string[]>;
}
export {};
//# sourceMappingURL=MBLayerEvaluator.d.ts.map