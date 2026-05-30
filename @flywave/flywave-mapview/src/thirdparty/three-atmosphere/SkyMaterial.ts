import {
    Color,
    GLSL3,
    Matrix4,
    Uniform,
    Vector3,
    type BufferGeometry,
    type Camera,
    type Group,
    type Object3D,
    type Scene,
    type Texture,
    type WebGLRenderer
} from "three";

import { resolveIncludes } from "../three-geospatial";
import { raySphereIntersection } from "../three-geospatial/shaders";

import {
    AtmosphereMaterialBase,
    atmosphereMaterialParametersBaseDefaults,
    type AtmosphereMaterialBaseParameters,
    type AtmosphereMaterialBaseUniforms
} from "./AtmosphereMaterialBase";
import type { AtmosphereShadowLength } from "./types";

import common from "./bruneton/common_glsl";
import definitions from "./bruneton/definitions_glsl";
import runtime from "./bruneton/runtime_glsl";
import fragmentShader from "./sky_frag";
import sky from "./sky_glsl";
import vertexShader from "./sky_vert";

export interface SkyMaterialParameters extends AtmosphereMaterialBaseParameters {
    sun?: boolean;
    moon?: boolean;
    moonDirection?: Vector3;
    moonAngularRadius?: number;
    lunarRadianceScale?: number;
    ground?: boolean;
    groundAlbedo?: Color;
}

export const skyMaterialParametersDefaults = {
    ...atmosphereMaterialParametersBaseDefaults,
    sun: true,
    moon: true,
    moonAngularRadius: 0.0045,
    lunarRadianceScale: 1,
    ground: true,
    groundAlbedo: new Color(0)
} satisfies SkyMaterialParameters;

export interface SkyMaterialUniforms {
    [key: string]: Uniform<unknown>;
    inverseProjectionMatrix: Uniform<Matrix4>;
    inverseViewMatrix: Uniform<Matrix4>;
    moonDirection: Uniform<Vector3>;
    moonAngularRadius: Uniform<number>;
    lunarRadianceScale: Uniform<number>;
    groundAlbedo: Uniform<Color>;
    shadowLengthBuffer: Uniform<Texture | null>;
}

export class SkyMaterial extends AtmosphereMaterialBase {
    declare uniforms: AtmosphereMaterialBaseUniforms & SkyMaterialUniforms;

    shadowLength: AtmosphereShadowLength | null = null;

    private _sun: boolean = false;
    private _moon: boolean = false;
    private _ground: boolean = false;

    get sun(): boolean {
        return this._sun;
    }
    set sun(value: boolean) {
        if (value !== this._sun) {
            this._sun = value;
            if (value) {
                this.defines ??= {};
                this.defines.SUN = "1";
            } else {
                delete this.defines?.SUN;
            }
            this.needsUpdate = true;
        }
    }

    get moon(): boolean {
        return this._moon;
    }
    set moon(value: boolean) {
        if (value !== this._moon) {
            this._moon = value;
            if (value) {
                this.defines ??= {};
                this.defines.MOON = "1";
            } else {
                delete this.defines?.MOON;
            }
            this.needsUpdate = true;
        }
    }

    get ground(): boolean {
        return this._ground;
    }
    set ground(value: boolean) {
        if (value !== this._ground) {
            this._ground = value;
            if (value) {
                this.defines ??= {};
                this.defines.GROUND = "1";
            } else {
                delete this.defines?.GROUND;
            }
            this.needsUpdate = true;
        }
    }

    constructor(params?: SkyMaterialParameters) {
        const {
            sun,
            moon,
            moonDirection,
            moonAngularRadius,
            lunarRadianceScale,
            ground,
            groundAlbedo,
            ...others
        } = { ...skyMaterialParametersDefaults, ...params };

        super({
            name: "SkyMaterial",
            glslVersion: GLSL3,
            vertexShader,
            fragmentShader: resolveIncludes(fragmentShader, {
                core: { raySphereIntersection },
                bruneton: {
                    common,
                    definitions,
                    runtime
                },
                sky
            }),
            ...others,
            uniforms: {
                inverseProjectionMatrix: new Uniform(new Matrix4()),
                inverseViewMatrix: new Uniform(new Matrix4()),
                moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
                moonAngularRadius: new Uniform(moonAngularRadius),
                lunarRadianceScale: new Uniform(lunarRadianceScale),
                groundAlbedo: new Uniform(groundAlbedo.clone()),
                shadowLengthBuffer: new Uniform(null),
                ...others.uniforms
            } satisfies SkyMaterialUniforms,
            defines: {
                PERSPECTIVE_CAMERA: "1"
            },
            depthWrite: false,
            depthTest: true
        });
        this._sun = sun;
        this._moon = moon;
        this._ground = ground;
        this.sun = sun;
        this.moon = moon;
        this.ground = ground;
    }

    override onBeforeRender(
        renderer: WebGLRenderer,
        scene: Scene,
        camera: Camera,
        geometry: BufferGeometry,
        object: Object3D,
        group: Group
    ): void {
        super.onBeforeRender(renderer, scene, camera, geometry, object, group);

        const { uniforms, defines } = this;
        (uniforms.inverseProjectionMatrix.value as Matrix4).copy(camera.projectionMatrixInverse);
        (uniforms.inverseViewMatrix.value as Matrix4).copy(camera.matrixWorld);

        const prevPerspectiveCamera = defines.PERSPECTIVE_CAMERA != null;
        const nextPerspectiveCamera = (camera as any).isPerspectiveCamera === true;
        if (nextPerspectiveCamera !== prevPerspectiveCamera) {
            if (nextPerspectiveCamera) {
                defines.PERSPECTIVE_CAMERA = "1";
            } else {
                delete defines.PERSPECTIVE_CAMERA;
            }
            this.needsUpdate = true;
        }

        const color = this.groundAlbedo;
        const prevGroundAlbedo = defines.GROUND_ALBEDO != null;
        const nextGroundAlbedo = color.r !== 0 || color.g !== 0 || color.b !== 0;
        if (nextGroundAlbedo !== prevGroundAlbedo) {
            if (nextGroundAlbedo) {
                this.defines.GROUND_ALBEDO = "1";
            } else {
                delete this.defines.GROUND_ALBEDO;
            }
            this.needsUpdate = true;
        }

        const shadowLength = this.shadowLength;
        const prevShadowLength = defines.HAS_SHADOW_LENGTH != null;
        const nextShadowLength = shadowLength != null;
        if (nextShadowLength !== prevShadowLength) {
            if (nextShadowLength) {
                defines.HAS_SHADOW_LENGTH = "1";
            } else {
                delete defines.HAS_SHADOW_LENGTH;
                uniforms.shadowLengthBuffer.value = null;
            }
            this.needsUpdate = true;
        }
        if (nextShadowLength) {
            uniforms.shadowLengthBuffer.value = shadowLength.map;
        }
    }

    get moonDirection(): Vector3 {
        return this.uniforms.moonDirection.value;
    }

    get moonAngularRadius(): number {
        return this.uniforms.moonAngularRadius.value;
    }

    set moonAngularRadius(value: number) {
        this.uniforms.moonAngularRadius.value = value;
    }

    get lunarRadianceScale(): number {
        return this.uniforms.lunarRadianceScale.value;
    }

    set lunarRadianceScale(value: number) {
        this.uniforms.lunarRadianceScale.value = value;
    }

    get groundAlbedo(): Color {
        return this.uniforms.groundAlbedo.value;
    }
}
