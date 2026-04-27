import type { GLBEncodeOptions } from "./gltf/encoders/encode-glb";
export interface GLBWriterOptions {
    glb?: GLBEncodeOptions;
}
/**
 * GLB exporter
 * GLB is the binary container format for GLTF
 */
export declare const GLBWriter: {
    readonly name: "GLB";
    readonly id: "glb";
    readonly module: "gltf";
    readonly version: any;
    readonly extensions: readonly ["glb"];
    readonly mimeTypes: readonly ["model/gltf-binary"];
    readonly binary: true;
    readonly options: {
        readonly glb: {};
    };
    readonly encode: (glb: any, options?: GLBWriterOptions) => Promise<ArrayBuffer>;
    readonly encodeSync: typeof encodeSync;
};
declare function encodeSync(glb: any, options: any): ArrayBuffer;
export {};
