import { loadDracoDecoderModule } from "./lib/draco-module-loader";
import type { DracoParseOptions } from "./lib/draco-parser";
import DracoParser from "./lib/draco-parser";
import type { DracoMesh } from "./lib/draco-types";
import { VERSION } from "./lib/utils/version";

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

async function parse(
    arrayBuffer: ArrayBuffer,
    options?: DracoLoaderOptions,
    context?: any
): Promise<DracoMesh> {
    const { draco } = await loadDracoDecoderModule(options);
    const dracoParser = new DracoParser(draco);
    try {
        return dracoParser.parseSync(arrayBuffer, options?.draco);
    } finally {
        dracoParser.destroy();
    }
}

export async function loadDraco(
    url: string,
    loader: typeof DracoLoader,
    options?: DracoLoaderOptions,
    context?: any
): Promise<DracoMesh> {
    const fetchFn = context?.fetch || globalThis.fetch;

    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }

    try {
        // 1. 获取子树文件
        const response = await fetchFn(url, {
            headers: options.headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }

        // 2. 读取二进制数据
        const arrayBuffer = await response.arrayBuffer();

        // 3. 使用加载器解析数据
        return await loader.parse(arrayBuffer, options, context);
    } catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
