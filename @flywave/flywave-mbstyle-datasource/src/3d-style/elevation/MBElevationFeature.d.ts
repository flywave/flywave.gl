import { ElevationCurveMeta, ElevationCurveVertex } from './MBElevationFeatureParser';
export interface ElevationVertex {
    x: number;
    y: number;
    height: number;
    extent: number;
    index: number;
}
export interface ElevationEdge {
    a: number;
    b: number;
}
export interface ElevationRange {
    min: number;
    max: number;
}
export interface ElevationBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export declare class MBElevationFeature {
    id: number;
    constantHeight: number | undefined;
    heightRange: ElevationRange;
    safeArea: ElevationBounds;
    vertices: ElevationVertex[];
    edges: ElevationEdge[];
    private vertexDirs;
    private edgeProps;
    constructor(id: number, safeArea: ElevationBounds, constantHeight?: number, vertices?: ElevationVertex[], edges?: ElevationEdge[], metersToTile?: number);
    pointElevation(x: number, y: number): number;
    computeSlopeNormal(x: number, y: number, metersToTile: number): [number, number, number];
    isTunnel(): boolean;
    private getClosestEdge;
    private rayPlaneT;
    private tessellate;
}
export declare function elevationTileToMeters(latitudeSin: number, zoomLevel: number): number;
export declare function assembleElevationFeatures(metas: ElevationCurveMeta[], curveVertices: ElevationCurveVertex[], metersToTile: number): MBElevationFeature[];
export declare class MBElevationFeatureSampler {
    zScale: number;
    xOffset: number;
    yOffset: number;
    constructor(sampleZ: number, sampleX: number, sampleY: number, elevZ: number, elevX: number, elevY: number);
    pointTransform(x: number, y: number): [number, number];
    constantElevation(elevation: MBElevationFeature, bias: number): number | undefined;
    pointElevation(x: number, y: number, elevation: MBElevationFeature, bias: number): number;
    private computeBiasedHeight;
}
export declare function mergeElevationFeatures(consumerZ: number, consumerX: number, consumerY: number, metersToTile: number, parts: Array<{
    z: number;
    x: number;
    y: number;
    feature: MBElevationFeature;
}>): MBElevationFeature;
//# sourceMappingURL=MBElevationFeature.d.ts.map