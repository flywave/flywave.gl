/* Copyright (C) 2025 flywave.gl contributors */



import { assert } from "../../../utils";

export class VertexIndices implements Iterable<number> {
    public readonly data: Uint8Array;

    public constructor(data: Uint8Array) {
        this.data = data;
        assert(this.data.length % 3 === 0);
    }

    public get length(): number {
        return this.data.length / 3;
    }

    public static fromArray(indices: number[]): VertexIndices {
        const bytes = new Uint8Array(indices.length * 3);
        for (let i = 0; i < indices.length; i++) this.encodeIndex(indices[i], bytes, i * 3);

        return new VertexIndices(bytes);
    }

    public static encodeIndex(index: number, bytes: Uint8Array, byteIndex: number): void {
        assert(byteIndex + 2 < bytes.length);
        bytes[byteIndex + 0] = index & 0x000000ff;
        bytes[byteIndex + 1] = (index & 0x0000ff00) >> 8;
        bytes[byteIndex + 2] = (index & 0x00ff0000) >> 16;
    }

    public setNthIndex(n: number, value: number): void {
        VertexIndices.encodeIndex(value, this.data, n * 3);
    }

    public decodeIndex(index: number): number {
        assert(index < this.length);
        const byteIndex = index * 3;
        return (
            this.data[byteIndex] |
            (this.data[byteIndex + 1] << 8) |
            (this.data[byteIndex + 2] << 16)
        );
    }

    public decodeIndices(): number[] {
        const indices = [];
        for (let i = 0; i < this.length; i++) indices.push(this.decodeIndex(i));

        return indices;
    }

    public [Symbol.iterator]() {
        function* iterator(indices: VertexIndices) {
            for (let i = 0; i < indices.length; i++) yield indices.decodeIndex(i);
        }

        return iterator(this);
    }
}
