/* eslint-disable no-restricted-syntax */

export const enum RenderPass {
    None = 0xff,
    Background = 0,
    OpaqueLayers,
    OpaqueLinear,
    OpaquePlanar,
    PointClouds,
    OpaqueGeneral,
    Classification,
    TranslucentLayers,
    Translucent,
    HiddenEdge,
    Hilite,
    OverlayLayers,
    WorldOverlay,
    ViewOverlay,
    SkyBox,
    BackgroundMap,
    HiliteClassification,
    ClassificationByIndex,
    HilitePlanarClassification,
    PlanarClassification,
    VolumeClassifiedRealityData,
    COUNT
}

export type Pass =
    | "skybox" // SkyBox
    | "opaque" // OpaqueGeneral
    | "opaque-linear" // OpaqueLinear
    | "opaque-planar" // OpaquePlanar
    | "translucent" // Translucent
    | "point-clouds" // PointClouds
    | "view-overlay" // ViewOverlay
    | "classification" // Classification
    | "none" // None
    | "opaque-translucent" // OpaqueGeneral and Translucent
    | "opaque-planar-translucent"; // OpaquePlanar and Translucent

export type DoublePass = "opaque-translucent" | "opaque-planar-translucent";

export type SinglePass = Exclude<Pass, DoublePass>;

export const enum GeometryType {
    IndexedTriangles,
    IndexedPoints,
    ArrayedPoints
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace Pass {
    export function toRenderPass(pass: SinglePass): RenderPass {
        switch (pass) {
            case "skybox":
                return RenderPass.SkyBox;
            case "opaque":
                return RenderPass.OpaqueGeneral;
            case "opaque-linear":
                return RenderPass.OpaqueLinear;
            case "opaque-planar":
                return RenderPass.OpaquePlanar;
            case "translucent":
                return RenderPass.Translucent;
            case "point-clouds":
                return RenderPass.PointClouds;
            case "view-overlay":
                return RenderPass.ViewOverlay;
            case "classification":
                return RenderPass.Classification;
            case "none":
                return RenderPass.None;
        }
    }

    export function rendersTranslucent(pass: Pass): boolean {
        switch (pass) {
            case "translucent":
            case "opaque-translucent":
            case "opaque-planar-translucent":
                return true;
            default:
                return false;
        }
    }

    export function rendersOpaque(pass: Pass): boolean {
        switch (pass) {
            case "opaque-translucent":
            case "opaque-planar-translucent":
            case "opaque":
            case "opaque-planar":
            case "opaque-linear":
            case "point-clouds":
                return true;
            default:
                return false;
        }
    }

    export function rendersOpaqueAndTranslucent(pass: Pass): pass is DoublePass {
        return pass === "opaque-translucent" || pass === "opaque-planar-translucent";
    }

    export function toOpaquePass(pass: DoublePass): RenderPass {
        return pass === "opaque-translucent" ? RenderPass.OpaqueGeneral : RenderPass.OpaquePlanar;
    }
}

export const enum RenderOrder {
    None = 0,
    Background = 1,
    BlankingRegion = 2,
    UnlitSurface = 3,
    LitSurface = 4,
    Linear = 5,
    Edge = 6,
    Silhouette = 7,

    PlanarBit = 8,

    PlanarUnlitSurface = UnlitSurface | PlanarBit,
    PlanarLitSurface = LitSurface | PlanarBit,
    PlanarLinear = Linear | PlanarBit,
    PlanarEdge = Edge | PlanarBit,
    PlanarSilhouette = Silhouette | PlanarBit
}

export function isPlanar(order: RenderOrder): boolean {
    return order >= RenderOrder.PlanarBit;
}

export const enum CompositeFlags {
    None = 0,
    Translucent = 1 << 0,
    Hilite = 1 << 1,
    AmbientOcclusion = 1 << 2
}

export const enum SurfaceBitIndex {
    HasTexture,
    ApplyLighting,
    HasNormals,
    IgnoreMaterial,
    TransparencyThreshold,
    BackgroundFill,
    HasColorAndNormal,
    OverrideRgb,
    HasNormalMap,
    HasMaterialAtlas,
    UseConstantLodTextureMapping,
    UseConstantLodNormalMapMapping,
    Count
}

export const enum SurfaceFlags {
    None = 0,
    HasTexture = 1 << SurfaceBitIndex.HasTexture,
    ApplyLighting = 1 << SurfaceBitIndex.ApplyLighting,
    HasNormals = 1 << SurfaceBitIndex.HasNormals,

    IgnoreMaterial = 1 << SurfaceBitIndex.IgnoreMaterial,

    TransparencyThreshold = 1 << SurfaceBitIndex.TransparencyThreshold,

    BackgroundFill = 1 << SurfaceBitIndex.BackgroundFill,

    HasColorAndNormal = 1 << SurfaceBitIndex.HasColorAndNormal,

    OverrideRgb = 1 << SurfaceBitIndex.OverrideRgb,

    HasNormalMap = 1 << SurfaceBitIndex.HasNormalMap,
    HasMaterialAtlas = 1 << SurfaceBitIndex.HasMaterialAtlas
}

export const enum OvrFlags {
    None = 0,
    Visibility = 1 << 0,
    Rgb = 1 << 1,
    Alpha = 1 << 2,
    IgnoreMaterial = 1 << 3,
    Flashed = 1 << 4,
    NonLocatable = 1 << 5,
    LineCode = 1 << 6,
    Weight = 1 << 7,
    Hilited = 1 << 8,
    Emphasized = 1 << 9,
    ViewIndependentTransparency = 1 << 10,

    Rgba = Rgb | Alpha
}

export const enum EmphasisFlags {
    None = 0,
    Hilite = 1,
    Emphasized = 2,
    Flashed = 4,
    NonLocatable = 8
}

export const enum IsTranslucent {
    No,
    Yes,
    Maybe
}
