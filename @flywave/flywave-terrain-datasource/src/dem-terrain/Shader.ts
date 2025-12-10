/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

const shaderChunks = {
terrain_pars_vert: `  
    attribute float webMercatorY;  
    attribute vec3 mercatorPosition;  
    uniform float uSkirtHeight;
    varying float vheight;
    varying vec2 vDemUv;
    varying vec3 vObjectNormal;
 
    vec4 computeMvPos(vec2 uv, vec3 position) {
        float dx = position.x;
        vec4 basePos;
        bool uIsSimplePatch = pack[0][3] > 0.0;
        vec3 tNormal;

        float skirtHeight = position.z;
        if (uIsSimplePatch) { 
            vec4 pos1 = uPatchPos[0] + uPatchPos[1] * dx;
            vec4 pos2 = uPatchPos[2] + uPatchPos[3] * dx;
            basePos = pos1 + (pos2 - pos1) * position.y;  
            basePos.w = 1.0;  
            tNormal = normalize(cross(uPatchPos[0].xyz, uPatchPos[3].xyz));
            if(position.z<0.0){
                skirtHeight = -uSkirtHeight;
            }
        } else {
            basePos = mix(vec4(position, 1.0), vec4(mercatorPosition, 1.0), uProjectionFactor);
        }
 
        // 使用平滑的高度计算
        float hi = smoothElevationVertex(uv);
        float height = hi + skirtHeight; 
        vheight = height;

        vec2 demUv = tileUvToDemSample(uv);
        vDemUv = demUv;
        
        basePos += height * vec4(tNormal, .0); 
        basePos.w = 1.0;
        
        return basePos;
    }
`,

    terrain_proj: `
        vec4 mvPosition = vec4(transformed, 1.0);

        #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
        #endif
        
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
    `,

    terrain_simple_vert: `      
        transformed = computeMvPos(uv, position).xyz;
          
        #ifndef USE_UV
            vUv = vec2(uv.x,webMercatorY);
        #endif
        
        #ifndef USE_MAP
            vMapUv = vec2(uv.x, webMercatorY);
        #endif 
     `,

    dem_color_pars_fragment: `  
 

    uniform int imageryPatchCount;
    uniform sampler2D imageryPatchArray[5];
    uniform vec4 imageryPatchTransform[5];
    
    uniform sampler2D sideTexture; 

    #ifndef USE_OVERLAYER_MAP
    uniform sampler2D overlayerImagery;
    uniform mat3 overlayerImageryTransform;
    #endif

    #ifndef USE_MAP
        varying vec2 vMapUv;
    #endif
    varying float vheight;
    varying vec2 vDemUv;  
    
    varying vec3 vObjectNormal;

    vec4 getTextureColor() {
        vec4 color = gl_FragColor;
  
        for (int i = 0; i < 5; i++) {
            if (i >= imageryPatchCount) break;
             
            
             vec2 transformedUv = vec2(
                vMapUv.x * imageryPatchTransform[i].x + imageryPatchTransform[i].z,
                vMapUv.y * imageryPatchTransform[i].y + imageryPatchTransform[i].w
            ); 
            
            if (transformedUv.x >= -0.01 && transformedUv.x <= 1.01 && 
                transformedUv.y >= -0.01 && transformedUv.y <= 1.01) {
                vec4 texColor;
                switch(i) {
                    case 0: texColor = texture2D(imageryPatchArray[0], transformedUv); break;
                    case 1: texColor = texture2D(imageryPatchArray[1], transformedUv); break;
                    case 2: texColor = texture2D(imageryPatchArray[2], transformedUv); break;
                    case 3: texColor = texture2D(imageryPatchArray[3], transformedUv); break;
                    case 4: texColor = texture2D(imageryPatchArray[4], transformedUv); break;
                }
                color = texColor;
            }
        } 
 
        vec4 demColor = texture2D(uHeighMapTexture, vDemUv); 
        #ifndef USE_OVERLAYER_MAP
        // 对覆盖层贴图也应用同样的UV偏移
        vec2 overLayertransformedUv = (overlayerImageryTransform * vec3(vMapUv, 1.0)).xy;
      
        if (overLayertransformedUv.x >= -0.001 && overLayertransformedUv.x <= 1.001 && 
            overLayertransformedUv.y >= -0.01 && overLayertransformedUv.y <= 1.001) {
            // if(demColor.a==0.0){
                vec4 overLayerColor = texture2D(overlayerImagery, overLayertransformedUv); 
                    color = mix(color, overLayerColor, overLayerColor.a);   
            // }
        }
        #endif 
        return  color;
    }
    `,

    dem_color_fragment: `
        diffuseColor = mix(getTextureColor(),diffuseColor,0.1); 
    `,

    depth_packing_pars_vertex: `
        varying vec2 vHighPrecisionZW;
    `,

    depth_packing_vertex: `
        vHighPrecisionZW = gl_Position.zw;
    `,

    depth_packing_pars_fragment: `  
        varying vec2 vHighPrecisionZW;
        uniform int depth_packing_value;
    `,

    depth_packing_fragment: `
        float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
        
        if (depth_packing_value == 3200) {
            gl_FragColor = vec4(vec3(1.0 - fragCoordZ), opacity);
        }
        if (depth_packing_value == 3201) {
            gl_FragColor = packDepthToRGBA(fragCoordZ);
        }
        if (depth_packing_value == 3202) {
            gl_FragColor = vec4(packDepthToRGB(fragCoordZ), 1.0);
        }
        if (depth_packing_value == 3203) {
            gl_FragColor = vec4(packDepthToRG(fragCoordZ), 0.0, 1.0);
        }
    `,

beginnormal_terrain_vertex: `  
    bool uIsSimplePatch = pack[0][3] > 0.0; 
    
    if (uIsSimplePatch) {
        // 使用正确的texel尺寸来计算采样偏移
        vec2 texelSizeInUV = getDemTexelSize();
        
        // 根据DEM纹理在tile中的实际覆盖范围调整采样距离
        float e = texelSizeInUV.x * 1.0; // 1个texel的距离
        
        // 中心差分法计算法线
        vec2 offsetX = vec2(e, 0.0);
        vec2 offsetY = vec2(0.0, e);
        
        // 计算当前点高度
        float hCenter = smoothElevationVertex(uv);
        vec3 pCenter = computeMvPos(uv, vec3(position.xy, position.z)).xyz;
        
        // X方向梯度
        float hRight = smoothElevationVertex(uv + offsetX);
        vec3 pRight = computeMvPos(uv + offsetX, vec3(position.xy + offsetX, position.z)).xyz;
        
        float hLeft = smoothElevationVertex(uv - offsetX);
        vec3 pLeft = computeMvPos(uv - offsetX, vec3(position.xy - offsetX, position.z)).xyz;
        
        // Y方向梯度
        float hUp = smoothElevationVertex(uv + offsetY);
        vec3 pUp = computeMvPos(uv + offsetY, vec3(position.xy + offsetY, position.z)).xyz;
        
        float hDown = smoothElevationVertex(uv - offsetY);
        vec3 pDown = computeMvPos(uv - offsetY, vec3(position.xy - offsetY, position.z)).xyz;
        
        // 计算梯度（使用中心差分）
        vec3 dx = (pRight - pLeft) / (2.0 * e);
        vec3 dy = (pUp - pDown) / (2.0 * e);
        
        objectNormal = normalize(cross(dx, dy));
        vObjectNormal = objectNormal; 
    } else {
        objectNormal = mix(vec4(objectNormal, 1.0), vec4(0.0, 0.0, 1.0, 1.0), uProjectionFactor).xyz;
        vObjectNormal = objectNormal;
    }
`,

    terrain_common_pars: `
        uniform vec4 uGlobePosition;  
        uniform float opacity;   

        #ifndef USE_MAP
            varying vec2 vMapUv;
        #endif
    `,

   terrain_common: ` 
    uniform sampler2D uHeighMapTexture;  
    uniform mat4 uPatchPos;
    uniform mat4 pack;  
    varying vec4 debugColor;
 
    uniform float uProjectionFactor;

    mat3 mat3_emu(mat4 m4) {
        return mat3(
            m4[0][0], m4[0][1], m4[0][2],
            m4[1][0], m4[1][1], m4[1][2],
            m4[2][0], m4[2][1], m4[2][2]);
    } 

    float decodeElevation(vec4 v) {     
        vec4 uDemUnpack = pack[1]; 
        return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
    }

    vec2 tileUvToDemSample(vec2 uv) {
        vec3 uHeightMapPos = pack[2].xyz;
        float height_u = uv.x * uHeightMapPos.x + uHeightMapPos.z;
        float height_v = uv.y * uHeightMapPos.x + uHeightMapPos.y; 
        return vec2(height_u, height_v);
    }

    // 新增：获取正确的texel尺寸（考虑uHeightMapPos的缩放）
    vec2 getDemTexelSize() {
        vec3 uHeightMapPos = pack[2].xyz;
        // uHeightMapPos.x 是缩放因子
        // 我们需要将其转换为texel尺寸
        
        // 假设DEM纹理是正方形的，获取其尺寸
        vec2 texSize = vec2(textureSize(uHeighMapTexture, 0));
        
        // 计算每个tile UV单位对应的texel数量
        float texelsPerUV = texSize.x * uHeightMapPos.x;
        
        // 计算每个texel在tile UV空间中的大小
        return vec2(1.0 / texelsPerUV, 1.0 / texelsPerUV);
    }

    // 新增：考虑变换的平滑高度采样
    float smoothElevation(vec2 tileUv) {
        vec2 demUv = tileUvToDemSample(tileUv);
        
        // 获取纹理大小
        vec2 texSize = vec2(textureSize(uHeighMapTexture, 0));
        
        // 将demUv转换到texel坐标
        vec2 texelCoord = demUv * texSize;
        
        // 计算texel中的位置
        vec2 floorCoord = floor(texelCoord - 0.5) + 0.5;
        vec2 fractPart = texelCoord - floorCoord;
        
        // 使用三次平滑插值权重
        vec2 w = fractPart * fractPart * (3.0 - 2.0 * fractPart);
        
        // 采样4个texel（考虑边界）
        vec2 texelSize = 1.0 / texSize;
        
        vec2 uv00 = floorCoord / texSize;
        vec2 uv10 = (floorCoord + vec2(1.0, 0.0)) / texSize;
        vec2 uv01 = (floorCoord + vec2(0.0, 1.0)) / texSize;
        vec2 uv11 = (floorCoord + vec2(1.0, 1.0)) / texSize;
        
        // 边界保护
        uv00 = clamp(uv00, 0.0, 1.0);
        uv10 = clamp(uv10, 0.0, 1.0);
        uv01 = clamp(uv01, 0.0, 1.0);
        uv11 = clamp(uv11, 0.0, 1.0);
        
        // 采样高度
        float h00 = decodeElevation(texture2D(uHeighMapTexture, uv00));
        float h10 = decodeElevation(texture2D(uHeighMapTexture, uv10));
        float h01 = decodeElevation(texture2D(uHeighMapTexture, uv01));
        float h11 = decodeElevation(texture2D(uHeighMapTexture, uv11));
        
        // 双线性插值
        float h0 = mix(h00, h10, w.x);
        float h1 = mix(h01, h11, w.x);
        return mix(h0, h1, w.y);
    }

    // 用于顶点着色器的简化版本（性能考虑）
    float smoothElevationVertex(vec2 tileUv) {
        vec2 demUv = tileUvToDemSample(tileUv);
        vec2 texSize = vec2(textureSize(uHeighMapTexture, 0));
        vec2 texelCoord = demUv * texSize;
        
        // 简单的线性插值近似
        vec2 floorCoord = floor(texelCoord);
        vec2 fractPart = texelCoord - floorCoord;
        
        // 采样4个点
        vec2 uv00 = floorCoord / texSize;
        vec2 uv10 = (floorCoord + vec2(1.0, 0.0)) / texSize;
        vec2 uv01 = (floorCoord + vec2(0.0, 1.0)) / texSize;
        vec2 uv11 = (floorCoord + vec2(1.0, 1.0)) / texSize;
        
        // 边界保护
        uv00 = clamp(uv00, 0.0, 1.0);
        uv10 = clamp(uv10, 0.0, 1.0);
        uv01 = clamp(uv01, 0.0, 1.0);
        uv11 = clamp(uv11, 0.0, 1.0);
        
        float h00 = decodeElevation(texture2D(uHeighMapTexture, uv00));
        float h10 = decodeElevation(texture2D(uHeighMapTexture, uv10));
        float h01 = decodeElevation(texture2D(uHeighMapTexture, uv01));
        float h11 = decodeElevation(texture2D(uHeighMapTexture, uv11));
        
        float h0 = mix(h00, h10, fractPart.x);
        float h1 = mix(h01, h11, fractPart.x);
        return mix(h0, h1, fractPart.y);
    }

    float decodeOverlayerElevation(vec4 v) { 
        if (v.a != 1.0) {
            return 0.0;
        }
        vec4 uDemUnpack = pack[1]; 
        return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
    }

    float currentElevation(vec2 uv) {
        // 使用平滑采样
        return smoothElevationVertex(uv);
    }  

    // 原始的 elevation 函数（保持兼容性）
    float elevation(vec2 uv) {
        return currentElevation(uv);
    } 
`
};

// Assign the shader chunks to THREE.ShaderChunk
Object.assign(THREE.ShaderChunk, shaderChunks);
