import { StyleSpecification, LayerSpecification } from './MBStyleSpec';
import { MBLayerEvaluator } from './MBLayerEvaluator';

/**
 * Runtime style manipulation API for MBStyleDataSource.
 *
 * Provides Mapbox-compatible runtime styling methods:
 * - setPaintProperty / setLayoutProperty
 * - addLayer / removeLayer / moveLayer
 * - setFilter / setLayerZoomRange
 * - setStyle (full style replacement)
 *
 * Each method updates the internal style and triggers tile re-decode.
 */
export class MBStyleRuntime {
    private m_style: StyleSpecification;
    private m_evaluator: MBLayerEvaluator;
    private m_onChange: () => void;

    constructor(style: StyleSpecification, onChange: () => void) {
        this.m_style = style;
        this.m_evaluator = new MBLayerEvaluator(style);
        this.m_onChange = onChange;
    }

    get evaluator(): MBLayerEvaluator {
        return this.m_evaluator;
    }

    get style(): StyleSpecification {
        return this.m_style;
    }

    /**
     * Set a paint property on a layer.
     * Usage: runtime.setPaintProperty('water', 'fill-color', '#0000ff')
     */
    setPaintProperty(layerId: string, prop: string, value: any): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        if (!layer.paint) (layer as any).paint = {};
        (layer as any).paint[prop] = value;
        this.rebuildEvaluator();
    }

    /**
     * Set a layout property on a layer.
     * Usage: runtime.setLayoutProperty('road', 'line-cap', 'round')
     */
    setLayoutProperty(layerId: string, prop: string, value: any): void {
        const layer = this.findLayer(layerId) as any;
        if (!layer) return;
        if (!layer.layout) layer.layout = {};
        layer.layout[prop] = value;
        this.rebuildEvaluator();
    }

    /**
     * Add a new layer to the style.
     */
    addLayer(layer: LayerSpecification, beforeId?: string): void {
        const layers = this.m_style.layers;
        if (beforeId) {
            const idx = layers.findIndex(l => l.id === beforeId);
            if (idx >= 0) {
                layers.splice(idx, 0, layer);
            } else {
                layers.push(layer);
            }
        } else {
            layers.push(layer);
        }
        this.rebuildEvaluator();
    }

    /**
     * Remove a layer from the style.
     */
    removeLayer(layerId: string): void {
        const idx = this.m_style.layers.findIndex(l => l.id === layerId);
        if (idx >= 0) {
            this.m_style.layers.splice(idx, 1);
            this.rebuildEvaluator();
        }
    }

    /**
     * Move a layer to a new position (before beforeId).
     */
    moveLayer(layerId: string, beforeId?: string): void {
        const layers = this.m_style.layers;
        const idx = layers.findIndex(l => l.id === layerId);
        if (idx < 0) return;
        const [layer] = layers.splice(idx, 1);
        if (beforeId) {
            const beforeIdx = layers.findIndex(l => l.id === beforeId);
            if (beforeIdx >= 0) {
                layers.splice(beforeIdx, 0, layer);
            } else {
                layers.push(layer);
            }
        } else {
            layers.push(layer);
        }
        this.rebuildEvaluator();
    }

    /**
     * Set the filter on a layer.
     */
    setFilter(layerId: string, filter: any): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        (layer as any).filter = filter;
        this.rebuildEvaluator();
    }

    /**
     * Set zoom range on a layer.
     */
    setLayerZoomRange(layerId: string, minzoom: number, maxzoom: number): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        (layer as any).minzoom = minzoom;
        (layer as any).maxzoom = maxzoom;
        this.rebuildEvaluator();
    }

    /**
     * Replace the entire style.
     */
    setStyle(style: StyleSpecification): void {
        this.m_style = style;
        this.rebuildEvaluator();
    }

    /**
     * Get a paint property value.
     */
    getPaintProperty(layerId: string, prop: string): any {
        const layer = this.findLayer(layerId);
        return (layer as any)?.paint?.[prop];
    }

    /**
     * Get a layout property value.
     */
    getLayoutProperty(layerId: string, prop: string): any {
        const layer = this.findLayer(layerId);
        return (layer as any)?.layout?.[prop];
    }

    private findLayer(layerId: string): LayerSpecification | undefined {
        return this.m_style.layers.find(l => l.id === layerId);
    }

    private rebuildEvaluator(): void {
        this.m_evaluator = new MBLayerEvaluator(this.m_style);
        this.m_onChange();
    }
}
