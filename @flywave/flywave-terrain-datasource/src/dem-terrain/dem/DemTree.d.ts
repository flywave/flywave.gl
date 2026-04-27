import { type Vector3Like, type Vector3Tuple } from "three";
import type DEMData from "./DemData";
type vec3Like = Vector3Like | Vector3Tuple;
export default class DemMinMaxQuadTree {
    _maximums: Float32Array;
    _minimums: Float32Array;
    _leaves: Uint8Array;
    _childOffsets: Int32Array;
    private _nodeCount;
    private _capacity;
    dem: DEMData;
    get leaves(): Uint8Array<ArrayBufferLike>;
    get childOffsets(): Int32Array<ArrayBufferLike>;
    get minimums(): Float32Array<ArrayBufferLike>;
    get maximums(): Float32Array<ArrayBufferLike>;
    constructor(dem: DEMData, data?: {
        childOffsets: Int32Array;
        leaves: Uint8Array;
        maximums: Float32Array;
        minimums: Float32Array;
    });
    raycastRoot(minx: number, miny: number, maxx: number, maxy: number, p: vec3Like, d: vec3Like, exaggeration?: number): number | null;
    raycast(rootMinx: number, rootMiny: number, rootMaxx: number, rootMaxy: number, p: vec3Like, d: vec3Like, exaggeration?: number): number | null;
    private _addNode;
    private _resizeArrays;
    private _construct;
}
export {};
