import { type DecodeOptions, type DecodeResult } from "./types";
/**
 * Decoding steps enumeration for progressive loading
 */
export declare const DECODING_STEPS: {
    header: number;
    vertices: number;
    triangleIndices: number;
    edgeIndices: number;
    extensions: number;
};
/**
 * Main decoding function for stratum mesh data
 * @param data - Input ArrayBuffer containing mesh data
 * @param userOptions - Decoding options
 * @returns Decoded mesh data structure
 */
export declare function decode(data: ArrayBuffer, userOptions?: Partial<DecodeOptions>): DecodeResult;
