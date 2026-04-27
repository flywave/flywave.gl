import type { ParseGLBOptions } from "./gltf/parsers/parse-glb";
import type { GLB } from "./gltf/types/glb-types";
/** GLB loader options */
export interface GLBLoaderOptions {
    headers?: Record<string, string>;
    /** GLB Parser Options */
    glb?: ParseGLBOptions;
    /** GLB specific: byteOffset to start parsing from */
    byteOffset?: number;
}
/**
 * GLB Loader -
 * GLB is the binary container format for GLTF
 */
export declare const GLBLoader: {
    readonly dataType: GLB;
    readonly batchType: never;
    readonly name: "GLB";
    readonly id: "glb";
    readonly module: "gltf";
    readonly version: any;
    readonly extensions: readonly ["glb"];
    readonly mimeTypes: readonly ["model/gltf-binary"];
    readonly binary: true;
    readonly parse: typeof parse;
    readonly parseSync: typeof parseSync;
    readonly options: {
        readonly glb: {
            readonly strict: false;
        };
    };
};
declare function parse(arrayBuffer: ArrayBuffer, options?: GLBLoaderOptions, context?: any): Promise<GLB>;
declare function parseSync(arrayBuffer: ArrayBuffer, options?: GLBLoaderOptions): GLB;
export declare function loadGLB(url: string, loader?: typeof GLBLoader, options?: GLBLoaderOptions, context?: any): Promise<GLB>;
export {};
