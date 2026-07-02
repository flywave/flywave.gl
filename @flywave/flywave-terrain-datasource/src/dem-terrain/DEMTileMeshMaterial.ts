/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

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

interface CommonUniforms {
    uHeighMapTexture: { value: THREE.Texture };
    pack: { value: THREE.Matrix4 };
    uPatchPos: { value: THREE.Matrix4 };
    depth_packing_value: { value: number };
    overlayerImageryTransform: { value: THREE.Vector4 };
    overlayerImagery: { value: THREE.Texture };
    imageryPatchTransform: { value: THREE.Vector4[] };
    imageryPatchArray: { value: THREE.Texture[] };
    imageryPatchCount: { value: number };
    uProjectionFactor: { value: number };
    uSkirtHeight: { value: number };
    isRenderingDepth: { value: boolean };
    uModifierTexture: { value: THREE.Texture };
    uModifierUVBounds: { value: THREE.Vector4 };
    uModifierOp: { value: number };
    uHasModifier: { value: number };
}

// ====================================================================
// 静态共享 TSL 节点
// ====================================================================

const _packCol0 = uniform(new THREE.Vector4());
const _demUnpack = uniform(new THREE.Vector4());
const _heightMapPos = uniform(new THREE.Vector4());
const _patchPos0 = uniform(new THREE.Vector4());
const _patchPos1 = uniform(new THREE.Vector4());
const _patchPos2 = uniform(new THREE.Vector4());
const _patchPos3 = uniform(new THREE.Vector4());
const _heightMapTex = texture(dummyTex());
const _texSize = uniform(new THREE.Vector2(1, 1));
const _skirtHeight = uniform(0.0);
const _projFactor = uniform(0.0);
const _modifierTex = texture(dummyTex());
const _modifierUVBounds = uniform(new THREE.Vector4());
const _modifierOp = uniform(0);
const _hasModifier = uniform(0);
const _overlayTex = texture(dummyTex());
const _overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
const _imageryTex = [
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex())
];
const _imageryTransform = [
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0))
];
const _imageryCount = uniform(0);

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

    // computeMvPos — 用 If/Else 实现真正的条件分支
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

    // 在 vertex stage 同时计算位置和法线
    // 法线存入 varying，避免 fragment 中重新采样 texture 导致的闪烁
    const vTerrainNormal = vec3(0, 1, 0).toVarying("vTerrainNormal");

    const positionNode = Fn(() => {
        const finalPos = computeMvPos(texUv, pos).xyz.toVar();

        // 在 vertex 中计算 simple-patch 法线
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

export class DEMTileMeshMaterial extends MeshStandardNodeMaterial {
    public m_allowOverride: boolean = false;
    public m_commonUniform: CommonUniforms = {
        uHeighMapTexture: { value: emptyTexture },
        pack: { value: new THREE.Matrix4() },
        uPatchPos: { value: new THREE.Matrix4() },
        depth_packing_value: { value: 0 },
        overlayerImageryTransform: { value: new THREE.Vector4(1, 1, 0, 0) },
        overlayerImagery: { value: dummyTex() },
        imageryPatchTransform: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
        imageryPatchArray: { value: Array.from({ length: 5 }, () => dummyTex()) },
        imageryPatchCount: { value: 0 },
        uSkirtHeight: { value: 0.0 },
        uProjectionFactor: { value: 0.0 },
        isRenderingDepth: { value: false },
        uModifierTexture: { value: emptyTexture },
        uModifierUVBounds: { value: new THREE.Vector4() },
        uModifierOp: { value: 0 },
        uHasModifier: { value: 0 }
    };
    public m_defines: Record<string, any> = {};

    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
        this.colorNode = s_nodes.colorNode;
        this.positionNode = s_nodes.positionNode;
    }

    public setupNormal(builder: any): any {
        const defaultNormal = super.setupNormal(builder);
        return select(_packCol0.w.greaterThan(0), s_nodes.vTerrainNormal, defaultNormal);
    }

    public syncStaticUniforms(): void {
        const u = this.m_commonUniform;
        const pack = u.pack.value.elements;
        _packCol0.value.set(pack[0], pack[1], pack[2], pack[3]);
        _demUnpack.value.set(pack[4], pack[5], pack[6], pack[7]);
        _heightMapPos.value.set(pack[8], pack[9], pack[10], pack[11]);
        const pp = u.uPatchPos.value.elements;
        _patchPos0.value.set(pp[0], pp[1], pp[2], pp[3]);
        _patchPos1.value.set(pp[4], pp[5], pp[6], pp[7]);
        _patchPos2.value.set(pp[8], pp[9], pp[10], pp[11]);
        _patchPos3.value.set(pp[12], pp[13], pp[14], pp[15]);
        if (_heightMapTex.value !== u.uHeighMapTexture.value)
            _heightMapTex.value = u.uHeighMapTexture.value;
        const tex = u.uHeighMapTexture.value;
        if (tex && tex.image && tex.image.width) {
            _texSize.value.set(tex.image.width, tex.image.height);
        }
        _skirtHeight.value = u.uSkirtHeight.value;
        _projFactor.value = u.uProjectionFactor.value;
        if (_modifierTex.value !== u.uModifierTexture.value)
            _modifierTex.value = u.uModifierTexture.value;
        _modifierUVBounds.value.copy(u.uModifierUVBounds.value);
        _modifierOp.value = u.uModifierOp.value;
        _hasModifier.value = u.uHasModifier.value;
        if (_overlayTex.value !== u.overlayerImagery.value)
            _overlayTex.value = u.overlayerImagery.value;
        _overlayTransform.value.copy(u.overlayerImageryTransform.value);
        for (let i = 0; i < 5; i++) {
            if (_imageryTex[i].value !== u.imageryPatchArray.value[i])
                _imageryTex[i].value = u.imageryPatchArray.value[i];
            _imageryTransform[i].value.copy(u.imageryPatchTransform.value[i]);
        }
        _imageryCount.value = u.imageryPatchCount.value;
    }

    public syncUniforms(): void {
        this.syncStaticUniforms();
    }

    public setRenderingDepth(enabled: boolean): void {
        this.m_commonUniform.isRenderingDepth.value = enabled;
    }

    public getIsRenderingDepth(): boolean {
        return this.m_commonUniform.isRenderingDepth.value;
    }

    public copy(source: DEMTileMeshMaterial): this {
        super.copy(source);
        this.m_commonUniform = { ...source.m_commonUniform };
        this.m_allowOverride = source.m_allowOverride;
        this.m_defines = { ...source.m_defines };
        return this;
    }

    public set imageryPatchs(value: Array<{ transform: THREE.Vector4; texture: THREE.Texture }>) {
        value.forEach((item, index) => {
            this.m_commonUniform.imageryPatchArray.value[index] = item.texture;
            this.m_commonUniform.imageryPatchTransform.value[index] = item.transform;
        });
        this.m_commonUniform.imageryPatchCount.value = value.length;
    }

    get commonUniform() {
        return this.m_commonUniform;
    }

    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        if (overlayer) {
            this.m_commonUniform.overlayerImagery.value = overlayer.texture;
            this.m_commonUniform.overlayerImageryTransform.value.copy(overlayer.transform);
        } else {
            this.m_commonUniform.overlayerImagery.value = dummyTex();
            this.m_commonUniform.overlayerImageryTransform.value.set(0, 0, 0, 0);
        }
    }

    public setProjectionUniforms(projectionFactor: number): void {
        this.m_commonUniform.uProjectionFactor.value = projectionFactor;
    }
}
