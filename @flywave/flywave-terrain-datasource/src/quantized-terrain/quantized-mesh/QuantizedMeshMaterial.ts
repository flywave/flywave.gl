// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { Fn, float, mix as tslMix, select, texture, uniform, uv as uvNode, attribute, vec2, vec4 } from "three/tsl";

/** Projector decal slots per material — fixed, the TSL loop unrolls it. */
const MAX_PROJECTOR_LAYERS = 8;


function dummyTex(): THREE.DataTexture {
    const t = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
    );
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
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
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
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

// --- Projector overlay decals (alpha-blended over imagery) ---
// Per-mesh data lives as plain array properties on the mesh (QuantizedMesh
// .setupProjectorTextures); resolved per draw via onObjectUpdate, same
// pattern as the imagery slots. Sampling rides the SAME tile-UV × transform
// mapping as imagery — the transforms are computed on the CPU with the
// SIGNED y offset (see QuantizedMesh.computeProjectorUvTransform), which is
// the formula verified on the DEM path for arbitrary (multi-tile) geoBoxes.
//
// ⚠️ RISK (untested on this material): projector textures are user-created
// canvas/image textures, NOT worker ImageBitmaps like the imagery slots.
// The DEM path's "white decal" bug showed canvas textures can behave
// differently through shared-node clone sampling (flipY is upload-time for
// canvas but shader-side for ImageBitmap). If decals render white/mirrored
// here, re-run the DEM calibration procedure (multi-tile geoBox + corner
// pillars) before touching the transform math.
const _projTex = Array.from({ length: MAX_PROJECTOR_LAYERS }, () => texture(emptyTexture));
_projTex.forEach((node, i) => {
    node.onObjectUpdate(({ object }) => object.projectorTextures?.[i] ?? emptyTexture);
});

const _projTransform = Array.from({ length: MAX_PROJECTOR_LAYERS }, () =>
    uniform(new THREE.Vector4())
);
_projTransform.forEach((node, i) => {
    node.onObjectUpdate(({ object }) => object.projectorTransforms?.[i] ?? node.value);
});

const _projOpacity = Array.from({ length: MAX_PROJECTOR_LAYERS }, () => uniform(0));
_projOpacity.forEach((node, i) => {
    node.onObjectUpdate(({ object }) => object.projectorOpacities?.[i] ?? 0);
});

const _projCount = uniform(0).onObjectUpdate(({ object }) => object.projectorCount ?? 0);

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

        // Projector decals: alpha-blend each layer over the imagery result
        // (NOT select — decals must blend, e.g. checker at opacity 0.9).
        // Frustum gate is [0,1] on the decal UV — coverage is exactly the
        // layer's geoBox.
        for (let i = 0; i < MAX_PROJECTOR_LAYERS; i++) {
            const tUv = vec2(
                mapUv.x.mul(_projTransform[i].x).add(_projTransform[i].z),
                mapUv.y.mul(_projTransform[i].y).add(_projTransform[i].w)
            );
            const inRange = tUv.x
                .greaterThanEqual(float(0.0))
                .and(tUv.x.lessThanEqual(float(1.0)))
                .and(tUv.y.greaterThanEqual(float(0.0)))
                .and(tUv.y.lessThanEqual(float(1.0)));
            const projColor = texture(_projTex[i], tUv);
            const layerAlpha = projColor.a.mul(_projOpacity[i]);
            const active = inRange
                .and(float(i).lessThan(_projCount))
                .and(layerAlpha.greaterThan(0.001));
            const blended = tslMix(color, vec4(projColor.rgb, color.a), layerAlpha);
            color.assign(select(active, blended, color));
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
