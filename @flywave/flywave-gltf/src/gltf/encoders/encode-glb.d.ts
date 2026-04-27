export interface GLBEncodeOptions {
}
/**
 * Encode the full GLB buffer with header etc
 *
 * @param glb
 * @param dataView - if `null`, does not encode but just calculates length
 * @param byteOffset
 * @param options
 * @returns
 *
 * @see https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#glb-file-format-specification
 * @todo type GLB argument
 */
export declare function encodeGLBSync(glb: any, dataView: DataView | null, byteOffset?: number, options?: GLBEncodeOptions): number;
