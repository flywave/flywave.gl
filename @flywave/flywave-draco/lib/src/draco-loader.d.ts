import type { DracoParseOptions } from "./lib/draco-parser";
import type { DracoMesh } from "./lib/draco-types";
export interface DracoLoaderOptions {
    headers?: Record<string, string>;
    draco?: DracoParseOptions & {
        decoderType?: "wasm" | "js";
        libraryPath?: string;
        workerUrl?: string;
    };
}
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
            readonly decoderType: "js" | "wasm";
            readonly libraryPath: "libs/";
            readonly extraAttributes: {};
            readonly attributeNameEntry: any;
        };
    };
};
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
            readonly decoderType: "js" | "wasm";
            readonly libraryPath: "libs/";
            readonly extraAttributes: {};
            readonly attributeNameEntry: any;
        };
    };
};
declare function parse(arrayBuffer: ArrayBuffer, options?: DracoLoaderOptions, context?: any): Promise<DracoMesh>;
export declare function loadDraco(url: string, loader: typeof DracoLoader, options?: DracoLoaderOptions, context?: any): Promise<DracoMesh>;
export {};
//# sourceMappingURL=draco-loader.d.ts.map