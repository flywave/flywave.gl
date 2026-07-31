/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three/webgpu";
import {
    PointsNodeMaterial,
} from "three/webgpu";
import {
    Fn,
    attribute,
    uniform,
    vec3,
    vec4,
    texture,
    pointUV,
    float,
} from "three/tsl";

export interface HighPrecisionPointMaterialParameters {
    color?: number | string | THREE.Color;
    opacity?: number;
    size?: number;
    scale?: number;
    map?: THREE.Texture;
    uvTransform?: THREE.Matrix3;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class HighPrecisionPointMaterial extends PointsNodeMaterial {
    static DEFAULT_COLOR: number = 0x000050;
    static DEFAULT_OPACITY: number = 1.0;
    static DEFAULT_SIZE: number = 1.0;
    static DEFAULT_SCALE: number = 1.0;

    isHighPrecisionPointMaterial: boolean = true;

    private m_diffuseColorU = uniform(new THREE.Color(HighPrecisionPointMaterial.DEFAULT_COLOR));
    private m_opacityU = uniform(HighPrecisionPointMaterial.DEFAULT_OPACITY);
    private m_mvpU = uniform(new THREE.Matrix4());
    private m_eyeposU = uniform(new THREE.Vector3());
    private m_eyeposLowU = uniform(new THREE.Vector3());

    private m_hpEye = new THREE.Vector3();
    private m_hpMvp = new THREE.Matrix4();
    private m_mapU = uniform(new THREE.Texture());

    opacity: number = HighPrecisionPointMaterial.DEFAULT_OPACITY;
    color: THREE.Color = new THREE.Color(HighPrecisionPointMaterial.DEFAULT_COLOR);

    constructor(params?: HighPrecisionPointMaterialParameters) {
        super();
        this.name = "HighPrecisionPointMaterial";
        this.transparent = true;
        this.sizeAttenuation = false;

        if (params) {
            if (params.color !== undefined) {
                this.m_diffuseColorU.value.set(params.color as any);
                this.color.copy(this.m_diffuseColorU.value);
            }
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
                this.m_opacityU.value = params.opacity;
            }
            if (params.size !== undefined) {
                this.size = params.size;
            }
            if (params.scale !== undefined) {
                this.scale = params.scale;
            }
            if (params.map !== undefined) {
                this.m_mapU.value = params.map;
                this.map = params.map;
            }
        }

        this.updateTransparency();
        this.setupNodes();
        this.setupHpUpdate();
    }

    private setupHpUpdate() {
        this.m_mvpU.onObjectUpdate(({ object, camera }) => {
            const inv = object.matrixWorldInverse as THREE.Matrix4;
            this.m_hpMvp.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
            this.m_hpEye.set(0, 0, 0).applyMatrix4(inv);
            const hi = new THREE.Vector3(
                Math.fround(this.m_hpEye.x),
                Math.fround(this.m_hpEye.y),
                Math.fround(this.m_hpEye.z)
            );
            const lo = new THREE.Vector3(
                this.m_hpEye.x - hi.x,
                this.m_hpEye.y - hi.y,
                this.m_hpEye.z - hi.z
            );
            this.m_eyeposU.value.copy(hi);
            this.m_eyeposLowU.value.copy(lo);
            return this.m_hpMvp;
        });
    }

    private setupNodes() {
        const positionHigh = attribute("position", "vec3");
        const positionLow = attribute("positionLow", "vec3");

        this.positionNode = Fn(() => {
            const t1 = positionLow.sub(this.m_eyeposLowU);
            const e = t1.sub(positionLow);
            const t2 = this.m_eyeposLowU
                .negate()
                .sub(e)
                .add(positionLow.sub(t1.sub(e)))
                .add(positionHigh)
                .sub(this.m_eyeposU);
            const highDelta = t1.add(t2);
            const lowDelta = t2.sub(highDelta.sub(t1));
            const pos = highDelta.add(lowDelta);
            return this.m_mvpU.mul(vec4(pos, 1.0));
        })();

        this.sizeNode = float(this.size);

        this.fragmentNode = Fn(() => {
            const mapColor = texture(this.m_mapU, pointUV);
            const rgb = this.m_diffuseColorU.mul(mapColor.rgb);
            const alpha = this.m_opacityU.mul(mapColor.a);
            return vec4(rgb, alpha);
        })();
    }

    private updateTransparency() {
        this.transparent = this.opacity < 1.0;
        this.m_opacityU.value = this.opacity;
    }

    get scale(): number {
        return this.size;
    }

    set scale(value: number) {
        this.size = value;
        this.sizeNode = float(value);
    }

    get uniforms() {
        return {
            diffuseColor: { value: this.m_diffuseColorU.value },
            opacity: { value: this.m_opacityU.value },
            size: { value: this.size },
            scale: { value: this.scale },
            map: { value: this.m_mapU.value },
            u_mvp: { value: this.m_mvpU.value },
            u_eyepos: { value: this.m_eyeposU.value },
            u_eyepos_lowpart: { value: this.m_eyeposLowU.value }
        };
    }

    set uniforms(value: any) {
        if (value.diffuseColor) this.m_diffuseColorU.value = value.diffuseColor.value;
        if (value.opacity) this.m_opacityU.value = value.opacity.value;
        if (value.u_mvp) this.m_mvpU.value = value.u_mvp.value;
        if (value.u_eyepos) this.m_eyeposU.value = value.u_eyepos.value;
        if (value.u_eyepos_lowpart) this.m_eyeposLowU.value = value.u_eyepos_lowpart.value;
    }

    get hpMvp() {
        return this.m_mvpU;
    }

    get hpEyepos() {
        return this.m_eyeposU;
    }

    get hpEyeposLow() {
        return this.m_eyeposLowU;
    }
}

export function isHighPrecisionPointMaterial(
    material: object | undefined
): material is HighPrecisionPointMaterial {
    return (
        material !== undefined &&
        (material as HighPrecisionPointMaterial).isHighPrecisionPointMaterial === true
    );
}
