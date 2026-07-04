// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
    Fn,
    If,
    attribute,
    clamp,
    cross,
    dot,
    float,
    floor as tslFloor,
    fract,
    mix as tslMix,
    normalize,
    select,
    texture,
    transformNormalToView,
    uniform,
    uv as uvNode,
    vec2,
    vec3,
    vec4,
    positionLocal
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

const emptyTexture = dummyTex();
const emptyImageryTextures = [dummyTex(), dummyTex(), dummyTex(), dummyTex(), dummyTex()];

// ====================================================================
// Module-level shared TSL nodes with onObjectUpdate
// ====================================================================

const _heightMapTex = texture(emptyTexture);
_heightMapTex.onObjectUpdate(({ material }) => material.heightMapTexture);

const _modifierTex = texture(emptyTexture);
_modifierTex.onObjectUpdate(({ material }) => material.modifierTexture);

const _overlayTex = texture(emptyTexture);
_overlayTex.onObjectUpdate(({ material }) => material.overlayTexture);

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

const _packCol0 = uniform(new THREE.Vector4()).onObjectUpdate(({ material }) => material.packCol0);
const _demUnpack = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.demUnpack
);
const _heightMapPos = uniform(new THREE.Vector4(1, 0, 0, 0)).onObjectUpdate(
    ({ material }) => material.heightMapPos
);
const _patchPos0 = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.patchPos0
);
const _patchPos1 = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.patchPos1
);
const _patchPos2 = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.patchPos2
);
const _patchPos3 = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.patchPos3
);
const _texSize = uniform(new THREE.Vector2(1, 1)).onObjectUpdate(
    ({ material }) => material.texSize
);
const _skirtHeight = uniform(0.0).onObjectUpdate(({ material }) => material.skirtHeight);
const _projFactor = uniform(0.0).onObjectUpdate(({ material }) => material.projectionFactor);
const _modifierUVBounds = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ material }) => material.modifierUVBounds
);
const _modifierOp = uniform(0).onObjectUpdate(({ material }) => material.modifierOp);
const _hasModifier = uniform(0).onObjectUpdate(({ material }) => material.hasModifier);
const _overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
    ({ material }) => material.overlayTransform
);
const _imageryCount = uniform(0).onObjectUpdate(({ material }) => material.imageryCount);

/**
 * Builds the shared TSL position and color nodes for DEM terrain rendering.
 *
 * The position node computes terrain elevation by sampling the height map
 * texture with bilinear interpolation, applying optional ground modifiers.
 * For simple patches it reconstructs world-space positions from patch basis
 * vectors. The color node composites up to 5 imagery layers based on UV
 * transforms and a Web Mercator Y coordinate.
 *
 * @returns An object containing the assembled positionNode, colorNode, and vTerrainNormal varying.
 */
function buildNodes() {
    const webMercatorY = attribute("webMercatorY", "float");
    const mercatorPosition = attribute("mercatorPosition", "vec3");
    const pos = positionLocal;
    const texUv = uvNode();

    const isSimplePatch = _packCol0.w.greaterThan(0);
    const texSizeF = _texSize;

    const decodeElevation = Fn(([v]: [ReturnType<typeof vec4>]) => {
        return dot(vec4(v.xyz.mul(255.0), float(-1.0)), _demUnpack);
    });

    const tileUvToDemSample = Fn(([t]: [ReturnType<typeof vec2>]) => {
        return vec2(
            t.x.mul(_heightMapPos.x).add(_heightMapPos.z),
            t.y.mul(_heightMapPos.x).add(_heightMapPos.y)
        );
    });

    const applyModifier = Fn(([height, t]: [ReturnType<typeof float>, ReturnType<typeof vec2>]) => {
        const b = _modifierUVBounds;
        const inside = t.x
            .greaterThanEqual(b.x)
            .and(t.x.lessThanEqual(b.z))
            .and(t.y.greaterThanEqual(b.y))
            .and(t.y.lessThanEqual(b.w));
        const modUv = vec2(
            t.x.sub(b.x).div(b.z.sub(b.x)),
            float(1).sub(t.y.sub(b.y).div(b.w.sub(b.y)))
        );
        const modSample = texture(_modifierTex, modUv);
        const modH = decodeElevation(modSample);
        const isAdd = _modifierOp.equal(0);
        const mod = select(
            isAdd,
            height.add(modH.mul(modSample.a)),
            tslMix(height, modH, modSample.a)
        );
        const hasA = select(modSample.a.greaterThan(0.001), mod, height);
        const ins = select(inside, hasA, height);
        return select(_hasModifier.greaterThan(0), ins, height);
    });

    const smoothElevationVertex = Fn(([t]: [ReturnType<typeof vec2>]) => {
        const demUv = tileUvToDemSample(t);
        const tc = demUv.mul(texSizeF);
        const fc = tslFloor(tc);
        const fr = fract(tc);
        const u00 = clamp(fc.div(texSizeF), vec2(0), vec2(1));
        const u10 = clamp(fc.add(vec2(1, 0)).div(texSizeF), vec2(0), vec2(1));
        const u01 = clamp(fc.add(vec2(0, 1)).div(texSizeF), vec2(0), vec2(1));
        const u11 = clamp(fc.add(vec2(1, 1)).div(texSizeF), vec2(0), vec2(1));
        const h00 = decodeElevation(texture(_heightMapTex, u00));
        const h10 = decodeElevation(texture(_heightMapTex, u10));
        const h01 = decodeElevation(texture(_heightMapTex, u01));
        const h11 = decodeElevation(texture(_heightMapTex, u11));
        const h0 = tslMix(h00, h10, fr.x);
        const h1 = tslMix(h01, h11, fr.x);
        return applyModifier(tslMix(h0, h1, fr.y), t);
    });

    const computeMvPos = Fn(([fUv, fPos]: [ReturnType<typeof vec2>, ReturnType<typeof vec3>]) => {
        const dx = fPos.x;
        const result = vec4(0, 0, 0, 1).toVar();

        If(isSimplePatch, () => {
            const p1 = _patchPos0.add(_patchPos1.mul(dx));
            const p2 = _patchPos2.add(_patchPos3.mul(dx));
            const bp = p1.add(p2.sub(p1).mul(fPos.y));
            const tn = normalize(cross(_patchPos0.xyz, _patchPos3.xyz));
            const skirtH = select(fPos.z.lessThan(0), _skirtHeight.negate(), fPos.z);
            const hi = smoothElevationVertex(fUv);
            const height = hi.add(skirtH);
            result.assign(bp.add(vec4(tn.mul(height), 0.0)));
        }).Else(() => {
            result.assign(tslMix(vec4(fPos, 1.0), vec4(mercatorPosition, 1.0), _projFactor));
        });

        return result;
    });

    const vTerrainNormal = vec3(0, 1, 0).toVarying("vTerrainNormal");

    const positionNode = Fn(() => {
        const finalPos = computeMvPos(texUv, pos).xyz.toVar();

        If(isSimplePatch, () => {
            const texelsPerUV = texSizeF.x.mul(_heightMapPos.x);
            const e = float(1.0).div(texelsPerUV);
            const ox = vec2(e, float(0));
            const oy = vec2(float(0), e);

            const pR = computeMvPos(texUv.add(ox), vec3(pos.x.add(e), pos.y, pos.z)).xyz;
            const pL = computeMvPos(texUv.sub(ox), vec3(pos.x.sub(e), pos.y, pos.z)).xyz;
            const pU = computeMvPos(texUv.add(oy), vec3(pos.x, pos.y.add(e), pos.z)).xyz;
            const pD = computeMvPos(texUv.sub(oy), vec3(pos.x, pos.y.sub(e), pos.z)).xyz;

            const dxa = pR.sub(pL);
            const dya = pU.sub(pD);

            vTerrainNormal.assign(transformNormalToView(normalize(cross(dxa, dya))));
        });

        return finalPos;
    })();

    const colorNode = Fn(() => {
        const mapUv = vec2(texUv.x, webMercatorY);
        const color = vec4(0.0).toVar();

        for (let i = 0; i < 5; i++) {
            const tUv = vec2(
                mapUv.x.mul(_imageryTransform[i].x).add(_imageryTransform[i].z),
                mapUv.y.mul(_imageryTransform[i].y).add(_imageryTransform[i].w)
            );
            const inRange = tUv.x
                .greaterThanEqual(float(-0.01))
                .and(tUv.x.lessThanEqual(float(1.01)))
                .and(tUv.y.greaterThanEqual(float(-0.01)))
                .and(tUv.y.lessThanEqual(float(1.01)));
            const patchColor = texture(_imageryTex[i], tUv);
            color.assign(select(inRange.and(float(i).lessThan(_imageryCount)), patchColor, color));
        }

        return color;
    })();

    return { positionNode, colorNode, vTerrainNormal };
}

const s_nodes = buildNodes();

export { emptyTexture, emptyImageryTextures };

/**
 * DEM tile mesh material for rendering terrain with height-map-based elevation.
 *
 * This material extends MeshStandardNodeMaterial to provide WebGPU/TSL-compatible
 * rendering of DEM terrain tiles. It supports bilinear-interpolated elevation
 * from height map textures, ground modification modifiers, up to 5 imagery
 * layers, and an optional overlay texture.
 *
 * All TSL nodes are module-level shared instances using onObjectUpdate to read
 * per-instance property values at render time, ensuring the shader is compiled
 * only once while still supporting per-tile texture and uniform data.
 */
export class DEMTileMeshMaterial extends MeshStandardNodeMaterial {
    /** Whether to allow external systems to override material nodes */
    public allowOverride: boolean = false;

    /** Defines for shader feature toggles */
    public defines: Record<string, unknown> = {};

    // --- Imagery textures and transforms ---
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

    // --- Textures ---
    /** Height map texture for elevation sampling */
    public heightMapTexture: THREE.Texture = emptyTexture;
    /** Ground modifier texture for elevation editing */
    public modifierTexture: THREE.Texture = emptyTexture;
    /** Overlay texture rendered on top of imagery */
    public overlayTexture: THREE.Texture = emptyTexture;

    // --- Elevation decoding uniforms ---
    /** First column of the pack matrix (pack.w > 0 indicates simple patch mode) */
    public packCol0: THREE.Vector4 = new THREE.Vector4();
    /** DEM unpack vector for decoding elevation from RGB channels */
    public demUnpack: THREE.Vector4 = new THREE.Vector4();
    /** Height map position and scale in UV space */
    public heightMapPos: THREE.Vector4 = new THREE.Vector4(1, 0, 0, 0);

    // --- Patch position basis vectors ---
    /** Patch position column 0 (first basis vector) */
    public patchPos0: THREE.Vector4 = new THREE.Vector4();
    /** Patch position column 1 (second basis vector) */
    public patchPos1: THREE.Vector4 = new THREE.Vector4();
    /** Patch position column 2 (third basis vector) */
    public patchPos2: THREE.Vector4 = new THREE.Vector4();
    /** Patch position column 3 (fourth basis vector) */
    public patchPos3: THREE.Vector4 = new THREE.Vector4();

    // --- Height map parameters ---
    /** Size of the height map texture in pixels */
    public texSize: THREE.Vector2 = new THREE.Vector2(1, 1);
    /** Skirt height for tile edge geometry */
    public skirtHeight: number = 0;

    // --- Projection ---
    /** Projection interpolation factor between local and Mercator positions */
    public projectionFactor: number = 0;

    // --- Ground modifier ---
    /** UV bounds [minX, minY, maxX, maxY] for the modifier region */
    public modifierUVBounds: THREE.Vector4 = new THREE.Vector4();
    /** Modifier operation type (0 = add, 1 = blend) */
    public modifierOp: number = 0;
    /** Whether a modifier is active (0 = no, >0 = yes) */
    public hasModifier: number = 0;

    // --- Overlay ---
    /** UV transform for the overlay texture (scaleX, scaleY, offsetX, offsetY) */
    public overlayTransform: THREE.Vector4 = new THREE.Vector4(1, 1, 0, 0);

    /** Number of active imagery patches */
    public imageryCount: number = 0;

    /** Backing store for the pack matrix */
    private m_pack: THREE.Matrix4 = new THREE.Matrix4();
    /** Backing store for the patch position matrix */
    private m_patchPos: THREE.Matrix4 = new THREE.Matrix4();

    /**
     * Creates a new DEMTileMeshMaterial instance.
     *
     * @param parameters - Optional standard material parameters.
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
        this.positionNode = s_nodes.positionNode;
    }

    /**
     * Sets up the normal node for terrain lighting.
     *
     * For simple patches, uses the terrain normal computed from the height map.
     * Otherwise, falls back to the default material normal.
     *
     * @param builder - The node builder context.
     * @returns The computed normal node.
     */
    public setupNormal(builder: unknown) {
        const defaultNormal = super.setupNormal(builder);
        return select(_packCol0.w.greaterThan(0), s_nodes.vTerrainNormal, defaultNormal);
    }

    /**
     * Gets the pack matrix used for elevation decoding.
     */
    public get pack(): THREE.Matrix4 {
        return this.m_pack;
    }

    /**
     * Sets the pack matrix and decomposes it into column vectors.
     *
     * The matrix columns are extracted into packCol0, demUnpack, and
     * heightMapPos for use as individual shader uniforms.
     *
     * @param value - The 4x4 pack matrix.
     */
    public set pack(value: THREE.Matrix4) {
        this.m_pack.copy(value);
        const e = value.elements;
        this.packCol0.set(e[0], e[1], e[2], e[3]);
        this.demUnpack.set(e[4], e[5], e[6], e[7]);
        this.heightMapPos.set(e[8], e[9], e[10], e[11]);
    }

    /**
     * Gets the patch position matrix.
     */
    public get patchPos(): THREE.Matrix4 {
        return this.m_patchPos;
    }

    /**
     * Sets the patch position matrix and decomposes it into column vectors.
     *
     * Each column of the matrix becomes a separate Vector4 uniform
     * (patchPos0 through patchPos3) for the shader.
     *
     * @param value - The 4x4 patch position matrix.
     */
    public set patchPos(value: THREE.Matrix4) {
        this.m_patchPos.copy(value);
        const e = value.elements;
        this.patchPos0.set(e[0], e[1], e[2], e[3]);
        this.patchPos1.set(e[4], e[5], e[6], e[7]);
        this.patchPos2.set(e[8], e[9], e[10], e[11]);
        this.patchPos3.set(e[12], e[13], e[14], e[15]);
    }

    /**
     * Gets the imagery textures array (read-only).
     */
    public get imageryTextures(): readonly THREE.Texture[] {
        return this.m_imageryTextures;
    }

    /**
     * Gets the imagery transform array (read-only).
     */
    public get imageryTransforms(): readonly THREE.Vector4[] {
        return this.m_imageryTransforms;
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
        } else {
            this.overlayTexture = emptyTexture;
            this.overlayTransform.set(0, 0, 0, 0);
        }
    }

    /**
     * Sets the projection interpolation factor.
     *
     * @param projectionFactor - Factor for blending between local and Mercator positions.
     */
    public setProjectionUniforms(projectionFactor: number): void {
        this.projectionFactor = projectionFactor;
    }
}
