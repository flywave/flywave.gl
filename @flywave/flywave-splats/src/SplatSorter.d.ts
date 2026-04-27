export declare class SplatSorter {
    vertexCount: number;
    positions: Float32Array;
    hasInit: boolean;
    splatIndex: Uint32Array;
    depthValues: Int32Array;
    tempDepths: Int32Array;
    tempIndices: Uint32Array;
    onmessage: ((this: SplatSorter, ev: any) => any) | null;
    constructor();
    terminate(): void;
    private _initSortData;
    private static readonly _SplatBatchSize;
    private static _iWorkCount;
    private _sortData;
    init(positions: Float32Array, vertexCount: number): void;
    sortDataAsync(viewProj: any): Promise<void>;
}
