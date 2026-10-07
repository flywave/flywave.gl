/* Copyright (C) 2025 flywave.gl contributors */

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

    // Temporary variable declarations (kept in sync with the new version)
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
        
        // Keep your simplified lighting logic
        #if defined(USE_SHADOWMAP)
            reflectedLight.directDiffuse = (0.5 * directLight.color + vec3(0.5,0.5,0.5)) * material.diffuseColor;
        #else
            reflectedLight.directDiffuse = material.diffuseColor;
        #endif
        
        // Disable direct specular
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
        
        // Disable the indirect diffuse contribution
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
        
        // Disable specular reflection
        reflectedLight.indirectSpecular = vec3(0.0);
        
        #ifdef USE_CLEARCOAT
            clearcoatSpecularIndirect = vec3(0.0);
        #endif
        
        #ifdef USE_SHEEN
            sheenSpecularIndirect = vec3(0.0);
        #endif
    }

    // Rect area light functions (disabled)
    #if NUM_RECT_AREA_LIGHTS > 0
    void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, 
        const in vec3 geometryPosition, 
        const in vec3 geometryNormal, 
        const in vec3 geometryViewDir, 
        const in vec3 geometryClearcoatNormal, 
        const in PhysicalMaterial material, 
        inout ReflectedLight reflectedLight ) {
        
        // Disable rect area light
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.directSpecular = vec3(0.0);
    }
    #endif

    #define RE_Direct               RE_Direct_Physical
    #define RE_Direct_RectArea      RE_Direct_RectArea_Physical
    #define RE_IndirectDiffuse      RE_IndirectDiffuse_Physical
    #define RE_IndirectSpecular     RE_IndirectSpecular_Physical
`;
