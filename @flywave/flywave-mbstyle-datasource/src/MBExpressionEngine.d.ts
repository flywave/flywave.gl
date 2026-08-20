export type MBValue = null | boolean | number | string | any[] | Record<string, any>;
export interface MBStyleFeature {
    type: 'Point' | 'LineString' | 'Polygon';
    id?: string | number | null;
    properties: Record<string, any>;
    _geom?: {
        type: string;
        coordinates: number[];
    };
}
export interface MBExpressionContext {
    zoom: number;
    pitch?: number;
    feature?: MBStyleFeature;
    featureState?: Record<string, any>;
    id?: string | number | null;
    center?: [number, number] | number[];
}
type CompiledExpression = (ctx: MBExpressionContext) => MBValue;
export declare class MBExpressionEngine {
    private static expressionCache;
    private static availableImages;
    static setAvailableImages(names: Set<string> | null): void;
    static addAvailableImage(name: string): void;
    static removeAvailableImage(name: string): void;
    static evaluate(raw: any, ctx: MBExpressionContext): MBValue;
    private static evaluateLegacyStops;
    private static evaluateLegacyZoomAndProperty;
    static clearCache(): void;
    static compile(raw: [string, ...any[]]): CompiledExpression;
    private static exec;
    private static isSupportedScript;
    private static haversine;
    private static computeDistance;
    private static pointInPolygon;
    private static pointInGeometry;
    private static collatorEquals;
    static featureWithin(feature: MBStyleFeature | undefined, filterGeo: any): boolean;
    private static readonly Xn;
    private static readonly Zn;
    private static readonly csT0;
    private static readonly csT1;
    private static readonly csT2;
    private static readonly csT3;
    private static xyz2lab;
    private static lab2xyz;
    private static xyz2rgb;
    private static rgb2xyz;
    private static rgbToLab;
    private static labToRgb;
    private static interpolateColorSpace;
    private static interpolateColor;
    private static parseColor;
    private static isColorString;
    private static rgbToHex;
    private static hslToRgb;
    private static cubicBezier;
}
export {};
//# sourceMappingURL=MBExpressionEngine.d.ts.map