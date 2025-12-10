/* Copyright (C) 2025 flywave.gl contributors */

import { type TypedArray } from "three";

export class FlatArray<T = number> {
    private readonly array_: T[] = [];
    private readonly itemSize_: number = 2;

    static create<T>({ array, itemSize }: { array: T[]; itemSize: number }): FlatArray<T> {
        return new FlatArray<T>({ array, itemSize });
    }

    static fromTypedArray<T extends TypedArray>(
        typedArray: T,
        itemSize: number
    ): FlatArray<number> {
        if (typedArray.length % itemSize !== 0) {
            throw new Error("TypedArray length must be divisible by itemSize");
        }
        return new FlatArray<number>({
            array: Array.from(typedArray),
            itemSize
        });
    }

    get array() {
        return this.array_;
    }

    get itemSize() {
        return this.itemSize_;
    }

    get count() {
        return this.array_.length / this.itemSize_;
    }

    itemAt(i: number): T[] {
        if (i < 0 || i >= this.count) {
            throw new Error("Index out of bounds");
        }
        const size = this.itemSize_;
        const start = i * size;
        const r = new Array<T>(size);
        for (let j = 0; j < size; ++j) {
            r[j] = this.array_[start + j];
        }
        return r;
    }

    push(item: T[]) {
        if (item.length !== this.itemSize_) {
            throw new Error("item size not match");
        }
        this.array_.push(...item);
    }

    pushItems(...items: T[][]) {
        for (const item of items) {
            this.push(item);
        }
    }

    pop(): T[] | undefined {
        if (this.array_.length === 0) return undefined;
        const size = this.itemSize_;
        return this.array_.splice(-size, size);
    }

    forEach(callback: (item: T[], i: number, serie: FlatArray<T>) => void) {
        for (let i = 0; i < this.count; ++i) {
            callback(this.itemAt(i), i, this);
        }
    }

    map<U>(callback: (item: T[], i: number, serie: FlatArray<T>) => U[]): FlatArray<U> {
        const result: U[] = [];
        for (let i = 0; i < this.count; ++i) {
            const item = this.itemAt(i);
            const mapped = callback(item, i, this);
            if (mapped.length !== this.itemSize_) {
                throw new Error("Mapped item size must match original item size");
            }
            result.push(...mapped);
        }
        return FlatArray.create({ array: result, itemSize: this.itemSize_ });
    }

    filter(predicate: (item: T[], i: number, serie: FlatArray<T>) => boolean): FlatArray<T> {
        const result: T[] = [];
        for (let i = 0; i < this.count; ++i) {
            const item = this.itemAt(i);
            if (predicate(item, i, this)) {
                result.push(...item);
            }
        }
        return FlatArray.create({ array: result, itemSize: this.itemSize_ });
    }

    reduce<U>(
        callback: (accumulator: U, item: T[], i: number, serie: FlatArray<T>) => U,
        initialValue: U
    ): U {
        let accumulator = initialValue;
        for (let i = 0; i < this.count; ++i) {
            accumulator = callback(accumulator, this.itemAt(i), i, this);
        }
        return accumulator;
    }

    slice(start?: number, end?: number): FlatArray<T> {
        const actualStart = start ?? 0;
        const actualEnd = end ?? this.count;

        if (actualStart < 0 || actualEnd > this.count || actualStart > actualEnd) {
            throw new Error("Invalid slice range");
        }

        const size = this.itemSize_;
        const startIndex = actualStart * size;
        const endIndex = actualEnd * size;
        const slicedArray = this.array_.slice(startIndex, endIndex);

        return FlatArray.create({ array: slicedArray, itemSize: size });
    }

    concat(...others: Array<FlatArray<T>>): FlatArray<T> {
        const result = [...this.array_];
        for (const other of others) {
            if (other.itemSize_ !== this.itemSize_) {
                throw new Error("All FlatArrays must have the same item size");
            }
            result.push(...other.array_);
        }
        return FlatArray.create({ array: result, itemSize: this.itemSize_ });
    }

    clear() {
        this.array_.length = 0;
    }

    isEmpty(): boolean {
        return this.array_.length === 0;
    }

    toArray(): T[][] {
        const result: T[][] = [];
        for (let i = 0; i < this.count; ++i) {
            result.push(this.itemAt(i));
        }
        return result;
    }

    /**
     * Convert to Float32Array (for WebGL, WebGPU, etc.)
     */
    toFloat32Array(): Float32Array {
        if (typeof this.array_[0] !== "number") {
            throw new Error("Array elements must be numbers to convert to Float32Array");
        }
        return new Float32Array(this.array_ as number[]);
    }

    protected constructor({ array, itemSize }: { array: T[]; itemSize: number }) {
        if (array.length % itemSize !== 0) {
            throw new Error("Array length must be a multiple of itemSize");
        }
        this.array_ = array;
        this.itemSize_ = itemSize;
    }
}
