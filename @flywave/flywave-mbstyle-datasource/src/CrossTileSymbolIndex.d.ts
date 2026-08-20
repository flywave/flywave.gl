export declare function symbolKey(text: string): number;
export declare class CrossTileSymbolIndex {
    private m_maxCrossTileID;
    private m_layerIndexes;
    private generateID;
    assignIDs(layerId: string, symbols: Array<{
        localId: string;
        text: string;
        screenX: number;
        screenY: number;
        tileKey: string;
        zoom: number;
    }>): Map<string, number>;
    pruneStale(layerId: string, currentTileKeys: Set<string>): number;
    removeLayer(layerId: string): void;
    get size(): number;
}
//# sourceMappingURL=CrossTileSymbolIndex.d.ts.map