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
const emptyTransparentTex = transparentTex();
const emptyImageryTextures = [dummyTex(), dummyTex(), dummyTex(), dummyTex(), dummyTex()];

const _imageryTex = [
    texture(emptyImageryTextures[0]),
    texture(emptyImageryTextures[1]),
    texture(emptyImageryTextures[2]),
    texture(emptyImageryTextures[3]),
    texture(emptyImageryTextures[4])
];

_imageryTex[0].onObjectUpdate(({ object }) => object.imageryTextures[0] ?? emptyImageryTextures[0]);
_imageryTex[1].onObjectUpdate(({ object }) => object.imageryTextures[1] ?? emptyImageryTextures[1]);
_imageryTex[2].onObjectUpdate(({ object }) => object.imageryTextures[2] ?? emptyImageryTextures[2]);
_imageryTex[3].onObjectUpdate(({ object }) => object.imageryTextures[3] ?? emptyImageryTextures[3]);
_imageryTex[4].onObjectUpdate(({ object }) => object.imageryTextures[4] ?? emptyImageryTextures[4]);

const _imageryTransform = [
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[0]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[1]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[2]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[3]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[4]
    )
];

const _imageryCount = uniform(0).onObjectUpdate(({ object }) => object.imageryCount);

const _overlayTex = texture(emptyTransparentTex);
_overlayTex.onObjectUpdate(({ object }) => object.overlayTexture ?? emptyTransparentTex);

const _overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
    ({ object }) => object.overlayTransform
);

const _waterMaskTex = texture(emptyTexture);
_waterMaskTex.onObjectUpdate(({ object }) => object.waterMaskTexture ?? emptyTexture);

const _waterMaskTranslationAndScale = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ object }) => object.waterMaskTranslationAndScale
);

const _waterMaskNoisyTranslationAndScale = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ object }) => object.waterMaskNoisyTranslationAndScale
);

const _normalSampler = texture(emptyTexture);
_normalSampler.onObjectUpdate(({ object }) => object.normalSampler ?? emptyTexture);

const _frameNumber = uniform(0.0).onObjectUpdate(({ object }) => object.frameNumber);

const _clipUvTransform = uniform(new THREE.Vector3(1, 0, 0)).onObjectUpdate(
    ({ object }) => object.clipUvTransform
);

function buildNodes() {
    const texUv = uvNode();
    const webMercatorY = attribute("webMercatorY", "float");
    const mapUv = vec2(texUv.x, webMercatorY);

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

/**
 * Quantized mesh material for rendering Cesium-style quantized-mesh terrain.
 *
 * All per-tile data is read directly from the mesh object at render time via
 * onObjectUpdate, so no per-tile properties exist on the material itself.
 * This ensures the shader is compiled only once and shared by all tiles.
 */
export class QuantizedMeshMaterial extends MeshStandardNodeMaterial {
    public defines: Record<string, unknown> = {};
    private _isSharedSingleton?: boolean;

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
    }

    dispose() {
        if (this._isSharedSingleton) return;
        super.dispose();
    }

    markSharedSingleton(): this {
        this._isSharedSingleton = true;
        return this;
    }
}

const defaultQuantizedMeshMaterial = new QuantizedMeshMaterial({
    wireframe: false,
    transparent: false,
    blending: THREE.NoBlending
}).markSharedSingleton();

export { emptyTexture, emptyTransparentTex, emptyImageryTextures, defaultQuantizedMeshMaterial };
