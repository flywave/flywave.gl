import type { GLB } from "../types/glb-types";
/** Options for parsing a GLB */
export interface ParseGLBOptions {
    /** @deprecated This option was used by XVIZ protocol to define a non-standard magic number */
    magic?: number;
    /** @deprecated This option was used by XVIZ protocol to embed non-standard chunks */
    strict?: boolean;
}
/** Check if the contents of an array buffer contains GLB byte markers */
export declare function isGLB(arrayBuffer: ArrayBuffer, byteOffset?: number, options?: ParseGLBOptions): boolean;
/**
 * Synchronously parse a GLB
 * @param glb - Target, Output is stored there
 * @param arrayBuffer - Input data
 * @param byteOffset - Offset into arrayBuffer to start parsing from (for "embedded" GLBs, e.g. in 3D tiles)
 * @param options
 * @returns
 */
export declare function parseGLBSync(glb: GLB, arrayBuffer: ArrayBuffer, byteOffset?: number, options?: ParseGLBOptions): number;
