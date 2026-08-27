import { MBElevationFeature } from './MBElevationFeature';
export interface ElevationTiledFeature {
    z: number;
    x: number;
    y: number;
    feature: MBElevationFeature;
}
export interface ElevationFeatureRef {
    properties: Record<string, unknown> | undefined;
}
export declare function getElevationFeature(featureProps: Record<string, unknown> | undefined, sameTileFeatures: MBElevationFeature[] | undefined, registry?: ElevationTiledFeature[]): MBElevationFeature | undefined;
export declare function getOverlappingElevationParts(featureProps: Record<string, unknown> | undefined, registry: ElevationTiledFeature[] | undefined, consumerZ: number, consumerX: number, consumerY: number): ElevationTiledFeature[];
//# sourceMappingURL=MBGetElevationFeature.d.ts.map