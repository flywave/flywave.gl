/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { attribute, float, Fn, positionLocal, texture, uv as uvNode, varying, vec4 } from "three/tsl";
import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";

export interface IconMaterialParameters {
    map: THREE.Texture;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class IconMaterial extends NodeMaterial {
    private readonly m_mapNode: ReturnType<typeof texture>;

    constructor(params?: IconMaterialParameters) {
        super();
        this.name = "IconMaterial";
        this.depthTest = false;
        this.depthWrite = false;
        this.transparent = true;
        this.premultipliedAlpha = true;
        this.vertexColors = true;

        const tex =
            params?.map ??
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            );
        tex.needsUpdate = true;
        this.m_mapNode = texture(tex);

        const vColor = varying(attribute("color", "vec4"), "vColor");

        // NOTE: routed through `colorNode`, NOT `fragmentNode` — a custom
        // fragmentNode bypasses the renderer's MRT wrapping in three r185
        // (see SolidLineMaterial.setupNodes for the full comment) and makes
        // the WebGPU pipeline invalid in the MRT scene pass. premultiplied
        // alpha handling is unchanged (NodeMaterial.setupOutput applies it
        // on the standard path as well).
        const fragmentColor = Fn(() => {
            const col = this.m_mapNode.mul(vColor);
            return col;
        })();
        this.colorNode = fragmentColor;
        // The fragment output previously ignored Material.opacity; pin
        // opacityNode to 1 to keep that exact behavior.
        this.opacityNode = float(1);
    }

    get map(): THREE.Texture {
        return this.m_mapNode.value;
    }
}
