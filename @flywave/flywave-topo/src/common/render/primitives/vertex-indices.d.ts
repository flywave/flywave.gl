export declare class VertexIndices implements Iterable<number> {
    readonly data: Uint8Array;
    constructor(data: Uint8Array);
    get length(): number;
    static fromArray(indices: number[]): VertexIndices;
    static encodeIndex(index: number, bytes: Uint8Array, byteIndex: number): void;
    setNthIndex(n: number, value: number): void;
    decodeIndex(index: number): number;
    decodeIndices(): number[];
    [Symbol.iterator](): Generator<number, void, unknown>;
}
