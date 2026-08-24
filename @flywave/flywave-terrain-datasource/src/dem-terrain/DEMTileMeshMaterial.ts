// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
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
    positionLocal,
    positionWorld
} from "three/tsl";

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

const emptyTexture = dummyTex();
// Height-map texture node (shared singleton across all DEM tiles).
// Primarily consumed by positionNode (vertex stage) for terrain displacement.
// IMPORTANT: also referenced in colorNode (fragment stage) — see WORKAROUND
// note in buildNodes() regarding WebGPU vertex-only texture binding stability.
const _heightMapTex = texture(emptyTexture);
_heightMapTex.onObjectUpdate(({ object }) => object.heightMapTexture ?? emptyTexture);

const _modifierTex = texture(emptyTexture);
_modifierTex.onObjectUpdate(({ object }) => object.modifierTexture ?? emptyTexture);


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

        // ---------------------------------------------------------------------------
        // WORKAROUND: WebGPU vertex-only texture binding instability
        // ---------------------------------------------------------------------------
        // Root cause:
        //   _heightMapTex is primarily consumed by positionNode (vertex stage)
        //   to displace terrain vertices by elevation. When it is ONLY
        //   referenced from the vertex stage, three/webgpu sets the binding
        //   visibility to GPUShaderStage.VERTEX only. Under this vertex-only
        //   visibility, certain tiles intermittently get a stale or incorrect
        //   texture binding after LOD splits / tile reloads — manifesting as
        //   entire tiles rendered with wrong elevation (mirrored, repeated, or
        //   corrupted terrain).
        //
        //   Confirmed by two observations:
        //     1. Rendering the height-map directly in colorNode (fragment stage)
        //        eliminated the bug entirely — because the binding then had
        //        visibility = VERTEX | FRAGMENT (both stages).
        //     2. Replacing the texture object (forcing a fresh GPU upload and
        //        re-bind) temporarily fixed individual tiles.
        //
        // Fix:
        //   Sample _heightMapTex once in the fragment stage and add it to the
        //   final color with a negligible weight (0.0001). This forces the
        //   binding visibility to VERTEX | FRAGMENT, which is stable. The
        //   visual impact is imperceptible (< 0.01% brightness shift).
        //
        //   This can be removed once three/webgpu stabilizes vertex-only
        //   texture bindings, or if the height-map is moved to a mechanism
        //   that does not rely on vertex-stage texture sampling.
        // ---------------------------------------------------------------------------
        // (see the WORKAROUND comment above — exposed as an expression so
        // per-material colorNodes can add it without an Fn stack context)
        const demVisibilityFix = texture(
            _heightMapTex,
            tileUvToDemSample(texUv)
        ).mul(0.0001);

    return { positionNode, demVisibilityFix, vTerrainNormal };
}

const s_nodes = buildNodes();

/**
 * DEM tile mesh material for rendering terrain with height-map-based elevation.
 *
 * @deprecated Legacy shared-singleton material consumed by
 * {@link HeightMapTerrainMesh} (now only used by the quantized terrain path).
 * The DEM terrain path renders one dedicated material instance per layer mesh
 * instead — see {@link DEMTileBaseMaterial} / {@link DEMTileOverlayMaterial}.
 *
 * All per-tile data is read directly from the mesh object at render time via
 * onObjectUpdate, so no per-tile properties exist on the material itself.
 * This ensures the shader is compiled only once and shared by all tiles.
 */
export class DEMTileMeshMaterial extends MeshStandardNodeMaterial {
    public allowOverride: boolean = false;
    private _isSharedSingleton?: boolean;

    /** Base albedo imagery texture node; set once by the mesh. */
    public imageryTexNode: any;
    /** Tile-UV → imagery-UV transform (x/y = scale, z/w = offset). */
    public uvTexTransform: any;

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.positionNode = s_nodes.positionNode;

        // Layer×mesh: ONE imagery texture per material (the old 5-slot
        // arrays are gone — additional entries ride decal child meshes with
        // DEMTileOverlayMaterial, see HeightMapTerrainMesh
        // .setupImageryTexture). Plain-expression colorNode → byte-identical
        // WGSL per instance → one shared pipeline.
        this.uvTexTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
        const texUv = uvNode();
        const webMercatorY = attribute("webMercatorY", "float");
        const tUv = vec2(
            texUv.x.mul(this.uvTexTransform.x).add(this.uvTexTransform.z),
            webMercatorY.mul(this.uvTexTransform.y).add(this.uvTexTransform.w)
        );
        this.imageryTexNode = texture(emptyTexture, tUv);
        this.colorNode = this.imageryTexNode
            .add(s_nodes.demVisibilityFix)
            .toVar();
    }

    public setupNormal(builder: unknown) {
        const defaultNormal = super.setupNormal(builder);
        return select(_packCol0.w.greaterThan(0), s_nodes.vTerrainNormal, defaultNormal);
    }

    dispose() {
        if (this._isSharedSingleton) return;
        super.dispose();
    }

    markSharedSingleton(): this {
        this._isSharedSingleton = true;
        return this;
    }
}

export { emptyTexture };
