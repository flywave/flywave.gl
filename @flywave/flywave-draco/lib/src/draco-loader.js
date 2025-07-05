"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DracoLoader = exports.DracoWorkerLoader = void 0;
exports.loadDraco = loadDraco;
const draco_module_loader_1 = require("./lib/draco-module-loader");
const draco_parser_1 = __importDefault(require("./lib/draco-parser"));
const version_1 = require("./lib/utils/version");
exports.DracoWorkerLoader = {
    dataType: null,
    batchType: null,
    name: "Draco",
    id: "draco",
    module: "draco",
    version: version_1.VERSION,
    worker: true,
    extensions: ["drc"],
    mimeTypes: ["application/octet-stream"],
    binary: true,
    tests: ["DRACO"],
    options: {
        draco: {
            decoderType: typeof WebAssembly === "object" ? "wasm" : "js",
            libraryPath: "libs/",
            extraAttributes: {},
            attributeNameEntry: undefined
        }
    }
};
exports.DracoLoader = Object.assign(Object.assign({}, exports.DracoWorkerLoader), { parse });
async function parse(arrayBuffer, options, context) {
    const { draco } = await (0, draco_module_loader_1.loadDracoDecoderModule)(options);
    const dracoParser = new draco_parser_1.default(draco);
    try {
        return dracoParser.parseSync(arrayBuffer, options === null || options === void 0 ? void 0 : options.draco);
    }
    finally {
        dracoParser.destroy();
    }
}
async function loadDraco(url, loader, options, context) {
    const fetchFn = (context === null || context === void 0 ? void 0 : context.fetch) || globalThis.fetch;
    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }
    try {
        const response = await fetchFn(url, {
            headers: options.headers
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return await loader.parse(arrayBuffer, options, context);
    }
    catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
//# sourceMappingURL=draco-loader.js.map