import { RawShaderMaterial } from "three";
export declare class HeightMapShader extends RawShaderMaterial {
    /**
     * 创建新的 HeightMapShader 实例
     *
     * 该着色器使用自定义顶点着色器将地理坐标传递到片段着色器，
     * 以及一个片段着色器将高度值编码为 RGBA 颜色分量以存储在渲染目标中。
     */
    constructor(vertexShaderType: "quantized" | "stratum");
}
