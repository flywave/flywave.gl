/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
    Fn,
    abs,
    attribute,
    clamp,
    cos,
    dFdx,
    dFdy,
    float,
    inverseSqrt,
    max,
    min,
    sin,
    texture,
    uniform,
    uv as uvNode,
    vec4
} from "three/tsl";

interface RendererCapabilities {
    readonly isWebGL2: boolean;
    readonly logarithmicDepthBuffer: boolean;
}

interface RendererMaterialParameters {
    rendererCapabilities: RendererCapabilities;
}

function createDummyTexture(): THREE.Texture {
    const t = new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
    );
    t.needsUpdate = true;
    t.colorSpace = THREE.NoColorSpace;
    return t;
}

/**
 * Clears a region of the RT to transparent black.
 * Uses QuadMesh (fullscreen pass) with a scissor-like approach via uniforms.
 */
export class GlyphClearMaterial extends NodeMaterial {
    readonly clearRectUniform = uniform(new THREE.Vector4(0, 0, 1, 1));

    constructor(params?: RendererMaterialParameters) {
        super();
        this.name = "GlyphClearMaterial";
        this.depthTest = false;
        this.depthWrite = false;
        this.transparent = true;

        const screenUV = uvNode();
        const clearRect = this.clearRectUniform;

        this.fragmentNode = Fn(() => {
            const inside = screenUV.x
                .greaterThanEqual(clearRect.x)
                .and(screenUV.x.lessThan(clearRect.z))
                .and(screenUV.y.greaterThanEqual(clearRect.y))
                .and(screenUV.y.lessThan(clearRect.w));
            return inside.select(vec4(0, 0, 0, 1), vec4(0, 0, 0, 0));
        })();
    }
}

/**
 * Copies a glyph from a source texture to the RT using QuadMesh (fullscreen pass).
 * Only writes within the target region; discards everything else.
 */
export class GlyphCopyMaterial extends NodeMaterial {
    readonly srcTextureNode = texture(createDummyTexture());
    readonly srcRectUniform = uniform(new THREE.Vector4(0, 0, 1, 1));
    readonly dstRectUniform = uniform(new THREE.Vector4(0, 0, 1, 1));

    constructor(params?: RendererMaterialParameters) {
        super();
        this.name = "GlyphCopyMaterial";
        this.depthTest = false;
        this.depthWrite = false;
        this.transparent = true;

        const screenUV = uvNode();
        const srcRect = this.srcRectUniform;
        const dstRect = this.dstRectUniform;
        const srcTex = this.srcTextureNode;

        this.fragmentNode = Fn(() => {
            const inside = screenUV.x
                .greaterThanEqual(dstRect.x)
                .and(screenUV.x.lessThan(dstRect.z))
                .and(screenUV.y.greaterThanEqual(dstRect.y))
                .and(screenUV.y.lessThan(dstRect.w));

            const t = screenUV.sub(dstRect.xy).div(dstRect.zw.sub(dstRect.xy));
            const sampleUV = srcRect.xy.add(t.mul(srcRect.zw.sub(srcRect.xy)));
            srcTex.uvNode = sampleUV;

            const col = srcTex;
            return inside.select(col, vec4(0, 0, 0, 0));
        })();
    }

    setSourceTexture(tex: THREE.Texture) {
        tex.colorSpace = THREE.NoColorSpace;
        this.srcTextureNode.value = tex;
        this.needsUpdate = true;
    }
}

export interface SdfTextMaterialParameters extends RendererMaterialParameters {
    texture: THREE.Texture;
    textureSize: THREE.Vector2;
    size: number;
    distanceRange: number;
    isMsdf: boolean;
    isBackground: boolean;
    vertexSource?: string;
    fragmentSource?: string;
}

export class SdfTextMaterial extends NodeMaterial {
    readonly sdfParamsUniform: { value: THREE.Vector4 };
    private sdfTexNode: ReturnType<typeof texture>;
    private sdfParamsNode: ReturnType<typeof uniform>;
    private isMsdf: boolean;
    private isBackground: boolean;

    constructor(params?: SdfTextMaterialParameters) {
        super();
        this.name = "SdfTextMaterial";
        this.depthTest = true;
        this.depthWrite = false;
        this.side = THREE.DoubleSide;
        this.transparent = true;

        const tex = params?.texture ?? createDummyTexture();
        tex.colorSpace = THREE.NoColorSpace;
        tex.needsUpdate = true;

        this.sdfTexNode = texture(tex);
        this.sdfParamsNode = uniform(
            new THREE.Vector4(
                params?.textureSize?.x ?? 1,
                params?.textureSize?.y ?? 1,
                params?.size ?? 1,
                params?.distanceRange ?? 1
            )
        );

        this.sdfParamsUniform = { value: this.sdfParamsNode.value };
        this.isMsdf = params?.isMsdf ?? false;
        this.isBackground = params?.isBackground ?? false;

        this.buildNodes();
    }

    private buildNodes(): void {
        const sdfTex = this.sdfTexNode;
        const sdfParams = this.sdfParamsNode;
        const isMsdf = this.isMsdf;
        const isBackground = this.isBackground;

        const aUv = uvNode();
        const aRotation = attribute("aRotation", "float");
        const aWeight = attribute("aWeight", "float");
        const aBgWeight = attribute("aBgWeight", "float");
        const aColor = attribute("aColor", "vec4");
        const aBgColor = attribute("aBgColor", "vec4");

        this.fragmentNode = Fn(() => {
            const texSample = sdfTex;
            const dist = isMsdf
                ? max(
                      min(texSample.r, texSample.g),
                      min(max(texSample.r, texSample.g), texSample.b)
                  )
                : texSample.r;

            const color = isBackground ? aBgColor : aColor;
            const weight = isBackground ? aBgWeight : aWeight;

            const rotUvX = cos(aRotation).mul(aUv.x).sub(sin(aRotation).mul(aUv.y));
            const rotUvY = sin(aRotation).mul(aUv.x).add(cos(aRotation).mul(aUv.y));
            const rotUvXAbs = abs(rotUvX);
            const rotUvYAbs = abs(rotUvY);

            const dx = dFdx(rotUvXAbs).mul(sdfParams.x);
            const dy = dFdy(rotUvYAbs).mul(sdfParams.y);
            const toPixels = sdfParams.w.mul(inverseSqrt(dx.mul(dx).add(dy.mul(dy))));

            const adjustedDist = dist
                .add(min(weight, float(0.5).sub(float(1).div(sdfParams.w))))
                .sub(0.5);
            const opacity = clamp(adjustedDist.mul(toPixels).add(0.5), 0, 1);

            return vec4(color.rgb, color.a.mul(opacity));
        })();
    }

    updateTexture(texture: THREE.Texture): void {
        texture.colorSpace = THREE.NoColorSpace;
        this.sdfTexNode.value = texture;
        this.needsUpdate = true;
    }
}
