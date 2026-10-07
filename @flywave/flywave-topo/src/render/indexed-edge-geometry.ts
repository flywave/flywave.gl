/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import type { EdgeTable, IndexedEdgeParams } from "../common/render/primitives/edge-params";
import type { RenderPass, RenderTarget, ShaderParams } from "./mesh-geometry";
import { MeshGeometry } from "./mesh-geometry";

/** @see [[EdgeTable]]
 * @internal
 */
export class EdgeLUT {
    public readonly texture: THREE.DataTexture;
    public readonly numSegments: number;
    public readonly silhouettePadding: number;

    private constructor(
        texture: THREE.DataTexture,
        numSegments: number,
        silhouettePadding: number
    ) {
        this.texture = texture;
        this.numSegments = numSegments;
        this.silhouettePadding = silhouettePadding;
    }

    public dispose(): void {
        this.texture.dispose();
    }

    public static create(table: EdgeTable): EdgeLUT | undefined {
        const texture = new THREE.DataTexture(
            table.data,
            table.width,
            table.height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        return texture
            ? new EdgeLUT(texture, table.numSegments, table.silhouettePadding)
            : undefined;
    }
}

// Render order constants
enum RenderOrder {
    Edge = 2000,
    PlanarEdge = 2100
}

export class IndexedEdgeGeometry extends MeshGeometry {
    public readonly edgeLut: EdgeLUT;
    private readonly _indices: Uint8Array;

    // Add instance properties to satisfy the base class requirements
    public uniformColor: THREE.Vector4 | null = null;
    public texture: THREE.Texture | null = null;
    public normalMap: THREE.Texture | null = null;
    public vertexColors: boolean = false;

    constructor(options: { indices: Uint8Array; lut: EdgeTable }) {
        // Convert to the Float32Array position data the base class requires
        const floatIndices = new Float32Array(options.indices.length);
        for (let i = 0; i < options.indices.length; i++) {
            floatIndices[i] = options.indices[i];
        }

        super({
            positions: floatIndices,
            indices: undefined // indexed geometry does not use an index buffer
        });

        this._indices = options.indices;

        // Create the edge lookup table texture
        this.edgeLut = EdgeLUT.create(options.lut);

        // Set the geometry attributes
        const positionAttr = new THREE.BufferAttribute(this._indices, 3);
        positionAttr.normalized = true; // important: byte data must be normalized
        this.setAttribute("position", positionAttr);
    }

    /**
     * Creates an IndexedEdgeGeometry instance
     */
    public static create(params: IndexedEdgeParams): IndexedEdgeGeometry | undefined {
        // Parameter validation
        if (!params?.indices?.data || !params?.edges) {
            return undefined;
        }

        try {
            // Destructure the parameters for readability
            const { indices, edges } = params;

            return new IndexedEdgeGeometry({
                indices: indices.data,
                lut: edges
            });
        } catch (e) {
            return undefined;
        }
    }

    /**
     * Creates a Three.js mesh object
     * @param material Optional material; defaults to the basic wireframe material
     */
    createMesh(): THREE.LineSegments {
        // Convert the geometry attributes to the standard Three.js format
        const bufferGeometry = new THREE.BufferGeometry();

        // Copy the position attribute (the already existing position attribute)
        const posAttr = this.getAttribute("position");
        bufferGeometry.setAttribute("position", new THREE.BufferAttribute(posAttr.array, 3));

        // Fall back to the default material (yellow wireframe) when no material is provided
        const defaultMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            linewidth: 2
        });

        return new THREE.LineSegments(bufferGeometry, defaultMaterial);
    }

    /**
     * Computes the edge line width
     */
    protected computeEdgeWeight(params: ShaderParams): number {
        const baseWidth = this.edgeWidth;
        const pixelRatio = params.devicePixelRatio || window.devicePixelRatio || 1;
        return baseWidth * pixelRatio;
    }

    /**
     * Computes the edge line code
     */
    protected computeEdgeLineCode(params: ShaderParams): number {
        return this.edgeLineCode;
    }

    /**
     * Determines the render pass
     */
    protected determineRenderPass(target: RenderTarget): RenderPass {
        return "edge";
    }

    /**
     * Gets the render order
     */
    public get renderOrder(): number {
        return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    }

    /**
     * Releases resources
     */
    public override dispose(): void {
        super.dispose();
        this.edgeLut.dispose();
    }

    // Implement the abstract method required by the base class
    public get asIndexedEdge() {
        return this;
    }

    public wantMonochrome(target: RenderTarget): boolean {
        return target.currentViewFlags?.renderMode === 0; // assume 0 means wireframe mode
    }

    public getPass(target: RenderTarget): RenderPass {
        return this.determineRenderPass(target);
    }

    public getColor(target: RenderTarget): { isUniform: boolean; uniform: THREE.Color } {
        return {
            isUniform: true,
            uniform: new THREE.Color(0xffffff) // should actually be fetched from the LUT
        };
    }
}
