/* Copyright (C) 2025 flywave.gl contributors */

export namespace ExtrusionFeatureDefs {
    /**
     * Minimum ratio value for extrusion effect
     */
    export const DEFAULT_RATIO_MIN: number = 0.0;
    /**
     * Maximum ratio value for extrusion effect
     */
    export const DEFAULT_RATIO_MAX: number = 1;

    /**
     * Buildings height used whenever no height-data is present or height is very small.
     *
     * Used to avoid z-fighting between ground plane and building.
     */
    export const MIN_BUILDING_HEIGHT = 0.1;
}
