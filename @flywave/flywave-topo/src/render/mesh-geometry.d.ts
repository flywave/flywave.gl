import * as THREE from "three";
export declare enum RenderMode {
    Wireframe = 0,
    HiddenLine = 1,
    SolidFill = 2,
    SmoothShade = 3,
    Monochrome = 4
}
export type RenderPass = "none" | "opaque" | "translucent" | "edge";
export interface RenderTarget {
    isDrawingShadowMap: boolean;
    currentViewFlags: {
        renderMode: RenderMode;
        visibleEdges: boolean;
        transparency: boolean;
    };
}
export interface ShaderParams {
    renderPass?: RenderPass;
    devicePixelRatio?: number;
}
export declare class MeshGeometry extends THREE.BufferGeometry {
    viewIndependentOrigin: THREE.Vector3;
    edgeWidth: number;
    edgeLineCode: number;
    isPlanar: boolean;
    hasBakedLighting: boolean;
    hasScalarAnimation: boolean;
    uniformColor: THREE.Vector4 | null;
    texture: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    vertexColors: boolean;
    instanceCount: number;
    private readonly _materialCache;
    constructor(options: {
        indices?: Uint32Array | Uint16Array;
        positions: Float32Array;
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
    getUniformColorHex(includeAlpha?: boolean): string | null;
    /**
     * 计算边缘线宽
     */
    protected computeEdgeWeight(params: ShaderParams): number;
    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass;
    /**
     * 创建或获取缓存的材质
     */
    getMaterial(pass: RenderPass, target: RenderTarget): THREE.Material;
    /**
     * 创建 Three.js 网格对象
     */
    createMesh(target: RenderTarget): THREE.Object3D | null;
    /**
     * 创建特定通道的材质
     */
    protected createMaterialForPass(pass: RenderPass, target: RenderTarget): THREE.Material;
    /**
     * 创建边缘材质
     */
    protected createEdgeMaterial(): THREE.Material;
    /**
     * 创建半透明材质
     */
    protected createTranslucentMaterial(): THREE.Material;
    /**
     * 创建不透明材质
     */
    protected createOpaqueMaterial(): THREE.Material;
    /**
     * 更新材质 uniforms
     */
    updateMaterialUniforms(material: THREE.Material, params?: ShaderParams): void;
    /**
     * 更新几何数据
     */
    updateGeometry(options: {
        positions?: Float32Array;
        normals?: Float32Array;
        colors?: Float32Array;
    }): void;
    /**
     * 释放资源
     */
    dispose(): void;
    /**
     * 应用实例化矩阵
     */
    applyInstancingMatrices(matrices: Float32Array, count: number): void;
    /**
     * 创建自定义着色器材质（高级用法）
     */
    createCustomShaderMaterial(vertexShader: string, fragmentShader: string, uniforms?: Record<string, THREE.Uniform>): THREE.ShaderMaterial;
}
