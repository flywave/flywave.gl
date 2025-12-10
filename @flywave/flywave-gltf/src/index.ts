/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable camelcase, indent */
export type { GLB } from "./gltf/types/glb-types";

// Raw GLTF Types (i.e. not post-processed)
export type {
    GLTF,
    GLTFAccessor,
    GLTFBuffer,
    GLTFBufferView,
    GLTFMeshPrimitive,
    GLTFMesh,
    GLTFNode,
    GLTFMaterial,
    GLTFSampler,
    GLTFScene,
    GLTFSkin,
    GLTFTexture,
    GLTFImage,
    GLTFObject,
    // The following extensions are handled by the GLTFLoader and removed from the parsed glTF (disable via options.gltf.excludeExtensions)
    GLTF_KHR_binary_glTF,
    GLTF_KHR_draco_mesh_compression,
    GLTF_KHR_texture_basisu,
    GLTF_EXT_meshopt_compression,
    GLTF_EXT_texture_webp
} from "./gltf/types/gltf-json-schema";

// 3DTiles extensions
export type {
    GLTF_EXT_feature_metadata_GLTF,
    GLTF_EXT_feature_metadata_Schema,
    GLTF_EXT_feature_metadata_Class,
    GLTF_EXT_feature_metadata_ClassProperty,
    GLTF_EXT_feature_metadata_Enum,
    GLTF_EXT_feature_metadata_EnumValue,
    GLTF_EXT_feature_metadata_FeatureTable,
    GLTF_EXT_feature_metadata_FeatureTableProperty,
    GLTF_EXT_feature_metadata_FeatureTexture,
    GLTF_EXT_feature_metadata_TextureAccessor,
    GLTF_EXT_feature_metadata_Statistics,
    GLTF_EXT_feature_metadata_StatisticsClass,
    GLTF_EXT_feature_metadata_StatisticsClassProperty,
    GLTF_EXT_feature_metadata_Primitive,
    GLTF_EXT_feature_metadata_FeatureIdAttribute,
    GLTF_EXT_feature_metadata_FeatureIdAttributeFeatureIds,
    GLTF_EXT_feature_metadata_FeatureIdTexture,
    GLTF_EXT_feature_metadata_FeatureIdTextureAccessor
} from "./gltf/types/gltf-ext-feature-metadata-schema";

export type {
    GLTF_EXT_structural_metadata_GLTF,
    GLTF_EXT_structural_metadata_Schema,
    GLTF_EXT_structural_metadata_PropertyTable,
    GLTF_EXT_structural_metadata_PropertyTexture,
    GLTF_EXT_structural_metadata_Class,
    GLTF_EXT_structural_metadata_ClassProperty
} from "./gltf/types/gltf-ext-structural-metadata-schema";

export type {
    GLTF_EXT_mesh_features,
    GLTF_EXT_mesh_features_featureId
} from "./gltf/types/gltf-ext-mesh-features-schema";

export { name as EXT_MESH_FEATURES } from "./gltf/extensions/EXT_mesh_features";
export { name as EXT_STRUCTURAL_METADATA } from "./gltf/extensions/EXT_structural_metadata";
export { name as EXT_FEATURE_METADATA } from "./gltf/extensions/deprecated/EXT_feature_metadata";

// Postprocessed types (modified GLTF types)
export type {
    GLTFPostprocessed,
    GLTFAccessorPostprocessed,
    GLTFNodePostprocessed,
    GLTFMaterialPostprocessed,
    GLTFMeshPostprocessed,
    GLTFMeshPrimitivePostprocessed,
    GLTFImagePostprocessed,
    GLTFTexturePostprocessed
} from "./gltf/types/gltf-postprocessed-schema";

export type { GLTFWithBuffers, FeatureTableJson } from "./gltf/types/gltf-types";

// glTF loader/writer definition objects
export { GLTFLoader, loadGLTF } from "./gltf-loader";
export { GLTFWriter } from "./gltf-writer";

// GLB Loader & Writer (for custom formats that want to leverage the GLB binary "envelope")
export { GLBLoader, loadGLB } from "./glb-loader";
export { GLBWriter } from "./glb-writer";

// glTF Data Access Helper Class
export { GLTFScenegraph } from "./gltf/api/gltf-scenegraph";
export { postProcessGLTF } from "./gltf/api/post-process-gltf";
export { getMemoryUsageGLTF as _getMemoryUsageGLTF } from "./gltf/gltf-utils/gltf-utils";

export {
    createExtStructuralMetadata,
    type PropertyAttribute
} from "./gltf/extensions/EXT_structural_metadata";
export { createExtMeshFeatures } from "./gltf/extensions/EXT_mesh_features";

// glTF to ThreeJS conversion
export { createThreeSceneFromGLTF, type ConversionOptions } from "./gltf/api/gltf-three";
