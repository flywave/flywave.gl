/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

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

// 渲染顺序常量
enum RenderOrder {
    Edge = 2000,
    PlanarEdge = 2100
}

export class IndexedEdgeGeometry extends MeshGeometry {
    public readonly edgeLut: EdgeLUT;
    private readonly _indices: Uint8Array;

    // 添加实例属性以符合基类要求
    public uniformColor: THREE.Vector4 | null = null;
    public texture: THREE.Texture | null = null;
    public normalMap: THREE.Texture | null = null;
    public vertexColors: boolean = false;

    constructor(options: { indices: Uint8Array; lut: EdgeTable }) {
        // 转换为基类需要的 Float32Array 位置数据
        const floatIndices = new Float32Array(options.indices.length);
        for (let i = 0; i < options.indices.length; i++) {
            floatIndices[i] = options.indices[i];
        }

        super({
            positions: floatIndices,
            indices: undefined // 索引几何体不使用索引缓冲区
        });

        this._indices = options.indices;

        // 创建边缘查找表纹理
        this.edgeLut = EdgeLUT.create(options.lut);

        // 设置几何体属性
        const positionAttr = new THREE.BufferAttribute(this._indices, 3);
        positionAttr.normalized = true; // 重要：需要归一化字节数据
        this.setAttribute("position", positionAttr);
    }

    /**
     * 创建 IndexedEdgeGeometry 实例
     */
    public static create(params: IndexedEdgeParams): IndexedEdgeGeometry | undefined {
        // 添加参数校验
        if (!params?.indices?.data || !params?.edges) {
            return undefined;
        }

        try {
            // 解构参数提升可读性
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
     * 创建Three.js网格对象
     * @param material 可选材质，默认使用基础线框材质
     */
    createMesh(): THREE.LineSegments {
        // 转换几何体属性为Three.js标准格式
        const bufferGeometry = new THREE.BufferGeometry();

        // 复制位置属性（已存在的position属性）
        const posAttr = this.getAttribute("position");
        bufferGeometry.setAttribute("position", new THREE.BufferAttribute(posAttr.array, 3));

        // 使用默认材质（黄色线框）如果未提供材质
        const defaultMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            linewidth: 2
        });

        return new THREE.LineSegments(bufferGeometry, defaultMaterial);
    }

    /**
     * 计算边缘线宽
     */
    protected computeEdgeWeight(params: ShaderParams): number {
        const baseWidth = this.edgeWidth;
        const pixelRatio = params.devicePixelRatio || window.devicePixelRatio || 1;
        return baseWidth * pixelRatio;
    }

    /**
     * 计算边缘线代码
     */
    protected computeEdgeLineCode(params: ShaderParams): number {
        return this.edgeLineCode;
    }

    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass {
        return "edge";
    }

    /**
     * 获取渲染顺序
     */
    public get renderOrder(): number {
        return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    }

    /**
     * 释放资源
     */
    public override dispose(): void {
        super.dispose();
        this.edgeLut.dispose();
    }

    // 实现基类要求的抽象方法
    public get asIndexedEdge() {
        return this;
    }

    public wantMonochrome(target: RenderTarget): boolean {
        return target.currentViewFlags?.renderMode === 0; // 假设0是线框模式
    }

    public getPass(target: RenderTarget): RenderPass {
        return this.determineRenderPass(target);
    }

    public getColor(target: RenderTarget): { isUniform: boolean; uniform: THREE.Color } {
        return {
            isUniform: true,
            uniform: new THREE.Color(0xffffff) // 实际应从LUT获取
        };
    }
}
