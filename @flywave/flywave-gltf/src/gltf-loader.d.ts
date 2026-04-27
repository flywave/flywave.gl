import type { ParseGLTFOptions } from "./gltf/parsers/parse-gltf";
import type { GLTFWithBuffers } from "./gltf/types/gltf-types";
/**
 * GLTF loader options
 */
export interface GLTFLoaderOptions {
    /** Base URI for resolving external resources */
    uri?: string;
    /** GLTF-specific parsing options */
    gltf?: ParseGLTFOptions;
    /** Draco decompression options */
    draco?: {
        /** Enable Draco decompression */
        decompress?: boolean;
        /** Draco decompression options */
        [key: string]: any;
    };
    /** Logging function */
    log?: Console;
    /** Additional options */
    [key: string]: any;
}
/**
 * GLTF loader
 */
export declare const GLTFLoader: {
    name: string;
    id: string;
    module: string;
    version: any;
    extensions: string[];
    mimeTypes: string[];
    text: boolean;
    binary: boolean;
    tests: string[];
    parse: typeof parse;
    options: {
        gltf: {
            normalize: boolean;
            loadBuffers: boolean;
            loadImages: boolean;
            decompressMeshes: boolean;
        };
        log: Console;
    };
};
export declare function parse(arrayBuffer: ArrayBuffer | string, options?: GLTFLoaderOptions, context?: any): Promise<GLTFWithBuffers>;
export declare function loadGLTF(url: string, loader: typeof GLTFLoader, options?: GLTFLoaderOptions, context?: any): Promise<GLTFWithBuffers>;
