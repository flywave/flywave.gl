import * as THREE from "three";

Object.assign(THREE.ShaderChunk, {
    "terrain_pars_vert": ` 
        vec4 computeMvPos(vec2 uv){
            float dx = position.x;
            vec4 pos;
            bool uIsSimplePatch = pack[0][3]>0.0;
           if(uIsSimplePatch){
            vec4 pos1 = uPatchPos[0] + uPatchPos[1]*dx;
            vec4 pos2 = uPatchPos[2] + uPatchPos[3]*dx;
              pos = pos1 + (pos2 - pos1)*position.y;  
             pos.w = 1.0; 
            }else{
                pos = vec4( position, 1.0 );  
            }
    
            vec4 cPos4 = modelViewMatrix * pos;  
            vec4 dhPos = normalize(cPos4 - vec4(uGlobePosition.xyz*10.0,0.0));
            float height = elevation(vec2(.0,.0))+position.z;
            cPos4.x += dhPos.x*height;
            cPos4.y += dhPos.y*height;
            cPos4.z += dhPos.z*height;
            cPos4.w=1.0; 
            return cPos4;
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
    `,
    "terrain_simple_vert": `    
        gl_Position = projectionMatrix * computeMvPos(uv); 
        
        transformed = (inverse(modelViewMatrix)*computeMvPos(uv)).xyz;
        
        vec3 uUvTransform = pack[0].xyz;

        float height_u = uv.x*uUvTransform.x + uUvTransform.z;
        float height_v = uv.y*uUvTransform.x + uUvTransform.y;  

        vUv =  vec2(height_u, height_v);  
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
          objectNormal = vec3(0.0,0.0,-1.0); 
        }else{
            vec3 modelPos = mat3_emu(modelMatrix)*position;
          objectNormal = vec3(0.0,0.0,-1.0); 
        }
    `,
    "terrain_common_pars": `
        uniform vec4 uGlobePosition;
        uniform vec3 uCameraPosition;
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


        mat4 inverse(mat4 m) {
            float
                a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
                a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
                a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
                a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],
        
                b00 = a00 * a11 - a01 * a10,
                b01 = a00 * a12 - a02 * a10,
                b02 = a00 * a13 - a03 * a10,
                b03 = a01 * a12 - a02 * a11,
                b04 = a01 * a13 - a03 * a11,
                b05 = a02 * a13 - a03 * a12,
                b06 = a20 * a31 - a21 * a30,
                b07 = a20 * a32 - a22 * a30,
                b08 = a20 * a33 - a23 * a30,
                b09 = a21 * a32 - a22 * a31,
                b10 = a21 * a33 - a23 * a31,
                b11 = a22 * a33 - a23 * a32,
        
                det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        
            return mat4(
                a11 * b11 - a12 * b10 + a13 * b09,
                a02 * b10 - a01 * b11 - a03 * b09,
                a31 * b05 - a32 * b04 + a33 * b03,
                a22 * b04 - a21 * b05 - a23 * b03,
                a12 * b08 - a10 * b11 - a13 * b07,
                a00 * b11 - a02 * b08 + a03 * b07,
                a32 * b02 - a30 * b05 - a33 * b01,
                a20 * b05 - a22 * b02 + a23 * b01,
                a10 * b10 - a11 * b08 + a13 * b06,
                a01 * b08 - a00 * b10 - a03 * b06,
                a30 * b04 - a31 * b02 + a33 * b00,
                a21 * b02 - a20 * b04 - a23 * b00,
                a11 * b07 - a10 * b09 - a12 * b06,
                a00 * b09 - a01 * b07 + a02 * b06,
                a31 * b01 - a30 * b03 - a32 * b00,
                a20 * b03 - a21 * b01 + a22 * b00) / det;
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