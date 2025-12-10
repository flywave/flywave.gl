import { Color, ShaderMaterial, UniformsUtils, Vector3, Texture, UniformsLib, Matrix4, TextureLoader, RepeatWrapping, } from 'three';
class WaterMaterial extends ShaderMaterial {
    constructor(options = {}) {
        const alpha = options.alpha ?? 0.9;
        const initialTime = 0.0;
        const speed = options.speed ?? 1.0;
        const sunDirection = options.sunDirection ?? new Vector3(0.70707, 0.70707, 0.0);
        const sunColor = new Color(options.sunColor ?? 0xffffff);
        const waterColor = new Color(options.waterColor ?? 0x7F7F7F);
        const distortionScale = options.distortionScale ?? 20.0;
        const fog = options.fog ?? false;
        // Process normal map
        let normalSampler;
        if (options.normalMap instanceof Texture) {
            normalSampler = options.normalMap;
        }
        else if (typeof options.normalMap === 'string') {
            normalSampler = new TextureLoader().load(options.normalMap);
        }
        else {
            // Default normal map
            normalSampler = new TextureLoader().load('./waternormals.jpg');
        }
        normalSampler.wrapS = RepeatWrapping;
        normalSampler.wrapT = RepeatWrapping;
        const waterShader = {
            uniforms: UniformsUtils.merge([
                UniformsLib['fog'],
                UniformsLib['lights'],
                {
                    'normalSampler': { value: null },
                    'mirrorSampler': { value: null },
                    'alpha': { value: 0.9 },
                    'time': { value: 0.0 },
                    'size': { value: 2.0 },
                    'distortionScale': { value: 20.0 },
                    'watterNormal': {
                        value: new Vector3(-0.22354059905927112, 0.8579892843484154, -0.46247593290409833)
                    },
                    'camPosition': { value: new Vector3() },
                    'textureMatrix': { value: new Matrix4() },
                    'sunColor': { value: new Color(0x7F7F7F) },
                    'sunDirection': { value: new Vector3(0.70707, 0.70707, 0) },
                    'eye': { value: new Vector3() },
                    'waterColor': { value: new Color(0x555555) }
                }
            ]),
            vertexShader: /* glsl */ `
                uniform mat4 textureMatrix;
                uniform float time;

                varying vec4 mirrorCoord;
                varying vec4 worldPosition; 
                varying vec3 vPosition; 

                #include <common>
                #include <fog_pars_vertex>
                #include <shadowmap_pars_vertex>
                #include <logdepthbuf_pars_vertex>
                uniform vec4 camPosition;

                void main() {
                    mirrorCoord = modelMatrix * vec4( position, 1.0 ); 
                    vPosition = position;
                    worldPosition = mirrorCoord.xyzw;
                    mirrorCoord = textureMatrix * mirrorCoord;
                    vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
                    gl_Position = projectionMatrix * mvPosition;

                    #include <beginnormal_vertex>
                    #include <defaultnormal_vertex>
                    #include <logdepthbuf_vertex>
                    #include <fog_vertex>
                    #include <shadowmap_vertex>
                }`,
            fragmentShader: /* glsl */ `
                uniform sampler2D mirrorSampler;
                uniform float alpha;
                uniform float time;
                uniform float size;
                uniform float distortionScale;
                uniform sampler2D normalSampler;
                uniform vec3 sunColor;
                uniform vec3 sunDirection;
                uniform vec3 eye;
                uniform vec3 waterColor;

                varying vec4 mirrorCoord;
                varying vec4 worldPosition; 
                varying vec3 vPosition; 

                vec4 getNoise( vec2 uv ) {
                    vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
                    vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
                    vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
                    vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
                    vec4 noise = texture2D( normalSampler, uv0 ) +
                        texture2D( normalSampler, uv1 ) +
                        texture2D( normalSampler, uv2 ) +
                        texture2D( normalSampler, uv3 );
                    return noise * 0.5 - 1.0;
                }

                void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
                    vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
                    float direction = max( 0.0, dot( eyeDirection, reflection ) );
                    specularColor += pow( direction, shiny ) * sunColor * spec;
                    diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
                }

                #include <common>
                #include <packing>
                #include <bsdfs>
                #include <fog_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                #include <lights_pars_begin>
                #include <shadowmap_pars_fragment>
                #include <shadowmask_pars_fragment>

                uniform vec3 watterNormal;

                void main() {

                    #include <logdepthbuf_fragment>
                    vec4 noise = getNoise( vPosition.xy * size );
                    vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.5, 1.5 ) );

                    vec3 diffuseLight = vec3(0.0);
                    vec3 specularLight = vec3(0.0);

                    vec3 worldToEye = eye-worldPosition.xyz;
                    vec3 eyeDirection = normalize( watterNormal);
                    sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

                    float distance = length(worldToEye);

                    vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
                    vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );

                    float theta = max( dot( eyeDirection, surfaceNormal ), 0.1 );
                    float rf0 = 0.3;
                    float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
                    vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
                    vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
                    vec3 outgoingLight = albedo;
                    gl_FragColor = vec4( outgoingLight, alpha );

                    #include <tonemapping_fragment>
                    #include <fog_fragment>
                }`
        };
        super({
            fragmentShader: waterShader.fragmentShader,
            vertexShader: waterShader.vertexShader,
            uniforms: UniformsUtils.clone(waterShader.uniforms),
            transparent: true,
            fog: fog,
            lights: true
        });
        this._time = initialTime;
        this._speed = speed;
        this._lastUpdateTime = performance.now() / 1000;
        // Set uniforms
        this.uniforms['alpha'].value = alpha;
        this.uniforms['time'].value = this._time;
        this.uniforms['normalSampler'].value = normalSampler;
        this.uniforms['sunColor'].value = sunColor;
        this.uniforms['waterColor'].value = waterColor;
        this.uniforms['sunDirection'].value = sunDirection;
        this.uniforms['distortionScale'].value = distortionScale;
    }
    updateTime() {
        const currentTime = performance.now() / 1000;
        const deltaTime = currentTime - this._lastUpdateTime;
        this._time += deltaTime * this._speed;
        this._lastUpdateTime = currentTime;
        this.uniforms['time'].value = this._time;
    }
    onBeforeRender(renderer, scene, camera, geometry, object, group) {
        this.updateTime();
    }
    // Set mirror sampler (reflection map)
    setMirrorSampler(texture) {
        this.uniforms['mirrorSampler'].value = texture;
    }
    // Set camera position
    setCameraPosition(position) {
        this.uniforms['eye'].value.copy(position);
        this.uniforms['camPosition'].value.copy(position);
    }
    // Set texture matrix
    setTextureMatrix(matrix) {
        this.uniforms['textureMatrix'].value.copy(matrix);
    }
    // Getters and setters
    get time() {
        return this._time;
    }
    set time(value) {
        this._time = value;
        this.uniforms['time'].value = value;
    }
    get speed() {
        return this._speed;
    }
    set speed(value) {
        this._speed = value;
    }
    get alpha() {
        return this.uniforms['alpha'].value;
    }
    set alpha(value) {
        this.uniforms['alpha'].value = value;
    }
    get distortionScale() {
        return this.uniforms['distortionScale'].value;
    }
    set distortionScale(value) {
        this.uniforms['distortionScale'].value = value;
    }
    get sunDirection() {
        return this.uniforms['sunDirection'].value;
    }
    set sunDirection(value) {
        this.uniforms['sunDirection'].value.copy(value);
    }
    get sunColor() {
        return this.uniforms['sunColor'].value;
    }
    set sunColor(value) {
        this.uniforms['sunColor'].value.copy(value);
    }
    get waterColor() {
        return this.uniforms['waterColor'].value;
    }
    set waterColor(value) {
        this.uniforms['waterColor'].value.copy(value);
    }
    dispose() {
        if (this.uniforms.normalSampler.value) {
            this.uniforms.normalSampler.value.dispose();
        }
        if (this.uniforms.mirrorSampler.value) {
            this.uniforms.mirrorSampler.value.dispose();
        }
        super.dispose();
    }
}
export { WaterMaterial };
