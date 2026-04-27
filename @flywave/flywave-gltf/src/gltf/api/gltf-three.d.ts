import { type Object3D, AnimationClip, Material, Scene, Texture } from "three";
import type { GLTFMaterialPostprocessed, GLTFPostprocessed } from "../types/gltf-postprocessed-schema";
interface ConversionOptions {
    preserveHierarchy?: boolean;
    includeInvisible?: boolean;
    createMaterial?: (gltfMaterial: GLTFMaterialPostprocessed, textureMap: Map<string, Texture>) => Material;
}
declare function createThreeSceneFromGLTF(gltf: GLTFPostprocessed, options?: ConversionOptions): {
    scene: Scene;
    animations: AnimationClip[];
    nodes: Map<string, Object3D>;
};
export { createThreeSceneFromGLTF, type ConversionOptions };
