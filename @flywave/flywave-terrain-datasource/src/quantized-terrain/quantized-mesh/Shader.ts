/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

const terrainShaderChunks: TerrainShaderExtensions = {
    tinterrain_common: ` 
        uniform vec3 clipUvTransfrom;
        uniform vec4 waterMaskTranslationAndScale; 
        attribute float webMercatorY;
        #ifndef USE_MAP
            varying vec2 vMapUv;
        #endif
 
    `,
    begin_tinterrain_vertex: `
        #ifndef USE_MAP
            vMapUv = vec2(uv.x,webMercatorY);
        #endif
    `,
    discard_out_range_frag: `
        // vec2 tUv = (vUv - clipUvTransfrom.zy) / clipUvTransfrom.xx;
        // if (tUv.x > 1.002 || tUv.y > 1.002 || tUv.x < -0.002 || tUv.y < -0.002) {
        //     discard;
        // }
    `,
    water_mask_pars_fragment: `
       uniform vec3 clipUvTransfrom;
       #ifndef USE_MAP
            varying vec2 vMapUv;
        #endif


        #ifndef USE_OVERLAYER_MAP
        uniform sampler2D overlayerImagery;
        uniform vec4 overlayerImageryTransform;
        #endif

        uniform int imageryPatchCount;
        uniform vec4 imageryPatchTransform[5];
        uniform sampler2D imageryPatchArray[5];

        vec4 getTextureColor() {
            vec4 color = gl_FragColor;
            
            for (int i = 0; i < 5; i++) {
                if (i >= imageryPatchCount) break;
                vec2 transformedUv = vec2(
                    vMapUv.x * imageryPatchTransform[i].x + imageryPatchTransform[i].z,
                    vMapUv.y * imageryPatchTransform[i].y + imageryPatchTransform[i].w
                ); 
                if (transformedUv.x >= -0.001 && transformedUv.x <= 1.001 && 
                    transformedUv.y >= -0.001 && transformedUv.y <= 1.001) {
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

            #ifndef USE_OVERLAYER_MAP
              vec2 overLayertransformedUv = vec2(
                    vMapUv.x * overlayerImageryTransform.x + overlayerImageryTransform.z,
                    vMapUv.y * overlayerImageryTransform.y + overlayerImageryTransform.w
                ); 
            if (overLayertransformedUv.x >= -0.00001 && overLayertransformedUv.x <= 1.00001 && 
                    overLayertransformedUv.y >= -0.00001 && overLayertransformedUv.y <= 1.00001) {
                    vec4 overLayerColor = texture2D(overlayerImagery, overLayertransformedUv);
                    if(overLayerColor.a > 0.0){
                        color = mix(color, overLayerColor, overLayerColor.a);
                    }
                }
            #endif
            
            return color;
        }

        #ifdef SHOW_REFLECTIVE_OCEAN
            uniform sampler2D waterMaskTexture;
            uniform sampler2D normalSampler;
            uniform float frameNumber;
            uniform vec4 waterMaskTranslationAndScale;
            uniform vec4 waterMaskNoisyTranslationAndScale; 
 
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

            vec4 computeWaterColor(vec2 textureCoordinates, vec4 imageryColor, float maskValue, float fade) {
                float time = frameNumber * oceanAnimationSpeedHighAltitude;
                vec4 noise = getWaterNoise(normalSampler, textureCoordinates * oceanFrequencyHighAltitude, time, 0.0);
                vec3 normalTangentSpaceHighAltitude = vec3(noise.xy, noise.z * oceanOneOverAmplitudeHighAltitude);

                time = frameNumber * oceanAnimationSpeedLowAltitude;
                noise = getWaterNoise(normalSampler, textureCoordinates * oceanFrequencyLowAltitude, time, 0.0);
                vec3 normalTangentSpaceLowAltitude = vec3(noise.xy, noise.z * oceanOneOverAmplitudeLowAltitude);

                float highAltitudeFade = linearFade(0.0, 60000.0, 1.0);
                float lowAltitudeFade = 1.0 - linearFade(20000.0, 60000.0, 1.0);

                vec3 normalTangentSpace =
                    (highAltitudeFade * normalTangentSpaceHighAltitude) +
                    (lowAltitudeFade * normalTangentSpaceLowAltitude);
                normalTangentSpace = normalize(normalTangentSpace);

                vec3 waveHighlightColor = vec3(0.16862745098039217, 0.7019607843137254, 0.8352941176470589);

                vec3 diffuseHighlight = waveHighlightColor * maskValue * (1.0 - fade);
                float tsPerturbationRatio = normalTangentSpace.z;
                vec3 nonDiffuseHighlight = waveHighlightColor * 5.0 * (1.0 - tsPerturbationRatio);

                vec3 color = imageryColor.rgb + diffuseHighlight + nonDiffuseHighlight;

                return vec4(color, imageryColor.a);
            }
        #endif
    `,
    water_mask_compute_color_fragment: ` 
        diffuseColor = mix(getTextureColor(),diffuseColor,0.1);
        #ifdef SHOW_REFLECTIVE_OCEAN
            vec2 waterMaskTranslation = waterMaskTranslationAndScale.xy;
            vec2 waterMaskScale = waterMaskTranslationAndScale.zw;
            vec2 waterMaskTextureCoordinates = vMapUv * waterMaskScale + waterMaskTranslation;
            waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y;

            float mask = texture2D(waterMaskTexture, waterMaskTextureCoordinates).r;

            if (mask > 0.0) {
                vec2 noisyTranslation = waterMaskNoisyTranslationAndScale.xy;
                vec2 noisyScale = waterMaskNoisyTranslationAndScale.zw;
                vec2 noisyUv = vMapUv * noisyScale + noisyTranslation;
                noisyUv.y = 1.0 - noisyUv.y;

                diffuseColor = computeWaterColor(noisyUv, diffuseColor, mask, 0.8);
            }
        #endif
    `,
    water_mask_util_funcs: ``
};

// Merge the terrain shader chunks with THREE.ShaderChunk
Object.assign(THREE.ShaderChunk, terrainShaderChunks);

// Export types for better TypeScript support
export interface TerrainShaderExtensions {
    tinterrain_common: string;
    begin_tinterrain_vertex: string;
    discard_out_range_frag: string;
    water_mask_pars_fragment: string;
    water_mask_compute_color_fragment: string;
    water_mask_util_funcs: string;
}

export const TerrainShaders: TerrainShaderExtensions = terrainShaderChunks;