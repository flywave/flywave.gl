/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import { type PointStringParams } from "../common/render/primitives/point-string-params";
import { type Point3d, Range3d } from "../core-geometry";
import type { RenderPass, RenderTarget } from "./mesh-geometry";
import { type RenderGeometry } from "./render-geometry";

// Render order constants
enum RenderOrder {
    PlanarLinear = 3000
}

export class PointStringGeometry extends THREE.BufferGeometry implements RenderGeometry {
    public readonly weight: number;
    public readonly isInstanceable: boolean;
    private readonly _numPoints: number;
    public readonly viewIndependentOrigin?: THREE.Vector3;
    public readonly uniformColor?: THREE.Vector4;
    public readonly vertexColors: boolean = false;
    public readonly renderGeometryType = "point-string" as const;
    isDisposed: boolean;

    constructor(options: {
        positions: Float32Array;
        weight: number;
        viewIndependentOrigin?: THREE.Vector3;
        uniformColor?: THREE.Vector4;
        vertexColors?: boolean;
        colors?: Float32Array;
    }) {
        super();

        // Initialize the buffer attributes
        this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));

        // Keep the original attribute initialization
        this.weight = options.weight;
        this.isInstanceable = !options.viewIndependentOrigin;
        this._numPoints = options.positions.length / 3;
        this.viewIndependentOrigin = options.viewIndependentOrigin;
        this.uniformColor = options.uniformColor?.clone();
        this.vertexColors = options.vertexColors || false;

        // Handle vertex colors
        if (options.colors) {
            this.setAttribute("color", new THREE.BufferAttribute(options.colors, 3));
            this.vertexColors = true;
        }
    }

    computeRange(out?: Range3d): Range3d {
        const range = out || new Range3d();
        const positions = this.attributes.position.array as Float32Array;

        for (let i = 0; i < positions.length; i += 3) {
            range.extendXYZ(positions[i], positions[i + 1], positions[i + 2]);
        }
        return range;
    }

    public static create(
        params: PointStringParams,
        viOrigin?: Point3d
    ): PointStringGeometry | undefined {
        try {
            // Convert the point data to a Float32Array
            const positions = new Float32Array(params.indices.length * 3);
            for (let i = 0; i < params.indices.length; i++) {
                const index = params.indices.data[i];
                positions[i * 3] = index[0];
                positions[i * 3 + 1] = index[1];
                positions[i * 3 + 2] = index[2];
            }

            // Convert the view-independent origin
            const viewIndependentOrigin = viOrigin
                ? new THREE.Vector3(viOrigin.x, viOrigin.y, viOrigin.z)
                : undefined;

            return new PointStringGeometry({
                positions,
                weight: params.weight,
                viewIndependentOrigin
            });
        } catch (e) {
            return undefined;
        }
    }

    /**
     * Determines the render pass
     */
    protected determineRenderPass(target: RenderTarget): RenderPass {
        // Point geometry is normally rendered as opaque
        return "opaque";
    }

    /**
     * Gets the render order
     */
    public get renderOrder(): number {
        return RenderOrder.PlanarLinear;
    }

    /**
     * Collects memory statistics
     */
    public collectStatistics(): { vertices: number } {
        return {
            vertices: this._numPoints
        };
    }

    // Implement the abstract method required by the base class
    public get asPointString() {
        return this;
    }

    public getPass(target: RenderTarget): RenderPass {
        return this.determineRenderPass(target);
    }

    public wantMonochrome(target: RenderTarget): boolean {
        return false; // point strings usually don't need monochrome handling
    }
}
