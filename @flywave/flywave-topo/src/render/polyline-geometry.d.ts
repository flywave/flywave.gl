import * as THREE from "three";
import { type PolylineParams } from "../common/render/primitives/polyline-params";
import type { Point3d, Range3d } from "../core-geometry";
import { type RenderGeometry } from "./render-geometry";
export declare enum PolylineTypeFlags {
    Normal = 0,
    Edge = 1,
    Outline = 2
}
export declare class PolylineGeometry extends THREE.BufferGeometry implements RenderGeometry {
    readonly isPlanar: boolean;
    readonly uniformColor?: THREE.Vector4;
    readonly vertexColors: boolean;
    readonly colorInfo?: {
        hasTranslucency: boolean;
    };
    readonly lineWeight: number;
    readonly lineCode: number;
    readonly ptype: PolylineTypeFlags;
    readonly isInstanceable: boolean;
    readonly renderGeometryType: "polyline";
    isDisposed: boolean;
    constructor(options: {
        positions: Float32Array;
        indices?: Uint16Array | Uint32Array;
        lineWeight: number;
        lineCode: number;
        type: PolylineTypeFlags;
        isPlanar?: boolean;
        viewIndependentOrigin?: THREE.Vector3;
        uniformColor?: THREE.Vector4;
        vertexColors?: boolean;
        colors?: Float32Array;
    });
    computeRange(out?: Range3d): Range3d;
    static create(params: PolylineParams, viOrigin?: Point3d): PolylineGeometry | undefined;
    private static lineCodeFromPixels;
    get asPolyline(): this;
    get asMesh(): any;
}
