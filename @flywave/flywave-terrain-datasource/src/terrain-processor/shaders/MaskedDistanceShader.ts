/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

// 新增 DistanceCalculationShader.ts
// 新增 MaskedDistanceShader.ts
export class MaskedDistanceShader extends THREE.RawShaderMaterial {
    constructor() {
        const vertexShader = `
            precision highp float;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            in vec3 position;
            in vec2 uv;
            out vec2 vUv;
            
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                vUv = uv;
            }
        `;

        const fragmentShader = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform vec2 resolution;        // 主纹理分辨率
            uniform float slopeWidth;       // 坡度宽度
            uniform sampler2D maskTexture;  // 掩码纹理
            uniform sampler2D contourTexture; // 轮廓数据纹理
            uniform float contourLength;    // 轮廓实际顶点数
            uniform vec2 contourTexSize;    // 轮廓纹理尺寸
            
            // 从轮廓纹理中获取顶点坐标
            vec2 getContourPoint(int index) {
                float u = (float(index) + 0.5) / contourTexSize.x;
                vec4 encoded = texture(contourTexture, vec2(u, 0.5)); 
                return encoded.xy;
            }
            
            // 计算点到线段的距离
            float distanceToSegment(vec2 point, vec2 a, vec2 b) {
                vec2 ab = b - a;
                vec2 ap = point - a;
                float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
                vec2 projection = a + t * ab;
                return length(point - projection);
            }
            
            // 计算点到多边形的最小距离
            float distanceToPolygon(vec2 point) {
                float minDistance = 1e10;
                int pointCount = int(contourLength);
                
                // 遍历所有边
                for (int i = 0; i < 2048; i++) {
                    if (i >= pointCount - 1) break;
                    
                    vec2 a = getContourPoint(i);
                    vec2 b = getContourPoint(i + 1);
                    float distance = distanceToSegment(point, a, b);
                    minDistance = min(minDistance, distance);
                }
                
                // 闭合多边形（连接首尾点）
                if (pointCount > 2) {
                    vec2 first = getContourPoint(0);
                    vec2 last = getContourPoint(pointCount - 1);
                    float lastDistance = distanceToSegment(point, last, first);
                    minDistance = min(minDistance, lastDistance);
                }
                
                return minDistance;
            }
            
            void main() {
                // 采样掩码纹理
                vec4 maskColor = texture(maskTexture, vec2(vUv.x, 1.0-vUv.y));
                float maskValue = maskColor.r;
                
                // 关键逻辑：只有掩码内部的像素才计算距离
                if (maskValue <= 0.0) {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0); // 外部像素距离为0
                    return;
                }
                
                // 内部像素：计算到多边形边界的距离
                vec2 pixelCoord = vUv * resolution;
                float distance = distanceToPolygon(pixelCoord);
                
                // 归一化距离（和原来一样的逻辑）
                float normalizedDistance = min(1.0, distance / (slopeWidth * 2.0));
                
                fragColor = vec4(normalizedDistance, 0.0, 0.0, 1.0);
            }
        `;

        super({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                resolution: { value: new THREE.Vector2(256, 256) },
                slopeWidth: { value: 10.0 },
                maskTexture: { value: null },
                contourTexture: { value: null },
                contourLength: { value: 0 },
                contourTexSize: { value: new THREE.Vector2(1, 1) }
            }
        });
    }
}
