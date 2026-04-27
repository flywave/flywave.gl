import { type FillFlags, type RenderMaterial, type RenderTexture } from "../../../common";
import { type VertexIndices } from "./vertex-indices";
export declare enum SurfaceType {
    Unlit = 0,
    Lit = 1,
    Textured = 2,
    TexturedLit = 3
}
export declare function isValidSurfaceType(value: number): boolean;
export interface SurfaceRenderMaterial {
    readonly isAtlas: false;
    readonly material: RenderMaterial;
}
export interface SurfaceMaterialAtlas {
    readonly isAtlas: true;
    readonly hasTranslucency: boolean;
    readonly overridesAlpha: boolean;
    readonly vertexTableOffset: number;
    readonly numMaterials: number;
}
export type SurfaceMaterial = SurfaceRenderMaterial | SurfaceMaterialAtlas;
export declare function createSurfaceMaterial(source: RenderMaterial | undefined): SurfaceMaterial | undefined;
export interface SurfaceParams {
    readonly type: SurfaceType;
    readonly indices: VertexIndices;
    readonly fillFlags: FillFlags;
    readonly hasBakedLighting: boolean;
    readonly textureMapping?: {
        texture: RenderTexture;
        alwaysDisplayed: boolean;
    };
    readonly material?: SurfaceMaterial;
}
