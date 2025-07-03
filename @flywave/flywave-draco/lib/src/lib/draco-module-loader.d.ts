export declare const DRACO_EXTERNAL_LIBRARIES: {
    DECODER: string;
    DECODER_WASM: string;
    FALLBACK_DECODER: string;
    ENCODER: string;
};
export declare const DRACO_EXTERNAL_LIBRARY_URLS: {
    [DRACO_EXTERNAL_LIBRARIES.DECODER]: string;
    [DRACO_EXTERNAL_LIBRARIES.DECODER_WASM]: string;
    [DRACO_EXTERNAL_LIBRARIES.FALLBACK_DECODER]: string;
    [DRACO_EXTERNAL_LIBRARIES.ENCODER]: string;
};
export declare function loadDracoDecoderModule(options: any): Promise<any>;
export declare function loadDracoEncoderModule(options: any): Promise<any>;
//# sourceMappingURL=draco-module-loader.d.ts.map