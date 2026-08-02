import { StyleSpecification, LayerSpecification } from './MBStyleSpec';
import { MBLayerEvaluator } from './MBLayerEvaluator';

interface ActiveTransition {
    layerId: string;
    prop: string;
    from: any;
    to: any;
    start: number;
    duration: number;
    delay: number;
}

export class MBStyleRuntime {
    private m_style: StyleSpecification;
    private m_evaluator: MBLayerEvaluator;
    private m_onChange: () => void;
    private m_transitions: ActiveTransition[] = [];
    private m_tickCallback: (() => void) | null = null;

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

    setPaintProperty(layerId: string, prop: string, value: any): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        if (!layer.paint) (layer as any).paint = {};

        const oldValue = (layer as any).paint[prop];
        const transition = (this.m_style as any).transition;
        const duration = transition?.duration ?? 0;
        const delay = transition?.delay ?? 0;

        if (duration > 0 && this.canInterpolate(oldValue, value)) {
            this.m_transitions.push({
                layerId, prop,
                from: oldValue,
                to: value,
                start: Date.now() + delay,
                duration,
                delay,
            });
            this.ensureTickLoop();
        } else {
            (layer as any).paint[prop] = value;
            this.rebuildEvaluator();
        }
    }

    private canInterpolate(a: any, b: any): boolean {
        if (typeof a === 'number' && typeof b === 'number') return true;
        if (typeof a === 'string' && typeof b === 'string' &&
            (a.startsWith('#') || a.startsWith('rgb')) &&
            (b.startsWith('#') || b.startsWith('rgb'))) return true;
        return false;
    }

    private interpolate(a: any, b: any, t: number): any {
        if (typeof a === 'number' && typeof b === 'number') {
            return a + (b - a) * t;
        }
        if (typeof a === 'string' && typeof b === 'string') {
            return this.interpolateColor(a, b, t);
        }
        return t > 0.5 ? b : a;
    }

    private interpolateColor(a: string, b: string, t: number): string {
        const parse = (c: string) => {
            const h = c.replace('#', '');
            return {
                r: parseInt(h.substring(0, 2), 16) || 0,
                g: parseInt(h.substring(2, 4), 16) || 0,
                b: parseInt(h.substring(4, 6), 16) || 0,
            };
        };
        try {
            const ca = parse(a);
            const cb = parse(b);
            const r = Math.round(ca.r + (cb.r - ca.r) * t);
            const g = Math.round(ca.g + (cb.g - ca.g) * t);
            const bl = Math.round(ca.b + (cb.b - ca.b) * t);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
        } catch {
            return t > 0.5 ? b : a;
        }
    }

    private ensureTickLoop(): void {
        if (this.m_tickCallback) return;
        this.m_tickCallback = () => this.tickTransitions();
        this.m_onChange();
        if (typeof setInterval !== 'undefined') {
            const interval = setInterval(() => {
                if (this.m_transitions.length === 0) {
                    clearInterval(interval);
                    this.m_tickCallback = null;
                    return;
                }
                this.tickTransitions();
            }, 16);
        }
    }

    private tickTransitions(): void {
        const now = Date.now();
        let changed = false;
        const remaining: ActiveTransition[] = [];

        for (const tr of this.m_transitions) {
            const elapsed = now - tr.start;
            if (elapsed < 0) {
                remaining.push(tr);
                continue;
            }
            const t = Math.min(1, elapsed / tr.duration);
            const eased = t * t * (3 - 2 * t);
            const value = this.interpolate(tr.from, tr.to, eased);

            const layer = this.findLayer(tr.layerId);
            if (layer) {
                if (!layer.paint) (layer as any).paint = {};
                (layer as any).paint[tr.prop] = value;
                changed = true;
            }

            if (t < 1) {
                remaining.push(tr);
            }
        }

        this.m_transitions = remaining;
        if (changed) {
            this.rebuildEvaluator();
        }
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
     * Add a source definition to the style at runtime. The datasource should
     * listen for `onSourceChanged` to actually wire up a new data provider.
     */
    addSource(sourceId: string, source: any): void {
        if (!this.m_style.sources) (this.m_style as any).sources = {};
        (this.m_style.sources as any)[sourceId] = source;
        this.m_onChange();
    }

    /**
     * Remove a source from the style. Layers referencing the removed source
     * will no longer render anything.
     */
    removeSource(sourceId: string): void {
        if (this.m_style.sources && (this.m_style.sources as any)[sourceId]) {
            delete (this.m_style.sources as any)[sourceId];
            this.m_onChange();
        }
    }

    /**
     * Replace the data of an inline GeoJSON source. Triggers a reload of any
     * affected tiles through `onChange`.
     */
    setGeoJSONSourceData(sourceId: string, data: any): void {
        if (!this.m_style.sources) return;
        const src = (this.m_style.sources as any)[sourceId];
        if (!src) return;
        src.data = typeof data === 'string' ? data : JSON.parse(JSON.stringify(data));
        this.m_onChange();
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
