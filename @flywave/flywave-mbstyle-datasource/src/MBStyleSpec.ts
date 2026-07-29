export type ExpressionSpecification = [string, ...any[]];

export type FilterSpecification =
    | ExpressionSpecification
    | ['has', string]
    | ['!has', string]
    | ['==', string, string | number | boolean]
    | ['!=', string, string | number | boolean]
    | ['>', string, string | number | boolean]
    | ['>=', string, string | number | boolean]
    | ['<', string, string | number | boolean]
    | ['<=', string, string | number | boolean]
    | Array<string | FilterSpecification>;

export type MBColorSpec = string;
export type MBFormattedSpec = string;

export type PropertyValueSpecification<T> = T | ExpressionSpecification;

export type DataDrivenPropertyValueSpecification<T> =
    | T
    | ExpressionSpecification;

export interface VectorSourceSpec {
    type: 'vector';
    url?: string;
    tiles?: string[];
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    [_: string]: unknown;
}

export interface RasterSourceSpec {
    type: 'raster';
    url?: string;
    tiles?: string[];
    tileSize?: number;
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    [_: string]: unknown;
}

export interface RasterDEMSourceSpec {
    type: 'raster-dem';
    url?: string;
    tiles?: string[];
    tileSize?: number;
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    encoding?: 'terrarium' | 'mapbox';
    [_: string]: unknown;
}

export interface GeoJSONSourceSpec {
    type: 'geojson';
    data?: any;
    maxzoom?: number;
    minzoom?: number;
    attribution?: string;
    cluster?: boolean;
    clusterRadius?: number;
    clusterMaxZoom?: number;
    [_: string]: unknown;
}

export type SourceSpecification =
    | VectorSourceSpec
    | RasterSourceSpec
    | RasterDEMSourceSpec
    | GeoJSONSourceSpec;

export interface FillLayerSpec {
    id: string;
    type: 'fill';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    layout?: {
        'fill-sort-key'?: DataDrivenPropertyValueSpecification<number>;
        visibility?: 'visible' | 'none' | ExpressionSpecification;
    };
    paint?: {
        'fill-antialias'?: PropertyValueSpecification<boolean>;
        'fill-opacity'?: DataDrivenPropertyValueSpecification<number>;
        'fill-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'fill-outline-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'fill-translate'?: PropertyValueSpecification<[number, number]>;
        'fill-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        'fill-pattern'?: DataDrivenPropertyValueSpecification<string>;
        [_: string]: unknown;
    };
}

export interface LineLayerSpec {
    id: string;
    type: 'line';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    layout?: {
        'line-cap'?: DataDrivenPropertyValueSpecification<'butt' | 'round' | 'square'>;
        'line-join'?: DataDrivenPropertyValueSpecification<'bevel' | 'round' | 'miter' | 'none'>;
        'line-miter-limit'?: PropertyValueSpecification<number>;
        'line-round-limit'?: PropertyValueSpecification<number>;
        'line-sort-key'?: DataDrivenPropertyValueSpecification<number>;
        visibility?: 'visible' | 'none' | ExpressionSpecification;
    };
    paint?: {
        'line-opacity'?: DataDrivenPropertyValueSpecification<number>;
        'line-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'line-translate'?: PropertyValueSpecification<[number, number]>;
        'line-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        'line-width'?: DataDrivenPropertyValueSpecification<number>;
        'line-gap-width'?: DataDrivenPropertyValueSpecification<number>;
        'line-offset'?: DataDrivenPropertyValueSpecification<number>;
        'line-blur'?: DataDrivenPropertyValueSpecification<number>;
        'line-dasharray'?: DataDrivenPropertyValueSpecification<number[]>;
        'line-pattern'?: DataDrivenPropertyValueSpecification<string>;
        'line-gradient'?: ExpressionSpecification;
        [_: string]: unknown;
    };
}

export interface SymbolLayerSpec {
    id: string;
    type: 'symbol';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    layout?: {
        'symbol-placement'?: PropertyValueSpecification<'point' | 'line' | 'line-center'>;
        'symbol-spacing'?: PropertyValueSpecification<number>;
        'symbol-avoid-edges'?: PropertyValueSpecification<boolean>;
        'symbol-sort-key'?: DataDrivenPropertyValueSpecification<number>;
        'symbol-z-order'?: PropertyValueSpecification<'auto' | 'viewport-y' | 'source'>;
        'icon-allow-overlap'?: PropertyValueSpecification<boolean>;
        'icon-ignore-placement'?: PropertyValueSpecification<boolean>;
        'icon-optional'?: PropertyValueSpecification<boolean>;
        'icon-rotation-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>;
        'icon-size'?: DataDrivenPropertyValueSpecification<number>;
        'icon-text-fit'?: DataDrivenPropertyValueSpecification<'none' | 'width' | 'height' | 'both'>;
        'icon-image'?: DataDrivenPropertyValueSpecification<string>;
        'icon-rotate'?: DataDrivenPropertyValueSpecification<number>;
        'icon-padding'?: PropertyValueSpecification<number>;
        'icon-keep-upright'?: PropertyValueSpecification<boolean>;
        'icon-offset'?: DataDrivenPropertyValueSpecification<[number, number]>;
        'icon-anchor'?: DataDrivenPropertyValueSpecification<string>;
        'icon-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>;
        'text-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>;
        'text-rotation-alignment'?: PropertyValueSpecification<'map' | 'viewport' | 'auto'>;
        'text-field'?: DataDrivenPropertyValueSpecification<MBFormattedSpec>;
        'text-font'?: DataDrivenPropertyValueSpecification<string[]>;
        'text-size'?: DataDrivenPropertyValueSpecification<number>;
        'text-max-width'?: DataDrivenPropertyValueSpecification<number>;
        'text-line-height'?: DataDrivenPropertyValueSpecification<number>;
        'text-letter-spacing'?: DataDrivenPropertyValueSpecification<number>;
        'text-justify'?: DataDrivenPropertyValueSpecification<string>;
        'text-radial-offset'?: DataDrivenPropertyValueSpecification<number>;
        'text-anchor'?: DataDrivenPropertyValueSpecification<string>;
        'text-max-angle'?: PropertyValueSpecification<number>;
        'text-rotate'?: DataDrivenPropertyValueSpecification<number>;
        'text-padding'?: PropertyValueSpecification<number>;
        'text-keep-upright'?: PropertyValueSpecification<boolean>;
        'text-transform'?: DataDrivenPropertyValueSpecification<'none' | 'uppercase' | 'lowercase'>;
        'text-offset'?: DataDrivenPropertyValueSpecification<[number, number]>;
        'text-allow-overlap'?: PropertyValueSpecification<boolean>;
        'text-ignore-placement'?: PropertyValueSpecification<boolean>;
        'text-optional'?: PropertyValueSpecification<boolean>;
        'text-variable-anchor'?: PropertyValueSpecification<string[]>;
        visibility?: 'visible' | 'none' | ExpressionSpecification;
    };
    paint?: {
        'icon-opacity'?: DataDrivenPropertyValueSpecification<number>;
        'icon-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'icon-halo-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'icon-halo-width'?: DataDrivenPropertyValueSpecification<number>;
        'icon-halo-blur'?: DataDrivenPropertyValueSpecification<number>;
        'icon-translate'?: PropertyValueSpecification<[number, number]>;
        'icon-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        'text-opacity'?: DataDrivenPropertyValueSpecification<number>;
        'text-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'text-halo-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'text-halo-width'?: DataDrivenPropertyValueSpecification<number>;
        'text-halo-blur'?: DataDrivenPropertyValueSpecification<number>;
        'text-translate'?: PropertyValueSpecification<[number, number]>;
        'text-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        [_: string]: unknown;
    };
}

export interface CircleLayerSpec {
    id: string;
    type: 'circle';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    layout?: {
        'circle-sort-key'?: DataDrivenPropertyValueSpecification<number>;
        visibility?: 'visible' | 'none' | ExpressionSpecification;
    };
    paint?: {
        'circle-radius'?: DataDrivenPropertyValueSpecification<number>;
        'circle-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'circle-blur'?: DataDrivenPropertyValueSpecification<number>;
        'circle-opacity'?: DataDrivenPropertyValueSpecification<number>;
        'circle-translate'?: PropertyValueSpecification<[number, number]>;
        'circle-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        'circle-pitch-scale'?: PropertyValueSpecification<'map' | 'viewport'>;
        'circle-pitch-alignment'?: PropertyValueSpecification<'map' | 'viewport'>;
        'circle-stroke-width'?: DataDrivenPropertyValueSpecification<number>;
        'circle-stroke-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'circle-stroke-opacity'?: DataDrivenPropertyValueSpecification<number>;
        [_: string]: unknown;
    };
}

export interface FillExtrusionLayerSpec {
    id: string;
    type: 'fill-extrusion';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    paint?: {
        'fill-extrusion-opacity'?: PropertyValueSpecification<number>;
        'fill-extrusion-color'?: DataDrivenPropertyValueSpecification<MBColorSpec>;
        'fill-extrusion-translate'?: PropertyValueSpecification<[number, number]>;
        'fill-extrusion-translate-anchor'?: PropertyValueSpecification<'map' | 'viewport'>;
        'fill-extrusion-height'?: DataDrivenPropertyValueSpecification<number>;
        'fill-extrusion-base'?: DataDrivenPropertyValueSpecification<number>;
        'fill-extrusion-vertical-gradient'?: PropertyValueSpecification<boolean>;
        [_: string]: unknown;
    };
}

export interface BackgroundLayerSpec {
    id: string;
    type: 'background';
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    paint?: {
        'background-color'?: PropertyValueSpecification<MBColorSpec>;
        'background-opacity'?: PropertyValueSpecification<number>;
        'background-pattern'?: PropertyValueSpecification<string>;
        [_: string]: unknown;
    };
}

export interface RasterLayerSpec {
    id: string;
    type: 'raster';
    source: string;
    'source-layer'?: string;
    metadata?: unknown;
    minzoom?: number;
    maxzoom?: number;
    paint?: {
        'raster-opacity'?: PropertyValueSpecification<number>;
        'raster-hue-rotate'?: PropertyValueSpecification<number>;
        'raster-brightness-min'?: PropertyValueSpecification<number>;
        'raster-brightness-max'?: PropertyValueSpecification<number>;
        'raster-saturation'?: PropertyValueSpecification<number>;
        'raster-contrast'?: PropertyValueSpecification<number>;
        'raster-resampling'?: PropertyValueSpecification<'linear' | 'nearest'>;
        'raster-fade-duration'?: PropertyValueSpecification<number>;
        [_: string]: unknown;
    };
}

export type LayerSpecification =
    | FillLayerSpec
    | LineLayerSpec
    | SymbolLayerSpec
    | CircleLayerSpec
    | FillExtrusionLayerSpec
    | BackgroundLayerSpec
    | RasterLayerSpec;

export interface LightSpec {
    anchor?: 'map' | 'viewport';
    position?: [number, number, number];
    color?: MBColorSpec;
    intensity?: number;
}

export interface FogSpec {
    range?: [number, number];
    color?: MBColorSpec;
    'high-color'?: MBColorSpec;
    'space-color'?: MBColorSpec;
    'horizon-blend'?: number;
    'star-intensity'?: number;
    'vertical-range'?: [number, number];
}

export interface SkySpec {
    'sky-type'?: 'gradient' | 'atmosphere';
    'sky-atmosphere-sun'?: [number, number];
    'sky-atmosphere-sun-intensity'?: number;
    'sky-atmosphere-color'?: MBColorSpec;
    'sky-atmosphere-halo-color'?: MBColorSpec;
    'sky-gradient'?: any;
    'sky-gradient-center'?: [number, number];
    'sky-opacity'?: number;
}

export interface Light3DProperties {
    type: 'ambient' | 'directional' | 'flat';
    color?: MBColorSpec;
    intensity?: number;
    direction?: [number, number, number];
    'cast-shadow'?: boolean;
}

export interface TerrainSpec {
    source: string;
    exaggeration?: number;
}

export interface SourcesSpecification {
    [sourceId: string]: SourceSpecification;
}

export interface StyleSpecification {
    version: 8;
    name?: string;
    metadata?: unknown;
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
    light?: LightSpec;
    fog?: FogSpec;
    sky?: SkySpec;
    terrain?: TerrainSpec;
    projection?: any;
    sources: SourcesSpecification;
    sprite?: string;
    glyphs?: string;
    transition?: { duration?: number; delay?: number };
    layers: LayerSpecification[];
}

export type LayerType = LayerSpecification['type'] | 'heatmap' | 'hillshade' | 'sky' | 'model' | 'building' | 'clip' | 'slot';

export const GEOMETRY_TYPE_MAP: Record<string, string[]> = {
    fill: ['polygon'],
    line: ['line'],
    symbol: ['point', 'line'],
    circle: ['point'],
    'fill-extrusion': ['polygon'],
    background: ['polygon'],
    raster: ['polygon'],
    heatmap: ['point'],
    hillshade: ['polygon'],
    model: ['point'],
    building: ['polygon'],
};
