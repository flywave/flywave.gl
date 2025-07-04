import * as THREE from "three";

// ==================== SHADER CHUNKS ====================
const stratumShaderChunks: StratumShaderExtensions = {
    common_pars_vertex: `
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 uv;
        attribute float facetypes;
        
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vFacetype;
    `,

    project_vertex: `
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    `,

    main_pars_fragment: `
        uniform sampler2D texture;
        uniform int hasTexture;
        uniform float textureIntensity;
        uniform vec3 lightVector;
        uniform float opacity;
    `,

    facetype_pars_vertex: `
        #ifdef USE_FACETYPES
            varying float vFacetype;
        #endif
    `,

    facetype_vertex: `
        #ifdef USE_FACETYPES
            vFacetype = facetypes;
        #endif
    `,

    rendermode_pars_fragment: `
        uniform int renderMode;
        uniform int topGroundMode;
        uniform int satelliteCount;
        
        const float BOUNDARY_MASK = 47.0;
        const float GROUND_MASK = 17.0;
        const float GROUND_FACE = 16.0;
    `,

    satellite_color_pars_fragment: `
        uniform sampler2D satelliteMaps[4];
        uniform vec4 satelliteUvTransforms[4]; // 新增UV变换参数数组
        
        vec3 getSatelliteColor(vec2 uv) {
            for (int i = 0; i < 4; i++) {
                if (i >= satelliteCount) break;
                
                // 应用UV变换：uv' = uv * scale + offset
                vec2 transformedUV = uv * satelliteUvTransforms[i].zw + satelliteUvTransforms[i].xy;
                
                if (all(greaterThanEqual(transformedUV, vec2(0.0))) && 
                    all(lessThanEqual(transformedUV, vec2(1.0)))) {
                    return texture2D(satelliteMaps[i], transformedUV).rgb;
                }
            }
            return vec3(-1.0); // 特殊标记值表示未找到有效贴图
        }
    `,

    // 修改颜色混合逻辑增加有效性检查
    color_blend_fragment: `
        #include <lighting_pars_fragment>

        vec3 satelliteColor = getSatelliteColor(vUv);
        if (satelliteColor.r < 0.0) {
            discard; // 未找到有效贴图时丢弃片段
        }
        
        #ifdef USE_FACETYPES
        if ((vFacetype & GROUND_FACE) == 0.0) {
            satelliteColor = vec3(-1.0);
        }
        #endif
    
        vec3 baseColor = satelliteColor;
        
        #ifdef USE_TEXTURE
            vec4 texColor = texture2D(texture, vUv);
            baseColor = mix(satelliteColor, texColor.rgb, textureIntensity);
        #endif
        
        baseColor = applyLighting(baseColor, vNormal);
        gl_FragColor = vec4(baseColor, opacity);
    `,

    rendermode_fragment: `
        #ifdef USE_FACETYPES
            if (renderMode == 4) { // STRUCTURE_ONLY
                if ((vFacetype & 4.0) != 0.0 && (vFacetype & 8.0) == 0.0) discard;
                if ((vFacetype & 16.0) != 0.0 && (vFacetype & 1.0) == 0.0) discard;
            } else if (renderMode == 3) { // GROUND_ONLY
                if ((vFacetype & GROUND_MASK) == 0.0) discard;
            } else if (renderMode == 1) { // BOUNDARY_ONLY
                if ((vFacetype & BOUNDARY_MASK) == 0.0) discard;
            } else if (renderMode == 2) { // EXCLUDE_SIDE_FACES
                if ((vFacetype & 4.0) != 0.0 && (vFacetype & 8.0) == 0.0) discard;
            }
        #endif
    `,

    // 增加光照计算模块
    lighting_pars_fragment: `
        vec3 applyLighting(vec3 color, vec3 normal) {
            vec3 lightDir = normalize(lightVector);
            float diff = max(dot(normal, lightDir), 0.3);
            return color * clamp(diff, 0.3, 1.0);
        }
    `
};

interface StratumShaderExtensions {
    [key: string]: string;
}

// 合并到Three.js Shader系统
Object.assign(THREE.ShaderChunk, stratumShaderChunks);
