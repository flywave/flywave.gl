export const simpleLightingShadowChunk = `
    struct PhysicalMaterial {
        vec3 diffuseColor;
        float roughness;
        vec3 specularColor;
        float specularF90;

        #ifdef USE_CLEARCOAT
            float clearcoat;
            float clearcoatRoughness;
            vec3 clearcoatF0;
            float clearcoatF90;
        #endif

        #ifdef USE_SHEEN
            vec3 sheenColor;
            float sheenRoughness;
        #endif

        #ifdef USE_IRIDESCENCE
            float iridescence;
            float iridescenceIOR;
            float iridescenceThickness;
            vec3 iridescenceFresnel;
            vec3 iridescenceF0;
        #endif

        #ifdef IOR
            float ior;
        #endif

        #ifdef USE_TRANSMISSION
            float transmission;
            float transmissionAlpha;
            float thickness;
            float attenuationDistance;
            vec3 attenuationColor;
        #endif

        #ifdef USE_ANISOTROPY
            float anisotropy;
            float alphaT;
            vec3 anisotropyT;
            vec3 anisotropyB;
        #endif
    };

    // 临时变量声明（与新版本保持一致）
    vec3 clearcoatSpecularDirect = vec3( 0.0 );
    vec3 clearcoatSpecularIndirect = vec3( 0.0 );
    vec3 sheenSpecularDirect = vec3( 0.0 );
    vec3 sheenSpecularIndirect = vec3(0.0);

    #define DEFAULT_SPECULAR_COEFFICIENT 0.04

    void RE_Direct_Physical( const in IncidentLight directLight,
        const in vec3 geometryPosition, 
        const in vec3 geometryNormal, 
        const in vec3 geometryViewDir, 
        const in vec3 geometryClearcoatNormal, 
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight ) {
        
        // 保持你的简化光照逻辑
        #if defined(USE_SHADOWMAP)
            reflectedLight.directDiffuse = (0.5 * directLight.color + vec3(0.5,0.5,0.5)) * material.diffuseColor;
        #else
            reflectedLight.directDiffuse = material.diffuseColor;
        #endif
        
        // 禁用直接高光
        reflectedLight.directSpecular = vec3(0.0);
        
        #ifdef USE_CLEARCOAT
            clearcoatSpecularDirect = vec3(0.0);
        #endif
        
        #ifdef USE_SHEEN
            sheenSpecularDirect = vec3(0.0);
        #endif
    }

    void RE_IndirectDiffuse_Physical( const in vec3 irradiance,
        const in vec3 geometryPosition, 
        const in vec3 geometryNormal, 
        const in vec3 geometryViewDir, 
        const in vec3 geometryClearcoatNormal, 
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight ) {
        
        // 禁用间接漫反射影响
        // reflectedLight.indirectDiffuse += vec3(0.0);
    }

    void RE_IndirectSpecular_Physical( const in vec3 radiance, 
        const in vec3 irradiance, 
        const in vec3 clearcoatRadiance,
        const in vec3 geometryPosition, 
        const in vec3 geometryNormal, 
        const in vec3 geometryViewDir, 
        const in vec3 geometryClearcoatNormal, 
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight) {
        
        // 禁用镜面反射
        reflectedLight.indirectSpecular = vec3(0.0);
        
        #ifdef USE_CLEARCOAT
            clearcoatSpecularIndirect = vec3(0.0);
        #endif
        
        #ifdef USE_SHEEN
            sheenSpecularIndirect = vec3(0.0);
        #endif
    }

    // 矩形区域光函数（禁用）
    #if NUM_RECT_AREA_LIGHTS > 0
    void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, 
        const in vec3 geometryPosition, 
        const in vec3 geometryNormal, 
        const in vec3 geometryViewDir, 
        const in vec3 geometryClearcoatNormal, 
        const in PhysicalMaterial material, 
        inout ReflectedLight reflectedLight ) {
        
        // 禁用矩形区域光
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.directSpecular = vec3(0.0);
    }
    #endif

    #define RE_Direct               RE_Direct_Physical
    #define RE_Direct_RectArea      RE_Direct_RectArea_Physical
    #define RE_IndirectDiffuse      RE_IndirectDiffuse_Physical
    #define RE_IndirectSpecular     RE_IndirectSpecular_Physical
`;