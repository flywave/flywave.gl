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

/**
 * Creates a 1x1 white dummy texture for use as a placeholder in shader nodes.
 *
 * @returns A DataTexture filled with opaque white pixels.
 */
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

/**
 * Creates a 1x1 transparent dummy texture for use as a placeholder in shader nodes.
 *
 * @returns A DataTexture filled with fully transparent pixels.
 */
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

// ====================================================================
// Module-level shared TSL nodes with onObjectUpdate
// ====================================================================

const _imageryTex = [
    texture(emptyImageryTextures[0]),
    texture(emptyImageryTextures[1]),
    texture(emptyImageryTextures[2]),
    texture(emptyImageryTextures[3]),
    texture(emptyImageryTextures[4])
];

_imageryTex[0].onObjectUpdate(({ material }) => material.imageryTextures[0]);
_imageryTex[1].onObjectUpdate(({ material }) => material.imageryTextures[1]);
_imageryTex[2].onObjectUpdate(({ material }) => material.imageryTextures[2]);
_imageryTex[3].onObjectUpdate(({ material }) => material.imageryTextures[3]);
_imageryTex[4].onObjectUpdate(({ material }) => material.imageryTextures[4]);

const _imageryTransform = [
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ material }) => material.imageryTransforms[0]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ material }) => material.imageryTransforms[1]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ material }) => material.imageryTransforms[2]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ material }) => material.imageryTransforms[3]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ material }) => material.imageryTransforms[4]
    )
];

const _imageryCount = uniform(0).onObjectUpdate(({ material }) => material.imageryCount);

const _overlayTex = texture(emptyTransparentTex);
_overlayTex.onObjectUpdate(({ material }) => material.overlayTexture);

const _overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
    ({ material }) => material.overlayTransform
);

const _waterMaskTex = texture(emptyTexture);
_waterMaskTex.onObjectUpdate(({ material }) => material.waterMaskTexture);

const _waterMaskTranslationAndScale = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.waterMaskTranslationAndScale
);

const _waterMaskNoisyTranslationAndScale = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.waterMaskNoisyTranslationAndScale
);

const _normalSampler = texture(emptyTexture);
_normalSampler.onObjectUpdate(({ material }) => material.normalSampler);

const _frameNumber = uniform(0.0).onObjectUpdate(({ material }) => material.frameNumber);

const _clipUvTransform = uniform(new THREE.Vector3(1, 0, 0)).onObjectUpdate(
    ({ material }) => material.clipUvTransform
);

/**
 * Builds the shared TSL color node for quantized mesh rendering.
 *
 * The color node samples imagery textures and an optional overlay texture,
 * combining them with a slight white blend for visual clarity.
 *
 * @returns An object containing the assembled colorNode.
 */
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
 * This material extends MeshStandardNodeMaterial to provide WebGPU/TSL-compatible
 * rendering of quantized mesh terrain tiles. It supports up to 5 imagery layers,
 * an optional overlay texture, water mask, and normal mapping.
 *
 * All TSL nodes are module-level shared instances using onObjectUpdate to read
 * per-instance property values at render time, ensuring the shader is compiled
 * only once while still supporting per-tile texture data.
 */
export class QuantizedMeshMaterial extends MeshStandardNodeMaterial {
    /** Defines for shader feature toggles */
    public defines: Record<string, unknown> = {};

    private readonly m_imageryTextures: THREE.Texture[] = [
        emptyImageryTextures[0],
        emptyImageryTextures[1],
        emptyImageryTextures[2],
        emptyImageryTextures[3],
        emptyImageryTextures[4]
    ];

    private readonly m_imageryTransforms: THREE.Vector4[] = [
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0)
    ];

    public get imageryTextures(): readonly THREE.Texture[] {
        return this.m_imageryTextures;
    }

    public get imageryTransforms(): readonly THREE.Vector4[] {
        return this.m_imageryTransforms;
    }

    /** Number of active imagery patches */
    public imageryCount: number = 0;

    // --- Overlay texture ---
    public overlayTexture: THREE.Texture = emptyTransparentTex;
    public overlayTransform: THREE.Vector4 = new THREE.Vector4(0, 0, 0, 0);

    // --- Water mask and normals ---
    public waterMaskTexture: THREE.Texture = emptyTexture;
    public waterMaskTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public waterMaskNoisyTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public normalSampler: THREE.Texture = emptyTexture;

    /** Current frame number, used for water animation */
    public frameNumber: number = 0;

    /** Clip UV transform for terrain clipping */
    public clipUvTransform: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

    /**
     * Creates a new QuantizedMeshMaterial instance.
     *
     * @param parameters - Optional standard material parameters.
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
    }

    /**
     * Sets the imagery patches for this material.
     *
     * Each patch consists of a texture and its corresponding UV transform.
     * Up to 5 patches are supported.
     *
     * @param value - Array of imagery patches with transform and texture.
     */
    public set imageryPatchs(value: Array<{ transform: THREE.Vector4; texture: THREE.Texture }>) {
        value.forEach((item, index) => {
            this.m_imageryTextures[index] = item.texture;
            this.m_imageryTransforms[index].copy(item.transform);
        });
        this.imageryCount = value.length;
    }

    /**
     * Sets up or clears the overlay texture.
     *
     * @param overlayer - Optional overlay texture with transform. If undefined, clears the overlay.
     */
    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        if (overlayer) {
            this.overlayTexture = overlayer.texture;
            this.overlayTransform.copy(overlayer.transform);
            this.defines.USE_OVERLAYER = true;
        } else {
            this.overlayTexture = emptyTransparentTex;
            this.overlayTransform.set(0, 0, 0, 0);
            this.defines.USE_OVERLAYER = false;
        }
    }
}
