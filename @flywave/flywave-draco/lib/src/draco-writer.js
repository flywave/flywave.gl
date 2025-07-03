"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DracoWriter = exports.DracoWriterWorker = void 0;
const draco_builder_1 = __importDefault(require("./lib/draco-builder"));
const draco_module_loader_1 = require("./lib/draco-module-loader");
const version_1 = require("./lib/utils/version");
const DEFAULT_DRACO_WRITER_OPTIONS = {
    pointcloud: false,
    attributeNameEntry: "name"
};
exports.DracoWriterWorker = {
    id: "draco-writer",
    name: "Draco compressed geometry writer",
    module: "draco",
    version: version_1.VERSION,
    worker: true,
    options: {
        draco: {},
        source: null
    }
};
exports.DracoWriter = {
    name: "DRACO",
    id: "draco",
    module: "draco",
    version: version_1.VERSION,
    extensions: ["drc"],
    mimeTypes: ["application/octet-stream"],
    options: {
        draco: DEFAULT_DRACO_WRITER_OPTIONS
    },
    encode
};
async function encode(data, options = {}) {
    const { draco } = await (0, draco_module_loader_1.loadDracoEncoderModule)(options);
    const dracoBuilder = new draco_builder_1.default(draco);
    try {
        return dracoBuilder.encodeSync(data, options.draco);
    }
    finally {
        dracoBuilder.destroy();
    }
}
//# sourceMappingURL=draco-writer.js.map