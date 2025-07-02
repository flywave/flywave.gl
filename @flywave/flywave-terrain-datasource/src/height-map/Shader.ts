import * as THREE from "three";

const shaderChunks = {
    terrain_pars_vert: ` 
    vec4 computeMvPos(vec2 uv, vec3 position, float h) {
        float dx = position.x;
        vec4 pos;
        bool uIsSimplePatch = pack[0][3] > 0.0;
        vec3 tNormal;
        
        if (uIsSimplePatch) {
            vec4 pos1 = uPatchPos[0] + uPatchPos[1] * dx;
            vec4 pos2 = uPatchPos[2] + uPatchPos[3] * dx;
            pos = pos1 + (pos2 - pos1) * position.y;  
            pos.w = 1.0;  
            tNormal = normalize(cross(uPatchPos[0].xyz, uPatchPos[3].xyz));
        } else {
            pos = vec4(position, 1.0);  
        }

        float hi = elevation(uv);
        if (h == 1.0) {
            hi = 0.0;
        }

        float v = currentOverlayerElevation(uv);
        float height = hi + position.z - v; 

        pos += height * vec4(tNormal, .0) / 6378137.0; 
        pos.w = 1.0;  
        return pos; 
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
        transformed = computeMvPos(uv, position, 0.0).xyz;
        
        vec3 uUvTransform = pack[0].xyz;

        float height_u = uv.x * uUvTransform.x + uUvTransform.z;
        float height_v = uv.y * uUvTransform.x + uUvTransform.y;  
        
        #ifdef USE_UV
            vUv = vec2(height_u, height_v);  
        #endif
        
        #ifdef USE_GT_151
            vMapUv = vec2(height_u, height_v);  
        #endif
        
        vDigMapUv = uv;
        vDigColor = digColor; 
        isDig = currentOverlayerElevation(uv);
    `,

    dig_color_pars_fragment: `
        varying vec3 vDigColor;
        varying vec2 vDigMapUv;
        uniform sampler2D uDigTexture; 
        varying float isDig;
    `,

    dig_color_fragment: `
        if (isDig != 0.0) {
            diffuseColor.xyz = mix(texture2D(uDigTexture, vDigMapUv).xyz, vDigColor, 0.8);
        } 
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
            vec3 uHeightMapPos = pack[2].xyz;
                
            float e = 0.014925372786819935;
            vec2 v1 = vec2(e, e);
            vec2 v2 = vec2(-e, -e); 
            vec2 v3 = vec2(-e, e);
            vec2 v4 = vec2(e, -e); 

            vec3 n1 = computeMvPos(uv + v1, vec3(position.xy + v1, position.z), 0.0).xyz;
            vec3 n2 = computeMvPos(uv + v2, vec3(position.xy + v2, position.z), 0.0).xyz;
            vec3 n3 = computeMvPos(uv + v3, vec3(position.xy + v3, position.z), 0.0).xyz;
            vec3 n4 = computeMvPos(uv + v4, vec3(position.xy + v4, position.z), 0.0).xyz; 
            
            objectNormal = normalize(cross((n2 - n1), (n4 - n3)));
        }
    `,

    terrain_common_pars: `
        uniform vec4 uGlobePosition;
        uniform sampler2D uHeighMapTexture; 
        uniform sampler2D overlayerHeightMap;
        uniform vec4 overlayerHeightMapUvTransform;
        varying vec3 vDigColor;
        uniform vec3 digColor;
        varying float isDig;
    `,

    terrain_common: `
        uniform mat4 uPatchPos;
        uniform float opacity;  
        varying vec2 vDigMapUv;
        uniform mat4 pack;  

        mat3 mat3_emu(mat4 m4) {
            return mat3(
                m4[0][0], m4[0][1], m4[0][2],
                m4[1][0], m4[1][1], m4[1][2],
                m4[2][0], m4[2][1], m4[2][2]);
        } 

        vec2 tileUvToDemSample(vec2 uv) {
            vec3 uHeightMapPos = pack[2].xyz;
            float height_u = uv.x * uHeightMapPos.x + uHeightMapPos.z;
            float height_v = uv.y * uHeightMapPos.x + uHeightMapPos.y; 
            return vec2(height_u, height_v);
        }

        float decodeElevation(vec4 v) {    
            vec4 uDemUnpack = pack[1]; 
            return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
        }

        float decodeOverlayerElevation(vec4 v) { 
            if (v.a != 1.0) {
                return 0.0;
            }
            vec4 uDemUnpack = pack[1]; 
            return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
        }

        float currentElevation(vec2 uv) {
            vec2 pos = tileUvToDemSample(uv);
            return decodeElevation(texture2D(uHeighMapTexture, pos)); 
        } 

        float currentOverlayerElevation(vec2 uv) { 
            uv = uv * overlayerHeightMapUvTransform.xy + overlayerHeightMapUvTransform.zw;
            if (uv.x <= 0.00001 || uv.y <= 0.00001 || uv.x > 1.0 || uv.y > 1.0) {
                return 0.0;
            }
            return decodeOverlayerElevation(texture2D(overlayerHeightMap, uv)); 
        } 

        float elevation(vec2 uv) {
            return currentElevation(uv);
        } 
    `
};

// Assign the shader chunks to THREE.ShaderChunk
Object.assign(THREE.ShaderChunk, shaderChunks);
