"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRACO_EXTERNAL_LIBRARY_URLS = exports.DRACO_EXTERNAL_LIBRARIES = void 0;
exports.loadDracoDecoderModule = loadDracoDecoderModule;
exports.loadDracoEncoderModule = loadDracoEncoderModule;
const flywave_utils_1 = require("@flywave/flywave-utils");
const DRACO_DECODER_VERSION = "1.5.6";
const DRACO_ENCODER_VERSION = "1.4.1";
const STATIC_DECODER_URL = `https://www.gstatic.com/draco/versioned/decoders/${DRACO_DECODER_VERSION}`;
exports.DRACO_EXTERNAL_LIBRARIES = {
    DECODER: "draco_wasm_wrapper.js",
    DECODER_WASM: "draco_decoder.wasm",
    FALLBACK_DECODER: "draco_decoder.js",
    ENCODER: "draco_encoder.js"
};
exports.DRACO_EXTERNAL_LIBRARY_URLS = {
    [exports.DRACO_EXTERNAL_LIBRARIES.DECODER]: `${STATIC_DECODER_URL}/${exports.DRACO_EXTERNAL_LIBRARIES.DECODER}`,
    [exports.DRACO_EXTERNAL_LIBRARIES.DECODER_WASM]: `${STATIC_DECODER_URL}/${exports.DRACO_EXTERNAL_LIBRARIES.DECODER_WASM}`,
    [exports.DRACO_EXTERNAL_LIBRARIES.FALLBACK_DECODER]: `${STATIC_DECODER_URL}/${exports.DRACO_EXTERNAL_LIBRARIES.FALLBACK_DECODER}`,
    [exports.DRACO_EXTERNAL_LIBRARIES.ENCODER]: `https://raw.githubusercontent.com/google/draco/${DRACO_ENCODER_VERSION}/javascript/${exports.DRACO_EXTERNAL_LIBRARIES.ENCODER}`
};
let loadDecoderPromise;
let loadEncoderPromise;
async function loadDracoDecoderModule(options) {
    const modules = options.modules || {};
    if (modules.draco3d) {
        loadDecoderPromise || (loadDecoderPromise = modules.draco3d.createDecoderModule({}).then(draco => {
            return { draco };
        }));
    }
    else {
        loadDecoderPromise || (loadDecoderPromise = loadDracoDecoder(options));
    }
    return loadDecoderPromise;
}
async function loadDracoEncoderModule(options) {
    const modules = options.modules || {};
    if (modules.draco3d) {
        loadEncoderPromise || (loadEncoderPromise = modules.draco3d.createEncoderModule({}).then(draco => {
            return { draco };
        }));
    }
    else {
        loadEncoderPromise || (loadEncoderPromise = loadDracoEncoder(options));
    }
    return loadEncoderPromise;
}
async function loadDracoDecoder(options) {
    let DracoDecoderModule;
    let wasmBinary;
    switch (options.draco && options.draco.decoderType) {
        case "js":
            DracoDecoderModule = await (0, flywave_utils_1.loadLibrary)(exports.DRACO_EXTERNAL_LIBRARY_URLS[exports.DRACO_EXTERNAL_LIBRARIES.FALLBACK_DECODER], "draco", options, exports.DRACO_EXTERNAL_LIBRARIES.FALLBACK_DECODER);
            break;
        case "wasm":
        default:
            [DracoDecoderModule, wasmBinary] = await Promise.all([
                await (0, flywave_utils_1.loadLibrary)(exports.DRACO_EXTERNAL_LIBRARY_URLS[exports.DRACO_EXTERNAL_LIBRARIES.DECODER], "draco", options, exports.DRACO_EXTERNAL_LIBRARIES.DECODER),
                await (0, flywave_utils_1.loadLibrary)(exports.DRACO_EXTERNAL_LIBRARY_URLS[exports.DRACO_EXTERNAL_LIBRARIES.DECODER_WASM], "draco", options, exports.DRACO_EXTERNAL_LIBRARIES.DECODER_WASM)
            ]);
    }
    DracoDecoderModule = DracoDecoderModule || globalThis.DracoDecoderModule;
    return await initializeDracoDecoder(DracoDecoderModule, wasmBinary);
}
function initializeDracoDecoder(DracoDecoderModule, wasmBinary) {
    const options = {};
    if (wasmBinary) {
        options.wasmBinary = wasmBinary;
    }
    return new Promise(resolve => {
        DracoDecoderModule(Object.assign(Object.assign({}, options), { onModuleLoaded: draco => resolve({ draco }) }));
    });
}
async function loadDracoEncoder(options) {
    let DracoEncoderModule = await (0, flywave_utils_1.loadLibrary)(exports.DRACO_EXTERNAL_LIBRARY_URLS[exports.DRACO_EXTERNAL_LIBRARIES.ENCODER], "draco", options, exports.DRACO_EXTERNAL_LIBRARIES.ENCODER);
    DracoEncoderModule = DracoEncoderModule || globalThis.DracoEncoderModule;
    return await new Promise(resolve => {
        DracoEncoderModule({
            onModuleLoaded: draco => resolve({ draco })
        });
    });
}
//# sourceMappingURL=draco-module-loader.js.map