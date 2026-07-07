/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
    Fn,
    attribute,
    mix as tslMix,
    normalize,
    smoothstep,
    texture,
    uniform,
    uv as uvNode,
    vec3,
    vec4,
    positionLocal,
    normalLocal,
    modelViewPosition,
    cameraProjectionMatrix
} from "three/tsl";

import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";

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
    static DEFAULT_COLOR: number = 0x000000;
    static DEFAULT_COLOR_MIX: number = 0.0;

    private m_edgeColorU = uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR));
    private m_objectColorU = uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR));
    private m_colorMixU = uniform(EdgeMaterial.DEFAULT_COLOR_MIX);
    private m_fadeNearU = uniform(-1.0);
    private m_fadeFarU = uniform(-1.0);
    private m_extrusionRatioU = uniform(ExtrusionFeatureDefs.DEFAULT_RATIO_MAX);
    private m_displacementMapNode = texture(
        new THREE.DataTexture(
            new Uint8Array([255, 255, 255, 255]),
            1,
            1,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        )
    );

    fadeNear: number = -1.0;
    fadeFar: number = -1.0;
    extrusionRatio: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    displacementMap: THREE.Texture | null = null;
    displacementMapUvMatrix: THREE.Matrix3 | null = null;
    linewidth: number = 1;

    constructor(params?: EdgeMaterialParameters) {
        super();
        this.name = "EdgeMaterial";
        this.depthWrite = false;
        this.transparent = true;

        if (params?.color !== undefined) this.m_edgeColorU.value.set(params.color as any);
        if (params?.colorMix !== undefined) this.m_colorMixU.value = params.colorMix;
        if (params?.fadeNear !== undefined) {
            this.fadeNear = params.fadeNear;
            this.m_fadeNearU.value = params.fadeNear;
        }
        if (params?.fadeFar !== undefined) {
            this.fadeFar = params.fadeFar;
            this.m_fadeFarU.value = params.fadeFar;
        }
        if (params?.extrusionRatio !== undefined) {
            this.extrusionRatio = params.extrusionRatio;
            this.m_extrusionRatioU.value = params.extrusionRatio;
        }
        if (params?.displacementMap) {
            this.displacementMap = params.displacementMap;
            this.m_displacementMapNode.value = params.displacementMap;
        }

        this.setupNodes(params?.vertexColors ?? false);
    }

    private setupNodes(useVertexColors: boolean) {
        const extrusionAxis = attribute("extrusionAxis", "vec4");
        const EDGE_DEPTH_OFFSET = float(0.0001);

        this.positionNode = Fn(() => {
            let pos = positionLocal;
            pos = pos.add(extrusionAxis.xyz.mul(this.m_extrusionRatioU.sub(1)));
            if (this.displacementMap) {
                const disp = this.m_displacementMapNode.r;
                pos = pos.add(normalize(normalLocal).mul(disp));
            }
            return pos;
        })();

        // Apply depth offset after projection to prevent z-fighting with ground
        const originalPositionNode = this.positionNode;
        this.positionNode = Fn(() => {
            const transformed = originalPositionNode;
            const mvPosition = modelViewMatrix.mul(vec4(transformed, 1.0));
            const clipPos = cameraProjectionMatrix.mul(mvPosition);
            const depthOffset = clipPos.z.negate().div(clipPos.w).step(-1.0).mul(EDGE_DEPTH_OFFSET);
            clipPos.z = clipPos.z.sub(depthOffset);
            return clipPos;
        })();

        this.fragmentNode = Fn(() => {
            let edgeCol = this.m_edgeColorU;
            if (useVertexColors) {
                const vertColor = attribute("color", "vec4");
                edgeCol = tslMix(this.m_edgeColorU, vertColor.rgb, this.m_colorMixU);
            }

            const mvDepth = modelViewPosition.z.negate();
            const fadeFactor = smoothstep(this.m_fadeNearU, this.m_fadeFarU, mvDepth);
            const extrusionAlpha = smoothstep(float(0), float(0.25), this.m_extrusionRatioU);
            const alpha = float(1).sub(fadeFactor).mul(extrusionAlpha);

            return vec4(edgeCol, alpha);
        })();
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
