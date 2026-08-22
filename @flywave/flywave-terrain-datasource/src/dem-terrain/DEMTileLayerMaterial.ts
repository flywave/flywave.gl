// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import {
    Discard,
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
    positionLocal
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

// ---------------------------------------------------------------------------
// SHARED SINGLETON NODE GRAPHS (one per layer variant).
//
// CRITICAL performance contract (proven by the pre-refactor DEMTileMeshMaterial
// at 60fps): the TSL graphs are built ONCE at module load. Every material
// instance assigns these same node instances, so every tile compiles to the
// SAME generated shader → one pipeline per variant for the whole scene.
// Per-mesh values are resolved at draw time via onObjectUpdate reading plain
// properties from the mesh object (see TerrainLayerMesh). Material INSTANCES
// are still per-mesh (never shared), but the compiled program is shared.
// ---------------------------------------------------------------------------

// Height-map (elevation) texture — vertex displacement + fragment workaround.
const _heightMapTex = texture(emptyOpaqueTex);
_heightMapTex.onObjectUpdate(({ object }) => object.heightMapTexture ?? emptyOpaqueTex);

// Ground-modification (brush/excavation) height+mask texture.
const _modifierTex = texture(emptyOpaqueTex);
_modifierTex.onObjectUpdate(({ object }) => object.modifierTexture ?? emptyOpaqueTex);

// This layer's albedo / decal texture.
const _layerTex = texture(emptyOpaqueTex);
_layerTex.onObjectUpdate(({ object }) => object.layerTexture ?? emptyOpaqueTex);

// Per-mesh plain-value uniforms (resolved per draw call from the mesh).
const _uvTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
_uvTransform.onObjectUpdate(({ object }) => object.uvTransform ?? _uvTransform.value);

const _opacity = uniform(1);
_opacity.onObjectUpdate(({ object }) => object.opacity ?? 1);

const _hasImagery = uniform(0);
_hasImagery.onObjectUpdate(({ object }) => object.hasImagery ?? 0);

const _fallbackColor = uniform(new THREE.Color(0.5, 0.5, 0.5));
_fallbackColor.onObjectUpdate(({ object }) => object.fallbackColor ?? _fallbackColor.value);

// Per-tile geometry/elevation uniforms (same layout as the legacy material).
const _packCol0 = uniform(new THREE.Vector4());
_packCol0.onObjectUpdate(({ object }) => object.packCol0 ?? _packCol0.value);

const _patchPos0 = uniform(new THREE.Vector4());
_patchPos0.onObjectUpdate(({ object }) => object.patchPos0 ?? _patchPos0.value);
const _patchPos1 = uniform(new THREE.Vector4());
_patchPos1.onObjectUpdate(({ object }) => object.patchPos1 ?? _patchPos1.value);
const _patchPos2 = uniform(new THREE.Vector4());
_patchPos2.onObjectUpdate(({ object }) => object.patchPos2 ?? _patchPos2.value);
const _patchPos3 = uniform(new THREE.Vector4());
_patchPos3.onObjectUpdate(({ object }) => object.patchPos3 ?? _patchPos3.value);

const _demUnpack = uniform(new THREE.Vector4());
_demUnpack.onObjectUpdate(({ object }) => object.demUnpack ?? _demUnpack.value);

const _heightMapPos = uniform(new THREE.Vector4(1, 0, 0, 0));
_heightMapPos.onObjectUpdate(({ object }) => object.heightMapPos ?? _heightMapPos.value);

const _texSize = uniform(new THREE.Vector2(1, 1));
_texSize.onObjectUpdate(({ object }) => object.texSize ?? _texSize.value);

const _skirtHeight = uniform(0);
_skirtHeight.onObjectUpdate(({ object }) => object.skirtHeight ?? 0);

const _projFactor = uniform(0);
_projFactor.onObjectUpdate(({ object }) => object.projectionFactor ?? 0);

const _modifierUVBounds = uniform(new THREE.Vector4());
_modifierUVBounds.onObjectUpdate(
    ({ object }) => object.modifierUVBounds ?? _modifierUVBounds.value
);

const _modifierOp = uniform(0);
_modifierOp.onObjectUpdate(({ object }) => object.modifierOp ?? 0);

const _hasModifier = uniform(0);
_hasModifier.onObjectUpdate(({ object }) => object.hasModifier ?? 0);

/**
 * Shared vertex-stage terrain displacement graph.
 *
 * Built EXACTLY ONCE and assigned to ALL layer variants (base / overlay /
 * projector). This is a hard correctness requirement, not just a perf one:
 * patchPos uniforms carry world-magnitude values (~6.4e6 m), where a single
 * ULP is ~0.5 m. If variants used separately built graphs, the generated
 * WGSL text would differ (e.g. base's normal block) and GPU compilers could
 * fuse/schedule the position math differently — meter-scale vertex
 * divergence and obvious z-fighting between the base and its coincident
 * decal layers. One shared node instance ⇒ identical position codegen ⇒
 * bit-identical depth for every layer of a tile.
 *
 * The normal block is always built; MeshBasicNodeMaterial variants never
 * read the varying, so their compilers eliminate it without touching the
 * live position sequence.
 */
const s_sharedNodes = (() => {
    const mercatorPosition = attribute("mercatorPosition", "vec3");
    const pos = positionLocal;
    const texUv = uvNode();
    const webMercatorY = attribute("webMercatorY", "float");

    const isSimplePatch = _packCol0.w.greaterThan(0);

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
        const h = decodeElevation(texture(_heightMapTex, demUv));
        return applyModifier(h, t);
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
            const texelsPerUV = _texSize.x.mul(_heightMapPos.x);
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

    return { positionNode, vTerrainNormal, texUv, tileUvToDemSample, webMercatorY };
})();

// WORKAROUND (inherited from the legacy DEMTileMeshMaterial): sample the
// height-map once in the fragment stage so its binding gets VERTEX|FRAGMENT
// visibility; vertex-only bindings are unstable under WebGPU after LOD splits.
function withHeightMapVisibilityFix(color, nodes) {
    const demUv = nodes.tileUvToDemSample(nodes.texUv);
    color.assign(color.add(texture(_heightMapTex, demUv).mul(0.0001)));
    return color;
}

// --- Base variant: lit, one imagery texture as albedo or solid fallback ---
const s_baseNodes = (() => {
    const colorNode = Fn(() => {
        const mapUv = vec2(s_sharedNodes.texUv.x, s_sharedNodes.webMercatorY);
        const tUv = vec2(
            mapUv.x.mul(_uvTransform.x).add(_uvTransform.z),
            mapUv.y.mul(_uvTransform.y).add(_uvTransform.w)
        );
        const inRange = tUv.x
            .greaterThanEqual(float(-0.01))
            .and(tUv.x.lessThanEqual(float(1.01)))
            .and(tUv.y.greaterThanEqual(float(-0.01)))
            .and(tUv.y.lessThanEqual(float(1.01)));
        const imageryColor = texture(_layerTex, tUv);
        const useImagery = _hasImagery.equal(1).and(inRange);
        const color = select(useImagery, imageryColor, vec4(_fallbackColor, 1.0));

        return withHeightMapVisibilityFix(color, s_sharedNodes);
    })();

    return { colorNode };
})();

// --- Overlay variant: unlit decal, tile UV × uvTransform ---
// Used by BOTH additional imagery layers and projector layers: a projector
// image is mapped through the SAME CPU-computed tile-UV transform derived
// from its geoBox, so it rides the identical color graph (and pipeline) as
// satellite overlays. No world-space projector matrix / RTE camera-pos
// correction in the shader at all.
const s_overlayNodes = (() => {
    const colorNode = Fn(() => {
        const mapUv = vec2(s_sharedNodes.texUv.x, s_sharedNodes.webMercatorY);
        const tUv = vec2(
            mapUv.x.mul(_uvTransform.x).add(_uvTransform.z),
            mapUv.y.mul(_uvTransform.y).add(_uvTransform.w)
        );
        // HARD discard: any fragment whose decal UV falls outside [0,1] is
        // killed outright — no clamp-to-edge edge sampling, no alpha
        // leakage through the blend pipeline. The decal's on-screen coverage
        // is EXACTLY the geoBox rectangle, nothing beyond it.
        Discard(
            tUv.x
                .lessThan(0.0)
                .or(tUv.x.greaterThan(1.0))
                .or(tUv.y.lessThan(0.0))
                .or(tUv.y.greaterThan(1.0))
        );
        const texColor = texture(_layerTex, tUv);
        const a = texColor.a.mul(_opacity);
        const color = vec4(texColor.rgb.mul(_opacity), a).toVar();

        return withHeightMapVisibilityFix(color, s_sharedNodes);
    })();

    return { colorNode };
})();

/**
 * Lit base terrain material — exactly one per tile. Owns depth writing,
 * lighting, shadow receiving and picking. Renders the first available
 * imagery texture as albedo, or a solid fallback color.
 *
 * Per-mesh data is read at draw time via onObjectUpdate from the mesh; this
 * material never stores per-tile state, so all tiles share ONE compiled
 * pipeline.
 */
export class DEMTileBaseMaterial extends MeshStandardNodeMaterial {
    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super({ wireframe: false, transparent: false, blending: THREE.NoBlending, ...parameters });
        this.positionNode = s_sharedNodes.positionNode;
        this.colorNode = s_baseNodes.colorNode;
    }

    public setupNormal(builder: unknown) {
        const defaultNormal = super.setupNormal(builder);
        return select(_packCol0.w.greaterThan(0), s_sharedNodes.vTerrainNormal, defaultNormal);
    }
}

/**
 * Unlit decal overlay material for additional imagery layers AND projector
 * layers (projector images use the same tile-UV transform mapping, derived
 * from their geoBox on the CPU). Never writes depth, never casts/receives
 * shadows, never picked.
 *
 * The position graph is SHARED with the base material (see s_sharedNodes) so
 * the decal's depth is bit-identical to the base surface — no z-fighting, no
 * polygon offset needed.
 */
export class DEMTileOverlayMaterial extends MeshBasicNodeMaterial {
    constructor(parameters?: THREE.MeshBasicMaterialParameters) {
        super({
            wireframe: false,
            transparent: true,
            blending: THREE.NormalBlending,
            ...parameters
        });
        this.depthWrite = false;
        this.positionNode = s_sharedNodes.positionNode;
        this.colorNode = s_overlayNodes.colorNode;
    }
}

export { emptyOpaqueTex, emptyTransparentTex };
