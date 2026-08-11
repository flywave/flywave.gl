// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    log,
    type TextureNode,
    type UniformNode,
} from "three/webgpu";
import {
    PI,
    asin,
    atan,
    attribute,
    cos,
    exp,
    float,
    Fn,
    If,
    materialColor,
    materialOpacity,
    mix,
    positionLocal,
    select,
    sin,
    tan,
    texture,
    uniform,
    uv,
    vec2,
    vec3,
    vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";

import { type IVisualBatchMaterialParams, VisualBatchMaterial } from "@flywave/flywave-materials";
import { FaceTypes } from "../decoder";

/** Maximum number of texture patches supported by the material */
const MAX_TEXTURE_PATCHES = 4;

/**
 * Creates a 1x1 white placeholder texture
 */
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

/**
 * Parameters for constructing a StratumMaterial instance
 * @property {THREE.Texture[]} [imageryTextures] - Array of terrain imagery textures
 * @property {THREE.Vector4[]} [imageryTransforms] - UV transforms for each texture (scaleX, scaleY, offsetX, offsetY)
 */
interface IStratumMaterialParams extends IVisualBatchMaterialParams {
    imageryTextures?: THREE.Texture[];
    imageryTransforms?: THREE.Vector4[];
}

/**
 * Enhanced terrain material supporting:
 * - Face type filtering using bitwise operations
 * - Multi-texture blending with individual UV transforms
 * - Material ID based styling
 *
 * @extends VisualBatchMaterial
 */
class StratumMaterial extends VisualBatchMaterial {
    // Texture / transform uniforms
    private readonly _imageryTexNodes: TextureNode[] = [];
    private readonly _imageryTexUniforms: UniformNode<THREE.Texture | null>[] = [];
    private readonly _imageryTransformUniforms: UniformNode<THREE.Vector4>[] = [];
    private readonly _imageryCountUniform: UniformNode<number>;

    // Face / clip uniforms
    private readonly _faceVisibleUniform: UniformNode<number>;
    private readonly _clipPatchTransformUniform: UniformNode<THREE.Vector4>;

    // Projection switching uniforms
    private readonly _currentProjectionUniform: UniformNode<number>;
    private readonly _targetProjectionUniform: UniformNode<number>;
    private readonly _projectionFactorUniform: UniformNode<number>;
    private readonly _earthRadiusUniform: UniformNode<number>;

    /**
     * Creates a new StratumMaterial instance
     * @param {IStratumMaterialParams} [params={}] - Material configuration parameters
     */
    constructor(params: IStratumMaterialParams = {}) {
        super({
            ...params,
            idAttributeName: params.idAttributeName ?? "materialId"
        });

        // Initialize terrain-specific uniforms
        this._imageryCountUniform = uniform(0);
        this._faceVisibleUniform = uniform(0);
        this._clipPatchTransformUniform = uniform(new THREE.Vector4());
        this._currentProjectionUniform = uniform(0);
        this._targetProjectionUniform = uniform(0);
        this._projectionFactorUniform = uniform(0);
        this._earthRadiusUniform = uniform(6378137.0);

        for (let i = 0; i < MAX_TEXTURE_PATCHES; i++) {
            this._imageryTexUniforms.push(uniform<THREE.Texture | null>(dummyTex()));
            this._imageryTexNodes.push(texture(this._imageryTexUniforms[i]));
            this._imageryTransformUniforms.push(uniform(new THREE.Vector4(1, 1, 0, 0)));
        }

        // Set default transforms if textures are provided without transforms
        if (params.imageryTextures && !params.imageryTransforms) {
            params.imageryTransforms = params.imageryTextures.map(
                () => new THREE.Vector4(1, 1, 0, 0)
            );
        }

        // Configure textures if provided
        if (params.imageryTextures && params.imageryTransforms) {
            this.setImageryTextures(params.imageryTextures, params.imageryTransforms);
        }

        this._buildStratumNodes();
    }

    /**
     * Sets the face visibility bitmask
     * @param {number} value - Bitmask representing visible face types
     */
    set faceVisible(value: number) {
        this._faceVisibleUniform.value = value;
    }

    /**
     * Gets the current face visibility bitmask
     * @returns {number} Current face visibility bitmask
     */
    get faceVisible(): number {
        return this._faceVisibleUniform.value;
    }

    /**
     * Configures imagery textures and their UV transforms
     * @param {THREE.Texture[]} textures - Array of textures to apply
     * @param {THREE.Vector4[]} transforms - Corresponding UV transforms for each texture
     * @throws {Error} If textures and transforms arrays don't match in length
     * @throws {Error} If exceeding maximum texture count
     */
    private setImageryTextures(textures: THREE.Texture[], transforms: THREE.Vector4[]): void {
        if (textures.length !== transforms.length) {
            throw new Error("Texture and transform arrays must have equal length");
        }
        if (textures.length > MAX_TEXTURE_PATCHES) {
            throw new Error(`Maximum ${MAX_TEXTURE_PATCHES} textures supported`);
        }

        // Update texture-related uniforms
        this._imageryCountUniform.value = textures.length;
        for (let i = 0; i < textures.length; i++) {
            this._imageryTexUniforms[i].value = textures[i];
            this._imageryTransformUniforms[i].value = transforms[i];
        }
    }

    /**
     * Sets the image UV transform parameters
     * Used for proper texture mapping and alignment
     */
    public set imageryPatchs(
        value: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }>
    ) {
        value.forEach((item, index) => {
            this._imageryTexUniforms[index].value = item.texture;
            this._imageryTransformUniforms[index].value = item.transform;
        });
        this._imageryCountUniform.value = value.length;
    }

    public set clipPatch(transform: THREE.Vector4) {
        this._clipPatchTransformUniform.value.copy(transform);
    }

    /**
     * Cleans up material resources
     */
    override dispose(): void {
        super.dispose();

        // Dispose all texture resources
        this._imageryTexUniforms.forEach(uniformNode => {
            uniformNode.value?.dispose();
        });
    }

    /**
     * Sets the projection uniforms for terrain projection switching animation
     *
     * @param currentProjectionType - Current geometry projection type
     * @param targetProjectionType - Target projection type
     * @param projectionFactor - Interpolation factor between 0.0 and 1.0
     */
    public setProjectionUniforms(
        currentProjectionType: number,
        targetProjectionType: number,
        projectionFactor: number
    ): void {
        this._currentProjectionUniform.value = currentProjectionType;
        this._targetProjectionUniform.value = targetProjectionType;
        this._projectionFactorUniform.value = projectionFactor;
    }

    // ==================== Node Graph ====================

    /**
     * Builds the stratum node graph on top of the visual style pipeline:
     * - Projection switching in the vertex stage
     * - Multi-texture imagery blending in the fragment stage
     */
    private _buildStratumNodes(): void {
        const { hasStyle, styleColor, styleOpacity, offset } = this.visualNodes;

        // Face type attribute (auto-interpolated for fragment stage)
        const faceType = attribute("faceType", "float");

        // --- Projection switching functions ---

        const webMercatorToSphere = Fn(([p]: [ReturnType<typeof vec3>]) => {
            const mx = p.x.div(this._earthRadiusUniform).sub(PI);
            const my = p.y.div(this._earthRadiusUniform).sub(PI);
            const w = exp(my);
            const d = w.mul(w);
            const gx = float(2).mul(w).div(d.add(1));
            const gy = d.sub(1).div(d.add(1));
            const scale = this._earthRadiusUniform.add(p.z);
            return vec3(cos(mx).mul(gx).mul(scale), sin(mx).mul(gx).mul(scale), gy.mul(scale));
        });

        const sphereToWebMercator = Fn(([p]: [ReturnType<typeof vec3>]) => {
            const lat = asin(p.z.div(this._earthRadiusUniform));
            const lon = atan(p.y, p.x);
            const x = lon.div(PI).add(1).mul(0.5).mul(this._earthRadiusUniform);
            const y = log(tan(PI.mul(0.25).add(lat.mul(0.5))))
                .div(PI)
                .add(1)
                .mul(0.5)
                .mul(this._earthRadiusUniform);
            return vec3(x, y, p.z);
        });

        const reprojectAndInterpolate = Fn(([p]: [ReturnType<typeof vec3>]) => {
            const sameType = this._currentProjectionUniform.equal(this._targetProjectionUniform);
            const toPlanar = this._currentProjectionUniform
                .equal(1)
                .and(this._targetProjectionUniform.equal(0));
            const toSphere = this._currentProjectionUniform
                .equal(0)
                .and(this._targetProjectionUniform.equal(1));

            const transformed = select(
                toPlanar,
                sphereToWebMercator(p),
                select(toSphere, webMercatorToSphere(p), p)
            );

            return select(sameType, p, mix(p, transformed, this._projectionFactorUniform));
        });

        // --- Vertex: style offset + projection interpolation ---

        const styledPos = positionLocal.add(select(hasStyle, offset, vec3(0)));
        this.positionNode = reprojectAndInterpolate(styledPos);

        // --- Fragment: imagery blending ---

        const vUv = uv();
        const getTextureColor = Fn(() => {
            const color = vec4(1).toVar();

            If(faceType.equal(FaceTypes.TopGroundFace), () => {
                for (let i = 0; i < MAX_TEXTURE_PATCHES; i++) {
                    const transform = this._imageryTransformUniforms[i];
                    const transformedUv = vec2(
                        vUv.x.mul(transform.x).add(transform.z),
                        vUv.y.mul(transform.y).add(transform.w)
                    );
                    const inRange = transformedUv.x
                        .greaterThanEqual(0)
                        .and(transformedUv.x.lessThanEqual(1))
                        .and(transformedUv.y.greaterThanEqual(0))
                        .and(transformedUv.y.lessThanEqual(1));
                    const patchColor = this._imageryTexNodes[i].sample(transformedUv);
                    color.assign(
                        select(
                            inRange.and(float(i).lessThan(this._imageryCountUniform)),
                            patchColor,
                            color
                        )
                    );
                }
            });

            return color;
        });

        const texColor = getTextureColor();

        const baseColor = vec3(materialColor).mul(select(hasStyle, styleColor, vec3(1)));
        const baseOpacity = materialOpacity.mul(select(hasStyle, styleOpacity, float(1)));

        const isTop = faceType.equal(FaceTypes.TopGroundFace);
        const mixed = mix(vec4(baseColor, baseOpacity), texColor, 0.5);

        this.colorNode = select(isTop, texColor.rgb, mixed.rgb);
        this.opacityNode = select(isTop, texColor.a, mixed.a);
    }
}

export { StratumMaterial, type IStratumMaterialParams };
