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
const emptyImageryTextures = [dummyTex(), dummyTex(), dummyTex(), dummyTex(), dummyTex()];

const _heightMapTex = texture(emptyTexture);
_heightMapTex.onObjectUpdate(({ object }) => object.heightMapTexture ?? emptyTexture);

const _modifierTex = texture(emptyTexture);
_modifierTex.onObjectUpdate(({ object }) => object.modifierTexture ?? emptyTexture);

const _imageryTex = [
    texture(emptyImageryTextures[0]),
    texture(emptyImageryTextures[1]),
    texture(emptyImageryTextures[2]),
    texture(emptyImageryTextures[3]),
    texture(emptyImageryTextures[4])
];

_imageryTex[0].onObjectUpdate(({ object }) => object.imageryTextures[0] ?? emptyImageryTextures[0]);
_imageryTex[1].onObjectUpdate(({ object }) => object.imageryTextures[1] ?? emptyImageryTextures[1]);
_imageryTex[2].onObjectUpdate(({ object }) => object.imageryTextures[2] ?? emptyImageryTextures[2]);
_imageryTex[3].onObjectUpdate(({ object }) => object.imageryTextures[3] ?? emptyImageryTextures[3]);
_imageryTex[4].onObjectUpdate(({ object }) => object.imageryTextures[4] ?? emptyImageryTextures[4]);

const _imageryTransform = [
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[0]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[1]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[2]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[3]
    ),
    uniform(new THREE.Vector4(1, 1, 0, 0)).onObjectUpdate(
        ({ object }) => object.imageryTransforms[4]
    )
];

const _packCol0 = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.packCol0);
const _demUnpack = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.demUnpack);
const _heightMapPos = uniform(new THREE.Vector4(1, 0, 0, 0)).onObjectUpdate(
    ({ object }) => object.heightMapPos
);
const _patchPos0 = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.patchPos0);
const _patchPos1 = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.patchPos1);
const _patchPos2 = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.patchPos2);
const _patchPos3 = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.patchPos3);
const _texSize = uniform(new THREE.Vector2(1, 1)).onObjectUpdate(({ object }) => object.texSize);
const _skirtHeight = uniform(0.0).onObjectUpdate(({ object }) => object.skirtHeight);
const _projFactor = uniform(0.0).onObjectUpdate(({ object }) => object.projectionFactor);
const _modifierUVBounds = uniform(new THREE.Vector4()).onObjectUpdate(
    ({ object }) => object.modifierUVBounds
);
const _modifierOp = uniform(0).onObjectUpdate(({ object }) => object.modifierOp);
const _hasModifier = uniform(0).onObjectUpdate(({ object }) => object.hasModifier);
const _imageryCount = uniform(0).onObjectUpdate(({ object }) => object.imageryCount);

// --- Projector overlay state ---
// Per-source state lives on each tile mesh as `object.projectorState`
// (a stable reference to its TerrainSource's ProjectorOverlayManager.state).
// The fallback default is used by meshes that don't belong to a source with
// projector overlays enabled.
import { MAX_PROJECTOR_LAYERS, ProjectorState } from "../projector-overlay";

const _defaultProjState = new ProjectorState();

const _projTex = Array.from({ length: MAX_PROJECTOR_LAYERS }, (_, i) => {
    const node = texture(emptyTexture);
    node.onObjectUpdate(
        ({ object }) =>
            (object.projectorState as ProjectorState | undefined)?.textures[i] ??
            _defaultProjState.textures[i] ??
            emptyTexture
    );
    return node;
});

const _projMat = Array.from({ length: MAX_PROJECTOR_LAYERS }, (_, i) => {
    const node = uniform(_defaultProjState.matrices[i]);
    node.onObjectUpdate(
        ({ object }) =>
            (object.projectorState as ProjectorState | undefined)?.matrices[i] ??
            _defaultProjState.matrices[i]
    );
    return node;
});

const _projOpacity = Array.from({ length: MAX_PROJECTOR_LAYERS }, (_, i) => {
    const node = uniform(0);
    node.onObjectUpdate(
        ({ object }) =>
            (object.projectorState as ProjectorState | undefined)?.opacities[i] ??
            _defaultProjState.opacities[i]
    );
    return node;
});

const _projCount = uniform(0).onObjectUpdate(
    ({ object }) =>
        (object.projectorState as ProjectorState | undefined)?.count ?? _defaultProjState.count
);

// RTE correction: the rendering system uses camera-relative positions,
// so we need the main camera's world position to reconstruct absolute coords.
const _projCameraPos = uniform(new THREE.Vector3()).onObjectUpdate(
    ({ object }) =>
        (object.projectorState as ProjectorState | undefined)?.cameraPos ??
        _defaultProjState.cameraPos
);

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

        // Projector overlays: world-space → per-layer projector UV via orthographic
        // camera matrix. RTE fix: positionWorld is camera-relative, so we add the
        // camera world position back to get absolute coordinates before projecting.
        const trueWorldPos = positionWorld.add(_projCameraPos);

        for (let i = 0; i < MAX_PROJECTOR_LAYERS; i++) {
            const projCoord = _projMat[i].mul(trueWorldPos);
            const projUv = projCoord.xy.div(projCoord.w).mul(0.5).add(0.5);
            const inProj = projUv.x
                .greaterThanEqual(0)
                .and(projUv.x.lessThanEqual(1))
                .and(projUv.y.greaterThanEqual(0))
                .and(projUv.y.lessThanEqual(1))
                .and(projCoord.w.greaterThan(0));
            const projColor = texture(_projTex[i], projUv);
            const layerAlpha = projColor.a.mul(_projOpacity[i]);
            const active = inProj
                .and(float(i).lessThan(_projCount))
                .and(layerAlpha.greaterThanEqual(0.001));
            color.assign(select(active, tslMix(color, projColor, layerAlpha), color));
        }

        return color;
    })();

    return { positionNode, colorNode, vTerrainNormal };
}

const s_nodes = buildNodes();

/**
 * DEM tile mesh material for rendering terrain with height-map-based elevation.
 *
 * All per-tile data is read directly from the mesh object at render time via
 * onObjectUpdate, so no per-tile properties exist on the material itself.
 * This ensures the shader is compiled only once and shared by all tiles.
 */
export class DEMTileMeshMaterial extends MeshStandardNodeMaterial {
    public allowOverride: boolean = false;
    private _isSharedSingleton?: boolean;

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
        this.positionNode = s_nodes.positionNode;
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

const defaultDEMTileMeshMaterial = new DEMTileMeshMaterial({
    wireframe: false,
    transparent: false,
    blending: THREE.NoBlending
}).markSharedSingleton();

export { emptyTexture, emptyImageryTextures, defaultDEMTileMeshMaterial };
