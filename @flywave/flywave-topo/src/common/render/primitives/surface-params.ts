/* Copyright (C) 2025 flywave.gl contributors */



import { type FillFlags, type RenderMaterial, type RenderTexture } from "../../../common";
import { type VertexIndices } from "./vertex-indices";

export enum SurfaceType {
    Unlit,
    Lit,
    Textured,
    TexturedLit
}

export function isValidSurfaceType(value: number): boolean {
    switch (value) {
        case SurfaceType.Unlit:
        case SurfaceType.Lit:
        case SurfaceType.Textured:
        case SurfaceType.TexturedLit:
            return true;
        default:
            return false;
    }
}

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

export function createSurfaceMaterial(
    source: RenderMaterial | undefined
): SurfaceMaterial | undefined {
    if (undefined === source) return undefined;
    else return { isAtlas: false, material: source };
}

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
