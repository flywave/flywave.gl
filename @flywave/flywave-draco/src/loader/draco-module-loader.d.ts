export declare const DRACO_EXTERNAL_LIBRARIES: {
    /** The primary Draco3D encoder, javascript wrapper part */
    DECODER: string;
    /** The primary draco decoder, compiled web assembly part */
    DECODER_WASM: string;
    /** Fallback decoder for non-webassebly environments. Very big bundle, lower performance */
    FALLBACK_DECODER: string;
    /** Draco encoder */
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
