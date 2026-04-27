import { RenderMaterial } from "../common";
import { type SurfaceMaterial, type SurfaceMaterialAtlas } from "../common/render/primitives/surface-params";
export declare class Material extends RenderMaterial {
    static readonly default: Material;
    readonly isAtlas: false;
    readonly fragUniforms: Float32Array<ArrayBuffer>;
    readonly rgba: Float32Array<ArrayBuffer>;
    get overridesRgb(): boolean;
    get overridesAlpha(): boolean;
    get hasTranslucency(): boolean;
    constructor(params: RenderMaterial.Params);
    private setInteger;
}
export type MaterialInfo = Material | SurfaceMaterialAtlas;
export declare function createMaterialInfo(source: SurfaceMaterial | undefined): MaterialInfo | undefined;
