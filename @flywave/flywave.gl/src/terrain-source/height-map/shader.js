import * as THREE from "three";

Object.assign(THREE.ShaderChunk, {
    "terrain_pars_vert": ` 
        vec4 computeMvPos(vec2 uv){
            float dx = position.x;
            vec4 pos;
            bool uIsSimplePatch = pack[0][3]>0.0;
            vec3 tNormal;
        if(uIsSimplePatch){
            vec4 pos1 = uPatchPos[0] + uPatchPos[1]*dx;
            vec4 pos2 = uPatchPos[2] + uPatchPos[3]*dx;
            pos = pos1 + (pos2 - pos1)*position.y;  
            pos.w = 1.0; 

            
            tNormal = normalize(cross(uPatchPos[0].xyz,uPatchPos[3].xyz));
            }else{
                pos = vec4( position, 1.0 );  
            }

            float height = elevation(vec2(.0,.0))+position.z;

            pos += height * vec4(tNormal,.0)/6378137.0; 
            pos.w=1.0;  
            return pos; 
    }
    `,
    // "terrain_color_pars_fragment": ` 
    //     varying vec2 uvRaw; 
    //     #if defined( USE_COLOR_ALPHA ) 
    //         varying vec4 vColor; 
    //     #elif defined( USE_COLOR ) 
    //         varying vec3 vColor; 
    //     #endif
    // `,
    // "terrain_premultiplied_alpha_fragment": `
    //         if(uvRaw.x<=0.00001||uvRaw.y<=0.00001){
    //             gl_FragColor.a*=opacity/2.0;
    //         }
    //         #ifdef PREMULTIPLIED_ALPHA

    //         // Get get normal blending with premultipled, use with CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation.
    //         gl_FragColor.rgb *= gl_FragColor.a;

    //     #endif 
    // `,
    "terrain_proj": `
        vec4 mvPosition = vec4( transformed, 1.0 );

        #ifdef USE_INSTANCING
        
            mvPosition = instanceMatrix * mvPosition;
        
        #endif
        
        mvPosition = modelViewMatrix * mvPosition;
        
        gl_Position = projectionMatrix * mvPosition;
    `,
    "terrain_simple_vert": `      
        transformed = computeMvPos(uv).xyz;
        
        vec3 uUvTransform = pack[0].xyz;

        float height_u = uv.x*uUvTransform.x + uUvTransform.z;
        float height_v = uv.y*uUvTransform.x + uUvTransform.y;  
        #ifdef USE_UV
        vUv =  vec2(height_u, height_v);  
        #endif
        
        #ifdef USE_GT_151
        vMapUv = vec2(height_u, height_v);  
        #endif
    `,
    "beginnormal_terrain_vertex": `  
 
        vec3 uHeightMapPos = pack[2].xyz;
        
        float e = 1.0/(256.0/uHeightMapPos.x);
        vec2 v1 = vec2(-e,-e); 
        vec2 v2 = vec2(e,e);
        vec2 v3 = vec2(-e,e);
        vec2 v4 = vec2(e,-e);

        vec3 edge1 = vec3(-1.0,-1.0,elevation(v1));
        vec3 edge2 = vec3(1.0,1.0,elevation(v2));
        vec3 edge3 = vec3(-1.0,1.0,elevation(v3));
        vec3 edge4 = vec3(1.0,-1.0,elevation(v4));

        vec3 n1 = edge1 - edge2;
        vec3 n2 = edge3 - edge4;
 
        float dx = position.x;
        vec4 pos;
        bool uIsSimplePatch = pack[0][3]>0.0;
       if(uIsSimplePatch){ 
            objectNormal = normalize(cross(uPatchPos[0].xyz,uPatchPos[3].xyz));
       }
    //    else{
    //         vec3 modelPos = mat3_emu(modelMatrix)*position;
    //       objectNormal = normalize(position.xyz); 
    //     }
    `,
    "terrain_common_pars": `
        uniform vec4 uGlobePosition;
        uniform sampler2D uHeighMapTexture; 
     `,
    "terrain_common": `

        uniform mat4 uPatchPos;
        uniform vec3 uNormal;
        uniform float opacity;  

        // uniform bool uIsSimplePatch; 
        // uniform vec3 uUvTransform;
        // uniform vec4 uDemUnpack; 
        // uniform vec3 uHeightMapPos; 
        uniform mat4 pack; 

        mat3 mat3_emu(mat4 m4) {
            return mat3(
                m4[0][0], m4[0][1], m4[0][2],
                m4[1][0], m4[1][1], m4[1][2],
                m4[2][0], m4[2][1], m4[2][2]);
        } 

        vec2 tileUvToDemSample() {
            vec3 uHeightMapPos = pack[2].xyz;
            float height_u = uv.x*uHeightMapPos.x + uHeightMapPos.z;
            float height_v = uv.y*uHeightMapPos.x + uHeightMapPos.y; 
            return vec2(height_u, height_v);
        }

        float decodeElevation(vec4 v) {   
           vec4 uDemUnpack = pack[1];
            return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
        }

        float currentElevation(vec2 uv) {
            vec2 pos = tileUvToDemSample()+uv;
            return decodeElevation(texture2D(uHeighMapTexture, pos)); 
        } 
        float elevation(vec2 uv) {
            return currentElevation(uv);
        } 
    `
});