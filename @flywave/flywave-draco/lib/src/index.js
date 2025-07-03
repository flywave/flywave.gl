"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DracoLoader = exports.DracoWorkerLoader = exports.DracoWriter = exports.DracoWriterWorker = exports.DRACO_EXTERNAL_LIBRARY_URLS = exports.DRACO_EXTERNAL_LIBRARIES = void 0;
var draco_module_loader_1 = require("./lib/draco-module-loader");
Object.defineProperty(exports, "DRACO_EXTERNAL_LIBRARIES", { enumerable: true, get: function () { return draco_module_loader_1.DRACO_EXTERNAL_LIBRARIES; } });
Object.defineProperty(exports, "DRACO_EXTERNAL_LIBRARY_URLS", { enumerable: true, get: function () { return draco_module_loader_1.DRACO_EXTERNAL_LIBRARY_URLS; } });
var draco_writer_1 = require("./draco-writer");
Object.defineProperty(exports, "DracoWriterWorker", { enumerable: true, get: function () { return draco_writer_1.DracoWriterWorker; } });
Object.defineProperty(exports, "DracoWriter", { enumerable: true, get: function () { return draco_writer_1.DracoWriter; } });
var draco_loader_1 = require("./draco-loader");
Object.defineProperty(exports, "DracoWorkerLoader", { enumerable: true, get: function () { return draco_loader_1.DracoWorkerLoader; } });
Object.defineProperty(exports, "DracoLoader", { enumerable: true, get: function () { return draco_loader_1.DracoLoader; } });
//# sourceMappingURL=index.js.map