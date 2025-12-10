/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { MeshGeometry } from "./mesh-geometry";

// 基础线段几何体
export class EdgeGeometry extends MeshGeometry {
    protected _endPointAndQuadIndices: Uint8Array;
    protected _indices: Uint8Array;
    public isPlanar: boolean;

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
    }) {
        // 转换Uint8Array为Float32Array用于位置数据
        const floatIndices = new Float32Array(options.indices.length);
        for (let i = 0; i < options.indices.length; i++) {
            floatIndices[i] = options.indices[i];
        }

        super({
            positions: floatIndices,
            indices: undefined, // 边几何体不使用索引
            normals: options.normals,
            uvs: options.uvs,
            colors: options.colors,
            viewIndependentOrigin: options.viewIndependentOrigin,
            edgeWidth: options.edgeWidth,
            edgeLineCode: options.edgeLineCode,
            isPlanar: options.isPlanar,
            hasBakedLighting: options.hasBakedLighting,
            hasScalarAnimation: options.hasScalarAnimation,
            uniformColor: options.uniformColor,
            texture: options.texture,
            normalMap: options.normalMap
        });

        this._indices = options.indices;
        this._endPointAndQuadIndices = options.endPointAndQuadIndices;
        this.isPlanar = options.isPlanar ?? false;

        // 设置端点和四边形索引属性 (4个无符号字节)
        const epqAttr = new THREE.Uint8BufferAttribute(options.endPointAndQuadIndices, 4);
        epqAttr.normalized = false;
        this.setAttribute("a_endPointAndQuadIndices", epqAttr);
    }

    static create(mesh: any, edges: any): EdgeGeometry | undefined {
        const indices = new Uint8Array(edges.indices.data);
        const endPointAndQuadIndices = new Uint8Array(edges.endPointAndQuadIndices);

        return new EdgeGeometry({
            indices,
            endPointAndQuadIndices,
            uniformColor: mesh.uniformColor,
            texture: mesh.texture,
            normalMap: mesh.normalMap,
            edgeWidth: mesh.edgeWidth,
            edgeLineCode: mesh.edgeLineCode,
            isPlanar: mesh.isPlanar,
            hasBakedLighting: mesh.hasBakedLighting,
            hasScalarAnimation: mesh.hasScalarAnimation
        });
    }

    public get asEdge() {
        return this;
    }

    public get asSilhouette(): SilhouetteEdgeGeometry | undefined {
        return undefined;
    }

    createMesh(): THREE.Mesh {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: !!this.attributes.color // 自动判断是否使用顶点色
        });
        return new THREE.Mesh(this, material);
    }

    public override dispose() {
        super.dispose();
        // 清除特定资源
        this._indices = new Uint8Array(0);
        this._endPointAndQuadIndices = new Uint8Array(0);
    }

    public get endPointAndQuadIndices(): Uint8Array {
        return this._endPointAndQuadIndices;
    }
}

// 轮廓边几何体
export class SilhouetteEdgeGeometry extends EdgeGeometry {
    private _normalPairs: Uint8Array;

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
    }) {
        super(options);
        this._normalPairs = options.normalPairs;

        // 设置法线对属性 (4个无符号字节)
        const normalAttr = new THREE.Uint8BufferAttribute(options.normalPairs, 4);
        normalAttr.normalized = false;
        this.setAttribute("a_normals", normalAttr);
    }

    static createSilhouettes(mesh: any, params: any): SilhouetteEdgeGeometry | undefined {
        const indices = new Uint8Array(params.indices.data);
        const endPointAndQuadIndices = new Uint8Array(params.endPointAndQuadIndices);
        const normalPairs = new Uint8Array(params.normalPairs);

        return new SilhouetteEdgeGeometry({
            indices,
            endPointAndQuadIndices,
            normalPairs,
            uniformColor: mesh.uniformColor,
            texture: mesh.texture,
            normalMap: mesh.normalMap,
            edgeWidth: mesh.edgeWidth,
            edgeLineCode: mesh.edgeLineCode,
            isPlanar: mesh.isPlanar,
            hasBakedLighting: mesh.hasBakedLighting,
            hasScalarAnimation: mesh.hasScalarAnimation
        });
    }

    // 改为实例方法，内部创建材质
    createMesh(): THREE.Mesh {
        const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide // 轮廓边需要双面材质
        });
        return new THREE.Mesh(this, material);
    }

    public override get asSilhouette() {
        return this;
    }

    public override dispose() {
        super.dispose();
        this._normalPairs = new Uint8Array(0);
    }

    public get normalPairs(): Uint8Array {
        return this._normalPairs;
    }
}

// 折线几何体
export class PolylineEdgeGeometry extends MeshGeometry {
    private readonly _buffers: any;
    public isPlanar: boolean;

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
    }) {
        super(options);
        this._buffers = {
            vertices: options.positions,
            indices: options.indices
        };
        this.isPlanar = options.isPlanar ?? false;
    }

    static create(mesh: any, polyline: any): PolylineEdgeGeometry | undefined {
        const positions = new Float32Array(polyline.vertices);
        const indices = new Uint32Array(polyline.indices);

        return new PolylineEdgeGeometry({
            positions,
            indices,
            uniformColor: mesh.uniformColor,
            texture: mesh.texture,
            normalMap: mesh.normalMap,
            edgeWidth: mesh.edgeWidth,
            edgeLineCode: mesh.edgeLineCode,
            isPlanar: mesh.isPlanar,
            hasBakedLighting: mesh.hasBakedLighting,
            hasScalarAnimation: mesh.hasScalarAnimation
        });
    }

    // 改为实例方法，内部创建材质
    createMesh(): THREE.Object3D {
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: this.edgeWidth || 1 // 使用几何体自带的线宽属性
        });
        return new THREE.LineSegments(this, material);
    }

    public get lutBuffers() {
        return this._buffers;
    }

    public override dispose() {
        super.dispose();
        this._buffers.vertices = new Float32Array(0);
        this._buffers.indices = new Uint32Array(0);
    }

    public get polylineBuffers(): any {
        return this._buffers;
    }
}
