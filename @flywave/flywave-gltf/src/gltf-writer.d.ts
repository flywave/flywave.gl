import { type GLTFWithBuffers } from "./gltf/types/gltf-types";
export interface GLTFWriterOptions {
    gltf?: {};
    byteOffset?: number;
}
/**
 * GLTF exporter
 */
export declare const GLTFWriter: {
    dataType: any;
    batchType: never;
    name: string;
    id: string;
    module: string;
    version: any;
    extensions: string[];
    mimeTypes: string[];
    binary: boolean;
    options: {
        gltf: {};
    };
    encode: (gltf: GLTFWithBuffers, options?: GLTFWriterOptions) => Promise<ArrayBuffer>;
    encodeSync: typeof encodeSync;
};
declare function encodeSync(gltf: GLTFWithBuffers, options?: GLTFWriterOptions): ArrayBuffer;
export {};
