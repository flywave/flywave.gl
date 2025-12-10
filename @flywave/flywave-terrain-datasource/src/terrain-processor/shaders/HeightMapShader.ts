/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";
import { RawShaderMaterial } from "three";

import { FaceTypes } from "../../quantized-terrain/quantized-stratum-mesh/decoder";

/**
 * 用于将高度图渲染到编码颜色缓冲区的自定义着色器材质
 *
 * 该着色器使用打包算法将高度值编码为 RGBA 颜色值，
 * 允许从渲染的纹理中精确重建高度值。编码使用 24 位精度，
 * 在 RGBA8 限制内保持准确性。
 */

const stratumVertexShader = `
    precision highp float;
    precision highp int;

    // 包含地理坐标和高度的顶点属性
    attribute float altitude; 

    // 传递高度值到片段着色器的变量
    varying float vheight;

    // 标准变换矩阵
    uniform mat4 projectionMatrix; 
    uniform mat4 modelViewMatrix; 
    attribute float faceType;
    attribute vec2 uv;
    varying float vDiscard;

    void main() {  
        // 使用地理坐标 (XY) 变换顶点位置
        gl_Position = vec4(vec2(uv.x,1.0-uv.y) * 2.0 - 1.0,0.0,1.0);
        
        // 传递高度值到片段着色器
        vheight = altitude;
        if(faceType!=${FaceTypes.TopGroundFace.toFixed(1)}){
            vDiscard = 1.0;
        }
    }
`;

const quantizedVertexShader = `
    precision highp float;
    precision highp int;

    // 包含地理坐标和高度的顶点属性
    attribute float altitude; 

    // 传递高度值到片段着色器的变量
    varying float vheight;

    // 标准变换矩阵
    uniform mat4 projectionMatrix; 
    uniform mat4 modelViewMatrix; 
    attribute vec2 uv;
    attribute float webMercatorY;
    varying float vDiscard;

    void main() {  
        // 使用地理坐标 (XY) 变换顶点位置
        gl_Position = vec4(vec2(uv.x,1.0-webMercatorY) * 2.0 - 1.0,0.0,1.0);
        
        // 传递高度值到片段着色器
        vheight = altitude;
        vDiscard = 0.0;
    }
`;

export class HeightMapShader extends RawShaderMaterial {
    /**
     * 创建新的 HeightMapShader 实例
     *
     * 该着色器使用自定义顶点着色器将地理坐标传递到片段着色器，
     * 以及一个片段着色器将高度值编码为 RGBA 颜色分量以存储在渲染目标中。
     */
    constructor(vertexShaderType: "quantized" | "stratum") {
        super({
            side: THREE.DoubleSide,
            vertexShader:
                vertexShaderType === "quantized" ? quantizedVertexShader : stratumVertexShader,

            fragmentShader: `
                precision highp float;
                precision highp int;
                
                // 从顶点着色器传递的高度值
                varying float vheight;
                varying float vDiscard;
                 
                vec4 packAltitudeToColor(float altitude) {
                    vec4 vector = vec4(6553.6, 25.6, 0.1, 10000.0);
                    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
                    
                    float v = floor((altitude + vector.w) / vector.z);
                    
                    color.b = mod(v, 256.0);
                    v = floor(v / 256.0);
                    
                    color.g = mod(v, 256.0);
                    v = floor(v / 256.0);
                    
                    color.r = v;
                    color.a = 255.0;
                    
                    // 归一化到 [0,1] 范围用于颜色输出
                    return color / 255.0;
                }
                
                void main() { 
                    // 编码高度值并输出为片段颜色
                    gl_FragColor = packAltitudeToColor(vheight); 
                    if(vDiscard>0.0)
                        discard;
                }
            `
        });
    }
}
