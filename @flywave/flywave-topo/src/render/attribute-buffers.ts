/* Copyright (C) 2025 flywave.gl contributors */



import { BufferAttribute, Uint16BufferAttribute } from "three";

import { type QParams2d, type QParams3d } from "../common";
import { type Point3d } from "../core-geometry";

function setScale(index: number, value: number, array: Float32Array) {
    array[index] = value !== 0.0 ? 1.0 / value : value;
}

export function qparams2dToArray(params: QParams2d): Float32Array {
    const arr = new Float32Array(4);
    arr[0] = params.origin.x;
    arr[1] = params.origin.y;
    setScale(2, params.scale.x, arr);
    setScale(3, params.scale.y, arr);
    return arr;
}

export function qorigin3dToArray(qorigin: Point3d): Float32Array {
    const origin = new Float32Array(3);
    origin[0] = qorigin.x;
    origin[1] = qorigin.y;
    origin[2] = qorigin.z;
    return origin;
}

export function qscale3dToArray(qscale: Point3d): Float32Array {
    const scale = new Float32Array(3);
    setScale(0, qscale.x, scale);
    setScale(1, qscale.y, scale);
    setScale(2, qscale.z, scale);
    return scale;
}

export function qparams3dToArray(params: QParams3d): { origin: Float32Array; scale: Float32Array } {
    const origin = qorigin3dToArray(params.origin);
    const scale = qscale3dToArray(params.scale);
    return { origin, scale };
}

export class QBufferHandle2d extends Uint16BufferAttribute {
    public readonly params: Float32Array;

    public constructor(qParams: QParams2d, data: Uint16Array) {
        super(data, 2);
        this.params = qparams2dToArray(qParams);
    }

    public static create(qParams: QParams2d, data: Uint16Array): QBufferHandle2d | undefined {
        return new QBufferHandle2d(qParams, data);
    }
}

export class QBufferHandle3d extends BufferAttribute {
    public readonly origin: Float32Array;
    public readonly scale: Float32Array;

    public constructor(qParams: QParams3d, data: Uint16Array | Uint8Array | Float32Array) {
        super(data, 3);
        this.origin = qorigin3dToArray(qParams.origin);
        this.scale = qscale3dToArray(qParams.scale);
    }

    public static create(
        qParams: QParams3d,
        data: Uint16Array | Uint8Array | Float32Array
    ): QBufferHandle3d | undefined {
        return new QBufferHandle3d(qParams, data);
    }
}
