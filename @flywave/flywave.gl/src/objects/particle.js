import { Box3, BoxGeometry, BufferAttribute, Color, Mesh, ShaderMaterial, Vector3 } from "three";
import raindrop2flip from "../image/raindrop2flip.png";
import smokeparticle from "../image/smokeparticle.png";
import snowflake from "../image/snowflake.png";
import spark from "../image/spark.png";
import spikey from "../image/spikey.png";
import star from "../image/star.png";
import smoke from "../image/smoke.png";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";

class Tween {
    constructor(timeArray, valueArray) {
        this.times = timeArray || [];
        this.values = valueArray || [];
    }

    lerp(t) {
        var i = 0;
        var n = this.times.length;
        while (i < n && t > this.times[i])
            i++;
        if (i == 0) return this.values[0];
        if (i == n) return this.values[n - 1];
        var p = (t - this.times[i - 1]) / (this.times[i] - this.times[i - 1]);
        if (this.values[0] instanceof THREE.Vector3)
            return this.values[i - 1].clone().lerp(this.values[i], p);
        else // its a float
            return this.values[i - 1] + p * (this.values[i] - this.values[i - 1]);
    }
}

const particleVertexShader = `   
    attribute vec3  customColor;
    attribute float customOpacity;
    attribute float customSize;
    attribute float customAngle;
    attribute float customVisible;
    varying vec4  vColor;
    varying float vAngle;
    void main(){
        if ( customVisible > 0.5 )
            vColor = vec4( customColor, customOpacity );
        else
            vColor = vec4(0.0, 0.0, 0.0, 0.0);
        vAngle = customAngle;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_PointSize = customSize * ( 300.0 / length( mvPosition.xyz ) );
        gl_Position = projectionMatrix * mvPosition;
    }
`
const particleFragmentShader = `
    uniform sampler2D texture;
    varying vec4 vColor;
    varying float vAngle;
    void main(){
        gl_FragColor = vColor;
        float c = cos(vAngle);
        float s = sin(vAngle);
        vec2 rotatedUV = vec2(c * (gl_PointCoord.x - 0.5) + s * (gl_PointCoord.y - 0.5) + 0.5,
            c * (gl_PointCoord.y - 0.5) - s * (gl_PointCoord.x - 0.5) + 0.5);
        vec4 rotatedTexture = texture2D( texture,  rotatedUV );
        gl_FragColor = gl_FragColor * rotatedTexture; 
        if(gl_FragColor.a<=0.1)discard;
    }
`
class Particle {
    position = new Vector3();
    velocity = new Vector3();
    acceleration = new Vector3();
    angle = 0;
    angleVelocity = 0;
    angleAcceleration = 0;
    size = 16.0;
    color = new Color();
    opacity = 1.0;
    age = 0;
    alive = 0;

    update(dt) {
        this.position.add(this.velocity.clone().multiplyScalar(dt));
        this.velocity.add(this.acceleration.clone().multiplyScalar(dt));

        this.angle += this.angleVelocity * 0.01745329251 * dt;
        this.angleVelocity += this.angleAcceleration * 0.01745329251 * dt;

        this.age += dt;

        if (this.sizeTween.times.length > 0)
            this.size = this.sizeTween.lerp(this.age);

        if (this.colorTween.times.length > 0) {
            var colorHSL = this.colorTween.lerp(this.age);
            this.color = new THREE.Color().setHSL(colorHSL.x, colorHSL.y, colorHSL.z);
        }

        if (this.opacityTween.times.length > 0)
            this.opacity = this.opacityTween.lerp(this.age);
    }
}

const TYPE = { CUBE: 1, SPHERE: 2 };

var _projScreenMatrix = new THREE.Matrix4();

class ParticleSystem extends THREE.Object3D {
    type = "particle"

    clock = new THREE.Clock();

    positionStyle = TYPE.CUBE;

    positionBase = new Vector3();

    positionSpread = new Vector3();

    positionRadius = 0;

    velocityStyle = TYPE.CUBE;

    velocityBase = new Vector3();

    velocitySpread = new Vector3();

    speedBase = 0;

    speedSpread = 0;

    accelerationBase = new Vector3();
    accelerationSpread = new Vector3();

    angleBase = 0;
    angleSpread = 0;
    angleVelocityBase = 0;
    angleVelocitySpread = 0;
    angleAccelerationBase = 0;
    angleAccelerationSpread = 0;

    sizeBase = 0;
    sizeSpread = 0;

    sizeTween = new Tween();

    colorBase = new Vector3(0.0, 1.0, 0.5);
    colorSpread = new Vector3(0.0, 0.0, 0.0);
    colorTween = new Tween();

    opacityBase = 1.0;
    opacitySpread = 0.0;
    opacityTween = new Tween();

    blendStyle = THREE.NormalBlending;

    particleArray = [];
    particlesPerSecond = 100;
    particleDeathAge = 1.0;

    emitterAge = 0.0;
    emitterAlive = true;
    emitterDeathAge = 60;

    particleCount = this.particlesPerSecond * Math.min(this.particleDeathAge, this.emitterDeathAge);


    particleGeometry = new THREE.BufferGeometry;

    particleMaterial = new ShaderMaterial({
        uniforms: {
            texture: { type: "t", value: this.particleTexture }
        },
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        blending: THREE.NormalBlending,
        alphaTest: 0.5,
        depthTest: true,
    });

    setValues(parameters) {
        if (parameters === undefined) return;

        this.sizeTween = new Tween();
        this.colorTween = new Tween();
        this.opacityTween = new Tween();

        for (var key in parameters) {
            this[key] = parameters[key];
        }

        this.particleArray = [];
        this.emitterAge = 0.0;
        this.emitterAlive = true;

        this.particleMaterial.uniforms.texture.value = this.particleTexture;
        this.particleCount = this.particlesPerSecond * Math.min(this.particleDeathAge, this.emitterDeathAge);

        this.particleMesh = new THREE.Points();
    }

    randomValue(base, spread) {
        return base + spread * (Math.random() - 0.5);
    }

    randomVector3(base, spread) {
        var rand3 = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        return new Vector3().addVectors(base, new Vector3().multiplyVectors(spread, rand3));
    }

    createParticle() {
        var particle = new Particle();

        particle.sizeTween = this.sizeTween;
        particle.colorTween = this.colorTween;
        particle.opacityTween = this.opacityTween;

        if (this.positionStyle == TYPE.CUBE)
            particle.position = this.randomVector3(this.positionBase, this.positionSpread);
        if (this.positionStyle == TYPE.SPHERE) {
            var z = 2 * Math.random() - 1;
            var t = 6.2832 * Math.random();
            var r = Math.sqrt(1 - z * z);
            var vec3 = new Vector3(r * Math.cos(t), r * Math.sin(t), z);
            particle.position = new Vector3().addVectors(this.positionBase, vec3.multiplyScalar(this.positionRadius));
        }

        if (this.velocityStyle == TYPE.CUBE) {
            particle.velocity = this.randomVector3(this.velocityBase, this.velocitySpread);
        }
        if (this.velocityStyle == TYPE.SPHERE) {
            var direction = new Vector3().subVectors(particle.position, this.positionBase);
            var speed = this.randomValue(this.speedBase, this.speedSpread);
            particle.velocity = direction.normalize().multiplyScalar(speed);
        }

        particle.acceleration = this.randomVector3(this.accelerationBase, this.accelerationSpread);

        particle.angle = this.randomValue(this.angleBase, this.angleSpread);
        particle.angleVelocity = this.randomValue(this.angleVelocityBase, this.angleVelocitySpread);
        particle.angleAcceleration = this.randomValue(this.angleAccelerationBase, this.angleAccelerationSpread);

        particle.size = this.randomValue(this.sizeBase, this.sizeSpread);

        var color = this.randomVector3(this.colorBase, this.colorSpread);
        particle.color = new Color().setHSL(color.x, color.y, color.z);

        particle.opacity = this.randomValue(this.opacityBase, this.opacitySpread);

        particle.age = 0;
        particle.alive = 0;

        return particle;
    }

    updateBoundBox(geometry) {
        const _sphere = new THREE.Sphere();
        geometry.computeBoundingSphere();
        _sphere.copy(geometry.boundingSphere);

        _sphere.setFromPoints([this.accelerationBase, this.velocityBase, this.positionBase]);

        geometry.boundingSphere.copy(_sphere);
    }

    initialize() {
        var positions = new Float32Array(this.particleCount * 3);
        this.particleGeometry.setAttribute("position", new BufferAttribute(positions, 3))
        var customVisible = new Float32Array(this.particleCount);
        this.particleGeometry.setAttribute("customVisible", new BufferAttribute(customVisible, 1))
        var customColor = new Float32Array(this.particleCount * 3);
        this.particleGeometry.setAttribute("customColor", new BufferAttribute(customColor, 3))
        var customOpacity = new Float32Array(this.particleCount);
        this.particleGeometry.setAttribute("customOpacity", new BufferAttribute(customOpacity, 1))
        var customSize = new Float32Array(this.particleCount);
        this.particleGeometry.setAttribute("customSize", new BufferAttribute(customSize, 1))
        var customAngle = new Float32Array(this.particleCount);
        this.particleGeometry.setAttribute("customAngle", new BufferAttribute(customAngle, 1))

        for (var i = 0; i < this.particleCount; i++) {
            this.particleArray[i] = this.createParticle();
            this.particleArray[i].position.toArray(positions, i * 3);
            customVisible[i] = this.particleArray[i].alive;
            this.particleArray[i].color.toArray(customColor, i * 3)
            customOpacity[i] = this.particleArray[i].opacity;
            customSize[i] = this.particleArray[i].size;
            customAngle[i] = this.particleArray[i].angle;
        }

        this.particleMaterial.blending = this.blendStyle;
        if (this.blendStyle != THREE.NormalBlending)
            this.particleMaterial.depthTest = false;

        this.particleMesh = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.particleMesh.dynamic = true;
        this.particleMesh.sortParticles = true;
        this.add(this.particleMesh);

        this.updateBoundBox(this.particleGeometry);
    }

    update = (render, scene, camera) => {
        var dt = 0.015;
        var recycleIndices = [];

        var positions = this.particleGeometry.getAttribute("position");
        var customVisible = this.particleGeometry.getAttribute("customVisible");
        var customColor = this.particleGeometry.getAttribute("customColor");
        var customOpacity = this.particleGeometry.getAttribute("customOpacity");
        var customSize = this.particleGeometry.getAttribute("customSize");
        var customAngle = this.particleGeometry.getAttribute("customAngle");

        _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _projScreenMatrix.multiply(this.matrixWorld);

        this.particleArray.forEach((particle, i) => {
            if (particle.alive) {
                particle.update(dt);
                if (particle.age > this.particleDeathAge) {
                    particle.alive = 0.0;
                    recycleIndices.push(i);
                }
            }
        });

        if (this.emitterAlive) {
            if (this.emitterAge < this.particleDeathAge) {
                var startIndex = Math.round(this.particlesPerSecond * (this.emitterAge + 0));
                var endIndex = Math.round(this.particlesPerSecond * (this.emitterAge + dt));
                if (endIndex > this.particleCount)
                    endIndex = this.particleCount;

                for (var i = startIndex; i < endIndex; i++)
                    this.particleArray[i].alive = 1.0;
            }

            for (var j = 0; j < recycleIndices.length; j++) {
                var i = recycleIndices[j];
                this.particleArray[i] = this.createParticle();
                this.particleArray[i].alive = 1.0;
                this.particleArray[i].position.toArray(positions.array, i * 3);
            }

            this.emitterAge += dt;
            if (this.emitterAge > this.emitterDeathAge) this.emitterAlive = false;
        }

        var particleArraySlice = this.particleArray.slice();
        particleArraySlice.sort((a, b) => {
            var p1 = a.position.clone().applyMatrix4(_projScreenMatrix).z;
            var p2 = b.position.clone().applyMatrix4(_projScreenMatrix).z;
            return p2 - p1;
        });

        particleArraySlice.forEach((particle, i) => {
            if (particle.alive) {
                particle.position.toArray(positions.array, i * 3);
                customVisible.array[i] = particle.alive;
                particle.color.toArray(customColor.array, i * 3);
                customOpacity.array[i] = particle.opacity;
                customSize.array[i] = particle.size;
                customAngle.array[i] = particle.angle;
            }
        });

        customVisible.needsUpdate = true;
        customAngle.needsUpdate = true;
        customColor.needsUpdate = true;
        customOpacity.needsUpdate = true;
        customSize.needsUpdate = true;
        positions.needsUpdate = true;

    }

    constructor(application, feature) {
        super();
        this.application = application;
        this.userData = {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        };

        const { topology } = feature;
        const { geometry: { coordinates } } = feature;
        this.anchor = GeoCoordinates.fromGeoPoint(coordinates);

        this.box = new Mesh(new BoxGeometry(2, 2, 2));
        this.add(this.box);
        this.box.userData = this.userData;

        var particleParamter = {};
        switch (topology["particle-type"]) {
            case "fountain": {
                particleParamter = { ...ParticleSystem.Preset.fountain, ...topology };
                break;
            }
            case "waterfall": {
                particleParamter = { ...ParticleSystem.Preset.waterfall, ...topology };
                break;
            }
            case "waterspray": {
                particleParamter = { ...ParticleSystem.Preset.waterspray, ...topology };
                break;
            }
            case "fireball": {
                particleParamter = { ...ParticleSystem.Preset.fireball, ...topology };
                break;
            }
            case "smoke": {
                particleParamter = { ...ParticleSystem.Preset.smoke, ...topology };
                break;
            }
            case "clouds": {
                particleParamter = { ...ParticleSystem.Preset.clouds, ...topology };
                break;
            }
            case "snow": {
                particleParamter = { ...ParticleSystem.Preset.snow, ...topology };
                break;
            }
            case "rain": {
                particleParamter = { ...ParticleSystem.Preset.rain, ...topology };
                break;
            }
            case "starfield": {
                particleParamter = { ...ParticleSystem.Preset.starfield, ...topology };
                break;
            }
            case "fireflies": {
                particleParamter = { ...ParticleSystem.Preset.fireflies, ...topology };
                break;
            }
            case "startunnel": {
                particleParamter = { ...ParticleSystem.Preset.startunnel, ...topology };
                break;
            }
            case "firework": {
                particleParamter = { ...ParticleSystem.Preset.firework, ...topology };
                break;
            }
            case "candle": {
                particleParamter = { ...ParticleSystem.Preset.candle, ...topology };
                break;
            }
            default: {
                particleParamter = { ...topology };
            }
        }

        this.setValues({ ...particleParamter })
        this.initialize();
        this.particleMesh.onBeforeRender = this.update;

        const transform = topology.transform || {};
        if (transform.scale) {
            const { scale } = transform;
            this.scale.fromArray(scale)
        }

        if (transform.rotation) {
            const { rotation } = transform;
            this.quaternion.fromArray(rotation)
        }
    }

    dispose() {
        this.particleMesh.geometry.dispose();
    }

    clone() {
        return this.box.clone();
    }
}

export default ParticleSystem;


var textureLoader = new THREE.TextureLoader();

ParticleSystem.Preset = {
    fountain: {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 5, 0),
        positionSpread: new THREE.Vector3(10, 0, 10),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 160, 0),
        velocitySpread: new THREE.Vector3(100, 20, 100),

        accelerationBase: new THREE.Vector3(0, -100, 0),

        particleTexture: textureLoader.load(star),

        angleBase: 0,
        angleSpread: 180,
        angleVelocityBase: 0,
        angleVelocitySpread: 360 * 4,

        sizeTween: new Tween([0, 1], [1, 20]),
        opacityTween: new Tween([2, 3], [1, 0]),
        colorTween: new Tween([0.5, 2], [new THREE.Vector3(0, 1, 0.5), new THREE.Vector3(0.8, 1, 0.5)]),

        particlesPerSecond: 200,
        particleDeathAge: 3.0,
        emitterDeathAge: 60
    },
    waterspray: {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 5, 0),
        positionSpread: new THREE.Vector3(10, 0, 10),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 16, 0),
        velocitySpread: new THREE.Vector3(40, 0, 0),

        accelerationBase: new THREE.Vector3(0, -10, 0),

        particleTexture: textureLoader.load(smoke),

        angleBase: 0,
        angleSpread: 180,
        angleVelocityBase: 0,
        angleVelocitySpread: 360 * 4,

        sizeTween: new Tween([0, 1], [30, 80]),
        opacityTween: new Tween([0.8, 2], [0.5, 0]),
        colorTween: new Tween([1, 1], [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)]),

        particlesPerSecond: 200,
        particleDeathAge: 3.0,
        emitterDeathAge: Number.MAX_SAFE_INTEGER
    },
    waterfall: {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 5, 0),
        positionSpread: new THREE.Vector3(10, 10, 0),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 150, 100),
        velocitySpread: new THREE.Vector3(30, 0, 0),
        accelerationBase: new THREE.Vector3(0, -200, 0),

        particleTexture: textureLoader.load(smoke),

        angleBase: 0,
        angleSpread: 180,
        angleVelocityBase: 0,
        angleVelocitySpread: 1440,

        sizeTween: new Tween([0, 1], [30, 80]),
        opacityTween: new Tween([0.8, 2], [0.5, 0]),
        colorTween: new Tween([1, 1], [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)]),

        particlesPerSecond: 400,
        particleDeathAge: 2.0,
        emitterDeathAge: Number.MAX_SAFE_INTEGER
    },

    fireball:
    {
        positionStyle: TYPE.SPHERE,
        positionBase: new THREE.Vector3(0, 50, 0),
        positionRadius: 2,

        velocityStyle: TYPE.SPHERE,
        speedBase: 40,
        speedSpread: 8,

        particleTexture: textureLoader.load(smokeparticle),

        sizeTween: new Tween([0, 0.1], [1, 150]),
        opacityTween: new Tween([0.7, 1], [1, 0]),
        colorBase: new THREE.Vector3(0.02, 1, 0.4),
        blendStyle: THREE.AdditiveBlending,

        particlesPerSecond: 60,
        particleDeathAge: 1.5,
        emitterDeathAge: 60
    },

    smoke:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 0, 0),
        positionSpread: new THREE.Vector3(10, 0, 10),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 150, 0),
        velocitySpread: new THREE.Vector3(80, 50, 80),
        accelerationBase: new THREE.Vector3(0, -10, 0),

        particleTexture: textureLoader.load(smokeparticle),

        angleBase: 0,
        angleSpread: 720,
        angleVelocityBase: 0,
        angleVelocitySpread: 720,

        sizeTween: new Tween([0, 1], [32, 128]),
        opacityTween: new Tween([0.8, 2], [0.5, 0]),
        colorTween: new Tween([0.4, 1], [new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(0, 0, 0.5)]),

        particlesPerSecond: 200,
        particleDeathAge: 2.0,
        emitterDeathAge: 60
    },

    clouds:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(-100, 100, 0),
        positionSpread: new THREE.Vector3(0, 50, 60),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(40, 0, 0),
        velocitySpread: new THREE.Vector3(20, 0, 0),

        particleTexture: textureLoader.load(smokeparticle),

        sizeBase: 80.0,
        sizeSpread: 100.0,
        colorBase: new THREE.Vector3(0.0, 0.0, 1.0), // H,S,L
        opacityTween: new Tween([0, 1, 4, 5], [0, 1, 1, 0]),

        particlesPerSecond: 50,
        particleDeathAge: 10.0,
        emitterDeathAge: 60
    },

    snow:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 200, 0),
        positionSpread: new THREE.Vector3(500, 0, 500),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, -60, 0),
        velocitySpread: new THREE.Vector3(50, 20, 50),
        accelerationBase: new THREE.Vector3(0, -10, 0),

        angleBase: 0,
        angleSpread: 720,
        angleVelocityBase: 0,
        angleVelocitySpread: 60,

        particleTexture: textureLoader.load(snowflake),

        sizeTween: new Tween([0, 0.25], [1, 10]),
        colorBase: new THREE.Vector3(0.66, 1.0, 0.9), // H,S,L
        opacityTween: new Tween([2, 3], [0.8, 0]),

        particlesPerSecond: 200,
        particleDeathAge: 4.0,
        emitterDeathAge: 60
    },

    rain:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 200, 0),
        positionSpread: new THREE.Vector3(600, 0, 600),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, -400, 0),
        velocitySpread: new THREE.Vector3(10, 50, 10),
        accelerationBase: new THREE.Vector3(0, -10, 0),

        particleTexture: textureLoader.load(raindrop2flip),

        sizeBase: 8.0,
        sizeSpread: 4.0,
        colorBase: new THREE.Vector3(0.66, 1.0, 0.7), // H,S,L
        colorSpread: new THREE.Vector3(0.00, 0.0, 0.2),
        opacityBase: 0.6,

        particlesPerSecond: 1000,
        particleDeathAge: 1.0,
        emitterDeathAge: 60
    },

    starfield:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 200, 0),
        positionSpread: new THREE.Vector3(600, 400, 600),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 0, 0),
        velocitySpread: new THREE.Vector3(0.5, 0.5, 0.5),

        angleBase: 0,
        angleSpread: 720,
        angleVelocityBase: 0,
        angleVelocitySpread: 4,

        particleTexture: textureLoader.load(spikey),

        sizeBase: 10.0,
        sizeSpread: 2.0,
        colorBase: new THREE.Vector3(0.15, 1.0, 0.9), // H,S,L
        colorSpread: new THREE.Vector3(0.00, 0.0, 0.2),
        opacityBase: 1,

        particlesPerSecond: 20000,
        particleDeathAge: 60.0,
        emitterDeathAge: 0.1
    },

    fireflies:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 100, 0),
        positionSpread: new THREE.Vector3(400, 200, 400),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 0, 0),
        velocitySpread: new THREE.Vector3(60, 20, 60),

        particleTexture: textureLoader.load(spark),

        sizeBase: 30.0,
        sizeSpread: 2.0,
        opacityTween: new Tween([0.0, 1.0, 1.1, 2.0, 2.1, 3.0, 3.1, 4.0, 4.1, 5.0, 5.1, 6.0, 6.1],
            [0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2]),
        colorBase: new THREE.Vector3(0.30, 1.0, 0.6), // H,S,L
        colorSpread: new THREE.Vector3(0.3, 0.0, 0.0),

        particlesPerSecond: 20,
        particleDeathAge: 6.1,
        emitterDeathAge: 600
    },

    startunnel:
    {
        positionStyle: TYPE.CUBE,
        positionBase: new THREE.Vector3(0, 0, 0),
        positionSpread: new THREE.Vector3(10, 10, 10),

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 100, 200),
        velocitySpread: new THREE.Vector3(40, 40, 80),

        angleBase: 0,
        angleSpread: 720,
        angleVelocityBase: 10,
        angleVelocitySpread: 0,

        particleTexture: textureLoader.load(spikey),

        sizeBase: 4.0,
        sizeSpread: 2.0,
        colorBase: new THREE.Vector3(0.15, 1.0, 0.8), // H,S,L
        opacityBase: 1,
        blendStyle: THREE.AdditiveBlending,

        particlesPerSecond: 500,
        particleDeathAge: 4.0,
        emitterDeathAge: 60
    },

    firework:
    {
        positionStyle: TYPE.SPHERE,
        positionBase: new THREE.Vector3(0, 100, 0),
        positionRadius: 10,

        velocityStyle: TYPE.SPHERE,
        speedBase: 90,
        speedSpread: 10,

        accelerationBase: new THREE.Vector3(0, -80, 0),

        particleTexture: textureLoader.load(spark),

        sizeTween: new Tween([0.5, 0.7, 1.3], [5, 40, 1]),
        opacityTween: new Tween([0.2, 0.7, 2.5], [0.75, 1, 0]),
        colorTween: new Tween([0.4, 0.8, 1.0], [new THREE.Vector3(0, 1, 1), new THREE.Vector3(0, 1, 0.6), new THREE.Vector3(0.8, 1, 0.6)]),
        blendStyle: THREE.AdditiveBlending,

        particlesPerSecond: 3000,
        particleDeathAge: 2.5,
        emitterDeathAge: 0.2
    },

    candle:
    {
        positionStyle: TYPE.SPHERE,
        positionBase: new THREE.Vector3(0, 50, 0),
        positionRadius: 2,

        velocityStyle: TYPE.CUBE,
        velocityBase: new THREE.Vector3(0, 100, 0),
        velocitySpread: new THREE.Vector3(20, 0, 20),

        particleTexture: textureLoader.load(smokeparticle),

        sizeTween: new Tween([0, 0.3, 1.2], [20, 150, 1]),
        opacityTween: new Tween([0.9, 1.5], [1, 0]),
        colorTween: new Tween([0.5, 1.0], [new THREE.Vector3(0.02, 1, 0.5), new THREE.Vector3(0.05, 1, 0)]),
        blendStyle: THREE.AdditiveBlending,

        particlesPerSecond: 60,
        particleDeathAge: 1.5,
        emitterDeathAge: 60
    }
}


window.p = ParticleSystem;