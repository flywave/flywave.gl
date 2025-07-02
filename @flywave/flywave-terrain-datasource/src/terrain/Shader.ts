import * as THREE from "three";

const terrainShaderChunks: TerrainShaderExtensions = {
    tinterrain_common: `
        /**
         * Returns 1.0 if the given value is positive or zero, and -1.0 if it is negative.
         */
        float czm_signNotZero(float value) {
            return value >= 0.0 ? 1.0 : -1.0;
        }

        vec2 czm_signNotZero(vec2 value) {
            return vec2(czm_signNotZero(value.x), czm_signNotZero(value.y));
        }

        vec3 czm_signNotZero(vec3 value) {
            return vec3(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z));
        }

        vec4 czm_signNotZero(vec4 value) {
            return vec4(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z), czm_signNotZero(value.w));
        }

        /**
         * Decodes a unit-length vector in 'oct' encoding to a normalized 3-component Cartesian vector.
         */
        vec3 czm_octDecode(vec2 encoded, float range) {
            if (encoded.x == 0.0 && encoded.y == 0.0) {
                return vec3(0.0, 0.0, 0.0);
            }

            encoded = encoded / range * 2.0 - 1.0;
            vec3 v = vec3(encoded.x, encoded.y, 1.0 - abs(encoded.x) - abs(encoded.y));
            if (v.z < 0.0) {
                v.xy = (1.0 - abs(v.yx)) * czm_signNotZero(v.xy);
            }

            return normalize(v);
        }

        vec3 czm_octDecode(vec2 encoded) {
            return czm_octDecode(encoded, 255.0);
        }

        vec3 czm_octDecode(float encoded) {
            float temp = encoded / 256.0;
            float x = floor(temp);
            float y = (temp - x) * 256.0;
            return czm_octDecode(vec2(x, y));
        }

        void czm_octDecode(vec2 encoded, out vec3 vector1, out vec3 vector2, out vec3 vector3) {
            float temp = encoded.x / 65536.0;
            float x = floor(temp);
            float encodedFloat1 = (temp - x) * 65536.0;

            temp = encoded.y / 65536.0;
            float y = floor(temp);
            float encodedFloat2 = (temp - y) * 65536.0;

            vector1 = czm_octDecode(encodedFloat1);
            vector2 = czm_octDecode(encodedFloat2);
            vector3 = czm_octDecode(vec2(x, y));
        } 
        
        #ifdef QUANTIZATION_BITS12
        attribute vec4 compressed0;
        attribute float compressed1;
        #else
        varying vec2 v_textureCoordinates;
        varying vec3 v_positionEC;
        varying vec3 v_positionMC;
        varying vec3 vObjectNormal;
        #endif
        
        uniform vec4 imageUvTransfrom; 
        uniform vec3 clipUvTransfrom;   
        uniform vec4 u_waterMaskTranslationAndScale;   
        uniform bool isWebMercator; 
        
        #ifdef USE_GT_151
        #ifndef USE_MAP
        varying vec2 vMapUv;
        #endif
        #endif
    `,

    begin_tinterrain_vertex: ` 
        v_textureCoordinates = isWebMercator ? textureCoordAndEncodedNormals.xz : textureCoordAndEncodedNormals.xy; 
        float height_u = v_textureCoordinates.x*imageUvTransfrom.x + imageUvTransfrom.z;
        float height_v = v_textureCoordinates.y*imageUvTransfrom.y + imageUvTransfrom.w;  

        #ifdef USE_UV
        vUv = (vec3(height_u, height_v,1.0)).xy;   
        #ifdef USE_GT_151
        vMapUv = (vec3(height_u, height_v,1.0)).xy;  
        #endif
        #endif
        
        v_positionEC = (modelMatrix * vec4(position, 1.0)).xyz;
        v_positionMC = position;  // position in model coordinates
 
        vec2 waterMaskTranslation = u_waterMaskTranslationAndScale.xy;
        vec2 waterMaskScale = u_waterMaskTranslationAndScale.zw;
        vec2 waterMaskTextureCoordinates = v_textureCoordinates.xy * waterMaskScale + waterMaskTranslation;
        waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y; 
    `,

    beginnormal_tinterrain_vertex: `
        float encodedNormal = textureCoordAndEncodedNormals.w;
        objectNormal = czm_octDecode(encodedNormal);
        vObjectNormal = objectNormal;
    `,

    tinterrain_color_pars_fragment: `
        uniform vec3 clipUvTransfrom;
        varying vec2 v_textureCoordinates;  
    `,

    discard_out_range_frag: `
        vec2 textureCoordinates = v_textureCoordinates.xy;
        vec2 tUv = vec2((textureCoordinates.xy-clipUvTransfrom.zy)/clipUvTransfrom.xx);
        if(tUv.x>1.002||tUv.y>1.002||tUv.x<-.002||tUv.y<-.002){
            discard;
        }
        if(vUv.x>1.002||vUv.y>1.002||vUv.x<-.002||vUv.y<-.002){
            discard;
        } 
    `,

    water_mask_pars_fragment: `
        #ifdef SHOW_REFLECTIVE_OCEAN
            uniform sampler2D u_waterMask;
            uniform sampler2D normalSampler;
            uniform float frameNumber; 
            uniform vec4 u_waterMaskTranslationAndScale;   
            uniform vec4 u_waterMaskNoisyTranslationAndScale;   
            
            #ifdef USE_GT_151
            #ifndef USE_MAP
            varying vec2 vMapUv;
            #endif
            #endif
            
            uniform mat3 normalMatrix; 
            varying vec3 v_positionEC;
            varying vec3 v_positionMC;
            varying vec3 vObjectNormal;
            
            const float oceanFrequencyLowAltitude = 750000.0;
            const float oceanOneOverAmplitudeLowAltitude = 1.0 / 2.0;
            const float oceanAnimationSpeedLowAltitude = 0.004; 

            const float oceanFrequencyHighAltitude = 500000.0;
            const float oceanAnimationSpeedHighAltitude = 0.008;
            const float oceanOneOverAmplitudeHighAltitude = 1.0 / 2.0;

            vec4 getWaterNoise(sampler2D normalMap, vec2 uv, float time, float angleInRadians) {
                float cosAngle = cos(angleInRadians);
                float sinAngle = sin(angleInRadians);
            
                vec2 s0 = vec2(1.0/17.0, 0.0);
                vec2 s1 = vec2(-1.0/29.0, 0.0);
                vec2 s2 = vec2(1.0/101.0, 1.0/59.0);
                vec2 s3 = vec2(-1.0/109.0, -1.0/57.0);
            
                s0 = vec2((cosAngle * s0.x) - (sinAngle * s0.y), (sinAngle * s0.x) + (cosAngle * s0.y));
                s1 = vec2((cosAngle * s1.x) - (sinAngle * s1.y), (sinAngle * s1.x) + (cosAngle * s1.y));
                s2 = vec2((cosAngle * s2.x) - (sinAngle * s2.y), (sinAngle * s2.x) + (cosAngle * s2.y));
                s3 = vec2((cosAngle * s3.x) - (sinAngle * s3.y), (sinAngle * s3.x) + (cosAngle * s3.y));
            
                vec2 uv0 = (uv/103.0) + (time * s0);
                vec2 uv1 = uv/107.0 + (time * s1) + vec2(0.23);
                vec2 uv2 = uv/vec2(897.0, 983.0) + (time * s2) + vec2(0.51);
                vec2 uv3 = uv/vec2(991.0, 877.0) + (time * s3) + vec2(0.71);
            
                uv0 = fract(uv0);
                uv1 = fract(uv1);
                uv2 = fract(uv2);
                uv3 = fract(uv3);
                vec4 noise = (texture2D(normalMap, uv0)) +
                             (texture2D(normalMap, uv1)) +
                             (texture2D(normalMap, uv2)) +
                             (texture2D(normalMap, uv3));
            
                return ((noise / 4.0) - 0.5) * 2.0;
            }
      
            float waveFade(float edge0, float edge1, float x) {
                float y = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
                return pow(1.0 - y, 5.0);
            }

            float linearFade(float edge0, float edge1, float x) {
                return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
            }

            mat3 eastNorthUpToEyeCoordinates(vec3 positionMC, vec3 normalEC) {
                vec3 tangentMC = normalize(vec3(-positionMC.y, positionMC.x, 0.0));
                vec3 tangentEC = normalize(normalMatrix * tangentMC);
                vec3 bitangentEC = normalize(cross(normalEC, tangentEC));

                return mat3(
                    tangentEC.x,   tangentEC.y,   tangentEC.z,
                    bitangentEC.x, bitangentEC.y, bitangentEC.z,
                    normalEC.x,    normalEC.y,    normalEC.z);
            }

            vec4 computeWaterColor(vec3 positionEyeCoordinates, vec2 textureCoordinates, mat3 enuToEye, vec4 imageryColor, float maskValue, float fade) {
                vec3 positionToEyeEC = -positionEyeCoordinates;
                float positionToEyeECLength = length(positionToEyeEC);
                vec3 normalizedPositionToEyeEC = normalize(normalize(positionToEyeEC));

                float waveIntensity = waveFade(70000.0, 1000000.0, positionToEyeECLength);

                float time = frameNumber * oceanAnimationSpeedHighAltitude;
                vec4 noise = getWaterNoise(normalSampler, textureCoordinates * oceanFrequencyHighAltitude, time, 0.0);
                vec3 normalTangentSpaceHighAltitude = vec3(noise.xy, noise.z * oceanOneOverAmplitudeHighAltitude);

                time = frameNumber * oceanAnimationSpeedLowAltitude;
                noise = getWaterNoise(normalSampler, textureCoordinates * oceanFrequencyLowAltitude, time, 0.0);
                vec3 normalTangentSpaceLowAltitude = vec3(noise.xy, noise.z * oceanOneOverAmplitudeLowAltitude);

                float highAltitudeFade = linearFade(0.0, 60000.0, positionToEyeECLength);
                float lowAltitudeFade = 1.0 - linearFade(20000.0, 60000.0, positionToEyeECLength);
                vec3 normalTangentSpace =
                    (highAltitudeFade * normalTangentSpaceHighAltitude) +
                    (lowAltitudeFade * normalTangentSpaceLowAltitude);
                normalTangentSpace = normalize(normalTangentSpace);

                normalTangentSpace.xy *= waveIntensity;
                normalTangentSpace = normalize(normalTangentSpace);
          
                vec3 normalEC = enuToEye * normalTangentSpace;

                const vec3 waveHighlightColor = vec3(0.16862745098039217, 0.7019607843137254, 0.8352941176470589);

                vec3 diffuseHighlight = waveHighlightColor * maskValue * (1.0 - fade);
                float tsPerturbationRatio = normalTangentSpace.z;
                vec3 nonDiffuseHighlight = waveHighlightColor * 5.0 * (1.0 - tsPerturbationRatio);
     
                vec3 color = imageryColor.rgb + diffuseHighlight + nonDiffuseHighlight;

                return vec4(color, imageryColor.a);
            }
        #endif 
    `,

    water_mask_compute_color_fragment: `
        #ifdef SHOW_REFLECTIVE_OCEAN
            vec2 waterMaskTranslation = u_waterMaskTranslationAndScale.xy;
            vec2 waterMaskScale = u_waterMaskTranslationAndScale.zw;
            vec2 waterMaskTextureCoordinates = v_textureCoordinates.xy * waterMaskScale + waterMaskTranslation;
            waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y;
 
            float mask = texture2D(u_waterMask, waterMaskTextureCoordinates).r; 

            if (mask > 0.0) {  
                mat3 enuToEye = eastNorthUpToEyeCoordinates(v_positionMC, normalMatrix*vObjectNormal); 

                vec2 waterMaskTranslation = u_waterMaskNoisyTranslationAndScale.xy;
                vec2 waterMaskScale = u_waterMaskNoisyTranslationAndScale.zw;
                vec2 waterMaskTextureCoordinates = v_textureCoordinates.xy * waterMaskScale + waterMaskTranslation;
                waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y; 

                gl_FragColor = computeWaterColor(v_positionEC, waterMaskTextureCoordinates, enuToEye, diffuseColor, mask, 0.8);
            }
        #endif
    `,

    water_mask_util_funcs: ` 
        // Additional utility functions can be added here
    `
};

// Merge the terrain shader chunks with THREE.ShaderChunk
Object.assign(THREE.ShaderChunk, terrainShaderChunks);

// Export types for better TypeScript support
export interface TerrainShaderExtensions {
    tinterrain_common: string;
    begin_tinterrain_vertex: string;
    beginnormal_tinterrain_vertex: string;
    tinterrain_color_pars_fragment: string;
    discard_out_range_frag: string;
    water_mask_pars_fragment: string;
    water_mask_compute_color_fragment: string;
    water_mask_util_funcs: string;
}

export const TerrainShaders: TerrainShaderExtensions = terrainShaderChunks;
