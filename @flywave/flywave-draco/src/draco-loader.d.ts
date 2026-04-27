import type { DracoParseOptions } from "./loader/draco-parser";
import type { DracoMesh } from "./loader/draco-types";
export interface DracoLoaderOptions {
    headers?: Record<string, string>;
    draco?: DracoParseOptions & {
        /** @deprecated WASM decoding is faster but JS is more backwards compatible */
        decoderType?: "wasm" | "js";
        /** @deprecated Specify where to load the Draco decoder library */
        libraryPath?: string;
        /** Override the URL to the worker bundle (by default loads from unpkg.com) */
        workerUrl?: string;
    };
}
/**
 * Worker loader for Draco3D compressed geometries
 */
export declare const DracoWorkerLoader: {
    readonly dataType: DracoMesh;
    readonly batchType: never;
    readonly name: "Draco";
    readonly id: "draco";
    readonly module: "draco";
    readonly version: any;
    readonly worker: true;
    readonly extensions: readonly ["drc"];
    readonly mimeTypes: readonly ["application/octet-stream"];
    readonly binary: true;
    readonly tests: readonly ["DRACO"];
    readonly options: {
        readonly draco: {
            readonly decoderType: "wasm" | "js";
            readonly libraryPath: "libs/";
            readonly extraAttributes: {};
            readonly attributeNameEntry: any;
        };
    };
};
/**
 * Loader for Draco3D compressed geometries
 */
export declare const DracoLoader: {
    readonly parse: typeof parse;
    readonly dataType: DracoMesh;
    readonly batchType: never;
    readonly name: "Draco";
    readonly id: "draco";
    readonly module: "draco";
    readonly version: any;
    readonly worker: true;
    readonly extensions: readonly ["drc"];
    readonly mimeTypes: readonly ["application/octet-stream"];
    readonly binary: true;
    readonly tests: readonly ["DRACO"];
    readonly options: {
        readonly draco: {
            readonly decoderType: "wasm" | "js";
            readonly libraryPath: "libs/";
            readonly extraAttributes: {};
            readonly attributeNameEntry: any;
        };
    };
};
declare function parse(arrayBuffer: ArrayBuffer, options?: DracoLoaderOptions, context?: any): Promise<DracoMesh>;
export declare function loadDraco(url: string, loader: typeof DracoLoader, options?: DracoLoaderOptions, context?: any): Promise<DracoMesh>;
export {};
