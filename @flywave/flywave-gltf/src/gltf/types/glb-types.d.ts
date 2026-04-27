export interface GLBBinChunk {
    byteOffset: number;
    byteLength: number;
    arrayBuffer: ArrayBuffer;
}
export interface GLB {
    type: string;
    version: number;
    header: {
        byteOffset: number;
        byteLength: number;
        hasBinChunk: boolean;
    };
    json: Record<string, any>;
    binChunks: GLBBinChunk[];
}
