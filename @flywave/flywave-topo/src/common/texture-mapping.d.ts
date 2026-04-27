import { type IndexedPolyfaceVisitor, type PolyfaceVisitor, type XAndY, Point2d, Transform } from "../core-geometry";
import { type RenderTexture } from "./render-texture";
/** Defines normal map parameters.
 * @beta
 */
export interface NormalMapParams {
    /** The texture to use as a normal map. If not present then the pattern map texture will be used as a normal map. */
    normalMap?: RenderTexture;
    /** True if the Y component stored in the green channel should be negated. By default, positive Y points downward, but some
     * normal maps are created with positive Y pointing upward.
     */
    greenUp?: boolean;
    /** Scale factor by which to multiply the components of the normal extracted from [[normalMap]]. */
    scale?: number;
    /** True if want to use constant LOD texture mapping for the normal map texture. */
    useConstantLod?: boolean;
}
/** Describes how to map a [[RenderTexture]]'s image onto a surface as part of a [[RenderMaterial]].
 * @public
 */
export declare class TextureMapping {
    /** The texture to be mapped to the surface. If normalMapParams is present but does not contain a normal map, then texture is used as a normal map rather than a pattern map. */
    readonly texture: RenderTexture;
    /** The parameters for normal mapping.
     * @beta
     */
    normalMapParams?: NormalMapParams;
    /** The parameters describing how the textures are mapped to the surface. */
    readonly params: TextureMapping.Params;
    constructor(tx: RenderTexture, params: TextureMapping.Params);
    /** @internal */
    computeUVParams(visitor: PolyfaceVisitor, transformToImodel: Transform): Point2d[] | undefined;
}
/** @public */
export declare namespace TextureMapping {
    /** Enumerates the possible texture mapping modes. */
    enum Mode {
        None = -1,
        Parametric = 0,
        ElevationDrape = 1,
        Planar = 2,
        /** @internal */
        DirectionalDrape = 3,
        /** @internal */
        Cubic = 4,
        /** @internal */
        Spherical = 5,
        /** @internal */
        Cylindrical = 6,
        /** @internal */
        Solid = 7,
        /** @internal Only valid for lights */
        FrontProject = 8
    }
    /** A 2x3 matrix for mapping a texture image to a surface. */
    class Trans2x3 {
        /** The 3x4 transform produced from the 2x3 matrix. */
        readonly transform: Transform;
        /** Construct from the two rows of the matrix:
         * ```
         *  | m00 m01 originX |
         *  | m10 m11 originY |
         * ```
         * Producing the [Transform]($core-geometry):
         * ```
         *  | m00 m01 0 originX |
         *  | m10 m11 0 originY |
         *  | 0   0   1 0       |
         * ```
         */
        constructor(m00?: number, m01?: number, originX?: number, m10?: number, m11?: number, originY?: number);
        /** An immutable 2x3 identity matrix. */
        static readonly identity: Trans2x3;
    }
    /** Properties used to construct a [[TextureMapping.ConstantLodParams]]. */
    interface ConstantLodParamProps {
        /** The number of times the texture is repeated.  Increasing this will make the texture pattern appear smaller, decreasing it will make it larger. Defaults to 1. */
        repetitions?: number;
        /** An offset in world units used to shift the texture. Defaults to (0, 0). */
        offset?: XAndY;
        /** The minimum distance (from the eye to the surface) at which to clamp the texture. Defaults to 1.*/
        minDistClamp?: number;
        /** The maximum distance (from the eye to the surface) at which to clamp the texture. Defaults to 2^32. */
        maxDistClamp?: number;
    }
    /** Parameters to define constant level of detail mapping mode, a mode of texture coordinate generation which dynamically creates
     * texture cooprdinates so that the level of detail of the texture in the rendered image remains somewhat constant. */
    interface ConstantLodParams {
        /** The number of times the texture is repeated.  Increasing this will make the texture pattern appear smaller, decreasing it will make it larger. */
        repetitions: number;
        /** An offset in world units used to shift the texture. */
        offset: XAndY;
        /** The minimum distance (from the eye to the surface) at which to clamp the texture. */
        minDistClamp: number;
        /** The maximum distance (from the eye to the surface) at which to clamp the texture. */
        maxDistClamp: number;
    }
    /** Properties used to construct a [[TextureMapping.Params]]. */
    interface ParamProps {
        /** The matrix used to map the image to a surface. */
        textureMat2x3?: TextureMapping.Trans2x3;
        /** The ratio in [0, 1] with which to mix the color sampled from the texture with the surface's color.
         * A value of 0.0 uses only the surface color. A value of 1.0 uses only the texture color. A value of 0.5 uses an even mix of both.
         * @note This affects only the red, green, and blue components of the color. The alpha sampled from the texture is always multiplied by the surface color's alpha.
         * @note Defaults to 1.0
         */
        textureWeight?: number;
        /** The mode by which to map the image to a surface.
         * @note Defaults to [[TextureMapping.Mode.Parametric]].
         */
        mapMode?: TextureMapping.Mode;
        /** @internal */
        worldMapping?: boolean;
        /** True if want to use constant LOD texture mapping for the surface texture. */
        useConstantLod?: boolean;
        /** Parameters for constantLod mapping mode. */
        constantLodProps?: ConstantLodParamProps;
    }
    /** Parameters describing how a [[RenderTexture]]'s image is mapped to a surface. */
    class Params {
        /** The matrix used to map the image to a surface. */
        textureMatrix: TextureMapping.Trans2x3;
        /** The ratio in [0, 1] with which to mix the color sampled from the texture with the element's color.
         * A value of 0.0 uses only the element color. A value of 1.0 uses only the texture color.
         */
        weight: number;
        /** The mode by which to map the image to a surface. */
        mode: TextureMapping.Mode;
        /** @internal */
        worldMapping: boolean;
        /** True if want to use constant LOD texture mapping for the surface texture. */
        useConstantLod: boolean;
        /** Parameters for constantLod mapping mode. */
        constantLodParams: ConstantLodParams;
        constructor(props?: TextureMapping.ParamProps);
        /**
         * Generates UV parameters for textured surfaces. Returns undefined on failure.
         * @internal
         */
        computeUVParams(visitor: IndexedPolyfaceVisitor, transformToImodel: Transform): Point2d[] | undefined;
        /** Computes UV parameters given a texture mapping mode of parametric. */
        private computeParametricUVParams;
        /** Computes UV parameters given a texture mapping mode of planar. The result is stored in the Point2d array given. */
        private computePlanarUVParams;
        /** Computes UV parameters given a texture mapping mode of elevation drape. The result is stored in the Point2d array given. */
        private computeElevationDrapeUVParams;
    }
}
