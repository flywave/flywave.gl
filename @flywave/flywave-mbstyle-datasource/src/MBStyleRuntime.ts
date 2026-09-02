import { StyleSpecification, LayerSpecification } from './MBStyleSpec';
import { MBLayerEvaluator, PAINT_DEFAULTS } from './MBLayerEvaluator';
import { loadColorTheme } from './MBColorTheme';
import * as THREE from 'three';

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
        // Mapbox `color-theme` LUT — async decode; a null result (no theme /
        // decode failure) keeps the identity transform.
        loadColorTheme(style).then(lut => {
            this.m_evaluator.setColorTheme(lut);
            try { onChange(); } catch {}
        }).catch(() => {});
    }

    get evaluator(): MBLayerEvaluator {
        return this.m_evaluator;
    }

    /** True while a paint transition is mid-flight (capture-latency guard). */
    get hasActiveTransitions(): boolean {
        return this.m_transitions.length > 0;
    }

    get style(): StyleSpecification {
        return this.m_style;
    }

    setPaintProperty(layerId: string, prop: string, value: any): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        if (!layer.paint) (layer as any).paint = {};

        console.log('[SPP] layer=' + layerId + ' prop=' + prop + ' value=' + JSON.stringify(value) + ' found=' + (layer ? 'Y' : 'N'));
        let oldValue = (layer as any).paint[prop];
        if (oldValue === undefined) {
            // Transitioning away from an UNSET property starts at the
            // property's spec default (mgl: #2769 black→red halfway check).
            oldValue = PAINT_DEFAULTS[layer.type]?.[prop];
        }
        // mgl style-spec default transition: {duration: 300, delay: 0}.
        const transition = (this.m_style as any).transition;
        const duration = transition?.duration ?? 300;
        const delay = transition?.delay ?? 0;

        console.log('[SPP2] dur=' + duration + ' interp=' + this.canInterpolate(oldValue, value) + ' old=' + JSON.stringify(oldValue));
        if (duration > 0 && this.canInterpolate(oldValue, value)) {
            // mgl semantics: the property reads back its TARGET immediately
            // (getPaintProperty returns the new value even mid-transition);
            // only the rendered evaluation interpolates over time.
            (layer as any).paint[prop] = value;
            this.m_transitions.push({
                layerId, prop,
                from: oldValue,
                to: value,
                start: Date.now() + delay,
                duration,
                delay,
            });
            this.rebuildEvaluator();
            this.ensureTickLoop();
        } else {
            (layer as any).paint[prop] = value;
            this.rebuildEvaluator();
            // §750: non-interpolable paint changes must reach the tiles —
            // the datasource onChange reconfigures the decoder + marks tiles
            // dirty so decode-time evaluation (model part paints, LUT gates)
            // sees the new value. Without this, model runtime-styling ops
            // (model-color-mix-intensity etc.) silently never render.
            this.m_onChange();
        }
    }

    private canInterpolate(a: any, b: any): boolean {
        if (typeof a === 'number' && typeof b === 'number') return true;
        if (typeof a === 'string' && typeof b === 'string') {
            return MBStyleRuntime.isColorString(a) && MBStyleRuntime.isColorString(b);
        }
        return false;
    }

    /** CSS color forms THREE.Color parses (hex, rgb()/hsl(), common names). */
    private static readonly COLOR_NAMES = new Set([
        'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
        'gray', 'grey', 'pink', 'brown', 'cyan', 'magenta', 'lime', 'navy',
        'teal', 'gold', 'violet', 'indigo', 'silver', 'beige', 'maroon',
        'olive', 'aqua', 'fuchsia', 'skyblue', 'steelblue', 'transparent',
    ]);

    private static isColorString(s: string): boolean {
        if (s.startsWith('#') || /^(rgb|hsl)a?\(/i.test(s)) return true;
        return MBStyleRuntime.COLOR_NAMES.has(s.toLowerCase());
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
        try {
            // THREE.Color parses hex/rgb()/named CSS; lerp is per-channel
            // linear (matches mgl's Color interpolation for transitions).
            const ca = new THREE.Color(a);
            const cb = new THREE.Color(b);
            const out = ca.clone().lerp(cb, t);
            return `#${out.getHexString()}`;
        } catch {
            return t > 0.5 ? b : a;
        }
    }

    private ensureTickLoop(): void {
        console.log('[ETL] called, existing=' + (this.m_tickCallback ? 'Y' : 'N') + ' transitions=' + this.m_transitions.length);
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
            // mgl paint transitions are LINEAR by default (no easing).
            const value = this.interpolate(tr.from, tr.to, t);

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
            // §750: fire onChange once at the FINAL tick so the settled
            // target value reaches a re-decode (bounded: not per tick).
            if (remaining.length === 0) {
                console.log('[TICKEND] firing onChange, transitions drained');
                this.m_onChange();
            }
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
        // mgl repaints on addLayer — the datasource must re-decode tiles so
        // decode-time placements (model layers over geojson/vector sources)
        // see the new layer (model placements are emitted during decode).
        this.m_onChange();
    }

    /**
     * Remove a layer from the style.
     */
    removeLayer(layerId: string): void {
        const idx = this.m_style.layers.findIndex(l => l.id === layerId);
        if (idx >= 0) {
            this.m_style.layers.splice(idx, 1);
            this.rebuildEvaluator();
            this.m_onChange();
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
        this.m_onChange();
    }

    /**
     * Set the filter on a layer.
     */
    onLayerFilterChanged: ((layerId: string, filter: any) => void) | null = null;

    setFilter(layerId: string, filter: any): void {
        const layer = this.findLayer(layerId);
        if (!layer) return;
        (layer as any).filter = filter;
        this.rebuildEvaluator();
        // batched-model datasources filter NODES by this expression (mgl
        // bucket.setFilter) — notify the owner so they can update.
        this.onLayerFilterChanged?.(layerId, filter);
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
        // mgl: the property reports its transition TARGET while a transition
        // is running (the raw paint map holds the interpolated render value).
        for (const tr of this.m_transitions) {
            if (tr.layerId === layerId && tr.prop === prop) return tr.to;
        }
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
        const prevLut = (this.m_evaluator as any).m_lut ?? null;
        const prevScoped = (this.m_evaluator as any).scopedColorThemes
            ?? new Map<string, any>();
        this.m_evaluator = new MBLayerEvaluator(this.m_style);
        this.m_evaluator.setColorTheme(prevLut);
        for (const [scope, lut] of prevScoped) {
            this.m_evaluator.setColorThemeScope(scope, lut);
        }
        loadColorTheme(this.m_style).then(lut => {
            // A runtime map.setColorTheme overrides the style JSON's theme
            // until explicitly cleared (mgl colorThemeOverride precedence).
            if (!(this as any).m_runtimeThemeOverride) {
                this.m_evaluator.setColorTheme(lut);
            }
            try { this.m_onChange(); } catch {}
        }).catch(() => {});
        this.m_onChange();
    }
}
