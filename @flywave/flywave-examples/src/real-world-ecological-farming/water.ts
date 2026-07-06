import {
    Color,
    DataTexture,
    RGBAFormat,
    UnsignedByteType,
    Matrix4,
    Texture,
    TextureLoader,
    RepeatWrapping,
    Vector3
} from "three";
import { NodeMaterial } from "three/webgpu";
import {
    texture,
    vec2,
    vec3,
    cameraPosition,
    positionWorld,
    positionGeometry,
    mix,
    normalize,
    dot,
    reflect,
    max,
    pow,
    length,
    float,
    mul,
    time,
    uniform
} from "three/tsl";

interface WaterMaterialOptions {
    alpha?: number;
    speed?: number;
    sunDirection?: Vector3;
    sunColor?: number | string | Color;
    waterColor?: number | string | Color;
    distortionScale?: number;
    fog?: boolean;
    normalMap?: Texture | string;
}

class WaterMaterial extends NodeMaterial {
    private _speed: number;
    private _normalSampler: Texture | null = null;
    private _mirrorSampler: Texture | null = null;

    constructor(options: WaterMaterialOptions = {}) {
        super();

        this.transparent = true;
        this.lights = false;
        this.fog = false;

        this._speed = options.speed ?? 1.0;

        const placeholder = new DataTexture(
            new Uint8Array([128, 128, 255, 255]),
            1,
            1,
            RGBAFormat,
            UnsignedByteType
        );
        placeholder.needsUpdate = true;
        placeholder.wrapS = RepeatWrapping;
        placeholder.wrapT = RepeatWrapping;

        let normalTex: Texture;
        if (options.normalMap instanceof Texture) {
            normalTex = options.normalMap;
        } else if (typeof options.normalMap === "string") {
            normalTex = new TextureLoader().load(options.normalMap);
        } else {
            normalTex = new TextureLoader().load("./waternormals.jpg");
        }
        normalTex.wrapS = RepeatWrapping;
        normalTex.wrapT = RepeatWrapping;
        this._normalSampler = normalTex;

        const normalTexNode = texture(placeholder);
        normalTexNode.onObjectUpdate(({ material }: any) => {
            const tex = (material as WaterMaterial)._normalSampler;
            return tex && tex.image ? tex : placeholder;
        });

        const uAlpha = uniform(options.alpha ?? 0.9) as any;
        const uSize = uniform(2.0) as any;
        const uSunColor = uniform(new Color(options.sunColor ?? 0xffffff)) as any;
        const uSunDirection = uniform(
            options.sunDirection ?? new Vector3(0.70707, 0.70707, 0.0)
        ) as any;
        const uWaterColor = uniform(new Color(options.waterColor ?? 0x555555)) as any;
        const uDistortionScale = uniform(options.distortionScale ?? 20.0) as any;

        const uv = positionGeometry.xy.mul(uSize);

        const uv0 = uv.div(103).add(vec2(time.div(17), time.div(29)));
        const uv1 = uv.div(107).sub(vec2(time.div(-19), time.div(31)));
        const uv2 = uv.div(vec2(8907.0, 9803.0)).add(vec2(time.div(101), time.div(97)));
        const uv3 = uv.div(vec2(1091.0, 1027.0)).sub(vec2(time.div(109), time.div(-113)));

        const noise = normalTexNode
            .sample(uv0)
            .add(normalTexNode.sample(uv1))
            .add(normalTexNode.sample(uv2))
            .add(normalTexNode.sample(uv3))
            .mul(0.5)
            .sub(1.0);

        const surfaceNormal = normalize(noise.xzy.mul(vec3(1.5, 1.5, 1.5)));

        const worldToEye = cameraPosition.sub(positionWorld);
        const eyeDirection = normalize(
            vec3(-0.22354059905927112, 0.8579892843484154, -0.46247593290409833)
        );

        const negSunDir = mul(normalize(uSunDirection), -1);
        const reflection = normalize((reflect as any)(negSunDir, surfaceNormal));
        const direction = max(0.0, dot(eyeDirection, reflection));
        const specularColor = pow(direction, float(100)).mul(uSunColor).mul(2.0);
        const diffuseColor = max(0.0, dot(normalize(uSunDirection), surfaceNormal))
            .mul(uSunColor)
            .mul(0.5);

        const distance = length(worldToEye);
        const distFactor = float(0.001).add(float(1.0).div(distance)).mul(uDistortionScale);
        const distortion = surfaceNormal.xz.mul(distFactor);

        const theta = max(dot(eyeDirection, surfaceNormal), 0.1);
        const rf0 = float(0.3);
        const reflectance = rf0.add(
            float(1.0)
                .sub(rf0)
                .mul(pow(float(1.0).sub(theta), 5.0))
        );

        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(uWaterColor);
        const diffuseLight = uSunColor.mul(diffuseColor).mul(0.3).add(scatter);

        const albedo = mix(diffuseLight, vec3(0.1).add(specularColor), reflectance);

        this.colorNode = albedo;
        this.opacityNode = uAlpha;
    }

    setMirrorSampler(texture: Texture): void {
        this._mirrorSampler = texture;
    }

    setCameraPosition(_position: Vector3): void {}

    setTextureMatrix(_matrix: Matrix4): void {}

    get speed(): number {
        return this._speed;
    }
    set speed(value: number) {
        this._speed = value;
    }

    dispose(): void {
        this._normalSampler?.dispose();
        this._mirrorSampler?.dispose();
        super.dispose();
    }
}

export { WaterMaterial, WaterMaterialOptions };
