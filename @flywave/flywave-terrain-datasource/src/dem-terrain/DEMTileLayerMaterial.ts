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
//
// LOAD-BEARING: every shared texture node below needs its OWN dummy texture
// instance. TextureNode.getUniformHash() is `this.value.uuid`, and at build
// time that is the dummy's uuid — two nodes sharing one dummy would hash
// identically, UniformNode.generate() would merge them into ONE binding, and
// the later node would sample the earlier node's texture forever (imagery
// silently sampling the height-map → gray terrain).
const _heightMapTex = texture(dummyTex(255));
_heightMapTex.onObjectUpdate(({ object }) => object.heightMapTexture ?? emptyOpaqueTex);

// Ground-modification (brush/excavation) height+mask texture.
const _modifierTex = texture(dummyTex(255));
_modifierTex.onObjectUpdate(({ object }) => object.modifierTexture ?? emptyOpaqueTex);

// This layer's albedo / decal texture — SHARED node used DIRECTLY in the
// graph. NEVER re-wrap it as `texture(_layerTex, uv)`: the re-wrap CLONES
// the node, the clone carries no update callback and the base never enters
// the build graph, so onObjectUpdate would never fire and the sampled
// texture stays stuck on the dummy (the "gray satellite" bug).
//
// Load-bearing construction detail: the node is created WITHOUT a uv
// argument, so `updateMatrix` stays true and TextureNode.setup() ends its
// updateType re-computation with OBJECT (matrix uniform present). Passing
// the uv to texture() — or assigning `.uvNode` before setUpdateMatrix runs
// — would let setup() stomp updateType back to NONE and the per-draw swap
// below would never execute. NodeFrame.updateNode() honors updateType at
// CALL time, not registration time.
const _layerTex = texture(dummyTex(255));
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
    // Pure expression — assign would require an Fn() stack context, and the
    // overlay materials call this from plain-expression colorNodes.
    return color.add(texture(_heightMapTex, demUv).mul(0.0001));
}

// --- Base variant: lit, one imagery texture as albedo or solid fallback ---
//
// The color graph is a SHARED singleton assigned to every tile: identical
// node instances across materials keep NodeMaterial.customProgramCacheKey()
// (which recursively hashes node identities) equal for every tile, so the
// renderer shares ONE NodeBuilderState / WGSL for the whole scene. Per-tile
// imagery arrives through _layerTex's OBJECT update + binding rebind, and
// per-tile scalars through the onObjectUpdate uniforms — none of which
// affect the compiled shader.
const s_baseNodes = (() => {
    const mapUv = vec2(s_sharedNodes.texUv.x, s_sharedNodes.webMercatorY);
    const tUv = vec2(
        mapUv.x.mul(_uvTransform.x).add(_uvTransform.z),
        mapUv.y.mul(_uvTransform.y).add(_uvTransform.w)
    );
    // Attach the uv AFTER construction (plain property write) — see the
    // load-bearing note on _layerTex above.
    _layerTex.uvNode = tUv;
    const inRange = tUv.x
        .greaterThanEqual(float(-0.01))
        .and(tUv.x.lessThanEqual(float(1.01)))
        .and(tUv.y.greaterThanEqual(float(-0.01)))
        .and(tUv.y.lessThanEqual(float(1.01)));

    const colorNode = Fn(() => {
        const useImagery = _hasImagery.equal(1).and(inRange);
        const color = select(useImagery, _layerTex, vec4(_fallbackColor, 1.0));
        return withHeightMapVisibilityFix(color, s_sharedNodes);
    })();

    return { colorNode };
})();

// NOTE: the base material's graph above and the overlay/projector colorNodes
// are per-VARIANT singletons (not per material instance): byte-identical
// WGSL per variant → still one pipeline per variant. The decal TEXTURE of
// overlay materials remains per-material (rebound via `.value =` by
// TerrainLayerMesh.setLayerTexture) because overlay/projector layers may mix
// several different textures across tiles at the same time — a single shared
// node could only hold one of them per draw.

/**
 * Lit base terrain material — exactly one per tile. Owns depth writing,
 * lighting, shadow receiving and picking. Renders the first available
 * imagery texture as albedo, or a solid fallback color.
 *
 * All TSL graphs are SHARED module-level singletons; per-tile state
 * (imagery texture, uvTransform, hasImagery, geometry uniforms) is resolved
 * at draw time via OBJECT-type node updates reading plain properties from
 * the mesh (see TerrainLayerMesh). Never store per-tile state on the
 * material — that forks the builder cache key (NodeMaterial
 * .customProgramCacheKey() hashes node identities) and forces one shader
 * graph build per tile, which drops frames while tiles stream in.
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
 * layers. Never writes depth, never casts/receives shadows, never picked.
 *
 * The position graph is SHARED with the base material (see s_sharedNodes) so
 * the decal's depth is bit-identical to the base surface — no z-fighting, no
 * polygon offset needed.
 *
 * Sampling is tile-UV × uvTransform for ALL decal kinds (satellite overlays
 * and projector decals ride the identical path — the world-space orthographic
 * projector-matrix mode was REMOVED: it depth-conflicted with the base
 * surface at certain view angles, which is what originally motivated the
 * UV-transform rewrite).
 *
 * The decal TEXTURE is per-material (module-level shared texture nodes lose
 * per-object values in this architecture — the "white decal" bug) and is
 * rebound IN PLACE via `.value =` by TerrainLayerMesh.setLayerTexture. The
 * colorNode is a PLAIN expression (no Fn wrapper): every material instance
 * generates byte-identical WGSL, so all tiles share ONE compiled pipeline
 * (per-material Fn colorNodes caused a recompile per tile).
 */
export class DEMTileOverlayMaterial extends MeshBasicNodeMaterial {
    /** Per-material decal texture node; rebind via `.value =` (in place). */
    public decalTexNode: any;

    constructor(parameters?: THREE.MeshBasicMaterialParameters) {
        super({
            wireframe: false,
            transparent: true,
            blending: THREE.NormalBlending,
            ...parameters
        });
        this.depthWrite = false;
        this.positionNode = s_sharedNodes.positionNode;

        // Tile-UV × uvTransform with a hard [0,1] gate.
        const mapUv = vec2(s_sharedNodes.texUv.x, s_sharedNodes.webMercatorY);
        const tUv = vec2(
            mapUv.x.mul(_uvTransform.x).add(_uvTransform.z),
            mapUv.y.mul(_uvTransform.y).add(_uvTransform.w)
        );
        const inRange = tUv.x
            .greaterThanEqual(float(0))
            .and(tUv.x.lessThanEqual(float(1)))
            .and(tUv.y.greaterThanEqual(float(0)))
            .and(tUv.y.lessThanEqual(float(1)));
        const gate = select(inRange, float(1), float(0));
        this.decalTexNode = texture(emptyOpaqueTex, tUv);
        const a = this.decalTexNode.a.mul(_opacity).mul(gate);
        const color = vec4(this.decalTexNode.rgb.mul(_opacity), a).toVar();
        this.colorNode = withHeightMapVisibilityFix(color, s_sharedNodes);
    }
}

export { emptyOpaqueTex, emptyTransparentTex };
