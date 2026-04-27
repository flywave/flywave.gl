import { type ColorDef } from "./color-def";
import { type TextureMapping } from "./texture-mapping";
/** Represents a material which can be applied to a surface to control aspects of its appearance such as color, reflectivity, texture, and so on.
 * @public
 */
export declare abstract class RenderMaterial {
    /** If the material originated from a Material element in the [[IModelDb]], the Id of that element. */
    readonly key?: string;
    /** Describes how to map an image to a surface to which this material is applied. */
    readonly textureMapping?: TextureMapping;
    protected constructor(params: RenderMaterial.Params);
    get hasTexture(): boolean;
}
/** @public */
export declare namespace RenderMaterial {
    /** @deprecated in 3.x. Use [CreateRenderMaterialArgs]($frontend). */
    class Params {
        /** If the material originates from a Material element in the [[IModel]], the Id of that element. */
        key?: string;
        /** Diffuse color, or undefined if this material does not override the surface's own color. */
        diffuseColor?: ColorDef;
        /** Specular color. Defaults to white if undefined. */
        specularColor?: ColorDef;
        /** Currently unused. @alpha */
        emissiveColor?: ColorDef;
        /** Currently unused. @alpha */
        reflectColor?: ColorDef;
        /** Optional pattern mapping applied to the surface. */
        textureMapping?: TextureMapping;
        /** Diffuse weight in [0..1] */
        diffuse: number;
        /** Specular weight in [0..1] */
        specular: number;
        specularExponent: number;
        /** Currently unused. @alpha */
        reflect: number;
        /** Currently unused. @alpha */
        refract: number;
        /** Currently unused. @alpha */
        ambient: number;
        /** Currently unused. @alpha */
        shadows: boolean;
        private _alpha?;
        constructor(key?: string);
        /** Obtain an immutable instance of a RenderMaterial with all default properties. */
        static readonly defaults: Params;
        /** A value from 0.0 (fully-transparent) to 1.0 (fully-opaque) controlling the transparency of surfaces to which this material is applied;
         * or undefined if this material does not override surface transparency.
         */
        get alpha(): number | undefined;
        set alpha(alpha: number | undefined);
        /** Create a RenderMaterial params object using specified key and ColorDef values, as well as an optional texture mapping. */
        static fromColors(key?: string, diffuseColor?: ColorDef, specularColor?: ColorDef, emissiveColor?: ColorDef, reflectColor?: ColorDef, textureMap?: TextureMapping): Params;
    }
}
