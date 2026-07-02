// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
    Fn,
    float,
    mix as tslMix,
    select,
    texture,
    uniform,
    uv as uvNode,
    attribute,
    vec2,
    vec4
} from "three/tsl";

function dummyTex(): THREE.DataTexture {
    const t = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
    );
    t.needsUpdate = true;
    return t;
}

function transparentTex(): THREE.DataTexture {
    const t = new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 0]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
    );
    t.needsUpdate = true;
    return t;
}

const emptyTexture = dummyTex();

interface CommonUniforms {
    clipUvTransform: { value: THREE.Vector3 };
    imageryPatchTransform: { value: THREE.Vector4[] };
    imageryPatchArray: { value: THREE.Texture[] };
    imageryPatchCount: { value: number };
    waterMaskTranslationAndScale: { value: THREE.Vector4 };
    waterMaskNoisyTranslationAndScale: { value: THREE.Vector4 };
    waterMaskTexture: { value: THREE.Texture };
    normalSampler: { value: THREE.Texture };
    overlayerImageryTransform: { value: THREE.Vector4 };
    overlayerImagery: { value: THREE.Texture };
    frameNumber: { value: number };
}

// ====================================================================
// 静态共享 TSL 节点
// ====================================================================

const _imageryTex = [
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex())
];
const _imageryTransform = [
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0))
];
const _imageryCount = uniform(0);

const _overlayTex = texture(transparentTex());
const _overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0));

const _waterMaskTex = texture(dummyTex());
const _waterMaskTranslationAndScale = uniform(new THREE.Vector4());
const _waterMaskNoisyTranslationAndScale = uniform(new THREE.Vector4());
const _normalSampler = texture(dummyTex());
const _frameNumber = uniform(0.0);

const _clipUvTransform = uniform(new THREE.Vector3(1, 0, 0));

function buildNodes() {
    const texUv = uvNode();
    const webMercatorY = attribute("webMercatorY", "float");
    const mapUv = vec2(texUv.x, webMercatorY);

    // getTextureColor() — 严格匹配原始 GLSL
    const colorNode = Fn(() => {
        const color = vec4(0.0).toVar();

        for (let i = 0; i < 5; i++) {
            const tUv = vec2(
                mapUv.x.mul(_imageryTransform[i].x).add(_imageryTransform[i].z),
                mapUv.y.mul(_imageryTransform[i].y).add(_imageryTransform[i].w)
            );
            const inRange = tUv.x
                .greaterThanEqual(float(-0.001))
                .and(tUv.x.lessThanEqual(float(1.001)))
                .and(tUv.y.greaterThanEqual(float(-0.001)))
                .and(tUv.y.lessThanEqual(float(1.001)));
            const patchColor = texture(_imageryTex[i], tUv);
            color.assign(select(inRange.and(float(i).lessThan(_imageryCount)), patchColor, color));
        }

        {
            const oUv = vec2(
                mapUv.x.mul(_overlayTransform.x).add(_overlayTransform.z),
                mapUv.y.mul(_overlayTransform.y).add(_overlayTransform.w)
            );
            const inRange = oUv.x
                .greaterThanEqual(float(-0.00001))
                .and(oUv.x.lessThanEqual(float(1.00001)))
                .and(oUv.y.greaterThanEqual(float(-0.00001)))
                .and(oUv.y.lessThanEqual(float(1.00001)));
            const overlayColor = texture(_overlayTex, oUv);
            const blended = tslMix(color, overlayColor, overlayColor.a);
            color.assign(select(inRange.and(overlayColor.a.greaterThan(float(0))), blended, color));
        }

        return tslMix(color, vec4(1.0), float(0.1));
    })();

    return { colorNode };
}

const s_nodes = buildNodes();

export class QuantizedMeshMaterial extends MeshStandardNodeMaterial {
    public readonly commonUniform: CommonUniforms = {
        clipUvTransform: { value: new THREE.Vector3(1, 0, 0) },
        imageryPatchTransform: {
            value: Array.from({ length: 5 }, () => new THREE.Vector4(1, 1, 0, 0))
        },
        imageryPatchArray: { value: Array.from({ length: 5 }, () => dummyTex()) },
        imageryPatchCount: { value: 0 },
        waterMaskTranslationAndScale: { value: new THREE.Vector4() },
        waterMaskNoisyTranslationAndScale: { value: new THREE.Vector4() },
        waterMaskTexture: { value: emptyTexture },
        normalSampler: { value: emptyTexture },
        overlayerImageryTransform: { value: new THREE.Vector4(0, 0, 0, 0) },
        overlayerImagery: { value: transparentTex() },
        frameNumber: { value: 0 }
    };

    public defines: Record<string, any> = {};

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
    }

    public syncStaticUniforms(): void {
        const u = this.commonUniform;
        for (let i = 0; i < 5; i++) {
            if (_imageryTex[i].value !== u.imageryPatchArray.value[i])
                _imageryTex[i].value = u.imageryPatchArray.value[i];
            _imageryTransform[i].value.copy(u.imageryPatchTransform.value[i]);
        }
        _imageryCount.value = u.imageryPatchCount.value;
        if (_overlayTex.value !== u.overlayerImagery.value)
            _overlayTex.value = u.overlayerImagery.value;
        _overlayTransform.value.copy(u.overlayerImageryTransform.value);
        if (_waterMaskTex.value !== u.waterMaskTexture.value)
            _waterMaskTex.value = u.waterMaskTexture.value;
        _waterMaskTranslationAndScale.value.copy(u.waterMaskTranslationAndScale.value);
        _waterMaskNoisyTranslationAndScale.value.copy(u.waterMaskNoisyTranslationAndScale.value);
        if (_normalSampler.value !== u.normalSampler.value)
            _normalSampler.value = u.normalSampler.value;
        _frameNumber.value = u.frameNumber.value;
        _clipUvTransform.value.copy(u.clipUvTransform.value);
    }

    public set clipUvTransform(value: THREE.Vector3) {
        this.commonUniform.clipUvTransform.value.copy(value);
    }

    public set imageryPatchs(value: Array<{ transform: THREE.Vector4; texture: THREE.Texture }>) {
        value.forEach((item, index) => {
            this.commonUniform.imageryPatchArray.value[index] = item.texture;
            this.commonUniform.imageryPatchTransform.value[index] = item.transform;
        });
        this.commonUniform.imageryPatchCount.value = value.length;
    }

    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        if (overlayer) {
            this.commonUniform.overlayerImagery.value = overlayer.texture;
            this.commonUniform.overlayerImageryTransform.value.copy(overlayer.transform);
            this.defines.USE_OVERLAYER = true;
        } else {
            this.commonUniform.overlayerImagery.value = transparentTex();
            this.commonUniform.overlayerImageryTransform.value.set(0, 0, 0, 0);
            this.defines.USE_OVERLAYER = false;
        }
    }

    public set waterMaskTranslationAndScale(value: THREE.Vector4) {
        this.commonUniform.waterMaskTranslationAndScale.value.copy(value);
    }

    public set waterMaskNoisyTranslationAndScale(value: THREE.Vector4) {
        this.commonUniform.waterMaskNoisyTranslationAndScale.value.copy(value);
    }

    public set waterMaskTexture(value: THREE.Texture) {
        this.commonUniform.waterMaskTexture.value = value;
    }

    public set normalSampler(value: THREE.Texture) {
        this.commonUniform.normalSampler.value = value;
    }

    public set frameNumber(value: number) {
        this.commonUniform.frameNumber.value = value;
    }
}
