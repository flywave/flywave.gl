/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { attribute, Fn, positionLocal, texture, uv as uvNode, varying, vec4 } from "three/tsl";
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

        this.fragmentNode = Fn(() => {
            const col = this.m_mapNode.mul(vColor);
            return col;
        })();
    }

    get map(): THREE.Texture {
        return this.m_mapNode.value;
    }
}
