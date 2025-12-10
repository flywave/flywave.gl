/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { GroundModificationFlagValue } from "../../Constants";

/**
 * 用于渲染地面修改高度图的自定义着色器
 */
export class GroundModificationHeightShader extends THREE.RawShaderMaterial {
    constructor() {
        const vertexShader = ` 
            precision highp float;
            precision highp int;

            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix; 

            in vec3 position;
            in vec2 uv;
            out vec2 vUv;

            void main() {  
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
                vUv = uv; 
            }
        `;

        const fragmentShader = ` 
            precision highp float;
            precision highp int; 

            uniform int vertexSourceType; // 0: fixed, 1: geometry
            uniform int heightOperation; // 0: replace, 1: add, 2: subtract, 3: max, 4: min

            out vec4 fragColor;
            in vec2 vUv;
            uniform sampler2D baseDemTexture;
            uniform sampler2D krigingTexture; 
            uniform sampler2D krigingMaskTexture;
            uniform sampler2D distanceTexture;
            uniform float altitude;

            // 从 RGBA 颜色解包高度值的函数
            float unpackAltitudeFromColor(vec4 v) {     
                vec4 uDemUnpack = vec4(6553.6, 25.6, 0.1, 10000.0); 
                return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
            }

            // 应用高度操作
            float applyHeightOperation(float baseValue, float modificationValue, int operation) {
                if (operation == 0) { // replace
                    return modificationValue;
                } else if (operation == 1) { // add
                    return baseValue + modificationValue;
                } else if (operation == 2) { // subtract
                    return baseValue - modificationValue;
                } else if (operation == 3) { // max
                    return min(baseValue, modificationValue);
                } else if (operation == 4) { // min
                    return max(baseValue, modificationValue);
                } else {
                    return baseValue;
                }
            }

            // 将高度打包到 RGBA 颜色的函数
            vec4 packAltitudeToColor(float altitude, float baseAltitude) {
                vec4 vector = vec4(6553.6, 25.6, 0.1, 10000.0);
                vec4 color = vec4(0.0, 0.0, 0.0, 255.0);
                
                float v = floor((altitude + vector.w) / vector.z);
                
                color.b = mod(v, 256.0);
                v = floor(v / 256.0);
                
                color.g = mod(v, 256.0);
                v = floor(v / 256.0);
                
                color.r = v;
                // 标记为修改过的像素
                // color.a = baseAltitude != altitude ? ${GroundModificationFlagValue.toFixed(
                    1
                )} : 1.0;
                
                // 归一化到 [0,1] 范围用于颜色输出
                return color / 255.0;
            }

            void main() { 
                // 打包最终高度到颜色

                // 获取基础 DEM 值
                vec4 baseDemColor = texture(baseDemTexture, vUv);
                float baseAltitude = unpackAltitudeFromColor(baseDemColor);

                vec4 krigingColor = texture(krigingTexture, vec2(vUv.x, 1.0-vUv.y));
                float krigingAltitude = unpackAltitudeFromColor(krigingColor);

                vec4 krigingMask = texture(krigingMaskTexture, vec2(vUv.x, 1.0-vUv.y));
                
                // 根据顶点数据来源类型获取修改高度值
                float modificationValue;
                if (vertexSourceType == 0) { // fixed
                    modificationValue = krigingMask.r >= 0.1 ? altitude : baseAltitude;
                } else { // geometry (1)
                    modificationValue = krigingMask.r >= 0.1 ? krigingAltitude : baseAltitude;
                } 

                vec4 distanceValue = texture(distanceTexture, vec2(vUv.x,vUv.y));
                
                // 应用高度操作
                float finalHeight = applyHeightOperation(baseAltitude, modificationValue, heightOperation);
                
                finalHeight = (1.0 - distanceValue.r) * baseAltitude + distanceValue.r * finalHeight;
                fragColor = packAltitudeToColor(finalHeight, baseAltitude);
            }
        `;

        super({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            uniforms: {
                altitude: { value: 0.0 },
                vertexSourceType: { value: 0 },
                heightOperation: { value: 0 },
                baseDemTexture: { value: null },
                krigingTexture: { value: null },
                krigingMaskTexture: { value: null },
                distanceTexture: { value: null }
            },
            side: THREE.DoubleSide,
            transparent: false,
            depthTest: false,
            depthWrite: false
        });
    }
}
