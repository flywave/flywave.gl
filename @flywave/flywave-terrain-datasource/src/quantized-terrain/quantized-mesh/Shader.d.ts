export interface TerrainShaderExtensions {
    tinterrain_common: string;
    begin_tinterrain_vertex: string;
    discard_out_range_frag: string;
    water_mask_pars_fragment: string;
    water_mask_compute_color_fragment: string;
    water_mask_util_funcs: string;
}
export declare const TerrainShaders: TerrainShaderExtensions;
