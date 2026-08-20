import { StyleSpecification, LayerSpecification } from './MBStyleSpec';
import { MBLayerEvaluator } from './MBLayerEvaluator';
export declare class MBStyleRuntime {
    private m_style;
    private m_evaluator;
    private m_onChange;
    private m_transitions;
    private m_tickCallback;
    constructor(style: StyleSpecification, onChange: () => void);
    get evaluator(): MBLayerEvaluator;
    get style(): StyleSpecification;
    setPaintProperty(layerId: string, prop: string, value: any): void;
    private canInterpolate;
    private interpolate;
    private interpolateColor;
    private ensureTickLoop;
    private tickTransitions;
    setLayoutProperty(layerId: string, prop: string, value: any): void;
    addLayer(layer: LayerSpecification, beforeId?: string): void;
    removeLayer(layerId: string): void;
    moveLayer(layerId: string, beforeId?: string): void;
    setFilter(layerId: string, filter: any): void;
    setLayerZoomRange(layerId: string, minzoom: number, maxzoom: number): void;
    setStyle(style: StyleSpecification): void;
    addSource(sourceId: string, source: any): void;
    removeSource(sourceId: string): void;
    setGeoJSONSourceData(sourceId: string, data: any): void;
    getPaintProperty(layerId: string, prop: string): any;
    getLayoutProperty(layerId: string, prop: string): any;
    private findLayer;
    private rebuildEvaluator;
}
//# sourceMappingURL=MBStyleRuntime.d.ts.map