import * as THREE from "three";
import type { EdgeTable, IndexedEdgeParams } from "../common/render/primitives/edge-params";
import type { RenderPass, RenderTarget, ShaderParams } from "./mesh-geometry";
import { MeshGeometry } from "./mesh-geometry";
/** @see [[EdgeTable]]
 * @internal
 */
export declare class EdgeLUT {
    readonly texture: THREE.DataTexture;
    readonly numSegments: number;
    readonly silhouettePadding: number;
    private constructor();
    dispose(): void;
    static create(table: EdgeTable): EdgeLUT | undefined;
}
export declare class IndexedEdgeGeometry extends MeshGeometry {
    readonly edgeLut: EdgeLUT;
    private readonly _indices;
    uniformColor: THREE.Vector4 | null;
    texture: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    vertexColors: boolean;
    constructor(options: {
        indices: Uint8Array;
        lut: EdgeTable;
    });
    /**
     * 创建 IndexedEdgeGeometry 实例
     */
    static create(params: IndexedEdgeParams): IndexedEdgeGeometry | undefined;
    /**
     * 创建Three.js网格对象
     * @param material 可选材质，默认使用基础线框材质
     */
    createMesh(): THREE.LineSegments;
    /**
     * 计算边缘线宽
     */
    protected computeEdgeWeight(params: ShaderParams): number;
    /**
     * 计算边缘线代码
     */
    protected computeEdgeLineCode(params: ShaderParams): number;
    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass;
    /**
     * 获取渲染顺序
     */
    get renderOrder(): number;
    /**
     * 释放资源
     */
    dispose(): void;
    get asIndexedEdge(): this;
    wantMonochrome(target: RenderTarget): boolean;
    getPass(target: RenderTarget): RenderPass;
    getColor(target: RenderTarget): {
        isUniform: boolean;
        uniform: THREE.Color;
    };
}
