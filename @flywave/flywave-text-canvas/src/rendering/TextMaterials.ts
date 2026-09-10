/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three/webgpu";
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

        this.sdfParamsUniform = { value: this.sdfParamsNode.value as THREE.Vector4 };
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
        const aColor = attribute("aColor", "vec4") as unknown as THREE.Node<"vec4"> & {
            rgb: THREE.Node<"vec3">;
            a: THREE.Node<"float">;
        };
        const aBgColor = attribute("aBgColor", "vec4") as unknown as THREE.Node<"vec4"> & {
            rgb: THREE.Node<"vec3">;
            a: THREE.Node<"float">;
        };

        this.fragmentNode = Fn(() => {
            const color = isBackground ? aBgColor : aColor;

            let opacityNode;
            if (isBackground) {
                // Solid rectangular plate covering the glyph quad (ink + atlas margin).
                // Dilating the glyph SDF instead draws a plate-colored outline around every
                // stroke, which turns thin-stroke CJK glyphs into doubled/blurry shapes; a
                // rect plate renders a clean label strip and never samples the clipped
                // field near the patch boundary (the detached "ghost frame" artifact).
                const luv = attribute("aLocalUv", "vec2");
                const ex = min(luv.x, float(1).sub(luv.x)).div(max(abs(dFdx(luv.x)), float(1e-6)));
                const ey = min(luv.y, float(1).sub(luv.y)).div(max(abs(dFdy(luv.y)), float(1e-6)));
                const coverage = clamp(min(ex, ey).add(0.5), 0, 1);
                // backgroundSize = 0 keeps meaning "no plate".
                opacityNode = coverage.mul(aBgWeight.greaterThan(0.0).select(1, 0));
            } else {
                const texSample = sdfTex;
                let dist = isMsdf
                    ? max(
                          min(texSample.r, texSample.g),
                          min(max(texSample.r, texSample.g), texSample.b)
                      )
                    : texSample.r;

                const rotUvX = cos(aRotation).mul(aUv.x).sub(sin(aRotation).mul(aUv.y));
                const rotUvY = sin(aRotation).mul(aUv.x).add(cos(aRotation).mul(aUv.y));
                const rotUvXAbs = abs(rotUvX);
                const rotUvYAbs = abs(rotUvY);

                const dx = dFdx(rotUvXAbs).mul(sdfParams.x);
                const dy = dFdy(rotUvYAbs).mul(sdfParams.y);
                const toPixels = sdfParams.w.mul(inverseSqrt(dx.mul(dx).add(dy.mul(dy))));

                // Font atlas pages clip the SDF field at the patch border: for CJK the ink can
                // reach the last texel with values >= iso, and the interpolated coverage then
                // saturates over the whole quad-edge column (vertical/horizontal hairlines
                // around every glyph). Clamping the sampled distance by the geometric distance
                // to the patch border (in the same px-per-distanceRange units) removes exactly
                // the clipped region without touching interior coverage.
                const aUvRect = attribute("aUvRect", "vec4");
                const borderTexels = min(
                    aUv.sub(aUvRect.xy).mul(sdfParams.x),
                    aUvRect.zw.sub(aUv).mul(sdfParams.y)
                );
                const borderPx = min(borderTexels.x, borderTexels.y);
                dist = min(dist, borderPx.div(sdfParams.w));

                // 与 main 对齐：膨胀权重不得超过安全上限，否则等值线会越过被裁剪的
                // patch 边界场，形成整圈不透明边框。
                const weight = min(aWeight, float(0.5).sub(float(1).div(sdfParams.w)));

                // 字形补丁边缘的 SDF 场被图集裁剪（边界值 ~0.06-0.18），前景等值线（0.5）
                // 距边界还有余量；背景膨胀权重必须收紧（见背景分支的矩形板实现）。
                const adjustedDist = dist.add(weight).sub(0.5);
                opacityNode = clamp(adjustedDist.mul(toPixels).add(0.5), 0, 1);
            }

            return vec4(color.rgb, color.a.mul(opacityNode));
        })();
    }

    updateTexture(texture: THREE.Texture): void {
        texture.colorSpace = THREE.NoColorSpace;
        this.sdfTexNode.value = texture;
        this.needsUpdate = true;
    }
}
