/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import { Fn, attribute, uniform, vec3, vec4 } from "three/tsl";

export interface HighPrecisionLineMaterialParameters {
    color?: number | string | THREE.Color;
    opacity?: number;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class HighPrecisionLineMaterial extends NodeMaterial {
    static DEFAULT_COLOR: number = 0x000050;
    static DEFAULT_OPACITY: number = 1.0;

    isHighPrecisionLineMaterial: boolean = true;

    private m_diffuseColorU = uniform(new THREE.Color(HighPrecisionLineMaterial.DEFAULT_COLOR));
    private m_opacityU = uniform(HighPrecisionLineMaterial.DEFAULT_OPACITY);
    private m_mvpU = uniform(new THREE.Matrix4());
    private m_eyeposU = uniform(new THREE.Vector3());
    private m_eyeposLowU = uniform(new THREE.Vector3());

    opacity: number = HighPrecisionLineMaterial.DEFAULT_OPACITY;

    constructor(params?: HighPrecisionLineMaterialParameters) {
        super();
        this.name = "HighPrecisionLineMaterial";

        if (params) {
            if (params.color !== undefined) this.m_diffuseColorU.value.set(params.color as any);
            if (params.opacity !== undefined) this.opacity = params.opacity;
        }

        this.updateTransparencyFeature();
        this.setupNodes();
    }

    private setupNodes() {
        const positionHigh = attribute("position", "vec3");
        const positionLow = attribute("positionLow", "vec3");
        const vertColor = attribute("color", "vec4");

        // subtractDblEyePos: double-precision subtraction of eye position
        // vec3 t1 = positionLow - u_eyepos_lowpart;
        // vec3 e = t1 - positionLow;
        // vec3 t2 = ((-u_eyepos_lowpart - e) + (positionLow - (t1 - e))) + position - u_eyepos;
        // vec3 high_delta = t1 + t2;
        // vec3 low_delta = t2 - (high_delta - t1);
        // return (high_delta + low_delta);
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

        this.fragmentNode = Fn(() => {
            return vec4(this.m_diffuseColorU.mul(vertColor.rgb), this.m_opacityU);
        })();
    }

    get color(): THREE.Color {
        return this.m_diffuseColorU.value;
    }
    set color(value: THREE.Color) {
        this.m_diffuseColorU.value.copy(value);
    }

    get uniforms() {
        return {
            diffuseColor: { value: this.m_diffuseColorU.value },
            opacity: { value: this.m_opacityU.value },
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

    private updateTransparencyFeature() {
        this.transparent = this.opacity < 1.0;
        this.m_opacityU.value = this.opacity;
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

export function isHighPrecisionLineMaterial(
    material: object | undefined
): material is HighPrecisionLineMaterial {
    return (
        material !== undefined &&
        (material as HighPrecisionLineMaterial).isHighPrecisionLineMaterial === true
    );
}
