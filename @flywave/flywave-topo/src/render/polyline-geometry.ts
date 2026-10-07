/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import { type PolylineParams } from "../common/render/primitives/polyline-params";
import type { Point3d, Range3d } from "../core-geometry";
import { type RenderGeometry } from "./render-geometry";

// Polyline type flags
export enum PolylineTypeFlags {
    Normal = 0,
    Edge = 1,
    Outline = 2
}

export class PolylineGeometry extends THREE.BufferGeometry implements RenderGeometry {
    // Newly added interface properties that must be implemented
    public readonly isPlanar: boolean;
    public readonly uniformColor?: THREE.Vector4;
    public readonly vertexColors: boolean;
    public readonly colorInfo?: { hasTranslucency: boolean };

    // Original properties kept as-is
    public readonly lineWeight: number;
    public readonly lineCode: number;
    public readonly ptype: PolylineTypeFlags;
    public readonly isInstanceable: boolean;
    public readonly renderGeometryType = "polyline" as const;
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
    }) {
        super();

        // Create the geometry attributes manually
        this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));
        if (options.indices) {
            this.setIndex(new THREE.BufferAttribute(options.indices, 1));
        }

        // Initialize the newly added attributes
        this.isPlanar = options.isPlanar ?? false;
        this.uniformColor = options.uniformColor;
        this.vertexColors = options.vertexColors ?? false;

        // Original assignments kept as-is
        this.lineWeight = options.lineWeight;
        this.lineCode = options.lineCode;
        this.ptype = options.type;
        this.isInstanceable = !options.viewIndependentOrigin;
    }

    computeRange(out?: Range3d): Range3d {
        throw new Error("Method not implemented.");
    }

    public static create(params: PolylineParams, viOrigin?: Point3d): PolylineGeometry | undefined {
        try {
            // Convert the vertex data to a Float32Array
            const positions = new Float32Array(params.vertices.data);

            // Convert the index data
            let indices: Uint16Array | Uint32Array | undefined;
            if (params.polyline.indices) {
                const indexData = params.polyline.indices.data;
                if (indexData.length < 65535) {
                    indices = new Uint16Array(indexData);
                } else {
                    indices = new Uint32Array(indexData);
                }
            }

            // Convert the view-independent origin
            const viewIndependentOrigin = viOrigin
                ? new THREE.Vector3(viOrigin.x, viOrigin.y, viOrigin.z)
                : undefined;

            return new PolylineGeometry({
                positions,
                indices,
                lineWeight: params.weight,
                lineCode: this.lineCodeFromPixels(params.linePixels),
                type: params.type,
                isPlanar: params.isPlanar,
                viewIndependentOrigin
            });
        } catch (e) {
            return undefined;
        }
    }

    private static lineCodeFromPixels(pixels: number): number {
        // Simplified implementation: the line style code should be derived from the pixel value
        return pixels > 1 ? 1 : 0;
    }

    // Implement the abstract method required by the base class
    public get asPolyline() {
        return this;
    }

    public get asMesh() {
        return undefined; // polyline geometry does not provide a mesh form
    }
}
