/* Copyright (C) 2025 flywave.gl contributors */

import { defined } from "./Utils";

const SIXTY_FOUR_KILOBYTES = 64 * 1024;

export class IndexDatatype {
    /**
     * Creates a typed array that will store indices, using either Uint16Array
     * or Uint32Array depending on the number of vertices.
     */
    static createTypedArray(
        numberOfVertices: number,
        indicesLengthOrArray: number | ArrayLike<number> | ArrayBuffer
    ): Uint16Array | Uint32Array {
        if (!defined(numberOfVertices)) {
            throw new Error("numberOfVertices is required.");
        }

        return numberOfVertices >= SIXTY_FOUR_KILOBYTES
            ? typeof indicesLengthOrArray === "number"
                ? new Uint32Array(indicesLengthOrArray)
                : new Uint32Array(indicesLengthOrArray)
            : typeof indicesLengthOrArray === "number"
            ? new Uint16Array(indicesLengthOrArray)
            : new Uint16Array(indicesLengthOrArray);
    }

    /**
     * Creates a typed array from a source array buffer.
     */
    static createTypedArrayFromArrayBuffer(
        numberOfVertices: number,
        sourceArray: ArrayBuffer,
        byteOffset: number,
        length?: number
    ): Uint16Array | Uint32Array {
        if (!defined(numberOfVertices)) {
            throw new Error("numberOfVertices is required.");
        }
        if (!defined(sourceArray)) {
            throw new Error("sourceArray is required.");
        }
        if (!defined(byteOffset)) {
            throw new Error("byteOffset is required.");
        }

        return numberOfVertices >= SIXTY_FOUR_KILOBYTES
            ? new Uint32Array(sourceArray, byteOffset, length)
            : new Uint16Array(sourceArray, byteOffset, length);
    }
}

export type TypedArray =
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Uint8ClampedArray
    | Float32Array
    | Float64Array;

export type BigTypedArray = TypedArray | BigInt64Array | BigUint64Array;

export type TypedArrayConstructor =
    | Int8ArrayConstructor
    | Uint8ArrayConstructor
    | Int16ArrayConstructor
    | Uint16ArrayConstructor
    | Int32ArrayConstructor
    | Uint32ArrayConstructor
    | Float32ArrayConstructor
    | Float64ArrayConstructor;

export type BigTypedArrayConstructor =
    | TypedArrayConstructor
    | BigInt64ArrayConstructor
    | BigUint64ArrayConstructor;

/** Any numeric array: typed array or `number[]` */
export type NumberArray = number[] | TypedArray;

export type NumericArray = number[] | TypedArray;

export interface ArrayType<T = unknown> {
    readonly length: number;
    [n: number]: T;
}

/** Any array: typed array or js array (`any[]`) */
export type AnyArray = any[] | TypedArray;
