/* Copyright (C) 2025 flywave.gl contributors */
import { loadDracoDecoderModule } from "./loader/draco-module-loader";
import DracoParser from "./loader/draco-parser";
import { VERSION } from "./loader/utils/version";
/**
 * Worker loader for Draco3D compressed geometries
 */
export const DracoWorkerLoader = {
    dataType: null,
    batchType: null,
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
};
/**
 * Loader for Draco3D compressed geometries
 */
export const DracoLoader = {
    ...DracoWorkerLoader,
    parse
};
async function parse(arrayBuffer, options, context) {
    const { draco } = await loadDracoDecoderModule(options);
    const dracoParser = new DracoParser(draco);
    try {
        return dracoParser.parseSync(arrayBuffer, options?.draco);
    }
    finally {
        dracoParser.destroy();
    }
}
export async function loadDraco(url, loader, options, context) {
    const fetchFn = context?.fetch || globalThis.fetch;
    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }
    try {
        // 1. Get subtree file
        const response = await fetchFn(url, {
            headers: options.headers
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }
        // 2. Read binary data
        const arrayBuffer = await response.arrayBuffer();
        // 3. Parse data using loader
        return await loader.parse(arrayBuffer, options, context);
    }
    catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
//# sourceMappingURL=draco-loader.js.map