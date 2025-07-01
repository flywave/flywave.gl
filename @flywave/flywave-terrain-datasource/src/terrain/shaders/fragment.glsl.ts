interface FragmentShaderVars {
    COLOR_STEPS_COUNT: number;
    SHOW_REFLECTIVE_OCEAN?: boolean;
}

// 水掩模相关的shader chunks
const waterMaskChunks = {
    pars_vertex: `
#ifdef SHOW_REFLECTIVE_OCEAN
    varying vec3 v_positionEC;
    varying vec3 v_positionMC;
    varying vec3 vObjectNormal;
#endif
    `,

    vertex: `
#ifdef SHOW_REFLECTIVE_OCEAN
    v_positionMC = position;
    v_positionEC = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vObjectNormal = normal;
#endif
    `,

    pars_fragment: `
#ifdef SHOW_REFLECTIVE_OCEAN
    uniform sampler2D u_waterMask;
    uniform sampler2D normalSampler;
    uniform float frameNumber; 
    uniform vec4 u_waterMaskTranslationAndScale;   
    uniform vec4 u_waterMaskNoisyTranslationAndScale;   
    
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

        vec3 diffuseHighlight = waveHighlightColor * maskValue  * (1.0 - fade);
        float tsPerturbationRatio = normalTangentSpace.z;
        vec3 nonDiffuseHighlight = waveHighlightColor * 5.0 * (1.0 - tsPerturbationRatio);
 
        vec3 color = imageryColor.rgb + diffuseHighlight + nonDiffuseHighlight;
        return vec4(color, imageryColor.a);
    }
#endif 
    `,

    compute_color: `
#ifdef SHOW_REFLECTIVE_OCEAN
    vec2 waterMaskTranslation = u_waterMaskTranslationAndScale.xy;
    vec2 waterMaskScale = u_waterMaskTranslationAndScale.zw;
    vec2 waterMaskTextureCoordinates = vUv * waterMaskScale + waterMaskTranslation;
    waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y;
 
    float mask = texture2D(u_waterMask, waterMaskTextureCoordinates).r; 

    if (mask > 0.0) {  
        mat3 enuToEye = eastNorthUpToEyeCoordinates(v_positionMC, normalMatrix * vObjectNormal); 

        vec2 waterMaskTranslation = u_waterMaskNoisyTranslationAndScale.xy;
        vec2 waterMaskScale = u_waterMaskNoisyTranslationAndScale.zw;
        vec2 waterMaskTextureCoordinates = vUv * waterMaskScale + waterMaskTranslation;
        waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y; 

        gl_FragColor = computeWaterColor(v_positionEC, waterMaskTextureCoordinates, enuToEye, gl_FragColor, mask, 0.8);
    }
#endif
    `
};

// 顶点着色器
export const vertexShader = (vars: FragmentShaderVars) => `
#define COLOR_STEPS_COUNT ${vars.COLOR_STEPS_COUNT}

attribute float altitude;
attribute vec2 uv2;  // 用于水掩模的额外UV

varying float vAltitude;
varying vec2 vUv;
varying vec3 vNormal;

${vars.SHOW_REFLECTIVE_OCEAN ? waterMaskChunks.pars_vertex : ""}

void main() {
    vUv = uv;
    vNormal = normal;
    vAltitude = altitude;

    ${vars.SHOW_REFLECTIVE_OCEAN ? waterMaskChunks.vertex : ""}

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 片元着色器
export const fragmentShader = (vars: FragmentShaderVars) => `
#define COLOR_STEPS_COUNT ${vars.COLOR_STEPS_COUNT}

varying float vAltitude;
varying vec2 vUv;
varying vec3 vNormal;

uniform vec3 colorSteps[COLOR_STEPS_COUNT];
uniform float altitudeSteps[COLOR_STEPS_COUNT];

uniform sampler2D texture;
uniform int hasTexture;
uniform float textureIntensity;
uniform vec3 lightVector;
uniform float opacity;

uniform vec3 clipUvTransfrom;
uniform mat3 normalMatrix;

${vars.SHOW_REFLECTIVE_OCEAN ? waterMaskChunks.pars_fragment : ""}

#include <fog_pars_fragment>

void main() {
    vec2 tUv = vec2((vUv.xy - clipUvTransfrom.zy) / clipUvTransfrom.xx);
    if(tUv.x > 1.002 || tUv.y > 1.002 || tUv.x < -0.002 || tUv.y < -0.002) {
        discard;
    }

    vec3 altitudeColor;
    float lowestAltitude = altitudeSteps[0];
    float highestAltitude = altitudeSteps[COLOR_STEPS_COUNT - 1];
    vec3 lowestAltitudeColor = colorSteps[0];
    vec3 highestAltitudeColor = colorSteps[COLOR_STEPS_COUNT - 1];

    if (vAltitude < lowestAltitude) {
        altitudeColor = lowestAltitudeColor;
    } else if (vAltitude > highestAltitude) {
        altitudeColor = highestAltitudeColor;
    } else {
        for(int i = 0; i < COLOR_STEPS_COUNT - 1; i++) {
            if (vAltitude > altitudeSteps[i] && vAltitude <= altitudeSteps[i + 1]) {
                float ratio = (vAltitude - altitudeSteps[i]) / (altitudeSteps[i + 1] - altitudeSteps[i]);
                altitudeColor = mix(colorSteps[i], colorSteps[i + 1], ratio);
                break;
            }
        }
    }

    if (hasTexture == 1) {
        vec4 texColor = texture2D(texture, vUv);
        gl_FragColor = vec4(mix(altitudeColor, texColor.rgb, textureIntensity), opacity);
    } else {
        vec3 lightDir = normalize(lightVector);
        float NdotL = clamp(dot(vNormal, lightDir), 0.3, 1.0);
        gl_FragColor = vec4(altitudeColor * NdotL, opacity);
    }

    ${vars.SHOW_REFLECTIVE_OCEAN ? waterMaskChunks.compute_color : ""}

    #include <fog_fragment>
}
`;
