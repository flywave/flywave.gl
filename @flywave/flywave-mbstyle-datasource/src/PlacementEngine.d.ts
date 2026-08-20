export interface SymbolInstance {
    id: string;
    layerId: string;
    featureId: string | number;
    screenX: number;
    screenY: number;
    iconBox?: {
        w: number;
        h: number;
    };
    textBox?: {
        w: number;
        h: number;
    };
    allowOverlap: boolean;
    ignorePlacement: boolean;
    priority: number;
    opacity: number;
    object?: any;
    variableAnchors?: string[];
    textRadialOffset?: number;
    crossTileID?: number;
    text?: string;
    tileKey?: string;
    iconOptional?: boolean;
}
export interface PlacementResult {
    visible: boolean;
    opacity: number;
}
export declare function setFadeDuration(ms: number): void;
export declare class PlacementEngine {
    private m_collisionIndex;
    private m_opacityMap;
    private m_lastPlacementZoom;
    private m_lastPlacementTime;
    place(symbols: SymbolInstance[], now: number, zoom?: number): Map<string, PlacementResult>;
    stillRecent(now: number): boolean;
    private canPlaceSymbol;
    private insertSymbol;
    private getSymbolBoxes;
    private getAnchorBoxOffset;
    clearOpacityCache(): void;
}
//# sourceMappingURL=PlacementEngine.d.ts.map