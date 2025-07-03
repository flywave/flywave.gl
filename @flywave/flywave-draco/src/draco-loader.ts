import { loadDracoDecoderModule } from "./lib/draco-module-loader";
import type { DracoParseOptions } from "./lib/draco-parser";
import DracoParser from "./lib/draco-parser";
import type { DracoMesh } from "./lib/draco-types";
import { VERSION } from "./lib/utils/version";

export interface DracoLoaderOptions {
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
export const DracoWorkerLoader = {
    dataType: null as unknown as DracoMesh,
    batchType: null as never,
    name: "Draco",
    id: "draco",
    module: "draco",
    // shapes: ['mesh'],
    version: VERSION,
    worker: true,
    extensions: ["drc"],
    mimeTypes: ["application/octet-stream"],
    binary: true,
    tests: ["DRACO"],
    options: {
        draco: {
            decoderType: typeof WebAssembly === "object" ? "wasm" : "js", // 'js' for IE11
            libraryPath: "libs/",
            extraAttributes: {},
            attributeNameEntry: undefined
        }
    }
} as const;

/**
 * Loader for Draco3D compressed geometries
 */
export const DracoLoader = {
    ...DracoWorkerLoader,
    parse
} as const;

async function parse(arrayBuffer: ArrayBuffer, options?: DracoLoaderOptions): Promise<DracoMesh> {
    const { draco } = await loadDracoDecoderModule(options);
    const dracoParser = new DracoParser(draco);
    try {
        return dracoParser.parseSync(arrayBuffer, options?.draco);
    } finally {
        dracoParser.destroy();
    }
}
