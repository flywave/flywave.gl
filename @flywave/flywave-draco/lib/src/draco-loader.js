"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DracoLoader = exports.DracoWorkerLoader = void 0;
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
async function parse(arrayBuffer, options) {
    const { draco } = await (0, draco_module_loader_1.loadDracoDecoderModule)(options);
    const dracoParser = new draco_parser_1.default(draco);
    try {
        return dracoParser.parseSync(arrayBuffer, options === null || options === void 0 ? void 0 : options.draco);
    }
    finally {
        dracoParser.destroy();
    }
}
//# sourceMappingURL=draco-loader.js.map