/* Copyright (C) 2025 flywave.gl contributors */

export default {
    atmospheric_scattering_vertex: `
    // 大气散射计算函数
    const float RayleighScaleDepth = 0.25;
    
    struct AtmosphereColor
    {
        vec3 mie;
        vec3 rayleigh;
    };

    float scale(float cosAngle)
    {
        float x = 1.0 - cosAngle;
        return RayleighScaleDepth * exp(-0.00287 + x*(0.459 + x*(3.83 + x*(-6.80 + x*5.25))));
    }

    float getNearSphereIntersect(vec3 v3Pos, vec3 v3Ray, float fCameraHeight2, float fOuterRadius2) {
        float fB = 2.0 * length(v3Pos) * dot(normalize(v3Pos), v3Ray);
        float fC = fCameraHeight2 - fOuterRadius2;
        float fDet = max(0.0, fB * fB - 4.0 * fC);
        return 0.5 * (-fB - sqrt(fDet));
    }

    AtmosphereColor computeAtmosphericScattering(
        vec3 worldPosition, 
        vec3 lightDirection, 
        vec3 cameraPosition,
        float innerRadius,
        float outerRadius
    ) {
        // 环境参数
        float fScale = 1.0 / (outerRadius - innerRadius);
        float fScaleOverScaleDepth = (fScale / RayleighScaleDepth);
        float fCameraHeight2 = dot(cameraPosition, cameraPosition);
        float fOuterRadius2 = outerRadius * outerRadius;

        // 计算光线方向和距离
        vec3 v3Ray = worldPosition - cameraPosition;
        float fFar = length(v3Ray);
        v3Ray /= fFar;

        // 计算最近交点
        float fNear = getNearSphereIntersect(cameraPosition, v3Ray, fCameraHeight2, fOuterRadius2);
        fFar -= fNear;

        // 计算起始点
        vec3 v3Start = cameraPosition + v3Ray * fNear;

        float fStartAngle = dot(v3Ray, v3Start) / outerRadius;
        float fStartDepth = exp(-1.0 / RayleighScaleDepth);
        float fStartOffset = fStartDepth * scale(fStartAngle);

        // 散射常量
        const float Pi = 3.141592653589793;
        const float Kr = 0.0025;
        const float Kr4PI = Kr * 4.0 * Pi;
        const float Km = 0.0015;
        const float Km4PI = Km * 4.0 * Pi;
        const float ESun = 15.0;
        const float KmESun = Km * ESun;
        const float KrESun = Kr * ESun;
        const vec3 InvWavelength = vec3(
            5.60204474633241,   // Red = 1.0 / Math.pow(0.650, 4.0)
            9.473284437923038,  // Green = 1.0 / Math.pow(0.570, 4.0)
            19.643802610477206  // Blue = 1.0 / Math.pow(0.475, 4.0)
        );

        const int nSamples = 2;
        const float fSamples = 2.0;

        // 采样计算
        float fSampleLength = fFar / fSamples;
        float fScaledLength = fSampleLength * fScale;
        vec3 v3SampleRay = v3Ray * fSampleLength;
        vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

        vec3 v3BaseColor = vec3(0.0);
        vec3 v3Attenuate = vec3(0.0);
        for(int i=0; i < nSamples; i++)
        {
            float height = length(v3SamplePoint);
            float depth = exp(fScaleOverScaleDepth * (innerRadius - height));
            float fLightAngle = dot(lightDirection, v3SamplePoint) / height;
            float fCameraAngle = dot(v3Ray, v3SamplePoint) / height;
            float fScatter = (fStartOffset + depth * (scale(fLightAngle) - scale(fCameraAngle)));
            v3Attenuate = exp(-fScatter * (InvWavelength * Kr4PI + Km4PI));
            v3BaseColor += v3Attenuate * (depth * fScaledLength);
            v3SamplePoint += v3SampleRay;
        }

        // 返回散射颜色
        AtmosphereColor color;
        color.mie = v3BaseColor * KmESun;
        color.rayleigh = v3BaseColor * (InvWavelength * KrESun);
        return color;
    }
    `,

    atmospheric_scattering_fragment: `
    // 相位函数
    float phaseFunction(float cosAngle, float g) {
        float g2 = g * g;
        return 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + cosAngle * cosAngle) / pow(1.0 + g2 - 2.0 * g * cosAngle, 1.5);
    }

    // 计算大气散射颜色
    vec3 calculateAtmosphericScattering(
        vec3 worldPosition,
        vec3 lightDirection,
        vec3 cameraPosition,
        vec3 baseColor,
        float innerRadius,
        float outerRadius
    ) {
        // 计算视角方向
        vec3 viewDirection = normalize(cameraPosition - worldPosition);
        float cosAngle = dot(lightDirection, viewDirection);
        
        // 使用相位函数
        float rayleighPhase = 0.75 * (1.0 + cosAngle * cosAngle);
        float miePhase = phaseFunction(cosAngle, -0.95);
        
        // 获取散射颜色（这里需要传入预先计算的散射值或者重新计算）
        // 简化版本，直接使用参数传入的散射颜色
        vec3 rayleighColor = baseColor * 0.25; // 瑞利散射贡献
        vec3 mieColor = baseColor * 0.75;      // 米氏散射贡献
        
        // 组合最终颜色
        vec3 scatteredColor = rayleighPhase * rayleighColor + miePhase * mieColor;
        
        // 距离衰减
        float distanceFactor = clamp(length(worldPosition - cameraPosition) / 1000000.0, 0.0, 1.0);
        float atmosphereAlpha = 1.0 - distanceFactor;
        
        return mix(baseColor, scatteredColor, atmosphereAlpha);
    }
    `
};
