/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import {
    attribute,
    float,
    Fn,
    mix as tslMix,
    modelViewPosition,
    modelViewProjection,
    normalize,
    normalLocal,
    positionLocal,
    select,
    smoothstep,
    step,
    texture,
    uniform,
    uv as uvNode,
    vec3,
    vec4
} from "three/tsl";
import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";

import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";

import { enforceBlending } from "./Utils";

export interface EdgeMaterialParameters {
    color?: number | string;
    colorMix?: number;
    vertexColors?: boolean;
    fadeNear?: number;
    fadeFar?: number;
    extrusionRatio?: number;
    displacementMap?: THREE.Texture;
    displacementMapUvMatrix?: THREE.Matrix3;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class EdgeMaterial extends NodeMaterial {
    /**
     * See SolidLineMaterial.customProgramCacheKey: NodeMaterial's default key
     * hashes per-instance node ids, forcing a full TSL rebuild for every
     * tile's material. The graph here branches only on flags the renderer's
     * material-property iteration already captures (vertexColors), so a
     * constant per-class key shares one built state across instances;
     * per-instance uniform values still upload at draw time.
     */
    public override customProgramCacheKey(): string {
        return "flywave:" + this.type;
    }

    static DEFAULT_COLOR: number = 0x000000;
    static DEFAULT_COLOR_MIX: number = 0.0;

    private readonly m_edgeColorU = uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR));
    private readonly m_objectColorU = uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR));
    private readonly m_colorMixU = uniform(EdgeMaterial.DEFAULT_COLOR_MIX);
    private readonly m_fadeNearU = uniform(-1.0);
    private readonly m_fadeFarU = uniform(-1.0);
    private readonly m_extrusionRatioU = uniform(ExtrusionFeatureDefs.DEFAULT_RATIO_MAX);
    private readonly m_displacementMapNode = texture(
        new THREE.DataTexture(
            new Uint8Array([255, 255, 255, 255]),
            1,
            1,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        )
    );

    displacementMap: THREE.Texture | null = null;
    displacementMapUvMatrix: THREE.Matrix3 | null = null;
    linewidth: number = 1;

    constructor(params?: EdgeMaterialParameters) {
        super();
        this.name = "EdgeMaterial";
        this.depthWrite = false;
        // Same as SolidLineMaterial: CustomBlending, transparent stays false
        // so building edges sort with the opaque geometry (harp.gl
        // `enforceBlending`).
        enforceBlending(this);

        if (params?.color !== undefined) this.m_edgeColorU.value.set(params.color as any);
        if (params?.colorMix !== undefined) this.m_colorMixU.value = params.colorMix;
        if (params?.fadeNear !== undefined) {
            this.fadeNear = params.fadeNear;
        }
        if (params?.fadeFar !== undefined) {
            this.fadeFar = params.fadeFar;
        }
        if (params?.extrusionRatio !== undefined) {
            this.extrusionRatio = params.extrusionRatio;
        }
        if (params?.displacementMap) {
            this.displacementMap = params.displacementMap;
            this.m_displacementMapNode.value = params.displacementMap;
        }

        this.setupNodes(params?.vertexColors ?? false);
    }

    private setupNodes(useVertexColors: boolean) {
        const extrusionAxis = attribute("extrusionAxis", "vec4");
        const EDGE_DEPTH_OFFSET = float(0.0004);

        this.positionNode = Fn(() => {
            let pos = positionLocal;
            pos = pos.add(extrusionAxis.xyz.mul(this.m_extrusionRatioU.sub(1)));
            if (this.displacementMap) {
                const disp = this.m_displacementMapNode.r;
                pos = pos.add(normalize(normalLocal).mul(disp));
            }
            return pos;
        })();

        // harp.gl: `gl_Position.z -= step(-1.0, -gl_Position.z / gl_Position.w)
        // * EDGE_DEPTH_OFFSET` — a clip-space depth offset against the ground.
        // That is `vertexNode` (the clip-space output) in TSL; `positionNode`
        // is LOCAL space and gets the model-view-projection applied on top, so
        // returning clip coordinates from it projected the edges twice (nothing
        // visible). `step(edge, x)` also takes the edge FIRST, as in GLSL.
        // Start from the renderer's own clip position (`modelViewProjection`
        // goes through builder.context.setupModelViewProjection, which the
        // engine's render context owns — recomputing it from
        // cameraProjectionMatrix × modelViewMatrix bypassed that and the
        // edges never reached the screen inside MapView). With a reversed
        // depth buffer "towards the camera" is +z, so the offset flips sign.
        this.vertexNode = Fn((_inputs: unknown, builder: { renderer: { reversedDepthBuffer?: boolean } }) => {
            const clipPos = modelViewProjection.toVar();
            const ndcDepth = clipPos.z.negate().div(clipPos.w);
            const depthOffset = step(float(-1.0), ndcDepth).mul(EDGE_DEPTH_OFFSET);
            if (builder.renderer.reversedDepthBuffer === true) {
                clipPos.z.addAssign(depthOffset);
            } else {
                clipPos.z.subAssign(depthOffset);
            }
            return clipPos;
        })();

        // NOTE: the result is routed through `colorNode`, NOT `fragmentNode`.
        // In three r185 a custom fragmentNode bypasses the renderer's MRT
        // wrapping in NodeMaterial.setup(), so the pipeline emits a single
        // fragment output while ViewRenderManager's scene pass provides two
        // color targets (`output` + `pickDepth`) — WebGPU rejects the
        // pipeline and the WHOLE frame is lost. See SolidLineMaterial for
        // the full comment.
        const fragmentColor = Fn(() => {
            let edgeCol = this.m_edgeColorU;
            if (useVertexColors) {
                const vertColor = attribute("color", "vec4");
                edgeCol = tslMix(this.m_edgeColorU, vertColor.rgb, this.m_colorMixU);
            }

            // harp.gl compiles the fade out entirely (#ifdef USE_FADING) unless
            // fadeNear/fadeFar were set; with the -1/-1 defaults a bare
            // smoothstep(-1, -1, depth) is 1 and the edge vanishes.
            const mvDepth = modelViewPosition.z.negate();
            const fadeDisabled = this.m_fadeNearU.equal(this.m_fadeFarU);
            const fadeFactor = select(
                fadeDisabled,
                float(0),
                smoothstep(this.m_fadeNearU, this.m_fadeFarU, mvDepth)
            );
            const extrusionAlpha = smoothstep(float(0), float(0.25), this.m_extrusionRatioU);
            const alpha = float(1).sub(fadeFactor).mul(extrusionAlpha);

            return vec4(edgeCol, alpha);
        })();
        this.colorNode = fragmentColor;
        // The fragment output previously ignored Material.opacity; pin
        // opacityNode to 1 to keep that exact behavior.
        this.opacityNode = float(1);
    }

    /**
     * fadeNear/fadeFar/extrusionRatio drive shader uniforms. They must be
     * accessors: FadingFeature.addRenderHelper assigns the camera-relative
     * distances every frame and AnimatedExtrusionHandler assigns the ratio —
     * as plain fields those writes never reached the uniforms, which kept the
     * theme's raw fade FRACTIONS (e.g. -0.75 / 1) and faded every edge to
     * alpha 0 (smoothstep(-0.75, 1, viewDepth) == 1).
     */
    get fadeNear(): number {
        return this.m_fadeNearU.value;
    }

    set fadeNear(value: number) {
        this.m_fadeNearU.value = value;
    }

    get fadeFar(): number {
        return this.m_fadeFarU.value;
    }

    set fadeFar(value: number) {
        this.m_fadeFarU.value = value;
    }

    get extrusionRatio(): number {
        return this.m_extrusionRatioU.value;
    }

    set extrusionRatio(value: number) {
        this.m_extrusionRatioU.value = value;
    }

    get color(): THREE.Color {
        return this.m_edgeColorU.value;
    }

    set color(value: THREE.Color) {
        this.m_edgeColorU.value.copy(value);
    }

    get objectColor(): THREE.Color {
        return this.m_objectColorU.value;
    }

    set objectColor(value: THREE.Color) {
        this.m_objectColorU.value.copy(value);
    }

    get colorMix(): number {
        return this.m_colorMixU.value;
    }

    set colorMix(value: number) {
        this.m_colorMixU.value = value;
    }

    get lineWidth(): number {
        return this.linewidth;
    }

    set lineWidth(value: number) {
        this.linewidth = value;
        this.visible = value > 0;
    }
}
