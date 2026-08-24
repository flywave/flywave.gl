// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { Fn, float, mix as tslMix, select, texture, uniform, uv as uvNode, attribute, vec2, vec4 } from "three/tsl";


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
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
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

// ---------------------------------------------------------------------------
// BASE material — one imagery texture per mesh (layer×mesh architecture, same
// as the DEM pipeline). The first imagery entry of a tile is the base albedo;
// every ADDITIONAL entry (cross-tile stitching patches, projector decals)
// rides its own decal mesh with QuantizedDecalMaterial below, sharing the
// tile geometry.
//
// The imagery texture and tile-UV transform are PER-MATERIAL nodes set once
// at creation (quantized tiles rebuild their objects on every load — no
// in-place updates needed). The colorNode is a PLAIN expression (no Fn
// wrapper): every instance generates byte-identical WGSL → one shared
// pipeline (per-material Fn colorNodes caused a recompile per tile — DEM
// path lesson). This replaces the old 5-slot imagery arrays of the shared
// singleton material.
// ---------------------------------------------------------------------------
export class QuantizedMeshMaterial extends MeshStandardNodeMaterial {
    /** Base albedo imagery texture node; value set once at creation. */
    public imageryTexNode: any;
    /** Tile-UV → imagery-UV transform (x/y = scale, z/w = offset). */
    public uvTexTransform: any;

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super({ wireframe: false, transparent: false, blending: THREE.NoBlending, ...parameters });

        this.uvTexTransform = uniform(new THREE.Vector4(1, 1, 0, 0));

        const texUv = uvNode();
        const webMercatorY = attribute("webMercatorY", "float");
        const tUv = vec2(
            texUv.x.mul(this.uvTexTransform.x).add(this.uvTexTransform.z),
            webMercatorY.mul(this.uvTexTransform.y).add(this.uvTexTransform.w)
        );
        this.imageryTexNode = texture(emptyTexture, tUv);
        this.colorNode = tslMix(this.imageryTexNode, vec4(1.0), float(0.1));
    }
}

// ---------------------------------------------------------------------------
// Decal material — one MESH (and one material instance) per layer per tile,
// mirroring the DEM layer×mesh pipeline. Used for projector decals AND for
// additional imagery entries (cross-tile stitching patches) of a tile; the
// decal mesh shares the quantized tile geometry (worker geometry carries
// uv + webMercatorY), so its depth is bit-identical to the base surface
// (depthWrite off, no z-fighting).
//
// The decal TEXTURE and the tile-UV transform are PER-MATERIAL nodes set once
// at creation. The colorNode is a PLAIN expression (no Fn wrapper): every
// instance generates byte-identical WGSL → one shared pipeline. Transform
// math for projector decals: SIGNED south-anchor offset, see
// computeDecalUvTransform in QuantizedMesh.ts; imagery entries use the
// tile-aligned variant via QuantizedMesh.computeTextureUvTransform.
// ---------------------------------------------------------------------------
export class QuantizedDecalMaterial extends MeshBasicNodeMaterial {
    /** Decal texture node; value is set once at creation. */
    public decalTexNode: any;
    /** Tile-UV → decal-UV transform (x/y = scale, z/w = offset). */
    public uvTexTransform: any;
    /** Layer opacity. */
    public opacityUniform: any;

    constructor(parameters?: THREE.MeshBasicMaterialParameters) {
        super({
            wireframe: false,
            transparent: true,
            blending: THREE.NormalBlending,
            ...parameters
        });
        this.depthWrite = false;

        this.uvTexTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
        this.opacityUniform = uniform(1);

        const texUv = uvNode();
        const webMercatorY = attribute("webMercatorY", "float");
        const tUv = vec2(
            texUv.x.mul(this.uvTexTransform.x).add(this.uvTexTransform.z),
            webMercatorY.mul(this.uvTexTransform.y).add(this.uvTexTransform.w)
        );
        const inRange = tUv.x
            .greaterThanEqual(float(0))
            .and(tUv.x.lessThanEqual(float(1)))
            .and(tUv.y.greaterThanEqual(float(0)))
            .and(tUv.y.lessThanEqual(float(1)));
        const gate = select(inRange, float(1), float(0));
        this.decalTexNode = texture(emptyTransparentTex, tUv);
        const a = this.decalTexNode.a.mul(this.opacityUniform).mul(gate);
        this.colorNode = vec4(this.decalTexNode.rgb.mul(this.opacityUniform), a).toVar();
    }
}

export { emptyTexture, emptyTransparentTex };
