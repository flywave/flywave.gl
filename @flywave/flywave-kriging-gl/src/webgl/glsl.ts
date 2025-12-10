/* Copyright (C) 2025 flywave.gl contributors */

export const vertexShader = ` 
varying vec2 vUv;

void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 1.0);
}
`;

export const fragmentShader = `
precision highp float;

uniform sampler2D u_variogramMxyTexture;
uniform vec2 u_variogramMxySize;
uniform vec4 u_gridInfo;
uniform vec2 u_outputSize;
uniform vec4 u_variogramParam;
uniform float u_model;
uniform float u_dimension;
uniform float u_encodingType;

varying vec2 vUv;

#define MODEL_GAUSSIAN 1.0
#define MODEL_EXPONENTIAL 2.0  
#define MODEL_SPHERICAL 3.0

struct VariogramParams {
    float nugget;
    float range;
    float sill;
    float A;
};

// 变差函数模型（保持原样）
float variogramGaussian(float h, VariogramParams params) {
    if (h == 0.0) return params.nugget;
    float hr = h / params.range;
    return params.nugget + ((params.sill - params.nugget) / params.range) *
        (1.0 - exp(-(1.0 / params.A) * (hr * hr)));
}

// 修复指数模型  
float variogramExponential(float h, VariogramParams params) {
    if (h == 0.0) return params.nugget;
    float hr = h / params.range;
    return params.nugget + ((params.sill - params.nugget) / params.range) *
        (1.0 - exp(-(1.0 / params.A) * hr));
}

// 修复球状模型
float variogramSpherical(float h, VariogramParams params) {
    if (h == 0.0) return params.nugget;
    float hr = h / params.range;
    if (hr > 1.0) return params.sill;
    return params.nugget + ((params.sill - params.nugget) / params.range) *
        (1.5 * hr - 0.5 * hr * hr * hr);
}

float computeVariogram(float h, float model, VariogramParams params) {
    if (model == MODEL_GAUSSIAN) {
        return variogramGaussian(h, params);
    } else if (model == MODEL_EXPONENTIAL) {
        return variogramExponential(h, params);
    } else {
        return variogramSpherical(h, params);
    }
}

vec4 lookupTexture(float index) {
    float width = u_variogramMxySize.x;
    float height = u_variogramMxySize.y;
    float col = mod(index, width);
    float row = floor(index / width);
    vec2 uv = (vec2(col, row) + 0.5) / u_variogramMxySize;
    return texture2D(u_variogramMxyTexture, uv);
}

// DEM编码函数保持不变
vec3 encodeMapbox(float height) {
    vec4 vector = vec4(6553.6, 25.6, 0.1, 10000.0);
    vec3 color; 
    float v = floor((height + vector.w) / vector.z); 
    color.b = mod(v, 256.0);
    v = floor(v / 256.0); 
    color.g = mod(v, 256.0);
    v = floor(v / 256.0); 
    color.r = v;  
    return color / 255.0;
}

vec3 encodeTerrarium(float height) {
    float encoded = (height + 32768.0) * 256.0;
    float r = floor(encoded / (256.0 * 256.0));
    float g = floor((encoded - r * 256.0 * 256.0) / 256.0);
    float b = encoded - r * 256.0 * 256.0 - g * 256.0;
    return vec3(r, g, b) / 255.0;
}

vec3 encodeDEM(float height, float encoding) {
    if (encoding == 1.0) { // mapbox
        return encodeMapbox(height);
    } else { // terrarium
        return encodeTerrarium(height);
    }
}

void main() {
    // 坐标计算
    float pixelX = vUv.x * u_outputSize.x;
    float pixelY = (1.0 - vUv.y) * u_outputSize.y;
    
    float worldX = u_gridInfo.x + pixelX * u_gridInfo.z;
    float worldY = u_gridInfo.y + pixelY * u_gridInfo.w;
    
    VariogramParams params = VariogramParams(
        u_variogramParam.x, // nugget
        u_variogramParam.y, // range
        u_variogramParam.z, // sill
        u_variogramParam.w  // A
    );
    
    float prediction = 0.0;
    int n = int(u_dimension);
    
    // 修复：按照kriging.js算法实现
    for(int i = 0; i < 1024; i++) {
        if(i >= n) break;
        
        // 获取样本点数据
        vec4 sampleData = lookupTexture(float(i));
        float weight = sampleData.x;      // M[i] - 克里金权重
        float sampleX = sampleData.y;     // x[i] - 样本点x坐标
        float sampleY = sampleData.z;     // y[i] - 样本点y坐标
        
        // 计算预测点到样本点的距离
        float dx = worldX - sampleX;
        float dy = worldY - sampleY;
        float distance = sqrt(dx * dx + dy * dy);
        
        // 计算变差函数值（对应kriging.js中的k[i]）
        float k = computeVariogram(distance, u_model, params);
        
        // 点积：k * M（对应kriging.js的kriging._dot(k, variogram.M)）
        prediction += k * weight;
    }
    
    // DEM编码
    vec3 demColor = encodeDEM(prediction, u_encodingType);
    gl_FragColor = vec4(demColor, 1.0);
}
`;
