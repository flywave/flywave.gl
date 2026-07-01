/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
    Fn,
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
    smoothstep,
    texture,
    textureSize,
    uniform,
    uv as uvNode,
    vec2,
    vec3,
    vec4,
    positionLocal,
    normalLocal
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
    overlayerImageryTransform: { value: THREE.Matrix3 };
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
// 所有 DEMTileMeshMaterial 实例共享同一组节点
// 在每个 tile 渲染前由 syncStaticUniforms() 更新值
// ====================================================================

const s_packCol0 = uniform(new THREE.Vector4());
const s_demUnpack = uniform(new THREE.Vector4());
const s_heightMapPos = uniform(new THREE.Vector4());
const s_patchPos0 = uniform(new THREE.Vector4());
const s_patchPos1 = uniform(new THREE.Vector4());
const s_patchPos2 = uniform(new THREE.Vector4());
const s_patchPos3 = uniform(new THREE.Vector4());
const s_heightMapTex = texture(dummyTex());
const s_skirtHeight = uniform(0.0);
const s_projFactor = uniform(0.0);
const s_modifierTex = texture(dummyTex());
const s_modifierUVBounds = uniform(new THREE.Vector4());
const s_modifierOp = uniform(0);
const s_hasModifier = uniform(0);
const s_overlayTex = texture(dummyTex());
const s_overlayTransform = uniform(new THREE.Vector4(1, 1, 0, 0));
const s_imageryTex: ReturnType<typeof texture>[] = [
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex()),
    texture(dummyTex())
];
const s_imageryTransform: ReturnType<typeof uniform>[] = [
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0)),
    uniform(new THREE.Vector4(1, 1, 0, 0))
];
const s_imageryCount = uniform(0);

function buildNodes() {
    const webMercatorY = attribute("webMercatorY", "float");
    const mercatorPosition = attribute("mercatorPosition", "vec3");
    const pos = positionLocal;
    const texUv = uvNode();

    const isSimplePatch = s_packCol0.w.greaterThan(0);
    const texSize = textureSize(s_heightMapTex);
    const texSizeF = vec2(float(texSize.x), float(texSize.y));

    const decodeElevation = Fn(([v]: [ReturnType<typeof vec4>]) => {
        return dot(vec4(v.xyz.mul(255.0), float(-1.0)), s_demUnpack);
    });

    const tileUvToDemSample = Fn(([t]: [ReturnType<typeof vec2>]) => {
        return vec2(
            t.x.mul(s_heightMapPos.x).add(s_heightMapPos.z),
            t.y.mul(s_heightMapPos.x).add(s_heightMapPos.y)
        );
    });

    const applyModifier = Fn(([height, t]: [ReturnType<typeof float>, ReturnType<typeof vec2>]) => {
        const b = s_modifierUVBounds;
        const inside = t.x
            .greaterThanEqual(b.x)
            .and(t.x.lessThanEqual(b.z))
            .and(t.y.greaterThanEqual(b.y))
            .and(t.y.lessThanEqual(b.w));
        const modUv = vec2(
            t.x.sub(b.x).div(b.z.sub(b.x)),
            float(1).sub(t.y.sub(b.y).div(b.w.sub(b.y)))
        );
        const modSample = texture(s_modifierTex, modUv);
        const modH = decodeElevation(modSample);
        const isAdd = s_modifierOp.equal(0);
        const mod = select(
            isAdd,
            height.add(modH.mul(modSample.a)),
            tslMix(height, modH, modSample.a)
        );
        const hasA = select(modSample.a.greaterThan(0.001), mod, height);
        const ins = select(inside, hasA, height);
        return select(s_hasModifier.greaterThan(0), ins, height);
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
        const h00 = decodeElevation(texture(s_heightMapTex, u00));
        const h10 = decodeElevation(texture(s_heightMapTex, u10));
        const h01 = decodeElevation(texture(s_heightMapTex, u01));
        const h11 = decodeElevation(texture(s_heightMapTex, u11));
        const h0 = tslMix(h00, h10, fr.x);
        const h1 = tslMix(h01, h11, fr.x);
        return applyModifier(tslMix(h0, h1, fr.y), t);
    });

    const computeMvPos = Fn(([fUv, fPos]: [ReturnType<typeof vec2>, ReturnType<typeof vec3>]) => {
        const dx = fPos.x;
        const p1 = s_patchPos0.add(s_patchPos1.mul(dx));
        const p2 = s_patchPos2.add(s_patchPos3.mul(dx));
        let bp = p1.add(p2.sub(p1).mul(fPos.y));
        bp.w = 1.0;
        const tn = normalize(cross(s_patchPos0.xyz, s_patchPos3.xyz));
        const skirtH = select(fPos.z.lessThan(0), s_skirtHeight.negate(), fPos.z);
        const hi = smoothElevationVertex(fUv);
        let sr = bp.add(vec4(tn.mul(hi.add(skirtH)), 0.0));
        sr.w = 1.0;
        let mp = tslMix(vec4(fPos, 1.0), vec4(mercatorPosition, 1.0), s_projFactor);
        const mhi = smoothElevationVertex(fUv);
        mp = mp.add(vec4(vec3(0, 0, 1).mul(mhi), 0));
        return select(isSimplePatch, sr, mp);
    });

    const positionNode = Fn(() => computeMvPos(texUv, pos).xyz)();

    const normalNode = Fn(() => {
        return select(
            isSimplePatch,
            normalize(cross(s_patchPos1.xyz, s_patchPos3.xyz)),
            tslMix(vec4(normalLocal, 1.0), vec4(0, 0, 1, 1), s_projFactor).xyz
        );
    })();

    const colorNode = Fn(() => {
        const mapUv = vec2(texUv.x, webMercatorY);
        const tUv = vec2(
            mapUv.x.mul(s_imageryTransform[0].x).add(s_imageryTransform[0].z),
            mapUv.y.mul(s_imageryTransform[0].y).add(s_imageryTransform[0].w)
        );
        return texture(s_imageryTex[0], tUv);
    })();
    return { positionNode, normalNode, colorNode };
}


const s_nodes = buildNodes();
const _imageryTexArr = [
    s_imageryTex[0], s_imageryTex[1], s_imageryTex[2], s_imageryTex[3], s_imageryTex[4]
];
const _imageryTrArr = [
    s_imageryTransform[0], s_imageryTransform[1], s_imageryTransform[2], s_imageryTransform[3], s_imageryTransform[4]
];

export class DEMTileMeshMaterial extends MeshStandardNodeMaterial {
    public m_allowOverride: boolean = false;
    public m_commonUniform: CommonUniforms = {
        uHeighMapTexture: { value: emptyTexture },
        pack: { value: new THREE.Matrix4() },
        uPatchPos: { value: new THREE.Matrix4() },
        depth_packing_value: { value: 0 },
        overlayerImageryTransform: { value: new THREE.Matrix3() },
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
        // this.normalNode = s_nodes.normalNode;
    }

    /**
     * 在每个 tile 渲染前同步 commonUniform 到静态 TSL uniform。
     * 由 HeightMapTerrainMesh.onBeforeRender 调用。
     */
    public syncStaticUniforms(): void {
        const u = this.m_commonUniform;
        const pack = u.pack.value.elements;
        s_packCol0.value.set(pack[0], pack[1], pack[2], pack[3]);
        s_demUnpack.value.set(pack[4], pack[5], pack[6], pack[7]);
        s_heightMapPos.value.set(pack[8], pack[9], pack[10], pack[11]);
        const pp = u.uPatchPos.value.elements;
        s_patchPos0.value.set(pp[0], pp[1], pp[2], pp[3]);
        s_patchPos1.value.set(pp[4], pp[5], pp[6], pp[7]);
        s_patchPos2.value.set(pp[8], pp[9], pp[10], pp[11]);
        s_patchPos3.value.set(pp[12], pp[13], pp[14], pp[15]);
        if (s_heightMapTex.value !== u.uHeighMapTexture.value)
            s_heightMapTex.value = u.uHeighMapTexture.value;
        s_skirtHeight.value = u.uSkirtHeight.value;
        s_projFactor.value = u.uProjectionFactor.value;
        if (s_modifierTex.value !== u.uModifierTexture.value)
            s_modifierTex.value = u.uModifierTexture.value;
        s_modifierUVBounds.value.copy(u.uModifierUVBounds.value);
        s_modifierOp.value = u.uModifierOp.value;
        s_hasModifier.value = u.uHasModifier.value;
        if (s_overlayTex.value !== u.overlayerImagery.value)
            s_overlayTex.value = u.overlayerImagery.value;
        for (let i = 0; i < 5; i++) {
            const srcTex = u.imageryPatchArray.value[i];
            if (_imageryTexArr[i].value !== srcTex) _imageryTexArr[i].value = srcTex;
            _imageryTrArr[i].value.copy(u.imageryPatchTransform.value[i]);
        }
        s_imageryCount.value = u.imageryPatchCount.value;
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
            this.m_commonUniform.overlayerImageryTransform.value.setUvTransform(
                overlayer.transform.z,
                overlayer.transform.w,
                overlayer.transform.x,
                overlayer.transform.y,
                0,
                0,
                0
            );
        } else {
            this.m_commonUniform.overlayerImagery.value = null as unknown as THREE.Texture;
            this.m_commonUniform.overlayerImageryTransform.value = null as unknown as THREE.Matrix3;
        }
    }

    public setProjectionUniforms(projectionFactor: number): void {
        this.m_commonUniform.uProjectionFactor.value = projectionFactor;
    }
}
