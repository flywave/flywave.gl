import * as THREE from "three";
import { MeshGeometry } from "./mesh-geometry";
export declare class EdgeGeometry extends MeshGeometry {
    protected _endPointAndQuadIndices: Uint8Array;
    protected _indices: Uint8Array;
    isPlanar: boolean;
    constructor(options: {
        indices: Uint8Array;
        endPointAndQuadIndices: Uint8Array;
        positions?: Float32Array;
        normals?: Float32Array;
        uvs?: Float32Array;
        colors?: Float32Array;
        viewIndependentOrigin?: THREE.Vector3;
        edgeWidth?: number;
        edgeLineCode?: number;
        isPlanar?: boolean;
        hasBakedLighting?: boolean;
        hasScalarAnimation?: boolean;
        uniformColor?: THREE.Vector4;
        texture?: THREE.Texture;
        normalMap?: THREE.Texture;
    });
    static create(mesh: any, edges: any): EdgeGeometry | undefined;
    get asEdge(): this;
    get asSilhouette(): SilhouetteEdgeGeometry | undefined;
    createMesh(): THREE.Mesh;
    dispose(): void;
    get endPointAndQuadIndices(): Uint8Array;
}
export declare class SilhouetteEdgeGeometry extends EdgeGeometry {
    private _normalPairs;
    constructor(options: {
        indices: Uint8Array;
        endPointAndQuadIndices: Uint8Array;
        normalPairs: Uint8Array;
        positions?: Float32Array;
        normals?: Float32Array;
        uvs?: Float32Array;
        colors?: Float32Array;
        viewIndependentOrigin?: THREE.Vector3;
        edgeWidth?: number;
        edgeLineCode?: number;
        isPlanar?: boolean;
        hasBakedLighting?: boolean;
        hasScalarAnimation?: boolean;
        uniformColor?: THREE.Vector4;
        texture?: THREE.Texture;
        normalMap?: THREE.Texture;
    });
    static createSilhouettes(mesh: any, params: any): SilhouetteEdgeGeometry | undefined;
    createMesh(): THREE.Mesh;
    get asSilhouette(): this;
    dispose(): void;
    get normalPairs(): Uint8Array;
}
export declare class PolylineEdgeGeometry extends MeshGeometry {
    private readonly _buffers;
    isPlanar: boolean;
    constructor(options: {
        positions: Float32Array;
        indices: Uint32Array | Uint16Array;
        normals?: Float32Array;
        uvs?: Float32Array;
        colors?: Float32Array;
        viewIndependentOrigin?: THREE.Vector3;
        edgeWidth?: number;
        edgeLineCode?: number;
        isPlanar?: boolean;
        hasBakedLighting?: boolean;
        hasScalarAnimation?: boolean;
        uniformColor?: THREE.Vector4;
        texture?: THREE.Texture;
        normalMap?: THREE.Texture;
    });
    static create(mesh: any, polyline: any): PolylineEdgeGeometry | undefined;
    createMesh(): THREE.Object3D;
    get lutBuffers(): any;
    dispose(): void;
    get polylineBuffers(): any;
}
