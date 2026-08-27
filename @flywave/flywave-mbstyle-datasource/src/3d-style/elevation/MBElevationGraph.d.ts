export type ElevationPortalType = 'unevaluated' | 'none' | 'tunnel' | 'polygon' | 'entrance' | 'border';
export interface ElevationPortalConnection {
    a: number | undefined;
    b: number | undefined;
}
export interface ElevationPortalEdge {
    connection: ElevationPortalConnection;
    vaX: number;
    vaY: number;
    vbX: number;
    vbY: number;
    length: number;
    hash: string;
    isTunnel: boolean;
    type: ElevationPortalType;
}
export declare function portalEdgeHash(ax: number, ay: number, bx: number, by: number): string;
export declare class MBElevationPortalGraph {
    portals: ElevationPortalEdge[];
    addPortal(portal: ElevationPortalEdge): void;
    static evaluate(unevaluated: MBElevationPortalGraph[]): MBElevationPortalGraph;
}
//# sourceMappingURL=MBElevationGraph.d.ts.map