export interface ElevationCurveVertex {
    id: number;
    idx: number;
    x: number;
    y: number;
    extent: number;
    height: number;
}
export interface ElevationCurveMeta {
    id: number;
    bounds: [number, number, number, number];
    constantHeight: number | undefined;
}
export interface ElevationParseResult {
    vertices: ElevationCurveVertex[];
    features: ElevationCurveMeta[];
}
export declare function decodeRelativeHeight(height: number): number;
export declare function decodeMetricHeight(height: number): number;
export interface RawElevationFeature {
    type: string;
    properties: Record<string, unknown>;
    x: number;
    y: number;
    bounds: [number, number, number, number];
    layerExtent: number;
}
export declare function parseElevationVertex(f: RawElevationFeature): ElevationCurveVertex | null;
export declare function parseElevationMeta(f: RawElevationFeature): ElevationCurveMeta | null;
//# sourceMappingURL=MBElevationFeatureParser.d.ts.map