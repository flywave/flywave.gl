import { HD_ELEVATION_SOURCE_LAYER } from './MBElevationConstants';
import { MBElevationFeature } from './MBElevationFeature';
import { RawElevationFeature } from './MBElevationFeatureParser';
import { MBElevationPortalGraph } from './MBElevationGraph';
export interface FillElevationResult {
    ringHeights: number[][];
    feature: MBElevationFeature;
}
export declare class MBElevatedStructures {
    features: MBElevationFeature[];
    hasPayload: boolean;
    private m_meta;
    private m_vertices;
    private m_unevaluatedPortals;
    private m_layerExtent;
    addRawFeature(f: RawElevationFeature): boolean;
    finalize(metersToTile: number): void;
    get isEmpty(): boolean;
    resolveFillHeights(properties: Record<string, unknown> | undefined, rings: Array<Array<{
        x: number;
        y: number;
    }>>, isMarkup: boolean): FillElevationResult | null;
    resolveFeature(properties: Record<string, unknown> | undefined): MBElevationFeature | undefined;
    sampleHeight(properties: Record<string, unknown> | undefined, x: number, y: number, isMarkup: boolean): number | undefined;
    isTunnelFeature(properties: Record<string, unknown> | undefined): boolean;
    addPortalEdge(ax: number, ay: number, bx: number, by: number, edgeIndex: number, isTunnel: boolean): void;
    get unevaluatedPortals(): MBElevationPortalGraph | null;
}
export declare function normalizeToElevationExtent(v: number, layerExtent: number): number;
export { HD_ELEVATION_SOURCE_LAYER };
//# sourceMappingURL=MBElevatedStructures.d.ts.map