import { BufferAttribute, Uint16BufferAttribute } from "three";
import { type QParams2d, type QParams3d } from "../common";
import { type Point3d } from "../core-geometry";
export declare function qparams2dToArray(params: QParams2d): Float32Array;
export declare function qorigin3dToArray(qorigin: Point3d): Float32Array;
export declare function qscale3dToArray(qscale: Point3d): Float32Array;
export declare function qparams3dToArray(params: QParams3d): {
    origin: Float32Array;
    scale: Float32Array;
};
export declare class QBufferHandle2d extends Uint16BufferAttribute {
    readonly params: Float32Array;
    constructor(qParams: QParams2d, data: Uint16Array);
    static create(qParams: QParams2d, data: Uint16Array): QBufferHandle2d | undefined;
}
export declare class QBufferHandle3d extends BufferAttribute {
    readonly origin: Float32Array;
    readonly scale: Float32Array;
    constructor(qParams: QParams3d, data: Uint16Array | Uint8Array | Float32Array);
    static create(qParams: QParams3d, data: Uint16Array | Uint8Array | Float32Array): QBufferHandle3d | undefined;
}
