// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import {
    Fn,
    If,
    attribute,
    cross,
    dot,
    float,
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
    positionLocal,
    positionWorld
} from "three/tsl";

function dummyTex(alpha: number = 255): THREE.DataTexture {
    const t = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, alpha]),
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

const emptyOpaqueTex = dummyTex(255);
const emptyTransparentTex = dummyTex(0);

export type DEMLayerKind = "base" | "overlay" | "projector";

/**
 * Per-tile shared uniform node holder.
 *
 * One instance per TerrainResourceTile. Every layer material of that tile
 * references the SAME node instances in its TSL graph, so a CPU-side write
 * here (e.g. `patchPos0.value.copy(...)`) propagates to all layers at once.
 *
 * `heightMapTexture` / `modifierTexture` are TextureNodes whose `.value` is
 * swapped in place — texture replacement never rebuilds the node graph or
 * recompiles the shader.
 */
export class TerrainTileUniforms {
    /** xyz unused, w = isSimplePatch flag (legacy pack layout). */
    readonly packCol0 = uniform(new THREE.Vector4(0, 0, 0, 0));
    readonly patchPos0 = uniform(new THREE.Vector4());
    readonly patchPos1 = uniform(new THREE.Vector4());
    readonly patchPos2 = uniform(new THREE.Vector4());
    readonly patchPos3 = uniform(new THREE.Vector4());
    readonly demUnpack = uniform(new THREE.Vector4());
    readonly heightMapPos = uniform(new THREE.Vector4(1, 0, 0, 0));
    readonly texSize = uniform(new THREE.Vector2(1, 1));
    readonly skirtHeight = uniform(0);
    readonly projectionFactor = uniform(0);
    readonly modifierUVBounds = uniform(new THREE.Vector4());
    readonly modifierOp = uniform(0);
    readonly hasModifier = uniform(0);

    readonly heightMapTexture = texture(emptyOpaqueTex);
    readonly modifierTexture = texture(emptyOpaqueTex);

    /** Shared per-tile world offset (interpPos − tile.center), read-only by
     * TileObjectRenderer via each mesh's `displacement` reference. */
    readonly displacement = new THREE.Vector3();

    setHeightMapTexture(value: THREE.Texture | null) {
        this.heightMapTexture.value = value ?? emptyOpaqueTex;
    }

    setModifierTexture(value: THREE.Texture | null) {
        this.modifierTexture.value = value ?? emptyOpaqueTex;
    }
}

const uDemUnpack0 = new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0);
const uDemUnpack1 = new THREE.Vector4(0, 0, 0, 0);

/**
 * Shared vertex-stage terrain displacement graph (per material instance, but
 * wired to the tile's shared uniform nodes). Identical for all layer kinds so
 * base and overlay depths match bit-for-bit (no z-fighting, overlays rely on
 * depth test only).
 */
function buildTerrainPosition(u: TerrainTileUniforms, computeNormal: boolean) {
    const webMercatorY = attribute("webMercatorY", "float");
    const mercatorPosition = attribute("mercatorPosition", "vec3");
    const pos = positionLocal;
    const texUv = uvNode();

    const isSimplePatch = u.packCol0.w.greaterThan(0);

    const decodeElevation = Fn(([v]: [ReturnType<typeof vec4>]) => {
        return dot(vec4(v.xyz.mul(255.0), float(-1.0)), u.demUnpack);
    });

    const tileUvToDemSample = Fn(([t]: [ReturnType<typeof vec2>]) => {
        return vec2(
            t.x.mul(u.heightMapPos.x).add(u.heightMapPos.z),
            t.y.mul(u.heightMapPos.x).add(u.heightMapPos.y)
        );
    });

    const applyModifier = Fn(([height, t]: [ReturnType<typeof float>, ReturnType<typeof vec2>]) => {
        const b = u.modifierUVBounds;
        const inside = t.x
            .greaterThanEqual(b.x)
            .and(t.x.lessThanEqual(b.z))
            .and(t.y.greaterThanEqual(b.y))
            .and(t.y.lessThanEqual(b.w));
        const modUv = vec2(
            t.x.sub(b.x).div(b.z.sub(b.x)),
            float(1).sub(t.y.sub(b.y).div(b.w.sub(b.y)))
        );
        const modSample = u.modifierTexture.sample(modUv);
        const modH = decodeElevation(modSample);
        const isAdd = u.modifierOp.equal(0);
        const mod = select(
            isAdd,
            height.add(modH.mul(modSample.a)),
            tslMix(height, modH, modSample.a)
        );
        const hasA = select(modSample.a.greaterThan(0.001), mod, height);
        const ins = select(inside, hasA, height);
        return select(u.hasModifier.greaterThan(0), ins, height);
    });

    const smoothElevationVertex = Fn(([t]: [ReturnType<typeof vec2>]) => {
        const demUv = tileUvToDemSample(t);
        const h = decodeElevation(u.heightMapTexture.sample(demUv));
        return applyModifier(h, t);
    });

    const computeMvPos = Fn(([fUv, fPos]: [ReturnType<typeof vec2>, ReturnType<typeof vec3>]) => {
        const dx = fPos.x;
        const result = vec4(0, 0, 0, 1).toVar();

        If(isSimplePatch, () => {
            const p1 = u.patchPos0.add(u.patchPos1.mul(dx));
            const p2 = u.patchPos2.add(u.patchPos3.mul(dx));
            const bp = p1.add(p2.sub(p1).mul(fPos.y));
            const tn = normalize(cross(u.patchPos0.xyz, u.patchPos3.xyz));
            const skirtH = select(fPos.z.lessThan(0), u.skirtHeight.negate(), fPos.z);
            const hi = smoothElevationVertex(fUv);
            const height = hi.add(skirtH);
            result.assign(bp.add(vec4(tn.mul(height), 0.0)));
        }).Else(() => {
            result.assign(tslMix(vec4(fPos, 1.0), vec4(mercatorPosition, 1.0), u.projectionFactor));
        });

        return result;
    });

    const vTerrainNormal = vec3(0, 1, 0).toVarying("vTerrainNormal");

    const positionNode = Fn(() => {
        const finalPos = computeMvPos(texUv, pos).xyz.toVar();

        If(isSimplePatch, () => {
            if (computeNormal) {
                const texelsPerUV = u.texSize.x.mul(u.heightMapPos.x);
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
            }
        });

        return finalPos;
    })();

    return { positionNode, vTerrainNormal, texUv, tileUvToDemSample };
}

/**
 * Lit base terrain material. Exactly one per tile; owns depth writing,
 * shadow receiving, picking and lighting. Renders the first provider's first
 * imagery texture as albedo, or a solid fallback color when no imagery is
 * available.
 */
export class DEMTileBaseMaterial extends MeshStandardNodeMaterial {
    private readonly m_tileUniforms: TerrainTileUniforms;
    private m_imageryNode: ReturnType<typeof texture> | null = null;
    private readonly m_uvTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
    private readonly m_fallbackColor = uniform(new THREE.Color(0.5, 0.5, 0.5));
    private readonly m_vTerrainNormal: ReturnType<typeof vec3>;

    constructor(
        tileUniforms: TerrainTileUniforms,
        options?: {
            texture?: THREE.Texture;
            uvTransform?: THREE.Vector4;
            fallbackColor?: THREE.Color;
        }
    ) {
        super({ wireframe: false, transparent: false, blending: THREE.NoBlending });

        this.m_tileUniforms = tileUniforms;

        if (options?.fallbackColor) {
            this.m_fallbackColor.value.copy(options.fallbackColor);
        }

        const nodes = buildTerrainPosition(tileUniforms, true);
        this.positionNode = nodes.positionNode;
        this.m_vTerrainNormal = nodes.vTerrainNormal;

        const imageryNode = options?.texture ? texture(options.texture) : null;
        if (imageryNode) {
            this.m_imageryNode = imageryNode;
            if (options.uvTransform) {
                this.m_uvTransform.value.copy(options.uvTransform);
            }
        }

        const u = tileUniforms;
        const webMercatorY = attribute("webMercatorY", "float");
        this.colorNode = Fn(() => {
            const mapUv = vec2(nodes.texUv.x, webMercatorY);
            const tUv = vec2(
                mapUv.x.mul(this.m_uvTransform.x).add(this.m_uvTransform.z),
                mapUv.y.mul(this.m_uvTransform.y).add(this.m_uvTransform.w)
            );
            const inRange = tUv.x
                .greaterThanEqual(float(-0.01))
                .and(tUv.x.lessThanEqual(float(1.01)))
                .and(tUv.y.greaterThanEqual(float(-0.01)))
                .and(tUv.y.lessThanEqual(float(1.01)));
            const imageryColor = this.m_imageryNode
                ? this.m_imageryNode.sample(tUv)
                : vec4(this.m_fallbackColor, 1.0);
            const color = select(inRange, imageryColor, vec4(this.m_fallbackColor, 1.0));

            // WORKAROUND (see DEMTileMeshMaterial): force VERTEX|FRAGMENT
            // visibility on the height-map binding; vertex-only bindings are
            // unstable under WebGPU after LOD splits.
            const demUv = nodes.tileUvToDemSample(nodes.texUv);
            color.assign(color.add(u.heightMapTexture.sample(demUv).mul(0.0001)));

            return color;
        })();
    }

    public setupNormal(builder: unknown) {
        const defaultNormal = super.setupNormal(builder);
        return select(
            this.m_tileUniforms.packCol0.w.greaterThan(0),
            this.m_vTerrainNormal,
            defaultNormal
        );
    }

    /**
     * Swap the albedo texture / uv transform in place (no shader rebuild).
     * Passing null removes imagery (solid fallback color).
     */
    setImagery(tex: THREE.Texture | null, uvTransform?: THREE.Vector4) {
        if (!tex) {
            this.m_imageryNode = null;
            this.needsUpdate = true;
            return;
        }
        if (!this.m_imageryNode) {
            this.m_imageryNode = texture(tex);
            this.needsUpdate = true;
        } else {
            this.m_imageryNode.value = tex;
        }
        if (uvTransform) {
            this.m_uvTransform.value.copy(uvTransform);
        }
    }
}

/**
 * Unlit decal overlay material for additional imagery layers and projector
 * layers. Never writes depth, never casts/receives shadows, never picked.
 *
 * Two sampling variants:
 *  - `overlay`: tile UV × uvTransform (same as base albedo sampling)
 *  - `projector`: world position (RTE-corrected) × orthographic projector matrix
 */
export class DEMTileOverlayMaterial extends MeshBasicNodeMaterial {
    private m_textureNode: ReturnType<typeof texture> | null = null;
    private readonly m_uvTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
    private readonly m_opacity = uniform(1);
    private readonly m_projectorMatrix: ReturnType<typeof uniform>;
    private readonly m_cameraPos: ReturnType<typeof uniform>;
    private readonly m_kind: DEMLayerKind;

    constructor(
        tileUniforms: TerrainTileUniforms,
        kind: Extract<DEMLayerKind, "overlay" | "projector">,
        options?: {
            texture?: THREE.Texture;
            uvTransform?: THREE.Vector4;
            opacity?: number;
            /**
             * Shared projector matrix instance (typically the ProjectorLayer's
             * own matrix). Mutating it in place updates this material with
             * zero rebuilds.
             */
            projectorMatrix?: THREE.Matrix4;
            /**
             * Shared camera-position instance (the manager's cameraPos,
             * refreshed every frame for RTE correction).
             */
            cameraPos?: THREE.Vector3;
            blendMode?: THREE.Blending;
        }
    ) {
        super({ wireframe: false, transparent: true, blending: THREE.NormalBlending });
        this.depthWrite = false;
        this.m_kind = kind;
        if (options?.blendMode !== undefined) {
            this.blending = options.blendMode;
        }

        // Wrap the SHARED instances (not copies) so manager-side mutations
        // propagate live through the uniform nodes.
        this.m_projectorMatrix = uniform(options?.projectorMatrix ?? new THREE.Matrix4());
        this.m_cameraPos = uniform(options?.cameraPos ?? new THREE.Vector3());

        const nodes = buildTerrainPosition(tileUniforms, false);
        this.positionNode = nodes.positionNode;

        if (options?.texture) {
            this.m_textureNode = texture(options.texture);
        }
        if (options?.uvTransform) {
            this.m_uvTransform.value.copy(options.uvTransform);
        }
        if (options?.opacity !== undefined) {
            this.m_opacity.value = options.opacity;
        }

        const u = tileUniforms;

        this.colorNode = Fn(() => {
            const color = vec4(0).toVar();

            if (kind === "overlay") {
                const mapUv = vec2(nodes.texUv.x, attribute("webMercatorY", "float"));
                const tUv = vec2(
                    mapUv.x.mul(this.m_uvTransform.x).add(this.m_uvTransform.z),
                    mapUv.y.mul(this.m_uvTransform.y).add(this.m_uvTransform.w)
                );
                const inRange = tUv.x
                    .greaterThanEqual(float(-0.01))
                    .and(tUv.x.lessThanEqual(float(1.01)))
                    .and(tUv.y.greaterThanEqual(float(-0.01)))
                    .and(tUv.y.lessThanEqual(float(1.01)));
                const texColor = this.m_textureNode ? this.m_textureNode.sample(tUv) : vec4(0);
                const a = texColor.a.mul(this.m_opacity).mul(select(inRange, 1, 0));
                color.assign(vec4(texColor.rgb.mul(this.m_opacity), a));
            } else {
                const trueWorldPos = positionWorld.add(this.m_cameraPos);
                const projCoord = this.m_projectorMatrix.mul(trueWorldPos);
                const projUv = projCoord.xy.div(projCoord.w).mul(0.5).add(0.5);
                const inProj = projUv.x
                    .greaterThanEqual(0)
                    .and(projUv.x.lessThanEqual(1))
                    .and(projUv.y.greaterThanEqual(0))
                    .and(projUv.y.lessThanEqual(1))
                    .and(projCoord.w.greaterThan(0));
                const projColor = this.m_textureNode ? this.m_textureNode.sample(projUv) : vec4(0);
                const a = projColor.a.mul(this.m_opacity).mul(select(inProj, 1, 0));
                color.assign(vec4(projColor.rgb.mul(this.m_opacity), a));
            }

            const demUv = nodes.tileUvToDemSample(nodes.texUv);
            color.assign(color.add(u.heightMapTexture.sample(demUv).mul(0.0001)));

            return color;
        })();
    }

    get layerKind(): DEMLayerKind {
        return this.m_kind;
    }

    /** Swap decal texture in place. */
    setLayerTexture(tex: THREE.Texture) {
        if (!this.m_textureNode) {
            this.m_textureNode = texture(tex);
            this.needsUpdate = true;
        } else {
            this.m_textureNode.value = tex;
        }
    }

    setOpacity(value: number) {
        this.m_opacity.value = value;
    }

    setLayerBlending(blending: THREE.Blending) {
        if (this.blending !== blending) {
            this.blending = blending;
            this.needsUpdate = true;
        }
    }

    setUvTransform(transform: THREE.Vector4) {
        this.m_uvTransform.value.copy(transform);
    }
}
