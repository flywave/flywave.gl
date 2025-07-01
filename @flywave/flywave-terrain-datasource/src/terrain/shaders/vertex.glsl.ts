interface VertexShaderParams {
    useOctNormal?: boolean;
}

const vertexShader = (params?: VertexShaderParams) => `
varying float vAltitude;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 v_positionEC;
varying vec3 v_positionMC;
varying vec3 vObjectNormal;

attribute vec2 octNormal;
attribute vec4 textureCoordAndEncodedNormals;

uniform bool useOctNormal;
uniform bool isWebMercator;
uniform vec4 imageUvTransfrom;
uniform vec4 u_waterMaskTranslationAndScale;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

#include <fog_pars_vertex>

// 水相关函数
float czm_signNotZero(float value) {
    return value >= 0.0 ? 1.0 : -1.0;
}

vec2 czm_signNotZero(vec2 value) {
    return vec2(czm_signNotZero(value.x), czm_signNotZero(value.y));
}

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

vec3 oct_to_float32x3(vec2 e) {
    vec3 v = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
    if (v.z < 0.0) {
        v.xy = (1.0 - abs(v.yx)) * czm_signNotZero(v.xy);
    }
    return normalize(v);
}

vec2 snorm_to_float32x2(vec2 s) {
    vec2 v = ((s / 255.0) * 2.0) - 1.0;
    return v;
}

void main() {
    vAltitude = position.z;
    vec2 textureCoordinates = isWebMercator ? 
        textureCoordAndEncodedNormals.xz : 
        textureCoordAndEncodedNormals.xy;

    // 纹理坐标变换
    float height_u = textureCoordinates.x * imageUvTransfrom.x + imageUvTransfrom.z;
    float height_v = textureCoordinates.y * imageUvTransfrom.y + imageUvTransfrom.w;
    vUv = vec2(height_u, height_v);

    // 法线处理
    if (useOctNormal) {
        vec2 floatOctNormal = snorm_to_float32x2(octNormal);
        vec3 decNormal = oct_to_float32x3(floatOctNormal);
        vNormal = decNormal;
        vObjectNormal = decNormal;
    } else {
        vNormal = normal;
        vObjectNormal = normal;
    }

    // 水相关位置计算
    v_positionMC = position;
    v_positionEC = (modelViewMatrix * vec4(position, 1.0)).xyz;

    // 水掩模纹理坐标
    vec2 waterMaskTranslation = u_waterMaskTranslationAndScale.xy;
    vec2 waterMaskScale = u_waterMaskTranslationAndScale.zw;
    vec2 waterMaskTextureCoordinates = textureCoordinates * waterMaskScale + waterMaskTranslation;
    waterMaskTextureCoordinates.y = 1.0 - waterMaskTextureCoordinates.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
}
`;

export default vertexShader;
